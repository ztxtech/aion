import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { importBundle } from "../helpers/load-bundle.mjs";

describe("interactive-mode detection (regex)", async () => {
  const bundle = await importBundle();
  const chatMessageTesting = await bundle._testing.chatMessage();
  const { LEAVE_PATTERNS, ENGAGE_PATTERNS, detectInteractiveModeIntent } = chatMessageTesting;

  it("exposes pattern constants and detector", () => {
    assert.ok(LEAVE_PATTERNS, "LEAVE_PATTERNS exported");
    assert.ok(ENGAGE_PATTERNS, "ENGAGE_PATTERNS exported");
    assert.equal(typeof detectInteractiveModeIntent, "function");
  });

  const leaveCases = [
    "I'm leaving",
    "i have to go",
    "gotta go",
    "stepping away",
    "stop asking me",
    "run fully autonomous",
    "full auto",
    "switch to auto",
    "set to autonomous",
    "disable interactive",
    "I won't be here",
    "don't bother",
  ];

  const engageCases = [
    "I'm back",
    "I'm here",
    "switch to interactive",
    "enable interactive",
    "ask me",
    "check in with me",
    "let me weigh in",
    "I'm watching",
  ];

  for (const text of leaveCases) {
    it(`detects LEAVE intent: ${JSON.stringify(text)}`, () => {
      assert.equal(detectInteractiveModeIntent(text), "leave");
    });
  }

  for (const text of engageCases) {
    it(`detects ENGAGE intent: ${JSON.stringify(text)}`, () => {
      assert.equal(detectInteractiveModeIntent(text), "engage");
    });
  }

  const neutralCases = [
    "please write a function",
    "What's the weather?",
    "continue",
    "ok",
    "thanks",
    "build the project",
  ];

  for (const text of neutralCases) {
    it(`returns null for neutral: ${JSON.stringify(text)}`, () => {
      assert.equal(detectInteractiveModeIntent(text), null);
    });
  }
});
