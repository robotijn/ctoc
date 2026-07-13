---
title: "W06-s4 — Every registry path and step-table agent resolves"
type: feature
parent_plan: "ctoc-audit-w06-truthful-tests"
depends_on: none
files:
  - tests/registry-integrity.test.js
priority: HIGH
---

# W06-s4 — Every registry path and step-table agent resolves

**Story:** S5 `[MVP]` — findings **C8**, M24.
**Pairing:** SIBLING-PAIRED with **W04 (Every dispatched agent resolves)**. This slice
adds the invariant that goes RED on today's dangling pointers; W04's production fix
(create the 10 missing step agents / repoint the table + regenerate the registry from
disk) turns it GREEN. W06 creates **no agent files** and edits **no registry** — it only
witnesses.

## Implementation Details

### Architecture Decision

Nothing in the suite asserts that a dispatch pointer resolves to a real file. Two pointer
classes dangle today:

1. **`operations-registry.yaml` `path:` entries** — 20 of 27 point at nonexistent files.
2. **`CLAUDE.md` Iron Loop step-table agents** — 10 of the 14 named agents resolve to no
   dispatchable `agents/**/<name>.md`.

A new `tests/registry-integrity.test.js` reads both sources and asserts every pointer
resolves, naming each dangling one. It parses the registry with a **minimal line scan**
for `path:\s*(\S+)` (no YAML dependency added — the file is line-oriented and the invariant
only needs the path values) and parses the step table by extracting the third column of
each `| N | LABEL | agent(s) … |` row, then resolving each bare agent name to
`agents/**/<name>.md` via a recursive walk.

### RED-now evidence (verified 2026-07-13)

**20 dangling `path:` entries:**
`agents/planning/functional-reviewer.md`, `agents/planning/implementation-plan-reviewer.md`,
`agents/planning/iron-loop-integrator.md`, `agents/implementation/test-maker.md`,
`agents/implementation/quality-checker.md`, `agents/implementation/implementer.md`,
`agents/implementation/self-reviewer.md`, `agents/implementation/optimizer.md`,
`agents/implementation/security-scanner.md`, `agents/implementation/verifier.md`,
`agents/implementation/documenter.md`, `agents/implementation/implementation-reviewer.md`,
`agents/writing/document-planner.md`, `agents/writing/pdf-writer.md`,
`agents/writing/docx-writer.md`, `agents/writing/pptx-writer.md`,
`agents/writing/document-reader.md`, `agents/admin/dashboard.md`,
`agents/admin/learning-applier.md`, `agents/admin/learning-suggester.md`.

**10 unresolved step-table agents:** `functional-reviewer`, `implementation-plan-reviewer`,
`test-maker`, `quality-checker`, `implementer`, `self-reviewer`, `optimizer`, `verifier`,
`documenter`, `implementation-reviewer`. (`vision-advisor`, `product-owner`,
`implementation-planner`, `security-scanner` resolve — note `security-scanner` resolves
under `agents/security/`, so name resolution must walk the whole `agents/` tree, not a
fixed subdir.)

### Dependency Graph

```
tests/registry-integrity.test.js
  --reads--> .ctoc/operations-registry.yaml (path: values)
  --reads--> CLAUDE.md (step-table agent column)
  --resolves-against--> agents/**/*.md (recursive existence)
```

Self-contained; no shared helper (the parse logic is short and single-purpose — see the
parent index's decision to scope helpers per concern rather than build one generic
harness). Independent of s1–s3, s5–s7.

### File Specification

#### `tests/registry-integrity.test.js` (CREATE — the invariant)
- `registryPaths()` — read `.ctoc/operations-registry.yaml`, return every `path:\s*(\S+)`
  capture (relative to project root).
- `stepTableAgents()` — read `CLAUDE.md`, match rows `^\|\s*\d+\s*\|`, take column 3, strip
  parenthetical model hints (`(sonnet)`, `(opus)`) and prose glue (`then`, `+`, `,`), and
  return the set of bare agent slugs referenced.
- `resolveAgent(name)` — recursive walk of `agents/` (excluding `_shared/`), true iff
  `agents/**/<name>.md` exists.
