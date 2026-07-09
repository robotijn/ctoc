---
approved_by: human
approved_at: 2026-07-08T20:52:40.442Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4b s5 — 9-file completeness check (reconciled verdicts, zero doubles)"
type: implementation
parent_plan: CU4b-quality-configs
depends_on: [CU4b-quality-configs-s1-csharp, CU4b-quality-configs-s2-php, CU4b-quality-configs-s3-jvm, CU4b-quality-configs-s4-go-rust]
priority: MEDIUM
risk_level: LOW
files:
  - tests/cu4b-completeness.test.js
---

# CU4b s5 — 9-file completeness check

> Slice 5 (FINAL) of the CU4b decomposition (SIP1). Runs the CU4b-wide gate over ALL 9
> thin quality-config files upgraded by s1–s4. Edits NO config file — it adds one
> real-file completeness test that proves every named config is substantive AND carries a
> reconciled per-file UPGRADED verdict (no silent omission). Inherits the parent's Gate-1
> `approved_by: human` marker; Gate 2 & 3 batch via `approveSubplans('CU4b-quality-configs',
> …)`. `depends_on` all four upgrade slices — it must run LAST (mirrors CU3 s5, which runs
> `tests/cu3-completeness.test.js`). **HARD RULES:** **(1) NO STUBS** — a real, executing
> gate, not a placeholder. **(2) NO FABRICATED data** — the test reads real on-disk files;
> it asserts, it does not invent. **(3) ZERO TEST DOUBLES** — reads all 9 REAL config files
> + the audit ledger + the s1–s4 slice plans off disk; no mocks/fixtures/fakes.

Satisfies CU4b acceptance criteria: **"audit artifact updated and completeness check
passes"** (reconciled per-file UPGRADED verdicts + empty-diff no-omission check), and
re-asserts across all 9 files **"all thin configs reach sibling-family depth"**, **"every
section names a technology-specific identifier"**, **"all version claims carry dated
sources"**, **"config values are language-correct"**.

## Implementation Details

### Architecture Decision

The audit ledger `.ctoc/audit/corpus-audit-2026-06-15.json` is CU1's DONE artifact and is
OUTSIDE every CU4b slice's `files:` set — touching it is churn against a completed plan.
CU3 hit the identical situation and solved it with the **audit-ledger-fallback / reconciled
verdict** pattern (see `tests/cu3-completeness.test.js` lines 1–22): each upgrade slice
records its per-file UPGRADED verdict + template + dated sources in its own plan's
`## Decisions Taken Under Ambiguity` section, and the completeness test reconciles each
file's verdict by scanning (a) the ledger records, then (b) the CU4b slice plan files. A
named file with NO verdict in EITHER source is a silent omission and FAILS. This satisfies
the CU4b acceptance criterion "audit artifact updated with per-file verdicts" via the exact
mechanism CU3 shipped, WITHOUT any slice editing the CU1 ledger.

