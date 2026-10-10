import type http from "node:http";
import type { ChildProcess } from "node:child_process";
import type { ConfigManager } from "./config.js";

export type TaskMode = "read-only" | "workspace-write" | "danger-full-access";
export type TaskStatus = "running" | "finished" | "failed" | "cancelled" | "abandoned";

export interface TurnHistoryItem {
  seq: number;
  id: string;
  createdAt: number;
  answeredAt?: number;
  replyLabels?: string[];
}

export interface StartTaskOptions {
  prompt: string;
  cwd: string;
  mode: TaskMode;
  timeoutSecs: number;
}

export interface StartTaskInfo {
  taskId: string;
  port: number;
  baseUrl: string;
}

export interface ReplyAck {
  turnId: string;
  emitted: string[];
}

export interface PollResult {
  kind: "model_request" | "waiting" | TaskStatus;
  turnId?: string;
  turnNumber?: number;
  exitCode?: number | null;
  text: string;
}

export interface WireItem {
  kind: string;
  label: string;
  item: Record<string, unknown>;
}

export interface PendingTurn {
  id: string;
  seq: number;
  createdAt: number;
  body: Record<string, any>;
  stream: boolean;
  res: http.ServerResponse;
  answered: boolean;
  keepalive: NodeJS.Timeout | null;
}

export interface BridgeTask {
  id: string;
  mode: TaskMode;
  cwd: string;
  prompt: string;
  timeoutSecs: number;
  status: TaskStatus;
  createdAt: number;
  finishedAt?: number;
  child: ChildProcess;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error?: string;
  killReason?: "user" | "timeout" | "stop" | "abandoned";
  pending?: PendingTurn;
  turns: number;
  turnHistory: TurnHistoryItem[];
  loggedOutputs: number;
  timeoutTimer: NodeJS.Timeout;
  lastActivityAt: number;
  idleTimer: NodeJS.Timeout | null;
  logListeners: Set<(event: string, data: any) => void>;
}

export interface ModelBridgeOptions {
  port?: number;
  apiKey?: string;
  turnIdleTimeoutSecs?: number;
  configManager?: ConfigManager;
}
