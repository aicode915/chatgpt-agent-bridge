/**
 * ModelBridge —— 本地"虚拟模型"端点（OpenAI Responses API 的 codex 子集）
 *
 * 用途：让本机 codex CLI 把模型请求发到本插件（而不是 OpenAI），插件把每个
 * 模型请求交给 ChatGPT 对话作答（通过 MCP 工具 codex_poll / codex_reply），
 * 再把 ChatGPT 的答复加工成 codex 可解析的 SSE 事件流返回。
 *
 * 协议依据（2026-10 实测 + openai/codex 源码 codex-rs/codex-api/src/sse/responses.rs）：
 *   - POST <base>/t/<taskId>/v1/responses，Accept: text/event-stream，stream: true
 *   - 最小响应 = response.created → response.output_item.done* → response.completed
 *     （response.id 必填；usage 若存在必须含完整字段；其余事件（delta 等）可选、
 *      解析器会忽略未知事件，不会报错）
 *   - output item 支持：message / custom_tool_call / function_call / reasoning
 *     （解析失败会被静默丢弃，所以尽可能按规范给全字段）
 *
 * 注意：stdio MCP 服务器禁止写 stdout，本文件所有日志一律走 stderr。
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { ConfigManager } from "./config.js";
import { renderDashboardHtml } from "./dashboard.js";
import { pickDirectoryDialog } from "./system.js";

export type TaskMode = "read-only" | "workspace-write" | "danger-full-access";
export type TaskStatus = "running" | "finished" | "failed" | "cancelled" | "abandoned";

export interface TurnHistoryItem {
  seq: number;
  id: string;
  createdAt: number;
  answeredAt?: number;
  replyLabels?: string[];
}

export interface StartTaskOptions {
  prompt: string;
  cwd: string;
  mode: TaskMode;
  timeoutSecs: number;
}

export interface StartTaskInfo {
  taskId: string;
  port: number;
  baseUrl: string;
}

export interface ReplyAck {
  turnId: string;
  emitted: string[];
}

export interface PollResult {
  kind: "model_request" | "waiting" | TaskStatus;
  turnId?: string;
  turnNumber?: number;
  exitCode?: number | null;
  text: string;
}

interface WireItem {
  kind: string;
  label: string;
  item: Record<string, unknown>;
}

interface PendingTurn {
  id: string;
  seq: number;
  createdAt: number;
  body: Record<string, any>;
  stream: boolean;
  res: http.ServerResponse;
  answered: boolean;
  keepalive: NodeJS.Timeout | null;
}

interface BridgeTask {
  id: string;
  mode: TaskMode;
  cwd: string;
  prompt: string;
  timeoutSecs: number;
  status: TaskStatus;
  createdAt: number;
  finishedAt?: number;
  child: ChildProcess;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error?: string;
  killReason?: "user" | "timeout" | "stop" | "abandoned";
  pending?: PendingTurn;
  turns: number;
  turnHistory: TurnHistoryItem[];
  loggedOutputs: number;
  timeoutTimer: NodeJS.Timeout;
  lastActivityAt: number;
  idleTimer: NodeJS.Timeout | null;
  logListeners: Set<(event: string, data: any) => void>;
}

const OUTPUT_TAIL = 200_000; // 每个流保留最后 200KB
const TEXT_CAP_PER_ITEM = 16_000;
const RENDER_CAP_TOTAL = 220_000;
const DEFAULT_PORT = 8791;
const DEFAULT_IDLE_TURN_TIMEOUT_SECS = 60;
const IDLE_TURN_TIMEOUT_MS = Number(process.env.TURN_IDLE_TIMEOUT_SECS ?? DEFAULT_IDLE_TURN_TIMEOUT_SECS) * 1000;

const log = (message: string) => console.error(`[bridge] ${message}`);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function broadcastTaskEvent(task: BridgeTask, event: string, data: any): void {
  for (const listener of task.logListeners) {
    try {
      listener(event, data);
    } catch {
      /* ignore broken subscriber */
    }
  }
}

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}${idCounter.toString(36)}`;
}

function appendCapped(prev: string, chunk: string): string {
  const next = prev + chunk;
  return next.length > OUTPUT_TAIL ? next.slice(next.length - OUTPUT_TAIL) : next;
}

function truncate(text: string, cap: number): string {
  if (text.length <= cap) return text;
  return `${text.slice(0, cap)}\n…[truncated ${text.length - cap} chars]`;
}

function itemText(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const obj = part as Record<string, unknown>;
          if (typeof obj.text === "string") return obj.text;
          return JSON.stringify(obj);
        }
        return "";
      })
      .join("\n");
  }
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function zeroUsage(): Record<string, unknown> {
  return {
    input_tokens: 0,
    input_tokens_details: null,
    output_tokens: 0,
    output_tokens_details: null,
    total_tokens: 0,
  };
}

function chunkText(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function tail(text: string, cap: number): string {
  return text.length > cap ? text.slice(text.length - cap) : text;
}

/** 把 codex 的输出块实时打到 stderr（tunnel 终端可见）。 */
function teeCodexChunk(task: BridgeTask, stream: "stdout" | "stderr", chunk: string): void {
  const lines = chunk
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return;
  for (const line of lines.slice(0, 12)) {
    log(`task ${task.id}: codex ${stream}: ${truncate(line, 400)}`);
  }
  if (lines.length > 12) log(`task ${task.id}: codex ${stream}: …（还有 ${lines.length - 12} 行）`);
}

/** 新模型请求到达时，把本次新增的工具执行输出打印出来（实时可见）。 */
function logNewToolOutputs(task: BridgeTask, body: Record<string, any>): void {
  const input = Array.isArray(body.input) ? body.input : [];
  const outputs = input.filter(
    (item: any) => item?.type === "function_call_output" || item?.type === "custom_tool_call_output",
  );
  for (let i = task.loggedOutputs; i < outputs.length; i += 1) {
    const item = outputs[i] as Record<string, any>;
    const text = itemText(item.output).trim();
    if (!text) continue;
    const preview = text
      .split(/\r?\n/)
      .slice(0, 6)
      .map((line) => line.trimEnd())
      .join("\n    ");
    log(`task ${task.id}: tool output ${i + 1} (${item.type}, ${text.length} chars):\n    ${truncate(preview, 800)}`);
  }
  task.loggedOutputs = outputs.length;
}

/* ------------------------------------------------------------------ */
/* ChatGPT 答复 → Responses 输出 items 的解析与转换                      */
/* ------------------------------------------------------------------ */

function messageItem(text: string): WireItem {
  const value = text.trim();
  if (!value) throw new Error("message item text is empty");
  return {
    kind: "message",
    label: `message(${value.length} chars)`,
    item: {
      type: "message",
      id: newId("msg"),
      role: "assistant",
      content: [{ type: "output_text", text: value }],
    },
  };
}

function convertItem(raw: unknown): WireItem {
  if (typeof raw === "string") return messageItem(raw);
  if (!raw || typeof raw !== "object") throw new Error("reply item must be a JSON object or string");
  const obj = raw as Record<string, any>;
  const type = String(obj.type ?? "message").toLowerCase();

  if (type === "message" || type === "text") {
    return messageItem(itemText(obj.text ?? obj.content));
  }
  if (type === "exec" || type === "custom_tool_call" || type === "custom") {
    const name = String(obj.name ?? "exec");
    const input =
      typeof obj.input === "string"
        ? obj.input
        : typeof obj.code === "string"
          ? obj.code
          : typeof obj.text === "string"
            ? obj.text
            : "";
    if (!input.trim()) {
      throw new Error(`custom_tool_call item needs a non-empty "input" (raw JS source for exec)`);
    }
    return {
      kind: "custom_tool_call",
      label: `custom_tool_call:${name}(${input.length} chars)`,
      item: {
        type: "custom_tool_call",
        id: newId("ctc"),
        call_id: newId("call"),
        name,
        input,
        ...(obj.namespace ? { namespace: String(obj.namespace) } : {}),
      },
    };
  }
  if (type === "function_call" || type === "function") {
    const name = obj.name;
    if (typeof name !== "string" || !name) throw new Error("function_call item needs a string 'name'");
    const argsRaw = obj.arguments;
    const args = typeof argsRaw === "string" ? argsRaw : JSON.stringify(argsRaw ?? {});
    return {
      kind: "function_call",
      label: `function_call:${obj.namespace ? `${obj.namespace}.` : ""}${name}`,
      item: {
        type: "function_call",
        id: newId("fc"),
        call_id: newId("call"),
        name,
        arguments: args,
        ...(obj.namespace ? { namespace: String(obj.namespace) } : {}),
      },
    };
  }
  if (type === "reasoning") {
    const list = Array.isArray(obj.summary) ? obj.summary : [];
    const summary = list
      .map((entry: unknown) => {
        if (typeof entry === "string") return { type: "summary_text", text: entry };
        if (entry && typeof entry === "object") {
          const text = itemText((entry as Record<string, any>).text);
          return { type: "summary_text", text };
        }
        return { type: "summary_text", text: "" };
      })
      .filter((entry: { text: string }) => entry.text.trim().length > 0);
    if (summary.length === 0) throw new Error("reasoning item needs a non-empty 'summary' array of strings");
    return {
      kind: "reasoning",
      label: `reasoning(${summary.length})`,
      item: { type: "reasoning", id: newId("rs"), summary, encrypted_content: null },
    };
  }
  throw new Error(
    `unsupported reply item type "${type}" — allowed: message, exec (custom_tool_call), function_call, reasoning`,
  );
}

export function parseReply(replyText: string): WireItem[] {
  const trimmed = replyText.trim();
  if (!trimmed) throw new Error("reply is empty");

  let list: unknown[];
  const first = trimmed[0];
  if (first !== "{" && first !== "[") {
    list = [trimmed]; // 纯文本 → 单条 message
  } else {
    let t = trimmed;
    const fence = t.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n```\s*$/);
    if (fence) t = fence[1].trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(t);
    } catch (err) {
      throw new Error(
        `reply looks like JSON but failed to parse (${(err as Error).message}). Send valid JSON or plain text.`,
      );
    }
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.items)) list = obj.items;
      else if (typeof obj.type === "string" || typeof obj.text === "string") list = [obj];
      else throw new Error('reply JSON must be {"items":[...]} or a single item object');
    } else {
      throw new Error("reply JSON must be an object or array");
    }
  }

  const items = list.map(convertItem);
  if (items.length === 0) throw new Error("reply must contain at least one item");
  return items;
}


