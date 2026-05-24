---
name: brain-storm
description: Open several fundamentally different routes for one problem fast, so the flow does not keep doing small tweaks on one path only.
---

## Debug Prefix Protocol

- When called, print this first: `[Skills: brain-storm] Follow: <rules / context constraints that really apply now>; Current step: <one-line note>`.
- If this skill clearly depends on one rule, add one more line like `[Rules: <rule>] ...`, then continue with the real work.
- The debug prefix should stay stable, short, and easy to grep.


## When To Use

- One problem has multiple possible solutions.
- The current path is stuck and needs an active direction change.
- Different routes need to be compared for gain, risk, and startup cost.
- One route already looks stronger, but it still cannot be collapsed directly, so same-family variants should be widened around it.
- Before the main flow ends, you need to check again whether any actions, strengthening points, or rollback routes are still missing.

## Flow

- First define the core contradiction of the current problem, instead of listing ideas right away.
- Give at least 3 fundamentally different routes. The difference should show in assumptions, methods, or validation style.
- For complex tasks, do not treat these routes as a draft list where one will be chosen. Treat them as parallel branches that should stay alive. By default keep all high-value branches for the next layer first, instead of collapsing into one main line too early.
- If the task has a public leaderboard, public ranking, public solution page, or public high-score solution, the global branch set must include at least one `self-explore path` and one `public high-score reverse-absorption path`. Both stay alive by default. The second one must not be only a note.
- Every route must get a stable `branch_id` and a clear `wave`. Later `deep-reasoning`, `plan`, TODO, and `ts-critic` should all keep using those IDs.
- Every route should say: why it is feasible, what the biggest risk is, and what the first validation step is.
- Every route should also say: why it should not be dropped too early in this round, what minimum validation gate must be passed before the next wave, and what conditions trigger dropping or downgrading.
- Keep only routes that can add information. Delete small tweak branches that change surface form only.
- In the `brain-storm` stage, do not output conclusions like `recommended main route`, `main plan`, or `merge other routes into this one`. Even if one route already looks better, write it only as `current leading branch`. Do not cancel other high-value branches that have not finished first-round validation.
- Use a BFS-like push by default: let high-value branches in the same wave do first-round validation in parallel, then decide from evidence which ones stay for the next wave.
- If one branch clearly looks ahead in the current wave, do not treat that as permission to converge. Open one more recursive widening round around this `current leading branch`, and clearly create at least 2 sibling-variant branches that are in the same family but not exactly the same. Give them new `branch_id` / `wave`.
- Those recursively widened variants must also stay alive in parallel until they are compared clearly, dropped clearly, or `ts-critic` judges that their marginal information gain is already clearly low. Do not do `found a good seed -> collapse into one main line`.
- When this skill is used as the `pre-stop gate`, list at least 3 kinds of candidates again: actions that can be done now, actions that reduce risk, and rollback routes that can strongly improve quality or fix direction.
- As long as any executable candidate with information gain still exists, output `stop not allowed` and say where the next round should start.

## Output Format

- Branch map (use mermaid when needed)
- Global branch list
- Recursive-widening branch list
- For each route
  - branch_id
  - parent_branch_id (if it came from recursive widening of a leading branch)
  - wave
  - route number
  - core assumption
  - route focus
  - expected gain
  - main risk
  - first validation step
  - reason to keep it alive in this round
  - gate to enter the next wave
  - drop / downgrade conditions
- Parallel strategy for the current wavefront
- Whether early merge is allowed
- Whether stop is allowed
- If not allowed, where the next round should start
