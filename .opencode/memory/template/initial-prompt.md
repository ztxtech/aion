# Initial Prompt Baseline Template

## Original Prompt Snapshot

- captured_at:
- task_language:
- source:
- raw_prompt:

## Initial Task Anchors

- canonical_goal:
- explicit_metrics:
- target_threshold:
- non_goals:
- must_keep_constraints:

## Later Clarifications

- updated_at:
  reason:
  delta:

## Usage Rules

- `Original Prompt Snapshot` and `Initial Task Anchors` should be append-only by default. Do not overwrite them.
- Right after `workspace-init`, the main agent must write the original prompt of the current task, or the earliest equivalent wording.
- Before final closeout, `c-critic` must read this file and check whether the final artifacts still match the original goal, metrics, and non-goals.
