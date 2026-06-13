import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync, readlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const DIST_PLUGIN = join(REPO_ROOT, ".opencode", "plugins", "aion.js");
const AION_PKG = join(REPO_ROOT);

function findOpencodeBinary() {
  const probe = spawnSync("which", ["opencode"], { encoding: "utf8" });
  if (probe.status === 0 && probe.stdout.trim()) {
    return probe.stdout.trim();
  }
  const home = process.env.HOME ?? "";
  for (const candidate of [
    join(home, ".opencode", "bin", "opencode"),
    "/opt/homebrew/bin/opencode",
    "/usr/local/bin/opencode",
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("opencode binary not found");
}

export function createTempTarget(name = "aion-test") {
  const root = mkdtempSync(join(tmpdir(), `${name}-`));
  const repoDir = join(root, "repo");
  mkdirSync(repoDir, { recursive: true });
  mkdirSync(join(repoDir, ".opencode", "plugins"), { recursive: true });
  mkdirSync(join(repoDir, ".opencode", "agents", "aion"), { recursive: true });
  mkdirSync(join(repoDir, ".opencode", "themes"), { recursive: true });

  const pluginTarget = join(repoDir, ".opencode", "plugins", "aion.js");
  const distExists = existsSync(DIST_PLUGIN);
  if (!distExists) {
    throw new Error(`.opencode/plugins/aion.js not found. Run \`npm run build\` first.`);
  }
  symlinkSync(DIST_PLUGIN, pluginTarget);
  return {
    root,
    repoDir,
    pluginPath: pluginTarget,
    aionConfigPath: join(repoDir, ".opencode", "aion.jsonc"),
    opencodeJsonPath: join(repoDir, "opencode.json"),
    cleanup() {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {}
    },
  };
}

export function runAionInit(target, extraArgs = []) {
  const result = spawnSync("node", [join(AION_PKG, "bin", "aion-init.js"), "init", target.repoDir, ...extraArgs], {
    encoding: "utf8",
    cwd: AION_PKG,
    env: { ...process.env, AION_TEST: "1" },
  });
  return result;
}

export function runOpencodeRun(target, prompt, options = {}) {
  const {
    model = "local-auto/glm-5.1",
    agent = "aion",
    timeoutMs = 120_000,
    dangerouslySkipPermissions = false,
    format = "json",
    extraEnv = {},
  } = options;

  const args = [
    "run",
    "--format", format,
    "--model", model,
    "--agent", agent,
    "--dir", target.repoDir,
    "--port", "0",
  ];
  if (dangerouslySkipPermissions) {
    args.push("--dangerously-skip-permissions");
  }
  args.push(prompt);

  const opencodeBin = findOpencodeBinary();
  return spawnSync(opencodeBin, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    cwd: target.repoDir,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
}

export function parseNdjsonEvents(stdout) {
  const events = [];
  if (!stdout) return events;
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith("{")) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {}
  }
  return events;
}

export function summarizeEvents(events) {
  const summary = {
    tool_uses: [],
    texts: [],
    step_starts: 0,
    step_finishes: 0,
    errors: [],
    phases: new Set(),
  };
  for (const e of events) {
    if (e.type === "tool_use" && e.part) {
      summary.tool_uses.push({
        tool: e.part.tool,
        status: e.part.state?.status,
        input: e.part.state?.input,
        output: e.part.state?.output,
        error: e.part.state?.error,
        metadata: e.part.state?.metadata,
      });
    } else if (e.type === "text" && e.part) {
      summary.texts.push(e.part.text);
    } else if (e.type === "step_start") {
      summary.step_starts += 1;
    } else if (e.type === "step_finish") {
      summary.step_finishes += 1;
    } else if (e.type === "error") {
      summary.errors.push(e.error);
    }
  }
  summary.phases = Array.from(summary.phases);
  return summary;
}
