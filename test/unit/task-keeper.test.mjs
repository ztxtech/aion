import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

let counter = 0;

async function createPlugin(sessionAgents = {}, options = {}) {
  const root = options.root ?? mkdtempSync(join(tmpdir(), `aion-task-keeper-${counter++}-`));
  const bundle = await importBundle();
  const result = await bundle.default.server({
    directory: root,
    sessionAgents,
    ...options,
  });
  return { root, result };
}

function taskState(root, sessionID) {
  return JSON.parse(readFileSync(join(root, ".opencode/memory/runtime-state.json"), "utf8")).sessions[sessionID].task;
}

async function settle(result, sessionID, type, id) {
  await result.emitEvent({
    id,
    type: "session.execution.started",
    data: { sessionID },
  });
  await result.emitEvent({
    id: `${id}-settled`,
    type,
    data: { sessionID },
  });
}

describe("V2 AION task keeper", () => {
  it("continues once per execution and ignores duplicate idle events", async () => {
    const { root, result } = await createPlugin();
    try {
      await settle(result, "session-a", "session.execution.succeeded", "exec-1");
      assert.equal(result.promptCalls.length, 1);
      assert.equal(result.promptCalls[0].agents[0].name, "aion");
      assert.equal(result.promptCalls[0].metadata.source, "aion-task-keeper");

      await result.emitEvent({
        id: "duplicate-idle",
        type: "session.idle",
        data: { sessionID: "session-a" },
      });
      assert.equal(result.promptCalls.length, 1);

      await settle(result, "session-a", "session.idle", "exec-2");
      assert.equal(result.promptCalls.length, 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not continue Build or Plan sessions", async () => {
    const { root, result } = await createPlugin({
      "build-session": "build",
      "plan-session": "plan",
    });
    try {
      await settle(result, "build-session", "session.idle", "build-exec");
      await settle(result, "plan-session", "session.idle", "plan-exec");
      assert.equal(result.promptCalls.length, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not continue child-agent sessions", async () => {
    const { root, result } = await createPlugin({}, {
      sessionParents: { "coder-session": "aion-session" },
    });
    try {
      await settle(result, "coder-session", "session.execution.succeeded", "coder-exec");
      assert.equal(result.promptCalls.length, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores global events without a matching project", async () => {
    const { root, result } = await createPlugin({}, { projectID: "project-a" });
    try {
      await result.emitEvent({
        id: "foreign-idle",
        type: "session.idle",
        location: { directory: "/tmp/aion-other-project" },
        data: { sessionID: "foreign-session" },
      });
      await result.emitEvent({
        id: "locationless-idle",
        type: "session.idle",
        location: undefined,
        data: { sessionID: "locationless-session" },
      });
      await settle(result, "local-session", "session.idle", "local-exec");
      assert.equal(result.promptCalls.length, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects cross-project sessions and accepts events from project subdirectories", async () => {
    const root = mkdtempSync(join(tmpdir(), `aion-task-keeper-${counter++}-`));
    const { result } = await createPlugin({
      "foreign-session": "aion",
      "nested-session": "aion",
    }, {
      root,
      projectID: "project-a",
      sessionProjects: { "foreign-session": "project-b" },
      sessionDirectories: { "nested-session": join(root, "nested") },
    });
    try {
      await settle(result, "foreign-session", "session.idle", "foreign-exec");
      await result.emitEvent({
        id: "nested-start",
        type: "session.execution.started",
        location: { directory: join(root, "nested") },
        data: { sessionID: "nested-session" },
      });
      await result.emitEvent({
        id: "nested-idle",
        type: "session.idle",
        location: { directory: join(root, "nested") },
        data: { sessionID: "nested-session" },
      });
      assert.equal(result.promptCalls.length, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("blocks automatic continuation after an interruption", async () => {
    const { root, result } = await createPlugin();
    try {
      await result.emitEvent({
        id: "interrupted",
        type: "session.execution.interrupted",
        data: { sessionID: "session-interrupted", reason: "user" },
      });
      await result.emitEvent({
        id: "after-interrupt",
        type: "session.idle",
        data: { sessionID: "session-interrupted" },
      });
      assert.equal(result.promptCalls.length, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("continues after a recoverable execution failure", async () => {
    const { root, result } = await createPlugin();
    try {
      await settle(result, "failed-session", "session.execution.failed", "failed-exec");
      assert.equal(result.promptCalls.length, 1);
      assert.match(result.promptCalls[0].text, /\[AION TASK KEEPER ROUND AUDIT\]/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("isolates handler failures and retries an unsuccessful continuation", async () => {
    const { root, result } = await createPlugin({}, {
      sessionErrors: { "broken-session": new Error("session lookup failed") },
      promptFailures: { "retry-session": 1 },
    });
    try {
      await settle(result, "broken-session", "session.idle", "broken-exec");
      await settle(result, "retry-session", "session.idle", "retry-exec");
      assert.equal(result.promptCalls.length, 0);

      await result.emitEvent({
        id: "retry-exec-settled",
        type: "session.idle",
        data: { sessionID: "retry-session" },
      });
      assert.equal(result.promptCalls.length, 1);

      await result.emitEvent({
        id: "retry-exec-settled",
        type: "session.idle",
        data: { sessionID: "retry-session" },
      });
      assert.equal(result.promptCalls.length, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("persists a continuation reservation before calling OpenCode", async () => {
    const reservations = [];
    const { root, result } = await createPlugin({}, {
      beforePrompt(input) {
        const state = taskState(root, input.sessionID);
        reservations.push({
          pending: state.pendingContinuationEventID,
          last: state.lastContinuationEventID,
          promptEventID: input.metadata.continuationEventID,
        });
      },
    });
    try {
      await settle(result, "durable-session", "session.idle", "durable-exec");
      assert.equal(reservations.length, 1);
      assert.equal(reservations[0].pending, "durable-exec-settled");
      assert.equal(reservations[0].last, null);
      assert.equal(reservations[0].promptEventID, "durable-exec-settled");

      const state = taskState(root, "durable-session");
      assert.equal(state.pendingContinuationEventID, null);
      assert.equal(state.lastContinuationEventID, "durable-exec-settled");
      assert.equal(state.continuationCount, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps continuation accounting on the originating session during concurrent prompts", async () => {
    let result;
    const created = await createPlugin({}, {
      async beforePrompt(input) {
        if (input.sessionID === "session-a") {
          await result.emitEvent({
            id: "session-b-start",
            type: "session.execution.started",
            data: { sessionID: "session-b" },
          });
        }
      },
    });
    result = created.result;
    const { root } = created;
    try {
      await settle(result, "session-a", "session.execution.succeeded", "exec-a");
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      const a = taskState(root, "session-a");
      const b = taskState(root, "session-b");
      assert.equal(a.continuationCount, 1);
      assert.equal(a.lastContinuationEventID, "exec-a-settled");
      assert.equal(a.pendingContinuationEventID, null);
      assert.equal(b.continuationCount, 0);
      assert.equal(b.pendingContinuationEventID, null);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("audits a premature external Goal closure before continuing", async () => {
    const { root, result } = await createPlugin();
    try {
      await result.toolHooks["execute.after"](
        {
          tool: "create_goal",
          sessionID: "goal-session",
          id: "goal-create",
          agent: "aion",
          input: { objective: "finish task.md" },
          status: "completed",
          result: { content: [{ text: JSON.stringify({ goal: { objective: "finish task.md", status: "active" } }) }] },
        },
      );
      await result.toolHooks["execute.after"](
        {
          tool: "update_goal",
          sessionID: "goal-session",
          id: "goal-close",
          agent: "aion",
          input: { status: "unmet", blocker: "temporary approach failed" },
          status: "completed",
          result: { content: [{ text: JSON.stringify({ goal: { objective: "finish task.md", status: "unmet" } }) }] },
        },
      );
      await settle(result, "goal-session", "session.idle", "goal-close");

      assert.equal(result.promptCalls.length, 1);
      assert.match(result.promptCalls[0].text, /\[AION EXTERNAL GOAL CLOSE AUDIT\]/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("lets an active external Goal own continuation", async () => {
    const { root, result } = await createPlugin();
    try {
      await result.toolHooks["execute.after"](
        {
          tool: "create_goal",
          sessionID: "active-goal-session",
          id: "active-goal-create",
          agent: "aion",
          input: { objective: "finish task.md" },
          status: "completed",
          result: { content: [{ text: JSON.stringify({ goal: { objective: "finish task.md", status: "active" } }) }] },
        },
      );
      await settle(result, "active-goal-session", "session.execution.succeeded", "active-goal-exec");

      assert.equal(result.promptCalls.length, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
