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

The MCP server uses stdio, which is convenient for Secure MCP Tunnel's local stdio mode. The embedded model bridge listens on `127.0.0.1` (env `BRIDGE_PORT`, default `8791`).

Local closed-loop test (runs the real codex CLI against the plugin, with a script playing the ChatGPT role — zero quota):

```bash
npm run test:local
```

## Secure MCP Tunnel

Install the official `tunnel-client`, then initialize a profile that launches this server:

```bash
export CONTROL_PLANE_API_KEY="YOUR_KEY"

tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile chatgpt-agent-bridge \
  --tunnel-id tunnel_YOUR_ID \
  --mcp-command "env WORKSPACE_ROOT=/Users/liukun/ai_dev/chatgpt-agent-bridge /opt/homebrew/bin/npm start"

tunnel-client doctor --profile chatgpt-agent-bridge --explain
tunnel-client run --profile chatgpt-agent-bridge
```

Keep `tunnel-client run` running. Then in ChatGPT, add the custom MCP server using the Tunnel connection and select the corresponding tunnel (or enter its tunnel ID).

## Health check

The MCP server itself uses stdio. The embedded model bridge (quota-free codex flow) exposes a local-only debug endpoint at `http://127.0.0.1:<BRIDGE_PORT>/healthz`. Validate the MCP side through the Secure MCP Tunnel and an actual MCP tool call.
