---
name: ztxexp
description: In time-series, deep-learning, and LLM projects, use ztxexp to unify experiment config, batch runs, result tracking, ablation analysis, and failure diagnosis.
---

## Debug Prefix Protocol

- When called, print this first: `[Skills: ztxexp] Follow: <rules / context constraints that really apply now>; Current step: <one-line note>`.
- If this skill clearly depends on one rule, add one more line like `[Rules: <rule>] ...`, then continue with the real work.
- The debug prefix should stay stable, short, and easy to grep.


# ztxexp

## When To Use

If the task matches any of these, this skill must be used first. Without an explicit pass through this skill, the flow must not enter experiment implementation or experiment-directory writes:

- benchmark work, ablations, hyperparameter search, multi-seed reproduction, or batch comparison
- anything like baseline / ablation / benchmark / run matrix / seed sweep / experiment runner
- cases where the experiment run protocol must be standardized so results stay reproducible, aggregatable, and traceable
- cases where the engineering directory must converge into the structure `data/`, `evaluation/`, `exp/`, `model/`, `module/`, `outputs/`, `scripts/`, and `main.py`
- debugging experiment failure, missing results, missing curves, parallel exceptions, or old runs that cannot be reused
- generating experiment templates, skill injection, or Agent/Vibe Coding experiment blocks

## Core Rules

- Once this skill is triggered, experiment directories, experiment entry points, result output, and analysis scripts must all converge to ztxexp-style directory mapping. Do not invent new directories while running experiments.
- If the current workspace directory is already messy, step one is not adding more files. First do convergence and re-layout around ztxexp boundaries, then continue experiments.
- If directories, dependencies, configs, entry scripts, eval interfaces, data interfaces, or run conditions are missing, and those gaps can be fixed with commands, fix them first and retry. Do not say `cannot do experiments now` directly.
- Before any experiment route can be judged `cannot proceed now`, it must finish at least 3 rounds of `fix condition -> retry -> record failure signal / new info`. Only after 3 failed rounds may that route be dropped.
- Ablations, benchmarks, batch comparison, and multi-seed reproduction must not bypass ztxexp with temporary scripts. Even a minimal ablation should still use ztxexp.

1. Prefer `ExperimentPipeline` or `ExpManager` to organize experiments. Do not hand-write scattered multi-layer scheduling scripts.
2. The single-experiment function should follow: `exp_fn(ctx: RunContext) -> dict | None`.
3. Success is judged only by `run.json.status == "succeeded"`. Do not depend on old `_SUCCESS` logic.
4. Artifact roles must be separated clearly:
   - final metrics: `return dict`, then the framework writes them into `metrics.json`
   - process metrics: `ctx.log_metric(...)`, then the framework writes them into `metrics.jsonl`
   - business files: write into `artifacts/`
   - checkpoints: write into `checkpoints/`
   - event metadata, history length, label support, effect size, and uncertainty notes: write into `artifacts/` or structured meta files so later review is easy
5. Align experiment directories with engineering boundaries before writing code. No experiments may start before directory alignment:
   - `data/`: data reading, cleaning, splitting, and time-series interfaces
   - `evaluation/`: metrics, evaluation interfaces, and validity checks
   - `module/`: reusable basic modules
   - `model/`: model building and core run details
   - `exp/`: experiment orchestration and abstract base classes
   - `scripts/`: batch runs, analysis, and helper scripts
   - `main.py`: unified experiment entry
   - `outputs/`: all results, plots, logs, and exports
6. Run the minimal loop through `sequential` first before parallel execution. If parallel mode fails, roll back to serial reproduction first.
7. Fill `evaluation/` and `data/` contracts first, then do model experiments. Do not pile up model code and fill interfaces later.
8. For clear tasks, define a verifiable experiment interface and result-output contract first, then expand the experiment matrix.
9. Any agent, not only `coder`, that writes code, scripts, experiment interfaces, directory skeletons, or executable implementation advice must follow the engineering boundaries, directory mapping, artifact protocol, and validation habits in this skill.

## Checks Before Work Starts

- If checks find missing packages, directories, entries, interfaces, or env vars, fix them with commands first. Do not mistake a repairable condition gap for a route that is impossible.
1. Use the `.venv` at the workspace root first. If `.venv` is missing or packages are missing, create it and install `ztxexp` there.
2. Read the current project's `README.md`, task notes, data constraints, and eval constraints first, and make clear:
   - where input data comes from
   - how metrics are computed in `evaluation/`
   - what the ablation dimensions, baselines, and stop conditions are
