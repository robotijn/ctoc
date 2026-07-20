---
title: "Find out whether a human gate has ever been crossed unattended — a reusable auditor that cross-references sufficiency crossings against the questions files that authorised them"
type: implementation
parent_plan: none
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/sufficiency-audit.js"
  - "tests/sufficiency-audit.test.js"
---

# Find out whether a human gate has ever been crossed unattended

> **THIS SLICE LANDS FIRST, AND THE REASON IS NOT PREFERENCE.** The other six slices
> in this set CHANGE the shape of the questions store and the sufficiency ledger
> entry. An audit of the history must run against the history AS IT IS, before the
> instrument that produced it is modified. Auditing after the repair measures the
> repair, not the past.

## What was already established at planning time, and how

The question "has the self-crossing ever fired in this repository?" was answered
during planning, by looking rather than by reasoning:

| Probe | Result |
|---|---|
| `.ctoc/approvals/*.json` | **319 entries present** — the ledger directory exists and is populated |
| grep `sufficiency` across `.ctoc/approvals` | **no files matched** |
| `.ctoc/streaming/questions/**/*.json` | **2 files**, both `review/…` — a Gate 3 source, which `PRE_BUILD_DESTINATIONS` excludes from crossing |
| both questions files' `questions` array | **non-empty**, and every question carries `critical: true` explicitly |

**The finding: the self-crossing has never fired here.** That statement is worth
something ONLY because the first row is in the table. A grep that matches nothing
against a directory that does not exist is "I could not look"; the same grep against
319 present entries is "I looked and found nothing." **This slice exists to make that
distinction mechanical and repeatable in ANY CTOC project, rather than a fact
established once by hand in this one.**

## What the auditor must be able to say, and what it must refuse to say

Three verdicts, and the third is the one that matters:

| Verdict | Condition |
|---|---|
| `never-crossed` | the ledger directory EXISTS and is readable, and no entry has `advanced_by: 'sufficiency'` |
| `crossed` | one or more sufficiency entries found — each reported with its slug, `stage_from`, `stage_to`, timestamp, and the evidence string |
| `undetermined` | the ledger directory is absent or unreadable, or any entry file could not be parsed |

**`undetermined` must NEVER collapse into `never-crossed`.** They are the same output
from a naive implementation — an empty result set — and the entire subject of this
repair set is that "I found nothing" and "I could not look" have been rendering as the
same bytes. An auditor built to investigate that defect must not commit it.

A single unparseable entry file does not discard the whole run: the auditor reports
the crossings it DID find AND lists the files it could not read, with the overall
verdict degraded to `undetermined`. A partial answer that names its own gaps beats
both a confident wrong answer and a refusal.

### Cross-referencing — the part that gives the answer its weight

For each sufficiency entry found, the auditor resolves the questions file that
authorised it (`.ctoc/streaming/questions/<sanitised-ref>.json`, via
`streaming-precompute.questionsPath`) and reports, per crossing:

- the questions file's **presence** — present, absent, or unreadable;
- the **number of questions** it holds;
- how many carried `critical: true` or `important: true`;
- whether the list was **EMPTY** — the case this repair set exists for.

A crossing authorised by an empty list, or by a questions file that no longer exists,
is flagged as **unattested** in the report. That is the audit record of a human gate
that may have been crossed on no evidence at all.

The questions file may legitimately have been regenerated or removed since the
crossing — so `absent` is reported as `absent`, never inferred to have been empty.
The auditor states what it can see and marks the rest unknown.

## Implementation Details

### File: `src/lib/sufficiency-audit.js`
**Action:** CREATE
**Purpose:** Answer "has a gate ever been crossed without a human, and on what evidence?" — or say honestly that it cannot be determined.

#### Exports

- `auditSufficiencyCrossings(projectRoot)` → `{verdict, crossings, unreadable, ledgerPresent, scanned}`
  - `verdict` is one of `'never-crossed' | 'crossed' | 'undetermined'`
  - `crossings` is an array of `{slug, stageFrom, stageTo, at, evidence, ref, questions}` where
    `questions` is `{present: boolean|null, total: number|null, blocking: number|null, empty: boolean|null, unattested: boolean}`
  - `unreadable` is an array of `{file, reason}` — never silently dropped
  - `ledgerPresent` is the fact that separates the two empty results
  - `scanned` is the count of entry files examined, so a reader can tell a real scan from a no-op
  - Throws only on a non-string `projectRoot`. Every filesystem failure becomes a
    reported state, because an auditor that dies on a bad file tells you nothing about
    the good ones.
