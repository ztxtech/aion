import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

let _counter = 0;
function createTmp(prefix = "aion-hooks-") {
  const d = mkdtempSync(join(tmpdir(), `${prefix}${_counter++}-`));
  mkdirSync(join(d, ".opencode"), { recursive: true });
  writeFileSync(join(d, "package.json"), '{"name":"test","type":"module"}');
  return d;
}

async function createPlugin(tmp) {
  const bundle = await importBundle();
  return bundle.default.server({
    directory: tmp,
    client: undefined,
    project: undefined,
    $: undefined,
  }, {});
}

describe("hooks: permission.ask auto-approves", async () => {
  const tmp = createTmp("aion-perm-");
  let hook;

  before(async () => {
    const result = await createPlugin(tmp);
    hook = result["permission.ask"];
  });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("auto-approves aion_* tools", async () => {
    const output = { status: "pending" };
    await hook({ tool_name: "aion_todo_update" }, output);
    assert.equal(output.status, "allow");
  });

  it("auto-approves team_* tools", async () => {
    const output = { status: "pending" };
    await hook({ tool_name: "team_create" }, output);
    assert.equal(output.status, "allow");
  });

  it("auto-approves webfetch", async () => {
    const output = { status: "pending" };
    await hook({ tool_name: "webfetch" }, output);
    assert.equal(output.status, "allow");
  });

  it("auto-approves bash", async () => {
    const output = { status: "pending" };
    await hook({ tool_name: "bash" }, output);
    assert.equal(output.status, "allow");
  });

  it("auto-approves unknown aion_ tool (prefix match)", async () => {
    const output = { status: "pending" };
    await hook({ tool_name: "aion_future_tool" }, output);
    assert.equal(output.status, "allow");
  });

  it("passes through unknown tools without overriding", async () => {
    const output = { status: "pending" };
    await hook({ tool_name: "unknown_tool" }, output);
    assert.equal(output.status, "pending");
  });
});

describe("hooks: chat.params sets phase-based temperature", async () => {
  const tmp = createTmp("aion-chatparams-");
  let hook;

  before(async () => {
    const result = await createPlugin(tmp);
    hook = result["chat.params"];
  });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("sets temperature for default phase (init)", async () => {
    const output = {};
    await hook({ agent: "aion" }, output);
    assert.equal(output.temperature, 0.3);
    assert.equal(output.topP, 0.9);
  });

  it("overrides for critic agents with low temp", async () => {
    const output = {};
    await hook({ agent: "ts-critic" }, output);
    assert.equal(output.temperature, 0.05);
    assert.equal(output.topP, 0.8);
    assert.equal(output.topK, 1);
  });

  it("c-critic also gets critic override", async () => {
    const output = {};
    await hook({ agent: "c-critic" }, output);
    assert.equal(output.temperature, 0.05);
    assert.equal(output.topK, 1);
  });
});

describe("hooks: messages.transform compression", async () => {
  const tmp = createTmp("aion-msgs-");
  let hook;

  before(async () => {
    const result = await createPlugin(tmp);
    hook = result["experimental.chat.messages.transform"];
  });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  function makeMessages(count, roles) {
    return roles.slice(0, count).map((role, i) => ({
      info: { role },
      content: `message ${i}`,
    }));
  }

  it("compresses with many messages (round >= 2 default path)", async () => {
    const msgs = makeMessages(20, Array(20).fill(null).map((_, i) => i % 3 === 0 ? "system" : i % 3 === 1 ? "user" : "assistant"));
    const output = { messages: msgs };
    await hook({}, output);
    assert.ok(output.messages.length <= 20, `should not grow: got ${output.messages.length}`);
  });

  it("does not compress short message lists", async () => {
    const msgs = makeMessages(3, ["system", "user", "assistant"]);
    const output = { messages: msgs };

    await hook({}, output);
    assert.equal(output.messages.length, 3);
  });
});

