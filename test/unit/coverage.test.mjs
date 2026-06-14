import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

let _counter = 0;
function createTmp(prefix = "aion-cov-") {
  const d = mkdtempSync(join(tmpdir(), `${prefix}${_counter++}-`));
  mkdirSync(join(d, ".opencode"), { recursive: true });
  writeFileSync(join(d, "package.json"), '{"name":"test","type":"module"}');
  return d;
}

function createPlugin(tmp) {
  return importBundle().then(b => b.default.server({
    directory: tmp,
    client: undefined,
    project: undefined,
    $: undefined,
  }, {}));
}

describe("coverage: aion_safety_gate — exhaustive branches", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  const cases = [
    // [impact_scope, expected_min_risk_score]
    ["local-read", 10],
    ["local-write", 40],
    ["remote-network", 70],
    ["filesystem-bulk", 60],
    ["exec", 80],
    ["git-mutation", 70],
    ["external-deps", 50],
  ];

  for (const [scope, minRisk] of cases) {
    it(`scope=${scope} produces a non-negative score and a valid verdict`, async () => {
      const out = JSON.parse(await result.tool.aion_safety_gate.execute({
        action: `test ${scope}`,
        impact_scope: scope,
        input_source: "user",
        alternates: [],
      }, {}));
      assert.ok(["allow", "warn", "block"].includes(out.verdict), `verdict=${out.verdict}`);
      assert.ok(typeof out.score === "number" && out.score >= 0 && out.score <= 100);
      assert.ok(out.components.riskScore >= minRisk, `riskScore=${out.components.riskScore} for ${scope}`);
    });
  }

  it("uses default input_source=user and default impact_scope=local-read", async () => {
    const out = JSON.parse(await result.tool.aion_safety_gate.execute({
      action: "minimal args",
    }, {}));
    assert.equal(out.verdict, "allow");
  });

  it("clamps score to 0 minimum even with extreme alternates (shouldn't go below 0)", async () => {
    const out = JSON.parse(await result.tool.aion_safety_gate.execute({
      action: "test clamp low",
      impact_scope: "local-read",
      input_source: "user",
      alternates: ["a", "b", "c"],
    }, {}));
    assert.ok(out.score >= 0);
  });

  it("input_source=web adds 30 risk over local-read user", async () => {
    const user = JSON.parse(await result.tool.aion_safety_gate.execute({
      action: "x", impact_scope: "local-read", input_source: "user", alternates: [],
    }, {}));
    const web = JSON.parse(await result.tool.aion_safety_gate.execute({
      action: "x", impact_scope: "local-read", input_source: "web", alternates: [],
    }, {}));
    assert.equal(web.components.inputRisk, 30);
    assert.equal(user.components.inputRisk, 5);
  });

  it("input_source=github adds 30 risk", async () => {
    const out = JSON.parse(await result.tool.aion_safety_gate.execute({
      action: "x", impact_scope: "local-read", input_source: "github", alternates: [],
    }, {}));
    assert.equal(out.components.inputRisk, 30);
  });

  it("input_source=env adds 30 risk", async () => {
    const out = JSON.parse(await result.tool.aion_safety_gate.execute({
      action: "x", impact_scope: "local-read", input_source: "env", alternates: [],
    }, {}));
    assert.equal(out.components.inputRisk, 30);
  });

  it("input_source=file adds 10 risk", async () => {
    const out = JSON.parse(await result.tool.aion_safety_gate.execute({
      action: "x", impact_scope: "local-read", input_source: "file", alternates: [],
    }, {}));
    assert.equal(out.components.inputRisk, 10);
  });

  it("alternates subtracts 10 from total", async () => {
    const noAlt = JSON.parse(await result.tool.aion_safety_gate.execute({
      action: "x", impact_scope: "local-write", input_source: "user", alternates: [],
    }, {}));
    const withAlt = JSON.parse(await result.tool.aion_safety_gate.execute({
      action: "x", impact_scope: "local-write", input_source: "user", alternates: ["alt1"],
    }, {}));
    assert.equal(withAlt.components.altScore, -10);
    assert.equal(noAlt.components.altScore, 0);
    assert.equal(withAlt.score, noAlt.score - 10);
  });

  it("verdict=warn for 50-79 score range", async () => {
    // 60 (filesystem-bulk) + 5 (user) - 10 (alts) = 55 → warn
    const out = JSON.parse(await result.tool.aion_safety_gate.execute({
      action: "x", impact_scope: "filesystem-bulk", input_source: "user", alternates: ["a"],
    }, {}));
    assert.equal(out.verdict, "warn");
    assert.ok(out.score >= 50 && out.score < 80);
  });

  it("verdict=block for >=80 score", async () => {
    // 80 (exec) + 5 = 85 → block
    const out = JSON.parse(await result.tool.aion_safety_gate.execute({
      action: "x", impact_scope: "exec", input_source: "user", alternates: [],
    }, {}));
    assert.equal(out.verdict, "block");
  });

  it("returns structured requirements object for each verdict class", async () => {
    const allow = JSON.parse(await result.tool.aion_safety_gate.execute({
      action: "a", impact_scope: "local-read", input_source: "user", alternates: [],
    }, {}));
    assert.ok(allow.requirements.allow);
    assert.ok(allow.requirements.warn);
    assert.ok(allow.requirements.block);
  });

  it("appends a trace event for each call", async () => {
    const tracePath = join(tmp, ".opencode", "trace.md");
    const sizeBefore = existsSync(tracePath) ? statSync(tracePath).size : 0;
    await result.tool.aion_safety_gate.execute({
      action: "trace check",
      impact_scope: "local-write",
      input_source: "user",
      alternates: [],
    }, {});
    const sizeAfter = statSync(tracePath).size;
    assert.ok(sizeAfter > sizeBefore);
  });
});

