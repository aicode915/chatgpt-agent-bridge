/**
 * Embedded Web Dashboard HTML Generator
 * Standalone, zero external dependencies, responsive modern dark UI
 */

export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatGPT Agent Bridge Dashboard</title>
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
    .badge-dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot-online { background-color: var(--success); box-shadow: 0 0 8px var(--success); }
    .dot-warning { background-color: var(--warning); box-shadow: 0 0 8px var(--warning); }
    .dot-danger { background-color: var(--danger); box-shadow: 0 0 8px var(--danger); }
    .dot-muted { background-color: var(--text-muted); box-shadow: none; }
    @keyframes pulse { 0% { opacity: 0.5; transform: scale(0.92); } 50% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0.5; transform: scale(0.92); } }
    .dot-pulse { animation: pulse 1.8s infinite ease-in-out; }
    
    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 8px;
      overflow-x: auto;
    }
    .tab-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      padding: 8px 16px;
      font-size: 14px;
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

    input[type="text"] {
      width: 100%;
      padding: 10px 14px;
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      color: var(--text);
      font-size: 14px;
      outline: none;
    }
    input[type="text"]:focus { border-color: var(--primary); }

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
          <h1>ChatGPT Agent Bridge</h1>
          <span>虚拟模型端点与 Codex 调度控制台</span>
        </div>
      </div>
      <div class="status-badges">
        <div class="badge"><div class="badge-dot dot-online"></div>Bridge Port: <span id="hdr-port">8791</span></div>
        <div class="badge"><div class="badge-dot" id="dot-tunnel"></div>Tunnel: <span id="hdr-tunnel">检查中...</span></div>
        <div class="badge">🔒 安全锁: <span id="hdr-security" style="color: var(--primary);">...</span></div>
        <button class="btn btn-secondary btn-sm" onclick="fetchStatus()">刷新</button>
      </div>
    </header>

    <div class="grid-stats">
      <div class="stat-card">
        <div class="stat-label">活跃会话 / 任务数</div>
        <div class="stat-val" id="stat-tasks">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">允许最高模式</div>
        <div class="stat-val" id="stat-mode">--</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">默认工作目录</div>
        <div class="stat-val" id="stat-workspace" style="font-size: 14px;">--</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">累计交互轮次</div>
        <div class="stat-val" id="stat-turns">0</div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('tasks')">📋 会话与任务监控</button>
      <button class="tab-btn" onclick="switchTab('security')">🛡️ 安全策略与权限锁</button>
      <button class="tab-btn" onclick="switchTab('workspaces')">📁 项目目录管理</button>
      <button class="tab-btn" onclick="switchTab('prompt')">⚡ ChatGPT 提示词助手</button>
      <button class="tab-btn" onclick="switchTab('system')">🔌 隧道与系统看板</button>
    </div>

    <!-- TAB 1: 会话与任务 -->
    <div id="tab-tasks" class="tab-pane active">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Codex 任务列表</div>
          <span style="font-size: 12px; color: var(--text-muted);">自动每 2 秒静默更新</span>
        </div>
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>任务 ID</th>
                <th>状态</th>
                <th>权限模式</th>
                <th>轮次</th>
                <th>目录</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="tasks-table-body">
              <tr><td colspan="7" style="text-align: center; color: var(--text-muted);">暂无运行任务</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 2: 安全策略与权限锁 -->
    <div id="tab-security" class="tab-pane">
      <div class="card">
        <div class="card-header">
          <div class="card-title">服务端权限安全锁 (Security Policy Lock)</div>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
          在此选择系统允许的最高运行模式。<strong>服务端会实施强制安全校验</strong>：如果 ChatGPT 在提示词中发起的任务模式超出了此处的上限，服务端将直接拦截并拒绝启动，保障本地环境不受未经允许的网络或文件写操作影响。
        </p>

        <div class="radio-card-group" id="security-radios">
          <label class="radio-card" id="card-read-only">
            <input type="radio" name="secMode" value="read-only">
            <div class="radio-card-info">
              <h4>🟢 只读模式 (Read-Only)</h4>
              <p>禁止写文件、禁止执行外网网络请求。仅允许 Codex 搜索与阅读本地代码。</p>
            </div>
          </label>

          <label class="radio-card selected" id="card-workspace-write">
            <input type="radio" name="secMode" value="workspace-write" checked>
            <div class="radio-card-info">
              <h4>🟡 工作区修改 (Workspace-Write) - 推荐</h4>
              <p>允许修改当前项目目录内的文件并执行本地 git commit，但底层 <strong>Seatbelt 沙箱严格阻断外网连接</strong>，防止数据外流。</p>
            </div>
          </label>

          <label class="radio-card" id="card-danger-full-access">
            <input type="radio" name="secMode" value="danger-full-access">
            <div class="radio-card-info">
              <h4>🔴 全权限与联网 (Danger-Full-Access)</h4>
              <p>解除沙箱限制，开放完整外网访问与文件系统权限。<strong>支持自动 git push 到远程仓库及安装依赖</strong>。</p>
            </div>
          </label>
        </div>

        <div style="margin-top: 20px;">
          <button class="btn btn-primary" onclick="saveSecurityPolicy()">保存安全锁设置</button>
        </div>
      </div>
    </div>

    <!-- TAB 3: 项目工作区管理 -->
    <div id="tab-workspaces" class="tab-pane">
      <div class="card">
        <div class="card-header">
          <div class="card-title">允许访问的项目目录列表 (Workspaces White-list)</div>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
          Codex 执行任务的 <code>cwd</code> 路径必须属于以下白名单目录之一或其子目录，防止路径跨越逃逸。
        </p>
        <div style="margin-bottom: 20px; overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>目录绝对路径</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="workspaces-table-body">
            </tbody>
          </table>
        </div>

        <div class="card-header" style="margin-top: 24px;">
          <div class="card-title">添加新项目目录</div>
        </div>
        <div style="display: flex; gap: 10px; max-width: 600px;">
          <input type="text" id="new-workspace-input" placeholder="/Users/username/my-project">
          <button class="btn btn-primary" onclick="addWorkspace()">添加目录</button>
        </div>
      </div>
    </div>

    <!-- TAB 4: 提示词助手 -->
    <div id="tab-prompt" class="tab-pane">
      <div class="card">
        <div class="card-header">
          <div class="card-title">ChatGPT 驱动系统提示词 (Driver Prompt)</div>
          <button class="btn btn-primary btn-sm" onclick="copyPrompt()">一键复制提示词</button>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
          根据当前控制台配置的<strong>默认工作目录</strong>和<strong>安全锁最高权限</strong>，自动生成给 ChatGPT 对话的最佳驱动指令：
        </p>
        <div class="terminal-view" id="prompt-preview" style="max-height: 400px; color: #a5f3fc;"></div>
      </div>
    </div>

    <!-- TAB 5: 隧道与系统看板 -->
    <div id="tab-system" class="tab-pane">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Secure MCP Tunnel 状态与管理</div>
          <button class="btn btn-secondary btn-sm" onclick="restartTunnel()">一键重启隧道</button>
        </div>
        <div style="display: flex; gap: 16px; margin-bottom: 16px; align-items: center;">
          <div>隧道健康状况: <strong id="sys-tunnel-status">检查中...</strong></div>
          <button class="btn btn-secondary btn-sm" onclick="checkTunnelHealth()">检测连通性</button>
        </div>
        <p style="font-size: 13px; color: var(--text-muted);">
          隧道服务运行在本地 <code>http://127.0.0.1:8080</code>。若出现 <em>"Tunnel-client has not been seen for 300 seconds"</em>，请点击上方重启隧道或核对 <code>.env</code> 中的隧道 ID。
        </p>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">环境与版本信息</div>
        </div>
        <div style="font-size: 13px; line-height: 2;">
          <div>• <strong>Codex CLI</strong>: <code>>= 0.161.0</code> (OpenAI Responses API)</div>
          <div>• <strong>Node.js</strong>: <span id="sys-node-version">--</span></div>
          <div>• <strong>配置文件路径</strong>: <span id="sys-config-path">bridge-config.json</span></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Task Detail Modal -->
  <div class="modal" id="task-modal">
    <div class="modal-content">
      <button class="modal-close" onclick="closeModal()">✕</button>
      <div class="card-title" id="modal-task-title" style="margin-bottom: 12px;">任务详情</div>
      
      <div style="display: flex; gap: 16px; font-size: 13px; color: var(--text-muted); margin-bottom: 16px; flex-wrap: wrap;">
        <div>状态: <strong id="modal-status">--</strong></div>
        <div>模式: <strong id="modal-mode">--</strong></div>
        <div>目录: <strong id="modal-cwd">--</strong></div>
        <div>总耗时: <strong id="modal-duration">--</strong></div>
      </div>

      <div style="margin-bottom: 16px;">
        <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">Prompt 指令:</div>
        <div class="terminal-view" id="modal-prompt" style="max-height: 90px; color: #f1f5f9;"></div>
      </div>

      <div style="margin-bottom: 16px;">
        <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">交互轮次历史 (Turn History):</div>
        <div id="modal-turns-container" style="display: flex; flex-direction: column; gap: 8px;"></div>
      </div>

      <div style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 12px; font-weight: 600; color: var(--text-muted);">Codex 执行日志 (Live Terminal):</span>
            <span id="modal-stream-badge" class="badge" style="padding: 2px 8px; font-size: 11px;">
              <span class="badge-dot dot-online dot-pulse" id="modal-stream-dot"></span>
              <span id="modal-stream-text">实时连接中</span>
            </span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <label style="font-size: 12px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="modal-auto-scroll" checked> 自动滚动
            </label>
            <button class="btn btn-secondary btn-sm" onclick="clearModalLogs()">清屏</button>
            <button class="btn btn-secondary btn-sm" onclick="copyModalLogs()">复制全部日志</button>
          </div>
        </div>
        <div class="terminal-view" id="modal-stdout" style="max-height: 320px; font-family: Menlo, Monaco, Consolas, monospace; line-height: 1.45;"></div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button class="btn btn-danger btn-sm" id="modal-cancel-btn" onclick="cancelCurrentTask()">终止此任务</button>
        <button class="btn btn-secondary btn-sm" onclick="closeModal()">关闭</button>
      </div>
    </div>
  </div>

  <div id="toast">已复制到剪贴板</div>

  <script>
    let currentData = null;
    let selectedTaskId = null;
    let currentEventSource = null;

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
        text.innerText = 'SSE 实时接收中';
      } else if (status === 'finished') {
        dot.className = 'badge-dot dot-online';
        text.innerText = '任务已完成';
      } else if (status === 'failed') {
        dot.className = 'badge-dot dot-danger';
        text.innerText = '任务异常退出';
      } else if (status === 'abandoned') {
        dot.className = 'badge-dot dot-warning';
        text.innerText = '超时废弃 (Abandoned)';
      } else if (status === 'cancelled') {
        dot.className = 'badge-dot dot-warning';
        text.innerText = '任务已取消';
      } else {
        dot.className = 'badge-dot dot-muted';
        text.innerText = status || '已断开';
      }
    }

    function renderTurnItems(history) {
      const turnsBox = document.getElementById('modal-turns-container');
      if (!history || history.length === 0) {
        turnsBox.innerHTML = '<span style="font-size: 12px; color: var(--text-muted);">暂无轮次记录</span>';
        return;
      }
      turnsBox.innerHTML = history.map(th => {
        const isAnswered = Boolean(th.answeredAt);
        const actionLabels = th.replyLabels ? th.replyLabels.join(', ') : (isAnswered ? '完成' : '处理中...');
        return '<div id="turn-card-' + th.id + '" style="background: rgba(0,0,0,0.25); border: 1px solid var(--card-border); padding: 8px 12px; border-radius: 6px; font-size: 12px;">' +
          '<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">' +
            '<strong>Turn #' + th.seq + ' (' + th.id + ')</strong>' +
            '<span style="color: ' + (isAnswered ? 'var(--success)' : 'var(--warning)') + '; font-weight: 600;">' +
              (isAnswered ? '已回复' : '等待回复中...') +
            '</span>' +
          '</div>' +
          '<div style="color: var(--primary);">回复动作: <span id="turn-labels-' + th.id + '">' + actionLabels + '</span></div>' +
        '</div>';
      }).join('');
    }

    function switchTab(name) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById('tab-' + name).classList.add('active');
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
      document.getElementById('stat-workspace').innerText = data.config.activeWorkspace;
      document.getElementById('sys-node-version').innerText = data.system.nodeVersion;
      document.getElementById('sys-config-path').innerText = data.config.configPath;

      const dot = document.getElementById('dot-tunnel');
      const hdrTunnel = document.getElementById('hdr-tunnel');
      if (data.tunnel.healthy) {
        dot.className = 'badge-dot dot-online';
        hdrTunnel.innerText = 'Connected';
        document.getElementById('sys-tunnel-status').innerHTML = '<span style="color: var(--success);">🟢 正常连通 (200 OK)</span>';
      } else {
        dot.className = 'badge-dot dot-danger';
        hdrTunnel.innerText = 'Offline';
        document.getElementById('sys-tunnel-status').innerHTML = '<span style="color: var(--danger);">⚪ 未检测到运行</span>';
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
        tbody.innerHTML = '<tr><td colspan="3">暂无工作区</td></tr>';
        return;
      }
      tbody.innerHTML = list.map(item => {
        const isActive = item === active;
        return \`<tr>
          <td><code>\${item}</code></td>
          <td>\${isActive ? '<span style="color: var(--success); font-weight: 600;">● 当前默认</span>' : '<span style="color: var(--text-muted);">允许</span>'}</td>
          <td>
            \${!isActive ? \`<button class="btn btn-secondary btn-sm" onclick="setActiveWorkspace('\${encodeURIComponent(item)}')">设为默认</button>\` : ''}
            \${list.length > 1 ? \`<button class="btn btn-danger btn-sm" onclick="removeWorkspace('\${encodeURIComponent(item)}')">删除</button>\` : ''}
          </td>
        </tr>\`;
      }).join('');
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

    function renderTasksTable(tasks) {
      const tbody = document.getElementById('tasks-table-body');
      if (!tasks || tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">暂无运行任务</td></tr>';
        return;
      }
      tbody.innerHTML = tasks.map(t => {
        let badgeColor = 'var(--text-muted)';
        if (t.status === 'running') badgeColor = 'var(--primary)';
        if (t.status === 'finished') badgeColor = 'var(--success)';
        if (t.status === 'failed') badgeColor = 'var(--danger)';
        if (t.status === 'abandoned') badgeColor = 'var(--warning)';

        return \`<tr>
          <td><strong>\${t.task_id}</strong></td>
          <td><span style="color: \${badgeColor}; font-weight: 600;">\${t.status}</span></td>
          <td><code>\${t.mode}</code></td>
          <td>\${t.turns || 0}</td>
          <td title="\${t.cwd}">\${t.cwd.length > 25 ? '...' + t.cwd.slice(-22) : t.cwd}</td>
          <td>\${new Date(t.created_at).toLocaleTimeString()}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="viewTaskDetail('\${t.task_id}')">查看详情</button>
            \${t.status === 'running' ? \`<button class="btn btn-danger btn-sm" onclick="cancelTask('\${t.task_id}')">终止</button>\` : ''}
          </td>
        </tr>\`;
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
        } catch (err) {
          console.error('Parse end event error', err);
        }
      });

      es.onerror = () => {
        if (currentTaskMeta && currentTaskMeta.status === 'running') {
          updateModalStreamBadge('重连中...');
        }
      };
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
      const modeHint = cfg.maxAllowedMode === 'danger-full-access'
        ? '- 需连外网（如 git push、安装远程包）：mode="danger-full-access"\\n   - 修改文件/本地测试：mode="workspace-write"'
        : '- 修改文件/本地测试/本地 commit：mode="workspace-write"\\n   - 只读查看：mode="read-only"';

      const promptText = \`你是驱动本机 Codex 的“模型”。流程：
1) 需要执行本机编码任务时调用 codex_start(prompt, cwd="\${cfg.activeWorkspace}", mode)（当前安全锁最高模式: \${cfg.maxAllowedMode}）。
   \${modeHint}
2) 循环：调用 codex_poll(task_id, wait_secs≈25)：
   - status=model_request：按返回文本里的 REPLY PROTOCOL，用 codex_reply(task_id, turn_id, reply) 作答；
     要执行动作就发 exec 的 JS（如 await tools.exec_command({cmd:"ls"})）；
     【关键收尾】：目标达成后切勿直接在聊天中停止！必须最后调用一次 codex_reply(task_id, turn_id, 'message("任务完成总结")')，使 Codex 正常结束（status=finished）；
   - status=waiting：稍后再次 poll；
   - status=finished/failed/cancelled：停止循环，把最终输出整理给用户。
每步约 2 次工具调用，任务尽量切小；涉及写文件必须指定 mode=workspace-write 或 danger-full-access。\`;

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

    // Init and auto polling
    fetchStatus();
    fetchTasks();
    setInterval(() => {
      fetchTasks();
    }, 2000);
  </script>
</body>
</html>`;
}
