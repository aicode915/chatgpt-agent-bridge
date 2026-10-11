import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface GitDiffResult {
  isGitRepo: boolean;
  hasChanges: boolean;
  stat: string;
  diff: string;
  files: Array<{
    file: string;
    status: "modified" | "added" | "deleted" | "renamed";
  }>;
  untracked: string[];
}

/**
 * Execute git command safely with timeout
 */
function runGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, timeout: 5000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        stdout: (stdout ?? "").toString(),
        stderr: (stderr ?? "").toString(),
        code: error ? (error as any).code ?? 1 : 0,
      });
    });
  });
}

/**
 * Get git diff and file status for a workspace directory
 */
export async function getGitDiff(cwd: string): Promise<GitDiffResult> {
  // Check if directory exists
  if (!fs.existsSync(cwd)) {
    return {
      isGitRepo: false,
      hasChanges: false,
      stat: "",
      diff: "",
      files: [],
      untracked: [],
    };
  }

  // Check if inside a git work tree
  const revParse = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
  if (revParse.code !== 0 || revParse.stdout.trim() !== "true") {
    return {
      isGitRepo: false,
      hasChanges: false,
      stat: "",
      diff: "",
      files: [],
      untracked: [],
    };
  }

  // Get diff against HEAD (or staged + unstaged if brand new repo)
  let diffOut = await runGit(["diff", "HEAD", "--no-color"], cwd);
  if (diffOut.code !== 0) {
    // Maybe new repo without initial commit, fallback to unstaged diff
    diffOut = await runGit(["diff", "--no-color"], cwd);
  }

  // Get stat summary
  let statOut = await runGit(["diff", "HEAD", "--stat", "--no-color"], cwd);
  if (statOut.code !== 0) {
    statOut = await runGit(["diff", "--stat", "--no-color"], cwd);
  }

  // Get file status list
  const statusOut = await runGit(["status", "--porcelain"], cwd);
  const files: GitDiffResult["files"] = [];
  const untracked: string[] = [];

  for (const line of statusOut.stdout.split("\n")) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    const code = trimmed.slice(0, 2);
    const filePath = trimmed.slice(3).trim();

    if (code === "??") {
      untracked.push(filePath);
    } else if (code.includes("D")) {
      files.push({ file: filePath, status: "deleted" });
    } else if (code.includes("A")) {
      files.push({ file: filePath, status: "added" });
    } else if (code.includes("R")) {
      files.push({ file: filePath, status: "renamed" });
    } else {
      files.push({ file: filePath, status: "modified" });
    }
  }

  const rawDiff = diffOut.stdout;
  const hasChanges = Boolean(rawDiff.trim() || untracked.length > 0 || files.length > 0);

  return {
    isGitRepo: true,
    hasChanges,
    stat: statOut.stdout.trim(),
    diff: rawDiff,
    files,
    untracked,
  };
}
