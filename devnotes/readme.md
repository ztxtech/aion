# devnotes

The development knowledge base for this project. Every meaningful piece of
context that does not belong in source code, commit messages, or external docs
lives here.

Use this folder to capture *why* decisions were made, *how* a non-trivial change
was implemented, and *what* future contributors must never repeat. It is
deliberately separate from the runtime repo: nothing in `devnotes/` ships to
end users or affects builds.

## Composition

```
devnotes/
├── readme.md          This file. Explains the folder's purpose and layout.
├── commits/           Per-commit knowledge entries, one file per commit.
│   └── Template.md    Template for new commit entries.
└── critic/            Post-mortem entries for serious, recurring, or
                       destructive issues that must be completely avoided.
    └── Template.md    Template for new critic entries.
```

### `commits/`

One Markdown file per commit, named after the commit so the file can be
cross-referenced from `git log` and PR descriptions. Each entry records what
was changed, the implementation approach, the verification performed, and the
pitfalls hit or observed during the work. Entries here are advisory: they
prevent the *same* mistake on the *next* change, not all mistakes forever.

Naming convention:

```
YYYY-MM-DD-<short-hash>-<kebab-case-subject>.md
```

Example: `2026-06-18-a1b2c3d-fix-critic-template-typo.md`.

### `critic/`

One Markdown file per serious issue that has caused real damage or is likely
to recur. Use sparingly — an entry here means "this is a hard rule; if you
violate it you will break the project." Each entry explains the failure mode,
why it is critical, and the concrete guardrails that prevent recurrence.
Entries here are mandatory reading before any non-trivial change.

Naming convention:

```
<kebab-case-issue-name>.md
```

Example: `never-skip-typecheck-before-bundle.md`.

## How to use

1. **Before a non-trivial commit**, skim recent entries in both folders.
2. **After a commit lands**, create a file in `commits/` from `Template.md`,
   rename it to match the commit, and fill it in. Cite the commit hash in the
   header so it can be found from `git log`.
3. **When a serious issue surfaces** — a regression, a near-miss, a review
   finding that almost shipped — promote it to a file in `critic/` using
   `Template.md`. Link back to the original commit entry from `commits/`.
4. **When a critic rule is satisfied by a new commit**, update the critic
   file to link to that commit as evidence, but do not delete the rule.

## Conventions

- All files in this folder are written in English (project-wide rule).
- Keep entries concise. Prefer bullets and short paragraphs over prose.
- Link aggressively between files, commits, source paths, and issues.
- Never put secrets, tokens, or customer data in this folder.
- When a rule in `critic/` is invalidated by a deliberate design change,
  update the file to explain the new rule instead of silently deleting it.
