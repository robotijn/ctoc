---
iron_loop: true
title: "CU1 s4 — dependency-checker CRA citations (web-verified) + last-verified lines"
type: implementation
parent_plan: CU1-tier0-quick-wins
depends_on: none
priority: HIGH
risk_level: LOW
files:
  - skills/security/dependency-checker/SKILL.md
---

# CU1 s4 — dependency-checker CRA citations + last-verified lines

> Slice 4 of the CU1 decomposition. Surgically add precise, WEB-VERIFIED EU Cyber
> Resilience Act citations to `dependency-checker/SKILL.md`, mirroring the exact
> precision of the sibling `skills/compliance/sbom-cra-checker/SKILL.md` and the
> `NTIA minimum elements` reference in `skills/security/dependency-auditor/SKILL.md`.
> Add a `last verified:` line. **No date or number may be invented — every fact
> carries an authoritative source URL verified at edit time (hard user rule).**

Maps to CU1 acceptance criteria: **"dependency-checker CRA references are
grounded"** and **"regulation-bearing skills gain last verified dates"** (for the
one regulation-bearing skill in scope).

## Implementation Details

### Architecture Decision

`dependency-checker/SKILL.md` currently references supply-chain security and
differential scanning (confirmed: lines 48–93 discuss SCA, signing, differential
mode) but carries **no** `Reg. (EU) 2024/2847`, no `11 Sep 2026` / `11 Dec 2027`
dates, and no `NTIA minimum elements` — while its siblings do. The sibling
`sbom-cra-checker` (read 2026-07-08) carries the exact precision to mirror:

- **Reg. (EU) 2024/2847** cited with Art. 64 (fines: €15M or 2.5% worldwide
  turnover) and Art. 13(25) (machine-readable SBOM format).
- **11 Sep 2026** — reporting obligations via ENISA Single Reporting Platform
  (24h early warning · 72h detailed · 14 days after corrective measure). Source:
  EC CRA Reporting page + ENISA SRP.
- **11 Dec 2027** — full conformity assessment applies. Source: EC CRA policy
  page.
- **NTIA minimum elements** — NTIA, *The Minimum Elements For a Software Bill of
  Materials*, July 2021, with the ntia.gov report URL (also referenced in
  `dependency-auditor/SKILL.md` line 57).

**Scope of `last verified:`:** the CU1 files: list contains exactly ONE
regulation-bearing skill in the compliance/security/legal categories:
`skills/security/dependency-checker/SKILL.md`. The parent AC "regulation-bearing
skills gain last verified dates" is therefore satisfied within CU1 by adding
`last verified: <date>` to THIS file only. `sbom-cra-checker` and
`dependency-auditor` are NOT in the CU1 files: list (no-churn — not edited); they
are the citation TEMPLATES to read, not targets to modify.

**last verified date value (decision under ambiguity, per parent Decisions):**
use the executor's actual retrieval date when the CRA facts are re-verified at
edit time against EUR-Lex / EC / ENISA — NOT a hardcoded audit date — because the
facts ARE re-checked during this slice. If the sources confirm unchanged facts,
the retrieval date is the verification event. Record the retrieval date and each
source URL in the ledger.

### Dependency Graph

```
skills/security/dependency-checker/SKILL.md (MODIFY: surgical citation addition
    + last verified: line)
    <--mirrors precision of-- skills/compliance/sbom-cra-checker/SKILL.md (READ-ONLY template)
    <--mirrors NTIA ref of--  skills/security/dependency-auditor/SKILL.md (READ-ONLY template)
```

Single-file slice. No cycle. `depends_on: none`.

### File Specifications

#### File: `skills/security/dependency-checker/SKILL.md`
**Action:** MODIFY (surgical addition only — no section rewrite, no-churn within file)
**Purpose:** Ground the CRA reference with regulation number, both enforcement
dates, NTIA minimum elements, authoritative source URLs, and a `last verified:`
line.
**Change Type:** surgical content addition

**Changes:**
- Add a compact CRA citation block (a few lines) into the existing best-practices
  / regulatory area of the skill, mirroring `sbom-cra-checker`'s wording. It MUST
  contain the literal strings the AC checks for:
  - `2024/2847`
  - `11 Sep 2026` (or `September 2026`)
  - `11 Dec 2027` (or `December 2027`)
  - `NTIA minimum elements`
