---
name: Skill / Agent / Tool / Hook Proposal
description: Propose a new first-class AION component (skill, agent, tool, hook, protocol, or eval suite).
title: "[Component]: "
labels: ["component-proposal"]
---

AION is structured around four stacked layers (task / workspace / execution / review) and six building-block types: **agents, skills, tools, hooks, protocols, evals**. Use this template to propose a new first-class component before opening a PR.

## Component Type

- [ ] Skill (a `.md` capability under `.opencode/skills/`)
- [ ] Agent (a role under `src/agents/`)
- [ ] Tool (a TypeScript tool under `src/tools/`)
- [ ] Hook (a TypeScript lifecycle hook under `src/hooks/`)
- [ ] Protocol (a coordination / governance pattern)
- [ ] Eval suite (test suite / grader / scorecard)

## Name

<!-- Short, lowercase, dash-separated. e.g. `time-series-decomposition`, `information-collector`, `experiment-tracker`. -->

## Layer

- [ ] Task
- [ ] Workspace
- [ ] Execution
- [ ] Review

## Purpose

<!-- One paragraph: what does this component do, and what gap does it fill? -->

## Interface

<!-- For agents / tools / hooks: list the input schema, output schema, and any side effects. For skills / protocols: list the contract (inputs, outputs, when to use). For evals: list the metrics and pass thresholds. -->

### Inputs

- ...

### Outputs

- ...

### Side effects

- ...

## Governance Impact

<!-- Does this component change authority ordering (`c-critic > ts-critic > main agent > other subagents`), add a new hard gate, or alter the data-boundary contract? If yes, call it out explicitly. -->

- [ ] No governance change
- [ ] Changes governance ordering — explain below
- [ ] Adds a new hard gate — explain the trigger and the check
- [ ] Alters the data-boundary contract — explain `dataBoundaries` fields touched

## Tests

<!-- What unit / integration / CLI tests will you add? AION's test layout is `test/unit/*.test.mjs`, `test/cli/*.test.mjs`, `test/integration/*.test.mjs`. -->

## Documentation

<!-- Which README sections, skill pages, or `docs/` entries need updating? -->

## Alternatives

<!-- Why this shape, not another? Did you consider reusing an existing component? -->

## Open Questions

<!-- Anything you'd like feedback on before you start writing code. -->
