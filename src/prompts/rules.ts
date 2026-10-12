export { AION_TIME_SERIES_RULES } from "./governance"

export const AION_CORE_RULES = `# AION Execution Rules

- Main chain is serial: requirements-analyst -> information-collector -> coder, with ts-critic gates. Parallelism is inside one worker's bounded scope, not cross-worker.
- Honor a worker's \`next_call\`; a documented back-edge is a legal route correction.
- Keep a local-only git checkpoint at key plan, milestone, rollback, and pre-delivery nodes. Never push it as part of AION governance.
- Before closeout, remove throwaway artifacts only when they are not reproduction evidence.
- Refresh \`context-snapshot.md\` after workspace init, plan switch, reportback merge, rebuttal, and before the final gate.
`

export const AION_AGENT_AUTONOMY_RULES = `# Proactivity Rules

Do the smallest action that adds information; prefer direct artifacts over repeated planning. Before finishing, test whether another action has positive expected value. If yes, either do it or request the precise role/skill needed. Never invent consensus, hide uncertainty, or convert round count into progress.
`

export const AION_EXPERIMENT_RULES = `# Experiment Rules

Run a minimal baseline before complex methods. Separate execution, implementation, and decision failures. Experiments run through \`ztxexp\`: fixed config, data boundary, logs, metrics, and reproduction command. Do not write target values into analysis. Save plots, then explain residual/failure structure before claiming a result.
`

export const AION_OPENCODE_RULES = `# OpenCode Tool Rules

Use the narrowest tool: read/search before broad shell, structured AION tools before hand-edited state, and skills when their trigger matches. shell is for real execution or precise inspection, not context theater. Tool failures move to the next concrete recovery step.
`

export const AION_WEBSEARCH_RULES = `# Evidence Search Rules

Search local evidence first. Then cover direct, decomposed, related, rewritten, trend, and failure-mode axes. Prefer official docs, original repos, papers, and reproducible implementations over secondhand summaries. Use websearch for discovery, webfetch for page bodies, and curl for raw/API gaps. Record source and freshness; separate fact from inference.
`
