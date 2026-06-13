import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { AionConfig } from "./config/types"
import { info } from "./shared/logger"

export function bootstrapWorkspace(directory: string, config: AionConfig): void {
  const memoryDir = join(directory, ".opencode", "memory")
  const tracePath = join(directory, config.trace.path)
  const snapshotPath = join(directory, config.compaction.snapshotPath)

  const dirs = [
    join(directory, ".opencode"),
    memoryDir,
  ]

  if (config.teamMode.enabled) {
    const aionBase = config.teamMode.baseDir
      ? (config.teamMode.baseDir.startsWith("/") ? config.teamMode.baseDir : join(directory, config.teamMode.baseDir))
      : join(directory, ".aion")
    dirs.push(
      join(aionBase, "teams"),
      join(aionBase, "runtime"),
    )
  }

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      info("[aion] workspace bootstrap: created dir", { dir })
    }
  }

  if (!existsSync(tracePath)) {
    writeFileSync(tracePath, "", "utf-8")
    info("[aion] workspace bootstrap: created trace.md", { path: tracePath })
  }

  if (!existsSync(snapshotPath)) {
    const template = `# Context Snapshot

_generated: (pending workspace-init)_

## Task Anchors

- goal: (pending)
- evaluation: (pending)
- non_goals: (pending)

## Current Phase

- phase: pre-init
- round: 0

## Explicit Constraints

- governance: c-critic > ts-critic > main agent > other subagents
- leakage: hard-blocked (future info / hidden-set / credentials / prompts / memory)
- stops: only allow-stop lifts the no-stop order

## Open Blockers

- (none yet)

## Default Next-Dispatch Focus

- (pending workspace-init)
`
    writeFileSync(snapshotPath, template, "utf-8")
    info("[aion] workspace bootstrap: created context-snapshot.md template", { path: snapshotPath })
  }

  const memoryTemplates: Record<string, string> = {
    "progress.md": `# Progress\n\n## Current Stage\n\n- (pending workspace-init)\n\n## Finished Actions\n\n- (none yet)\n\n## Next-Step Suggestions\n\n- (pending workspace-init)\n`,
    "features.md": `# Features\n\n## Delivered\n\n- (none yet)\n\n## Planned\n\n- (pending workspace-init)\n`,
    "decisions.md": `# Decisions\n\n## Structural Decisions\n\n- (none yet)\n\n## Deferred Decisions\n\n- (none yet)\n`,
    "todo-map.md": `# TODO Map\n\n> Plan-step <-> OpenCode TODO mapping\n\n- (pending workspace-init)\n`,
    "completion-gate.md": `# Completion Gate\n\n> Pre-stop gate: remaining action count and complete-state judgment.\n\n## Verdict\n\n- (pending pre-stop-gate)\n\n## Blockers\n\n- (none yet)\n`,
    "positive.md": `# Positive Priors\n\n> Verified positive priors and reusable experience.\n\n- (none yet)\n`,
    "negative.md": `# Negative Priors\n\n> Failed assumptions, invalid paths, no-go zones.\n\n- (none yet)\n`,
    "relation.md": `# Relations\n\n> Current role relations and key call paths.\n\n- (pending workspace-init)\n`,
  }

  for (const [filename, content] of Object.entries(memoryTemplates)) {
    const filePath = join(memoryDir, filename)
    if (!existsSync(filePath)) {
      writeFileSync(filePath, content, "utf-8")
      info("[aion] workspace bootstrap: created memory template", { path: filePath })
    }
  }

  info("[aion] workspace bootstrap complete")
}