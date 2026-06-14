---
name: report-writing
description: Used for high-quality experiment reports, analysis reports, and technical summaries. Evidence must be enough, charts must be real, structure must be clear, and empty talk is forbidden.
---

## Debug Prefix Protocol

- When called, print this first: `[Skills: report-writing] Follow: <rules / context constraints that really apply now>; Current step: <one-line note>`.
- If this skill clearly depends on one rule, add one more line like `[Rules: <rule>] ...`, then continue with the real work.
- The debug prefix should stay stable, short, and easy to grep.


## When To Use

- When you need an experiment report, technical plan, analysis review, benchmark report, or stage conclusion.
- When experiment results need to be organized into a formal document for engineers, reviewers, or decision makers.
- When statistical tests, interpretability, figures, tables, and failure analysis all need to go into one report.
- Do not use it for pure basic implementation, local fixes, simple Q&A, or light tasks that do not need formal documentation. It should trigger only when requirement analysis judged the task as `report / proposal / mixed mode`.

## Core Principles

- If the user gave a reference output, attachment template, example directory, or target document structure, align its chapter tree, artifact layout, and quality bar first. If not, use the leanest report structure that fits the task instead of chasing length mechanically.
- No empty talk: every key conclusion must be supported by experiments, data, statistical analysis, cases, or reliable sources.
- No fake evidence: if there is no experiment, no figure, no table, and no test, then it cannot be written as a confirmed conclusion.
- Use as many high-value tables and figures as possible, but only when they truly help comparison, explanation, and decision. Do not stack figures just for show.
- A report is not only text. It should be a full delivery set: body text (Markdown), rendered web version (HTML), printable version (PDF), figures, tables, appendix, and image directory.
- As soon as the task flow already produced structured experiment results, diagnostic stats, main result tables, error-analysis tables, real figures, `docs/images/` assets, or evidence in `outputs/`, those artifacts must be consumed clearly in the report body or appendix. Do not allow `experiment was done, figures exist, but the report does not show them`.
- In report tasks, experiment data, tables, figures, and main conclusions must form a traceable binding: every key conclusion should point back to at least one concrete table, figure, result file, or appendix item; every cited figure or table should also say which result data it comes from.
- Every image / figure inserted into the Markdown body must be followed by an analysis paragraph right away. It should say at least what is seen, what conclusion it supports, and whether it triggered a new test, rollback, or risk judgment. Do not stack figures or write hollow captions.
- If a figure comes from diagnosis, error analysis, or visual review, the analysis after it must also explain how it changes the next round of experiments, implementation, or governance instead of acting only as display.
- Before the report body or final summary cites any image, table, appendix, data contract, or code file, first check that the file really exists. Do not write citations first and patch files later.
- Report writing should follow this order: first get structured experiment results, then use plotting scripts under `scripts/plot/` to make figures, then write the body. Do not reverse that order.
- Images must be real figures, flow diagrams, or visualizations. Text pasted into a shape is not an image.
- As soon as system architecture, flow, module relations, governance chains, or stage breakdown diagrams appear, use `mermaid` by default. ASCII / plain-text box diagrams are forbidden.
- This is not only a style suggestion. It is a blocking gate: any structural diagram that still uses ASCII / plain-text blocks is not deliverable and must be rewritten in `mermaid` first.
- When a structure diagram is needed, prefer `mermaid` and check syntax first.
- For data trends, error diagnosis, interpretability, and case comparison, prefer real Python plotting.
- After figures are produced, check title, axis, legend, colors, overlap, resolution, and export completeness.
- If title, legend, axis, note, or file name includes Chinese, also check whether Chinese fonts really render correctly. If the default font fails, switch to a compatible Chinese font first, then export and cite the figure.

## Suggested Structure

1. Background and goal
2. Policy / domain background and business mechanism
3. Key architecture and flow diagrams
4. Data and experiment setup
5. Methods, baselines, and technical routes
6. Main result tables
7. Statistical tests and significance analysis
8. Visualization analysis
9. Interpretability analysis
10. Failure cases, counterexamples, and limits
11. Risks, next-round hypotheses, and engineering suggestions
12. Conclusion and suggestions
13. Appendix

