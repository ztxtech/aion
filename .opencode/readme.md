# .opencode/ Structure Index

> **This file is the fast-path entry point.** `context-init` reads this file FIRST, then only pulls in what the current task requires. Do NOT read every file blindly.

---

## Directory Layout

```
.opencode/
├── agents/           # 6 specialized agents
│   ├── agent.md                # Main orchestrator (mode: primary)
│   ├── requirements-analyst/   # Task intake & requirement extraction
│   ├── information-collector/  # External evidence & SOTA search
│   ├── coder.md                # Implementation, experiments & delivery
│   ├── ts-critic.md            # Time-series expert + Pareto governance
│   └── c-critic.md             # Final minimal-context cold-start critic
├── skills/           # 17 reusable skills
│   ├── context-init/           # Manual workspace bootstrap (this entry)
│   ├── workspace-init/         # Auto workspace initialization + scripts
│   ├── plan/                   # Complex task planning
│   ├── brain-storm/            # Multi-angle analysis
│   ├── deep-reasoning/         # Multi-step reasoning & debate
│   ├── critic-loop/            # Review & rollback judgment
│   ├── time-series/            # Unified TS review framework
│   ├── data-interface/         # 4-type data entry contract
│   ├── forecast-contract/      # Forecast output validation
│   ├── report-writing/         # Experiment reports & formal docs
│   ├── python-toolbox/         # Python tool priors
│   ├── ztxexp/                 # Experiment directory & plotting protocol
│   ├── github-search/          # GitHub first-hand evidence search
│   ├── pdf-intake/             # Safe PDF extraction
│   ├── safety-gate/            # Automated safety pre-check
│   ├── evolution/              # Capability gap -> new agent/skill
│   └── template/               # Empty skill skeleton
├── rules/            # Shared rules (auto-loaded by context)
│   ├── core.md                 # Boundaries, trace, placeholders
│   ├── opencode.md             # OpenCode docs & repo links
│   ├── agent-autonomy.md       # Subagent autonomy constraints
│   ├── experiment.md           # Benchmark-first experiment rules
│   ├── time-series.md          # Shared TS rules
│   └── websearch.md            # Web search fallback chain
├── protocols/        # 8 runtime protocols
│   ├── dispatch.md             # Subagent dispatch contract
│   ├── reportback.md           # Report-back contract
│   ├── rebuttal.md             # Rebuttal protocol
│   ├── stop-go.md              # Stop/go governance
│   ├── lifecycle.md            # Agent lifecycle management
│   ├── memory-sync.md          # Memory synchronization
│   ├── runtime-events.md       # Runtime event tracking
│   └── compaction.md           # Context compaction protocol
├── evals/            # 5 evaluation contracts
│   ├── suites.md               # Test suite definitions
│   ├── graders.md              # Grader specifications
│   ├── scorecards.md           # Scorecard templates
│   ├── regression-matrix.md    # Regression test matrix
│   └── release-gates.md        # Release gate criteria
├── memory/
│   └── template/     # 13 memory templates
│       ├── initial-prompt.md   # Anti-drift task baseline
│       ├── context-snapshot.md # Canonical compaction artifact
│       ├── progress.md         # Task progress tracking
│       ├── decisions.md        # Key decision log
│       ├── features.md         # Feature inventory
│       ├── todo-map.md         # Frontier & TODO tracking
│       ├── completion-gate.md  # Completion checklist
│       ├── positive.md         # Positive findings pool
│       ├── negative.md         # Negative findings pool
│       ├── relation.md         # Agent relationship graph
│       ├── memory.md           # Persistent memory
│       ├── dir.md              # Directory structure
│       └── trace.md            # Trace template seed
└── .gitignore
```

---

## Read Rules (Conditional Dispatch)

### ALWAYS read (every session, no exceptions)

