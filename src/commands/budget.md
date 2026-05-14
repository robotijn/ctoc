---
description: Show the autonomous build budget for the current session — wall-clock, dispatches, Iron Loop iterations vs configured limits.
model: claude-haiku-4-5
---

Show the CTOC autonomous build budget status:

```bash
node "${CLAUDE_PLUGIN_ROOT:-.}/src/scripts/budget-status.js"
```

This reads `.ctoc/config/budget.yaml` (limits) and `.ctoc/budget-usage/<session>.yaml` (current usage) and shows:

- **Elapsed** — wall-clock hours since the session began
- **Dispatches** — total Tier 1/2/3 dispatches issued by CTO Chief
- **Iron Loop steps** — total transitions through Iron Loop Steps 1–16
- **Status** — within limits / checkpoint / OVER BUDGET

Why this matters: the CTOC pipeline can drain overnight. Session-level limits (max hours, max dispatches, max Iron Loop iterations) are the only budgets actually enforced — per-agent token/tool-call budgets used to live in skill frontmatter but were noise and were dropped in v6.9.3.

If the budget is exceeded and `halt_action: ask_user`, the next dispatch will throw `BUDGET_EXCEEDED` and surface back to you to decide: extend, halt, or accept.

To reset the current session counter:
```bash
node "${CLAUDE_PLUGIN_ROOT:-.}/src/scripts/budget-status.js" --reset
```
