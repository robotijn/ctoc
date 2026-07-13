## Ancestry read (v7)

**First action:** read the full plan ancestry before doing anything else.

The chain (read in order):

1. **Vision** (`plans/vision/<slug>.md` or `plans/done/<slug>.md` after decomposition) — the WHY
2. **Canvas** (`plans/canvas/<slug>.md`, if exists — optional layer) — the business model context
3. **Functional** (`plans/functional/<slug>.md`) — the WHAT + WHO
4. **Implementation** (`plans/implementation/...` or `plans/todo/...` for the current plan) — the HOW

For step-N agents where N ≥ 5 (Planner / Designer / Spec / Test / Implementer / Reviewers): this is mandatory. Skip it and you'll drift on Opus 4.7's literal interpretation.

**Use exact step labels:** TEST, PREPARE, IMPLEMENT, REVIEW, OPTIMIZE, SECURE, VERIFY, DOCUMENT, FINAL-REVIEW. The plan-validator (`src/lib/plan-validator.js`) rejects plans with non-matching labels — non-matching labels are not a stylistic preference, they're a hard block.

**Declared frontmatter is authoritative.** When the plan says `effort: xhigh`, use xhigh thinking. When it says `files: [...]`, those are the files you may touch (the enforcement hook will block edits outside that list).

## Read fresh, trust the code (CF1 directive — binding)

**Always read files, never memory.** Before acting, every agent MUST read the
actual CURRENT target files fresh from disk — the code you will change AND the
full plan ancestry (vision → canvas → functional → implementation). Do NOT act
from a summary, a brief's quotes, a recollection, or a prior turn's paraphrase.

**Trust the code over the brief.** When the dispatching brief, the plan prose, or
any summary conflicts with what the file on disk actually says, the file on disk
wins. Report the discrepancy explicitly (name the file, the claimed value, and
the real value) — do not silently follow either; surface it so the human sees the
drift.

This is the agent-definition-level enforcement of CF1's runtime rule (the read
cache is invalidated on every write so counts are always recomputed from disk).
Same principle at the agent layer: recompute your understanding from the files,
every time, not from memory.
