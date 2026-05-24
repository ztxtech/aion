# OpenCode Rules
## Debug Prefix Protocol

- When this rule is quoted, executed, or explained, print this first: `[Rules: opencode] Follow: <why this rule is used now>; Current step: <one-line note>`
- Say what this rule is constraining right now, then continue with the main content.


1. Docs source directory

- URL: <https://github.com/anomalyco/opencode/tree/dev/packages/web/src/content/docs>
- Best for:
  - How to use it
  - Config notes
  - Feature explanations
  - Documented abilities like rules / tools / agents
- Notes:
  - This path is the docs source directory inside the repo, not only the website entry page
  - The link points to the `dev` branch, so it may be newer than a released version

2. GitHub repo

- URL: <https://github.com/anomalyco/opencode>
- Best for:
  - Real implementation
  - The true source when docs are vague
  - Directory layout
  - Code examples
  - Issue / PR context
  - Recent changes and commit history
- Prefer the repo in these cases:
  - Docs and real behavior do not match
  - You need to confirm whether some feature is truly supported
  - You need the exact file, branch, or commit for a feature

3. Execution preference

- Read the docs source directory first, then check the real implementation in the GitHub repo.
- Web discovery should use `search-engine rotation + web-read tool split` by default, not one query and stop.
- If the task has a public leaderboard, public ranking, public solution page, or public high-score solution, OpenCode-side web discovery should also keep a separate `public high-score reverse-absorption path` in parallel with the self-explore path.
- Mainstream search / discovery entry points should at least cover Google, Bing, Brave, Baidu, and Exa. If the runtime cannot switch engines one by one, simulate rotation by rewriting queries, adding synonym forms, and using different ranking assumptions.
- When the host or test environment enables `OPENCODE_ENABLE_EXA=1`, treat Exa as the default wide-discovery entry. It is good for first-pass recall, latest-result discovery, cross-site candidate URL collection, and parallel multi-query search.
- `webfetch` is good for: reading bodies of known URLs, official docs pages, paper pages, blog posts, issue/PR pages, and other pages where the model should read clean body text.
- `curl` is good for: stable direct links, raw text/markdown/json, HTTP headers and redirects, simple API responses, `robots.txt`, and cases where `webfetch` is unstable or the exact response body is needed.
- GitHub access should go through the local `github-search` skill first, then go back to repo pages, commit history, or issue / PR details.
- When search hits a person name, project name, repo name, username, org name, or label / topic / tag / collection on GitHub / Hugging Face / ModelScope, do not stop on the current page. Keep following related accounts, newer work, latest release / commit, related labels / topics / collections, and same-family projects.
- For clues about models / data / weights / model cards / dataset cards / pipeline implementations, Hugging Face and ModelScope should be treated as first-hand engineering platforms at the same level as GitHub, not just as normal web attachments.
- If a search engine or discovery entry shows failure signals like 429, captcha, timeout, connection reset, anti-bot blocking, or abnormal empty results, do not hard-retry the same entry right away.
- The default failure recovery chain is: switch to another search engine or platform -> search the public shortest retry interval / cooldown / `Retry-After` clue for the failed entry -> run a randomized `sleep` in the terminal -> then decide whether to go back.
- If the failed entry itself gives wait clues in headers or response body, use `curl` to read those header / redirect / response hints first. If not, use another search engine to look up the shortest retry interval or public cooldown experience for that entry.
- If a clear shortest retry interval is found, the wait should use `minimum interval + random jitter`, not an exact second count. If no clear interval is found, use a conservative random backoff and continue.

Example shell:

```bash
BASE=30
JITTER=45
sleep "$((BASE + RANDOM % JITTER))"
```
- When docs and code do not match, trust the verifiable implementation and recent commits, and say clearly in the conclusion that this mismatch exists.

3.1 Hugging Face / ModelScope platform slot

- Hugging Face:
  - Good for models, datasets, Spaces, model cards, dataset cards, paper pages, inference examples, and community discussion.
  - When the task touches LLMs, open weights, dataset baselines, inference APIs, or model reuse style, search it by default.
- ModelScope:
  - Good for models, datasets, pipelines, Chinese ecosystem implementations, task pages, ModelScope Studio / community notes, and domestic mirror availability.
  - When the task touches Chinese models, domestic mirrors, ModelScope pipelines, local open-source implementations, or Hugging Face mirror sync, search it by default.
