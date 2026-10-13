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

  it("persists and restores task keeper governance state per session", () => {
    const root = createProject();
    try {
      runtime.updateSessionRuntimeState(root, "session-task", {
        lastPhase: "implement",
        rounds: { current: 7, max: 50 },
        governance: {
          stopSignal: "absolutely-cannot-stop-now",
          blockers: [{
            id: "BLK-004",
            source: "c-critic",
            description: "missing validation",
            evidence: "tests absent",
            unblockCondition: "tests pass",
            forbiddenAction: "claim completion",
            raisedAt: "2026-10-13T00:00:00.000Z",
          }],
          lastCCriticVerdict: "reject-stop",
          lastTsCriticSignal: "rebuttal-mode",
          lastPreStopGate: {
            allowStop: false,
            blockers: ["missing validation"],
            recordedAt: "2026-10-13T00:00:01.000Z",
          },
        },
        task: {
          objective: "finish task.md",
          status: "active",
          lastAuditAt: "2026-10-13T00:00:02.000Z",
          lastAudit: "one action remains",
          continuationCount: 3,
          lastContinuationAt: "2026-10-13T00:00:03.000Z",
          lastContinuationEventID: "event-3",
          goalCorrectionCount: 1,
          externalGoalStatus: "unmet",
        },
      });

      const restored = runtime.readRuntimeState(root).sessions["session-task"];
      assert.equal(restored.rounds.current, 7);
      assert.equal(restored.governance.blockers[0].source, "c-critic");
      assert.equal(restored.governance.lastCCriticVerdict, "reject-stop");
      assert.equal(restored.task.objective, "finish task.md");
      assert.equal(restored.task.continuationCount, 3);
      assert.equal(restored.task.lastContinuationEventID, "event-3");
      assert.equal(restored.task.externalGoalStatus, "unmet");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("persists the complete governance decision state per session", () => {
    const root = createProject();
    try {
      runtime.updateSessionRuntimeState(root, "session-full", {
        governance: {
          stopSignal: "rebuttal-mode",
          blockers: [],
          lastCCriticVerdict: "reject-stop",
          lastTsCriticSignal: "rebuttal-mode",
          lastPreStopGate: null,
          rebuttalMode: true,
          visualTestLoopPending: true,
          lastReadImageFile: "plot.png",
          blindOptimismFlag: true,
          lastDispatchTarget: "coder",
          userContinueDecision: "continue",
          userComment: "keep going",
          userCheckedAt: "2026-10-13T00:00:00.000Z",
          interactiveModeResolved: "interactive",
          interactiveModeGranularity: "custom",
          interactiveModeCustomTriggers: ["dispatch"],
          interactiveModeConfirmedAt: "2026-10-13T00:00:01.000Z",
          interactiveModeSource: "user-toggle",
          languageResolved: "zh-deliver",
          languageSource: "user-toggle",
          pendingNextCall: "coder",
          pendingNextCallReason: "fix regression",
          pendingUnresolvedIssues: ["missing test"],
          pendingNextCallIgnoredRounds: 2,
          lastInjectedNextCall: "coder",
        },
        branches: [{
          branchId: "B1",
          wave: 2,
          status: "leading",
          currentValue: 0.9,
          evidenceCount: 4,
          startedAt: "2026-10-13T00:00:02.000Z",
        }],
        intent: "implement",
      });

      const restored = runtime.readRuntimeState(root).sessions["session-full"];
      assert.equal(restored.governance.interactiveModeGranularity, "custom");
      assert.deepEqual(restored.governance.interactiveModeCustomTriggers, ["dispatch"]);
      assert.equal(restored.governance.languageResolved, "zh-deliver");
      assert.equal(restored.governance.pendingNextCallIgnoredRounds, 2);
      assert.equal(restored.branches[0].branchId, "B1");
      assert.equal(restored.intent, "implement");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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

  it("does not interrupt one session when another becomes active", async () => {
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
      assert.equal(sessionState(root, "session-b").lastPhase, "init");
      assert.equal(sessionState(root, "session-b").interrupted, false);
      assert.equal(sessionState(root, "session-a").interrupted, false);

      runtime.updateSessionRuntimeState(root, "session-a", {
        interrupted: true,
        resumeHint: "Review todo-map.md and resume from gather.",
      });
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

  it("preserves the loaded session before the first runtime session switch", async () => {
    const root = createProject();
    try {
      runtime.updateSessionRuntimeState(root, "session-b", {
        lastPhase: "gather",
        phaseReason: "persisted B",
        resumeHint: "Resume B without resetting its state.",
        interrupted: true,
        complexityTier: "FULL",
        rounds: { current: 2, max: 8 },
        governance: {
          stopSignal: "absolutely-cannot-stop-now",
          blockers: [],
          lastCCriticVerdict: "reject-stop",
          lastTsCriticSignal: "absolutely-cannot-stop-now",
          lastPreStopGate: null,
          languageResolved: "zh-deliver",
          languageSource: "user-toggle",
        },
      });
      runtime.updateSessionRuntimeState(root, "session-a", {
        lastPhase: "implement",
        phaseReason: "persisted A",
        resumeHint: "Resume A without resetting its state.",
        interrupted: true,
        complexityTier: "MEDIUM",
        rounds: { current: 7, max: 12 },
        governance: {
          stopSignal: "rebuttal-mode",
          blockers: [],
          lastCCriticVerdict: "reject-stop",
          lastTsCriticSignal: "rebuttal-mode",
          lastPreStopGate: null,
          pendingNextCall: "coder",
          pendingNextCallReason: "finish implementation",
        },
        task: {
          objective: "preserve A",
          status: "active",
          continuationCount: 4,
          externalGoalStatus: "active",
        },
      });

      const result = await createPlugin(root);
      const loadedA = sessionState(root, "session-a");

      const systemB = await transform(result, "session-b");
      assert.match(systemB, /previous session stopped at gather/);
      assert.deepEqual(sessionState(root, "session-a"), loadedA);

      const systemA = await transform(result, "session-a");
      assert.match(systemA, /previous session stopped at implement/);
      assert.equal(sessionState(root, "session-a").governance.pendingNextCall, "coder");
      assert.equal(sessionState(root, "session-a").task.objective, "preserve A");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps rounds.max=0 unlimited across runtime merges and session restores", async () => {
    const root = createProject();
    try {
      runtime.updateSessionRuntimeState(root, "session-limited", {
        rounds: { current: 1, max: 6 },
      });
      runtime.updateSessionRuntimeState(root, "session-unlimited", {
        lastPhase: "implement",
        phaseReason: "unlimited continuation",
        rounds: { current: 4, max: 0 },
      });

      const result = await createPlugin(root);
      const unlimitedContext = { context: [] };
      await transform(result, "session-unlimited");
      await result["experimental.session.compacting"](
        { sessionID: "session-unlimited", messages: [] },
        unlimitedContext,
      );
      assert.match(unlimitedContext.context.join("\n"), /Round 4 \/ ∞/);

      const limitedContext = { context: [] };
      await result["experimental.session.compacting"](
        { sessionID: "session-limited", messages: [] },
        limitedContext,
      );
      assert.match(limitedContext.context.join("\n"), /Round 1 \/ 6/);

      const restoredContext = { context: [] };
      await result["experimental.session.compacting"](
        { sessionID: "session-unlimited", messages: [] },
        restoredContext,
      );
      assert.match(restoredContext.context.join("\n"), /Round 4 \/ ∞/);
      assert.equal(sessionState(root, "session-unlimited").rounds.max, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("isolates concurrent AION tool state by tool context session", async () => {
    const root = createProject();
    const result = await createPlugin(root);

    try {
      await Promise.all([
        result.tool.aion_set_interactive_mode.execute(
          { enabled: true, granularity: "always-interactive", reason: "session A" },
          { sessionID: "session-a" },
        ),
        result.tool.aion_set_interactive_mode.execute(
          { enabled: false, reason: "session B" },
          { sessionID: "session-b" },
        ),
      ]);

      assert.equal(sessionState(root, "session-a").governance.interactiveModeResolved, "interactive");
      assert.equal(sessionState(root, "session-a").governance.interactiveModeGranularity, "always-interactive");
      assert.equal(sessionState(root, "session-b").governance.interactiveModeResolved, "autonomous");
      assert.equal(sessionState(root, "session-b").governance.interactiveModeGranularity, "autonomous");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
