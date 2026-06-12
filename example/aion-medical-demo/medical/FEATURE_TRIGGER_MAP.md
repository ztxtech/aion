# AION Feature → Medical Task Trigger Map

This document verifies that all **22 advanced AION features** are still naturally triggered by the rewritten medical time-series task (ECG + ICU sepsis). Each feature is mapped to the specific signal in `task.md` or `case.md` that should activate it during the demo run.

Status legend: ✅ direct trigger · ⚠️ requires agent judgement to notice · 🟡 external infrastructure (Playwright/Playground) needed for full demo

## Agent Architecture (6)

| # | Feature | Trigger Signal in Medical Task | Status |
|---|---|---|---|
| 1 | **6-Agent Hierarchy** | `task.md` "Important: This Task Is Designed to Trigger Full AION Governance" lists all 6 agents by name; `case.md` flow chart names each one in sequence | ✅ |
| 2 | **Requirements Analyst** | `task.md` "deliberately vague evaluation" + "asymmetric clinical cost" + "synthetic-vs-real provenance" — these are exactly the hidden-goal patterns that `requirements-analyst` extracts | ✅ |
| 3 | **Information Collector (Multi-Axis)** | `task.md` "Public benchmarks anchor the work" with two public datasets (PTB + CinC 2019); explicit list of 12 search targets (stat + ML + DL + TSFMs) | ✅ |
| 4 | **Coder + ztxexp** | `task.md` "Deliverables" section names `data/interface.py`, `evaluation/metrics.py`, `outputs/` (ztxexp protocol), `docs/images/`, `docs/report.md` | ✅ |
| 5 | **TS-Critic Governance** | `task.md` "deliberate leakage risk — the horizon-aware forecast setup could leak future vitals" + "leakage detection" listed in `case.md` feature table | ✅ |
| 6 | **C-Critic Final Gate** | `case.md` flow chart terminal node `c-critic minimal-context cold-start critique` → `allow-stop?` → `verified clinical delivery` | ✅ |

## Governance & Protocols (4)

| # | Feature | Trigger Signal | Status |
|---|---|---|---|
| 7 | **Governance Order** | `task.md` "safety-gate" + `case.md` row 7 explicit: "c-critic > ts-critic > main agent > others" | ✅ |
| 8 | **Rebuttal Protocol** | `task.md` "Known Challenges" lists lactate-sparsity + regime switching + horizon leakage — these are the kind of blockers `rebuttal.md` exists to handle | ✅ |
| 9 | **Brain-Storm** | `task.md` "Multiple method-family requirements" + `case.md` row 9 "Multi-route branch opening (12-lead CNN / hybrid / foundation model)" | ✅ |
| 10 | **Deep-Reasoning** | `task.md` "Long-tail error structure — lactate is sparse, MI is rare" → `deep-reasoning` for residual analysis decisions | ✅ |

## Skills (5)

| # | Feature | Trigger Signal | Status |
|---|---|---|---|
| 11 | **Plan Skill** | `task.md` "Deliverables" forces a multi-step plan; `case.md` flow shows "plan creates structured TODO" | ✅ |
| 12 | **Context Compaction** | Triggered automatically when subagents (e.g. coder) are dispatched; the medical task has enough depth that compaction helps | ✅ |
| 13 | **Safety Gate** | `task.md` "Clinical safety constraint: any model that flags a patient as low-risk must have a documented failure mode analysis" + `case.md` row 13 explicit | ✅ |
| 14 | **Complex Folder Reading** | `task.md` "complex multi-source data layout" + 4 distinct file formats (CSV, WFDB, EDF, JSON) — forces `context-init` to read `.opencode/readme.md` index first | ✅ |
| 15 | **Image / Visual Decision** | `task.md` "Visual References" lists 7 PNGs + 1 PDF; `case.md` "Visual Reference Notes" forces visual semantic extraction | ✅ |

## Communication Protocols (3)

