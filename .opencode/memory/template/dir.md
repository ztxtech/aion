## Folder Notes

- `.opencode`: The core config directory of the upload package.
  - The local root `.git` of the host project, if present: used only for detail-level checkpoints and replay by the LLM. It does not conflict with `.opencode/memory`; git stores detail history, while memory stores abstract experience.
  - `.opencode/agents`: Definitions for the main agent and all subagents.
  - `.opencode/protocols`: Runtime protocols for dispatch, reportback, lifecycle, rebuttal, stop/go, memory-sync, runtime-events, and compaction.
  - `.opencode/evals`: Eval contracts for suites, graders, scorecards, regression matrices, and release gates.
  - `.opencode/rules`: Shared rules loaded by the host project through `opencode.json` / `opencode.jsonc` `instructions`.
  - `.opencode/skills`: Reusable skills.
  - `.opencode/trace.md`: The real runtime trace. It is not submitted as a template.
  - `.opencode/memory`: Persistent memory that can be reused across tasks.
    - `.opencode/memory/memory.md`: Explains the role of each memory file.
    - `.opencode/memory/positive.md`: Positive priors, useful strategies, stable experience.
    - `.opencode/memory/negative.md`: Failure patterns, bad paths, risk patterns.
    - `.opencode/memory/relation.md`: Role relations and key call chains.
    - `.opencode/memory/initial-prompt.md`: Baseline snapshot of the original prompt, earliest goal, explicit metrics, and non-goals.
    - `.opencode/memory/context-snapshot.md`: Canonical compaction artifact refreshed automatically at key nodes of the main flow.
    - `.opencode/memory/progress.md`: Current stage, finished actions, and next-step suggestions.
    - `.opencode/memory/features.md`: Delivered / planned features and evidence.
    - `.opencode/memory/decisions.md`: Structural decisions and deferred decisions.
    - `.opencode/memory/todo-map.md`: Mapping from plan steps to OpenCode TODO, blockers, and stop/go signals.
    - `.opencode/memory/completion-gate.md`: Pre-stop gate, remaining action count, and complete-state.
    - `.opencode/memory/template`: Init templates for the runtime files above.

- Any existing `.opencode/trace.md` or `.opencode/memory/*.md` (including `context-snapshot.md`) must be read before it is written, appended to, or overwritten. Direct initialization is allowed only after confirming that the target file does not exist yet.
- If the host-project root does not yet have a git repository, the main agent / `workspace-init` should initialize a local-only `.git` by default and create commits at key nodes. Do not configure remotes, do not auto-push, and do not replace memory / trace with git commits.
- `context-snapshot.md` should be refreshed by the main agent after `workspace-init`, after plan/route switches, after parallel reportback merge, after `rebuttal` opens, and before final `c-critic`. It exists for multi-agent compaction and does not replace real artifacts on disk or critic conclusions.
