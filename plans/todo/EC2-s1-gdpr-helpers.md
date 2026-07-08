---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T16:39:46.207Z
gate_crossed: implementation → todo
---

---
title: "EC2-s1 — gdpr-helpers.js (deterministic PII→Article map, severity normalizer, schema validator, finding router)"
type: implementation
parent_plan: EC2-gdpr-agent-plan-and-code
depends_on: EC1-s2-compliance-regime-resolver
iron_loop: true
priority: HIGH
files:
  - src/lib/gdpr-helpers.js
  - tests/gdpr-helpers.test.js
status: refined
risk_level: MEDIUM
---

# EC2-s1 — gdpr-helpers.js (deterministic rule core + its test)

Slice 1 of the EC2 decomposition. This is the **testable boundary** the parent plan
mandates ("Hybrid testability via `gdpr-helpers.js`"): the deterministic rules live in a
JavaScript module that both the agent (by reference, s3) and the tests target directly.
Coverage targets (≥80%) apply to THIS file, not to the agent markdown.

Nothing here touches the agent prose, the SKILL.md enum, or the wiring — those are s2/s3/s4.
This slice is a self-contained pure module + its test. It depends on **EC1-s2** only for the
`shouldRunGdpr` gate contract that the router/agent will later honour; the helper functions
themselves are pure and import nothing from EC1 (the gate is applied by the agent at s3/s4).

## Implementation Details

### Architecture Decision (ADR)

**Context:** The parent forbids duplicating the skill's rule set in the agent markdown, and the
agent markdown is not testable by `node --test`. Deterministic, machine-checkable rules (which
PII field maps to which Articles, severity normalization, schema validation, plan-vs-code
routing) need a home that IS unit-testable.

**Decision:** A new pure module `src/lib/gdpr-helpers.js` — no fs, no I/O, no imports from
hooks/commands. It exposes one constant set, one map, and four pure functions. The agent (s3)
references these by name; the wiring (s4) calls them. This module is the single deterministic
authority; the skill's SKILL.md remains the narrative-rules + BAD/SAFE-example authority.

**Consequences:** The rule core is 100%-unit-testable with plain in-memory inputs (no tmp
project needed). The agent stays thin. `VALID_GDPR_ARTICLES` becomes the machine mirror of the
skill's `gdpr_article` enum — s2 adds a parity test so the two authorities can never silently
diverge.

### Dependency Graph

```
src/lib/gdpr-helpers.js  (CREATE)   — pure, no runtime imports
    ├── VALID_GDPR_ARTICLES         Set<string>  (mirror of SKILL.md gdpr_article enum + GDPR-6/9)
    ├── PII_FIELD_TO_ARTICLES       Object<string, string[]>
    ├── mapPiiFieldToArticles(f)    deterministic lookup
    ├── normalizeSeverity(finding)  sets severity:'critical' unconditionally
    ├── validateFindingSchema(f)    asserts gdpr_article ∈ VALID_GDPR_ARTICLES, throws on unknown
    ├── routeFinding(finding)       { route:'inbox' } | { route:'letter' } by target_file presence
    └── tested-by ─> tests/gdpr-helpers.test.js  (CREATE)
```

No cycle (no imports). Chain depth 0 for the helpers themselves. EC1-s2 is a *sequencing*
dependency (the gate it provides is consumed downstream at s4), not an import of this file.

### File Specifications

#### File: `src/lib/gdpr-helpers.js`
**Action:** CREATE
**Purpose:** The deterministic GDPR rule core — PII→Article mapping, severity normalization,
finding-schema validation, and plan-vs-code finding routing — as pure, unit-testable functions.
**Change Type:** new-module

**Constants:**
- `VALID_GDPR_ARTICLES` — a frozen `Set` containing EXACTLY the skill's `gdpr_article` enum
  values PLUS the two the parent adds:
  `"GDPR-6"`, `"GDPR-7"`, `"GDPR-9"`, `"GDPR-13"`, `"GDPR-14"`, `"GDPR-15"`, `"GDPR-17"`,
  `"GDPR-20"`, `"GDPR-28"`, `"GDPR-30"`, `"GDPR-33"`, `"GDPR-34"`, `"GDPR-37"`,
  `"GDPR-Chapter-V"`.
  (The skill's current enum omits `GDPR-6` and `GDPR-9`; s2 adds them to SKILL.md and a parity
  test asserts this Set equals the enum. This slice ships the Set already containing all 14.)
