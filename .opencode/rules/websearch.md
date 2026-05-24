# Aion Search Rules

## Debug Prefix Protocol

- When this rule is quoted, executed, or explained, print this first: `[Rules: websearch] Follow: <why this rule is used now>; Current step: <one-line note>`
- Say what this rule is constraining right now, then continue with the main content.

- Read local material first, then decide whether external search is needed.
- Priority order: official docs > official repo > original paper > high-quality implementation > community experience.
- Search must not stop after one try. By default it should do `search-engine rotation` and cover at least search styles like Google, Bing, Brave, Baidu, and Exa. If the runtime cannot switch engines directly, simulate rotation through query rewrites, site filters, synonym changes, ranking-assumption changes, and multiple supplementary rounds.
- The first round is for recalling candidate links, not for making a conclusion at once. By default do at least 2 to 3 rounds of query rewrites before deciding whether to narrow.
- When `OPENCODE_ENABLE_EXA=1` is enabled or Exa is available, prefer Exa / Exa-backed search as the wide discovery layer, not mixed together with body-reading tools.
- Every external search should expand at least five axes in parallel by default: direct problem search, lower-level / decomposed search, related search, heuristic-rewrite search, and trend-platform search. Do not search the user sentence once and stop.
- If the task has a public leaderboard, public ranking, public solution page, public high-score submission, or public benchmark board, the search matrix must also keep a separate `public high-score reverse-absorption` axis and push it in parallel with the original problem branch.
- This reverse-absorption axis should at least keep tracing: leaderboard / score, top solutions / top submitters, related repos / model cards / dataset cards / issues / discussions / engineering writeups, and which components may create the big advantage.
- Lower-level / decomposed search should split the problem into higher-level concepts, subproblems, basic abilities, signal types, target variables, and eval settings, then search them separately.
- Related search should actively find equivalent wording, nearby tasks, nearby mechanisms, and alternate descriptions, for example rewriting the object as signal, event, regime, control, retrieval, planning, and similar forms.
- Heuristic-rewrite search should cover synonym rewrites, reverse questions, task restatements, input / output changes, target-function changes, and failure-mode questions, not keep only one keyword.
- Trend search should check recent paper platforms like `https://huggingface.co/papers/`, `https://www.alphaxiv.org/`, and `https://www.paperdigest.org/arxiv/`. If they have day / week / month views, scan related topics in all of them and read matched papers in parallel.
- Trend platforms are not optional bonus content. If the task needs recent methods, research ideas, or current paper context, they must be in the search matrix.
- Default tool split:
  - `websearch` / Exa: discovery, recall, query-rotation, cross-site candidate URL collection.
  - `webfetch`: read candidate page bodies, good for official docs, articles, paper pages, issue/PR pages, and platform intro pages.
  - `curl`: read raw text/markdown/json, inspect headers/redirects, call simple APIs, test reachability, or patch gaps when `webfetch` is unstable.
- The recovery chain after search failure must be explicit, not just `refresh and try again`:
  - First identify the failure signal: 429, captcha, timeout, connection reset, anti-bot block, abnormal empty SERP.
  - Then switch to another search engine or platform so the current entry is not hit again.
  - Then look up the public shortest retry interval, cooldown, or `Retry-After` clue for that failed entry.
  - Finally run a randomized `sleep` in the terminal, then decide whether to go back.
- If `curl` can read headers, redirects, or response hints from the failed entry, use `curl` first to extract `Retry-After` or an equivalent wait clue. Otherwise use another search engine to look up the shortest retry interval for that entry.
- If the shortest retry interval is already known, do not hardcode an exact second count. Use `minimum interval + random jitter`. If it is not known, use a conservative random backoff.
- When the task gives only a data interface, SDK, API, library, platform, or service name, but not the official site, docs entry, or official repo, the first step is to locate the official site and official docs entry, not jump into second-hand tutorials.
- When search hits a person name, project name, repo name, model name, GitHub / Hugging Face / ModelScope page, username, org name, or label / topic / tag / collection, keep doing associative expansion search by default: trace newer work, latest release / commit / paper / model / dataset / Space / collection, and same-tag / same-topic / same-collection pages.
- If the first hit is clearly old, or there is newer work in the author / org / tag network that covers the current task better, keep following those links until the newer implementation is found. Do not stop on the old page.
- Once the official site is identified, continue to find its official docs / developer / reference / guide / API entry first. If the official site itself is the docs site, treat it as the main entry.
- Once the correct official docs page is found, read the full doc chain related to the current task by default. Parallel reads are allowed, but one matched page is not enough.
- `Read the full chain` should include at least: quick start, core concepts, API / interface reference, auth / config, limits / quota, error handling, version info, examples, and task-specific topic pages.
- If the official docs have a nav tree, sidebar, index page, reference index, or tutorial index, follow those entries to cover related pages until you can say which pages were covered and which are irrelevant to the task.
- For high-risk decisions like design, interface choice, or integration implementation, do not conclude from second-hand blogs, forum quotes, or model memory before the official docs are read clearly.
- For OpenCode questions, follow `opencode.md` first: docs source directory first, GitHub repo second.
- GitHub access should go through `github-search` first. Hugging Face and ModelScope should also be treated as first-hand platform entries in parallel, not only GitHub.
- For models / data / weights / pipelines / model cards / dataset cards, check GitHub, Hugging Face, and ModelScope together by default, then decide which one is the strongest evidence for the current task.
- For time-sensitive questions, confirm at least the current version, recent commits, or information from the last 5 years.
- Keep source, time, or version information in the output, and separate facts from inference.