3. Check whether `outputs/` already has old runs, so you do not overwrite results that were not analyzed yet.
4. If you are building the skeleton from zero, preview the template first, then decide whether to write it:

```bash
ztxexp init-template --name <experiment_name> --no-interactive --dry-run
```

5. If the current project needs Agent-collaboration constraints or built-in experiment skills, use these when needed:

```bash
ztxexp init-vibe --dry-run
ztxexp init-skill --dry-run --target both
```

## Recommended Reading Order

When this skill is triggered, prefer reading official ztxexp material in this order:

1. user guide: `exp_fn` contract, run protocol, artifact matrix, and troubleshooting steps
2. example templates: copy the closest template first instead of rewriting the scheduling framework from zero
3. API reference: only when parameters, signatures, or detailed behavior must be checked
4. Vibe Coding docs: only when `init-vibe`, `init-skill`, or `init-template` is needed

## Mapping To The Current Project Directory

### 1. `data/`

- Holds unified dataset reading, time-window splits, feature processing, label construction, dataset objects, and dataloader wrappers.
- Any logic strongly tied to time-series data format should stay here, not inside `exp_fn`.

### 2. `evaluation/`

- Holds metric functions, evaluation protocols, result aggregation, and validity checks.
- Before experiments start, make sure the evaluation interface can run alone, so baselines and ablations can share it.

### 3. `module/` / `model/`

- `module/` holds reusable building blocks. `model/` holds model structure, training details, save/load logic.
- Model computation should consider numeric stability, overflow risk, repeated computation, and engineering maintainability.

### 4. `exp/`

- Assembles data interfaces, model interfaces, training flow, and evaluation flow.
- Good for base experiments, ablation subclasses, and config-to-run logic.

### 5. `scripts/`

- Holds batch-run scripts, result-analysis scripts, visualization scripts, and cleanup scripts.
- Scripts that will be reused should be parameterized instead of hardcoded one-offs.

### 6. `main.py`

- Acts as the unified entry that receives experiment name, config file, run mode, seed, device, and similar parameters.
- Its job is to turn user input into ztxexp config, not to become a dump place for detailed training logic.

### 7. `outputs/`

- Every run directory should follow ztxexp v2. A typical structure is:

```text
outputs/<task_or_experiment>/<run_id>/
  config.json
  run.json
  meta.json
  metrics.json
  metrics.jsonl
  events.jsonl
  artifacts/
  checkpoints/
  run.log
  error.log
```

- Images, reports, exported CSVs, and diagnostic logs should all stay inside the matching run `artifacts/`, not pollute the repo root.

## Standard Execution Flow

### Step 1: define experiment boundaries first

At least make clear:

- task type: forecasting, classification, detection, generation, retrieval, or agent benchmark
- baseline routes and ablation dimensions
- metric set and main metric
- data split and time boundaries
- output-directory rules
- whether multi-seed, random search, grid search, or budget constraints are needed

### Step 2: build the config space

Prefer `base_config + grid + variants + random_search + exclude_completed`.

Good structure:

- `base_config` for stable shared parameters
- `grid` for explicitly enumerated key hyperparameters
- `variants` for structural route differences
- `random_search` for budget-limited exploration
- `exclude_completed()` for reusing finished runs

### Step 3: implement `exp_fn`

Inside `exp_fn`, do only four kinds of work:

1. read final config from `ctx.config`
2. call existing interfaces in `data/`, `model/`, and `evaluation/`
3. log process metrics through `ctx.log_metric(...)`
4. return final metrics as a `dict`, and write business artifacts into `artifacts/`

Minimal skeleton:

```python
from pathlib import Path
from ztxexp import RunContext


def exp_fn(ctx: RunContext) -> dict | None:
    config = ctx.config
    ctx.log_metric(step=1, metrics={"loss": 0.0}, split="train", phase="fit")

    artifact = Path(ctx.run_dir) / "artifacts" / "summary.txt"
    artifact.write_text("experiment summary\n", encoding="utf-8")

    return {"score": 0.0}
```

### Step 4: verify in serial first, then expand runs

Suggested order:

1. `sequential`: validate interfaces, paths, logs, and artifact protocol
2. `process_pool`: CPU-heavy experiments
3. `joblib`: when you need the joblib ecosystem
4. `dynamic`: when scheduling should depend on resource thresholds

If parallel mode is abnormal, roll back to `sequential` first and make sure the real problem is not data, serialization, or side effects.

### Step 5: aggregate, export, and analyze

Prefer `ResultAnalyzer`. Do not rebuild directory scanning yourself.

Common actions:

