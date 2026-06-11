Local Forecasting Competition

Overview

You are participating in a local forecasting competition modeled after grocery sales forecasting.

Your goal is to predict unit sales for a hidden forecast window using only the public data exposed through the evaluation interface. The evaluation logic and hidden targets are not visible to you. Treat the evaluator as a black box: you can download the public files, generate predictions, submit them, and receive a score.

What You Need To Predict

- Target: `sales`
- Granularity: one row per `date x store_nbr x family`
- Forecast window: `2017-07-31` through `2017-08-15`
- Forecast horizon: `16` days
- Evaluation rows: `2640`

Public Data Available

You may access the following public files from the evaluation interface:

- `train.csv`
  Columns: `id,date,store_nbr,family,sales,onpromotion`
  Coverage: `2013-01-01` through `2017-07-30`
  Rows: `275220`
  Scope: stores `1,2,3,4,5`, all `33` product families

- `test.csv`
  Columns: `id,date,store_nbr,family,onpromotion`
  Coverage: `2017-07-31` through `2017-08-15`
  Rows: `2640`
  This is the file you must predict for.

- `stores.csv`
  Columns: `store_nbr,city,state,type,cluster`

- `transactions.csv`
  Columns: `date,store_nbr,transactions`
  Coverage ends at `2017-07-30`

- `oil.csv`
  Columns: `date,dcoilwtico`

- `holidays_events.csv`
  Columns: `date,type,locale,locale_name,description,transferred`

- `sample_submission.csv`
  Columns: `id,sales`
  This shows the required submission schema only.

What Is Hidden

- The true `sales` values for the forecast window are hidden.
- The evaluation logic is only exposed through the scoring interface.
- You should assume you cannot inspect evaluator internals or private labels.

Output Requirements

You must submit a CSV file with exactly these columns:

- `id`
- `sales`

Submission rules:

- The header must be exactly `id,sales`.
- Every `id` from `test.csv` must appear exactly once.
- `sales` must be numeric and non-negative.
- Extra rows, missing rows, duplicate ids, or invalid values will cause submission failure.

Metric

Your score is `RMSLE`:

`RMSLE = sqrt((1 / n) * sum_i (log(1 + pred_i) - log(1 + true_i))^2)`

Interface Contract

You interact with the competition only through the external evaluation interface.

Base URL:

- The scoring server is fixed at `http://127.0.0.1:19999` unless the operator explicitly overrides it.
- A separate dashboard web page may run on another random local port.
- Use the scoring server URL for downloads and submissions.

Public endpoints:

- `GET /api/competition`
  Returns competition metadata.
- `GET /api/files`
  Lists available public files.
- `GET /api/download/<filename>`
  Downloads one public file.
- `POST /api/submit`
  Submits a CSV prediction file and returns a score.
- `GET /api/leaderboard`
  Returns ranked submissions.
- `GET /api/submission-records`
  Returns the full submission history.
- `GET /api/best-scores`
  Returns the current best score for each submitter id.

Submission identity

- Every submission must include a stable submitter id.
- This submitter id is part of the submission contract, not an optional display name.
- In automated test runs, the required submitter id may be provided to you through the initialization prompt.
- The evaluator tracks both full submission history and the best score achieved by each submitter id.

How To Submit

- Use the scoring server URL `http://127.0.0.1:19999` unless the operator explicitly tells you a different API port.
- Submit a CSV prediction file to `POST /api/submit`.
- Your request must include the submitter id in the `X-Submitter-Id` header.
- You may optionally include a human-readable filename in `X-Submission-Name`.

HTTP contract

- Method: `POST`
- URL: `http://127.0.0.1:19999/api/submit`
- Body: raw CSV bytes
- Required header: `X-Submitter-Id: <your-stable-id>`
- Optional header: `X-Submission-Name: <label-or-filename>`

Task

1. Predict `sales` for every row in `test.csv`.
2. Submit your predictions through the submission endpoint.
