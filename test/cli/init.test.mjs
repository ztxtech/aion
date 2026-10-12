import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempTarget, runAionInit } from "../helpers/temp-target.mjs";

describe("aion-ts init CLI", () => {
  let target;

  before(() => {
    target = createTempTarget("aion-init");
  });

  after(() => {
    target?.cleanup();
  });

  it("writes plugin into .opencode/plugins/", () => {
    const result = runAionInit(target, ["--force"]);
    assert.equal(result.status, 0, `init failed: ${result.stderr}\n${result.stdout}`);
    assert.ok(existsSync(target.pluginDir), "plugin directory symlink should exist");
    assert.ok(existsSync(join(target.pluginDir, "server.js")), "server bundle should exist");
    assert.ok(existsSync(join(target.pluginDir, "tui.js")), "TUI bundle should exist");
    const stat = readFileSync(join(target.pluginDir, "server.js"), "utf8");
    assert.ok(stat.length > 1000, "plugin should have content (symlink resolved)");
  });

  it("creates aion.jsonc with all default-on settings", () => {
    assert.ok(existsSync(target.aionConfigPath), "aion.jsonc should exist");
    const content = readFileSync(target.aionConfigPath, "utf8");
    assert.match(content, /"governance"\s*:/);
    assert.match(content, /"leakage"\s*:/);
    assert.match(content, /"autoContinue"\s*:/);
    assert.match(content, /"compaction"\s*:/);
    assert.match(content, /"interactiveMode"\s*:/);
    assert.match(content, /"trace"\s*:/);
  });

  it("moves the aion theme into V2 TUI config", () => {
    assert.ok(existsSync(target.opencodeJsonPath), "opencode.json should exist");
    const config = JSON.parse(readFileSync(target.opencodeJsonPath, "utf8"));
    assert.equal(config.theme, undefined);

    assert.ok(existsSync(target.tuiJsonPath), "tui.json should exist");
    const tui = JSON.parse(readFileSync(target.tuiJsonPath, "utf8"));
    assert.deepEqual(tui.theme, { name: "aion" });
    assert.equal(tui.$schema, "https://opencode.ai/tui.json");
  });

  it("enables bounded nested subagents", () => {
    const config = JSON.parse(readFileSync(target.opencodeJsonPath, "utf8"));
    assert.equal(config.experimental?.subagent_depth, 2);
    assert.deepEqual(config.plugins, [
      {
        package: "@prevalentware/opencode-goal-plugin",
        options: {
          auto_continue: true,
          max_auto_turns: 50,
        },
      },
    ]);
  });

  it("preserves existing goal plugin settings", () => {
    const existing = createTempTarget("aion-init-goal");
    try {
      writeFileSync(
        existing.opencodeJsonPath,
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          plugins: [
            {
              package: "@prevalentware/opencode-goal-plugin",
              options: { auto_continue: false, max_auto_turns: 10 },
            },
          ],
        }),
      );
      const result = runAionInit(existing, ["--force"]);
      assert.equal(result.status, 0, `init failed: ${result.stderr}\n${result.stdout}`);
      const config = JSON.parse(readFileSync(existing.opencodeJsonPath, "utf8"));
      assert.deepEqual(config.plugins, [
        {
          package: "@prevalentware/opencode-goal-plugin",
          options: { auto_continue: false, max_auto_turns: 10 },
        },
      ]);
    } finally {
      existing.cleanup();
    }
  });

  it("migrates a legacy string theme in tui.json", () => {
    writeFileSync(
      target.tuiJsonPath,
      JSON.stringify({ $schema: "https://opencode.ai/tui.json", theme: "aion" }),
    );
    const result = runAionInit(target, ["--force"]);
    assert.equal(result.status, 0, `init failed: ${result.stderr}\n${result.stdout}`);
    const tui = JSON.parse(readFileSync(target.tuiJsonPath, "utf8"));
    assert.deepEqual(tui.theme, { name: "aion" });
  });

  it("preserves a user-selected non-AION theme", () => {
    const other = createTempTarget("aion-init-theme");
    try {
      writeFileSync(
        other.tuiJsonPath,
        JSON.stringify({ $schema: "https://opencode.ai/tui.json", theme: "opencode" }),
      );
      const result = runAionInit(other, ["--force"]);
      assert.equal(result.status, 0, `init failed: ${result.stderr}\n${result.stdout}`);
      const tui = JSON.parse(readFileSync(other.tuiJsonPath, "utf8"));
      assert.deepEqual(tui.theme, { name: "opencode" });
    } finally {
      other.cleanup();
    }
  });

  it("accepts JSONC comments and trailing commas", () => {
    writeFileSync(
      target.opencodeJsonPath,
      `{
  // comment
  "$schema": "https://opencode.ai/config.json",
}
`,
    );
    const result = runAionInit(target, ["--force"]);
    assert.equal(result.status, 0, `init failed: ${result.stderr}\n${result.stdout}`);
    assert.doesNotMatch(result.stdout, /not valid JSON/);
  });

  it("creates .opencode/agents/ scaffold (aion subdir)", () => {
    const aionAgentDir = `${target.repoDir}/.opencode/agents/aion`;
    assert.ok(existsSync(aionAgentDir), "aion agent dir should exist");
  });

  it("creates aion theme file", () => {
    const themePath = `${target.repoDir}/.opencode/themes/aion.json`;
    assert.ok(existsSync(themePath), "aion theme should exist");
    const theme = JSON.parse(readFileSync(themePath, "utf8"));
    assert.ok(theme.defs || theme.colors, "theme should have defs or colors");
  });

  it("installs the 17 AION skills into .opencode/skills/", () => {
    const skillsDir = `${target.repoDir}/.opencode/skills`;
    assert.ok(existsSync(skillsDir), "skills dir should be created");
    // Read the names and assert the high-value ones the LLM is told to use
    // (brain-storm, time-series, critic-loop) are present. Other skills
    // may be added/removed over time so we don't assert a fixed count.
    const names = readdirSync(skillsDir);
    for (const required of ["brain-storm", "time-series", "critic-loop", "plan"]) {
      assert.ok(
        names.includes(required),
        `skill "${required}" should be installed under ${skillsDir}`,
      );
    }
  });
});
