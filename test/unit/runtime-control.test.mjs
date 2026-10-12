import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
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

function sessionState(root, sessionID) {
  return runtime.readRuntimeState(root).sessions[sessionID];
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

async function transform(result, sessionID) {
  const output = { system: [] };
  await result["experimental.chat.system.transform"](
    { sessionID, model: {} },
    output,
  );
  return output.system.join("\n");
}

const runtime = await (await importBundle())._testing.runtimeControl();

describe("AION runtime control state", () => {
  it("normalizes project and session state", () => {
    const state = runtime.normalizeRuntimeState({
      executionMode: "maximum",
      preferences: { tokenEconomy: "unlimited", preserveAcrossSessions: false },
      activeSessionID: "  ",
      sessions: {
        session: {
          lastPhase: "not-a-phase",
          phaseReason: "  kept  ",
          resumeHint: "continue",
          interrupted: true,
          complexityTier: "NOT-A-TIER",
        },
      },
    });

    assert.equal(state.version, 2);
    assert.equal(state.executionMode, "AUTO");
    assert.deepEqual(state.preferences, {
      tokenEconomy: "balanced",
      preserveAcrossSessions: false,
    });
    assert.equal(state.activeSessionID, null);
    assert.equal(state.sessions.session.lastPhase, null);
    assert.equal(state.sessions.session.phaseReason, "kept");
    assert.equal(state.sessions.session.complexityTier, "unset");
  });

  it("migrates V1 phase state into a non-adoptable legacy session", () => {
    const state = runtime.normalizeRuntimeState({
      executionMode: "FULL",
      lastPhase: "implement",
      phaseReason: "old run",
      resumeHint: "old hint",
      interrupted: true,
    });

    assert.equal(state.version, 2);
    assert.equal(state.lastPhase, undefined);
    assert.equal(state.sessions.__legacy__.lastPhase, "implement");
    assert.equal(state.activeSessionID, null);
  });

  it("falls back to defaults for malformed JSON and writes with session state intact", () => {
    const root = createProject();
    try {
      mkdirSync(join(root, ".opencode", "memory"), { recursive: true });
      writeFileSync(statePath(root), "{broken");
      assert.deepEqual(runtime.readRuntimeState(root), runtime.defaultRuntimeState());

      runtime.updateSessionRuntimeState(root, "session-existing", { lastPhase: "gather" });
      const saved = runtime.setExecutionMode(root, "MEDIUM");
      assert.equal(saved.executionMode, "MEDIUM");
      assert.equal(saved.sessions["session-existing"].lastPhase, "gather");
      assert.equal(JSON.parse(readFileSync(statePath(root), "utf8")).executionMode, "MEDIUM");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("removes a stale lock and releases a normal lock", () => {
    const root = createProject();
    const lockPath = `${statePath(root)}.lock`;
    try {
      mkdirSync(join(root, ".opencode", "memory"), { recursive: true });
      mkdirSync(lockPath, { recursive: true });
      writeFileSync(join(lockPath, "owner.json"), JSON.stringify({ pid: 1, at: 0 }));
      const old = new Date(Date.now() - 20_000);
      utimesSync(lockPath, old, old);

      const saved = runtime.setExecutionMode(root, "LIGHT");
      assert.equal(saved.executionMode, "LIGHT");
      assert.equal(existsSync(lockPath), false);
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

describe("AION runtime mode server integration", () => {
  it("keeps the AUTO classifier baseline untouched across manual mode", async () => {
    const root = createProject();
    try {
      runtime.setExecutionMode(root, "MEDIUM");
      const result = await createPlugin(root);

      const manualSystem = await transform(result, "session-baseline");
      assert.match(manualSystem, /User locked execution to MEDIUM/);
      assert.doesNotMatch(manualSystem, /AION TASK COMPLEXITY/);

      const blocked = JSON.parse(await result.tool.aion_set_complexity.execute(
        { tier: "FULL", reason: "model tries to classify while locked" },
        {},
      ));
      assert.equal(blocked.recorded, false);

      runtime.setExecutionMode(root, "AUTO");
      const autoSystem = await transform(result, "session-baseline");
      assert.doesNotMatch(autoSystem, /User locked execution/);
      assert.match(autoSystem, /AION TASK COMPLEXITY/);

      const classified = JSON.parse(await result.tool.aion_set_complexity.execute(
        { tier: "FULL", reason: "classifier runs after AUTO is restored" },
        {},
      ));
      assert.equal(classified.recorded, true);
      assert.equal(sessionState(root, "session-baseline").complexityTier, "FULL");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refreshes MAX mode written by the TUI after server startup", async () => {
    const root = createProject();
    try {
      const result = await createPlugin(root);
      runtime.setExecutionMode(root, "MAX");
      const system = await transform(result, "session-max");

      assert.match(system, /User locked execution to MAX/);
      assert.match(system, /AION MAX MODE/);
      assert.doesNotMatch(system, /AION TASK COMPLEXITY/);

      const locked = JSON.parse(await result.tool.aion_set_complexity.execute(
        { tier: "LIGHT", reason: "model tries to override user" },
        {},
      ));
      assert.equal(locked.recorded, false);
      assert.equal(locked.effectiveTier, "FULL");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("scopes interruptions by session and clears a hint after progress", async () => {
    const root = createProject();
    const result = await createPlugin(root);

    try {
      await transform(result, "session-a");
      await result["tool.execute.after"](
        { tool: "aion_workspace_init" },
        { args: {}, output: JSON.stringify({ status: "ok" }) },
      );
      assert.equal(sessionState(root, "session-a").lastPhase, "gather");

      const sessionBSystem = await transform(result, "session-b");
      assert.doesNotMatch(sessionBSystem, /AION RESUME PROTOCOL/);
      assert.equal(sessionState(root, "session-b"), undefined);
      assert.equal(sessionState(root, "session-a").interrupted, true);

      const resumedSystem = await transform(result, "session-a");
      assert.match(resumedSystem, /previous session stopped at gather/);

      writeFileSync(statePath(root), JSON.stringify({
        version: 2,
        executionMode: "AUTO",
        activeSessionID: "session-c",
        sessions: {
          "session-c": {
            lastPhase: "init",
            phaseReason: "interrupted before work",
            resumeHint: "Start TODO-001.",
            interrupted: true,
            complexityTier: "unset",
          },
        },
      }));
      await transform(result, "session-c");
      await result["tool.execute.after"](
        { tool: "aion_workspace_init" },
        { args: {}, output: JSON.stringify({ status: "ok" }) },
      );

      const progressed = sessionState(root, "session-c");
      assert.equal(progressed.interrupted, false);
      assert.equal(progressed.resumeHint, null);
      assert.equal(progressed.lastPhase, "gather");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("marks an active interrupted session on restart and resumes only that session", async () => {
    const root = createProject();
    mkdirSync(join(root, ".opencode", "memory"), { recursive: true });
    writeFileSync(statePath(root), JSON.stringify({
      version: 2,
      executionMode: "AUTO",
      activeSessionID: "session-restart",
      sessions: {
        "session-restart": {
          lastPhase: "implement",
          phaseReason: "running before restart",
          interrupted: false,
          complexityTier: "MEDIUM",
        },
      },
    }));

    try {
      const result = await createPlugin(root);
      assert.equal(sessionState(root, "session-restart").interrupted, true);
      const system = await transform(result, "session-restart");
      assert.match(system, /previous session stopped at implement/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
