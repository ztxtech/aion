# Commit Note — 2026-08-23-0ceb94b-scored-task-feedback-loop

## What changed

Added a scored-task feedback loop to the AION harness: core.md rule #8, agent.md startup step 3 (mandatory task.md read + submit-contract extraction), dispatch coder contract (submit → record score → report), c-critic 1c (stop requires ≥2 submissions), ts-critic stop gate improvement criterion, experiment skill platform-scoped submission rules.

## Motivation

Harness observation showed that a multi-agent chain could complete its internal pipeline (multiple code versions, full training runs) without ever consuming the submission/scoring contract defined in the task, and without a single explicit submission or score read. The only submission was a runner-side auto-submit at timeout. Internal validation looked fine but never reached the scorer.

Root cause: no role owned the submit → read-score → iterate loop; the flow treated "submit" as terminal cleanup instead of an iteration tool.

## How

- `rules/core.md`: rule 8 feedback loop (platform-only scoping)
- `agents/agent.md`: startup step 3 — task.md read is mandatory; extract submit contract into context-snapshot
- `protocols/dispatch.md`: scored-task dispatch — coder submits before reportback, appends {version, change, score, ts} to `memory/score-history.md`
- `agents/c-critic.md`: 1c — stop requires ≥2 submissions AND flat last-2 scores (or quota nearly spent); zero submissions = blocker
- `agents/ts-critic.md`: stop gate asks "can score still improve"; open-ended tasks (no scorer) exempt from plateau-based stopping
- `skills/experiment/SKILL.md`: platform-scoped submission rules + versioning

## Pitfalls avoided

- **Task-type scoping**: all new rules are "platform only" (scored tasks); open-ended research/analysis tasks keep evidence-driven convergence. Do not let scored-task rules leak into non-scored tasks.
- **Model context 128K constraint**: initial prompt + task requirements must stay focused; kernel kept ≤ ~1.1K tokens, all detail in on-demand files.
- **Submit-contract discovery**: if a task mentions a scorer without an endpoint, look in workspace scripts/API docs before guessing; never read judge internals.

## Confidentiality

This note intentionally carries no external-evaluation-identifying details (task ids, scores, or cross-harness comparisons). External evaluation results are not public until release.

## Links

- Critic rule: `devnotes/critic/scored-task-zero-submissions.md` (linked)