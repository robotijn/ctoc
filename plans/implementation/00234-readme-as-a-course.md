---
title: "The README teaches CTOC as a course — every step a human takes, with real screens"
type: implementation
iron_loop: true
priority: medium
effort: low
files:
  - README.md
  - tests/readme-numbers.test.js
  - .ctoc/drafts/README.course.md
---

# The README teaches CTOC as a course — every step a human takes, with real screens

## Problem statement

The shipped `README.md` is a feature inventory, not a way in. A new human reads
896 lines about tiers, fences and templates and still cannot answer the only
questions that matter on day one: *what do I type, what will I see, what is mine
to decide, and what do I do when it says no?* Its one worked example is a mocked
session with invented screens (`GATE 1: [1] Approve plan`) that the product no
longer shows, its Environments table says production auto-pushes (the code keeps
the push human in every profile — `src/lib/settings.js` `ENVIRONMENT_PROFILES`,
`src/commands/push.md`), and several counts are stale against disk (104 modules
in `src/lib/` where 134 exist, 426 skill files where 429 exist, an agent table
that sums to fewer than the 124 it claims and omits the safety, realtime and
legal categories).

## What ships

`README.md` is replaced by the course draft already written and verified at
`.ctoc/drafts/README.course.md` (1,178 lines). Its structure follows the
course-design evidence (backward design → worked examples → faded guidance →
retrieval checks → Diátaxis separation of tutorial / how-to / reference):

- **Part 1 — nine lessons in the order a human meets them**: install · open and
  answer the three first-run questions · read the dashboard · from an idea to
  plans · answer the questions (the streaming gate screen) · let it build · call
  it done and ship · when CTO Chief says no · keep it healthy. Each lesson states
  its outcome, shows a **real capture** from the current version (first-run
  screen from a fresh project, dashboard, gate question, validation, task board,
  blocked-edit message), says how you know it worked, and ends with a
  three-question retrieval check.
- **Part 2 — recipes**: ten task-shaped how-tos.
- **Part 3 — reference**: every section the guard tests require (`## Commands`,
  `## The Iron Loop`, `## The 3-Tier Agent Architecture`, `## The Refinement
  Loop`, `## The Canvas — 6-Month Pre-Mortem + 5-Scenario Cash Flow`, `## The
  Product Loop`, `## SaaS Production-Readiness Templates`, `## Agents`,
  `## Skills`) plus environments, enforcement, quality gates, deployment,
  compliance, plan-index, comparison, troubleshooting, developer notes, license.