- GitHub / Hugging Face / ModelScope are parallel first-level evidence sources for code and model assets:
  - GitHub is stronger for source code, issues, PRs, and commit history
  - Hugging Face is stronger for model/data cards and directly reusable assets
  - ModelScope is stronger for the Chinese model ecosystem, pipelines, and local availability


4. Long Bash / experiment runs

- If the built-in bash tool shows something like `bash tool terminated command after exceeding timeout 300000 ms`, first adjust timeout with the official CLI docs before blaming the experiment itself.
- The official OpenCode CLI environment variable is `OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS`, used to set the default timeout for bash commands in milliseconds.
- For long-running experiments, set it clearly before starting OpenCode, for example 2 days:

```bash
export OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS=172800000
opencode
```

- Or set it inline for one start:

```bash
OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS=172800000 opencode
```

- `172800000` milliseconds means 2 days.
- If the experiment is very long, very noisy, or needs continuous watching, still prefer scripting the training / experiment and combining it with `tmux` / `screen` / background runs / structured logs on disk, instead of blocking all long jobs inside one synchronous bash tool call.
- When the task clearly contains long experiments, the main agent and `coder` should explicitly check whether this variable is already set in the environment. If not, they should warn or add it before the command, then start the long job.

4.1 Session continue and non-interactive runs

- The official OpenCode CLI clearly supports `-c` / `--continue` to continue the latest session, and `-s` / `--session <id>` to continue a chosen session. So when one run ends naturally, first consider `restart and continue that session`, instead of assuming a human must return to the original TUI and type continue.
- The official CLI also provides `opencode run [message..]`. For human-free runs, benchmarks, batch tests, overnight runs, and automatic log export, prefer `opencode run`, because it is easier to wrap with shell scripts, loops, and watchdogs than the default TUI.
- The official OpenCode CLI also supports `-m` / `--model` to set the model explicitly. The help text says the format is `provider/model`. When benchmarks, reproduction, or multi-provider comparisons need a fixed model, write it into the command or start script instead of depending only on the local default config.
- If you only want to solve `continue after one run ends`, the first choice is an outer shell loop plus `opencode run --session <id> "<continue prompt>"` or `opencode --session <id> --prompt "<continue prompt>"`.
- `tmux` can help with watching and recovery, but it mainly solves `detach from this terminal and re-attach or send-keys later`. It is not the only mechanism for session continuation in OpenCode.
- When the need is `long unattended runs but still keep a manual entry window`, the recommended combo is:
  - use `tmux` to host the outer shell or log watch
  - use `opencode run` for one run
  - use `--model provider/model` to fix the model for the run
  - use `--continue` / `--session` for auto continue
  - use `opencode session list` / `opencode export` for final evidence collection
- If a run stops around 2 hours and the bash default timeout is already raised to 2 days, do not keep blaming `OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS`. First check whether the session just ended naturally, whether the model stopped output, or whether the current script does not handle session continuation.


5. TODO / task list

- Official OpenCode docs already show built-in `todowrite`, used to manage and update todo lists in complex tasks. The permission model also includes `todoread` / `todowrite`.
- So for complex tasks, multi-stage tasks, multi-agent tasks, and formal delivery tasks, the plan should not stay only in plain text. The main agent should prefer turning the plan into an OpenCode TODO list and keep updating it during execution.
- TODO is not a one-time static list: whenever a step finishes, new evidence appears, `ts-critic` sends blockers, rebuttal starts, rollback is needed, or the route changes, rewrite or reorder the TODO list.
- The minimal TODO state meaning should stay `todo` / `in-progress` / `done`. Cases like `paused`, `blocked`, or `waiting for external input` should be expressed by notes or extra follow-up TODO items, not by inventing new hidden states.
- The plan output should also include a clear `TODO mapping table`: which plan step maps to which TODO item, what triggers updates, which role owns it, and what the rollback rules are.
- If `ts-critic` judges that the current step can stay on the same route but needs more evidence, more validation, or partial rework, the related TODO should move from `done` back to `in-progress`. If `ts-critic` judges that the current assumption failed, earlier steps must be revisited, the route must change, or the rebuttal is rejected, the related TODO should move from `done` or `in-progress` back to `todo`, and dependent downstream TODO items should also roll back.
- If `ts-critic` says the current step is not valid, needs more evidence, or must roll back, earlier TODO items must go back to unfinished state, and new follow-up items must be added if needed. Do not say this only in plain text.
- When docs, implementation, or permission config allow it, the main agent should prefer `todowrite` / `todoread` for TODO management, instead of keeping a fake plan only inside answer text.