- `formatAuditReport(result)` → `string` — the human-readable rendering, used by the
  dashboard tool tab.

#### Dependencies
- `require('path')`, the project's `safeFs` wrapper (mirroring `approval-ledger.js`)
- `require('./approval-ledger')` for `ledgerDir` and `entryKind` — **the classifier is
  reused, never re-implemented.** `entryKind` already fails closed on an unrecognised
  `advanced_by`, and a second private copy of that logic in an auditor is exactly how
  the two drift.
- `require('./streaming-precompute')` for `questionsPath`

#### Cross-platform
`path.join` throughout; the ledger is read through `safeFs`; no shell invocation, so
nothing here depends on git being installed or on the platform's shell.

### File: `tests/sufficiency-audit.test.js`
**Action:** CREATE

| # | Case | Assertion |
|---|---|---|
| 1 | populated ledger, no sufficiency entries | `verdict === 'never-crossed'`, `ledgerPresent === true`, `scanned > 0` |
| 2 | **absent ledger directory** | `verdict === 'undetermined'`, `ledgerPresent === false` — **NOT `never-crossed`**. The load-bearing case |
| 3 | ledger present, one entry unparseable | `verdict === 'undetermined'`, the parseable crossings still reported, the bad file named in `unreadable` |
| 4 | one sufficiency entry, questions file present with 3 questions | `verdict === 'crossed'`, `questions.total === 3`, `unattested === false` |
| 5 | **one sufficiency entry, questions file holds an EMPTY array** | `unattested === true` — the defect's fingerprint in history |
| 6 | one sufficiency entry, questions file absent | `questions.present === false`, `total === null`, `unattested === true`; `null` is never rendered as `0` |
| 7 | a human-approved entry is not counted | an entry with `approved_by: human` and no `advanced_by` never appears in `crossings` |
| 8 | an entry with an unrecognised `advanced_by` | classified via `entryKind` as `unknown`, reported in `unreadable` with its reason — never silently skipped and never counted as a sufficiency crossing |
| 9 | the real repository | running against the live project root returns `ledgerPresent === true` and a defined verdict — the test that proves the auditor works on real data, not only on fixtures |
| 10 | report formatting distinguishes the two empties | `formatAuditReport` output for case 1 and case 2 differ, and neither reads as the other |

Fixtures under `os.tmpdir()`, removed with
`fs.promises.rm(root, { recursive: true, force: true })` in `finally`. The real
`.ctoc/approvals` is read but never written.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `auditSufficiencyCrossings` + `formatAuditReport` | `src/tabs/tools.js` — a new entry on the tools tab, rendering the report | `/ctoc:menu` → tools |

**The wiring is in THIS slice's Step 10, not a follow-up.** A module reachable only
from its own test is dead code with a certificate. The tools tab is the shipped
surface a human already opens, so `src/tabs/tools.js` receives the call site in the
same unit of work — **and it is declared in `files:` for that reason.**

> **Correction to this plan's own `files:` list, to be applied at Step 9:** the list
> above names two files; the wiring requires `src/tabs/tools.js` as a third. Add it to
> the frontmatter `files:` block before implementing, or the coverage hook will
> correctly block the edit. Three files is within the sizing rule.

## Test Plan

Covered by `tests/sufficiency-audit.test.js`. Cases 2, 5 and 6 are load-bearing: they
are the three ways this auditor could itself commit the defect it is auditing.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write `tests/sufficiency-audit.test.js` in full FIRST and run only that file. All ten
cases must be RED before `sufficiency-audit.js` exists. Record the red output
verbatim. Case 9 runs against the live repository — record what it reports about THIS
project, because that output is the answer to the question that motivated the slice.

