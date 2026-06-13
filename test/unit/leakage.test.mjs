import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

function createTmpDir(prefix = "aion-leak-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("leakage: plugin registers tools and hooks", async () => {
  const bundle = await importBundle();
  const tmpRoot = createTmpDir();
  let loadResult;

  before(async () => {
    mkdirSync(join(tmpRoot, ".opencode"), { recursive: true });
    writeFileSync(join(tmpRoot, "package.json"), '{"name":"test","type":"module"}');
    loadResult = await bundle.default.server({
      directory: tmpRoot,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});
  });

  after(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  it("registers aion_leakage_check tool", () => {
    assert.ok(loadResult.tool?.aion_leakage_check, "aion_leakage_check tool should exist");
  });

  it("registers tool.execute.before hook", () => {
    assert.equal(typeof loadResult["tool.execute.before"], "function");
  });
});

describe("leakage: tool guard before hook", async () => {
  const bundle = await importBundle();
  const tmpRoot = createTmpDir("aion-guard-");
  let beforeHook;

  before(async () => {
    mkdirSync(join(tmpRoot, ".opencode"), { recursive: true });
    writeFileSync(join(tmpRoot, "package.json"), '{"name":"test","type":"module"}');
    const result = await bundle.default.server({
      directory: tmpRoot,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});
    beforeHook = result["tool.execute.before"];
  });

  after(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  it("blocks write to .env (relative path with / prefix)", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "write" }, { args: { filePath: "config/.env", content: "SECRET=abc" } }),
      /leakage block|restricted pattern/,
    );
  });

  it("blocks write to .env.production", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "write" }, { args: { filePath: "project/.env.production", content: "KEY=val" } }),
      /leakage block|restricted pattern/,
    );
  });

  it("blocks write to .pem file", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "write" }, { args: { filePath: "cert.pem", content: "cert data" } }),
      /leakage block|restricted pattern/,
    );
  });

  it("blocks write to .key file", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "write" }, { args: { filePath: "id_rsa.key", content: "key data" } }),
      /leakage block|restricted pattern/,
    );
  });

  it("blocks write to secrets/ dir (with leading path)", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "write" }, { args: { filePath: "config/secrets/db-password.txt", content: "pass" } }),
      /leakage block|restricted pattern/,
    );
  });

  it("blocks write with AWS key pattern in content", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "write" }, { args: { filePath: "src/config.ts", content: "key=AKIAIOSFODNN7EXAMPLE12345678" } }),
      /leakage block|restricted pattern/,
    );
  });

  it("blocks write with private key pattern in content", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "write" }, { args: { filePath: "src/config.ts", content: "-----BEGIN RSA PRIVATE KEY-----\nblah" } }),
      /leakage block|restricted pattern/,
    );
  });

  it("blocks bash with cat .env", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "bash" }, { args: { command: "cat .env" } }),
      /leakage block|restricted token/,
    );
  });

  it("blocks bash with rm -rf", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "bash" }, { args: { command: "rm -rf /" } }),
      /leakage block|restricted token/,
    );
  });

  it("blocks git push", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "bash" }, { args: { command: "git push origin main" } }),
      /hard block/,
    );
  });

  it("blocks git remote add", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "bash" }, { args: { command: "git remote add origin https://example.com" } }),
      /hard block/,
    );
  });

  it("blocks write outside project root", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "write" }, { args: { filePath: "/etc/passwd", content: "hacked" } }),
      /outside the project root|hard block/,
    );
  });

  it("allows normal write to src files", async () => {
    await beforeHook({ tool: "write" }, { args: { filePath: "src/index.ts", content: "console.log('hello')" } });
  });

  it("allows normal bash commands", async () => {
    await beforeHook({ tool: "bash" }, { args: { command: "ls -la" } });
  });

  it("allows write to .opencode/memory files", async () => {
    await beforeHook({ tool: "write" }, { args: { filePath: ".opencode/memory/progress.md", content: "# Progress\nDone" } });
  });

  it("allows bash with npm run build", async () => {
    await beforeHook({ tool: "bash" }, { args: { command: "npm run build" } });
  });

  it("allows write to .opencode/trace.md", async () => {
    await beforeHook({ tool: "write" }, { args: { filePath: ".opencode/trace.md", content: "trace entry" } });
  });
});

describe("leakage: test data files are blocked via path patterns", async () => {
  const bundle = await importBundle();
  const tmpRoot = createTmpDir("aion-testdata-");
  let beforeHook;

  before(async () => {
    mkdirSync(join(tmpRoot, ".opencode"), { recursive: true });
    writeFileSync(join(tmpRoot, "package.json"), '{"name":"test","type":"module"}');
    const result = await bundle.default.server({
      directory: tmpRoot,
      client: undefined,
      project: undefined,
      $: undefined,
    }, {});
    beforeHook = result["tool.execute.before"];
  });

  after(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  it("blocks write to test/ CSV", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "write" }, { args: { filePath: "data/test/samples.csv", content: "a,b" } }),
      /leakage block|restricted pattern/,
    );
  });

  it("blocks write to val/ parquet", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "write" }, { args: { filePath: "data/val/metrics.parquet", content: "data" } }),
      /leakage block|restricted pattern/,
    );
  });

  it("blocks write to hidden/ JSONL", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "write" }, { args: { filePath: "data/hidden/results.jsonl", content: "{}" } }),
      /leakage block|restricted pattern/,
    );
  });

  it("blocks write to holdout/ TSV", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "write" }, { args: { filePath: "data/holdout/scores.tsv", content: "a\tb" } }),
      /leakage block|restricted pattern/,
    );
  });

  it("blocks write to private/ CSV", async () => {
    await assert.rejects(
      () => beforeHook({ tool: "write" }, { args: { filePath: "data/private/experiment.csv", content: "data" } }),
      /leakage block|restricted pattern/,
    );
  });
});

describe("leakage: safety tools whitelist", async () => {
  const bundle = await importBundle();
  const tg = await bundle._testing.toolGuard();
  const { AION_SAFETY_TOOLS } = tg;

  it("core tools are in safety set", () => {
    const core = [
      "aion_safety_gate",
      "aion_workspace_init",
      "aion_compaction",
      "aion_pre_stop_gate",
      "aion_memory_sync",
    ];
    for (const t of core) {
      assert.ok(AION_SAFETY_TOOLS.has(t), `${t} should be in AION_SAFETY_TOOLS`);
    }
  });

  it("governance tools are in safety set", () => {
    const gov = [
      "aion_critic_dispatch",
      "aion_critic_verdict",
      "aion_record_blocker",
      "aion_resolve_blocker",
    ];
    for (const t of gov) {
      assert.ok(AION_SAFETY_TOOLS.has(t), `${t} should be in AION_SAFETY_TOOLS`);
    }
  });

  it("non-safety tools are NOT in the set", () => {
    assert.ok(!AION_SAFETY_TOOLS.has("team_create"));
    assert.ok(!AION_SAFETY_TOOLS.has("aion_todo_update_get"));
    assert.ok(!AION_SAFETY_TOOLS.has("aion_user_check_unknown"));
  });
});
