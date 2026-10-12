import { getVersion } from "./system.js";

/**
 * Embedded Web Dashboard HTML Generator
 * Standalone, zero external dependencies, responsive modern dark UI
 */

export function renderDashboardHtml(version = getVersion()): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatGPT Agent Bridge Dashboard (v${version})</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --card-border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --primary-hover: #0284c7;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --code-bg: #090d16;
      --radius: 10px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand h1 { font-size: 22px; font-weight: 700; color: #fff; }
    .brand span { font-size: 13px; color: var(--text-muted); }
    .status-badges { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .badge-version {
      display: inline-flex;
      align-items: center;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
      color: var(--primary);
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.35);
      line-height: 1.4;
      letter-spacing: 0.3px;
    }
    .badge-dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot-online { background-color: var(--success); box-shadow: 0 0 8px var(--success); }
    .dot-warning { background-color: var(--warning); box-shadow: 0 0 8px var(--warning); }
    .dot-danger { background-color: var(--danger); box-shadow: 0 0 8px var(--danger); }
    .dot-muted { background-color: var(--text-muted); box-shadow: none; }
    @keyframes pulse { 0% { opacity: 0.5; transform: scale(0.92); } 50% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0.5; transform: scale(0.92); } }
    .dot-pulse { animation: pulse 1.8s infinite ease-in-out; }
    
    /* Custom Sleek Scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.18);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.32);
    }

    .tabs {
      display: flex;
      gap: 6px;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 10px;
      flex-wrap: wrap;
    }
    .tab-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      padding: 6px 12px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .tab-btn:hover { color: var(--text); background: rgba(255, 255, 255, 0.05); }
    .tab-btn.active { color: #fff; background: var(--primary-hover); }

    .tab-pane { display: none; }
    .tab-pane.active { display: block; animation: fadeIn 0.2s ease-in-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 20px;
      margin-bottom: 20px;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .card-title { font-size: 16px; font-weight: 700; color: #fff; }
    
    .grid-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 16px;
    }
    .stat-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
    .stat-val { font-size: 20px; font-weight: 700; color: var(--primary); word-break: break-all; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }
    th { padding: 12px; background: rgba(0, 0, 0, 0.2); color: var(--text-muted); font-weight: 600; }
    td { padding: 12px; border-bottom: 1px solid var(--card-border); }
    tr:hover td { background: rgba(255, 255, 255, 0.02); }

    /* Buttons & Inputs */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-primary { background: var(--primary); color: #000; }
    .btn-primary:hover { background: var(--primary-hover); color: #fff; }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-danger:hover { background: #dc2626; }
    .btn-secondary { background: rgba(255, 255, 255, 0.1); color: #fff; }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.18); }
    .btn-sm { padding: 4px 8px; font-size: 12px; }

    input[type="text"], input[type="password"] {
      width: 100%;
      padding: 10px 14px;
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      color: var(--text);
      font-size: 14px;
      outline: none;
    }
    input[type="text"]:focus, input[type="password"]:focus { border-color: var(--primary); }

    /* Radio Cards */
    .radio-card-group { display: flex; flex-direction: column; gap: 12px; }
    .radio-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--card-border);
      padding: 16px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .radio-card:hover { border-color: var(--primary); }
    .radio-card.selected { border-color: var(--primary); background: rgba(56, 189, 248, 0.08); }
    .radio-card input { margin-top: 4px; }
    .radio-card-info h4 { font-size: 14px; margin-bottom: 4px; color: #fff; }
    .radio-card-info p { font-size: 12px; color: var(--text-muted); }

    /* Modal */
    .modal {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 999;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .modal.open { display: flex; }
    .modal-content {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      width: 100%;
      max-width: 900px;
      max-height: 85vh;
      overflow-y: auto;
      padding: 24px;
      position: relative;
    }
    .modal-close {
      position: absolute;
      top: 18px;
      right: 18px;
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 20px;
      cursor: pointer;
    }
    .terminal-view {
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 12px;
      font-family: Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      max-height: 280px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
      color: #38bdf8;
    }

    /* Diff View */
    .diff-container {
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 12px;
      font-family: Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      max-height: 350px;
      overflow-y: auto;
      white-space: pre;
      line-height: 1.45;
    }
    .diff-line { padding: 1px 4px; }
    .diff-line-add { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; }
    .diff-line-del { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }
    .diff-line-hunk { color: #93c5fd; background: rgba(59, 130, 246, 0.1); font-weight: 600; }
    .diff-line-meta { color: var(--text-muted); }
    .file-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.07);
    }
    .file-pill-mod { color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); }
    .file-pill-add { color: #34d399; border: 1px solid rgba(52, 211, 153, 0.3); }
    .file-pill-del { color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); }
    .file-pill-untracked { color: #a78bfa; border: 1px solid rgba(167, 139, 250, 0.3); }

    /* Toast */
    #toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 12px 20px;
      background: var(--success);
      color: #fff;
      font-weight: 600;
      font-size: 13px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.3s;
      z-index: 1000;
      pointer-events: none;
    }
    #toast.show { opacity: 1; transform: translateY(0); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <h1>ChatGPT Agent Bridge</h1>
            <span class="badge-version" id="hdr-version">v${version}</span>
          </div>
          <span data-i18n="brandSubtitle">虚拟模型端点与 Codex 调度控制台</span>
        </div>
      </div>
      <div class="status-badges">
        <div class="badge"><div class="badge-dot dot-online"></div><span data-i18n="hdrPort">Bridge Port</span>: <span id="hdr-port">8791</span></div>
        <div class="badge"><div class="badge-dot" id="dot-tunnel"></div><span data-i18n="hdrTunnel">Tunnel</span>: <span id="hdr-tunnel">检查中...</span></div>
        <div class="badge">🔒 <span data-i18n="hdrSecurity">安全锁</span>: <span id="hdr-security" style="color: var(--primary);">...</span></div>
        <button class="btn btn-secondary btn-sm" id="btn-lang-toggle" onclick="toggleLanguage()" style="font-weight: 600;">🌐 English</button>
        <button class="btn btn-secondary btn-sm" onclick="fetchStatus()" data-i18n="btnRefresh">刷新</button>
      </div>
    </header>

    <div class="grid-stats">
      <div class="stat-card">
        <div class="stat-label" data-i18n="statTasks">活跃会话 / 任务数</div>
        <div class="stat-val" id="stat-tasks">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label" data-i18n="statMode">允许最高模式</div>
        <div class="stat-val" id="stat-mode">--</div>
      </div>
      <div class="stat-card">
        <div class="stat-label" data-i18n="statWorkspace">默认工作目录</div>
        <div class="stat-val" id="stat-workspace" style="font-size: 14px;">--</div>
      </div>
      <div class="stat-card">
        <div class="stat-label" data-i18n="statTurns">累计交互轮次</div>
        <div class="stat-val" id="stat-turns">0</div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn active" data-tab="tasks" onclick="switchTab('tasks')" data-i18n="tabTasks">📋 会话与任务监控</button>
      <button class="tab-btn" data-tab="security" onclick="switchTab('security')" data-i18n="tabSecurity">🛡️ 安全策略与权限锁</button>
      <button class="tab-btn" data-tab="workspaces" onclick="switchTab('workspaces')" data-i18n="tabWorkspaces">📁 项目目录管理</button>
      <button class="tab-btn" data-tab="credentials" onclick="switchTab('credentials')" data-i18n="tabCredentials">🔑 凭证管理 (Credentials)</button>
      <button class="tab-btn" data-tab="prompt" onclick="switchTab('prompt')" data-i18n="tabPrompt">⚡ ChatGPT 提示词助手</button>
      <button class="tab-btn" data-tab="logs" onclick="switchTab('logs')" data-i18n="tabLogs">📜 系统运行日志 (System Logs)</button>
      <button class="tab-btn" data-tab="system" onclick="switchTab('system')" data-i18n="tabSystem">🔌 隧道与系统看板</button>
    </div>

    <!-- TAB 1: 会话与任务 -->
    <div id="tab-tasks" class="tab-pane active">
      <div class="card">
        <div class="card-header">
          <div class="card-title" data-i18n="tasksCardTitle">Codex 任务列表</div>
          <span style="font-size: 12px; color: var(--text-muted);" data-i18n="tasksAutoRefresh">自动每 2 秒静默更新</span>
        </div>
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th data-i18n="colTaskId">任务 ID</th>
                <th data-i18n="colStatus">状态</th>
                <th data-i18n="colMode">权限模式</th>
                <th data-i18n="colTurns">轮次</th>
                <th data-i18n="colCwd">目录</th>
                <th data-i18n="colCreatedAt">创建时间</th>
                <th data-i18n="colActions">操作</th>
              </tr>
            </thead>
            <tbody id="tasks-table-body">
              <tr><td colspan="7" style="text-align: center; color: var(--text-muted);" data-i18n="tasksEmpty">暂无运行任务</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 2: 安全策略与权限锁 -->
    <div id="tab-security" class="tab-pane">
      <div class="card">
        <div class="card-header">
          <div class="card-title" data-i18n="secTitle">服务端权限安全锁 (Security Policy Lock)</div>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;" data-i18n="secDesc">
          在此选择系统允许的最高运行模式。<strong>服务端会实施强制安全校验</strong>：如果 ChatGPT 在提示词中发起的任务模式超出了此处的上限，服务端将直接拦截并拒绝启动，保障本地环境不受未经允许的网络或文件写操作影响。
        </p>

        <div class="radio-card-group" id="security-radios">
          <label class="radio-card" id="card-read-only">
            <input type="radio" name="secMode" value="read-only">
            <div class="radio-card-info">
              <h4 data-i18n="secReadOnlyTitle">🟢 只读模式 (Read-Only)</h4>
              <p data-i18n="secReadOnlyDesc">禁止写文件、禁止执行外网网络请求。仅允许 Codex 搜索与阅读本地代码。</p>
            </div>
          </label>

          <label class="radio-card selected" id="card-workspace-write">
            <input type="radio" name="secMode" value="workspace-write" checked>
            <div class="radio-card-info">
              <h4 data-i18n="secWorkspaceWriteTitle">🟡 工作区修改 (Workspace-Write) - 推荐</h4>
              <p data-i18n="secWorkspaceWriteDesc">允许修改当前项目目录内的文件并执行本地 git commit，但底层 <strong>Seatbelt 沙箱严格阻断外网连接</strong>，防止数据外流。</p>
            </div>
          </label>

          <label class="radio-card" id="card-danger-full-access">
            <input type="radio" name="secMode" value="danger-full-access">
            <div class="radio-card-info">
              <h4 data-i18n="secFullAccessTitle">🔴 全权限与联网 (Danger-Full-Access)</h4>
              <p data-i18n="secFullAccessDesc">解除沙箱限制，开放完整外网访问与文件系统权限。<strong>支持自动 git push 到远程仓库及安装依赖</strong>。</p>
            </div>
          </label>
        </div>

        <div style="margin-top: 20px;">
          <button class="btn btn-primary" onclick="saveSecurityPolicy()" data-i18n="btnSaveSec">保存安全锁设置</button>
        </div>
      </div>
    </div>

    <!-- TAB 3: 项目工作区管理 -->
    <div id="tab-workspaces" class="tab-pane">
      <div class="card">
        <div class="card-header">
          <div class="card-title" data-i18n="wsTitle">允许访问的项目目录列表 (Workspaces White-list)</div>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;" data-i18n="wsDesc">
          Codex 执行任务的 <code>cwd</code> 路径必须属于以下白名单目录之一或其子目录，防止路径跨越逃逸。
        </p>
        <div style="margin-bottom: 20px; overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th data-i18n="wsColPath">目录绝对路径</th>
                <th data-i18n="wsColStatus">状态</th>
                <th data-i18n="wsColActions">操作</th>
              </tr>
            </thead>
            <tbody id="workspaces-table-body">
            </tbody>
          </table>
        </div>

        <div class="card-header" style="margin-top: 24px;">
          <div class="card-title" data-i18n="wsAddTitle">添加新项目目录</div>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;" data-i18n="wsAddDesc">
          可点击下方按钮直接调起系统文件管理器选择本地文件夹，或在输入框中粘贴绝对路径：
        </p>
        <div style="display: flex; gap: 10px; max-width: 650px; flex-wrap: wrap; align-items: center;">
          <button class="btn btn-primary" id="btn-pick-folder" onclick="pickDirectory()" style="display: inline-flex; align-items: center; gap: 6px;" data-i18n="btnPickFolder">
            📁 选择本地目录 (浏览)
          </button>
          <input type="text" id="new-workspace-input" placeholder="或手动粘贴绝对路径，例如 /Users/username/my-project" data-i18n-placeholder="inputWorkspacePlaceholder" style="flex: 1; min-width: 250px;">
          <button class="btn btn-secondary" onclick="addWorkspace()" data-i18n="btnAddWorkspace">手动添加</button>
        </div>
      </div>
    </div>

    <!-- TAB 4: 凭证管理 -->
    <div id="tab-credentials" class="tab-pane">
      <div class="card">
        <div class="card-header">
          <div class="card-title" data-i18n="credTitle">OpenAI 隧道与运行时凭证配置</div>
          <button class="btn btn-secondary btn-sm" onclick="fetchCredentials()" data-i18n="btnReloadCreds">重新加载</button>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;" data-i18n="credDesc">
          在此修改 OpenAI Secure MCP 隧道所需的 <strong>Tunnel ID</strong> 与 <strong>运行时 API Key</strong>。保存后将自动持久化至本地 <code>.env</code> 文件并重新同步 <code>tunnel-client</code> 本地配置。
        </p>

        <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid var(--card-border); border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px;">
          <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px; flex-wrap: wrap;">
            <span style="color: var(--text-muted);" data-i18n="credFileLabel">📄 当前凭证存储文件:</span>
            <code id="cred-file-path" style="color: var(--primary); font-weight: 600;">加载中...</code>
          </div>
          <div style="font-size: 12px; color: var(--text-muted);" data-i18n="credTip">
            💡 提示：若首次配置输错密钥，可在此直接修改并点击【保存并重启隧道】，无需进入命令行手动编辑文件。
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 16px; max-width: 680px;">
          <div>
            <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px;">
              <span data-i18n="labelTunnelId">OpenAI Tunnel ID (隧道 ID)</span> <span style="color: var(--danger);">*</span>
            </label>
            <input type="text" id="input-tunnel-id" placeholder="例如: tunnel_69b828dca80c819199d905a81" style="width: 100%;" />
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;" data-i18n="tipTunnelId">
              可在 <a href="https://platform.openai.com/settings/organization/tunnels" target="_blank" style="color: var(--primary); text-decoration: none;">OpenAI 平台 &gt; Organization Settings &gt; Tunnels</a> 创建或复制。
            </div>
          </div>

          <div>
            <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px;">
              <span data-i18n="labelApiKey">OpenAI Runtime API Key (运行时密钥)</span> <span style="color: var(--danger);">*</span>
            </label>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="password" id="input-api-key" placeholder="例如: sk-proj-..." style="flex: 1;" />
              <button class="btn btn-secondary" type="button" id="btn-toggle-key" onclick="toggleApiKeyVisibility()" style="white-space: nowrap;" data-i18n="btnShowKey">
                👁️ 显示
              </button>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;" data-i18n="tipApiKey">
              可在 <a href="https://platform.openai.com/settings/organization/api-keys" target="_blank" style="color: var(--primary); text-decoration: none;">OpenAI 平台 &gt; API Keys</a> 生成（需有 Model Responses 权限）。
            </div>
          </div>

          <div style="display: flex; gap: 12px; margin-top: 10px; flex-wrap: wrap;">
            <button class="btn btn-primary" id="btn-save-restart-creds" onclick="saveCredentials(true)" data-i18n="btnSaveRestart">
              💾 保存并重启隧道 (立即生效)
            </button>
            <button class="btn btn-secondary" id="btn-save-only-creds" onclick="saveCredentials(false)" data-i18n="btnSaveOnly">
              仅保存凭证
            </button>
          </div>

          <div id="cred-save-status" style="display: none; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-top: 8px;"></div>
        </div>
      </div>
    </div>

    <!-- TAB 5: 提示词助手 -->
    <div id="tab-prompt" class="tab-pane">
      <!-- 推荐用法：自定义指令 -->
      <div class="card" style="border-left: 4px solid var(--success);">
        <div class="card-header">
          <div class="card-title" data-i18n="promptRecTitle">🌟 推荐方案（彻底免去每次复制·全员通用）：配置为 ChatGPT 自定义指令</div>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 10px;" data-i18n="promptRecDesc">
          配置一次后，在<strong>任何普通 ChatGPT 对话</strong>中只要提到编码任务，ChatGPT 就会自动调用工具驱动本机 Codex，<strong>无需每次手动复制粘贴长文本提示词</strong>（免费与付费账号均支持）：
        </p>
        <ol style="font-size: 13px; color: var(--text-muted); padding-left: 20px; line-height: 1.8; margin-bottom: 0;">
          <li data-i18n="promptStep1">打开 ChatGPT 网页，点击左下角头像/设置 &rarr; 选择 <strong>Personalization (个性化)</strong> &rarr; <strong>Custom Instructions (自定义指令)</strong>；</li>
          <li data-i18n="promptStep2">在第二个输入框 <strong>“How would you like ChatGPT to respond? (你希望 ChatGPT 如何响应？)”</strong> 中，点击下方按钮复制并粘贴填入；</li>
          <li data-i18n="promptStep3">保存开启即可！</li>
        </ol>
      </div>

      <!-- 提示词预览与一键复制 -->
      <div class="card">
        <div class="card-header">
          <div class="card-title" data-i18n="promptCardTitle">ChatGPT 驱动系统提示词 (Driver Prompt)</div>
          <button class="btn btn-primary btn-sm" onclick="copyPrompt()" data-i18n="btnCopyPrompt">一键复制提示词</button>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;" data-i18n="promptDynDesc">
          已根据当前控制台配置的<strong>默认工作目录</strong>和<strong>安全锁最高权限</strong>动态生成：
        </p>
        <div class="terminal-view" id="prompt-preview" style="max-height: 320px; color: #a5f3fc;"></div>
      </div>
    </div>

    <!-- TAB 6: 系统运行日志 -->
    <div id="tab-logs" class="tab-pane">
      <div class="card">
        <div class="card-header" style="flex-wrap: wrap; gap: 12px;">
          <div>
            <div class="card-title" data-i18n="logsTitle">系统与服务运行日志</div>
            <span style="font-size: 12px; color: var(--text-muted);" data-i18n="logsSubtitle">实时捕获 Tunnel 隧道、Bridge 端点与 Codex 执行输出</span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <select id="log-level-filter" class="btn btn-secondary btn-sm" onchange="filterSystemLogs()" style="outline: none;">
              <option value="all" data-i18n="logLevelAll">全部级别 (All Levels)</option>
              <option value="info">INFO</option>
              <option value="warn">WARN</option>
              <option value="error">ERROR</option>
            </select>
            <select id="log-source-filter" class="btn btn-secondary btn-sm" onchange="filterSystemLogs()" style="outline: none;">
              <option value="all" data-i18n="logSourceAll">全部来源 (All Sources)</option>
              <option value="tunnel">TUNNEL</option>
              <option value="bridge">BRIDGE</option>
              <option value="codex">CODEX</option>
            </select>
            <label style="font-size: 12px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="log-auto-scroll" checked> <span data-i18n="logAutoScroll">自动滚动</span>
            </label>
            <button class="btn btn-secondary btn-sm" onclick="clearSystemLogs()" data-i18n="logClear">清屏</button>
            <button class="btn btn-secondary btn-sm" onclick="copySystemLogs()" data-i18n="logCopy">复制日志</button>
            <button class="btn btn-secondary btn-sm" onclick="fetchSystemLogs()" data-i18n="logRefresh">刷新</button>
          </div>
        </div>
        <div class="terminal-view" id="system-logs-container" style="height: 520px; max-height: 520px; font-size: 12px; line-height: 1.6; color: #cbd5e1; overflow-y: auto; background: var(--code-bg); padding: 14px; border-radius: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">
          <div style="color: var(--text-muted);" data-i18n="logLoading">正在连接实时日志流...</div>
        </div>
      </div>
    </div>

    <!-- TAB 7: 隧道与系统看板 -->
    <div id="tab-system" class="tab-pane">
      <div class="card">
        <div class="card-header">
          <div class="card-title" data-i18n="sysTunnelTitle">Secure MCP Tunnel 状态与管理</div>
          <button class="btn btn-secondary btn-sm" onclick="restartTunnel()" data-i18n="btnRestartTunnel">一键重启隧道</button>
        </div>
        <div style="display: flex; gap: 16px; margin-bottom: 16px; align-items: center;">
          <div><span data-i18n="sysTunnelHealthLabel">隧道健康状况:</span> <strong id="sys-tunnel-status">检查中...</strong></div>
          <button class="btn btn-secondary btn-sm" onclick="checkTunnelHealth()" data-i18n="btnCheckHealth">检测连通性</button>
        </div>
        <p style="font-size: 13px; color: var(--text-muted);" data-i18n="sysTunnelTip">
          隧道服务运行在本地 <code>http://127.0.0.1:8080</code>。若出现 <em>"Tunnel-client has not been seen for 300 seconds"</em>，请点击上方重启隧道或核对 <code>.env</code> 中的隧道 ID。
        </p>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title" data-i18n="sysEnvTitle">环境与版本信息</div>
        </div>
        <div style="font-size: 13px; line-height: 2;">
          <div>• <strong>ChatGPT Agent Bridge</strong>: <code id="sys-bridge-version">v${version}</code></div>
          <div>• <strong data-i18n="sysTunnelIdLabel">当前隧道 ID</strong>: <code id="sys-tunnel-id">--</code></div>
          <div>• <strong data-i18n="sysCredSourceLabel">凭证存储路径</strong>: <span id="sys-cred-source">--</span> (<a href="javascript:void(0)" onclick="switchTab('credentials')" style="color: var(--primary); text-decoration: none;" data-i18n="sysCredLink">前往修改</a>)</div>
          <div>• <strong>Codex CLI</strong>: <code>>= 0.161.0</code> (OpenAI Responses API)</div>
          <div>• <strong>Node.js</strong>: <span id="sys-node-version">--</span></div>
          <div>• <strong data-i18n="sysConfigPathLabel">配置文件路径</strong>: <span id="sys-config-path">bridge-config.json</span></div>
        </div>
      </div>
    </div>

    <footer style="margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--card-border); text-align: center; font-size: 12px; color: var(--text-muted);">
      ChatGPT Agent Bridge <span id="footer-version">v${version}</span> • <span data-i18n="footerText">虚拟模型端点与 Codex 调度控制台</span>
    </footer>
  </div>

  <!-- Task Detail Modal -->
  <div class="modal" id="task-modal">
    <div class="modal-content">
      <button class="modal-close" onclick="closeModal()">✕</button>
      <div class="card-title" id="modal-task-title" style="margin-bottom: 12px;" data-i18n="modalTaskTitle">任务详情</div>
      
      <div style="display: flex; gap: 16px; font-size: 13px; color: var(--text-muted); margin-bottom: 16px; flex-wrap: wrap;">
        <div><span data-i18n="modalStatusLabel">状态:</span> <strong id="modal-status">--</strong></div>
        <div><span data-i18n="modalModeLabel">模式:</span> <strong id="modal-mode">--</strong></div>
        <div><span data-i18n="modalCwdLabel">目录:</span> <strong id="modal-cwd">--</strong></div>
        <div><span data-i18n="modalDurationLabel">总耗时:</span> <strong id="modal-duration">--</strong></div>
      </div>

      <div style="margin-bottom: 16px;">
        <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;" data-i18n="modalPromptLabel">Prompt 指令:</div>
        <div class="terminal-view" id="modal-prompt" style="max-height: 90px; color: #f1f5f9;"></div>
      </div>

      <div style="margin-bottom: 16px;">
        <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;" data-i18n="modalTurnsLabel">交互轮次历史 (Turn History):</div>
        <div id="modal-turns-container" style="display: flex; flex-direction: column; gap: 8px;"></div>
      </div>

      <div style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 12px; font-weight: 600; color: var(--text-muted);" data-i18n="modalLogLabel">Codex 执行日志 (Live Terminal):</span>
            <span id="modal-stream-badge" class="badge" style="padding: 2px 8px; font-size: 11px;">
              <span class="badge-dot dot-online dot-pulse" id="modal-stream-dot"></span>
              <span id="modal-stream-text">实时连接中</span>
            </span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <label style="font-size: 12px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="modal-auto-scroll" checked> <span data-i18n="modalAutoScrollLabel">自动滚动</span>
            </label>
            <button class="btn btn-secondary btn-sm" onclick="clearModalLogs()" data-i18n="modalClearLogs">清屏</button>
            <button class="btn btn-secondary btn-sm" onclick="copyModalLogs()" data-i18n="modalCopyLogs">复制全部日志</button>
          </div>
        </div>
        <div class="terminal-view" id="modal-stdout" style="max-height: 320px; font-family: Menlo, Monaco, Consolas, monospace; line-height: 1.45;"></div>
      </div>

      <!-- Git Diff Section -->
      <div style="margin-bottom: 16px;" id="modal-diff-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 12px; font-weight: 600; color: var(--text-muted);" data-i18n="modalDiffLabel">代码变更对比 (Git Diff):</span>
            <span id="modal-diff-badge" class="badge" style="padding: 2px 8px; font-size: 11px;">检查中...</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="btn btn-secondary btn-sm" onclick="fetchTaskDiff(selectedTaskId)" data-i18n="modalBtnRefreshDiff">刷新 Diff</button>
          </div>
        </div>
        <div id="modal-diff-files" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;"></div>
        <div class="diff-container" id="modal-diff-view" style="display: none;"></div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button class="btn btn-danger btn-sm" id="modal-cancel-btn" onclick="cancelCurrentTask()" data-i18n="modalBtnCancelTask">终止此任务</button>
        <button class="btn btn-secondary btn-sm" onclick="closeModal()" data-i18n="modalBtnClose">关闭</button>
      </div>
    </div>
  </div>

  <div id="toast">已复制到剪贴板</div>

  <script>
    let currentData = null;
    let selectedTaskId = null;
    let currentEventSource = null;
    let currentLang = (typeof localStorage !== 'undefined' && localStorage.getItem('chatgpt_bridge_lang')) || 'zh';

    const I18N = {
      zh: {
        brandSubtitle: "虚拟模型端点与 Codex 调度控制台",
        hdrPort: "Bridge Port",
        hdrTunnel: "Tunnel",
        hdrSecurity: "安全锁",
        btnRefresh: "刷新",
        statTasks: "活跃会话 / 任务数",
        statMode: "允许最高模式",
        statWorkspace: "默认工作目录",
        statTurns: "累计交互轮次",
        tabTasks: "📋 会话与任务监控",
        tabSecurity: "🛡️ 安全策略与权限锁",
        tabWorkspaces: "📁 项目目录管理",
        tabCredentials: "🔑 凭证管理 (Credentials)",
        tabPrompt: "⚡ ChatGPT 提示词助手",
        tabLogs: "📜 系统运行日志 (System Logs)",
        tabSystem: "🔌 隧道与系统看板",
        tasksCardTitle: "Codex 任务列表",
        tasksAutoRefresh: "自动每 2 秒静默更新",
        colTaskId: "任务 ID",
        colStatus: "状态",
        colMode: "权限模式",
        colTurns: "轮次",
        colCwd: "目录",
        colCreatedAt: "创建时间",
        colActions: "操作",
        tasksEmpty: "暂无运行任务",
        btnViewDetail: "查看详情",
        btnTerminate: "终止",
        secTitle: "服务端权限安全锁 (Security Policy Lock)",
        secDesc: "在此选择系统允许的最高运行模式。<strong>服务端会实施强制安全校验</strong>：如果 ChatGPT 在提示词中发起的任务模式超出了此处的上限，服务端将直接拦截并拒绝启动，保障本地环境不受未经允许的网络或文件写操作影响。",
        secReadOnlyTitle: "🟢 只读模式 (Read-Only)",
        secReadOnlyDesc: "禁止写文件、禁止执行外网网络请求。仅允许 Codex 搜索与阅读本地代码。",
        secWorkspaceWriteTitle: "🟡 工作区修改 (Workspace-Write) - 推荐",
        secWorkspaceWriteDesc: "允许修改当前项目目录内的文件并执行本地 git commit，但底层 <strong>Seatbelt 沙箱严格阻断外网连接</strong>，防止数据外流。",
        secFullAccessTitle: "🔴 全权限与联网 (Danger-Full-Access)",
        secFullAccessDesc: "解除沙箱限制，开放完整外网访问与文件系统权限。<strong>支持自动 git push 到远程仓库及安装依赖</strong>。",
        btnSaveSec: "保存安全锁设置",
        wsTitle: "允许访问的项目目录列表 (Workspaces White-list)",
        wsDesc: "Codex 执行任务的 <code>cwd</code> 路径必须属于以下白名单目录之一或其子目录，防止路径跨越逃逸。",
        wsColPath: "目录绝对路径",
        wsColStatus: "状态",
        wsColActions: "操作",
        wsEmpty: "暂无允许的项目目录。请点击下方“📁 选择本地目录”添加你的项目工程。",
        wsDefault: "● 当前默认",
        wsAllowed: "允许",
        wsSetDefault: "设为默认",
        wsDelete: "删除",
        wsAddTitle: "添加新项目目录",
        wsAddDesc: "可点击下方按钮直接调起系统文件管理器选择本地文件夹，或在输入框中粘贴绝对路径：",
        btnPickFolder: "📁 选择本地目录 (浏览)",
        inputWorkspacePlaceholder: "或手动粘贴绝对路径，例如 /Users/username/my-project",
        btnAddWorkspace: "手动添加",
        credTitle: "OpenAI 隧道与运行时凭证配置",
        btnReloadCreds: "重新加载",
        credDesc: "在此修改 OpenAI Secure MCP 隧道所需的 <strong>Tunnel ID</strong> 与 <strong>运行时 API Key</strong>。保存后将自动持久化至本地 <code>.env</code> 文件并重新同步 <code>tunnel-client</code> 本地配置。",
        credFileLabel: "📄 当前凭证存储文件:",
        credTip: "💡 提示：若首次配置输错密钥，可在此直接修改并点击【保存并重启隧道】，无需进入命令行手动编辑文件。",
        labelTunnelId: "OpenAI Tunnel ID (隧道 ID)",
        tipTunnelId: '可在 <a href="https://platform.openai.com/settings/organization/tunnels" target="_blank" style="color: var(--primary); text-decoration: none;">OpenAI 平台 &gt; Organization Settings &gt; Tunnels</a> 创建或复制。',
        labelApiKey: "OpenAI Runtime API Key (运行时密钥)",
        btnShowKey: "👁️ 显示",
        btnHideKey: "🙈 隐藏",
        tipApiKey: '可在 <a href="https://platform.openai.com/settings/organization/api-keys" target="_blank" style="color: var(--primary); text-decoration: none;">OpenAI 平台 &gt; API Keys</a> 生成（需有 Model Responses 权限）。',
        btnSaveRestart: "💾 保存并重启隧道 (立即生效)",
        btnSaveOnly: "仅保存凭证",
        promptRecTitle: "🌟 推荐方案（彻底免去每次复制·全员通用）：配置为 ChatGPT 自定义指令",
        promptRecDesc: "配置一次后，在<strong>任何普通 ChatGPT 对话</strong>中只要提到编码任务，ChatGPT 就会自动调用工具驱动本机 Codex，<strong>无需每次手动复制粘贴长文本提示词</strong>（免费与付费账号均支持）：",
        promptStep1: "打开 ChatGPT 网页，点击左下角头像/设置 &rarr; 选择 <strong>Personalization (个性化)</strong> &rarr; <strong>Custom Instructions (自定义指令)</strong>；",
        promptStep2: "在第二个输入框 <strong>“How would you like ChatGPT to respond? (你希望 ChatGPT 如何响应？)”</strong> 中，点击下方按钮复制并粘贴填入；",
        promptStep3: "保存开启即可！",
        promptCardTitle: "ChatGPT 驱动系统提示词 (Driver Prompt)",
        btnCopyPrompt: "一键复制提示词",
        promptDynDesc: "已根据当前控制台配置的<strong>默认工作目录</strong>和<strong>安全锁最高权限</strong>动态生成：",
        logsTitle: "系统与服务运行日志",
        logsSubtitle: "实时捕获 Tunnel 隧道、Bridge 端点与 Codex 执行输出",
        logLevelAll: "全部级别 (All Levels)",
        logSourceAll: "全部来源 (All Sources)",
        logAutoScroll: "自动滚动",
        logClear: "清屏",
        logCopy: "复制日志",
        logRefresh: "刷新",
        logLoading: "正在连接实时日志流...",
        logEmpty: "暂无符合条件的日志记录",
        sysTunnelTitle: "Secure MCP Tunnel 状态与管理",
        btnRestartTunnel: "一键重启隧道",
        sysTunnelHealthLabel: "隧道健康状况:",
        btnCheckHealth: "检测连通性",
        sysTunnelTip: '隧道服务运行在本地 <code>http://127.0.0.1:8080</code>。若出现 <em>"Tunnel-client has not been seen for 300 seconds"</em>，请点击上方重启隧道或核对 <code>.env</code> 中的隧道 ID。',
        sysEnvTitle: "环境与版本信息",
        sysTunnelIdLabel: "当前隧道 ID",
        sysCredSourceLabel: "凭证存储路径",
        sysCredLink: "前往修改",
        sysConfigPathLabel: "配置文件路径",
        footerText: "虚拟模型端点与 Codex 调度控制台",
        modalTaskTitle: "任务详情",
        modalStatusLabel: "状态:",
        modalModeLabel: "模式:",
        modalCwdLabel: "目录:",
        modalDurationLabel: "总耗时:",
        modalPromptLabel: "Prompt 指令:",
        modalTurnsLabel: "交互轮次历史 (Turn History):",
        modalLogLabel: "Codex 执行日志 (Live Terminal):",
        modalAutoScrollLabel: "自动滚动",
        modalClearLogs: "清屏",
        modalCopyLogs: "复制全部日志",
        modalDiffLabel: "代码变更对比 (Git Diff):",
        modalBtnRefreshDiff: "刷新 Diff",
        modalBtnCancelTask: "终止此任务",
        modalBtnClose: "关闭",
      },
      en: {
        brandSubtitle: "Virtual Model Endpoint & Codex Dispatch Console",
        hdrPort: "Bridge Port",
        hdrTunnel: "Tunnel",
        hdrSecurity: "Security Lock",
        btnRefresh: "Refresh",
        statTasks: "Active Sessions / Tasks",
        statMode: "Max Allowed Mode",
        statWorkspace: "Default Workspace",
        statTurns: "Cumulative Turns",
        tabTasks: "📋 Tasks & Sessions",
        tabSecurity: "🛡️ Security & Permissions",
        tabWorkspaces: "📁 Workspaces White-list",
        tabCredentials: "🔑 Credentials",
        tabPrompt: "⚡ ChatGPT Driver Prompt",
        tabLogs: "📜 System Logs",
        tabSystem: "🔌 Tunnel & System",
        tasksCardTitle: "Codex Tasks",
        tasksAutoRefresh: "Auto-refreshing every 2s",
        colTaskId: "Task ID",
        colStatus: "Status",
        colMode: "Mode",
        colTurns: "Turns",
        colCwd: "Workspace",
        colCreatedAt: "Created At",
        colActions: "Actions",
        tasksEmpty: "No running tasks",
        btnViewDetail: "View Details",
        btnTerminate: "Terminate",
        secTitle: "Server Security Policy Lock",
        secDesc: "Select the highest execution mode allowed. <strong>Server enforces strict validation</strong>: If ChatGPT initiates a task exceeding this limit, the server will reject execution to protect your local environment.",
        secReadOnlyTitle: "🟢 Read-Only Mode",
        secReadOnlyDesc: "Disallow file writes and external network requests. Only allows Codex to inspect and search local code.",
        secWorkspaceWriteTitle: "🟡 Workspace-Write (Recommended)",
        secWorkspaceWriteDesc: "Allow modifying files in the project workspace and local git commits. Seatbelt sandbox strictly blocks external network connections.",
        secFullAccessTitle: "🔴 Full Access & Network (Danger)",
        secFullAccessDesc: "Disable sandbox restrictions, granting full network and filesystem access. Enables git push to remote repos and package installation.",
        btnSaveSec: "Save Security Policy",
        wsTitle: "Allowed Project Workspaces White-list",
        wsDesc: "Codex task <code>cwd</code> path must belong to one of these whitelisted directories to prevent path traversal escape.",
        wsColPath: "Directory Absolute Path",
        wsColStatus: "Status",
        wsColActions: "Actions",
        wsEmpty: "No allowed project workspaces yet. Click '📁 Browse Folder' below to add your project.",
        wsDefault: "● Current Default",
        wsAllowed: "Allowed",
        wsSetDefault: "Set Default",
        wsDelete: "Delete",
        wsAddTitle: "Add New Workspace Directory",
        wsAddDesc: "Click below to browse and select a local folder, or paste an absolute directory path:",
        btnPickFolder: "📁 Browse Folder",
        inputWorkspacePlaceholder: "Or paste absolute path, e.g. /Users/username/my-project",
        btnAddWorkspace: "Add Path",
        credTitle: "OpenAI Tunnel & Runtime Credentials",
        btnReloadCreds: "Reload",
        credDesc: "Configure the <strong>Tunnel ID</strong> and <strong>Runtime API Key</strong> required for the OpenAI Secure MCP tunnel. Changes are saved to <code>.env</code> and synced with <code>tunnel-client</code>.",
        credFileLabel: "📄 Current Credentials File:",
        credTip: "💡 Tip: If you entered the wrong key during initial setup, update it here and click 'Save & Restart Tunnel' without editing files manually.",
        labelTunnelId: "OpenAI Tunnel ID",
        tipTunnelId: 'Find or create at <a href="https://platform.openai.com/settings/organization/tunnels" target="_blank" style="color: var(--primary); text-decoration: none;">OpenAI Platform &gt; Organization Settings &gt; Tunnels</a>.',
        labelApiKey: "OpenAI Runtime API Key",
        btnShowKey: "👁️ Show",
        btnHideKey: "🙈 Hide",
        tipApiKey: 'Generate at <a href="https://platform.openai.com/settings/organization/api-keys" target="_blank" style="color: var(--primary); text-decoration: none;">OpenAI Platform &gt; API Keys</a> (requires Model Responses permission).',
        btnSaveRestart: "💾 Save & Restart Tunnel (Apply Now)",
        btnSaveOnly: "Save Credentials Only",
        promptRecTitle: "🌟 Recommended: Configure as ChatGPT Custom Instructions (One-time Setup)",
        promptRecDesc: "Set it once, and ChatGPT will automatically drive local Codex for coding in <strong>any normal conversation</strong> without copying and pasting prompt text every time:",
        promptStep1: "Open ChatGPT, click profile/settings at bottom-left &rarr; <strong>Personalization</strong> &rarr; <strong>Custom Instructions</strong>;",
        promptStep2: "In the second box <strong>“How would you like ChatGPT to respond?”</strong>, copy and paste the prompt below;",
        promptStep3: "Save and enable!",
        promptCardTitle: "ChatGPT Driver System Prompt",
        btnCopyPrompt: "Copy Prompt",
        promptDynDesc: "Dynamically generated based on current default workspace and security lock policy:",
        logsTitle: "System & Service Runtime Logs",
        logsSubtitle: "Live streaming capture of Tunnel, Bridge endpoint, and Codex execution logs",
        logLevelAll: "All Levels",
        logSourceAll: "All Sources",
        logAutoScroll: "Auto Scroll",
        logClear: "Clear",
        logCopy: "Copy Logs",
        logRefresh: "Refresh",
        logLoading: "Connecting to live log stream...",
        logEmpty: "No logs matching current filter",
        sysTunnelTitle: "Secure MCP Tunnel Status & Management",
        btnRestartTunnel: "Restart Tunnel",
        sysTunnelHealthLabel: "Tunnel Health:",
        btnCheckHealth: "Check Connectivity",
        sysTunnelTip: 'Tunnel client runs locally on <code>http://127.0.0.1:8080</code>. If you see <em>"Tunnel-client has not been seen for 300 seconds"</em>, click Restart Tunnel or verify your Tunnel ID in <code>.env</code>.',
        sysEnvTitle: "Environment & Version Info",
        sysTunnelIdLabel: "Current Tunnel ID",
        sysCredSourceLabel: "Credentials File",
        sysCredLink: "Edit",
        sysConfigPathLabel: "Config File Path",
        footerText: "Virtual Model Endpoint & Codex Dispatch Console",
        modalTaskTitle: "Task Details",
        modalStatusLabel: "Status:",
        modalModeLabel: "Mode:",
        modalCwdLabel: "Workspace:",
        modalDurationLabel: "Duration:",
        modalPromptLabel: "Prompt Instructions:",
        modalTurnsLabel: "Turn History:",
        modalLogLabel: "Codex Execution Logs (Live Terminal):",
        modalAutoScrollLabel: "Auto Scroll",
        modalClearLogs: "Clear",
        modalCopyLogs: "Copy All Logs",
        modalDiffLabel: "Code Changes (Git Diff):",
        modalBtnRefreshDiff: "Refresh Diff",
        modalBtnCancelTask: "Terminate Task",
        modalBtnClose: "Close",
      }
    };

    function t(key, fallback) {
      if (I18N[currentLang] && I18N[currentLang][key] !== undefined) {
        return I18N[currentLang][key];
      }
      if (I18N['zh'] && I18N['zh'][key] !== undefined) {
        return I18N['zh'][key];
      }
      return fallback !== undefined ? fallback : key;
    }

    function applyLanguage(lang) {
      currentLang = lang;
      try {
        localStorage.setItem('chatgpt_bridge_lang', lang);
      } catch (e) {}
      const btn = document.getElementById('btn-lang-toggle');
      if (btn) btn.innerText = currentLang === 'zh' ? '🌐 English' : '🌐 中文';

      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const text = t(key);
        if (text) el.innerHTML = text;
      });

      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const text = t(key);
        if (text) el.setAttribute('placeholder', text);
      });

      if (currentData) {
        renderOverview(currentData);
        renderWorkspaces(currentData.config.allowedWorkspaces, currentData.config.activeWorkspace);
        renderPrompt(currentData.config);
      }
      renderTasksTable();
      renderSystemLogs();
    }

    function toggleLanguage() {
      const next = currentLang === 'zh' ? 'en' : 'zh';
      applyLanguage(next);
      showToast(next === 'zh' ? '已切换至中文' : 'Switched to English');
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }

    function clearModalLogs() {
      const el = document.getElementById('modal-stdout');
      if (el) el.innerText = '';
    }

    function copyModalLogs() {
      const el = document.getElementById('modal-stdout');
      if (!el || !el.innerText) return showToast('日志为空');
      navigator.clipboard.writeText(el.innerText).then(() => {
        showToast('全部执行日志已复制到剪贴板！');
      }).catch(() => {
        showToast('复制失败');
      });
    }

    function updateModalStreamBadge(status) {
      const dot = document.getElementById('modal-stream-dot');
      const text = document.getElementById('modal-stream-text');
      if (!dot || !text) return;
      if (status === 'running') {
        dot.className = 'badge-dot dot-online dot-pulse';
        text.innerText = currentLang === 'zh' ? 'SSE 实时接收中' : 'SSE Live Connected';
      } else if (status === 'finished') {
        dot.className = 'badge-dot dot-online';
        text.innerText = currentLang === 'zh' ? '任务已完成' : 'Task Finished';
      } else if (status === 'failed') {
        dot.className = 'badge-dot dot-danger';
        text.innerText = currentLang === 'zh' ? '任务异常退出' : 'Task Failed';
      } else if (status === 'abandoned') {
        dot.className = 'badge-dot dot-warning';
        text.innerText = currentLang === 'zh' ? '超时废弃 (Abandoned)' : 'Abandoned';
      } else if (status === 'cancelled') {
        dot.className = 'badge-dot dot-warning';
        text.innerText = currentLang === 'zh' ? '任务已取消' : 'Cancelled';
      } else {
        dot.className = 'badge-dot dot-muted';
        text.innerText = status || (currentLang === 'zh' ? '已断开' : 'Disconnected');
      }
    }

    function renderTurnItems(history) {
      const turnsBox = document.getElementById('modal-turns-container');
      if (!history || history.length === 0) {
        turnsBox.innerHTML = '<span style="font-size: 12px; color: var(--text-muted);">' + (currentLang === 'zh' ? '暂无轮次记录' : 'No turn history') + '</span>';
        return;
      }
      turnsBox.innerHTML = history.map(th => {
        const isAnswered = Boolean(th.answeredAt);
        const actionLabels = th.replyLabels ? th.replyLabels.join(', ') : (isAnswered ? (currentLang === 'zh' ? '完成' : 'Done') : (currentLang === 'zh' ? '处理中...' : 'Processing...'));
        const turnStatusText = isAnswered ? (currentLang === 'zh' ? '已回复' : 'Answered') : (currentLang === 'zh' ? '等待回复中...' : 'Waiting for reply...');
        const turnActionPrefix = currentLang === 'zh' ? '回复动作: ' : 'Reply action: ';
        return '<div id="turn-card-' + th.id + '" style="background: rgba(0,0,0,0.25); border: 1px solid var(--card-border); padding: 8px 12px; border-radius: 6px; font-size: 12px;">' +
          '<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">' +
            '<strong>Turn #' + th.seq + ' (' + th.id + ')</strong>' +
            '<span style="color: ' + (isAnswered ? 'var(--success)' : 'var(--warning)') + '; font-weight: 600;">' +
              turnStatusText +
            '</span>' +
          '</div>' +
          '<div style="color: var(--primary);">' + turnActionPrefix + '<span id="turn-labels-' + th.id + '">' + actionLabels + '</span></div>' +
        '</div>';
      }).join('');
    }

    function switchTab(name) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      const activeBtn = document.querySelector('.tab-btn[data-tab="' + name + '"]');
      if (activeBtn) {
        activeBtn.classList.add('active');
      } else if (typeof event !== 'undefined' && event && event.target && event.target.classList.contains('tab-btn')) {
        event.target.classList.add('active');
      }
      const pane = document.getElementById('tab-' + name);
      if (pane) pane.classList.add('active');
      if (name === 'credentials') {
        fetchCredentials();
      }
      if (name === 'logs') {
        renderSystemLogs();
      }
    }

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        currentData = data;
        renderOverview(data);
        renderWorkspaces(data.config.allowedWorkspaces, data.config.activeWorkspace);
        renderSecurity(data.config.maxAllowedMode);
        renderPrompt(data.config);
      } catch (e) {
        console.error('Fetch status failed', e);
      }
    }

    async function fetchTasks() {
      try {
        const res = await fetch('/api/tasks');
        const tasks = await res.json();
        renderTasksTable(tasks);
        document.getElementById('stat-tasks').innerText = tasks.filter(t => t.status === 'running').length;
        const totalTurns = tasks.reduce((acc, t) => acc + (t.turns || 0), 0);
        document.getElementById('stat-turns').innerText = totalTurns;
      } catch (e) {
        console.error('Fetch tasks failed', e);
      }
    }

    function renderOverview(data) {
      document.getElementById('hdr-port').innerText = data.bridge.port;
      document.getElementById('hdr-security').innerText = data.config.maxAllowedMode;
      document.getElementById('stat-mode').innerText = data.config.maxAllowedMode;
      document.getElementById('stat-workspace').innerText = data.config.activeWorkspace || (currentLang === 'zh' ? '未设置 (请添加目录)' : 'Not set (Please add folder)');
      document.getElementById('sys-node-version').innerText = data.system.nodeVersion;
      document.getElementById('sys-config-path').innerText = data.config.configPath;

      if (data.credentials) {
        const sysTunnelId = document.getElementById('sys-tunnel-id');
        if (sysTunnelId) sysTunnelId.innerText = data.credentials.tunnelId || (currentLang === 'zh' ? '未配置' : 'Not configured');
        const sysCredSource = document.getElementById('sys-cred-source');
        if (sysCredSource) sysCredSource.innerText = data.credentials.source || (currentLang === 'zh' ? '未检测到' : 'Not detected');
      }

      const ver = data.bridge?.version || data.system?.version;
      if (ver) {
        const formattedVer = 'v' + ver.replace(/^v/, '');
        const hdrVer = document.getElementById('hdr-version');
        if (hdrVer) hdrVer.innerText = formattedVer;
        const sysVer = document.getElementById('sys-bridge-version');
        if (sysVer) sysVer.innerText = formattedVer;
        const footerVer = document.getElementById('footer-version');
        if (footerVer) footerVer.innerText = formattedVer;
      }

      const dot = document.getElementById('dot-tunnel');
      const hdrTunnel = document.getElementById('hdr-tunnel');
      if (data.tunnel.healthy) {
        dot.className = 'badge-dot dot-online';
        hdrTunnel.innerText = 'Connected';
        document.getElementById('sys-tunnel-status').innerHTML = '<span style="color: var(--success);">' + (currentLang === 'zh' ? '🟢 正常连通 (200 OK)' : '🟢 Online (200 OK)') + '</span>';
      } else {
        dot.className = 'badge-dot dot-danger';
        hdrTunnel.innerText = 'Offline';
        document.getElementById('sys-tunnel-status').innerHTML = '<span style="color: var(--danger);">' + (currentLang === 'zh' ? '⚪ 未检测到运行' : '⚪ Offline') + '</span>';
      }
    }

    function renderSecurity(mode) {
      document.querySelectorAll('input[name="secMode"]').forEach(radio => {
        const isSelected = radio.value === mode;
        radio.checked = isSelected;
        const card = document.getElementById('card-' + radio.value);
        if (card) {
          card.classList.toggle('selected', isSelected);
        }
      });
    }

    document.querySelectorAll('input[name="secMode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('.radio-card').forEach(c => c.classList.remove('selected'));
        const card = document.getElementById('card-' + radio.value);
        if (card) card.classList.add('selected');
      });
    });

    async function saveSecurityPolicy() {
      const checked = document.querySelector('input[name="secMode"]:checked');
      if (!checked) return;
      const mode = checked.value;
      try {
        const res = await fetch('/api/config/security', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ maxAllowedMode: mode })
        });
        if (res.ok) {
          showToast('安全锁策略已保存并生效：' + mode);
          fetchStatus();
        } else {
          const err = await res.json();
          alert('保存失败: ' + err.error);
        }
      } catch (e) {
        alert('网络请求失败');
      }
    }

    function renderWorkspaces(list, active) {
      const tbody = document.getElementById('workspaces-table-body');
      if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 24px;">' + t('wsEmpty') + '</td></tr>';
        return;
      }
      tbody.innerHTML = list.map(item => {
        const isActive = item === active;
        const enc = encodeURIComponent(item);
        return '<tr>' +
          '<td><code>' + item + '</code></td>' +
          '<td>' + (isActive ? '<span style="color: var(--success); font-weight: 600;">' + t('wsDefault') + '</span>' : '<span style="color: var(--text-muted);">' + t('wsAllowed') + '</span>') + '</td>' +
          '<td style="white-space: nowrap;">' +
            (!isActive ? '<button class="btn btn-secondary btn-sm" style="margin-right: 6px;" data-path="' + enc + '" onclick="setActiveWorkspace(this.dataset.path)">' + t('wsSetDefault') + '</button>' : '') +
            '<button class="btn btn-danger btn-sm" data-path="' + enc + '" onclick="removeWorkspace(this.dataset.path)">' + t('wsDelete') + '</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    async function pickDirectory() {
      const btn = document.getElementById('btn-pick-folder');
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '⏳ 正在等待选择目录...';
      try {
        const res = await fetch('/api/system/select-directory', { method: 'POST' });
        const data = await res.json();
        if (data.cancelled) {
          return;
        }
        if (data.success && data.path) {
          showToast('已成功添加项目目录：' + data.path);
          fetchStatus();
        } else if (data.error) {
          alert('选择失败: ' + data.error);
        }
      } catch (e) {
        alert('调用本地目录选择器失败，请检查服务连接或使用手动输入');
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }

    async function addWorkspace() {
      const input = document.getElementById('new-workspace-input');
      const val = input.value.trim();
      if (!val) return;
      try {
        const res = await fetch('/api/config/workspaces', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'add', path: val })
        });
        if (res.ok) {
          showToast('目录已添加并加入白名单');
          input.value = '';
          fetchStatus();
        } else {
          const err = await res.json();
          alert('添加失败: ' + err.error);
        }
      } catch (e) {
        alert('网络请求失败');
      }
    }

    async function removeWorkspace(encPath) {
      const target = decodeURIComponent(encPath);
      if (!confirm('确定将目录从允许列表移除吗？\\n' + target)) return;
      try {
        const res = await fetch('/api/config/workspaces', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'remove', path: target })
        });
        if (res.ok) {
          showToast('目录已移除');
          fetchStatus();
        }
      } catch (e) {
        alert('操作失败');
      }
    }

    async function setActiveWorkspace(encPath) {
      const target = decodeURIComponent(encPath);
      try {
        const res = await fetch('/api/config/workspaces', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'select', path: target })
        });
        if (res.ok) {
          showToast('已切换默认工作目录');
          fetchStatus();
        }
      } catch (e) {
        alert('操作失败');
      }
    }

    let latestTasks = [];
    function renderTasksTable(tasks) {
      if (tasks) latestTasks = tasks;
      const tbody = document.getElementById('tasks-table-body');
      if (!latestTasks || latestTasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">' + t('tasksEmpty') + '</td></tr>';
        return;
      }
      tbody.innerHTML = latestTasks.map(tItem => {
        let badgeColor = 'var(--text-muted)';
        if (tItem.status === 'running') badgeColor = 'var(--primary)';
        if (tItem.status === 'finished') badgeColor = 'var(--success)';
        if (tItem.status === 'failed') badgeColor = 'var(--danger)';
        if (tItem.status === 'abandoned') badgeColor = 'var(--warning)';

        const cwdDisplay = tItem.cwd.length > 25 ? '...' + tItem.cwd.slice(-22) : tItem.cwd;
        return '<tr>' +
          '<td><strong>' + tItem.task_id + '</strong></td>' +
          '<td><span style="color: ' + badgeColor + '; font-weight: 600;">' + tItem.status + '</span></td>' +
          '<td><code>' + tItem.mode + '</code></td>' +
          '<td>' + (tItem.turns || 0) + '</td>' +
          '<td title="' + tItem.cwd + '">' + cwdDisplay + '</td>' +
          '<td>' + new Date(tItem.created_at).toLocaleTimeString() + '</td>' +
          '<td>' +
            '<button class="btn btn-secondary btn-sm" data-id="' + tItem.task_id + '" onclick="viewTaskDetail(this.dataset.id)">' + t('btnViewDetail') + '</button> ' +
            (tItem.status === 'running' ? '<button class="btn btn-danger btn-sm" data-id="' + tItem.task_id + '" onclick="cancelTask(this.dataset.id)">' + t('btnTerminate') + '</button>' : '') +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function viewTaskDetail(id) {
      selectedTaskId = id;
      if (currentEventSource) {
        currentEventSource.close();
        currentEventSource = null;
      }

      document.getElementById('modal-task-title').innerText = '任务详情: ' + id;
      document.getElementById('modal-status').innerText = '连接中...';
      document.getElementById('modal-mode').innerText = '--';
      document.getElementById('modal-cwd').innerText = '--';
      document.getElementById('modal-duration').innerText = '--';
      document.getElementById('modal-prompt').innerText = '--';
      document.getElementById('modal-stdout').innerText = '';
      document.getElementById('modal-turns-container').innerHTML = '<span style="font-size: 12px; color: var(--text-muted);">正在连接实时日志流...</span>';
      document.getElementById('modal-cancel-btn').style.display = 'none';
      updateModalStreamBadge('running');

      document.getElementById('task-modal').classList.add('open');

      const es = new EventSource('/api/tasks/' + id + '/stream');
      currentEventSource = es;

      let currentTaskMeta = null;

      es.addEventListener('init', (e) => {
        try {
          const data = JSON.parse(e.data);
          currentTaskMeta = data.task;
          document.getElementById('modal-task-title').innerText = '任务详情: ' + currentTaskMeta.id;
          
          let statusColor = 'var(--text-muted)';
          if (currentTaskMeta.status === 'running') statusColor = 'var(--primary)';
          if (currentTaskMeta.status === 'finished') statusColor = 'var(--success)';
          if (currentTaskMeta.status === 'failed') statusColor = 'var(--danger)';
          if (currentTaskMeta.status === 'abandoned') statusColor = 'var(--warning)';
          const statusEl = document.getElementById('modal-status');
          statusEl.innerText = currentTaskMeta.status;
          statusEl.style.color = statusColor;

          document.getElementById('modal-mode').innerText = currentTaskMeta.mode;
          document.getElementById('modal-cwd').innerText = currentTaskMeta.cwd;
          const dur = currentTaskMeta.finishedAt
            ? Math.round((currentTaskMeta.finishedAt - currentTaskMeta.createdAt) / 1000) + 's'
            : Math.round((Date.now() - currentTaskMeta.createdAt) / 1000) + 's (运行中)';
          document.getElementById('modal-duration').innerText = dur;
          document.getElementById('modal-prompt').innerText = currentTaskMeta.prompt || '';

          renderTurnItems(currentTaskMeta.turnHistory);

          const stdoutEl = document.getElementById('modal-stdout');
          stdoutEl.innerText = data.stdout || '';
          if (document.getElementById('modal-auto-scroll').checked) {
            stdoutEl.scrollTop = stdoutEl.scrollHeight;
          }

          document.getElementById('modal-cancel-btn').style.display = currentTaskMeta.status === 'running' ? 'inline-flex' : 'none';
          updateModalStreamBadge(currentTaskMeta.status);
        } catch (err) {
          console.error('Parse init event error', err);
        }
      });

      es.addEventListener('log', (e) => {
        try {
          const payload = JSON.parse(e.data);
          const stdoutEl = document.getElementById('modal-stdout');
          stdoutEl.innerText += payload.chunk;
          if (document.getElementById('modal-auto-scroll').checked) {
            stdoutEl.scrollTop = stdoutEl.scrollHeight;
          }
        } catch (err) {
          console.error('Parse log event error', err);
        }
      });

      es.addEventListener('turn', (e) => {
        try {
          const turnData = JSON.parse(e.data);
          if (currentTaskMeta) {
            if (!currentTaskMeta.turnHistory) currentTaskMeta.turnHistory = [];
            currentTaskMeta.turnHistory.push({
              seq: turnData.seq,
              id: turnData.id,
              createdAt: turnData.createdAt,
            });
            renderTurnItems(currentTaskMeta.turnHistory);
          }
        } catch (err) {
          console.error('Parse turn event error', err);
        }
      });

      es.addEventListener('turn_answered', (e) => {
        try {
          const ansData = JSON.parse(e.data);
          if (currentTaskMeta && currentTaskMeta.turnHistory) {
            const item = currentTaskMeta.turnHistory.find(h => h.id === ansData.id);
            if (item) {
              item.answeredAt = ansData.answeredAt;
              item.replyLabels = ansData.replyLabels;
            }
            renderTurnItems(currentTaskMeta.turnHistory);
          }
        } catch (err) {
          console.error('Parse turn_answered event error', err);
        }
      });

      es.addEventListener('end', (e) => {
        try {
          const endData = JSON.parse(e.data);
          const statusEl = document.getElementById('modal-status');
          statusEl.innerText = endData.status;
          if (endData.status === 'finished') statusEl.style.color = 'var(--success)';
          else if (endData.status === 'failed') statusEl.style.color = 'var(--danger)';
          else if (endData.status === 'abandoned') statusEl.style.color = 'var(--warning)';
          else statusEl.style.color = 'var(--text-muted)';

          if (currentTaskMeta && currentTaskMeta.createdAt) {
            const finTime = endData.finishedAt || Date.now();
            document.getElementById('modal-duration').innerText = Math.round((finTime - currentTaskMeta.createdAt) / 1000) + 's';
          }
          document.getElementById('modal-cancel-btn').style.display = 'none';
          updateModalStreamBadge(endData.status);

          if (currentEventSource) {
            currentEventSource.close();
            currentEventSource = null;
          }
          fetchTasks();
          fetchTaskDiff(selectedTaskId);
        } catch (err) {
          console.error('Parse end event error', err);
        }
      });

      es.onerror = () => {
        if (currentTaskMeta && currentTaskMeta.status === 'running') {
          updateModalStreamBadge('重连中...');
        }
      };

      // Load Git Diff for this task
      fetchTaskDiff(id);
    }

    async function fetchTaskDiff(id) {
      if (!id) return;
      const badge = document.getElementById('modal-diff-badge');
      const filesBox = document.getElementById('modal-diff-files');
      const diffView = document.getElementById('modal-diff-view');
      badge.innerText = '拉取中...';
      badge.className = 'badge';

      try {
        const res = await fetch('/api/tasks/' + id + '/diff');
        if (!res.ok) {
          badge.innerText = '未连接或非 Git 目录';
          badge.className = 'badge';
          filesBox.innerHTML = '';
          diffView.style.display = 'none';
          return;
        }
        const data = await res.json();
        if (!data.isGitRepo) {
          badge.innerText = '非 Git 仓库目录';
          badge.className = 'badge';
          filesBox.innerHTML = '';
          diffView.style.display = 'none';
          return;
        }

        if (!data.hasChanges) {
          badge.innerText = '无文件变更 (Clean)';
          badge.className = 'badge';
          badge.style.color = 'var(--text-muted)';
          filesBox.innerHTML = '<span style="font-size: 12px; color: var(--text-muted);">工作区代码无未提交修改</span>';
          diffView.style.display = 'none';
          return;
        }

        badge.innerText = (data.files.length + data.untracked.length) + ' 处变更';
        badge.className = 'badge';
        badge.style.color = 'var(--success)';

        let pillsHtml = '';
        (data.files || []).forEach(f => {
          let pillClass = 'file-pill-mod';
          let label = 'MOD';
          if (f.status === 'added') { pillClass = 'file-pill-add'; label = '+ADD'; }
          else if (f.status === 'deleted') { pillClass = 'file-pill-del'; label = '-DEL'; }
          else if (f.status === 'renamed') { pillClass = 'file-pill-mod'; label = 'REN'; }
          pillsHtml += '<span class="file-pill ' + pillClass + '"><strong>' + label + '</strong> ' + f.file + '</span>';
        });
        (data.untracked || []).forEach(u => {
          pillsHtml += '<span class="file-pill file-pill-untracked"><strong>+NEW</strong> ' + u + '</span>';
        });
        filesBox.innerHTML = pillsHtml;

        if (data.diff && data.diff.trim()) {
          diffView.innerHTML = renderDiffHtml(data.diff);
          diffView.style.display = 'block';
        } else if (data.untracked.length > 0) {
          diffView.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 6px;">检测到新增未跟踪文件（Untracked），尚无版本记录 diff。</div>';
          diffView.style.display = 'block';
        } else {
          diffView.style.display = 'none';
        }
      } catch (err) {
        badge.innerText = '拉取失败';
        filesBox.innerHTML = '';
        diffView.style.display = 'none';
      }
    }

    function renderDiffHtml(diffText) {
      const escape = str => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const lines = diffText.split(/\\r?\\n/);
      return lines.map(line => {
        const esc = escape(line);
        if (line.startsWith('+++') || line.startsWith('---')) {
          return '<div class="diff-line diff-line-meta">' + esc + '</div>';
        } else if (line.startsWith('@@')) {
          return '<div class="diff-line diff-line-hunk">' + esc + '</div>';
        } else if (line.startsWith('+')) {
          return '<div class="diff-line diff-line-add">' + esc + '</div>';
        } else if (line.startsWith('-')) {
          return '<div class="diff-line diff-line-del">' + esc + '</div>';
        } else if (line.startsWith('diff --git')) {
          return '<div class="diff-line diff-line-meta" style="font-weight: 700; color: #fff; border-top: 1px solid var(--card-border); margin-top: 6px; padding-top: 4px;">' + esc + '</div>';
        }
        return '<div class="diff-line" style="color: #cbd5e1;">' + esc + '</div>';
      }).join('');
    }

    function closeModal() {
      document.getElementById('task-modal').classList.remove('open');
      selectedTaskId = null;
      if (currentEventSource) {
        currentEventSource.close();
        currentEventSource = null;
      }
    }

    async function cancelTask(id) {
      if (!confirm('确定终止任务 ' + id + ' 吗？')) return;
      try {
        await fetch('/api/tasks/' + id + '/cancel', { method: 'POST' });
        showToast('已发送取消指令');
        fetchTasks();
      } catch (e) {
        alert('取消失败');
      }
    }

    async function cancelCurrentTask() {
      if (selectedTaskId) {
        await cancelTask(selectedTaskId);
        closeModal();
      }
    }

    function renderPrompt(cfg) {
      if (!cfg) cfg = currentData ? currentData.config : { maxAllowedMode: 'workspace-write' };
      let promptText = '';
      if (currentLang === 'en') {
        const modeHintEn = cfg.maxAllowedMode === 'danger-full-access'
          ? '- For external network (e.g. git push, install remote packages): mode="danger-full-access"\\n   - For editing files / local tests: mode="workspace-write"'
          : '- For editing files / local tests / git commit: mode="workspace-write"\\n   - For read-only inspection: mode="read-only"';
        const cwdValEn = cfg.activeWorkspace ? cfg.activeWorkspace : '<Please set workspace directory in Web Console>';
        promptText = \`You are the "model" driving the local Codex agent. You can call codex_status() at any time to inspect workspace status and security lock policies; if no workspace is configured, notify the user to select a project directory in the Web Console first.
Workflow:
1) When a local coding task is requested, invoke codex_start(prompt, cwd="\${cwdValEn}", mode) (Current max allowed mode: \${cfg.maxAllowedMode}).
   \${modeHintEn}
2) Loop: Call codex_poll(task_id, wait_secs≈25):
   - status=model_request: Follow the REPLY PROTOCOL in the returned message and reply via codex_reply(task_id, turn_id, reply);
     To execute an action, output JS with exec (e.g. await tools.exec_command({cmd:"ls"}));
     [CRITICAL CONCLUSION]: Do NOT simply stop in the chat after completing the goal! You MUST invoke codex_reply(task_id, turn_id, 'message("Task completion summary")') one final time so Codex exits cleanly (status=finished);
   - status=waiting: Poll again after a short delay;
   - status=finished/failed/cancelled: Stop the loop and present the summary to the user.
Keep tasks concise (~2 tool calls per step); any file modification requires mode=workspace-write or danger-full-access.\`;
      } else {
        const modeHint = cfg.maxAllowedMode === 'danger-full-access'
          ? '- 需连外网（如 git push、安装远程包）：mode="danger-full-access"\\n   - 修改文件/本地测试：mode="workspace-write"'
          : '- 修改文件/本地测试/本地 commit：mode="workspace-write"\\n   - 只读查看：mode="read-only"';
        const cwdVal = cfg.activeWorkspace ? cfg.activeWorkspace : '<请在控制台添加并设置工作目录>';
        promptText = \`你是驱动本机 Codex 的“模型”。随时可用 codex_status() 查询工作区状态与安全锁策略；若未配置工作区目录，请先告知用户前往 Web 控制台选定项目目录。
流程：
1) 需要执行本机编码任务时调用 codex_start(prompt, cwd="\${cwdVal}", mode)（当前安全锁最高模式: \${cfg.maxAllowedMode}）。
   \${modeHint}
2) 循环：调用 codex_poll(task_id, wait_secs≈25)：
   - status=model_request：按返回文本里的 REPLY PROTOCOL，用 codex_reply(task_id, turn_id, reply) 作答；
     要执行动作就发 exec 的 JS（如 await tools.exec_command({cmd:"ls"})）；
     【关键收尾】：目标达成后切勿直接在聊天中停止！必须最后调用一次 codex_reply(task_id, turn_id, 'message("任务完成总结")')，使 Codex 正常结束（status=finished）；
   - status=waiting：稍后再次 poll；
   - status=finished/failed/cancelled：停止循环，把最终输出整理给用户。
每步约 2 次工具调用，任务尽量切小；涉及写文件必须指定 mode=workspace-write 或 danger-full-access。\`;
      }
      document.getElementById('prompt-preview').innerText = promptText;
    }

    function copyPrompt() {
      const text = document.getElementById('prompt-preview').innerText;
      navigator.clipboard.writeText(text).then(() => {
        showToast('驱动提示词已复制到剪贴板！');
      });
    }

    async function checkTunnelHealth() {
      try {
        const res = await fetch('/api/tunnel/health');
        const data = await res.json();
        if (data.healthy) {
          showToast('Tunnel 连接正常');
        } else {
          showToast('Tunnel 离线或未运行');
        }
        fetchStatus();
      } catch (e) {
        showToast('检测失败');
      }
    }

    async function restartTunnel() {
      if (!confirm('确定重启隧道服务吗？注意：这可能会中断进行中的连接。')) return;
      try {
        const res = await fetch('/api/tunnel/restart', { method: 'POST' });
        const data = await res.json();
        showToast(data.message || '已触发重启');
        setTimeout(fetchStatus, 3000);
      } catch (e) {
        alert('触发重启失败');
      }
    }

    async function fetchCredentials() {
      try {
        const res = await fetch('/api/config/credentials');
        const data = await res.json();
        const inputTunnel = document.getElementById('input-tunnel-id');
        const inputKey = document.getElementById('input-api-key');
        const credPath = document.getElementById('cred-file-path');
        if (inputTunnel) inputTunnel.value = data.tunnelId || '';
        if (inputKey) inputKey.value = data.apiKey || '';
        if (credPath) credPath.innerText = data.targetEnvPath || data.source || '未检测到';
        const sysTunnelId = document.getElementById('sys-tunnel-id');
        if (sysTunnelId) sysTunnelId.innerText = data.tunnelId || '未配置';
        const sysCredSource = document.getElementById('sys-cred-source');
        if (sysCredSource) sysCredSource.innerText = data.source || '未检测到';
      } catch (err) {
        console.error('Fetch credentials failed', err);
      }
    }

    function toggleApiKeyVisibility() {
      const input = document.getElementById('input-api-key');
      const btn = document.getElementById('btn-toggle-key');
      if (!input || !btn) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.innerText = t('btnHideKey');
      } else {
        input.type = 'password';
        btn.innerText = t('btnShowKey');
      }
    }

    async function saveCredentials(restart) {
      const inputTunnel = document.getElementById('input-tunnel-id');
      const inputKey = document.getElementById('input-api-key');
      const statusBox = document.getElementById('cred-save-status');

      const tunnelId = inputTunnel ? inputTunnel.value.trim() : '';
      const apiKey = inputKey ? inputKey.value.trim() : '';

      if (!tunnelId) {
        alert('Tunnel ID 不能为空');
        return;
      }
      if (!apiKey) {
        alert('API Key 不能为空');
        return;
      }

      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.style.background = 'rgba(56, 189, 248, 0.15)';
        statusBox.style.color = 'var(--primary)';
        statusBox.style.border = '1px solid rgba(56, 189, 248, 0.3)';
        statusBox.innerText = restart ? '⏳ 正在保存凭证并触发隧道重启，请稍候...' : '⏳ 正在保存凭证...';
      }

      try {
        const res = await fetch('/api/config/credentials', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tunnelId, apiKey, restart }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || '保存失败');
        }

        if (restart) {
          if (statusBox) {
            statusBox.innerText = '✓ 凭证已保存，隧道服务正在重启，请稍候约 3 秒...';
          }
          showToast('凭证已保存，隧道重启中');
          let attempts = 0;
          const pollTimer = setInterval(async () => {
            attempts++;
            try {
              const hRes = await fetch('/api/tunnel/health');
              const hData = await hRes.json();
              if (hData.healthy || attempts >= 8) {
                clearInterval(pollTimer);
                if (statusBox) {
                  statusBox.style.background = 'rgba(16, 185, 129, 0.15)';
                  statusBox.style.color = 'var(--success)';
                  statusBox.style.border = '1px solid rgba(16, 185, 129, 0.3)';
                  statusBox.innerText = '✓ 凭证已成功保存，隧道服务已重新上线运行！';
                }
                fetchStatus();
                fetchCredentials();
              }
            } catch {
              if (attempts >= 8) {
                clearInterval(pollTimer);
                fetchStatus();
                fetchCredentials();
              }
            }
          }, 1500);
        } else {
          if (statusBox) {
            statusBox.style.background = 'rgba(16, 185, 129, 0.15)';
            statusBox.style.color = 'var(--success)';
            statusBox.style.border = '1px solid rgba(16, 185, 129, 0.3)';
            statusBox.innerText = '✓ 凭证已成功保存至 ' + (data.targetEnvPath || '配置文件') + '。';
          }
          showToast('凭证保存成功');
          fetchStatus();
          fetchCredentials();
        }
      } catch (err) {
        if (statusBox) {
          statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
          statusBox.style.color = 'var(--danger)';
          statusBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
          statusBox.innerText = '✗ 保存失败: ' + err.message;
        }
      }
    }

    // System Logs Management
    let systemLogs = [];
    let systemLogsEventSource = null;

    function getSystemLogHtml(entry) {
      let badgeColor = 'var(--primary)';
      if (entry.level === 'warn') badgeColor = 'var(--warning)';
      if (entry.level === 'error') badgeColor = 'var(--danger)';
      
      let sourceBadge = '';
      if (entry.source === 'tunnel') {
        sourceBadge = '<span style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 1px 5px; border-radius: 4px; font-weight: 600; font-size: 10px; margin-right: 6px;">TUNNEL</span>';
      } else if (entry.source === 'codex') {
        sourceBadge = '<span style="background: rgba(168, 85, 247, 0.2); color: #c084fc; padding: 1px 5px; border-radius: 4px; font-weight: 600; font-size: 10px; margin-right: 6px;">CODEX</span>';
      } else if (entry.source === 'system') {
        sourceBadge = '<span style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; padding: 1px 5px; border-radius: 4px; font-weight: 600; font-size: 10px; margin-right: 6px;">SYSTEM</span>';
      } else {
        sourceBadge = '<span style="background: rgba(52, 211, 153, 0.2); color: #34d399; padding: 1px 5px; border-radius: 4px; font-weight: 600; font-size: 10px; margin-right: 6px;">BRIDGE</span>';
      }

      const escapeHtml = str => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const timeStr = entry.time || new Date().toLocaleTimeString();
      const escMsg = escapeHtml(entry.message);

      return '<div style="margin-bottom: 3px; word-break: break-all;">' +
        '<span style="color: var(--text-muted); margin-right: 6px;">[' + timeStr + ']</span>' +
        sourceBadge +
        '<span style="color: ' + badgeColor + '; font-weight: 600; margin-right: 6px;">' + entry.level.toUpperCase() + '</span>' +
        '<span>' + escMsg + '</span>' +
      '</div>';
    }

    function renderSystemLogs() {
      const container = document.getElementById('system-logs-container');
      if (!container) return;
      const levelFilter = document.getElementById('log-level-filter')?.value || 'all';
      const sourceFilter = document.getElementById('log-source-filter')?.value || 'all';

      const filtered = systemLogs.filter(entry => {
        if (levelFilter !== 'all' && entry.level !== levelFilter) return false;
        if (sourceFilter !== 'all' && entry.source !== sourceFilter) return false;
        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted);">' + t('logEmpty') + '</div>';
        return;
      }

      container.innerHTML = filtered.map(getSystemLogHtml).join('');
      const autoScroll = document.getElementById('log-auto-scroll');
      if (autoScroll && autoScroll.checked) {
        container.scrollTop = container.scrollHeight;
      }
    }

    function appendSystemLogItem(item) {
      const container = document.getElementById('system-logs-container');
      if (!container) return;
      const levelFilter = document.getElementById('log-level-filter')?.value || 'all';
      const sourceFilter = document.getElementById('log-source-filter')?.value || 'all';
      if (levelFilter !== 'all' && item.level !== levelFilter) return;
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return;

      if (container.children.length === 1 && container.children[0].innerText.includes(t('logEmpty'))) {
        container.innerHTML = '';
      }

      const wrapper = document.createElement('div');
      wrapper.innerHTML = getSystemLogHtml(item);
      container.appendChild(wrapper.firstChild);

      const autoScroll = document.getElementById('log-auto-scroll');
      if (autoScroll && autoScroll.checked) {
        container.scrollTop = container.scrollHeight;
      }
    }

    async function fetchSystemLogs() {
      try {
        const res = await fetch('/api/system/logs?limit=500');
        if (res.ok) {
          const data = await res.json();
          systemLogs = data.logs || [];
          renderSystemLogs();
        }
      } catch (err) {
        console.error('Failed to fetch system logs', err);
      }
    }

    function connectSystemLogsStream() {
      if (systemLogsEventSource) return;
      try {
        const es = new EventSource('/api/system/logs/stream');
        systemLogsEventSource = es;
        es.addEventListener('init', (e) => {
          try {
            const data = JSON.parse(e.data);
            systemLogs = data.logs || [];
            renderSystemLogs();
          } catch (err) {
            console.error('Failed to parse init logs', err);
          }
        });
        es.addEventListener('log', (e) => {
          try {
            const item = JSON.parse(e.data);
            systemLogs.push(item);
            if (systemLogs.length > 1000) {
              systemLogs.shift();
            }
            appendSystemLogItem(item);
          } catch (err) {
            console.error('Failed to parse SSE system log', err);
          }
        });
        es.addEventListener('clear', () => {
          systemLogs = [];
          renderSystemLogs();
        });
        es.onerror = () => {
          es.close();
          systemLogsEventSource = null;
          setTimeout(connectSystemLogsStream, 5000);
        };
      } catch (err) {
        console.error('SSE connect failed', err);
      }
    }

    function filterSystemLogs() {
      renderSystemLogs();
    }

    async function clearSystemLogs() {
      try {
        await fetch('/api/system/logs/clear', { method: 'POST' });
        systemLogs = [];
        renderSystemLogs();
        showToast(currentLang === 'zh' ? '日志已清空' : 'Logs cleared');
      } catch (err) {
        showToast(currentLang === 'zh' ? '清空失败' : 'Failed to clear');
      }
    }

    function copySystemLogs() {
      const levelFilter = document.getElementById('log-level-filter')?.value || 'all';
      const sourceFilter = document.getElementById('log-source-filter')?.value || 'all';

      const filtered = systemLogs.filter(entry => {
        if (levelFilter !== 'all' && entry.level !== levelFilter) return false;
        if (sourceFilter !== 'all' && entry.source !== sourceFilter) return false;
        return true;
      });

      if (filtered.length === 0) {
        return showToast(currentLang === 'zh' ? '暂无日志可复制' : 'No logs to copy');
      }

      const text = filtered.map(e => '[' + (e.time || '') + '] [' + (e.source || '').toUpperCase() + '] [' + (e.level || '').toUpperCase() + '] ' + e.message).join('\\n');
      navigator.clipboard.writeText(text).then(() => {
        showToast(currentLang === 'zh' ? '全部日志已复制到剪贴板！' : 'Logs copied to clipboard!');
      }).catch(() => {
        showToast(currentLang === 'zh' ? '复制失败' : 'Copy failed');
      });
    }

    // Init language, logs and polling
    applyLanguage(currentLang);
    connectSystemLogsStream();
    fetchStatus();
    fetchTasks();
    fetchCredentials();
    setInterval(() => {
      fetchTasks();
    }, 2000);
  </script>
</body>
</html>`;
}
