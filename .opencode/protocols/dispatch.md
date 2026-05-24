# Dispatch Protocol

## 1. Purpose

Define the shared dispatch packet that the main agent must use when it assigns work to a subagent.

This protocol is part of the `agent harness`. Its goal is to turn `dispatch` from loose natural-language habit into a stable interface.

## 2. Applies To

- `agent.md`
- All subagents
- Any flow that hands work from one role to another

## 3. Required Fields

Every dispatch packet must include these fields:

- `task_id`
- `objective`
- `known_inputs`
- `context_mode`
- `context_artifacts`
- `explicit_focus`
- `required_reads`
- `write_scope`
- `constraints`
- `autonomy_contract`
- `output_contract`
- `blocking_context`
- `delegation_rationale`
- `protocol_version`

## 4. Template

```yaml
task_id: string
objective: string
known_inputs:
  - path_or_fact: string
context_mode: full_context | compacted_context | minimal_context | rebuttal_context
context_artifacts:
  primary_context: string
  supporting_artifacts:
    - string
  omitted_history:
    - string
  full_context_reason: string | null
explicit_focus:
  - string
required_reads:
  rules:
    - string
  protocols:
    - string
  memory:
    - string
  progress_artifacts:
    - string
write_scope:
  mode: read_only | scoped_write
  allowed_paths:
    - string
constraints:
  - string
autonomy_contract:
  reframe_allowed: true
  may_call_brainstorm: true
  self_critique_required: true
  may_recommend_self_continue: true
output_contract:
  protocol: reportback
  required_sections:
    - status
    - completed_work
    - remaining_gaps
    - self_critique
blocking_context:
  mode: normal | rebuttal
  unresolved_issues:
    - string
delegation_rationale:
  chosen_role_reason: string
  why_not_main_agent: string
  undelegated_remainder: string | null
protocol_version: "0.2.0"
```

## 5. Validation Rules

- Required fields cannot be missing.
- `context_mode` must be explicit. Final cold-start critique dispatch must use `minimal_context`.
- `context_artifacts` must be explicit. Do not use phrases like `see earlier context` or `read whatever you need`.
- When `context_mode = compacted_context`, `context_artifacts.primary_context` must point to `.opencode/memory/context-snapshot.md`.
- For non-`c-critic` subagents, round 2 and later should default to `compacted_context`. If a dispatch upgrades to `full_context`, `context_artifacts.full_context_reason` must be non-empty and explain why the current task cannot be completed from the snapshot plus supporting artifacts.
- `minimal_context` is reserved for `c-critic` / cold-start critique. Do not use it for normal implementation or analysis dispatch.
- `required_reads` must be listed clearly. Do not leave it as "read what you need".
- `write_scope` must say whether writing is allowed and which paths are allowed.
- `autonomy_contract` must clearly require: the agent may reframe the problem, may call `brain-storm` / `deep-reasoning` when needed, must self-critique before finish, and may suggest calling itself again.
- When `blocking_context.mode = rebuttal`, `unresolved_issues` must not be empty.
- `delegation_rationale` must not be empty; the main agent must say why the current role owns this slice, why the main agent is not doing it directly, and whether any remaining work is still expected to be delegated further.
- If `why_not_main_agent` says only that `the main agent could also do it` or another equivalent non-reason, the dispatch is invalid; the protocol requires a delegation reason, not a repeated ability claim.
- `output_contract.protocol` is fixed as `reportback` for now.

## 6. Evolution Notes

- If new fields are added later, they must stay backward compatible or the `protocol_version` must be upgraded together.
- Dispatch packet fields describe the interface only. They do not describe internal role implementation.
