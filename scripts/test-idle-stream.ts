import http from "node:http";
import assert from "node:assert";
import { ModelBridge } from "../src/bridge.js";
import { ConfigManager } from "../src/config.js";

async function main() {
  process.env.TURN_IDLE_TIMEOUT_SECS = "2";
  const cfg = new ConfigManager("/tmp");
  cfg.addWorkspace(process.cwd());
  cfg.setActiveWorkspace(process.cwd());
  cfg.setMaxAllowedMode("workspace-write");

  const bridge = new ModelBridge({ port: 9876, turnIdleTimeoutSecs: 2, configManager: cfg });
  await bridge.start();
  console.log("Bridge started on 9876");

  // Create a mock task directly or using createTask with mock codex
  // For a pure unit test without needing real codex, let's test via createTask
  // using CODEX_BIN="cat" or similar mock binary
  process.env.CODEX_BIN = "./scripts/mock-codex.sh";
  
  const taskInfo = bridge.createTask({
    prompt: "10",
    cwd: process.cwd(),
    mode: "workspace-write",
    timeoutSecs: 30,
  });

  const taskId = taskInfo.taskId;
  console.log("Created task:", taskId);

  // 1. Test SSE connection
  const sseEvents: Array<{ event: string; data: any }> = [];
  const req = http.request(
    `http://127.0.0.1:9876/api/tasks/${taskId}/stream`,
    (res) => {
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers["content-type"], "text/event-stream");
      let buffer = "";
      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          if (!part.trim()) continue;
          const lines = part.split("\n");
          let event = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7).trim();
            else if (line.startsWith("data: ")) data = line.slice(6).trim();
          }
          if (data) {
            try {
              sseEvents.push({ event, data: JSON.parse(data) });
            } catch {
              sseEvents.push({ event, data });
            }
          }
        }
      });
    }
  );
  req.end();

  await new Promise((r) => setTimeout(r, 300));
  assert.ok(sseEvents.some((e) => e.event === "init"), "Should have received 'init' SSE event");
  console.log("✓ SSE init event received successfully");

  // 2. Simulate Codex calling /t/:taskId/v1/responses/
  const turnReq = http.request(
    `http://127.0.0.1:9876/t/${taskId}/v1/responses/`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${bridge.apiKey}`,
      },
    },
    (turnRes) => {
      // Stream response from bridge
      turnRes.on("data", () => {});
    }
  );
  turnReq.write(JSON.stringify({ model: "test-model", stream: true }));
  turnReq.end();

  await new Promise((r) => setTimeout(r, 300));
  assert.ok(sseEvents.some((e) => e.event === "turn"), "Should have received 'turn' SSE event");
  console.log("✓ SSE turn event received successfully");

  // 3. Test Abandoned Idle Timeout on Turn 1 (never answered -> abandoned)
  console.log("Waiting for idle timeout on Turn 1 (2s)...");
  await new Promise((r) => setTimeout(r, 2600));

  const detail = bridge.getTaskDetail(taskId);
  assert.strictEqual(detail?.status, "abandoned", `Expected status to be 'abandoned', got ${detail?.status}`);
  console.log("✓ Case 1: Task status is 'abandoned' when turn 1 was never answered!");
  assert.ok(sseEvents.some((e) => e.event === "end" && e.data.status === "abandoned"), "SSE should have received end with abandoned");
  req.destroy();

  // 4. Test Auto-Finalization: Turn 1 was answered, Turn 2 goes idle -> should auto-finish
  const task2Info = bridge.createTask({
    prompt: "10",
    cwd: process.cwd(),
    mode: "workspace-write",
    timeoutSecs: 30,
  });
  const task2Id = task2Info.taskId;

  // Turn 1 arrives
  const turn1Req = http.request(
    `http://127.0.0.1:9876/t/${task2Id}/v1/responses/`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${bridge.apiKey}` },
    },
    (turnRes) => { turnRes.on("data", () => {}); }
  );
  turn1Req.write(JSON.stringify({ model: "test-model", stream: true }));
  turn1Req.end();
  await new Promise((r) => setTimeout(r, 200));

  // Client polls and answers Turn 1
  const poll1 = await bridge.poll(task2Id, 1);
  assert.strictEqual(poll1.kind, "model_request");
  if (poll1.kind === "model_request") {
    bridge.reply(task2Id, poll1.turnId, 'await tools.exec_command({cmd:"echo test"})');
  }
  console.log("✓ Turn 1 answered successfully by client");

  // Turn 2 arrives
  const turn2Req = http.request(
    `http://127.0.0.1:9876/t/${task2Id}/v1/responses/`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${bridge.apiKey}` },
    },
    (turnRes) => { turnRes.on("data", () => {}); }
  );
  turn2Req.write(JSON.stringify({ model: "test-model", stream: true }));
  turn2Req.end();
  await new Promise((r) => setTimeout(r, 200));

  // Client does NOT answer Turn 2. Idle timeout should trigger auto-finalize!
  console.log("Waiting for auto-finalize on Turn 2 (2s)...");
  await new Promise((r) => setTimeout(r, 2600));

  const detail2 = bridge.getTaskDetail(task2Id);
  assert.strictEqual(detail2?.status, "finished", `Expected task2 status to be 'finished' via auto-finalize, got ${detail2?.status}`);
  console.log("✓ Case 2: Task status is 'finished' via auto-finalize when previous turns were answered!");

  await bridge.stop();
  console.log("\nALL IDLE TIMEOUT & AUTO-FINALIZE TESTS PASSED!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
