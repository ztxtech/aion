---
name: experiment
description: Experiment execution — ztxexp directory protocol, benchmark-first, multi-seed, structured results.
---


# Experiment

## When

Benchmark, ablation, hyperparameter search, multi-seed reproduction, batch comparison, or any experiment run that must be reproducible and traceable.

## Directory Protocol (ztxexp)

Experiments must converge to this structure:

```
data/         # data reading, cleaning, splitting, TS interfaces
evaluation/   # metrics, evaluation interfaces, validity checks
module/       # reusable building blocks
model/        # model building, training details
exp/          # experiment orchestration, config-to-run logic
scripts/      # batch runs, analysis, plotting helpers
main.py       # unified entry point
outputs/      # all results, plots, logs, exports
```

Output structure per run: `outputs/<task>/<run_id>/{config.json, run.json, metrics.json, metrics.jsonl, artifacts/, checkpoints/, run.log}`

If the directory is already messy, converge first before adding more experiments.

## Core Rules

- Benchmark-first: run the smallest baseline first, then complex methods.
- Separate three failure types: execution failure, implementation failure, decision failure. Do not merge into "bad result".
- No placeholder/target/expected values as conclusions.
- Results must be reproducible, traceable, comparable. Keep configs, logs, core metrics, failure info.
- Ablation, multi-seed, stability checks when possible. If not, say why.
- Do NOT hand-write temporary runners for ablation/benchmark/multi-seed. Use `ztxexp` framework.
- Prefer `ExperimentPipeline`/`ExpManager` over scattered scheduling scripts.
- `exp_fn(ctx) -> dict | None`. Success = `run.json.status == "succeeded"`.
- Fill `evaluation/` and `data/` contracts first, then model experiments.
- Verify in serial (`sequential`) first, then expand to parallel.
- Aggregate with `ResultAnalyzer`, not hand-rolled directory scanning.

## Error Analysis Loop

For open-ended problems with known metrics:
`metric → error attribution → analysis tools → adjustment → re-validate`

Error analysis covers: slices/cohorts, error buckets, failure cases, residual structure, feature importance, time range/horizon, data cleaning, model/hyperparameter/postprocess.

Also check in parallel: can the error be rewritten from a math-modeling view? (residual modeling, error decomposition, layered/segmented models, state-switch, trend/season/event components, noise models, constrained optimization)

## Platform Rules

If the task runs on a contest/platform: read rules first — submit quota, daily limit, cooldown, eval delay, public/private leaderboard, code/resource limits, submit format.

For scarce submissions: local benchmark first, platform submission later. Do not use limited submissions as a daily tuning tool.

## Pre-Training Check

Before any training/fine-tuning: can this model be used directly, via API, zero-shot, few-shot, frozen-backbone, prompting, or light adaptation? Training is NOT the default first action.

## Test Loop

Fixed: save structured results → plots via `scripts/plot/` → visual semantic analysis → targeted retest → self-critique → `ts-critic` review. If one link is missing, the loop is not complete.

Post-experiment hypothesis analysis (SHAP / feature attribution or equivalent) is required before closeout. If not done, keep working.
