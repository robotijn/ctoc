---
iron_loop_verdict: true
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
  - "src/tabs/tools.js"
  - "CLAUDE.md"
approved_by: human
approved_at: 2026-07-30T19:04:14.528Z
gate_crossed: implementation → todo
---

# Find out whether a human gate has ever been crossed unattended

> **THIS SLICE LANDS FIRST, AND THE REASON IS NOT PREFERENCE.** The other six slices
> in this set CHANGE the shape of the questions store and the sufficiency ledger
> entry. An audit of the history must run against the history AS IT IS, before the
> instrument that produced it is modified. Auditing after the repair measures the
> repair, not the past.

## What was already established at planning time, and how

The question "has the self-crossing ever fired in this repository?" was answered
during planning, by looking rather than by reasoning (the counts below are a
PLANNING-TIME SNAPSHOT of this one repository — the auditor recomputes them live at
Step 14 and in test case 9, so they are context, not a build input):

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

**Where the `ref` comes from — read this first, it is the load-bearing mechanical
detail.** A sufficiency ledger entry stores NO `ref` field. Its persisted shape (see
`approval-ledger.writeSufficiencyEntry`) is
`{ content_sha256, hash_scope, stage_from, stage_to, approved_at, advanced_by:
'sufficiency', evidence, plan_basename? }`. The plan reference that names the questions
file lives ONLY inside the `evidence` string, which `streaming-gate.crossBySufficiency`
writes verbatim as:

```
sufficiency: <ref> — <N> question(s) answered (<id>, <id>, …); enough (no unanswered fork)[; <M> recorded answer(s) did not bind to this revision]
```

So the auditor extracts `ref` by matching the leading `sufficiency:\s*(\S+)\s+—`
segment of `evidence`. When the evidence string does not match that shape (a
hand-written or future-format entry), `ref` is `null`, the questions block is
`{present: null, …}`, and the crossing is still reported — an unresolvable ref is a
gap the auditor NAMES, never a silent skip and never a fabricated ref. (Reconstructing
`<stage_from>/<plan_basename>.md` is a deliberate NON-goal: `plan_basename` is optional
and the source-stage ref is exactly what `evidence` already records, so parsing the
recorded string is the faithful reading.)

For each sufficiency entry found, the auditor resolves the questions file that
authorised it via `streaming-precompute.questionsPath(root, ref)` (which sanitises the
ref identically to how it was sanitised when written), reads that file — shape
`{ ref, planMtimeMs, questions: [Question] }`, each `Question` being
`{ id, prompt, critical?, important?, options }` — and reports, per crossing:

- the questions file's **presence** — present, absent, or unreadable;
- the **number of questions** it holds (`questions.length`);
- how many carried `critical: true` or `important: true`
  (`questions.filter(q => q.critical === true || q.important === true).length`);
- whether the list was **EMPTY** (`questions.length === 0`) — the case this repair set
  exists for.

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
    `at` is the entry's `approved_at`, `ref` is the ref parsed from `evidence` (or `null`),
    and `questions` is `{present: boolean|null, total: number|null, blocking: number|null, empty: boolean|null, unattested: boolean}`
  - `unreadable` is an array of `{file, reason}` — never silently dropped
  - `ledgerPresent` is the fact that separates the two empty results
  - `scanned` is the count of entry files examined, so a reader can tell a real scan from a no-op
  - Throws only on a non-string `projectRoot`. Every filesystem failure becomes a
    reported state, because an auditor that dies on a bad file tells you nothing about
    the good ones.
- `formatAuditReport(result)` → `string` — the human-readable rendering, used by the
  dashboard tool tab.

#### How the scan works, mechanically

1. Resolve `ledgerDir(projectRoot)` (from `approval-ledger`). List `*.json` entries.
   A missing or unlistable directory ⇒ `ledgerPresent: false`, `verdict:
   'undetermined'`, `scanned: 0`. A listable directory ⇒ `ledgerPresent: true`.
2. For each `<slug>.json` file, derive the slug (basename minus `.json`) and read the
   entry through **`approval-ledger.readEntryResult(slug, projectRoot)`** — the shipped
   discriminated reader that already returns `{status: 'unkeyable'|'absent'|'corrupt'|
   'ok', entry}`. `scanned++` per file. On `corrupt`/`unkeyable`, push `{file, reason:
   status}` to `unreadable` and degrade the verdict to `'undetermined'` (still keep the
   crossings already found). This is deliberate reuse: the corrupt-vs-ok distinction is
   the exact fingerprint of this repair set, and it already exists — re-implementing a
   private `try/JSON.parse` would be a second, driftable encoding.
