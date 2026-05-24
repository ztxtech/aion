# Rebuttal Protocol

## 1. Purpose

Define how other roles must answer point by point after `ts-critic` raises blockers, and how `ts-critic` rechecks them.

This protocol turns `continue after blocker` from loose talk into structured rebuttal and structured recheck.

## 2. Applies To

- `ts-critic`
- Any subagent blocked by `ts-critic`
- Main-agent blocker handoff logic

## 3. Required Fields

### 3.1 Agent Rebuttal Fields

- `issue`
- `accepted`
- `current_evidence`
- `fix_plan`
- `missing_evidence`
- `status`
- `remaining_blocker`
- `request_recheck`

### 3.2 TS Critic Recheck Fields

- `issue`
- `verdict`
- `reason`
- `remaining_gap`
- `required_next_change`
- `stop_signal`
- `todo_action`
- `remaining_action_count`
- `unblocked`

## 4. Template

```yaml
rebuttal:
  issue: string
  accepted: true | false | partial
  current_evidence:
    - string
  fix_plan:
    - string
  missing_evidence:
    - string
  status: unresolved | partial | resolved
  remaining_blocker: string
  request_recheck: string

ts_ts-critic_recheck:
  issue: string
  verdict: accept | partial_accept | reject
  reason: string
  remaining_gap:
    - string
  required_next_change:
    - string
  stop_signal: continue | rebuttal-required | allow-stop
  todo_action: keep | back_to_in_progress | back_to_todo | add_followup
  remaining_action_count: integer
  unblocked: true | false
```

## 5. Validation Rules

- As long as the flow is still in rebuttal mode, point-by-point replies cannot be skipped.
- `ts_ts-critic_recheck.stop_signal` must be explicit.
- When `stop_signal = allow-stop`, `remaining_action_count` must be `0`.
- When `verdict = reject`, `unblocked` cannot be `true`.
- `todo_action` must match the `verdict`.

## 6. Evolution Notes

- If an automatic validator is added later, this protocol field set should be its input.
- Rebuttal is a loop protocol, not a one-time polite reply.
