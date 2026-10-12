import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

let counter = 0;
function createProject() {
  return mkdtempSync(join(tmpdir(), `aion-runtime-${counter++}-`));
}

function statePath(root) {
  return join(root, ".opencode", "memory", "runtime-state.json");
}

async function createPlugin(root) {
  const bundle = await importBundle();
  return bundle.default.server({
    directory: root,
    client: undefined,
    project: undefined,
    $: undefined,
  }, {});
}

describe("AION runtime control state", async () => {
  const bundle = await importBundle();
  const runtime = await bundle._testing.runtimeControl();

  it("normalizes saved state and rejects unknown values", () => {
    const state = runtime.normalizeRuntimeState({
      executionMode: "maximum",
      preferences: { tokenEconomy: "unlimited", preserveAcrossSessions: false },
      lastPhase: "not-a-phase",
      phaseReason: "  saved reason  ",
      resumeHint: 42,
      interrupted: "yes",
    });

    assert.equal(state.executionMode, "AUTO");
    assert.deepEqual(state.preferences, {
      tokenEconomy: "balanced",
      preserveAcrossSessions: false,
    });
    assert.equal(state.lastPhase, null);
    assert.equal(state.phaseReason, "saved reason");
    assert.equal(state.resumeHint, null);
    assert.equal(state.interrupted, false);
  });

  it("falls back to defaults for malformed JSON and preserves other fields on update", () => {
    const root = createProject();
    try {
      mkdirSync(join(root, ".opencode", "memory"), { recursive: true });
      writeFileSync(statePath(root), "{broken");
      assert.deepEqual(runtime.readRuntimeState(root), runtime.defaultRuntimeState());

      const saved = runtime.setExecutionMode(root, "MEDIUM");
      assert.equal(saved.executionMode, "MEDIUM");
      assert.equal(saved.preferences.preserveAcrossSessions, true);
      assert.equal(JSON.parse(readFileSync(statePath(root), "utf8")).executionMode, "MEDIUM");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("maps manual modes and keeps MAX on FULL edges", () => {
    assert.equal(runtime.effectiveComplexityTier("AUTO", "LIGHT"), "LIGHT");
    assert.equal(runtime.effectiveComplexityTier("AUTO", "unset"), "unset");
    assert.equal(runtime.effectiveComplexityTier("LIGHT", "FULL"), "LIGHT");
    assert.equal(runtime.effectiveComplexityTier("MEDIUM", "unset"), "MEDIUM");
    assert.equal(runtime.effectiveComplexityTier("FULL", "LIGHT"), "FULL");
    assert.equal(runtime.effectiveComplexityTier("MAX", "unset"), "FULL");
  });
});

describe("AION runtime mode server integration", async () => {
  const bundle = await importBundle();
  const runtime = await bundle._testing.runtimeControl();

  it("locks the complexity tool and injects MAX evidence rules", async () => {
    const root = createProject();
    mkdirSync(join(root, ".opencode", "memory"), { recursive: true });
    writeFileSync(statePath(root), JSON.stringify({ executionMode: "MAX" }));
    const result = await createPlugin(root);

    try {
      const output = { system: [] };
      await result["experimental.chat.system.transform"](
        { sessionID: "session-max", model: {} },
        output,
      );
      const system = output.system.join("\n");

      assert.match(system, /User locked execution to MAX/);
      assert.match(system, /AION MAX MODE/);
      assert.doesNotMatch(system, /AION TASK COMPLEXITY/);

      const locked = JSON.parse(await result.tool.aion_set_complexity.execute(
        { tier: "LIGHT", reason: "model tries to override user" },
        {},
      ));
      assert.equal(locked.recorded, false);
      assert.equal(locked.reason, "user-locked-runtime-mode");
      assert.equal(locked.effectiveTier, "FULL");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refreshes a mode written by the TUI after server startup", async () => {
    const root = createProject();
    const result = await createPlugin(root);

    try {
      runtime.setExecutionMode(root, "LIGHT");
      const output = { system: [] };
      await result["experimental.chat.system.transform"](
        { sessionID: "session-light", model: {} },
        output,
      );

      assert.match(output.system.join("\n"), /User locked execution to LIGHT/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("persists phase transitions and injects an interruption resume protocol", async () => {
    const root = createProject();
    let result = await createPlugin(root);
    try {
      await result["tool.execute.after"](
        { tool: "aion_workspace_init" },
        { args: {}, output: JSON.stringify({ status: "ok" }) },
      );
      assert.equal(runtime.readRuntimeState(root).lastPhase, "gather");
      await result.cleanup();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }

    mkdirSync(join(root, ".opencode", "memory"), { recursive: true });
    writeFileSync(statePath(root), JSON.stringify({
      executionMode: "AUTO",
      lastPhase: "implement",
      phaseReason: "interrupted by user",
      resumeHint: "Continue TODO-002.",
      interrupted: true,
    }));
    result = await createPlugin(root);

    try {
      const output = { system: [] };
      await result["experimental.chat.system.transform"](
        { sessionID: "session-resume", model: {} },
        output,
      );
      const system = output.system.join("\n");

      assert.match(system, /previous session stopped at implement/);
      assert.match(system, /Continue TODO-002/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
