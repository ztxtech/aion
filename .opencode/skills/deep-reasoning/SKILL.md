---
name: deep-reasoning
description: Split a complex problem into a multi-step reasoning chain, and make key assumptions, branch points, validation order, and rollback points explicit.
---

## Debug Prefix Protocol

- When called, print this first: `[Skills: deep-reasoning] Follow: <rules / context constraints that really apply now>; Current step: <one-line note>`.
- If this skill clearly depends on one rule, add one more line like `[Rules: <rule>] ...`, then continue with the real work.
- The debug prefix should stay stable, short, and easy to grep.


## When To Use

- The task is complex, and one wrong step may cause a long chain of rework later.
- Key assumptions, dependencies, and blockers need to be identified early.
- You need to think through `what first, what later, and when to roll back`.
- Before the main flow ends, you need to judge whether the candidate actions found by `brain-storm` are still worth opening another round.

## Flow

- Split the problem into goals, assumptions, dependencies, validation standards, and stop conditions.
- Identify 2 to 4 main reasoning paths, and say the preconditions for each one.
- If the task has a public leaderboard, public ranking, public solution page, or public high-score solution, the reasoning paths must keep at least two main paths clearly: `self-explore path` and `public high-score reverse-absorption path`, and explain the validation order and compare gate for each one.
- Mark the node that should be validated first, so low-value work is not done first in a long chain.
- If different paths may merge later, mark them only as `candidate merge points`, and say what cross-branch comparison evidence must exist before merge. Do not merge into one path directly before branches finish first-round or current-wave validation.
- For complex tasks, prefer BFS-style wavefront push: let same-layer high-value branches finish first-round key validation in parallel, then decide which ones move to the next layer. Do not fold unvalidated branches into a `main story` too early.
- Keep independent `branch_id`, current `wave`, preconditions, next validation node, and drop conditions for every path until branch-level comparison is clearly done.
- Even if one path is ahead for now, mark it only as `current leading branch`. Do not call it `recommended main line`, and do not say `other paths merge into this route` before a clear global compare gate is done.
- If one path is ahead for now, keep judging whether new same-family variants, alternate implementations, lighter versions, or two-stage versions should still be widened around it. As long as the answer is not `clearly no`, the flow must not converge yet.
- Recursively widened variants must keep parent/child relation, compare gate, and drop conditions. The leading path is not the endpoint. It is the local start point for the next round of parallel expansion.
- When this skill is used as the `pre-stop gate`, review each candidate from `brain-storm` one by one: is it really executable, what preconditions are needed, how much information gain can it bring, and is it worth one more round?
- As long as any path still has non-zero information gain or strong risk-reduction value, output `stop not allowed` and say clearly where the next round should start.

## Output Format

- Reasoning map (use mermaid when needed)
- Global wavefront map
- For each path
  - branch_id
  - wave
  - route number
  - core assumption
  - key dependencies
  - validation order
  - rollback points
- Candidate merge points and merge preconditions
- Leading-path recursive-widening judgment
- Parallel validation order for the current wavefront
- Global compare gate
- Whether early merge is allowed
- Whether stop is allowed
- Evidence that blocks stopping
