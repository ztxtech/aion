# Scorecard Spec

## 1. Purpose

Define the shared template for `scorecard` in the eval framework.

`scorecard` aggregates results across multiple `trial` runs, tasks, and `grader` items.

## 2. Applies To

- All `scorecard` definitions
- Regression reports
- Release-gate input

## 3. Required Fields

- `scorecard_name`
- `metrics`
- `uncertainty_policy`
- `aggregation_rule`
- `report_sections`

## 4. Template

```yaml
scorecard_name: string
metrics:
  - task_success
  - cost
  - latency
  - protocol_compliance
  - robustness
uncertainty_policy: string
aggregation_rule: string
report_sections:
  - point_estimate
  - uncertainty
  - failure_modes
```

## 5. Validation Rules

- Do not keep only one accuracy metric.
- It must explain how uncertainty is expressed.
- It must explain the aggregation logic across multiple `trial` runs.

## 6. Evolution Notes

- For time-series tasks, later versions may add metrics like `leakage` and `horizon validity` under this template.
- `scorecard` is the aggregation layer. It does not replace single-task `grader`.
