import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBundle } from "../helpers/load-bundle.mjs";

let _counter = 0;
function createTmp(prefix = "aion-ztxexp-") {
  const d = mkdtempSync(join(tmpdir(), `${prefix}${_counter++}-`));
  mkdirSync(join(d, ".opencode"), { recursive: true });
  writeFileSync(join(d, "package.json"), '{"name":"test","type":"module"}');
  return d;
}

function createPlugin(tmp) {
  const bundle = importBundle();
  return bundle.then(b => b.default.server({
    directory: tmp,
    client: undefined,
    project: undefined,
    $: undefined,
  }, {}));
}

describe("ztxexp: aion_ztxexp_init execute", async () => {
  const tmp = createTmp();
  let result;

  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("creates experiment directory with used_dirs", async () => {
    const output = await result.tool.aion_ztxexp_init.execute({
      experiment_id: "lstm-v1",
      root: ".",
      used_dirs: ["data", "exp", "model", "outputs"],
    }, {});
    const parsed = JSON.parse(output);
    assert.equal(parsed.status, "initialized");
    assert.equal(parsed.experiment_id, "lstm-v1");
    assert.ok(parsed.created_dirs.includes("data"));
    assert.ok(parsed.created_dirs.includes("exp"));
    assert.ok(parsed.created_dirs.includes("model"));
    assert.ok(parsed.created_dirs.includes("outputs"));
    assert.ok(!parsed.created_dirs.includes("evaluation"));

    const expDir = join(tmp, "exp", "lstm-v1");
    assert.ok(existsSync(join(expDir, "data")));
    assert.ok(existsSync(join(expDir, "exp")));
    assert.ok(existsSync(join(expDir, "model")));
    assert.ok(existsSync(join(expDir, "outputs")));
    assert.ok(!existsSync(join(expDir, "evaluation")));
    assert.ok(!existsSync(join(expDir, "scripts")));
  });

  it("creates manifest.json", async () => {
    const output = await result.tool.aion_ztxexp_init.execute({
      experiment_id: "test-manifest",
      root: ".",
      used_dirs: ["exp", "outputs"],
      notes: "test notes",
    }, {});
    JSON.parse(output);

    const manifestPath = join(tmp, "exp", "test-manifest", ".ztxexp-manifest.json");
    assert.ok(existsSync(manifestPath));
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    assert.equal(manifest.experiment_id, "test-manifest");
    assert.ok(manifest.used_dirs.includes("exp"));
    assert.ok(manifest.used_dirs.includes("outputs"));
    assert.equal(manifest.notes, "test notes");
  });

  it("creates main.py and README.md", async () => {
    const output = await result.tool.aion_ztxexp_init.execute({
      experiment_id: "files-test",
      root: ".",
      used_dirs: ["exp", "outputs"],
    }, {});
    JSON.parse(output);

    const expDir = join(tmp, "exp", "files-test");
    assert.ok(existsSync(join(expDir, "main.py")));
    assert.ok(existsSync(join(expDir, "README.md")));
    const mainPy = readFileSync(join(expDir, "main.py"), "utf-8");
    assert.ok(mainPy.includes("files-test"));
    const readme = readFileSync(join(expDir, "README.md"), "utf-8");
    assert.ok(readme.includes("ztxexp HARD boundaries"));
  });

  it("always creates exp and outputs even if not specified", async () => {
    const output = await result.tool.aion_ztxexp_init.execute({
      experiment_id: "minimal",
      root: ".",
      used_dirs: ["model"],
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(parsed.created_dirs.includes("exp"));
    assert.ok(parsed.created_dirs.includes("outputs"));
  });

  it("rejects absolute root path", async () => {
    const output = await result.tool.aion_ztxexp_init.execute({
      experiment_id: "bad-path",
      root: "/absolute/path",
      used_dirs: ["exp"],
    }, {});
    const parsed = JSON.parse(output);
    assert.equal(parsed.status, "error");
    assert.ok(parsed.message.includes("RELATIVE"));
  });
});

describe("ztxexp: aion_ztxexp_validate execute", async () => {
  const tmp = createTmp();
  let result;

  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("returns error for nonexistent experiment", async () => {
    const output = await result.tool.aion_ztxexp_validate.execute({
      experiment_id: "nonexistent",
      root: ".",
    }, {});
    const parsed = JSON.parse(output);
    assert.equal(parsed.status, "error");
  });

  it("returns clean for valid experiment", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "clean-exp",
      root: ".",
      used_dirs: ["exp", "outputs"],
    }, {});

    writeFileSync(join(tmp, "exp", "clean-exp", "outputs", "metrics.json"), '{"rmse": 0.3}');
    writeFileSync(join(tmp, "exp", "clean-exp", "exp", "config.json"), '{}');

    const output = await result.tool.aion_ztxexp_validate.execute({
      experiment_id: "clean-exp",
      root: ".",
    }, {});
    const parsed = JSON.parse(output);
    assert.equal(parsed.is_clean, true, `expected clean, got violations=${parsed.violations} empty=${parsed.empty_dirs} missing=${parsed.missing_but_needed}`);
  });

  it("detects boundary violations", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "dirty-exp",
      root: ".",
      used_dirs: ["exp", "outputs"],
    }, {});

    writeFileSync(join(tmp, "exp", "dirty-exp", "rogue_file.py"), 'print("outside boundary")');

    const output = await result.tool.aion_ztxexp_validate.execute({
      experiment_id: "dirty-exp",
      root: ".",
    }, {});
    const parsed = JSON.parse(output);
    assert.equal(parsed.is_clean, false);
    assert.ok(parsed.violations);
    assert.ok(parsed.violations.some(v => v.includes("rogue_file.py")));
  });

  it("detects empty dirs", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "empty-dir-exp",
      root: ".",
      used_dirs: ["data", "exp", "outputs", "model"],
    }, {});

    const output = await result.tool.aion_ztxexp_validate.execute({
      experiment_id: "empty-dir-exp",
      root: ".",
    }, {});
    const parsed = JSON.parse(output);
    assert.ok(parsed.empty_dirs);
    assert.ok(parsed.empty_dirs.includes("data"));
    assert.ok(parsed.empty_dirs.includes("model"));
  });

  it("rejects absolute root path", async () => {
    const output = await result.tool.aion_ztxexp_validate.execute({
      experiment_id: "any",
      root: "/absolute",
    }, {});
    const parsed = JSON.parse(output);
    assert.equal(parsed.status, "error");
  });
});