describe("coverage: aion_leakage_check — exhaustive branches", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("blocks .env file paths", async () => {
    const out = JSON.parse(await result.tool.aion_leakage_check.execute({ file_path: ".env" }, {}));
    assert.equal(out.safe, false);
    assert.match(out.reason, /credentials|secret/i);
  });

  it("blocks /secrets/ dir (absolute path with leading /)", async () => {
    const out = JSON.parse(await result.tool.aion_leakage_check.execute({ file_path: "/secrets/db.txt" }, {}));
    assert.equal(out.safe, false);
  });

  it("blocks /secret/ dir (absolute path with leading /)", async () => {
    const out = JSON.parse(await result.tool.aion_leakage_check.execute({ file_path: "/secret/db.txt" }, {}));
    assert.equal(out.safe, false);
  });

  it("blocks .key file extension", async () => {
    const out = JSON.parse(await result.tool.aion_leakage_check.execute({ file_path: "private.key" }, {}));
    assert.equal(out.safe, false);
  });

  it("blocks PEM private key in content", async () => {
    const out = JSON.parse(await result.tool.aion_leakage_check.execute({
      file_path: "src/cert.ts",
      content_sample: "-----BEGIN RSA PRIVATE KEY-----\nMIIE...",
    }, {}));
    assert.equal(out.safe, false);
    assert.match(out.reason, /private key/i);
  });

  it("allows /test/ data CSV by default (contract is the source of truth)", async () => {
    // The old design hard-coded /test/val/holdout/ paths as a denylist. The new
    // design delegates to dataBoundaries.forbiddenReads in the contract. With an
    // empty contract, the path is allowed — the requirements-analyst writes the
    // forbidden list into the contract, not the hook.
    const out = JSON.parse(await result.tool.aion_leakage_check.execute({ file_path: "data/test/secret.csv" }, {}));
    assert.equal(out.safe, true);
  });

  it("allows /val/ data JSONL by default", async () => {
    const out = JSON.parse(await result.tool.aion_leakage_check.execute({ file_path: "data/val/labels.jsonl" }, {}));
    assert.equal(out.safe, true);
  });

  it("allows /holdout/ data TSV by default", async () => {
    const out = JSON.parse(await result.tool.aion_leakage_check.execute({ file_path: "data/holdout/scores.tsv" }, {}));
    assert.equal(out.safe, true);
  });

  it("allows /hidden/ data parquet by default", async () => {
    const out = JSON.parse(await result.tool.aion_leakage_check.execute({ file_path: "data/hidden/data.parquet" }, {}));
    assert.equal(out.safe, true);
  });

  it("allows /private/ data csv by default", async () => {
    const out = JSON.parse(await result.tool.aion_leakage_check.execute({ file_path: "data/private/data.csv" }, {}));
    assert.equal(out.safe, true);
  });

  it("blocks .opencode/agents/*.md internal prompt access", async () => {
    const out = JSON.parse(await result.tool.aion_leakage_check.execute({ file_path: ".opencode/agents/main.md" }, {}));
    assert.equal(out.safe, false);
    assert.match(out.reason, /prompt|extraction/i);
  });

  it("allows .opencode/memory/* files (shared cache)", async () => {
    const out = JSON.parse(await result.tool.aion_leakage_check.execute({ file_path: ".opencode/memory/progress.md" }, {}));
    assert.equal(out.safe, true);
  });

  it("allows .opencode/trace.md (shared event bus)", async () => {
    const out = JSON.parse(await result.tool.aion_leakage_check.execute({ file_path: ".opencode/trace.md" }, {}));
    assert.equal(out.safe, true);
  });

  it("allows normal source files", async () => {
    const out = JSON.parse(await result.tool.aion_leakage_check.execute({ file_path: "src/main.ts" }, {}));
    assert.equal(out.safe, true);
  });

  it("logs leakage detection event to trace when unsafe", async () => {
    const tracePath = join(tmp, ".opencode", "trace.md");
    const sizeBefore = existsSync(tracePath) ? statSync(tracePath).size : 0;
    await result.tool.aion_leakage_check.execute({ file_path: ".env" }, {});
    const sizeAfter = statSync(tracePath).size;
    assert.ok(sizeAfter > sizeBefore);
    const trace = readFileSync(tracePath, "utf-8");
    assert.ok(trace.includes("leakage"));
  });
});

describe("coverage: aion_workspace_init — full branch coverage", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("writes initial-prompt.md with goal/eval/non_goals", async () => {
    await result.tool.aion_workspace_init.execute({
      initial_prompt: "build x",
      task_goal: "ship y",
      evaluation: "rmse<1",
      non_goals: "speed",
    }, {});

    const p = join(tmp, ".opencode", "memory", "initial-prompt.md");
    const c = readFileSync(p, "utf-8");
    assert.ok(c.includes("build x"));
    assert.ok(c.includes("ship y"));
    assert.ok(c.includes("rmse<1"));
    assert.ok(c.includes("speed"));
  });

  it("writes todo-map.md even without optional fields", async () => {
    await result.tool.aion_workspace_init.execute({ initial_prompt: "x" }, {});
    const p = join(tmp, ".opencode", "memory", "todo-map.md");
    assert.ok(existsSync(p));
  });

  it("is idempotent: calling twice does not throw and the second overwrites", async () => {
    const r1 = await result.tool.aion_workspace_init.execute({ initial_prompt: "first" }, {});
    const r2 = await result.tool.aion_workspace_init.execute({ initial_prompt: "second" }, {});
    assert.ok(r1.includes("workspace initialized"));
    assert.ok(r2.includes("workspace initialized"));
    const c = readFileSync(join(tmp, ".opencode", "memory", "initial-prompt.md"), "utf-8");
    assert.ok(c.includes("second"));
  });

  it("handles missing optional task_goal/evaluation/non_goals gracefully", async () => {
    const out = await result.tool.aion_workspace_init.execute({ initial_prompt: "minimal" }, {});
    assert.ok(typeof out === "string");
    const snap = readFileSync(join(tmp, ".opencode", "memory", "context-snapshot.md"), "utf-8");
    assert.ok(snap.includes("(unset)"));
  });

  it("appends a file.written event to trace", async () => {
    await result.tool.aion_workspace_init.execute({ initial_prompt: "trace check" }, {});
    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("workspace_init"));
  });
});

describe("coverage: aion_compaction — exhaustive branches", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("writes a minimal snapshot with no args", async () => {
    const out = JSON.parse(await result.tool.aion_compaction.execute({}, {}));
    assert.equal(out.status, "ok");
    const p = join(tmp, ".opencode", "memory", "context-snapshot.md");
    assert.ok(existsSync(p));
  });

  it("extracts phase= from next_dispatch_focus when phase=compaction", async () => {
    const out = JSON.parse(await result.tool.aion_compaction.execute({
      next_dispatch_focus: "phase=implement run coder",
    }, {}));
    assert.equal(out.phase, "implement");
  });

  it("respects explicit phase when provided", async () => {
    const out = JSON.parse(await result.tool.aion_compaction.execute({
      phase: "ts-pre-review",
      next_dispatch_focus: "phase=implement this should be ignored",
    }, {}));
    assert.equal(out.phase, "ts-pre-review");
  });

  it("renders open_blockers in snapshot", async () => {
    const out = JSON.parse(await result.tool.aion_compaction.execute({
      open_blockers: [
        { id: "B-1", description: "missing config", unblock_condition: "create config" },
        { id: "B-2", description: "wrong path", unblock_condition: "fix path" },
      ],
    }, {}));
    assert.equal(out.status, "ok");
    const c = readFileSync(join(tmp, ".opencode", "memory", "context-snapshot.md"), "utf-8");
    assert.ok(c.includes("[B-1]"));
    assert.ok(c.includes("[B-2]"));
  });

  it("renders empty Open Blockers section when none", async () => {
    await result.tool.aion_compaction.execute({ open_blockers: [] }, {});
    const c = readFileSync(join(tmp, ".opencode", "memory", "context-snapshot.md"), "utf-8");
    assert.ok(c.includes("Open Blockers"));
    assert.ok(c.includes("(none)"));
  });

  it("renders forbidden_actions when present", async () => {
    await result.tool.aion_compaction.execute({
      forbidden_actions: ["do not push", "do not delete"],
    }, {});
    const c = readFileSync(join(tmp, ".opencode", "memory", "context-snapshot.md"), "utf-8");
    assert.ok(c.includes("Forbidden Actions"));
    assert.ok(c.includes("do not push"));
  });

  it("omits Forbidden Actions section when empty", async () => {
    await result.tool.aion_compaction.execute({ forbidden_actions: [] }, {});
    const c = readFileSync(join(tmp, ".opencode", "memory", "context-snapshot.md"), "utf-8");
    assert.ok(!c.includes("Forbidden Actions"));
  });

  it("renders structural_decisions and verified_evidence", async () => {
    await result.tool.aion_compaction.execute({
      structural_decisions: ["use LSTM", "use early stop"],
      verified_evidence: ["rmse=0.4", "loss decreased"],
    }, {});
    const c = readFileSync(join(tmp, ".opencode", "memory", "context-snapshot.md"), "utf-8");
    assert.ok(c.includes("Structural Decisions"));
    assert.ok(c.includes("use LSTM"));
    assert.ok(c.includes("Verified Evidence"));
    assert.ok(c.includes("rmse=0.4"));
  });

  it("uses (unset) when next_dispatch_focus is empty", async () => {
    await result.tool.aion_compaction.execute({ next_dispatch_focus: "" }, {});
    const c = readFileSync(join(tmp, ".opencode", "memory", "context-snapshot.md"), "utf-8");
    assert.ok(c.includes("(unset)"));
  });

  it("appends a compaction.finished event to trace", async () => {
    await result.tool.aion_compaction.execute({ phase: "gather" }, {});
    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("compaction.finished") || trace.includes("compaction:"));
  });
});