| File | Why |
|------|-----|
| `.opencode/readme.md` (this file) | Structure index & conditional routing |
| `.opencode/rules/core.md` | Boundaries, trace protocol, placeholder rules |
| `.opencode/agents/agent.md` | Main orchestrator role definition |

### Read IF task involves multi-agent / multi-stage / subagent dispatch

| File | Why |
|------|-----|
| `.opencode/protocols/dispatch.md` | Subagent dispatch contract |
| `.opencode/protocols/compaction.md` | Context compaction between agents |
| `.opencode/protocols/memory-sync.md` | Memory sync across agents |
| `.opencode/protocols/runtime-events.md` | Runtime event tracking |
| `.opencode/protocols/reportback.md` | Report-back contract |
| `.opencode/protocols/rebuttal.md` | Rebuttal protocol |
| `.opencode/protocols/stop-go.md` | Stop/go governance |
| `.opencode/protocols/lifecycle.md` | Agent lifecycle |
| `.opencode/rules/agent-autonomy.md` | Subagent autonomy constraints |

### Read IF task involves time-series / forecasting / experiment / benchmark

| File | Why |
|------|-----|
| `.opencode/rules/time-series.md` | Shared TS rules |
| `.opencode/rules/experiment.md` | Benchmark-first experiment rules |
| `.opencode/skills/time-series/SKILL.md` | Unified TS review framework |
| `.opencode/skills/forecast-contract/SKILL.md` | Forecast output validation |
| `.opencode/skills/data-interface/SKILL.md` | 4-type data entry contract |
| `.opencode/skills/ztxexp/SKILL.md` | Experiment directory & plotting |

### Read IF task involves formal report / documentation delivery

| File | Why |
|------|-----|
| `.opencode/skills/report-writing/SKILL.md` | Report structure & evidence rules |

### Read IF task involves complex planning / multi-step reasoning

| File | Why |
|------|-----|
| `.opencode/skills/plan/SKILL.md` | Task planning protocol |
| `.opencode/skills/brain-storm/SKILL.md` | Multi-angle analysis |
| `.opencode/skills/deep-reasoning/SKILL.md` | Multi-step reasoning & debate |
| `.opencode/skills/critic-loop/SKILL.md` | Review & rollback judgment |

### Read IF task involves Python / data processing

| File | Why |
|------|-----|
| `.opencode/skills/python-toolbox/SKILL.md` | Python tool priors |

### Read IF task requires external evidence / research / web search

| File | Why |
|------|-----|
| `.opencode/rules/websearch.md` | Web search fallback chain |
| `.opencode/skills/github-search/SKILL.md` | GitHub evidence search |
| `.opencode/skills/information-collector/` | External evidence & SOTA search |

### Read IF task involves PDF input

| File | Why |
|------|-----|
| `.opencode/skills/pdf-intake/SKILL.md` | Safe PDF extraction |

### Read on eval / release / quality gate tasks

| File | Why |
|------|-----|
| `.opencode/evals/*.md` | All evaluation contracts |

---

## Runtime File Locations (created by workspace-init)

These do NOT exist at startup. They are created at runtime by `workspace-init` skill or its `init.sh` script:

```
.opencode/
├── trace.md                    # Runtime trace (copied from memory/template/trace.md)
└── memory/
    ├── memory.md               # Persistent memory
    ├── positive.md             # Positive findings
    ├── negative.md             # Negative findings
    ├── relation.md             # Agent relationship graph
    ├── progress.md             # Task progress
    ├── features.md             # Feature inventory
    ├── decisions.md            # Decision log
    ├── todo-map.md             # TODO tracking
    ├── completion-gate.md      # Completion checklist
    ├── initial-prompt.md       # Task baseline
    └── context-snapshot.md     # Compaction snapshot
```

---

## Scripts

| Script | Purpose |
|--------|---------|
| `.opencode/skills/workspace-init/init.sh` | Initialize all runtime memory/trace files from templates. Cross-platform (bash). |
