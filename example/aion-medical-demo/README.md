# AION Medical Demo — A Recording Project

> **This directory is a demo recording project, not a regular AION workspace.**
>
> It exists to **record a single YouTube video** that demonstrates every advanced feature of the AION harness in one continuous run. The wrapper layer (`aion-medical-demo/`) and the wrapped case (`medical/`) are structured around that recording goal — they are **not** a template for general AION projects.

---

## What this wrapper adds

`aion-medical-demo/` wraps the clinical case in `medical/` with recording-specific scaffolding:

| File / dir | Role |
|------------|------|
| `README.md` (this file) | Explains the recording purpose, the 22-feature goal, and what is intentionally different from a regular AION project |
| `medical/` | The actual clinical case — see `medical/case.md` for the task itself |

The clinical case (`medical/`) is identical in spirit to a normal AION project. The wrapper is a documentation-only layer: it does not add code, configs, or runtime artefacts.

---

## The goal: trigger every AION feature in one run

The clinical case under `medical/` is intentionally **saturated** so that a single AION run touches every layer of the harness:

- **All 6 agents** — orchestrator + requirements-analyst, information-collector, brain-storm, deep-reasoning, plan, coder, ts-critic, c-critic
- **All 17 skills** — context-init, requirements-analyst, information-collector, brain-storm, deep-reasoning, plan, coder, ts-critic, c-critic, time-series, forecast-contract, data-interface, ztxexp, customise-opencode, markitdown, safety-gate, report-writing
- **All 8 protocols** — orchestration, requirements-extraction, multi-axis-research, brainstorm, plan, ts-critic governance, c-critic final gate, sealed-report
- **All 5 governance gates** — pre-experiment (ts-critic), post-experiment (ts-critic), rebuttal round, pre-stop (c-critic), final cold-close (c-critic)

See `medical/FEATURE_TRIGGER_MAP.md` for the full 22-feature trigger map with the exact `task.md` phrases that fire each feature.

---

## Not every AION project should trigger every feature

This is a recording project — it is **deliberately engineered to fire every feature**, and that engineering shows:

- The clinical case has **deliberately vague evaluation criteria**, **asymmetric clinical cost**, and **mixed real/synthetic provenance** — these exist so `requirements-analyst` has something to extract. A normal forecasting project would have sharper criteria.
- The data sources are **deliberately inconsistent** (CSV, WFDB binary, EDF, JSON) so the `data-interface` skill has to handle all four entry types. A clean project would use one format.
- The task description includes a **leakage trap** (horizon-aware forecast setup that could leak future vitals) so `ts-critic` has a real reason to exist. A straightforward regression would not need it.
- The visual references under `medical/docs/reference/` are **deliberately cinematic** (dark theme, high-contrast) for the recording. A research project would use a different visual style.
- A **passphrase trigger** (`introduce yourself by completing this task, AION`) gates entry to the demo flow. A normal project has no such trigger.

**A real AION project should only trigger the features that are actually needed for that task.** A pure forecasting competition with clean tabular data does not need `data-interface` to handle WFDB; a clean single-source forecasting project does not need the `brain-storm` skill to argue between regimes. Forcing every feature is appropriate for a recording; it would be over-engineering for a real project.

Treat the `medical/` case as a **stress test** of the harness, not a template for everyday use. For a more typical AION project, look at `example/kaggle/` — it is a single-domain forecasting competition that only triggers a subset of the harness.

---

## How to run the recording

The recording runs inside the OpenCode TUI with a passphrase. Pick one of two entry points:

### Run

```bash
cd example/aion-medical-demo/medical
opencode
> introduce yourself by completing this task, AION
```

The agent reads `task.md`, prints a one-line Jarvis-style cold-open, then runs the full investigation end-to-end. Plots are opened with `open`, held for the agent's chosen duration, and closed with `killall Preview` — all from inside the TUI session. The visual handling rules are in the `## Operating Notes` section at the bottom of `task.md`.

---

## Disclaimer

The clinical case under `medical/` is a **demonstration**, not a deployable diagnostic system. The ECG data is real (3 patients, PhysioNet PTB) but far too small for any clinical claim; the ICU vitals are synthetic (generated from Sepsis-3 / SSC setpoints). Models, metrics, and reports produced by the agent are demo artefacts only — **not validated for clinical use**. See `medical/case.md` for the full disclaimer.
