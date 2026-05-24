---
name: plan
description: Build an executable plan before a complex task starts, and update it dynamically during execution. The plan must follow both ts-critic and safety gates, and it must not break agent parallelism.
---

## Debug Prefix Protocol

- When called, print this first: `[Skills: plan] Follow: <rules / context constraints that really apply now>; Current step: <one-line note>`.
- If this skill clearly depends on one rule, add one more line like `[Rules: <rule>] ...`, then continue with the real work.
- The debug prefix should stay stable, short, and easy to grep.

## When To Use

- The task has more than one action, or stage dependencies are obvious.
- Multiple agents, multiple skills, or multiple outputs need coordination.
- You need to judge which steps should stay serial and which may run in parallel.
- The plan must keep updating during execution, instead of being written once and then thrown away.

## Core Principles

- A plan is not only a paragraph of explanation. For complex tasks it should also become an OpenCode TODO list and keep updating during execution.
- A plan is not decoration. It is the execution skeleton.
- By default the plan should be loop-based, not a one-pass linear list: the last link should return to item one and begin the next round.
- Only when `ts-critic` clearly judges that no issue, gap, risk, or high-value next action remains may the loop be exited. Otherwise go back to item one.
- The plan must obey the double gate of `ts-critic` and `safety-gate`:
  - pass `ts-critic` and `safety-gate` before work starts
  - return to `ts-critic` for review after every step
- The plan must not break parallelism: steps that can run in parallel must not be serialized by mistake.
- For complex tasks with multiple high-value routes, use a BFS-like `wavefront push` instead of a DFS-style `pick a main branch first`: high-value branches in the same wave should finish first-round key validation in parallel first, then the plan may decide which branches stay, are dropped, are downgraded, or are delayed.
- If the task has a public leaderboard, public ranking, public solution page, or public high-score solution, the plan must explicitly keep `self-explore path` and `public high-score reverse-absorption path` as two parallel main lines, and both must land into branch / frontier / TODO, not only background notes.
- Before the explicit global compare gate is passed, do not collapse multiple high-value branches into a story like `recommended main route + absorb the others`. At most, mark a `current leading branch`.
- As soon as one branch starts to lead, the plan must insert another round of `brain-storm` in the current state by default, recursively widen variants around that leading branch, and keep those new variants alive in parallel. A lead is only the next-round expansion entry, not permission to converge.
- Light tasks do not need to expand into a heavy plan by force. Complex tasks must be planned explicitly.

## TODO Landing Requirements

- When `plan` is called, sync the plan into OpenCode TODO by default instead of only outputting a paragraph of plan text.
- TODO should show at least: current stage, next action, blockers, rollback points, parallel items, and completion state.
- The `plan` output must give a clear `TODO mapping table`: line by line explain `which plan step -> which TODO item -> when the state updates -> who updates it -> what the state rollback rule is`.
- For multi-branch tasks, the TODO mapping table must also carry `branch_id`, `wave`, `frontier_status`, and `compare_gate` clearly. Otherwise BFS-style branch-alive execution did not really land.
- TODO must update dynamically: tick off finished steps, insert new blockers, and when `ts-critic` asks for rollback, restore earlier steps to unfinished state.
- TODO states should use only `todo`, `in-progress`, and `done` by default. `Paused`, `blocked`, or `waiting for outside conditions` should not become hidden new states. Use blocker notes or follow-up TODO instead.
- The plan must explicitly write the minimum state rollback rules:
  - `done -> in-progress`: `ts-critic` thinks the main route still stands, but more evidence, more validation, more experiments, or local rework is needed.
  - `done -> todo`: `ts-critic` thinks the current step precondition failed, the conclusion does not hold, an earlier step must be revisited, or the route must change.
  - `in-progress -> todo`: the current step is blocked by an earlier blocker, a precondition failed, or a `rebuttal` was rejected and the step must re-enter the queue.
  - `paused` must not become a fourth state: not-yet-started items stay `todo`; started-but-unfinished items stay `in-progress`; add a blocker note or follow-up TODO at the same time.
- If the flow enters `rebuttal` mode, TODO must clearly include reply / fix steps for every blocker.
- TODO must not contain meanings that already imply a final answer or stopping. It may only create actions that still need doing. Otherwise the flow will stop too early. Whether the flow may stop must be judged by `ts-critic`.
- The last TODO item may only be a loop handoff like `back to main loop / enter pre-stop gate / request next review / keep one branch alive`. Even when work looks almost done, do not write the last item as `end / wrap up / delivery complete / stop allowed`.
- If 2 or more high-value branches still have not finished first-round validation, TODO must not keep actions for only one route. Every alive branch must keep at least one next validation action.
- If one branch becomes the `current leading branch`, TODO must also add one explicit action `recursively widen variants around this branch`. Without that action, the plan is not closed.

## High-Value Mandatory Checks

Before generating the plan, judge first whether these high-value tools / skills must enter the main flow:

