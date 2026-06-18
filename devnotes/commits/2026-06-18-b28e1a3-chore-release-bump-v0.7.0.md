# Commit Entry: bump to v0.7.0

> **Commit**: `b28e1a3` (`b28e1a3`)
> **Date**: 2026-06-18
> **Author**: ztx
> **Branch**: dev
> **Type / Scope**: `chore(release)`

## Summary

Bumps the package version from 0.6.0 to 0.7.0 and adds a one-line News
entry to both the English and Simplified-Chinese READMEs. v0.7.0 is a
minor-version bump because it removes a documented subsystem (team mode)
and ships a small behavior change to the TUI todo-list sync (see the
next two commit entries).

## What Changed

- `package.json:3` — `"version": "0.6.0"` → `"version": "0.7.0"`.
- `README.md:14-17` — added a 2026-06-18 v0.7.0 News bullet above the
  existing 2026-06-14 entry.
- `README.zh-CN.md:14-17` — same News bullet in Chinese.

## How It Was Done

Version is a single source of truth: `package.json`. Per the project
rule, no other file embeds the version string, so no other edits were
needed.

The News entry was added above the previous one (most-recent-first) and
written in both languages because the README is bilingual and the News
section is meant to be scan-readable. The bullet is two clauses, not a
full changelog — the full rationale lives in the two commit entries
that follow this one.

## Verification

- `git diff HEAD~1 -- package.json README.md README.zh-CN.md` →
  9 insertions, 11 deletions (the 11 deletions are the old `-` blocks
  being replaced; the 9 insertions are the new bullet + bumped
  version + a one-line context block).
- `git grep -n "0\.6\.0"` (post-commit) → no remaining matches in
  `package.json`, `cli.sh`, `scripts/`, or READMEs.

## Pitfalls to Avoid

- The News bullet is a summary, not a changelog. The per-commit detail
  belongs in `commits/` (this file) and in the GitHub Release body,
  not in the README. Do not bloat News into a copy-paste of the commit
  body — that defeats the point of the devnotes/ folder.

## Related

- Commit: `b28e1a3`
- Other commit entries: `commits/2026-06-18-392dd4c-refactor-plugins-remove-team-mode.md`,
  `commits/2026-06-18-12452f8-fix-hooks-tui-todo-drift-sync.md`
