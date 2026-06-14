/**
 * Hugging Face Datasets tool.
 *
 * Provides four tools (always registered, no SDK dependency, no auth):
 *
 *   aion_hf_search        — text search over HF Hub /datasets, with optional
 *                           filters (task_categories, modality, size_bucket,
 *                           license). Results are cached under
 *                           `.opencode/hf-cache/search-<hash>.json` to avoid
 *                           repeated network calls.
 *   aion_hf_info          — fetch dataset card + sibling-files manifest for
 *                           a single dataset (e.g. "Salesforce/lotsa_data").
 *                           Cached at `.opencode/hf-cache/info-<id>.json`.
 *   aion_hf_ingest        — materialize a dataset's metadata + (optional)
 *                           script-style loader snippet into
 *                           `data/aion-dataset-manifest.json` + a sibling
 *                           `data/<dataset-id>.loader.py`. Does NOT download
 *                           raw parquet — that is the coder's job and would
 *                           bloat the harness.
 *   aion_hf_suggest       — recommend datasets for a task contract. Takes
 *                           the goal string + a list of keywords; runs a
 *                           tiered search (broad → narrow) and ranks results
 *                           by tag overlap. Emits a structured "suggestion
 *                           card" with download URL, license, and a one-line
 *                           rationale.
 *
 * The HTTP layer lives in {@link hfClient}, which:
 *   - hits the public HF Hub API (no auth required for public datasets)
 *   - retries on 429/5xx with exponential backoff (max 3 attempts)
 *   - supports a dryRun mode that returns a deterministic mock for tests
 *   - times out at 15s per request
 *
 * Why no SDK? @huggingface/inference / datasets / huggingface-hub are
 * browser-oriented or require Node >= 18 + streaming downloads. For a
 * *harness* layer (metadata + manifest) the public REST API is sufficient
 * and keeps the bundle under 1MB.
 */
import { tool } from "@opencode-ai/plugin"
import type { CreateToolsArgs } from "./_shared"
import type { AionTools } from "./types"
import { ensureDir, writeFileEnsuringDir, readIfExists } from "../shared/logger"
import { nowIso } from "../shared/utils"
import { join, dirname } from "node:path"
import { createHash } from "node:crypto"

const HF_API_BASE = "https://huggingface.co/api"
const HF_REQUEST_TIMEOUT_MS = 15_000
const HF_MAX_RETRIES = 3

/**
 * Encode a HF dataset id for use in a URL path segment. HF dataset ids use
 * the form "owner/name" — the slash is a path separator on the API side
 * and must NOT be percent-encoded. Other reserved characters ARE encoded
 * per RFC 3986 to be safe against ids with unexpected characters.
 */
function encodeDatasetId(id: string): string {
  return id
    .split("/")
    .map(seg => encodeURIComponent(seg))
    .join("/")
}

/**
 * HTTP error from the HF Hub API. Used to distinguish HTTP-layer errors
 * (which must NOT be retried) from network-layer errors (which CAN be).
 * The message carries "HF API <status>" so existing regex matchers in
 * tests still work without change.
 */
export class HFHttpError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "HFHttpError"
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type HfModality = "text" | "image" | "audio" | "video" | "timeseries" | "tabular" | "multimodal"
export type HfSizeBucket = "n<1K" | "1K-10K" | "10K-100K" | "100K-1M" | "1M-10M" | "n>10M"

export type HfDatasetSummary = {
  id: string
  author?: string
  downloads: number
  likes: number
  tags: string[]
  taskCategories: string[]
  modalities: HfModality[]
  sizeBucket: HfSizeBucket
  license?: string
  lastModified?: string
  description?: string
}

export type HfDatasetInfo = HfDatasetSummary & {
  cardData?: Record<string, unknown>
  siblings: Array<{ rfilename: string; size?: number }>
  configNames: string[]
  splits: Array<{ name: string; numExamples?: number }>
}