describe("ztxexp: aion_ztxexp_run execute", async () => {
  const tmp = createTmp();
  let result;

  before(async () => { result = await createPlugin(tmp); });
  after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it("returns error for nonexistent experiment", async () => {
    const output = await result.tool.aion_ztxexp_run.execute({
      experiment_id: "nonexistent",
      config_path: "config.json",
      command: "echo hello",
      timeout_ms: 5000,
    }, { directory: tmp });
    const parsed = JSON.parse(output);
    assert.equal(parsed.status, "failed");
    assert.ok(parsed.error.includes("not found"));
  });

  it("returns error for missing manifest", async () => {
    mkdirSync(join(tmp, "exp", "no-manifest"), { recursive: true });

    const output = await result.tool.aion_ztxexp_run.execute({
      experiment_id: "no-manifest",
      config_path: "config.json",
      command: "echo hello",
      timeout_ms: 5000,
    }, { directory: tmp });
    const parsed = JSON.parse(output);
    assert.equal(parsed.status, "failed");
    assert.ok(parsed.error.includes("manifest"));
  });

  it("runs a simple command and records results", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "run-test",
      root: ".",
      used_dirs: ["exp", "outputs"],
    }, {});

    const output = await result.tool.aion_ztxexp_run.execute({
      experiment_id: "run-test",
      config_path: "config.json",
      command: "echo success",
      timeout_ms: 5000,
    }, { directory: tmp });
    const parsed = JSON.parse(output);
    assert.equal(parsed.status, "succeeded");
    assert.equal(parsed.exit_code, 0);
    assert.ok(parsed.stdout_tail.includes("success"));
    assert.ok(parsed.post_experiment.shap_required);

    const runJson = JSON.parse(readFileSync(join(tmp, "exp", "run-test", "outputs", "run.json"), "utf-8"));
    assert.equal(runJson.status, "succeeded");
    assert.equal(runJson.exit_code, 0);
  });

  it("records failure on nonzero exit", async () => {
    await result.tool.aion_ztxexp_init.execute({
      experiment_id: "fail-test",
      root: ".",
      used_dirs: ["exp", "outputs"],
    }, {});

    const output = await result.tool.aion_ztxexp_run.execute({
      experiment_id: "fail-test",
      config_path: "config.json",
      command: "exit 1",
      timeout_ms: 5000,
    }, { directory: tmp });
    const parsed = JSON.parse(output);
    assert.equal(parsed.status, "failed");
    assert.equal(parsed.exit_code, 1);
  });
});
