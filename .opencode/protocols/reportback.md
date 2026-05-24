# Reportback Protocol

## 1. Purpose

Define the shared format every subagent must use when it sends results back to the main agent after finishing one work slice.

The goal of this protocol is to let the main agent summarize results from stable fields, not from writing style.

## 2. Applies To

- `requirements-analyst`
- `information-collector`
- `coder`
- `ts-critic`
- `c-critic`
- Any subagent added later

## 3. Required Fields

Every reportback packet must include these fields:

- `status`
- `completed_work`
- `remaining_gaps`
- `new_risks`
- `memory_updates`
- `rule_or_protocol_updates`
- `suggested_next_step`
- `suggested_next_agent`
- `follow_up_actions`
- `can_self_continue`
- `self_critique`
- `why_not_stop`

## 4. Template

```yaml
status: done | blocked | partial
completed_work:
  - string
remaining_gaps:
  - string
new_risks:
  - string
memory_updates:
  positive:
    - string
  negative:
    - string
  relation:
    - string
  trace_events:
    - string
rule_or_protocol_updates:
  - string
suggested_next_step: string
suggested_next_agent: string
follow_up_actions:
  - string
can_self_continue: true | false
self_critique:
  - string
why_not_stop: string
```

## 5. Validation Rules

- `status` must stay inside the allowed enum.
- Even when `status = done`, it must still say clearly whether `remaining_gaps` is empty.
- If `follow_up_actions` is not empty, `can_self_continue` cannot be `false`.
- `self_critique` must not be empty. Even if no issue is found, it must explain why this self-critique did not trigger another round by the same agent.
- `why_not_stop` must not be empty. Even if the work can move to the next step, it must explain why moving forward is allowed.
- `memory_updates` is only a suggestion area. It does not mean direct permission to write memory.
- If the reportback comes from `ts-critic` or `c-critic`, any blocker, rollback, stop-go, forbidden-action, or final-closeout conclusion inside it must not be weakened, shortened, or turned into a distorted summary by lower layers.

## 6. Evolution Notes

- If new fields are added later, try to extend without breaking current summary logic.
- If there are multi-level agent stacks later, keep using this protocol.
