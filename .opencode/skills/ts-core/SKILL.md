---
name: ts-core
description: Time-series task framework: data contract, method family awareness, forecast validation, post-experiment analysis.
---


# TS Core

## Task Recognition

Identify first: forecasting / classification / anomaly detection / event detection / segmentation / imputation / representation learning. Then: univariate/multivariate, one-step/multi-step, point/interval forecast, single/multi-entity.

Write time format clearly: timestamps, timezone, frequency, window, forecast step, entity granularity, exogenous variables. Prevent leakage: split, normalization, feature building, target alignment must follow time boundaries.

## Data Contract

Before analysis, unify data entry into one contract: source type, time column, target column, feature columns, entity columns, frequency/timezone, data range, missing-value strategy, split method, output location.

Four entry types: PDF (use `pdf-intake` read-only), table files (header/type/time-column checks), databases (query contract, reproducible middle table), code-style DataLoader (review I/O contract, check leakage).

If raw directory doesn't fit project structure, copy into `data/raw_external/` or equivalent, then normalize. Downstream depends only on the normalized interface.

## Visual Analysis (Mandatory)

Plot first, then judge. At minimum:
- Raw time-series line plots, local zoom, entity/variable comparison
- Missing values, outliers, distribution drift, regime shift markers
- Rolling mean/variance, season/trend decomposition when possible
- ACF/PACF, spectrum, periodicity diagnosis when possible

If the figure is wrong (bad axes, hidden lines, missing legends, broken export), fix the figure first.

## Statistical / Feature Analysis

Check: length/frequency stability, missing patterns, outlier ratio, stationarity signs, trend/seasonality/noise/heteroscedasticity, lag relations, cross-entity patterns. Use `tsfresh`-style features to answer: is this trend-driven, cycle-driven, event-driven, or noise-driven?

## Method Family & Latest-Method Awareness

**Never default to a familiar method without checking what's current.** Before implementation:

1. Compare `direct use / zero-shot / few-shot / frozen-backbone / light adaptation / retraining` — training is NOT the default.
2. Consider at least these families in parallel:
   - Statistical (ARIMA, ETS, Prophet, state-space)
   - Traditional ML (XGBoost, LightGBM, CatBoost with lag features)
   - Deep learning (LSTM, TCN, Transformer variants, PatchTST, DLinear)
   - Pretraining / TSFM (Chronos, TimesFM, TimeGPT, Moirai, Lag-Llama)
   - Hybrid / rule-constrained / tool-enhanced
3. Each route must answer: why it fits, what assumptions, when it fails, engineering cost, can it be used directly/zero-shot/light-adapted.
4. If a TSFM/foundation route fails on environment/deps/weights, do NOT kill it directly. Judge workarounds: zero-shot, few-shot, frozen-backbone, lighter setup, window changes, two-stage design.
5. Use `information-collector` to search for latest methods and SOTA before committing to a route. Do not assume the method you know is the best available.

## Domain Priors (Brief)

Time-series tasks appear across many domains. Recognize the domain early — it shapes data patterns, constraints, and evaluation:

| Domain | Typical Patterns | Key Risks | Special Needs |
|--------|-----------------|-----------|---------------|
| **Energy/Power** | Strong daily/weekly cycles, weather sensitivity, holiday effects | Concept drift from policy/season changes, sensor faults | Load forecasting, demand response, renewable integration |
| **Finance/Trading** | Long-term trends, volatility clustering, regime switches, fat tails | Look-ahead bias, survivorship bias, market microstructure noise | Technical indicators, factor models, event studies, risk metrics (VaR, drawdown) |
| **Traffic/Transport** | Rush-hour peaks, weekend/weekday split, incident shocks | Sensor dropout, network topology effects, weather interaction | Spatiotemporal GNN, multi-sensor fusion |
| **Weather/Climate** | Multi-scale periodicity, spatial correlation, extreme events | Distribution shift from climate change, measurement drift | Physical constraints, ensemble methods, downscaling |
| **Healthcare/Medical** | Patient-specific baselines, intervention effects, irregular sampling | Missing not at random (MNAR), privacy constraints, small samples | Clinical validation, uncertainty quantification, causal inference |
| **Retail/Sales** | Holiday spikes, promotion effects, trend + seasonality, new product cold-start | Promotion confounding, stockout censoring, returns distortion | Hierarchical forecasting, causal impact, price elasticity |
| **Industrial/IoT** | Degradation trends, maintenance events, multi-sensor correlation | Sensor drift, unlabeled anomalies, concept drift from wear | Anomaly detection, remaining useful life, predictive maintenance |
| **Web/CloudOps** | Bursty traffic, diurnal patterns, deployment-induced shifts | High cardinality, concept drift from releases, alert fatigue | Anomaly detection, capacity planning, root-cause analysis |

For any domain: search both general TS methods AND domain-specific mechanisms. Do not treat domain keyword + "time series" as the whole first-round search.

## Forecast Validation

Before accepting any forecast output:
1. **Horizon length** — output must match task requirement exactly.
2. **Output schema** — clear schema first, then generate. Label sets enforced for classification/MCQ.
3. **Numerical plausibility** — units/scale match history, no unexplained explosion/drift/negative, volatility reasonable, physical/business constraints respected.
4. **Uncertainty strategy** — when evidence is weak, prefer `Uncertain`/intervals/confidence info over hard guessing.

## Post-Experiment Analysis

Do NOT look only at the main metric. Required before closeout:
- SHAP / feature attribution or equivalent explanation analysis
- Error distribution, residual diagnosis, failure cases
- Slice/cohort analysis (time range, horizon, entity)
- Statistical tests / significance when applicable
- Math-modeling view: can the error be rewritten as residual modeling, error decomposition, layered/segmented models, state-switch, or constrained optimization?

If any of these is missing, the experiment is not done.

## Test Loop

Fixed loop: save structured results → make plots with `scripts/plot/` → visual semantic analysis → targeted retest from visual findings → self-critique → `ts-critic` review again. If one link is missing, the loop is not complete.

## Length Awareness

Do not assume more history is always better. Look for the sweet spot: what short/middle/long windows each add, where noise dominates. For long history, consider: salient-subsequence retrieval, regime compression, structured summaries, parallel multi-scale windows.
