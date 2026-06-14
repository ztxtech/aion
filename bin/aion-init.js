#!/usr/bin/env node
// AION plugin installer - copies the local bundle and config into a target project directory.
// Usage: aion-ts init [target-dir] [--force]
//   target-dir: optional, defaults to process.cwd()
//   --force:    required to overwrite an existing .opencode/plugins/aion.js

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_AION_CONFIG = `{
  // AION plugin configuration (JSONC: comments + trailing commas allowed).
  // All features are ON by default. Comment out or set to false to disable.

  "enabled": true,
  // "model" is intentionally omitted — AION inherits the model from
  // opencode.json (project-level) or the global OpenCode config. Set it
  // here ONLY if you want AION agents to use a different model than the
  // rest of OpenCode.
  "defaultAgent": "aion",

  "governance": {
    // Governance hierarchy: c-critic > ts-critic > main agent > subagents
    "enforceHierarchy": true,
    "cCriticSupremacy": true
  },

  "leakage": {
    // Leakage prevention: each flag guards one category of sensitive content
    "blockOnSuspicion": true,
    "blockFutureInfo": true,
    "blockHiddenSetAccess": true,
    "blockPrivateData": true,
    "blockCredentials": true,
    "blockPromptsAccess": true,
    "blockMemoryAccess": true
  },

  "autoContinue": {
    // Auto-continue: keep running rounds until c-critic approves a stop
    "enabled": true,
    "maxRounds": 30,
    "delaySeconds": 2
  },

  "teamMode": {
    // Team mode: 1 lead coordinates multiple subagents in parallel
    "enabled": true,
    "tmuxVisualization": true,
    "maxParallelMembers": 6,
    "maxMembers": 8,
    "maxMessagesPerRun": 20000,
    "maxWallClockMinutes": 240,
    "maxMemberTurns": 800,
    "messagePayloadMaxBytes": 65536,
    "recipientUnreadMaxBytes": 524288,
    "mailboxPollIntervalMs": 2000
  },

  "trace": {
    // Tracing: append every tool call to .opencode/trace.md
    "enabled": true,
    "path": ".opencode/trace.md"
  },

  "compaction": {
    // Context compaction: auto-summarize when the token limit is approached
    "autoRefreshAtKeyNodes": true,
    "snapshotPath": ".opencode/memory/context-snapshot.md"
  },

  "interactiveMode": {
    // At session start the LLM asks the user via the question tool (regardless
    // of this install-time setting). The value here is only a fallback: if the
    // LLM never asks (e.g. config is true but the user says stop asking), this
    // value is used. The user can switch to fully-autonomous anytime by saying
    // "I'm leaving".
    //
    // granularity options:
    //   "autonomous"        — fully auto, no prompts
    //   "round-checkpoint"  — pause after c-critic verdicts
    //   "always-interactive" — pause at every dispatch/critic/plan-switch/phase-transition
    //   "custom"            — user defines triggers (customTriggers below)
    "enabled": false,
    "granularity": "autonomous",
    "customTriggers": []
  },

  "language": {
    // Language mode for interaction and delivery.
    //   "en"                   — English everywhere
    //   "zh-reason-en-deliver" — Chinese reasoning + English delivery
    //   "zh-deliver"           — Chinese delivery
    //   "bilingual"            — Chinese + English delivery
    // AION will also ask you at session start; this is the fallback default.
    // TUI notifications (I AM AION toasts) always stay in English.
    "mode": "en"
  }
}
`;