describe("hooks: tool.execute.after phase transitions", async () => {
  const tmp = createTmp("aion-phase-");
  let afterHook;
  let tool;

  before(async () => {
    const result = await createPlugin(tmp);
    afterHook = result["tool.execute.after"];
    tool = result.tool;
  });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("transitions init -> gather after workspace_init", async () => {
    await afterHook(
      { tool: "aion_workspace_init" },
      { args: {}, output: JSON.stringify({ status: "ok" }) },
    );

    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("gather") || trace.includes("phase transition"));
  });

  it("transitions gather -> ts-pre-review after ts-critic dispatch", async () => {
    await afterHook(
      { tool: "aion_critic_dispatch" },
      { args: { critic: "ts-critic" }, output: JSON.stringify({ dispatchId: "d1" }) },
    );

    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("ts-pre-review") || trace.includes("phase transition"));
  });
});

describe("hooks: tool.execute.after TUI sync", async () => {
  const tmp = createTmp("aion-tui-");
  let afterHook;
  let tool;

  before(async () => {
    const result = await createPlugin(tmp);
    afterHook = result["tool.execute.after"];
    tool = result.tool;
  });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("sets tuiTodoSyncPending after aion_todo_update", async () => {
    await afterHook(
      { tool: "aion_todo_update" },
      { args: { action: "add", plan_step: "Test TUI sync" }, output: JSON.stringify({ action: "add" }) },
    );

    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("TUI sync pending"));
  });

  it("clears tuiTodoSyncPending after todowrite", async () => {
    await afterHook(
      { tool: "aion_todo_update" },
      { args: { action: "add" }, output: JSON.stringify({ action: "add" }) },
    );

    await afterHook(
      { tool: "todowrite" },
      { args: {}, output: "ok" },
    );

    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("TUI todo list synced"));
  });
});

describe("hooks: tool.execute.after blind optimism detection", async () => {
  const tmp = createTmp("aion-optimism-");
  let afterHook;

  before(async () => {
    const result = await createPlugin(tmp);
    afterHook = result["tool.execute.after"];
  });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("detects overconfident phrases in output", async () => {
    await afterHook(
      { tool: "write" },
      { args: { filePath: "src/main.py" }, output: "The code works perfectly and has no issues at all." },
    );

    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("blind optimism"));
  });

  it("does not flag normal output", async () => {
    const traceBefore = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    const optimismCountBefore = (traceBefore.match(/blind optimism/g) || []).length;

    await afterHook(
      { tool: "write" },
      { args: { filePath: "src/normal.py" }, output: "Function implemented with basic error handling." },
    );

    const traceAfter = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    const optimismCountAfter = (traceAfter.match(/blind optimism/g) || []).length;
    assert.equal(optimismCountAfter, optimismCountBefore);
  });
});

describe("hooks: tool.execute.before dedup", async () => {
  const tmp = createTmp("aion-dedup-");
  let beforeHook;

  before(async () => {
    const result = await createPlugin(tmp);
    beforeHook = result["tool.execute.before"];
  });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("allows same tool call (soft warn, no throw)", async () => {
    const args = { action: "get" };

    await beforeHook(
      { tool: "aion_todo_update" },
      { args },
    );

    await beforeHook(
      { tool: "aion_todo_update" },
      { args },
    );

    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("dedup"));
  });

  it("allows different args without dedup", async () => {
    await beforeHook(
      { tool: "aion_todo_update" },
      { args: { action: "add", plan_step: "A" } },
    );
    await beforeHook(
      { tool: "aion_todo_update" },
      { args: { action: "add", plan_step: "B" } },
    );

    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    const dedupCount = (trace.match(/dedup\.rejected/g) || []).length;
    assert.ok(dedupCount <= 2, "should not dedup different args");
  });

  it("skips dedup for memory file reads", async () => {
    // Reset the trace so we can count this case in isolation.
    const traceFile = join(tmp, ".opencode", "trace.md");
    const before = readFileSync(traceFile, "utf-8");
    const baseCount = (before.match(/dedup\.rejected/g) || []).length;

    const memPath = join(tmp, ".opencode", "memory", "negative.md");
    mkdirSync(dirname(memPath), { recursive: true });
    writeFileSync(memPath, "x", "utf-8");

    await beforeHook(
      { tool: "read" },
      { args: { filePath: memPath } },
    );
    await beforeHook(
      { tool: "read" },
      { args: { filePath: memPath } },
    );

    const after = readFileSync(traceFile, "utf-8");
    const newCount = (after.match(/dedup\.rejected/g) || []).length;
    assert.equal(newCount, baseCount, "memory file re-reads must not be flagged as dedup");
  });
});

