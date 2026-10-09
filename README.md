# ChatGPT Agent Bridge

A minimal local MCP server for **ChatGPT → Secure MCP Tunnel → local machine**.

The bridge performs **no file/command execution of its own** — every action is executed by the locally installed **Codex CLI**, driven as a quota-free virtual model by the ChatGPT conversation:

- `codex_start` spawns `codex exec` with a per-process model-provider override so codex's model requests go to a local endpoint inside this plugin.
- Each request is handed to the ChatGPT conversation itself (`codex_poll`), which answers as the model (`codex_reply`).
- Codex never calls OpenAI's model API for these runs; the ChatGPT subscription powers it.

## Architecture

```
ChatGPT conversation
→ OpenAI Secure MCP Tunnel
→ this MCP server (stdio; NO direct file/command tools — all execution happens inside codex)
   └─ quota-free Codex flow:
        codex_start → local `codex exec` (per-process `-c model_provider=bridge`; global ~/.codex/config.toml untouched)
        codex model request → http://127.0.0.1:<BRIDGE_PORT>/t/<task_id>/v1/responses (Responses API SSE)
        codex_poll → hands the request + tools to ChatGPT
        codex_reply → ChatGPT answers as the model (message / exec JS / function_call / reasoning)
        … loop until codex exits; then codex_poll returns the final result
```

