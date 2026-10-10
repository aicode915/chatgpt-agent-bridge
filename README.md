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

## Prerequisites & Version Requirements / 环境与依赖要求

| 组件 / 依赖 | 最低版本要求 | 说明 |
|---|---|---|
| **Node.js** | `>= 18.0.0` (推荐 20+) | 服务端运行时，依赖 ES Modules 与 Top-level await |
| **npm** | `>= 9.0.0` | Node 依赖包管理器 |
| **Codex CLI** | `>= 0.161.0` | **必需**。Codex 0.161 起彻底移除了旧版 `wire_api = "chat"`，本项目完全基于 Responses API wire format 实现，低版本无法握手 |
| **tunnel-client** | `>= 0.0.16` | OpenAI 官方 Secure MCP Tunnel 客户端 |
| **操作系统** | macOS / Linux | macOS 下 Codex CLI 默认启用 Apple Seatbelt 沙箱保护 |
| **OpenAI 平台凭证** | - | 需要 ChatGPT 账号（支持 Connectors 自定义连接器）以及 OpenAI Platform 组织下的 Tunnel 访问凭证 (`CONTROL_PLANE_TUNNEL_ID` & `CONTROL_PLANE_API_KEY`) |

## Tools

- `codex_start` / `codex_poll` / `codex_reply` / `codex_cancel` / `codex_list` — the only tools exposed; the quota-free Codex flow driven by the ChatGPT conversation.

The bridge exposes no direct file/command tools: every operation happens inside the codex subprocess (`codex_start`), confined to the requested project-relative `cwd` (checked against `WORKSPACE_ROOT`) and executed in codex's sandbox modes:
- `read-only` (default): Read-only filesystem, completely no network access.
- `workspace-write`: Allows modifying workspace files and local git operations (`git add` / `git commit`), but outbound network is disabled by the Seatbelt sandbox.
- `danger-full-access`: Full disk access and **full outbound network access** enabled (required for `git push`, installing remote packages, etc.).

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

## Web 控制台 (Web Dashboard)

服务启动后，内置的 Web 控制台可直接在浏览器访问：
👉 **http://127.0.0.1:8791**（端口可通过环境变量 `BRIDGE_PORT` 配置，默认 8791；单进程内嵌，零额外依赖与端口开销）

控制台包含五大核心功能：
1. **📋 任务与会话监控**：实时查看 Codex 会话状态（运行中/成功/失败）、多轮交互历史（ChatGPT 的 JS/回复与 Codex 工具输出）、实时 stdout/stderr 日志流，以及一键终止任务。
2. **🛡️ 服务端安全锁 (Security Policy Lock)**：在页面上可视化配置允许的最高权限等级（`read-only`、`workspace-write` 或 `danger-full-access`）。**服务端实施强制策略校验**：若 ChatGPT 在对话中申请超出限制的模式，服务端将直接拦截，保障本地安全。
3. **📁 项目目录管理**：查看并添加允许访问的工作区白名单路径（多项目支持），防止路径逃逸；可一键切换默认工作目录。
4. **⚡ 驱动提示词助手**：根据当前选中的工作区和安全锁权限，自动生成最优的 ChatGPT 驱动 Prompt，并提供一键复制。
5. **🔌 隧道与系统看板**：检测 Secure MCP Tunnel 连通性、查看 Codex CLI 及环境状态，支持一键重启隧道。

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
   - 只读分析：mode="read-only"
   - 修改文件/本地测试/本地 commit：mode="workspace-write"
   - 需连外网（如 git push、安装远程包）：mode="danger-full-access"
2) 循环：调用 codex_poll(task_id, wait_secs≈25)：
   - status=model_request：按返回文本里的 REPLY PROTOCOL，用 codex_reply(task_id, turn_id, reply) 作答；
     要执行动作就发 exec 的 JS（如 await tools.exec_command({cmd:"ls"})），目标完成就发最终 message；
   - status=waiting：稍后再次 poll；
   - status=finished/failed/cancelled：停止循环，把最终输出整理给用户。
