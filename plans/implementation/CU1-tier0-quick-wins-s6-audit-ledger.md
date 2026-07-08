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