export type HfIngestResult = {
  manifestPath: string
  loaderPath: string
  datasetId: string
  rows: number | null
  splits: string[]
  configNames: string[]
  license: string | null
}

// ---------------------------------------------------------------------------
// HTTP layer (with cache + retry + dryRun)
// ---------------------------------------------------------------------------

type HfFetchOptions = {
  dryRun?: boolean
  cacheDir?: string
  cacheTtlMs?: number
}

function hashKey(parts: Record<string, unknown>): string {
  const s = JSON.stringify(parts, Object.keys(parts).sort())
  return createHash("sha1").update(s).digest("hex").slice(0, 16)
}

async function hfFetch<T = unknown>(
  url: string,
  options: HfFetchOptions & { cacheKey?: Record<string, unknown> } = {},
): Promise<T> {
  const { dryRun, cacheDir, cacheTtlMs = 24 * 60 * 60 * 1000, cacheKey } = options

  // Cache lookup
  if (cacheDir && cacheKey) {
    const key = hashKey(cacheKey)
    const cacheFile = join(cacheDir, `${key}.json`)
    const cached = readIfExists(cacheFile)
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { ts: number; data: T }
        if (Date.now() - parsed.ts < cacheTtlMs) return parsed.data
      } catch {
        // ignore cache corruption
      }
    }
  }

  if (dryRun) {
    // Deterministic mock for tests
    return {
      __dryRun: true,
      url,
      ts: nowIso(),
    } as T
  }

  let lastErr: unknown = null
  for (let attempt = 1; attempt <= HF_MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HF_REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json", "User-Agent": "aion-plugin/0.5.1" },
      })
      clearTimeout(timer)
      if (res.status === 429 || res.status >= 500) {
        // retryable: server-side hiccups, rate-limit, gateway errors
        if (attempt < HF_MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 2 ** attempt * 250))
          continue
        }
        throw new Error(`HF API ${res.status} after ${HF_MAX_RETRIES} attempts: ${url}`)
      }
      if (!res.ok) {
        // 4xx is a client error (404, 401, 403, 400). NOT retryable.
        throw new HFHttpError(`HF API ${res.status} ${res.statusText}: ${url}`, res.status)
      }
      const data = (await res.json()) as T
      if (cacheDir && cacheKey) {
        const key = hashKey(cacheKey)
        const cacheFile = join(cacheDir, `${key}.json`)
        writeFileEnsuringDir(cacheFile, JSON.stringify({ ts: Date.now(), data }))
      }
      return data
    } catch (err) {
      clearTimeout(timer)
      // HTTP errors (4xx, definitive 5xx after retries) must propagate immediately
      // and NOT trigger a network-style retry. Only low-level fetch failures
      // (abort, ECONNRESET, TypeError on the global fetch) are retryable.
      if (err instanceof HFHttpError) throw err
      lastErr = err
      if (attempt < HF_MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2 ** attempt * 250))
        continue
      }
    }
  }
  throw new Error(`HF fetch failed: ${(lastErr as Error)?.message ?? "unknown"} (${url})`)
}

// ---------------------------------------------------------------------------
// Mapping / scoring helpers
// ---------------------------------------------------------------------------

function inferModality(tags: string[]): HfModality[] {
  const out: HfModality[] = []
  // HF tags come in two shapes: bare ("text", "image") or namespaced
  // ("modality:time-series", "task_categories:image-classification").
  // Normalize by stripping the namespace prefix so both shapes match.
  const t = new Set(tags.map(x => {
    const lower = x.toLowerCase()
    return lower.includes(":") ? lower.split(":").pop()! : lower
  }))
  if (t.has("text") || t.has("nlp") || t.has("lm")) out.push("text")
  if (t.has("image") || t.has("image-classification") || t.has("vision")) out.push("image")
  if (t.has("audio") || t.has("speech")) out.push("audio")
  if (t.has("video")) out.push("video")
  if (t.has("time-series") || t.has("forecasting") || t.has("timeseries")) out.push("timeseries")
  if (t.has("tabular") || t.has("table")) out.push("tabular")
  if (out.length > 1) out.push("multimodal")
  return out.length ? out : ["text"]
}

