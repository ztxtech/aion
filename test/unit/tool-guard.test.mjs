import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { importBundle } from "../helpers/load-bundle.mjs";

describe("tool-guard: AION_SAFETY_TOOLS whitelist", async () => {
  const bundle = await importBundle();
  const toolGuardTesting = await bundle._testing.toolGuard();
  const { AION_SAFETY_TOOLS } = toolGuardTesting;

  it("is a non-empty Set", () => {
    assert.ok(AION_SAFETY_TOOLS instanceof Set);
    assert.ok(AION_SAFETY_TOOLS.size >= 10);
  });

  it("contains core safety tools", () => {
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
      "aion_todo_update",
      "aion_set_interactive_mode",
    ];
    for (const tool of expected) {
      assert.ok(AION_SAFETY_TOOLS.has(tool), `expected AION_SAFETY_TOOLS to contain ${tool}`);
    }
  });

  it("contains ztxexp tools", () => {
    assert.ok(AION_SAFETY_TOOLS.has("aion_ztxexp_init"));
    assert.ok(AION_SAFETY_TOOLS.has("aion_ztxexp_validate"));
    assert.ok(AION_SAFETY_TOOLS.has("aion_ztxexp_run"));
  });

  it("does NOT contain non-safety aion tools", () => {
    assert.ok(!AION_SAFETY_TOOLS.has("aion_todo_update_get"));
    assert.ok(!AION_SAFETY_TOOLS.has("aion_user_check_unknown"));
  });
});

describe("create-managers: phase list", async () => {
  const bundle = await importBundle();
  const governanceTesting = await bundle._testing.governance();
  const { PHASE_LIST, DEFAULT_PHASE } = governanceTesting;

  it("exposes 8 phases", () => {
    assert.equal(PHASE_LIST.length, 8);
  });

  it("phases in order: init → gather → ts-pre-review → implement → ts-post-review → c-critic-final → loop-back → done", () => {
    assert.deepEqual(PHASE_LIST, [
      "init",
      "gather",
      "ts-pre-review",
      "implement",
      "ts-post-review",
      "c-critic-final",
      "loop-back",
      "done",
    ]);
  });

  it("default phase is 'init'", () => {
    assert.equal(DEFAULT_PHASE, "init");
  });
});
