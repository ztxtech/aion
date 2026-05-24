---
name: evolution
description: When current roles and skills keep failing to cover a key ability gap, decide whether to add a new skill or role, and sync relation and docs together.
---

## Debug Prefix Protocol

- When called, print this first: `[Skills: evolution] Follow: <rules / context constraints that really apply now>; Current step: <one-line note>`.
- If this skill clearly depends on one rule, add one more line like `[Rules: <rule>] ...`, then continue with the real work.
- The debug prefix should stay stable, short, and easy to grep.


## Principles

- Prove that there is a repeated ability gap first, then add structure.
- Prefer adding a skill. Add a new agent only when a truly separate duty boundary is needed.
- The current main role set should stay `requirements-analyst`, `information-collector`, `coder`, and `ts-critic` by default. Do not split `gamer` back out as an independent role again.

## Flow

- Analyze the ability boundaries and unresolved issues of all current agents / skills in the flow, and judge whether a repeated gap really exists.
- If a gap exists, judge whether it fits better as a new skill or as a new subagent.
- If the upstream trigger comes from `ts-critic` judging a new high-value pattern, first answer this: why the current structure cannot carry that pattern, and whether it should be saved as a skill or as a new agent.
- Create and configure the needed structure based on that judgment.
- For a structure-saving suggestion from `ts-critic`, the output must keep one clear result: `do not save` / `save as skill` / `evolve into new agent`. Do not give only vague advice.
- You must follow `.opencode/rules/opencode.md`.
- Update `.opencode/memory/relation.md` and record how the new structure relates to the current flow.

## Output Format

- Gap description
- Whether new structure is needed
- Save judgment (`do not save` / `save as skill` / `evolve into new agent`)
- Name of the created subagent / skill
- Function description and boundary
- Files that need synced updates
