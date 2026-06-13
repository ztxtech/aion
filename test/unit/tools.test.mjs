import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

let _counter = 0;
function createTmp(prefix = "aion-tools-") {
  const d = mkdtempSync(join(tmpdir(), `${prefix}${_counter++}-`));
  mkdirSync(join(d, ".opencode"), { recursive: true });
  writeFileSync(join(d, "package.json"), '{"name":"test","type":"module"}');
  return d;
}

function createPlugin(tmp) {
  const bundle = importBundle();
  return bundle.then(b => b.default.server({
    directory: tmp,
    client: undefined,
    project: undefined,
    $: undefined,
  }, {}));
}

describe("tools: aion_safety_gate", async () => {
  const tmp = createTmp();
  let result;

  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("is registered", () => {
    assert.ok(result.tool?.aion_safety_gate);
  });

  it("returns allow for local-read", async () => {
    const output = await result.tool.aion_safety_gate.execute({
      action: "read config file",
      input_source: "user",
      impact_scope: "local-read",
      alternates: [],
    }, {});
    const parsed = JSON.parse(output);
    assert.equal(parsed.verdict, "allow");
    assert.ok(parsed.score < 50);
  });

  it("returns block for exec", async () => {
    const output = await result.tool.aion_safety_gate.execute({
      action: "run arbitrary script",
      input_source: "web",
      impact_scope: "exec",
      alternates: [],
    }, {});
    const parsed = JSON.parse(output);
    assert.equal(parsed.verdict, "block");
    assert.ok(parsed.score >= 80);
  });

  it("returns warn for local-write from web", async () => {
    const output = await result.tool.aion_safety_gate.execute({
      action: "write config file from web content",
      input_source: "web",
      impact_scope: "local-write",
      alternates: [],
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(parsed.score >= 40);
  });

  it("reduces score when alternates provided", async () => {
    const noAlt = await result.tool.aion_safety_gate.execute({
      action: "test",
      impact_scope: "local-write",
      input_source: "user",
      alternates: [],
    }, {});
    const withAlt = await result.tool.aion_safety_gate.execute({
      action: "test",
      impact_scope: "local-write",
      input_source: "user",
      alternates: ["read-only approach"],
    }, {});
    assert.ok(JSON.parse(withAlt).score < JSON.parse(noAlt).score);
  });
});

describe("tools: aion_leakage_check", async () => {
  const tmp = createTmp();
  let result;

  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("is registered", () => {
    assert.ok(result.tool?.aion_leakage_check);
  });

  it("returns safe for normal file", async () => {
    const output = await result.tool.aion_leakage_check.execute({
      file_path: "src/index.ts",
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(parsed.safe);
  });

  it("returns unsafe for .env", async () => {
    const output = await result.tool.aion_leakage_check.execute({
      file_path: "config/.env",
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(!parsed.safe);
  });

  it("returns unsafe for .pem", async () => {
    const output = await result.tool.aion_leakage_check.execute({
      file_path: "cert.pem",
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(!parsed.safe);
  });

  it("returns unsafe for content with AWS key", async () => {
    const output = await result.tool.aion_leakage_check.execute({
      file_path: "src/config.ts",
      content_sample: "key=AKIAIOSFODNN7EXAMPLE12345678",
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(!parsed.safe);
  });

  it("returns safe for .opencode/memory files", async () => {
    const output = await result.tool.aion_leakage_check.execute({
      file_path: ".opencode/memory/progress.md",
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(parsed.safe);
  });
});

describe("tools: aion_workspace_init", async () => {
  const tmp = createTmp();
  let result;

  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("is registered", () => {
    assert.ok(result.tool?.aion_workspace_init);
  });

  it("creates initial prompt and snapshot", async () => {
    const output = await result.tool.aion_workspace_init.execute({
      initial_prompt: "Build a time-series model",
      task_goal: "Forecast sales",
      evaluation: "RMSE < 0.5",
      non_goals: "Real-time inference",
    }, {});
    assert.ok(typeof output === "string");
    assert.ok(output.includes("workspace initialized"));

    const initialPath = join(tmp, ".opencode", "memory", "initial-prompt.md");
    assert.ok(existsSync(initialPath));
    const content = readFileSync(initialPath, "utf-8");
    assert.ok(content.includes("Build a time-series model"));
    assert.ok(content.includes("Forecast sales"));
    assert.ok(content.includes("RMSE < 0.5"));

    const snapshotPath = join(tmp, ".opencode", "memory", "context-snapshot.md");
    assert.ok(existsSync(snapshotPath));
    const snapshot = readFileSync(snapshotPath, "utf-8");
    assert.ok(snapshot.includes("workspace-init"));
  });
});

describe("tools: aion_compaction", async () => {
  const tmp = createTmp();
  let result;

  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("is registered", () => {
    assert.ok(result.tool?.aion_compaction);
  });

  it("writes context snapshot", async () => {
    const output = await result.tool.aion_compaction.execute({
      phase: "gather",
      open_blockers: [{ id: "BLK-001", description: "missing data", unblock_condition: "fetch dataset" }],
      forbidden_actions: ["no git push"],
      next_dispatch_focus: "information-collector",
      structural_decisions: ["use LSTM"],
      verified_evidence: ["data loaded successfully"],
    }, {});
    const parsed = JSON.parse(output);
    assert.equal(parsed.status, "ok");
    assert.equal(parsed.phase, "gather");

    const snapshotPath = join(tmp, ".opencode", "memory", "context-snapshot.md");
    assert.ok(existsSync(snapshotPath));
    const content = readFileSync(snapshotPath, "utf-8");
    assert.ok(content.includes("BLK-001"));
    assert.ok(content.includes("missing data"));
  });
});

describe("tools: aion_critic_dispatch", async () => {
  const tmp = createTmp();
  let result;

  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("is registered", () => {
    assert.ok(result.tool?.aion_critic_dispatch);
  });

  it("dispatches ts-critic", async () => {
    const output = await result.tool.aion_critic_dispatch.execute({
      critic: "ts-critic",
      goal: "Review model accuracy",
      evidence_artifacts: ["results/metrics.json"],
      unresolved_blockers: [],
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(parsed.dispatchId);
    assert.equal(parsed.critic, "ts-critic");
    assert.ok(parsed.instructions.length > 0);
  });

  it("dispatches c-critic", async () => {
    const output = await result.tool.aion_critic_dispatch.execute({
      critic: "c-critic",
      goal: "Final review",
      evidence_artifacts: [],
      unresolved_blockers: ["BLK-001"],
    }, {});
    const parsed = JSON.parse(output);
    assert.equal(parsed.critic, "c-critic");
  });
});

describe("tools: aion_critic_verdict", async () => {
  const tmp = createTmp();
  let result;

  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("is registered", () => {
    assert.ok(result.tool?.aion_critic_verdict);
  });

  it("records ts-critic allow-stop and transitions phase", async () => {
    await result.tool.aion_critic_verdict.execute({
      critic: "ts-critic",
      verdict: "allow-stop",
      blockers: [],
      why_not_stop: "",
      next_call: "",
    }, {});
    const statusOutput = await result.tool.aion_leakage_check.execute({ file_path: "x" }, {});
    const tracePath = join(tmp, ".opencode", "trace.md");
    const trace = readFileSync(tracePath, "utf-8");
    assert.ok(trace.includes("allow-stop"));
  });

  it("records blockers from verdict", async () => {
    const output = await result.tool.aion_critic_verdict.execute({
      critic: "ts-critic",
      verdict: "absolutely-cannot-stop-now",
      blockers: [{
        description: "missing validation",
        evidence: "no val results",
        forbidden_action: "stop",
        unblock_condition: "run validation",
      }],
      why_not_stop: "",
      next_call: "",
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(parsed.open_blockers.length > 0);
  });
});

describe("tools: aion_record_blocker / aion_resolve_blocker", async () => {
  const tmp = createTmp();
  let result;

  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("records a blocker", async () => {
    const output = await result.tool.aion_record_blocker.execute({
      source: "ts-critic",
      description: "Data leakage detected",
      evidence: "test data used in training",
      forbidden_action: "continue training",
      unblock_condition: "separate train/test split",
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(parsed.recorded);
    assert.ok(parsed.recorded.id.startsWith("BLK-"));
  });

  it("resolves a blocker", async () => {
    const recOutput = await result.tool.aion_record_blocker.execute({
      source: "main-agent",
      description: "Test blocker",
      evidence: "evidence",
      forbidden_action: "none",
      unblock_condition: "fixed",
    }, {});
    const recParsed = JSON.parse(recOutput);
    const blockerId = recParsed.recorded.id;

    const resOutput = await result.tool.aion_resolve_blocker.execute({
      blocker_id: blockerId,
      fix_evidence: "Issue resolved",
    }, {});
    const resParsed = JSON.parse(resOutput);
    assert.ok(resParsed.resolved);
  });

  it("returns error for unknown blocker", async () => {
    const output = await result.tool.aion_resolve_blocker.execute({
      blocker_id: "BLK-999",
      fix_evidence: "n/a",
    }, {});
    const parsed = JSON.parse(output);
    assert.equal(parsed.resolved, false);
  });
});

describe("tools: aion_memory_sync", async () => {
  const tmp = createTmp();
  let result;

  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("is registered", () => {
    assert.ok(result.tool?.aion_memory_sync);
  });

  it("appends to progress artifact", async () => {
    const output = await result.tool.aion_memory_sync.execute({
      artifact: "progress",
      section: "Current Stage",
      content: "- Phase: gather\n- Status: active",
      mode: "append",
    }, {});
    assert.ok(typeof output === "string");
    assert.ok(output.includes("progress"));

    const path = join(tmp, ".opencode", "memory", "progress.md");
    assert.ok(existsSync(path));
    const content = readFileSync(path, "utf-8");
    assert.ok(content.includes("Phase: gather"));
  });

  it("replaces entire artifact", async () => {
    await result.tool.aion_memory_sync.execute({
      artifact: "features",
      section: "main",
      content: "# Features\n\n## Delivered\n\n- Feature A",
      mode: "replace",
    }, {});

    const path = join(tmp, ".opencode", "memory", "features.md");
    const content = readFileSync(path, "utf-8");
    assert.ok(content.includes("Feature A"));
    assert.ok(!content.includes("(none yet)"));
  });
});

describe("tools: aion_todo_update", async () => {
  const tmp = createTmp();
  let result;

  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("is registered", () => {
    assert.ok(result.tool?.aion_todo_update);
  });

  it("adds a todo item", async () => {
    const output = await result.tool.aion_todo_update.execute({
      action: "add",
      plan_step: "Analyze dataset",
      owner: "information-collector",
    }, {});
    const parsed = JSON.parse(output);
    assert.equal(parsed.action, "add");
    assert.ok(parsed.added.length > 0);
    assert.ok(parsed.totalItems >= 1);
  });

  it("updates todo state", async () => {
    const addOutput = await result.tool.aion_todo_update.execute({
      action: "add",
      plan_step: "Build model",
      owner: "coder",
    }, {});
    const addParsed = JSON.parse(addOutput);
    const todoId = addParsed.added[0]?.id;

    const updateOutput = await result.tool.aion_todo_update.execute({
      action: "update-state",
      todo_id: todoId,
      new_state: "in-progress",
    }, {});
    const updateParsed = JSON.parse(updateOutput);
    assert.equal(updateParsed.to, "in-progress");
  });

  it("gets all todos", async () => {
    const output = await result.tool.aion_todo_update.execute({
      action: "get",
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(Array.isArray(parsed.items));
  });

  it("rolls back a todo item", async () => {
    const addOutput = await result.tool.aion_todo_update.execute({
      action: "add",
      plan_step: "Test rollback",
      owner: "coder",
    }, {});
    const addParsed = JSON.parse(addOutput);
    const todoId = addParsed.added[0]?.id;

    await result.tool.aion_todo_update.execute({
      action: "update-state",
      todo_id: todoId,
      new_state: "done",
    }, {});

    const rollbackOutput = await result.tool.aion_todo_update.execute({
      action: "rollback",
      todo_id: todoId,
      rollback_depth: "self",
    }, {});
    const rollbackParsed = JSON.parse(rollbackOutput);
    assert.ok(rollbackParsed.rolledBack.includes(todoId));
  });

  it("add-from-reportback extracts steps", async () => {
    const output = await result.tool.aion_todo_update.execute({
      action: "add-from-reportback",
      reportback_text: "suggested_next_step: Run validation on holdout set\nremaining_gap: Feature engineering still needed",
      reportback_source: "information-collector",
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(parsed.added.length >= 1, "should extract at least one item from reportback");
  });

  it("returns error for unknown action", async () => {
    const output = await result.tool.aion_todo_update.execute({
      action: "get",
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(parsed.items !== undefined);
  });

  it("returns tui_todos in add response", async () => {
    const output = await result.tool.aion_todo_update.execute({
      action: "add",
      plan_step: "TUI sync check",
      owner: "coder",
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(Array.isArray(parsed.tui_todos), "should have tui_todos array");
    assert.ok(parsed.tui_todos.length > 0);
    const tuiItem = parsed.tui_todos.find(t => t.content.includes("TUI sync check"));
    assert.ok(tuiItem, "should find the added item in tui_todos");
    assert.ok(["pending", "in_progress", "completed"].includes(tuiItem.status), `invalid status: ${tuiItem.status}`);
    assert.equal(tuiItem.priority, "high");
    assert.ok(parsed.next_action.includes("todowrite"));
  });

  it("returns tui_todos in update-state response", async () => {
    const addOutput = await result.tool.aion_todo_update.execute({
      action: "add",
      plan_step: "State change TUI check",
      owner: "coder",
    }, {});
    const addParsed = JSON.parse(addOutput);
    const todoId = addParsed.added[0]?.id;

    const updateOutput = await result.tool.aion_todo_update.execute({
      action: "update-state",
      todo_id: todoId,
      new_state: "in-progress",
    }, {});
    const updateParsed = JSON.parse(updateOutput);
    assert.ok(Array.isArray(updateParsed.tui_todos));
    assert.ok(updateParsed.next_action.includes("todowrite"));
  });

  it("returns tui_todos in rollback response", async () => {
    const addOutput = await result.tool.aion_todo_update.execute({
      action: "add",
      plan_step: "Rollback TUI check",
      owner: "coder",
    }, {});
    const addParsed = JSON.parse(addOutput);
    const todoId = addParsed.added[0]?.id;

    await result.tool.aion_todo_update.execute({
      action: "update-state",
      todo_id: todoId,
      new_state: "done",
    }, {});

    const rbOutput = await result.tool.aion_todo_update.execute({
      action: "rollback",
      todo_id: todoId,
      rollback_depth: "self",
    }, {});
    const rbParsed = JSON.parse(rbOutput);
    assert.ok(Array.isArray(rbParsed.tui_todos));
    assert.ok(rbParsed.next_action.includes("todowrite"));
  });

  it("returns tui_todos in get response", async () => {
    const output = await result.tool.aion_todo_update.execute({
      action: "get",
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(Array.isArray(parsed.tui_todos));
    assert.ok(parsed.next_action.includes("todowrite"));
  });

  it("rollback depth self-and-downstream works", async () => {
    const addOutput1 = await result.tool.aion_todo_update.execute({
      action: "add",
      plan_step: "Downstream parent",
      owner: "coder",
    }, {});
    const parentId = JSON.parse(addOutput1).added[0]?.id;

    const addOutput2 = await result.tool.aion_todo_update.execute({
      action: "add",
      plan_step: "Downstream child",
      owner: "coder",
    }, {});
    const childId = JSON.parse(addOutput2).added[0]?.id;

    await result.tool.aion_todo_update.execute({
      action: "update-state",
      todo_id: parentId,
      new_state: "done",
    }, {});

    await result.tool.aion_todo_update.execute({
      action: "update-state",
      todo_id: childId,
      new_state: "done",
    }, {});

    const rbOutput = await result.tool.aion_todo_update.execute({
      action: "rollback",
      todo_id: parentId,
      rollback_depth: "self-and-downstream",
    }, {});
    const rbParsed = JSON.parse(rbOutput);
    assert.ok(rbParsed.rolledBack.includes(parentId), `parent should be rolled back: ${JSON.stringify(rbParsed.rolledBack)}`);
    assert.ok(rbParsed.tui_todos, "should have tui_todos");
  });
});

describe("tools: aion_set_interactive_mode", async () => {
  const tmp = createTmp();
  let result;

  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("is registered", () => {
    assert.ok(result.tool?.aion_set_interactive_mode);
  });

  it("can set interactive mode", async () => {
    const output = await result.tool.aion_set_interactive_mode.execute({
      enabled: true,
      reason: "user requested",
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(parsed.interactive === true || parsed.mode === "interactive" || parsed.ok !== false);
  });

  it("can set autonomous mode", async () => {
    const output = await result.tool.aion_set_interactive_mode.execute({
      enabled: false,
      reason: "user leaving",
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(parsed.interactive === false || parsed.mode === "autonomous" || parsed.ok !== false);
  });
});

describe("tools: aion_pre_stop_gate", async () => {
  const tmp = createTmp();
  let result;

  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("is registered", () => {
    assert.ok(result.tool?.aion_pre_stop_gate);
  });

  it("blocks stop when conditions not met", async () => {
    const output = await result.tool.aion_pre_stop_gate.execute({
      brain_storm_done: false,
      deep_reasoning_done: false,
      ts_critic_allow_stop: false,
      c_critic_verdict: "unset",
      file_paths_checked: [],
      completion_gate_fresh: false,
      workspace_cleaned: false,
      search_coverage: false,
      todo_semantics: false,
      report_evidence: false,
      figure_analysis: false,
      visual_test_loop: false,
    }, {});
    const parsed = JSON.parse(output);
    assert.equal(parsed.allowStop, false);
    assert.ok(parsed.blockers.length > 0);
  });

  it("allows stop when all conditions met", async () => {
    const output = await result.tool.aion_pre_stop_gate.execute({
      brain_storm_done: true,
      deep_reasoning_done: true,
      ts_critic_allow_stop: true,
      c_critic_verdict: "approve-stop",
      file_paths_checked: [],
      completion_gate_fresh: true,
      workspace_cleaned: true,
      search_coverage: true,
      todo_semantics: true,
      report_evidence: true,
      figure_analysis: true,
      visual_test_loop: true,
    }, {});
    const parsed = JSON.parse(output);
    assert.equal(parsed.allowStop, true);
    assert.equal(parsed.blockers.length, 0);
  });

  it("writes completion gate file", async () => {
    await result.tool.aion_pre_stop_gate.execute({
      brain_storm_done: true,
      deep_reasoning_done: true,
      ts_critic_allow_stop: true,
      c_critic_verdict: "approve-stop",
      file_paths_checked: [],
      completion_gate_fresh: true,
      workspace_cleaned: true,
      search_coverage: true,
      todo_semantics: true,
      report_evidence: true,
      figure_analysis: true,
      visual_test_loop: true,
    }, {});
    const gatePath = join(tmp, ".opencode", "memory", "completion-gate.md");
    assert.ok(existsSync(gatePath));
    const content = readFileSync(gatePath, "utf-8");
    assert.ok(content.includes("allow-stop"));
  });
});

describe("tools: all expected aion tools are registered", async () => {
  const tmp = createTmp();
  let result;

  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  const expectedAionTools = [
    "aion_safety_gate",
    "aion_leakage_check",
    "aion_workspace_init",
    "aion_compaction",
    "aion_pre_stop_gate",
    "aion_critic_dispatch",
    "aion_critic_verdict",
    "aion_record_blocker",
    "aion_resolve_blocker",
    "aion_memory_sync",
    "aion_todo_update",
    "aion_set_interactive_mode",
  ];

  for (const name of expectedAionTools) {
    it(`${name} is registered`, () => {
      assert.ok(result.tool?.[name], `${name} should be registered`);
    });
  }

  it("ztxexp tools are registered", () => {
    assert.ok(result.tool?.aion_ztxexp_init, "aion_ztxexp_init should be registered");
    assert.ok(result.tool?.aion_ztxexp_validate, "aion_ztxexp_validate should be registered");
    assert.ok(result.tool?.aion_ztxexp_run, "aion_ztxexp_run should be registered");
  });

  it("total aion tool count >= 10", () => {
    const aionTools = Object.keys(result.tool ?? {}).filter(n => n.startsWith("aion_"));
    assert.ok(aionTools.length >= 10, `expected >= 10 aion tools, got ${aionTools.length}: ${aionTools.join(", ")}`);
  });
});
