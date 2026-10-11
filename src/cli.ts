#!/usr/bin/env node
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { ConfigManager } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROFILE = "chatgpt-agent-bridge";
const DEFAULT_PORT = 8791;

function getVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "..", "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
      return pkg.version ?? "0.1.0";
    }
  } catch {}
  return "0.1.0";
}

function checkCommand(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getCommandPath(cmd: string): string | null {
  try {
    return execSync(`command -v ${cmd}`, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function getCodexVersion(): string | null {
  try {
    const out = execSync("codex --version", { encoding: "utf8" }).trim();
    const match = out.match(/codex-cli\s+([^\s\n]+)/);
    return match ? match[1] : out;
  } catch {
    return null;
  }
}

function getTunnelPids(): number[] {
  try {
    const stdout = execSync(`pgrep -f "tunnel-client run --profile ${PROFILE}"`, { encoding: "utf8" });
    return stdout
      .trim()
      .split("\n")
      .map((line) => parseInt(line.trim(), 10))
      .filter((pid) => !isNaN(pid) && pid !== process.pid);
  } catch {
    return [];
  }
}

async function stopTunnel(): Promise<void> {
  const pids = getTunnelPids();
  if (pids.length === 0) return;
  console.log("→ 正在停止现有隧道进程...");
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  const start = Date.now();
  while (Date.now() - start < 8000) {
    await new Promise((r) => setTimeout(r, 250));
    if (getTunnelPids().length === 0) {
      console.log("✓ 旧隧道进程已成功停止。");
      return;
    }
  }
  for (const pid of getTunnelPids()) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return result;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        result[key] = val;
      }
    }
  } catch {}
  return result;
}

function loadCredentials(): { tunnelId?: string; apiKey?: string; source?: string } {
  let tunnelId = process.env.CONTROL_PLANE_TUNNEL_ID;
  let apiKey = process.env.CONTROL_PLANE_API_KEY;
  let source = "process.env";

  const localEnvPath = path.resolve(process.cwd(), ".env");
  if ((!tunnelId || !apiKey) && fs.existsSync(localEnvPath)) {
    const parsed = parseEnvFile(localEnvPath);
    if (!tunnelId && parsed.CONTROL_PLANE_TUNNEL_ID) {
      tunnelId = parsed.CONTROL_PLANE_TUNNEL_ID;
      process.env.CONTROL_PLANE_TUNNEL_ID = tunnelId;
    }
    if (!apiKey && parsed.CONTROL_PLANE_API_KEY) {
      apiKey = parsed.CONTROL_PLANE_API_KEY;
      process.env.CONTROL_PLANE_API_KEY = apiKey;
    }
    source = localEnvPath;
  }

  const globalEnvPath = path.join(os.homedir(), ".config", "chatgpt-agent-bridge", ".env");
  if ((!tunnelId || !apiKey) && fs.existsSync(globalEnvPath)) {
    const parsed = parseEnvFile(globalEnvPath);
    if (!tunnelId && parsed.CONTROL_PLANE_TUNNEL_ID) {
      tunnelId = parsed.CONTROL_PLANE_TUNNEL_ID;
      process.env.CONTROL_PLANE_TUNNEL_ID = tunnelId;
    }
    if (!apiKey && parsed.CONTROL_PLANE_API_KEY) {
      apiKey = parsed.CONTROL_PLANE_API_KEY;
      process.env.CONTROL_PLANE_API_KEY = apiKey;
    }
    source = globalEnvPath;
  }

  return { tunnelId, apiKey, source };
}

async function runSetupWizard(): Promise<{ tunnelId: string; apiKey: string }> {
  console.log("");
  console.log("==================================================================");
  console.log("  🚀 欢迎使用 ChatGPT Agent Bridge 首次配置向导 (Setup Wizard)");
  console.log("==================================================================");
  console.log("检测到尚未配置 OpenAI 凭证，现在为您引导生成配置文件：\n");
  console.log("提示：若尚未创建隧道或密钥，请访问：");
  console.log("  • 隧道 ID：https://platform.openai.com/settings/organization/tunnels");
  console.log("  • 运行时密钥：https://platform.openai.com/settings/organization/api-keys");
  console.log("------------------------------------------------------------------\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let tunnelId = "";
  while (!tunnelId) {
    const input = await rl.question("👉 请输入 OpenAI Tunnel ID (如 tunnel_xxxx): ");
    tunnelId = input.trim();
    if (!tunnelId) console.log("  ⚠️ Tunnel ID 不能为空，请重新输入");
  }

  let apiKey = "";
  while (!apiKey) {
    const input = await rl.question("👉 请输入 OpenAI 运行时 API Key (如 sk-...): ");
    apiKey = input.trim();
    if (!apiKey) console.log("  ⚠️ API Key 不能为空，请重新输入");
  }
  rl.close();

  const localExample = path.resolve(process.cwd(), ".env.example");
  let targetEnvPath: string;
  if (fs.existsSync(localExample)) {
    targetEnvPath = path.resolve(process.cwd(), ".env");
    let content = fs.readFileSync(localExample, "utf8");
    content = content.replace(/CONTROL_PLANE_TUNNEL_ID=.*/, `CONTROL_PLANE_TUNNEL_ID=${tunnelId}`);
    content = content.replace(/CONTROL_PLANE_API_KEY=.*/, `CONTROL_PLANE_API_KEY=${apiKey}`);
    fs.writeFileSync(targetEnvPath, content, { mode: 0o600 });
  } else {
    const userConfigDir = path.join(os.homedir(), ".config", "chatgpt-agent-bridge");
    if (!fs.existsSync(userConfigDir)) {
      fs.mkdirSync(userConfigDir, { recursive: true });
    }
    targetEnvPath = path.join(userConfigDir, ".env");
    const content = `# ChatGPT Agent Bridge OpenAI Credentials\nCONTROL_PLANE_TUNNEL_ID=${tunnelId}\nCONTROL_PLANE_API_KEY=${apiKey}\n`;
    fs.writeFileSync(targetEnvPath, content, { mode: 0o600 });
  }

  process.env.CONTROL_PLANE_TUNNEL_ID = tunnelId;
  process.env.CONTROL_PLANE_API_KEY = apiKey;

  console.log(`\n✓ 成功创建并保存配置文件至: ${targetEnvPath}`);
  console.log("------------------------------------------------------------------\n");

  return { tunnelId, apiKey };
}

function initTunnelProfile(tunnelId: string, force = false): void {
  const profileDir = path.join(os.homedir(), ".config", "tunnel-client");
  const profilePath = path.join(profileDir, `${PROFILE}.yaml`);
  const serverJsPath = path.resolve(__dirname, "server.js");
  const mcpCommand = `"${process.execPath}" "${serverJsPath}"`;

  let needsInit = force || !fs.existsSync(profilePath);
  if (!needsInit && fs.existsSync(profilePath)) {
    try {
      const content = fs.readFileSync(profilePath, "utf8");
      if (!content.includes(serverJsPath)) {
        needsInit = true;
      }
    } catch {
      needsInit = true;
    }
  }

  if (needsInit) {
    console.log(`→ 正在配置 tunnel profile (${PROFILE})...`);
    execSync(
      `tunnel-client init --sample sample_mcp_stdio_local --profile "${PROFILE}" --tunnel-id "${tunnelId}" --mcp-command '${mcpCommand}' --force`,
      { stdio: "inherit" }
    );
  }
}

function printHelp(): void {
  const version = getVersion();
  console.log(`
ChatGPT Agent Bridge v${version}
极简连接 ChatGPT 与本机 Codex 的 MCP 隧道桥接服务（免代码克隆、零 Quota 消耗）

用法 (Usage):
  chatgpt-agent-bridge [命令 / 选项]
  npx chatgpt-agent-bridge [命令 / 选项]

常用命令 (Commands):
  (默认)                 交互式向导配置并启动隧道桥接
  server                 以 MCP Stdio 协议直接运行服务端（供 tunnel-client 或宿主调用）
  status                 查看当前配置、凭证与隧道运行状态
  init                   重新运行首次交互式配置向导并更新 Profile

常用选项 (Options):
  -r, --restart          若已有隧道在运行，先停止并重新拉起
  -p, --port <port>      自定义 Web 控制台与桥接端口 (默认: 8791)
  -w, --workspace <dir>  添加/激活指定的工作区目录 (默认: 当前目录)
  -c, --config <file>    指定 bridge-config.json 配置文件路径
  -v, --version          查看当前版本
  -h, --help             查看帮助信息

示例 (Examples):
  npx chatgpt-agent-bridge               # 一键极简启动
  npx chatgpt-agent-bridge --restart     # 重启隧道
  npx chatgpt-agent-bridge status        # 查看当前状态
  npx chatgpt-agent-bridge server        # Stdio MCP 模式
`);
}

async function showStatus(): Promise<void> {
  const version = getVersion();
  const configManager = new ConfigManager();
  const cfg = configManager.get();
  const creds = loadCredentials();
  const pids = getTunnelPids();
  const port = process.env.BRIDGE_PORT ?? DEFAULT_PORT;

  console.log("\n==================================================================");
  console.log(`  ChatGPT Agent Bridge Status (v${version})`);
  console.log("==================================================================");
  console.log(`• Node.js:         ${process.version} (${process.execPath})`);
  console.log(`• tunnel-client:   ${getCommandPath("tunnel-client") ?? "✗ 未安装 (Not Installed)"}`);
  console.log(`• codex:           ${getCommandPath("codex") ?? "⚠️ 未检测到 (Not Detected)"} (版本: ${getCodexVersion() ?? "未知"})`);
  console.log("------------------------------------------------------------------");
  console.log(`• 配置文件路径:    ${configManager.configPath}`);
  console.log(`• 凭证来源:        ${creds.source ?? "未配置"}`);
  console.log(`• 隧道 ID:         ${creds.tunnelId ? creds.tunnelId : "✗ 未配置"}`);
  console.log(`• 运行时密钥:      ${creds.apiKey ? `${creds.apiKey.slice(0, 7)}...****` : "✗ 未配置"}`);
  console.log("------------------------------------------------------------------");
  console.log(`• 当前工作区:      ${cfg.activeWorkspace || "(未指定，可通过控制台添加)"}`);
  console.log(`• 允许访问工作区:  ${cfg.allowedWorkspaces.length > 0 ? cfg.allowedWorkspaces.join(", ") : "(无)"}`);
  console.log(`• 执行权限模式:    ${cfg.maxAllowedMode}`);
  console.log("------------------------------------------------------------------");
  console.log(`• 隧道运行状态:    ${pids.length > 0 ? `🟢 运行中 (PID: ${pids.join(", ")})` : "⚪ 未运行 (Stopped)"}`);
  console.log(`• Web 控制台地址:  http://127.0.0.1:${port}`);
  console.log("==================================================================\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("-v") || args.includes("--version")) {
    console.log(`chatgpt-agent-bridge v${getVersion()}`);
    process.exit(0);
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-p" || args[i] === "--port") {
      process.env.BRIDGE_PORT = args[i + 1];
      i++;
    } else if (args[i] === "-w" || args[i] === "--workspace") {
      process.env.WORKSPACE_ROOT = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === "-c" || args[i] === "--config") {
      process.env.BRIDGE_CONFIG_PATH = path.resolve(args[i + 1]);
      i++;
    }
  }

  const firstArg = args[0];
  if (firstArg === "server" || args.includes("--server")) {
    await import("./server.js");
    return;
  }

  if (firstArg === "status" || args.includes("--status")) {
    await showStatus();
    process.exit(0);
  }

  if (!checkCommand("tunnel-client")) {
    console.error("✗ 未检测到 'tunnel-client' 命令。请先安装 OpenAI 官方 tunnel-client 工具：");
    console.error("  参考：brew install tunnel-client 或访问 https://platform.openai.com/settings/organization/tunnels");
    process.exit(1);
  }

  if (!checkCommand("codex")) {
    console.warn("⚠️ 提示：系统 PATH 中未检测到 'codex' 命令。Codex CLI (>= 0.161.0) 为必需依赖：");
    console.warn("  参考：brew install codex 或访问 https://github.com/openai/codex\n");
  }

  let creds = loadCredentials();
  if (firstArg === "init" || !creds.tunnelId || !creds.apiKey) {
    if (process.stdin.isTTY) {
      creds = await runSetupWizard();
    } else {
      console.error("✗ 未检测到有效 OpenAI 凭证 (CONTROL_PLANE_TUNNEL_ID / CONTROL_PLANE_API_KEY)。");
      console.error("  非交互式环境中请先通过环境变量或 .env 文件提供凭证。");
      process.exit(1);
    }
  }

  const tunnelId = creds.tunnelId!;
  const apiKey = creds.apiKey!;

  const configManager = new ConfigManager();
  if (process.env.WORKSPACE_ROOT) {
    try {
      configManager.setActiveWorkspace(process.env.WORKSPACE_ROOT);
    } catch {}
  }
  const cfg = configManager.get();

  initTunnelProfile(tunnelId, firstArg === "init");

  const restartRequested = args.includes("-r") || args.includes("--restart");
  const runningPids = getTunnelPids();

  if (runningPids.length > 0) {
    if (restartRequested) {
      await stopTunnel();
    } else {
      const port = process.env.BRIDGE_PORT ?? DEFAULT_PORT;
      console.log(`✓ 隧道已在运行 (profile: ${PROFILE}, PID: ${runningPids.join(", ")})`);
      console.log(`  • Web 控制台: http://127.0.0.1:${port}`);
      console.log(`  • 重新启动:   npx chatgpt-agent-bridge --restart`);
      console.log(`  • 健康检查:   tunnel-client health --url http://127.0.0.1:8080`);
      process.exit(0);
    }
  }

  const port = process.env.BRIDGE_PORT ?? DEFAULT_PORT;
  console.log("");
  console.log("==================================================================");
  console.log(`  🚀 ChatGPT Agent Bridge 正在启动 (v${getVersion()})`);
  console.log("==================================================================");
  console.log(`  • 隧道配置:   profile=${PROFILE}`);
  console.log(`  • 隧道 ID:     ${tunnelId}`);
  console.log(`  • Web 控制台: http://127.0.0.1:${port}`);
  console.log(`  • 当前工作区: ${cfg.activeWorkspace || "(可在 Web 控制台随时添加)"}`);
  console.log(`  • 权限模式:   ${cfg.maxAllowedMode}`);
  console.log("------------------------------------------------------------------");
  console.log("  💡 提示: 配置 ChatGPT 自定义指令后，在 ChatGPT 中直接对话即可驱动本机 Codex！");
  console.log("  按 Ctrl+C 可随时停止隧道服务。");
  console.log("==================================================================\n");

  const child = spawn("tunnel-client", ["run", "--profile", PROFILE], {
    stdio: "inherit",
    env: {
      ...process.env,
      CONTROL_PLANE_TUNNEL_ID: tunnelId,
      CONTROL_PLANE_API_KEY: apiKey,
      BRIDGE_PORT: String(port),
    },
  });

  const onSignal = (sig: NodeJS.Signals) => {
    if (child.pid) {
      try {
        process.kill(child.pid, sig);
      } catch {}
    }
  };

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  child.on("exit", (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(`✗ 执行出错: ${(err as Error).message}`);
  process.exit(1);
});