- `existsFromRoot(rel)` — `fs.existsSync(path.join(projectRoot, rel))`.
- Assertions (each names the offender):
  1. `it('every operations-registry path: resolves')` — for each `registryPaths()`,
     assert `existsFromRoot(p)`, failure message = the exact dangling `path:` value.
  2. `it('every CLAUDE.md step-table agent resolves to a dispatchable file')` — for each
     `stepTableAgents()`, assert `resolveAgent(name)`, failure message = **both** the step
     number and the unresolved agent name.
- Hard `require('node:test')`/`require('node:assert')`; no module-under-test require (this
  test reads data files, not a lib module) so there is no skip-guard surface.

### Test Plan
The invariant test **is** the deliverable. RED-now: `node --test
tests/registry-integrity.test.js` on today's tree → FAILS, listing the 20 dangling paths
and the 10 unresolved step agents. GREEN-after: once **W04** lands (agents created or
table/registry repointed), the same run passes with no sibling regressing.

### Security Review
- [x] Path traversal: registry `path:` values are resolved via `path.join(projectRoot, p)`
  and only **existence-checked**, never executed or read as code.
- [x] Read-only; no writes; no network; no `execSync`.
- [x] Failure messages contain repo-relative paths and step numbers only.

## Execution Plan

### Step 8: TEST
Write `tests/registry-integrity.test.js` as specified. Run on today's tree and **capture
the RED output** enumerating the 20 dangling registry paths + 10 unresolved step agents.
This RED is the acceptance evidence for S5. Log explicitly: "GREEN pairing is W04."

### Step 9: PREPARE
Confirm the parse targets exist and are shaped as assumed: `.ctoc/operations-registry.yaml`
uses `path:` lines; `CLAUDE.md` step table rows are `| N | LABEL | agents… |`; agent files
live under `agents/**` (with `security-scanner` under `agents/security/`, proving the walk
must be tree-wide).

### Step 10: IMPLEMENT
One step, one file:
- [ ] `tests/registry-integrity.test.js` — `registryPaths()`, `stepTableAgents()`,
  `resolveAgent()`, `existsFromRoot()`, and the two `it(...)` assertions.

### Step 11: REVIEW
Verify the step-table parser strips model hints and prose so it does not falsely treat
`(sonnet)` or `then`/`+` as agent names (which would produce false dangling reports).
Verify `resolveAgent` walks the whole `agents/` tree (catches `security-scanner`).

### Step 12: OPTIMIZE
Walk `agents/` once into a `Set` of slugs; resolve each step agent against the set (no
re-walk per name). Single read of each data file.

### Step 13: SECURE
Confirm registry paths are only existence-checked — never `require`d or `exec`d — so a
malicious registry entry cannot cause code execution from the test.

### Step 14: VERIFY
Today's tree: RED with the exact 20 + 10 offenders named (expected; paired fix pending
W04). Confirm no false positives from parenthetical model hints. No other test regresses.
Record the RED output as the paired-fix witness.

### Step 15: DOCUMENT
Header comment naming findings C8/M24 and the W04 pairing. Inline note that name
resolution is tree-wide by design.

### Step 16: FINAL-REVIEW
Confirm: both pointer classes asserted; RED captured with offenders named (path values;
step-number + agent name); parser robust to model hints; W04 pairing documented. Ready
for the batched Gate 2.

## Decisions Taken Under Ambiguity
- **Minimal line-scan parse of the registry, no YAML dependency.** The invariant needs
  only the `path:` values; adding a YAML parser would introduce a dependency the parent's
  zero-new-dep posture avoids. If the registry format ever nests paths in a way a line
  scan misses, that is caught as a *missing* assertion at review, not a silent pass.
- **Step-table agents resolved tree-wide under `agents/`.** `security-scanner` lives in
  `agents/security/`, so a fixed-subdir lookup would false-flag it; the walk is repo-wide.
- **Installer-written paths are NOT covered here** — they are their own slice (s7, paired
  W11) to keep the W04 and W11 paired-fix witnesses cleanly separated.
