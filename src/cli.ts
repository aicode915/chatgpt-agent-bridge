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
    const commonPaths = [
      `/opt/homebrew/bin/${cmd}`,
      `/usr/local/bin/${cmd}`,
      path.join(os.homedir(), ".local", "bin", cmd),
    ];
    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        if (!process.env.PATH?.includes(path.dirname(p))) {
          process.env.PATH = `${path.dirname(p)}:${process.env.PATH || ""}`;
        }
        return true;
      }
    }
    return false;
  }
}

function getCommandPath(cmd: string): string | null {
  try {
    return execSync(`command -v ${cmd}`, { encoding: "utf8" }).trim();
  } catch {
    const commonPaths = [
      `/opt/homebrew/bin/${cmd}`,
      `/usr/local/bin/${cmd}`,
      path.join(os.homedir(), ".local", "bin", cmd),
    ];
    for (const p of commonPaths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }
}

function checkNodeVersion(): void {
  const [major] = process.versions.node.split(".").map(Number);
  if (major < 18) {
    console.error(`✗ 当前 Node.js 版本为 v${process.versions.node}，chatgpt-agent-bridge 需要 Node.js >= 18.0.0。请先升级 Node.js。`);
    process.exit(1);
  }
}

function isVersionBelow(current: string, target: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const [c1, c2, c3] = parse(current);
  const [t1, t2, t3] = parse(target);
  if (c1 !== t1) return c1 < t1;
  if (c2 !== t2) return c2 < t2;
  return c3 < t3;
}

async function ensureDependencies(): Promise<void> {
  const missing: Array<{
    name: string;
    description: string;
    required: boolean;
    installCmd: string;
    manualHint: string;
  }> = [];

  if (!checkCommand("tunnel-client")) {
    missing.push({
      name: "tunnel-client",
      description: "OpenAI 官方 Secure MCP Tunnel 客户端",
      required: true,
      installCmd: "brew tap openai/tools && brew install openai/tools/tunnel-client",
      manualHint: "brew tap openai/tools && brew install openai/tools/tunnel-client 或访问 https://platform.openai.com/settings/organization/tunnels",
    });
  }

  if (!checkCommand("codex")) {
    missing.push({
      name: "codex",
      description: "OpenAI Codex CLI (>= 0.161.0)",
      required: true,
      installCmd: "brew install codex",
      manualHint: "brew install codex 或访问 https://github.com/openai/codex",
    });
  }

  if (!checkCommand("git")) {
    missing.push({
      name: "git",
      description: "Git 版本管理工具 (用于代码变更追踪与 diff 对比)",
      required: false,
      installCmd: "brew install git",
      manualHint: "brew install git 或执行 xcode-select --install",
    });
  }

  const hasBrew = checkCommand("brew");
  const isInteractive = Boolean(process.stdin.isTTY);

  if (!hasBrew && missing.some((d) => d.required && !checkCommand(d.name))) {
    console.log("\nℹ️  提示：系统未检测到 Homebrew 包管理器。");
    console.log('   在 macOS 上推荐先安装 Homebrew: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"\n');
  }

  for (const dep of missing) {
    if (checkCommand(dep.name)) continue;

    console.log(`\n⚠️  未检测到${dep.required ? "必需" : "推荐"}依赖: ${dep.name} (${dep.description})`);

    if (hasBrew && isInteractive) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = (
          await rl.question(
            `👉 是否通过 Homebrew 自动安装 ${dep.name}？\n   [执行命令: ${dep.installCmd}] [Y/n]: `
          )
        ).trim().toLowerCase();
        rl.close();

        if (!answer || answer === "y" || answer === "yes") {
          console.log(`\n⏳ 正在自动安装 ${dep.name}，请稍候...`);
          try {
            execSync(dep.installCmd, { stdio: "inherit" });
            if (checkCommand(dep.name)) {
              console.log(`✓ ${dep.name} 安装成功！\n`);
              continue;
            } else {
              console.error(`✗ 安装命令执行完成，但在 PATH 中仍未找到 '${dep.name}'。`);
            }
          } catch (err: any) {
            console.error(`✗ 自动安装 ${dep.name} 失败: ${err?.message || err}`);
          }
        } else {
          console.log(`  已跳过自动安装 ${dep.name}。`);
        }
      } catch {
        rl.close();
      }
    }

    if (dep.required && !checkCommand(dep.name)) {
      console.error(`\n✗ 缺少必需工具 '${dep.name}'。请先手动安装：`);
      console.error(`  ${dep.manualHint}\n`);
      process.exit(1);
    }
  }

  // 校验已安装的 codex 版本是否满足最低要求
  const codexVer = getCodexVersion();
  if (codexVer && isVersionBelow(codexVer, "0.161.0")) {
    console.warn(`\n⚠️  提示：检测到当前 codex 版本为 v${codexVer}，低于推荐版本 v0.161.0。`);
    console.warn("   Codex 0.161 起彻底移除了旧版 wire_api，建议运行 'brew upgrade codex' 升级以防交互报错。\n");
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

async function runSetupWizard(
  configManager: ConfigManager,
  existingCreds?: { tunnelId?: string; apiKey?: string }
): Promise<{ tunnelId: string; apiKey: string }> {
  console.log("");
  console.log("==================================================================");
  console.log("  🚀 欢迎使用 ChatGPT Agent Bridge 首次配置向导 (Setup Wizard)");
  console.log("==================================================================");
  console.log("现在为您引导配置 OpenAI 隧道凭证与本地项目工作区：\n");
  console.log("提示：若尚未创建隧道或密钥，请访问：");
  console.log("  • 隧道 ID：https://platform.openai.com/settings/organization/tunnels");
  console.log("  • 运行时密钥：https://platform.openai.com/settings/organization/api-keys");
  console.log("------------------------------------------------------------------\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let tunnelId = "";
  while (!tunnelId) {
    const hint = existingCreds?.tunnelId ? ` [当前: ${existingCreds.tunnelId}]` : " (如 tunnel_xxxx)";
    const input = await rl.question(`👉 请输入 OpenAI Tunnel ID${hint}: `);
    tunnelId = input.trim() || (existingCreds?.tunnelId ?? "");
    if (!tunnelId) console.log("  ⚠️ Tunnel ID 不能为空，请重新输入");
  }

  let apiKey = "";
  while (!apiKey) {
    const hint = existingCreds?.apiKey ? " [当前: 已配置 (回车保持)]" : " (如 sk-...)";
    const input = await rl.question(`👉 请输入 OpenAI 运行时 API Key${hint}: `);
    apiKey = input.trim() || (existingCreds?.apiKey ?? "");
    if (!apiKey) console.log("  ⚠️ API Key 不能为空，请重新输入");
  }

  const port = process.env.BRIDGE_PORT ?? DEFAULT_PORT;
  const defaultCwd = path.resolve(process.cwd());

  console.log("\n------------------------------------------------------------------");
  console.log("📁 项目工作区配置 (Workspace Configuration)");
  console.log("------------------------------------------------------------------\n");

  let chosenWorkspace: string | null = null;
  while (chosenWorkspace === null) {
    const input = (
      await rl.question(
        `👉 当前工作目录为 [${defaultCwd}]，是否将其设为默认项目目录？[Y/n/输入自定义路径]: `
      )
    ).trim();

    if (!input || input.toLowerCase() === "y" || input.toLowerCase() === "yes") {
      chosenWorkspace = defaultCwd;
      configManager.setActiveWorkspace(chosenWorkspace);
      console.log(`  ✓ 已将当前目录设为默认项目目录: ${chosenWorkspace}`);
    } else if (input.toLowerCase() === "n" || input.toLowerCase() === "no") {
      chosenWorkspace = "";
      configManager.clearWorkspaces();
      console.log(
        `  💡 提示: 您尚未指定开发项目目录，Codex 将无法进行文件读写。可随时在 Web 控制台 (http://127.0.0.1:${port}) 一键点选本地目录。`
      );
    } else {
      let customPath = input;
      if (customPath.startsWith("~")) {
        customPath = path.join(os.homedir(), customPath.slice(1));
      }
      const resolved = path.resolve(customPath);
      if (fs.existsSync(resolved)) {
        if (fs.statSync(resolved).isDirectory()) {
          chosenWorkspace = resolved;
          configManager.setActiveWorkspace(chosenWorkspace);
          console.log(`  ✓ 已将指定目录设为默认项目目录: ${chosenWorkspace}`);
        } else {
          console.log(`  ⚠️ 指定路径不是一个目录: ${resolved}，请重新输入。`);
        }
      } else {
        const createInput = (
          await rl.question(`  ⚠️ 目录不存在: ${resolved}，是否自动创建？[Y/n]: `)
        )
          .trim()
          .toLowerCase();
        if (!createInput || createInput === "y" || createInput === "yes") {
          try {
            fs.mkdirSync(resolved, { recursive: true });
            chosenWorkspace = resolved;
            configManager.setActiveWorkspace(chosenWorkspace);
            console.log(`  ✓ 成功创建并设为默认项目目录: ${chosenWorkspace}`);
          } catch (err) {
            console.log(`  ⚠️ 创建目录失败: ${(err as Error).message}，请重新输入。`);
          }
        } else {
          console.log("  请重新输入有效目录路径，或输入 'n' 跳过设置。");
        }
      }
    }
  }

  rl.close();

  const localExample = path.resolve(process.cwd(), ".env.example");
  let targetEnvPath: string;
  if (fs.existsSync(localExample)) {
    targetEnvPath = path.resolve(process.cwd(), ".env");
    let content = fs.existsSync(targetEnvPath)
      ? fs.readFileSync(targetEnvPath, "utf8")
      : fs.readFileSync(localExample, "utf8");
    if (/CONTROL_PLANE_TUNNEL_ID=.*/.test(content)) {
      content = content.replace(/CONTROL_PLANE_TUNNEL_ID=.*/, `CONTROL_PLANE_TUNNEL_ID=${tunnelId}`);
    } else {
      content += `\nCONTROL_PLANE_TUNNEL_ID=${tunnelId}`;
    }
    if (/CONTROL_PLANE_API_KEY=.*/.test(content)) {
      content = content.replace(/CONTROL_PLANE_API_KEY=.*/, `CONTROL_PLANE_API_KEY=${apiKey}`);
    } else {
      content += `\nCONTROL_PLANE_API_KEY=${apiKey}`;
    }
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

  console.log(`\n✓ 成功保存 OpenAI 凭证至: ${targetEnvPath}`);
  console.log(`✓ 成功保存工作区配置至: ${configManager.configPath}`);
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
  console.log(`• git:             ${getCommandPath("git") ?? "⚠️ 未检测到 (Not Detected)"}`);
  console.log("------------------------------------------------------------------");
  console.log(`• 配置文件路径:    ${configManager.configPath}`);
  console.log(`• 凭证来源:        ${creds.source ?? "未配置"}`);
  console.log(`• 隧道 ID:         ${creds.tunnelId ? creds.tunnelId : "✗ 未配置"}`);
  console.log(`• 运行时密钥:      ${creds.apiKey ? `${creds.apiKey.slice(0, 7)}...****` : "✗ 未配置"}`);
  console.log("------------------------------------------------------------------");
  console.log(`• 当前工作区:      ${cfg.activeWorkspace || "(未配置 - 可在 Web 控制台一键选择)"}`);
  if (!cfg.activeWorkspace) {
    console.log(`  ⚠️ 提示: 您尚未指定开发项目目录，Codex 将无法进行文件读写。可随时在 Web 控制台 (http://127.0.0.1:${port}) 一键点选本地目录。`);
  }
  console.log(`• 允许访问工作区:  ${cfg.allowedWorkspaces.length > 0 ? cfg.allowedWorkspaces.join(", ") : "(无)"}`);
  console.log(`• 执行权限模式:    ${cfg.maxAllowedMode}`);
  console.log("------------------------------------------------------------------");
  console.log(`• 隧道运行状态:    ${pids.length > 0 ? `🟢 运行中 (PID: ${pids.join(", ")})` : "⚪ 未运行 (Stopped)"}`);
  console.log(`• Web 控制台地址:  http://127.0.0.1:${port}`);
  console.log("==================================================================\n");
}

async function main(): Promise<void> {
  checkNodeVersion();

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

  await ensureDependencies();

  const configManager = new ConfigManager();
  if (process.env.WORKSPACE_ROOT) {
    try {
      configManager.setActiveWorkspace(process.env.WORKSPACE_ROOT);
    } catch {}
  }

  let creds = loadCredentials();
  if (firstArg === "init" || !creds.tunnelId || !creds.apiKey) {
    if (process.stdin.isTTY) {
      creds = await runSetupWizard(configManager, creds);
    } else {
      console.error("✗ 未检测到有效 OpenAI 凭证 (CONTROL_PLANE_TUNNEL_ID / CONTROL_PLANE_API_KEY)。");
      console.error("  非交互式环境中请先通过环境变量或 .env 文件提供凭证。");
      process.exit(1);
    }
  }

  const tunnelId = creds.tunnelId!;
  const apiKey = creds.apiKey!;
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
  console.log(`  • 当前工作区: ${cfg.activeWorkspace || "(未配置 - 可在 Web 控制台一键选择)"}`);
  console.log(`  • 权限模式:   ${cfg.maxAllowedMode}`);
  if (!cfg.activeWorkspace) {
    console.log("------------------------------------------------------------------");
    console.log(`  ⚠️ 提示: 您尚未指定开发项目目录，Codex 将无法进行文件读写。可随时在 Web 控制台 (http://127.0.0.1:${port}) 一键点选本地目录。`);
  }
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
