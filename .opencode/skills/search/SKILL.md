---
name: search
description: External evidence collection — web search, GitHub/HF/ModelScope. Multi-axis search with recovery chain.
---


# Search

## Principles

- Read local material first, then decide whether external search is needed.
- Priority: official docs > official repo > original paper > high-quality implementation > community experience.
- Tool split: `websearch`/Exa for discovery, `webfetch` for page bodies, `curl` for raw text/headers/APIs.
- For GitHub repo implementation, issues, PRs, commits, releases: use `github-search` explicitly. Generic web search is not enough.
- For models/datasets/weights: check GitHub + Hugging Face + ModelScope in parallel.

## Multi-Axis Search Matrix

Open at least these dimensions in parallel:

1. **Direct problem search** — the task as stated.
2. **Lower-level/decomposed search** — split into concepts, subproblems, signals, targets, eval settings.
3. **Related search** — equivalent wording, nearby tasks, alternate descriptions.
4. **Heuristic-rewrite search** — synonyms, reverse questions, restatements, failure modes.
5. **Trend-platform search** — scan `huggingface.co/papers/`, `alphaxiv.org`, `paperdigest.org/arxiv/` for recent work.

Do NOT search the user's original sentence once and stop.

## Recovery Chain

On search failure (429, captcha, timeout, anti-bot):
1. Switch to another engine or platform.
2. Look up public retry interval / `Retry-After` for the failed entry.
3. Use `minimum interval + random jitter` sleep, then decide whether to go back.
4. Keep collecting from other sources in parallel.

## Identity/Tag Graph Expansion

When search hits a person, repo, model, org, or tag: keep tracing newer work, latest release/commit/paper, same-tag pages. Do not stop on the first hit. If a newer work in the same network covers the task better, promote it.

## Platform Rules

If the task involves a platform/contest/benchmark host, also search: submit quota, daily limits, cooldown, eval delay, public/private leaderboard, code/resource limits, submit format. Do not enter platform submission before rules are clear.

## Output

- Search matrix with axes covered
- Rebuilt search question set
- Evidence with source, time, version
- Separate facts from inference
- `Have we collected enough?` — explicit yes/no with reasons
- If not enough: `still need more collection` + next-round actions
