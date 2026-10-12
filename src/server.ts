import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ModelBridge } from "./bridge.js";
import { ConfigManager } from "./config.js";
import { getVersion } from "./system.js";

const configManager = new ConfigManager();

// 本地"虚拟模型"端点：codex 的模型请求会打到这里，由 ChatGPT 对话作答。
const bridge = new ModelBridge({ configManager });
let bridgeError: string | null = null;
try {
  await bridge.start();
  console.error(`[server] model bridge ready on 127.0.0.1:${bridge.port}`);
  console.error(`[server] Web Dashboard available at http://127.0.0.1:${bridge.port}`);
} catch (error) {
  bridgeError = (error as Error).message;
  console.error(`[server] model bridge failed to start: ${bridgeError}`);
}

function safeCwd(input?: string): string {
  const base = configManager.get().activeWorkspace;
  if (!base) {
    throw new Error(
      `未配置有效的工作区目录。请先在 Web 控制台 (http://127.0.0.1:${bridge.port}) 的“项目目录管理”中点击【📁 选择本地目录】添加并设置默认项目。`
    );
  }
  const resolved = input && input !== "." ? path.resolve(base, input) : base;
  if (!configManager.isPathAllowed(resolved)) {
    throw new Error(
      `路径 '${resolved}' 未在允许访问的工作区白名单中。请先在 Web 控制台 (http://127.0.0.1:${bridge.port}) 的“项目目录管理”中添加该目录。`
    );
  }
  return resolved;
}

const server = new McpServer({
  name: "chatgpt-agent-bridge",
  version: getVersion(),
});

