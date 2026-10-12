---
name: time-series
description: Do structured analysis and review for time-series tasks, covering domain recognition, time format, plotting first for visual analysis, `tsfresh`-style features, online search, method family, post-experiment analysis, and domain mechanism.
---

## Debug Prefix Protocol

- When called, print this first: `[Skills: time-series] Follow: <rules / context constraints that really apply now>; Current step: <one-line note>`.
- If this skill clearly depends on one rule, add one more line like `[Rules: <rule>] ...`, then continue with the real work.
- The debug prefix should stay stable, short, and easy to grep.


## When To Use

- The current task is fundamentally a time-series problem, or time is a major dimension in it.
- You need to judge whether a solution really satisfies time-series constraints instead of treating a sequence like a normal table.
- You need one shared check framework for time-series experiments, analysis, reviews, or reports.
- Before modeling, you need to understand what this series is, what it looks like, which domain it comes from, and why it changes this way.

## Main Principles

- Understand the series first, then choose methods. Look at data first, then talk about models.
- For forecasting outputs, treat horizon, schema, numeric plausibility, and uncertainty as first-class constraints, not last-minute checks.
- Use `data-interface` to unify data entry first, then do plotting, feature analysis, and experiments.
- Do minimal domain recognition first, so you know what is being predicted and which domain it belongs to. But for external search, open the general time-series method family first, then add domain mechanisms and adaptation constraints.
- Plot first for visual analysis, then do statistical feature analysis and web search.
- Build multiple candidate routes first, then decide whether to enter experiments.
- Before implementation, judge whether the model can be used directly, with zero-shot / few-shot / frozen-backbone / light adaptation, instead of treating training as the first move by default.
- As long as code, experiment interfaces, directory suggestions, or output artifacts are involved, `ztxexp` still applies.

## Analysis Loop

### 1. First identify which domain it belongs to

For any time-series problem, answer these questions first:

- Which domain does it belong to: power, finance, traffic, industrial equipment, weather, healthcare, retail, ops logs, sensors, multi-agent systems, or something else?
- What is the observation mechanism in this domain: why does it move, why does it have cycles, why does it spike, why does it have structural breaks?
- What is the goal in this domain: forecast future values, find anomalies, detect events, classify states, do segmentation, fill missing values, or build representations?
- What are the common risks in this domain: holiday shocks, policy changes, device switching, sampling error, interventions, concept drift, lagged feedback, multi-entity coupling, and similar issues?

Do not skip domain recognition and treat all sequences like abstract numeric columns.

### 2. Unify the data interface first, then plot it for visual analysis

Before designing a model or searching papers, call `data-interface` first to turn PDF, tables, databases, or code-style Data Loader input into one data contract. After that, plot the series.

At least try:

- raw time-series line plots
- local zoom plots for multiple windows
- comparison plots by entity / by variable
- marker plots for missing values, outliers, distribution drift, or regime shift
- rolling mean / rolling variance and season / trend decomposition plots when possible
- autocorrelation / partial autocorrelation, spectrum, or periodicity diagnosis plots when possible

OpenCode models can understand visual input, so plotting is not decoration. It is a pre-diagnosis step:

- plot the figure first
- then let the model judge what state the sequence is in from the figure
- then decide whether more candidate hypotheses or search directions should be opened

If the figure itself is wrong, for example bad axes, hidden lines, missing legends, misleading colors, low resolution, or broken export, fix the figure first and judge after that.

### 3. Do statistical and structural feature analysis

After visual analysis, enter feature-layer analysis.

Check these first:

- whether length, frequency, and sampling interval are stable
- missing-patterns, outlier ratio, break points, and signs of stationarity
- trend, seasonality, periodicity, noise level, and heteroscedasticity
- correlations, lag relations, and sync / async structure between variables
- common patterns and individual patterns across entities

If systematic feature extraction is needed, use the feature families in `tsfresh` first, such as:

- statistical-moment features
- autocorrelation and partial-autocorrelation features
- peak, valley, volatility, and complexity features
- frequency-domain, entropy, change-rate, and repeated-pattern features

The point is not to stack features mechanically. The point is to use tools like `tsfresh` to answer:

- is this series more trend-driven, cycle-driven, event-driven, or high-noise-driven
- is it better suited to statistical methods, machine learning, deep learning, or pretraining / TSFM routes
- which variables or windows deserve the most attention

### 4. Task recognition, time representation, and reasoning split

#### 4.1 C1-C6 reasoning split

For time-series reasoning, check at least these six abilities explicitly:

