<h1 align="center">
  <img src="https://img.shields.io/badge/AION-Time_Series_Harness-7C3AED?style=for-the-badge&logo=openai&logoColor=white" alt="AION" />
</h1>

<p align="center">
  <a href="README.md"><strong>English</strong></a> ·
  <a href="README.zh-CN.md"><strong>简体中文</strong></a>
</p>

## 📰 News

- **2026-06-14** — AION is now a **compiled TypeScript plugin** for OpenCode (one-command install). v0.5.0 adds Hugging Face Datasets integration (4 tools + CLI), ablation/SHAP hard gates, hardware probe, info-collector reformulation. v0.5.1 codifies **Hard Role Boundaries** — the main agent dispatches, integrates, and governs; leaf workers (coder / information-collector / requirements-analyst) execute via explicit Reception Contracts (19 new role-boundary tests, 574/574 pass). v0.5.2 replaces path-based denylists with a **contract-driven leakage gate** — `requirements-analyst` writes `dataBoundaries` (allowed_reads / forbidden_reads / internet_access / runtime_hosts / label_columns) into the Task Contract, the hook enforces it at read-time, and `ts-critic` audits the full training pipeline + submission columns at submission review time.

---

**AION** is a time-series harness — an explicit control layer that connects task specification, runtime execution, and result assessment into one stable process for next-generation time-series workloads.

Time-series research is moving beyond fixed forecasting benchmarks toward tasks that combine prediction, contextual reasoning, tool use, and structured decision support. AION formalizes these as triples of _task file, workspace, and validation interface_, and organizes the entire system around four stacked layers: **task** (what to solve), **workspace** (what evidence and tools are available), **execution** (how the system acts under constraints), and **review** (whether outputs pass validity, temporal, and completeness checks before progress is accepted).

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Quick_Start-3_min-blue?style=for-the-badge" alt="Quick Start"></a>
  <a href="#-four-layer-architecture"><img src="https://img.shields.io/badge/Layers-4-10B981?style=for-the-badge" alt="Layers"></a>
  <a href="#-skills"><img src="https://img.shields.io/badge/Skills-17-8B5CF6?style=for-the-badge" alt="Skills"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License"></a>
  <a href="https://arxiv.org/abs/2605.25045"><img src="https://img.shields.io/badge/arXiv-2605.25045-B31B1B?style=for-the-badge&logo=arxiv&logoColor=white" alt="arXiv"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/OpenCode-≥0.9-blue?logo=terminal&logoColor=white" alt="OpenCode">
  <img src="https://img.shields.io/badge/Python-≥3.10-3776AB?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/Multi_Agent-6_Roles-F59E0B?style=flat" alt="Multi-Agent">
  <img src="https://img.shields.io/badge/Tools-34-06B6D4?style=flat" alt="Tools">
  <img src="https://img.shields.io/badge/Protocols-8-06B6D4?style=flat" alt="Protocols">
  <img src="https://img.shields.io/badge/Evals-5_Gates-EC4899?style=flat" alt="Evals">
  <img src="https://img.shields.io/badge/Time_Series-Harness-7C3AED?style=flat" alt="Time Series">
  <a href="https://github.com/ztxtech/aion"><img src="https://img.shields.io/github/stars/ztxtech/aion?style=social" alt="GitHub stars"></a>
  <img src="https://img.shields.io/github/last-commit/ztxtech/aion?color=orange" alt="Last Commit">
  <a href="https://deepwiki.com/ztxtech/aion"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
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

### Project Structure (Plugin Version)

AION is a compiled TypeScript plugin. The repository contains the source code; the build produces a self-contained bundle that gets installed into each project's `.opencode/plugins/` directory.

**Repository layout:**

