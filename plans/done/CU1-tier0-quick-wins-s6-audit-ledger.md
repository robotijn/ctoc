---
approved_by: human
approved_at: 2026-07-09T11:57:21.281Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T21:09:40.599Z
gate_crossed: implementation → todo
---

---
iron_loop: true
title: "CU1 s6 — audit ledger (.ctoc/audit/corpus-audit-2026-06-15.json)"
type: implementation
parent_plan: CU1-tier0-quick-wins
depends_on: CU1-tier0-quick-wins-s1-deployment-setup-tier1, CU1-tier0-quick-wins-s2-atomic-model-bump, CU1-tier0-quick-wins-s3-frontmatter-normalization, CU1-tier0-quick-wins-s4-regulatory-citations, CU1-tier0-quick-wins-s5-example-and-source-gaps
priority: HIGH
risk_level: LOW
files:
  - .ctoc/audit/corpus-audit-2026-06-15.json
---

# CU1 s6 — audit ledger

> Slice 6 (final) of the CU1 decomposition. Produces the per-file audit ledger at
> `.ctoc/audit/corpus-audit-2026-06-15.json` that every downstream corpus plan
> (CU2–CU5) diffs against to detect silent skips. **Runs LAST** — it records the
> verdicts and the count/discrepancy notes discovered by slices s1–s5, so it
> `depends_on` all five.

Maps to CU1 acceptance criteria: **"audit ledger is produced"**, **"count
mismatches are recorded, not blocked on"**, **"audit ledger covers downstream
consumers"**, and the recording obligations of **"no file outside the enumerated
target set is modified"**.

## Implementation Details

### Architecture Decision

The ledger is a single JSON artifact at the invariant path
`.ctoc/audit/corpus-audit-2026-06-15.json` (date-stamped so CU2–CU5 reference it
by a stable path — per parent Decisions). It contains **one record per file in
the CU1 `files:` frontmatter list**, each carrying:
- `path` — relative to repo root
- `line_count` — integer
- `section_count` — integer count of `##` headings (for agent/skill markdown;
  for the two test files and the JSON self-record, count is still computed but
  may be 0)
- `verdict` — one of `SOLID` / `THIN` / `DEFECTIVE`
- (recommended) `note` — free text for discrepancies (count mismatches,
  out-of-scope findings, the retrieval date used for `last verified:`, etc.)

The ledger runs LAST because it must reflect the FINAL state and the discoveries
of s1–s5: the 21-vs-14 model-bump count delta (s2), the exact 5 allowed-tools
files and any out-of-scope conformance finding (s3), the CRA source URLs +
retrieval date (s4), the chosen examples + rn-bridge sources (s5), and the
deployment-setup Tier-1 addition (s1).

**Recorded discrepancies discovered during decomposition (MUST appear in the
ledger with notes):**
1. `grep -rl "model_optimized_for: opus-4-7" agents/` = **21** files, not the
   audit's "~18". Of the 21, **14 are in CU1 scope**; the other 7
   (`agents/compliance/eu-ai-act-agent.md`, `.../eu-solution-recommender.md`,
   `.../gdpr-agent.md`, `agents/coordinator/ivv-chief.md`,
   `agents/planning/kpi-planner.md`, `.../stack-chooser.md`,
   `.../unit-economics-modeler.md`) are OUT of the files: list — recorded as
   `verdict: SOLID, note: "carries opus-4-7 but outside CU1 files: list; not
   edited (no-churn); needs a plan amendment to bump"`.
2. `grep -rl "allowed-tools:" skills/` = **5** files (matches the ~5 estimate).
3. **Three CU1 files: entries do not exist on disk** —
   `agents/planning/functional-reviewer.md`,
   `agents/planning/implementation-plan-reviewer.md`,
   `agents/planning/iron-loop-integrator.md`. The real integrator lives at
   `agents/iron-loop/iron-loop-integrator.md` (already a separate files: entry).
   These three phantom paths are recorded in the ledger as
   `verdict: DEFECTIVE, note: "path in CU1 files: list does not exist on disk;
   likely a mislabel — real integrator is agents/iron-loop/iron-loop-integrator.md;
   no file edited"`. **They are NOT created and NOT edited** — recording the
   discrepancy is the correct no-stub action.

### Dependency Graph

```
s1 (deployment-setup Tier-1)        ─┐
s2 (atomic model bump)              ─┤
s3 (frontmatter normalization)      ─┼─> s6 (audit ledger)
s4 (regulatory citations)           ─┤    reads the final state + discrepancy
s5 (example/source gaps)            ─┘    notes from s1–s5, emits the JSON
```

Dependency chain depth = 2 (s1–s5 → s6). No cycle. Single-file slice (the ledger
JSON).

