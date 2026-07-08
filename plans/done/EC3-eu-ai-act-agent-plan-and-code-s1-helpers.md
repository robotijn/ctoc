---
approved_by: human
approved_at: 2026-07-08T19:13:51.821Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T16:39:46.338Z
gate_crossed: implementation → todo
---

---
title: "EC3-s1 — eu-ai-act-helpers.js (deterministic core: filter, normalize, route, classify, date-read) + test"
type: implementation
parent_plan: EC3-eu-ai-act-agent-plan-and-code
depends_on: none
program: ctoc-eu-compliance
priority: HIGH
risk_level: HIGH
iron_loop: true
files:
  - src/lib/eu-ai-act-helpers.js
  - tests/eu-ai-act-helpers.test.js
---

# EC3-s1 — eu-ai-act-helpers.js (deterministic core) + test

> Slice 1 of EC3 (`EC3-eu-ai-act-agent-plan-and-code`). This is the **deterministic
> JavaScript core** the agent (s2) references by name and the registry wiring (s3)
> gates on. The agent prompt is not `node --test`-testable; every machine-checkable
> rule EC3 needs lives here and is covered to ≥80%. No dependency on any other slice —
> this is the foundation, built first.

**Read before acting (CF1 / ancestry-read):** the parent index
`plans/implementation/EC3-eu-ai-act-agent-plan-and-code.md` in full; the real APIs this
slice grounds on — `src/lib/compliance-regime.js` (`shouldRunEuAiAct`), the
`ai-governance-checker` skill letter schema at
`skills/compliance/ai-governance-checker/SKILL.md` (the `regulation`, `severity`,
`kind`, `risk_class`, `annex_iii_category`, `target_file` fields), and
`.ctoc/regulatory-regimes/eu-ai-act-high-risk.yaml` (the enforcement dates + `name`).
Trust the file on disk over this brief; surface any drift.

---

## Implementation Details

### Architecture Decision

**Scope isolation is an OUTPUT FILTER keyed on the skill's real `regulation` field, not phase invocation.** The `ai-governance-checker` skill's letter schema (SKILL.md line 520) declares `regulation: eu-ai-act | nist-ai-rmf | nist-ai-600-1 | iso-42001`. The six scan phases interleave EU AI Act, NIST, and ISO obligations in prose — they are not a code boundary. Therefore `filterToEuAiAct(findings)` retains only findings whose `regulation === "eu-ai-act"` and is **fail-strict**: a finding lacking a `regulation` field is DROPPED (not passed) and flagged malformed. This is the whole reason the module exists — it is unit-testable in isolation of the agent markdown.

Module layout follows the standard `src/lib/*.js` pattern: `'use strict'`, `require` block, constants (`RISK_TIER_TABLE`, `EU_AI_ACT_REGULATION`), JSDoc'd pure functions, `module.exports` at the bottom. Pure functions only (no I/O) except `readEnforcementDates(profilePath)`, which reads one YAML file via `safe-fs` and never throws (fail-open to `{}` — matching `compliance-regime.js`).

**Dependency direction:** lib → lib only. Imports `./safe-fs` for the one file read; imports nothing from hooks or commands. Does NOT import `compliance-regime.js` — the gate is the agent's job (s2/s3); this module is pure rule logic and stays independently testable.

### Dependency Graph

```
src/lib/eu-ai-act-helpers.js
  --depends-on--> src/lib/safe-fs.js        (existing; readEnforcementDates only)
  --tested-by---> tests/eu-ai-act-helpers.test.js   (this slice)
  --referenced-by (by name, in prose)--> agents/compliance/eu-ai-act-agent.md   (s2)
No new-file cycles. Depth 1.
```

### File Specifications

#### File: `src/lib/eu-ai-act-helpers.js`
**Action:** CREATE
**Purpose:** The deterministic EU-AI-Act rule core — risk-tier classification table, EU-AI-Act-only output filter, severity normalizer, finding router, and profile date reader — targeted directly by tests and referenced by name from the agent prompt.
**Change Type:** new-module

