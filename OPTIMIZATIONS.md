# 优化方向与演进规划 (Optimizations & Roadmap)

本文档汇总了 `chatgpt-agent-bridge` 的产品体验优化方案与底层架构技术路线图。

---

## 目录
- [一、 用户体验与产品形态优化（UX & Packaging）](#一-用户体验与产品形态优化ux--packaging)
  - [1. 消除重复复制提示词的摩擦（Custom GPT / 自定义指令）](#1-消除重复复制提示词的摩擦custom-gpt--自定义指令)
  - [2. CLI 极简分发（npm / npx 与交互式配置向导）](#2-cli-极简分发npm--npx-与交互式配置向导)
  - [3. 后台常驻与轻量桌面体验（Daemon / 菜单栏小工具）](#3-后台常驻与轻量桌面体验daemon--菜单栏小工具)
  - [4. Web 控制台能力增强（Git Diff 可视化）](#4-web-控制台能力增强git-diff-可视化)
- [二、 架构与核心能力演进（Architecture & Features）](#二-架构与核心能力演进architecture--features)
  - [5. 受控网络白名单（细粒度沙箱网络）](#5-受控网络白名单细粒度沙箱网络)
  - [6. 多轮交互自愈与智能诊断](#6-多轮交互自愈与智能诊断)
  - [7. 并发任务隔离与资源配额管理](#7-并发任务隔离与资源配额管理)
  - [8. 实时进度上报（MCP Progress Notifications）](#8-实时进度上报mcp-progress-notifications)
  - [9. 自动化集成测试与 CI/CD 流水线](#9-自动化集成测试与-cicd-流水线)
- [三、 实施优先级推荐矩阵](#三-实施优先级推荐矩阵)

---

## 一、 用户体验与产品形态优化（UX & Packaging）

### 1. 消除重复复制提示词的摩擦（ChatGPT 自定义指令）
- **现状痛点**：目前每次在新 ChatGPT 会话中唤起 Codex，开发者都必须手动复制长篇 Driver Prompt。
- **优化方案**：
  - **ChatGPT 自定义指令 (Custom Instructions) - 全员通用 / 零门槛**：
    - 路径：`设置 -> 个性化 (Personalization) -> 自定义指令 (Custom Instructions)`。
    - 在“你希望 ChatGPT 如何响应”中填入驱动协议，免费与付费账号均支持。
    - 配置一次即可在所有对话中自动全局生效，用户只要对 ChatGPT 说“*帮我重构代码*”，AI 即自动调用工具驱动本机 Codex，彻底免去每次复制。

### 2. CLI 极简分发（npm / npx 与交互式配置向导）
- **现状痛点**：过去需要手动执行 `git clone`、`npm install`、`cp .env.example .env` 并编辑配置。
- **优化方案与进展**：
  - [x] **交互式首次配置向导 (Interactive Setup Wizard) - ✅ 已完成**：
    - 在运行 `./scripts/start-tunnel.sh` 时，若检测到缺少 `.env` 或缺少凭证，终端自动进入交互式配置向导，提示输入 `OpenAI Tunnel ID` 和 `API Key` 并自动生成 `.env`；
    - 自动检测本机是否安装了 `codex`、`tunnel-client` 及 `node`，若缺失则打印对应安装命令；
    - 自动完成环境校验、`npm install` 依赖安装、`npm run build` 自动编译及 Profile 初始化，一键拉起服务。
  - [x] **发布至 npm 社区 / 支持 `npx` 极简启动 - ✅ 已完成**：
    - 将项目打包并配置 npm bin 命令行入口，支持 `npx chatgpt-agent-bridge` 免 clone 直接运行；
    - 内置完善的 CLI 命令与选项（`status` 查看运行状态、`server` 直接运行 MCP 服务、`init` 重新向导配置、`--restart` 平滑重启隧道）；
    - 全局持久化配置支持：自动从当前目录或 `~/.config/chatgpt-agent-bridge/` 查找/保存凭证与工作区白名单，跨项目无缝漫游；
    - 自动管理 `tunnel-client` profile 映射，自动检测依赖缺失并给出友好指引；
    - 本地脚本 `./scripts/start-tunnel.sh` 无缝委托至 CLI 核心，统一维护逻辑。

### 3. 后台常驻与轻量桌面体验（Daemon / 菜单栏小工具）
- **现状痛点**：隧道运行在前台终端窗口中，开发者关闭或误触终端窗口可能导致正在执行的任务中断。
- **优化方案**：
  - **脚本支持后台守护模式**：`./scripts/start-tunnel.sh --daemon`，支持无终端静默运行与日志自动轮转。
  - **macOS 状态栏/托盘小工具 (Menu Bar / Tray App)**：
    - 借助轻量级框架（如 Tauri）构建 macOS 状态栏图标；
    - 实时呈现连接状态（绿点：运行中 / 灰点：已断开）；
    - 快捷菜单支持一键打开 Web 控制台、一键重启隧道、一键复制提示词。

### 4. Web 控制台能力增强（Git Diff 可视化）
- **现状痛点**：用户在 ChatGPT 中命令修改了代码后，只能通过终端运行 `git diff` 查看文件变更。
- **优化方案**：
  - 在 Web 控制台（`http://127.0.0.1:8791`）的任务详情中集成轻量 Monaco Editor 或 Diff2Html；
  - 任务完成后自动拉取 `git diff`，高亮显示本次会话具体修改了哪些文件和代码行，提升安全感与复核效率。

---

## 二、 架构与核心能力演进（Architecture & Features）

### 5. 受控网络白名单（细粒度沙箱网络）
- **目标**：在保持沙箱隔离的前提下，允许受信任的出站访问，无需切换至全量 `danger-full-access`。
- **方案探索**：
  - 探索在 macOS Seatbelt 沙箱规则中注入特定 IP/域名规则，或配置本地轻量级反向代理；
  - 默认仅放行代码托管域名（如 `github.com`、`gitlab.com`）与主流包管理器源，拦截未受信任的任意公网 Socket。

### 6. 多轮交互自愈与智能诊断
- **目标**：提升 ChatGPT 编写执行脚本时的容错率。
- **优化方案**：
  - 增强 `renderTurn` 提示词中的错误反馈结构：当 ChatGPT 生成的 JS 代码发生语法错误或工具超时时，提供精准的上下文诊断和修正建议，而不是让 Codex 陷入连续报错。

### 7. 并发任务隔离与资源配额管理
- **目标**：支持多任务并行或多人共享同一台开发机。
- **优化方案**：
  - 为不同的 `task_id` 分配完全隔离的临时目录与工作区锁；
  - 增加资源配额限制（最大执行时长、内存消耗上限、子进程 CPU 阈值），防止死循环脚本耗尽系统资源。

### 8. 实时进度上报（MCP Progress Notifications）
- **目标**：让 ChatGPT 界面能够感知本地长时间任务的实时进度。
- **优化方案**：
  - 利用标准 MCP 规范中的 `notifications/progress` 机制；
  - 将 Codex 正在执行的实时命令（如 `npm test`、`git diff`）及流式标准输出进度实时推送到 ChatGPT 前端界面。

### 9. 自动化集成测试与 CI/CD 流水线
- **目标**：保障代码健壮性与后续迭代质量。
- **优化方案**：
  - 构建基于 Responses API SSE 流的完整端到端模拟测试套件；
  - 接入 GitHub Actions 流水线，在 PR 提交时自动执行 `typecheck`、`lint` 以及离线驱动回归测试。

---

## 三、 实施优先级推荐矩阵

| 阶段 | 事项 | 类型 | 预计成本 | 当前状态 / 进展 |
|:---:|---|:---:|:---:|:---:|
| **近期 (P0)** | 完善文档指引（ChatGPT 全局自定义指令配置流程） | 用户体验 | 极低 | ✅ **已完成**（文档与控制台全面落地，免去重复复制） |
| **近期 (P1)** | 交互式命令行配置向导 (Setup Wizard) | 易用性 | 低 | ✅ **已完成**（start-tunnel.sh 交互式问答自动生成 .env） |
| **中期 (P2)** | 发布 npm 包支持 `npx` 启动 | 分发部署 | 中 | ✅ **已完成**（支持免 clone 一键 npx 启动与 CLI 状态管理） |
| **中期 (P3)** | Web 控制台 Git Diff 可视化 | 监控体验 | 中 | ✅ **已完成**（任务详情内置文件变更统计、Diff 语法高亮与 codex_diff 工具） |
| **远期 (P4)** | MCP Progress 实时进度通知 | 协议功能 | 中 | ✅ **已完成**（全流程 notifications/progress 上报与动态活动摘要） |
| **远期 (P5)** | 受控网络白名单与沙箱进阶 | 安全能力 | 高 | 📋 规划中（安全与易用的最佳平衡） |
