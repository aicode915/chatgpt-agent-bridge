import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getVersion(): string {
  try {
    let curr = __dirname;
    for (let i = 0; i < 3; i++) {
      const pkgPath = path.resolve(curr, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
        if (pkg.version) return pkg.version;
      }
      curr = path.resolve(curr, "..");
    }
  } catch {}
  return "0.1.0";
}

const execFileAsync = promisify(execFile);

export async function pickDirectoryDialog(): Promise<{ path?: string; cancelled?: boolean; error?: string }> {
  const platform = process.platform;
  if (platform === "darwin") {
    try {
      const script = 'POSIX path of (choose folder with prompt "请选择要允许 Codex 访问的项目目录:")';
      const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 120000 });
      let selected = stdout.trim();
      if (selected.endsWith("/") && selected.length > 1) {
        selected = selected.slice(0, -1);
      }
      return { path: selected };
    } catch (err: any) {
      if (err.code === 1 || err.stderr?.includes("-128") || err.message?.includes("User cancelled")) {
        return { cancelled: true };
      }
      return { error: `无法调起 macOS 目录选择器: ${err.message}` };
    }
  } else if (platform === "linux") {
    try {
      const { stdout } = await execFileAsync("zenity", ["--file-selection", "--directory", "--title=请选择项目目录"], { timeout: 120000 });
      return { path: stdout.trim() };
    } catch (err: any) {
      if (err.code === 1) return { cancelled: true };
      try {
        const { stdout } = await execFileAsync("kdialog", ["--getexistingdirectory", "."], { timeout: 120000 });
        return { path: stdout.trim() };
      } catch (kErr: any) {
        if (kErr.code === 1) return { cancelled: true };
        return { error: `未检测到 zenity 或 kdialog，请使用手动输入绝对路径` };
      }
    }
  } else if (platform === "win32") {
    try {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = '请选择项目目录'; if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }`;
      const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", ps], { timeout: 120000 });
      const selected = stdout.trim();
      if (!selected) return { cancelled: true };
      return { path: selected };
    } catch (err: any) {
      return { error: `无法调起 Windows 目录选择器: ${err.message}` };
    }
  }
  return { error: `当前平台 (${platform}) 不支持自动弹窗，请使用手动输入路径` };
}