- Each citation carries a `source:` URL or document reference (EUR-Lex for the
  regulation text, and/or EC CRA policy/reporting pages + ENISA SRP + ntia.gov —
  the same official sources `sbom-cra-checker` cites).
- Add a `last verified: <retrieval-date>` line in the skill header/regulatory
  area.
- Do NOT rewrite any existing section (differential scanning, signing, BAD/SAFE
  examples all stay).

### Test Plan

**No new test file** — this is content grounding, not code. Verification is the
content-contract assertion the CU1 AC defines, run against the REAL file:

Content-contract checks (zero doubles — read the real SKILL.md and assert):
1. File contains `2024/2847`.
2. File contains `11 Sep 2026` OR `September 2026`.
3. File contains `11 Dec 2027` OR `December 2027`.
4. File contains `NTIA minimum elements`.
5. Each added citation carries a `source:` URL / document reference.
6. File contains a `last verified:` line.
7. No pre-existing section was removed (diff shows additions only).

These can be executed as a grep-based verification at Step 14 (the AC is written
as content presence, not a persistent test-file assertion; if the executor adds a
regression test it must READ the real file, no mock).

### Security Review

- No code, no runtime path handling — content-only edit to one skill file.
- The added source URLs are public official domains (eur-lex.europa.eu,
  digital-strategy.ec.europa.eu, enisa.europa.eu, ntia.gov) — no secrets.
- Only one enumerated file edited.

## Execution Plan

### Step 8: TEST
Confirm baseline green. Establish the content-contract checks (the 7 presence
assertions above) against the CURRENT file — they must FAIL now (no `2024/2847`,
no dates, no NTIA, no `last verified:`), proving the checks test something. READ
`skills/compliance/sbom-cra-checker/SKILL.md` and
`skills/security/dependency-auditor/SKILL.md` for the exact citation wording and
source URLs to mirror.

### Step 9: PREPARE
**WEB-VERIFY the CRA facts at edit time** (hard user rule — no invented
dates/numbers): retrieve Reg. (EU) 2024/2847 from EUR-Lex and the EC CRA
reporting/policy pages + ENISA SRP + NTIA July-2021 report. Confirm: 11 Sep 2026
(reporting via SRP), 11 Dec 2027 (full conformity), Art. 64 fines, Art. 13(25)
format, NTIA seven data fields + three practices. Capture each source URL and the
retrieval date.

### Step 10: IMPLEMENT
Add the surgical CRA citation block + `last verified: <retrieval-date>` line to
`dependency-checker/SKILL.md`, mirroring the sibling precision. Do not rewrite
existing sections. ONE step, one file.

### Step 11: REVIEW
Self-review: all four literal facts present with sources; wording matches sibling
precision; only additions (diff clean); no other section changed.

### Step 12: OPTIMIZE
Keep the addition compact (mirror `sbom-cra-checker`'s density, not a duplicate
of the whole compliance skill — dependency-checker is a SCA skill, the CRA block
is a citation, not a full compliance treatise).

### Step 13: SECURE
Run Security Review checklist. Confirm all source URLs are official public
domains.

### Step 14: VERIFY
Run the 7 content-contract checks against the real file — all pass. `node --test
tests/*.test.js` → `# fail 0` (no test regresses; the frontmatter-conformance
block from s3, if merged, still passes since this file already has `type: skill`
if applicable / `tools:`).

### Step 15: DOCUMENT
Record in ledger (s6): each CRA fact with its source URL, the retrieval date used
as `last verified:`, and a note that `sbom-cra-checker` / `dependency-auditor`
were read as templates but NOT edited (no-churn).

### Step 16: FINAL-REVIEW
Confirm only `dependency-checker/SKILL.md` edited; all citations sourced;
`last verified:` present; nothing fabricated (every fact traceable to an official
URL).

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Wrong CRA date gives false confidence (HIGH impact) | Web-verify against EUR-Lex/EC/ENISA at edit time; cite source URL so the date is traceable | Step 9, Step 15 |
| Fabricated number/date (hard user rule) | Every fact carries an official source URL; mirror sibling skills that already cite them | Step 9, Step 11, Step 16 |
| Section rewrite churn | Surgical addition only; diff must show additions, not rewrites | Step 10, Step 11 |