describe("hooks: tool.execute.before high-risk bash detection", async () => {
  const tmp = createTmp("aion-hirisk-");
  let beforeHook;

  before(async () => {
    const result = await createPlugin(tmp);
    beforeHook = result["tool.execute.before"];
  });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("logs warning for pip install", async () => {
    await beforeHook(
      { tool: "bash" },
      { args: { command: "pip install numpy" } },
    );

    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("high-risk bash"));
  });

  it("logs warning for torch usage", async () => {
    await beforeHook(
      { tool: "bash" },
      { args: { command: "python -c 'import torch; print(torch.__version__)'" } },
    );

    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("high-risk bash"));
  });

  it("does not flag normal commands", async () => {
    const traceBefore = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    const countBefore = (traceBefore.match(/high-risk bash/g) || []).length;

    await beforeHook(
      { tool: "bash" },
      { args: { command: "ls -la" } },
    );

    const traceAfter = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    const countAfter = (traceAfter.match(/high-risk bash/g) || []).length;
    assert.equal(countAfter, countBefore);
  });
});

describe("hooks: tool.execute.before visual semantic tracking", async () => {
  const tmp = createTmp("aion-visual-");
  let beforeHook;

  before(async () => {
    const result = await createPlugin(tmp);
    beforeHook = result["tool.execute.before"];
  });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("tracks image file reads", async () => {
    await beforeHook(
      { tool: "read" },
      { args: { filePath: "outputs/plot.png" } },
    );

    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("image file read"));
  });

  it("marks visual test loop on image writes", async () => {
    await beforeHook(
      { tool: "write" },
      { args: { filePath: "outputs/chart.png", content: "binary" } },
    );

    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("visual output written"));
  });
});

describe("hooks: tool.execute.before TODO early-stop word blocking", async () => {
  const tmp = createTmp("aion-earlystop-");
  let beforeHook;

  before(async () => {
    const result = await createPlugin(tmp);
    beforeHook = result["tool.execute.before"];
  });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("blocks todo-map.md writes with early-stop words", async () => {
    await assert.rejects(
      async () => {
        await beforeHook(
          { tool: "write" },
          { args: { filePath: ".opencode/memory/todo-map.md", content: "all done, wrap up the task" } },
        );
      },
      /early-stop/i,
    );
  });

  it("allows todo-map.md writes without early-stop words", async () => {
    await beforeHook(
      { tool: "write" },
      { args: { filePath: ".opencode/memory/todo-map.md", content: "implement feature X" } },
    );
  });
});

describe("hooks: experimental.compaction.autocontinue is registered", async () => {
  const tmp = createTmp("aion-idle-");
  let result;

  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("is a function", () => {
    assert.equal(typeof result["experimental.compaction.autocontinue"], "function");
  });
});

