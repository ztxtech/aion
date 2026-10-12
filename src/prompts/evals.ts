// AION Eval Specs — hardcoded framework constants. NOT user-editable soft prompts.

export const AION_EVAL_SUITES_SPEC = `# Suite Spec

## 1. Purpose

Define the shared template for \`suite\` in the eval framework, used to organize capability evals and regression evals.

## 2. Applies To

- All suite definitions under \`evals/\`
- Future regression / release-gate validators

## 3. Required Fields

- \`suite_name\`
- \`suite_type\`
- \`goal\`
- \`metric_contract\`
- \`task_types\`
- \`task_selection_policy\`
- \`local_validation_policy\`
- \`platform_prior_policy\`
- \`error_analysis_policy\`
- \`modeling_reflection_policy\`
- \`iteration_policy\`
- \`trial_policy\`
- \`artifact_outputs\`

## 4. Template

\`\`\`yaml
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
\`\`\`

## 5. Validation Rules

- \`suite_type\` can only be \`capability\` or \`regression\`.
- Every suite must explain how tasks are selected, not only list tasks.
- Once \`metric_contract\` is known, the suite must explain how to do error attribution, slice analysis, failure-mode locating, and analysis-tool use instead of looking only at one total score.
- The suite must also explain how reflection and error analysis bring in a math-modeling view in parallel, such as residual modeling, error decomposition, segmented / layered models, state-switch models, or statistical / optimization views, so problems can be found faster.
- This math-modeling view is owned by \`coder\` in the post-experiment analysis stage by default, and it belongs to the same post-experiment hypothesis-analysis chain as SHAP / feature attribution, not a separate flow.
- If online information is limited, the suite must clearly say when to switch to local validation, local reproduction, minimal probes, or sanity checks, instead of adding endless external search.
- If the task touches a platform, contest, benchmark site, or task host, the suite must explain how to search platform experience, common traps, official FAQ / discussion, submit rules, and reusable heuristics.
- If the task depends on platform submission, the suite must explain how to confirm submit quota, cooldown, eval delay, public/private leaderboard mechanics, and resource limits, and then use a rhythm of \`local benchmark first, platform submission later\`.
- \`iteration_policy\` must explain how open-ended tasks keep iterating after metrics are known, until they beat other methods, hit the target value, or there is evidence the current route should roll back.
- It must explain the run strategy for \`trial\`.

## 6. Evolution Notes

- Capability suites and regression suites should grow separately later, not be mixed into one file group.
- A suite only describes the set. It does not directly hold \`grader\` logic.`;

export const AION_EVAL_GRADERS_SPEC = `# Grader Spec

## 1. Purpose

Define the shared template for \`grader\` in the eval framework.

\`grader\` maps \`transcript\` / \`outcome\` into aggregate metrics.

## 2. Applies To

- All \`grader\` definitions
- \`scorecard\` aggregation logic
- Release-gate input

## 3. Required Fields

- \`grader_name\`
- \`grader_type\`
- \`inputs\`
- \`outputs\`
- \`decision_rule\`
- \`reference_solution_policy\`

## 4. Template

\`\`\`yaml
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
\`\`\`

## 5. Validation Rules

- A \`grader\` must clearly say whether it depends on \`transcript\`, \`outcome\`, or both.
- Do not write only "looks correct". The \`decision_rule\` must be clear.
- Important \`grader\` items must explain how \`reference solution\` is used.

## 6. Evolution Notes

- If a human-review \`grader\` is added later, keep using the same template.
- The \`grader\` logic may change, but the interface fields must stay stable.`;

export const AION_EVAL_SCORECARDS_SPEC = `# Scorecard Spec

## 1. Purpose

Define the shared template for \`scorecard\` in the eval framework.

\`scorecard\` aggregates results across multiple \`trial\` runs, tasks, and \`grader\` items.

## 2. Applies To

- All \`scorecard\` definitions
- Regression reports
- Release-gate input

## 3. Required Fields

- \`scorecard_name\`
- \`metrics\`
- \`uncertainty_policy\`
- \`aggregation_rule\`
- \`report_sections\`

## 4. Template

\`\`\`yaml
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
\`\`\`

## 5. Validation Rules

- Do not keep only one accuracy metric.
- It must explain how uncertainty is expressed.
- It must explain the aggregation logic across multiple \`trial\` runs.

## 6. Evolution Notes

- For time-series tasks, later versions may add metrics like \`leakage\` and \`horizon validity\` under this template.
- \`scorecard\` is the aggregation layer. It does not replace single-task \`grader\`.`;

export const AION_EVAL_RELEASE_GATES_SPEC = `# Release Gate Spec

## 1. Purpose

Define the shared template for release gates in the eval framework.

Release gates decide when migration may continue, when release is allowed, or when rollback is required.

## 2. Applies To

- All release gate definitions
- Scorecard result interpretation
- Stop / continue decisions for the main agent or release flow

## 3. Required Fields

- \`gate_name\`
- \`hard_thresholds\`
- \`warning_thresholds\`
- \`rollback_conditions\`
- \`manual_review_conditions\`

## 4. Template

\`\`\`yaml
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
\`\`\`

## 5. Validation Rules

- Hard thresholds, warning items, and manual-review items must be separated.
- Do not write only "pass/fail". The supporting metrics must be clear.
- Rollback conditions must be explicit and readable, not left to oral understanding.

## 6. Evolution Notes

- If later we add cost gates, time gates, or protocol-violation gates, keep using this template.
- Release gates are eval artifacts. They should not be mixed into agent prompts.`;

export const AION_EVAL_REGRESSION_MATRIX_SPEC = `# Regression Matrix Spec

## 1. Purpose

Define the task-matrix template for regression evals, to show which abilities must keep working.

## 2. Applies To

- Regression suites
- Pre-release regression checks
- Future CI gates

## 3. Required Fields

- \`matrix_name\`
- \`capability_axes\`
- \`risk_axes\`
- \`required_coverage\`
- \`holdout_policy\`

## 4. Template

\`\`\`yaml
matrix_name: string
capability_axes:
  - string
risk_axes:
  - string
required_coverage: string
holdout_policy: string
\`\`\`

## 5. Validation Rules

- The regression matrix must say which capability axes and risk axes it covers.
- It must explain the \`holdout\` policy or an equivalent anti-overfit policy.
- Do not write only "regression tests exist". The matrix shape must be clear.

## 6. Evolution Notes

- Later, capability axes may be extended with time-series, tool use, protocol compliance, and similar dimensions.
- The matrix is a supporting view for suites. It does not replace the suite itself.`;