### File Specifications

#### File: `.ctoc/audit/corpus-audit-2026-06-15.json`
**Action:** CREATE
**Purpose:** Per-file verdict artifact covering every CU1 target; the
no-silent-skip contract for CU2–CU5.
**Change Type:** new artifact (JSON)

**Shape:**
```json
{
  "audit_date": "2026-06-15",
  "produced_by": "CU1-tier0-quick-wins",
  "records": [
    {
      "path": "agents/infrastructure/deployment-setup.md",
      "line_count": 0,
      "section_count": 0,
      "verdict": "THIN",
      "note": "added tier:1/reports_to/dispatch_protocol; now enforced by TIER_1_AGENTS (s1)"
    }
    /* … one record per file in the CU1 files: list, plus the phantom-path and
       out-of-scope discrepancy records described above … */
  ]
}
```

**Coverage requirement:** the record set MUST cover every file in the CU1 `files:`
frontmatter list. Files evaluated-and-found-clean get `verdict: SOLID` with a
note. Files that were edited get `THIN` (was thin, now fixed) or the
appropriate verdict. The phantom-path entries get `DEFECTIVE` with the "does not
exist" note. The 7 out-of-scope opus-4-7 agents may be added as extra records for
downstream visibility (recommended, not required by the strict "files: list"
coverage).

**Validity:** MUST be parseable by `JSON.parse` (the AC).

### Test Plan

Content-contract, zero doubles — verification reads the REAL ledger file and
asserts:
1. File exists at `.ctoc/audit/corpus-audit-2026-06-15.json`.
2. `JSON.parse(fs.readFileSync(...))` succeeds (valid JSON).
3. Every path in the CU1 `files:` list appears as a `records[].path`.
4. Each record has `path` (string), `line_count` (integer), `section_count`
   (integer), `verdict` ∈ {SOLID, THIN, DEFECTIVE}.
5. The discrepancy records exist: the 3 phantom paths (DEFECTIVE), the 7
   out-of-scope opus-4-7 agents noted, the 21→14 model-bump count note.

If the executor adds a regression test, it READS the real JSON and asserts — no
mock/stub/fake.

### Security Review

- Path traversal: the ledger is written to the fixed `.ctoc/audit/` directory —
  no user-provided path. Ensure `.ctoc/audit/` exists (create dir with
  `fs.mkdirSync(..., { recursive: true })` if the implementer scripts it) — but
  the deliverable is the JSON file, likely hand-authored from s1–s5 findings.
- No secrets in the ledger (paths, counts, verdicts, source URLs only).
- Safe file operation: writes only under `.ctoc/audit/`.
- JSON is data, not code — no injection surface.

## Execution Plan

### Step 8: TEST
Confirm baseline green. Establish the 5 content-contract checks above against the
(not-yet-existing) ledger — check 1 must FAIL now (file absent), proving the
check tests something. Confirm s1–s5 are complete (this slice depends_on all
five) so their findings are available to record.

### Step 9: PREPARE
Gather the final state + discrepancy notes from s1–s5: deployment-setup verdict
(s1), the 21→14 model-bump delta + 7 out-of-scope list + line-255 branch (s2),
the 5 allowed-tools files + any conformance finding (s3), the CRA source URLs +
`last verified:` retrieval date (s4), the chosen examples + rn-bridge sources
(s5). Compute `line_count` and `section_count` for each in-scope markdown file by
reading it fresh. Ensure `.ctoc/audit/` directory exists.

### Step 10: IMPLEMENT
Write `.ctoc/audit/corpus-audit-2026-06-15.json` with one record per CU1 files:
entry (including the 3 phantom-path DEFECTIVE records and the 7 out-of-scope
SOLID-with-note records). ONE step, one file.

### Step 11: REVIEW
Self-review: every files: entry covered; verdicts valid; discrepancy notes
present and accurate; JSON well-formed.

### Step 12: OPTIMIZE
Keep records minimal and consistent (same key set per record). No redundant
fields.

### Step 13: SECURE
Run Security Review. Confirm write target is `.ctoc/audit/` only; no secrets.

### Step 14: VERIFY
Run the 5 content-contract checks against the real ledger — all pass.
`JSON.parse` succeeds. `node --test tests/*.test.js` → `# fail 0`.

### Step 15: DOCUMENT
The ledger IS the documentation. Confirm CU2–CU5 can diff their scope against it
(every downstream target must appear with verdict THIN/DEFECTIVE, not SOLID,
before those plans edit — and absence from the ledger is an error in the
downstream plan, not a free pass).