server.tool(
  "codex_start",
  "Start a Codex CLI session on this machine whose model requests are answered by THIS ChatGPT conversation (codex sends nothing to OpenAI; zero codex quota used). Flow: codex_start -> loop { codex_poll -> answer with codex_reply } until poll status is finished/failed/cancelled.",
  {
    prompt: z.string().min(1).max(20000),
    cwd: z.string().default("."),
    mode: z.enum(["read-only", "workspace-write", "danger-full-access"]).optional(),
    timeout_secs: z.number().int().min(60).max(86400).default(1800),
  },
  async ({ prompt, cwd: inputCwd, mode: inputMode, timeout_secs }, extra) => {
    if (bridgeError) {
      return {
        content: [{ type: "text", text: `Model bridge unavailable: ${bridgeError}. Free the port (env BRIDGE_PORT, default 8791) and restart the MCP server.` }],
        isError: true,
      };
    }
    try {
      const cfg = configManager.get();
      // 动态确定实际生效模式：
      // 1. 若 ChatGPT 未指定 mode，默认采用 Web 控制台当前保存的生效模式（避免默认强制降为 read-only）
      // 2. 若 Web 控制台已选定 danger-full-access，而 ChatGPT 传入的是旧惯性 workspace-write，自动升级为 danger-full-access
      let effectiveMode = inputMode ?? cfg.maxAllowedMode;
      if (cfg.maxAllowedMode === "danger-full-access" && inputMode === "workspace-write") {
        effectiveMode = "danger-full-access";
      }

      const modeCheck = configManager.validateMode(effectiveMode);
      if (!modeCheck.allowed) {
        return {
          content: [{
            type: "text",
            text: `[Security Lock Blocked] ${modeCheck.reason}\nYou can adjust the Security Lock policy on the Web Dashboard: http://127.0.0.1:${bridge.port}`,
          }],
          isError: true,
        };
      }
      const cwd = safeCwd(inputCwd);
      const progressToken = (extra?._meta as any)?.progressToken;
      const sendNotification = extra?.sendNotification;

      const info = bridge.createTask({
        prompt,
        cwd,
        mode: effectiveMode,
        timeoutSecs: timeout_secs,
        onProgress: (progress, total, message) => {
          if (progressToken && sendNotification) {
            sendNotification({
              method: "notifications/progress",
              params: {
                progressToken,
                progress,
                total,
                message,
              },
            }).catch(() => {});
          }
        },
      });

      if (progressToken && sendNotification) {
        sendNotification({
          method: "notifications/progress",
          params: {
            progressToken,
            progress: 0,
            message: `Codex session initialized (task ${info.taskId})`,
          },
        }).catch(() => {});
      }

      return {
        content: [{
          type: "text",
          text: [
            `task_id: ${info.taskId}`,
            `cwd: ${cwd} (verified active workspace from Web Console)`,
            `mode: ${effectiveMode} | timeout: ${timeout_secs}s`,
            "",
            "CRITICAL: Codex shell executes inside a local security sandbox (outbound network & curl to 127.0.0.1 are blocked). Do NOT run curl to 127.0.0.1. Trust cwd and inspect local files directly.",
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
  async ({ task_id, wait_secs }, extra) => {
    try {
      const progressToken = (extra?._meta as any)?.progressToken;
      const sendNotification = extra?.sendNotification;
      if (progressToken && sendNotification) {
        sendNotification({
          method: "notifications/progress",
          params: {
            progressToken,
            progress: 0,
            message: `Polling codex for task ${task_id}...`,
          },
        }).catch(() => {});
      }
      const result = await bridge.poll(task_id, wait_secs);
      if (progressToken && sendNotification) {
        sendNotification({
          method: "notifications/progress",
          params: {
            progressToken,
            progress: 1,
            message: `Poll result: ${result.kind}`,
          },
        }).catch(() => {});
      }
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
  async ({ task_id, turn_id, reply }, extra) => {
    try {
      const progressToken = (extra?._meta as any)?.progressToken;
      const sendNotification = extra?.sendNotification;
      const ack = bridge.reply(task_id, turn_id, reply);
      if (progressToken && sendNotification) {
        sendNotification({
          method: "notifications/progress",
          params: {
            progressToken,
            progress: 1,
            message: `Dispatched ${ack.emitted.length} action(s) to Codex: ${ack.emitted.join(", ")}`,
          },
        }).catch(() => {});
      }
      return {
        content: [{
          type: "text",
          text: `delivered to codex: ${ack.emitted.join(", ")}. CRITICAL: You MUST immediately call codex_poll(task_id="${task_id}") to complete the loop. Do NOT conclude or send final response to user until codex_poll returns status: finished/failed/cancelled.`
        }],
      };
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
  "codex_diff",
  "View Git Diff (file changes and unstaged/staged diff) for a task's workspace directory.",
  { task_id: z.string().min(1) },
  async ({ task_id }) => {
    try {
      const task = (bridge as any).tasks?.get(task_id);
      if (!task) {
        return { content: [{ type: "text", text: `Error: Task '${task_id}' not found` }], isError: true };
      }
      const { getGitDiff } = await import("./git.js");
      const diffResult = await getGitDiff(task.cwd);
      return {
        content: [{
          type: "text",
          text: diffResult.hasChanges
            ? `Git status: ${diffResult.files.length} changed file(s), ${diffResult.untracked.length} untracked file(s)\n\nStat summary:\n${diffResult.stat || "(no stat)"}\n\nDiff:\n${diffResult.diff || "(untracked files only)"}`
            : "No changes detected in git workspace (clean work tree).",
        }],
      };
    } catch (error) {
      return { content: [{ type: "text", text: `codex_diff failed: ${(error as Error).message}` }], isError: true };
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

server.tool(
  "codex_inspect_workspace",
  "Quickly inspect the active workspace directory structure, file tree, and git status without starting a heavy codex session. Instant and read-only. Use this to examine project files and verify workspace paths before or instead of codex_start.",
  {
    subpath: z.string().default(".").describe("Subpath relative to active workspace, defaults to '.'"),
    max_depth: z.number().int().min(1).max(5).default(2).describe("Maximum directory depth to explore (default 2)"),
  },
  async ({ subpath, max_depth }) => {
    try {
      const resolved = safeCwd(subpath);
      const { inspectWorkspace } = await import("./git.js");
      const overview = await inspectWorkspace(resolved, max_depth);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(overview, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `codex_inspect_workspace failed: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  "codex_status",
  "Check bridge status: get current active workspace, allowed workspaces whitelist, security mode, and dashboard URL. Call this to verify project directory before running tasks.",
  {},
  async () => {
    const cfg = configManager.get();
    const isConfigured = Boolean(cfg.activeWorkspace);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          isWorkspaceConfigured: isConfigured,
          activeWorkspace: cfg.activeWorkspace || null,
          allowedWorkspaces: cfg.allowedWorkspaces,
          maxAllowedMode: cfg.maxAllowedMode,
          dashboardUrl: `http://127.0.0.1:${bridge.port}`,
          tip: "Codex CLI runs within the active workspace. Outbound network/curl from Codex sandbox is blocked.",
          message: isConfigured
            ? `当前默认工作区为: ${cfg.activeWorkspace} (权限模式: ${cfg.maxAllowedMode})`
            : `未配置有效的工作区目录。请先在 Web 控制台 (http://127.0.0.1:${bridge.port}) 的“项目目录管理”中点击【📁 选择本地目录】添加并设置默认项目。`,
        }, null, 2),
      }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