Every number in the draft was measured on disk this session (`computeDocCounts`:
124 agents / 24 categories / 429 skill files / 134 lib modules / 524 test files /
17 hooks / 3 slash commands; per-category agent counts sum to 124; every
relative link resolves). The four phantom `ctoc <word>` references the README
carried are gone (the phantom-command fence's debt shrinks 6 → 2).

## Decisions Taken Under Ambiguity

1. **Tier counts stay as `docs/AGENT_ARCHITECTURE.md` states them (20 Tier-1,
   99 Tier-2).** Agent frontmatter says 23 files carry `tier: 1` and 100 carry
   `tier: 2`, and `.ctoc/architecture/tier-definitions.yaml` says 16 / 99. Three
   sources disagree; a README is not where that gets resolved. The draft cites the
   architecture document's numbers (which the guard test also pins) and the
   discrepancy is reported to the human as a separate finding, not silently
   picked.
2. **Gate numbers appear only in the reference part.** Lessons speak in the
   moment ("is this what to build?"); the Iron Loop reference maps those moments
   to Gate 0–3 once, because the linked docs and the code use the numbers.
3. **The first-run screen is quoted verbatim, including its stale line** ("prod =
   strict, auto-push after gates"), followed by one sentence stating what the code
   does. Editing a capture would make it not a capture; the product text itself is
   reported as a finding for its own plan.
4. **Test pins move from literals to disk-derived values where a derivation
   exists.** `tests/readme-numbers.test.js` asserts `104 JS modules` while
   `src/lib/` holds 134 — it pins a falsehood. The change tightens it: agents,
   skills, lib-module and test-file pins derive from `computeDocCounts(ROOT)`
   (the same source its own section 1 already trusts); the two sub-taxonomy
   literals become `101` (= SKILL.md count on disk) and `328` (= skill files minus
   SKILL.md bodies), each asserted against a walk of `skills/`. Justification per
   Operating Lesson 14: the contract comes from outside the test (the files on
   disk), the code (README) was wrong AND the test was wrong, and the new
   assertions are strictly tighter.

## Technical Approach

Two files change, in one unit. `README.md` is replaced wholesale by the verified
draft (no incremental edits — the old structure is what is being retired), and
`tests/readme-numbers.test.js` stops pinning literals that disk already contradicts
and derives them from `computeDocCounts` instead. Test first (the derived pins go
RED against the old README), then the copy (GREEN), then the full gate.

## File specs

### 1. `README.md` — REPLACE

Copy `.ctoc/drafts/README.course.md` over `README.md` byte-for-byte, then delete
the draft. The draft already carries every string the guard tests pin (badges,
lead paragraph, section headings, the R2-D truth sentences, the version line
`**6.14.36**` at a line start and `getVersion()       // → '6.14.36'` for
`release.js`).

### 2. `tests/readme-numbers.test.js` — MODIFY (pins only)

Section 2 (`README — explicit numeric claims match reality`):

| Assertion | Before | After |
|---|---|---|
| badge: skills | `/skills-426-blue/` | `` new RegExp(`skills-${counts.skills}-blue`) `` |
| Key Features: skill files | `/\*\*426 skill files\*\*/` | `` new RegExp(`\\*\\*${counts.skills} skill files\\*\\*`) `` |
| Project structure: JS modules | `/104 JS modules/` | `` new RegExp(`${counts.libModules} JS modules`) `` |
| Project structure: skill files | `/426 skill files/` | `` new RegExp(`${counts.skills} skill files`) `` |
| Skills intro | `/\*\*426 skill files\*\*/` | same derived form as Key Features |
| two kinds | `(100)` / `(326)` | `(${skillBodies})` / `(${counts.skills - skillBodies})` where `skillBodies = countSpecialistSkillBodies()` |

`counts = computeDocCounts(ROOT)` is already imported at the top of the file.
Rename the `it` titles that still say "(v6.10.3+)" to say "(derived from disk)".
No assertion is deleted; no regex is loosened; the agents-124 / 24-categories
literals stay (they are also asserted against disk in section 1).

## Verification

- `node --test tests/readme-numbers.test.js` — RED before the README copy (the
  derived pins do not match the old file), GREEN after.
- `node --test tests/no-phantom-command-family.test.js tests/ctoc-start-command.test.js tests/compliance-claims-match-code.test.js tests/no-tier-3.test.js tests/version.test.js tests/release-script-coverage.test.js` — every other test that reads `README.md`.
- `npm test` — the full gate (`# fail 0`, coverage floor, 0 skipped).

---

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] EDIT `tests/readme-numbers.test.js` per File spec 2; run it and SEE the derived
      pins fail against the current README (RED — expected: badge, skill-files,
      JS-modules, two-kinds assertions).

### Step 9: PREPARE
- [ ] Confirm `.ctoc/drafts/README.course.md` exists and is 1,178 lines; confirm
      `computeDocCounts(process.cwd())` still reports 124 / 429 / 134 / 524 / 17 / 3
      (if a count moved since the draft, update the draft's literal for it — the
      derived pins will say which).

### Step 10: IMPLEMENT
- [ ] REPLACE `README.md` with the draft (File spec 1) and delete
      `.ctoc/drafts/README.course.md`.

### Step 11: REVIEW
- [ ] Read the diff: every capture in Part 1 is verbatim product output or a table
      of the exact option labels; no gate number appears in a lesson; the
      Environments table says push stays human in `prod`.

### Step 12: OPTIMIZE
- [ ] No code. Confirm no duplicated section between Part 1 and Part 3 says
      different things about the same mechanism.

### Step 13: SECURE
- [ ] Confirm no secret, token, absolute home path, or user name survives in a
      capture (paths in the blocked-edit capture are shortened to `/your/project`).

### Step 14: VERIFY
- [ ] `npm test` → `# fail 0`, coverage ≥ the floor in `.ctoc/coverage-baseline.json`,
      0 skipped; the phantom-command fence prints a debt of 2 (≤ ceiling 6).

### Step 15: DOCUMENT
- [ ] The README is the documentation. Nothing else to update; CLAUDE.md's count
      lines are kept by `release.js` at release time.

### Step 16: FINAL-REVIEW
- [ ] Verify Steps 8–15 above are ticked with evidence, then hand to the human:
      "the README rewrite is built and waiting for your OK to call it done".
