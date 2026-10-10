# ChatGPT Agent Bridge

[English](README.md) | **简体中文**

一个极简轻量的本地 MCP 服务器，用于 **ChatGPT → OpenAI Secure MCP Tunnel → 本地开发机**。

本项目**自身不直接执行任何文件或系统命令**——所有操作均由本地安装的 **Codex CLI** 执行，并通过本插件作为“零额度虚拟模型”，由网页端/客户端的 ChatGPT 对话充当模型进行驱动：

- `codex_start` 启动本地 `codex exec` 进程，并通过每个进程独立的模型提供商参数重定向（`-c model_provider=bridge`），将 Codex 的模型请求打到本插件内置的本地端点。
- 每次模型请求均交由 ChatGPT 对话本身处理（`codex_poll`），ChatGPT 充当模型角色生成回复（`codex_reply`）。
- Codex 运行期间**完全不调用 OpenAI 官方的模型 API**，直接使用您的 ChatGPT 订阅驱动，消耗零 API Token 额度。

---

## 架构设计

```text
ChatGPT 对话
→ OpenAI Secure MCP Tunnel
→ 本 MCP 服务器 (stdio 传输; 本身不暴露直接执行命令工具，全部操作在 codex 沙箱中进行)
   └─ 零额度 Codex 驱动流:
        codex_start → 本地 `codex exec` (单进程覆盖 -c model_provider=bridge; ~/.codex/config.toml 保持未修改)
        codex 模型请求 → http://127.0.0.1:<BRIDGE_PORT>/t/<task_id>/v1/responses (Responses API SSE)
        codex_poll → 将上下文与工具定义交给 ChatGPT 对话
        codex_reply → ChatGPT 作为模型进行作答 (message / exec JS / function_call / reasoning)
        … 持续循环直到 codex 退出; 随后 codex_poll 返回最终结果
```

**通信协议说明**：Codex $\ge$ 0.161 强制要求 **OpenAI Responses API** 协议格式（上游已完全废弃旧版 `wire_api = "chat"`）。本项目实现了 Codex 所需的最小 SSE 事件流契约（`response.created` $\to$ `response.output_item.added` $\to$ `response.output_text.delta` $\to$ `response.output_item.done` $\to$ `response.completed`）。

---

## 环境与依赖要求

