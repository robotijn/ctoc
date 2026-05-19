---
description: Run the CTOC Iron Loop self-check — verify architectural + Iron Loop + plan + system invariants.
---

Run the CTOC self-check and present the report:

```bash
node "${CLAUDE_PLUGIN_ROOT:-.}/src/scripts/run-self-check.js" --thorough
```

This runs every invariant check in `src/lib/iron-loop-enforcer.js`:

- **Architectural** — CTO Chief is sole top-level, synthesizer exists, Tier 1 agents report to cto-chief, Tier 2 skills have `max_subagents: 0`, Tier 3 scouts declare `model: haiku`.
- **Iron Loop** — active plans have canonical step labels, gate destinations have `approved_by: human` markers, no stale plans (in-progress > 7 days).
- **System** — required hooks exist, hooks.json registers them, VERSION sync across plugin JSONs.
- **Persona system** — persona library, question catalog, classifier agent, routing doc all exist.
- **SaaS templates** — index + b2c-subscription template are well-formed.

Exit code:
- 0 = no critical or blocking issues
- 1 = critical or blocking findings (CI should fail)

After running, summarize the critical and block-severity items in 1-3 sentences. Note any warn-severity drift the user might want to address.