##### Constants
- `EU_AI_ACT_REGULATION = 'eu-ai-act'` — the single `regulation` value this agent owns (matches SKILL.md line 520 enum).
- `RISK_TIER_TABLE` — a frozen map of Annex III category → `risk_class`, keyed on the skill's real `annex_iii_category` enum values (SKILL.md lines 523–525): `'1-biometrics'`, `'2-critical-infrastructure'`, `'3-education'`, `'4-employment'`, `'5-essential-services'`, `'6-law-enforcement'`, `'7-migration'`, `'8-justice'` → all `'high-risk'`. Plus prohibited-practice markers → `'prohibited'` and a transparency marker → `'limited-risk'`. GPAI provider marker → `'gpai'`.

##### Exports
- `classifyFromPlanText(planText: string)` → returns `{ risk_class: string, annex_iii_category: string|null, confidence: 'high'|'medium'|'low' }`
  - Description: heuristic keyword scan over plan prose. Matches Art. 5 prohibited-practice phrases (e.g. real-time remote biometric identification in publicly accessible spaces, social scoring, untargeted facial-image scraping) → `{ risk_class: 'prohibited', annex_iii_category: null, confidence: 'high' }`. Matches Annex III domain phrases (CV/candidate screening → `'4-employment'`; biometric ID → `'1-biometrics'`; credit/essential-service decisioning → `'5-essential-services'`; law-enforcement → `'6-law-enforcement'`, etc.) → `{ risk_class: 'high-risk', annex_iii_category: <cat>, confidence: 'medium' }`. Matches chatbot/generated-content phrases → `{ risk_class: 'limited-risk', annex_iii_category: null, confidence: 'medium' }`. Matches GPAI-provider phrases ("provide/train a large language model", "foundation model provider") → `{ risk_class: 'gpai', annex_iii_category: null, confidence: 'medium' }`. No match → `{ risk_class: 'unknown', annex_iii_category: null, confidence: 'low' }`.
  - Non-string / empty input → `{ risk_class: 'unknown', annex_iii_category: null, confidence: 'low' }` (never throws).
  - Case-insensitive, word-bounded matching. No dynamic `RegExp` from the input.
- `filterToEuAiAct(findings: object[])` → returns `object[]`
  - Description: retains ONLY findings where `finding.regulation === 'eu-ai-act'`. Fail-strict: a finding with no `regulation` field, or `regulation` of any other value (`'nist-ai-rmf'`, `'nist-ai-600-1'`, `'iso-42001'`), is dropped. Non-array input → `[]`. Does not mutate the input array.
- `normalizeSeverity(finding: object)` → returns `object`
  - Description: returns a shallow copy with `severity: 'critical'` set unconditionally (warnings-are-critical). Non-object input → returns `{ severity: 'critical' }`. Never mutates the input.
- `routeFinding(finding: object)` → returns `{ route: 'inbox' } | { route: 'letter' }`
  - Description: `{ route: 'letter' }` when `finding.target_file` is a non-empty string (code-stage finding); `{ route: 'inbox' }` otherwise (plan-stage finding — no `target_file`, or `target_file === 'repo-root'` treated as inbox per plan-stage semantics is NOT applied here: `repo-root` is a real file marker → letter). Deterministic; never throws.
- `readEnforcementDates(profilePath: string)` → returns `{ art5_prohibitions, art4_ai_literacy, chapter_v_gpai, annex_iii_high_risk, effective_date, source, verified }`
  - Description: reads `.ctoc/regulatory-regimes/eu-ai-act-high-risk.yaml` via `safe-fs`, parses `effective_date:` and the `notes:` block, returns the structured dates with `verified: false` (marked `unverified-this-run` per plan — EC4 verifies live). Missing file / parse error → returns an object with all date fields `null`, `source: profilePath`, `verified: false` (fail-open, never throws). Dates are NEVER hardcoded in this function — they are read from the profile.

##### Dependencies
- `require('./safe-fs')` — `readFileSync` / `existsSync` for `readEnforcementDates` (fail-open reads).
- `require('path')` — only if resolving inside `readEnforcementDates`; the profile path is passed in by the caller (no path construction from untrusted input).

##### Called By
- `agents/compliance/eu-ai-act-agent.md` (s2) — references `classifyFromPlanText`, `filterToEuAiAct`, `normalizeSeverity`, `routeFinding`, `readEnforcementDates` by name in prose (the agent invokes the helper conceptually; the machine contract is these functions).
- `tests/eu-ai-act-helpers.test.js` (this slice) — direct unit target.

