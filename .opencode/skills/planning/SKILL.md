---
name: planning
description: Complex task planning — brain-storm, deep-reasoning, plan, branch management, BFS wavefront, TODO mapping.
---


# Planning

## When

- Task has more than one action, stage dependencies, or multiple agents/skills.
- Multiple feasible routes exist and need comparison.
- The flow is spinning, evidence is weak, or closeout is being declared too early.

## Brain-Storm

- Define the core contradiction first, then list routes.
- Give ≥3 fundamentally different routes (different assumptions, methods, validation styles).
- Every route gets a stable `branch_id` and `wave`. Later stages must use those IDs.
- Every route says: why feasible, biggest risk, first validation step.
- If public leaderboard exists: keep `self-explore path` and `public high-score reverse-absorption path` as two parallel branches. Both stay alive.
- BFS-like push: same-wave high-value branches do first-round validation in parallel. Do not collapse into one main line early.
- If one branch leads: open recursive widening around it — create ≥2 sibling-variant branches with new `branch_id`/`wave`. Keep them alive until compared or `ts-critic` says marginal gain is low.
- Output `stop not allowed` if any executable candidate with information gain still exists.

## Deep-Reasoning

- Split problem into goals, assumptions, dependencies, validation standards, stop conditions.
- Identify 2–4 main reasoning paths with preconditions.
- Mark the node that should be validated first.
- Mark candidate merge points — require cross-branch comparison evidence before merge.
- Keep `branch_id`/`wave`/preconditions/next-validation-node/drop-conditions for every path.
- If one path leads: judge whether same-family variants, lighter versions, or two-stage versions should still be widened. If not clearly no, do not converge.

## Plan Construction

- Plan is loop-based, not one-pass. Last step returns to item one unless `ts-critic` says no more high-value actions.
- Sync plan into OpenCode TODO. Plan without TODO is not landed.
- TODO states: only `todo`, `in-progress`, `done`. No hidden fourth state.
- TODO must NOT contain `end / stop / wrap up / delivery complete`. Last item = loop-back, review, or next-round entry.
- Rollback rules: `done → in-progress` (needs more evidence); `done → todo` (precondition failed, route changed); `in-progress → todo` (blocked by upstream).
- For multi-branch tasks: TODO must carry `branch_id`, `wave`, `frontier_status`, `compare_gate`.

## Critic-Loop Trigger Signals

Enter this loop when any of these appear:
- One route tuned repeatedly with no new information.
- 2+ consecutive failures without fundamental route change.
- Conclusion from guessing, no evidence.
- `done` claimed but no validation, no plot check, no result check.
- Search only did one-keyword direct search.
- Tables/logs read but visual analysis not done.
- TODO contains `end/stop/wrap up/delivery complete`.
- Files listed in summary but not checked for existence.
- Formal document exists but no final `ts-critic` review.
- Figures in report body but no analysis paragraph after them.
- Experiment loop missing `structured results → plots → visual analysis → targeted retest → self-critique → ts-critic review`.
- Forecast outputs exist but horizon/schema/plausibility not checked.
- `ztxexp` not used for benchmark/ablation/multi-seed work.

## Pre-Stop Gate

Every time the flow wants to stop:
1. `brain-storm` — re-list remaining actions, risk-reduction actions, rollback routes.
2. `deep-reasoning` — judge each candidate: executable? information gain? dependencies?
3. `ts-critic` — reviews and gives stop signal.

Stop is allowed only when all three agree no high-value action remains.

## Output

- Branch map (mermaid when needed)
- Route comparison summary
- Plan steps with serial/parallel notes
- TODO mapping table
- `branch_id`/`wave`/`frontier` status table
- Stop signal
