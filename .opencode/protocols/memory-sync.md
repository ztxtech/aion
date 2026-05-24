# Memory Sync Protocol

## 1. Purpose

Define how subagents suggest memory / trace updates, and how the main agent collects them.

The goal of this protocol is to turn `memory updates` from free-form behavior into an auditable suggestion flow.

## 2. Applies To

- All subagents
- Main-agent trace / memory closeout logic

## 3. Required Fields

- `positive_candidate`
- `negative_candidate`
- `relation_candidate`
- `decision_candidate`
- `context_snapshot_candidate`
- `trace_event_candidate`
- `runtime_event_candidate`
- `confidence`
- `reason`

## 4. Template

```yaml
positive_candidate:
  - string
negative_candidate:
  - string
relation_candidate:
  - string
decision_candidate:
  - string
context_snapshot_candidate:
  must_keep:
    - string
  can_drop:
    - string
  next_focus:
    - string
trace_event_candidate:
  - string
runtime_event_candidate:
  - string
confidence: low | medium | high
reason: string
```

## 5. Validation Rules

- Do not give only a conclusion without `reason`.
- `confidence` must be explicit.
- Subagents may only suggest updates. They may not directly rewrite global memory.
- If the main agent accepts any memory / trace / runtime artifact update suggestion, it must read the current contents before writing to an existing file. Direct blind overwrite from a suggestion is forbidden.
- `decision_candidate` should focus on structural decisions that will still affect later dispatch or stop-go, not one-off execution detail.
- `context_snapshot_candidate.must_keep` should contain only the context that must survive into the next round; `can_drop` should contain only content that may be removed from dispatch history while still remaining traceable on disk.
- `context_snapshot_candidate.next_focus` should describe the default next-round dispatch focus, not a generic summary.
- `trace_event_candidate` should focus on facts from this round. `positive/negative` should focus on reusable experience.
- `runtime_event_candidate` should focus on key state transitions, not normal process notes.

## 6. Evolution Notes

- Later real runtime memory file structure should stay decoupled from this protocol.
- Structured update suggestions for both `decisions.md` and `context-snapshot.md` should grow from this protocol instead of starting a new one.
