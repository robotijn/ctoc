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