```
aion/
├── src/                        # TypeScript plugin source
│   ├── index.ts                # Plugin entry point (default export)
│   ├── plugin-interface.ts     # Assembles the PluginInstance for OpenCode
│   ├── create-managers.ts      # Central state: governance, trace, phases
│   ├── create-tools.ts         # Aggregates all AION tools
│   ├── create-hooks.ts         # Aggregates all OpenCode hooks
│   ├── workspace-bootstrap.ts  # On-disk workspace initializer
│   ├── agents/                 # 6 agent factories
│   │   ├── aion.ts             #   Main orchestrator (primary mode)
│   │   ├── requirements-analyst.ts
│   │   ├── information-collector.ts
│   │   ├── coder.ts            #   Implementation workhorse
│   │   ├── ts-critic.ts        #   Time-series + Pareto governor
│   │   └── c-critic.ts         #   Final-gate cold-start critic
│   ├── config/                 # Zod schema + config loader
│   ├── hooks/                  # 11 OpenCode lifecycle hooks
│   ├── tools/                  # 15 AION tools (critic, memory, safety...)
│   ├── team/                   # Team-mode coordination (mailbox, tasks, tmux)
│   ├── prompts/                # Governance constants + agent prompt loader
│   └── shared/                 # Logger, JSONC parser, utils, personality
├── bin/
│   └── aion-init.js            # CLI installer (aion-ts init)
├── scripts/
│   ├── build.sh                # Build + pack release tarball
│   └── install.sh              # curl-pipe-bash system installer
├── .opencode/
│   ├── skills/                 # 17 skill definitions (markdown)
│   └── themes/aion.json        # AION TUI theme
├── docs/                       # Documentation website
├── example/                    # Ready-to-run examples
├── package.json
└── tsconfig.json
```

**After `aion-ts init` in your project:**

```
your-project/
├── .opencode/
│   ├── plugins/
│   │   └── aion.js             # Self-contained plugin bundle (auto-discovered)
│   ├── themes/
│   │   └── aion.json           # AION theme
│   ├── aion.jsonc              # AION configuration (all features ON by default)
│   └── memory/                 # Created at runtime (progress, decisions, etc.)
└── opencode.json               # OpenCode config (theme, agents)
```

OpenCode auto-discovers plugins in `.opencode/plugins/` at startup — no global configuration is touched.

---

## 🚀 Quick Start

### 0. Prerequisites

| Command  | Used by                          | Notes                 |
| -------- | -------------------------------- | --------------------- |
| `node`   | Runs the `aion-ts` CLI           | ≥ 18 recommended      |
| `curl`   | Download the installer           | Usually pre-installed |
| `git`    | Local checkpoint history         | Usually pre-installed |
| `python3`| Python toolchain, validators     | ≥ 3.10 recommended    |

### 1. Install OpenCode

```bash
# YOLO
curl -fsSL https://opencode.ai/install | bash

# Package managers
npm i -g opencode-ai@latest        # or bun/pnpm/yarn
brew install anomalyco/tap/opencode # macOS and Linux (recommended)
```

### 2. Configure OpenCode

```bash
opencode    # launch the TUI, then pick a provider and authenticate when prompted
```

Supports **Claude / OpenAI / Codex / Copilot / Gemini** and any compatible endpoint.

### 3. Install the AION CLI

```bash
curl -fsSL https://raw.githubusercontent.com/ztxtech/aion/dev/scripts/install.sh | bash
```

This installs the `aion-ts` CLI to `~/.local/bin`. If that directory is not in your `PATH`, add it:

```bash
export PATH="$HOME/.local/bin:$PATH"   # add to ~/.bashrc or ~/.zshrc
```

> **During testing (no GitHub Release yet):** Build locally and install from the tarball:
> ```bash
> git clone -b dev https://github.com/ztxtech/aion.git && cd aion
> bash scripts/build.sh
> bash scripts/install.sh --local release/aion-plugin-0.1.0.tar.gz
> ```

### 4. Add AION to Your Project

```bash
cd your-project
aion-ts init .
```