##### Data Flow
```
plan prose (string) --> classifyFromPlanText --> { risk_class, annex_iii_category, confidence }
skill findings[]    --> filterToEuAiAct --> eu-ai-act-only findings[]
                     --> map(normalizeSeverity) --> all severity: critical
                     --> map(routeFinding) --> { route } per finding
profile path (string) --> readEnforcementDates --> { dates..., verified: false }
```

##### Error Handling
- All pure functions: defensive on non-object / non-array / non-string input → documented safe default, never throw.
- `readEnforcementDates`: wrap the read+parse in try/catch → return all-null date object on any failure (fail-open, matching `compliance-regime.js`).

##### Cross-Platform Notes
- `readEnforcementDates` uses the caller-supplied path as-is; if it joins, it uses `path.join`. Uses `safe-fs` (CRLF-tolerant) for the read.
- No hardcoded separators; no `~`; no shell.

### Test Plan

#### Tests: `tests/eu-ai-act-helpers.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `assert/strict`)

##### Test Cases
1. **classify — CV screening → Annex III §4 employment.** Input plan text describing screening CVs to select candidates → asserts `{ risk_class: 'high-risk', annex_iii_category: '4-employment', confidence: 'medium' }`. (Maps AC scenario "CV-screening system".)
2. **classify — real-time biometric ID in public → prohibited, high confidence.** Input describing real-time remote biometric identification in publicly accessible spaces for law enforcement → asserts `{ risk_class: 'prohibited', annex_iii_category: null, confidence: 'high' }`. (Maps AC "prohibited-use stop-ship".)
3. **classify — customer chatbot → limited-risk.** Input describing a customer-facing chat assistant → asserts `risk_class: 'limited-risk'`, `confidence: 'medium'`.
4. **classify — GPAI provider → gpai.** Input describing providing a large language model → asserts `risk_class: 'gpai'`.
5. **classify — no AI signal → unknown/low.** Input with no AI-domain keywords → asserts `{ risk_class: 'unknown', annex_iii_category: null, confidence: 'low' }`.
6. **classify — non-string input → unknown/low, no throw.** Input `null` and `42` → each returns unknown/low without throwing.
7. **filter — drops NIST and ISO findings.** Input `[{regulation:'nist-ai-rmf'}, {regulation:'iso-42001'}]` → asserts `filterToEuAiAct(...)` returns `[]`. (Maps AC "output filter — NIST/ISO dropped".)
8. **filter — keeps only eu-ai-act.** Input mixed array `[{regulation:'eu-ai-act',id:'a'}, {regulation:'nist-ai-rmf'}, {regulation:'eu-ai-act',id:'b'}]` → asserts exactly the two `eu-ai-act` findings survive, order preserved.
9. **filter — fail-strict on missing regulation field.** Input `[{kind:'missing-inventory'}]` (no `regulation`) → asserts dropped (returns `[]`).
10. **filter — non-array input → [].** Input `null` → `[]`.
11. **filter — does not mutate input.** Assert the input array length unchanged after call.
12. **normalize — upgrades low to critical.** Input `{severity:'low', kind:'x'}` → asserts result `.severity === 'critical'` and `.kind === 'x'` preserved, input unmutated. (Maps AC "severity normalizer".)
13. **normalize — non-object → {severity:'critical'}.** Input `null` → `{severity:'critical'}`.
14. **route — target_file present → letter.** Input `{target_file:'src/x.js'}` → `{route:'letter'}`. (Maps AC "plan-stage via Inbox / code-stage via letter".)
15. **route — no target_file → inbox.** Input `{risk_class:'high-risk'}` → `{route:'inbox'}`.
16. **readEnforcementDates — reads dates from the real profile, verified:false.** Setup: point at a fixture copy of `eu-ai-act-high-risk.yaml` in a tmp dir (mkdtempSync); assert `effective_date` non-null and `verified === false`, and that Art. 5 / Art. 4 / Chapter V / Annex III date fields are populated from the profile (not from a literal in the function). (Maps AC "dates cited from profile, not hardcoded".)
17. **readEnforcementDates — missing file → all-null, no throw.** Input a nonexistent path → returns object with null date fields and `verified:false`, does not throw.

