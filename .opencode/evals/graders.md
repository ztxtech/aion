# Grader Spec

## 1. Purpose

Define the shared template for `grader` in the eval framework.

`grader` maps `transcript` / `outcome` into aggregate metrics.

## 2. Applies To

- All `grader` definitions
- `scorecard` aggregation logic
- Release-gate input

## 3. Required Fields

- `grader_name`
- `grader_type`
- `inputs`
- `outputs`
- `decision_rule`
- `reference_solution_policy`

## 4. Template

```yaml
grader_name: string
grader_type: rule_based | model_based | hybrid
inputs:
  - transcript
  - outcome
outputs:
  - metric
  - verdict
decision_rule: string
reference_solution_policy: string
```

## 5. Validation Rules

- A `grader` must clearly say whether it depends on `transcript`, `outcome`, or both.
- Do not write only "looks correct". The `decision_rule` must be clear.
- Important `grader` items must explain how `reference solution` is used.

## 6. Evolution Notes

- If a human-review `grader` is added later, keep using the same template.
- The `grader` logic may change, but the interface fields must stay stable.
