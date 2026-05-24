# Memory Usage Notes

## Goal

`memory` stores stable information that can be reused across tasks. It does not store one-off execution logs.

- One-off process logs, attempts, and failure reviews go to `.opencode/trace.md`
- Reusable experience, priors, forbidden zones, and role relations go to `.opencode/memory/*.md`

## File Roles

- `positive.md`: verified positive experience, useful patterns, recommended defaults.
- `negative.md`: failed paths, counterexamples, known risks, patterns to avoid.
- `relation.md`: role relations, key call chains, structural changes.
- `initial-prompt.md`: append-only baseline of the original prompt, earliest goal, explicit metrics, and non-goals for this task. The main agent uses it to avoid drift, and `c-critic` uses it in the final review.
- `context-snapshot.md`: canonical compaction artifact refreshed at key nodes of the main flow; it condenses active blockers, forbidden actions, structural decisions, verified evidence, and the default next dispatch focus.
- `dir.md`: explains folder purpose.

## Update Rules

- Record only information that has evidence and still has reuse value later.
- Add scope and limits when you record something, so a local result is not treated like a general rule.
- If the structure changes, update `relation.md` too.
- The `original prompt` block in `initial-prompt.md` is append-only by default. If the task changes later, explain it only in the `Later Clarifications` block.
- `context-snapshot.md` must be derived from `initial-prompt`, `progress`, `decisions`, `todo-map`, `completion-gate`, and the currently active blockers. It must not become a free-form summary detached from source-of-truth artifacts.
- `context-snapshot.md` exists only to provide the minimum required context for later dispatch. If it conflicts with real artifacts on disk, original protocols, or critic conclusions, return to the source of truth and refresh the snapshot immediately.
- If `brain-storm` / `deep-reasoning` keeps finding high-value actions or typical early-stop signals before closeout, save those stable patterns into `positive.md` / `negative.md`.