- `PII_FIELD_TO_ARTICLES` — a frozen map from a lowercase PII field name to the Articles it
  triggers, grounded in the skill's `piiFields` list and Article narrative. MUST include at
  minimum, matching the parent's CAPTURE scenarios exactly:
  - `email` → `["GDPR-6", "GDPR-13", "GDPR-17"]`
  - `ipaddress` / `ip` → `["GDPR-6", "GDPR-13", "GDPR-17"]` (Recital 30 — IP is personal data)
  - special-category fields `health`, `medical`, `biometric`, `ethnicity`, `religion`,
    `politicalview`, `sexualorientation` → include `"GDPR-9"` (plus `GDPR-6`, `GDPR-13`).
  - Every array value MUST be a subset of `VALID_GDPR_ARTICLES` (guarded by a self-check test).

**Imports:** none (pure module). This is the load-bearing property — the module must import
nothing so it stays trivially testable and reusable by both the agent-referenced logic and s4.

**Exports:**
- `mapPiiFieldToArticles(fieldName)` → `string[]`
  - Description: normalizes `fieldName` (lowercase, strip non-alphanumeric) and returns the
    mapped Articles, or `[]` when the field is not a known PII field.
  - Contract (parent Scenario): `mapPiiFieldToArticles('email')` deep-equals
    `["GDPR-6", "GDPR-13", "GDPR-17"]` (order stable, as authored in the map).
  - Non-string / empty input → `[]` (never throws).
- `normalizeSeverity(finding)` → `object`
  - Description: returns a shallow copy of `finding` with `severity: "critical"` set
    unconditionally (the warnings-are-critical contract). Given `{ severity: "medium" }` it
    returns `{ severity: "critical" }`. Does NOT mutate the input (returns a new object).
  - Non-object input → throws `TypeError('normalizeSeverity: finding must be an object')`.
- `validateFindingSchema(finding)` → `object` (the finding, unchanged, on success)
  - Description: asserts `finding.gdpr_article` is a member of `VALID_GDPR_ARTICLES`. On an
    unknown code (e.g. `"GDPR-99"`) throws `Error('validateFindingSchema: unknown gdpr_article
    "GDPR-99"')` — the message NAMES the offending code (parent Scenario). Returns the finding
    on success so callers can chain.
  - Missing `gdpr_article` → throws `Error('validateFindingSchema: gdpr_article is required')`.
- `routeFinding(finding)` → `{ route: "inbox" } | { route: "letter" }`
  - Description: a finding WITHOUT a `target_file` (plan-stage) routes to `"inbox"`; a finding
    WITH a truthy `target_file` (code-stage, has code coordinates) routes to `"letter"`.
    Grounded in the parent decision: the refinement-loop letter schema
    (`.ctoc/architecture/refinement-loop-schema.json`) REQUIRES `file` + `line_range`, which a
    plan-stage finding does not have — so plan-stage findings must NOT use the letter path.
  - Non-object input → throws `TypeError`.

**Called By:**
- `agents/compliance/gdpr-agent.md` (s3) — references these by name in its process prose.
- s4 wiring — calls `validateFindingSchema` → `normalizeSeverity` → `routeFinding` before
  emitting each finding to the Inbox or the letter.

#### Data Flow
```
raw finding {gdpr_article, severity?, target_file?}
  → validateFindingSchema(f)   throws if gdpr_article ∉ VALID_GDPR_ARTICLES
  → normalizeSeverity(f)        severity := 'critical'
  → routeFinding(f)             target_file? 'letter' : 'inbox'

plan text mentions 'email'
  → mapPiiFieldToArticles('email') → ['GDPR-6','GDPR-13','GDPR-17']
```

#### Error Handling
- `mapPiiFieldToArticles`: never throws; unknown/empty/non-string → `[]`.
- `normalizeSeverity` / `routeFinding`: throw `TypeError` on non-object input (programmer error,
  loud-fail — never silently return a wrong shape).
- `validateFindingSchema`: throws a named `Error` on missing/unknown `gdpr_article` (this IS the
  guard the parent relies on to prevent minting codes the schema rejects).