每步约 2 次工具调用，任务尽量切小；涉及写文件必须指定 mode=workspace-write 或 danger-full-access。
```

### 沙箱机制与代码提交（Git Commit & Push）

在通过 ChatGPT 对话修改代码后，如果尝试提交代码（尤其是 `git push`）失败，原因与解决方案如下：

#### 为什么默认无法执行 `git push`？
Codex CLI 在 macOS 上通过 Apple Seatbelt 沙箱进行进程级别隔离。在默认的 `workspace-write` 模式下：
- **允许写入**：当前工作区目录（`cwd`）及其文件，包括本地 `.git/` 版本库（因此 `git add` 和 `git commit` 本地操作是允许的）。
- **禁止网络（Network Disabled）**：系统底层拦截一切出站网络 Socket 连接。因此任何联网操作（如 `git push`、`git fetch`、`curl`、`npm install`）都会被内核拒绝（报错如 `Could not resolve host: github.com` 或 `Operation not permitted`）。

#### 两种推荐操作方案

1. **方案一（安全最佳实践·推荐）：本地 Commit + 宿主终端 Push**
   - 让 ChatGPT 在 `workspace-write` 沙箱内安全地修改文件、运行测试，并执行本地提交：
     ```javascript
     const r = await tools.exec_command({
       cmd: 'git add . && git commit -m "feat: your commit message"'
     });
     text(JSON.stringify(r));
     ```
   - 本地提交完成后，由开发者在宿主终端核对提交并执行 `git push`。这种方式避免了向 AI 开放外网权限，最为安全可控。

2. **方案二（全自动流水线）：使用 `danger-full-access` 模式直接 Push**
   - 如果确定需要让 ChatGPT 自动将代码推送到远程仓库（GitHub/GitLab），在启动任务时显式指定：
     `codex_start(..., mode="danger-full-access")`
   - 在该模式下，Codex 拥有完整的外部网络与磁盘权限，可以直接执行 `git push`。
   - **注意前提**：
     - 本机已配置免密 Git 认证（如 SSH Agent 免密密钥、或 GitHub CLI `gh auth setup-git` 凭据助手）。非交互式子进程无法等待手动输入密码。
     - 本机 Git 已配置好身份标识：`git config --global user.name "Your Name"` 和 `git config --global user.email "you@example.com"`（若未配置，即使本地 commit 也会被 Git 自身拒绝）。

### 排障速查

| 症状 | 处理 |
|---|---|
| `Tunnel-client has not been seen for 300 seconds` | 连接器隧道 ≠ profile `tunnel_id`；用 `admin tunnels get` 核对后改 profile 并重启隧道 |
| 工具清单出现 `echo/server_info/uppercase`，或缺新工具 | ChatGPT 对连接器工具清单做快照：**删除并重建连接器**，再**新开对话** |
| 调工具报 `-32602 Tool not found` | 同上（它在调缓存里的旧工具名） |
| 健康检查 | `tunnel-client health --url http://127.0.0.1:8080` → Healthz/Readyz PASS |
| 确认指令到达本机 | 隧道日志出现 `dispatcher forwarded command ...`；服务日志出现 `[bridge] task ...` |
| 端口冲突 | 设 `BRIDGE_PORT`（默认 8791）后重启隧道 |
| `git push` 报网络不可达 / `Could not resolve host` | 属于正常沙箱防护；改用本地 commit + 宿主 push，或在 `codex_start` 中传入 `mode="danger-full-access"` |

服务日志关键点：`[bridge] task ... spawned codex`（任务启动）→ `model request #N received`（codex 请求模型）
→ `turn ... answered -> message(...)`（ChatGPT 作答已回填）→ `codex closed (code=0) -> finished`（任务完成）。

**实时观察**：在 VS Code 的 `tunnel-client` 终端里可以实时看到每一步日志；插件会把 codex 的输出流
（`codex stdout/stderr:` 行）和每次工具执行的输出（`tool output N (...)`）实时打到该终端（均做了截断）。

## 后续优化与路线图（Roadmap）

为了未来开源发布和更广泛的社区使用，本项目计划推进以下演进方向：

- [ ] **受控网络白名单**：探索在保持沙箱隔离的前提下，通过代理或规则仅放行代码仓库域名（如 `github.com`）的出站访问，无需切换至全量 `danger-full-access`。
- [ ] **多轮执行自愈与错误恢复**：优化 `renderTurn` 中的提示工程，当 ChatGPT 编写的 JS 出现语法错误或工具超时时，注入更具针对性的诊断与重试指引。
- [ ] **并发任务隔离与生命周期管理**：增强多任务同时运行时的端口复用、隔离工作空间和资源配额（内存/CPU/执行时长）。
- [ ] **实时进度上报（MCP Progress Notifications）**：利用标准 MCP `notifications/progress` 机制，将 Codex 正在执行的实时子命令状态和日志推送到 ChatGPT 界面。
- [ ] **自动化测试与 CI/CD**：构建模拟 Responses API SSE 流的单元测试套件，接入 GitHub Actions 自动化验证。

## Health check

The MCP server itself uses stdio. The embedded model bridge (quota-free codex flow) exposes a local-only debug endpoint at `http://127.0.0.1:<BRIDGE_PORT>/healthz`; the tunnel-client admin surface is at `http://127.0.0.1:8080` (`tunnel-client health --url http://127.0.0.1:8080`). Validate the MCP side through the Secure MCP Tunnel and an actual MCP tool call.
