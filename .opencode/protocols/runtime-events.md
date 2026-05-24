# Runtime Events Protocol

## 1. Purpose

Define how the `agent harness` writes key runtime state changes as structured events, so `dispatch`, `reportback`, `rebuttal`, `stop-go`, and `completion-gate` do not live only in static docs.

## 2. Applies To

- `agent.md`
- Reportback and blocker flow of all subagents
- State updates for `todo-map`, `completion-gate`, and progress / feature artifacts

## 3. Required Fields

- `event_id`
- `event_type`
- `task_id`
- `source`
- `timestamp`
- `payload_summary`
- `artifact_updates`
- `protocol_version`

## 4. Template

```yaml
event_id: string
event_type: dispatch_created | reportback_received | rebuttal_opened | rebuttal_reviewed | stop_go_emitted | completion_gate_updated | context_compacted | artifact_synced | git_repo_initialized | git_checkpoint_created
task_id: string
source: agent | requirements-analyst | information-collector | coder | ts-critic | c-critic
timestamp: string
payload_summary: string
artifact_updates:
  - progress
  - feature
  - todo-map
  - completion-gate
  - context-snapshot
protocol_version: "0.3.0"
```

## 5. Validation Rules

- Every event must have a unique `event_id`.
- `event_type` must stay inside the allowed enum.
- `stop_go_emitted` and `completion_gate_updated` events must be written into runtime logs explicitly.
- `context_compacted` events must be written into runtime logs explicitly, with a short summary of the refresh trigger, source artifacts referenced, and the history range now safe to drop.
- `git_repo_initialized` and `git_checkpoint_created` events must also be written into runtime logs explicitly, with a short summary of the checkpoint purpose, impact scope, and commit identifier.
- When `artifact_updates` is not empty, it must reference only existing artifact names.

## 6. Evolution Notes

- This is the minimal protocol for the runtime event stream. It does not replace the artifacts themselves. The local git checkpoint history is also only a detail-level replay layer, not a replacement for memory / trace.
- If a real event handler is added later, this protocol should stay as the compatibility baseline.
