---
name: report
description: Formal report delivery: evidence-bound, figure-driven, no fake evidence (every PASS must cite real source).
---


# Report

## When

Experiment reports, technical plans, analysis reviews, benchmark reports, stage conclusions. NOT for pure implementation, local fixes, simple Q&A.

## Core Rules

- Every key conclusion must be supported by experiments, data, statistical analysis, or reliable sources.
- **No fake evidence — HARD RULE:** Every `PASS` status in a report must quote a real, verifiable source: a trace.md line number, a real tool call ID, a real file path that exists on disk, or a real command output. If you cannot point to the evidence, the status MUST be `⚠ partial` or `✗ fail`, never `PASS`. Writing "dispatched X" without a real dispatch, or "researched Y" without a real search, is fabrication — do not do it.
- No fake evidence: if there is no experiment/figure/table/test, it cannot be a confirmed conclusion.
- If experiment results, structured result files, or plots already exist, they MUST be consumed in the report body or appendix. `Artifact exists, report does not show it` is not allowed.
- Every figure in the body must be followed by an analysis paragraph: what is seen, what conclusion it supports, whether it triggered new tests/rollback/risk judgment.
- Before citing any file, check it really exists on disk.
- Structure diagrams: use `mermaid`. ASCII/plain-text box diagrams are forbidden — this is a blocking gate.
- If plots contain Chinese text, check font rendering explicitly. Fix before delivery.
- **Metric sanity gate — HARD RULE:** any extreme headline metric (Sharpe > 10, accuracy > 0.95, AUPRC near 1.0, etc.) computed on fewer than ~100 samples, or contradicting the report's own main results, MUST be flagged `⚠ statistically meaningless` and must NOT be used as a conclusion argument. Report the sample size next to every headline metric.

## Structure

1. Background and goal
2. Domain background and business mechanism
3. Architecture / flow diagrams (mermaid)
4. Data and experiment setup
5. Methods, baselines, technical routes
6. Main result tables
7. Statistical tests and significance
8. Visualization analysis
9. Interpretability analysis (SHAP / feature attribution or equivalent)
10. Failure cases, counterexamples, limits
11. Risks, next-round hypotheses, engineering suggestions
12. Conclusion
13. Appendix

## Artifact Layout

- Body: `docs/<name>.md`
- Figures: `docs/images/`, referenced relatively in body
- PDF export: `docs/<name>.pdf` when formal delivery needed

## Required Content

- At least one main result comparison table
- Post-experiment analysis (SHAP/feature attribution or equivalent) — NOT optional for formal reports
- Every conclusion points back to a concrete experiment ID, figure, table, or appendix item
- Structured result files (CSV/JSON/parquet) must be summarized or excerpted in body/appendix, not left only on disk
- For event-driven experiments: record `DETECTED` vs `INJECTED`, boundaries, parameters, random seed
- For qualitative labels: robust statistics, effect size, support level, `Uncertain`/`Inconclusive` handling

## Text Style

- Conclusion first, then evidence, then limits.
- Separate `confirmed` / `signs but not confirmed` / `current guess`.
- No adjective-only judgments without evidence.

## Relation to Other Modules

- Experiment data/figures must come from `experiment` module outputs.
- TS conclusions must pass `ts-core` validation.
- Forecast outputs must pass `ts-core` forecast validation.
- If data from many sources, unify through `ts-core` data contract first.
