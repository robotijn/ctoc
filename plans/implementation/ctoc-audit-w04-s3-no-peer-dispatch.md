---
title: "W04 · s3 — remove the Tier-1→Tier-1 peer-dispatch instruction from implementation-planner"
type: feature
parent_plan: "ctoc-audit-w04-agents-resolve"
depends_on: none
priority: HIGH
files:
  - agents/planning/implementation-planner.md
  - tests/tier1-no-peer-dispatch.test.js
---

# W04 · s3 — No Tier-1→Tier-1 peer dispatch

Strategy-independent MVP story (ships regardless of Option A/B). `implementation-planner`
(a Tier-1 sub-orchestrator) currently instructs a **direct peer dispatch** of
`stack-chooser` (also Tier-1), bypassing `cto-chief` and violating the single-dispatcher
invariant. This slice reworks that one instruction so `stack-chooser` is reached only
through `cto-chief`, and adds a text-invariant test guarding all Tier-1 agent files.

`depends_on: none` — the fix (`implementation-planner.md`) and its test are independent
of the registry/step-table slices, and this slice owns its own test file rather than
extending the resolution test: peer-dispatch is a **text invariant**, not an
agent-resolution assertion, so keeping it in a separate file keeps this slice
decoupled (documented decision under ambiguity — the parent's "single test" is one
ideal; splitting resolution vs. text-invariant is the cleaner cohesion here).

## Implementation Details

### The one offender (verified — it is the ONLY Tier-1 peer-dispatch instruction)

`agents/planning/implementation-planner.md:23`, inside "## Step 0: Template selection":

```
2. **Dispatch stack-chooser** (`agents/planning/stack-chooser.md`):
   - The stack-chooser selects the appropriate template defaults and writes a `tech_stack:` block into the implementation plan's frontmatter.
```

A repo-wide scan of every Tier-1 file (`agents/planning/*`, `agents/iron-loop/*`,
`agents/pipeline/*`, `agents/coordinator/synthesizer.md`) confirms this is the **only**
imperative "Dispatch `<agent>`" directive. Every other "dispatch" mention is compliant:
"start small (1-3 dispatches)" (generic), "recommend dispatches; CTO Chief executes"
(explicitly deferred), "does not itself dispatch" (negation), `dispatch_id:` audit
fields, or "dispatched OUTSIDE the CTO Chief chain by the founder" (Product-Loop notes).

### The fix — reach stack-chooser through cto-chief

Rewrite item 2 so it describes CTO Chief performing the dispatch and the planner
*consuming* the result. `stack-chooser` remains reachable, the behavior is unchanged,
but the direct peer dispatch is gone:

```
2. **Obtain the stack-chooser template defaults (via CTO Chief):**
   - As a Tier-1 sub-orchestrator you do NOT dispatch a peer directly. Recommend that
     CTO Chief dispatch `stack-chooser` (`agents/planning/stack-chooser.md`); CTO Chief
     runs it, and it writes a `tech_stack:` block into the implementation plan's
     frontmatter. Consume that block as the template basis.
```

Keep the surrounding items (1, 3, 4, 5) of Step 0 unchanged.

### Test: `tests/tier1-no-peer-dispatch.test.js` (CREATE)

Framework `node:test`. Walk every Tier-1 agent file (frontmatter `tier: 1`, read with
the tolerant match-anywhere parser so W03's heading-first defect does not couple in;
also include the known Tier-1 dirs `agents/planning`, `agents/iron-loop`,
`agents/pipeline`, and `agents/coordinator/synthesizer.md`). For each file:

1. **No imperative peer-dispatch directive.** Assert the body does NOT match the
   violating pattern — a directive line that tells the agent to itself dispatch a named
   sibling. Use a **case-sensitive** pattern so it fires on imperative "Dispatch <name>"
   but not on compliant lowercase mentions:
   ```js
   const VIOLATION = /(?:^|\n)\s*(?:[-*]|\d+\.)?\s*\*{0,2}Dispatch\s+`?[a-z][a-z0-9-]*`?/;
   ```
   This matches `2. **Dispatch stack-chooser**` (pre-fix) and does NOT match
   "does not itself dispatch", "1-3 dispatches", or "recommend dispatches; CTO Chief
   executes".
2. **Positive routing assertion (implementation-planner only).** Assert its Step 0
   body still references `stack-chooser` AND references `CTO Chief`/`cto-chief` in the
   same item — i.e., the capability is preserved, just routed correctly.
3. **Red-before-fix proof (self-contained).** `const PRE_FIX = '2. **Dispatch stack-chooser** (\`agents/planning/stack-chooser.md\`):'`; assert `VIOLATION.test(PRE_FIX)` is `true` — proving the scan detects the defect it is meant to catch.

## Execution Plan

### Step 8 — TEST
Create `tests/tier1-no-peer-dispatch.test.js` with the Tier-1 walk + the three cases.
Run against the **current tree**: confirm case 1 is **RED** for
`agents/planning/implementation-planner.md` (and green for all other Tier-1 files),
and case 3 passes (detector works). Capture the red output.

### Step 9 — PREPARE
Re-run the Tier-1 scan (`grep`) to reconfirm `implementation-planner.md:23` is the sole
offender before editing; if any other Tier-1 file has since gained a peer-dispatch
directive, it is in scope for this slice (parent AC: "or any other Tier-1 agent file")
— fix it the same way and note it.

### Step 10 — IMPLEMENT
Replace item 2 of "## Step 0: Template selection" in
`agents/planning/implementation-planner.md` with the via-CTO-Chief phrasing above.
Single edit; no other change.

### Step 11 — REVIEW
Confirm Step 0 still selects a template and consumes `tech_stack:`, the peer-dispatch
imperative is gone, and the single-dispatcher invariant is now stated explicitly.

### Step 12 — OPTIMIZE
None (single documentation edit).

### Step 13 — SECURE
No executable surface. Confirm the test reads files read-only and uses no shell input.

### Step 14 — VERIFY
`node --test tests/tier1-no-peer-dispatch.test.js` → green (0 offenders across all
Tier-1 files). `node --test tests/*.test.js` → `# fail 0`, 0 skipped. Confirm
`tests/architecture-invariants.test.js` still green.

### Step 15 — DOCUMENT
The edited agent instruction IS the documentation; record in Decisions that
`stack-chooser` is now reached only through CTO Chief.

### Step 16 — FINAL-REVIEW
Verify parent AC "No Tier-1→Tier-1 peer dispatch remains": the scan finds none and
`stack-chooser` is reachable only through `cto-chief`. Hand to CTO Chief.
**Do not cross Gate 2.**
