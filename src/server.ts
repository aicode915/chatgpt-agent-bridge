import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ModelBridge } from "./bridge.js";

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

const server = new McpServer({
  name: "chatgpt-agent-bridge",
  version: "0.1.0",
});

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