/* ------------------------------------------------------------------ */
/* 模型请求 → 给 ChatGPT 阅读的文本渲染                                  */
/* ------------------------------------------------------------------ */

function renderInputItem(idx: number, item: any): string {
  const type = item?.type ?? "unknown";
  if (type === "additional_tools") {
    const namespaces = Array.isArray(item.tools) ? item.tools : [];
    return `[${idx}] additional_tools (developer): ${namespaces.length} namespace(s) — see TOOLS section`;
  }
  if (type === "message") {
    const text = itemText(item.content).trim();
    return `[${idx}] message (${item.role ?? "?"}) [${text.length} chars]:\n${truncate(text, TEXT_CAP_PER_ITEM)}`;
  }
  if (type === "function_call") {
    return `[${idx}] function_call -> ${item.namespace ? `${item.namespace}.` : ""}${item.name} args=${truncate(String(item.arguments ?? ""), 2000)}`;
  }
  if (type === "custom_tool_call") {
    const input = String(item.input ?? "");
    return `[${idx}] custom_tool_call -> ${item.name} [input ${input.length} chars]:\n${truncate(input, 8000)}`;
  }
  if (type === "function_call_output" || type === "custom_tool_call_output") {
    const output = itemText(item.output).trim();
    return `[${idx}] tool_output (${type}, call_id=${item.call_id ?? "?"}) [${output.length} chars]:\n${truncate(output, TEXT_CAP_PER_ITEM)}`;
  }
  if (type === "reasoning") {
    const summary = Array.isArray(item.summary)
      ? item.summary.map((entry: any) => (typeof entry === "string" ? entry : entry?.text)).filter(Boolean).join("\n")
      : "";
    return `[${idx}] reasoning:\n${truncate(String(summary), 4000)}`;
  }
  return `[${idx}] ${type}: ${truncate(JSON.stringify(item), 2000)}`;
}

