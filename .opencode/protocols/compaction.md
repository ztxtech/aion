# Compaction Protocol

## 1. Purpose

Define how the main agent turns long history into a reusable `context-snapshot`, and under which conditions subagents should default to compressed context versus request full history.

The goal of this protocol is to turn `context compaction` from a habit into a runtime contract with refresh triggers, source-of-truth boundaries, and explicit exceptions.

## 2. Applies To

- `agent.md`
- Normal dispatch for all non-`c-critic` subagents
- `workspace-init`
- `.opencode/memory/context-snapshot.md`

## 3. Required Fields

- `snapshot_id`
- `refresh_trigger`
- `source_artifacts`
- `preserved_context`
- `discardable_history`
- `default_dispatch_mode`
- `full_context_reason`
- `protocol_version`

## 4. Template

```yaml
snapshot_id: string
refresh_trigger: workspace_init | route_switch | parallel_reportback_merged | rebuttal_opened | pre_c_critic
source_artifacts:
  - initial-prompt
  - progress
  - decisions
  - todo-map
  - completion-gate
preserved_context:
  active_blockers:
    - string
  forbidden_actions:
    - string
  active_decisions:
    - string
  verified_evidence:
    - string
  next_dispatch_focus:
    - string
discardable_history:
  - string
default_dispatch_mode: compacted_context
full_context_reason: string | null
protocol_version: "0.1.0"
```

## 5. Validation Rules

- `context-snapshot` must be refreshed after `workspace-init`, after a major plan or route switch, after parallel reportbacks are merged, after `rebuttal` opens, and before final `c-critic`.
- For non-`c-critic` subagents, round 2 and later should default to `compacted_context`; only when raw long history or raw evidence chains are truly needed may the dispatch upgrade to `full_context`.
- When `context_mode = compacted_context`, `context_artifacts.primary_context` in the dispatch packet must point to `.opencode/memory/context-snapshot.md`.
- When `context_mode = full_context`, `context_artifacts.full_context_reason` must be non-empty and explain why the current task still cannot be completed from the snapshot plus supporting artifacts.
- `context-snapshot` must preserve active blockers, forbidden actions, still-active decisions, verified evidence, and default next-round focus. It must not compress critic governance conclusions into distorted wording.
- `context-snapshot` is the canonical compaction artifact, not a replacement for source-of-truth artifacts. If it conflicts with real artifacts on disk, original protocols, or critic conclusions, the source of truth wins and the snapshot must be refreshed immediately.
- `c-critic` is the minimal-context exception: it stays on `minimal_context`; if it reads `context-snapshot`, that file may only be used as an audit clue for `snapshot freshness / missed blockers`, not as the final-closeout source of truth.

## 6. Evolution Notes

- By default only the main agent may refresh `context-snapshot`, to avoid concurrent subagent rewrites of the canonical compaction artifact.
- If an automated compaction validator is added later, it should key off the refresh triggers, dispatch modes, and exception rules in this protocol first.