## Required Content

- At least one main result comparison table.
- As soon as the experiment already produced main result tables, error-analysis tables, statistical-test results, or figures, the report must consume at least the key subset of them: show core tables / figures in the body, and keep the remaining high-value evidence in the appendix.
- Every cited figure in the body must be followed by matching analysis. `figure only, no explanation` is forbidden.
- When possible, add chapter-level architecture diagrams, flow diagrams, data-governance diagrams, and model-diagnosis diagrams.
- When possible, add more slice tables, ablation tables, error-analysis tables, and resource-cost tables.
- When possible, add hypothesis tests, significance analysis, confidence intervals, or equivalent statistical support.
- As soon as the report includes model comparison, experiment results, feature engineering, or important feature inputs, post-experiment analysis must also be added by default. Cover at least one set from SHAP / feature attribution, error distribution, residual diagnosis, failure cases, and statistical tests. Do not stop at a main result table only.
- For formal experiment reports, SHAP / feature attribution or an equal explanation analysis is not an optional bonus by default. It must be done before the report can close. If it is not available yet, the report is still unfinished and the flow must continue.
- When possible, add SHAP, feature attribution, case-level explanations, error-distribution plots, residual plots, attention / pattern visualizations, and similar analysis.
- For event-driven experiments, write clearly whether the event is `DETECTED` or `INJECTED`, together with boundaries, parameters, hyperparameters, and random seed when possible.
- For qualitative labels, segment comparisons, or event judgments, add robust statistics, effect size, support level, and handling rules for `Uncertain` / `Inconclusive` when possible.
- Every conclusion must point back to a concrete experiment ID, figure, table, or appendix evidence item.
- If the experiment already generated images, the body or appendix must at least include relative image references, figure title / caption, and usage notes. Do not leave the images only in `docs/images/` or `outputs/`.
- If the experiment already generated structured result files like CSV / JSON / parquet / Markdown tables, the body or appendix must at least include a summary table, key metric excerpt, or a path-binding note. Do not let the file exist only on disk.
- If the reference output already has a high density of figures or appendices, treat that density as a quality floor, not an optional bonus.

## Text Requirements

- Keep the language simple, but write key evidence and limits clearly.
- Say the conclusion first, then the evidence, then the limits and next step.
- Separate `confirmed`, `there are signs but not confirmed`, and `current guess`.
- Do not write adjective-only judgments such as `very good`, `very robust`, or `obviously better` unless evidence follows right after them.

## Suggested Artifact Layout

- The main body should go to `docs/<document_name>.md` first.
- Figures should go to `docs/images/` first, and be referenced relatively in the body.
- For formal delivery, produce ALL THREE formats: `docs/<document_name>.md` (source), `docs/<document_name>.html` (rendered web), and `docs/<document_name>.pdf` (printable). See Multi-Format Export below.
- If the task includes experiment and development process, supporting directories like `dev/`, `exp/`, and `task/` may be kept too.

## Multi-Format Export (MANDATORY for formal delivery)

When the task requires a formal report (as opposed to internal notes), you MUST produce three output formats:

### 1. Markdown (`docs/<name>.md`) — the source of truth

