---
name: critic-loop
description: Review gaps and risks in requirements, plans, implementations, and experiment results. When the flow spins in place, has weak evidence, or tries to close passively, force a stricter rollback and evidence-completion path.
---

## Debug Prefix Protocol

- When called, print this first: `[Skills: critic-loop] Follow: <rules / context constraints that really apply now>; Current step: <one-line note>`.
- If this skill clearly depends on one rule, add one more line like `[Rules: <rule>] ...`, then continue with the real work.
- The debug prefix should stay stable, short, and easy to grep.


# Critic Loop

Use this skill when you need to judge whether the current output is strong enough to move on, or whether the flow should roll back.

This is not normal review. It is an anti-slack, anti-spin, anti-fake-done review loop.

## Minimum Pre-Stop Constraints

- Do not use `already ran for many rounds` as a stop reason. Real stop judgment must depend on current evidence quality and approval from `ts-critic`.
- If one key step still has only a first draft, first answer, or one-route result, it should not count as fully reviewed. More evidence, more comparison, more validation, or rollback is still needed.
- As soon as the main flow is about to end, it must still finish one extra pre-stop gate `brain-storm -> deep-reasoning`.

## Trigger Signals

Enter this loop actively instead of pushing forward by feeling when any of these appears:

- one route is being tuned again and again but brings no new information
- there were already 2 or more failures in a row but the route still did not change in a fundamental way
- the conclusion mostly comes from guessing and lacks evidence
- the flow wants to say `done` but still has no real validation, no plot check, or no result check
- external search only did one-keyword direct search, without lower-level / decomposed search, related search, heuristic rewrites, or trend platforms
- tables, time series, logs, or result files were read, but visual analysis that could reveal more structure still was not done
- TODO / todo-map already contains meanings like `end / stop / wrap up / delivery complete`
- a final summary or delivery list is already written, but file existence was not checked one by one
- a formal document already landed, but the flow wants to close before final `ts-critic` review
- images / figures already entered the Markdown body, but there is still no analysis paragraph after them
- plots already exist, but the loop `structured results -> make plots -> visual semantic analysis -> targeted retest -> self-critique -> ts-critic review again` is still incomplete
- forecast outputs exist, but horizon, schema, or numeric plausibility still did not pass `forecast-contract`
- only the surface issue was fixed, with no check on similar problems, upstream/downstream impact, or failure patterns
- one method family was deleted directly because training failed, memory was not enough, samples were too few, or the interface did not fit, without checking whether it could be adapted, made lighter, or used through zero-shot
- docs, source code, papers, or experiment support are missing, but implementation or report writing already started
- what is missing is actually just a directory, dependency, config, env var, script entry, or interface, but the flow already said the route is impossible before fixing those conditions
- the task is clearly benchmark / ablation / multi-seed / experiment matrix work, but `ztxexp` was not used
- experiment directories are already messy, result output is out of control, or meanings are duplicated, but the flow is still adding more experiments
- the main flow is about to stop, but the pre-stop gate `brain-storm + deep-reasoning` was still not run

## Hard Constraints

1. Do not write an unverified attribution as a conclusion.
2. Do not build `done` on oral judgment without evidence.
3. Do not list files in the final summary when their existence was not checked.
4. Do not spin on the same route for more than two rounds without changing strategy.
5. Do not approve main-flow stop before the pre-stop gate `brain-storm + deep-reasoning` is complete.
6. For missing preconditions that can be fixed by command, do not judge the route infeasible before 3 rounds of `fix condition -> retry`.
7. Do not approve main-flow stop before a formal document passes final `ts-critic` review.
8. Any ASCII / plain-text structure diagram, tree diagram, flow diagram, hierarchy diagram, or decision diagram must not be downgraded into a warning. It must be blocked and rewritten into `mermaid`.
9. Unless the current round of `ts-critic` explicitly outputs `allow-stop`, this loop must send the stop signal `absolutely cannot stop now` by default.
10. When the task needs recent methods or external evidence, do not approve stop before direct problem search, lower-level / decomposed search, related search, heuristic rewrites, and trend-platform search are all covered.
11. TODO / todo-map must not contain items with meanings like `end / stop / wrap up / delivery complete`. Once found, it counts as an early-stop smell and requires rollback.
12. If an inserted image in the Markdown body is not followed by analysis, do not approve stop.
13. If plots exist but were not turned into visual-semantic-driven targeted retests and self-critique, do not approve stop.

- First judge whether the current task is light work, report work, or mixed work, so a light issue is not upgraded into a heavy report flow by mistake.

## Pre-Stop Gate

