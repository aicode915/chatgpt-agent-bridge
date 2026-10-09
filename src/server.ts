import fs from "node:fs/promises";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ModelBridge } from "./bridge.js";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(process.env.WORKSPACE_ROOT ?? process.cwd());

// 本地"虚拟模型"端点：codex 的模型请求会打到这里，由 ChatGPT 对话作答。
const bridge = new ModelBridge();
let bridgeError: string | null = null;
try {
  await bridge.start();
  console.error(`[server] model bridge ready on 127.0.0.1:${bridge.port}`);
} catch (error) {
  bridgeError = (error as Error).message;
  console.error(`[server] model bridge failed to start: ${bridgeError}`);
}

function safePath(input: string): string {
  const resolved = path.resolve(ROOT, input);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    throw new Error("Path escapes WORKSPACE_ROOT");
  }
  return resolved;
}

function safeCwd(input?: string): string {
  return safePath(input ?? ".");
}

interface AgentProcessResult {
  stdout: string;
  stderr: string;
}

interface AgentProcessError extends Error {
  code?: string | number;
  signal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
}

function runAgentProcess(
  executable: string,
  args: string[],
  cwd: string,
  timeoutSecs: number,
): Promise<AgentProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback: (value: any) => void, value: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const fail = (message: string, code: string | number) => {
      const error = new Error(message) as AgentProcessError;
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      child.kill("SIGTERM");
      finish(reject, error);
    };
    const timer = setTimeout(() => fail(`Timed out after ${timeoutSecs} seconds`, "ETIMEDOUT"), timeoutSecs * 1000);

    child.stdin.end();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length + stderr.length > 1024 * 1024) fail("Agent output exceeded 1 MiB", "OUTPUT_LIMIT");
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stdout.length + stderr.length > 1024 * 1024) fail("Agent output exceeded 1 MiB", "OUTPUT_LIMIT");
    });
    child.on("error", (error) => {
      const enriched = error as AgentProcessError;
      enriched.stdout = stdout;
      enriched.stderr = stderr;
      finish(reject, enriched);
    });
    child.on("close", (code, signal) => {
      if (code === 0) {
        finish(resolve, { stdout, stderr });
      } else {
        const error = new Error(`Agent exited with code ${code ?? "unknown"}`) as AgentProcessError;
        error.code = code ?? "unknown";
        error.signal = signal;
        error.stdout = stdout;
        error.stderr = stderr;
        finish(reject, error);
      }
    });
  });
}


const server = new McpServer({
  name: "chatgpt-agent-bridge",
  version: "0.1.0",
});

server.tool(
  "list_dir",
  "List files/directories under WORKSPACE_ROOT.",
  { path: z.string().default(".") },
  async ({ path: input }) => {
    const dir = safePath(input);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return {
      content: [{
        type: "text",
        text: entries.map((e) => `${e.isDirectory() ? "[dir]" : "[file]"} ${e.name}`).join("\n") || "(empty)",
      }],
    };
  },
);

server.tool(
  "read_file",
  "Read a UTF-8 text file under WORKSPACE_ROOT.",
  { path: z.string() },
  async ({ path: input }) => ({
    content: [{ type: "text", text: await fs.readFile(safePath(input), "utf8") }],
  }),
);

server.tool(
  "write_file",
  "Write a UTF-8 text file under WORKSPACE_ROOT, creating parent directories.",
  { path: z.string(), content: z.string() },
  async ({ path: input, content }) => {
    const file = safePath(input);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, "utf8");
    return { content: [{ type: "text", text: `Wrote ${path.relative(ROOT, file)}` }] };
  },
);

server.tool(
  "run_command",
  "Run a local executable with literal argv under WORKSPACE_ROOT. No shell.",
  {
    executable: z.string().min(1),
    args: z.array(z.string()).default([]),
    cwd: z.string().default("."),
  },
  async ({ executable, args, cwd }) => {
    const result = await execFileAsync(executable, args, {
      cwd: safeCwd(cwd),
      env: process.env,
      maxBuffer: 1024 * 1024,
    });
    return {
      content: [{
        type: "text",
        text: [result.stdout, result.stderr ? `STDERR:\n${result.stderr}` : ""].filter(Boolean).join("\n") || "(no output)",
      }],
    };
  },
);

server.tool(
  "git_status",
  "Show git status for the workspace.",
  {},
  async () => {
    const result = await execFileAsync("git", ["status", "--short", "--branch"], {
      cwd: ROOT,
      env: process.env,
      maxBuffer: 1024 * 1024,
    });
    return { content: [{ type: "text", text: result.stdout || "(clean)" }] };
  },
);

