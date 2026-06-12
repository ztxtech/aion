# Example

This directory contains ready-to-run example workspaces that demonstrate how AION operates on concrete time-series tasks.

Each example is a self-contained scenario with its own task specification, data, and (where applicable) evaluation infrastructure. You can point AION at any example workspace and run it end-to-end.

> **Looking for the AION recording demo?** The clinical case used to record the AION demo video lives in [`aion-medical-demo/`](./aion-medical-demo/) right here in `example/` — see its `README.md` for the wrapper purpose, then [`aion-medical-demo/medical/case.md`](./aion-medical-demo/medical/case.md) for the task itself. That directory is a **recording project**: its goal is to make every AION harness feature fire in a single run.

## Contents

| Directory | Description |
|-----------|-------------|
| [`aion-medical-demo/`](./aion-medical-demo/) | **AION recording demo (wrapper).** Saturated clinical case that triggers every AION harness feature in one run, used to record the AION demo video. **Not for clinical use.** |
| [`kaggle/`](./kaggle/) | Local Kaggle-like forecasting competition — a holdout slice of the Kaggle "Store Sales - Time Series Forecasting" competition, served through a local evaluation API with leaderboard and submission tracking |

## How to Use

1. Pick an example workspace (e.g. `example/kaggle/workspace/`).
2. If the example has a server component, start it first (see the example's own README).
3. Point AION at the workspace's `task.md` and run.

Each example README describes the original task, what was adapted, and how to start the local environment.
