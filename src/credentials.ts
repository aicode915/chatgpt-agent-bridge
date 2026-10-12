import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROFILE = "chatgpt-agent-bridge";

export interface CredentialsData {
  tunnelId: string;
  apiKey: string;
  apiKeyMasked: string;
  source: string;
  targetEnvPath: string;
}

export function parseEnvFile(filePath: string): Record<string, string> {
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

export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 10) return "******";
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

export function getTargetEnvPath(): string {
  const localEnvPath = path.resolve(process.cwd(), ".env");
  const localExample = path.resolve(process.cwd(), ".env.example");
  if (fs.existsSync(localEnvPath) || fs.existsSync(localExample)) {
    return localEnvPath;
  }
  const userConfigDir = path.join(os.homedir(), ".config", "chatgpt-agent-bridge");
  return path.join(userConfigDir, ".env");
}

export function loadCredentials(): CredentialsData {
  let tunnelId = process.env.CONTROL_PLANE_TUNNEL_ID || "";
  let apiKey = process.env.CONTROL_PLANE_API_KEY || "";
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

  const targetEnvPath = getTargetEnvPath();
  return {
    tunnelId,
    apiKey,
    apiKeyMasked: maskApiKey(apiKey),
    source,
    targetEnvPath,
  };
}

export function ensurePathWithHomebrew(): void {
  const commonDirs = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(os.homedir(), ".local", "bin"),
  ];
  for (const dir of commonDirs) {
    if (fs.existsSync(dir) && !process.env.PATH?.includes(dir)) {
      process.env.PATH = `${dir}:${process.env.PATH || ""}`;
    }
  }
}

export function initTunnelProfile(tunnelId: string, force = false): void {
  ensurePathWithHomebrew();
  const profileDir = path.join(os.homedir(), ".config", "tunnel-client");
  const profilePath = path.join(profileDir, `${PROFILE}.yaml`);
  const serverJsPath = path.resolve(__dirname, "server.js");
  const mcpCommand = `"${process.execPath}" "${serverJsPath}"`;

  let needsInit = force || !fs.existsSync(profilePath);
  if (!needsInit && fs.existsSync(profilePath)) {
    try {
      const content = fs.readFileSync(profilePath, "utf8");
      if (!content.includes(serverJsPath) || !content.includes(tunnelId)) {
        needsInit = true;
      }
    } catch {
      needsInit = true;
    }
  }

  if (needsInit) {
    try {
      execSync(
        `tunnel-client init --sample sample_mcp_stdio_local --profile "${PROFILE}" --tunnel-id "${tunnelId}" --mcp-command '${mcpCommand}' --force`,
        { stdio: "ignore" }
      );
    } catch (err) {
      console.warn(`[credentials] tunnel-client init 警告: ${(err as Error).message}`);
    }
  }
}

export function saveCredentials(newCreds: { tunnelId: string; apiKey?: string }): { success: boolean; targetEnvPath: string } {
  const current = loadCredentials();
  const tunnelId = newCreds.tunnelId?.trim();
  if (!tunnelId) {
    throw new Error("Tunnel ID 不能为空");
  }
  const apiKey = (newCreds.apiKey?.trim()) || current.apiKey;
  if (!apiKey) {
    throw new Error("API Key 不能为空");
  }

  const targetEnvPath = getTargetEnvPath();
  const dir = path.dirname(targetEnvPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let content = "";
  if (fs.existsSync(targetEnvPath)) {
    content = fs.readFileSync(targetEnvPath, "utf8");
  } else {
    const localExample = path.resolve(process.cwd(), ".env.example");
    if (fs.existsSync(localExample)) {
      content = fs.readFileSync(localExample, "utf8");
    } else {
      content = "# ChatGPT Agent Bridge OpenAI Credentials\n";
    }
  }

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

  fs.writeFileSync(targetEnvPath, content.trim() + "\n", { mode: 0o600 });

  process.env.CONTROL_PLANE_TUNNEL_ID = tunnelId;
  process.env.CONTROL_PLANE_API_KEY = apiKey;

  try {
    initTunnelProfile(tunnelId, true);
  } catch (err) {
    console.warn(`[credentials] 刷新 tunnel-client profile 失败: ${(err as Error).message}`);
  }

  return { success: true, targetEnvPath };
}
