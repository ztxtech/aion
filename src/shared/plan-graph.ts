export type PlanState = "todo" | "in-progress" | "done"

export type PlanItem = {
  id: string
  planStep: string
  branchId: string
  wave: number
  owner: string
  state: PlanState
  frontierState: string
  compareGate: string
  updateTrigger: string
  rollbackRule: string
  loopHandoff: string
  dependsOn: string[]
  addedAt: string
  updatedAt: string
}

export type PlanGraph = {
  items: PlanItem[]
  layers: string[][]
  invalidDependencies: string[]
  hasCycle: boolean
}

export function parseDependencies(value: string | undefined): string[] {
  if (!value) return []
  return [...new Set(value.split(/[,\s]+/).filter(Boolean))]
}

export function parsePlanMap(content: string): PlanItem[] {
  const items: PlanItem[] = []
  const blocks = content.split(/####\s+/).slice(1)
  for (const block of blocks) {
    const idMatch = block.match(/^TODO-(\d+)/)
    if (!idMatch) continue
    const cleanedBlock = block.replace(/\*\*([^*]+)\*\*/g, "$1")
    const getField = (name: string) => {
      // Anchored per line with [ \t] only: an empty value such as
      // "Depends on: " must never let \s* swallow the newline and capture the
      // following "added:" line as the value.
      const match = cleanedBlock.match(new RegExp(`^-[ \\t]*${name}:[ \\t]*(.*)$`, "m"))
      return match?.[1]?.trim().replace(/\*\*/g, "") ?? ""
    }
    items.push({
      id: `TODO-${idMatch[1]}`,
      planStep: getField("Plan step"),
      branchId: getField("branch_id"),
      wave: Number.parseInt(getField("Wave") || "0", 10),
      owner: getField("Owner"),
      state: ((getField("State") || "todo") as PlanState),
      frontierState: getField("Frontier state"),
      compareGate: getField("Compare gate"),
      updateTrigger: getField("Update trigger"),
      rollbackRule: getField("Rollback rule"),
      loopHandoff: getField("Loop handoff"),
      dependsOn: parseDependencies(getField("Depends on")),
      addedAt: getField("added"),
      updatedAt: getField("updated"),
    })
  }
  return items
}

/**
 * Items whose dependencies are all satisfied and which are not done yet: the
 * set a scheduler is allowed to start right now. Unknown dependency ids are
 * treated as satisfied, matching buildPlanGraph.
 */
export function planFrontier(items: PlanItem[]): string[] {
  const ids = new Set(items.map((item) => item.id))
  const completed = new Set(
    items.filter((item) => item.state === "done").map((item) => item.id),
  )
  return items
    .filter((item) => item.state !== "done")
    .filter((item) => item.dependsOn.every((id) => !ids.has(id) || completed.has(id)))
    .map((item) => item.id)
}

export function dependencyEdges(
  items: PlanItem[],
): Array<{ from: string; to: string }> {
  const ids = new Set(items.map((item) => item.id))
  return items.flatMap((item) =>
    item.dependsOn
      .filter((id) => ids.has(id))
      .map((id) => ({ from: id, to: item.id })),
  )
}

export function buildPlanGraph(items: PlanItem[]): PlanGraph {
  const ids = new Set(items.map((item) => item.id))
  const invalidDependencies = [
    ...new Set(items.flatMap((item) => item.dependsOn.filter((id) => !ids.has(id)))),
  ]
  const remaining = new Set(items.map((item) => item.id))
  const completed = new Set<string>()
  const layers: string[][] = []

  while (remaining.size > 0) {
    const ready = items
      .filter((item) => remaining.has(item.id))
      .filter((item) => item.dependsOn.every((id) => !ids.has(id) || completed.has(id)))
      .map((item) => item.id)
    if (ready.length === 0) return { items, layers, invalidDependencies, hasCycle: true }
    layers.push(ready)
    for (const id of ready) {
      remaining.delete(id)
      completed.add(id)
    }
  }

  return { items, layers, invalidDependencies, hasCycle: false }
}
