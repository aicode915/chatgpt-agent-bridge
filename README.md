# ChatGPT Agent Bridge

A minimal local MCP server for **ChatGPT → Secure MCP Tunnel → local machine**.

Two ways to use the locally installed Codex CLI:

1. **Quota-free virtual model (recommended):** `codex_start` spawns `codex exec` with a per-process model-provider override so codex's model requests go to a local endpoint inside this plugin. Each request is handed to the ChatGPT conversation itself (`codex_poll`), which answers as the model (`codex_reply`). Codex never calls OpenAI's model API for these runs; the ChatGPT subscription powers it.
2. **Plain delegation:** `run_agent` runs Codex/Claude with their own configured accounts and quotas.

Direct filesystem/command tools (`list_dir`, `read_file`, `write_file`, `run_command`, `git_status`) remain available too.

## Architecture

```
ChatGPT conversation
→ OpenAI Secure MCP Tunnel
→ this MCP server (stdio)
   ├─ direct tools: list_dir / read_file / write_file / run_command / git_status / run_agent
   └─ quota-free Codex flow:
        codex_start → local `codex exec` (per-process `-c model_provider=bridge`; global ~/.codex/config.toml untouched)
        codex model request → http://127.0.0.1:<BRIDGE_PORT>/t/<task_id>/v1/responses (Responses API SSE)
        codex_poll → hands the request + tools to ChatGPT
        codex_reply → ChatGPT answers as the model (message / exec JS / function_call / reasoning)
        … loop until codex exits; then codex_poll returns the final result
```

Wire-protocol notes: codex ≥ 0.161 requires the **Responses API** wire format (`wire_api = "chat"` was removed upstream — see openai/codex discussion #7782). The bridge implements the minimal SSE contract codex needs (`response.created` → `response.output_item.done` → `response.completed`). No ACP; `run_command` uses literal argv and does not invoke a shell.

## Tools

- `list_dir`
- `read_file`
- `write_file`
- `run_command`
- `git_status`
- `run_agent` (Codex or Claude Code; uses their own account/quota; read-only by default)
- `codex_start` / `codex_poll` / `codex_reply` / `codex_cancel` / `codex_list` (quota-free Codex flow driven by the ChatGPT conversation)

All requested working directories are confined to `WORKSPACE_ROOT`. `run_command` uses literal argv and does not invoke a shell. `run_agent` accepts `agent` (`codex` or `claude`), `prompt`, optional project-relative `cwd`, `mode` (`read-only` by default or `workspace-write`), and `timeout_secs` (10–900 seconds). Codex uses its read-only/workspace-write sandbox; Claude uses plan/acceptEdits permission mode. Write mode can change project files, so use read-only for diagnostics.

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

1. **密钥**：把运行时控制面 key 写进项目根目录的 `.env`（已在 `.gitignore`，不会被提交）：
   ```
   CONTROL_PLANE_API_KEY=sk-...
   ```
2. **隧道 profile**：`~/.config/tunnel-client/chatgpt-agent-bridge.yaml` 里的 `tunnel_id`
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

启动隧道（保持运行；改过 `src/` 代码先 `npm run build`）：
```bash
cd ~/ai_dev/chatgpt-agent-bridge
set -a && source .env && set +a
tunnel-client run --profile chatgpt-agent-bridge
```

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
