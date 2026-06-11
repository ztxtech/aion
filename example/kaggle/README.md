# Local Kaggle-Like Forecasting Competition

A self-contained local replica of the Kaggle competition **[Store Sales - Time Series Forecasting](https://www.kaggle.com/competitions/store-sales-time-series-forecasting)** (Corporación Favorita), adapted for fast offline iteration with AION.

## Original Kaggle Competition

**Corporación Favorita** is a large Ecuadorian supermarket chain. The original Kaggle competition asked participants to forecast daily sales for 54 stores across 33 product families over a 16-day horizon (2017-08-16 to 2017-08-31).

Key facts of the original competition (verified from Kaggle download):

- **Stores**: 54 (store_nbr 1–54)
- **Product families**: 33
- **train.csv**: 3,000,888 rows (2013-01-01 to 2017-08-15)
- **test.csv**: 28,512 rows (2017-08-16 to 2017-08-31)
- **Target**: `sales` (unit sales) at `date × store_nbr × family` granularity
- **Metric**: RMSLE — `sqrt((1/n) * Σ (log(1+pred) - log(1+true))²)`
- **Submission limit**: 5 per day
- **Leaderboard**: public/private split on Kaggle's platform

The original dataset is ~3M rows. Downloading and iterating on Kaggle directly is slow due to the submission queue, daily limits, and leaderboard latency.

## What We Changed

To enable rapid local experimentation, we made the following adaptations:

### 1. Data Subset

| Metric | Original Kaggle | Local Version |
|--------|-----------------|---------------|
| Stores | 54 (1–54) | 5 (1–5) |
| Product families | 33 | 33 (all retained) |
| Train rows | 3,000,888 | 275,220 |
| Train date range | 2013-01-01 to 2017-08-15 | 2013-01-01 to 2017-07-30 |
| Test rows | 28,512 | 2,640 |
| Test date range | 2017-08-16 to 2017-08-31 | 2017-07-31 to 2017-08-15 |
| Forecast horizon | 16 days | 16 days |
| Rows per day | 1,782 (54×33) | 165 (5×33) |

**Key difference**: We shifted the forecast window earlier. The original Kaggle test period is 2017-08-16 to 2017-08-31, but our local version uses 2017-07-31 to 2017-08-15. This means the hidden labels in our local version come from what was originally part of the Kaggle training data.

Auxiliary data (oil, holidays, transactions, stores) filtered to the same store set and date range.

### 2. Public/Private Split

The original Kaggle competition hides the test labels. We replicate this:

- `public_data/` — everything the agent is allowed to see (train, test without labels, auxiliary files)
- `private_data/ground_truth.csv` — the true sales values for the forecast window, only accessible to the server for scoring

### 3. Local Evaluation Server

Instead of submitting to Kaggle's platform, we run a local HTTP server that mimics the Kaggle API:

| Feature | Kaggle Original | Local Server |
|---------|----------------|--------------|
| Submission endpoint | Kaggle web UI / API | `POST http://127.0.0.1:19999/api/submit` |
| Daily submission limit | 5/day | No limit (server architecture supports adding one) |
| Leaderboard | Public/private split | Full real-time leaderboard via `/api/leaderboard` |
| Scoring latency | Minutes to hours | Instant (local RMSLE computation) |
| Dashboard | Kaggle website | Local web dashboard on a random port |
| Reset | N/A | `reset.sh` clears all state |

### 4. Server Architecture

```
server/
├── kaggle_local_server.py   # HTTP server: API + scoring + dashboard
├── prepare_data.py          # Slices original Kaggle data into public/private split
├── start_server.sh          # Starts server with port management and cleanup
├── reset.sh                 # Clears all submissions, leaderboard, and logs
├── submit_local.py          # CLI helper for submitting CSV files
├── public_data/             # Files the agent can download via API
│   ├── competition.json     # Competition metadata
│   ├── train.csv            # Historical sales (stores 1-5, up to 2017-07-30)
│   ├── test.csv             # Forecast window rows (no sales column)
│   ├── stores.csv           # Store metadata (stores 1-5)
│   ├── transactions.csv     # Historical transaction counts
│   ├── oil.csv              # Oil prices
│   ├── holidays_events.csv  # Holiday and event data
│   ├── sample_submission.csv
│   └── official_test_reference.csv
├── private_data/
│   └── ground_truth.csv     # True sales values (hidden from agent)
└── runtime/                 # Generated at runtime
    ├── submissions/         # Submitted CSV files
    ├── leaderboard.json     # Ranked submissions
    ├── submission_records.json
    ├── best_scores.json     # Best score per submitter
    └── server.log
```

### 5. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/competition` | Competition metadata |
| GET | `/api/files` | List available public files |
| GET | `/api/download/<filename>` | Download a public file |
| POST | `/api/submit` | Submit predictions (header: `X-Submitter-Id`) |
| GET | `/api/leaderboard` | Ranked submissions |
| GET | `/api/submission-records` | Full submission history |
| GET | `/api/best-scores` | Best score per submitter |
| GET | `/api/dashboard-data` | Dashboard payload (JSON) |

## Quick Start

```bash
# 1. Start the server
bash example/kaggle/server/start_server.sh

# 2. In another terminal, verify it's running
curl http://127.0.0.1:19999/api/competition

# 3. Point AION at the workspace
opencode run --agent agent "Read example/kaggle/workspace/task.md and complete the task"

# 4. Reset state (clears all submissions and leaderboard)
bash example/kaggle/server/reset.sh
```

## Workspace

The file `workspace/task.md` is the task specification given to the AION agent. It describes:

- What to predict (sales for the 16-day forecast window)
- What data is available (via the server API)
- What is hidden (ground truth labels)
- The submission format and metric
- The API contract for interacting with the server

The agent interacts with the competition **only through the API** — it cannot read `private_data/` directly. This mirrors the Kaggle setup where test labels are inaccessible.
