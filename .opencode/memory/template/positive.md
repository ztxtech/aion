# Positive Memory

## How To Use

- Record verified positive priors, useful strategies, recommended defaults, and reusable experience.
- Each item should explain where it applies, so a local optimum is not treated as a general optimum.
- Pay special attention to strengthening actions and final self-check patterns that keep proving useful in the pre-stop `brain-storm` / `deep-reasoning` gate.
- Every entry must pass the structured schema below. Entries without evidence or scope are invalid and must not be committed. `scope` must be a plain string, no angle brackets or unescaped quotes.
- `confidence` starts at 0.6 for a single verified observation. Increment by 0.1 each time the pattern is retrieved and applied successfully (max 1.0). If applied and it failed, move the entry to `negative.md` with the failure evidence.

## Entry Schema

```yaml
- id: POS-001
  trigger: "one-line situation description"
  action: "what was done"
  outcome: success
  evidence: "file path, tool call id, or metric delta"
  root_cause: "why it worked"
  scope: "TS forecasting, sample under 10K, univariate"
  confidence: 0.6
  created: YYYY-MM-DD
  last_verified: YYYY-MM-DD
  use_count: 0
```

## Compaction Rules

- Merge entries with identical `trigger` + `scope`: keep the higher-confidence one, sum `use_count`.
- Delete entries with `use_count == 0` AND `last_verified` older than 30 days.
- Entries with `use_count >= 3` AND `confidence >= 0.9` are **stable priors**: they may be cited without re-verification.
