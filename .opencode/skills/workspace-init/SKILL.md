---
name: workspace-init
description: Align project background, initialize runtime trace / memory files, and output the minimum startup summary for the current task.
---

## Debug Prefix Protocol

- When called, print this first: `[Skills: workspace-init] Follow: <rules / context constraints that really apply now>; Current step: <one-line note>`.
- If this skill clearly depends on one rule, add one more line like `[Rules: <rule>] ...`, then continue with the real work.
- The debug prefix should stay stable, short, and easy to grep.


## Flow

- **Run the init script first** to initialize all runtime files in one shot:
  ```bash
  bash .opencode/skills/workspace-init/init.sh
  ```
  This handles git init, trace file creation, and all memory file creation from templates. It never overwrites existing files. Cross-platform: works on macOS (bash/zsh), Linux (bash/zsh), and Windows (Git Bash).
- Read possible project-note files in the root directory, such as `README.md`, task notes, and existing `.opencode/trace.md`, to align project background and context.
- Infer the user interaction language from the current task, and reply in that language by default, unless the task contract requires another delivery language.
- Separate `interface mode` from `execution strategy`: `run` / `tui` are interface modes, while `autonomous` / `interactive` are execution strategies. If there is no stronger signal, the default execution strategy is `autonomous`; `run + interactive` is not a supported default path.
- If `.opencode/trace.md` or any `.opencode/memory/*.md` already exists, read its current contents before any later write, append, or overwrite. Do not treat runtime files like empty templates that may be rebuilt blindly.
- After `.opencode/memory/initial-prompt.md` is initialized, the main agent must write the original user prompt, earliest task goal, explicit metrics, and non-goals for this round into it at once as an append-only baseline. Later it may only append clarifications, not overwrite the original prompt block.
- After `.opencode/memory/context-snapshot.md` is initialized, the main agent must refresh the first snapshot before `workspace-init` closes: at minimum it should write task anchors, current phase, explicit constraints, the most obvious gaps, and the default next-dispatch focus. This is not an optional summary. It is the canonical entry point for later multi-agent compaction.
- Remind the main agent: local git is for detail-level checkpoints, while memory / trace are for abstract judgments and reviews. They should be maintained in parallel, not used as substitutes for each other.
- Remind the main agent: after the `workspace-init` baseline is established, it should create the first local git commit soon, then keep committing again at plan switches, key milestones, major rollback points, and the final stable pre-delivery state.
- If the current task will clearly enter a multi-agent / multi-stage / harness flow, also remind the main agent to read `.opencode/protocols/` and `.opencode/evals/`, especially `dispatch`, `compaction`, `memory-sync`, and `runtime-events`, so it does not initialize memory only and miss runtime protocols or eval contracts.
- If the current task may involve Python, do one round of environment detection before asking the user anything:
  - whether Python is actually needed for this task
  - whether a reusable workspace-root `.venv` already exists
  - whether the project already declares stronger environment constraints, such as `.python-version`, `pyproject.toml`, `environment.yml`, `requirements*.txt`, or `uv.lock`
  - whether multiple equally reasonable environment candidates still remain after local detection
- The default Python environment priority is fixed as: reuse existing `.venv` > follow project constraints > create a workspace-root `.venv`.
- If the current execution strategy is `autonomous` and the environment detection found no real conflict, follow that default priority directly instead of asking the user about interpreter preferences.
- If the current execution strategy is `interactive`, still do the same local detection first; only when multiple equally reasonable environment candidates remain and they would materially change the later path may this fork be escalated back to the main agent for a short user confirmation.
- Remind the main agent that `interactive` does not mean asking on every step. It only means exposing real forks to the user after local detection has already narrowed the space.
- Make clear the current known goal, available inputs, key constraints, and the most obvious gaps.

## Output Format

- Read materials
- Initialized files
- Git initialization status
- Initial prompt baseline status
- Context-snapshot status
- Current language
- Execution-strategy status
- Python-needed judgment
- Python-environment detection
- Python-environment default recommendation
- Known goals and gaps