| 组件 / 依赖 | 最低版本要求 | 说明 |
|---|---|---|
| **Node.js** | `>= 18.0.0` (推荐 20+) | 服务端运行时，依赖 ES Modules 与 Top-level await |
| **npm** | `>= 9.0.0` | Node 依赖包管理器 |
| **Codex CLI** | `>= 0.161.0` | **必需**。Codex 0.161 起彻底移除了旧版 `wire_api = "chat"`，本项目完全基于 Responses API wire format 实现。安装：`brew install codex` 或访问 [OpenAI Codex](https://github.com/openai/codex) |
| **tunnel-client** | `>= 0.0.16` | **必需**。OpenAI 官方 Secure MCP Tunnel 客户端。安装：`brew install tunnel-client` 或从 OpenAI 平台下载 |
| **操作系统** | macOS / Linux | macOS 下 Codex CLI 默认启用 Apple Seatbelt 沙箱保护 |
| **OpenAI 平台凭证** | - | 需要 ChatGPT 账号（支持 Connectors 自定义连接器）以及 OpenAI Platform 组织下的 Tunnel 访问凭证 (`CONTROL_PLANE_TUNNEL_ID` & `CONTROL_PLANE_API_KEY`) |

---

## 工具列表 (Tools)

本服务仅对外暴露 5 个用于驱动 Codex 闭环的核心 MCP 工具：

- `codex_start`：启动一个 Codex CLI 任务，支持指定初始 Prompt、工作目录（`cwd`）、超时时间及权限模式（`mode`）。
- `codex_poll`：轮询获取 Codex 发起的待作答模型请求（上下文 + 工具定义），或等待任务结束获取最终 stdout/stderr。
- `codex_reply`：ChatGPT 作为模型提交回答（支持文本消息、执行 JS 编排、函数调用、思维链推理等）。
- `codex_cancel`：终止正在执行的 Codex 任务。
- `codex_list`：列出当前内存中跟踪的任务状态与未完成轮次。

### 权限与沙箱模式 (Mode)
所有操作均在受限的 Codex 沙箱中运行：
- `read-only`（只读）：只读访问文件系统，**完全禁止网络**。
- `workspace-write`（工作区修改·默认推荐）：允许修改当前工作区文件及本地 git commit，但**受 Seatbelt 沙箱保护禁止外部网络**。
- `danger-full-access`（全权限与联网）：允许完整磁盘读写并**开放完整外网访问**（支持 `git push`、下载远程依赖等）。

---

## Web 控制台 (Web Dashboard)

服务启动后，内置的 Web 控制台可直接在浏览器访问：
👉 **http://127.0.0.1:8791**（端口可通过环境变量 `BRIDGE_PORT` 配置，默认 8791；单进程内嵌，零额外依赖与端口开销）

控制台包含五大核心功能：
1. **📋 会话与任务监控**：实时查看 Codex 会话状态（运行中/成功/失败/超时废弃）、多轮交互历史（ChatGPT 的 JS/回复与 Codex 工具输出）、**基于 SSE (Server-Sent Events) 的终端级实时日志流推送**（支持自动滚动、清屏、一键复制），以及一键终止任务。
2. **🛡️ 服务端安全锁 (Security Policy Lock)**：在页面上可视化配置允许的最高权限等级（`read-only`、`workspace-write` 或 `danger-full-access`）。**服务端实施强制策略校验**：若 ChatGPT 在对话中申请超出限制的模式，服务端将直接拦截，保障本地安全。
3. **📁 项目目录管理**：查看并添加允许访问的工作区白名单路径（多项目支持），防止路径逃逸；可一键切换默认工作目录。
4. **⚡ 驱动提示词助手**：根据当前选中的工作区和安全锁权限，自动生成最优的 ChatGPT 驱动 Prompt，并提供一键复制。
5. **🔌 隧道与系统看板**：检测 Secure MCP Tunnel 连通性、查看 Codex CLI 及环境状态，支持一键重启隧道。

---

## 孤儿任务自愈与空闲超时机制 (Orphan Task Self-Healing)

在实际对话中，如果 ChatGPT 已经回答了用户的问题，或者用户关闭了会话，ChatGPT 可能会停止继续轮询并放弃作答待决的轮次请求（Pending Turn）。为防止本地 Codex 子进程无休止挂起占用 CPU/内存：
- **空闲超时检测**：当 Codex 发起轮次请求后，若客户端超过 60 秒（可通过环境变量 `TURN_IDLE_TIMEOUT_SECS` 自定义）未轮询或未提交 `codex_reply`，Bridge 将自动触发空闲超时机制。
- **智能优雅收尾 (Auto-Finalize)**：若该任务此前已有成功的交互轮次（说明 ChatGPT 已经执行了工具并达成目标，只是未在聊天最后发送结束消息），Bridge 会自动回填一条完成消息，使 Codex 正常输出并以 exit code 0 退出（状态流转为 `finished`），避免显示为误报的废弃状态。
- **孤儿任务回收**：若为首轮请求且客户端从未作答（例如客户端异常崩溃或直接丢弃），则发送终止信号（`SIGTERM` $\to$ `SIGKILL`）并将任务标记为 `abandoned`，防止悬挂子进程占用系统资源。
- **实时事件推送**：控制台与 SSE 流会实时收到状态变更事件并立即更新状态徽标，释放系统资源。

---

## 使用指南

### 1. 一次性配置

1. **密钥与隧道 ID**：写进项目根目录的 `.env`（已在 `.gitignore`，不会被提交；可参考 `.env.example`）：
   ```bash
   CONTROL_PLANE_API_KEY=sk-...
   CONTROL_PLANE_TUNNEL_ID=tunnel_xxx   # ChatGPT 连接器绑定的那条隧道 ID
   ```
   `CONTROL_PLANE_TUNNEL_ID` 是 tunnel-client 的官方环境变量，**优先级高于 profile YAML**——改 `.env` 即生效，无需修改 profile 配置文件。
2. **隧道一致性核对**：
   `.env` 的 `CONTROL_PLANE_TUNNEL_ID` 必须与 ChatGPT 连接器绑定的隧道一致（不一致会报 *"Tunnel-client has not been seen for 300 seconds"*）。
   核对方式：
   ```bash
   set -a && source .env && set +a
   tunnel-client admin tunnels get <tunnel_id> --json
   ```
   若需重新生成 profile 可参考：
   ```bash
   tunnel-client init \
     --sample sample_mcp_stdio_local \
     --profile chatgpt-agent-bridge \
     --tunnel-id tunnel_YOUR_ID \
     --mcp-command "env WORKSPACE_ROOT=/path/to/your/project node /path/to/chatgpt-agent-bridge/dist/server.js"
   ```
3. **ChatGPT 连接器**：ChatGPT 设置 → 连接器 → 新建自定义连接器 → 连接方式选 **Tunnel** → 选择对应的隧道。

### 2. 日常启动与使用

启动隧道（一键脚本：自动读取 `.env` 并启动，前台运行，Ctrl+C 停止）：
```bash
cd /path/to/chatgpt-agent-bridge
./scripts/start-tunnel.sh            # 启动；若已在运行则仅提示（不打扰进行中的任务）
./scripts/start-tunnel.sh --restart  # 重启隧道（注意：会中断进行中的任务）
```
*(注：修改 `src/` 代码后需先运行 `npm run build` 再重启隧道)*

本地闭环测试（无需 ChatGPT，由脚本扮演虚拟模型驱动真实 Codex）：
```bash
npm run test:local
```

### 3. ChatGPT 驱动提示词

在 ChatGPT 对话中驱动 Codex（零额度），把下面这段作为驱动提示词发给对话（或直接在 Web 控制台的“⚡ 提示词助手”中一键复制）：
```text
你是驱动本机 Codex 的“模型”。流程：
1) 需要执行本机编码任务时调用 codex_start(prompt, cwd, mode)（mode 默认以 Web 控制台配置为准）。
   - 只读分析：mode="read-only"
   - 修改文件/本地测试/本地 commit：mode="workspace-write"
   - 需连外网（如 git push、安装远程包）：mode="danger-full-access"
2) 循环：调用 codex_poll(task_id, wait_secs≈25)：
   - status=model_request：按返回文本里的 REPLY PROTOCOL，用 codex_reply(task_id, turn_id, reply) 作答；
     要执行动作就发 exec 的 JS（如 await tools.exec_command({cmd:"ls"})）；
     【关键收尾】：目标达成后切勿直接在聊天中停止！必须最后调用一次 codex_reply(task_id, turn_id, 'message("任务完成总结")')，使 Codex 正常结束（status=finished）；
   - status=waiting：稍后再次 poll；
   - status=finished/failed/cancelled：停止循环，把最终输出整理给用户。
每步约 2 次工具调用，任务尽量切小；涉及写文件必须指定 mode=workspace-write 或 danger-full-access。
```

---

## 沙箱机制与代码提交（Git Commit & Push）

在通过 ChatGPT 对话修改代码后，如果尝试提交代码（尤其是 `git push`）失败，原因与解决方案如下：

### 为什么默认无法执行 `git push`？
Codex CLI 在 macOS 上通过 Apple Seatbelt 沙箱进行进程级别隔离。在默认的 `workspace-write` 模式下：
- **允许写入**：当前工作区目录（`cwd`）及其文件，包括本地 `.git/` 版本库（因此 `git add` 和 `git commit` 本地操作是允许的）。
- **禁止网络（Network Disabled）**：系统底层拦截一切出站网络 Socket 连接。因此任何联网操作（如 `git push`、`git fetch`、`curl`、`npm install`）都会被内核拒绝（报错如 `Could not resolve host: github.com` 或 `Operation not permitted`）。

### 两种推荐操作方案

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
   - 在 Web 控制台将权限安全锁切换为 `danger-full-access`，服务端会自动以全权限连网模式运行任务（或在 `codex_start` 显式指定 `mode="danger-full-access"`）。
   - 在该模式下，Codex 拥有完整的外部网络与磁盘权限，可以直接执行 `git push`。
   - **注意前提**：
     - 本机已配置免密 Git 认证（如 SSH Agent 免密密钥、或 GitHub CLI `gh auth setup-git` 凭据助手）。非交互式子进程无法等待手动输入密码。
     - 本机 Git 已配置好身份标识：`git config --global user.name "Your Name"` 和 `git config --global user.email "you@example.com"`（若未配置，即使本地 commit 也会被 Git 自身拒绝）。

---

## 排障速查

| 症状 | 处理方式 |
|---|---|
| `Tunnel-client has not been seen for 300 seconds` | 连接器绑定的隧道 ID 与 profile 或 `.env` 的 `CONTROL_PLANE_TUNNEL_ID` 不一致；核对后重启隧道 |
| 工具清单出现 `echo/server_info/uppercase` 或缺少新工具 | ChatGPT 对连接器工具清单做快照缓存：**删除并重建连接器**，再**新开对话** |
| 调用工具报错 `-32602 Tool not found` | 同上（ChatGPT 在调用缓存里的旧工具名） |
| 健康检查 | 运行 `tunnel-client health --url http://127.0.0.1:8080` → 确认 Healthz/Readyz 为 PASS |
| 确认指令是否到达本机 | 观察隧道日志是否出现 `dispatcher forwarded command ...`；服务日志出现 `[bridge] task ...` |
| 端口冲突 | 设置环境变量 `BRIDGE_PORT`（如 8792）后重启隧道 |
| `git push` 报网络不可达 / `Could not resolve host` | 属于正常沙箱防护；改用本地 commit + 宿主 push，或在 Web 控制台设置 `danger-full-access` |

**服务日志关键点**：`[bridge] task ... spawned codex`（任务启动）$\to$ `model request #N received`（codex 请求模型）$\to$ `turn ... answered -> message(...)`（ChatGPT 作答已回填）$\to$ `codex closed (code=0) -> finished`（任务完成）。

**实时观察**：在运行 `start-tunnel.sh` 的终端或 Web 控制台的“📋 任务监控”中，可以实时看到每一步交互日志、Codex 输出流（`codex stdout/stderr`）和工具执行结果。

---

## 后续优化与路线图（Roadmap）

为了未来开源发布和更广泛的社区使用，本项目计划推进以下演进方向：

- [ ] **受控网络白名单**：探索在保持沙箱隔离的前提下，通过代理或规则仅放行代码仓库域名（如 `github.com`）的出站访问，无需切换至全量 `danger-full-access`。
- [ ] **多轮执行自愈与错误恢复**：优化 `renderTurn` 中的提示工程，当 ChatGPT 编写的 JS 出现语法错误或工具超时时，注入更具针对性的诊断与重试指引。
- [ ] **并发任务隔离与生命周期管理**：增强多任务同时运行时的端口复用、隔离工作空间和资源配额（内存/CPU/执行时长）。
- [ ] **实时进度上报（MCP Progress Notifications）**：利用标准 MCP `notifications/progress` 机制，将 Codex 正在执行的实时子命令状态和日志推送到 ChatGPT 界面。
- [ ] **自动化测试与 CI/CD**：构建模拟 Responses API SSE 流的单元测试套件，接入 GitHub Actions 自动化验证。

---

## 健康检查 (Health Check)

MCP 服务器自身采用 stdio 传输。内嵌的虚拟模型网桥在 `http://127.0.0.1:<BRIDGE_PORT>/healthz` 暴露本地健康检查端点；`tunnel-client` 管理端点位于 `http://127.0.0.1:8080`（`tunnel-client health --url http://127.0.0.1:8080`）。可通过 Secure MCP Tunnel 实际调用工具来验证端到端链路。
