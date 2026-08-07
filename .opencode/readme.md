# .opencode/ Structure Index

> Fast-path entry point. Read this FIRST, then load skills only as the task requires.

## Directory Layout

```
.opencode/
├── agents/           # 6 agents (filename = agent name)
├── skills/           # SKILL.md per folder; native `skill` tool discovers them
├── rules/            # core.md (kernel, ~720 tok) + opencode.md
├── protocols/        # Loaded on demand via skills, not at startup
├── evals/            # Evaluation contracts
├── memory/           # Runtime memory files + templates
└── themes/           # TUI theme
```

## ALWAYS Read (kernel, ≤3K tokens total)

1. This file
2. `.opencode/rules/core.md`
3. `.opencode/agents/agent.md`

## Skill Loading (use the native `skill` tool, one per skill)

| Task Level | Pre-load |
|-----------|----------|
| L0 trivial | none |
| L1 light | `safety` |
| L2 standard | `safety` + relevant by type |
| L3 full | `safety` + `planning` + relevant by type |

| Task Type | Skill |
|-----------|-------|
| Time-series | `ts-core` |
| Experiment | `experiment` |
| Formal report | `report` |
| External search | `search` |
| PDF input | `pdf-intake` (on-demand) |

## Prompt Templates

### Initial

```
Read the .opencode contract (readme + core rules + main agent), classify task level, then load only the skills this task requires. Read task.md with `limit: 80` first. Go directly into execution.
```

### Continue

```
Continue the current session. Keep following existing TODOs and evidence chain. Stop only when no skill/agent can propose further action, defect, or rollback.
```

## Scripts

| Script | Purpose |
|--------|---------|
| `cli.sh` | CLI entry point |
| `.opencode/skills/workspace-init/init.sh` | Bootstrap runtime memory/trace files |