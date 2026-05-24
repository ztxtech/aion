# Release Gate Spec

## 1. Purpose

Define the shared template for release gates in the eval framework.

Release gates decide when migration may continue, when release is allowed, or when rollback is required.

## 2. Applies To

- All release gate definitions
- Scorecard result interpretation
- Stop / continue decisions for the main agent or release flow

## 3. Required Fields

- `gate_name`
- `hard_thresholds`
- `warning_thresholds`
- `rollback_conditions`
- `manual_review_conditions`

## 4. Template

```yaml
gate_name: string
hard_thresholds:
  - metric: string
    rule: string
warning_thresholds:
  - metric: string
    rule: string
rollback_conditions:
  - string
manual_review_conditions:
  - string
```

## 5. Validation Rules

- Hard thresholds, warning items, and manual-review items must be separated.
- Do not write only "pass/fail". The supporting metrics must be clear.
- Rollback conditions must be explicit and readable, not left to oral understanding.

## 6. Evolution Notes

- If later we add cost gates, time gates, or protocol-violation gates, keep using this template.
- Release gates are eval artifacts. They should not be mixed into agent prompts.
