---
name: brain-storm
description: Open several fundamentally different routes for one problem fast, so the flow does not keep doing small tweaks on one path only.
---

## Debug Prefix Protocol

- When called, print this first: `[Skills: brain-storm] Follow: <rules / context constraints that really apply now>; Current step: <one-line note>`.
- If this skill clearly depends on one rule, add one more line like `[Rules: <rule>] ...`, then continue with the real work.
- The debug prefix should stay stable, short, and easy to grep.


## Method Combination and Novel-Route Design (MANDATORY when evidence map is available)

Routes are NOT limited to picking from existing methods found by `information-collector`. When the evidence map (in `.opencode/memory/features.md`) is available, brain-storm MUST actively design **novel combination routes** in addition to single-method routes. Existing methods are prior knowledge; combining them to fill gaps is innovation.

- **Read the gap analysis**: Before designing routes, read `features.md` for the method-combination gap analysis written by `information-collector`. It flags: complementary strengths (method A handles trend, method B handles seasonality), pipeline gaps (preprocessing from domain X + model from domain Y + calibration from domain Z), ensemble opportunities (uncorrelated error modes), transferable tricks (a trick from a citing paper or issue thread), and capability voids (no single method handles a specific constraint).
- **Design combination routes**: For each significant gap, design at least one combination route that addresses it. The combination must be grounded in evidence — cite which methods are being combined and why their combination is expected to be better than any component alone. Do NOT invent combinations from thin air.
- **Combination route types**:
  - **Pipeline composition**: Method A for preprocessing/decomposition → Method B for core modeling → Method C for post-processing/calibration. Each stage grounded in evidence.
  - **Ensemble / stacking**: Multiple diverse methods whose errors are known to be uncorrelated. Grounded in the error-mode analysis from evidence.
  - **Cross-domain transfer**: A method from a different domain (found via problem degradation or reframing) applied to this task, possibly with adaptation. Grounded in the analogy evidence.
  - **Hybrid architecture**: A novel architecture that combines components from multiple existing methods (e.g., attention from model A + decomposition from method B + loss function from paper C). Grounded in the component-level evidence.
  - **Trick augmentation**: An existing strong method + a trick from a citing paper, issue thread, or competitor analysis that the original did not include. Grounded in the chain-reaction evidence.
- **Combination routes are first-class citizens**: They get their own `branch_id`, `wave`, validation path, and drop conditions — same as single-method routes. Do NOT treat them as speculative extras. If the evidence map says there is a gap, the combination route is evidence-grounded, not a guess.
- **Novelty risk management**: Every combination route must explicitly state: (a) which component's evidence is strongest, (b) which component's combination effect is least certain, (c) what the cheapest validation step is to de-risk the uncertain part. This prevents combination routes from becoming untested fantasies.

## When To Use

- One problem has multiple possible solutions.
- The current path is stuck and needs an active direction change.
- Different routes need to be compared for gain, risk, and startup cost.
- One route already looks stronger, but it still cannot be collapsed directly, so same-family variants should be widened around it.
- The evidence map reveals structural gaps that no single existing method fills, so novel combination routes are needed.
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
- Novel-combination route list (routes designed from evidence gap analysis)
- For each route
  - branch_id
  - parent_branch_id (if it came from recursive widening of a leading branch)
  - source_type (`existing-method` / `combination` / `cross-domain-transfer` / `trick-augmentation`)
  - wave
  - route number
  - core assumption
  - route focus
  - expected gain
  - main risk
  - evidence basis (which memory features / information-collector findings ground this route)
  - combination components (if source_type is combination: which methods/tricks are combined and why)
  - novelty risk (which part is most uncertain, cheapest de-risking step)
  - first validation step
  - reason to keep it alive in this round
  - gate to enter the next wave
  - drop / downgrade conditions
- Parallel strategy for the current wavefront
- Whether early merge is allowed
- Whether stop is allowed
- If not allowed, where the next round should start