function inferSizeBucket(downloads: number): HfSizeBucket {
  if (downloads < 1_000) return "n<1K"
  if (downloads < 10_000) return "1K-10K"
  if (downloads < 100_000) return "10K-100K"
  if (downloads < 1_000_000) return "100K-1M"
  if (downloads < 10_000_000) return "1M-10M"
  return "n>10M"
}

function rawToSummary(raw: Record<string, unknown>): HfDatasetSummary {
  const id = String(raw.id ?? "")
  const tags = Array.isArray(raw.tags) ? (raw.tags as string[]) : []
  const downloads = typeof raw.downloads === "number" ? raw.downloads : 0
  const likes = typeof raw.likes === "number" ? raw.likes : 0
  const taskCategories = tags.filter(t => t.startsWith("task_categories:")).map(t => t.replace("task_categories:", ""))
  return {
    id,
    author: typeof raw.author === "string" ? raw.author : undefined,
    downloads,
    likes,
    tags,
    taskCategories,
    modalities: inferModality(tags),
    sizeBucket: inferSizeBucket(downloads),
    license: typeof raw.cardData === "object" && raw.cardData && "license" in (raw.cardData as object)
      ? String((raw.cardData as Record<string, unknown>).license ?? "")
      : undefined,
    lastModified: typeof raw.lastModified === "string" ? raw.lastModified : undefined,
    description: typeof raw.description === "string" ? raw.description : undefined,
  }
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createHfDatasetsTools(args: CreateToolsArgs): Partial<AionTools> {
  const { managers, config, ctx } = args
  const m = managers
  const z = tool.schema

  const hfCacheDir = join(ctx.directory ?? process.cwd(), ".opencode", "hf-cache")

  return {
    aion_hf_search: tool({
      description:
        "Search the public Hugging Face Datasets Hub. Returns up to N dataset summaries " +
        "with tags, task_categories, license, downloads, and an inferred modality. " +
        "Cached for 24h under .opencode/hf-cache/. Use `task_categories` and `modality` to narrow.",
      args: {
        query: z.string().min(1).describe("Free-text search (e.g. 'time-series forecasting', 'ECG classification')"),
        limit: z.number().int().min(1).max(50).default(10),
        task_categories: z.array(z.string()).optional().describe("Filter, e.g. ['time-series-forecasting', 'text-classification']"),
        modality: z.enum(["text", "image", "audio", "video", "timeseries", "tabular", "multimodal"]).optional(),
        dryRun: z.boolean().default(false).describe("If true, returns a deterministic mock without network I/O (for tests)"),
      },
      async execute(args, _context) {
        const params = new URLSearchParams({ search: args.query, limit: String(args.limit) })
        if (args.task_categories?.length) params.set("task_categories", args.task_categories.join(","))
        const url = `${HF_API_BASE}/datasets?${params.toString()}`

        const data = await hfFetch<Array<Record<string, unknown>>>(url, {
          dryRun: args.dryRun,
          cacheDir: args.dryRun ? undefined : hfCacheDir,
          cacheKey: { endpoint: "search", query: args.query, limit: args.limit, task_categories: args.task_categories ?? null, modality: args.modality ?? null },
        })

        if (args.dryRun) {
          return JSON.stringify({ dryRun: true, url, query: args.query, count: 0, results: [] })
        }

        let summaries: HfDatasetSummary[] = (Array.isArray(data) ? data : []).map(rawToSummary)
        if (args.modality) {
          summaries = summaries.filter(s => s.modalities.includes(args.modality!))
        }
        if (summaries.length === 0 && !args.dryRun) {
          m.trace.appendEvent("hf.search", `hf_search: 0 results for "${args.query}"`, { query: args.query, limit: args.limit }, "main-agent")
          return JSON.stringify({ query: args.query, count: 0, results: [] })
        }

        m.trace.appendEvent("hf.search", `hf_search: ${summaries.length} results for "${args.query}"`, { query: args.query, count: summaries.length }, "main-agent")
        return JSON.stringify({ query: args.query, count: summaries.length, results: summaries }, null, 2)
      },
    }),

    aion_hf_info: tool({
      description:
        "Fetch the full dataset card + sibling-files manifest for a single dataset (e.g. 'Salesforce/lotsa_data'). " +
        "Returns config names, splits, file list, and license. Cached for 24h.",
      args: {
        dataset_id: z.string().describe("HF dataset id, e.g. 'Salesforce/lotsa_data'"),
        dryRun: z.boolean().default(false),
      },
      async execute(args, _context) {
        const url = `${HF_API_BASE}/datasets/${encodeDatasetId(args.dataset_id)}`
        const raw = await hfFetch<Record<string, unknown>>(url, {
          dryRun: args.dryRun,
          cacheDir: args.dryRun ? undefined : hfCacheDir,
          cacheKey: { endpoint: "info", dataset_id: args.dataset_id },
        })
        if (args.dryRun) {
          return JSON.stringify({ dataset_id: args.dataset_id, dryRun: true })
        }
        const base = rawToSummary(raw)
        const siblings = Array.isArray(raw.siblings)
          ? (raw.siblings as Array<Record<string, unknown>>).map(s => ({
              rfilename: String(s.rfilename ?? ""),
              size: typeof s.size === "number" ? s.size : undefined,
            }))
          : []
        const cardData = (typeof raw.cardData === "object" && raw.cardData) ? raw.cardData as Record<string, unknown> : undefined
        const configNames = Array.isArray(raw.configNames) ? (raw.configNames as string[]) : []
        const splitsRaw = cardData?.splits
        const splits: Array<{ name: string; numExamples?: number }> = []
        if (typeof splitsRaw === "string") {
          splits.push({ name: splitsRaw })
        } else if (Array.isArray(splitsRaw)) {
          for (const s of splitsRaw) {
            if (typeof s === "string") splits.push({ name: s })
            else if (s && typeof s === "object") {
              const name = String((s as Record<string, unknown>).name ?? "")
              if (name) splits.push({ name, numExamples: typeof (s as Record<string, unknown>).num_examples === "number" ? (s as Record<string, unknown>).num_examples as number : undefined })
            }
          }
        }
        const info: HfDatasetInfo = { ...base, cardData, siblings, configNames, splits }
        m.trace.appendEvent("hf.info", `hf_info: ${args.dataset_id} (${siblings.length} files, ${configNames.length} configs)`, { dataset_id: args.dataset_id, files: siblings.length }, "main-agent")
        return JSON.stringify(info, null, 2)
      },
    }),

    aion_hf_ingest: tool({
      description:
        "Materialize a dataset's metadata + a Python loader snippet into the experiment's data/ directory. " +
        "Writes `data/aion-dataset-manifest.json` (canonical record) and `data/<id>.loader.py` (HF datasets API " +
        "skeleton). Does NOT download raw parquet — that is the coder's job. Idempotent.",
      args: {
        dataset_id: z.string().describe("HF dataset id, e.g. 'Salesforce/lotsa_data'"),
        workspace_root: z.string().default(".").describe("Experiment root (ztxexp boundary). Defaults to cwd."),
        target_split: z.string().optional().describe("If set, also write a per-split loader (data/<id>.<split>.loader.py)"),
        dryRun: z.boolean().default(false),
      },
      async execute(args, _context) {
        if (args.dryRun) {
          return JSON.stringify({ dryRun: true, dataset_id: args.dataset_id, dataDir: join(ctx.directory ?? process.cwd(), "data"), manifestPath: null, loaderPath: null })
        }
        const workspaceRoot = args.workspace_root ?? "."
        const root = workspaceRoot === "." ? (ctx.directory ?? process.cwd()) : workspaceRoot
        const dataDir = join(root, "data")
        ensureDir(dataDir)

        const infoUrl = `${HF_API_BASE}/datasets/${encodeDatasetId(args.dataset_id)}`
        const raw = await hfFetch<Record<string, unknown>>(infoUrl, {
          dryRun: args.dryRun,
          cacheDir: args.dryRun ? undefined : hfCacheDir,
          cacheKey: { endpoint: "info", dataset_id: args.dataset_id },
        })

        if (args.dryRun) {
          return JSON.stringify({ dataset_id: args.dataset_id, dryRun: true, dataDir })
        }

        const base = rawToSummary(raw)
        const configNames = Array.isArray(raw.configNames) ? (raw.configNames as string[]) : []
        const splitsRaw = (typeof raw.cardData === "object" && raw.cardData && "splits" in (raw.cardData as object))
          ? (raw.cardData as Record<string, unknown>).splits : null
        const splits: string[] = []
        if (typeof splitsRaw === "string") splits.push(splitsRaw)
        else if (Array.isArray(splitsRaw)) {
          for (const s of splitsRaw) {
            if (typeof s === "string") splits.push(s)
            else if (s && typeof s === "object" && "name" in (s as object)) splits.push(String((s as Record<string, unknown>).name))
          }
        }

        const manifest = {
          datasetId: base.id,
          author: base.author,
          license: base.license ?? null,
          tags: base.tags,
          taskCategories: base.taskCategories,
          modalities: base.modalities,
          sizeBucket: base.sizeBucket,
          downloads: base.downloads,
          configNames,
          splits,
          hfUrl: `https://huggingface.co/datasets/${args.dataset_id}`,
          apiUrl: infoUrl,
          ingestedAt: nowIso(),
          ingestAgent: "main-agent",
        }
        const manifestPath = join(dataDir, "aion-dataset-manifest.json")
        writeFileEnsuringDir(manifestPath, JSON.stringify(manifest, null, 2))

        const safeId = args.dataset_id.replace(/\//g, "_")
        const loaderPy = `# Auto-generated by aion_hf_ingest at ${nowIso()}
# Dataset: ${base.id}
# License: ${base.license ?? "UNKNOWN — verify before use"}
# HF URL : https://huggingface.co/datasets/${args.dataset_id}
#
# Usage:
#   pip install datasets
#   python data/${safeId}.loader.py
import os
from datasets import load_dataset

DATASET_ID = "${args.dataset_id}"
HF_TOKEN = os.environ.get("HF_TOKEN")  # only needed for gated datasets
CACHE_DIR = os.environ.get("HF_HOME", "./.cache/huggingface")

def load(split: str | None = None, config: str | None = None, streaming: bool = False):
    """Load the dataset. Returns a DatasetDict (no split) or Dataset (with split)."""
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
    import sys, json
    target_split = sys.argv[1] if len(sys.argv) > 1 else "${args.target_split ?? (splits[0] ?? "train")}"
    ds = load(split=target_split)
    print(f"loaded {DATASET_ID} split={target_split} rows={len(ds)} columns={ds.column_names}")
`
        const loaderPath = join(dataDir, `${safeId}.loader.py`)
        writeFileEnsuringDir(loaderPath, loaderPy)

        let targetLoaderPath: string | null = null
        if (args.target_split) {
          targetLoaderPath = join(dataDir, `${safeId}.${args.target_split}.loader.py`)
          writeFileEnsuringDir(targetLoaderPath, loaderPy.replace(`sys.argv[1] if len(sys.argv) > 1`, `"${args.target_split}" # pinned`))
        }

        const result: HfIngestResult = {
          manifestPath,
          loaderPath,
          datasetId: base.id,
          rows: null,
          splits,
          configNames,
          license: base.license ?? null,
        }
        m.trace.appendEvent("hf.ingest", `hf_ingest: ${args.dataset_id} → ${manifestPath}`, { dataset_id: args.dataset_id, manifestPath, loaderPath }, "main-agent")
        return JSON.stringify({ ...result, targetLoaderPath }, null, 2)
      },
    }),

    aion_hf_suggest: tool({
      description:
        "Recommend HF datasets for a given task contract. Runs a tiered search (broad goal + each keyword) and " +
        "ranks results by tag overlap + downloads. Designed to be called by `requirements-analyst` immediately " +
        "after the Task Contract is emitted. Emits a structured suggestion card per candidate.",
      args: {
        goal: z.string().describe("One-sentence task goal (from Task Contract)"),
        keywords: z.array(z.string()).default([]).describe("Domain keywords (e.g. ['ECG', 'arrhythmia', 'PTB-XL'])"),
        modality: z.enum(["text", "image", "audio", "video", "timeseries", "tabular", "multimodal"]).optional(),
        per_query_limit: z.number().int().min(1).max(20).default(5),
        top_k: z.number().int().min(1).max(20).default(5),
        dryRun: z.boolean().default(false),
      },
      async execute(args, _context) {
        if (args.dryRun) {
          return JSON.stringify({ dryRun: true, goal: args.goal, keywords: args.keywords, candidates: [] })
        }
        const queries = [args.goal, ...args.keywords].filter(Boolean)
        const seen = new Map<string, { summary: HfDatasetSummary; score: number; matchedTags: string[] }>()

        for (const q of queries) {
          const url = `${HF_API_BASE}/datasets?${new URLSearchParams({ search: q, limit: String(args.per_query_limit) }).toString()}`
          const data = await hfFetch<Array<Record<string, unknown>>>(url, {
            dryRun: args.dryRun,
            cacheDir: args.dryRun ? undefined : hfCacheDir,
            cacheKey: { endpoint: "search", query: q, limit: args.per_query_limit, task_categories: null, modality: args.modality ?? null },
          })
          if (args.dryRun) continue
          for (const raw of Array.isArray(data) ? data : []) {
            const summary = rawToSummary(raw)
            const tagSet = new Set(summary.tags.map(t => t.toLowerCase()))
            const keywordHits = args.keywords.filter(k => tagSet.has(k.toLowerCase())).length
            const goalTokens = args.goal.toLowerCase().split(/\W+/).filter(t => t.length > 3)
            const goalHits = goalTokens.filter(t => summary.id.toLowerCase().includes(t) || summary.description?.toLowerCase().includes(t)).length
            const score = keywordHits * 10 + goalHits * 3 + Math.log10(Math.max(1, summary.downloads))
            const existing = seen.get(summary.id)
            if (!existing || existing.score < score) {
              seen.set(summary.id, { summary, score, matchedTags: args.keywords.filter(k => tagSet.has(k.toLowerCase())) })
            }
          }
        }

        const ranked = [...seen.values()]
          .filter(({ summary }) => !args.modality || summary.modalities.includes(args.modality))
          .sort((a, b) => b.score - a.score)
          .slice(0, args.top_k)

        const cards = ranked.map(({ summary, score, matchedTags }) => ({
          datasetId: summary.id,
          url: `https://huggingface.co/datasets/${summary.id}`,
          license: summary.license ?? "UNKNOWN",
          sizeBucket: summary.sizeBucket,
          downloads: summary.downloads,
          tags: summary.tags.slice(0, 8),
          matchedTags,
          rationale: `score=${score.toFixed(1)} (keyword=${matchedTags.length} downloads=${summary.downloads})`,
        }))

        m.trace.appendEvent("hf.suggest", `hf_suggest: ${cards.length} candidates for goal="${args.goal}"`, { goal: args.goal, count: cards.length, top_k: args.top_k }, "main-agent")
        return JSON.stringify({ goal: args.goal, keywords: args.keywords, candidates: cards }, null, 2)
      },
    }),
  }
}
