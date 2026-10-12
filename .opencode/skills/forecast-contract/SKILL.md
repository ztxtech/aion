---
name: forecast-contract
description: Before accepting any time-series forecast, event judgment, or structured temporal output, force-check horizon length, output schema, numeric plausibility, label set, and uncertainty strategy.
---

## Debug Prefix Protocol

- When called, print this first: `[Skills: forecast-contract] Follow: <rules / context constraints that really apply now>; Current step: <one-line note>`.
- If this skill clearly depends on one rule, add one more line like `[Rules: <rule>] ...`, then continue with the real work.
- The debug prefix should stay stable, short, and easy to grep.


## When To Use

- You need to output future forecast sequences, interval forecasts, structured judgments, MCQ choices, post-event trend judgments, or multi-variable future trajectories.
- Before any time-series task enters the final answer or saves experiment results to disk.

## Main Problems This Skill Prevents

This skill mainly prevents four common failures:

- wrong forecast horizon length
- wrong output format / schema
- values look like numbers, but their scale, direction, volatility, or regime is completely wrong
- the right answer should be `Uncertain` or should carry explicit uncertainty, but it is written as a hard answer

## Forced Checks

### 1. Horizon Length

- Output length must match the task requirement exactly.
- If the task needs multi-variable output, both variable dimension and time dimension must match.
- Do not use vague handling like `almost right length`, `missing a few points`, or `add a few more and cut them later`.

### 2. Output Schema

- Write the output schema clearly first, then generate the answer.
- For classification / MCQ / structured fields, use only the allowed label set.
- For tasks that need JSON, tables, fixed fields, or fixed order, do schema self-check first.

### 3. Numerical Plausibility

Check at least:

- whether units and scale match history
- whether there is unexplained explosion, drift, sudden jump, or negative value
- whether volatility level is reasonable
- whether forecast values break known physical constraints, business constraints, or boundary conditions
- whether known relations between variables are broken

### 4. Uncertainty Strategy

- When evidence is weak, event effects are unclear, history is unstable, or the task itself allows uncertain answers, prefer `Uncertain`, intervals, confidence info, or explicit uncertainty instead of hard guessing.
- Uncertainty must be tied to weak evidence, regime switch, data quality, or event ambiguity. Do not write one vague line like `may have errors`.

## Suggested Validation Style

- Fix schema and horizon before generation.
- Before generation, check again whether the flow already compared `direct use / zero-shot / few-shot / frozen-backbone / light adaptation` instead of training first and validating the output later.
- After generation, do a three-step self-check: length check, label check, value check.
- If validation fails, roll back earlier first and check whether the real problem comes from input length, event understanding, data contract, or time format.
- If experiments or results are being saved, still follow `ztxexp`.

## Relation With Other Skills

- For time-series tasks, pair this skill with `time-series` first to understand the task, events, and length strategy.
- When input sources are complex, pair it with `data-interface` first to stabilize the data contract.
- In formal reports, write the validation result from this skill into the evidence section of `report-writing`.
- When `ts-critic` or `critic-loop` finds structured output out of control, they should call this skill explicitly.

## Output Format

- Target output type
- Target horizon / schema
- Validation result
- Numerical plausibility judgment
- Uncertainty decision
- Whether the flow may enter the next step
