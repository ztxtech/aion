# Task: Retail Store Weekly Demand Forecast

Predict daily unit sales per store per category for a 3-day holdout (Apr 15-17, 2024) using 14 training days for 2 stores × 3 categories. Score: MAPE < 20%.

## Data

- `data/store_sales.csv`: date, store_id, category, units_sold, is_holiday, promotion_active. S003 Apr 5-7 has zero-as-missing gap → must be imputed.
- `data/hourly_traffic.xlsx`: HourlyTraffic sheet, resample to daily + 1-day lag.
- `data/regional_rules.pdf`: promotion multipliers Electronics ×1.4 / Grocery ×1.2 / Clothing ×1.1.
- `docs/historical_trend.png`, `docs/store_layout.png`.

## Three Rounds

1. **R1 baseline** — dispatch RA → IC → coder → c-critic. Expect c-critic to flag S003 NaN gap.
2. **R2 fix** — coder rebuilds with NaN imputation + traffic features + PDF promo weights.
3. **R3 finalize** — pre-stop gate (18 rows, no negatives, promo reflected, gap handled) + c-critic final approve-stop.

## Submission

`date,store_id,category,predicted_units` — 18 rows.

## Final Deliverable

Three-format report (md + html + pdf) under `docs/`. Every PASS row must cite a real source (session id, file path, tool call id). Unverifiable status must be ⚠ or ✗, never PASS.