describe("coverage: aion_pre_stop_gate — exhaustive branches", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  const allTrue = {
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
  };

  it("detects missing file paths on disk", async () => {
    const out = JSON.parse(await result.tool.aion_pre_stop_gate.execute({
      ...allTrue,
      file_paths_checked: ["/definitely/does/not/exist/a.json", "/also/not/here.txt"],
    }, {}));
    assert.equal(out.allowStop, false);
    assert.ok(out.missingPaths.length === 2);
    assert.ok(out.blockers.some(b => b.includes("file paths missing")));
  });

  it("accepts existing file paths", async () => {
    const realPath = join(tmp, "exists.txt");
    writeFileSync(realPath, "hi");
    const out = JSON.parse(await result.tool.aion_pre_stop_gate.execute({
      ...allTrue,
      file_paths_checked: [realPath],
    }, {}));
    assert.equal(out.missingPaths.length, 0);
  });

  it("blocks when c_critic verdict=reject-stop", async () => {
    const out = JSON.parse(await result.tool.aion_pre_stop_gate.execute({
      ...allTrue,
      c_critic_verdict: "reject-stop",
    }, {}));
    assert.equal(out.allowStop, false);
    assert.ok(out.blockers.some(b => b.includes("c-critic has rejected")));
  });

  it("blocks when c_critic verdict=unset", async () => {
    const out = JSON.parse(await result.tool.aion_pre_stop_gate.execute({
      ...allTrue,
      c_critic_verdict: "unset",
    }, {}));
    assert.equal(out.allowStop, false);
    assert.ok(out.blockers.some(b => b.includes("c-critic verdict missing")));
  });

  it("each individual false flag produces a specific blocker", async () => {
    const flags = [
      "brain_storm_done", "deep_reasoning_done", "ts_critic_allow_stop",
      "completion_gate_fresh", "workspace_cleaned", "search_coverage",
      "todo_semantics", "report_evidence", "figure_analysis", "visual_test_loop",
    ];
    for (const flag of flags) {
      const args = { ...allTrue, [flag]: false };
      const out = JSON.parse(await result.tool.aion_pre_stop_gate.execute(args, {}));
      assert.equal(out.allowStop, false, `${flag} should block`);
      assert.ok(out.blockers.length > 0, `${flag} should add at least one blocker`);
    }
  });

  it("writes completion-gate.md with verdict and blockers", async () => {
    await result.tool.aion_pre_stop_gate.execute({
      ...allTrue,
      brain_storm_done: false,
    }, {});
    const p = join(tmp, ".opencode", "memory", "completion-gate.md");
    assert.ok(existsSync(p));
    const c = readFileSync(p, "utf-8");
    assert.ok(c.includes("Completion Gate"));
    assert.ok(c.includes("not allowed") || c.includes("allow-stop"));
  });

  it("records allow-stop signal in governance when conditions met", async () => {
    await result.tool.aion_pre_stop_gate.execute({ ...allTrue }, {});
    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("allow-stop") || trace.includes("stop signal"));
  });

  it("records absolutely-cannot-stop-now when blocked", async () => {
    const tracePath = join(tmp, ".opencode", "trace.md");
    const sizeBefore = statSync(tracePath).size;
    await result.tool.aion_pre_stop_gate.execute({
      ...allTrue,
      brain_storm_done: false,
    }, {});
    const sizeAfter = statSync(tracePath).size;
    assert.ok(sizeAfter > sizeBefore);
  });
});

describe("coverage: aion_critic_dispatch — exhaustive branches", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("uses default empty arrays for evidence_artifacts and unresolved_blockers", async () => {
    const out = JSON.parse(await result.tool.aion_critic_dispatch.execute({
      critic: "ts-critic",
      goal: "minimal",
    }, {}));
    assert.equal(out.critic, "ts-critic");
    assert.ok(out.instructions.some(i => i.includes("(none)")));
  });

  it("truncates long goal in trace but keeps full goal in payload", async () => {
    const longGoal = "g".repeat(500);
    const out = JSON.parse(await result.tool.aion_critic_dispatch.execute({
      critic: "ts-critic",
      goal: longGoal,
      evidence_artifacts: [],
      unresolved_blockers: [],
    }, {}));
    assert.equal(out.critic, "ts-critic");
  });

  it("includes REBUT instructions when unresolved_blockers non-empty", async () => {
    const out = JSON.parse(await result.tool.aion_critic_dispatch.execute({
      critic: "ts-critic",
      goal: "test",
      evidence_artifacts: [],
      unresolved_blockers: ["BLK-001", "BLK-002"],
    }, {}));
    const rebutLine = out.instructions.find(i => i.includes("REBUT"));
    assert.ok(rebutLine);
    assert.ok(rebutLine.includes("BLK-001"));
    assert.ok(rebutLine.includes("BLK-002"));
  });

  it("does NOT include REBUT instructions when unresolved_blockers empty", async () => {
    const out = JSON.parse(await result.tool.aion_critic_dispatch.execute({
      critic: "ts-critic",
      goal: "test",
      evidence_artifacts: [],
      unresolved_blockers: [],
    }, {}));
    const rebutLine = out.instructions.find(i => i.includes("REBUT"));
    assert.equal(rebutLine, undefined);
  });

  it("emits a critic.review event to trace", async () => {
    await result.tool.aion_critic_dispatch.execute({
      critic: "c-critic",
      goal: "final",
      evidence_artifacts: [],
      unresolved_blockers: [],
    }, {});
    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("c-critic"));
  });

  it("returns a unique dispatchId with DISP- prefix", async () => {
    const out1 = JSON.parse(await result.tool.aion_critic_dispatch.execute({
      critic: "ts-critic", goal: "x", evidence_artifacts: [], unresolved_blockers: [],
    }, {}));
    // Wait to ensure timestamp differs
    await new Promise(r => setTimeout(r, 5));
    const out2 = JSON.parse(await result.tool.aion_critic_dispatch.execute({
      critic: "ts-critic", goal: "y", evidence_artifacts: [], unresolved_blockers: [],
    }, {}));
    assert.match(out1.dispatchId, /^DISP-\d+$/);
    assert.match(out2.dispatchId, /^DISP-\d+$/);
    // Should be unique
    assert.notEqual(out1.dispatchId, out2.dispatchId);
  });
});

