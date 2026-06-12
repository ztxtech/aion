# ⚠️ DEMONSTRATION CASE — NOT FOR CLINICAL USE

> **This is a demonstration project.** It exists to show how the AION harness operates on a clinical time-series task — not to produce a deployable diagnostic system.
>
> - The ECG data is **real** (3 patients from the PhysioNet PTB Diagnostic Database). It is far too small for any clinical claim.
> - The ICU vitals are **synthetic**, generated from published Sepsis-3 / SSC setpoints. They are not real patients.
> - The models, metrics, and reports produced by the agent are **demonstration outputs**. They have not been validated, peer-reviewed, or cleared by any regulatory body.
> - **Do not use anything in this directory to make a real clinical decision.**

---

# Medical Time-Series Case — ECG Diagnosis & ICU Sepsis Onset

A self-contained clinical time-series case built around real public medical data, designed to make every layer of the AION harness visible during a recording session.

## Task

Two coupled sub-tasks share one evaluation philosophy:

1. **ECG Diagnosis** — classify myocardial infarction from 12-lead ECG recordings at 250 Hz, 5 s strips, drawn from the **PhysioNet PTB Diagnostic Database** (3 patients: 2 with acute infero-lateral MI, 1 healthy control).
2. **ICU Sepsis Onset Prediction** — predict septic shock 2–6 hours before clinical recognition from continuous vital signs (HR, SBP, DBP, MAP, SpO2, RR, temp, lactate) over a 48-hour monitoring window, anchored to the **PhysioNet CinC Challenge 2019** reference structure.

The formal evaluation rubric is in `docs/reference/evaluation_criteria.pdf`. It is deliberately not fully restated in `task.md` so that `requirements-analyst` has to extract it — this is one of the governance triggers the demo depends on.

## Data Layout

```
medical/
├── task.md                          # Main task description (read this first)
├── case.md                          # This file — workspace context
├── FEATURE_TRIGGER_MAP.md           # Cross-reference: which task line triggers which AION feature
├── PLAYWRIGHT_AND_GUI.md            # Visual layer cheat sheet for the agents
├── data/
│   ├── raw_external/
│   │   ├── ecg_signals.csv          # Real PTB — 12 leads × 5 s @ 250 Hz, 3 patients
│   │   ├── icu_vitals.csv           # 48 h synthetic sepsis patient @ 1-min
│   │   └── ptb_ecg/                 # Raw WFDB files at original fidelity
│   │       ├── patient001/          # s0010_re.{dat,hea,xyz} — MI, 81F
│   │       ├── patient019/          # s0077lre.{dat,hea,xyz} — MI, 57M
│   │       └── patient136/          # s0205_re.{dat,hea,xyz} — healthy
│   ├── raw_legacy/
│   │   ├── old_ecg_format.edf       # Legacy EDF, different gain/lead order
│   │   └── manual_corrections.json  # Cardiologist beat annotations
│   │   (processed/                 # Normalized data — created at runtime by `data/interface.py`)
│   ├── interface.py                 # Unified data contract (created at runtime)
├── evaluation/                      # Metrics module (F1, AUROC, sens@spec, calibration — created at runtime)
├── docs/
│   ├── reference/                   # Clinician-provided visual references (7 PNGs + 1 PDF)
│   ├── images/                      # Output images (created at runtime)
│   └── report.md                    # Formal report (created at runtime)
├── model/                           # Model implementations (created at runtime)
├── exp/                             # Experiment orchestration (created at runtime)
├── module/                          # Reusable modules (created at runtime)
├── main.py                          # Entry point (created at runtime)
└── outputs/                         # Experiment results (created at runtime)
```

The data sources use deliberately inconsistent formats (CSV, WFDB binary, EDF, JSON annotations) so the `data-interface` skill has to handle all four entry types before the data contract can be unified. The visual references under `docs/reference/` are part of the case file — they contain clinical information that the CSV columns alone do not (ST-elevation pattern, regime transitions in the ICU trajectory, sparsity of lactate sampling).

