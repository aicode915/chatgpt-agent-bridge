import crypto from "node:crypto";
import type { WireItem } from "./types.js";

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}${idCounter.toString(36)}`;
}

export function zeroUsage(): Record<string, unknown> {
  return {
    input_tokens: 0,
    input_tokens_details: null,
    output_tokens: 0,
    output_tokens_details: null,
    total_tokens: 0,
  };
}

export function chunkText(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

export function itemText(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const obj = part as Record<string, unknown>;
          if (typeof obj.text === "string") return obj.text;
          return JSON.stringify(obj);
        }
        return "";
      })
      .join("\n");
  }
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

export function messageItem(text: string): WireItem {
  const value = text.trim();
  if (!value) throw new Error("message item text is empty");
  return {
    kind: "message",
    label: `message(${value.length} chars)`,
    item: {
      type: "message",
      id: newId("msg"),
      role: "assistant",
      content: [{ type: "output_text", text: value }],
    },
  };
}

export function convertItem(raw: unknown): WireItem {
  if (typeof raw === "string") return messageItem(raw);
  if (!raw || typeof raw !== "object") throw new Error("reply item must be a JSON object or string");
  const obj = raw as Record<string, any>;
  const type = String(obj.type ?? "message").toLowerCase();

  if (type === "message" || type === "text") {
    return messageItem(itemText(obj.text ?? obj.content));
  }
  if (type === "exec" || type === "custom_tool_call" || type === "custom") {
    const name = String(obj.name ?? "exec");
    const input =
      typeof obj.input === "string"
        ? obj.input
        : typeof obj.code === "string"
          ? obj.code
          : typeof obj.text === "string"
            ? obj.text
            : "";
    if (!input.trim()) {
      throw new Error(`custom_tool_call item needs a non-empty "input" (raw JS source for exec)`);
    }
    return {
      kind: "custom_tool_call",
      label: `custom_tool_call:${name}(${input.length} chars)`,
      item: {
        type: "custom_tool_call",
        id: newId("ctc"),
        call_id: newId("call"),
        name,
        input,
        ...(obj.namespace ? { namespace: String(obj.namespace) } : {}),
      },
    };
  }
  if (type === "function_call" || type === "function") {
    const name = obj.name;
    if (typeof name !== "string" || !name) throw new Error("function_call item needs a string 'name'");
    const argsRaw = obj.arguments;
    const args = typeof argsRaw === "string" ? argsRaw : JSON.stringify(argsRaw ?? {});
    return {
      kind: "function_call",
      label: `function_call:${obj.namespace ? `${obj.namespace}.` : ""}${name}`,
      item: {
        type: "function_call",
        id: newId("fc"),
        call_id: newId("call"),
        name,
        arguments: args,
        ...(obj.namespace ? { namespace: String(obj.namespace) } : {}),
      },
    };
  }
  if (type === "reasoning") {
    const list = Array.isArray(obj.summary) ? obj.summary : [];
    const summary = list
      .map((entry: unknown) => {
        if (typeof entry === "string") return { type: "summary_text", text: entry };
        if (entry && typeof entry === "object") {
          const text = itemText((entry as Record<string, any>).text);
          return { type: "summary_text", text };
        }
        return { type: "summary_text", text: "" };
      })
      .filter((entry: { text: string }) => entry.text.trim().length > 0);
    if (summary.length === 0) throw new Error("reasoning item needs a non-empty 'summary' array of strings");
    return {
      kind: "reasoning",
      label: `reasoning(${summary.length})`,
      item: { type: "reasoning", id: newId("rs"), summary, encrypted_content: null },
    };
  }
  throw new Error(
    `unsupported reply item type "${type}" — allowed: message, exec (custom_tool_call), function_call, reasoning`,
  );
}

export function parseReply(replyText: string): WireItem[] {
  const trimmed = replyText.trim();
  if (!trimmed) throw new Error("reply is empty");

  let list: unknown[];
  const first = trimmed[0];
  if (first !== "{" && first !== "[") {
    list = [trimmed]; // 纯文本 → 单条 message
  } else {
    let t = trimmed;
    const fence = t.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n```\s*$/);
    if (fence) t = fence[1].trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(t);
    } catch (err) {
      throw new Error(
        `reply looks like JSON but failed to parse (${(err as Error).message}). Send valid JSON or plain text.`,
      );
    }
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.items)) list = obj.items;
      else if (typeof obj.type === "string" || typeof obj.text === "string") list = [obj];
      else throw new Error('reply JSON must be {"items":[...]} or a single item object');
    } else {
      throw new Error("reply JSON must be an object or array");
    }
  }

  const items = list.map(convertItem);
  if (items.length === 0) throw new Error("reply must contain at least one item");
  return items;
}
