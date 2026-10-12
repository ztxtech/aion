import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { importBundle } from "../helpers/load-bundle.mjs";

const bundle = await importBundle();

describe("bounded V2 agent dispatch", () => {
  const root = mkdtempSync(join(tmpdir(), "aion-agent-dispatch-"));
  let plugin;

  before(async () => {
    plugin = await bundle.default.server({ directory: root }, {});
  });

  after(async () => {
    await plugin.cleanup();
    rmSync(root, { recursive: true, force: true });
  });

  it("registers the two terminal helpers", () => {
    assert.deepEqual(bundle.AION_AGENT_NAMES, [
      "aion",
      "requirements-analyst",
      "information-collector",
      "coder",
      "ts-critic",
      "c-critic",
      "search-scout",
      "experiment-runner",
    ]);
  });

  it("writes compact managed agents for every role", () => {
    const agentsDir = join(root, ".opencode", "agents");
    const files = readdirSync(agentsDir).filter((name) => name.endsWith(".md"));
    assert.deepEqual(files.sort(), [
      "aion.md",
      "c-critic.md",
      "coder.md",
      "experiment-runner.md",
      "information-collector.md",
      "requirements-analyst.md",
      "search-scout.md",
      "ts-critic.md",
    ]);

    for (const file of files) {
      assert.equal(
        statSync(join(agentsDir, file)).size <= 10_000,
        true,
        `${file} exceeds the 10 KB generated-agent budget`,
      );
    }
  });

  it("declares only the permitted parent-to-helper edges", () => {
    const coder = readFileSync(join(root, ".opencode", "agents", "coder.md"), "utf8");
    const collector = readFileSync(join(root, ".opencode", "agents", "information-collector.md"), "utf8");
    assert.match(coder, /only `experiment-runner`/);
    assert.match(collector, /only `search-scout`/);
  });
});
