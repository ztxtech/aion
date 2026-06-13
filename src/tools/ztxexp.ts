/**
 * Experiment-management tools (ztxexp = "ztx experiment").
 *
 * Enforces a rigid 7-directory experiment boundary so every experiment is
 * reproducible and isolated:
 *   data/ evaluation/ exp/ model/ module/ scripts/ outputs/
 *
 * Tools:
 *   `aion_ztxexp_init`     — scaffold the boundary dirs + README + main.py
 *   `aion_ztxexp_validate` — check the experiment respects the boundary
 *   `aion_ztxexp_run`      — spawn the experiment command, capture output,
 *                            and write a run.json manifest
 */
import { tool } from "@opencode-ai/plugin"
import type { CreateToolsArgs } from "./_shared"
import type { AionTools } from "./types"
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, readFileSync } from "node:fs"
import { join, relative, dirname } from "node:path"

const ZTXEXP_BOUNDARY_DIRS = ["data", "evaluation", "exp", "model", "module", "scripts", "outputs"] as const
type BoundaryDir = (typeof ZTXEXP_BOUNDARY_DIRS)[number]

const ZTXEXP_BOUNDARY_SET = new Set<string>(ZTXEXP_BOUNDARY_DIRS)

function findExperimentRoots(root: string): string[] {
  const expRoot = join(root, "exp")
  if (!existsSync(expRoot)) return []
  try {
    return readdirSync(expRoot, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => join(expRoot, d.name))
  } catch {
    return []
  }
}

function isInsideBoundary(filePath: string, expRoot: string): { inside: boolean; boundaryDir: string | null; relativePath: string } {
  const rel = relative(expRoot, filePath)
  if (rel.startsWith("..") || rel === filePath) return { inside: false, boundaryDir: null, relativePath: rel }
  const firstSegment = rel.split("/")[0] ?? ""
  if (ZTXEXP_BOUNDARY_SET.has(firstSegment) || firstSegment === "main.py" || firstSegment === "README.md" || firstSegment === ".ztxexp-manifest.json") {
    return { inside: true, boundaryDir: firstSegment as BoundaryDir | "main.py" | "README.md", relativePath: rel }
  }
  return { inside: false, boundaryDir: null, relativePath: rel }
}

function scanDirRecursive(dir: string, prefix: string = ""): string[] {
  const results: string[] = []
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        results.push(...scanDirRecursive(fullPath, relPath))
      } else {
        results.push(relPath)
      }
    }
  } catch { /* ignore */ }
  return results
}

function collectEmptyDirs(dirPath: string): string[] {
  const empty: string[] = []
  try {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.isDirectory() && ZTXEXP_BOUNDARY_SET.has(entry.name)) {
        const subPath = join(dirPath, entry.name)
        const files = scanDirRecursive(subPath)
        if (files.length === 0) {
          empty.push(entry.name)
        }
      }
    }
  } catch { /* ignore */ }
  return empty
}

