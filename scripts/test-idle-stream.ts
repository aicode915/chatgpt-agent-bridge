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

  // 3. Test Abandoned Idle Timeout:
  // We do NOT reply to this turn. After ~2s, bridge should reap the task as 'abandoned'.
  console.log("Waiting for idle timeout (2s)...");
  await new Promise((r) => setTimeout(r, 2600));

  const detail = bridge.getTaskDetail(taskId);
  assert.strictEqual(detail?.status, "abandoned", `Expected status to be 'abandoned', got ${detail?.status}`);
  console.log("✓ Task status is 'abandoned' after idle timeout!");

  assert.ok(sseEvents.some((e) => e.event === "end" && e.data.status === "abandoned"), "SSE should have received end with abandoned");
  console.log("✓ SSE end event with status 'abandoned' received successfully");

  req.destroy();
  await bridge.stop();
  console.log("\nALL IDLE TIMEOUT & SSE STREAM TESTS PASSED!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
