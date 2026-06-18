# Critic Rule: <short, imperative title>

> **Status**: Active | Resolved | Superseded by `critic/<other>.md`
> **Severity**: Critical | High | Medium
> **First observed**: YYYY-MM-DD
> **Last verified violated**: YYYY-MM-DD (or "never — discovered in review")
> **Owner**: <name or team>

## The Rule

One sentence, written as an imperative. If a contributor reads only this
section, they should still know exactly what to do and what not to do.

> **Do**: <required behavior>.
> **Do not**: <forbidden behavior>.

## Why It Is Critical

The failure mode, the blast radius, and the cost of a single violation. Be
concrete: what breaks, for whom, and how badly. Vague warnings here are why
this folder exists in the first place, so do not write one.

- **What breaks**: <component, contract, or invariant>.
- **Who is affected**: <end users, downstream services, contributors>.
- **Severity of one incident**: <data loss, broken release, hours of rework, …>.
- **Likelihood without guardrails**: High / Medium / Low and why.

## Symptoms

How this issue presents when it is happening. Both the user-facing symptom
and the internal signal (log line, metric, error type).

- Symptom A — what you see, where to look.
- Symptom B — what you see, where to look.

## Root Cause

The actual reason this rule exists. Not the surface mistake, the underlying
mechanism that makes the surface mistake possible.

## How to Prevent

Concrete, checkable guardrails. Each item should be something a reviewer can
verify in a diff or a CI log.

- **Process**: <e.g. "run `npx tsc --noEmit` before opening a PR">.
- **Review**: <e.g. "any change to `scripts/bundle.ts` requires sign-off from X">.
- **Test**: <e.g. "regression test in `test/foo.test.ts` covers this path">.
- **Tooling**: <e.g. "ESLint rule `no-foo` blocks the pattern at lint time">.
- **Docs**: <e.g. "README must mention this constraint in the Setup section">.

## Detection

How to know, in time, that this is about to happen or has just happened.

- Pre-commit hook / CI check that catches it.
- Runtime signal (alert, log query, metric threshold).
- Code review checklist item.

## History

Chronological list of incidents or near-misses that motivated this rule. Link
to the commit entry in `commits/` for full context.

- YYYY-MM-DD — short description. `commits/<entry>.md`.
- YYYY-MM-DD — short description. `commits/<entry>.md`.

## Resolution

For rules that have been retired or superseded, explain *why* the rule no
longer applies and what replaced it. Link to the new rule, if any. Do not
delete retired rules — they are how we remember not to make the same mistake
in a new form.

## Related

- Original incident / commit: `<hash>` → `commits/<entry>.md`
- Supersedes: `critic/<older>.md`
- Superseded by: `critic/<newer>.md`
- Source pointers: `path/to/file.ts:line`
