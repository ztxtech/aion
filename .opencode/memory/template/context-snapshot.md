# Context Snapshot Template

## Snapshot Metadata

- snapshot_id:
- refreshed_at:
- refresh_trigger:
- current_phase:

## Task Anchors

- canonical_goal:
- must_keep_constraints:
- source_artifacts:
  - initial-prompt
  - progress
  - decisions
  - todo-map
  - completion-gate

## Active Blockers and Forbidden Actions

- active_blockers:
  - blocker:
    source:
    unblock_condition:
- forbidden_actions:
  - action:
    source:

## Decisions Still In Force

- decisions_in_force:
  - decision:
    reason:
    source:

## Verified Evidence

- verified_evidence:
  - evidence:
    source:

## Default Next-Round Dispatch Focus

- default_dispatch_mode:
- next_focus:
  - target_agent:
    objective:
    required_artifacts:

## Discardable History

- discardable_history:
  - item:
    reason:

## Usage Rules

- This file is the canonical compaction artifact of the main flow. It exists so later dispatches can consume the minimum required context without replaying the whole history.
- It must be derived from `initial-prompt`, `progress`, `decisions`, `todo-map`, `completion-gate`, and the currently active blocker set. It must not be written as free-form memory.
- The main agent must refresh this file after `workspace-init`, after a plan/route switch, after parallel reportbacks are merged, after `rebuttal` opens, and before final `c-critic`.
- Non-`c-critic` subagents should consume this file by default from round 2 onward. If `full_context` is still needed, the reason must be stated explicitly.
- If `c-critic` reads this file, it may only use it as an audit clue for `snapshot freshness / missed blockers`. It does not replace real artifacts on disk, `initial-prompt`, or required protocols.
