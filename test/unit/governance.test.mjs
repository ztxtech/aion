import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

function createTmpDir(prefix = "aion-gov-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("governance: initial state", async () => {
  const bundle = await importBundle();
  const tmpRoot = createTmpDir();

  before(async () => {
    mkdirSync(join(tmpRoot, ".opencode"), { recursive: true });
    writeFileSync(join(tmpRoot, "package.json"), '{"name":"test","type":"module"}');
    await bundle.default.server({
      directory: tmpRoot,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});
  });

  after(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  it("default phase is 'init'", async () => {
    const gov = await bundle._testing.governance();
    assert.equal(gov.DEFAULT_PHASE, "init");
  });

  it("phase list has 8 entries", async () => {
    const gov = await bundle._testing.governance();
    assert.equal(gov.PHASE_LIST.length, 8);
  });
});

describe("governance: phase transitions", async () => {
  const bundle = await importBundle();
  const tmpRoot = createTmpDir("aion-phase-");
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

  it("tool.execute.before hook is registered", () => {
    assert.equal(typeof loadResult["tool.execute.before"], "function");
  });

  it("tool.execute.after hook is registered", () => {
    assert.equal(typeof loadResult["tool.execute.after"], "function");
  });
});

describe("governance: tool guard safety tools set", async () => {
  const bundle = await importBundle();
  const tg = await bundle._testing.toolGuard();
  const { AION_SAFETY_TOOLS } = tg;

  it("has all expected safety tools", () => {
    const expected = [
      "aion_safety_gate",
      "aion_workspace_init",
      "aion_compaction",
      "aion_pre_stop_gate",
      "aion_memory_sync",
      "aion_critic_dispatch",
      "aion_critic_verdict",
      "aion_record_blocker",
      "aion_resolve_blocker",
      "aion_leakage_check",
      "aion_ztxexp_init",
      "aion_ztxexp_validate",
      "aion_ztxexp_run",
      "aion_todo_update",
      "aion_set_interactive_mode",
    ];
    for (const tool of expected) {
      assert.ok(AION_SAFETY_TOOLS.has(tool), `should contain ${tool}`);
    }
  });

  it("does not contain unknown tools", () => {
    assert.ok(!AION_SAFETY_TOOLS.has("aion_does_not_exist"));
  });
});

describe("governance: workspace bootstrap", async () => {
  const bundle = await importBundle();
  const tmpRoot = createTmpDir("aion-bootstrap-");

  before(async () => {
    mkdirSync(join(tmpRoot, ".opencode"), { recursive: true });
    writeFileSync(join(tmpRoot, "package.json"), '{"name":"test","type":"module"}');
    await bundle.default.server({
      directory: tmpRoot,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});
  });

  after(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  it("creates .opencode/memory directory", () => {
    assert.ok(
      existsSync(join(tmpRoot, ".opencode", "memory")),
      "memory dir should exist",
    );
  });

  it("creates trace file", () => {
    assert.ok(
      existsSync(join(tmpRoot, ".opencode", "trace.md")),
      "trace.md should exist",
    );
  });

  it("creates context-snapshot.md", () => {
    assert.ok(
      existsSync(join(tmpRoot, ".opencode", "memory", "context-snapshot.md")),
      "context-snapshot.md should exist",
    );
  });

  it("creates memory template files", () => {
    const templates = [
      "progress.md", "features.md", "decisions.md", "todo-map.md",
      "completion-gate.md", "positive.md", "negative.md", "relation.md",
    ];
    for (const f of templates) {
      assert.ok(
        existsSync(join(tmpRoot, ".opencode", "memory", f)),
        `${f} should exist`,
      );
    }
  });
});
