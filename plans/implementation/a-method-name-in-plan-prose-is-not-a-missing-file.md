---
title: "A method name in plan prose is not a missing file — the created-file claim parser stops crying wolf"
type: functional
status: functional
created: 2026-09-03
priority: high
effort: small
files:
  - src/lib/plan-validator.js
  - tests/plan-validator.test.js
  - tests/plan-validator-coverage.test.js
approved_by: human
approved_at: 2026-09-03T14:28:17.177Z
gate_crossed: functional → implementation
---

# A method name in plan prose is not a missing file — index

This plan is an INDEX. The work is one slice.

## Slices (dependency-ordered)

| # | Slice file | Scope (one line) | depends_on |
|---|---|---|---|
| 1 | `00260-a-method-name-in-plan-prose-is-not-a-missing-file-s1-honest-claim-parser.md` | The three guards in Pattern 1 of the contradiction scan (call-suffix skip, inline call-span strip, path plausibility), the seven-token regression corpus from this repository's own plans, and the read-only sweep. | - |

## Original functional plan

## 1. ASSESS — Problem Understanding

Reproduced live on 2026-09-03: the finished, gate-green Create-React-App detector
slice was REFUSED at completion with
`File "assert.strictEqual" claimed as created but doesn't exist.` — no such
claim exists in the plan. The cause is `validateNoContradictions` in
`src/lib/plan-validator.js` (~line 524):

- Pattern 1, `createdFilePattern`, matches
  `(created|added|new file) … <token>.<suffix>` and its capture
  `([^\s`"'(),]+\.[a-z0-9]+)` **stops at an open parenthesis** — so the prose
  line "one assertion ADDED: `assert.strictEqual(result.confidence, 50)`"
  captures `assert.strictEqual` as a "file".
- The fence-stripping guard (added v6.9.86) protects fenced blocks only;
  inline-backtick code — how plans normally cite a call — is scanned.
- Any dotted identifier is path-shaped to this regex: measured across the plans
  on disk, the same misparse fires in **ten plans already in review/done**
  (`d.push`, `d.length`, `this.scannersRun`, `taskRegistry.findActivePlanTask`,
  `safeFs.writeFileSync`, `stat.birthtime`).

Consequence: any future plan whose prose says "added: `x.y(...)`" is blocked at
completion, and re-validating shipped plans reports phantom missing files. The
executor correctly refused to reword the hashed specification or force the
completion; the detector slice waits on this fix.

## 2. ALIGN — Approach

Make the claim parser recognise only things that can actually be files, without
weakening the real check:

1. **A claim immediately followed by an open parenthesis is a call, not a
   file.** After the capture, if the next character in the scanned text is `(`,
   skip the match. This alone clears `assert.strictEqual(…)` and every observed
   misread that appears as a call.
2. **Inline code spans get the same treatment as fenced blocks** where the span
   is a call expression: strip `` `…(…)…` `` inline spans containing an open
   parenthesis before scanning (a span citing a plain path — `` `src/x.js` `` —
   is kept, so real claims in backticks still validate).
3. **A captured token must be path-plausible:** it contains a `/`, OR its
   suffix is a known file extension (the repository's real set: js, mjs, cjs,
   ts, md, json, yaml, yml, txt, sh, py, html, css — verified/extended at read
   time from the extensions plans actually declare). `d.push`, `stat.birthtime`
   and `this.scannersRun` fail this test; `README.md` and
   `tests/foo.test.js` pass it. A bare basename with a real extension (the
   legitimately declared case the current code already resolves via
   `declaredFiles`) keeps working.
4. **Regression corpus from reality:** one case per observed misread (the six
   distinct dotted identifiers above, in prose shaped like the real plans), each
   asserting NO error; plus the true-positive guards — a genuinely claimed
   missing file still errors, the declared-basename resolution still passes,
   and the fenced-block stripping is unchanged.

The check's teeth stay: nothing in scope loosens the "claimed but doesn't
exist" error for a real path-shaped claim.

### Scope

**In scope:** the parser changes in `validateNoContradictions` (and its
`createdFilePattern`), the regression cases, and — after the fix — verifying by
a one-off read-only sweep (recorded in the slice's evidence, not a new fence)
that the ten previously-misread plans validate without phantom file errors.

**Out of scope:** completing the waiting detector slice (the session does that
through the normal completion after this ships), any other Pattern in the
function, and any change to the hashed-specification rules.

## 3. CAPTURE — Acceptance Criteria

```gherkin
Feature: The created-file check fires on files, not on prose that names code

  Scenario: A cited call is not a file claim
    Given plan prose containing: one assertion ADDED: `assert.strictEqual(result.confidence, 50)`
    When validateNoContradictions runs
    Then no "claimed as created" error is reported

  Scenario: The observed misreads are clean
    Given prose shaped like the ten real plans (d.push, d.length, this.scannersRun,
      taskRegistry.findActivePlanTask, safeFs.writeFileSync, stat.birthtime)
    Then no "claimed as created" error is reported for any of them

  Scenario: A real missing-file claim still errors
    Given prose claiming created: src/lib/does-not-exist.js
    Then the "claimed as created but doesn't exist" error is reported

  Scenario: Declared-basename resolution unchanged
    Given a bare-basename claim whose declared file exists
    Then no error is reported (existing behaviour)

  Scenario: The gate holds
    When npm test runs
    Then fail 0, skipped 0, coverage at or above the floor
```

**Definition of Done:** the misread class cannot fire (call-suffix skip +
inline-call stripping + path-plausibility); the true-positive guards green; the
ten shipped plans re-validate clean (recorded); `npm test` green; no assertion
weakened.

## Notes for the implementation planner

One slice. Verify at read time: the exact regex and its surroundings, where
inline-span stripping must sit relative to the fence stripping, the real
extension set used across `plans/**` `files:` declarations, and every existing
test on `validateNoContradictions` (tighten only with Lesson-14 justification —
this human-ordered plan is the contract change for any case that pins the
misread). Do NOT write an `## Execution Plan` section of your own.

## Decisions Taken Under Ambiguity

1. **Three complementary guards rather than one clever regex** — each is
   independently simple and testable; together they cover call-shaped,
   inline-cited, and bare-dotted identifiers without touching true positives.
2. **The extension allowlist is derived from the repository's real plans**, not
   invented — and a token with `/` always counts as path-plausible, so no real
   claim is excluded by an incomplete list.