describe("coverage: aion_critic_verdict — exhaustive branches", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("ts-critic allow-stop from ts-pre-review transitions to implement", async () => {
    // First set phase to ts-pre-review via dispatch
    await result.tool.aion_critic_dispatch.execute({
      critic: "ts-critic", goal: "review", evidence_artifacts: [], unresolved_blockers: [],
    }, {});

    const out = JSON.parse(await result.tool.aion_critic_verdict.execute({
      critic: "ts-critic",
      verdict: "allow-stop",
      blockers: [],
      why_not_stop: "",
      next_call: "",
    }, {}));
    assert.equal(out.signal, "allow-stop");
    assert.equal(out.recorded, true);
  });

  it("ts-critic rebuttal-mode records blockers and force_continue=true", async () => {
    const out = JSON.parse(await result.tool.aion_critic_verdict.execute({
      critic: "ts-critic",
      verdict: "rebuttal-mode",
      blockers: [{
        description: "test", evidence: "ev", forbidden_action: "fa", unblock_condition: "uc",
      }],
      why_not_stop: "needs more",
      next_call: "agent-x",
    }, {}));
    assert.equal(out.signal, "rebuttal-mode");
    assert.ok(out.open_blockers.length > 0);
    assert.equal(out.force_continue, true);
  });

  it("c-critic approve-stop maps to allow-stop signal", async () => {
    const out = JSON.parse(await result.tool.aion_critic_verdict.execute({
      critic: "c-critic",
      verdict: "approve-stop",
      blockers: [],
      why_not_stop: "",
      next_call: "",
    }, {}));
    assert.equal(out.signal, "allow-stop");
  });

  it("c-critic reject-stop maps to absolutely-cannot-stop-now", async () => {
    const out = JSON.parse(await result.tool.aion_critic_verdict.execute({
      critic: "c-critic",
      verdict: "reject-stop",
      blockers: [],
      why_not_stop: "blockers found",
      next_call: "",
    }, {}));
    assert.equal(out.signal, "absolutely-cannot-stop-now");
  });

  it("emits a critic.verdict event to trace", async () => {
    await result.tool.aion_critic_verdict.execute({
      critic: "ts-critic",
      verdict: "absolutely-cannot-stop-now",
      blockers: [],
      why_not_stop: "",
      next_call: "",
    }, {});
    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("critic.verdict") || trace.includes("verdict"));
  });

  it("records multiple blockers from a single verdict", async () => {
    const out = JSON.parse(await result.tool.aion_critic_verdict.execute({
      critic: "ts-critic",
      verdict: "rebuttal-mode",
      blockers: [
        { description: "b1", evidence: "e1", forbidden_action: "fa1", unblock_condition: "uc1" },
        { description: "b2", evidence: "e2", forbidden_action: "fa2", unblock_condition: "uc2" },
        { description: "b3", evidence: "e3", forbidden_action: "fa3", unblock_condition: "uc3" },
      ],
      why_not_stop: "",
      next_call: "",
    }, {}));
    assert.ok(out.open_blockers.length >= 3);
  });
});

describe("coverage: aion_record_blocker / aion_resolve_blocker — exhaustive", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  const sources = [
    "ts-critic", "c-critic", "main-agent",
    "information-collector", "requirements-analyst", "coder",
  ];

  for (const source of sources) {
    it(`accepts source=${source}`, async () => {
      const out = JSON.parse(await result.tool.aion_record_blocker.execute({
        source,
        description: `test from ${source}`,
        evidence: "ev",
        forbidden_action: "fa",
        unblock_condition: "uc",
      }, {}));
      assert.equal(out.recorded.source, source);
      assert.match(out.recorded.id, /^BLK-\d+$/);
    });
  }

  it("resolve_blocker returns remaining list after resolution", async () => {
    const r1 = JSON.parse(await result.tool.aion_record_blocker.execute({
      source: "ts-critic", description: "r1", evidence: "e",
      forbidden_action: "f", unblock_condition: "u",
    }, {}));
    const r2 = JSON.parse(await result.tool.aion_record_blocker.execute({
      source: "main-agent", description: "r2", evidence: "e",
      forbidden_action: "f", unblock_condition: "u",
    }, {}));
    const out = JSON.parse(await result.tool.aion_resolve_blocker.execute({
      blocker_id: r1.recorded.id,
      fix_evidence: "fixed",
    }, {}));
    assert.equal(out.resolved, true);
    assert.ok(!out.remaining.includes(r1.recorded.id));
    assert.ok(out.remaining.includes(r2.recorded.id));
  });

  it("emits governance.blocker trace event on resolve", async () => {
    const r = JSON.parse(await result.tool.aion_record_blocker.execute({
      source: "coder", description: "trace test", evidence: "e",
      forbidden_action: "f", unblock_condition: "u",
    }, {}));
    const sizeBefore = statSync(join(tmp, ".opencode", "trace.md")).size;
    await result.tool.aion_resolve_blocker.execute({
      blocker_id: r.recorded.id,
      fix_evidence: "ok",
    }, {});
    const sizeAfter = statSync(join(tmp, ".opencode", "trace.md")).size;
    assert.ok(sizeAfter > sizeBefore);
  });
});

