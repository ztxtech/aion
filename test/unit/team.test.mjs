import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

function createTmpDir(prefix = "aion-team-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("team: plugin loads with team tools when teamMode enabled", async () => {
  const bundle = await importBundle();
  const tmpRoot = createTmpDir("aion-team-load-");
  let loadResult;

  before(async () => {
    mkdirSync(join(tmpRoot, ".opencode"), { recursive: true });
    writeFileSync(join(tmpRoot, "package.json"), '{"name":"test","type":"module"}');
    loadResult = await bundle.default.server({
      directory: tmpRoot,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});
  });

  after(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  const expectedTeamTools = [
    "team_create",
    "team_delete",
    "team_shutdown_request",
    "team_approve_shutdown",
    "team_reject_shutdown",
    "team_send_message",
    "team_status",
    "team_list",
    "team_task_create",
    "team_task_list",
    "team_task_get",
    "team_task_update",
    "team_inbox",
    "team_inbox_ack",
  ];

  for (const name of expectedTeamTools) {
    it(`registers ${name} tool`, () => {
      assert.ok(loadResult.tool?.[name], `should have ${name} tool`);
    });
  }

  it("registers exactly 14 team tools", () => {
    const teamToolNames = Object.keys(loadResult.tool ?? {}).filter((n) => n.startsWith("team_"));
    assert.equal(teamToolNames.length, 14, `expected 14 team tools, got ${teamToolNames.length}: ${teamToolNames.join(", ")}`);
  });
});