- C1: time alignment and response-window recognition
- C2: slice comparison and local-segment comparison
- C3: relative change / difference judgment
- C4: lag, response delay, and before-after causal order
- C5: structural pattern recognition (trend, cycle, regime, peaks, valleys)
- C6: interaction understanding (joint effect of variables, events, and context)

Do not look only at C5 / C6 structure and interaction while ignoring C2 / C3 comparison reasoning and C1 / C4 time alignment.

- Judge whether the task is forecasting, classification, anomaly detection, event detection, segmentation, imputation, representation learning, or a mix.
- Make clear whether it is univariate / multivariate, one-step / multi-step, point forecast / interval forecast, single-entity / multi-entity, rolling / recursive / direct forecasting, and similar settings.
- Check whether timestamps, timezone, frequency, granularity, window length, prediction length, entity ID, exogenous variables, missing-value patterns, and serialization style are all written clearly.
- Check whether time boundaries are consistent with train / validation / test splits.

### 5. Online search, event constraints, and outside knowledge

For time-series problems, do not look only at local data. Also search how general time-series methods are evolving recently and how this domain usually handles the problem.
- Before searching Python tools and implementation ecosystems, call `python-toolbox` first to cover the time-series, statistics, and machine-learning tool space, then validate key candidates online.

Default search path:

- Direct keyword search is only the first layer. By default, also do problem decomposition, related search, heuristic rewrites, and trend-platform search in parallel. Do not search the original task sentence once and stop.
- Lower-level / decomposed search: split the task into higher-level concepts, subproblems, basic abilities, input signals, target variables, and eval settings. For example, `power forecasting` should also be split into lower-level searches like `power / load / price / signal / time-series forecasting / probabilistic forecasting`.
- Related search: ask actively what nearby problems can also describe the current target, such as signal, regime, event-driven, control, spatiotemporal, or multi-entity forecasting, then search those forms in parallel too.
- Heuristic-rewrite search: by default do synonym rewrites, reverse questions, task restatements, input / output rewrites, target-function rewrites, and failure-mode questions instead of repeating the original wording only.
- Trend search: besides keywords, explicitly check recent paper platforms like `https://huggingface.co/papers/`, `https://www.alphaxiv.org/`, and `https://www.paperdigest.org/arxiv/`. If they have day / week / month views, scan related topics there too and read matched papers in parallel.
- Start from task keywords + time-series keywords to open general benchmarks, eval rules, SOTA, baselines, and method families.
- Then expand to method keywords, benchmark keywords, dataset keywords, and failure-mode keywords to cover statistical / ML / deep-learning / pretraining / TSFM / hybrid routes.
- Then add progress from the last 5 years, representative top-paper routes, official implementations, and high-quality open-source repos.
- Then return to domain knowledge: physical mechanisms, business rules, event effects, anomaly sources, and exogenous variables in that domain.
- Finally do domain x method joint search to judge which routes already have domain validation and which need extra structural adaptation.

Extra constraints:

- Do not use `domain keyword + time-series task` as the only first-round search entry. That is good only for adding domain background, not for covering the general method space.
- For `information-collector`, domain search is the second-stage supplement, not the first-stage replacement.
- In output, separate `general time-series method family / SOTA` from `domain supplements and constraints` clearly. Do not mix the two evidence types.

Event descriptions must not stay only as background text. Turn them into executable time constraints, such as:

- which variable the event likely affects
- what the direction of impact is
- what the start time, duration, lag, and decay style are
- whether the event changes level, volatility, seasonality, relation structure, or regime

Good search questions include:

- what the most common baseline is in this domain
- what the strongest recent routes are for this task: statistical, classical ML, deep learning, or pretraining / foundation / TSFM
- what the key exogenous factors are in this domain
- what the common wrong conclusions are in this domain
- whether public benchmarks, public data, public eval protocols, or representative failure cases exist

Execution:

- `information-collector` may be called for outside evidence
- `github-search` may be used for representative implementations
- OpenCode built-in `websearch` / `webfetch` may be used for web pages and docs
- As long as trend search brings back a new method or new paradigm that may change the solution space, hook it back into `brain-storm` / `plan` as a candidate branch instead of leaving it in a reading list

### 6. Length awareness, representation enhancement, and method family

#### 6.1 Length awareness and history choice

- Do not assume `more history is always better`.
- Look actively for a history sweet spot: what short, middle, and long windows each add, and where noise starts to dominate.
- For long history, first consider:
  - salient-subsequence retrieval
  - regime compression
  - structured summaries
  - parallel multi-scale windows
- If long history makes outputs less stable, shrink, compress, or retrieve selectively instead of filling the prompt blindly.

