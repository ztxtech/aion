# Commit Entry: aion-ts init now copies the 17 AION skills

> **Commit**: `2e3dd54` (`2e3dd54`)
> **Date**: 2026-06-18
> **Author**: ztx
> **Branch**: dev
> **Type / Scope**: `fix(install)`

## Summary

`aion-ts init` previously copied the plugin bundle, theme, and
`aion.jsonc` into the target project, but not the 17 AION skills
(`brain-storm`, `time-series`, `critic-loop`, `plan`, …) that live
in `.opencode/skills/` in the source repo. The system prompt still
told the LLM those skills were available, so when the LLM tried to
call them, the OpenCode `skill` tool returned "no such skill" and the
LLM silently fell back to doing the work in its own narrative. The
installer now copies the full skills dir into the target.

## What Changed

- `bin/aion-init.js`
  - Added `readdirSync` to the `node:fs` import.
  - New `findSkillsDir(bundlePath)` — looks for `.opencode/skills/`
    next to the bundle in three canonical layouts (source repo,
    installed `~/.local/lib/aion/skills/`, next to `dist/aion.js`).
  - New `installSkills(bundlePath, target, force)` — copies every
    skill subdirectory into `<target>/.opencode/skills/`. Existing
    skills are kept unless `--force`. Logs the count copied.
  - New `copyDirRecursive(from, to)` — used by `installSkills` to
    copy each skill's nested files (currently only `SKILL.md`, but
    forward-compatible with skills that bundle multiple files).
  - Wired `installSkills` into `main()` after `installTheme`.
  - Updated the `printHelp` Behavior section to mention step 4
    (skills install).

- `scripts/build.sh`
  - Release tarball now includes `skills/` (was: `plugins/ themes/
    bin/`). The new tarball is ~336K (was 276K); the +60K is the
    17 skill directories.
  - Build output now reports
    `Contents: plugins/aion.js, themes/aion.json, bin/aion-init.js, skills/<17-skill-dirs>`.

- `scripts/dev-install.sh`
  - Pushes `<repo>/.opencode/skills/` to `~/.local/lib/aion/skills/`
    so local dev iteration includes the skills without a manual
    step.
  - Help comment updated to list `~/.local/lib/aion/skills/` as a
    managed path.

- `test/cli/init.test.mjs`
  - New test: after `aion-ts init --force`, `<target>/.opencode/skills/`
    must contain at least the four core workflow skills
    (`brain-storm`, `time-series`, `critic-loop`, `plan`).
  - Switched the file-level `node:fs` import to also pull in
    `readdirSync` (the new test uses it; previously only
    `existsSync` / `readFileSync` were needed).

## How It Was Done

Approach: discover the source layout, then mirror. Rather than hard-code
a "skills live here" assumption, `findSkillsDir` checks three
candidate locations in order:

1. `<bundle>/../../.opencode/skills` — source repo layout
   (`<repo>/.opencode/plugins/aion.js` → `<repo>/.opencode/skills`).
2. `<bundle>/../skills` — flat bundle layout (some tarballs may
   flatten the structure).
3. `<bundle>/skills` — same-dir layout (installed next to the bundle).

This covers the three ways a user might run `aion-init`:

- From the source repo via `bun run build` (dev workflow).
- From an installed `~/.local/bin/aion-init.js` (system install).
- From a hand-rolled bundle somewhere in the filesystem.

Key decisions:

- **Existing skills are preserved without `--force`.** Same semantics
  as the plugin bundle copy: a `git pull` upgrade should not destroy
  the user's local customizations. `--force` overwrites.
- **No skill is renamed, versioned, or migrated.** If a skill's
  `SKILL.md` content changes upstream, `--force` is required to pick
  it up. This is intentional — it avoids surprising users with
  silent rewrites of skill bodies.
- **Test asserts by name, not by count.** A new skill being added
  upstream should not break the test; missing a removed skill is a
  more interesting failure (it surfaces as a clear "required skill X
  not installed" error rather than a numeric mismatch).
- **The recursive copy is forward-compatible.** Today every skill
  has exactly one file (`SKILL.md`). Tomorrow a skill might ship
  with multiple sub-files; `copyDirRecursive` already handles that.

## Verification

- `aion-ts init /tmp/aion-init-test --force` →
  `[ok] copied 17 skill(s) → /tmp/aion-init-test/.opencode/skills`
- `ls /tmp/aion-init-test/.opencode/skills/brain-storm/` → `SKILL.md`
  present.
- `npx tsc --noEmit` → 0 errors.
- `bash scripts/build.sh` → tarball includes `skills/` (verified with
  `tar -tzf release/aion-plugin-0.7.2.tar.gz | grep skills/`).
- `bash scripts/dev-install.sh` →
  `~/.local/lib/aion/skills` populated with 17 entries.
- `npm run test:unit` → 557 pass, 3 fail (the same 3 pre-existing
  `aion_critic_dispatch` coverage failures; unrelated).
- `node --test test/cli/init.test.mjs` → 6/6 pass, including the new
  `installs the 17 AION skills into .opencode/skills/` test.

## Pitfalls to Avoid

- The hard-coded `node:fs` import in `bin/aion-init.js` had no
  `readdirSync` — adding a function that uses it requires updating
  the import. bun's bundle of the CLI does not tree-shake unused
  imports, so the missing entry is the only failure mode (we hit it
  in the first build attempt).
- The `printHelp` text inside the template literal contained a
  backtick around "skill" which broke bun's parser (it thought the
  backtick was closing the template). Escaped to `"skill"` to avoid
  the problem.
- The recursive `copyDirRecursive` is unidirectional (no copy-on-
  write, no symlink handling). If a user later adds a symlink to
  their `.opencode/skills/`, `--force` will replace it with a real
  copy. Document or symlink-aware copy is a future concern.
- The system prompt's "Available AION Skills" section is populated
  from the hard-coded `AION_SKILLS` registry in
  `src/prompts/skill-registry.ts`, NOT from the filesystem. So
  adding a new skill directory to `.opencode/skills/` is NOT enough
  — you also need to add an entry to that registry, or the LLM
  won't be told the skill exists. This is a separate concern from
  this commit; flagged here for the next contributor.

## Follow-ups

- [ ] The `Available AION Skills` injection in
      `src/hooks/system-transform.ts:discoverEnvironment` should
      cross-reference the filesystem and drop registry entries
      whose `SKILL.md` is not on disk. This would surface
      "missing-skill" mismatches at session start instead of
      mid-loop.
- [ ] `aion-ts init` could also copy `.opencode/agents/` to ensure
      the per-agent scaffolding is present (currently only the
      plugin bundle, theme, config, and skills are copied).

## Related

- Commit: `2e3dd54`
- Other commit entries: `commits/2026-06-18-a0d29f0-…`,
  `commits/2026-06-18-30ff2c4-…`
- Session trace that surfaced the bug:
  `aion-plug/session-ses_124f.md` (user's demo dir, not in this
  repo) — the LLM said "I see — the skills listed in the environment
  are different from the AION skills described in the governance
  contract."
