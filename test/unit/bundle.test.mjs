import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

describe("plugin bundle shape", async () => {
  const bundle = await importBundle();

  it("default export is a PluginModule (object with id + server)", () => {
    assert.equal(typeof bundle.default, "object");
    assert.equal(bundle.default.id, "aion-ts-plugin");
    assert.equal(typeof bundle.default.server, "function", "server should be the plugin function");
  });

  it("AionPlugin named binding is a function", () => {
    assert.equal(typeof bundle.AionPlugin, "function");
  });

  it("exports pluginModule with AION_AGENT_NAMES", () => {
    assert.equal(typeof bundle.pluginModule, "object");
    assert.ok(Array.isArray(bundle.AION_AGENT_NAMES));
    assert.ok(bundle.AION_AGENT_NAMES.length >= 6, "should have at least 6 agent names");
  });

  it("AION_AGENT_NAMES includes all required agents", () => {
    const required = [
      "aion",
      "ts-critic",
      "c-critic",
      "information-collector",
      "requirements-analyst",
      "coder",
    ];
    for (const name of required) {
      assert.ok(
        bundle.AION_AGENT_NAMES.includes(name),
        `AION_AGENT_NAMES should include ${name}, got: ${bundle.AION_AGENT_NAMES.join(",")}`,
      );
    }
  });

  it("_testing exports are callable", () => {
    assert.equal(typeof bundle._testing, "object");
    assert.equal(typeof bundle._testing.chatMessage, "function");
    assert.equal(typeof bundle._testing.toolGuard, "function");
    assert.equal(typeof bundle._testing.governance, "function");
  });
});

describe("plugin loads without errors (minimal ctx)", async () => {
  const bundle = await importBundle();
  let loadError = null;
  let result = null;

  before(async () => {
    try {
      const root = mkdtempSync(join(tmpdir(), "aion-load-"));
      mkdirSync(join(root, ".opencode"), { recursive: true });
      writeFileSync(join(root, "package.json"), '{"name":"test","type":"module"}');
      const ctx = {
        directory: root,
        client: undefined,
        project: undefined,
        $: undefined,
      };
      result = await bundle.default.server(ctx, {});
    } catch (err) {
      loadError = err;
    }
  });

  it("plugin factory returns hook + tool object", () => {
    if (loadError) {
      assert.fail(`plugin failed to load: ${loadError.message}`);
    }
    assert.ok(result, "plugin result should be defined");
  });

  it("plugin registers hook handlers (flat key shape)", () => {
    if (!result) assert.fail("result not loaded");
    assert.ok(result["chat.message"], "should have chat.message hook");
    assert.ok(result["experimental.compaction.autocontinue"], "should have session.idle wrapped under experimental.compaction.autocontinue");
    assert.ok(result["tool.execute.before"], "should have tool.execute.before hook");
    assert.ok(result["tool.execute.after"], "should have tool.execute.after hook");
    assert.ok(result["permission.ask"], "should have permission.ask hook");
  });

  it("plugin registers aion tool definitions", () => {
    if (!result) assert.fail("result not loaded");
    const toolNames = Object.keys(result.tool ?? {});
    assert.ok(toolNames.length >= 10, `should have >=10 aion tools, got ${toolNames.length}`);
  });

  it("plugin registers aion_critic_dispatch tool", () => {
    if (!result) assert.fail("result not loaded");
    assert.ok(result.tool?.aion_critic_dispatch, "should have aion_critic_dispatch tool");
    assert.ok(result.tool?.aion_critic_verdict, "should have aion_critic_verdict tool");
    assert.ok(result.tool?.aion_todo_update, "should have aion_todo_update tool");
    assert.ok(result.tool?.aion_set_interactive_mode, "should have aion_set_interactive_mode tool");
  });
});
