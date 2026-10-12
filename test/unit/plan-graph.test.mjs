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