export function createZtxexpTools(args: CreateToolsArgs): Partial<AionTools> {
  const { managers } = args
  const m = managers
  const z = tool.schema

  return {
    aion_ztxexp_init: tool({
      description:
        "Initialize a ztxexp experiment directory with the HARD directory boundaries: data/, evaluation/, exp/, model/, module/, scripts/, outputs/ plus main.py skeleton. This is a programmatic enforcement of the ztxexp contract — code without this structure will be flagged at the ts-critic review. Only directories that will actually have content should be created; pass `used_dirs` to specify which boundary directories the experiment will use.",
      args: {
        experiment_id: z.string().describe("Unique experiment id, e.g. 'lstm-bidir-v1'"),
        root: z.string().default(".").describe("Workspace root RELATIVE path (never absolute). Use \".\" for project root."),
        notes: z.string().optional().describe("Optional notes describing the experiment"),
        used_dirs: z.array(z.enum(["data", "evaluation", "exp", "model", "module", "scripts", "outputs"])).describe("ONLY the boundary directories this experiment will actually use. Empty dirs for unused boundaries will NOT be created. At minimum, specify 'exp' and 'outputs'."),
      },
      async execute(args, _context) {
        const cwd = m.ctx.directory
        const root = args?.root ?? "."
        if (root.startsWith("/") || /^[a-zA-Z]:/.test(root)) {
          return JSON.stringify({ status: "error", message: `root must be a RELATIVE path, got absolute: "${root}". Use "." or a relative subpath.` }, null, 2)
        }
        const expId = args.experiment_id
        const usedDirsArr = args.used_dirs ?? []
        const expRoot = join(cwd, root, "exp", expId)
        const usedDirs = new Set<string>(usedDirsArr)

        if (!usedDirs.has("exp")) usedDirs.add("exp")
        if (!usedDirs.has("outputs")) usedDirs.add("outputs")

        const dirsToCreate: string[] = []
        for (const d of ZTXEXP_BOUNDARY_DIRS) {
          if (usedDirs.has(d)) {
            dirsToCreate.push(join(expRoot, d))
          }
        }

        for (const d of dirsToCreate) {
          mkdirSync(d, { recursive: true })
        }

        const manifest = {
          experiment_id: expId,
          created_at: new Date().toISOString(),
          used_dirs: [...usedDirs],
          boundary_dirs: [...ZTXEXP_BOUNDARY_DIRS],
          notes: args.notes ?? "",
        }
        writeFileSync(join(expRoot, ".ztxexp-manifest.json"), JSON.stringify(manifest, null, 2), "utf-8")

        const boundaryLines = [...usedDirs].sort().map(d => {
          const descriptions: Record<string, string> = {
            data: "read-only data interface",
            evaluation: "metric functions + validity checks",
            exp: "config + orchestration logic (exp_fn(ctx) contract)",
            model: "model definitions, training loops, save/load",
            module: "reusable building blocks",
            scripts: "batch runs, analysis, helper scripts",
            outputs: "logs, plots, metrics.json, run.json, artifacts/",
          }
          return `- ${d}/ — ${descriptions[d] ?? ""}`
        }).join("\n")

        const readme = `# Experiment: ${expId}\n\n${args.notes ?? ""}\n\n## ztxexp HARD boundaries\n\n${boundaryLines}\n\n## Directory contract\n\n- ONLY these directories are allowed inside this experiment root.\n- Do NOT create directories outside this boundary set (e.g. models/, results/, plots/).\n- Files must be placed in the correct boundary directory:\n  - dataset loaders, splits → data/\n  - metric functions, eval protocols → evaluation/\n  - exp configs, exp_fn, orchestration → exp/\n  - model classes, training loops → model/\n  - reusable building blocks → module/\n  - batch scripts, analysis → scripts/\n  - results, logs, plots, checkpoints → outputs/\n- main.py is the unified entry point.\n\nSuccess criterion: run.json.status == "succeeded"\n`
        writeFileSync(join(expRoot, "README.md"), readme, "utf-8")

        const mainPy = `"""Unified experiment entry for ${expId}.

Usage:
    python main.py --experiment ${expId} --config config.json [--seed 42] [--device cpu]
"""
import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Experiment: ${expId}")
    parser.add_argument("--experiment", default="${expId}")
    parser.add_argument("--config", required=True, help="Path to experiment config JSON")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")

    config = json.loads(config_path.read_text(encoding="utf-8"))
    print(f"[${expId}] Config loaded from {config_path}")
    print(f"[${expId}] Seed={args.seed} Device={args.device}")

    # TODO: import from data/, model/, evaluation/, exp/ and run exp_fn


if __name__ == "__main__":
    main()
`
        writeFileSync(join(expRoot, "main.py"), mainPy, "utf-8")

        m.trace.appendEvent("ztxexp.run", `ztxexp init: ${expId}`, { expId, root, usedDirs: [...usedDirs] })
        return JSON.stringify({
          status: "initialized",
          experiment_id: expId,
          root: `${root}/exp/${expId}`,
          created_dirs: [...usedDirs].sort(),
          skipped_empty_dirs: ZTXEXP_BOUNDARY_DIRS.filter(d => !usedDirs.has(d)),
          files: [".ztxexp-manifest.json", "README.md", "main.py", ...[...usedDirs].sort().map(d => `${d}/`)],
          message: `ztxexp experiment ${expId} initialized. Only directories that will be used were created. Place files strictly within the boundary directories.`,
        }, null, 2)
      },
    }),

    aion_ztxexp_validate: tool({
      description:
        "Validate the ztxexp experiment directory structure. Reports: (1) boundary violations (files outside the 7 allowed dirs), (2) empty unused directories, (3) used directories that exist but contain no real content. Use after coder has written files to check compliance.",
      args: {
        experiment_id: z.string().describe("Experiment id to validate"),
        root: z.string().default(".").describe("Workspace root RELATIVE path (never absolute). Use \".\" for project root."),
      },
      async execute(args, _context) {
        const cwd = m.ctx.directory
        const root = args?.root ?? "."
        if (root.startsWith("/") || /^[a-zA-Z]:/.test(root)) {
          return JSON.stringify({ status: "error", message: `root must be a RELATIVE path, got absolute: "${root}". Use "." or a relative subpath.` }, null, 2)
        }
        const expRoot = join(cwd, root, "exp", args.experiment_id)

        if (!existsSync(expRoot)) {
          return JSON.stringify({ status: "error", message: `Experiment root not found: ${expRoot}` }, null, 2)
        }

        const manifestPath = join(expRoot, ".ztxexp-manifest.json")
        let manifest: { used_dirs?: string[]; boundary_dirs?: string[] } = {}
        if (existsSync(manifestPath)) {
          try {
            manifest = JSON.parse(readFileSync(manifestPath, "utf-8"))
          } catch { /* ignore */ }
        }

        const allFiles = scanDirRecursive(expRoot)

        const violations: string[] = []
        const usedBoundaries: Record<string, string[]> = {}
        for (const dir of ZTXEXP_BOUNDARY_DIRS) { usedBoundaries[dir] = [] }
        const rootFiles: string[] = []

        for (const file of allFiles) {
          const { inside, boundaryDir } = isInsideBoundary(file, "")
          // normalize: file is relative to expRoot
          const check = isInsideBoundary(join(expRoot, file), expRoot)
          if (check.inside && check.boundaryDir && ZTXEXP_BOUNDARY_SET.has(check.boundaryDir)) {
            usedBoundaries[check.boundaryDir].push(file)
          } else if (!ZTXEXP_BOUNDARY_DIRS.some(d => file.startsWith(`${d}/`)) && file !== "main.py" && file !== "README.md" && file !== ".ztxexp-manifest.json") {
            violations.push(file)
          }
        }

        const emptyDirs: string[] = []
        const populatedDirs: string[] = []
        for (const dir of ZTXEXP_BOUNDARY_DIRS) {
          if (usedBoundaries[dir].length === 0 && existsSync(join(expRoot, dir))) {
            const subFiles = scanDirRecursive(join(expRoot, dir))
            if (subFiles.length === 0) {
              emptyDirs.push(dir)
            } else {
              populatedDirs.push(dir)
            }
          } else if (usedBoundaries[dir].length > 0) {
            populatedDirs.push(dir)
          }
        }

        const declaredUsedDirs = new Set(manifest.used_dirs ?? [])
        const undeclaredUsedDirs: string[] = []
        for (const dir of ZTXEXP_BOUNDARY_DIRS) {
          if (!declaredUsedDirs.has(dir) && populatedDirs.includes(dir)) {
            undeclaredUsedDirs.push(dir)
          }
        }

        const missingButNeeded: string[] = []
        for (const dir of declaredUsedDirs) {
          if (!existsSync(join(expRoot, dir))) {
            missingButNeeded.push(dir)
          }
        }

        m.trace.appendEvent("ztxexp.validate", `ztxexp validate: ${args.experiment_id}`, {
          violations: violations.length,
          emptyDirs: emptyDirs.length,
          populatedDirs: populatedDirs.length,
        })

        const isClean = violations.length === 0 && emptyDirs.length === 0 && missingButNeeded.length === 0

        return JSON.stringify({
          experiment_id: args.experiment_id,
          root: expRoot,
          is_clean: isClean,
          violations: violations.length > 0 ? violations : undefined,
          empty_dirs: emptyDirs.length > 0 ? emptyDirs : undefined,
          populated_dirs: populatedDirs,
          undeclared_used_dirs: undeclaredUsedDirs.length > 0 ? undeclaredUsedDirs : undefined,
          missing_but_needed: missingButNeeded.length > 0 ? missingButNeeded : undefined,
          manifest: manifest.used_dirs ? manifest : undefined,
          recommendation: isClean
            ? "Directory structure is clean and compliant."
            : [
                violations.length > 0 ? `Move these files into the correct boundary directory: ${violations.join(", ")}` : undefined,
                emptyDirs.length > 0 ? `Remove unused empty directories: ${emptyDirs.join(", ")}` : undefined,
                missingButNeeded.length > 0 ? `Create missing declared directories: ${missingButNeeded.join(", ")}` : undefined,
              ].filter(Boolean).join("; "),
        }, null, 2)
      },
    }),

    aion_ztxexp_run: tool({
      description:
        "Run a ztxexp experiment. The run_fn contract must return { status: 'succeeded' | 'failed', metrics: {...}, artifacts: [...] }. Post-experiment, an automatic SHAP/feature-attribution reminder is logged. Coder is the only agent authorized to use this tool. Before running, validates that the experiment directory exists and has a .ztxexp-manifest.json.",
      args: {
        experiment_id: z.string(),
        config_path: z.string().describe("Path to exp config JSON"),
        command: z.string().describe("Shell command to execute the experiment"),
        timeout_ms: z.number().int().min(0).default(600_000),
      },
      async execute(args, context) {
        const cwd = context?.directory ?? m.ctx.directory
        const expRoot = join(cwd, "exp", args.experiment_id)

        if (!existsSync(expRoot)) {
          return JSON.stringify({ status: "failed", error: `Experiment directory not found: ${expRoot}. Run aion_ztxexp_init first.` }, null, 2)
        }

        const manifestPath = join(expRoot, ".ztxexp-manifest.json")
        if (!existsSync(manifestPath)) {
          return JSON.stringify({ status: "failed", error: `No .ztxexp-manifest.json found at ${manifestPath}. The experiment was not initialized via aion_ztxexp_init.` }, null, 2)
        }

        const outputsDir = join(expRoot, "outputs")
        if (!existsSync(outputsDir)) {
          mkdirSync(outputsDir, { recursive: true })
        }

        m.trace.appendEvent("ztxexp.run", `ztxexp run: ${args.experiment_id}`, {
          expId: args.experiment_id,
          config: args.config_path,
        })
        const { spawn } = await import("node:child_process")
        try {
          const child = spawn("sh", ["-c", args.command], { cwd, timeout: args.timeout_ms })
          let stdout = ""
          let stderr = ""
          for await (const chunk of child.stdout) stdout += chunk.toString()
          for await (const chunk of child.stderr) stderr += chunk.toString()
          const exitCode = (await new Promise<number>((resolve) => child.on("close", resolve))) ?? 1
          const status = exitCode === 0 ? "succeeded" : "failed"
          const runJson = {
            experiment_id: args.experiment_id,
            status,
            exit_code: exitCode,
            timestamp: new Date().toISOString(),
            has_stderr: stderr.length > 0,
          }
          writeFileSync(join(outputsDir, "run.json"), JSON.stringify(runJson, null, 2), "utf-8")
          m.trace.appendEvent("ztxexp.run", `ztxexp run ${args.experiment_id} -> ${status}`, {
            expId: args.experiment_id,
            status,
            exitCode,
          })
          return JSON.stringify({ status, exit_code: exitCode, stdout_tail: stdout.slice(-2000), stderr_tail: stderr.slice(-2000), post_experiment: { shap_required: true, math_modeling_required: true, drift_analysis_required: true } }, null, 2)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          m.trace.appendEvent("ztxexp.run", `ztxexp run ${args.experiment_id} threw`, { error: msg })
          return JSON.stringify({ status: "failed", error: msg }, null, 2)
        }
      },
    }),
  }
}