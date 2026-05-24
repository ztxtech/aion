<h1 align="center">
  <img src="https://img.shields.io/badge/AION-Time_Series_Harness-7C3AED?style=for-the-badge&logo=openai&logoColor=white" alt="AION" />
</h1>

<p align="center">
  <a href="README.md"><strong>English</strong></a> ·
  <a href="README.zh-CN.md"><strong>简体中文</strong></a>
</p>

**AION** is a time-series harness — an explicit control layer that connects task specification, runtime execution, and result assessment into one stable process for next-generation time-series workloads.

Time-series research is moving beyond fixed forecasting benchmarks toward tasks that combine prediction, contextual reasoning, tool use, and structured decision support. AION formalizes these as triples of _task file, workspace, and validation interface_, and organizes the entire system around four stacked layers: **task** (what to solve), **workspace** (what evidence and tools are available), **execution** (how the system acts under constraints), and **review** (whether outputs pass validity, temporal, and completeness checks before progress is accepted).

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Quick_Start-3_min-blue?style=for-the-badge" alt="Quick Start"></a>
  <a href="#-four-layer-architecture"><img src="https://img.shields.io/badge/Layers-4-10B981?style=for-the-badge" alt="Layers"></a>
  <a href="#-skills"><img src="https://img.shields.io/badge/Skills-17-8B5CF6?style=for-the-badge" alt="Skills"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/OpenCode-≥0.9-blue?logo=terminal&logoColor=white" alt="OpenCode">
  <img src="https://img.shields.io/badge/Python-≥3.10-3776AB?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/Multi_Agent-6_Roles-F59E0B?style=flat" alt="Multi-Agent">
  <img src="https://img.shields.io/badge/Protocols-8-06B6D4?style=flat" alt="Protocols">
  <img src="https://img.shields.io/badge/Evals-5_Gates-EC4899?style=flat" alt="Evals">
  <img src="https://img.shields.io/badge/Time_Series-Harness-7C3AED?style=flat" alt="Time Series">
  <a href="https://github.com/ztxtech/aion"><img src="https://img.shields.io/github/stars/ztxtech/aion?style=social" alt="GitHub stars"></a>
  <a href="https://github.com/ztxtech/aion"><img src="https://img.shields.io/github/forks/ztxtech/aion?style=social" alt="GitHub forks"></a>
  <a href="https://github.com/ztxtech/aion/issues"><img src="https://img.shields.io/github/issues/ztxtech/aion" alt="Issues"></a>
  <img src="https://img.shields.io/github/last-commit/ztxtech/aion?color=orange" alt="Last Commit">
</p>

---

## ✨ What is AION?

Existing benchmarks and agent-centered systems each capture only part of the shift toward next-generation time-series tasks: benchmarks usually simplify the task too early, while agents alone do not provide temporal contracts, evidence discipline, or reliable stopping criteria.