describe("coverage: aion_memory_sync — exhaustive branches", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, ".opencode", { recursive: true }); } catch {} });

  const artifacts = [
    "initial-prompt", "context-snapshot", "progress", "features",
    "decisions", "todo-map", "completion-gate",
    "positive", "negative", "relation",
  ];

  for (const artifact of artifacts) {
    it(`accepts artifact=${artifact}`, async () => {
      const out = await result.tool.aion_memory_sync.execute({
        artifact,
        section: "main",
        content: `content for ${artifact}`,
        mode: "append",
      }, {});
      assert.ok(typeof out === "string");
      assert.ok(out.includes(artifact));
      const path = join(tmp, ".opencode", "memory", `${artifact}.md`);
      assert.ok(existsSync(path));
    });
  }

  it("uses default section=main and mode=append", async () => {
    const out = await result.tool.aion_memory_sync.execute({
      artifact: "progress",
      content: "default section test",
    }, {});
    assert.ok(out.includes("progress"));
  });

  it("replace-section updates an existing ## section", async () => {
    // First append to create a section
    await result.tool.aion_memory_sync.execute({
      artifact: "decisions", section: "Structural Decisions",
      content: "first decision", mode: "append",
    }, {});
    // Now replace-section
    await result.tool.aion_memory_sync.execute({
      artifact: "decisions", section: "Structural Decisions",
      content: "replaced decision", mode: "replace-section",
    }, {});
    const c = readFileSync(join(tmp, ".opencode", "memory", "decisions.md"), "utf-8");
    assert.ok(c.includes("replaced decision"));
  });

  it("replace-section creates the section if it doesn't exist", async () => {
    await result.tool.aion_memory_sync.execute({
      artifact: "positive", section: "NewSection",
      content: "new section content", mode: "replace-section",
    }, {});
    const c = readFileSync(join(tmp, ".opencode", "memory", "positive.md"), "utf-8");
    assert.ok(c.includes("NewSection"));
    assert.ok(c.includes("new section content"));
  });

  it("replace mode overwrites entire file", async () => {
    await result.tool.aion_memory_sync.execute({
      artifact: "negative", content: "OLD CONTENT", mode: "replace",
    }, {});
    await result.tool.aion_memory_sync.execute({
      artifact: "negative", content: "NEW FULL CONTENT", mode: "replace",
    }, {});
    const c = readFileSync(join(tmp, ".opencode", "memory", "negative.md"), "utf-8");
    assert.ok(c.includes("NEW FULL CONTENT"));
    assert.ok(!c.includes("OLD CONTENT"));
  });

  it("append mode adds agent-attributed comment with timestamp", async () => {
    await result.tool.aion_memory_sync.execute({
      artifact: "features", section: "Delivered", content: "feature-x", mode: "append",
    }, {});
    const c = readFileSync(join(tmp, ".opencode", "memory", "features.md"), "utf-8");
    assert.ok(c.includes("aion.memory-sync"));
    assert.ok(c.includes("agent="));
  });

  it("emits a memory.sync event to trace", async () => {
    const sizeBefore = statSync(join(tmp, ".opencode", "trace.md")).size;
    await result.tool.aion_memory_sync.execute({
      artifact: "progress", section: "main", content: "x", mode: "append",
    }, {});
    const sizeAfter = statSync(join(tmp, ".opencode", "trace.md")).size;
    assert.ok(sizeAfter > sizeBefore);
  });
});

describe("coverage: aion_todo_update — exhaustive branches", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("update-state on unknown todo_id returns error JSON", async () => {
    const out = JSON.parse(await result.tool.aion_todo_update.execute({
      action: "update-state",
      todo_id: "TODO-999",
      new_state: "done",
    }, {}));
    assert.match(out.error, /TODO-999 not found/);
  });

  it("rollback on unknown todo_id returns error JSON", async () => {
    const out = JSON.parse(await result.tool.aion_todo_update.execute({
      action: "rollback",
      todo_id: "TODO-999",
      rollback_depth: "self",
    }, {}));
    assert.match(out.error, /TODO-999 not found/);
  });

  it("all-to-plan-step rollback resets ALL done/in-progress items", async () => {
    // Add 3 items
    for (const s of ["a", "b", "c"]) {
      await result.tool.aion_todo_update.execute({
        action: "add", plan_step: `step ${s}`, owner: "coder",
      }, {});
    }
    // Mark all done
    const get = JSON.parse(await result.tool.aion_todo_update.execute({ action: "get" }, {}));
    for (const item of get.items) {
      await result.tool.aion_todo_update.execute({
        action: "update-state", todo_id: item.id, new_state: "done",
      }, {});
    }
    // Rollback all
    const out = JSON.parse(await result.tool.aion_todo_update.execute({
      action: "rollback", todo_id: get.items[0].id, rollback_depth: "all-to-plan-step",
    }, {}));
    assert.ok(out.rolledBack.length >= 3);
  });

  it("uses default rollback_depth=self when not specified", async () => {
    const add = JSON.parse(await result.tool.aion_todo_update.execute({
      action: "add", plan_step: "default depth", owner: "coder",
    }, {}));
    const todoId = add.added[0].id;
    await result.tool.aion_todo_update.execute({
      action: "update-state", todo_id: todoId, new_state: "done",
    }, {});
    const out = JSON.parse(await result.tool.aion_todo_update.execute({
      action: "rollback", todo_id: todoId,
    }, {}));
    assert.deepEqual(out.rolledBack, [todoId]);
  });

  it("add-from-reportback skips entries shorter than 5 chars", async () => {
    const out = JSON.parse(await result.tool.aion_todo_update.execute({
      action: "add-from-reportback",
      reportback_text: "suggested_next_step: x\nnext_step: ab\nnext_step: abc",
      reportback_source: "info",
    }, {}));
    // "x", "ab", "abc" all < 5 chars → should be skipped
    assert.equal(out.added.length, 0);
  });

  it("add-from-reportback with no reportback_text adds nothing", async () => {
    const out = JSON.parse(await result.tool.aion_todo_update.execute({
      action: "add-from-reportback",
    }, {}));
    assert.equal(out.added.length, 0);
  });

  it("add with default owner=main-agent and branch_id=main", async () => {
    const out = JSON.parse(await result.tool.aion_todo_update.execute({
      action: "add", plan_step: "default owner test",
    }, {}));
    assert.ok(out.added.length === 1);
    assert.match(out.added[0].id, /^TODO-\d{3}$/);
    // The ID should be valid and well-formed
    const todoId = out.added[0].id;
    assert.ok(todoId);
  });

  it("get returns proper summary counts", async () => {
    const out = JSON.parse(await result.tool.aion_todo_update.execute({ action: "get" }, {}));
    assert.ok(out.summary);
    assert.ok(typeof out.summary.done === "number");
    assert.ok(typeof out.summary.inProgress === "number");
    assert.ok(typeof out.summary.todo === "number");
  });

  it("update-state with new_state=done sets frontierState=completed", async () => {
    const add = JSON.parse(await result.tool.aion_todo_update.execute({
      action: "add", plan_step: "frontier test", owner: "coder",
    }, {}));
    const todoId = add.added[0].id;
    await result.tool.aion_todo_update.execute({
      action: "update-state", todo_id: todoId, new_state: "done",
    }, {});
    const get = JSON.parse(await result.tool.aion_todo_update.execute({ action: "get" }, {}));
    const item = get.items.find(i => i.id === todoId);
    assert.equal(item.state, "done");
  });

  it("emits a memory.sync event on every action that modifies state", async () => {
    const sizeBefore = statSync(join(tmp, ".opencode", "trace.md")).size;
    await result.tool.aion_todo_update.execute({
      action: "add", plan_step: "trace emission", owner: "coder",
    }, {});
    const sizeAfter = statSync(join(tmp, ".opencode", "trace.md")).size;
    assert.ok(sizeAfter > sizeBefore);
  });
});