describe("team: tool shapes are valid ToolDefinitions", async () => {
  const bundle = await importBundle();
  const tmpRoot = createTmpDir("aion-team-shape-");
  let loadResult;

  before(async () => {
    mkdirSync(join(tmpRoot, ".opencode"), { recursive: true });
    writeFileSync(join(tmpRoot, "package.json"), '{"name":"test","type":"module"}');
    loadResult = await bundle.default.server({
      directory: tmpRoot,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});
  });

  after(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  const toolNames = [
    "team_create", "team_delete", "team_status", "team_list",
    "team_send_message", "team_inbox", "team_inbox_ack",
    "team_shutdown_request", "team_approve_shutdown", "team_reject_shutdown",
    "team_task_create", "team_task_list", "team_task_get", "team_task_update",
  ];

  for (const name of toolNames) {
    it(`${name} has description and execute`, () => {
      const tool = loadResult?.tool?.[name];
      assert.ok(tool, `${name} should exist`);
      assert.equal(typeof tool.description, "string", `${name} should have description`);
      assert.ok(tool.description.length > 0, `${name} description should not be empty`);
      assert.equal(typeof tool.execute, "function", `${name} should have execute`);
    });
  }
});

describe("team: team_create not registered when team mode disabled", async () => {
  const bundle = await importBundle();
  let tmpDisabled;
  let disabledResult;

  before(async () => {
    tmpDisabled = createTmpDir("aion-team-disabled-");
    mkdirSync(join(tmpDisabled, ".opencode"), { recursive: true });
    writeFileSync(join(tmpDisabled, "package.json"), '{"name":"test","type":"module"}');
    writeFileSync(join(tmpDisabled, ".opencode", "aion.jsonc"), JSON.stringify({
      teamMode: { enabled: false },
    }));

    disabledResult = await bundle.default.server({
      directory: tmpDisabled,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});
  });

  after(() => {
    try { rmSync(tmpDisabled, { recursive: true, force: true }); } catch {}
  });

  it("team tools are NOT registered when team mode disabled", () => {
    assert.equal(disabledResult.tool?.team_create, undefined, "team_create should NOT be registered");
    assert.equal(disabledResult.tool?.team_status, undefined, "team_status should NOT be registered");
  });

  it("non-team aion tools are still registered", () => {
    assert.ok(disabledResult.tool?.aion_critic_dispatch, "aion tools should still exist");
    assert.ok(disabledResult.tool?.aion_todo_update, "aion tools should still exist");
  });
});

describe("team: team_create creates a valid team", async () => {
  const bundle = await importBundle();
  const tmpRoot = createTmpDir("aion-team-create-");
  let loadResult;

  before(async () => {
    mkdirSync(join(tmpRoot, ".opencode"), { recursive: true });
    writeFileSync(join(tmpRoot, "package.json"), '{"name":"test","type":"module"}');
    loadResult = await bundle.default.server({
      directory: tmpRoot,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});
  });

  after(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  it("creates team with valid spec", async () => {
    const tool = loadResult.tool?.team_create;
    const result = await tool.execute({
      spec: {
        name: "test-team",
        description: "A test team",
        members: [
          { name: "lead-1", kind: "subagent_type", subagent_type: "aion", isLead: true },
          { name: "coder-1", kind: "subagent_type", subagent_type: "coder" },
        ],
      },
      createdBy: "lead-1",
    }, {});
    const parsed = JSON.parse(result);
    assert.ok(parsed.ok, "team creation should succeed");
    assert.ok(parsed.teamRunId, "should have teamRunId");
    assert.equal(parsed.members.length, 2, "should have 2 members");
    assert.ok(parsed.tmux, "tmux result should be present (even if failed)");
  });

  it("team_status returns created team", async () => {
    const createTool = loadResult.tool?.team_create;
    const createResult = await createTool.execute({
      spec: {
        name: "status-team",
        members: [{ name: "a1", kind: "subagent_type", subagent_type: "aion", isLead: true }],
      },
      createdBy: "a1",
    }, {});
    const created = JSON.parse(createResult);

    const statusTool = loadResult.tool?.team_status;
    const statusResult = await statusTool.execute({ teamRunId: created.teamRunId }, {});
    const status = JSON.parse(statusResult);
    assert.ok(status.teamRunId, "status should have teamRunId");
    assert.equal(status.teamName, "status-team");
    assert.equal(status.members.length, 1);
  });

  it("team_list returns created teams", async () => {
    const listTool = loadResult.tool?.team_list;
    const result = await listTool.execute({}, {});
    const parsed = JSON.parse(result);
    assert.ok(Array.isArray(parsed.declared), "declared should be an array");
    assert.ok(parsed.declared.length > 0, "should have at least one declared team");
  });
});

describe("team: messaging works", async () => {
  const bundle = await importBundle();
  const tmpRoot = createTmpDir("aion-team-msg-");
  let loadResult;
  let teamRunId;

  before(async () => {
    mkdirSync(join(tmpRoot, ".opencode"), { recursive: true });
    writeFileSync(join(tmpRoot, "package.json"), '{"name":"test","type":"module"}');
    loadResult = await bundle.default.server({
      directory: tmpRoot,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});

    const createResult = await loadResult.tool.team_create.execute({
      spec: {
        name: "msg-team",
        members: [
          { name: "lead", kind: "subagent_type", subagent_type: "aion", isLead: true },
          { name: "worker", kind: "subagent_type", subagent_type: "coder" },
        ],
      },
      createdBy: "lead",
    }, {});
    teamRunId = JSON.parse(createResult).teamRunId;
  });

  after(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  it("lead can send message to worker", async () => {
    const result = await loadResult.tool.team_send_message.execute({
      teamRunId,
      from: "lead",
      to: "worker",
      subject: "Hello",
      body: "Get to work!",
      kind: "task",
    }, {});
    const parsed = JSON.parse(result);
    assert.ok(parsed.ok);
    assert.ok(parsed.messageId);
    assert.deepEqual(parsed.deliveredTo, ["worker"]);
    assert.equal(parsed.broadcast, false);
  });

  it("lead can broadcast", async () => {
    const result = await loadResult.tool.team_send_message.execute({
      teamRunId,
      from: "lead",
      to: "broadcast",
      subject: "Announcement",
      body: "Team meeting",
      kind: "info",
    }, {});
    const parsed = JSON.parse(result);
    assert.ok(parsed.ok);
    assert.equal(parsed.broadcast, true);
    assert.ok(parsed.deliveredTo.length >= 1);
  });

  it("worker can poll inbox", async () => {
    const result = await loadResult.tool.team_inbox.execute({
      teamRunId,
      member: "worker",
    }, {});
    const parsed = JSON.parse(result);
    assert.ok(parsed.ok);
    assert.ok(parsed.count >= 1, "should have at least one message");
    assert.ok(parsed.messages.length >= 1);
  });

  it("worker can acknowledge message", async () => {
    const inboxResult = await loadResult.tool.team_inbox.execute({
      teamRunId,
      member: "worker",
    }, {});
    const inbox = JSON.parse(inboxResult);
    const msgId = inbox.messages[0]?.id;
    assert.ok(msgId, "should have a message to ack");

    const ackResult = await loadResult.tool.team_inbox_ack.execute({
      teamRunId,
      member: "worker",
      messageId: msgId,
    }, {});
    const parsed = JSON.parse(ackResult);
    assert.ok(parsed.ok);
  });
});

describe("team: task management", async () => {
  const bundle = await importBundle();
  const tmpRoot = createTmpDir("aion-team-task-");
  let loadResult;
  let teamRunId;

  before(async () => {
    mkdirSync(join(tmpRoot, ".opencode"), { recursive: true });
    writeFileSync(join(tmpRoot, "package.json"), '{"name":"test","type":"module"}');
    loadResult = await bundle.default.server({
      directory: tmpRoot,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});

    const createResult = await loadResult.tool.team_create.execute({
      spec: {
        name: "task-team",
        members: [
          { name: "lead", kind: "subagent_type", subagent_type: "aion", isLead: true },
          { name: "worker", kind: "subagent_type", subagent_type: "coder" },
        ],
      },
      createdBy: "lead",
    }, {});
    teamRunId = JSON.parse(createResult).teamRunId;
  });

  after(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  it("creates a task", async () => {
    const result = await loadResult.tool.team_task_create.execute({
      teamRunId,
      from: "lead",
      title: "Implement feature X",
      description: "Build the X feature",
      priority: 7,
    }, {});
    const parsed = JSON.parse(result);
    assert.ok(parsed.ok);
    assert.ok(parsed.task);
    assert.equal(parsed.task.title, "Implement feature X");
    assert.equal(parsed.task.status, "open");
    assert.equal(parsed.task.priority, 7);
  });

  it("lists tasks", async () => {
    const result = await loadResult.tool.team_task_list.execute({ teamRunId }, {});
    const parsed = JSON.parse(result);
    assert.ok(parsed.ok);
    assert.ok(parsed.tasks.length >= 1);
  });

  it("updates task status", async () => {
    const listResult = await loadResult.tool.team_task_list.execute({ teamRunId }, {});
    const list = JSON.parse(listResult);
    const taskId = list.tasks[0]?.id;
    assert.ok(taskId);

    const result = await loadResult.tool.team_task_update.execute({
      teamRunId,
      taskId,
      from: "worker",
      status: "claimed",
    }, {});
    const parsed = JSON.parse(result);
    assert.ok(parsed.ok);
    assert.equal(parsed.task.status, "claimed");
    assert.equal(parsed.task.owner, "worker");
  });

  it("task can transition through full lifecycle", async () => {
    const createResult = await loadResult.tool.team_task_create.execute({
      teamRunId,
      from: "lead",
      title: "Lifecycle task",
      description: "Test lifecycle",
    }, {});
    const task = JSON.parse(createResult).task;

    await loadResult.tool.team_task_update.execute({
      teamRunId,
      taskId: task.id,
      from: "worker",
      status: "claimed",
    }, {});

    await loadResult.tool.team_task_update.execute({
      teamRunId,
      taskId: task.id,
      from: "worker",
      status: "in_progress",
    }, {});

    const doneResult = await loadResult.tool.team_task_update.execute({
      teamRunId,
      taskId: task.id,
      from: "worker",
      status: "done",
      resultSummary: "Completed successfully",
    }, {});
    const done = JSON.parse(doneResult);
    assert.equal(done.task.status, "done");
    assert.equal(done.task.resultSummary, "Completed successfully");
  });
});

describe("team: shutdown lifecycle", async () => {
  const bundle = await importBundle();
  const tmpRoot = createTmpDir("aion-team-shutdown-");
  let loadResult;
  let teamRunId;

  before(async () => {
    mkdirSync(join(tmpRoot, ".opencode"), { recursive: true });
    writeFileSync(join(tmpRoot, "package.json"), '{"name":"test","type":"module"}');
    loadResult = await bundle.default.server({
      directory: tmpRoot,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});

    const createResult = await loadResult.tool.team_create.execute({
      spec: {
        name: "shutdown-team",
        members: [
          { name: "lead", kind: "subagent_type", subagent_type: "aion", isLead: true },
          { name: "worker", kind: "subagent_type", subagent_type: "coder" },
        ],
      },
      createdBy: "lead",
    }, {});
    teamRunId = JSON.parse(createResult).teamRunId;
  });

  after(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  it("lead can request shutdown of member", async () => {
    const result = await loadResult.tool.team_shutdown_request.execute({
      teamRunId,
      from: "lead",
      member: "worker",
    }, {});
    const parsed = JSON.parse(result);
    assert.ok(parsed.ok);
    assert.ok(parsed.pendingShutdown?.length > 0);
  });

  it("member can approve shutdown", async () => {
    const result = await loadResult.tool.team_approve_shutdown.execute({
      teamRunId,
      from: "lead",
      member: "worker",
    }, {});
    const parsed = JSON.parse(result);
    assert.ok(parsed.ok);
    assert.equal(parsed.status, "shut_down");
  });

  it("team cannot be deleted with active members", async () => {
    const createResult = await loadResult.tool.team_create.execute({
      spec: {
        name: "delete-team",
        members: [
          { name: "lead2", kind: "subagent_type", subagent_type: "aion", isLead: true },
        ],
      },
      createdBy: "lead2",
    }, {});
    const runId = JSON.parse(createResult).teamRunId;

    await assert.rejects(
      () => loadResult.tool.team_delete.execute({ teamRunId: runId, from: "lead2" }, {}),
      /active members|cannot delete/i,
    );
  });
});

describe("team: reject shutdown lifecycle", async () => {
  const bundle = await importBundle();
  const tmpRoot = createTmpDir("aion-team-reject-");
  let loadResult;
  let teamRunId;

  before(async () => {
    mkdirSync(join(tmpRoot, ".opencode"), { recursive: true });
    writeFileSync(join(tmpRoot, "package.json"), '{"name":"test","type":"module"}');
    loadResult = await bundle.default.server({
      directory: tmpRoot,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});

    const createResult = await loadResult.tool.team_create.execute({
      spec: {
        name: "reject-team",
        members: [
          { name: "lead", kind: "subagent_type", subagent_type: "aion", isLead: true },
          { name: "worker", kind: "subagent_type", subagent_type: "coder" },
        ],
      },
      createdBy: "lead",
    }, {});
    teamRunId = JSON.parse(createResult).teamRunId;

    await loadResult.tool.team_shutdown_request.execute({
      teamRunId,
      from: "lead",
      member: "worker",
    }, {});
  });

  after(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  it("worker can reject shutdown with reason", async () => {
    const result = await loadResult.tool.team_reject_shutdown.execute({
      teamRunId,
      from: "worker",
      member: "worker",
      reason: "Still processing batch #3",
    }, {});
    const parsed = JSON.parse(result);
    assert.ok(parsed.ok);
  });

  it("worker status reverts to active after rejection", async () => {
    const statusResult = await loadResult.tool.team_status.execute({ teamRunId }, {});
    const status = JSON.parse(statusResult);
    const worker = status.members.find(m => m.name === "worker");
    assert.equal(worker.status, "active");
  });

  it("lead receives rejection reason in inbox", async () => {
    const inboxResult = await loadResult.tool.team_inbox.execute({
      teamRunId,
      member: "lead",
    }, {});
    const inbox = JSON.parse(inboxResult);
    assert.ok(inbox.count >= 1);
    const rejectMsg = inbox.messages.find(m =>
      m.body && m.body.includes("Still processing batch"),
    );
    assert.ok(rejectMsg, "lead should receive rejection reason message");
  });
});
