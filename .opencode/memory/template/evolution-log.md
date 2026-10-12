# Evolution Log

Tracks skill gap proposals through the evolution pipeline: proposed → shadow-testing → promoted / deprecated.

## Entry Schema

```yaml
- gap: "repeated root_cause from negative.md"
  occurrences: 1
  severity: "high"
  proposed_skill: "name"
  rationale: "why this closes the gap"
  status: proposed | shadow-testing | promoted | deprecated
  shadow_trials: []
  created: YYYY-MM-DD
  resolved: YYYY-MM-DD
```
