# ChatGPT Agent Bridge

**English** | [简体中文](README_zh.md)

A minimal, high-efficiency local MCP server for **ChatGPT → OpenAI Secure MCP Tunnel → Local Machine**.

The bridge performs **no file/command execution of its own** — every action is executed by the locally installed **Codex CLI**, driven as a quota-free virtual model by the ChatGPT conversation:

- `codex_start` spawns `codex exec` with a per-process model-provider override (`-c model_provider=bridge`) so Codex's model requests go to the embedded local endpoint inside this bridge.
- Each request is handed to the ChatGPT conversation itself (`codex_poll`), which answers as the model (`codex_reply`).
- Codex never calls OpenAI's model API for these runs; your standard ChatGPT Plus/Team subscription powers it with **zero API token quota consumed**.

---

## Architecture

```text
ChatGPT conversation
→ OpenAI Secure MCP Tunnel
→ this MCP server (stdio; NO direct file/command tools — all execution happens inside codex)
   └─ quota-free Codex flow:
        codex_start → local `codex exec` (per-process override `-c model_provider=bridge`; ~/.codex/config.toml untouched)
        codex model request → http://127.0.0.1:<BRIDGE_PORT>/t/<task_id>/v1/responses (Responses API SSE)
        codex_poll → hands the request + tools to ChatGPT conversation
        codex_reply → ChatGPT answers as the model (message / exec JS / function_call / reasoning)
        … loop until codex exits; then codex_poll returns final stdout / stderr
```

