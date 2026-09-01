---
title: "The README teaches CTOC as a course — every step a human takes, with real screens"
type: functional
status: functional
created: 2026-08-31
priority: medium
effort: low
files:
  - README.md
  - tests/readme-numbers.test.js
  - .ctoc/drafts/README.course.md
approved_by: human
approved_at: 2026-08-31T14:14:05.880Z
gate_crossed: functional → implementation
---

# The README teaches CTOC as a course — every step a human takes, with real screens

**This file is an INDEX of its implementation slices, not a buildable plan.** It
carries no `## Execution Plan`; build the slice below, never this file.

## Slices (dependency-ordered)

| # | Slice file | Scope (one line) | depends_on |
|---|---|---|---|
| 1 | `00234-readme-as-a-course-s1-readme-and-guard-pins.md` | Replace `README.md` with the verified course draft, derive the six drifted pins in `tests/readme-numbers.test.js` from `computeDocCounts` and a walk of `skills/`, delete the draft. | – |

One slice only: the guard test pins the README's numbers, so the two files cannot be
green separately — they are one unit of work (three files, one of them a deletion).

---

## Original functional plan

## 1. ASSESS — Problem Understanding

The shipped `README.md` is a feature inventory, not a way in. A new human reads
896 lines about tiers, fences and templates and still cannot answer the only
questions that matter on day one: *what do I type, what will I see, what is mine
to decide, and what do I do when it says no?*

Concretely, verified against the current version on 2026-08-31:

- Its one worked example is a mocked session with invented screens
  (`GATE 1: [1] Approve plan  [2] Discuss  [0] Cancel`) that the product no longer
  shows; the real default screen is the streaming gate question ("Is … finished?").
- Its Environments table says production auto-pushes after gates; the code keeps
  the push human in every profile (`ENVIRONMENT_PROFILES` in `src/lib/settings.js`,
  `src/commands/push.md`).
- Several counts are stale against disk: `104 JS modules` where `src/lib/` holds
  134, `426 skill files` where 429 exist, `417 test files` where 524 exist, an
  agent table that sums to fewer than the 124 it claims, omits the safety,
  realtime and legal categories, and links a `workos-sso` agent that does not exist.
- It lists three conversational commands (`ctoc doctor`, `ctoc validate`,
  `ctoc process-issues`) that no binary serves — the phantom-command fence carries
  them as debt.
- It shows `node --test tests/*.test.js` as the developer test command; that
  bypasses the coverage and zero-skipped gate (`npm test` is the gate).

## 2. ALIGN — Approach

Rewrite the README as a **course**, following the course-design evidence rather
than a feature inventory:

- **Backward design** (Wiggins & McTighe): each lesson states its outcome first and
  ends with how the reader knows it worked.
- **Worked examples, then faded guidance** (Sweller & Cooper's worked-example
  effect): the first lessons show complete real screen captures; later lessons give
  steps and expect the reader to drive; the recipes are bare.
- **Retrieval practice**: a short self-check after every lesson.
- **Diátaxis separation**: Part 1 tutorial (nine lessons in the order a human meets
  them), Part 2 how-to recipes, Part 3 reference — never three jobs on one page.

The draft is already written and verified at `.ctoc/drafts/README.course.md`
(1,178 lines): every string the README guard tests pin is present, no phantom
commands remain, all 210 relative links resolve, the agent table sums to 124, and
every count was measured on disk with `computeDocCounts`.

Two files change, in one unit: `README.md` is replaced wholesale by the draft, and
`tests/readme-numbers.test.js` stops pinning literals disk already contradicts
(`104 JS modules`, `426 skill files`, `(100)`/`(326)` sub-taxonomy) and derives
them from `computeDocCounts` / a walk of `skills/` instead — a tightening, per
Operating Lesson 14: the contract comes from disk, both the README and the test
were wrong, and no assertion is deleted or loosened.

### Scope

**In scope:** `README.md` content; the numeric pins in `tests/readme-numbers.test.js`;
deleting the draft once applied.

**Out of scope (reported as separate findings, not changed here):**
- Tier counts disagree across `docs/AGENT_ARCHITECTURE.md` (20 / 99),
  `.ctoc/architecture/tier-definitions.yaml` (16 / 99) and agent frontmatter
  (23 / 100). The README keeps the architecture document's numbers.