The canonical CU4b in-scope set is the **9** read-fresh-confirmed thin files (see the parent
index's Scope-confirmation table). The floor for the upgraded state is `> 5` `##` sections
(each started at `<= 5`).

### Dependency Graph

```
tests/cu4b-completeness.test.js  (CREATE)
   ├─reads─▶ 9 real config files (skills/quality-configs/{csharp,php,java,go,rust}/*.md)  [substance]
   ├─reads─▶ .ctoc/audit/corpus-audit-2026-06-15.json                                     [verdict source A, READ-ONLY]
   └─reads─▶ plans/{implementation,todo,in-progress,review,done}/CU4b-quality-configs*.md [verdict source B, READ-ONLY]
```

Depends on s1–s4 (their upgrades + recorded verdicts must exist for this gate to pass).
No config file edited here. No cycle.

### File Specifications

#### File: `tests/cu4b-completeness.test.js`
**Action:** CREATE. **Framework:** `node:test`. **Zero doubles** — mirrors
`tests/cu3-completeness.test.js` structure (`fs.readFileSync`, real ledger, real slice
plans). Named-set constant:

```
NAMED = [
  csharp/legacy.md, csharp/strict.md, csharp/strictest.md,   // s1
  php/legacy.md, php/strictest.md,                            // s2
  java/legacy.md, java/strictest.md,                          // s3
  go/strictest.md, rust/legacy.md,                            // s4
]   // exactly 9, floor: > 5 "## " sections each
```

**Test cases:**
1. all 9 named config files exist on disk.
2. every named file exceeds the `> 5` `##`-section floor (defeats a no-op false-green:
   each started at `<= 5`).
3. every named file is well past the stub floor (`> 90` lines).
4. every named file carries a dated source (`20(2[5-9]|[3-9]\d)` token) AND an `https?://`
   URL.
5. every named file names its own language identifier (a small per-file map: csharp→
   `.NET`/`Nullable`; php→`PHPStan`/`strict_types`; java→`Checkstyle`/`JaCoCo`; go→
   `golangci-lint`; rust→`clippy`).
6. **cross-language guard (corpus-wide):** no named file contains another family's
   signature token (csharp files free of `detekt`/`ktlint`; php files free of `RuboCop`/
   `SimpleCov`; java files free of `detekt`/`scalafmt`; go free of `clippy`/`Cargo.toml`;
   rust free of `golangci-lint`).
7. **no silent omission:** the reconciled verdict corpus (ledger + all CU4b slice plan
   files across `plans/{implementation,todo,in-progress,review,done}`) must mention each
   of the 9 named files AND an `UPGRADED` token in association — reconcile the same way
   `cu3-completeness.test.js` does (each named path must appear in the corpus text).
8. **scope-boundary hold:** enumerate the on-disk `skills/quality-configs/**/*.md` set;
   any file at `<= 5` `##` sections that is NOT one of the 9 named is a silently-skipped
   thin file and FAILS (proves the 9-file scope is complete — nothing thin left behind);
   any config NOT in the 9 that is `> 5` sections is fine (pre-existing SOLID).
9. the canonical NAMED list length is exactly 9 (no drift).

### Test Plan

Step 8 baseline: before s1–s4 land, this test RUNS RED (files still `<= 5` sections; no
UPGRADED verdicts recorded). After s1–s4 complete, it RUNS GREEN. Because s5 `depends_on`
s1–s4, the executor runs s5 after all four upgrade slices are done. `node --test
tests/*.test.js` → `# fail 0`.

### Security Review

- Content-only: adds ONE test file; no runtime path handling, no secrets.
- Reads the ledger + slice plans READ-ONLY; edits nothing but the new test file.
- Only the 1 enumerated file created.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write `tests/cu4b-completeness.test.js` — reads all 9 REAL config files + the real
      ledger + the real CU4b slice plans, zero doubles; asserts existence, `>5` sections,
      `>90` lines, dated http source, per-language identifier, corpus-wide cross-language
      guard, reconciled UPGRADED verdict per file (no omission), scope-boundary (no thin
      config left outside the 9), NAMED.length === 9.
- [ ] Run — expect RED until s1–s4 have landed + recorded verdicts.

### Step 9: PREPARE
- [ ] Confirm s1–s4 are complete (their upgrades on disk + UPGRADED verdicts in their
      slice-plan Decisions sections). Read `tests/cu3-completeness.test.js` fresh as the
      structural precedent to mirror.

### Step 10: IMPLEMENT
- [ ] Implement the completeness test exactly as specified (reconciled-verdict + scope
      boundary). ONE step, one file. No config edited.

### Step 11: REVIEW
- [ ] Self-review: the 9-file NAMED set matches the parent index Scope table; the reconcile
      scans ledger + all CU4b slice plans; the scope-boundary catches any thin config left
      outside the 9.

### Step 12: OPTIMIZE
- [ ] Read each file once; share helpers with the cu3-completeness structure; no redundant IO.

### Step 13: SECURE
- [ ] READ-ONLY on ledger + slice plans; only the new test file created; no secrets.

### Step 14: VERIFY
- [ ] `node --test tests/cu4b-completeness.test.js` → GREEN (after s1–s4).
- [ ] `node --test tests/*.test.js` → `# fail 0`, 0 skipped, 0 flaky.

### Step 15: DOCUMENT
- [ ] Append to `## Decisions Taken Under Ambiguity`: confirm the 9-file scope closed
      (in-scope-9 = UPGRADED ∪ SOLID-SKIPPED; SOLID-SKIPPED expected empty — all 9 were
      thin and upgraded); note the reconciled-verdict mechanism (CU3 precedent) used
      because the CU1 ledger is out of every slice's `files:`.

### Step 16: FINAL-REVIEW
- [ ] Only `tests/cu4b-completeness.test.js` created; the CU1 ledger NOT edited; the gate
      proves no thin quality-config file is silently skipped.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| A thin config silently left out of scope | Scope-boundary case enumerates ALL quality-configs and fails on any `<=5`-section file not in the 9 named | Step 10, test case 8 |
| Verdict unrecorded (ledger out of scope) | Reconcile from ledger + slice plans (CU3 precedent); missing verdict FAILS | Step 10, test case 7 |
| False-green (no-op) | Floor asserted `> 5` (each started `<= 5`) + `> 90` lines | Step 14, test cases 2–3 |

## Decisions Taken Under Ambiguity

(To be completed by the executor at Step 15 — must record: confirmation that the 9-file
in-scope set equals UPGRADED ∪ SOLID-SKIPPED with SOLID-SKIPPED empty; and that the
reconciled-verdict mechanism was used — verdicts read from the s1–s4 slice-plan Decisions
sections + the audit ledger — because the CU1 ledger `.ctoc/audit/corpus-audit-2026-06-15.json`
is out of every CU4b slice's `files:` and must not be churned. Nothing fabricated — every
assertion reads a real on-disk file.)