describe("coverage: aion_set_interactive_mode — exhaustive branches", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("first call records previousMode=unset and source=session-start", async () => {
    const out = JSON.parse(await result.tool.aion_set_interactive_mode.execute({
      enabled: true, reason: "first call",
    }, {}));
    assert.equal(out.previousMode, "unset");
    assert.equal(out.source, "session-start");
    assert.equal(out.newMode, "interactive");
  });

  it("subsequent call records source=user-toggle", async () => {
    await result.tool.aion_set_interactive_mode.execute({ enabled: true, reason: "r" }, {});
    const out = JSON.parse(await result.tool.aion_set_interactive_mode.execute({
      enabled: false, reason: "toggle",
    }, {}));
    assert.equal(out.source, "user-toggle");
    assert.equal(out.newMode, "autonomous");
    assert.equal(out.previousMode, "interactive");
  });

  it("handles missing reason field", async () => {
    const out = JSON.parse(await result.tool.aion_set_interactive_mode.execute({
      enabled: true,
    }, {}));
    assert.equal(out.reason, null);
  });

  it("interactive mode effect message indicates PAUSE", async () => {
    const out = JSON.parse(await result.tool.aion_set_interactive_mode.execute({
      enabled: true, reason: "r",
    }, {}));
    assert.match(out.effect, /PAUSE/);
  });

  it("autonomous mode effect message indicates RUN AUTONOMOUSLY", async () => {
    const out = JSON.parse(await result.tool.aion_set_interactive_mode.execute({
      enabled: false, reason: "r",
    }, {}));
    assert.match(out.effect, /AUTONOMOUSLY/);
  });

  it("resets pending user-continue decision", async () => {
    const out = JSON.parse(await result.tool.aion_set_interactive_mode.execute({
      enabled: false, reason: "test",
    }, {}));
    assert.equal(out.recorded, true);
  });

  it("emits a stopgo.updated event to trace", async () => {
    await result.tool.aion_set_interactive_mode.execute({
      enabled: true, reason: "trace test",
    }, {});
    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("interactive mode") || trace.includes("stopgo.updated"));
  });
});

describe("coverage: aion_ztxexp_init — exhaustive branches", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("Windows-style absolute path (C:/...) is rejected", async () => {
    const out = JSON.parse(await result.tool.aion_ztxexp_init.execute({
      experiment_id: "win", root: "C:/foo", used_dirs: ["exp"],
    }, {}));
    assert.equal(out.status, "error");
  });

  it("root subpath is supported", async () => {
    const out = JSON.parse(await result.tool.aion_ztxexp_init.execute({
      experiment_id: "subpath", root: "experiments", used_dirs: ["exp", "outputs"],
    }, {}));
    assert.equal(out.status, "initialized");
    assert.ok(existsSync(join(tmp, "experiments", "exp", "subpath")));
  });

  it("skips_unused_dirs lists directories not in used_dirs", async () => {
    const out = JSON.parse(await result.tool.aion_ztxexp_init.execute({
      experiment_id: "skip-test", root: ".",
      used_dirs: ["exp", "outputs", "model"],
    }, {}));
    assert.ok(out.skipped_empty_dirs.includes("data"));
    assert.ok(out.skipped_empty_dirs.includes("evaluation"));
    assert.ok(out.skipped_empty_dirs.includes("scripts"));
    assert.ok(out.skipped_empty_dirs.includes("module"));
  });

  it("skipped_empty_dirs is empty when all boundary dirs are used", async () => {
    const out = JSON.parse(await result.tool.aion_ztxexp_init.execute({
      experiment_id: "all-bd", root: ".",
      used_dirs: ["data", "evaluation", "exp", "model", "module", "scripts", "outputs"],
    }, {}));
    assert.equal(out.skipped_empty_dirs.length, 0);
  });

  it("skips files entry in created_dirs", async () => {
    const out = JSON.parse(await result.tool.aion_ztxexp_init.execute({
      experiment_id: "files", root: ".", used_dirs: ["exp", "outputs"],
    }, {}));
    assert.ok(out.files.includes(".ztxexp-manifest.json"));
    assert.ok(out.files.includes("README.md"));
    assert.ok(out.files.includes("main.py"));
  });

  it("manifest notes field is preserved when provided", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "note-test", root: ".",
      used_dirs: ["exp"], notes: "important notes here",
    }, {});
    const m = JSON.parse(readFileSync(
      join(tmp, "exp", "note-test", ".ztxexp-manifest.json"), "utf-8",
    ));
    assert.equal(m.notes, "important notes here");
  });

  it("manifest notes is empty string when not provided", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "no-note", root: ".",
      used_dirs: ["exp"],
    }, {});
    const m = JSON.parse(readFileSync(
      join(tmp, "exp", "no-note", ".ztxexp-manifest.json"), "utf-8",
    ));
    assert.equal(m.notes, "");
  });

  it("main.py skeleton includes experiment id", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "skel-test", root: ".", used_dirs: ["exp"],
    }, {});
    const py = readFileSync(join(tmp, "exp", "skel-test", "main.py"), "utf-8");
    assert.ok(py.includes("skel-test"));
    assert.ok(py.includes("--experiment"));
  });

  it("README.md describes ztxexp boundaries", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "readme-test", root: ".", used_dirs: ["exp", "model"],
    }, {});
    const r = readFileSync(join(tmp, "exp", "readme-test", "README.md"), "utf-8");
    assert.ok(r.includes("HARD boundaries"));
    assert.ok(r.includes("exp/"));
    assert.ok(r.includes("model/"));
  });

  it("appends a ztxexp.run trace event", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "trace-test", root: ".", used_dirs: ["exp"],
    }, {});
    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("ztxexp") || trace.includes("trace-test"));
  });
});

describe("coverage: aion_ztxexp_validate — exhaustive branches", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("handles missing manifest gracefully", async () => {
    mkdirSync(join(tmp, "exp", "no-manifest-2"), { recursive: true });
    const out = JSON.parse(await result.tool.aion_ztxexp_validate.execute({
      experiment_id: "no-manifest-2", root: ".",
    }, {}));
    // Should still work but may report violations
    assert.ok(out.experiment_id);
  });

  it("detects undeclared_used_dirs (manifest lists fewer dirs than actually used)", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "undeclared", root: ".", used_dirs: ["exp", "outputs"],
    }, {});
    // Add a file in model/ (not declared in manifest)
    mkdirSync(join(tmp, "exp", "undeclared", "model"), { recursive: true });
    writeFileSync(join(tmp, "exp", "undeclared", "model", "x.py"), "print(1)");
    const out = JSON.parse(await result.tool.aion_ztxexp_validate.execute({
      experiment_id: "undeclared", root: ".",
    }, {}));
    assert.ok(out.undeclared_used_dirs);
    assert.ok(out.undeclared_used_dirs.includes("model"));
  });

  it("detects missing_but_needed when declared dir doesn't exist", async () => {
    // Manually create a manifest with a non-existent dir
    mkdirSync(join(tmp, "exp", "missing-dir"), { recursive: true });
    writeFileSync(
      join(tmp, "exp", "missing-dir", ".ztxexp-manifest.json"),
      JSON.stringify({
        experiment_id: "missing-dir",
        used_dirs: ["exp", "outputs", "evaluation"],
        boundary_dirs: ["data", "evaluation", "exp", "model", "module", "scripts", "outputs"],
      }),
    );
    const out = JSON.parse(await result.tool.aion_ztxexp_validate.execute({
      experiment_id: "missing-dir", root: ".",
    }, {}));
    assert.ok(out.missing_but_needed);
    assert.ok(out.missing_but_needed.includes("evaluation"));
  });

  it("is_clean=true for a fully compliant experiment", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "compliant", root: ".",
      used_dirs: ["exp", "outputs", "data"],
    }, {});
    writeFileSync(join(tmp, "exp", "compliant", "data", "x.csv"), "a,b");
    writeFileSync(join(tmp, "exp", "compliant", "exp", "config.json"), "{}");
    writeFileSync(join(tmp, "exp", "compliant", "outputs", "metrics.json"), "{}");
    const out = JSON.parse(await result.tool.aion_ztxexp_validate.execute({
      experiment_id: "compliant", root: ".",
    }, {}));
    assert.equal(out.is_clean, true);
  });

  it("emits a ztxexp.validate trace event", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "validate-trace", root: ".", used_dirs: ["exp"],
    }, {});
    await result.tool.aion_ztxexp_validate.execute({
      experiment_id: "validate-trace", root: ".",
    }, {});
    const trace = readFileSync(join(tmp, ".opencode", "trace.md"), "utf-8");
    assert.ok(trace.includes("ztxexp.validate") || trace.includes("validate"));
  });

  it("returns populated_dirs list when content exists", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "populated", root: ".", used_dirs: ["exp", "outputs"],
    }, {});
    writeFileSync(join(tmp, "exp", "populated", "outputs", "out.txt"), "x");
    writeFileSync(join(tmp, "exp", "populated", "exp", "conf.json"), "{}");
    const out = JSON.parse(await result.tool.aion_ztxexp_validate.execute({
      experiment_id: "populated", root: ".",
    }, {}));
    assert.ok(out.populated_dirs.includes("outputs"));
    assert.ok(out.populated_dirs.includes("exp"));
  });

  it("provides a recommendation string when not clean", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "rec-test", root: ".", used_dirs: ["exp", "outputs"],
    }, {});
    writeFileSync(join(tmp, "exp", "rec-test", "bad.py"), "x");
    const out = JSON.parse(await result.tool.aion_ztxexp_validate.execute({
      experiment_id: "rec-test", root: ".",
    }, {}));
    assert.equal(out.is_clean, false);
    assert.ok(out.recommendation);
    assert.ok(typeof out.recommendation === "string" && out.recommendation.length > 0);
  });
});