- All diagrams use **Mermaid fenced code blocks** (` ```mermaid `). ASCII art, plain-text box diagrams, and Unicode-drawn flowcharts are FORBIDDEN. They do not render in HTML/PDF and are not acceptable as deliverables.
- All figures referenced via standard Markdown image syntax: `![caption](images/figure_name.png)`.
- All tables use standard Markdown pipe tables.
- All data citations include relative file paths to source CSV/JSON.

### 2. HTML (`docs/<name>.html`) — the rendered web version

- Convert from the Markdown using a standard converter (e.g., `pandoc`, `markdown-it`, or equivalent).
- Must be a **standalone** HTML file with embedded CSS (no external dependencies that would break if the file is moved).
- Mermaid diagrams must render — either via embedded `mermaid.min.js` or pre-rendered to inline SVG.
- All image paths must resolve correctly relative to the HTML file location.
- If the model has visual capability and Playwright MCP is available, open the HTML file in the browser and **visually verify** the rendering: check layout, font rendering (especially Chinese characters), figure sizing, table formatting, and Mermaid diagram correctness. Fix any rendering issues before exporting PDF.

### 3. PDF (`docs/<name>.pdf`) — the printable version

- Generate from the HTML using Playwright MCP's `page.pdf()` or `puppeteer`/`weasyprint`/`pandoc` (whichever is available).
- If the model has visual capability: **after generating the PDF, render each page as an image and visually inspect every page**. Check for:
  - Cut-off content at page boundaries
  - Missing or broken figures
  - Mermaid diagrams not rendering (blank boxes)
  - Chinese font rendering issues (boxes, missing glyphs)
  - Table overflow beyond page width
  - Blank pages
- Fix any issues found, regenerate, and re-verify.
- If the model does NOT have visual capability, note this limitation in the report metadata and recommend manual review.

### Export Pipeline

```
docs/<name>.md  →  (Markdown converter)  →  docs/<name>.html  →  (HTML to PDF)  →  docs/<name>.pdf
                         ↑                                              ↑
                   Mermaid renders                              Visual page-by-page
                   via mermaid.js                               inspection (if vision
                   or pre-rendered SVG                          capable + Playwright MCP)
```

### Mermaid-Only Diagrams (BLOCKING GATE)

- ALL structural diagrams — architecture, flow, module relations, governance chains, data pipelines, state machines, sequence diagrams — MUST use Mermaid.
- ASCII art, plain-text boxes, Unicode-drawn diagrams, and emoji-based flowcharts are FORBIDDEN. They are not deliverables.
- This is a blocking gate: any structural diagram that uses ASCII/plain-text is a report defect that MUST be fixed before delivery.
- Mermaid syntax must be valid. After writing, verify by rendering (at minimum, check that the ` ```mermaid ` block is syntactically valid Mermaid).

## Figure and Data Referencing (MANDATORY)

- **Every figure in the body MUST be actively referenced and analyzed.** Do not stack figures without explanation. Each figure must be followed by a paragraph stating: what is seen, what conclusion it supports, and what action it triggered.
- **Every data table in the body MUST cite its source.** Include the relative path to the original CSV/JSON/parquet file so the reader can verify.
- **Every key conclusion MUST point to at least one figure, table, or data file.** A conclusion without evidence binding is not a conclusion — it is a claim.
- **Cite experiment results actively.** If `outputs/` contains result JSONs, `exp/figures/` contains diagnostic plots, or `outputs/leaderboard.txt` contains metrics — these MUST appear in the report body or appendix with explicit path references.
- **No orphan figures.** If a figure exists in `docs/images/` but is not referenced in the body, either add a reference or remove it. Orphan figures suggest incomplete analysis.
- **No referenced-but-missing figures.** If the body references a figure that does not exist on disk, this is a blocking defect. Verify all `![](path)` references resolve before delivery.

## Relation With Other Skills

- When experiment directories, run protocols, or result artifacts are needed, follow `ztxexp`.
- For time-series conclusions, pair with `time-series` to check task definition, leakage risk, and method family.
- If the report needs GitHub or paper evidence, pair with `github-search` and `information-collector`.
- If data comes from many kinds of sources, pair with `data-interface` first to stabilize the data contract before writing the result sections.
- If the report contains future forecasts, post-event trends, or structured judgments, pair with `forecast-contract` first to make horizon, schema, numeric plausibility, and uncertainty clear.
- If the raw material includes PDFs or scans, pair with `pdf-intake` first to extract structure and evidence.

## Output Format

- Report goal
- Task mode and length strategy
- File-existence check
- Final `ts-critic` review status
- Report outline
- Required tables and figure list
- Experiment-data / figure / body binding list
- Figure-following analysis binding list
- Statistical and interpretability analysis list
- Data-entry and evidence-binding relation
- Artifact layout and export format
- Risks and open items
