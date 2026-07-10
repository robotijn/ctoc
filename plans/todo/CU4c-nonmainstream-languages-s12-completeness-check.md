---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T13:05:41.266Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.470Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4c s12 — completeness check over all 41 CU4c-targeted language guides"
type: implementation
parent_plan: CU4c-nonmainstream-languages
depends_on: CU4c-nonmainstream-languages-s1-functional-typed, CU4c-nonmainstream-languages-s2-functional-lisp-beam, CU4c-nonmainstream-languages-s3-scripting-unix, CU4c-nonmainstream-languages-s4-dynamic-oo-scripting, CU4c-nonmainstream-languages-s5-systems-modern, CU4c-nonmainstream-languages-s6-legacy-native, CU4c-nonmainstream-languages-s7-enterprise-domain, CU4c-nonmainstream-languages-s8-data-query, CU4c-nonmainstream-languages-s9-contract-hdl, CU4c-nonmainstream-languages-s10-numeric-logic-infra, CU4c-nonmainstream-languages-s11-mobile-modern
priority: MEDIUM
risk_level: LOW
files:
  - .ctoc/audit/corpus-audit-2026-06-15.json
  - tests/cu4c-completeness.test.js
---

# CU4c s12 — completeness check over all 41 CU4c-targeted language guides

> Slice 12 (FINAL) of the CU4c decomposition. This is the **no-silent-skip completeness
> gate** for CU4c. It does NOT upgrade any guide — the eleven upgrade slices (s1–s11) do
> that. It (a) records/confirms an audit-ledger verdict for **every one of the 41
> CU4c-scope files** (`UPGRADED` or `SOLID-SKIPPED`), and (b) adds the content-contract
> completeness test that reads the REAL ledger + the REAL 41 guide files off disk and
> asserts the diff between the in-scope-41 and (UPGRADED ∪ SOLID-SKIPPED) is EMPTY.
> `depends_on` all eleven upgrade slices because it verifies their recorded verdicts —
> a fan-in (dependency chain depth 2: upgrade slice → completeness). No cycles.
>
> **NO STUBS. NO FABRICATED NUMBERS. ZERO TEST DOUBLES.**
> The completeness test READS the real ledger JSON + the real 41 guides off disk with
> `fs.readFileSync` / `JSON.parse` — no mocks, no fixtures, no fakes. The 41 in-scope
> filenames are the audit-ledger diff (all `skills/languages/*.md` at ≤5 `##` sections
> MINUS the 9 CU2 files) — confirmed fresh 2026-07-09 as exactly 41. No fabricated verdict:
> a file is `UPGRADED` only if it now has >5 `## ` sections on disk; `SOLID-SKIPPED` only
> with a recorded rationale.

Maps to CU4c acceptance criteria: **"scope is confirmed from the audit ledger at
implementation start"**, **"every audit-confirmed thin non-mainstream language guide is
upgraded or recorded (zero silent omissions)"**, **"no audited-SOLID language guide is
rewritten"**, and **"audit artifact updated and completeness check passes; `node --test
tests/*.test.js` passes with `# fail 0`"**.

## Implementation Details

### Architecture Decision

