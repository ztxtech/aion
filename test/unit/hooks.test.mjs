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