Wire-protocol notes: codex ≥ 0.161 requires the **Responses API** wire format (`wire_api = "chat"` was removed upstream — see openai/codex discussion #7782). The bridge implements the minimal SSE contract codex needs (`response.created` → `response.output_item.done` → `response.completed`). No ACP; the bridge itself never runs shell commands.

## Tools

- `codex_start` / `codex_poll` / `codex_reply` / `codex_cancel` / `codex_list` — the only tools exposed; the quota-free Codex flow driven by the ChatGPT conversation.

The bridge exposes no direct file/command tools: every operation happens inside the codex subprocess (`codex_start`), confined to the requested project-relative `cwd` (checked against `WORKSPACE_ROOT`) and executed in codex's own sandbox (`read-only` by default, or `workspace-write` to allow edits).

## Run locally

```bash
cd /Users/liukun/ai_dev/chatgpt-agent-bridge
npm install
WORKSPACE_ROOT=/Users/liukun/ai_dev/chatgpt-agent-bridge npm start
```

The MCP server uses stdio, which is convenient for Secure MCP Tunnel's local stdio mode. The embedded model bridge listens on `127.0.0.1` (env `BRIDGE_PORT`, default `8791`). Note: the tunnel profile runs `dist/server.js` directly — after changing anything under `src/`, run `npm run build` before restarting the tunnel.

Local closed-loop test (runs the real codex CLI against the plugin, with a script playing the ChatGPT role — zero quota):

```bash
npm run test:local
```

## 使用说明（中文）

### 一次性配置

1. **密钥与隧道 ID**：写进项目根目录的 `.env`（已在 `.gitignore`，不会被提交；可参考 `.env.example`）：
   ```
   CONTROL_PLANE_API_KEY=sk-...
   CONTROL_PLANE_TUNNEL_ID=tunnel_xxx   # ChatGPT 连接器绑定的那条隧道
   ```
   `CONTROL_PLANE_TUNNEL_ID` 是 tunnel-client 的官方环境变量，**优先级高于 profile YAML**——改 `.env` 即生效，无需改 profile。
2. **隧道一致性**：`.env` 的 `CONTROL_PLANE_TUNNEL_ID`（优先）或 profile YAML 的 `tunnel_id`，
   **必须与 ChatGPT 连接器绑定的隧道一致**（不一致会报 "Tunnel-client has not been seen for 300 seconds"）。
   核对方式（用 `.env` 里的运行时 key 即可只读查询，看 `name` 字段）：
   ```bash
   set -a && source .env && set +a
   tunnel-client admin tunnels get <tunnel_id> --json
   ```
   重新生成 profile 可参考：
   ```bash
   tunnel-client init \
     --sample sample_mcp_stdio_local \
     --profile chatgpt-agent-bridge \
     --tunnel-id tunnel_YOUR_ID \
     --mcp-command "env WORKSPACE_ROOT=/Users/liukun/ai_dev/chatgpt-agent-bridge /opt/homebrew/bin/node /Users/liukun/ai_dev/chatgpt-agent-bridge/dist/server.js"
   ```
3. **ChatGPT 连接器**：设置 → 连接器 → 新建自定义连接器 → 连接方式选 **Tunnel** → 选择对应的隧道。

### 日常使用

启动隧道（一键脚本：自动读取 `.env` 并启动，前台运行，Ctrl+C 停止）：
```bash
cd ~/ai_dev/chatgpt-agent-bridge
./scripts/start-tunnel.sh            # 已在运行时仅提示（不打扰进行中的任务）
./scripts/start-tunnel.sh --restart  # 需要重启时（注意：会中断进行中的任务）
```
（等价手动命令：`set -a && source .env && set +a && tunnel-client run --profile chatgpt-agent-bridge`；改过 `src/` 代码先 `npm run build`）

在 ChatGPT 对话中驱动 Codex（零额度），把下面这段作为驱动提示词发给对话：
```
你是驱动本机 Codex 的“模型”。流程：
1) 需要执行本机编码任务时调用 codex_start(prompt, cwd, mode)（mode 默认 read-only）。
2) 循环：调用 codex_poll(task_id, wait_secs≈25)：
   - status=model_request：按返回文本里的 REPLY PROTOCOL，用 codex_reply(task_id, turn_id, reply) 作答；
     要执行动作就发 exec 的 JS（如 await tools.exec_command({cmd:"ls"})），目标完成就发最终 message；
   - status=waiting：稍后再次 poll；
   - status=finished/failed/cancelled：停止循环，把最终输出整理给用户。
每步约 2 次工具调用，任务尽量切小；写文件需 mode=workspace-write。
```

### 排障速查

| 症状 | 处理 |
|---|---|
| `Tunnel-client has not been seen for 300 seconds` | 连接器隧道 ≠ profile `tunnel_id`；用 `admin tunnels get` 核对后改 profile 并重启隧道 |
| 工具清单出现 `echo/server_info/uppercase`，或缺新工具 | ChatGPT 对连接器工具清单做快照：**删除并重建连接器**，再**新开对话** |
| 调工具报 `-32602 Tool not found` | 同上（它在调缓存里的旧工具名） |
| 健康检查 | `tunnel-client health --url http://127.0.0.1:8080` → Healthz/Readyz PASS |
| 确认指令到达本机 | 隧道日志出现 `dispatcher forwarded command ...`；服务日志出现 `[bridge] task ...` |
| 端口冲突 | 设 `BRIDGE_PORT`（默认 8791）后重启隧道 |

服务日志关键点：`[bridge] task ... spawned codex`（任务启动）→ `model request #N received`（codex 请求模型）
→ `turn ... answered -> message(...)`（ChatGPT 作答已回填）→ `codex closed (code=0) -> finished`（任务完成）。

**实时观察**：在 VS Code 的 `tunnel-client` 终端里可以实时看到每一步日志；插件会把 codex 的输出流
（`codex stdout/stderr:` 行）和每次工具执行的输出（`tool output N (...)`）实时打到该终端（均做了截断）。

## Health check

The MCP server itself uses stdio. The embedded model bridge (quota-free codex flow) exposes a local-only debug endpoint at `http://127.0.0.1:<BRIDGE_PORT>/healthz`; the tunnel-client admin surface is at `http://127.0.0.1:8080` (`tunnel-client health --url http://127.0.0.1:8080`). Validate the MCP side through the Secure MCP Tunnel and an actual MCP tool call.