Mirror `tests/corpus-audit-ledger.test.js` (the CU1-s6 no-silent-skip contract): read the
REAL ledger + REAL source files, assert coverage of an explicit in-scope list. CU4c's
in-scope list is the **41-file constant** derived by the audit-ledger diff and confirmed
fresh 2026-07-09. The verdict enum is the ledger's existing `{SOLID, THIN, DEFECTIVE}` for
`records[]`; CU4c per-file processing status is recorded as a **`cu4c_verdict`** of
`UPGRADED` / `SOLID-SKIPPED` (matching CU2-s2's `slice`/verdict convention) so the
completeness diff is computable without conflating the two axes.

**No new gate logic, no churn of existing ledger records.** The ledger is appended to
(new CU4c records/verdicts added under a `.ctoc/*`-whitelisted path); existing CU1/CU2
records are untouched.

### The 41 in-scope files (audit-ledger diff, confirmed 2026-07-09)

```
abap apex assembly bash clojure cobol coffeescript crystal d dart elixir erlang
fortran fsharp graphql groovy haskell julia kotlin lua matlab nim objectivec ocaml
perl php powershell prolog r ruby scala scheme solidity sql swift tcl terraform vba
verilog vhdl zig
```

All 41 at exactly 5 `## ` sections on 2026-07-09; none is a CU2 file (python, javascript,
typescript, go, java, rust, csharp, c, cpp — those sit at ≥10 sections and are OUT OF
SCOPE). Slice→file coverage:
- s1 haskell, ocaml, fsharp, scala · s2 clojure, scheme, erlang, elixir · s3 bash, perl,
  tcl, lua · s4 ruby, php, groovy, coffeescript · s5 zig, nim, crystal, d · s6 fortran,
  assembly, cobol, objectivec · s7 abap, apex, vba, matlab · s8 sql, graphql, r · s9
  solidity, verilog, vhdl · s10 julia, prolog, terraform, powershell · s11 kotlin, swift,
  dart.
- Union = 41, no overlap, no omission.

### Dependency Graph

```
.ctoc/audit/corpus-audit-2026-06-15.json  (MODIFY: add CU4c per-file verdicts)  <--tested-by-- tests/cu4c-completeness.test.js
tests/cu4c-completeness.test.js           (CREATE)  --reads--> the REAL ledger + the REAL 41 guides
(depends_on s1..s11: verifies each slice's recorded UPGRADED verdict + on-disk >5 sections)
```

Two files (ledger + test). Fan-in dependency on s1–s11; no cycle; chain depth 2.

### File Specifications

#### File: `.ctoc/audit/corpus-audit-2026-06-15.json`
**Action:** MODIFY (append CU4c verdicts; no-churn on existing CU1/CU2 records)
**Purpose:** The no-silent-skip contract — every CU4c-scope file has a recorded verdict.
- For each of the 41 files, ensure a CU4c verdict entry exists: `UPGRADED` (default — the
  file now has >5 `## ` sections after s1–s11) or `SOLID-SKIPPED` (only if a slice
  explicitly recorded the file as already-solid with a rationale; not expected for CU4c,
  all 41 are thin).
- Record each entry with `path`, `cu4c_verdict`, `slice` (e.g. `CU4c-s1`), and `date`.
- Do NOT modify existing CU1/CU2 records. Whitelisted path (`.ctoc/*`).

#### File: `tests/cu4c-completeness.test.js`
**Action:** CREATE
**Purpose:** Asserts CU4c completeness against the REAL ledger + REAL guides — zero doubles.
- Reads the ledger via `fs.readFileSync` + `JSON.parse` (throw-on-invalid is the check).
- Holds the 41-file `IN_SCOPE` constant (the confirmed diff list above).
- Reads each of the 41 guides off disk and asserts `sectionCount(md) > 5` (proves the
  UPGRADED verdict is real, not fabricated).
- Asserts the completeness diff: every file in `IN_SCOPE` appears in the union of the
  ledger's CU4c `UPGRADED` ∪ `SOLID-SKIPPED` sets — diff MUST be empty (no silent omission).
- Asserts NO CU2 file (python/javascript/typescript/go/java/rust/csharp/c/cpp) is recorded
  under a CU4c verdict (scope-boundary guard — CU4c must not touch CU2's files).

### Test Plan

#### Tests: `tests/cu4c-completeness.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL ledger + REAL 41 guides off disk (mirroring
`tests/corpus-audit-ledger.test.js`). No mocks, no fixtures, no fakes.

Test cases:
1. **Ledger valid** — `JSON.parse` succeeds on the real ledger (throw = fail).
2. **In-scope constant is exactly 41** — the `IN_SCOPE` list has 41 entries, all distinct,
   none in the 9 CU2 files.
3. **Every in-scope guide is UPGRADED on disk** — for each of the 41, `> 5` `## ` sections
   read fresh off disk (verdict is real).
4. **Completeness diff empty** — `IN_SCOPE \ (UPGRADED ∪ SOLID-SKIPPED)` is empty AND
   `(UPGRADED ∪ SOLID-SKIPPED) \ IN_SCOPE` recorded under CU4c is empty (no phantom, no
   omission).
5. **Scope-boundary guard** — no CU2 file appears under a CU4c verdict.
6. **Suite stays green** — this test is part of `node --test tests/*.test.js` → `# fail 0`.

**Coverage note:** content/ledger-grounding substitutes for line/branch coverage
(CU1 s6 / CU2 convention).

### Security Review

- Reads a JSON ledger + Markdown guides + appends verdict entries to a `.ctoc/*`-whitelisted
  file; no runtime path, no user input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- `JSON.parse` on a repo-controlled file (not untrusted input); no `eval`.
- Only the two enumerated files touched.

## Execution Plan

### Step 8: TEST
Confirm baseline green. Create `tests/cu4c-completeness.test.js` reading the REAL ledger +
the REAL 41 guides. Run it — expect it to reflect current state: RED on the "every in-scope
guide is UPGRADED" + "completeness diff empty" cases until s1–s11 are built and their
verdicts recorded (this slice runs LAST, after s1–s11 per `depends_on`).

### Step 9: PREPARE
Confirm s1–s11 are complete (all 41 guides now >5 `## ` sections on disk) and each recorded
its per-file `UPGRADED` verdict in the ledger (Step 15 of each upgrade slice). Re-derive the
41-file in-scope list from disk (`skills/languages/*.md` at the time; the 9 CU2 files are
≥10 sections) to confirm the constant still equals 41.

### Step 10: IMPLEMENT
Append any missing CU4c verdict entries so all 41 files are recorded `UPGRADED` /
`SOLID-SKIPPED` in `.ctoc/audit/corpus-audit-2026-06-15.json`. Do NOT modify existing
CU1/CU2 records. Finalize `tests/cu4c-completeness.test.js`. ONE step, two files.

### Step 11: REVIEW
Self-review: the 41 in-scope list matches the audit-ledger diff and disk; every file has a
CU4c verdict; no CU2 file recorded under CU4c; existing ledger records untouched (diff
additive).

### Step 12: OPTIMIZE
Keep the ledger additions minimal + structured; the test's IN_SCOPE constant is the single
source of the 41 — no duplication.

### Step 13: SECURE
Run the Security Review checklist; `JSON.parse` on the repo ledger only; only the two
enumerated files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; `tests/cu4c-completeness.test.js` GREEN
(completeness diff empty, all 41 UPGRADED on disk, scope-boundary guard passes). Confirm
`tests/corpus-audit-ledger.test.js` still passes (existing CU1 records intact).

### Step 15: DOCUMENT
Record in `## Decisions Taken Under Ambiguity`: the final 41-file verdict summary, any
`SOLID-SKIPPED` rationale (none expected), and any per-slice omitted-for-lack-of-source
findings aggregated from s1–s11.

### Step 16: FINAL-REVIEW
Confirm: all 41 CU4c-scope files recorded UPGRADED/SOLID-SKIPPED with zero silent omissions;
completeness diff empty; no CU2 file touched; only the two enumerated files edited; full
suite green. CU4c is complete and ready for Gate 2 batch approval with its siblings.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| A slice's file silently omitted from the ledger | Completeness test asserts IN_SCOPE \ (UPGRADED ∪ SOLID-SKIPPED) is empty — a missing verdict fails the suite | Step 10, Step 14 |
| A verdict recorded UPGRADED but the file is still thin | Test reads the file off disk and asserts >5 `## ` sections — a fabricated verdict fails | Step 10, Step 14 |
| Scope creep into a CU2 file | Scope-boundary guard test asserts no CU2 file under a CU4c verdict | Step 11, Step 14 |
| Corrupting existing CU1/CU2 ledger records | Additive-only append; `tests/corpus-audit-ledger.test.js` re-run to confirm CU1 records intact | Step 11, Step 14 |
| In-scope count drifts from 41 | Re-derive from disk at Step 9; IN_SCOPE constant asserted `=== 41` and disjoint from the 9 CU2 files | Step 9, Step 14 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review
