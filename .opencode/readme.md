# .opencode/ Structure Index

> **This file is the fast-path entry point.** `context-init` reads this file FIRST, then only pulls in what the current task requires. Do NOT read every file blindly.

---

## How to Start

**Every AION session MUST begin with the `context-init` skill.** This is the bootstrap entry point that reads the harness contract before any task work begins.

If you use `cli.sh`, the default initial prompt already includes `context-init`:

```bash
bash cli.sh
```

If you run OpenCode manually, your prompt MUST start with:

```
Start the project with the context-init skill.
```

> Without `context-init`, the harness never loads its rules, agents, or protocols — the session runs as a bare OpenCode instance, not as AION.

After context-init completes, it will:
1. Read this file (`.opencode/readme.md`) for the structure index
2. Load `rules/core.md` and `agents/agent.md` unconditionally
3. Conditionally load other rules/protocols/skills based on the task type (see Read Rules below)
4. Proceed directly to task execution — do not stop at summary or plan restatement

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
| `.opencode/skills/context-init/SKILL.md` | Bootstrap flow — always the first skill loaded |

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

## Prompt Templates

These are the canonical prompts used by `cli.sh`. The initial prompt is the system entry point; the continue prompt drives each auto-continue round.

### Initial Prompt (first round)

```
Start the project with the context-init skill. Read the root task files
and the .opencode contract first. Treat this run as run plus autonomous:
keep the workflow human-free, prefer local detection over upfront questions,
and only stop when no skill and no agent can propose any further action,
defect, or rollback point.
```

### Continue Prompt (auto-continue rounds)

```
Continue the current session in run plus autonomous mode. Keep following
the existing TODOs and evidence chain, stay human-free unless truly blocked
on user-only information, and only stop when no skill and no agent can
propose any further action, defect, or rollback point.
```

### Writing Custom Prompts

If you write your own prompt instead of using `cli.sh` defaults, the first line
MUST invoke context-init and declare the execution strategy:

| Scenario | Prompt Prefix |
|----------|---------------|
| Autonomous (cli.sh) | `Start the project with the context-init skill. Read the root task files and the .opencode contract first. Treat this run as run plus autonomous: ...` |
| Autonomous (manual) | `Start the project with the context-init skill. Run this in run plus autonomous mode. ...` |
| Interactive (TUI) | `Start the project with the context-init skill. Run this in tui plus interactive mode. ...` |
| Custom domain task | `Start the project with the context-init skill. Analyze the dataset in data/. Treat this run as run plus autonomous: ...` |

> **See root `README.md` § "Prompting For Autonomous vs Interactive Use" for full prompt customization guidance.**

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
| `cli.sh` | CLI entry point for AION. Launches OpenCode with `context-init` prompt + auto-continue loop. Supports `run` / `tui` modes, custom models, debug, and session export. See `bash cli.sh --help`. |
| `.opencode/skills/workspace-init/init.sh` | Initialize all runtime memory/trace files from templates. Cross-platform (bash). Called automatically by `workspace-init` skill. |
