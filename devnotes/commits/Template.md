# Commit Entry: <short commit subject>

> **Commit**: `<full-hash>` (`<short-hash>`)
> **Date**: YYYY-MM-DD
> **Author**: <name>
> **Branch**: <branch>
> **Type / Scope**: `<type>(<scope>)` per Conventional Commits

## Summary

One-paragraph description of *what* this commit changes and *why* it exists.
A reader who skips the rest of the file should still understand the intent.

## What Changed

Bullet list of concrete changes, grouped by area. Reference source paths as
`path/to/file.ts:line` so readers can jump straight to the code.

- Area A
  - `src/foo/bar.ts:42` — did X.
  - `src/foo/baz.ts:17` — added Y.
- Area B
  - `scripts/dev-install.sh` — updated Z.

## How It Was Done

The implementation story. Decisions, tradeoffs, non-obvious moves. This is the
section that pays for itself the next time someone touches the same area.

- Approach chosen and the alternatives that were considered.
- Key APIs, libraries, or internal modules that were relied on.
- Assumptions made about the runtime, environment, or upstream contracts.
- Any data migrations, feature flags, or rollout steps required.

## Verification

Evidence that the change actually works. Cite exact commands and their results.

- `npx tsc --noEmit` → 0 errors.
- `npm run test:unit` → 142 passed, 0 failed.
- `npm run lint` → 0 warnings.
- Manual check: <describe>.

## Pitfalls to Avoid

Problems that came up, mistakes that almost shipped, or sharp edges that the
next contributor will hit unless warned. Be specific. "Be careful" is useless;
"do not call `foo()` before `bar()` is initialized, or it throws" is useful.

- Pitfall 1 — symptom, root cause, prevention.
- Pitfall 2 — symptom, root cause, prevention.
- Pitfall 3 — symptom, root cause, prevention.

## Follow-ups

Optional. List anything intentionally *not* done in this commit, or work that
this commit unblocks but does not finish.

- [ ] Follow-up A — owner, target version.
- [ ] Follow-up B — owner, target version.

## Related

- Commit: `<full-hash>`
- PR / Issue: <link>
- Critic rules touched: `critic/<rule>.md`
- Other commit entries: `commits/<other-entry>.md`
