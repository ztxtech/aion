# Scored Task With Zero Submissions Is Incomplete

**Severity**: must-always-avoid.

## Rule

A scored task (scorer/submission API defined in the task contract) is not complete until its deliverable actually reached the scorer and the returned score was consumed. Zero submissions for a scored task is a blocker, regardless of how good internal validation looks.

## Why

Internal validation is an estimate; the scorer's returned score is the only ground truth for iteration. A deliverable that never reached the scorer produces no feedback and proves nothing about the result. Treat "submit→read score→decide next change" as part of the task loop, not as terminal cleanup.

## Enforcement in harness

- core rule 8 (feedback loop, platform-only)
- coder dispatch: submit before reportback, record {version, change, score, ts} in score-history
- c-critic 1c: stop requires ≥2 submissions AND flat last-2 scores (or quota nearly spent)

## Related

- Commit note: `devnotes/commits/2026-08-23-0ceb94b-scored-task-feedback-loop.md`
- Scoping: applies to scored/platform tasks only; open-ended research/analysis tasks are exempt.