interface ToolSummary {
  summary: string;
  appendix: string;
}

function renderTools(body: any, input: any[]): ToolSummary {
  const lines: string[] = [];
  const appendix: string[] = [];
  let execDescription = "";
  const otherDescriptions: string[] = [];

  const namespaces = Array.isArray(input?.[0]?.tools) ? input[0].tools : [];
  if (namespaces.length > 0) {
    lines.push("Namespaces (responses-lite). Call a function tool via a function_call item with its namespace; inside exec JS call it as tools.<name>(...):");
    for (const ns of namespaces) {
      const tools = Array.isArray(ns?.tools) ? ns.tools : [];
      const names = tools.map((t: any) => `${t?.name}${t?.type === "custom" ? " [custom/JS]" : ""}`).join(", ");
      lines.push(`  - ${ns?.name}: ${names}`);
      for (const t of tools) {
        const description = String(t?.description ?? "");
        if (t?.type === "custom" && t?.name === "exec") execDescription = description;
        else if (description) otherDescriptions.push(`- ${ns?.name}.${t?.name} [${t?.type}]: ${truncate(description.replace(/\n/g, " "), 700)}`);
      }
    }
  }

  const topTools = Array.isArray(body?.tools) ? body.tools : [];
  if (topTools.length > 0) {
    lines.push("Top-level tools:");
    for (const t of topTools) {
      const description = String(t?.description ?? "");
      const params = t?.parameters ? ` params=${JSON.stringify(t.parameters).slice(0, 300)}` : "";
      lines.push(`  - ${t?.name} [${t?.type}]${params}`);
      if (t?.type === "custom" && t?.name === "exec") execDescription = description;
      else if (description) otherDescriptions.push(`- ${t?.name} [${t?.type}]: ${truncate(description.replace(/\n/g, " "), 700)}`);
    }
  }

  if (lines.length === 0) lines.push("(no tools declared in this request)");

  if (execDescription) {
    appendix.push("--- APPENDIX: full description of the `exec` tool (how to write JS, nested tool declarations) ---");
    appendix.push(truncate(execDescription, 18_000));
  }
  if (otherDescriptions.length > 0) {
    appendix.push("");
    appendix.push("--- APPENDIX: other tool descriptions ---");
    appendix.push(truncate(otherDescriptions.join("\n"), 20_000));
  }

  return { summary: lines.join("\n"), appendix: appendix.join("\n") };
}