describe("hooks: G1 scheduling dispatch edge check", async () => {
  const tmp = createTmp("aion-g1-");
  let beforeHook;

  before(async () => {
    const result = await createPlugin(tmp);
    beforeHook = result["tool.execute.before"];
  });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("does not throw on legal dispatch (requirements-analyst from gather)", async () => {
    // Should not throw even though pre-review is missing — G1 is soft warn.
    await beforeHook(
      { tool: "task" },
      { args: { subagent_type: "requirements-analyst" } },
    );
    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("scheduling.dispatch") || trace.includes("G1"));
  });

  it("traces a scheduling.dispatch event for every task dispatch", async () => {
    const beforeCount = (readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8")
      .match(/scheduling\.dispatch/g) || []).length;
    await beforeHook(
      { tool: "task" },
      { args: { subagent_type: "ts-critic" } },
    );
    const afterCount = (readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8")
      .match(/scheduling\.dispatch/g) || []).length;
    assert.ok(afterCount >= beforeCount + 1, "expected a new scheduling.dispatch event");
  });

  it("does not throw on illegal dispatch (coder from init) — soft warn only", async () => {
    // coder from init is NOT a legal edge, but G1 must not throw (doom_loop avoidance).
    await beforeHook(
      { tool: "task" },
      { args: { subagent_type: "coder" } },
    );
    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("scheduling.dispatch"));
  });
});

describe("hooks: G2 main-agent work-guard soft warn", async () => {
  const tmp = createTmp("aion-g2-");
  let beforeHook;

  before(async () => {
    const result = await createPlugin(tmp);
    beforeHook = result["tool.execute.before"];
  });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("traces a role.work_violation event when main agent edits project source", async () => {
    await beforeHook(
      { tool: "write" },
      { args: { filePath: "src/index.ts", content: "modified" } },
    );
    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("role.work_violation"), "expected role.work_violation trace event");
  });

  it("does NOT trace role.work_violation when writing to .opencode/memory/", async () => {
    const before = (readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8")
      .match(/role\.work_violation/g) || []).length;
    await beforeHook(
      { tool: "write" },
      { args: { filePath: ".opencode/memory/progress.md", content: "ok" } },
    );
    const after = (readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8")
      .match(/role\.work_violation/g) || []).length;
    assert.equal(after, before, "writing to memory/ must NOT trigger G2");
  });

  it("does NOT throw on violation — soft warn only", async () => {
    // The call should resolve, not reject. If G2 threw, this would throw.
    await beforeHook(
      { tool: "edit" },
      { args: { filePath: "src/foo.ts", oldString: "a", newString: "b" } },
    );
    // If we reach this assertion, no throw happened.
    assert.ok(true);
  });
});

describe("hooks: G3 reportback parsing on task completion", async () => {
  const tmp = createTmp("aion-g3-");
  let beforeHook, afterHook;

  before(async () => {
    const result = await createPlugin(tmp);
    beforeHook = result["tool.execute.before"];
    afterHook = result["tool.execute.after"];
  });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("parses next_call from worker reportback and stores it in governance state", async () => {
    // Simulate dispatch + reportback of information-collector proposing a back-edge.
    await beforeHook(
      { tool: "task" },
      { args: { subagent_type: "information-collector" } },
    );
    await afterHook(
      { tool: "task" },
      {
        args: { subagent_type: "information-collector" },
        output: "status: done\nnext_call: requirements-analyst\nnext_call_reason: contract gap in Section 3",
      },
    );
    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("reportback.parsed"), "expected reportback.parsed event");
    assert.ok(trace.includes("requirements-analyst"), "expected next_call value in trace");
  });

  it("extracts unresolved issues from reportback text", async () => {
    await afterHook(
      { tool: "task" },
      {
        args: { subagent_type: "coder" },
        output: "status: blocker\n- unresolved: feature X baseline missing\n- missing: eval script",
      },
    );
    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("unresolved"), "expected unresolved issues to be parsed and traced");
  });

  it("does not crash on empty reportback", async () => {
    await afterHook(
      { tool: "task" },
      { args: { subagent_type: "coder" }, output: "" },
    );
    // reaching here = no crash
    assert.ok(true);
  });

  it("does not parse reportback for non-worker dispatches (ts-critic)", async () => {
    const before = (readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8")
      .match(/reportback\.parsed/g) || []).length;
    await afterHook(
      { tool: "task" },
      { args: { subagent_type: "ts-critic" }, output: "status: done\nnext_call: stop" },
    );
    const after = (readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8")
      .match(/reportback\.parsed/g) || []).length;
    assert.equal(after, before, "ts-critic reportback should NOT be parsed as a worker reportback");
  });
});