- The first-run screen text says "prod = strict, auto-push after gates"; the code
  sets no auto-push in any profile. The README quotes the screen verbatim and adds
  one correcting sentence; the product text needs its own plan.
- `docs/IRON_LOOP.md` still calls enforcement modes `soft`/`off` "planned".

## 3. CAPTURE — Acceptance Criteria

**User story.** As a developer who just installed CTO Chief, I can read the README
top to bottom and, without opening any other document, install it, open it in my
project, turn an idea into plans, answer the gate questions, let it build, call the
work done and push — and know what to do when an edit is blocked.

```gherkin
Feature: The README is a course

  Scenario: A new reader follows Part 1
    Given a developer has never used CTO Chief
    When they read the nine lessons in order
    Then each lesson states an outcome, shows a real capture or the exact option labels,
      says how to know it worked, and ends with a retrieval check
    And no lesson refers to a gate by number

  Scenario: Every screen shown is real
    Given any code block in Part 1 presented as a capture
    When it is compared with the current version's output
    Then it matches verbatim (paths may be shortened, and any abridgement is labelled)

  Scenario: Every number is true
    Given the counts the README states (agents, categories, skill files, lib modules,
      test files, hooks, slash commands, per-category agent counts)
    When compared with `computeDocCounts` and a walk of `agents/`
    Then every one matches and the agent table sums to the total

  Scenario: The guard tests hold
    Given the new README.md and the tightened pins
    When `npm test` runs
    Then it reports `# fail 0`, coverage at or above the floor, 0 skipped,
      and the phantom-command fence reports a debt of 2 (down from 6)
```

**Definition of Done**
- `README.md` equals the verified draft; the draft file is deleted.
- `tests/readme-numbers.test.js` derives agents / skills / lib-module / test-file
  pins from `computeDocCounts(ROOT)` and the two sub-taxonomy literals from a walk
  of `skills/`; no assertion deleted, none loosened.
- `npm test` → `# fail 0`, coverage ≥ `.ctoc/coverage-baseline.json` floor, 0 skipped.
- Every relative link in the README resolves; no `ctoc <word>` phantom remains.

## Notes for the implementation planner

- Expected slicing: **one** implementation slice (README + its guard test are one
  unit — the test pins the README's numbers, so they cannot be green separately).
- Test-first is meaningful here: change the pins first (RED against the old
  README), copy the draft (GREEN), run the full gate.
- Pin changes, exactly:

| Assertion | Before | After |
|---|---|---|
| badge: skills | `/skills-426-blue/` | `` new RegExp(`skills-${counts.skills}-blue`) `` |
| Key Features / Skills intro: skill files | `/\*\*426 skill files\*\*/` | `` new RegExp(`\\*\\*${counts.skills} skill files\\*\\*`) `` |
| Project structure: JS modules | `/104 JS modules/` | `` new RegExp(`${counts.libModules} JS modules`) `` |
| Project structure: skill files | `/426 skill files/` | `` new RegExp(`${counts.skills} skill files`) `` |
| two kinds | `(100)` / `(326)` | `(${skillBodies})` / `(${counts.skills - skillBodies})`, `skillBodies = countSpecialistSkillBodies()` |

## Decisions Taken Under Ambiguity

1. **Tier counts stay as the architecture document states them** (20 / 99) — three
   sources disagree and a README is not where that is resolved; reported instead.
2. **Gate numbers appear only in the reference part.** Lessons speak in the moment
   ("is this what to build?"); the Iron Loop reference maps the moments to Gate 0–3
   once, because the linked docs and the code use the numbers.
3. **The first-run screen is quoted verbatim, including its stale auto-push line**,
   followed by one sentence stating what the code does. Editing a capture would
   make it not a capture.
4. **This plan enters at `functional/`, not `implementation/`.** A plan authored
   directly into `implementation/` has no ledger entry and no approved parent, so
   the gate-residency check (`gate-destinations-approved`) correctly blocks it and
   the runtime hook would revert it. The human approves *what to build* here; the
   implementation planner produces the parent-linked slice.