3. Classify each `ok` entry with **`approval-ledger.entryKind(entry)`** (reused, never
   re-implemented). Only `entryKind(entry) === 'sufficiency'` is a crossing. An
   `'unknown'` classification (an unrecognised non-empty `advanced_by`) is pushed to
   `unreadable` with reason `'unknown-provenance'` — never silently skipped and never
   counted as a sufficiency crossing. Human/backfilled/pipeline entries are ignored.
4. For each sufficiency entry, parse `ref` from `evidence`, resolve and read the
   questions file (step above), and build the `questions` sub-object with `null` for
   every unknown count.
5. Final verdict: `'undetermined'` if `ledgerPresent === false` OR `unreadable` is
   non-empty; else `'crossed'` if any crossing found; else `'never-crossed'`.

#### Dependencies
- `require('path')`, the project's `safeFs` wrapper (mirroring `approval-ledger.js`)
- `require('./approval-ledger')` for `ledgerDir`, `readEntryResult`, and `entryKind` —
  **the reader and the classifier are reused, never re-implemented.** `readEntryResult`
  already distinguishes `corrupt` from `absent` from `ok`; `entryKind` already fails
  closed on an unrecognised `advanced_by`. A second private copy of either in an auditor
  is exactly how the two drift.
- `require('./streaming-precompute')` for `questionsPath`

#### Cross-platform
`path.join` throughout; the ledger and the questions files are read through `safeFs`;
no shell invocation, so nothing here depends on git being installed or on the
platform's shell.

### File: `tests/sufficiency-audit.test.js`
**Action:** CREATE

Fixtures WRITE ledger entries through `approval-ledger.writeSufficiencyEntry` /
`writeEntry` (never hand-rolled JSON, so the entry shape can never drift from
production) and questions files through `streaming-precompute.writePlanQuestions`. The
`ref` embedded in each fixture's `evidence` string must match the `ref` passed to
`writePlanQuestions`, exactly as the live `crossBySufficiency` guarantees.

| # | Case | Assertion |
|---|---|---|
| 1 | populated ledger, no sufficiency entries | `verdict === 'never-crossed'`, `ledgerPresent === true`, `scanned > 0` |
| 2 | **absent ledger directory** | `verdict === 'undetermined'`, `ledgerPresent === false` — **NOT `never-crossed`**. The load-bearing case |
| 3 | ledger present, one entry unparseable | `verdict === 'undetermined'`, the parseable crossings still reported, the bad file named in `unreadable` (reason `'corrupt'`) |
| 4 | one sufficiency entry, questions file present with 3 questions | `verdict === 'crossed'`, `questions.total === 3`, `unattested === false` |
| 5 | **one sufficiency entry, questions file holds an EMPTY array** | `unattested === true` — the defect's fingerprint in history |
| 6 | one sufficiency entry, questions file absent | `questions.present === false`, `total === null`, `unattested === true`; `null` is never rendered as `0` |
| 7 | a human-approved entry is not counted | an entry with `approved_by: human` and no `advanced_by` never appears in `crossings` |
| 8 | an entry with an unrecognised `advanced_by` | classified via `entryKind` as `unknown`, reported in `unreadable` with reason `'unknown-provenance'` — never silently skipped and never counted as a sufficiency crossing |
| 9 | the real repository | running against the live project root returns `ledgerPresent === true` and a defined verdict — the test that proves the auditor works on real data, not only on fixtures |
| 10 | report formatting distinguishes the two empties | `formatAuditReport` output for case 1 and case 2 differ, and neither reads as the other |

Fixtures under `os.tmpdir()`, removed with
`fs.promises.rm(root, { recursive: true, force: true })` in `finally`. The real
`.ctoc/approvals` is read but never written.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `auditSufficiencyCrossings` + `formatAuditReport` | `src/tabs/tools.js` — a new entry on the tools tab, rendering the report | `/ctoc:start` → Tools |

**The wiring is in THIS slice's Step 10, not a follow-up.** A module reachable only
from its own test is dead code with a certificate. The tools tab is the shipped
surface a human already opens (`/ctoc:start` → Tools), so `src/tabs/tools.js` receives
the call site in the same unit of work — **and it is declared in the frontmatter
`files:` block for that reason (three files, within the sizing rule).**

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
Read from disk (the code is the authority — where it disagrees with this plan, THE
CODE WINS, and record the disagreement):
- `src/lib/approval-ledger.js` — `ledgerDir`, `readEntryResult` (the discriminated
  `{status, entry}` reader), `entryKind`, `writeSufficiencyEntry`, `writeEntry`; note
  the EXACT persisted field names an entry carries (`stage_from`, `stage_to`,
  `approved_at`, `advanced_by`, `evidence`, `plan_basename`).
