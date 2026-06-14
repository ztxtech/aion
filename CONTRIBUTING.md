# Contributing to AION

Thanks for your interest in AION — a time-series harness built on OpenCode. This guide explains how to ask questions, report bugs, propose features, and submit code.

> Looking for the architectural overview? See [`README.md`](./README.md) (English) or [`README.zh-CN.md`](./README.zh-CN.md) (简体中文).

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Help](#getting-help)
- [How to Contribute](#how-to-contribute)
  - [Report a bug](#report-a-bug)
  - [Propose a feature or new component](#propose-a-feature-or-new-component)
  - [Improve documentation](#improve-documentation)
  - [Submit code](#submit-code)
- [Development Setup](#development-setup)
- [Coding Conventions](#coding-conventions)
- [Testing Requirements](#testing-requirements)
- [Governance: what requires extra review](#governance-what-requires-extra-review)
- [Pull Request Process](#pull-request-process)

---

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By participating, you agree to uphold it. Please report unacceptable behavior by opening a private issue or contacting the maintainers.

## Getting Help

Before opening an issue:

1. Search [existing issues](../../issues) and [discussions](../../discussions).
2. Read the relevant skill file in `.opencode/skills/`.
3. Check `docs/` and the in-repo troubleshooting notes.

If you are still stuck, open a **Question** issue (use the issue template) or a **Q&A** discussion.

---

## How to Contribute

### Report a bug

Use the **Bug Report** issue template. Include a minimal reproduction, environment versions (`aion-ts --version`, `opencode --version`, `bun --version`, OS), and the exact error output. Sensitive paths and API keys MUST be removed from pasted logs.

### Propose a feature or new component

- For new **agents / skills / tools / hooks / protocols / eval suites**, use the **Component Proposal** issue template. The maintainers review these before any code is written, because the four-layer architecture and governance ordering are easy to perturb by accident.
- For smaller UX / CLI / docs / install changes, use the **Feature Request** template.

### Improve documentation

Use the **Documentation Issue** template. Both `README.md` and `README.zh-CN.md` are kept in sync; if you fix one, fix the other in the same PR.

### Submit code

1. Open an issue (or comment on an existing one) describing the change.
2. Fork the repo and create a branch: `git checkout -b type/short-description` (e.g. `fix/leakage-gate-edge-case`, `feat/skill-finance-baseline`).
3. Follow the [Development Setup](#development-setup) and [Coding Conventions](#coding-conventions) below.
4. Make sure `bun run typecheck` and `bun run test:all` pass.
5. Open a PR using `.github/PULL_REQUEST_TEMPLATE/pull_request_template.md` and fill in every applicable section — including the **Governance Impact** checkbox.

---

## Development Setup

```bash
git clone https://github.com/ztxtech/aion.git
cd aion

# Install dependencies (Bun is the project's runtime).
bun install

# Type-check and run the full test suite.
bun run typecheck
bun run test:all

# Build a single-file plugin bundle (for local OpenCode use).
bun run build:singlefile
```

The compiled bundle lands at `.opencode/plugins/aion.js`; symlink or copy it into `~/.config/opencode/plugins/` to load it into your local OpenCode install.

### Project layout

```
src/
  agents/        # role definitions (requirements-analyst, information-collector, coder, ts-critic, c-critic, …)
  tools/         # 20 AION + 14 Team tools
  hooks/         # OpenCode lifecycle hooks (leakage gate, runtime events, …)
  prompts/       # shared prompt fragments
  shared/        # utility code
  plugin/        # plugin assembly
  team/          # Team-mode coordination tools
.opencode/skills/   # 17 skills (time-series, report-writing, github-search, …)
test/
  unit/          # *.test.mjs — fast feedback
  cli/           # CLI integration tests
  integration/   # end-to-end harness tests
docs/            # GitHub Pages landing site
```

---

## Coding Conventions

- **Language**: TypeScript (ESM, strict). Bun is the runtime; the published bundle targets Node ESM.
- **Style**: match the surrounding file. Do not introduce new dependencies without justification in the PR description.
- **Schemas**: every tool input / output MUST be validated with `zod` and return JSON. See existing tools under `src/tools/` for the canonical shape.
- **No commented-out code**, no dead branches, no TODOs without an issue link.
- **No secrets** in code, examples, logs, or fixtures. Use `.env.example` for placeholders.
- **Bilingual docs**: any user-facing change to `README.md` MUST be mirrored in `README.zh-CN.md` in the same PR.
- **Changelog**: user-visible changes MUST add a one-line bullet under `## 📰 News` at the top of `README.md`, dated `YYYY-MM-DD`.

---

## Testing Requirements

- `bun run typecheck` MUST pass.
- `bun run test:all` MUST pass. The current baseline is **574/574** tests; do not lower it.
- New behavior MUST come with tests:
  - Pure logic → `test/unit/`
  - CLI behavior → `test/cli/`
  - End-to-end harness behavior → `test/integration/`
- Tests use Node's built-in `node --test` runner with `.test.mjs` files. No external test framework.

---

## Governance: what requires extra review

AION is not just code — it is a multi-agent system with a hard-coded authority ordering. The following areas require explicit maintainer review and a populated **Governance Impact** section in the PR:

- **Authority ordering** — `c-critic > ts-critic > main agent > other subagents`. Any change to how these roles interact, hand off, or override each other is a breaking change.
- **Hard gates** — ablation, SHAP, residual diagnosis, drift, sensitivity, and the leakage gate are non-negotiable. Loosening or skipping a gate requires a written justification.
- **Data boundaries** — the `dataBoundaries` contract (allowed_reads, forbidden_reads, internet_access, runtime_hosts, label_columns) is the only mechanism that prevents label leakage. Touching it requires extra review.
- **Critical-path protocols** — dispatch, reportback, rebuttal, stop-go, lifecycle, memory-sync, runtime-events, compaction. These are the eight contracts every agent follows.

If your PR touches any of the above, expect more rounds of review and please bring a `dataBoundaries` / governance diff in the description.

---

## Pull Request Process

1. **One concern per PR.** If you are fixing a bug and refactoring an unrelated module, split the PR.
2. **Title** — `<type>(<scope>): <imperative summary>`. Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`. Example: `fix(leakage-gate): reject http://127.0.0.1 writes`.
3. **Description** — fill in the PR template completely. Empty "Governance Impact" sections will be sent back.
4. **CI** — wait for the full test suite to be green. Reviewers will not look at a red PR.
5. **Review** — at least one maintainer approval is required for `src/`, `.opencode/skills/`, and any change to governance / hard gates. Docs-only PRs need one approval.
6. **Squash-merge** — keep the history linear. The PR title becomes the commit subject; the description becomes the body.
7. **After merge** — the maintainer will tag the next release and update `package.json` version if appropriate.

---

## Release & Versioning

AION follows [SemVer](https://semver.org/). The current version is in `package.json` and on the [Releases](../../releases) page. Breaking changes to governance, hard gates, or the public plugin interface bump the **minor** version; everything else is a **patch**.

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](./LICENSE).
