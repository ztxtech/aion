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
    "我要走了",
    "我得走了",
    "我先走了",
    "I'm leaving",
    "i have to go",
    "gotta go",
    "stepping away",
    "不打扰了",
    "不用再问了",
    "stop asking me",
    "全自动",
    "run fully autonomous",
    "full auto",
    "switch to auto",
    "set to autonomous",
    "disable interactive",
    "不要交互",
    "以后别问",
  ];

  const engageCases = [
    "我在",
    "我回来了",
    "I'm back",
    "I'm here",
    "交互模式",
    "开启交互",
    "switch to interactive",
    "enable interactive",
    "ask me",
    "继续问我",
    "check in with me",
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
    "请帮我写一个函数",
    "What's the weather?",
    "继续",
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