| # | Feature | Trigger Signal | Status |
|---|---|---|---|
| 16 | **Dispatch Protocol** | `task.md` "Compare at least 3 statistical baselines, 3 traditional ML methods, 3 deep-learning methods, and 3 time-series foundation model routes" forces structured dispatch packets | ✅ |
| 17 | **Reportback Protocol** | `task.md` "Structured experiment report with SHAP / integrated-gradients attribution analysis" requires structured reportback from coder | ✅ |
| 18 | **Stop-Go Protocol** | `case.md` flow chart ends with `allow-stop?` decision; medical task has hard clinical safety gates that prevent premature stop | ✅ |

## State & Memory (2)

| # | Feature | Trigger Signal | Status |
|---|---|---|---|
| 19 | **Memory System** | `task.md` "Data Provenance" requires memory of synthetic-vs-real flagging across the run | ✅ |
| 20 | **Forecast Contract** | `task.md` Specific Requirement #9 "Forecast outputs must pass forecast-contract validation before final answer" — explicit; also `case.md` row 20 lists the horizon/plausibility checks | ✅ |

## Strategic Patterns (2)

| # | Feature | Trigger Signal | Status |
|---|---|---|---|
| 21 | **Dual-Branch Planning** | `task.md` "Public benchmarks anchor the work" + Specific Requirement #6 "Maintain two parallel branches: self-explore path and public SOTA reverse-absorption path (PhysioNet challenge winners' approaches)" | ✅ |
| 22 | **BFS Wavefront** | The medical task has two parallel sub-tasks (ECG + ICU) — `task.md` "two coupled sub-tasks" naturally creates a wavefront; `case.md` row 22 explicit | ✅ |

## External / Cinematic (3)

| # | Feature | Trigger Signal | Status |
|---|---|---|---|
| (extra) | **Jarvis Cold-Open** | `task.md` `## Operating Notes` -> "Cold open" section; `cli.sh` `DEFAULT_INITIAL_PROMPT` instructs the agent to print a one-line cold-open | ✅ |
| (extra) | **macOS `open` Visual Layer** | `task.md` `## Operating Notes` -> "Working with the visual evidence" section tells the agent when to open each of the 4 plots; `PLAYWRIGHT_AND_GUI.md` documents cross-platform fallbacks | ✅ |
| (extra) | **Playwright MCP** | `task.md` `## Operating Notes` -> "Cross-platform fallback" mentions headless `read` tool; `PLAYWRIGHT_AND_GUI.md` documents 3 browser targets (PhysioNet PTB, CinC 2019, Papers With Code) | 🟡 |

## Verification Summary

- **22/22 AION features** have explicit trigger signals in the rewritten `task.md` and `case.md`.
- **3 cinematic extras** (Jarvis opener, `open` GUI, Playwright) are wired into `task.md` Operating Notes + `cli.sh` + `PLAYWRIGHT_AND_GUI.md`.
- **All 4 data formats** (CSV, WFDB, EDF, JSON) are present in `data/raw_external/` and `data/raw_legacy/`.
- **All 7 reference images** are present in `docs/reference/`.
- **Public benchmark anchors** (PTB, CinC 2019) are real and verifiable.
- **Synthetic-vs-real provenance** is explicit in both `task.md` and the evaluation rubric.
- **Clinical safety constraints** are encoded in the Specific Requirements (asymmetric cost, failure-mode analysis).

## What's New vs the Electricity Version

| Element | Electricity Version | Medical Version |
|---|---|---|
| Data sources | 7 CSVs + 1 XLSX + 1 JSON | 2 CSVs + 3 WFDB patient dirs + 1 EDF + 1 JSON + 1 PDF rubric |
| Public benchmarks | Kaggle EPF (1) | PhysioNet PTB + CinC 2019 (2) |
| Visual references | 4 PNGs + 1 PDF | 7 PNGs (5 medical + 2 placeholders) + 4-page PDF rubric |
| Cinematic opener | None | TUI-internal Jarvis cold-open + 4× `open`/`killall Preview` per `task.md` Operating Notes |
| Provenance flag | N/A | Explicit synthetic-vs-real disclosure required |
| Clinical safety | N/A | Asymmetric cost + failure-mode analysis gates |
| Track count | 1 (load forecast) | 2 (ECG + ICU sepsis) — doubles the wavefront |

The medical version is strictly richer in trigger signals than the electricity version.
