#!/usr/bin/env node
// AION plugin installer - copies the local bundle and config into a target project directory.
// Usage: aion-ts init [target-dir] [--force]
//   target-dir: optional, defaults to process.cwd()
//   --force:    required to overwrite an existing .opencode/plugins/aion.js

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_AION_CONFIG = `{
  // AION plugin configuration (JSONC: comments + trailing commas allowed).
  // All features are ON by default. Comment out or set to false to disable.

  "enabled": true,
  "model": "local-auto/mimo-v2.5",
  "defaultAgent": "aion",

  "governance": {
    // 治理层级：c-critic > ts-critic > main agent > subagents
    "enforceHierarchy": true,
    "cCriticSupremacy": true
  },

  "leakage": {
    // 防泄露：每个开关控制一类敏感内容
    "blockOnSuspicion": true,
    "blockFutureInfo": true,
    "blockHiddenSetAccess": true,
    "blockPrivateData": true,
    "blockCredentials": true,
    "blockPromptsAccess": true,
    "blockMemoryAccess": true
  },

  "autoContinue": {
    // 任务自动续跑：c-critic 没 approve 之前自动续
    "enabled": true,
    "maxRounds": 30,
    "delaySeconds": 2
  },

  "teamMode": {
    // 团队模式：1 lead + 多个 subagent 并行
    "enabled": true,
    "tmuxVisualization": true,
    "maxParallelMembers": 4,
    "maxMembers": 8,
    "maxMessagesPerRun": 10000,
    "maxWallClockMinutes": 120,
    "maxMemberTurns": 500,
    "messagePayloadMaxBytes": 32768,
    "recipientUnreadMaxBytes": 262144,
    "mailboxPollIntervalMs": 3000
  },

  "trace": {
    // 追踪：每次工具调用都写到 .opencode/trace.md
    "enabled": true,
    "path": ".opencode/trace.md"
  },

  "compaction": {
    // 上下文压缩：超 token 上限时自动整理
    "autoRefreshAtKeyNodes": true,
    "snapshotPath": ".opencode/memory/context-snapshot.md"
  },

  "interactiveMode": {
    // 会话开始时由 LLM 通过 question 工具问用户（不管安装时如何配置）
    // 此处 enabled 仅作 fallback：如果 LLM 没问用户（如配置为 true 但用户说别问），
    // 才使用此值。会话中用户可随时说"我要走了"切换为完全自动。
    "enabled": false
  }
}
`;

function parseArgs(argv) {
  const args = { target: process.cwd(), force: false, command: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force" || a === "-f") args.force = true;
    else if (a === "--help" || a === "-h") args.command = "help";
    else if (a.startsWith("-")) {
      throw new Error(`Unknown flag: ${a}`);
    } else {
      args.target = resolve(a);
    }
  }
  return args;
}

function printHelp() {
  console.log(`aion-ts - AION plugin installer

Usage:
  aion-ts init [target-dir] [--force]
  aion-ts --help

Arguments:
  target-dir    Optional. Directory to install into. Defaults to current working
                directory. The directory will be created if it does not exist.

Flags:
  --force, -f   Required to overwrite an existing
                <target>/.opencode/plugins/aion.js. Without this flag the
                installer aborts when the plugin file is already present.
  --help, -h    Show this help.

Behavior:
  1. Creates <target>/.opencode/plugins/ and copies the plugin bundle there.
     OpenCode auto-discovers plugins in this directory at startup, so the
     "plugin" field in opencode.json is intentionally not touched.
  2. If <target>/opencode.json exists, leaves it alone (or migrates away
     from a previous wrong "plugin": ["aion-ts-plugin"] entry). Otherwise
     creates a minimal starter file with $schema/theme/model.
  3. Copies a commented default config to <target>/.opencode/aion.jsonc.
     The bundle is fully self-contained — no external npm dependencies
     are needed.

This installer only touches files inside <target-dir>. It does not modify any
global OpenCode configuration.
`);
}