**Wire-Protocol Notes**: Codex $\ge$ 0.161 requires the **OpenAI Responses API** wire format (`wire_api = "chat"` was removed upstream — see openai/codex discussion #7782). The bridge implements the minimal SSE contract Codex needs (`response.created` $\to$ `response.output_item.added` $\to$ `response.output_text.delta` $\to$ `response.output_item.done` $\to$ `response.completed`).

---

## Prerequisites & Version Requirements

| Component / Dependency | Minimum Version | Description |
|---|---|---|
| **Node.js** | `>= 18.0.0` (Recommended 20+) | Runtime for the server, requires ES Modules and Top-level await |
| **npm** | `>= 9.0.0` | Node package manager |
| **Codex CLI** | `>= 0.161.0` | **Required**. Codex 0.161 dropped the legacy `chat` wire API; this project is built entirely on Responses API wire format |
| **tunnel-client** | `>= 0.0.16` | OpenAI official Secure MCP Tunnel client |
| **OS** | macOS / Linux | macOS runs Codex CLI with Apple Seatbelt sandbox isolation |
| **OpenAI Credentials** | - | ChatGPT subscription (with Custom Connectors support) and OpenAI Platform Tunnel credentials (`CONTROL_PLANE_TUNNEL_ID` & `CONTROL_PLANE_API_KEY`) |

---

## Tools

The MCP server exposes 5 core tools driving the closed-loop Codex execution:

- `codex_start`: Start a Codex CLI session with initial prompt, working directory (`cwd`), timeout, and sandbox permission mode (`mode`).
- `codex_poll`: Fetch pending model requests (context + tools) for ChatGPT to answer, or wait for the process to finish and return final results.
- `codex_reply`: Submit ChatGPT's answer as the model (supporting text message, `exec` JS orchestration, function calls, reasoning summary).
- `codex_cancel`: Terminate a running Codex process.
- `codex_list`: List currently tracked tasks and pending turns.

### Sandbox Modes (`mode`)
All commands run inside Codex's own sandbox:
- `read-only` (default): Read-only filesystem, **strictly no outbound network**.
- `workspace-write`: Allows modifying workspace files and local git operations (`git add` / `git commit`), but **outbound network is blocked by Seatbelt**.
- `danger-full-access`: Full disk access and **full outbound network enabled** (required for `git push`, remote package installation, etc.).

---

## Web Dashboard

Once started, the embedded Web Dashboard is accessible directly in your browser:
👉 **http://127.0.0.1:8791** (Configurable via `BRIDGE_PORT`, default: `8791`; single-process embedded, zero extra port/dependency overhead)

Features:
1. **📋 Tasks & Session Monitor**: Real-time inspection of active & finished tasks (running/finished/failed/abandoned), multi-turn interaction history (ChatGPT's JS/replies and Codex tool outputs), **SSE-driven live terminal log streaming** (with auto-scroll, clear screen, and copy buttons), and one-click task cancellation.
2. **🛡️ Security Policy Lock**: Visual selector for the maximum allowed sandbox mode (`read-only`, `workspace-write`, or `danger-full-access`). **Server enforces hard security checks**: if ChatGPT requests a mode exceeding the lock, the server intercepts and protects your system.
3. **📁 Workspaces Management**: Manage allowed project root paths (white-list) to prevent path escaping; switch active default workspace with one click.
4. **⚡ ChatGPT Prompt Assistant**: Dynamically generates tailored driver prompts based on the currently selected workspace and security mode, complete with one-click clipboard copying.
5. **🔌 Tunnel & System Status**: Live health checks for Secure MCP Tunnel, environment & Codex diagnostics, and one-click tunnel restarting.

---

## Orphan Task Self-Healing & Idle Timeout

In conversational AI workflows, ChatGPT may finish answering the user's objective or the user may close the chat window, leaving a pending model request (Pending Turn) unanswered without further polling or replies:
- **Idle Timeout Detection**: When a turn request is pending from Codex, if the client goes idle for >60s (customizable via `TURN_IDLE_TIMEOUT_SECS`) without polling or calling `codex_reply`, the bridge triggers automatic idle reaping.
- **Orphan Task Cleanup**: The hanging Codex subprocess is gracefully terminated (`SIGTERM` $\to$ `SIGKILL`), and the task status transitions immediately to `abandoned`.
- **Live Event Broadcast**: The dashboard and SSE subscribers instantly receive the `end` event with the `abandoned` status, preventing lingering orphan processes and freeing local resources.

---

## Getting Started

### 1. One-time Setup

1. **Credentials & Tunnel ID**: Save to `.env` in the project root (already ignored by `.gitignore`; see `.env.example`):
   ```bash
   CONTROL_PLANE_API_KEY=sk-...
   CONTROL_PLANE_TUNNEL_ID=tunnel_xxx   # The tunnel ID bound to your ChatGPT Connector
   ```
   `CONTROL_PLANE_TUNNEL_ID` is the official environment variable for `tunnel-client` and **takes precedence over the profile YAML** — updating `.env` takes effect immediately without modifying profiles.
2. **Tunnel Verification**:
   Verify the tunnel ID using your runtime key:
   ```bash
   set -a && source .env && set +a
   tunnel-client admin tunnels get <tunnel_id> --json
   ```
   To regenerate the profile if needed:
   ```bash
   tunnel-client init \
     --sample sample_mcp_stdio_local \
     --profile chatgpt-agent-bridge \
     --tunnel-id tunnel_YOUR_ID \
     --mcp-command "env WORKSPACE_ROOT=/Users/liukun/ai_dev/chatgpt-agent-bridge /opt/homebrew/bin/node /Users/liukun/ai_dev/chatgpt-agent-bridge/dist/server.js"
   ```
3. **ChatGPT Connector**: In ChatGPT: Settings → Connectors → New Custom Connector → Connection Method: **Tunnel** → Select your tunnel.

### 2. Daily Usage & Running

Start the tunnel (one-click script automatically reading `.env`, runs in foreground, Ctrl+C to stop):
```bash
cd ~/ai_dev/chatgpt-agent-bridge
./scripts/start-tunnel.sh            # Start; prompts if already running
./scripts/start-tunnel.sh --restart  # Restart tunnel (interrupts ongoing tasks)
```
*(Note: after modifying anything in `src/`, run `npm run build` before restarting the tunnel)*

Local closed-loop test (runs real Codex CLI with a test script playing ChatGPT's role — zero quota):
```bash
npm run test:local
```

### 3. ChatGPT Driver Prompt

Paste this prompt into your ChatGPT conversation (or copy it from the Web Dashboard's "⚡ Prompt Assistant" tab):
```text
You are the virtual "model" driving the local Codex CLI. Workflow:
1) When a local coding task is requested, invoke codex_start(prompt, cwd, mode):
   - Read-only analysis: mode="read-only"
   - Edit files / local tests / local commit: mode="workspace-write"
   - Outbound network needed (e.g. git push, installing remote packages): mode="danger-full-access"
2) Loop: invoke codex_poll(task_id, wait_secs≈25):
   - status=model_request: Follow the REPLY PROTOCOL in the returned text, answer via codex_reply(task_id, turn_id, reply);
     To execute actions, emit an exec JS item (e.g. await tools.exec_command({cmd:"ls"})); when finished, emit a message item;
   - status=waiting: Poll again after a short delay;
   - status=finished/failed/cancelled: Stop the loop and present the final output to the user.
Keep tasks concise and emit ~2 tool calls per step; modifying files requires mode=workspace-write or danger-full-access.
```

---

## Sandbox Policies & Code Submission (`git push`)

If modifying code works but pushing code (`git push`) fails inside ChatGPT conversations, here is why and how to resolve it:

### Why does `git push` fail by default?
On macOS, Codex CLI uses Apple Seatbelt sandboxing. Under the default `workspace-write` mode:
- **Write access allowed**: Current workspace directory (`cwd`) and `.git/` repository (local `git add` and `git commit` work as expected).
- **Network blocked (Network Disabled)**: The OS kernel denies outbound network sockets. Any network operation (`git push`, `git fetch`, `curl`, `npm install`) fails with errors like `Could not resolve host: github.com` or `Operation not permitted`.

### Two Recommended Approaches

1. **Option 1 (Security Best Practice·Recommended): Local Commit + Host Terminal Push**
   - Let ChatGPT safely edit files, run tests, and commit locally in the `workspace-write` sandbox:
     ```javascript
     const r = await tools.exec_command({
       cmd: 'git add . && git commit -m "feat: your commit message"'
     });
     text(JSON.stringify(r));
     ```
   - After the task completes, review the commit and push from your host terminal (`git push`). This keeps AI execution strictly isolated from outer networks.

2. **Option 2 (Fully Automated Pipeline): Use `danger-full-access`**
   - Set the Security Lock in the Web Dashboard to `danger-full-access` (the server will automatically elevate tasks to full network access, or specify `mode="danger-full-access"` in `codex_start`).
   - In this mode, Codex has full network and disk permissions and can run `git push` directly.
   - **Prerequisites**:
     - Host machine must have non-interactive Git credentials configured (e.g., SSH Agent or GitHub CLI `gh auth setup-git`).
     - Git identity configured: `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`.

---

## Troubleshooting

| Symptom | Resolution |
|---|---|
| `Tunnel-client has not been seen for 300 seconds` | Connector tunnel ID does not match profile or `.env` `CONTROL_PLANE_TUNNEL_ID`; verify with `admin tunnels get` and restart tunnel |
| Tool list shows legacy `echo/server_info` or missing tools | ChatGPT caches connector schemas: **Delete and recreate the connector**, then **open a new conversation** |
| Tool invocation error `-32602 Tool not found` | Same as above (ChatGPT is invoking cached stale tool definitions) |
| Health check | Run `tunnel-client health --url http://127.0.0.1:8080` → Verify Healthz/Readyz is PASS |
| Confirming instructions reached machine | Tunnel terminal displays `dispatcher forwarded command ...`; server terminal displays `[bridge] task ...` |
| Port conflict | Set environment variable `BRIDGE_PORT` (e.g. 8792) and restart tunnel |
| `git push` error `Could not resolve host` | Expected Seatbelt sandbox defense; use local commit + host push, or switch to `danger-full-access` in Web Dashboard |

**Server Log Landmarks**: `[bridge] task ... spawned codex` (started) $\to$ `model request #N received` (Codex requesting model) $\to$ `turn ... answered -> message(...)` (ChatGPT reply delivered) $\to$ `codex closed (code=0) -> finished` (task completed).

**Live Observability**: Live execution streams and tool outputs (`codex stdout/stderr` lines) are mirrored in the tunnel terminal and in the Web Dashboard's "📋 Tasks" tab.

---

## Roadmap & Future Work

Planned improvements for open-source releases:

- [ ] **Controlled Network Allowlist**: Allow outbound traffic to select domains (e.g. `github.com`) while preserving sandbox boundaries, avoiding full `danger-full-access`.
- [ ] **Multi-turn Error Self-Healing**: Enhanced prompt diagnostics in `renderTurn` when model JS emits syntax errors or commands timeout.
- [ ] **Task Concurrency & Quotas**: Independent workspace isolation, memory/CPU quotas, and port multiplexing across concurrent sessions.
- [ ] **Real-time MCP Progress Notifications**: Stream sub-command progress and live logs back to the ChatGPT UI using standard MCP `notifications/progress`.
- [ ] **Automated CI/CD Test Suite**: Mocked Responses API SSE integration tests running in GitHub Actions.

---

## Health Check

The MCP server itself communicates over stdio. The embedded model bridge exposes a local debug endpoint at `http://127.0.0.1:<BRIDGE_PORT>/healthz`; the `tunnel-client` admin surface is at `http://127.0.0.1:8080` (`tunnel-client health --url http://127.0.0.1:8080`). Validate end-to-end connectivity through the Secure MCP Tunnel and an actual MCP tool call.
<!-- push test: 2026-10-10 -->
<!-- push test: 2026-10-10 -->
