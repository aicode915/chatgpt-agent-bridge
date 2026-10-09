/**
 * 本地闭环测试：真实 codex ↔ 本插件虚拟模型端点（脚本扮演 ChatGPT 作答）
 * 运行：npx tsx scripts/local-loop-test.ts
 *
 * 零额度：codex 的全部模型请求都发到本地 bridge（127.0.0.1），从不触达 OpenAI。
 * 场景 A：纯文本回合（验证 SSE 基本链路、codex 正常退出）
 * 场景 B：exec 工具调用（验证 custom_tool_call 链路：执行命令 → 工具输出回传 → 下一轮）
 */
import { ModelBridge } from "../src/bridge.js";

const bridge = new ModelBridge();
await bridge.start();
console.log(`bridge ready on port ${bridge.port}`);

async function runScenario(
  name: string,
  prompt: string,
  onTurn: (turnNo: number, turnId: string, rendered: string) => string,
): Promise<string> {
  console.log(`\n########## ${name} ##########`);
  const info = bridge.createTask({ prompt, cwd: process.cwd(), mode: "read-only", timeoutSecs: 300 });
  console.log(`task: ${info.taskId}`);
  for (;;) {
    const result = await bridge.poll(info.taskId, 30);
    if (result.kind === "model_request") {
      const turnNo = result.turnNumber ?? 0;
      console.log(`\n--- turn #${turnNo} (${result.turnId}) ---`);
      console.log(result.text.slice(0, 1500));
      const reply = onTurn(turnNo, result.turnId!, result.text);
      console.log(`\n>>> reply: ${reply.slice(0, 400)}`);
      const ack = bridge.reply(info.taskId, result.turnId!, reply);
      console.log(`ack: ${ack.emitted.join(", ")}`);
      if (turnNo >= 10) {
        console.log("!! too many turns, cancelling");
        bridge.cancel(info.taskId);
        break;
      }
    } else if (result.kind === "waiting") {
      console.log("(waiting for codex...)");
    } else {
      console.log(`\n===== END [${result.kind}] =====`);
      console.log(result.text.slice(0, 5000));
      return result.kind;
    }
  }
  return "aborted";
}

// 场景 A：纯文本回合
const a = await runScenario(
  "A: plain message (expect codex to finish, stdout contains PONG-OK)",
  "Reply with exactly: PONG-OK\nDo not use any tools.",
  () => "PONG-OK",
);
console.log(`\n[A] result: ${a}`);

// 场景 B：exec 工具调用
const b = await runScenario(
  "B: exec tool call (expect shell echo to run, output echoed back, then final message)",
  "Run the shell command `echo hello-from-exec` via the executor, then reply with the exact text: DONE hello-from-exec",
  (turnNo, _turnId, text) => {
    if (turnNo === 1) {
      return JSON.stringify({
        items: [{
          type: "exec",
          input:
            'const r = await tools.exec_command({ cmd: "echo hello-from-exec" });\n' +
            'text(JSON.stringify(r).slice(0, 2000));\n' +
            'return "exec done";',
        }],
      });
    }
    const hasToolOutput = text.includes("hello-from-exec");
    console.log(`[B] turn #${turnNo}: tool output present in transcript: ${hasToolOutput}`);
    return JSON.stringify({ items: [{ type: "message", text: "DONE hello-from-exec" }] });
  },
);
console.log(`\n[B] result: ${b}`);

await bridge.stop();
process.exit(0);
