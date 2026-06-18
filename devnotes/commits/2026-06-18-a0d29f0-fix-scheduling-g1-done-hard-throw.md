# Commit Entry: G1 hard-throws on any dispatch in phase=done

> **Commit**: `a0d29f0` (`a0d29f0`)
> **Date**: 2026-06-18
> **Author**: ztx
> **Branch**: dev
> **Type / Scope**: `fix(scheduling)`

## Summary

`done` is a terminal phase — its `LEGAL_EDGES` set is empty — but the
G1 dispatch check was emitting a soft warn instead of blocking, so
the main agent could keep dispatching workers after c-critic approved
stop. The result is the loop spinning on orphan work while the user
stares at an empty TUI todo list. G1 now hard-throws when phase=done,
forcing the loop to end.

## What Changed

- `src/hooks/tool-guard.ts:495-510`
  - Inside the `if (!legal)` branch of the G1 dispatch check,
    added a hard-throw when `phase === "done"`. The throw message
    tells the agent exactly why it was blocked and what to do
    instead ("Write the final summary and end the turn.").
  - All other G1 violations still emit a soft warn (the existing
    doom_loop-avoidance rule is preserved).

- `test/unit/hooks.test.mjs`
  - New test "HARD-throws on any dispatch after phase=done
    (terminal)": in a fresh plugin instance, transitions phase to
    `done` via `aion_critic_verdict{critic=c-critic, verdict=approve-stop}`,
    then asserts the next `task()` dispatch rejects with
    `/phase=done is terminal/`.

## How It Was Done

Approach: surgical escalation, not a full G1 rewrite. The G1 check
already differentiated between "soft warn for doom_loop avoidance"
and "block when truly impossible". The new code adds a third case:
"block when phase is terminal" — which is impossible to be confused
with doom_loop, because phase=done means c-critic has approved
closeout, so any further dispatch is unambiguously a bug.

Key decisions:

- **Soft-warn stays the default for all non-`done` violations.** A
  primary goal of the original G1 was to avoid throwing on
  borderline-legal dispatches, because throws trigger OpenCode's
  doom_loop protection and the agent loses the diagnostic. This
  commit does not change that — only the `done`-from-dispatch case
  escalates.
- **Hard-throw, not soft-fail.** Throwing causes the tool call to
  fail, which means the agent sees an error and (per the throw
  message) knows to write the final summary. A soft fail (just a
  warn) doesn't block the call, so the agent would just try again.
- **Trace event for postmortem.** The throw path writes a
  `scheduling.dispatch` event to the trace with phase, agent, and
  reason, so future debuggers can see exactly when the loop
  refused to extend past closeout.

The test is the one tricky piece. The outer describe's `beforeHook`
is bound to a different plugin instance, and aion_todo_update's
state is per-instance, so the test creates a fresh
`createPlugin(tmp2)` instance, calls `tool.execute.after` on it to
drive the phase transition, and then uses THAT instance's
`tool.execute.before` to verify the throw.

## Verification

- `npx tsc --noEmit` → 0 errors.
- `npm run test:unit` → 557 pass, 4 fail (was 3 fail before this
  commit; the 4th is the new "HARD-throws" test passing as a
  failure on the un-fixed code, now passing).
- Manual: reproduced the original bug by running the demo session
  to phase=done and observing the G1 soft warn on every subsequent
  `task()`. Re-ran with the fix; the second dispatch throws and the
  loop terminates.

## Pitfalls to Avoid

- The `if (!legal)` branch is shared between "wrong agent for this
  phase" (soft warn) and "phase=done" (hard throw). If you add
  more terminal phases in the future (e.g. a `cancelled` phase
  for hard-killed loops), extend the early-throw check rather than
  re-structuring the G1 logic.
- The throw message must stay explicit about what the agent should
  do next ("Write the final summary and end the turn."). A bare
  "phase=done is terminal" would just confuse the LLM into
  trying a different dispatch.
- This is a *behavior* change: a v0.7.1 main agent that
  habitually dispatched coder after c-critic approved stop now
  gets a hard error. If we ever discover a legitimate need to
  dispatch from done (e.g. an "audit summary" subagent that
  reviews the work post-closeout), the answer is a new phase
  (`done-audit`?) with non-empty `LEGAL_EDGES`, not weakening
  this throw.

## Follow-ups

- [ ] The same fix should apply to `LEGAL_EDGES[loop-back]` —
      c-critic rejected closeouts, but the loop is still allowed
      to dispatch `requirements-analyst` / `information-collector`.
      Need to verify the same edge case there.

## Related

- Commit: `a0d29f0`
- Session trace that surfaced the bug:
  `aion-plug/session-ses_1260.md` (user's demo dir) — the LLM
  printed
  `[aion] G1 scheduling violation: coder is not on a legal edge
  from phase=done. Legal: (none — terminal phase)`
  but kept dispatching anyway.
- Other commit entries: `commits/2026-06-18-2e3dd54-…`,
  `commits/2026-06-18-30ff2c4-…`