This drops the plugin bundle into `.opencode/plugins/aion.js`, creates a starter `aion.jsonc` config, and copies the theme. The plugin is fully self-contained — **no `npm install` needed** in your project.

### 5. Run

```bash
# Interactive TUI mode — pick your model in the TUI
opencode

# Non-interactive run mode
opencode run --agent aion "Your task description here"

# With a specific model
opencode run --agent aion -m provider/model "Analyze this time-series dataset"
```

### Run Modes vs Execution Strategies

OpenCode's `run` and `tui` describe the interface shape, not the same thing as how much the agent should ask the user.

- **`run` + autonomous** (default) — The agent detects local context, picks the best path, and keeps going without pausing for routine choices.
- **`tui` + autonomous** — The user is present and can observe, but the agent still makes routine decisions on its own.
- **`tui` + interactive** — The user explicitly wants to co-decide important forks. The agent still does local detection first and only asks when multiple equally reasonable options remain.
- **`run` + interactive** — Not a supported default. If the workflow should pause for user choices, use `tui` instead.

At session start, AION asks you (via OpenCode's built-in question popup) whether you want **interactive** or **autonomous** mode. You can also toggle mid-conversation by saying "I'm leaving" (→ autonomous) or "switch to interactive".

---

## 📦 Examples

The [`example/`](example/) directory contains ready-to-run workspaces that demonstrate AION end-to-end on concrete time-series tasks.

> **⚠️ Clinical disclaimer — `example/aion-medical-demo/` is a DEMONSTRATION only.** The ECG data is real but tiny (3 patients from PhysioNet PTB); the ICU vitals are synthetic. Models, metrics, and reports produced by the agent are demo artefacts — they are **not validated for clinical use**. See [`example/aion-medical-demo/README.md`](example/aion-medical-demo/README.md) for the full disclaimer.

### Medical Time-Series Case — ECG Diagnosis & ICU Sepsis Onset (Demo)

[`example/aion-medical-demo/`](example/aion-medical-demo/) wraps a clinical case in a recording-specific scaffold. The goal is to make every AION harness feature fire in a single run.

```bash
cd example/aion-medical-demo/medical
aion-ts init .
opencode
> introduce yourself by completing this task, AION
```

### Local Kaggle-Like Forecasting Competition

[`example/kaggle/`](example/kaggle/) is a local replica of the Kaggle **Store Sales - Time Series Forecasting** competition. A lightweight local evaluation server mimics the Kaggle submission and scoring API. See [`example/kaggle/README.md`](example/kaggle/README.md) for details.

---

## 🤝 Agent Roles

Agents span all four layers — from task parsing through execution orchestration to layered review:

| Agent                     | Primary Layer         | Role                                                                                           |
| ------------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| **aion**                  | Execution             | Main orchestrator — dispatches subagents, enforces review gates, drives to close               |
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

## 🛠️ Tools (20 AION + 14 Team = 34)

AION tools are programmable primitives invoked by the agents. All return JSON strings and are auto-traced. Team tools are conditionally registered when `teamMode.enabled = true`.

| Category | Tools | Purpose |
| --- | --- | --- |
| **Experiment** | `aion_ztxexp_init`, `aion_ztxexp_validate`, `aion_ztxexp_run` | Rigid 7-directory experiment boundary for reproducible ablations |
| **Governance** | `aion_critic_dispatch`, `aion_critic_verdict`, `aion_record_blocker`, `aion_resolve_blocker`, `aion_pre_stop_gate` | Stop-go gate, blocker ledger, c-critic supremacy enforcement |
| **Memory** | `aion_memory_sync`, `aion_workspace_init`, `aion_compaction` | Shared cache across agents, snapshot refresh |
| **Safety** | `aion_safety_gate`, `aion_leakage_check` | Pre-action safety, leakage detection (hidden-set, future info, credentials) |
| **Plan** | `aion_todo_update` | Plan-step ↔ OpenCode TODO mapping with stop-impact analysis |
| **Session** | `aion_set_interactive_mode`, `aion_set_language` | User-mode toggles driven by session-start question |
| **Hugging Face** | `aion_hf_search`, `aion_hf_info`, `aion_hf_ingest`, `aion_hf_suggest` | Zero-dependency HF Hub REST integration. Cached 24h under `.opencode/hf-cache/` |
| **Team** | `team_create`, `team_delete`, `team_send_message`, `team_status`, `team_list`, `team_task_*`, `team_inbox*`, `team_shutdown_*`, `team_approve_shutdown`, `team_reject_shutdown` | Multi-agent parallel coordination (lead + members) |

### Ablation & Statistical Rigor (HARD GATES)

Two rules in `rules.ts` cannot be bypassed:

1. **Ablation is the SOLE arbiter of "best method"** — every "X is best" claim MUST be backed by a config-level ablation matrix inside `ztxexp` (≥3 seeds, single-factor toggles). c-critic rejects anecdotal / single-seed / leaderboard-only claims.
2. **Beyond p-value: complementary analysis battery** — after significance + bootstrap CI, MUST also run SHAP (or equivalent feature attribution), residual structure diagnosis, drift analysis, and sensitivity analysis. Skipping any is a ts-critic blocker.

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

### `aion-ts` — Plugin Installer

The primary CLI for installing AION into a project:

```bash
aion-ts init [target-dir] [--force]
```

| Flag            | Default     | Description                                                        |
| --------------- | ----------- | ------------------------------------------------------------------ |
| `target-dir`    | `.` (cwd)   | Directory to install into. Created if it does not exist.           |
| `--force`, `-f` | (off)       | Overwrite an existing `.opencode/plugins/aion.js`.                 |
| `--help`, `-h`  | —           | Show help.                                                         |

What `init` does:
1. Copies the plugin bundle to `<target>/.opencode/plugins/aion.js` (auto-discovered by OpenCode).
2. Creates `<target>/opencode.json` if absent (minimal starter with `$schema` and theme).
3. Copies a commented default config to `<target>/.opencode/aion.jsonc`.
4. Copies the AION theme to `<target>/.opencode/themes/aion.json`.

The model is NOT set by `init` — you pick it in the OpenCode TUI at runtime.

Nothing outside `<target>` is touched.

### `aion-ts datasets` — Hugging Face Datasets CLI

Mirror of the `aion_hf_*` tools. Lets you prep datasets without launching OpenCode. All commands support `--no-cache` to bypass the 24h HF cache (`.opencode/hf-cache/`).

```bash
aion-ts datasets search "ECG arrhythmia" --limit 10 --modality timeseries
aion-ts datasets info Salesforce/lotsa_data
aion-ts datasets ingest Salesforce/lotsa_data --workspace . --split train
aion-ts datasets suggest --goal "ECG anomaly detection" --keywords "ecg,arrhythmia" --top-k 5
```

| Action     | Required args                              | Output |
| ---------- | ------------------------------------------ | ------ |
| `search`   | `<query>`                                  | JSON: `{ query, count, results[] }` |
| `info`     | `<owner/name>`                             | JSON: full dataset card + siblings + splits |
| `ingest`   | `<owner/name>` `[--workspace DIR]` `[--split S]` | Writes `data/aion-dataset-manifest.json` + `data/<id>.loader.py` |
| `suggest`  | `--goal "..."` `[--keywords k1,k2]` `[--modality M]` `[--top-k N]` | JSON: `{ goal, keywords, candidates[] }` ranked by score |

### `cli.sh` — OpenCode Launcher (Legacy)

`cli.sh` is a convenience wrapper around `opencode` for automated run-mode execution with auto-continue. It is optional — you can always use `opencode` directly.

```bash
bash cli.sh [OPTIONS]
```

| Flag                  | Default       | Description                                       |
| --------------------- | ------------- | ------------------------------------------------- |
| `--mode MODE`         | `run`         | Launch mode: `run` or `tui`                       |
| `-m, --model MODEL`   | (from TUI)   | OpenCode model (format: `provider/model`)          |
| `--max-continues N`   | `30`          | Max auto-continue rounds; `0` for unlimited       |
| `--no-auto-continue`  | (off)         | Disable auto-continue after each round            |
| `--debug`             | (off)         | Enable verbose debug logging                      |
| `-h, --help`          | —             | Show help                                         |

---

## 🗑️ Uninstall

### System-level (CLI + bundle)

```bash
curl -fsSL https://raw.githubusercontent.com/ztxtech/aion/dev/scripts/uninstall.sh | bash
```

Removes `~/.local/bin/aion-ts` and `~/.local/lib/aion/`.

### Project-level (also remove from a specific project)

```bash
# System + current project (backs up AION files before removal)
curl -fsSL https://raw.githubusercontent.com/ztxtech/aion/dev/scripts/uninstall.sh | bash -s -- --project .

# Project only (keep the CLI installed)
curl -fsSL https://raw.githubusercontent.com/ztxtech/aion/dev/scripts/uninstall.sh | bash -s -- --project . --no-system
```

Project-level uninstall:
- **Backs up** all AION-specific files to `.opencode/aion-backup-<timestamp>.tar.gz` before removal
- **Removes** `.opencode/plugins/aion.js`, `.opencode/themes/aion.json`, `.opencode/aion.jsonc`
- **Cleans** `opencode.json` (removes `theme: "aion"`, keeps everything else)
- **Does NOT touch** `.opencode/memory/`, `.opencode/trace.md`, `.opencode/skills/`, or any user data

Use `--dry-run` to preview without removing:
```bash
bash scripts/uninstall.sh --project . --no-system --dry-run
```

---

## 🔨 Building from Source

For contributors and local testing:

```bash
git clone -b dev https://github.com/ztxtech/aion.git && cd aion
npm install

# Build + pack a release tarball
bash scripts/build.sh
# → release/aion-plugin-0.1.0.tar.gz

# Install from the local tarball
bash scripts/install.sh --local release/aion-plugin-0.1.0.tar.gz
```

---

## 🛡️ Key Constraints

The harness enforces hard boundaries across all four layers:

- **No knowledge/data leakage** — Future information, labels, hidden-set content, and private data must never leak into features, code, logs, or outputs
- **Ruthless skepticism** — A single success or metric gain is not proof of reliability; active investigation of leakage, spurious correlation, overfitting, and unverified assumptions is mandatory
- **Governance hierarchy** — `c-critic > ts-critic > main agent > others` in all governance decisions; main agent cannot override critic blockers
- **Mutually exclusive delegation first** — As long as an existing role already covers a class of work, the main agent should delegate it by default instead of doing it directly
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
@misc{zhan2026aion,
      title={AION: Next-Generation Tasks and Practical Harness for Time Series},
      author={Tianxiang Zhan and Xiaobao Song and Tong Guan and Shirui Pan and Ming Jin},
      year={2026},
      eprint={2605.25045},
      archivePrefix={arXiv},
      url={https://arxiv.org/abs/2605.25045},
}
```

---

## 🤝 Contributing

AION is a community-driven research project. We welcome contributions in:

| Area          | Examples                                                       |
| ------------- | -------------------------------------------------------------- |
| **Agents**    | New specialized agent roles                                    |
| **Skills**    | Domain knowledge `.md` files (finance, climate, healthcare...) |
| **Tools**     | New AION tools (TypeScript)                                    |
| **Hooks**     | New OpenCode lifecycle hooks (TypeScript)                      |
| **Protocols** | New coordination or governance patterns                        |
| **Evals**     | Suite definitions, graders, scorecards                         |

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
