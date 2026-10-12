import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

const bundle = await importBundle();
const callGraph = await bundle._testing.callGraph();

function createTemp() {
  return mkdtempSync(join(tmpdir(), "aion-call-graph-"));
}

describe("call graph store", () => {
  const root = createTemp();

  after(() => rmSync(root, { recursive: true, force: true }));

  it("reads a missing graph as an empty runtime state", () => {
    assert.deepEqual(callGraph.readCallGraph(root), {
      version: 1,
      activeSessionID: null,
      updatedAt: null,
      calls: [],
    });
  });

  it("stores dispatch and return pairs atomically", () => {
    const now = new Date("2026-10-12T10:00:00.000Z");
    callGraph.recordAgentCall(root, {
      from: "aion",
      to: "coder",
      kind: "dispatch",
      status: "dispatched",
    }, { now, sessionID: "session-1" });
    callGraph.recordAgentCall(root, {
      from: "coder",
      to: "aion",
      kind: "return",
      status: "done",
    }, { now: new Date(now.getTime() + 1_000) });

    const state = callGraph.readCallGraph(root);
    assert.equal(state.activeSessionID, "session-1");
    assert.equal(state.calls.length, 2);
    assert.equal(state.calls[1].status, "done");
  });

  it("caps the durable event list at 200 calls", () => {
    for (let index = 0; index < 210; index += 1) {
      callGraph.recordAgentCall(root, {
        from: "aion",
        to: "coder",
        kind: "dispatch",
        status: "dispatched",
      }, { now: new Date(Date.now() + index) });
    }

    assert.equal(callGraph.readCallGraph(root).calls.length, 200);
  });

  it("recovers from a corrupt graph file", () => {
    writeFileSync(callGraph.callGraphPath(root), "{broken");
    assert.deepEqual(callGraph.readCallGraph(root).calls, []);

    callGraph.recordAgentCall(root, {
      from: "aion",
      to: "ts-critic",
      kind: "dispatch",
      status: "dispatched",
    });
    assert.equal(callGraph.readCallGraph(root).calls.length, 1);
  });
});

describe("call graph aggregation", () => {
  it("marks an unmatched dispatch active and a completed dispatch done", () => {
    const graph = callGraph.buildAgentGraph({
      version: 1,
      activeSessionID: "session-1",
      updatedAt: null,
      calls: [
        { from: "aion", to: "coder", kind: "dispatch", status: "dispatched", at: "2026-10-12T10:00:00Z" },
        { from: "coder", to: "aion", kind: "return", status: "done", at: "2026-10-12T10:01:00Z" },
        { from: "aion", to: "ts-critic", kind: "dispatch", status: "dispatched", at: "2026-10-12T10:02:00Z" },
      ],
    });

    assert.deepEqual(graph.nodes.map((node) => [node.id, node.state]), [
      ["aion", "active"],
      ["requirements-analyst", "idle"],
      ["information-collector", "idle"],
      ["coder", "done"],
      ["ts-critic", "active"],
      ["c-critic", "idle"],
    ]);
    assert.equal(graph.summary.dispatches, 2);
    assert.equal(graph.summary.active, 1);
    assert.equal(graph.summary.done, 1);
  });

  it("counts critic verdicts and blocked returns", () => {
    const graph = callGraph.buildAgentGraph({
      version: 1,
      activeSessionID: null,
      updatedAt: null,
      calls: [
        { from: "aion", to: "coder", kind: "dispatch", status: "dispatched", at: "1" },
        { from: "coder", to: "aion", kind: "return", status: "blocked", at: "2" },
        { from: "ts-critic", to: "aion", kind: "verdict", status: "allow", at: "3" },
        { from: "c-critic", to: "aion", kind: "verdict", status: "reject", at: "4" },
      ],
    });

    assert.equal(graph.summary.blocked, 1);
    assert.equal(graph.summary.allow, 1);
    assert.equal(graph.summary.reject, 1);
    assert.ok(graph.edges.some((edge) => edge.kind === "verdict" && edge.status === "reject"));
  });
});

describe("call graph server integration", () => {
  const root = createTemp();
  let plugin;

  before(async () => {
    plugin = await bundle.default.server({
      directory: root,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  it("records legal dispatches and worker reportbacks through V2 hooks", async () => {
    await plugin["tool.execute.before"](
      { tool: "task", sessionID: "session-live", callID: "call-1" },
      { args: { agent: "requirements-analyst", prompt: "Inspect the goal" }, metadata: {} },
    );
    await plugin["tool.execute.after"](
      { tool: "task", sessionID: "session-live", callID: "call-1" },
      { args: { agent: "requirements-analyst" }, output: "status: done\nnext_call: stop" },
    );

    const graph = callGraph.buildAgentGraph(callGraph.readCallGraph(root));
    const coderNode = graph.nodes.find((node) => node.id === "requirements-analyst");
    assert.equal(coderNode.state, "done");
    assert.equal(coderNode.dispatches, 1);
    assert.equal(coderNode.returns, 1);
  });

  it("records critic verdicts returned to AION", async () => {
    await plugin["tool.execute.after"](
      { tool: "aion_critic_verdict", sessionID: "session-live", callID: "call-2" },
      { args: { critic: "ts-critic", verdict: "allow-stop" }, output: "ok" },
    );

    const graph = callGraph.buildAgentGraph(callGraph.readCallGraph(root));
    assert.equal(graph.summary.allow, 1);
    assert.ok(graph.edges.some((edge) =>
      edge.from === "ts-critic"
      && edge.to === "aion"
      && edge.kind === "verdict"
      && edge.status === "allow",
    ));
  });
});
