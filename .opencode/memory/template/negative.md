# Negative Memory

## How To Use

- Record verified failed paths, invalid assumptions, risk patterns, and no-go zones.
- Each item should explain why it failed and where that failure rule applies.
- Pay special attention to false stop signals that cause early ending, and early-stop patterns blocked by the pre-stop gate.
- Every entry must have evidence. Unsupported negatives are speculation, not memory.
- When the same `root_cause` appears 3+ times, escalate to the skill evolution pipeline (see `self-purify` protocol).

## Entry Schema

```yaml
- id: NEG-<sequence>
  trigger: <one-line situation description>
  action: <what was attempted>
  outcome: failure
  evidence: <file path, tool call id, or error message>
  root_cause: <why it failed>
  scope: <where this applies>
  severity: low | medium | high | blocker
  created: YYYY-MM-DD
  occurrences: 1
```

## Compaction Rules

- Merge entries with identical `root_cause` + `scope`: increment `occurrences`, keep the most recent `evidence`.
- When `occurrences >= 3` for the same `root_cause`: create a skill gap report and trigger the evolution pipeline.
- Entries with `severity == low` AND `occurrences == 1` AND older than 60 days may be pruned.
