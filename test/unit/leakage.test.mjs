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

describe("leakage: legitimate user-project data is NOT blocked (regression)", async () => {
  const bundle = await importBundle();
  const tmpRoot = createTmpDir("aion-legit-");
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

  it("allows read of data/train.csv (Kaggle-style training set)", async () => {
    await beforeHook({ tool: "read" }, { args: { filePath: "data/train.csv" } });
  });

  it("allows read of data/test.csv (Kaggle test set, the thing the task is about)", async () => {
    await beforeHook({ tool: "read" }, { args: { filePath: "data/test.csv" } });
  });

  it("allows read of data/sample_submission.csv (template, not leakage)", async () => {
    await beforeHook({ tool: "read" }, { args: { filePath: "data/sample_submission.csv" } });
  });

  it("allows read of data/stores.csv (metadata)", async () => {
    await beforeHook({ tool: "read" }, { args: { filePath: "data/stores.csv" } });
  });

  it("allows read of data/holidays_events.csv (Kaggle public feature)", async () => {
    await beforeHook({ tool: "read" }, { args: { filePath: "data/holidays_events.csv" } });
  });

  it("allows read of data/oil.csv (Kaggle public feature)", async () => {
    await beforeHook({ tool: "read" }, { args: { filePath: "data/oil.csv" } });
  });

  it("allows read of data/transactions.csv (Kaggle public feature)", async () => {
    await beforeHook({ tool: "read" }, { args: { filePath: "data/transactions.csv" } });
  });

  it("allows read of /abs/path/data/train.csv (absolute path variant)", async () => {
    await beforeHook({ tool: "read" }, { args: { filePath: `${tmpRoot}/data/train.csv` } });
  });

  it("allows read of project_root/competition/test.csv when path does not have /test/ segment", async () => {
    await beforeHook({ tool: "read" }, { args: { filePath: "competition/test.csv" } });
  });

  it("allows write of data/output.csv (user's own output, not in /test/ dir)", async () => {
    await beforeHook({ tool: "write" }, { args: { filePath: "data/output.csv", content: "a,b\n1,2" } });
  });

  it("blocks read of /test/ segment when contract lists it as forbiddenRead", async () => {
    // The hook used to hard-block this; the new design delegates to the contract.
    // When the contract says nothing, the path is allowed (the requirements-analyst
    // is responsible for declaring hidden sets in the contract). This test verifies
    // the new contract-driven behavior.
    const bundle = await importBundle();
    const tmp = createTmpDir("aion-contract-block-");
    mkdirSync(join(tmp, ".opencode"), { recursive: true });
    writeFileSync(join(tmp, "package.json"), '{"name":"test","type":"module"}');
    writeFileSync(
      join(tmp, ".opencode", "aion.jsonc"),
      JSON.stringify({
        leakage: {
          dataBoundaries: { forbiddenReads: ["data/test/**", "**/holdout/**"] },
        },
      }),
    );
    const result = await bundle.default.server({
      directory: tmp, client: undefined, project: undefined, $: undefined,
    }, {});
    const hook = result["tool.execute.before"];
    await assert.rejects(
      () => hook({ tool: "read" }, { args: { filePath: "data/test/labels.csv" } }),
      /data-boundary: forbiddenReads/,
    );
    await assert.rejects(
      () => hook({ tool: "read" }, { args: { filePath: "private/holdout/scores.jsonl" } }),
      /data-boundary: forbiddenReads/,
    );
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  });

  it("ALLOWS read of /test/ segment when contract has no forbiddenReads (default)", async () => {
    // Default contract (empty forbiddenReads) is permissive — the agent may read
    // data/test/labels.csv because the requirements-analyst has not declared
    // any hidden sets. This is the regression test for the data/*.csv over-block.
    await beforeHook({ tool: "read" }, { args: { filePath: "data/test/labels.csv" } });
    await beforeHook({ tool: "read" }, { args: { filePath: "private/holdout/scores.jsonl" } });
  });

  it("blocks paths NOT matching an explicit allowedReads allowlist", async () => {
    const bundle = await importBundle();
    const tmp = createTmpDir("aion-contract-allow-");
    mkdirSync(join(tmp, ".opencode"), { recursive: true });
    writeFileSync(join(tmp, "package.json"), '{"name":"test","type":"module"}');
    writeFileSync(
      join(tmp, ".opencode", "aion.jsonc"),
      JSON.stringify({
        leakage: {
          dataBoundaries: { allowedReads: ["data/train/**", "data/test/features/**"] },
        },
      }),
    );
    const result = await bundle.default.server({
      directory: tmp, client: undefined, project: undefined, $: undefined,
    }, {});
    const hook = result["tool.execute.before"];
    // Allowlist match: passes
    await hook({ tool: "read" }, { args: { filePath: "data/train/file1.csv" } });
    await hook({ tool: "read" }, { args: { filePath: "data/test/features/X.parquet" } });
    // Allowlist miss: blocked
    await assert.rejects(
      () => hook({ tool: "read" }, { args: { filePath: "data/extra.csv" } }),
      /data-boundary: allowedReads/,
    );
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  });
});

describe("leakage: enforce.leakageCheck single source of truth (regression)", () => {
  it("hook and explicit tool agree on .env (both block)", async () => {
    const bundle = await importBundle();
    const tmpRoot = createTmpDir("aion-agr-");
    mkdirSync(join(tmpRoot, ".opencode"), { recursive: true });
    writeFileSync(join(tmpRoot, "package.json"), '{"name":"test","type":"module"}');
    const result = await bundle.default.server({
      directory: tmpRoot, client: undefined, project: undefined, $: undefined,
    }, {});
    const beforeHook = result["tool.execute.before"];
    const checkTool = result.tool?.aion_leakage_check;

    // Hook: blocks .env
    await assert.rejects(
      () => beforeHook({ tool: "read" }, { args: { filePath: "config/.env" } }),
      /leakage block/,
    );
    // Tool: should also return safe: false for the same path
    if (checkTool) {
      const out = await checkTool.execute({ file_path: "config/.env" }, {});
      const parsed = JSON.parse(out);
      assert.equal(parsed.safe, false);
    }
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  it("hook and explicit tool agree on data/test.csv (both pass)", async () => {
    const bundle = await importBundle();
    const tmpRoot = createTmpDir("aion-agr-");
    mkdirSync(join(tmpRoot, ".opencode"), { recursive: true });
    writeFileSync(join(tmpRoot, "package.json"), '{"name":"test","type":"module"}');
    const result = await bundle.default.server({
      directory: tmpRoot, client: undefined, project: undefined, $: undefined,
    }, {});
    const beforeHook = result["tool.execute.before"];
    const checkTool = result.tool?.aion_leakage_check;

    // Hook: must NOT block
    await beforeHook({ tool: "read" }, { args: { filePath: "data/test.csv" } });
    // Tool: should also return safe: true
    if (checkTool) {
      const out = await checkTool.execute({ file_path: "data/test.csv" }, {});
      const parsed = JSON.parse(out);
      assert.equal(parsed.safe, true, "explicit tool must return safe: true for data/test.csv");
    }
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
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
