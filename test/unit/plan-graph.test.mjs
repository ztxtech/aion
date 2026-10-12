import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { importBundle } from "../helpers/load-bundle.mjs";

describe("plan graph", async () => {
  let planGraph;

  before(async () => {
    planGraph = await (await importBundle())._testing.planGraph();
  });

  it("parses dependency lists", () => {
    assert.deepEqual(planGraph.parseDependencies("TODO-001, TODO-002 TODO-003"), [
      "TODO-001",
      "TODO-002",
      "TODO-003",
    ]);
    assert.deepEqual(planGraph.parseDependencies(undefined), []);
  });

  it("keeps an empty field from swallowing the next line", () => {
    const items = planGraph.parsePlanMap(`#### TODO-001

- Plan step: audit baselines
- Wave: 1
- Owner: coder
- State: **done**
- Depends on:
- added: 2026-10-12T02:00:00.000Z
- updated: 2026-10-12T02:40:00.000Z

#### TODO-002

- Plan step: rerun the pipeline
- Wave: 2
- Owner: coder
- State: **in-progress**
- Depends on: TODO-001
- added: 2026-10-12T02:45:00.000Z
- updated: 2026-10-12T03:10:00.000Z
`);

    assert.deepEqual(items.map((item) => item.id), ["TODO-001", "TODO-002"]);
    assert.deepEqual(items[0].dependsOn, []);
    assert.equal(items[0].addedAt, "2026-10-12T02:00:00.000Z");
    assert.equal(items[0].updatedAt, "2026-10-12T02:40:00.000Z");
    assert.deepEqual(items[1].dependsOn, ["TODO-001"]);
    assert.equal(items[1].state, "in-progress");
  });

  it("layers dependency fronts and reports invalid dependencies", () => {
    const graph = planGraph.buildPlanGraph([
      { id: "TODO-001", dependsOn: [] },
      { id: "TODO-002", dependsOn: ["TODO-001"] },
      { id: "TODO-003", dependsOn: ["TODO-001"] },
      { id: "TODO-004", dependsOn: ["TODO-002", "TODO-003", "TODO-404"] },
    ]);
    assert.deepEqual(graph.layers, [["TODO-001"], ["TODO-002", "TODO-003"], ["TODO-004"]]);
    assert.deepEqual(graph.invalidDependencies, ["TODO-404"]);
    assert.equal(graph.hasCycle, false);
  });

  it("detects cycles", () => {
    const graph = planGraph.buildPlanGraph([
      { id: "TODO-001", dependsOn: ["TODO-002"] },
      { id: "TODO-002", dependsOn: ["TODO-001"] },
    ]);
    assert.equal(graph.hasCycle, true);
  });
});
