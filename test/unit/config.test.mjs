import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

let _counter = 0;
function createTmp(prefix = "aion-cfg-") {
  const d = mkdtempSync(join(tmpdir(), `${prefix}${_counter++}-`));
  mkdirSync(join(d, ".opencode"), { recursive: true });
  writeFileSync(join(d, "package.json"), '{"name":"test","type":"module"}');
  return d;
}

describe("config: default config when no aion.jsonc", async () => {
  const bundle = await importBundle();
  const tmp = createTmp();
  let result;

  before(async () => {
    result = await bundle.default.server({
      directory: tmp,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});
  });

  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("loads with default teamMode enabled", () => {
    assert.ok(result.tool?.team_create, "default config should enable team mode");
  });

  it("loads with default governance enabled", () => {
    assert.ok(result["tool.execute.before"], "governance hooks should be active");
  });

  it("creates trace file at default path", () => {
    assert.ok(existsSync(join(tmp, ".opencode", "trace.md")));
  });

  it("creates snapshot at default path", () => {
    assert.ok(existsSync(join(tmp, ".opencode", "memory", "context-snapshot.md")));
  });
});

describe("config: aion.jsonc overrides", async () => {
  const bundle = await importBundle();

  it("disables team mode when configured", async () => {
    const tmp = createTmp();
    writeFileSync(join(tmp, ".opencode", "aion.jsonc"), JSON.stringify({
      teamMode: { enabled: false },
    }));

    const result = await bundle.default.server({
      directory: tmp,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});

    assert.ok(!result.tool?.team_create, "team tools should not be registered");
    assert.ok(result.tool?.aion_safety_gate, "non-team tools should still exist");
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  });

  it("custom trace path is used", async () => {
    const tmp = createTmp();
    writeFileSync(join(tmp, ".opencode", "aion.jsonc"), JSON.stringify({
      trace: { enabled: true, path: ".opencode/custom-trace.md" },
    }));

    await bundle.default.server({
      directory: tmp,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});

    assert.ok(existsSync(join(tmp, ".opencode", "custom-trace.md")));
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  });

  it("disables auto-continue when configured", async () => {
    const tmp = createTmp();
    writeFileSync(join(tmp, ".opencode", "aion.jsonc"), JSON.stringify({
      autoContinue: { enabled: false, maxRounds: 0, delaySeconds: 0 },
    }));

    const result = await bundle.default.server({
      directory: tmp,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});

    assert.ok(result, "plugin should load");
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  });

  it("falls back to defaults on invalid JSON", async () => {
    const tmp = createTmp();
    writeFileSync(join(tmp, ".opencode", "aion.jsonc"), "this is not valid json {{{");

    const result = await bundle.default.server({
      directory: tmp,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});

    assert.ok(result.tool?.team_create, "should fall back to defaults");
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  });

  it("falls back to defaults on schema-invalid config", async () => {
    const tmp = createTmp();
    writeFileSync(join(tmp, ".opencode", "aion.jsonc"), JSON.stringify({
      teamMode: { enabled: "not-a-boolean" },
    }));

    const result = await bundle.default.server({
      directory: tmp,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});

    assert.ok(result, "plugin should still load with defaults");
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  });
});

describe("config: model override", async () => {
  const bundle = await importBundle();

  it("model from aion.jsonc is used in config hook", async () => {
    const tmp = createTmp();
    writeFileSync(join(tmp, ".opencode", "aion.jsonc"), JSON.stringify({
      model: "local-auto/minimax",
      defaultAgent: "aion",
    }));

    const result = await bundle.default.server({
      directory: tmp,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});

    const configInput = {};
    await result.config(configInput);
    assert.equal(configInput.model, "local-auto/minimax");
    assert.equal(configInput.default_agent, "aion");
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  });
});
