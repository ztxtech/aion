# Stop-Go Protocol

## 1. Purpose

Define the shared meaning of the three control signals: continue, rebuttal, and allow stop. Here `allow-stop` does not mean "almost okay to stop". It means "complete-state is reached, so it can stop now".

The goal of this protocol is to separate human-readable phrases from system control meaning.

## 2. Applies To

- `ts-critic`
- `c-critic`
- Main agent
- Any flow that needs to send stop / continue / rollback control signals

## 3. Required Fields

- `signal`
- `reason`
- `scope`
- `next_required_action`
- `closure_checks`
- `remaining_action_count`
- `complete_state`
- `protocol_version`

## 4. Template

```yaml
signal: continue | rebuttal-required | allow-stop
reason: string
scope: current_step | current_loop | full_task
next_required_action: string
closure_checks:
  brainstorm: pass | fail
  deep_reasoning: pass | fail
  critic_loop: pass | fail
  ts_critic: pass | fail
  c_critic: pass | fail
  search_coverage: pass | fail
  todo_semantics: pass | fail
  report_evidence: pass | fail
  figure_analysis: pass | fail
  visual_test_loop: pass | fail
remaining_action_count: integer
complete_state: true | false
protocol_version: "0.2.0"
```

## 5. Validation Rules

- `signal` must stay inside the allowed enum.
- `allow-stop` must come with a clear `reason`, `scope`, full `closure_checks`, `remaining_action_count = 0`, and `complete_state = true`.
- When `allow-stop` is used, every field in `closure_checks` must be `pass`. If search coverage, TODO semantics, report evidence use, figure-following analysis, or visual test loop fails, stopping is not allowed.
- If unresolved blockers still exist, `allow-stop` is not allowed.
- If TODO / todo-map still contains meanings like `end`, `stop`, `wrap up`, or `delivery complete`, it must be treated as `todo_semantics = fail`.
- If the report body includes figures but there is no analysis right after them, it must be treated as `figure_analysis = fail`.
- If figures already exist but the loop `structured results -> make plots -> visual semantic analysis -> targeted retest -> self-critique -> review again` is not done, it must be treated as `visual_test_loop = fail`.
- If external search does not cover direct problem search, lower-level / decomposed search, related search, heuristic rewrites, and trend platforms, then `search_coverage = fail`.
- At final closeout, if `c-critic` and `ts-critic` conflict on `signal`, `closure_checks`, or approval, `c-critic` wins, and the flow must return to the main loop or follow the next action required by `c-critic`.
- The main agent must not emit a stop-go conclusion above the critics. Its job is to forward, persist, and execute critic governance conclusions, not to override them.
- Old phrases must map into this protocol instead of keeping two meaning systems in parallel.

## 6. Evolution Notes

- Old phrase mapping:
  - `absolutely cannot stop now` -> `continue`
  - `only allowed to enter the pre-stop gate, direct stop is not allowed` -> `rebuttal-required`
  - `stop allowed` -> `allow-stop`
- The current version makes `search coverage`, `anti-early-stop TODO semantics`, `analysis after figures`, and the `visual retest loop` required stop-go checks, and it makes the final governance order explicit as `c-critic > ts-critic > main agent > other subagents`. If new final gates are added later, put them into `closure_checks` first.
- If more fine-grained signals are added in the future, handle them through a version upgrade.
