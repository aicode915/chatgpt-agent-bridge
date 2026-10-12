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
| **Codex CLI** | `>= 0.161.0` | **Required**. Interactive wizard auto-detects and installs via Homebrew on first launch, or install manually: `brew install codex` |
| **tunnel-client** | `>= 0.0.16` | **Required**. OpenAI official Secure MCP Tunnel client. Interactive wizard auto-detects and installs on first launch, or install manually: `brew tap openai/tools && brew install openai/tools/tunnel-client` |
| **Git** | `>= 2.0` | **Recommended**. For workspace version control, diff inspection (`codex_diff`), Dashboard Git Diff visualization, and `git commit`/`git push` operations |
| **Homebrew** | - | **Recommended (macOS/Linux)**. Used by the setup wizard to auto-install missing CLI dependencies |
| **OS** | macOS / Linux | macOS runs Codex CLI with Apple Seatbelt sandbox isolation |
| **OpenAI Credentials** | - | ChatGPT subscription (with Custom MCP Server / Plugins support) and OpenAI Platform Tunnel credentials (`CONTROL_PLANE_TUNNEL_ID` & `CONTROL_PLANE_API_KEY`) |

---

## Tools

The MCP server exposes the following core tools driving the closed-loop Codex execution and environment inspection:

- `codex_status`: Check bridge status: active workspace directory, allowed workspaces whitelist, security mode, and readiness.
- `codex_start`: Start a Codex CLI session with initial prompt, working directory (`cwd`), timeout, and sandbox permission mode (`mode`).
- `codex_poll`: Fetch pending model requests (context + tools) for ChatGPT to answer, or wait for the process to finish and return final results.
- `codex_reply`: Submit ChatGPT's answer as the model (supporting text message, `exec` JS orchestration, function calls, reasoning summary).
- `codex_diff`: View Git Diff changes (file changes, statistics, and diff comparison) for a task workspace.
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
- **Graceful Auto-Finalization**: If the task has already completed previous interaction turns (indicating tools ran and objectives were met), Bridge automatically fulfills the pending turn with a completion message, allowing Codex to exit cleanly with code 0 and status `finished`, rather than showing a false-positive abandoned state.
- **Orphan Task Cleanup**: If the client went idle on the very first turn without ever replying, the hanging subprocess is terminated (`SIGTERM` $\to$ `SIGKILL`), transitioning the task status to `abandoned`.
- **Live Event Broadcast**: The dashboard and SSE subscribers instantly receive event notifications with updated statuses, freeing local resources without manual process management.

---

## Quickstart Guide

### Step 1: Obtain OpenAI Platform Credentials & Add Custom MCP Server
1. **Create Tunnel**: Navigate to <a href="https://platform.openai.com/settings/organization/tunnels" target="_blank" rel="noopener noreferrer">OpenAI Platform Tunnels</a>, create a new tunnel, and copy your Tunnel ID (e.g., `tunnel_xxxx`).
2. **Generate Runtime API Key**: Navigate to <a href="https://platform.openai.com/settings/organization/api-keys" target="_blank" rel="noopener noreferrer">OpenAI Platform API Keys</a>, create or copy a runtime API key (e.g., `sk-...`).
3. **Add Custom MCP Server**: Open <a href="https://chatgpt.com/plugins" target="_blank" rel="noopener noreferrer">ChatGPT Plugins & Tools (chatgpt.com/plugins)</a>, click **"Add"** in the top right &rarr; select **"Add custom MCP server"** &rarr; choose **Tunnel** connection method &rarr; select the tunnel created above.

### Step 2: One-Click Service Launch

#### 🌟 Recommended Option: Run via `npx` (Zero-Config & No Clone Needed)
Run directly in any project folder without cloning the repository:
```bash
npx chatgpt-agent-bridge
```
> **✨ Zero-Config Automation & Interactive Wizard**:
> - **Dependency Auto-Detection & One-Click Install**: No need to manually install `tunnel-client` or `codex` upfront. The wizard checks for missing tools on first launch and offers to auto-install them via Homebrew with one press of Enter;
> - **Setup Wizard**: On first run, an interactive terminal wizard guides you through entering your `Tunnel ID` and `API Key`, saving them securely to `~/.config/chatgpt-agent-bridge/.env` (shared across projects, never re-prompted);
> - **Auto Profile Setup**: Automatically detects tools and sets up the `tunnel-client` Profile;
> - **Useful CLI Commands**:
>   ```bash
>   npx chatgpt-agent-bridge status       # Check status, credentials, and workspaces
>   npx chatgpt-agent-bridge --restart    # Smoothly restart the tunnel daemon
>   npx chatgpt-agent-bridge --port 8791  # Specify custom dashboard and bridge port
>   npx chatgpt-agent-bridge server       # Run directly in MCP Stdio protocol mode
>   ```

