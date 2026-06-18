# Commit Entry: remove team mode — serial-only execution

> **Commit**: `392dd4c` (`392dd4c`)
> **Date**: 2026-06-18
> **Author**: ztx
> **Branch**: dev
> **Type / Scope**: `refactor(plugins)`

## Summary

Removes the entire team-mode subsystem: 6 source files in `src/team/`,
14 registered tools (`team_create` … `team_task_update`), the
`aionConfigSchema.teamMode` block, the workspace bootstrap of
`.aion/{teams,runtime}/`, the `AION_TEAM_ELIGIBLE_AGENTS` /
`AION_TEAM_HARD_REJECT` membership sets, and 53 dedicated team tests.
After this commit the plugin only exposes the serial-loop scheduling
model — `requirements-analyst → information-collector → coder`, each
sandwiched between `ts-critic` pre- and post-reviews.

The decision was driven by token cost: the team mode fanned out up to
8 subagents in parallel and the LLM paid the full context-window
overhead even when only one worker was needed.

## What Changed

- Source removed
  - `src/team/coordinator.ts`, `mailbox.ts`, `store.ts`, `tasks.ts`,
    `tmux.ts`, `tools.ts` (1585 lines total).
  - `test/unit/team.test.mjs` (53 tests).
  - `docs/team-mode.md`.
  - `.aion/teams/` and `.aion/runtime/` runtime dirs (also dropped
    from `workspace-bootstrap.ts`).

- Config schema (`src/config/types.ts`)
  - Removed `teamModeConfigSchema` and the `teamMode` field on
    `aionConfigSchema`.
  - Removed `TeamModeConfig` type and the
    `AION_TEAM_ELIGIBLE_AGENTS` / `AION_TEAM_HARD_REJECT` exports.

- Config loader (`src/config/load-config.ts`)
  - Removed `teamMode` from `DEFAULT_CONFIG` and the
    `CMUX_SOCKET_PATH → tmuxVisualization` override (it only applied
    when team mode was on).

- Tool wiring
  - `src/create-tools.ts` — dropped the `createTeamTools` import and
    the `if (config.teamMode.enabled) result.team = ...` branch;
    `CreatedTools` is now just `AionTools`.
  - `src/plugin-interface.ts` — removed the nested-`team` flattening
    loop and the `teamToolCount` / `teamModeEnabled` log fields.

- Workspace / hooks
  - `src/workspace-bootstrap.ts` — no longer creates `.aion/teams/` or
    `.aion/runtime/`.
  - `src/hooks/tool-guard.ts` — removed `AION_TEAM_TOOLS` set and the
    `rawName.startsWith("team_")` pass-through warning.
  - `src/hooks/permission-ask.ts` — removed the 14 `team_*` entries
    from `AUTO_APPROVE_TOOLS` and the `team_` prefix allow.
  - `src/hooks/system-transform.ts` — removed the
    `Team mode: ON/OFF` banner line.

- CLI / config defaults
  - `bin/aion-init.js` — removed the `teamMode` block from the
    default config written into `.opencode/aion.jsonc`.
  - `.opencode/aion.jsonc` — removed the `teamMode` block.

- Tests
  - `test/unit/governance.test.mjs` — removed the "does not contain
    team tools" assertion and the "creates team mode directories"
    block.
  - `test/unit/config.test.mjs` — removed the team-mode on/off tests;
    replaced with aion-tool smoke checks.
  - `test/unit/hooks.test.mjs` — removed the `auto-approves team_*`
    test.
  - `test/unit/intent.test.mjs` — renamed the "when team mode is on"
    test to just "is registered".
  - `test/unit/leakage.test.mjs` — removed the `team_create` non-
    safety assertion.
  - `test/unit/new-features.test.mjs` — removed the entire
    `config: team mode aggressive defaults` describe block.
  - `test/cli/init.test.mjs` — removed the `"teamMode":` regex match.

