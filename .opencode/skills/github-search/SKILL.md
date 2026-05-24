---
name: github-search
description: Use GitHub, Hugging Face, and ModelScope as first-hand engineering evidence sources when you need to confirm real implementation, directory layout, commit history, issue / PR context, or model/data/weight platform assets.
---

## Debug Prefix Protocol

- When called, print this first: `[Skills: github-search] Follow: <rules / context constraints that really apply now>; Current step: <one-line note>`.
- If this skill clearly depends on one rule, add one more line like `[Rules: <rule>] ...`, then continue with the real work.
- The debug prefix should stay stable, short, and easy to grep.


## When To Use

- Official docs are not detailed enough, or docs and real behavior do not match.
- You need to locate whether one feature really exists, which file implements it, and how it changed recently.
- You need representative open-source implementations, issue discussions, or PR background.
- You need to confirm models, datasets, pipelines, model cards, dataset cards, or community discussions on Hugging Face / ModelScope.
- You need to trace from a public leaderboard, public solution page, or high-score solution to the related repo, author, org, tags, and newest work.
- You need to keep doing associative expansion from a person, org, repo, or label / topic / tag / collection instead of stopping on the current page.

## Flow

- If the platform is already known, start from that platform first. If not, use `websearch` / Exa for minimal discovery, then decide whether GitHub, Hugging Face, or ModelScope should be first.
- If the hit is a person, org, repo, model card, dataset card, Space, discussion, or label / topic / tag / collection, do not stop on the current page by default. Keep tracing the related `username / org`, newest work, pinned / featured projects, latest release, recent commit, recent paper / model / dataset / Space, and related same-tag / same-collection projects.
- Read README / model card / dataset card / pipeline pages, related directories, and key files first, then read issues, PRs, discussions, recent commits, or version records.
- If the task has a public leaderboard, public ranking, or public high-score solution, follow the board to top solutions, top submitters, related repos / cards / discussions / releases / issues first, and summarize clearly which engineering parts really create the advantage.
- Record the current implementation on the default branch first. If the conclusion depends on historical change, add the commit timeline after that.
- For conflicts like `docs say supported, but code does not show it`, write clearly where the docs evidence comes from and where the code / platform-asset evidence comes from.
- Treat GitHub / Hugging Face / ModelScope as parallel by default:
  - GitHub: source code, issues, PRs, commit history, releases
  - Hugging Face: model cards, dataset cards, Spaces, weight availability, inference examples, community discussion
  - ModelScope: model pages, dataset pages, pipelines, Chinese ecosystem implementations, local mirror availability

## Output Format

- Target platform / repo
- Related username / org / label / topic / collection
- Key files / cards / issues / PRs / commits / discussions
- Extracted evidence
- Newest work and associative-search results
- Impact on the current task
- Items still to confirm