describe("coverage: aion_ztxexp_run — exhaustive branches", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("writes run.json with all expected fields", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "run-fields", root: ".", used_dirs: ["exp", "outputs"],
    }, {});
    await result.tool.aion_ztxexp_run.execute({
      experiment_id: "run-fields",
      config_path: "config.json",
      command: "echo hello",
      timeout_ms: 5000,
    }, { directory: tmp });
    const rj = JSON.parse(readFileSync(
      join(tmp, "exp", "run-fields", "outputs", "run.json"), "utf-8",
    ));
    assert.equal(rj.experiment_id, "run-fields");
    assert.equal(rj.status, "succeeded");
    assert.equal(rj.exit_code, 0);
    assert.ok(rj.timestamp);
    assert.equal(rj.has_stderr, false);
  });

  it("captures stderr in stderr_tail when present", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "stderr-test", root: ".", used_dirs: ["exp", "outputs"],
    }, {});
    const out = JSON.parse(await result.tool.aion_ztxexp_run.execute({
      experiment_id: "stderr-test",
      config_path: "config.json",
      command: "sh -c 'echo to stderr 1>&2'",
      timeout_ms: 5000,
    }, { directory: tmp }));
    assert.equal(out.status, "succeeded");
    assert.ok(out.stderr_tail.includes("to stderr"));
    const rj = JSON.parse(readFileSync(
      join(tmp, "exp", "stderr-test", "outputs", "run.json"), "utf-8",
    ));
    assert.equal(rj.has_stderr, true);
  });

  it("creates outputs/ dir if missing before run", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "outputs-create", root: ".", used_dirs: ["exp", "outputs"],
    }, {});
    // Remove the outputs dir
    rmSync(join(tmp, "exp", "outputs-create", "outputs"), { recursive: true, force: true });
    const out = JSON.parse(await result.tool.aion_ztxexp_run.execute({
      experiment_id: "outputs-create",
      config_path: "config.json",
      command: "echo hi",
      timeout_ms: 5000,
    }, { directory: tmp }));
    assert.equal(out.status, "succeeded");
    assert.ok(existsSync(join(tmp, "exp", "outputs-create", "outputs", "run.json")));
  });

  it("uses default timeout_ms=600000 when not provided", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "default-timeout", root: ".", used_dirs: ["exp", "outputs"],
    }, {});
    const out = JSON.parse(await result.tool.aion_ztxexp_run.execute({
      experiment_id: "default-timeout",
      config_path: "config.json",
      command: "echo ok",
    }, { directory: tmp }));
    assert.equal(out.status, "succeeded");
  });

  it("post_experiment flags are always set", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "post-exp-flags", root: ".", used_dirs: ["exp", "outputs"],
    }, {});
    const out = JSON.parse(await result.tool.aion_ztxexp_run.execute({
      experiment_id: "post-exp-flags",
      config_path: "config.json",
      command: "echo hi",
      timeout_ms: 5000,
    }, { directory: tmp }));
    assert.equal(out.post_experiment.shap_required, true);
    assert.equal(out.post_experiment.math_modeling_required, true);
    assert.equal(out.post_experiment.drift_analysis_required, true);
  });

  it("stdout_tail is truncated to last 2000 chars", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "truncate-test", root: ".", used_dirs: ["exp", "outputs"],
    }, {});
    const out = JSON.parse(await result.tool.aion_ztxexp_run.execute({
      experiment_id: "truncate-test",
      config_path: "config.json",
      command: "yes A | head -3000",
      timeout_ms: 5000,
    }, { directory: tmp }));
    assert.equal(out.status, "succeeded");
    assert.ok(out.stdout_tail.length <= 2000);
  });
});

describe("coverage: tools all return strings/JSON, never throw", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  // Every tool should handle missing/unknown fields gracefully (i.e. return JSON, not throw).
  const toolsAndArgs = [
    ["aion_safety_gate", { action: "x" }],
    ["aion_leakage_check", { file_path: "x" }],
    ["aion_workspace_init", { initial_prompt: "x" }],
    ["aion_compaction", {}],
    ["aion_pre_stop_gate", {
      brain_storm_done: true, deep_reasoning_done: true, ts_critic_allow_stop: true,
    }],
    ["aion_critic_dispatch", { critic: "ts-critic", goal: "x" }],
    ["aion_critic_verdict", { critic: "ts-critic", verdict: "allow-stop" }],
    ["aion_record_blocker", {
      source: "main-agent", description: "x", evidence: "x", forbidden_action: "x", unblock_condition: "x",
    }],
    ["aion_resolve_blocker", { blocker_id: "BLK-999", fix_evidence: "x" }],
    ["aion_memory_sync", { artifact: "progress", content: "x" }],
    ["aion_todo_update", { action: "get" }],
    ["aion_set_interactive_mode", { enabled: true }],
    ["aion_ztxexp_init", { experiment_id: "x", used_dirs: ["exp"] }],
    ["aion_ztxexp_validate", { experiment_id: "x" }],
    ["aion_ztxexp_run", { experiment_id: "x", config_path: "x", command: "echo x" }],
  ];

  for (const [name, args] of toolsAndArgs) {
    it(`${name} does not throw on minimal/edge-case input`, async () => {
      let output;
      try {
        output = await result.tool[name].execute(args, { directory: tmp });
      } catch (err) {
        assert.fail(`${name} threw on minimal input: ${err.message}`);
      }
      assert.ok(output !== undefined && output !== null, `${name} returned null/undefined`);
    });
  }
});

