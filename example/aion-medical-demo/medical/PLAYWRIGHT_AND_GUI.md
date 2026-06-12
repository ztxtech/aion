# Visual / GUI Layer for the Cinematic Demo

This file is a cheat sheet for the agents and the demo recorder. It documents the visual tools the agents should use to make the recording look like a real clinical mission-control session.

## Available Visual References (already in workspace)

| File | What it shows | When to open |
|---|---|---|
| `docs/reference/patient001_ecg_12lead.png` | 12-lead ECG hero, ST-elevation MI | ECG analysis, attribution plausibility check |
| `docs/reference/patient136_ecg_normal.png` | Healthy control 12-lead | Comparison / contrast |
| `docs/reference/mi_vs_normal_comparison.png` | Side-by-side leads II/V5/V6 | Visual semantic analysis |
| `docs/reference/icu_vitals_full_48h.png` | 48h sepsis trajectory | Regime switching analysis |
| `docs/reference/icu_vitals_zoom_sepsis.png` | Hours 4–32 zoomed | Sepsis onset window |
| `docs/reference/forecast_vs_actual.png` | (placeholder) | After model runs |
| `docs/reference/shap_feature_importance.png` | (placeholder) | After attribution analysis |
| `docs/reference/evaluation_criteria.pdf` | Formal rubric | Requirements-analyst extraction |

## macOS `open` Commands (for cinematic visual layer)

Agents running on macOS should call `open` to surface reference plots in Preview at key moments:

```bash
# ECG hero shot — open when the ECG analysis starts
open docs/reference/patient001_ecg_12lead.png

# Comparison shot — open when the agent argues MI vs control
open docs/reference/mi_vs_normal_comparison.png

# ICU trajectory — open when sepsis regime switching is discussed
open docs/reference/icu_vitals_full_48h.png

# Zoomed ICU — open when the early-warning window is analyzed
open docs/reference/icu_vitals_zoom_sepsis.png
```

These are non-blocking — the demo continues while Preview is showing the plots. On non-macOS hosts the agents should fall back to the `read` tool on the PNG to extract visual semantics directly from the file.

## Playwright MCP (for browser-based visual verification)

The OpenCode TUI exposes the `playwright` MCP server. Agents can use it for:

- **PhysioNet** (https://physionet.org/content/ptbdb/1.0.0/) — to verify the PTB cohort metadata (52 classes, 290 patients) and confirm the three patients in our workspace map to real records.
- **PhysioNet CinC Challenge 2019** (https://physionet.org/content/challenge-2019/1.0.0/) — to verify the public AUROC and sensitivity@spec reference numbers.
- **arXiv / Papers With Code** — to surface top SOTA approaches (12-lead CNN ensembles, GRU-Attention hybrids, MOMENT / Lag-Llama for ICU time-series) and confirm the public benchmark numbers used in the report.

The agents should use `playwright` screenshots as evidence anchors in the report — the page snapshot is the proof that the citation is current and not hallucinated.

## Cinematic Recording Tips

1. **Terminal first, browser second** — the `context-init` flow happens in the terminal; the browser snapshots are evidence anchors later.
2. **Open the ECG hero early** — drop `open patient001_ecg_12lead.png` somewhere in the requirements-analyst / coder block so the viewer sees the clinical data in Preview while the agent talks about it.
3. **Use the dark theme** — the `dark_background` matplotlib style in the workspace plots is intentional; pair it with a dark terminal theme (Dracula, One Dark, Solarized Dark) for continuity.
4. **End with c-critic** — the c-critic moment is the climax. It operates on minimal context. Capture it.
5. **No pauses** — the auto-continue loop in `cli.sh` keeps the demo running. The recording should never need human intervention.

## Cross-Platform Notes

The `open` command is macOS-only. On Linux the agents should use `xdg-open`; on Windows `start`. If the visual launch fails, the agents should fall back to the `read` tool to extract visual semantics from the PNG files directly.