AION addresses this gap as a **time-series harness** built on [OpenCode](https://github.com/anomalyco/opencode):

- **Task layer** — Formalizes next-generation time-series tasks as triples of _task file, workspace, and validation interface_
- **Workspace layer** — Provides structured evidence collection, tool orchestration, and persistent memory for open-ended research
- **Execution layer** — Constrains multi-agent runtime with protocols, governance hierarchy, context compaction, and safety gates
- **Review layer** — Enforces validity, temporal, and completeness checks before progress is accepted; no output leaves the system without passing layered critics

Time-series specialization enters through **temporal grounding**, **knowledge-grounded search**, and **layered reliability checks**, allowing the system to work with open-ended evidence while preserving output legality and stop discipline.

---

## 🏗️ Four-Layer Architecture

AION organizes everything around four stacked layers — each layer constrains the one below it: **task** (what to solve), **workspace** (what evidence and tools are available), **execution** (how the system acts under constraints), and **review** (whether outputs pass validity, temporal, and completeness checks before progress is accepted).

### Directory Structure

```
.opencode/
├── agents/           # 6 specialized agents
│   ├── agent.md              # Main orchestrator (mode: primary)
│   ├── requirements-analyst  # Task intake & requirement extraction
│   ├── information-collector # External evidence & SOTA search
│   ├── coder.md              # Implementation, experiments & delivery
│   ├── ts-critic.md          # Time-series expert + Pareto governance
│   └── c-critic.md           # Final minimal-context cold-start critic
├── skills/           # 17 reusable skills
│   ├── context-init/         # Manual workspace bootstrap
│   ├── workspace-init/       # Auto workspace initialization
│   ├── plan/                 # Complex task planning
│   ├── brain-storm/          # Multi-angle analysis
│   ├── deep-reasoning/       # Multi-step reasoning & debate
│   ├── critic-loop/          # Review & rollback judgment
│   ├── time-series/          # Unified TS review framework
│   ├── data-interface/       # 4-type data entry contract
│   ├── forecast-contract/    # Forecast output validation
│   ├── report-writing/       # Experiment reports & formal docs
│   ├── python-toolbox/       # Python tool priors
│   ├── ztxexp/               # Experiment directory & plotting protocol
│   ├── github-search/        # GitHub first-hand evidence search
│   ├── pdf-intake/           # Safe PDF extraction
│   ├── safety-gate/          # Automated safety pre-check
│   ├── evolution/            # Capability gap → new agent/skill
│   └── template/             # Empty skill skeleton
├── rules/            # Shared rules (auto-loaded)
│   ├── core.md               # Boundaries, trace, placeholders
│   ├── opencode.md           # OpenCode docs & repo links
│   ├── agent-autonomy.md     # Subagent autonomy constraints
│   ├── experiment.md         # Benchmark-first experiment rules
│   ├── time-series.md        # Shared TS rules
│   └── websearch.md          # Web search fallback chain
├── protocols/        # 8 runtime protocols
│   ├── dispatch.md           # Subagent dispatch contract
│   ├── reportback.md         # Report-back contract
│   ├── rebuttal.md           # Rebuttal protocol
│   ├── stop-go.md            # Stop/go governance
│   ├── lifecycle.md          # Agent lifecycle management
│   ├── memory-sync.md        # Memory synchronization
│   ├── runtime-events.md     # Runtime event tracking
│   └── compaction.md         # Context compaction protocol
├── evals/            # 5 evaluation contracts
│   ├── suites.md             # Test suite definitions
│   ├── graders.md            # Grader specifications
│   ├── scorecards.md         # Scorecard templates
│   ├── regression-matrix.md  # Regression test matrix
│   └── release-gates.md      # Release gate criteria
├── memory/
│   └── template/     # 11 memory templates
│       ├── initial-prompt.md  # Anti-drift task baseline
│       ├── context-snapshot.md # Canonical compaction artifact
│       ├── progress.md        # Task progress tracking
│       ├── decisions.md       # Key decision log
│       ├── features.md        # Feature inventory
│       ├── todo-map.md        # Frontier & TODO tracking
│       ├── completion-gate.md # Completion checklist
│       ├── positive.md        # Positive findings pool
│       ├── negative.md        # Negative findings pool
│       ├── relation.md        # Agent relationship graph
│       ├── memory.md          # Persistent memory
│       ├── dir.md             # Directory structure
│       └── trace.md           # Trace template seed
└── .gitignore
```

---

## 🚀 Quick Start

### 0. Prerequisites

AION requires a standard Linux/macOS environment with these system commands available:

| Command         | Used by                                   | Notes                 |
| --------------- | ----------------------------------------- | --------------------- |
| `git`           | Clone .opencode, local checkpoint history | Usually pre-installed |
| `curl`          | Download AION, web search fallback        | Usually pre-installed |
| `tar` / `unzip` | Extract archives                          | Usually pre-installed |
| `python3`       | Python toolchain, validators              | ≥ 3.10 recommended    |
| `bash`          | cli.sh and skill scripts                  | ≥ 4.0                 |

Some commands (e.g. installing `git`, `curl`, or `unzip` via package manager) may require **root/sudo** access. On minimal containers or CI images, install them before proceeding:

```bash
# Debian / Ubuntu
sudo apt-get update && sudo apt-get install -y git curl unzip tar python3

# RHEL / CentOS / Fedora
sudo dnf install -y git curl unzip tar python3

# macOS (usually pre-installed; if not)
brew install git curl python3
```

### 1. Install OpenCode

```bash
# YOLO
curl -fsSL https://opencode.ai/install | bash

# Package managers
npm i -g opencode-ai@latest        # or bun/pnpm/yarn
scoop install opencode             # Windows
choco install opencode             # Windows
brew install anomalyco/tap/opencode # macOS and Linux (recommended, always up to date)
brew install opencode              # macOS and Linux (official brew formula, updated less)
sudo pacman -S opencode            # Arch Linux (Stable)
paru -S opencode-bin               # Arch Linux (Latest from AUR)
mise use -g opencode               # Any OS
nix run nixpkgs#opencode           # or github:anomalyco/opencode for latest dev branch
```

### 2. Configure OpenCode

```bash
opencode setup    # interactive setup — pick a provider and authenticate
```

Supports **Claude / OpenAI / Codex / Copilot / Gemini** and any compatible endpoint.

### 3. Add AION to Your Project

```bash
# Option A: Clone into your project root
cd your-project
git clone https://github.com/ztxtech/aion.git .opencode

# Option B: Download and extract
curl -fsSL https://github.com/ztxtech/aion/archive/refs/heads/main.tar.gz | tar xz --strip-components=1
mv aion-main/.opencode .opencode
rm -rf aion-main
```

### 4. Run

```bash
# Interactive TUI mode
opencode

# Non-interactive run mode
opencode run --agent agent "Your task description here"

# With a specific model
opencode run --agent agent -m anthropic/claude-sonnet-4 "Analyze this time-series dataset"
```

### Run Modes vs Execution Strategies

OpenCode's `run` and `tui` describe the interface shape, not the same thing as how much the agent should ask the user.

- `run`
  This is the non-interactive execution surface. In this template, `run` is paired with `autonomous` by default: the agent should detect local context, pick the default best path, and keep going without pausing for routine environment or workflow choices.
- `tui`
  This is the interactive terminal interface. In this template, `tui` may still run in `autonomous`, or it may run in `interactive` when the user explicitly wants to participate in key forks.
- `tui + autonomous`
  The user is present and can observe the session, but the agent still defaults to making routine decisions on its own. Being inside TUI does not mean the agent should start asking about every low-risk default.
- `tui + interactive`
  Use this only when the user explicitly wants to co-decide important forks. Even then, the agent should still perform local detection first, and only ask when multiple equally reasonable options remain and those options would materially change the later path.
- `run + interactive`
  This template does not treat this as a supported default combination. `run` is intended to keep moving autonomously; if the workflow should pause for key user choices, `tui` is the better fit.

For Python environments, the default decision tree is:

- decide whether Python is actually needed
- reuse an existing workspace-root `.venv` if one already exists
- otherwise follow stronger project constraints such as `pyproject.toml`, `.python-version`, `environment.yml`, `requirements*.txt`, or `uv.lock`
- only then create a workspace-root `.venv`

In `autonomous`, the agent should follow that tree directly unless there is a real conflict. In `interactive`, the agent should still do the same local detection first, and only ask the user when multiple equally reasonable environment choices remain and those choices materially affect dependencies or implementation.

### 5. CLI Run Mode (Advanced)

Use `cli.sh` for automated, auto-continuing experiment runs:

```bash
# Basic run
bash cli.sh

# With custom model
bash cli.sh -m anthropic/claude-sonnet-4

# With debug logging
bash cli.sh --debug

# TUI mode instead of run mode
bash cli.sh --mode tui

# Limit auto-continue rounds
bash cli.sh --max-continues 10
```

### Prompting For Autonomous vs Interactive Use

If you write your own prompt instead of using the default `cli.sh` prompt, make the intended execution strategy explicit so the agent does not have to guess.

- For non-interactive autonomous execution, say it directly:

```text
Run this in run plus autonomous mode. Keep it human-free, prefer local detection over upfront questions, and only ask if you truly need information that only I can provide.
```

- For interactive TUI collaboration, say that the user wants to participate only in real forks:

```text
Run this in tui plus interactive mode. Do local detection first, keep routine decisions autonomous, and only ask me when there are multiple equally reasonable options that would materially change the later path.
```

- For interactive TUI with minimal interruption, make that explicit too:

```text
Run this in tui plus autonomous mode. I want to watch the session, but I do not want routine environment or workflow questions unless there is a real decision fork.
```

For Python environments, a good interactive prompt should ask the agent to detect first and only escalate real ambiguity, for example:

```text
If Python is needed, first check whether the workspace already has a usable .venv or stronger project constraints. Only ask me if multiple environment choices remain and those choices would materially affect dependencies or implementation.
```

---

## 🤝 Agent Roles

Agents span all four layers — from task parsing through execution orchestration to layered review:

| Agent                     | Primary Layer         | Role                                                                                           |
| ------------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| **agent**                 | Execution             | Main orchestrator — dispatches subagents, enforces review gates, drives to close               |
| **requirements-analyst**  | Task                  | Reads tasks & workspace materials, extracts goals, inputs & constraints                        |
| **information-collector** | Workspace             | Supplements SOTA, top-venue papers, official implementations & domain knowledge                |
| **coder**                 | Workspace + Execution | Implementation, experiments, delivery & visualization                                          |
| **ts-critic**             | Review                | Time-series method review + Pareto stop/governance — highest governance gate before `c-critic` |
| **c-critic**              | Review                | Final minimal-context cold-start critique — ultimate governance authority                      |

### Governance Order

In blocker judgment, rebuttal verdicts, route rollback, stop-go, completion-gate, and final-delivery decisions:

```
c-critic > ts-critic > main agent > other subagents
```

The main agent owns **dispatch and execution**, but does **not** own a closeout authority above the critics.

More specifically, role boundaries default to `delegate to the role that already covers the work` rather than `let the main agent do everything once`: systematic requirement reframing should go first to `requirements-analyst`, systematic external search and evidence-chain building should go first to `information-collector`, real code / script / experiment implementation should go first to `coder`, and governance critique plus stop-go should go first to `ts-critic` / `c-critic`. The main agent should keep only the smallest routing checks, integration edits, and tiny actions that cannot be split safely.

---

## 🔧 Skills (17)

Skills serve the workspace and execution layers — providing evidence collection, tool orchestration, and domain priors:

| Skill                 | Layer     | Description                                           |
| --------------------- | --------- | ----------------------------------------------------- |
| **context-init**      | Workspace | Manual workspace bootstrap and task start             |
| **workspace-init**    | Workspace | Automated workspace initialization and memory seeding |
| **plan**              | Execution | Complex task planning with branch management          |
| **brain-storm**       | Workspace | Multi-angle analysis with branch IDs                  |
| **deep-reasoning**    | Execution | Multi-step reasoning with dependency chains           |
| **critic-loop**       | Review    | Review and rollback judgment                          |
| **time-series**       | Workspace | Unified time-series review framework                  |
| **data-interface**    | Task      | 4-type data entry contract (file / DB / loader / API) |
| **forecast-contract** | Review    | Forecast output controllability & validity checks     |
| **report-writing**    | Workspace | Experiment reports and formal document output         |
| **python-toolbox**    | Workspace | Python tool selection priors                          |
| **ztxexp**            | Workspace | Experiment directory structure & plotting protocol    |
| **github-search**     | Workspace | GitHub first-hand engineering evidence retrieval      |
| **pdf-intake**        | Workspace | Safe PDF and scanned document extraction              |
| **safety-gate**       | Review    | Automated safety pre-check                            |
| **evolution**         | Execution | Capability gap detection → new agent/skill creation   |
| **template**          | Workspace | Empty skill skeleton for new skills                   |

---

## 📋 Protocols (8)

Protocols constrain the execution layer — governing how agents communicate, escalate, and compact context:

| Protocol           | Purpose                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| **dispatch**       | Subagent dispatch with context mode (`full_context` / `compacted_context` / `minimal_context`) |
| **reportback**     | Structured report-back from subagents with self-critique                                       |
| **rebuttal**       | Rebuttal protocol for route challenges                                                         |
| **stop-go**        | Stop/go governance with critic conflict resolution                                             |
| **lifecycle**      | Agent lifecycle management                                                                     |
| **memory-sync**    | Memory synchronization across agents                                                           |
| **runtime-events** | Runtime event tracking and trace updates                                                       |
| **compaction**     | Context compaction for long-running multi-agent sessions                                       |

---

## 🧠 Memory & Trace

AION maintains two complementary tracking systems across the workspace layer:

- **`.opencode/trace.md`** — Per-task execution trace: key decisions, failure reviews, and delivery checkpoints
- **`.opencode/memory/`** — Cross-task persistent memory: positive/negative findings, agent relationships, decisions, features
- **`.opencode/memory/context-snapshot.md`** — Canonical compaction artifact derived from `initial-prompt`, `progress`, `decisions`, `todo-map`, and active blockers
- **Local git** — Detail-level checkpoint history at the host project root (auto-initialized, never pushes)

Memory and git serve different purposes: memory handles abstract experience and judgments; git handles detail-level changes and key-node replay.

---

## 📡 CLI Reference

`cli.sh` provides a CLI entry point for automated run-mode execution with auto-continue:

```bash
bash cli.sh [OPTIONS]
```

### Options

| Flag                  | Default       | Description                                       |
| --------------------- | ------------- | ------------------------------------------------- |
| `--mode MODE`         | `run`         | Launch mode: `run` or `tui`                       |
| `-m, --model MODEL`   | (from config) | OpenCode model (e.g. `anthropic/claude-sonnet-4`) |
| `--max-continues N`   | `30`          | Max auto-continue rounds; `0` for unlimited       |
| `--continue-delay S`  | `2`           | Seconds between auto-continue rounds              |
| `--bash-timeout-ms N` | `1200000`     | OpenCode bash default timeout (ms)                |
| `--no-auto-continue`  | (off)         | Disable auto-continue after each round            |
| `--debug`             | (off)         | Enable verbose debug logging                      |
| `--export`            | (off)         | Export session JSON on completion                 |
| `-h, --help`          | —             | Show help                                         |

### Examples

```bash
# Basic autonomous run
bash cli.sh

# Specific model with limited rounds
bash cli.sh -m openai/gpt-4.1 --max-continues 5

# Debug mode with session export
bash cli.sh --debug --export

# Interactive TUI
bash cli.sh --mode tui --no-auto-continue
```

---

## 🛡️ Key Constraints

The harness enforces hard boundaries across all four layers:

- **No knowledge/data leakage** — Future information, labels, hidden-set content, and private data must never leak into features, code, logs, or outputs
- **Ruthless skepticism** — A single success or metric gain is not proof of reliability; active investigation of leakage, spurious correlation, overfitting, and unverified assumptions is mandatory
- **Governance hierarchy** — `c-critic > ts-critic > main agent > others` in all governance decisions; main agent cannot override critic blockers
- **Mutually exclusive delegation first** — As long as an existing role already covers a class of work, the main agent should delegate it by default instead of doing it directly; if work is not delegated or not parallelized, the reason should stay explicit and narrow
- **Benchmark-first** — Tasks with leaderboards or competitions must maintain parallel branches: self-exploration + top-solution reverse-engineering
- **Mermaid-only diagrams** — All structural diagrams must use Mermaid; ASCII/plain-text diagrams are forbidden in formal outputs
- **Workspace cleanup** — Empty directories, temp files, and debug residue must be cleaned before final delivery

---

## 🌍 Ecosystem

AION is part of the time-series harness research ecosystem:

- Built on [OpenCode](https://github.com/anomalyco/opencode) — open-source AI coding agent

---

## 📝 Citation

If you use AION in your research, please cite:

```bibtex
@article{zhan2026aion,
  title={AION: Next-Generation Tasks and Practical Harness for Time Series},
  author={Zhan, Tianxiang and Song, Xiaobao and Guan, Tong and Pan, Shirui and Jin, Ming},
  journal={arXiv preprint},
  year={2026}
}
```

---

## 🤝 Contributing

AION is a community-driven research project. We welcome contributions in:

| Area          | Examples                                                       |
| ------------- | -------------------------------------------------------------- |
| **Agents**    | New specialized agent roles                                    |
| **Skills**    | Domain knowledge `.md` files (finance, climate, healthcare...) |
| **Protocols** | New coordination or governance patterns                        |
| **Rules**     | Domain-specific constraint sets                                |
| **Evals**     | Suite definitions, graders, scorecards                         |
| **Templates** | Memory templates, workspace scaffolds                          |

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  <strong>AION</strong><br>
  <em>Next Generation Tasks and Practical Harness for Time Series</em>
</p>

<div align="center">
  <a href="https://star-history.com/#ztxtech/aion&Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=ztxtech/aion&type=Date&theme=dark" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=ztxtech/aion&type=Date" />
      <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=ztxtech/aion&type=Date" style="border-radius: 15px; box-shadow: 0 0 30px rgba(124, 58, 237, 0.3);" />
    </picture>
  </a>
</div>

<p align="center">
  <em>Thanks for visiting AION!</em><br>
  <img src="https://visitor-badge.laobi.icu/badge?page_id=ztxtech.aion&style=for-the-badge&color=7C3AED" alt="Views">
</p>