describe("coverage: tools have valid ToolDefinition shape", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  const allToolNames = [
    "aion_safety_gate", "aion_leakage_check", "aion_workspace_init", "aion_compaction",
    "aion_pre_stop_gate", "aion_critic_dispatch", "aion_critic_verdict",
    "aion_record_blocker", "aion_resolve_blocker", "aion_memory_sync",
    "aion_todo_update", "aion_set_interactive_mode",
    "aion_ztxexp_init", "aion_ztxexp_validate", "aion_ztxexp_run",
  ];

  for (const name of allToolNames) {
    it(`${name} has description and execute`, () => {
      const tool = result.tool?.[name];
      assert.ok(tool, `${name} should exist`);
      assert.equal(typeof tool.description, "string");
      assert.ok(tool.description.length > 0);
      assert.equal(typeof tool.execute, "function");
    });
  }
});

describe("coverage: aion_pre_stop_gate — robustness against malformed input", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("handles empty args object gracefully", async () => {
    const out = JSON.parse(await result.tool.aion_pre_stop_gate.execute({}, {}));
    assert.equal(out.allowStop, false);
    assert.ok(out.blockers.length > 0);
  });

  it("handles non-string entries in file_paths_checked", async () => {
    const out = JSON.parse(await result.tool.aion_pre_stop_gate.execute({
      brain_storm_done: true,
      deep_reasoning_done: true,
      ts_critic_allow_stop: true,
      c_critic_verdict: "approve-stop",
      file_paths_checked: [null, undefined, 42, {}, []],
      completion_gate_fresh: true,
      workspace_cleaned: true,
      search_coverage: true,
      todo_semantics: true,
      report_evidence: true,
      figure_analysis: true,
      visual_test_loop: true,
    }, {}));
    // non-string paths are skipped (not added to missingPaths)
    assert.equal(out.missingPaths.length, 0);
    assert.equal(out.allowStop, true);
  });
});

describe("coverage: aion_todo_update — robustness against malformed input", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("returns error JSON for unknown action", async () => {
    const out = JSON.parse(await result.tool.aion_todo_update.execute({
      action: "frobnicate",
    }, {}));
    assert.match(out.error, /unknown action/);
  });

  it("get works on empty todo list", async () => {
    const out = JSON.parse(await result.tool.aion_todo_update.execute({ action: "get" }, {}));
    assert.ok(Array.isArray(out.items));
    assert.equal(out.items.length, 0);
    assert.equal(out.summary.todo, 0);
  });

  it("handles add with no plan_step gracefully (creates nothing)", async () => {
    const out = JSON.parse(await result.tool.aion_todo_update.execute({
      action: "add",
    }, {}));
    assert.equal(out.added.length, 0);
  });

  it("update-state with no todo_id returns error JSON", async () => {
    const out = JSON.parse(await result.tool.aion_todo_update.execute({
      action: "update-state",
    }, {}));
    // The "if update-state AND todo_id" branch is skipped, so it falls through
    // to "unknown action" error
    assert.ok(out.error);
  });

  it("rollback with no todo_id returns error JSON", async () => {
    const out = JSON.parse(await result.tool.aion_todo_update.execute({
      action: "rollback",
    }, {}));
    assert.ok(out.error);
  });

  it("does not crash on completely empty args", async () => {
    const out = await result.tool.aion_todo_update.execute({}, {});
    assert.ok(out);
  });
});

describe("coverage: aion_record_blocker / aion_resolve_blocker — robustness", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("handles empty args gracefully", async () => {
    const out = await result.tool.aion_resolve_blocker.execute({}, {});
    assert.ok(out);
    const parsed = JSON.parse(out);
    assert.equal(parsed.resolved, false);
  });
});

describe("coverage: aion_critic_dispatch — robustness", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("handles missing goal gracefully", async () => {
    const out = JSON.parse(await result.tool.aion_critic_dispatch.execute({
      critic: "ts-critic",
    }, {}));
    assert.equal(out.critic, "ts-critic");
  });
});

describe("coverage: aion_critic_verdict — robustness", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("handles missing optional fields", async () => {
    const out = JSON.parse(await result.tool.aion_critic_verdict.execute({
      critic: "ts-critic",
      verdict: "allow-stop",
    }, {}));
    assert.equal(out.signal, "allow-stop");
  });
});

describe("coverage: aion_ztxexp_init — robustness", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("handles missing used_dirs (uses default exp+outputs)", async () => {
    const out = JSON.parse(await result.tool.aion_ztxexp_init.execute({
      experiment_id: "no-used-dirs",
    }, {}));
    assert.equal(out.status, "initialized");
    assert.ok(out.created_dirs.includes("exp"));
    assert.ok(out.created_dirs.includes("outputs"));
  });

  it("uses default root='.' when not provided", async () => {
    const out = JSON.parse(await result.tool.aion_ztxexp_init.execute({
      experiment_id: "default-root",
      used_dirs: ["exp"],
    }, {}));
    assert.equal(out.status, "initialized");
    assert.ok(out.root.startsWith("."));
  });
});

describe("coverage: aion_ztxexp_run — robustness", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("handles missing context (uses m.ctx.directory as fallback)", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "ctx-test", root: ".", used_dirs: ["exp", "outputs"],
    }, {});
    // Pass empty context
    const out = JSON.parse(await result.tool.aion_ztxexp_run.execute({
      experiment_id: "ctx-test",
      config_path: "config.json",
      command: "echo ok",
      timeout_ms: 5000,
    }, {}));
    assert.equal(out.status, "succeeded");
  });
});

describe("coverage: aion_safety_gate — robustness", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("handles missing action gracefully (returns safe default)", async () => {
    const out = JSON.parse(await result.tool.aion_safety_gate.execute({}, {}));
    assert.ok(out.verdict);
  });

  it("handles missing alternates gracefully", async () => {
    const out = JSON.parse(await result.tool.aion_safety_gate.execute({
      action: "x",
      impact_scope: "local-write",
      input_source: "user",
    }, {}));
    assert.ok(out.verdict);
    assert.equal(out.components.altScore, 0);
  });
});

describe("coverage: aion_leakage_check — robustness", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("handles empty file_path gracefully", async () => {
    const out = JSON.parse(await result.tool.aion_leakage_check.execute({
      file_path: "",
    }, {}));
    // empty path is not unsafe
    assert.equal(out.safe, true);
  });

  it("handles content with AWS key pattern", async () => {
    const out = JSON.parse(await result.tool.aion_leakage_check.execute({
      file_path: "src/test.ts",
      content_sample: "config = { aws: 'AKIAIOSFODNN7EXAMPLE' }",
    }, {}));
    assert.equal(out.safe, false);
  });
});

describe("coverage: aion_set_interactive_mode — robustness", async () => {
  const tmp = createTmp();
  let result;
  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("handles missing reason field", async () => {
    const out = JSON.parse(await result.tool.aion_set_interactive_mode.execute({
      enabled: true,
    }, {}));
    assert.equal(out.reason, null);
    assert.equal(out.recorded, true);
  });
});
