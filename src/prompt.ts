import type { BridgeTask, PendingTurn, PollResult } from "./types.js";
import { itemText } from "./protocol.js";

export const OUTPUT_TAIL = 200_000; // 每个流保留最后 200KB
export const TEXT_CAP_PER_ITEM = 16_000;
export const RENDER_CAP_TOTAL = 220_000;

export function appendCapped(prev: string, chunk: string): string {
  const next = prev + chunk;
  return next.length > OUTPUT_TAIL ? next.slice(next.length - OUTPUT_TAIL) : next;
}

export function truncate(text: string, cap: number): string {
  if (text.length <= cap) return text;
  return `${text.slice(0, cap)}\n…[truncated ${text.length - cap} chars]`;
}

export function tail(text: string, cap: number): string {
  return text.length > cap ? text.slice(text.length - cap) : text;
}

export function renderInputItem(idx: number, item: any): string {
  const type = item?.type ?? "unknown";
  if (type === "additional_tools") {
    const namespaces = Array.isArray(item.tools) ? item.tools : [];
    return `[${idx}] additional_tools (developer): ${namespaces.length} namespace(s) — see TOOLS section`;
  }
  if (type === "message") {
    const text = itemText(item.content).trim();
    return `[${idx}] message (${item.role ?? "?"}) [${text.length} chars]:\n${truncate(text, TEXT_CAP_PER_ITEM)}`;
  }
  if (type === "function_call") {
    return `[${idx}] function_call -> ${item.namespace ? `${item.namespace}.` : ""}${item.name} args=${truncate(String(item.arguments ?? ""), 2000)}`;
  }
  if (type === "custom_tool_call") {
    const input = String(item.input ?? "");
    return `[${idx}] custom_tool_call -> ${item.name} [input ${input.length} chars]:\n${truncate(input, 8000)}`;
  }
  if (type === "function_call_output" || type === "custom_tool_call_output") {
    const output = itemText(item.output).trim();
    return `[${idx}] tool_output (${type}, call_id=${item.call_id ?? "?"}) [${output.length} chars]:\n${truncate(output, TEXT_CAP_PER_ITEM)}`;
  }
  if (type === "reasoning") {
    const summary = Array.isArray(item.summary)
      ? item.summary.map((entry: any) => (typeof entry === "string" ? entry : entry?.text)).filter(Boolean).join("\n")
      : "";
    return `[${idx}] reasoning:\n${truncate(String(summary), 4000)}`;
  }
  return `[${idx}] ${type}: ${truncate(JSON.stringify(item), 2000)}`;
}

export interface ToolSummary {
  summary: string;
  appendix: string;
}

export function renderTools(body: any, input: any[]): ToolSummary {
  const lines: string[] = [];
  const appendix: string[] = [];
  let execDescription = "";
  const otherDescriptions: string[] = [];

  const namespaces = Array.isArray(input?.[0]?.tools) ? input[0].tools : [];
  if (namespaces.length > 0) {
    lines.push("Namespaces (responses-lite). Call a function tool via a function_call item with its namespace; inside exec JS call it as tools.<name>(...):");
    for (const ns of namespaces) {
      const tools = Array.isArray(ns?.tools) ? ns.tools : [];
      const names = tools.map((t: any) => `${t?.name}${t?.type === "custom" ? " [custom/JS]" : ""}`).join(", ");
      lines.push(`  - ${ns?.name}: ${names}`);
      for (const t of tools) {
        const description = String(t?.description ?? "");
        if (t?.type === "custom" && t?.name === "exec") execDescription = description;
        else if (description) otherDescriptions.push(`- ${ns?.name}.${t?.name} [${t?.type}]: ${truncate(description.replace(/\n/g, " "), 700)}`);
      }
    }
  }

  const topTools = Array.isArray(body?.tools) ? body.tools : [];
  if (topTools.length > 0) {
    lines.push("Top-level tools:");
    for (const t of topTools) {
      const description = String(t?.description ?? "");
      const params = t?.parameters ? ` params=${JSON.stringify(t.parameters).slice(0, 300)}` : "";
      lines.push(`  - ${t?.name} [${t?.type}]${params}`);
      if (t?.type === "custom" && t?.name === "exec") execDescription = description;
      else if (description) otherDescriptions.push(`- ${t?.name} [${t?.type}]: ${truncate(description.replace(/\n/g, " "), 700)}`);
    }
  }

  if (lines.length === 0) lines.push("(no tools declared in this request)");

  if (execDescription) {
    appendix.push("--- APPENDIX: full description of the `exec` tool (how to write JS, nested tool declarations) ---");
    appendix.push(truncate(execDescription, 18_000));
  }
  if (otherDescriptions.length > 0) {
    appendix.push("");
    appendix.push("--- APPENDIX: other tool descriptions ---");
    appendix.push(truncate(otherDescriptions.join("\n"), 20_000));
  }

  return { summary: lines.join("\n"), appendix: appendix.join("\n") };
}

