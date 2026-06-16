import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { importBundle } from "../helpers/load-bundle.mjs";

let scheduling;

describe("scheduling: state-machine edge legality", async () => {
  before(async () => {
    const bundle = await importBundle();
    scheduling = await bundle._testing.scheduling();
  });

  beforeEach(() => {
    scheduling.resetWorkerProgress();
  });

  it("allows requirements-analyst from init", () => {
    assert.ok(scheduling.isLegalDispatch("init", "requirements-analyst"));
  });

  it("forbids coder from init (must go through requirements → information first)", () => {
    assert.equal(scheduling.isLegalDispatch("init", "coder"), false);
  });

  it("forbids c-critic from gather (only ts-critic / workers allowed there)", () => {
    assert.equal(scheduling.isLegalDispatch("gather", "c-critic"), false);
  });

  it("allows ts-critic pre-review in gather phase", () => {
    assert.ok(scheduling.isLegalDispatch("gather", "ts-critic"));
  });

  it("allows coder in implement phase", () => {
    assert.ok(scheduling.isLegalDispatch("implement", "coder"));
  });

  it("forbids information-collector in implement phase", () => {
    assert.equal(scheduling.isLegalDispatch("implement", "information-collector"), false);
  });

  it("allows c-critic only in c-critic-final phase", () => {
    assert.ok(scheduling.isLegalDispatch("c-critic-final", "c-critic"));
    assert.equal(scheduling.isLegalDispatch("gather", "c-critic"), false);
    assert.equal(scheduling.isLegalDispatch("implement", "c-critic"), false);
  });

  it("returns a non-empty human-readable list of legal dispatches", () => {
    const list = scheduling.legalDispatchesFrom("gather");
    assert.ok(list.length > 0);
    assert.ok(list.includes("requirements-analyst"));
    assert.ok(list.includes("information-collector"));
    assert.ok(list.includes("ts-critic"));
  });

  it("returns (none) for done phase", () => {
    assert.equal(scheduling.legalDispatchesFrom("done"), "(none — terminal phase)");
  });
});

describe("scheduling: worker pre/post review tracking", async () => {
  before(async () => {
    const bundle = await importBundle();
    scheduling = await bundle._testing.scheduling();
  });

  beforeEach(() => {
    scheduling.resetWorkerProgress();
  });

  it("requires pre-review on first dispatch of each worker", () => {
    assert.ok(scheduling.requiresPreReview("requirements-analyst"));
    assert.ok(scheduling.requiresPreReview("information-collector"));
    assert.ok(scheduling.requiresPreReview("coder"));
  });

  it("marks pre-review done when ts-critic is dispatched in gather", () => {
    scheduling.recordDispatch("ts-critic", "gather");
    // After one ts-critic in gather, the first worker (requirements-analyst) has its pre-review done.
    assert.equal(scheduling.requiresPreReview("requirements-analyst"), false);
  });

  it("marks worker done after reportback", () => {
    scheduling.recordWorkerDone("requirements-analyst");
    assert.equal(scheduling.isWorkerDone("requirements-analyst"), true);
    // Pre-review no longer required once worker has run.
    assert.equal(scheduling.requiresPreReview("requirements-analyst"), false);
  });

  it("marks post-review done when ts-critic is dispatched in ts-post-review phase", () => {
    scheduling.recordDispatch("ts-critic", "ts-post-review");
    assert.equal(scheduling.isPostReviewDone("coder"), true);
  });

  it("resetWorkerProgress clears all worker state", () => {
    scheduling.recordWorkerDone("coder");
    scheduling.resetWorkerProgress();
    assert.equal(scheduling.isWorkerDone("coder"), false);
    assert.equal(scheduling.isPostReviewDone("coder"), false);
  });
});

describe("scheduling: reportback parsing", async () => {
  before(async () => {
    const bundle = await importBundle();
    scheduling = await bundle._testing.scheduling();
  });

  it("parses status=done", () => {
    const rb = scheduling.parseReportback("status: done\ncompleted: contract written");
    assert.equal(rb.status, "done");
  });

  it("parses status=blocker", () => {
    const rb = scheduling.parseReportback("I hit a blocker: data file is missing");
    assert.equal(rb.status, "blocker");
  });

  it("parses status=need-info", () => {
    const rb = scheduling.parseReportback("status: need-info\nneed more details about the eval metric");
    assert.equal(rb.status, "need-info");
  });

  it("parses next_call=requirements-analyst", () => {
    const rb = scheduling.parseReportback("next_call: requirements-analyst\nreason: contract gap discovered");
    assert.equal(rb.nextCall, "requirements-analyst");
  });

  it("parses next_call=information-collector", () => {
    const rb = scheduling.parseReportback("next_agent: information-collector\nNeed more SOTA evidence");
    assert.equal(rb.nextCall, "information-collector");
  });

  it("parses next_call=coder", () => {
    const rb = scheduling.parseReportback("next_call: coder\nimplementation is the next step");
    assert.equal(rb.nextCall, "coder");
  });

  it("parses next_call=ts-critic", () => {
    const rb = scheduling.parseReportback("next_call: ts-critic");
    assert.equal(rb.nextCall, "ts-critic");
  });

  it("parses next_call=self", () => {
    const rb = scheduling.parseReportback("next_call: self\nneed to deepen the analysis");
    assert.equal(rb.nextCall, "self");
  });

  it("parses next_call=stop", () => {
    const rb = scheduling.parseReportback("next_call: stop\ntask appears complete");
    assert.equal(rb.nextCall, "stop");
  });

  it("returns null nextCall when no next_call field is present", () => {
    const rb = scheduling.parseReportback("status: done\nall work finished, no more to do");
    assert.equal(rb.nextCall, null);
  });

  it("extracts unresolved issues from reportback text", () => {
    const text = `status: blocker
- unresolved: feature X has no baseline
- missing: evaluation script
- blocker: GPU out of memory on full dataset
some other note`;
    const rb = scheduling.parseReportback(text);
    assert.ok(rb.unresolvedIssues.length >= 2);
    assert.ok(rb.unresolvedIssues.some((s) => s.toLowerCase().includes("feature x")));
    assert.ok(rb.unresolvedIssues.some((s) => s.toLowerCase().includes("evaluation script")));
  });
});

describe("scheduling: Mermaid diagram export", async () => {
  before(async () => {
    const bundle = await importBundle();
    scheduling = await bundle._testing.scheduling();
  });

  it("exports a Mermaid diagram string", () => {
    assert.equal(typeof scheduling.SCHEDULING_MERMAID, "string");
    assert.ok(scheduling.SCHEDULING_MERMAID.length > 100);
  });

  it("contains stateDiagram-v2 directive", () => {
    assert.ok(scheduling.SCHEDULING_MERMAID.includes("stateDiagram-v2"));
  });

  it("mentions the three worker phases (req/info/coder)", () => {
    const m = scheduling.SCHEDULING_MERMAID;
    assert.ok(m.includes("req"));
    assert.ok(m.includes("info"));
    assert.ok(m.includes("coder"));
  });

  it("contains back-edge semantics (reject-stop, next_call)", () => {
    const m = scheduling.SCHEDULING_MERMAID;
    assert.ok(m.includes("reject-stop"));
    assert.ok(m.includes("next_call"));
  });
});
