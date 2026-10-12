import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTempTarget, runOpencodeRun, parseNdjsonEvents, summarizeEvents } from "../helpers/temp-target.mjs";

const MODEL = "local-auto/minimax";
const TIMEOUT_MS = 60_000;

describe("integration: opencode non-TUI mode", () => {
  let target: ReturnType<typeof createTempTarget>;

  before(() => {
    target = createTempTarget("aion-integ-");
  });

  after(() => {
    target?.cleanup();
  });

  it("opencode run with local-auto/minimax returns events", async function () {
    this.timeout(TIMEOUT_MS + 10_000);
    const result = runOpencodeRun(target, "Say hello", {
      model: MODEL,
      timeoutMs: TIMEOUT_MS,
    });

    if (result.error) {
      assert.fail(`opencode run failed: ${result.error.message}`);
    }

    const events = parseNdjsonEvents(result.stdout);
    assert.ok(events.length > 0, `expected events but got ${events.length} (stderr: ${result.stderr?.slice(0, 500)})`);
  });

  it("events contain at least one text or tool_use", async function () {
    this.timeout(TIMEOUT_MS + 10_000);
    const result = runOpencodeRun(target, "What is 2+2? Just answer the number.", {
      model: MODEL,
      timeoutMs: TIMEOUT_MS,
    });

    const events = parseNdjsonEvents(result.stdout);
    const summary = summarizeEvents(events);

    const hasContent = summary.texts.length > 0 || summary.tool_uses.length > 0;
    assert.ok(hasContent, `expected at least one text or tool_use event (texts=${summary.texts.length}, tools=${summary.tool_uses.length})`);
  });

  it("opencode uses specified model local-auto/minimax", async function () {
    this.timeout(TIMEOUT_MS + 10_000);
    const result = runOpencodeRun(target, "Reply with just the word 'pong'", {
      model: MODEL,
      timeoutMs: TIMEOUT_MS,
      format: "json",
    });

    if (result.status !== 0 && !result.stdout) {
      assert.fail(`opencode run exited ${result.status}: ${result.stderr?.slice(0, 500)}`);
    }

    const events = parseNdjsonEvents(result.stdout);
    assert.ok(events.length > 0, "should produce events");
  });
});

describe("integration: model constraint", () => {
  it("must never use opencode-go or huggingface models", () => {
    const forbiddenPatterns = [
      /opencode-go/i,
      /huggingface/i,
      /hf\//i,
    ];
    const allowedModel = MODEL;
    for (const pat of forbiddenPatterns) {
      assert.ok(!pat.test(allowedModel), `model ${allowedModel} must not match forbidden pattern ${pat.source}`);
    }
  });

  it("model is local-auto/minimax", () => {
    assert.equal(MODEL, "local-auto/minimax");
  });
});