function renderTurn(task: BridgeTask, turn: PendingTurn): string {
  const body = turn.body ?? {};
  const input: any[] = Array.isArray(body.input) ? body.input : [];
  const lines: string[] = [];

  lines.push("=== CODEX MODEL REQUEST (you are the model; reply via codex_reply) ===");
  lines.push(`task_id: ${task.id}`);
  lines.push(`turn_id: ${turn.id}   (turn #${turn.seq})`);
  lines.push(`mode: ${task.mode} | cwd: ${task.cwd} | timeout: ${task.timeoutSecs}s`);
  lines.push(`model: ${body.model ?? "(none)"} | stream: ${body.stream === true} | reasoning: ${JSON.stringify(body.reasoning ?? null)}`);

  const tools = renderTools(body, input);
  lines.push("");
  lines.push("--- TOOLS ---");
  lines.push(tools.summary);

  lines.push("");
  lines.push("--- INPUT ITEMS (chronological; codex's full context for this turn) ---");
  let total = 0;
  let truncated = false;
  for (let i = 0; i < input.length; i += 1) {
    const rendered = renderInputItem(i, input[i]);
    total += rendered.length;
    if (total > RENDER_CAP_TOTAL) {
      truncated = true;
      break;
    }
    lines.push(rendered);
  }
  lines.push(truncated ? "…[remaining input items omitted for length]" : "(end of input items)");

  if (tools.appendix) {
    lines.push("");
    lines.push(tools.appendix);
  }

  lines.push("");
  lines.push("--- REPLY PROTOCOL ---");
  lines.push(`Call: codex_reply(task_id="${task.id}", turn_id="${turn.id}", reply="<reply>")`);
  lines.push("<reply> must be ONE JSON object:");
  lines.push('  { "items": [ ...one or more items... ] }');
  lines.push("Item forms:");
  lines.push('  1) {"type":"message","text":"<what you say to the user>"}                          — commentary or final answer');
  lines.push('  2) {"type":"exec","input":"<raw JavaScript source>"}                               — run JS that orchestrates tools (the main tool)');
  lines.push('  3) {"type":"function_call","name":"<tool>","namespace":"<ns>","arguments":{...}}    — call a listed function tool directly (namespace optional if top-level)');
  lines.push('  4) {"type":"reasoning","summary":["<short thinking summary>"]}                     — optional');
  lines.push("Rules:");
  lines.push('- To actually do things (run commands, edit files), emit an "exec" item whose JS awaits nested tools, e.g.:');
  lines.push('    const r = await tools.exec_command({ cmd: "ls" }); text(JSON.stringify(r, null, 2).slice(0, 4000));');
  lines.push('- Raw JS only (no markdown fences, no JSON wrapper) inside "input". See the exec description appendix for the full nested-tool list.');
  lines.push('- When the user-visible goal is complete, emit a "message" item (final answer) and NO tool calls, so codex finishes.');
  lines.push('- Keep tool usage minimal and purposeful. Plain text replies are accepted and treated as one "message" item.');

  return lines.join("\n");
}

function summarizeEnd(task: BridgeTask): PollResult {
  const header =
    task.status === "finished"
      ? `=== CODEX FINISHED (exit ${task.exitCode}) ===`
      : `=== CODEX ${task.status.toUpperCase()}${task.error ? ` — ${task.error}` : ""} ===`;
  const parts = [
    header,
    `task_id: ${task.id}`,
    `turns: ${task.turns}`,
    "",
    "--- stdout (tail) ---",
    tail(task.stdout.trim(), 20_000) || "(empty)",
    task.stderr.trim() ? `--- stderr (tail) ---\n${tail(task.stderr.trim(), 4000)}` : "",
  ];
  return { kind: task.status, text: parts.filter(Boolean).join("\n"), exitCode: task.exitCode };
}

/* ------------------------------------------------------------------ */
/* 主体：HTTP 虚拟端点 + 任务管理                                        */
/* ------------------------------------------------------------------ */

export interface ModelBridgeOptions {
  port?: number;
  turnIdleTimeoutSecs?: number;
  configManager?: ConfigManager;
}

export class ModelBridge {
  readonly apiKey = crypto.randomBytes(24).toString("hex");
  port: number;
  readonly idleTimeoutMs: number;
  readonly configManager: ConfigManager;
  private tasks = new Map<string, BridgeTask>();
  private server: http.Server | null = null;

  constructor(options?: ModelBridgeOptions) {
    this.port = options?.port ?? Number(process.env.BRIDGE_PORT ?? DEFAULT_PORT);
    this.idleTimeoutMs = (options?.turnIdleTimeoutSecs ?? Number(process.env.TURN_IDLE_TIMEOUT_SECS ?? DEFAULT_IDLE_TURN_TIMEOUT_SECS)) * 1000;
    this.configManager = options?.configManager ?? new ConfigManager();
  }

  get started(): boolean {
    return this.server !== null && this.server.listening;
  }

  baseUrlFor(taskId: string): string {
    return `http://127.0.0.1:${this.port}/t/${taskId}/v1`;
  }

  async start(): Promise<number> {
    if (this.server) return this.port;
    const server = http.createServer((req, res) => {
      void this.handleHttp(req, res);
    });
    server.requestTimeout = 0;
    server.headersTimeout = 60_000;
    server.timeout = 0;
    server.keepAliveTimeout = 75_000;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.port, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    this.server = server;
    log(`model bridge listening on http://127.0.0.1:${this.port} (tasks: path /t/<taskId>/v1/responses)`);
    return this.port;
  }