##### Coverage Targets
- Line + branch coverage ≥ 80% on `src/lib/eu-ai-act-helpers.js`.
- Every `filterToEuAiAct` branch (keep / drop-other-regulation / drop-missing-field / non-array) exercised.
- Both `readEnforcementDates` paths (success + fail-open) exercised.

### Security Review

- [x] **Path traversal:** `readEnforcementDates` uses a caller-supplied path via `safe-fs`; the caller (s2/s3) passes the fixed profile path — no path built from plan prose. No traversal surface introduced.
- [x] **Input validation:** every export type-checks its argument and returns a documented safe default on bad input.
- [x] **No secrets:** none.
- [x] **Safe file operations:** only a READ of the regime profile via `safe-fs`; no writes in this module.
- [x] **Error messages:** no user-facing error strings leak paths (fail-open returns data, not thrown errors).
- [x] **Prototype pollution:** `normalizeSeverity` uses a shallow copy `{ ...finding, severity: 'critical' }`; `RISK_TIER_TABLE` is `Object.freeze`d; no assignment of untrusted keys.
- [x] **Command injection:** none — no `exec` / `execSync`; no dynamic `RegExp` from input.

---

## Execution Plan (Steps 8–16)

### Step 8: TEST
- [x] Write `tests/eu-ai-act-helpers.test.js` with all 17 cases above (RED first). Use `mkdtempSync` for the `readEnforcementDates` fixture (copy `.ctoc/regulatory-regimes/eu-ai-act-high-risk.yaml` into the tmp dir). `node:test` + `assert/strict` only.

### Step 9: PREPARE
- [x] Confirm no new dependencies — reuse existing `./safe-fs` and Node builtins (`fs`/`os`/`path` for the test harness). No install.

### Step 10: IMPLEMENT
- [x] Create `src/lib/eu-ai-act-helpers.js`: `'use strict'`, `require('./safe-fs')`, frozen `RISK_TIER_TABLE` + `EU_AI_ACT_REGULATION`, the five JSDoc'd exports (`classifyFromPlanText`, `filterToEuAiAct`, `normalizeSeverity`, `routeFinding`, `readEnforcementDates`), `module.exports` at the bottom. No stubs — every branch returns working values (no-stub rule).

### Step 11: REVIEW
- [x] Self-review: filter is fail-strict (missing `regulation` dropped); `normalizeSeverity`/`filterToEuAiAct` never mutate input; classifier heuristics use the skill's real `annex_iii_category` enum spellings; `readEnforcementDates` reads (never hardcodes) dates.

### Step 12: OPTIMIZE
- [x] Keyword tables defined once as module constants; matching is single-pass; no redundant re-parsing of the profile.

### Step 13: SECURE
- [x] Verify the Security Review checklist above holds in code: no dynamic `RegExp` on input, `Object.freeze` on `RISK_TIER_TABLE`, shallow-copy in `normalizeSeverity`, `safe-fs` read only, fail-open `readEnforcementDates`. Lint clean (`--max-warnings 0`).

### Step 14: VERIFY
- [x] `node --test tests/eu-ai-act-helpers.test.js` → all 17 GREEN, 0 skipped, 0 flaky. Then `node --test tests/*.test.js` → `# fail 0` (no regression). Coverage on `eu-ai-act-helpers.js` ≥ 80%. Lint + typecheck pass.

### Step 15: DOCUMENT
- [x] JSDoc on all five exports (params, returns, throws-never contract, fail-open notes). Module header comment stating the scope-isolation-via-output-filter decision and the "dates read from profile, not hardcoded" invariant.

### Step 16: FINAL-REVIEW
- [x] implementation-reviewer verifies the 14 quality dimensions + AC→assertion map for scenarios covered by this slice (classifier, filter, normalizer, router, date reader). No human gate crossed by this slice. Gate 3 approval is batched at the EC3 parent level.

## Decisions Taken Under Ambiguity

