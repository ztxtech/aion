---
name: Self-Purify
description: Post-task reflection and memory lifecycle — extract structured lessons, detect skill gaps, compact memory, and close the improvement loop.
---

# Self-Purify

Run this skill after every task completes (before or as part of the final closeout gate). It converts raw session experience into structured, verifiable memory and feeds the skill evolution pipeline.

## When

- A task reaches its stop condition (all critic gates pass).
- A task is paused or blocked for an extended period.
- Explicitly invoked by the main agent or `c-critic`.

## Flow

### 1. Extract

- Scan `trace.md` and session history for the current task.
- For each significant success or failure, create a structured entry in `positive.md` or `negative.md` using the entry schema.
- An entry is only valid if it has: trigger, action, outcome, evidence, root_cause, scope.
- Discard one-off process details (those belong in `trace.md`, not memory).

### 2. Detect Gaps

- Scan `negative.md` for entries that cross the severity-weighted escalation threshold:
  - blocker: 1 occurrence
  - high: 2 occurrences
  - medium: 3 occurrences
  - low: 5 occurrences
- Group by `root_cause` + `scope`. If any group crosses its threshold, write a **gap report** to `memory/evolution-log.md`:
  ```yaml
  - gap: "repeated root_cause from negative.md"
    occurrences: 2
    severity: "high"
    proposed_skill: "name"
    rationale: "why this closes the gap"
    status: proposed
  ```

### 3. Shadow-Test Proposals

- On the next 2 tasks that match the gap's `scope`, the main agent should try the proposed skill approach alongside the default.
- Record both outcomes in `trace.md`.
- After 2 trials, evaluate: did the proposed approach measurably outperform?

### 4. Promote or Deprecate

- If the proposed skill outperformed: create the skill, set `status: promoted` in `evolution-log.md`, update `relation.md`.
- If it did not: set `status: deprecated`, add a negative entry explaining why.
- Never promote a skill without 2 shadow-test trials.

### 5. Compact

- Apply the compaction rules defined in `positive.md` and `negative.md`.
- Merge duplicates, prune stale entries, increment `use_count` for retrieved patterns.
- Refresh `context-snapshot.md` if memory changed materially.

## Output

Append a one-line summary to `trace.md`:

```
[self-purify] entries_added=<N> gaps_found=<N> proposals=<names> compacted=<merged/pruned counts>
```