  async stop(): Promise<void> {
    for (const task of this.tasks.values()) {
      if (task.status === "running") this.killTask(task, "stop");
    }
    const server = this.server;
    this.server = null;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  createTask(options: StartTaskOptions): StartTaskInfo {
    if (!this.started) throw new Error("model bridge HTTP server is not running (set BRIDGE_PORT to a free port)");
    const modeCheck = this.configManager.validateMode(options.mode);
    if (!modeCheck.allowed) {
      throw new Error(`Security Policy Blocked: ${modeCheck.reason}`);
    }
    const id = newId("t");
    const baseUrl = this.baseUrlFor(id);
    const args = [
      "exec",
      "--cd", options.cwd,
      "--sandbox", options.mode,
      "--ephemeral",
      "--skip-git-repo-check",
      "-c", "model_provider=bridge",
      "-c", 'model_providers.bridge.name="ChatGPT Bridge"',
      "-c", `model_providers.bridge.base_url="${baseUrl}"`,
      "-c", 'model_providers.bridge.wire_api="responses"',
      "-c", 'model_providers.bridge.env_key="BRIDGE_MODEL_API_KEY"',
      "-c", "model_providers.bridge.requires_openai_auth=false",
      "-c", "model_providers.bridge.request_max_retries=0",
      "-c", "model_providers.bridge.stream_max_retries=0",
      "-c", "model_providers.bridge.stream_idle_timeout_ms=3600000",
      options.prompt,
    ];
    const noProxy = [process.env.NO_PROXY, "127.0.0.1,localhost"].filter(Boolean).join(",");
    const child = spawn(process.env.CODEX_BIN ?? "codex", args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        BRIDGE_MODEL_API_KEY: this.apiKey,
        NO_PROXY: noProxy,
        no_proxy: noProxy,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const task: BridgeTask = {
      id,
      mode: options.mode,
      cwd: options.cwd,
      prompt: options.prompt,
      timeoutSecs: options.timeoutSecs,
      status: "running",
      createdAt: Date.now(),
      child,
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: null,
      turns: 0,
      turnHistory: [],
      loggedOutputs: 0,
      timeoutTimer: setTimeout(() => this.killTask(task, "timeout"), options.timeoutSecs * 1000),
      lastActivityAt: Date.now(),
      idleTimer: null,
      logListeners: new Set(),
    };
    this.tasks.set(id, task);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      task.stdout = appendCapped(task.stdout, chunk);
      teeCodexChunk(task, "stdout", chunk);
      broadcastTaskEvent(task, "log", { stream: "stdout", chunk, timestamp: Date.now() });
    });
    child.stderr?.on("data", (chunk: string) => {
      task.stderr = appendCapped(task.stderr, chunk);
      teeCodexChunk(task, "stderr", chunk);
      broadcastTaskEvent(task, "log", { stream: "stderr", chunk, timestamp: Date.now() });
    });
    child.on("error", (error) => {
      task.error = `spawn failed: ${error.message}`;
      task.status = "failed";
      clearTimeout(task.timeoutTimer);
      if (task.idleTimer) {
        clearTimeout(task.idleTimer);
        task.idleTimer = null;
      }
      this.failPending(task, task.error);
      log(`task ${id}: spawn failed: ${error.message}`);
      broadcastTaskEvent(task, "end", { status: "failed", error: task.error, finishedAt: Date.now() });
    });
    child.on("close", (code, signal) => {
      clearTimeout(task.timeoutTimer);
      if (task.idleTimer) {
        clearTimeout(task.idleTimer);
        task.idleTimer = null;
      }
      task.exitCode = code;
      task.signal = signal;
      task.finishedAt = task.finishedAt ?? Date.now();
      if (task.status === "running") {
        if (code === 0) {
          task.status = "finished";
        } else {
          task.status = "failed";
          task.error = task.error ?? `codex exited with code ${code ?? "unknown"}${signal ? `, signal ${signal}` : ""}`;
        }
      }
      if (task.pending && !task.pending.answered) {
        this.failPending(task, `task ended before answer (${task.status})`);
      }
      log(`task ${id}: codex closed (code=${code ?? "null"}, signal=${signal ?? "-"}) -> ${task.status}`);
      broadcastTaskEvent(task, "end", {
        status: task.status,
        exitCode: task.exitCode,
        error: task.error,
        finishedAt: task.finishedAt,
      });
    });

    log(`task ${id}: spawned codex pid=${child.pid ?? "?"} (mode=${options.mode}, cwd=${options.cwd})`);
    return { taskId: id, port: this.port, baseUrl };
  }

