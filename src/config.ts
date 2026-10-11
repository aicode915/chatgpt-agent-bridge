import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type TaskMode } from "./bridge.js";

export interface BridgeConfigData {
  maxAllowedMode: TaskMode;
  allowedWorkspaces: string[];
  activeWorkspace: string;
}

const MODE_RANKS: Record<TaskMode, number> = {
  "read-only": 1,
  "workspace-write": 2,
  "danger-full-access": 3,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BRIDGE_ROOT = path.resolve(__dirname, "..");

export class ConfigManager {
  readonly configPath: string;
  private data: BridgeConfigData;

  constructor(customPathOrDir?: string) {
    if (customPathOrDir) {
      const resolved = path.resolve(customPathOrDir);
      try {
        if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
          this.configPath = path.resolve(resolved, "bridge-config.json");
        } else if (resolved.endsWith(".json")) {
          this.configPath = resolved;
        } else {
          this.configPath = path.resolve(resolved, "bridge-config.json");
        }
      } catch {
        this.configPath = path.resolve(resolved, "bridge-config.json");
      }
    } else if (process.env.BRIDGE_CONFIG_PATH) {
      this.configPath = path.resolve(process.env.BRIDGE_CONFIG_PATH);
    } else {
      const cwdConfig = path.resolve(process.cwd(), "bridge-config.json");
      const rootConfig = path.resolve(BRIDGE_ROOT, "bridge-config.json");
      if (fs.existsSync(cwdConfig)) {
        this.configPath = cwdConfig;
      } else if (fs.existsSync(rootConfig)) {
        this.configPath = rootConfig;
      } else {
        const userConfigDir = path.join(os.homedir(), ".config", "chatgpt-agent-bridge");
        this.configPath = path.join(userConfigDir, "bridge-config.json");
      }
    }

    const envWorkspace = process.env.WORKSPACE_ROOT ? path.resolve(process.env.WORKSPACE_ROOT) : "";
    const defaultWorkspace = envWorkspace || (fs.existsSync(process.cwd()) ? path.resolve(process.cwd()) : "");
    this.data = {
      maxAllowedMode: "workspace-write",
      allowedWorkspaces: defaultWorkspace ? [defaultWorkspace] : [],
      activeWorkspace: defaultWorkspace,
    };
    this.load();
  }

  load(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, "utf8");
        const parsed = JSON.parse(raw) as Partial<BridgeConfigData>;
        if (parsed.maxAllowedMode && ["read-only", "workspace-write", "danger-full-access"].includes(parsed.maxAllowedMode)) {
          this.data.maxAllowedMode = parsed.maxAllowedMode;
        }
        if (Array.isArray(parsed.allowedWorkspaces)) {
          this.data.allowedWorkspaces = parsed.allowedWorkspaces.map((p) => path.resolve(p));
        }
        if (typeof parsed.activeWorkspace === "string") {
          this.data.activeWorkspace = parsed.activeWorkspace ? path.resolve(parsed.activeWorkspace) : "";
        }
      }
    } catch (err) {
      console.error(`[config] failed to load ${this.configPath}: ${(err as Error).message}`);
    }
  }

  save(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2), "utf8");
    } catch (err) {
      console.error(`[config] failed to save ${this.configPath}: ${(err as Error).message}`);
    }
  }

  get(): BridgeConfigData {
    return {
      maxAllowedMode: this.data.maxAllowedMode,
      allowedWorkspaces: [...this.data.allowedWorkspaces],
      activeWorkspace: this.data.activeWorkspace,
    };
  }

  setMaxAllowedMode(mode: TaskMode): void {
    if (!["read-only", "workspace-write", "danger-full-access"].includes(mode)) {
      throw new Error(`Invalid mode: ${mode}`);
    }
    this.data.maxAllowedMode = mode;
    this.save();
  }

  addWorkspace(targetPath: string): string {
    const resolved = path.resolve(targetPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Directory does not exist: ${resolved}`);
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${resolved}`);
    }
    if (!this.data.allowedWorkspaces.includes(resolved)) {
      this.data.allowedWorkspaces.push(resolved);
    }
    if (!this.data.activeWorkspace) {
      this.data.activeWorkspace = resolved;
    }
    this.save();
    return resolved;
  }

  removeWorkspace(targetPath: string): void {
    const resolved = path.resolve(targetPath);
    this.data.allowedWorkspaces = this.data.allowedWorkspaces.filter((p) => p !== resolved);
    if (this.data.activeWorkspace === resolved) {
      this.data.activeWorkspace = this.data.allowedWorkspaces[0] ?? "";
    }
    this.save();
  }

  setActiveWorkspace(targetPath: string): string {
    const resolved = path.resolve(targetPath);
    if (!this.data.allowedWorkspaces.includes(resolved)) {
      this.addWorkspace(resolved);
    }
    this.data.activeWorkspace = resolved;
    this.save();
    return resolved;
  }

  isPathAllowed(targetPath: string): boolean {
    if (this.data.allowedWorkspaces.length === 0) {
      return false;
    }
    const resolved = path.resolve(targetPath);
    return this.data.allowedWorkspaces.some(
      (root) => resolved === root || resolved.startsWith(root + path.sep),
    );
  }

  validateMode(requestedMode: TaskMode): { allowed: boolean; reason?: string } {
    const reqRank = MODE_RANKS[requestedMode] ?? 999;
    const maxRank = MODE_RANKS[this.data.maxAllowedMode] ?? 1;
    if (reqRank > maxRank) {
      return {
        allowed: false,
        reason: `Requested mode '${requestedMode}' exceeds maximum allowed mode '${this.data.maxAllowedMode}' (Security Lock is active).`,
      };
    }
    return { allowed: true };
  }
}
