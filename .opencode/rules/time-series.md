# Aion Time-Series Rules

## Debug Prefix Protocol

- When this rule is quoted, executed, or explained, print this first: `[Rules: time-series] Follow: <why this rule is used now>; Current step: <one-line note>`
- Say what this rule is constraining right now, then continue with the main content.

- First identify the task type: forecasting, classification, detection, segmentation, anomaly detection, representation learning, or a mix of them.
- Write time format clearly: timestamps, timezone, frequency, window, forecast step, entity granularity, and exogenous variables.
- Prevent leakage before talking about quality: split, normalization, feature building, and target alignment must all follow time boundaries.
- Give at least one naive or classic baseline. Do not compare a complex model only to itself.
- Watch missing values, outliers, scale gaps, concept drift, holiday / event shocks, and regime shift.
- Eval metrics must match the task goal. If needed, separate point forecast, interval forecast, ranking, or event-level metrics.
- Save important priors, stable patterns, and common traps into `positive.md` and `negative.md` separately.