server.tool(
  "run_agent",
  "Run Codex or Claude Code non-interactively inside WORKSPACE_ROOT. NOTE: codex runs use codex's own account/model quota; for a QUOTA-FREE codex session driven by this ChatGPT conversation use codex_start + codex_poll + codex_reply instead. Use read-only mode for diagnostics; workspace-write/acceptEdits allows the agent to edit files.",
  {
    agent: z.enum(["codex", "claude"]),
    prompt: z.string().min(1).max(20000),
    cwd: z.string().default("."),
    mode: z.enum(["read-only", "workspace-write"]).default("read-only"),
    timeout_secs: z.number().int().min(10).max(900).default(180),
  },
  async ({ agent, prompt, cwd: inputCwd, mode, timeout_secs }) => {
    const cwd = safeCwd(inputCwd);
    const args = agent === "codex"
      ? [
          "exec",
          "--cd", cwd,
          "--sandbox", mode === "read-only" ? "read-only" : "workspace-write",
          "--ephemeral",
          prompt,
        ]
      : [
          "-p", prompt,
          "--output-format", "text",
          "--permission-mode", mode === "read-only" ? "plan" : "acceptEdits",
          "--max-turns", "8",
        ];

    try {
      const result = await runAgentProcess(agent, args, cwd, timeout_secs);
      return {
        content: [{
          type: "text",
          text: [
            `agent: ${agent}`,
            `mode: ${mode}`,
            `cwd: ${path.relative(ROOT, cwd) || "."}`,
            "exit_code: 0",
            result.stdout,
            result.stderr ? `STDERR:\n${result.stderr}` : "",
          ].filter(Boolean).join("\n"),
        }],
      };
    } catch (error) {
      const err = error as AgentProcessError;
      const exitCode = err.code ?? "unknown";
      const stdout = err.stdout?.toString() ?? "";
      const stderr = err.stderr?.toString() ?? err.message;
      return {
        content: [{
          type: "text",
          text: [
            `agent: ${agent}`,
            `mode: ${mode}`,
            `cwd: ${path.relative(ROOT, cwd) || "."}`,
            `exit_code: ${exitCode}`,
            err.signal ? `signal: ${err.signal}` : "",
            stdout,
            stderr ? `STDERR:\n${stderr}` : "",
          ].filter(Boolean).join("\n"),
        }],
        isError: true,
      };
    }
  },
);

server.tool(
  "codex_start",
  "Start a Codex CLI session on this machine whose model requests are answered by THIS ChatGPT conversation (codex sends nothing to OpenAI; zero codex quota used). Flow: codex_start -> loop { codex_poll -> answer with codex_reply } until poll status is finished/failed/cancelled.",
  {
    prompt: z.string().min(1).max(20000),
    cwd: z.string().default("."),
    mode: z.enum(["read-only", "workspace-write"]).default("read-only"),
    timeout_secs: z.number().int().min(60).max(86400).default(1800),
  },
  async ({ prompt, cwd: inputCwd, mode, timeout_secs }) => {
    if (bridgeError) {
      return {
        content: [{ type: "text", text: `Model bridge unavailable: ${bridgeError}. Free the port (env BRIDGE_PORT, default 8791) and restart the MCP server.` }],
        isError: true,
      };
    }
    try {
      const cwd = safeCwd(inputCwd);
      const info = bridge.createTask({ prompt, cwd, mode, timeoutSecs: timeout_secs });
      return {
        content: [{
          type: "text",
          text: [
            `task_id: ${info.taskId}`,
            `mode: ${mode} | cwd: ${path.relative(ROOT, cwd) || "."} | timeout: ${timeout_secs}s`,
            "",
            `Next: call codex_poll(task_id="${info.taskId}") to receive codex's first model request.`,
            "Then answer it with codex_reply(task_id, turn_id, reply). Repeat poll/reply until the poll status is finished/failed/cancelled.",
          ].join("\n"),
        }],
      };
    } catch (error) {
      return { content: [{ type: "text", text: `codex_start failed: ${(error as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  "codex_poll",
  "Fetch codex's pending model request (full conversation + tools) so you can answer it as the model, or codex's final result when it finished. If no request is pending it waits up to wait_secs. Keep calling this until status is finished/failed/cancelled.",
  { task_id: z.string().min(1), wait_secs: z.number().min(0).max(60).default(25) },
  async ({ task_id, wait_secs }) => {
    try {
      const result = await bridge.poll(task_id, wait_secs);
      return { content: [{ type: "text", text: `status: ${result.kind}\n${result.text}` }] };
    } catch (error) {
      return { content: [{ type: "text", text: `codex_poll failed: ${(error as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  "codex_reply",
  "Answer codex's pending model request (you act as the model). reply must be JSON {\"items\":[...]} where each item is one of: {\"type\":\"message\",\"text\":...} / {\"type\":\"exec\",\"input\":\"<raw JS>\"} / {\"type\":\"function_call\",\"name\":...,\"namespace\":...,\"arguments\":{...}} / {\"type\":\"reasoning\",\"summary\":[...]}. Plain text is treated as one message item.",
  { task_id: z.string().min(1), turn_id: z.string().min(1), reply: z.string().min(1).max(400000) },
  async ({ task_id, turn_id, reply }) => {
    try {
      const ack = bridge.reply(task_id, turn_id, reply);
      return { content: [{ type: "text", text: `delivered to codex: ${ack.emitted.join(", ")}. Next: call codex_poll again.` }] };
    } catch (error) {
      return { content: [{ type: "text", text: `codex_reply failed: ${(error as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  "codex_cancel",
  "Cancel a running codex task started with codex_start (terminates the codex process).",
  { task_id: z.string().min(1) },
  async ({ task_id }) => {
    try {
      return { content: [{ type: "text", text: bridge.cancel(task_id) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `codex_cancel failed: ${(error as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  "codex_list",
  "List codex tasks started via codex_start with their status and pending turn ids.",
  {},
  async () => ({
    content: [{ type: "text", text: JSON.stringify(bridge.list(), null, 2) }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