### Step 9: PREPARE
Read from disk: `src/lib/approval-ledger.js` (`ledgerDir`, `entryKind`,
`writeSufficiencyEntry`, `readEntry` — note the exact field names an entry carries);
`src/lib/streaming-precompute.js` (`questionsPath`, `sanitizeRef`);
`src/lib/streaming-gate.js:394-442` (`crossBySufficiency`, to learn the evidence
string's shape); one real file from `.ctoc/approvals/` to see a live entry.
Add `src/tabs/tools.js` to this plan's `files:` block per the correction above.
**Where the code disagrees with this plan, THE CODE WINS — record it.**

### Step 10: IMPLEMENT
- `src/lib/sufficiency-audit.js` — the auditor, with the three-verdict contract.
- `tests/sufficiency-audit.test.js` — the ten cases.
- `src/tabs/tools.js` — the live call site rendering the report.

### Step 11: REVIEW
Confirm no path returns `never-crossed` without having positively established that the
ledger directory exists and was read. Confirm `null` is used for every unknown count
and is never rendered as `0` anywhere in the report. Confirm `entryKind` is called
rather than re-implemented.

### Step 12: OPTIMIZE
One directory listing plus one read per entry; the questions file for a ref is read at
most once. No globbing of the whole project.

### Step 13: SECURE
The evidence string is subagent-influenced text: pass it through the project's
`stripCtl` before rendering. Report repository-relative paths, never absolute home
directories. Never echo the contents of an unparseable entry file — name the file and
the parse error only.

### Step 14: VERIFY
`node --test tests/sufficiency-audit.test.js`, then the full gated run `npm test`.
Lint the changed JavaScript at `--max-warnings 0`. No git operations.
**Report the live verdict for this repository verbatim.**

### Step 15: DOCUMENT
Record the finding in the plan itself — whether the self-crossing has ever fired here,
with the counts that back it. Update `CLAUDE.md`'s documented test-file count in both
places, reading the live count from disk first (this slice adds a test file and
`tests/doc-counts.test.js` compares that count against disk).

### Step 16: FINAL-REVIEW
Report every verbatim Step 8 red, the live verdict, the number of ledger entries
scanned, any unattested crossing found, and every decision taken under ambiguity.

## What this plan does NOT fix

- It does **not** stop the unattended crossing. It only reports history. The stop is
  `00181` and `00182`.
- It does **not** recover crossings whose questions file was regenerated or deleted
  after the fact — those report `present: false` and are marked unattested, which is
  the honest limit of what disk can tell us.
- It does **not** audit human-approved or pipeline-advanced entries. Those paths were
  confirmed clean and are deliberately out of scope.
- It cannot see crossings that happened in a **different checkout** of the project;
  the ledger is per-working-tree.

## Decisions Taken Under Ambiguity

1. **Three verdicts, not two.** A boolean "has it fired?" cannot express "I could not
   look", which is the exact confusion this whole repair set addresses. An auditor
   that could commit the defect it audits is not worth writing.
2. **`ledgerPresent` and `scanned` are reported even when the verdict is obvious.** A
   reader must be able to distinguish a real scan from a no-op without trusting the
   verdict. The verdict is a conclusion; those two are the evidence for it.
3. **Unknown counts are `null`, never `0`.** `0` is a measurement. This is the same
   discipline `test-gate.js`'s parsers already follow, and the reason is identical.
4. **A partial read degrades the verdict but keeps the findings.** Discarding real
   crossings because one sibling file is corrupt would hide the very thing being
   looked for.
5. **This slice lands FIRST in the set.** The remaining slices change the store and
   the ledger evidence; the history must be read before the instrument is modified.
6. **`entryKind` is reused, not re-implemented.** It already fails closed on an
   unrecognised `advanced_by`, and that hardening exists because a classifier default
   once forged 26 approvals. A private second copy would drift from it.
7. **The auditor is a library plus a tools-tab entry, not a slash command.** CTOC ships
   exactly three slash commands and new capabilities go through the menu.
8. **`src/tabs/tools.js` is added to `files:` at Step 9 rather than being assumed.**
   The plan was drafted with two files and the wiring requirement was derived
   afterward; recording the correction is more honest than silently editing the list
   and pretending the derivation happened first.
