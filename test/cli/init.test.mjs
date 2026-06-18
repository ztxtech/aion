import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
    assert.ok(existsSync(target.pluginPath), "plugin symlink should exist");
    const stat = readFileSync(target.pluginPath, "utf8");
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

  it("creates opencode.json with aion theme", () => {
    assert.ok(existsSync(target.opencodeJsonPath), "opencode.json should exist");
    const content = readFileSync(target.opencodeJsonPath, "utf8");
    assert.match(content, /"theme"\s*:\s*"aion"/);
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
});