- `to_dataframe()`: aggregate final results
- `to_curve_dataframe(metric_key=...)`: extract process curves
- `to_csv(...)`: export summary tables
- leaderboards, pivot tables, and cleanup rules: put them into analysis scripts or reports in one place

### Step 6: close the delivery loop

At least fill these:

- key commands
- run modes
- main and secondary metrics
- output paths
- result summary
- how to locate failed runs
- next-round experiment suggestions

## Common Command Templates

### Install and check

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -U pip ztxexp
python -c "import ztxexp; print(ztxexp.__version__)"
```

### Agent / template init

```bash
ztxexp init-vibe
ztxexp init-skill --target both
ztxexp init-template --name <experiment_name>
```

### Preview only, do not write files

```bash
ztxexp show-vibe --profile webcoding --language bilingual
ztxexp show-skill --language zh --with-openai
ztxexp init-template --name <experiment_name> --no-interactive --dry-run
```

### Safe rollback

```bash
ztxexp remove-vibe --dry-run
ztxexp remove-skill --dry-run --target both
```

### Managed overwrite

Use `--force` only when you really want to take over old unmanaged directories or templates.

## Troubleshooting Checklist

1. Look at `run.json.status` first, then `error.log`. Do not stare only at console output.
2. When results are empty, check in order:
   - whether `exp_fn` returned `dict | None`
   - whether `SkipRun` was raised
   - whether filters or `exclude_completed()` removed the run
3. When curves are missing, check whether `ctx.log_metric(...)` was really called.
4. When final metrics are missing but the run succeeded, check whether only process metrics were logged and `return None` was used.
5. When old results cannot be reused, check whether the old directory follows the v2 protocol and whether the success state is really `succeeded`.
6. When parallel execution is abnormal, check:
   - whether data objects are serializable
   - whether models or scripts have global side effects
   - whether file writes compete for the same path
7. If `init-skill` or `remove-skill` says `skipped_unmanaged`, the current directory is not managed by ztxexp. Do not force-delete it by default. Use `--force` only when you really want to take it over.

## Directory Red Lines

- Do not place experiment runners, EDA, cleaning scripts, temporary notebooks, and exports at the same directory level.
- Do not scatter ablation results directly under the `outputs/` root. They must be layered by run / task / experiment_name.
- Do not create semantically duplicated directories outside `scripts/`, `exp/`, and `outputs/`, such as `experiments_tmp/`, `results_new/`, or `plots2/`.
- If the directory is already messy, report it and clean it first before expanding the experiment matrix.

## Common Pitfalls

- Judging an experiment impossible right away because one directory, one dependency, or one command is missing, without first repairing conditions and retrying for 3 rounds.
- Returning something other than `dict | None`, which makes the run fail directly.
- Still using old `_SUCCESS` logic to judge success, which distorts later analysis.
- Writing images, logs, or model files directly into the run root, which makes governance hard later.
- Starting in parallel immediately, so the real root cause gets hidden by scheduling issues.
- Using temporary runners directly for ablation / benchmark / multi-seed work instead of ztxexp, which makes directories, `run_id`, and result protocol go out of control.
- Adding more scripts and outputs into an already messy tree until nobody can tell formal experiments from temp artifacts.
- Putting data processing, model training, and result analysis all into `main.py`, which makes experiments hard to maintain.

## Shared Requirements For All Agents

When this skill is triggered, any agent that outputs code, scripts, experiment interfaces, directory suggestions, or executable implementation advice must also satisfy:

- directory mapping and duty split match `data/`, `evaluation/`, `exp/`, `model/`, `module/`, `scripts/`, `main.py`, and `outputs/`
- result and artifact protocol match ztxexp v2: metrics, logs, artifacts, checkpoints, and run status must not be mixed
- sample code, pseudocode, and landing suggestions should all be migratable to the ztxexp path instead of encouraging ungoverned temp scripts
- if the current answer cannot run experiments yet, it must still give a ztxexp-compatible validation entry and output contract

## Extra Requirements For `coder`

When this skill is triggered, `coder` must also satisfy:

- land `evaluation/` validation interfaces first, then expand the experiment matrix
- for clear data tasks, fill the time-series interface in `data/` first
- main experiment validation must go through the ztxexp path and save results into `outputs/`
- logs, images, reports, and analysis results must all be traceable to a concrete `run_id`
- give at least one reproducible experiment entry, such as `python main.py ...` or an equivalent script command

## Output Format

- Experiment goal
- Config space or ablation matrix
- Key implementation files
- Run command
- Output directory and result location
- Metric summary
- Risks and next step
