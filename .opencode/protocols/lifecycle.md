# Lifecycle Protocol

## 1. Purpose

Define the minimal lifecycle state machine for every subagent in one task run.

The goal of this protocol is to let task progress state be understood, replayed, and checked in one shared way.

## 2. Applies To

- All subagents
- Main-agent tracking of subagent state
- Future progress artifacts

## 3. Required Fields

The lifecycle must cover at least these states:

- `assigned`
- `align-context`
- `validate-input`
- `execute`
- `self-review`
- `prepare-report`
- `done`
- `blocked`

## 4. Template

```yaml
current_state: assigned | align-context | validate-input | execute | self-review | prepare-report | done | blocked
previous_state: string
transition_reason: string
blocking_issue: string | null
next_expected_state: string | null
protocol_version: "0.1.0"
```

## 5. Validation Rules

- Do not skip `align-context` or `self-review`.
- Only when the input is complete may the state move from `validate-input` to `execute`.
- If a key precondition fails in any state, moving to `blocked` is allowed.
- `done` must come after `prepare-report`.

## 6. Evolution Notes

- If finer-grained states are needed later, first confirm they really have cross-role reuse value.
- Different agents must not create another main state-name system outside this shared state machine.