#### Source Development Option (Git Clone)
For local development and contributions:
```bash
git clone https://github.com/aicode915/chatgpt-agent-bridge.git
cd chatgpt-agent-bridge
./scripts/start-tunnel.sh
```
If `.env` or prerequisites are missing, the script automatically triggers the interactive setup wizard to install tools and configure the environment.
- Restart tunnel: `./scripts/start-tunnel.sh --restart`
- Local closed-loop loop test: `npm run test:local`

### Step 3: Drive Codex from ChatGPT
Open the built-in Web Dashboard in your browser: 👉 **http://127.0.0.1:8791**. In the "⚡ Prompt Assistant" tab, two usage options are available:

#### 🌟 Recommended Option (Universal & Free · Zero-Friction): Set as Custom Instructions
1. In ChatGPT, click your avatar / settings &rarr; **Personalization** &rarr; **Custom Instructions**;
2. In the second box **"How would you like ChatGPT to respond?"**, paste the driver prompt template below;
3. Enable and save. From now on, in **any standard conversation**, whenever you ask ChatGPT to perform coding tasks (e.g., *"Review tests in the current repo"*), ChatGPT will automatically invoke the MCP tools to drive local Codex — **no need to copy-paste prompts ever again** (works for both free and paid accounts)!

#### Temporary Single Session: Copy to Current Chat
Click **"Copy Driver Prompt"** in the Web Dashboard, and paste it directly into a fresh ChatGPT conversation.

---

### Environment Variables Reference

All settings can be declared in `.env`:

| Variable | Required | Default | Description |
|---|---|---|---|
| `CONTROL_PLANE_TUNNEL_ID` | **Yes** | - | OpenAI Platform Tunnel ID bound to your ChatGPT Connector |
| `CONTROL_PLANE_API_KEY` | **Yes** | - | OpenAI Platform Runtime API Key |
| `BRIDGE_PORT` | No | `8791` | Local virtual model bridge & Web Dashboard port |
| `WORKSPACE_ROOT` | No | Current repo directory | Default allowed workspace root for Codex (manageable via Web Dashboard) |
| `TURN_IDLE_TIMEOUT_SECS` | No | `60` | Per-turn idle timeout in seconds. Automatically triggers graceful auto-finalization to `finished` |
| `CODEX_BIN` | No | `codex` | Codex CLI executable path |
| `NO_PROXY` | No | `127.0.0.1,localhost` | Proxy bypass list |

---

### ChatGPT Driver Prompt Template

Send this prompt to your ChatGPT conversation (or copy it directly from the Web Dashboard's "⚡ Prompt Assistant"):
```text
You are the virtual "model" driving the local Codex CLI. Workflow:
1) When a local coding task is requested, invoke codex_start(prompt, cwd, mode):
   - Read-only analysis: mode="read-only"
   - Edit files / local tests / local commit: mode="workspace-write"
   - Outbound network needed (e.g. git push, installing remote packages): mode="danger-full-access"
2) Loop: invoke codex_poll(task_id, wait_secs≈25):
   - status=model_request: Follow the REPLY PROTOCOL in the returned text, answer via codex_reply(task_id, turn_id, reply);
     To execute actions, emit an exec JS item (e.g. await tools.exec_command({cmd:"ls"}));
     [CRITICAL CLOSING RULE]: When the goal is completed, NEVER stop without replying! Always call codex_reply(task_id, turn_id, 'message("Task completed summary")') so Codex exits cleanly (status=finished);
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

For comprehensive product roadmap and UX optimization proposals, please refer to the dedicated document: 👉 [**OPTIMIZATIONS.md**](./OPTIMIZATIONS.md).

Key roadmap directions:
- [x] **Zero-Friction Prompting**: Dedicated Custom GPT / Custom Instructions setup to eliminate prompt copy-pasting;
- [x] **Streamlined CLI Packaging**: Distribute via npm (`npx chatgpt-agent-bridge`) with an interactive setup wizard;
- [x] **Web Dashboard Diff Viewer**: Real-time visual Git Diff rendering after coding tasks finish;
- [x] **Real-time MCP Progress Notifications**: Stream sub-command status back to ChatGPT UI via `notifications/progress`;
- [ ] **Controlled Network Allowlist**: Allow outbound traffic to trusted domains (e.g. `github.com`) while preserving sandbox boundaries;
- [ ] **Multi-turn Error Self-Healing & Concurrency Isolation**: Enhanced prompt diagnostics and per-task isolated workspaces.

---

## Health Check

The MCP server itself communicates over stdio. The embedded model bridge exposes a local debug endpoint at `http://127.0.0.1:<BRIDGE_PORT>/healthz`; the `tunnel-client` admin surface is at `http://127.0.0.1:8080` (`tunnel-client health --url http://127.0.0.1:8080`). Validate end-to-end connectivity through the Secure MCP Tunnel and an actual MCP tool call.
