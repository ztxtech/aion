---
name: context-init
description: Manual start skill: read `.opencode/` first, then read the task files at the project root and start execution. It is like replacing the first prompt line.
---

## When To Use

- Call it manually when you enter the project context for the first time.
- No agent has started yet, and you want one command to finish `read .opencode and then start the root task`.

## Goal

- Align with the `.opencode/` logic first, then immediately read and execute the task files in the project root.
- Use it instead of manually typing the first prompt line: `read .opencode, then finish the task from files in the project root`.
- This is a default **human-free** start entry: after context is built, the flow must go into task execution automatically, instead of waiting for a second user prompt to push the main flow.

## Flow

1. **Read `.opencode/readme.md` FIRST** as the cached structure index. It contains conditional read rules — only pull in files that the current task requires. Do NOT read every file blindly.
2. Read `.opencode/rules/core.md` and `.opencode/agents/agent.md` (always required).
3. Follow the conditional read rules in `readme.md` to load only the relevant rules, protocols, skills, and evals for the current task type.
4. Read `.opencode/memory/` / `.opencode/trace.md` (if they exist) to align memory and trace constraints.
4. Read task and note files in the project root, such as `README.md`, `task.md`, and task attachment notes.
5. From that context, judge at once whether the task is light execution, complex multi-stage work, experiment / comparison, formal report work, or mixed mode, and give the first batch of **non-summary actions** that must move forward.
6. After context is built, go directly into task execution. Do not stop at summary, plan restatement, directory intro, writing-prep talk, or `I understand the task now`.
7. If the task is clearly multi-stage, formal delivery, or experiment / comparison / analysis / report work, then after init it must continue into the main chain `brain-storm -> deep-reasoning -> plan -> TODO`, instead of treating context-init like a one-time summary.
8. If the task needs recent methods, research ideas, or external evidence, then after init the search agenda should grow into five axes by default: direct problem search, lower-level / decomposed search, related search, heuristic-rewrite search, and trend-platform search. Do not search only once with the user's original sentence.
9. If execution later creates new protocols, lists, or middle contracts, such as benchmark rules, report prep drafts, figure lists, post-experiment analysis lists, or TODO mapping tables, treat them as part of the current runtime hard constraints by default. They must not be downgraded into `optional enhancements` unless `ts-critic` gives clear evidence that they are out of scope, impossible, or should be downgraded.
10. As soon as TODO / todo-map is created, check at once that it does not contain meanings like `end`, `stop`, `wrap up`, or `delivery complete`. The last item may only be a loop-back, a review, or a next-round entry.
11. As long as execution already produced charts, page screenshots, or visual results, treat them as part of the main test/report chain by default: figures in report body must be followed by analysis, and the experiment chain must also finish the loop `structured results -> make plots -> visual semantic analysis -> targeted retest -> self-critique -> ts-critic review again`.
12. Before stopping, check again: the task files in the project root, the root notes, the protocols / lists created during the run, current outputs, and references in the main text, and confirm that no key validation, key comparison, key figures, statistical / diagnostic analysis, failure-case analysis, figure-following analysis, visual retest loop, or key deliverable is still missing.

## Valid Exit

- `verified delivery`: key work was really executed, key conclusions have evidence, key deliverables really exist, and `ts-critic` / the pre-stop gate found no must-do next action.
- `evidence-based blocker`: the task is truly blocked by missing data, environment limits, external dependencies, user-only information, or another hard blocker, and the tried paths, failure evidence, impact scope, and next suggestion are all written clearly.
- The following states are not valid reasons to stop:
  - only a context summary is done
  - only a plan or TODO is written
  - the last TODO item was secretly changed into `end / wrap up / delivery complete`
  - only a report outline or first draft exists
  - figures were inserted into Markdown but still have no analysis after them
  - figures exist, but the visual-semantic retest loop is still incomplete
  - some stage conclusion exists, but key validation or key deliverables are still missing
