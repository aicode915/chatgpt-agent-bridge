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
import { spawn } from "node:child_process";
import { ConfigManager } from "./config.js";
import { renderDashboardHtml } from "./dashboard.js";
import { getVersion, pickDirectoryDialog } from "./system.js";
import { loadCredentials, saveCredentials } from "./credentials.js";
import { getGitDiff } from "./git.js";
import {
  type TaskMode,
  type TaskStatus,
  type TurnHistoryItem,
  type StartTaskOptions,
  type StartTaskInfo,
  type ReplyAck,
  type PollResult,
  type WireItem,
  type PendingTurn,
  type BridgeTask,
  type ModelBridgeOptions,
} from "./types.js";
import {
  newId,
  zeroUsage,
  chunkText,
  itemText,
  messageItem,
  convertItem,
  parseReply,
} from "./protocol.js";
import {
  appendCapped,
  truncate,
  tail,
  renderTurn,
  summarizeEnd,
} from "./prompt.js";

// Re-export public types and protocol functions for backward compatibility
export type {
  TaskMode,
  TaskStatus,
  TurnHistoryItem,
  StartTaskOptions,
  StartTaskInfo,
  ReplyAck,
  PollResult,
  ModelBridgeOptions,
};
export { parseReply };

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
/* 主体：HTTP 虚拟端点 + 任务管理                                        */
/* ------------------------------------------------------------------ */

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
      onProgress: options.onProgress,
    };
    this.tasks.set(id, task);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      task.stdout = appendCapped(task.stdout, chunk);
      teeCodexChunk(task, "stdout", chunk);
      broadcastTaskEvent(task, "log", { stream: "stdout", chunk, timestamp: Date.now() });

      // Extract last non-empty line as activity summary
      const lines = chunk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        task.latestActivity = truncate(lines[lines.length - 1], 150);
        task.onProgress?.(task.turns, undefined, `Codex: ${task.latestActivity}`);
      }
    });
    child.stderr?.on("data", (chunk: string) => {
      task.stderr = appendCapped(task.stderr, chunk);
      teeCodexChunk(task, "stderr", chunk);
      broadcastTaskEvent(task, "log", { stream: "stderr", chunk, timestamp: Date.now() });

      const lines = chunk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        task.latestActivity = truncate(lines[lines.length - 1], 150);
        task.onProgress?.(task.turns, undefined, `Codex: ${task.latestActivity}`);
      }
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
      latestActivity: task.latestActivity,
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
      latestActivity: task.latestActivity,
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
      const cliPath = path.resolve(__dirname, "cli.js");
      const scriptPath = path.resolve(process.cwd(), "scripts/start-tunnel.sh");

      if (fs.existsSync(cliPath)) {
        const child = spawn(process.execPath, [cliPath, "--restart"], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        resolve("Tunnel restart triggered via CLI in background");
      } else if (fs.existsSync(scriptPath)) {
        const child = spawn("bash", [scriptPath, "--restart"], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        resolve("Tunnel restart triggered in background");
      } else {
        resolve("CLI entrypoint (cli.js) or start-tunnel.sh not found");
      }
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
        const currentVersion = getVersion();
        const creds = loadCredentials();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          bridge: { port: this.port, started: this.started, version: currentVersion },
          config: {
            ...this.configManager.get(),
            configPath: this.configManager.configPath,
          },
          credentials: {
            tunnelId: creds.tunnelId,
            apiKeyMasked: creds.apiKeyMasked,
            source: creds.source,
            targetEnvPath: creds.targetEnvPath,
          },
          system: { version: currentVersion, nodeVersion: process.version, platform: process.platform },
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
      const taskDiffMatch = url.match(/^\/api\/tasks\/([A-Za-z0-9_]+)\/diff$/);
      if (req.method === "GET" && taskDiffMatch) {
        const taskId = taskDiffMatch[1];
        const task = this.tasks.get(taskId);
        if (!task) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "task not found" }));
          return;
        }
        try {
          const diffResult = await getGitDiff(task.cwd);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(diffResult));
        } catch (err) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
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
      if (req.method === "GET" && url === "/api/config/credentials") {
        const creds = loadCredentials();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          tunnelId: creds.tunnelId,
          apiKey: creds.apiKey,
          apiKeyMasked: creds.apiKeyMasked,
          source: creds.source,
          targetEnvPath: creds.targetEnvPath,
        }));
        return;
      }
      if (req.method === "POST" && url === "/api/config/credentials") {
        const raw = await readBody(req);
        try {
          const body = JSON.parse(raw.toString("utf8"));
          const { targetEnvPath } = saveCredentials({
            tunnelId: body.tunnelId,
            apiKey: body.apiKey,
          });
          const shouldRestart = Boolean(body.restart);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({
            success: true,
            targetEnvPath,
            restarting: shouldRestart,
            message: shouldRestart
              ? "凭证已成功保存，隧道服务正在重启..."
              : `凭证已成功保存至 ${targetEnvPath}`,
          }));

          if (shouldRestart) {
            setTimeout(() => {
              void this.restartTunnel();
            }, 300);
          }
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
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
