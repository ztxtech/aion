# Negative Memory

## How To Use

- Record verified failed paths, invalid assumptions, risk patterns, and no-go zones.
- Each item should explain why it failed and where that failure rule applies.
- Pay special attention to false stop signals that cause early ending, and early-stop patterns blocked by the pre-stop gate.
- Every entry must have evidence. Unsupported negatives are speculation, not memory.
- Escalation to the skill evolution pipeline uses a severity-weighted adaptive threshold, not a flat count.

## Entry Schema

```yaml
- id: NEG-001
  trigger: "one-line situation description"
  action: "what was attempted"
  outcome: failure
  evidence: "file path, tool call id, or error message"
  root_cause: "why it failed"
  scope: "where this applies"
  severity: "low"  # low | medium | high | blocker
  created: YYYY-MM-DD
  occurrences: 1
```

## Compaction Rules

- Merge entries with identical `root_cause` + `scope`: increment `occurrences`, keep the most recent `evidence`.
- Adaptive escalation threshold (per `root_cause` + `scope`):
  - `severity == blocker`: trigger gap report at 1 occurrence
  - `severity == high`: trigger at 2 occurrences
  - `severity == medium`: trigger at 3 occurrences
  - `severity == low`: trigger at 5 occurrences
- Entries with `severity == low` AND `occurrences == 1` AND older than 60 days may be pruned.
