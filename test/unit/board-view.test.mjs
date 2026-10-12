import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { importBundle } from "../helpers/load-bundle.mjs";

const bundle = await importBundle();
const boardView = await bundle._testing.boardView();
const callGraph = await bundle._testing.callGraph();

describe("execution plan list", () => {
  const graph = {
    items: [
      { id: "TODO-002", planStep: "rerun the pipeline", owner: "coder", wave: 2, state: "in-progress", dependsOn: ["TODO-001"] },
      { id: "TODO-001", planStep: "audit baselines", owner: "analyst", wave: 1, state: "done", dependsOn: [] },
      { id: "TODO-003", planStep: "review results", owner: "ts-critic", wave: 3, state: "todo", dependsOn: ["TODO-002"] },
    ],
    layers: [["TODO-001"], ["TODO-002"], ["TODO-003"]],
    invalidDependencies: [],
    hasCycle: false,
  };

  it("keeps dependency order and exposes compact metadata", () => {
    const items = boardView.executionListItems(graph);
    assert.deepEqual(items.map((item) => item.id), ["TODO-001", "TODO-002", "TODO-003"]);
    assert.equal(
      boardView.executionListLine(items[1], 0),
      "● TODO-002 rerun the pipeline · coder · w2 · after TODO-001",
    );
  });

  it("uses a bounded active-state animation", () => {
    const item = boardView.executionListItems(graph)[1];
    assert.match(boardView.executionListLine(item, 0), /^● /);
    assert.match(boardView.executionListLine(item, 1), /^◆ /);
    assert.match(boardView.executionListLine(item, 3), /^◇ /);
  });

  it("keeps malformed items visible instead of dropping them", () => {
    const items = boardView.executionListItems({
      ...graph,
      layers: [["TODO-001"], ["TODO-002"], ["TODO-003"], ["TODO-999"]],
    });
    assert.deepEqual(items.map((item) => item.id), ["TODO-001", "TODO-002", "TODO-003"]);
  });
});

describe("agent activity list", () => {
  it("keeps a stable role order and verdict summary", () => {
    const state = callGraph.readCallGraph("/tmp/does-not-exist-aion-board");
    const view = boardView.agentActivityView(callGraph.buildAgentGraph(state));
    assert.deepEqual(view.items.map((item) => item.id), [
      "aion",
      "requirements-analyst",
      "information-collector",
      "coder",
      "ts-critic",
      "c-critic",
      "search-scout",
      "experiment-runner",
    ]);
    assert.match(view.summary, /0 done · 0 blocked · 0 allow · 0 reject/);
  });

  it("formats dispatch and return counts on one line", () => {
    const state = callGraph.readCallGraph("/tmp/does-not-exist-aion-board");
    state.calls = [{
      from: "aion",
      to: "coder",
      kind: "dispatch",
      status: "dispatched",
      at: new Date().toISOString(),
    }];
    const view = boardView.agentActivityView(callGraph.buildAgentGraph(state));
    const coder = view.items.find((item) => item.id === "coder");
    assert.equal(boardView.agentListLine(coder, 0), "● coder · 1↑ · 0↓");
  });
});
