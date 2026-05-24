# Regression Matrix Spec

## 1. Purpose

Define the task-matrix template for regression evals, to show which abilities must keep working.

## 2. Applies To

- Regression suites
- Pre-release regression checks
- Future CI gates

## 3. Required Fields

- `matrix_name`
- `capability_axes`
- `risk_axes`
- `required_coverage`
- `holdout_policy`

## 4. Template

```yaml
matrix_name: string
capability_axes:
  - string
risk_axes:
  - string
required_coverage: string
holdout_policy: string
```

## 5. Validation Rules

- The regression matrix must say which capability axes and risk axes it covers.
- It must explain the `holdout` policy or an equivalent anti-overfit policy.
- Do not write only "regression tests exist". The matrix shape must be clear.

## 6. Evolution Notes

- Later, capability axes may be extended with time-series, tool use, protocol compliance, and similar dimensions.
- The matrix is a supporting view for suites. It does not replace the suite itself.