export function renderTurn(task: BridgeTask, turn: PendingTurn): string {
  const body = turn.body ?? {};
  const input: any[] = Array.isArray(body.input) ? body.input : [];
  const lines: string[] = [];

  lines.push("=== CODEX MODEL REQUEST (you are the model; reply via codex_reply) ===");
  lines.push(`task_id: ${task.id}`);
  lines.push(`turn_id: ${turn.id}   (turn #${turn.seq})`);
  lines.push(`mode: ${task.mode} | cwd: ${task.cwd} (VERIFIED active workspace from Web Console) | timeout: ${task.timeoutSecs}s`);
  lines.push(`model: ${body.model ?? "(none)"} | stream: ${body.stream === true} | reasoning: ${JSON.stringify(body.reasoning ?? null)}`);
  lines.push("");
  lines.push("--- CRITICAL RUNTIME RULES ---");
  lines.push("- SANDBOX ISOLATION: Codex executes inside a local security sandbox where outbound network and localhost socket connections are blocked. NEVER run curl, wget, or fetch to http://127.0.0.1 or external addresses inside Codex; execute commands and inspect/modify files directly in cwd.");
  lines.push("- WORKSPACE TRUST: The task cwd above is ALREADY the verified directory selected in the Bridge Web Console. Trust and operate directly in this directory; do NOT query the console or doubt this path.");

  const tools = renderTools(body, input);
  lines.push("");
  lines.push("--- TOOLS ---");
  lines.push(tools.summary);

  lines.push("");
  lines.push("--- INPUT ITEMS (chronological; codex's full context for this turn) ---");
  let total = 0;
  let truncated = false;
  for (let i = 0; i < input.length; i += 1) {
    const rendered = renderInputItem(i, input[i]);
    total += rendered.length;
    if (total > RENDER_CAP_TOTAL) {
      truncated = true;
      break;
    }
    lines.push(rendered);
  }
  lines.push(truncated ? "…[remaining input items omitted for length]" : "(end of input items)");

  if (tools.appendix) {
    lines.push("");
    lines.push(tools.appendix);
  }

  lines.push("");
  lines.push("--- REPLY PROTOCOL ---");
  lines.push(`Call: codex_reply(task_id="${task.id}", turn_id="${turn.id}", reply="<reply>")`);
  lines.push("<reply> must be ONE JSON object:");
  lines.push('  { "items": [ ...one or more items... ] }');
  lines.push("Item forms:");
  lines.push('  1) {"type":"message","text":"<what you say to the user>"}                          — commentary or final answer');
  lines.push('  2) {"type":"exec","input":"<raw JavaScript source>"}                               — run JS that orchestrates tools (the main tool)');
  lines.push('  3) {"type":"function_call","name":"<tool>","namespace":"<ns>","arguments":{...}}    — call a listed function tool directly (namespace optional if top-level)');
  lines.push('  4) {"type":"reasoning","summary":["<short thinking summary>"]}                     — optional');
  lines.push("Rules:");
  lines.push('- To actually do things (run commands, edit files), emit an "exec" item whose JS awaits nested tools, e.g.:');
  lines.push('    const r = await tools.exec_command({ cmd: "ls" }); text(JSON.stringify(r, null, 2).slice(0, 4000));');
  lines.push('- Raw JS only (no markdown fences, no JSON wrapper) inside "input". See the exec description appendix for the full nested-tool list.');
  lines.push('- When the user-visible goal is complete, emit a "message" item (final answer) and NO tool calls, so codex finishes.');
  lines.push('- Keep tool usage minimal and purposeful. Plain text replies are accepted and treated as one "message" item.');

  return lines.join("\n");
}

export function summarizeEnd(task: BridgeTask): PollResult {
  const header =
    task.status === "finished"
      ? `=== CODEX FINISHED (exit ${task.exitCode}) ===`
      : `=== CODEX ${task.status.toUpperCase()}${task.error ? ` — ${task.error}` : ""} ===`;
  const parts = [
    header,
    `task_id: ${task.id}`,
    `turns: ${task.turns}`,
    "",
    "--- stdout (tail) ---",
    tail(task.stdout.trim(), 20_000) || "(empty)",
    task.stderr.trim() ? `--- stderr (tail) ---\n${tail(task.stderr.trim(), 4000)}` : "",
  ];
  return { kind: task.status, text: parts.filter(Boolean).join("\n"), exitCode: task.exitCode };
}