function parseArgs(argv) {
  const args = { target: process.cwd(), force: false, command: null, dataset: {}, _datasetId: null };
  let sub = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force" || a === "-f") args.force = true;
    else if (a === "--help" || a === "-h") args.command = "help";
    else if (a === "init") { sub = "init"; args.command = "init"; }
    else if (a === "datasets" || a === "hf") { sub = "datasets"; args.command = "datasets"; }
    else if (a === "search") { if (sub === "datasets") args.dataset.action = "search"; }
    else if (a === "info") { if (sub === "datasets") args.dataset.action = "info"; }
    else if (a === "ingest") { if (sub === "datasets") args.dataset.action = "ingest"; }
    else if (a === "suggest") { if (sub === "datasets") args.dataset.action = "suggest"; }
    else if (a === "--limit" || a === "-n") { args.dataset.limit = parseInt(argv[++i], 10); }
    else if (a === "--modality") { args.dataset.modality = argv[++i]; }
    else if (a === "--task") { args.dataset.task = argv[++i]; }
    else if (a === "--split") { args.dataset.split = argv[++i]; }
    else if (a === "--keywords") { args.dataset.keywords = argv[++i].split(",").map(s => s.trim()).filter(Boolean); }
    else if (a === "--goal") { args.dataset.goal = argv[++i]; }
    else if (a === "--top-k") { args.dataset.topK = parseInt(argv[++i], 10); }
    else if (a === "--workspace") { args.dataset.workspace = argv[++i]; }
    else if (a === "--dry-run") { args.dataset.dryRun = true; }
    else if (a === "--no-cache") { args.dataset.noCache = true; }
    else if (a.startsWith("-")) {
      throw new Error(`Unknown flag: ${a}`);
    } else {
      if (sub === "datasets") {
        args._datasetId = a;
      } else {
        args.target = resolve(a);
      }
    }
  }
  return args;
}

function printHelp() {
  console.log(`aion-ts - AION plugin installer

Usage:
  aion-ts init [target-dir] [--force]
  aion-ts datasets search <query> [--limit N] [--modality M] [--no-cache]
  aion-ts datasets info <dataset-id> [--no-cache]
  aion-ts datasets ingest <dataset-id> [--workspace DIR] [--split S] [--no-cache]
  aion-ts datasets suggest --goal "..." [--keywords k1,k2] [--modality M] [--top-k N]
  aion-ts --help

Commands:
  init       Install the plugin bundle into a project directory.
  datasets   Search and ingest Hugging Face Datasets from the CLI. Mirrors the
             aion_hf_search / aion_hf_info / aion_hf_ingest / aion_hf_suggest
             tools so you can prep data without launching OpenCode.
             All commands support --no-cache to bypass the 24h HF cache.

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
     creates a minimal starter file with $schema/theme.
  3. Copies a commented default config to <target>/.opencode/aion.jsonc.
     The bundle is fully self-contained — no external npm dependencies
     are needed.

This installer only touches files inside <target-dir>. It does not modify any
global OpenCode configuration.
`);
}