- `src/lib/streaming-precompute.js` — `questionsPath`, `sanitizeRef`, and
  `writePlanQuestions` (the persisted questions-file shape `{ ref, planMtimeMs,
  questions }`).
- `src/lib/streaming-gate.js:498-546` — `crossBySufficiency`, to learn the EXACT
  `evidence` string shape the `ref` is parsed from.
- one real file from `.ctoc/approvals/` to see a live entry.

`src/tabs/tools.js` is already in this plan's `files:` block; no mid-build frontmatter
edit is required.

### Step 10: IMPLEMENT
- `src/lib/sufficiency-audit.js` — the auditor, with the three-verdict contract.
- `tests/sufficiency-audit.test.js` — the ten cases.
- `src/tabs/tools.js` — the live call site rendering the report.

### Step 11: REVIEW
Confirm no path returns `never-crossed` without having positively established that the
ledger directory exists and was read. Confirm `null` is used for every unknown count
and is never rendered as `0` anywhere in the report. Confirm `readEntryResult` and
`entryKind` are CALLED rather than re-implemented.

### Step 12: OPTIMIZE
One directory listing plus one read per entry; the questions file for a ref is read at
most once. No globbing of the whole project.

### Step 13: SECURE
The `evidence` string is subagent-influenced text: strip control characters before
rendering it in the report. There is no single shared `stripCtl` export — the codebase
replicates a one-line strip in each module that needs it (e.g. `streaming-gate.js:65`,
`tui.js:37`, and `src/tabs/tools.js` already has its own at line ~231). The auditor
library defines the same one-liner locally (`String(s).replace(/[\x00-\x1f\x7f-\x9f]/g,
'')`), matching the established pattern; the tools-tab render side reuses the `stripCtl`
already present in `tools.js`. Report repository-relative paths, never absolute home
directories. Never echo the contents of an unparseable entry file — name the file and
the parse reason only.

### Step 14: VERIFY
`node --test tests/sufficiency-audit.test.js`, then the full gated run `npm test`.
Lint the changed JavaScript at `--max-warnings 0`. No git operations.
**Report the live verdict for this repository verbatim.**

### Step 15: DOCUMENT
Record the finding in the plan itself — whether the self-crossing has ever fired here,
with the counts that back it.

Do NOT hand-edit CLAUDE.md's component counts. Since plan 00215 split
`tests/doc-counts.test.js`, the GROWING tallies (test files, `src/lib` modules) are
GENERATED into CLAUDE.md by `release.js`, and the test asserts `computeDocCounts`
equals an INDEPENDENT disk walk — it never parses the CLAUDE.md literal for those rows,
so adding this test file and this lib module CANNOT break `doc-counts.test.js` and
requires no CLAUDE.md edit. Editing (not adding) `src/tabs/tools.js` leaves the
dashboard-tab count unchanged, so the FIXED "dashboard tab files" contract is
unaffected too. CLAUDE.md is therefore correctly ABSENT from this plan's `files:`.

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
6. **`entryKind` and `readEntryResult` are reused, not re-implemented.** `entryKind`
   already fails closed on an unrecognised `advanced_by` — that hardening exists because
   a classifier default once forged 26 approvals — and `readEntryResult` already
   distinguishes corrupt from absent from ok. A private second copy of either would
   drift from the source of truth.
7. **The auditor is a library plus a tools-tab entry, not a slash command.** CTOC ships
   exactly three slash commands (`/ctoc:start`, `/ctoc:push`, `/ctoc:update`) and new
   capabilities go through the menu; the tools tab is reached via `/ctoc:start` → Tools.
8. **`ref` is parsed from the entry's `evidence` string, because the ledger stores no
   `ref` field.** `crossBySufficiency` writes the ref verbatim into `evidence`; parsing
   it back is the faithful reading. When the evidence does not match the known shape,
   `ref` is `null` and the questions block is reported unknown rather than fabricated.
9. **`src/tabs/tools.js` is declared in `files:` up front.** The wiring is part of this
   slice, so its target belongs in the coverage declaration from the start — not a
   mid-build frontmatter self-edit.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
