---
name: template
description: New-skill template, used to quickly fill in the name, use cases, flow, boundary, and output format.
---

## Debug Prefix Protocol

- When called, print this first: `[Skills: template] Follow: <rules / context constraints that really apply now>; Current step: <one-line note>`.
- If this skill clearly depends on one rule, add one more line like `[Rules: <rule>] ...`, then continue with the real work.
- The debug prefix should stay stable, short, and easy to grep.


## When To Use

- When a reusable new skill is needed, but the formal version is not written yet.

## Rules

- Write clearly `when it triggers` first, then `how it works`.
- Keep it concise by default. Expand details only on high-risk steps.
- If the skill depends on specific rules, roles, or files, write those relations clearly.

## Flow

- Say what the input is.
- Say what the key steps are.
- Say when to stop and when to roll back.

## Output Format

- Key conclusion
- Evidence or artifacts
- Risk and next step
