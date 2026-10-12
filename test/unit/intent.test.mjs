import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

let _counter = 0;
function createTmp(prefix = "aion-") {
  const d = mkdtempSync(join(tmpdir(), `${prefix}${_counter++}-`));
  mkdirSync(join(d, ".opencode"), { recursive: true });
  writeFileSync(join(d, "package.json"), '{"name":"test","type":"module"}');
  return d;
}

describe("intent: chat.message hook saves initial prompt", async () => {
  const bundle = await importBundle();
  const tmp = createTmp("aion-intent-");
  let loadResult;

  before(async () => {
    loadResult = await bundle.default.server({
      directory: tmp,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});
  });

  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("chat.message hook is a function", () => {
    assert.equal(typeof loadResult["chat.message"], "function");
  });

  it("chat.params hook is a function", () => {
    assert.equal(typeof loadResult["chat.params"], "function");
  });

  it("system.transform hook is a function", () => {
    assert.equal(typeof loadResult["experimental.chat.system.transform"], "function");
  });

  it("messages.transform hook is registered", () => {
    assert.ok(loadResult["experimental.chat.messages.transform"], "messages.transform should be registered");
  });

  it("permission.ask hook is a function", () => {
    assert.equal(typeof loadResult["permission.ask"], "function");
  });

  it("tool.definition hook is a function", () => {
    assert.equal(typeof loadResult["tool.definition"], "function");
  });

  it("event hook is a function", () => {
    assert.equal(typeof loadResult["event"], "function");
  });

  it("compaction hook is a function", () => {
    assert.equal(typeof loadResult["experimental.session.compacting"], "function");
  });

  it("auto-continue hook is a function", () => {
    assert.equal(typeof loadResult["experimental.compaction.autocontinue"], "function");
  });
});

describe("intent: detectInteractiveModeIntent patterns", async () => {
  const bundle = await importBundle();
  const chatMessageTesting = await bundle._testing.chatMessage();
  const { detectInteractiveModeIntent } = chatMessageTesting;

  it("detects leave intent from mixed phrasings", () => {
    assert.equal(detectInteractiveModeIntent("I'm leaving"), "leave");
    assert.equal(detectInteractiveModeIntent("gotta go"), "leave");
    assert.equal(detectInteractiveModeIntent("full auto"), "leave");
    assert.equal(detectInteractiveModeIntent("disable interactive"), "leave");
  });

  it("detects engage intent from mixed phrasings", () => {
    assert.equal(detectInteractiveModeIntent("I'm back"), "engage");
    assert.equal(detectInteractiveModeIntent("enable interactive"), "engage");
    assert.equal(detectInteractiveModeIntent("ask me"), "engage");
    assert.equal(detectInteractiveModeIntent("check in with me"), "engage");
  });

  it("returns null for neutral text", () => {
    assert.equal(detectInteractiveModeIntent("continue"), null);
    assert.equal(detectInteractiveModeIntent("ok"), null);
    assert.equal(detectInteractiveModeIntent("please write code"), null);
  });
});
