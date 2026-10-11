# AGENTS

This project uses the AION harness defined in `.opencode/`.

Read the kernel ONCE in this exact order before doing anything else:

1. `.opencode/readme.md` — structure index and skill-loading rules
2. `.opencode/rules/core.md` — governance, task levels, hard rules
3. `.opencode/agents/agent.md` — main agent system prompt

Then classify the task level (L0–L3) and go directly into execution. Load skills on demand via the native `skill` tool. Do not read `data/*.csv` files in full, and do not bulk-load protocols or multiple skills at startup.