#### Cross-Platform Notes
- No fs, no paths, no OS-specific behaviour — pure computation. Cross-platform by construction.

### Test Plan

#### Tests: `tests/gdpr-helpers.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`assert`). No tmp project needed — pure in-memory
inputs. Follows the repo test pattern.

**Test Cases (map the parent CAPTURE scenarios 1:1 for this module's surface):**
1. **`mapPiiFieldToArticles('email')`** deep-equals `["GDPR-6", "GDPR-13", "GDPR-17"]`
   (exact array + order — parent Scenario "Plan mentions email").
2. **`mapPiiFieldToArticles` special-category** (`'health'`, `'biometric'`) includes `"GDPR-9"`
   (parent Scenario "Article 9 special-category data").
3. **`mapPiiFieldToArticles` unknown field** (`'favouriteColour'`) → `[]`; non-string / empty
   → `[]`; `assert.doesNotThrow`.
4. **Map integrity self-check:** every article in every `PII_FIELD_TO_ARTICLES` value is a
   member of `VALID_GDPR_ARTICLES` (prevents authoring a map entry the validator would reject).
5. **`VALID_GDPR_ARTICLES` contains `"GDPR-6"` and `"GDPR-9"`** (parent Success Metric 2 /
   Scenario "GDPR-6 and GDPR-9 are valid enum values") — asserted here for the module; s2
   asserts parity with SKILL.md.
6. **`normalizeSeverity` upgrades:** input `{ gdpr_article:'GDPR-13', severity:'medium' }` →
   result `.severity === 'critical'`; input object is NOT mutated (original still `'medium'`).
7. **`normalizeSeverity` sets critical when severity absent:** `{ gdpr_article:'GDPR-17' }` →
   `.severity === 'critical'`.
8. **`normalizeSeverity` non-object** → throws `TypeError`.
9. **`validateFindingSchema` accepts a valid code:** `{ gdpr_article:'GDPR-9' }` returns the
   finding, `assert.doesNotThrow`.
10. **`validateFindingSchema` rejects unknown code:** `{ gdpr_article:'GDPR-99' }` throws, and
    the thrown message CONTAINS `"GDPR-99"` (parent Scenario — names the unknown code).
11. **`validateFindingSchema` missing code** → throws (message mentions `gdpr_article`).
12. **`routeFinding` plan-stage:** `{ gdpr_article:'GDPR-13' }` (no `target_file`) →
    `{ route:'inbox' }` (parent Scenario "Plan-stage findings route via Inbox").
13. **`routeFinding` code-stage:** `{ gdpr_article:'GDPR-17', target_file:'src/x.ts',
    target_line:42 }` → `{ route:'letter' }`.
14. **`routeFinding` non-object** → throws `TypeError`.

**Coverage Targets:** ≥ 80% line + branch on `gdpr-helpers.js`. Every function's success and
throw path exercised; every branch of `routeFinding` (present/absent `target_file`) hit.

### Security Review
- [x] Path traversal: none — no paths handled in this module.
- [x] Input validation: `mapPiiFieldToArticles` coerces non-string → `[]`; the validators throw
      loudly on malformed input rather than returning a wrong shape.
- [x] No secrets.
- [x] Safe file operations: none — pure module, no fs.
- [x] Error messages: name the offending `gdpr_article` code (developer-facing, no sensitive
      path or secret leaked).
- [x] Prototype pollution: `normalizeSeverity` returns `{ ...finding, severity:'critical' }` (a
      shallow copy); no merge from untrusted keys into a shared object; constants are frozen.
- [x] Command injection: no `exec`/`execSync`.

## Execution Plan

### Step 8: TEST
Write `tests/gdpr-helpers.test.js` with all 14 cases (red — module absent, MODULE_NOT_FOUND).

### Step 9: PREPARE
No new deps. Confirm the skill's `gdpr_article` enum values (SKILL.md letter schema) to seed
`VALID_GDPR_ARTICLES`; confirm the parent's exact `email` mapping contract.

### Step 10: IMPLEMENT
Create `src/lib/gdpr-helpers.js` per the File Specification: frozen `VALID_GDPR_ARTICLES` Set,
frozen `PII_FIELD_TO_ARTICLES` map, the four pure functions, JSDoc, `module.exports`. Standard
lib module pattern (imports [none] → constants → JSDoc functions → exports).

### Step 11: REVIEW
Verify purity (no imports); verify the `email` mapping matches the parent contract byte-for-byte;
verify every map value ⊆ `VALID_GDPR_ARTICLES` (test 4).

### Step 12: OPTIMIZE
Keep it thin — no classes, no factories, match existing lib simplicity. Freeze constants.

### Step 13: SECURE
Run the security checklist; confirm the validators throw (never silently pass) and constants are
frozen (no mutation).

### Step 14: VERIFY
`node --test tests/gdpr-helpers.test.js` → `# fail 0`; coverage ≥ 80%. Then full suite
`node --test tests/*.test.js` → `# fail 0` (no regression).

### Step 15: DOCUMENT
JSDoc on all four exports + a module header comment stating this is the deterministic authority
mirroring the skill's `gdpr_article` enum (parity enforced by s2).

### Step 16: FINAL-REVIEW
Confirm all 14 cases pass, purity holds, `email`/special-category contracts exact. Plan stays in
`implementation/` (executor does NOT cross Gate 2). Ready for batched Gate 2 with siblings.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — confirmed MODULE_NOT_FOUND (1 fail)

### Step 9: PREPARE
- [x] Install dependencies if needed — none (pure module)
- [x] Check prerequisites — confirmed SKILL.md gdpr_article enum + email contract
- [x] Verify dev environment ready
- [x] Create directories/config if needed — none

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points — exports for s3/s4 reference

### Step 11: REVIEW
- [x] Self-review all new code — purity confirmed (no imports)
- [x] Verify integration points work together — email map byte-exact
- [x] Check error handling completeness — throw + fail-safe paths tested

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code — frozen constants, no classes

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — no paths in module
- [x] Sanitize outputs — validators throw, never wrong shape
- [x] No secrets in code
- [x] Safe file operations — none (pure)

### Step 14: VERIFY
- [x] Run lint + type check — eslint exit 0; tsc baseline-neutral (0 new errors)
- [x] Run ALL tests (TDD Green) — 3196 pass, 0 fail, 0 skipped
- [x] Check coverage >= 80% — gdpr-helpers.js 100% line/branch/funcs
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation — README lib count 115→116 + gdpr-helpers listed
- [x] Add JSDoc comments to new functions — all 4 exports + constants
- [x] Update CHANGELOG if needed — n/a (version bump at release)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review — plan stays in implementation/todo; executor does NOT cross Gate 2

## Decisions Taken Under Ambiguity

- **Extra PII field entries beyond the plan's named ones.** The plan named `email`,
  `ipaddress`/`ip`, and the seven special-category fields explicitly, and said the map
  must include these "at minimum" grounded in the skill's `piiFields` list. I additionally
  seeded the other direct/online identifiers from the skill's `piiFields` (`phone`, `name`,
  `firstname`, `lastname`, `address`, `cookieid`, `deviceid`, `fingerprint`) with the same
  `["GDPR-6","GDPR-13","GDPR-17"]` trigger set, since they are collected-from-subject
  identifiers with the identical lawful-basis / info-at-collection / erasure obligations.
  Rationale documented inline. Deliberately did NOT add `password`/`secret`/`token`/`ssn`
  etc. — those carry different (auth-artefact / gov-issued) Article profiles the parent
  did not specify, so mapping them would be guessing; they return `[]` until a later slice
  specifies their exact Article set. Caught-at-review if wrong.
- **Special-category Article set = `["GDPR-6","GDPR-9","GDPR-13"]`.** The plan said special
  fields "include `GDPR-9` (plus `GDPR-6`, `GDPR-13`)". I did NOT add `GDPR-17` to the
  special set — the plan's parenthetical named only 6/13, so I honoured that literally.
- **`mapPiiFieldToArticles` returns a copy (`.slice()`)** of the mapped array rather than
  the frozen source reference, so a caller mutating the result can never affect the shared
  map. Pure-function hygiene; not specified but strictly safer.
- **`validateFindingSchema` treats empty-string `gdpr_article` as "required" (missing).**
  The plan distinguished "missing" vs "unknown"; an empty string is neither a valid code
  nor a meaningful value, so it takes the `gdpr_article is required` path.
