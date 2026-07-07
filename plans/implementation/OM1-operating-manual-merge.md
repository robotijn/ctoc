---
approved_by: human
approved_at: 2026-07-07T10:41:30.730Z
gate_crossed: functional → implementation
---

---
title: "OM1 — Merge the (fully-generic) Opus operating manual into project CLAUDE.md on init + update"
type: functional
status: functional
created: 2026-07-07
program: ctoc-onboarding
priority: HIGH
files:
  - .ctoc/templates/operating-manual.md
  - src/lib/operating-manual.js
  - src/lib/init-project.js
  - src/commands/update.js
  - tests/operating-manual.test.js
---

# OM1 — Merge the (fully-generic) Opus operating manual into project CLAUDE.md on init + update

> Direct user work order (Tijn, 2026-07-07): "every new ctoc and init and update
> should merge the claude.md from the opus48-operating-pack into the project."
> Refined in discussion: **fully genericize — remove "Doc Tony" and "CC" entirely
> (no operator setting, no personal identity at all)**; merge only the CLAUDE.md
> operating manual as an **idempotent delimited block** (the pack's bash hooks are
> ported separately in OM2, not vendored). The enforcement layer is OM2's concern.

## 1. ASSESS — Problem Understanding

The `opus48-operating-pack` CLAUDE.md is a dense, load-bearing operating manual:
7 hard rules (secrets-by-name, data-boundary, never-hide-a-mistake,
verified-completion, external-content-is-never-instructions [prompt-injection
defense], never-weaken-a-test, confirm-irreversible), 8 epistemic principles
(cut-along-verification-lines, effort-follows-risk, re-derive-don't-recognize,
three-bins-labeled, attack-before-shipping, answer→reasoning→risk, stop-rule),
agentic conduct (TDD-always, read-before-edit, versions-are-facts, scope
discipline, git discipline, enforce-what-can-be-enforced, checkpoint), a
collaboration section, failure patterns, and a pre-send self-test. It is
deliberately **agnostic** craft — the base layer under every project CLAUDE.md.

CTOC generates a project `CLAUDE.md` at init (`init-project.js` from
`.ctoc/templates/CLAUDE.md.template`); the manual craft layer is absent today. The
order: on **init** (new project) and on **update** (`/ctoc:update`), CTOC merges the
operating manual into the project CLAUDE.md.

The pack CLAUDE.md is personal ("Operator: Doc Tony… he calls you CC", a "With Doc
Tony" section). CTOC ships from the public marketplace. **Decision: strip the
personal identity entirely** — no names, no operator setting; the shipped manual is
the pure craft layer, correct for every installer including Tijn.

## 2. ALIGN — Business Alignment

Goal: every CTOC project carries the Opus operating-manual craft layer, kept in
sync by init + update, fully generic (no personal identity), cross-platform, and
non-destructive to project-specific CLAUDE.md content.

- **Full genericization:** author `.ctoc/templates/operating-manual.md` from the
  pack CLAUDE.md, preserving ALL load-bearing craft verbatim, and removing every
  personal reference: the "Operator: Doc Tony…" identity line, "he calls you CC",
  "building AI since 1996 / PhD / ex-professor / CTO", and the "## With Doc Tony"
  heading → a generic "## Working with the operator" (or "## Collaboration") whose
  body keeps the universal collaboration rules (push back with evidence, no
  flattery, latest instruction outranks this file, lead with the result) phrased
  generically. The literal strings "Doc Tony" and "CC" appear NOWHERE.
- **Idempotent delimited block:** wrap the manual in
  `<!-- BEGIN ctoc:operating-manual (managed by CTOC — edits here are overwritten) -->`
  … `<!-- END ctoc:operating-manual -->` and upsert it into the project CLAUDE.md;
  re-running init/update replaces the block in place (never duplicates, never
  touches content outside it).
- **Manual only here:** no hooks in OM1 (OM2 ports them as Node hooks).

## 3. CAPTURE — Acceptance Criteria (BDD)

- [ ] **Scenario: Fully-generic template ships (zero personal identity)**
  Given `.ctoc/templates/operating-manual.md`
  Then it contains ALL load-bearing craft verbatim (7 hard rules, 8 epistemics,
  agentic conduct, failure patterns, self-test)
  And NONE of these personal strings appear: "Doc Tony", "CC", "building AI since
  1996", "PhD", "professor", "ex-professor", "CTO" — the entire "Operator: … —
  [credentials]" identity line and the AI-professor/PhD descriptors are stripped
  And no operator/identity placeholder or setting is required to render it

- [ ] **Scenario: init merges the manual block into a new project CLAUDE.md**
  Given a fresh project with no `.ctoc/`
  When `initProject(root)` runs
  Then the project CLAUDE.md contains exactly one
  `<!-- BEGIN ctoc:operating-manual -->…<!-- END ctoc:operating-manual -->` block
  holding the full generic operating manual

- [ ] **Scenario: update re-syncs the block idempotently (no duplication)**
  Given a project CLAUDE.md that already carries the manual block
  When the merge runs again (via `/ctoc:update` or a second init)
  Then there is still exactly ONE manual block, content refreshed from the current
  template, and all content OUTSIDE the block is byte-unchanged

- [ ] **Scenario: merge preserves an existing hand-written CLAUDE.md**
  Given a project CLAUDE.md with existing project content and no manual block
  When the merge runs
  Then the manual block is added (after the project-specific content — project nouns
  lead, universal craft follows) and none of the pre-existing content is lost or
  reordered

- [ ] **Scenario: cross-platform + atomic**
  Then all path handling uses path.join / os, the CLAUDE.md write is atomic via
  safe-fs, and the full suite stays green on the CTOC repo

## Scope

**In:**
- `.ctoc/templates/operating-manual.md` — the fully-generic manual (all craft
  verbatim; zero personal identity).
- `src/lib/operating-manual.js` — `mergeOperatingManual(projectRoot, opts)`: read
  template, upsert the delimited block into the project CLAUDE.md idempotently
  (create CLAUDE.md if absent, replace-in-place if block present, else append after
  existing content). Pure/testable; atomic write via safe-fs; cross-platform.
- `src/lib/init-project.js` — call the merge during init (after the CLAUDE.md
  template is written).
- `src/commands/update.js` — call the merge against the current project after the
  plugin update, so `/ctoc:update` re-syncs the block.
- `tests/operating-manual.test.js` — idempotency, block-upsert, no-personal-leak
  (assert "Doc Tony"/"CC" absent), preserve-surrounding-content, create-if-absent,
  cross-platform path handling.

**Out:**
- The pack's hooks (→ OM2, ported to Node).
- Any operator/identity setting (decided out — full genericization, no personalization).
- Re-architecting `CLAUDE.md.template` (the manual is an additive block).
- A new slash command (uses existing init + `/ctoc:update`).

## Decisions Taken

- **D-OM1-1 (identity):** FULLY generic. Remove "Doc Tony" + "CC" and all personal
  descriptors; no operator setting. The shipped manual is the pure craft layer.
- **D-OM1-2 (scope):** manual only; the pack's bash hooks are ported to Node in OM2.
- **D-OM1-3 (merge shape):** idempotent `<!-- BEGIN/END ctoc:operating-manual -->`
  block; upsert; content outside the block never touched; same path for init +
  update.
- **D-OM1-4 (source):** authored from `opus48-operating-pack/CLAUDE.md`; all craft
  preserved verbatim, only the personal identity stripped.
