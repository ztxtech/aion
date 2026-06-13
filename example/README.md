# Example

This directory contains ready-to-run example workspaces that demonstrate how AION operates on concrete time-series tasks.

Each example is a self-contained scenario with its own task specification, data, and (where applicable) evaluation infrastructure. You can point AION at any example workspace and run it end-to-end.

## Contents

| Directory | Description |
|-----------|-------------|
| [`kaggle/`](./kaggle/) | Local Kaggle-like forecasting competition — a holdout slice of the Kaggle "Store Sales - Time Series Forecasting" competition, served through a local evaluation API with leaderboard and submission tracking |

## How to Use

1. Pick an example workspace (e.g. `example/kaggle/workspace/`).
2. If the example has a server component, start it first (see the example's own README).
3. Point AION at the workspace's `task.md` and run.

Each example README describes the original task, what was adapted, and how to start the local environment.