  async poll(taskId: string, waitSecs: number): Promise<PollResult> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`unknown task_id: ${taskId}`);
    task.lastActivityAt = Date.now();
    const deadline = Date.now() + Math.min(Math.max(waitSecs, 0), 60) * 1000;
    for (;;) {
      const pending = task.pending;
      if (pending && !pending.answered) {
        // ChatGPT 正在轮询该 pending 请求，重置空闲定时器，给 ChatGPT 足够的时间作答 (waitSecs + 45s)
        this.resetTurnIdleTimer(task, pending, Math.max(waitSecs * 1000 + 45_000, this.idleTimeoutMs));
        return { kind: "model_request", turnId: pending.id, turnNumber: pending.seq, text: renderTurn(task, pending) };
      }
      if (task.status !== "running") return summarizeEnd(task);
      if (Date.now() >= deadline) {
        return {
          kind: "waiting",
          text: `codex is still working (no new model request yet; it may be running commands or patches). Call codex_poll(task_id="${taskId}") again.`,
        };
      }
      await sleep(150);
    }
  }

  reply(taskId: string, turnId: string, replyText: string): ReplyAck {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`unknown task_id: ${taskId}`);
    if (task.status !== "running") throw new Error(`task ${taskId} is ${task.status}; there is no pending model request`);
    const pending = task.pending;
    if (!pending || pending.answered) {
      throw new Error(`task ${taskId} has no pending model request — call codex_poll(task_id="${taskId}") first`);
    }
    if (pending.id !== turnId) {
      throw new Error(`turn_id mismatch: the current pending turn is ${pending.id}, not ${turnId}`);
    }
    if (task.idleTimer) {
      clearTimeout(task.idleTimer);
      task.idleTimer = null;
    }
    task.lastActivityAt = Date.now();
    const items = parseReply(replyText);
    this.completeTurn(pending, task, items);
    task.pending = undefined;
    const ack: ReplyAck = { turnId, emitted: items.map((entry) => entry.label) };
    const historyItem = task.turnHistory.find((h) => h.id === turnId);
    if (historyItem) {
      historyItem.answeredAt = Date.now();
      historyItem.replyLabels = ack.emitted;
    }
    log(`task ${taskId}: turn ${turnId} answered -> ${ack.emitted.join(", ")}`);
    broadcastTaskEvent(task, "turn_answered", {
      seq: pending.seq,
      id: turnId,
      replyLabels: ack.emitted,
      answeredAt: Date.now(),
    });
    return ack;
  }

  cancel(taskId: string): string {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`unknown task_id: ${taskId}`);
    if (task.status !== "running") return `task ${taskId} is already ${task.status}`;
    this.killTask(task, "user");
    return `cancelling task ${taskId} (codex will be terminated)`;
  }

  list(): Array<Record<string, unknown>> {
    return [...this.tasks.values()].map((task) => ({
      task_id: task.id,
      status: task.status,
      mode: task.mode,
      cwd: task.cwd,
      turns: task.turns,
      has_pending_request: Boolean(task.pending && !task.pending.answered),
      pending_turn_id: task.pending && !task.pending.answered ? task.pending.id : undefined,
      created_at: new Date(task.createdAt).toISOString(),
      finished_at: task.finishedAt ? new Date(task.finishedAt).toISOString() : undefined,
      error: task.error,
    }));
  }

  getTaskDetail(taskId: string): Record<string, unknown> | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    return {
      id: task.id,
      status: task.status,
      mode: task.mode,
      cwd: task.cwd,
      prompt: task.prompt,
      timeoutSecs: task.timeoutSecs,
      createdAt: task.createdAt,
      finishedAt: task.finishedAt,
      exitCode: task.exitCode,
      signal: task.signal,
      error: task.error,
      turns: task.turns,
      stdoutTail: tail(task.stdout.trim(), 10000),
      stderrTail: tail(task.stderr.trim(), 4000),
      turnHistory: task.turnHistory,
    };
  }

  checkTunnelHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const clientReq = http.get("http://127.0.0.1:8080/healthz", { timeout: 1500 }, (res) => {
        resolve(res.statusCode === 200);
      });
      clientReq.on("error", () => resolve(false));
      clientReq.on("timeout", () => {
        clientReq.destroy();
        resolve(false);
      });
    });
  }

  restartTunnel(): Promise<string> {
    return new Promise((resolve) => {
      const scriptPath = path.resolve(process.cwd(), "scripts/start-tunnel.sh");
      if (!fs.existsSync(scriptPath)) {
        resolve("start-tunnel.sh script not found");
        return;
      }
      const child = spawn("bash", [scriptPath, "--restart"], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      resolve("Tunnel restart triggered in background");
    });
  }

  private resetTurnIdleTimer(task: BridgeTask, turn: PendingTurn, customMs?: number): void {
    if (task.idleTimer) {
      clearTimeout(task.idleTimer);
      task.idleTimer = null;
    }
    if (task.status !== "running") return;
    const ms = customMs ?? this.idleTimeoutMs;
    task.idleTimer = setTimeout(() => {
      if (task.status !== "running") return;
      if (task.pending && task.pending.id === turn.id && !task.pending.answered) {
        log(`task ${task.id}: idle timeout reached (${ms / 1000}s) on turn ${turn.id}`);
        // 检查之前是否已经有作答过的轮次（说明 ChatGPT 已经驱动执行了工具，目标可能已达成）
        const hasAnsweredTurns = task.turnHistory.some((h) => h.id !== turn.id && Boolean(h.answeredAt));
        if (hasAnsweredTurns) {
          log(`task ${task.id}: auto-finalizing turn ${turn.id} with completion message (client finished polling)`);
          try {
            const autoReplyText = 'message("Task completed (auto-finalized by bridge idle timeout).")';
            const items = parseReply(autoReplyText);
            this.completeTurn(turn, task, items);
            task.pending = undefined;
            const historyItem = task.turnHistory.find((h) => h.id === turn.id);
            if (historyItem) {
              historyItem.answeredAt = Date.now();
              historyItem.replyLabels = ["auto_finalize:message"];
            }
            broadcastTaskEvent(task, "turn_answered", {
              seq: turn.seq,
              id: turn.id,
              replyLabels: ["auto_finalize:message"],
              answeredAt: Date.now(),
            });
            task.status = "finished";
            broadcastTaskEvent(task, "end", {
              status: "finished",
              exitCode: 0,
              finishedAt: Date.now(),
            });
            // 优雅通知子进程终止（若其在收到响应后未立刻退出）
            const graceTimer = setTimeout(() => {
              try {
                task.child.kill("SIGTERM");
              } catch {
                /* ignore */
              }
            }, 1000);
            graceTimer.unref?.();
            return;
          } catch (err) {
            log(`task ${task.id}: auto-finalize failed: ${(err as Error).message}`);
          }
        }
        this.killTask(task, "abandoned");
      }
    }, ms);
    task.idleTimer.unref?.();
  }

  /* ---------------------------- internals ---------------------------- */

  private async handleHttp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const url = req.url ?? "/";
      if (req.method === "GET" && (url === "/" || url === "/index.html")) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(renderDashboardHtml());
        return;
      }
      if (req.method === "GET" && url === "/healthz") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: this.started, tasks: this.tasks.size }));
        return;
      }
      if (req.method === "GET" && url === "/api/status") {
        const tunnelHealthy = await this.checkTunnelHealth();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          bridge: { port: this.port, started: this.started },
          config: {
            ...this.configManager.get(),
            configPath: this.configManager.configPath,
          },
          system: { nodeVersion: process.version, platform: process.platform },
          tunnel: { healthy: tunnelHealthy },
        }));
        return;
      }
      if (req.method === "GET" && url === "/api/tasks") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(this.list()));
        return;
      }
      const taskDetailMatch = url.match(/^\/api\/tasks\/([A-Za-z0-9_]+)$/);
      if (req.method === "GET" && taskDetailMatch) {
        const detail = this.getTaskDetail(taskDetailMatch[1]);
        if (!detail) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "task not found" }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(detail));
        return;
      }
      const taskCancelMatch = url.match(/^\/api\/tasks\/([A-Za-z0-9_]+)\/cancel$/);
      if (req.method === "POST" && taskCancelMatch) {
        const msg = this.cancel(taskCancelMatch[1]);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: msg }));
        return;
      }
      const taskStreamMatch = url.match(/^\/api\/tasks\/([A-Za-z0-9_]+)\/stream$/);
      if (req.method === "GET" && taskStreamMatch) {
        const taskId = taskStreamMatch[1];
        const task = this.tasks.get(taskId);
        if (!task) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "task not found" }));
          return;
        }

        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          "connection": "keep-alive",
          "x-accel-buffering": "no",
        });

        const sendEvent = (event: string, data: any) => {
          try {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          } catch {
            /* socket closed */
          }
        };

        sendEvent("init", {
          task: {
            id: task.id,
            status: task.status,
            mode: task.mode,
            cwd: task.cwd,
            prompt: task.prompt,
            timeoutSecs: task.timeoutSecs,
            createdAt: task.createdAt,
            finishedAt: task.finishedAt,
            exitCode: task.exitCode,
            signal: task.signal,
            error: task.error,
            turns: task.turns,
            turnHistory: task.turnHistory,
          },
          stdout: task.stdout,
          stderr: task.stderr,
        });

        if (task.status !== "running") {
          sendEvent("end", {
            status: task.status,
            exitCode: task.exitCode,
            error: task.error,
            finishedAt: task.finishedAt,
          });
          res.end();
          return;
        }

        const cleanup = () => {
          clearInterval(keepalive);
          task.logListeners.delete(listener);
        };

        const listener = (event: string, data: any) => {
          sendEvent(event, data);
          if (event === "end") {
            cleanup();
            try {
              res.end();
            } catch {
              /* ignore */
            }
          }
        };

        task.logListeners.add(listener);

        const keepalive = setInterval(() => {
          try {
            res.write(`: ping\n\n`);
          } catch {
            cleanup();
          }
        }, 15_000);

        req.on("close", cleanup);
        return;
      }
      if (req.method === "POST" && url === "/api/config/security") {
        const raw = await readBody(req);
        try {
          const body = JSON.parse(raw.toString("utf8"));
          this.configManager.setMaxAllowedMode(body.maxAllowedMode);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ success: true, mode: body.maxAllowedMode }));
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
        return;
      }
      if (req.method === "POST" && url === "/api/config/workspaces") {
        const raw = await readBody(req);
        try {
          const body = JSON.parse(raw.toString("utf8"));
          if (body.action === "add") {
            const added = this.configManager.addWorkspace(body.path);
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ success: true, added }));
          } else if (body.action === "remove") {
            this.configManager.removeWorkspace(body.path);
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ success: true }));
          } else if (body.action === "select") {
            const selected = this.configManager.setActiveWorkspace(body.path);
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ success: true, selected }));
          } else {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: `unknown action: ${body.action}` }));
          }
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
        return;
      }
      if (req.method === "POST" && url === "/api/system/select-directory") {
        try {
          const resDialog = await pickDirectoryDialog();
          if (resDialog.cancelled) {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ cancelled: true }));
            return;
          }
          if (resDialog.error) {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: resDialog.error }));
            return;
          }
          if (resDialog.path) {
            const added = this.configManager.addWorkspace(resDialog.path);
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ success: true, path: added }));
            return;
          }
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "未选择任何有效目录" }));
        } catch (err) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
        return;
      }
      if (req.method === "GET" && url === "/api/tunnel/health") {
        const healthy = await this.checkTunnelHealth();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ healthy }));
        return;
      }
      if (req.method === "POST" && url === "/api/tunnel/restart") {
        const result = await this.restartTunnel();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: result }));
        return;
      }
      const match = url.match(/^\/t\/([A-Za-z0-9_]+)\/v1\/responses\/?$/);
      if (!match || req.method !== "POST") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      if (req.headers["authorization"] !== `Bearer ${this.apiKey}`) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      const taskId = match[1];
      const task = this.tasks.get(taskId);
      if (!task) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: `unknown task ${taskId}` }));
        return;
      }
      const raw = await readBody(req);
      let body: Record<string, any>;
      try {
        body = JSON.parse(raw.toString("utf8")) as Record<string, any>;
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid JSON body" }));
        return;
      }
      if (task.pending && !task.pending.answered) {
        res.writeHead(409, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "previous model request was not answered yet" }));
        return;
      }
      req.setTimeout(0);
      res.setTimeout(0);

      const turn: PendingTurn = {
        id: newId("tn"),
        seq: task.turns + 1,
        createdAt: Date.now(),
        body,
        stream: body.stream !== false,
        res,
        answered: false,
        keepalive: null,
      };
      task.turns = turn.seq;
      task.pending = turn;
      task.lastActivityAt = Date.now();
      task.turnHistory.push({
        seq: turn.seq,
        id: turn.id,
        createdAt: turn.createdAt,
      });
      this.resetTurnIdleTimer(task, turn);
      broadcastTaskEvent(task, "turn", {
        seq: turn.seq,
        id: turn.id,
        createdAt: turn.createdAt,
      });
      log(`task ${taskId}: model request #${turn.seq} received (${turn.stream ? "stream" : "json"}, ${raw.length} bytes)`);
      logNewToolOutputs(task, body);

      if (turn.stream) {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          "x-accel-buffering": "no",
        });
        res.write(": bridge connected, waiting for ChatGPT\n\n");
        turn.keepalive = setInterval(() => {
          try {
            res.write(`: keepalive ${Date.now()}\n\n`);
          } catch {
            /* socket already gone */
          }
        }, 15_000);
      }
      // 保持连接，等待 codex_reply / 取消 / 任务结束
    } catch (error) {
      log(`http handler error: ${(error as Error).message}`);
      try {
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: (error as Error).message }));
        } else {
          res.destroy();
        }
      } catch {
        /* ignore */
      }
    }
  }

  private completeTurn(turn: PendingTurn, task: BridgeTask, items: WireItem[]): void {
    const res = turn.res;
    if (turn.keepalive) {
      clearInterval(turn.keepalive);
      turn.keepalive = null;
    }
    turn.answered = true;
    const responseId = newId("resp");

    try {
      if (turn.stream) {
        const writeEvent = (type: string, payload: unknown) => {
          res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
        };
        writeEvent("response.created", { type: "response.created", response: { id: responseId } });
        for (const entry of items) {
          if (entry.kind === "message") {
            const content = (entry.item as any).content as Array<{ text?: string }> | undefined;
            const text = String(content?.[0]?.text ?? "");
            // 官方流式顺序：added（空内容）→ delta* → done（完整内容）。
            // 若缺少 added，codex 会报 "OutputTextDelta without active item"（无害但仍应避免）。
            writeEvent("response.output_item.added", {
              type: "response.output_item.added",
              item: { ...entry.item, content: [{ type: "output_text", text: "" }] },
            });
            for (const piece of chunkText(text, 280)) {
              writeEvent("response.output_text.delta", { type: "response.output_text.delta", delta: piece });
            }
          }
          writeEvent("response.output_item.done", { type: "response.output_item.done", item: entry.item });
        }
        writeEvent("response.completed", {
          type: "response.completed",
          response: { id: responseId, usage: zeroUsage() },
        });
        res.end();
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: responseId,
            object: "response",
            created_at: Math.floor(Date.now() / 1000),
            status: "completed",
            model: turn.body?.model ?? "bridge-model",
            output: items.map((entry) => entry.item),
            usage: zeroUsage(),
          }),
        );
      }
    } catch (error) {
      log(`task ${task.id}: failed to write turn answer: ${(error as Error).message}`);
    }
  }

  private failPending(task: BridgeTask, reason: string): void {
    const pending = task.pending;
    if (!pending || pending.answered) return;
    pending.answered = true;
    task.pending = undefined;
    if (pending.keepalive) {
      clearInterval(pending.keepalive);
      pending.keepalive = null;
    }
    log(`task ${task.id}: failing pending turn ${pending.id}: ${reason}`);
    try {
      if (pending.stream) {
        pending.res.destroy();
      } else {
        pending.res.writeHead(502, { "content-type": "application/json" });
        pending.res.end(JSON.stringify({ error: reason }));
      }
    } catch {
      /* ignore */
    }
  }

  private killTask(task: BridgeTask, reason: "user" | "timeout" | "stop" | "abandoned"): void {
    if (task.status !== "running") return;
    if (task.idleTimer) {
      clearTimeout(task.idleTimer);
      task.idleTimer = null;
    }
    task.killReason = reason;
    if (reason === "timeout") {
      task.status = "failed";
      task.error = `timeout after ${task.timeoutSecs}s`;
      this.failPending(task, task.error);
    } else if (reason === "abandoned") {
      task.status = "abandoned";
      task.error = `abandoned: ChatGPT client idle for >${this.idleTimeoutMs / 1000}s without reply`;
      this.failPending(task, task.error);
    } else {
      task.status = "cancelled";
      this.failPending(task, `task cancelled (${reason})`);
    }
    broadcastTaskEvent(task, "end", {
      status: task.status,
      error: task.error,
      finishedAt: Date.now(),
    });
    log(`task ${task.id}: killing codex (${reason}) -> ${task.status}`);
    try {
      task.child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    const timer = setTimeout(() => {
      try {
        task.child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, 3000);
    timer.unref?.();
  }
}

function readBody(req: http.IncomingMessage, limit = 64 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