- **Helpers test is `tests/eu-ai-act-helpers.test.js`, not the parent-plan's single `tests/eu-ai-act-agent.test.js`.** The parent EC3 plan lists one test file covering both helpers and agent content. Per SIP1 a module ships with its own test; splitting the helper unit-tests (this slice) from the agent-content-contract tests (s2) into two files keeps each slice a clean single-pass unit and avoids two slices writing the same file. The `files:` coverage hook scopes each slice to its own test file.
- **`readEnforcementDates` parses the profile with a minimal targeted YAML read (the `effective_date:` line + the `notes:` block), not a full YAML library**, mirroring `compliance-regime.js`'s targeted single-line approach — no new dependency, CRLF-tolerant, fail-open.

- **Added the Art. 4 AI-literacy (2 Feb 2025) and Chapter V GPAI (2 Aug 2025) milestone dates + an explicit "Annex III high-risk obligations effective August 2 2026" phrase to the `notes:` block of `.ctoc/regulatory-regimes/eu-ai-act-high-risk.yaml`.** The tests require `readEnforcementDates` to return those four milestones, and the no-hardcode invariant forbids baking them into the function. The original `notes:` prose stated only Art. 5 (2 Feb 2025) and the general high-risk (2 Aug 2026) dates — so the Art. 4 and Chapter V dates were added to the PROFILE (the source of truth, matching SKILL.md `deadline_relevance`), and `readEnforcementDates` reads all four from prose via static anchor regexes. This preserves "dates read from profile, never hardcoded": edit the YAML and the returned dates change (proven by test 16b). The profile edit touches only the human-readable `notes:` block — no structured key, no hook-critical field.

- **Every classifier keyword pattern is a STATIC literal `RegExp` and was rewritten to be linear-time** to satisfy `security/detect-unsafe-regex` at `--max-warnings 0` (warnings-are-bugs). The safe-regex heuristic flagged several patterns that chained `\s+` beside optional non-capturing groups / alternations (`(?:facial|face)[-\s]?(?:image\s+)?`, the credit/GPAI alternations). Rather than suppress, each was split into multiple simple single-space patterns (no nested/overlapping unbounded quantifiers). No dynamic `RegExp` is ever built from plan input.

- **`readEnforcementDates`'s prose-date anchors use `new RegExp(staticString + WORD_DATE)`** where every fragment is a module-level string LITERAL (never the untrusted profile content or plan input) — this is not a `detect-non-literal-regexp` finding (lint exit 0) and carries no ReDoS surface (bounded profile file, linear anchors).

## Execution Result (EC3-s1)

- **RED → GREEN:** test file written first, ran RED (module absent: "Cannot find module '../src/lib/eu-ai-act-helpers'"), then GREEN after implement.
- **`node --test tests/eu-ai-act-helpers.test.js`:** 22 pass / 0 fail / 0 skipped (17 plan cases, several split into sub-cases a/b for branch coverage).
- **Fail-strict proof:** test 9 (`[{kind:'missing-inventory'}]` → `[]`), test 7 (`nist-ai-rmf` + `iso-42001` → `[]`), test 9b (null/undefined regulation + non-object entries dropped) all pass — any finding whose `regulation !== 'eu-ai-act'` (incl. missing) is DROPPED.
- **Dates-from-profile:** test 16 reads `2025-02-02` (Art.5/Art.4), `2025-08-02` (Chapter V GPAI), `2026-08-02` (Annex III + effective_date) from the profile with `verified:false`; test 16b edits `effective_date` in a fixture and the returned value changes (proves not hardcoded); test 17 missing file → all-null + `verified:false`, no throw.
- **`node --test tests/*.test.js`:** 3238 pass / 0 fail / 0 skipped — `# fail 0`.
- **`npx eslint . --max-warnings 0`:** exit 0.
- **tsc:** baseline-neutral — 89 pre-existing errors unchanged, ZERO in `eu-ai-act-helpers.js` / `tests/eu-ai-act-helpers.test.js` / `readme-numbers.test.js`.
- **Count bump:** `src/lib/` 117 → 118 (README line + both `readme-numbers.test.js` assertions updated; readme-numbers 47 pass / 0 fail).
- **Coverage on `eu-ai-act-helpers.js`:** 99.11% line / 89.58% branch / 100% function (≥ 80%). Uncovered: the fail-open catch block only.
- Plan intentionally NOT moved (dispatch scope: implement this slice's files only).


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review
