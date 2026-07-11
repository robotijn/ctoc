---
title: "W03 — Agent Contracts Load At Runtime"
created: "2026-07-11T00:00:00Z"
type: stub
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: HIGH
status: stub
depends_on: none
---

# W03 — Agent Contracts Load At Runtime

## Problem

19 agent files place an `# H1` heading before their YAML frontmatter. The plugin
runtime only parses a `---` block when it begins at byte 0 of the file, so for these
19 files it parses **none** of the frontmatter — the entire declared contract is
silently dropped. Concrete consequences:

- **`cto-chief` runs with all tools** instead of its declared read-only set. The
  sole top-level coordinator, whose whole safety property is that it cannot edit,
  loads unconstrained.
- **All 5 scouts run on the session model** instead of their declared `model: haiku`.
  Fast pre-screens meant to be cheap Haiku subagents silently run on Opus.
- **The architecture-invariants test certifies the broken state green.** It reads the
  frontmatter with a match-anywhere parser (`/^---/m` with the `m` flag, plus a
  match-anywhere fallback), so it sees the YAML the runtime ignores and asserts the
  contract is present — a false green that hides the exact defect it should catch.
- **The four `agents/_shared/*.md` prose fragments have no frontmatter at all** and
  live inside the auto-discovered agent tree, so the runtime auto-registers them as
  dispatchable agents. They are shared prose, not agents; they must not be dispatchable.

## Scope

**Fixes:** (1) move the `---` frontmatter block to line 1 in the 19 heading-first
files, relocating the `# H1` heading to immediately after the closing `---`;
(2) anchor the invariants-test frontmatter parser to `^---` at byte 0 only (drop the
`m` flag and the match-anywhere fallback) so the test parses frontmatter the same way
the runtime does; (3) relocate `agents/_shared/*` out of the auto-discovered agent
tree, or exclude it via manifest, so those prose fragments are no longer registered
as agents.

**Does NOT touch:** the step-agent-resolution / registry defects (that is W04) — this
stub only makes the frontmatter that already exists load; it does not add, rename, or
repoint any agent.

## Story Map

**Goal:** Every agent's declared contract (tools, model, role) loads at runtime exactly
as written, and the invariants test parses frontmatter the way the runtime does so it
can no longer certify a dropped contract as green.

- **Actor:** The CTOC maintainer relying on `cto-chief` being read-only and scouts
  being cheap; the runtime loader.
- **Success metric:** 0 of the non-`_shared` `agents/**/*.md` files begin with anything
  other than `---\n`; live registration exposes the declared tools/model for a sampled
  agent; 0 `_shared` fragments are registered as dispatchable.

### Activity 1 — Frontmatter loads for every agent
- `[MVP]` As the runtime, I want every agent file to begin with its `---` frontmatter
  block at byte 0, so that the declared tools/model/role are actually parsed and applied.
  - Moves frontmatter to line 1 in all 19 heading-first files; heading follows.
- As the maintainer, I want `cto-chief` to load with only its declared read-only tool
  set, so that the top coordinator cannot edit files.
- As the maintainer, I want all 5 scouts to load with `model: haiku`, so that
  pre-screens run cheap as designed.

### Activity 2 — The test parses like the runtime
- `[MVP]` As a maintainer, I want the invariants-test frontmatter parser anchored to
  `^---` at byte 0 (no `m` flag, no match-anywhere fallback), so that the test parses
  frontmatter identically to the runtime and goes red on a heading-first file.
  - This test must go red against the current (pre-fix) tree and green after Activity 1.

### Activity 3 — Shared prose is not an agent
- `[MVP]` As the runtime, I want `agents/_shared/*` excluded from the auto-discovered
  agent tree, so that prose fragments are never registered as dispatchable agents.

## Rough Acceptance Criteria

- Given the agent tree, When a test enumerates every non-`_shared` `agents/**/*.md`
  file, Then each one's first two bytes are `---` followed by a newline (`^---\n`).
- Given the corrected files, When the runtime registers `cto-chief`, Then the live
  registration exposes its declared read-only tool set (not the full tool set).
- Given the corrected files, When the runtime registers each of the 5 scouts, Then the
  live registration exposes `model: haiku` for each.
- Given the invariants-test parser anchored to `^---` at byte 0, When it runs against a
  synthetic heading-first fixture, Then it reports the frontmatter as absent (goes red),
  proving it no longer certifies the broken state green.
- Given the agent discovery pass, When it enumerates dispatchable agents, Then no
  `agents/_shared/*` fragment appears in the dispatchable set.

## Findings Addressed

C6, C7, L5.

## INVEST Status

- Frontmatter-at-byte-0 (MVP): Independent, testable via first-bytes assertion, small
  (mechanical move ×19) — PASS.
- cto-chief read-only load: valuable and testable via live registration inspection — PASS.
- Scouts haiku load: valuable, testable per-scout — PASS.
- Anchored parser (MVP): independent of the file moves to author but must go red first —
  testable via fixture — PASS.
- _shared exclusion (MVP): independent, testable via discovery enumeration — PASS.

## Decisions Taken Under Ambiguity

- **No Business Model Canvas.** No canvas exists at
  `plans/canvas/ctoc-self-audit-remediation.md`. This is a technical remediation
  workstream; a BMC is N/A. Proceeding vision-only per instruction — not kicked back.
- **Heading placement after frontmatter.** The `# H1` is relocated to immediately after
  the closing `---` rather than deleted, preserving human-readable titles while making
  byte 0 the frontmatter start. If the maintainer prefers dropping the heading entirely
  (the frontmatter `title:` already carries it), that is a trivial follow-up at review.
- **_shared relocation vs manifest exclusion.** Both are named as acceptable; the
  concrete mechanism (physical move out of `agents/` vs a discovery-manifest exclude
  glob) is left to the implementation plan, since it depends on how the discovery walker
  is wired — the acceptance criterion (0 `_shared` in the dispatchable set) is mechanism-
  agnostic.
