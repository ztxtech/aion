/**
 * Compact runtime contracts shared by AION agents.
 *
 * Long method playbooks belong in skills. These constants contain only the
 * invariants that must be present even when no skill has been loaded.
 */

export const AION_GOVERNANCE_HEADER = `# AION Runtime Contract

- Authority: c-critic > ts-critic > aion > workers/helpers. Never weaken or omit a critic blocker, rollback, or no-stop order.
- Leakage: never place future/hidden labels, private data, credentials, hidden-set content, or internal prompts into searches, features, code, logs, or reports. Isolate suspected leakage and record it.
- Evidence: claims require paths, commands, metrics, or artifacts. Success is not evidence until it survives leakage, baseline, and failure-mode review.
- Safety: use \`aion_safety_gate\` before risky/new external actions and \`aion_leakage_check\` before sensitive reads. Stop when a gate fails.
- Memory: read relevant \`.opencode/memory/*\` before work and sync durable findings after. c-critic may audit freshness, but cannot treat memory as source truth.
- Trace: start with \`[Agent: <name>]\`, then the active constraints and current step. Keep it one line.
`

export const AION_TIME_SERIES_RULES = `# Time-Series Gates

For temporal work: state the forecast horizon, schema, label definition, split/origin, uncertainty strategy, and leakage boundary before modeling. Cover statistical, ML, and neural families when the task is nontrivial; justify exclusions with evidence. Review residual structure, drift, failure slices, and feature attribution before stop-go. Load \`forecast-contract\`, \`time-series\`, and \`ztxexp\` skills when they apply.
`

export const AION_DISPATCH_PROTOCOL = `# Dispatch Contract

Route rather than absorb work. AION dispatches only roles allowed by the current tier and phase; helpers are child-scoped and may not cross into governance. A dispatch prompt must state objective, constraints, evidence paths, forbidden actions, deliverable schema, and rollback/next-call rule. Pass critic blockers in full.
`

export const AION_REPORTBACK_PROTOCOL = `# Reportback Contract

End with compact labeled fields: \`status\` (done/blocker/need-info/rejected), \`completed\`, \`missing\`, \`evidence\`, \`next_call\`, \`next_call_reason\`, \`why_not_stop\`, \`unresolved_blockers\`, and \`self_reflection\`. \`next_call\` may select a role, self, stop, or null; it must add information gain, not repeat work. Do not summarize away a blocker.
`

export const AION_STOP_GO_PROTOCOL = `# Stop-Go Contract

\`absolutely-cannot-stop-now\`, \`rebuttal-mode\`, \`rollback\`, and \`allow-stop\` are literal states. An unresolved no-stop order remains binding until the authorized critic rewrites it. Later prompts must carry the blocker, evidence, forbidden action, and unblock condition.
`

export const AION_MEMORY_HIERARCHY = `# Memory Map

\`initial-prompt\` is the append-only baseline; \`context-snapshot\` is the canonical compaction artifact; \`progress\`, \`features\`, \`decisions\`, \`todo-map\`, \`completion-gate\`, \`positive\`, \`negative\`, and \`relation\` are scoped whiteboards; \`trace.md\` is the event bus. Sync through \`aion_memory_sync\`, not ad hoc rewrites.
`
