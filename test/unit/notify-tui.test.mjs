import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

let _counter = 0;
function createTmp(prefix = "aion-toast-") {
  const d = mkdtempSync(join(tmpdir(), `${prefix}${_counter++}-`));
  mkdirSync(join(d, ".opencode"), { recursive: true });
  writeFileSync(join(d, "package.json"), '{"name":"test","type":"module"}');
  return d;
}

function createSpyClient() {
  const calls = [];
  const spy = (input) => {
    calls.push(input);
    return true;
  };
  return { client: { tui: { showToast: spy } }, calls, spy };
}

async function loadPluginWith(client) {
  const bundle = await importBundle();
  const tmp = createTmp();
  return {
    tmp,
    plugin: await bundle.default.server({
      directory: tmp,
      client,
      project: undefined,
      $: undefined,
    }, {}),
  };
}

describe("toast: aion_safety_gate verdict=block fires toast", async () => {
  const { plugin, tmp } = await loadPluginWith(createSpyClient().client);
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("block verdict (impact_scope=exec) triggers error toast", async () => {
    const { client, calls } = createSpyClient();
    const bundle = await importBundle();
    const ttmp = createTmp();
    const p = await bundle.default.server({
      directory: ttmp, client, project: undefined, $: undefined,
    }, {});
    const tool = p.tool.aion_safety_gate;
    const json = await tool.execute({
      action: "execute arbitrary shell",
      input_source: "user",
      impact_scope: "exec",
      alternates: [],
    }, { directory: ttmp });
    const parsed = JSON.parse(json);
    assert.equal(parsed.verdict, "block");
    // give the (swallowed) microtask a chance if any
    await new Promise((r) => setImmediate(r));
    assert.ok(calls.length >= 1, "expected at least one toast call");
    const last = calls[calls.length - 1];
    assert.equal(last.body.variant, "error");
    assert.match(last.body.title, /BLOCK/);
    assert.match(last.body.message, /execute arbitrary shell/);
    rmSync(ttmp, { recursive: true, force: true });
  });

  it("warn verdict (impact_scope=filesystem-bulk) triggers warning toast", async () => {
    const { client, calls } = createSpyClient();
    const bundle = await importBundle();
    const ttmp = createTmp();
    const p = await bundle.default.server({
      directory: ttmp, client, project: undefined, $: undefined,
    }, {});
    const json = await p.tool.aion_safety_gate.execute({
      action: "bulk write",
      input_source: "user",
      impact_scope: "filesystem-bulk",
      alternates: [],
    }, { directory: ttmp });
    const parsed = JSON.parse(json);
    assert.equal(parsed.verdict, "warn");
    await new Promise((r) => setImmediate(r));
    assert.ok(calls.length >= 1);
    assert.equal(calls[calls.length - 1].body.variant, "warning");
    rmSync(ttmp, { recursive: true, force: true });
  });

  it("allow verdict (local-read) does NOT fire toast", async () => {
    const { client, calls } = createSpyClient();
    const bundle = await importBundle();
    const ttmp = createTmp();
    const p = await bundle.default.server({
      directory: ttmp, client, project: undefined, $: undefined,
    }, {});
    const json = await p.tool.aion_safety_gate.execute({
      action: "read local",
      input_source: "user",
      impact_scope: "local-read",
      alternates: [],
    }, { directory: ttmp });
    const parsed = JSON.parse(json);
    assert.equal(parsed.verdict, "allow");
    await new Promise((r) => setImmediate(r));
    assert.equal(calls.length, 0, "allow should not produce a toast");
    rmSync(ttmp, { recursive: true, force: true });
  });
});

describe("toast: aion_leakage_check unsafe fires error toast", async () => {
  it("unsafe content triggers error toast", async () => {
    const { client, calls } = createSpyClient();
    const bundle = await importBundle();
    const ttmp = createTmp();
    const p = await bundle.default.server({
      directory: ttmp, client, project: undefined, $: undefined,
    }, {});
    const json = await p.tool.aion_leakage_check.execute({
      file_path: "src/example.ts",
      content_sample: "AKIAIOSFODNN7EXAMPLEKEY",
    }, { directory: ttmp });
    const parsed = JSON.parse(json);
    assert.equal(parsed.safe, false);
    await new Promise((r) => setImmediate(r));
    assert.ok(calls.length >= 1, "expected a toast for unsafe leakage");
    assert.equal(calls[calls.length - 1].body.variant, "error");
    assert.match(calls[calls.length - 1].body.title, /UNSAFE/);
    rmSync(ttmp, { recursive: true, force: true });
  });

  it("safe path does NOT fire toast", async () => {
    const { client, calls } = createSpyClient();
    const bundle = await importBundle();
    const ttmp = createTmp();
    const p = await bundle.default.server({
      directory: ttmp, client, project: undefined, $: undefined,
    }, {});
    await p.tool.aion_leakage_check.execute({
      file_path: "src/legit.ts",
    }, { directory: ttmp });
    await new Promise((r) => setImmediate(r));
    assert.equal(calls.length, 0);
    rmSync(ttmp, { recursive: true, force: true });
  });
});

