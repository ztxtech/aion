import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

let counter = 0;

async function createPlugin() {
  const root = mkdtempSync(join(tmpdir(), `aion-system-${counter++}-`));
  const bundle = await importBundle();
  const result = await bundle.default.server({ directory: root }, {});
  return {
    root,
    result,
    async system() {
      const output = { system: [] };
      await result["experimental.chat.system.transform"](
        { sessionID: "system-transform-test", model: {} },
        output,
      );
      return output.system;
    },
  };
}

describe("AION system transform budget", () => {
  it("caches environment discovery and refreshes it when the project changes", async () => {
    const project = await createPlugin();
    try {
      const skills = join(project.root, ".opencode", "skills");
      mkdirSync(skills, { recursive: true });
      writeFileSync(join(skills, "first.md"), "# First");
      utimesSync(skills, new Date(1000), new Date(1000));

      const first = (await project.system()).join("\n");
      assert.match(first, /Skills \(directories\): first/);
      assert.doesNotMatch(first, /\(global\)/);

      writeFileSync(join(skills, "second.md"), "# Second");
      utimesSync(skills, new Date(2000), new Date(2000));
      const second = (await project.system()).join("\n");
      assert.match(second, /Skills \(directories\): first, second/);
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it("caches the todo summary and refreshes it when the todo map changes", async () => {
    const project = await createPlugin();
    try {
      const memory = join(project.root, ".opencode", "memory");
      const todoPath = join(memory, "todo-map.md");
      mkdirSync(memory, { recursive: true });
      writeFileSync(todoPath, "#### TODO-001\nRun the first lightweight smoke check from the test project.\n");
      utimesSync(todoPath, new Date(1000), new Date(1000));

      assert.match((await project.system()).join("\n"), /TODO-001/);

      writeFileSync(todoPath, "#### TODO-002\nRun the updated lightweight smoke check from the test project.\n");
      utimesSync(todoPath, new Date(2000), new Date(2000));
      assert.match((await project.system()).join("\n"), /TODO-002/);
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it("uses a compact static prefix and keeps dynamic state after governance", async () => {
    const project = await createPlugin();
    try {
      const system = await project.system();
      const prompt = system.join("\n");

      assert.match(system[0], /^\[AION\] Time-series multi-agent orchestration/);
      assert.match(prompt, /AION ENVIRONMENT - OpenCode session/);
      assert.match(prompt, /AION CORE PROTOCOL/);
      assert.doesNotMatch(prompt, /AION SHARED CACHE PROTOCOL/);
      assert.doesNotMatch(prompt, /AION ANTI-STOP CONTAMINATION/);
      assert.match(prompt, /AION SCHEDULING\] init -> gather/);
      assert.doesNotMatch(prompt, /stateDiagram-v2/);
      assert.ok(prompt.length < 9_000);
      assert.ok(system.findIndex((item) => item.includes("AION ENVIRONMENT")) < system.findIndex((item) => item.includes("workspace not yet initialized")));
      assert.ok(system.findIndex((item) => item.includes("AION CORE PROTOCOL")) < system.findIndex((item) => item.includes("workspace not yet initialized")));
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });
});
