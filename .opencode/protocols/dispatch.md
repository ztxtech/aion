# Dispatch Protocol

## Purpose

Define the dispatch packet for assigning work to a subagent.

## Required Fields

```yaml
task_id: string
objective: string           # one-sentence goal
focus: [string]             # current explicit focus points
constraints: [string]       # hard constraints, including unresolved critic blockers
output: reportback          # fixed
```

## Context Mode

- `full_context`: subagent gets full history. Use only when snapshot + artifacts truly cannot support the task. Must state why.
- `compacted_context`: default for round 2+. Subagent gets `context-snapshot.md` + listed supporting artifacts.
- `minimal_context`: reserved for `c-critic` cold-start critique. Only task goal, real artifacts on disk, `initial-prompt.md`, and required protocols.

## Rules

- Every dispatch must say why the current role owns this slice and why the main agent is not doing it directly.
- For analysis-style agents (RA, IC, ts-critic), include one open slot: `First judge whether the main agent asked the wrong question. Rewrite the question set if a more upstream or higher-value question exists.`
- Every dispatch must include one reportback slot: `At finish, say what you completed, what is still missing, which agent/skill should be called next, and why the flow cannot close now.`
- If `ts-critic` has unresolved blockers, the dispatch must begin with an `unresolved blocker list` (blocker, evidence, forbidden action, unblock condition).
- If in `rebuttal` mode, the dispatched subagent must answer every blocker in the fixed rebuttal format before substantive work.

## Subagent Required Reads

Subagents should NOT re-read all protocols on every dispatch. Their system prompts already contain the key rules. They read on demand only:
- `protocols/reportback.md` — when preparing reportback
- `protocols/rebuttal.md` — when in rebuttal mode
- `protocols/stop-go.md` — when giving stop/go signals
- `protocols/compaction.md` — when doing context compaction
- Relevant skills — as directed by the dispatch
