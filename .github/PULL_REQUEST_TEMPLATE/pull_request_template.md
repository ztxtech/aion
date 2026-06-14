## Summary

<!-- One or two sentences: what does this PR change and why? -->

## Related Issue

<!-- Link the issue / discussion this PR addresses. Use "Fixes #123" or "Refs #123" to auto-link. -->

Fixes #
Refs #

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing behavior to change)
- [ ] Documentation update
- [ ] Refactor / internal change (no behavior change)
- [ ] Test only

## Component Touched

<!-- Check all that apply. A PR that touches governance / data-boundaries / hard gates MUST call it out in Governance Impact. -->

- [ ] Agent (`src/agents/`)
- [ ] Skill (`.opencode/skills/`)
- [ ] Tool (`src/tools/`)
- [ ] Hook (`src/hooks/`)
- [ ] Protocol
- [ ] Eval / test (`test/`)
- [ ] Plugin / CLI / install (`src/`, `bin/`, `scripts/`)
- [ ] Documentation (`README.md`, `README.zh-CN.md`, `docs/`)
- [ ] Landing page (`docs/index.html`, `docs/static/`)
- [ ] Other: `...`

## Four-Layer Impact

- [ ] Task layer
- [ ] Workspace layer
- [ ] Execution layer
- [ ] Review layer
- [ ] None of the above

## Governance Impact

<!-- AION's authority ordering is `c-critic > ts-critic > main agent > other subagents`. Hard gates include ablation, SHAP, residual diagnosis, drift, sensitivity, leakage (`dataBoundaries`). If this PR changes any of those, you MUST explain it here. -->

- [ ] No governance change
- [ ] Changes authority ordering — explain:
- [ ] Adds or modifies a hard gate — explain trigger and check:
- [ ] Modifies the data-boundary contract (`dataBoundaries`, leakage gate) — explain:

## How Was This Tested?

<!-- Be concrete. Command lines, test files added, manual reproduction. -->

- [ ] `bun run typecheck` passes
- [ ] `bun run test:all` passes (574/574 baseline before this PR)
- [ ] Added new tests: list file paths
- [ ] Manual end-to-end run: describe

### Reproduction / verification commands

```bash
# commands a reviewer can run to verify
```

## Checklist

- [ ] My code follows the project's style (no new dependencies unless justified, no commented-out code)
- [ ] I added / updated tests for the change
- [ ] I updated `README.md` **and** `README.zh-CN.md` if the change is user-facing
- [ ] I added an entry to `## 📰 News` in `README.md` if the change is user-visible
- [ ] I removed secrets, tokens, and machine-specific paths from logs / examples
- [ ] I read the [Contributing Guide](../../blob/master/README.md#-contributing) and the relevant skill files

## Screenshots / Output

<!-- Optional but encouraged for landing-page and CLI UX changes. -->
