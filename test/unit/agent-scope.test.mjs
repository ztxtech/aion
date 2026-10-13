import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

let counter = 0;

async function createPlugin(sessionAgents = {}) {
  const root = mkdtempSync(join(tmpdir(), `aion-scope-${counter++}-`));
  const bundle = await importBundle();
  const result = await bundle.default.server({
    directory: root,
    client: undefined,
    project: undefined,
    $: undefined,
    sessionAgents,
  }, {});
  return { root, result };
}

async function runContextHooks(result, event) {
  for (const hook of result.sessionHooks.context ?? []) {
    await hook(event);
  }
}

describe("AION agent scoping", () => {
  it("keeps Build and Plan context native", async () => {
    const { root, result } = await createPlugin();
    try {
      for (const agent of ["build", "plan"]) {
        const event = {
          sessionID: `${agent}-session`,
          agent,
          model: { id: "test-model" },
          options: {},
          system: [{ type: "text", text: "NATIVE SYSTEM" }],
          tools: {
            read: { description: "read", input: {} },
            aion_workspace_init: { description: "aion", input: {} },
            aion_set_language: { description: "aion", input: {} },
          },
        };

        await runContextHooks(result, event);

        assert.deepEqual(event.system, [{ type: "text", text: "NATIVE SYSTEM" }]);
        assert.deepEqual(Object.keys(event.tools), ["read"]);
        assert.deepEqual(event.options, {});
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps AION context, tools, and subagents enabled", async () => {
    const { root, result } = await createPlugin();
    try {
      for (const agent of ["aion", "coder", "ts-critic"]) {
        const event = {
          sessionID: `${agent}-session`,
          agent,
          model: { id: "test-model" },
          options: {},
          system: [{ type: "text", text: "NATIVE SYSTEM" }],
          tools: {
            read: { description: "read", input: {} },
            aion_workspace_init: { description: "aion", input: {} },
          },
        };

        await runContextHooks(result, event);

        assert.match(event.system.map((part) => part.text).join("\n"), /\[AION\]|AION ENVIRONMENT|AION CORE PROTOCOL/);
        assert.ok(event.tools.aion_workspace_init);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not run AION tool guards or permissions for native agents", async () => {
    const { root, result } = await createPlugin();
    try {
      const buildEvent = {
        tool: "bash",
        sessionID: "build-session",
        id: "call-build",
        agent: "build",
        input: { command: "git push origin main" },
      };
      await result.toolHooks["execute.before"](buildEvent);

      const buildPermission = {
        sessionID: "build-session",
        agent: "build",
        action: "shell",
        resources: ["git push origin main"],
        effect: "ask",
      };
      await result["permission.ask"](buildPermission);
      assert.equal(buildPermission.effect, "ask");

      const aionPermission = {
        sessionID: "aion-session",
        agent: "aion",
        action: "shell",
        resources: ["ls"],
        effect: "ask",
      };
      await result["permission.ask"](aionPermission);
      assert.equal(aionPermission.effect, "allow");

      await assert.rejects(
        () => result.toolHooks["execute.before"]({
          tool: "bash",
          sessionID: "aion-session",
          id: "call-aion",
          agent: "aion",
          input: { command: "git push origin main" },
        }),
        /hard block/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("records prompts only for AION sessions", async () => {
    const { root, result } = await createPlugin({
      "build-session": "build",
      "aion-session": "aion",
    });
    const promptPath = join(root, ".opencode", "memory", "initial-prompt.md");
    try {
      await result["session.prompt"]({
        sessionID: "build-session",
        messageID: "message-build",
        prompt: { text: "build-only task" },
      });
      assert.equal(existsSync(promptPath), false);

      await result["session.prompt"]({
        sessionID: "aion-session",
        messageID: "message-aion",
        prompt: { text: "aion task" },
      });
      assert.match(readFileSync(promptPath, "utf8"), /aion task/);
      assert.doesNotMatch(readFileSync(promptPath, "utf8"), /build-only task/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
