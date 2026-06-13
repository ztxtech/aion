// AION Protocols — hardcoded governance constants
// These are NOT soft-prompt markdown files. They are programmatic hard gates
// enforced by the plugin tool/hook system. Changes require a rebuild.
// Protocols were previously deployed as .opencode/protocols/*.md — now they
// live here as source-of-truth constants, not user-editable soft prompts.

export { AION_GOVERNANCE_HEADER, AION_TIME_SERIES_RULES, AION_DISPATCH_PROTOCOL, AION_REPORTBACK_PROTOCOL, AION_STOP_GO_PROTOCOL, AION_MEMORY_HIERARCHY } from "./governance"

export const AION_COMPACTION_PROTOCOL = `# Compaction Protocol

## 1. Purpose

Context compaction keeps the conversation within token limits while preserving task-critical information. The main agent triggers compaction when the conversation approaches the model's context window limit.

## 2. What Gets Compacted

- Prior tool outputs that have been fully processed
- Intermediate reasoning steps where conclusions are already recorded
- Redundant context that exists in memory files or on disk
- Subagent outputs that have been merged into the main flow

## 3. What Gets Preserved

- The original task prompt (from initial-prompt.md)
- Current blockers and unresolved items
- Active plan steps and TODO state
- Recent tool outputs still being processed
- Critic verdicts and governance state

## 4. When Compaction Fires

- On the \`experimental.session.compacting\` hook
- When context-snapshot.md needs refresh before critical governance gates (pre-stop, plan switch, parallel reportback merge, rebuttal state change)

## 5. How to Compact

- Read all memory files to reconstruct essential state
- Write a fresh context-snapshot.md with: goal, progress, blockers, decisions, next steps
- The hook returns the snapshot content as injected context
- Trace the compaction event
`

export const AION_LIFECYCLE_PROTOCOL = `# Lifecycle Protocol

## 1. Initialization Phase

1. Run \`aion_workspace_init\` — create directories, memory templates, trace
2. Write original prompt to \`initial-prompt.md\`
3. Write initial \`context-snapshot.md\`
4. Classify runtime mode: \`run + autonomous\`, \`tui + autonomous\`, \`tui + interactive\`

## 2. Execution Loop

1. Dispatch subagents in parallel when slices don't block each other
2. Merge results, identify agreements and conflicts
3. Pass ts-critic blockers in full
4. As long as blockers exist, include explicit blocker list in next dispatch

## 3. Governance Gates

- Pre-stop gate (HARD): brain-storm → deep-reasoning → ts-critic allow-stop → c-critic
- Rebuttal mode: collect point-by-point replies → ts-critic review
- Evolution: when current roles/skills cannot cover an ability gap

## 4. Closeout

- All file paths must be verified to exist on disk
- TODO must not contain end/stop/delivery-complete items
- Final summary requires ts-critic review
- c-critic cold-start review must find no remaining blockers
`

export const AION_REBUTTAL_PROTOCOL = `# Rebuttal Protocol

## 1. Entry Condition

When ts-critic outputs \`rebuttal-mode\`, the main agent enters rebuttal phase.

## 2. Rebuttal Structure

Each rebuttal point MUST include:
- The original claim or assessment being rebutted
- The specific evidence contradicting it
- The corrected assessment with supporting evidence
- Whether this changes the stop-go verdict

## 3. Processing

- The main agent collects all rebuttal points from subagents
- Forwards them to ts-critic for review
- ts-critic decides: maintain blocker, accept rebuttal, or modify verdict
- If ts-critic maintains blocker: unresolved_blockers list is updated

## 4. Exit

Rebuttal mode exits only when:
- ts-critic explicitly outputs \`allow-stop\`, OR
- ts-critic outputs a new \`absolutely-cannot-stop-now\` with updated blocker list, starting a new normal round
`

export const AION_RUNTIME_EVENTS_PROTOCOL = `# Runtime Events Protocol

## 1. Trace Events

All significant events are logged to \`.opencode/trace.md\` and via the trace system:
- \`dispatch.created\` — when a subagent is dispatched
- \`reportback.received\` — when a subagent reports back
- \`rebuttal.entered\` — when rebuttal mode starts
- \`stopgo.updated\` — when stop-go signal changes
- \`completion-gate.refreshed\` — when completion gate is updated
- \`compaction.finished\` — when context compaction completes
- \`plan.switched\` — when the plan is changed
- \`branch.merged\` — when parallel branches merge
- \`governance.blocker\` — when a blocker is recorded/resolved
- \`leakage.detected\` — when leakage guard fires
- \`memory.sync\` — when memory is written
- \`ztxexp.run\` / \`ztxexp.validate\` — experiment lifecycle
- \`critic.review\` / \`critic.verdict\` — critic reviews
- \`auto-continue\` — when the session auto-continues
- \`file.written\` — when files are written

## 2. Memory Sync Events

Memory writes trigger \`memory.sync\` events and are traceable.

## 3. Session Idle

When the session is idle, the session.idle hook checks whether auto-continue is appropriate based on governance state.
`

export const AION_MEMORY_SYNC_PROTOCOL = `# Memory Sync Protocol

## 1. Memory Files

- \`initial-prompt.md\` — anti-drift baseline, append-only
- \`context-snapshot.md\` — refreshed at key nodes
- \`progress.md\` — current stage and actions
- \`features.md\` — delivered/planned features
- \`decisions.md\` — structural decisions
- \`todo-map.md\` — plan-step ↔ TODO mapping
- \`completion-gate.md\` — pre-stop gate state
- \`positive.md\` — verified priors
- \`negative.md\` — failed assumptions
- \`relation.md\` — role relations

## 2. Sync Rules

- Memory writes go through \`aion_memory_sync\` tool only
- \`initial-prompt.md\` is append-only, never overwritten
- \`context-snapshot.md\` is refreshed at: plan switch, parallel reportback merge, rebuttal state change, pre-stop gate
- All other memory files use \`append\` or \`replace-section\` mode

## 3. Content Rules

- No leakage content in any memory file
- No end/stop/done markers in TODO items
- Blockers must include: description, evidence, forbidden action, unblock condition
`