- Docs
  - `README.md` / `README.zh-CN.md` — updated tool count (34 → 20) and
    removed the Team row from the tools table and the
    `team/  # …` line from the project-layout tree.
  - `CONTRIBUTING.md` — removed the `team/` line and bumped the tool
    count.
  - `docs/index.html` — updated the "34 Tools (20 AION + 14 Team)"
    card.

## How It Was Done

Approach: surgical removal. Rather than rewriting the team files to
return no-ops, the `src/team/` directory was deleted outright, then
every site that referenced it was traced and rewritten.

Key decisions:

- **No backwards-compat shim.** A `teamMode: { enabled: true }` block
  in a user's existing `aion.jsonc` is now simply ignored — the Zod
  schema drops it on the floor. This matches the project rule against
  half-finished compat layers; the upgrade path is "delete the block
  from your config".

- **No re-export of types.** `TeamModeConfig`,
  `AION_TEAM_ELIGIBLE_AGENTS`, `AION_TEAM_HARD_REJECT` are deleted, not
  left as `void`. No internal caller survives the team deletion, so
  leaving them would just be dead code.

- **`CreatedTools` is now `AionTools`.** Previously it was
  `AionTools & { team?: … }`. Plugin interface's flattening loop is
  replaced with a single `Object.entries(tools)` copy.

- **Tool count badge in READMEs.** Dropped the `+ 14 Team` part of the
  "20 AION + 14 Team = 34" line. Did not introduce a new banner — the
  v0.7.0 News entry covers the user-facing rationale.

- **Tests use the same shape.** Instead of rewriting the 53 team
  tests, the file is deleted; the per-assertion replacements are
  short.

## Verification

- `npx tsc --noEmit` → 0 errors.
- `bash scripts/build.sh` → builds `dist/index.js`, the single-file
  `.opencode/plugins/aion.js`, the CLI bundle, and
  `release/aion-plugin-0.7.0.tar.gz` (276K); typecheck passes
  inside the build.
- `npm run test:unit` → 557 tests, 554 pass, 3 fail. The 3 failures
  are pre-existing `aion_critic_dispatch` coverage tests that were
  already failing on `0ebfab7` (verified by `git stash`-ing the team
  removal and re-running); they are unrelated to this commit.
- `grep -c "teamMode|team_create|…" dist/index.js` → 0.
- `grep -c "teamMode|team_create|…" .opencode/plugins/aion.js` → 0.
- `ls .aion/{teams,runtime}` → not present (deleted with the source
  change; not re-bootstrapped).

## Pitfalls to Avoid

- The team test file was deleted, not stubbed. Do not add a
  `describe.skip("team: …", …)` placeholder — empty files rot.
- The plugin's `CreatedTools` type used to be
  `AionTools & { team?: … }`. After this commit it is exactly
  `AionTools`. Any future plugin-interface or hook code that does
  `if (tools.team) { … }` will type-error and the compiler will tell
  you exactly where — that is the desired behavior, do not paper over
  it with a `// @ts-expect-error`.
- The `CMUX_SOCKET_PATH → tmuxVisualization` side effect is gone. If
  the cmux workflow ever needs to come back, it should be re-added
  behind its own config flag, not smuggled in via a deleted feature.
- `bin/aion-init.js` is committed to the repo, not generated. After
  this commit it no longer writes a `teamMode` block into the
  installed `aion.jsonc`; do not regenerate it from a different
  source-of-truth without updating both.

## Follow-ups

- [ ] Backfill the existing project README to mention that the serial
      model is the only supported one. (Already partially done in the
      v0.7.0 News entry; a longer paragraph in the architecture
      section is a nice-to-have.)
- [ ] If a future "multi-worker" mode is ever needed, it should be
      redesigned around the serial-loop contract — not bolted on as a
      parallel fan-out.

## Related

- Commit: `392dd4c`
- Other commit entries: `commits/2026-06-18-b28e1a3-chore-release-bump-v0.7.0.md`,
  `commits/2026-06-18-12452f8-fix-hooks-tui-todo-drift-sync.md`
- Session trace that surfaced the token-cost problem:
  `demo/aion-plug/session-ses_1260.md` (in the user's demo dir, not in
  this repo).