### Step 16: FINAL-REVIEW
Confirm: file at the exact invariant path; valid JSON; covers every CU1 files:
entry; all discrepancies recorded; only `.ctoc/audit/corpus-audit-2026-06-15.json`
created.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Ledger written before s1–s5 finish → stale/incomplete | `depends_on` all five slices; runs LAST in FIFO order | Frontmatter depends_on, Step 8 |
| A files: entry missing from records (silent skip) | Coverage check asserts every files: path appears as a record | Step 14 |
| Phantom paths silently created as empty files | Record as DEFECTIVE "does not exist"; do NOT create/edit them | Architecture Decision, Step 10 |
| Invalid JSON | JSON.parse check at Step 14 | Step 14 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation — tests/corpus-audit-ledger.test.js (7 checks, zero doubles, reads real ledger + real source files)
- [x] Test error conditions — phantom-absence + out-of-scope opus-4-7 spot-checks assert real disk state
- [x] Run tests - expect RED (failing) — all failed with ENOENT (ledger absent), proving the checks test something

### Step 9: PREPARE
- [x] Install dependencies if needed — none
- [x] Check prerequisites — verified s1–s5 shipped by reading REAL disk: 7 opus-4-7 files remain (exactly the out-of-scope set), 0 allowed-tools in skills/, deployment-setup tier:1, CRA citation present, s5 example fences present
- [x] Verify dev environment ready
- [x] Create directories/config if needed — mkdir -p .ctoc/audit

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — wrote .ctoc/audit/corpus-audit-2026-06-15.json (38 records; one per CU1 files: entry + 7 out-of-scope + 3 phantom)
- [x] Add error handling — n/a (static JSON data artifact)
- [x] Wire up integration points — ledger is the CU2–CU5 diff contract

### Step 11: REVIEW
- [x] Self-review all new code — every files: entry covered; verdicts valid; discrepancy notes accurate; JSON well-formed
- [x] Verify integration points work together — coverage check green
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations — consistent key set per record; no redundant fields
- [x] Optimize critical paths — n/a
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — fixed .ctoc/audit/ target, no user path
- [x] Sanitize outputs — paths/counts/verdicts/URLs only
- [x] No secrets in code — none
- [x] Safe file operations — write only under .ctoc/audit/

### Step 14: VERIFY
- [x] Run lint + type check — eslint exit 0, 0 warnings; tsc baseline-neutral (0 new errors; my files absent from the pre-existing src/ tsc list)
- [x] Run ALL tests (TDD Green) — node --test tests/*.test.js → tests 3417, pass 3416, fail 0, skipped 1 (pre-existing CTOC_SKIP_QUALITY, not mine)
- [x] Check coverage >= 80% — ledger test exercises 7/7 assertions over the whole artifact
- [x] 0 skipped, 0 flaky tests — my test file: 0 skipped, deterministic (reads disk)

### Step 15: DOCUMENT
- [x] Update relevant documentation — the ledger IS the documentation; verdict_legend + discrepancies blocks explain the CU2–CU5 diff contract
- [x] Add JSDoc comments to new functions — test file has file-level doc block
- [x] Update CHANGELOG if needed — n/a (data artifact)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed — spot-checked: 7 out-of-scope files really carry opus-4-7; 3 phantoms really absent
- [x] Ready for human review

## Decisions Taken Under Ambiguity

- **Test file placement (not in this slice's files: list).** The slice files: list names only the JSON ledger. Per the task's explicit authorization to write a ledger-validation test, I added `tests/corpus-audit-ledger.test.js` (RED→GREEN, zero doubles). The PreToolUse hook allowed it (tests are covered), and the plan's Test Plan mandates a content-contract test.
- **Coverage contract = union of s1–s5 files: lists + 3 phantom paths.** The parent CU1 plan is an index (empty top-level files:); the real scope is the union of slice files: entries. The ledger records all 28 real/phantom scope paths plus the 7 out-of-scope opus-4-7 agents = 38 records.
- **Verdict semantics for edited files = THIN.** Per the plan ("Files that were edited get THIN (was thin, now fixed)"), all s1–s5-edited files are recorded THIN with a note describing the fix and the fresh-read verification. The 7 out-of-scope files are SOLID (evaluated, not churned). The 3 phantoms are DEFECTIVE.
- **unit-test-runner retains model_optimized_for: opus-4-7.** It is a SKILL (not an agent) and outside the s2 agents/ scope; recorded as such in its note. This is NOT one of the 7 out-of-scope agents (which are all under agents/); it does not affect the 21=14+7 agent tally.
- **line_count/section_count read fresh 2026-07-08** from disk; phantom paths recorded as 0/0 (absent). Test files have section_count 0 (no `## ` headings), which is expected and not a defect.