function findBundlePath() {
  const candidates = [
    // When run from the source repo (development)
    join(__dirname, "..", ".opencode", "plugins", "aion.js"),
    join(__dirname, "..", "dist", "index.js"),
    join(__dirname, "..", "dist", "aion.js"),
    // When installed system-wide (aion-ts install → ~/.aion/lib/aion.js)
    join(__dirname, "aion.js"),
    join(__dirname, "..", "lib", "aion.js"),
    join(__dirname, "..", "plugins", "aion.js"),
  ];
  for (const p of candidates) {
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function readIfExists(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

function writeFileEnsuringDir(path, content) {
  ensureDir(dirname(path));
  writeFileSync(path, content);
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
  // We do NOT set a "model" field — the user picks the model in the OpenCode
  // TUI at runtime. This keeps AION model-agnostic.
  const path = join(target, "opencode.json");
  const exists = existsSync(path);

  if (!exists) {
    const example = {
      $schema: "https://opencode.ai/config.json",
      theme: "aion",
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

function findThemePath(bundlePath) {
  const candidates = [
    // Source repo layout
    join(dirname(bundlePath), "..", "themes", "aion.json"),
    // Installed layout (aion-theme.json next to the bundle)
    join(dirname(bundlePath), "aion-theme.json"),
    join(dirname(bundlePath), "..", "lib", "aion-theme.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

function installTheme(bundlePath, target) {
  const src = findThemePath(bundlePath);
  if (!src) {
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
  if (argv[0] === "datasets" || argv[0] === "hf") {
    const rest = argv.slice(1);
    let args;
    try {
      args = parseArgs([argv[0], ...rest]);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    try {
      await runDatasets(args);
    } catch (err) {
      console.error(`\n  [error] ${err.message}`);
      process.exit(1);
    }
    return;
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

// ---------------------------------------------------------------------------
// datasets subcommand (Hugging Face Datasets CLI)
// ---------------------------------------------------------------------------

const HF_API_BASE = "https://huggingface.co/api";
const HF_TIMEOUT_MS = 15000;
const HF_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const HF_CACHE_DIRNAME = ".opencode/hf-cache";

function hfCacheDir(cwd) {
  return join(cwd || process.cwd(), HF_CACHE_DIRNAME);
}

function hashKey(parts) {
  const s = JSON.stringify(parts, Object.keys(parts).sort());
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}

async function hfFetchJson(url, cacheDir, useCache) {
  if (useCache) {
    const key = hashKey({ url });
    const cacheFile = join(cacheDir, `${key}.json`);
    const cached = readIfExists(cacheFile);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.ts < HF_CACHE_TTL_MS) return parsed.data;
      } catch { /* ignore */ }
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HF_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "aion-cli/0.5.1" } });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`HF API ${res.status} ${res.statusText}: ${url}`);
  const data = await res.json();
  if (useCache) {
    const key = hashKey({ url });
    const cacheFile = join(cacheDir, `${key}.json`);
    writeFileEnsuringDir(cacheFile, JSON.stringify({ ts: Date.now(), data }));
  }
  return data;
}

function inferModality(tags) {
  // HF tags come in two shapes: bare ("text", "image") or namespaced
  // ("modality:time-series", "task_categories:image-classification").
  // Normalize by stripping the namespace prefix so both shapes match.
  const t = new Set((tags || []).map(x => {
    const lower = (x || "").toLowerCase();
    return lower.includes(":") ? lower.split(":").pop() : lower;
  }));
  const out = [];
  if (t.has("text") || t.has("nlp") || t.has("lm")) out.push("text");
  if (t.has("image") || t.has("vision")) out.push("image");
  if (t.has("audio") || t.has("speech")) out.push("audio");
  if (t.has("video")) out.push("video");
  if (t.has("time-series") || t.has("forecasting") || t.has("timeseries")) out.push("timeseries");
  if (t.has("tabular") || t.has("table")) out.push("tabular");
  if (out.length > 1) out.push("multimodal");
  return out.length ? out : ["text"];
}

function inferSizeBucket(downloads) {
  if (downloads < 1000) return "n<1K";
  if (downloads < 10000) return "1K-10K";
  if (downloads < 100000) return "10K-100K";
  if (downloads < 1000000) return "100K-1M";
  if (downloads < 10000000) return "1M-10M";
  return "n>10M";
}

function rawToSummary(raw) {
  const id = String(raw.id || "");
  const tags = Array.isArray(raw.tags) ? raw.tags : [];
  const downloads = typeof raw.downloads === "number" ? raw.downloads : 0;
  const taskCategories = tags.filter(t => t.startsWith("task_categories:")).map(t => t.replace("task_categories:", ""));
  const license = (raw.cardData && typeof raw.cardData === "object" && "license" in raw.cardData)
    ? String(raw.cardData.license || "") : undefined;
  return {
    id,
    author: raw.author || undefined,
    downloads,
    likes: typeof raw.likes === "number" ? raw.likes : 0,
    tags,
    taskCategories,
    modalities: inferModality(tags),
    sizeBucket: inferSizeBucket(downloads),
    license: license || undefined,
    lastModified: raw.lastModified || undefined,
    description: raw.description || undefined,
  };
}

async function datasetsSearch(query, opts) {
  const params = new URLSearchParams({ search: query, limit: String(opts.limit || 10) });
  const url = `${HF_API_BASE}/datasets?${params}`;
  const cacheDir = hfCacheDir(opts.workspace);
  const data = await hfFetchJson(url, cacheDir, opts.useCache);
  let results = (Array.isArray(data) ? data : []).map(rawToSummary);
  if (opts.modality) {
    results = results.filter(s => s.modalities.includes(opts.modality));
  }
  return { query, count: results.length, results };
}

async function datasetsInfo(id, opts) {
  const url = `${HF_API_BASE}/datasets/${encodeURIComponent(id)}`;
  const cacheDir = hfCacheDir(opts.workspace);
  const raw = await hfFetchJson(url, cacheDir, opts.useCache);
  const base = rawToSummary(raw);
  const siblings = Array.isArray(raw.siblings) ? raw.siblings.map(s => ({ rfilename: String(s.rfilename || ""), size: typeof s.size === "number" ? s.size : undefined })) : [];
  const configNames = Array.isArray(raw.configNames) ? raw.configNames : [];
  const splits = [];
  if (raw.cardData && typeof raw.cardData === "object" && Array.isArray(raw.cardData.splits)) {
    for (const s of raw.cardData.splits) {
      if (typeof s === "string") splits.push({ name: s });
      else if (s && typeof s === "object" && s.name) splits.push({ name: String(s.name), numExamples: typeof s.num_examples === "number" ? s.num_examples : undefined });
    }
  }
  return { ...base, cardData: raw.cardData, siblings, configNames, splits };
}

async function datasetsIngest(id, opts) {
  const root = opts.workspace || process.cwd();
  const dataDir = join(root, "data");
  ensureDir(dataDir);
  const url = `${HF_API_BASE}/datasets/${encodeURIComponent(id)}`;
  const cacheDir = hfCacheDir(root);
  const raw = await hfFetchJson(url, cacheDir, opts.useCache);
  const base = rawToSummary(raw);
  const configNames = Array.isArray(raw.configNames) ? raw.configNames : [];
  const splits = [];
  if (raw.cardData && typeof raw.cardData === "object" && Array.isArray(raw.cardData.splits)) {
    for (const s of raw.cardData.splits) {
      if (typeof s === "string") splits.push(s);
      else if (s && typeof s === "object" && s.name) splits.push(String(s.name));
    }
  }
  const manifest = {
    datasetId: base.id,
    author: base.author,
    license: base.license || null,
    tags: base.tags,
    taskCategories: base.taskCategories,
    modalities: base.modalities,
    sizeBucket: base.sizeBucket,
    downloads: base.downloads,
    configNames,
    splits,
    hfUrl: `https://huggingface.co/datasets/${id}`,
    apiUrl: url,
    ingestedAt: new Date().toISOString(),
    ingestAgent: "aion-cli",
  };
  const manifestPath = join(dataDir, "aion-dataset-manifest.json");
  writeFileEnsuringDir(manifestPath, JSON.stringify(manifest, null, 2));
  const safeId = id.replace(/\//g, "_");
  const loaderPath = join(dataDir, `${safeId}.loader.py`);
  const targetSplit = opts.split || splits[0] || "train";
  const loaderPy = `# Auto-generated by aion-ts datasets ingest at ${new Date().toISOString()}
# Dataset: ${base.id}
# License: ${base.license || "UNKNOWN - verify before use"}
# HF URL : https://huggingface.co/datasets/${id}
#
# Usage:
#   pip install datasets
#   python data/${safeId}.loader.py
import os
from datasets import load_dataset

DATASET_ID = "${id}"
HF_TOKEN = os.environ.get("HF_TOKEN")
CACHE_DIR = os.environ.get("HF_HOME", "./.cache/huggingface")

def load(split=None, config=None, streaming=False):
    kwargs = {"cache_dir": CACHE_DIR, "streaming": streaming}
    if HF_TOKEN:
        kwargs["token"] = HF_TOKEN
    if config:
        kwargs["name"] = config
    ds = load_dataset(DATASET_ID, **kwargs)
    if split:
        return ds[split]
    return ds

if __name__ == "__main__":
    target_split = "${targetSplit}"
    ds = load(split=target_split)
    print(f"loaded {DATASET_ID} split={target_split} rows={len(ds)} columns={ds.column_names}")
`;
  writeFileEnsuringDir(loaderPath, loaderPy);
  return { manifestPath, loaderPath, datasetId: base.id, splits, configNames, license: base.license || null };
}

async function datasetsSuggest(opts) {
  const goal = opts.goal;
  const keywords = opts.keywords || [];
  const queries = [goal, ...keywords].filter(Boolean);
  const seen = new Map();
  const cacheDir = hfCacheDir(opts.workspace);
  for (const q of queries) {
    const params = new URLSearchParams({ search: q, limit: String(opts.perQueryLimit || 5) });
    const url = `${HF_API_BASE}/datasets?${params}`;
    const data = await hfFetchJson(url, cacheDir, opts.useCache);
    if (!Array.isArray(data)) continue;
    for (const raw of data) {
      const summary = rawToSummary(raw);
      const tagSet = new Set(summary.tags.map(t => t.toLowerCase()));
      const keywordHits = keywords.filter(k => tagSet.has(k.toLowerCase())).length;
      const goalTokens = goal.toLowerCase().split(/\W+/).filter(t => t.length > 3);
      const goalHits = goalTokens.filter(t => summary.id.toLowerCase().includes(t) || (summary.description || "").toLowerCase().includes(t)).length;
      const score = keywordHits * 10 + goalHits * 3 + Math.log10(Math.max(1, summary.downloads));
      const existing = seen.get(summary.id);
      if (!existing || existing.score < score) {
        seen.set(summary.id, { summary, score, matchedTags: keywords.filter(k => tagSet.has(k.toLowerCase())) });
      }
    }
  }
  let ranked = [...seen.values()];
  if (opts.modality) ranked = ranked.filter(({ summary }) => summary.modalities.includes(opts.modality));
  ranked.sort((a, b) => b.score - a.score);
  ranked = ranked.slice(0, opts.topK || 5);
  return {
    goal,
    keywords,
    candidates: ranked.map(({ summary, score, matchedTags }) => ({
      datasetId: summary.id,
      url: `https://huggingface.co/datasets/${summary.id}`,
      license: summary.license || "UNKNOWN",
      sizeBucket: summary.sizeBucket,
      downloads: summary.downloads,
      tags: summary.tags.slice(0, 8),
      matchedTags,
      rationale: `score=${score.toFixed(1)} (keyword=${matchedTags.length} downloads=${summary.downloads})`,
    })),
  };
}

async function runDatasets(args) {
  const a = args.dataset;
  const cwd = process.cwd();
  const useCache = !a.noCache;
  if (a.action === "search") {
    const query = args._datasetId;
    if (!query) {
      console.error("\n  [error] search requires a query string. Usage: aion-ts datasets search <query>");
      process.exit(1);
    }
    banner(`search "${query}" (limit=${a.limit || 10}${a.modality ? `, modality=${a.modality}` : ""})`);
    const result = await datasetsSearch(query, { limit: a.limit, modality: a.modality, workspace: cwd, useCache });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (a.action === "info") {
    const id = args._datasetId;
    if (!id) {
      console.error("\n  [error] info requires a dataset id. Usage: aion-ts datasets info <owner/name>");
      process.exit(1);
    }
    banner(`info ${id}`);
    const result = await datasetsInfo(id, { workspace: cwd, useCache });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (a.action === "ingest") {
    const id = args._datasetId;
    if (!id) {
      console.error("\n  [error] ingest requires a dataset id. Usage: aion-ts datasets ingest <owner/name>");
      process.exit(1);
    }
    const root = a.workspace || cwd;
    banner(`ingest ${id} → ${root}/data/`);
    const result = await datasetsIngest(id, { workspace: root, useCache, split: a.split });
    console.log(`\n  [ok] manifest   → ${result.manifestPath}`);
    console.log(`  [ok] loader     → ${result.loaderPath}`);
    console.log(`  [i]  license    = ${result.license}`);
    console.log(`  [i]  splits     = ${result.splits.join(", ") || "(none)"}`);
    console.log(`  [i]  configs    = ${result.configNames.join(", ") || "(none)"}`);
    return;
  }
  if (a.action === "suggest") {
    if (!a.goal) {
      console.error("\n  [error] suggest requires --goal. Usage: aion-ts datasets suggest --goal \"...\" [--keywords k1,k2] [--modality M]");
      process.exit(1);
    }
    banner(`suggest goal="${a.goal}"`);
    const result = await datasetsSuggest({
      goal: a.goal,
      keywords: a.keywords,
      modality: a.modality,
      perQueryLimit: 5,
      topK: a.topK || 5,
      workspace: cwd,
      useCache,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.error("\n  [error] datasets subcommand requires an action: search | info | ingest | suggest");
  console.error("  Run 'aion-ts --help' for usage.");
  process.exit(1);
}

main().catch((err) => {
  console.error("\n  [error]", err.message);
  process.exit(1);
});
