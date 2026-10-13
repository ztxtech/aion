import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

let counter = 0;
const runtime = await (await importBundle())._testing.runtimeControl();

function createProject() {
  return mkdtempSync(join(tmpdir(), `aion-frontier-${counter++}-`));
}

function writeSession(root, sessionID, session = {}) {
  mkdirSync(join(root, ".opencode", "memory"), { recursive: true });
  writeFileSync(join(root, ".opencode", "memory", "runtime-state.json"), JSON.stringify({
    version: 2,
    executionMode: "AUTO",
    activeSessionID: sessionID,
    sessions: { [sessionID]: session },
  }));
}

async function createPlugin(root) {
  const bundle = await importBundle();
  return bundle.default.server({
    directory: root,
    client: undefined,
    project: undefined,
    $: undefined,
  });
}

function sessionState(root, sessionID) {
  return runtime.readRuntimeState(root).sessions[sessionID];
}

function activeFrontier(overrides = {}) {
  return {
    ...runtime.defaultFrontierState(),
    status: "active",
    activatedAt: "2026-10-13T00:00:00.000Z",
    ...overrides,
  };
}

async function emit(result, sessionID, type, id) {
  await result.emitEvent({
    id,
    type,
    data: { sessionID },
  });
}

async function runIdle(result, sessionID, id) {
  await emit(result, sessionID, "session.execution.started", `${id}-started`);
  await emit(result, sessionID, "session.idle", `${id}-idle`);
}