## Public Benchmarks

- **PhysioNet PTB Diagnostic Database** — https://physionet.org/content/ptbdb/1.0.0/ — 290 patients, 52 diagnostic classes. Top SOTA F1 for MI detection ≈ 0.92–0.95.
- **PhysioNet CinC Challenge 2019** — https://physionet.org/content/challenge-2019/1.0.0/ — 40,336 ICU patients, ~7% sepsis prevalence. Top AUROC ≈ 0.85, sensitivity@0.85-spec ≈ 0.45–0.50.

## Data Provenance

- **ECG**: real PTB PhysioNet data, 3 patients sampled.
- **ICU**: synthetic. MIMIC-III and eICU-CRD full distributions returned HTTP 403 during data preparation; a high-fidelity synthetic cohort was generated grounded in Sepsis-3 / Surviving Sepsis Campaign setpoints (HR 75 → 135, MAP 90 → 55, lactate 1.0 → 4.5, SpO2 99 → 88 with on–off oxygen titration). This synthetic provenance must remain visible in any final report — the agents must not silently pass synthetic data off as real ICU data.

## How to Run

> The recording is one OpenCode TUI session. No external script, no launcher. You `cd` into the workspace, run `opencode`, type a one-line passphrase, and the agent runs the whole task end-to-end. Recording is your screen-capture software's job.

```bash
cd example/aion-medical-demo/medical
opencode
> introduce yourself, AION
```

The agent reads `task.md`, prints a one-line Jarvis-style cold-open, then runs the full investigation: `context-init` → requirements-analyst → information-collector → brain-storm → deep-reasoning → plan → coder → ts-critic (pre) → coder visual loop → ts-critic (post) → rebuttal → pre-stop → c-critic. Plots are opened with `open`, held for the agent's chosen duration, and closed with `killall Preview` — all from inside the TUI session. The visual handling rules are in the `## Operating Notes` section at the bottom of `task.md`.

### Non-interactive sanity check

For a quick dry run without the TUI, plots, or Jarvis opener:

```bash
cd example/aion-medical-demo/medical
bash ../../cli.sh
```

### Cross-platform notes

On macOS the open/close pair is `open <file>` and `killall Preview`. On Linux use `xdg-open` + `pkill -f 'feh\|xdg-open\|eog'`. On Windows use `start` + `taskkill /IM Microsoft.Photos.exe /F`. On a headless host, fall back to the `read` tool on the PNG to extract visual semantics directly.

## What This Case Triggers

22 of AION's advanced features are explicitly activated by signals in `task.md`. See `FEATURE_TRIGGER_MAP.md` for the full cross-reference. Highlights:

- 6-agent hierarchy with visible dispatch / report-back prefixes
- `requirements-analyst` extracting hidden goals (asymmetric clinical cost, synthetic-vs-real provenance, sparse-lactate handling, interpretability scoring)
- `information-collector` multi-axis SOTA search (PTB + CinC)
- `brain-storm` opening multiple viable routes for each track
- `deep-reasoning` flagging lookahead / sparse-lactate / cohort-size risks
- `coder` with `ztxexp` experiment protocol
- `ts-critic` double-gate (pre + post) with `rebuttal.md` rebuttal protocol
- `c-critic` minimal-context cold-start final gate
- Memory, trace, forecast-contract, safety-gate, dual-branch planning, BFS wavefront

## Citation

```bibtex
@misc{zhan2026aion,
  title={AION: Next-Generation Tasks and Practical Harness for Time Series},
  author={Tianxiang Zhan and Xiaobao Song and Tong Guan and Shirui Pan and Ming Jin},
  year={2026},
  eprint={2605.25045},
  archivePrefix={arXiv},
  url={https://arxiv.org/abs/2605.25045}
}
```