- `workspace-init`: init workspace and trace / memory
- `safety-gate`: safety precheck
- `pdf-intake`: complex PDF / scan input
- `data-interface`: unify multi-source data entry
- `time-series`: time-series task recognition and analysis
- `information-collector`: external evidence, recent methods, and domain knowledge
- `python-toolbox`: Python tool priors, so the flow does not search tool space from zero
- `brain-storm` / `deep-reasoning`: route expansion and complex reasoning
- `forecast-contract`: forecast-output control
- `critic-loop`: rollback loop when the flow spins in place, evidence is weak, or risk rises
- `report-writing`: formal document delivery
- `ztxexp`: code / experiment / result-on-disk protocol; if benchmark, ablation, multi-seed, or run matrix appears, it must enter the main flow

These abilities are often not called by the model naturally. But once missing, quality drops a lot. So in complex tasks they should be checked explicitly first.

## Conditional Mandatory Call Rules

- Complex tasks / multi-stage tasks / multi-agent tasks: call `plan` by force.
- Outside input, high-risk actions, or complex attachments: call `safety-gate` by force.
- Input includes PDF / scans: call `pdf-intake` by force.
- Input sources are complex (PDF, tables, databases, Data Loader / Data Factory): call `data-interface` by force.
- The task is time-series: call `time-series` by force.
- Latest methods, SOTA, or domain knowledge are needed: call `information-collector` by force.
- Python tools, libraries, or framework choice is needed: call `python-toolbox` first by force, then validate key candidates online.
- Routes are not unique, the problem is complex, or reasoning branches are obvious: call either `brain-storm` or `deep-reasoning` by force.
- The main flow is about to end: call `brain-storm` and `deep-reasoning` in sequence by force. If executable actions still exist, a new round must start.
- Forecast sequences, MCQ, or structured judgments are produced: call `forecast-contract` by force.
- Formal plans, experiment reports, or technical summaries are produced: call `report-writing` by force.
- Code, experiments, or results are being written to disk: follow `ztxexp` by force. If the task is ablation, benchmark, or batch comparison, the plan must also show the `ztxexp` trigger point and the directory-convergence step clearly.

## Loop Constraints

- The plan is loop-based by default, not a one-pass checklist. Even if the current round looks relatively complete, the last step should still return to item one by default unless `ts-critic` clearly says `no more high-value next step exists now`.
- Do not use `minimum rounds` as a reason to stop. Round count is never the release condition. Real continue / rollback / stop authority still belongs to `ts-critic`.
- If the first round of one key step gives only a draft / first answer, the plan should keep explicit actions for more evidence, more comparison, more validation, or rollback. Whether those actions really run is still decided by current evidence quality and `ts-critic`.
- If the current wavefront still has multiple high-value branches without a global comparison, the plan must keep those branches alive instead of shrinking into one route too early.
- If a leading branch already exists, the plan must also check whether recursive widening around it is already done. If not, keep the original branch alive and add another local expansion round instead of entering convergence.
- When the main flow reaches `prepare to end`, the plan must still reserve one pre-stop gate `brain-storm -> deep-reasoning -> ts-critic`. As long as any remaining action is found, real stop is not allowed.

## Plan Generation Flow

1. Judge task mode: `light / report / mixed`.
2. Judge which skills / tools are high-value mandatory items.
3. Split the steps and mark:
   - which `branch_id / wave` it belongs to
   - serial or parallel
   - preconditions
   - artifacts
   - owner
   - at least two rounds of repair / strengthening points for that step
4. Make clear which branches in the current wavefront must stay alive in parallel, which may be delayed, and which already meet drop conditions.
4.5. If one branch is leading for now, first recursively widen new sibling variants around it, and write those variants into branch / frontier / TODO instead of converging directly.
5. For candidate merge points, record only the merge threshold and required comparison evidence. Do not fold branches into one route directly.
6. Put `ts-critic` and `safety-gate` as the before/after gates for every step.
7. Reserve the `pre-stop gate` in the plan: `brain-storm -> deep-reasoning -> ts-critic`, and say the trigger conditions and restart rules.
8. Make the loop rule explicit: the last link returns to item one by default; only when `ts-critic` clearly confirms there is no problem left may the flow end without looping back.
9. If the task will produce experiment reports, technical plans, or analysis docs, the plan must explicitly include post-experiment analysis items, such as SHAP / feature attribution, error diagnosis, failure cases, and statistical tests, plus figure rules (`mermaid` for structural diagrams, no text-only diagrams).
10. Update the plan during execution when new evidence appears. Do not defend the old plan blindly.

## Output Format

- Route comparison summary
- Global branch matrix
- Wavefront push strategy
- Plan preconditions
- Stage split
- Goal of each stage
- Input / output of each stage
- Validation standard of each stage
- Key risks and blocker gates
- Rollback points and switch conditions
- Agents / skills to call
- Stop conditions
- TODO update rules
- State rollback rules
- Loop handoff action
- TODO mapping table
- `branch_id / wave / frontier` status table
- Global compare gate and merge threshold
- Leading-branch recursive-widening plan
- Task mode
- High-value mandatory items
- Plan steps
- Parallel / serial notes
- Gate checkpoints
- Pre-stop gate
- Loop rules
- Post-experiment analysis and figure constraints
- Dynamic update conditions