- Every time the flow wants to judge `done` or `can stop`, call `brain-storm` first by force and re-list the missing pieces, risk-reduction actions, and rollback routes.
- Then call `deep-reasoning` by force and judge each candidate: is it really executable, do the dependencies hold, and is information gain still above zero?
- As long as any executable item still exists, the governance result of this loop must be `continue`, and the next-round start point must be clear.
- As long as the governance result is not `stop`, or the flow is close to the end but still only allowed to enter the pre-stop gate, this loop must send an explicit `stop signal` to the main agent. Do not leave a gray zone like `continue` without saying whether stop is allowed.
- Only when both `brain-storm` and `deep-reasoning` clearly say `no high-value action / path remains` may real stop judgment begin.

## Review Escalation

### Level 0: normal review

Good for the first push or a flow that is still converging normally.

- Check whether the current output really matches task goal and evaluation standards.
- Check whether needed data diagnosis or input checks were already done before method design.
- Check whether baseline, ablation, validation design, statistical checks, time-series constraints, or interpretability are missing.
- Check whether the implementation still feels too template-like, too example-like, disconnected, or weak in evidence.
- Check whether experiments already entered the `ztxexp` path clearly, and whether the directory converged before experiment growth.

### Level 1: stop the spin

Good for `a lot changed, but information did not increase`.

- Say clearly why the current route did not create new information.
- If the problem is experiment-directory chaos or bypassing `ztxexp`, directly ask for rollback first so the directory and protocol converge.
- Force a fundamentally different route instead of more parameter tweaks, wording tweaks, or local implementation tweaks.
- List at least 2 to 3 alternate routes and give the first validation step of each.

### Level 2: add original evidence

Good for `judgment is too fast, evidence is too little, search and reading are not enough`.

- Force reading of original material: source code, official docs, original paper, experiment logs, or figures.
- Force one round of `method repairability judgment`: is the method truly not suitable, or is the current implementation style the real problem?
- Force more external search or local search instead of relying on memory.
- If what is missing can be fixed, force fixing conditions and retrying first instead of analysis-only behavior.
- List at least 3 candidate hypotheses and say how each one can be ruled out or validated.

### Level 3: rollback and restart

Good for `continuing now will only make the error larger`.

- Say clearly which earlier role or skill the flow should roll back to.
- If it is a time-series issue, call `time-series` explicitly during rollback.
- If the problem is out-of-control structured forecast output, call `forecast-contract` during rollback.
- If this is a formal experiment report or review document, call `report-writing` during rollback. If it is only a light task, do not force rollback into a heavy report flow.
- If code, experiment interfaces, directory suggestions, or executable implementation are needed, the rollback path must still follow `ztxexp`.
- If the issue is input contamination, injection suspicion, dangerous commands, or abnormal attachments, call `safety-gate` during rollback. If it is a PDF / scan, call `pdf-intake`.
- Say the minimum missing pieces needed to start the next round again instead of a vague `there are still risks`.
- If one route is about to be dropped, report what was fixed in each of the 3 rounds of condition repair, what the failure signal was, and why even those fixes were still not enough to keep the route alive.
- As soon as rollback is required, write the `TODO rollback suggestion` too: should the current item move from `done` back to `in-progress`, or should the current / upstream / downstream items move back to `todo`, and is a new follow-up TODO needed?

## Seven Forced Checks

For Level 2 or Level 3, check these items at least one by one:

1. Was the failure signal read word by word?
2. Was the original material read directly instead of only a summary?
3. Did search cover the core keywords, same-meaning routes, and recent progress?
3.5. Did search also cover lower-level / decomposed search, related search, heuristic rewrites, and trend platforms?
4. Were assumptions validated by evidence instead of experience only?
5. Was at least one wrong route clearly ruled out?
6. Were upstream/downstream impact and same-type issues checked?
7. Was one executable next step given instead of stopping at review comments only?

## Time-Series and Experiment Notes

- For time-series issues, call `time-series` first instead of scattering time-series checks across many paragraphs.
- For experiment results, do not look only at the main metric. Check statistical tests, significance, error analysis, slices / cohorts, interpretability, and failure cases too.
- If post-experiment analysis exposes a new mechanism, anomaly, or hypothesis, say clearly whether another iteration round should be opened.
- If figures already entered the main text, also check whether the figure-following analysis exists, whether it really binds conclusions, and whether it triggered later tests or rollback.
- If the experiment already produced plots, also check whether visual semantics were turned into targeted retests, self-critique, and re-review requests instead of staying as decoration only.

## Output Style Requirements

- Say the conclusion first, then the evidence, then rollback or forward suggestions.
- The tone may be sharp, but it must not be empty. Every criticism should land on a file, metric, figure, command, or log.
- Do not write only empty judgments like `quality is not enough`, `there are still risks`, or `please look again`.

## Output Format

- Current level
- Trigger reason
- Core conclusion
- Required rollback items
- Items that may move forward with risk
- Evidence still needed
- Post-experiment-analysis completeness
- Search-coverage completeness
- Figure compliance
- Figure-following-analysis completeness
- Visual-retest-loop completeness
- File-existence checks
- Forced next action
- Stop signal
- TODO rollback suggestion
- Stop-block result
- Suggested next role or skill