function findBundlePath() {
  const candidates = [
    join(__dirname, "..", ".opencode", "plugins", "aion.js"),
    join(__dirname, "..", "dist", "index.js"),
    join(__dirname, "..", "dist", "aion.js"),
  ];
  for (const p of candidates) {
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function readJsonc(path) {
  // Strip // and /* */ comments before parsing. Sufficient for our templates.
  const raw = readFileSync(path, "utf8");
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
  return JSON.parse(stripped);
}

function writeJsonPreserveIndent(path, obj) {
  // Match the existing 2-space indent when the file existed, else 2.
  const indent = 2;
  writeFileSync(path, JSON.stringify(obj, null, indent) + "\n");
}

function banner(msg) {
  const line = "─".repeat(Math.max(40, msg.length + 4));
  console.log(`\n${line}\n  ${msg}\n${line}`);
}

async function installPlugin(bundlePath, target, force) {
  const pluginsDir = join(target, ".opencode", "plugins");
  const destPath = join(pluginsDir, "aion.js");

  ensureDir(pluginsDir);

  if (existsSync(destPath) && !force) {
    banner("Plugin already installed");
    console.log(`  ${destPath}`);
    console.log("");
    console.log("  Re-run with --force to overwrite:");
    console.log(`    aion-ts init ${target === process.cwd() ? "" : target} --force`);
    console.log("");
    process.exit(2);
  }

  copyFileSync(bundlePath, destPath);
  console.log(`  [ok] copied bundle  → ${destPath}`);
}

async function ensureOpencodeJson(target) {
  // NOTE: OpenCode auto-discovers plugins in <target>/.opencode/plugins/ and
  // ~/.config/opencode/plugins/. We do NOT touch the "plugin" array in
  // opencode.json because:
  //   1. That field is for npm packages (resolved via Bun at startup).
  //   2. AION ships as a local file bundle, so it goes through the
  //      auto-discovery path and the array entry is not needed.
  // We still create or merge opencode.json so the user can drop in other
  // OpenCode-level config (theme, model, agent overrides, etc.).
  const path = join(target, "opencode.json");
  const exists = existsSync(path);

  if (!exists) {
    const example = {
      $schema: "https://opencode.ai/config.json",
      theme: "aion",
      model: "anthropic/claude-sonnet-4-5",
    };
    writeJsonPreserveIndent(path, example);
    console.log(`  [ok] created       → ${path}`);
    return;
  }

  let parsed;
  try {
    parsed = readJsonc(path);
  } catch (err) {
    banner("opencode.json is not valid JSON");
    console.log(`  ${path}`);
    console.log(`  ${err.message}`);
    console.log("");
    console.log("  Fix the file manually, then re-run this installer.");
    process.exit(3);
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    if (Array.isArray(parsed.plugin) && parsed.plugin.includes("aion-ts-plugin")) {
      // Migrate away from the previous wrong behavior: drop the npm-name entry.
      parsed.plugin = parsed.plugin.filter((x) => x !== "aion-ts-plugin");
      if (parsed.plugin.length === 0) delete parsed.plugin;
      writeJsonPreserveIndent(path, parsed);
      console.log(`  [ok] cleaned       → ${path}  (removed legacy "plugin": ["aion-ts-plugin"])`);
    } else {
      console.log(`  [skip] ${path} already exists`);
    }
  } else {
    banner("opencode.json has unexpected shape");
    console.log(`  Expected a JSON object. Aborting to avoid clobbering it.`);
    process.exit(4);
  }
}

async function ensureAionConfig(target) {
  const dir = join(target, ".opencode");
  const dest = join(dir, "aion.jsonc");
  ensureDir(dir);
  if (existsSync(dest)) {
    console.log(`  [skip] ${dest} already exists`);
    return;
  }
  writeFileSync(dest, DEFAULT_AION_CONFIG);
  console.log(`  [ok] created       → ${dest}`);
  console.log("");
  console.log("  NOTE: AION will ask you about interactive mode at the START of your");
  console.log("        first session (via OpenCode's built-in question popup). You can");
  console.log("        also toggle mode at any time by saying \"I'm leaving\" or");
  console.log("        \"switch to autonomous\" / \"switch to interactive\" mid-conversation.");
}

function installTheme(bundlePath, target) {
  const src = join(dirname(bundlePath), "..", "themes", "aion.json");
  if (!existsSync(src)) {
    console.log("  [skip] theme not found in source — skipping");
    return;
  }
  const themesDir = join(target, ".opencode", "themes");
  const dest = join(themesDir, "aion.json");
  ensureDir(themesDir);
  copyFileSync(src, dest);
  console.log(`  [ok] copied theme   → ${dest}`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  if (argv[0] !== "init") {
    console.error(`Unknown command: ${argv[0]}`);
    console.error(`Run 'aion-ts --help' for usage.`);
    process.exit(1);
  }
  const rest = argv.slice(1);
  let args;
  try {
    args = parseArgs(rest);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const target = args.target;
  console.log(`\nAION installer`);
  console.log(`  target : ${target}`);
  console.log(`  force  : ${args.force}`);

  if (!existsSync(target)) {
    ensureDir(target);
    console.log(`  [ok] created dir   → ${target}`);
  } else if (!statSync(target).isDirectory()) {
    console.error(`Target exists but is not a directory: ${target}`);
    process.exit(1);
  }

  const bundle = findBundlePath();
  if (!bundle) {
    banner("Plugin bundle not found");
    console.log("  Searched:");
    console.log(`    ${join(__dirname, "..", ".opencode", "plugins", "aion.js")}`);
    console.log(`    ${join(__dirname, "..", "dist", "index.js")}`);
    console.log(`    ${join(__dirname, "..", "dist", "aion.js")}`);
    console.log("");
    console.log("  Build the project first (e.g. `bun run build`).");
    process.exit(5);
  }
  console.log(`  bundle : ${bundle}`);

  await installPlugin(bundle, target, args.force);
  await ensureOpencodeJson(target);
  await ensureAionConfig(target);
  installTheme(bundle, target);

  banner("Done");
  console.log("  Next steps:");
  console.log("    1. Review .opencode/aion.jsonc and adjust as needed.");
  console.log("    2. Start OpenCode inside the target directory.");
  console.log("       The plugin is fully self-contained — no npm install needed.");
  console.log("");
}

main().catch((err) => {
  console.error("\n  [error]", err.message);
  process.exit(1);
});
