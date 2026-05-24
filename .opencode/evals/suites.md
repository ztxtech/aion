# Suite Spec

## 1. Purpose

Define the shared template for `suite` in the eval framework, used to organize capability evals and regression evals.

## 2. Applies To

- All suite definitions under `evals/`
- Future regression / release-gate validators

## 3. Required Fields

- `suite_name`
- `suite_type`
- `goal`
- `metric_contract`
- `task_types`
- `task_selection_policy`
- `local_validation_policy`
- `platform_prior_policy`
- `error_analysis_policy`
- `modeling_reflection_policy`
- `iteration_policy`
- `trial_policy`
- `artifact_outputs`

## 4. Template

```yaml
suite_name: string
suite_type: capability | regression
goal: string
metric_contract:
  primary_metric: string
  target_value: string
  stop_condition: string
task_types:
  - string
task_selection_policy: string
local_validation_policy: string
platform_prior_policy: string
error_analysis_policy: string
modeling_reflection_policy: string
iteration_policy: string
trial_policy: string
artifact_outputs:
  - transcript
  - outcome
  - scorecard
```

## 5. Validation Rules

- `suite_type` can only be `capability` or `regression`.
- Every suite must explain how tasks are selected, not only list tasks.
- Once `metric_contract` is known, the suite must explain how to do error attribution, slice analysis, failure-mode locating, and analysis-tool use instead of looking only at one total score.
- The suite must also explain how reflection and error analysis bring in a math-modeling view in parallel, such as residual modeling, error decomposition, segmented / layered models, state-switch models, or statistical / optimization views, so problems can be found faster.
- This math-modeling view is owned by `coder` in the post-experiment analysis stage by default, and it belongs to the same post-experiment hypothesis-analysis chain as SHAP / feature attribution, not a separate flow.
- If online information is limited, the suite must clearly say when to switch to local validation, local reproduction, minimal probes, or sanity checks, instead of adding endless external search.
- If the task touches a platform, contest, benchmark site, or task host, the suite must explain how to search platform experience, common traps, official FAQ / discussion, submit rules, and reusable heuristics.
- If the task depends on platform submission, the suite must explain how to confirm submit quota, cooldown, eval delay, public/private leaderboard mechanics, and resource limits, and then use a rhythm of `local benchmark first, platform submission later`.
- `iteration_policy` must explain how open-ended tasks keep iterating after metrics are known, until they beat other methods, hit the target value, or there is evidence the current route should roll back.
- It must explain the run strategy for `trial`.

## 6. Evolution Notes

- Capability suites and regression suites should grow separately later, not be mixed into one file group.
- A suite only describes the set. It does not directly hold `grader` logic.
