import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { importBundle } from "../helpers/load-bundle.mjs";

const bundle = await importBundle();
const boardView = await bundle._testing.boardView();
const callGraph = await bundle._testing.callGraph();

describe("execution board layout", () => {
  const graph = {
    items: [
      { id: "TODO-001", planStep: "audit baselines", owner: "analyst", wave: 1, state: "done", dependsOn: [] },
      { id: "TODO-002", planStep: "rerun the pipeline", owner: "coder", wave: 2, state: "in-progress", dependsOn: ["TODO-001"] },
    ],
    layers: [["TODO-001"], ["TODO-002"]],
    invalidDependencies: [],
    hasCycle: false,
  };

  it("draws fixed nodes and dependency connectors", () => {
    const board = boardView.executionLayerRows(graph, { columns: 92 });
    assert.equal(board.rows.length, 2);
    assert.equal(board.nodeWidth, 24);
    assert.match(board.rows[0].nodes[0].lines[0], /✓ TODO-001/);
    assert.match(board.rows[1].nodes[0].lines[0], /● TODO-002/);
    assert.equal(board.rows[0].connectors.length, 3);
    assert.ok(board.rows[0].connectors.some((line) => line.includes("▼")));
    assert.ok(board.rows[0].connectors.some((line) => line.includes("│")));
  });

  it("animates horizontal flow without changing arrow targets", () => {
    const branching = {
      ...graph,
      items: [
        ...graph.items,
        { id: "TODO-003", planStep: "third", owner: "coder", wave: 2, state: "todo", dependsOn: ["TODO-001"] },
        { id: "TODO-004", planStep: "fourth", owner: "coder", wave: 2, state: "todo", dependsOn: ["TODO-001"] },
      ],
      layers: [["TODO-001"], ["TODO-002", "TODO-003", "TODO-004"]],
    };
    const first = boardView.executionLayerRows(branching, { columns: 80, tick: 0 });
    const second = boardView.executionLayerRows(branching, { columns: 80, tick: 1 });
    const arrows = (board) =>
      board.rows.flatMap((row) => row.connectors).join("\n").match(/▼/gu).length;

    assert.notDeepEqual(first.rows[0].connectors, second.rows[0].connectors);
    assert.equal(arrows(first), arrows(second));
  });

  it("wraps wide layers without dropping nodes", () => {
    const wide = {
      ...graph,
      items: [
        ...graph.items,
        { id: "TODO-003", planStep: "third", owner: "coder", wave: 2, state: "todo", dependsOn: ["TODO-001"] },
        { id: "TODO-004", planStep: "fourth", owner: "coder", wave: 2, state: "todo", dependsOn: ["TODO-001"] },
      ],
      layers: [["TODO-001"], ["TODO-002", "TODO-003", "TODO-004"]],
    };
    const board = boardView.executionLayerRows(wide, { columns: 80 });
    assert.deepEqual(
      board.rows.map((row) => row.nodes.map((node) => node.id)),
      [["TODO-001"], ["TODO-002", "TODO-003", "TODO-004"]],
    );
  });

  it("keeps tiny layouts usable", () => {
    const board = boardView.executionLayerRows(graph, { columns: 20 });
    assert.equal(board.rows[0].nodes.length, 1);
    assert.equal(board.rows[1].nodes.length, 1);
  });
});

describe("agent board layout", () => {
  it("renders the full AION topology and verdict totals", () => {
    const state = callGraph.readCallGraph("/tmp/does-not-exist-aion-board");
    const view = boardView.agentGraphView(callGraph.buildAgentGraph(state), {
      columns: 92,
    });
    assert.deepEqual(
      view.rows.map((row) => row.nodes.map((node) => node.id)),
      [
        ["aion"],
        [
          "requirements-analyst",
          "information-collector",
          "coder",
          "ts-critic",
          "c-critic",
        ],
      ["search-scout", "experiment-runner"],
      ],
    );
    assert.match(view.summary, /0 done · 0 blocked · 0 allow · 0 reject/);
    assert.ok(view.rows[0].connectors.some((line) => line.includes("▼")));
  });

  it("marks orchestration links as active when an agent runs", () => {
    const state = callGraph.readCallGraph("/tmp/does-not-exist-aion-board");
    state.calls = [{
      from: "aion",
      to: "coder",
      kind: "dispatch",
      status: "dispatched",
      at: new Date().toISOString(),
    }];
    const view = boardView.agentGraphView(callGraph.buildAgentGraph(state), {
      columns: 92,
    });

    assert.equal(view.rows[0].active, true);
  });

  it("routes nested helper dispatch edges to the helper row", () => {
    const state = callGraph.readCallGraph("/tmp/does-not-exist-aion-board");
    state.calls = [{
      from: "information-collector",
      to: "search-scout",
      kind: "dispatch",
      status: "dispatched",
      at: new Date().toISOString(),
    }];
    const view = boardView.agentGraphView(callGraph.buildAgentGraph(state), {
      columns: 92,
      tick: 0,
    });

    assert.deepEqual(view.rows[2].nodes.map((node) => node.id), ["search-scout", "experiment-runner"]);
    assert.equal(view.rows[1].connectors.some((line) => line.includes("▼")), true);
  });

  it("colors and labels use bounded single-line content", () => {
    const view = boardView.agentGraphView(callGraph.buildAgentGraph(callGraph.readCallGraph("/tmp/does-not-exist-aion-board")));
    for (const row of view.rows) {
      for (const node of row.nodes) {
        assert.equal(node.lines.length, 3);
        for (const line of node.lines) assert.ok(line.length <= view.nodeWidth);
      }
    }
  });
});