describe("toast: aion_pre_stop_gate blocked fires error toast", async () => {
  it("block (all false) fires error toast with blockers", async () => {
    const { client, calls } = createSpyClient();
    const bundle = await importBundle();
    const ttmp = createTmp();
    const p = await bundle.default.server({
      directory: ttmp, client, project: undefined, $: undefined,
    }, {});
    const json = await p.tool.aion_pre_stop_gate.execute({
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
    }, { directory: ttmp });
    const parsed = JSON.parse(json);
    assert.equal(parsed.allowStop, false);
    assert.ok(parsed.blockers.length > 0);
    await new Promise((r) => setImmediate(r));
    assert.ok(calls.length >= 1);
    const toast = calls[calls.length - 1];
    assert.equal(toast.body.variant, "error");
    assert.match(toast.body.title, /Pre-stop gate blocked/);
    rmSync(ttmp, { recursive: true, force: true });
  });

  it("allow-stop fires success toast", async () => {
    const { client, calls } = createSpyClient();
    const bundle = await importBundle();
    const ttmp = createTmp();
    const p = await bundle.default.server({
      directory: ttmp, client, project: undefined, $: undefined,
    }, {});
    const json = await p.tool.aion_pre_stop_gate.execute({
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
    }, { directory: ttmp });
    const parsed = JSON.parse(json);
    assert.equal(parsed.allowStop, true);
    await new Promise((r) => setImmediate(r));
    assert.ok(calls.length >= 1);
    assert.equal(calls[calls.length - 1].body.variant, "success");
    rmSync(ttmp, { recursive: true, force: true });
  });
});

describe("toast: null-safe when client is undefined", () => {
  it("aion_safety_gate block does not throw when client is undefined", async () => {
    const bundle = await importBundle();
    const ttmp = createTmp();
    const p = await bundle.default.server({
      directory: ttmp, client: undefined, project: undefined, $: undefined,
    }, {});
    const json = await p.tool.aion_safety_gate.execute({
      action: "exec",
      impact_scope: "exec",
    }, { directory: ttmp });
    assert.equal(JSON.parse(json).verdict, "block");
    rmSync(ttmp, { recursive: true, force: true });
  });

  it("aion_leakage_check unsafe does not throw when client is undefined", async () => {
    const bundle = await importBundle();
    const ttmp = createTmp();
    const p = await bundle.default.server({
      directory: ttmp, client: undefined, project: undefined, $: undefined,
    }, {});
    const json = await p.tool.aion_leakage_check.execute({
      file_path: "src/example.ts",
      content_sample: "AKIAIOSFODNN7EXAMPLEKEY",
    }, { directory: ttmp });
    assert.equal(JSON.parse(json).safe, false);
    rmSync(ttmp, { recursive: true, force: true });
  });

  it("aion_pre_stop_gate block does not throw when client is undefined", async () => {
    const bundle = await importBundle();
    const ttmp = createTmp();
    const p = await bundle.default.server({
      directory: ttmp, client: undefined, project: undefined, $: undefined,
    }, {});
    const json = await p.tool.aion_pre_stop_gate.execute({
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
    }, { directory: ttmp });
    assert.equal(JSON.parse(json).allowStop, false);
    rmSync(ttmp, { recursive: true, force: true });
  });
});

describe("toast: async showToast rejection is swallowed", () => {
  it("does not propagate async rejection from showToast", async () => {
    const client = {
      tui: {
        showToast: () => Promise.reject(new Error("toast-channel down")),
      },
    };
    const bundle = await importBundle();
    const ttmp = createTmp();
    const p = await bundle.default.server({
      directory: ttmp, client, project: undefined, $: undefined,
    }, {});
    // The function returns; we just need to ensure nothing escapes.
    const json = await p.tool.aion_safety_gate.execute({
      action: "exec",
      impact_scope: "exec",
    }, { directory: ttmp });
    assert.equal(JSON.parse(json).verdict, "block");
    // wait a tick for the swallowed microtask rejection
    await new Promise((r) => setTimeout(r, 20));
    rmSync(ttmp, { recursive: true, force: true });
  });
});