describe("AION frontier state", () => {
  it("has a complete inactive default and normalizes persisted values", () => {
    assert.deepEqual(runtime.defaultFrontierState(), {
      status: "inactive",
      bestValue: null,
      direction: "unchanged",
      baselineValue: null,
      stagnantRounds: 0,
      roundsSinceNewStrategy: 0,
      lastStrategyHash: null,
      attemptedStrategies: [],
      lastEvidenceHash: null,
      bestEvidence: null,
      gap: null,
      remainingCondition: null,
      externalDecision: null,
      reportedForRound: false,
      activatedAt: null,
    });

    const root = createProject();
    try {
      runtime.updateSessionRuntimeState(root, "session-normalize", {
        frontier: {
          status: "not-a-status",
          bestValue: Number.POSITIVE_INFINITY,
          direction: "sideways",
          baselineValue: "not-a-number",
          stagnantRounds: -4,
          roundsSinceNewStrategy: 1.5,
          lastStrategyHash: 42,
          attemptedStrategies: ["  first  ", "", 7, "second"],
          lastEvidenceHash: {},
          bestEvidence: 9,
          gap: false,
          remainingCondition: [],
          externalDecision: "",
          reportedForRound: "yes",
          activatedAt: 99,
        },
      });

      assert.deepEqual(sessionState(root, "session-normalize").frontier, {
        ...runtime.defaultFrontierState(),
        attemptedStrategies: ["first", "second"],
      });
      assert.deepEqual(runtime.normalizeFrontierState({
        status: "active",
        direction: "minimize",
        bestValue: 3,
        stagnantRounds: 2,
        attemptedStrategies: ["  a  ", "", "b"],
        reportedForRound: true,
      }), {
        ...runtime.defaultFrontierState(),
        status: "active",
        direction: "minimize",
        bestValue: 3,
        stagnantRounds: 2,
        attemptedStrategies: ["a", "b"],
        reportedForRound: true,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("records metric progress and rejects a non-improving value", () => {
    const now = "2026-10-13T00:00:00.000Z";
    const active = runtime.activateFrontierState(runtime.defaultFrontierState(), now);
    const baseline = runtime.applyFrontierReport(active, {
      strategy: "raise estimator capacity",
      evidence: "validation MAE",
      value: 10,
      direction: "minimize",
    }, now);

    assert.equal(baseline.accepted, true);
    assert.equal(baseline.progress, true);
    assert.equal(baseline.state.direction, "minimize");
    assert.equal(baseline.state.bestValue, 10);
    assert.equal(baseline.state.stagnantRounds, 0);

    const noProgress = runtime.applyFrontierReport({
      ...baseline.state,
      reportedForRound: false,
    }, {
      strategy: "tune same estimator",
      evidence: "validation MAE",
      value: 11,
      direction: "minimize",
    }, now);

    assert.equal(noProgress.accepted, true);
    assert.equal(noProgress.progress, false);
    assert.equal(noProgress.state.stagnantRounds, 1);
    assert.equal(noProgress.state.bestValue, 10);
  });

  it("resets stagnation when materially new evidence arrives", () => {
    const now = "2026-10-13T00:00:00.000Z";
    const state = runtime.applyFrontierReport(activeFrontier({
      stagnantRounds: 4,
      lastEvidenceHash: "old-evidence",
      lastStrategyHash: "old-strategy",
    }), {
      strategy: "collect stronger baseline",
      evidence: "new held-out artifact",
    }, now);

    assert.equal(state.accepted, true);
    assert.equal(state.progress, true);
    assert.equal(state.state.stagnantRounds, 0);
    assert.equal(state.state.bestEvidence, "new held-out artifact");
  });

  it("allows only one accepted report per round", () => {
    const now = "2026-10-13T00:00:00.000Z";
    const first = runtime.applyFrontierReport(activeFrontier(), {
      strategy: "first strategy",
      evidence: "first artifact",
    }, now);
    const second = runtime.applyFrontierReport(first.state, {
      strategy: "second strategy",
      evidence: "second artifact",
    }, now);

    assert.equal(first.accepted, true);
    assert.equal(first.state.reportedForRound, true);
    assert.equal(second.accepted, false);
    assert.match(second.reason, /One frontier report is allowed per round/);
    assert.deepEqual(second.state, first.state);
  });

  it("rejects a direction that conflicts with the established metric direction", () => {
    const now = "2026-10-13T00:00:00.000Z";
    const result = runtime.applyFrontierReport(activeFrontier({
      direction: "maximize",
      bestValue: 80,
    }), {
      strategy: "switch objective",
      evidence: "different metric",
      value: 90,
      direction: "minimize",
    }, now);

    assert.equal(result.accepted, false);
    assert.match(result.reason, /direction must remain maximize/);
    assert.equal(result.state.bestValue, 80);
  });

  it("exhausts after the requested number of stagnant rounds", () => {
    const thresholdCases = [
      { threshold: 2, expectedAdvanceRounds: 1 },
      { threshold: 3, expectedAdvanceRounds: 2 },
      { threshold: 5, expectedAdvanceRounds: 4 },
    ];

    for (const { threshold, expectedAdvanceRounds } of thresholdCases) {
      let state = runtime.activateFrontierState(
        runtime.defaultFrontierState(),
        "2026-10-13T00:00:00.000Z",
      );
      for (let round = 1; round < threshold; round++) {
        state = runtime.advanceFrontierState(state, threshold);
        assert.equal(state.status, "active");
        assert.equal(state.stagnantRounds, round);
      }
      assert.equal(expectedAdvanceRounds, threshold - 1);

      state = runtime.advanceFrontierState(state, threshold);
      assert.equal(state.status, "exhausted");
      assert.equal(state.stagnantRounds, threshold);
      assert.equal(state.reportedForRound, false);
      assert.equal(runtime.advanceFrontierState(state, threshold).status, "exhausted");
    }
  });

  it("resets explicitly and on closed-to-open Goal lifecycle transitions", async () => {
    assert.deepEqual(runtime.resetFrontierState(), runtime.defaultFrontierState());

    const cases = [
      { target: "none", tool: "clear_goal", input: {} },
      { target: "active", tool: "update_goal_status", input: { status: "active" } },
      { target: "cancelled", tool: "update_goal_status", input: { status: "cancelled" } },
    ];

    for (const { target, tool, input } of cases) {
      const root = createProject();
      const sessionID = `goal-reset-${target}`;
      writeSession(root, sessionID, {
        task: { externalGoalStatus: "completed" },
        frontier: activeFrontier({
          bestValue: 42,
          stagnantRounds: 3,
          attemptedStrategies: ["old strategy"],
          externalDecision: "old decision",
        }),
      });
      const result = await createPlugin(root);
      try {
        await result.toolHooks["execute.after"]({
          tool,
          sessionID,
          id: `goal-${target}`,
          agent: "aion",
          status: "completed",
          input,
          result: { content: [{ text: JSON.stringify({ goal: { status: target } }) }] },
        });

        const state = sessionState(root, sessionID);
        assert.equal(state.task.externalGoalStatus, target);
        assert.deepEqual(state.frontier, runtime.defaultFrontierState());
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });
});

describe("AION frontier V2 tool", () => {
  it("registers the tool and rejects malformed schema input", async () => {
    const root = createProject();
    try {
      const result = await createPlugin(root);
      const frontierTool = result.tool.aion_frontier_report;
      assert.ok(frontierTool);

      const invalidInputs = [
        { strategy: "", evidence: "artifact" },
        { strategy: "strategy", evidence: "" },
        { strategy: "strategy", evidence: "artifact", value: 10 },
        {
          strategy: "strategy",
          evidence: "artifact",
          value: 10,
          direction: "sideways",
        },
      ];
      for (const input of invalidInputs) {
        assert.equal(frontierTool.input.safeParse(input).success, false);
      }
      assert.equal(frontierTool.input.safeParse({
        strategy: "strategy",
        evidence: "artifact",
        value: 10,
        direction: "maximize",
      }).success, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects execution while Frontier mode is inactive", async () => {
    const root = createProject();
    try {
      const result = await createPlugin(root);
      const output = JSON.parse(await result.tool.aion_frontier_report.execute({
        strategy: "strategy",
        evidence: "artifact",
      }, {}));

      assert.equal(output.accepted, false);
      assert.equal(output.progress, false);
      assert.match(output.reason, /not active/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a conflicting direction through the registered tool", async () => {
    const root = createProject();
    const sessionID = "tool-direction";
    writeSession(root, sessionID, {
      frontier: activeFrontier({
        direction: "maximize",
        bestValue: 75,
      }),
    });
    try {
      const result = await createPlugin(root);
      const output = JSON.parse(await result.tool.aion_frontier_report.execute({
        strategy: "switch metric direction",
        evidence: "alternate artifact",
        value: 95,
        direction: "minimize",
      }, { sessionID }));

      assert.equal(output.accepted, false);
      assert.match(output.reason, /direction must remain maximize/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects the second valid report in the same round through the registered tool", async () => {
    const root = createProject();
    const sessionID = "tool-duplicate";
    writeSession(root, sessionID, { frontier: activeFrontier() });
    try {
      const result = await createPlugin(root);
      const first = JSON.parse(await result.tool.aion_frontier_report.execute({
        strategy: "first attempt",
        evidence: "first artifact",
      }, { sessionID }));
      const second = JSON.parse(await result.tool.aion_frontier_report.execute({
        strategy: "second attempt",
        evidence: "second artifact",
      }, { sessionID }));

      assert.equal(first.accepted, true);
      assert.equal(second.accepted, false);
      assert.match(second.reason, /One frontier report is allowed per round/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("AION frontier idle loop", () => {
  it("starts the Goal closure audit and Frontier in the first continuation", async () => {
    const root = createProject();
    const sessionID = "goal-closure-first-round";
    writeSession(root, sessionID, {
      task: { externalGoalStatus: "unmet" },
      rounds: { current: 0, max: 0 },
      frontier: runtime.defaultFrontierState(),
    });
    try {
      const result = await createPlugin(root);
      await runIdle(result, sessionID, "goal-closure");

      assert.equal(result.promptCalls.length, 1);
      assert.match(result.promptCalls[0].text, /\[AION EXTERNAL GOAL CLOSE AUDIT\]/);
      assert.match(result.promptCalls[0].text, /\[AION FRONTIER: APPROACH\]/);
      assert.match(result.promptCalls[0].text, /Do NOT skip the pre- and post- ts-critic reviews\.[\s\S]*\[AION FRONTIER: APPROACH\]/);
      assert.equal(sessionState(root, sessionID).frontier.status, "active");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses tier-specific no-report limits of 2, 3, and 5 rounds", async () => {
    const cases = [
      { tier: "LIGHT", threshold: 2 },
      { tier: "MEDIUM", threshold: 3 },
      { tier: "FULL", threshold: 5 },
    ];

    for (const { tier, threshold } of cases) {
      const root = createProject();
      const sessionID = `frontier-${tier}`;
      writeSession(root, sessionID, {
        task: { externalGoalStatus: "unmet" },
        complexityTier: tier,
        rounds: { current: 0, max: 0 },
        frontier: runtime.defaultFrontierState(),
      });
      try {
        const result = await createPlugin(root);
        await runIdle(result, sessionID, `${tier}-first`);
        assert.equal(result.promptCalls.length, 1);
        assert.equal(sessionState(root, sessionID).frontier.stagnantRounds, 0);

        for (let round = 1; round < threshold; round++) {
          await runIdle(result, sessionID, `${tier}-${round}`);
          assert.equal(result.promptCalls.length, round + 1);
          const state = sessionState(root, sessionID).frontier;
          assert.equal(state.status, "active");
          assert.equal(state.stagnantRounds, round);
        }

        await runIdle(result, sessionID, `${tier}-exhausted`);
        assert.equal(result.promptCalls.length, threshold);
        const state = sessionState(root, sessionID);
        assert.equal(state.frontier.status, "exhausted");
        assert.equal(state.frontier.stagnantRounds, threshold);
        assert.equal(state.task.status, "blocked");
        assert.match(state.task.lastAudit, new RegExp(`Frontier exhausted after ${threshold} stagnant rounds`));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it("stops without another prompt after repeated no-report idle rounds", async () => {
    const root = createProject();
    const sessionID = "frontier-no-report";
    writeSession(root, sessionID, {
      task: { externalGoalStatus: "unmet" },
      complexityTier: "MEDIUM",
      rounds: { current: 0, max: 0 },
      frontier: runtime.defaultFrontierState(),
    });
    try {
      const result = await createPlugin(root);
      await runIdle(result, sessionID, "no-report-first");
      await runIdle(result, sessionID, "no-report-second");
      await runIdle(result, sessionID, "no-report-third");
      const promptCount = result.promptCalls.length;
      await runIdle(result, sessionID, "no-report-fourth");

      assert.equal(promptCount, 3);
      assert.equal(result.promptCalls.length, 3);
      assert.equal(sessionState(root, sessionID).frontier.status, "exhausted");
      assert.equal(sessionState(root, sessionID).task.status, "blocked");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("stops continuation when a report requires an external decision", async () => {
    const root = createProject();
    const sessionID = "frontier-external-decision";
    writeSession(root, sessionID, {
      task: { externalGoalStatus: "unmet" },
      rounds: { current: 0, max: 0 },
      frontier: activeFrontier({
        stagnantRounds: 2,
        externalDecision: "owner must choose the target metric",
      }),
    });
    try {
      const result = await createPlugin(root);
      await runIdle(result, sessionID, "external-decision");

      assert.equal(result.promptCalls.length, 0);
      const state = sessionState(root, sessionID);
      assert.equal(state.task.status, "awaiting-review");
      assert.equal(state.frontier.status, "active");
      assert.equal(state.frontier.stagnantRounds, 3);
      assert.match(state.task.lastAudit, /External decision required: owner must choose the target metric/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps an external decision actionable at the stagnation threshold", () => {
    let state = runtime.activateFrontierState(
      runtime.defaultFrontierState(),
      "2026-10-14T00:00:00.000Z",
    );
    state = {
      ...state,
      stagnantRounds: 2,
      externalDecision: "owner must choose the target metric",
    };

    state = runtime.advanceFrontierState(state, 3);

    assert.equal(state.status, "active");
    assert.equal(state.stagnantRounds, 3);
    assert.equal(state.externalDecision, "owner must choose the target metric");
  });

  it("does not auto-continue after a user interruption", async () => {
    const root = createProject();
    const sessionID = "frontier-user-interrupt";
    writeSession(root, sessionID, {
      task: { externalGoalStatus: "unmet" },
      rounds: { current: 0, max: 0 },
      frontier: activeFrontier({ stagnantRounds: 1 }),
    });
    try {
      const result = await createPlugin(root);
      await result.emitEvent({
        id: "user-interrupted",
        type: "session.execution.interrupted",
        data: { sessionID, reason: "user" },
      });
      await emit(result, sessionID, "session.idle", "after-user-interrupt");

      assert.equal(result.promptCalls.length, 0);
      const state = sessionState(root, sessionID);
      assert.equal(state.interrupted, true);
      assert.equal(state.frontier.status, "active");
      assert.equal(state.frontier.stagnantRounds, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("checks max rounds before the Goal closure and Frontier audit", async () => {
    const root = createProject();
    const sessionID = "frontier-max-rounds";
    writeSession(root, sessionID, {
      task: { externalGoalStatus: "unmet" },
      rounds: { current: 3, max: 3 },
      frontier: runtime.defaultFrontierState(),
    });
    try {
      const result = await createPlugin(root);
      await runIdle(result, sessionID, "max-rounds");

      assert.equal(result.promptCalls.length, 0);
      const state = sessionState(root, sessionID);
      assert.equal(state.task.status, "blocked");
      assert.match(state.task.lastAudit, /Max AION rounds reached/);
      assert.equal(state.frontier.status, "inactive");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