#### 6.2 Representation enhancement

- Raw numeric sequences turned directly into long text are often not enough for robust time-series reasoning.
- Explicitly combine:
  - structured features, such as `tsfresh` or `catch22` style features
  - visual charts
  - multi-scale slope / volatility / shift indicators
- But be honest: representation enhancement is necessary, not sufficient. It can help some issues, but it cannot automatically solve complex context, event reasoning, or output control.

### 6.3 Method family, redesign after failure, and divergent thinking

After reading the figures, features, and search results, do not collapse into one method right away. Open one divergent-thinking round first.

By default consider at least these in parallel:

- statistical methods
- traditional machine learning
- deep learning
- pretraining / foundation / TSFM
- hybrid routes with rules, knowledge, or tool constraints

Every route should answer:

- why it fits this series
- what assumptions it depends on
- under which conditions it is most likely to fail
- what the engineering cost and explanation cost are
- whether it can be used directly, with zero-shot, few-shot, frozen-backbone, or only light adaptation
- if direct training does not work now, whether structure changes, lighter setups, representation enhancement, two-stage design, or zero-shot / few-shot can still keep the route alive

If systematic divergence is needed, call `brain-storm` or `deep-reasoning`. Do not treat `it cannot run now` as the final reason to reject a route. Treat it as the start point for redesigning the path.

### 7. Leakage, error prevention, and evaluation

- Check whether split, normalization, feature building, label alignment, window sampling, and rolling evaluation all strictly respect time order.
- Check whether metrics really match the business goal instead of picking only easy-looking numbers.
- Check whether baselines, ablations, multi-seed runs, stability, uncertainty / calibration, failure cases, and drawdown analysis are sufficient.

### 8. Post-experiment analysis

- Do not look only at the main metric. Continue with hypothesis tests, significance analysis, confidence intervals, error-bucket analysis, slice / cohort analysis, failure-case analysis, and interpretability analysis.
- For formal experiments, post-experiment hypothesis analysis must be finished before the flow ends: by default at least finish SHAP / feature attribution or an equal explanation analysis, then close the loop with error diagnosis, failure cases, or statistical tests. If that cannot be done, do not stop. Keep implementing, switch route, or roll back explicitly.

#### 8.1 Robust statistics and label support

- When qualitative labels or before/after event comparison are needed, prefer robust statistics like median, MAD, IQR, and Theil-Sen instead of only mean values.
- For event effects, trend changes, volatility changes, and structural judgments, record support level, effect size, or minimum sample requirement explicitly.
- When evidence is weak, output `Uncertain` / `Inconclusive` instead of forcing a confident-looking but weak label.

#### 8.2 Event metadata

- For event-driven tasks, make clear whether the current event is `DETECTED` or `INJECTED`.
- If it is `INJECTED`, record injection pattern, injection time, random seed, and boundary conditions.
- If it is `DETECTED`, record the detection method, hyperparameters, change-point location, and supporting evidence.
- When needed, return to the figures with visual analysis and check whether `the pattern learned by the model` and `the real shape of the sequence` still match.
- If analysis brings new insight, explicitly suggest whether a new iteration round should restart.

### 9. Domain-mechanism recheck

- Check whether the flow truly understands domain priors, physical mechanisms, business constraints, intervention factors, event shocks, concept drift, multi-scale structure, and deployment boundaries.
- Do not reduce a time-series problem to `just add more lag features` or `just treat it like tokens` without explaining why that makes sense.
- If domain knowledge conflicts with experiment results, explain the conflict first instead of ignoring it.

## Usage Requirements

- When `ts-critic` meets a time-series task, this skill must be called explicitly.
- When data entry has many sources or the data contract is unstable, call `data-interface` first.
- When `information-collector` collects time-series routes, it should also use this skill as the search and review frame, and by default organize outside search in the order `general method layer -> domain supplement layer -> cross-adaptation layer`.
- When formal analysis and experiment conclusions must be output, pair with `report-writing`.
- When future forecasts, structured judgments, or post-event trends must be produced, pair with `forecast-contract` so horizon, schema, numeric plausibility, and uncertainty are checked by force.
- As long as code, experiment interfaces, or directory suggestions are involved, `ztxexp` still applies.

## Output Format

- Domain recognition and task definition
- Visual-analysis findings
- Statistical / `tsfresh` feature findings
- Outside search and domain-knowledge supplements
- Method family and candidate routes
- Direct-use / zero-shot feasibility judgment
- Leakage and evaluation issues
- Post-experiment analysis suggestions
- Whether another iteration round is suggested
