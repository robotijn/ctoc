---
approved_by: human
approved_at: 2026-07-18T11:11:00.143Z
gate_crossed: implementation → todo
---

---
title: "X9 — the gate critic persists its own questions: a quarantined write plus a render-time sweeper, so the payload never passes through the session model"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: streaming-human-loop
iron_loop: true
files:
  - "src/lib/streaming-questions-sweeper.js"
  - "src/lib/streaming-precompute.js"
  - "src/lib/streaming-gate.js"
  - "tests/streaming-questions-sweeper.test.js"
  - "tests/cache-freshness.test.js"
  - "agents/iron-loop/gate-critic.md"
  - "src/commands/menu.md"
---

# X9 — the critic's questions reach disk without the human waiting

## The defect (verified against the code, 2026-07-18)

`agents/iron-loop/gate-critic.md` declares `tools: Read, Grep` (line 4), and its
trust-boundary rule 6 calls that line "a load-bearing control — per Meta's Rule of
Two, you hold untrusted input but deliberately hold neither write tools nor an
outbound channel." The consequence is not a style problem, it is a broken loop:

- The critic's synthesized questions can leave only through its **return value**.
- A subagent's return value lands in the **dispatching model's context**.
- Someone — today, a human or the session model — must then hand-write
  `.ctoc/streaming/questions/<sanitized-ref>.json`.

So the *fleet* runs in the background (`src/hooks/SessionStart.js`
`questionDispatchDirective`, lines ~186–206, dispatches up to 5 subagents), but the
**persistence step does not**. The human waits in the foreground for the one step
that was supposed to be precomputed — the exact defect the whole streaming
never-wait design exists to prevent.

Note also that a subagent's `Write` tool writes a **file**; it cannot *call*
`streaming-precompute.writePlanQuestions`. So "give the critic Write and point it at
the real path" is not available either: an unvalidated file at the live path would be
read straight into the human's gate screen. A quarantine directory plus a validating
promoter is the only shape that gives the critic persistence without giving it the
power to author what the human reads.

## The decided fix (the human chose this; not re-litigated here)

1. `gate-critic` gains a **`Write` tool scoped to exactly one path family**:
   `.ctoc/streaming/questions/pending/<sanitized-ref>.json`.
2. A **render-time sweeper** — reached on the streaming render path, the same
   pattern as the dashboard's on-open reconcile in
   `src/lib/menu-screens.js:226-230` — reads each pending file, validates it through
   `streaming-precompute.writePlanQuestions(root, ref, questions, planMtimeMs)`, and
   deletes the pending file on success.
3. A malformed or hostile payload **fails validation and writes nothing**. The
   critic therefore gains no capability it did not already have through its return
   value: it can propose questions, it can never author the file the gate screen
   renders. The question payload never enters the session model's context.

## Rule-of-Two posture after this change (stated explicitly, because it moves)

| Property | Before | After |
|---|---|---|
| Untrusted input | yes (plan text, lens payloads) | yes — unchanged |
| Execution / shell | no | no — unchanged |
| Outbound channel | no | no — unchanged |
| Write channel | none | ONE quarantine path family, content-validated by a **separate** process before it can affect anything a human reads |

The critic still cannot reach the live questions path, cannot reach a plan file,
cannot reach `.ctoc/settings*`, and cannot emit anything the validator rejects. The
security property that was load-bearing — *the critic does not author what the human
reads at a gate* — is preserved by the validating promoter, not by the absence of a
Write tool.

---

## Implementation Details

### Dependency graph

```
src/lib/streaming-precompute.js  (MODIFY: + pendingQuestionsPath, + export refToPlanPath)
        ▲                                   ▲
        │ requires                          │ requires
src/lib/streaming-questions-sweeper.js (NEW)
        ▲
        │ requires (lazy, inside nextUnansweredQuestion)
src/lib/streaming-gate.js  (MODIFY: ONE call site — the live entry point)
        ▲
        │ menu.js (no args) → streamingGateScreen → gateScreenAt → richQuestionScreen
        │                                        → nextUnansweredQuestion  ← sweep here
        │ menu.js plan <ref> → planDecisionScreen → nextUnansweredQuestion  ← same funnel
        ▼
tests/streaming-questions-sweeper.test.js  (NEW — unit + the reachability proof)
tests/cache-freshness.test.js              (MODIFY — one justified whitelist entry)
agents/iron-loop/gate-critic.md            (MODIFY — the producer side of the contract)
src/commands/menu.md                       (MODIFY — the documented contract that is now wrong)
```

No cycle: `streaming-precompute` already requires `streaming-gate` lazily at call
time (line ~430), and the sweeper is required lazily inside `nextUnansweredQuestion`,
mirroring the established lazy-require pattern at `streaming-gate.js:246,324`.

---

### File 1: `src/lib/streaming-precompute.js`
**Action:** MODIFY
**Purpose:** keep ref sanitisation and ref→plan-path resolution in ONE module, so the
sweeper cannot drift from the writer it promotes into.
**Change type:** new-function + new exports; no behaviour change to any existing export.

#### Changes
- **Add** `pendingQuestionsPath(root, ref)` immediately after `questionsPath` (~line 97).
- **Update** `module.exports` (line 581) to add `pendingQuestionsPath` and
  `refToPlanPath`. `refToPlanPath` already exists (line 131) and is currently
  module-private; exporting it adds no new code path.

#### New export
- `pendingQuestionsPath(root: string, ref: string)` → `string|null`
  - Returns `path.join(root, '.ctoc', 'streaming', 'questions', 'pending', '<base>.json')`
    where `<base> = sanitizeRef(ref)`.
  - Returns `null` on a fundamentally invalid ref (non-string / empty / NUL /
    all-dots) — identical failure semantics to `questionsPath`.
  - Traversal-proof by construction: it reuses the SAME `sanitizeRef`, so
    `functional/../../etc/passwd` collapses to one inert filename segment inside the
    pending directory. **Do not write a second sanitiser.**
- `refToPlanPath(root: string, ref: string)` → `string|null` — now exported. Existing
  guards (`isUnsafeStage`, `isUnsafePlanFile`) unchanged.

#### JSDoc addition (required content)
Document that `pending/` is the **quarantine** directory: files there are written by
an agent that holds untrusted input, are never read by any gate screen, and become
visible to a human only after `streaming-questions-sweeper` validates and promotes
them through `writePlanQuestions`.

---

### File 2: `src/lib/streaming-questions-sweeper.js`
**Action:** CREATE
**Purpose:** promote validated pending question files into the live questions store,
discarding anything malformed or hostile, without ever throwing into a render.

#### Module header (required content — this is load-bearing, not decoration)
The header JSDoc MUST state, in full sentences:
- the quarantine model and why the critic may write here and nowhere else;
- the exact promoted path, and that a ref names a plan at `plans/<stage>/<file>.md`;
- that this module writes ONLY under `.ctoc/streaming/`, never a counted
  plan/vision/inbox file (this is the justification the cache-freshness whitelist
  entry in File 5 cites — the two must agree word-for-word in substance);
- that every failure path is fail-soft and returns a report rather than throwing;
- who reads the discard log (a human debugging "my critique never appeared").

#### Constants
- `PENDING_DIRNAME = 'pending'`
- `MAX_PENDING_BYTES = 512 * 1024` — a single pending file larger than this is
  discarded unread-past-the-cap. A gate question set is a few kilobytes; half a
  megabyte is already an attack or a bug.
- `MAX_FILES_PER_SWEEP = 50` — a flooded quarantine directory can never stall a
  render. Remaining files are left for the next sweep and reported.
- `MAX_LOG_BYTES = 256 * 1024` — the discard log is truncated (not rotated) past this.

#### Exports
- `pendingDir(root: string)` → `string|null`
  - `path.join(root, '.ctoc', 'streaming', 'questions', PENDING_DIRNAME)`; `null` for a
    non-string/empty root.
- `promotePendingFile(root: string, absFile: string)` → `{ok: true, ref: string} | {ok: false, reason: string, errors?: string[]}`
  - Validates and promotes ONE file. Never throws. Never unlinks — the caller owns
    deletion, so the decision to delete is testable in isolation from the decision to
    promote.
- `sweepPendingQuestions(root: string)` → `{promoted: string[], discarded: Array<{file: string, reason: string}>, deferred: number, errors: string[]}`
  - Enumerates, promotes, deletes. Never throws. An absent pending directory is the
    normal case and returns the empty report with no error.

#### `promotePendingFile` — the validation ladder, in this exact order
Each step's failure returns `{ok:false, reason}` with the reason string named below,
and the caller deletes the file. Stop at the first failure.

1. `lstatSync(absFile)` — must be a **regular file**. A symlink or directory →
   `'not-a-regular-file'`. (A symlink is never followed and never unlinked-through:
   see the deletion rule in `sweepPendingQuestions`.)
2. `size > MAX_PENDING_BYTES` → `'oversize'`.
3. `readFileSync(absFile, 'utf8')` throws → `'unreadable'`.
4. `JSON.parse` throws → `'unparseable'`.
5. Not a non-array object → `'wrong-shape'`.
6. `payload.ref` is not a non-empty string → `'missing-ref'`.
7. **Filename↔ref binding.** `pendingQuestionsPath(root, payload.ref)` must be
   non-null and `path.resolve()`-equal to `path.resolve(absFile)` → otherwise
   `'ref-filename-mismatch'`. This is the traversal and confusion guard: a critic that
   writes `pending/a.json` claiming `ref: "review/b.md"` is refused, so a pending file
   can only ever promote to the questions file its own name already implies.
8. `refToPlanPath(root, payload.ref)` is null → `'unknown-plan'`.
9. `statSync(planPath)` throws → `'plan-gone'`. Capture `currentMtimeMs = st.mtimeMs`.
10. **Supersession.** If `payload.planMtimeMs` is a finite number AND
    `payload.planMtimeMs < currentMtimeMs` → `'superseded'`. The critique was
    synthesized against a revision the plan has since moved past; promoting it would
    stamp stale questions as fresh and hide that from the human.
    `plansNeedingQuestions` will list the plan again and the fleet regenerates it.
    A missing/non-finite `planMtimeMs` is NOT a failure — see Decisions D-3.
11. `writePlanQuestions(root, payload.ref, payload.questions, currentMtimeMs)`.
    `{ok:false, errors}` → `{ok:false, reason:'invalid-questions', errors}`.
    `{ok:true}` → `{ok:true, ref: payload.ref}`.

**The freshness stamp is the sweeper's, never the payload's.** Step 11 passes
`currentMtimeMs` read at promotion time (step 9). A file stamped with anything else
reads permanently stale and the human is served the bare Approve screen — the exact
symptom `gate-critic.md` line 19 already warns about.

#### `sweepPendingQuestions` — enumeration and deletion
- `dir = pendingDir(root)`; `null` or `!existsSync(dir)` → empty report, no error.
- `readdirSync(dir, { withFileTypes: true })`; on throw → `{promoted:[], discarded:[],
  deferred:0, errors:[message]}`.
- Keep only entries where `entry.isFile()` is true and the name ends with `.json`.
  Directories and symlink entries are skipped and counted as discarded with reason
  `'not-a-regular-file'`, and are **not** unlinked (never delete through a link we did
  not create).
- Sort names with `localeCompare` so a sweep is deterministic across platforms.
- Process at most `MAX_FILES_PER_SWEEP`; `deferred = remaining count`.
- For each: `promotePendingFile`. On `ok` → push ref to `promoted`, `unlinkSync`. On
  failure → push `{file: basename, reason}` to `discarded`, `unlinkSync`. A quarantine
  file is consumed either way; leaving a rejected file behind makes every later sweep
  re-do the same work and re-log the same discard forever.
- Each `unlinkSync` is individually try/caught; a failed delete appends to `errors`
  and never aborts the sweep.
- **Only basenames** are placed in the report and the log — never a payload string,
  never file content. The report is read by a session model; content from an agent
  holding untrusted input does not travel there.
- Append one line per discard to `.ctoc/logs/streaming-sweeper.jsonl`:
  `{ts, file, reason}` (`reason` is one of the closed set of literals above — never
  free text derived from the payload). Best-effort inside its own try/catch;
  truncate the file first when it exceeds `MAX_LOG_BYTES`. A logging failure is never
  a sweep failure.

#### Cross-platform
`path.join` everywhere; `safeFs` for every filesystem call (`existsSync`,
`lstatSync`, `statSync`, `readdirSync`, `readFileSync`, `unlinkSync`,
`appendFileSync`, `mkdirSync`); no shell, no `process.platform` branch needed.

---

### File 3: `src/lib/streaming-gate.js`
**Action:** MODIFY
**Purpose:** make the sweeper reachable from a live entry point **in this slice**
(Operating Lesson 16).

#### Change — ONE call site
In `nextUnansweredQuestion(root, ref)` (line 239), **before** the existing
`precompute.loadPlanQuestions(root, ref)` at line 246, add:

```js
  // X9: promote any question file the gate critic dropped in the quarantine
  // directory BEFORE reading the store. Lazy require + try/catch mirrors the
  // established pattern below (lines 246, 324): a sweeper failure must never
  // reach the render. The sweep is idempotent and cheap (a readdir of a normally
  // empty directory).
  try {
    require('./streaming-questions-sweeper').sweepPendingQuestions(root);
  } catch { /* fail-soft: the human still gets the plain Approve screen */ }
```

**Why this call site and not `menu-screens.buildDashboardTable`:**
`nextUnansweredQuestion` is the single funnel BOTH question consumers pass through —
`richQuestionScreen` (line 547, reached from `gateScreenAt`, which serves
`streamingGateScreen`, `advanceAfter`, and `advanceExcludingSlug`) and
`planDecisionScreen` (line 639). The dashboard's on-open reconcile is the *pattern*
this copies (render-time, best-effort, never blocking); the dashboard is not where
questions are read, so sweeping only there would leave a promoted file unread until
the human happened to open the dashboard. One call site, both readers, promotion
always precedes the read.

`hasEnoughInformation` (line 324, the self-crossing predicate) is deliberately NOT
given a sweep: it fails closed on `not-computed`, so an un-swept plan is never
crossed on missing information — it simply is not crossed yet, and the next render
sweeps it.

---

### File 4: `tests/streaming-questions-sweeper.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`assert`), real temp directories under
`fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-sweeper-'))`, torn down in `after`.
**No mocks of core logic** — every case writes real files and reads real files.

#### Fixture helper
`makeProject()` → creates `plans/review/`, writes a real plan file
`plans/review/00099-fixture.md` with valid frontmatter, creates
`.ctoc/streaming/questions/pending/`, and returns `{root, ref: 'review/00099-fixture.md'}`.
`validQuestions()` → a two-question array satisfying `validatePlanQuestions`
(unique ids, unique option keys, one `recommended: true`).

#### Test cases
1. **Happy path — promotion.** Pending file `{ref, planMtimeMs: <plan mtime>, questions}`
   → `sweepPendingQuestions` reports `promoted: [ref]`, the pending file is gone, and
   `loadPlanQuestions(root, ref)` returns the two questions.
2. **The freshness stamp is the plan's CURRENT mtime.** After promotion, read the
   promoted JSON and assert `planMtimeMs === statSync(planPath).mtimeMs`, and assert
   `planQuestionsStatus(root, ref).status === 'ready'`. This is the regression pin for
   the bare-Approve-screen symptom.
3. **Absent pending directory.** No `pending/` at all → empty report, `errors: []`,
   nothing thrown.
4. **Empty pending directory** → empty report.
5. **Unparseable JSON** → discarded with reason `'unparseable'`, file deleted, no
   questions file written.
6. **Wrong shape** (a JSON array, and separately `null`) → `'wrong-shape'`.
7. **Missing ref** → `'missing-ref'`.
8. **Traversal / confusion attempt.** A file literally named
   `review__00099-fixture.md.json` whose payload claims
   `ref: '../../../../etc/passwd'` → `'ref-filename-mismatch'`; assert no file was
   created anywhere outside `.ctoc/streaming/questions/`, and the pending file is
   deleted.
9. **Ref/filename mismatch, benign form.** Payload ref names a *different real* plan
   than the filename implies → `'ref-filename-mismatch'`; assert the other plan's
   questions file was NOT created.
10. **Invalid questions contract** (duplicate question ids) → `'invalid-questions'`,
    `errors` non-empty, no questions file written, pending file deleted.
11. **Plan gone** — pending file for a ref whose plan file does not exist →
    `'plan-gone'`, nothing written.
12. **Superseded** — payload `planMtimeMs` older than the plan's current mtime (touch
    the plan after writing the pending file, asserting a strictly greater mtime) →
    `'superseded'`, no questions file written.
13. **Missing `planMtimeMs` still promotes** — payload without the field is promoted
    and stamped with the plan's current mtime (documents D-3 as behaviour).
14. **Oversize** — a pending file over `MAX_PENDING_BYTES` → `'oversize'`, nothing
    written.
15. **Non-`.json` and directory entries are ignored** — a `README.txt` and a
    subdirectory in `pending/` neither promote nor crash, and the directory is NOT
    deleted.
16. **Cap and deferral** — 55 valid pending files → `promoted.length === 50`,
    `deferred === 5`; a second sweep promotes the rest.
17. **Discard log** — after a discard, `.ctoc/logs/streaming-sweeper.jsonl` contains a
    parseable line whose `reason` is the expected literal and whose `file` is a
    basename; assert the line contains **no** payload text.
18. **Fail-soft on an unreadable directory** — replace `pending/` with a regular file
    so `readdirSync` throws → report carries an `errors` entry and nothing is thrown.
19. **REACHABILITY (Operating Lesson 16 — the wiring proof).** Drop a valid pending
    file for a plan that `pendingGateDecisions` actually returns, then call
    `streamingGate.streamingGateScreen(root)` and assert the rendered screen carries
    the critic's question `prompt` text. This proves a human reaches the critic's
    question through the live entry point, with no sweeper call in the test itself.
20. **Idempotence** — calling `streamingGateScreen` twice does not re-promote, does
    not throw, and does not change the promoted file.

#### Coverage targets
Every `reason` literal is exercised by at least one case; every `catch` block is
exercised (cases 3, 5, 11, 18); line and branch coverage on the new module ≥ 90%
(above the 80% new-code target, because this module is a security boundary).

---

### File 5: `tests/cache-freshness.test.js`
**Action:** MODIFY
**Purpose:** keep the CF1 guard honest for a new `src/lib` writer.

The guard broad-flags any `src/lib/*.js` containing a mutating filesystem call AND a
count-relevant path token. The sweeper contains `safeFs.unlinkSync(` /
`safeFs.appendFileSync(` (MUTATING_FS matches) and its header JSDoc contains
`plans/<stage>/<file>.md` (`\bplans\b` matches) — so it **will** be flagged, and it
does not bust the cache because it writes no counted file. That combination requires
exactly one whitelist entry:

```js
    // X9: the pending-questions sweeper writes ONLY under .ctoc/streaming/ —
    // promotion via streaming-precompute.writePlanQuestions, deletion of the
    // consumed quarantine file, and an append to .ctoc/logs/streaming-sweeper.jsonl.
    // Never a counted plan/vision/inbox *.md, so no plan-stage/vision/inbox count
    // can change and there is nothing to invalidate.
    ['streaming-questions-sweeper.js', 'writes only .ctoc/streaming/questions/** (promotion + quarantine cleanup) and .ctoc/logs/streaming-sweeper.jsonl; never a counted plan/vision/inbox file'],
```

The whitelist-honesty test (`whitelist is minimal — every entry is a real,
currently-flagged file`) asserts the entry is genuinely `detected && !safe`. That is
satisfied deterministically by the two required content facts above — which is why
the module header's `plans/<stage>/<file>.md` sentence is specified as REQUIRED in
File 2 rather than left to taste.

---

### File 6: `agents/iron-loop/gate-critic.md`
**Action:** MODIFY
**Purpose:** the producer side of the contract. Without this the sweeper sweeps an
always-empty directory — well-tested dead code.

#### Changes (each is a precise edit, not a rewrite)
1. **Frontmatter line 4:** `tools: Read, Grep` → `tools: Read, Grep, Write`.
2. **New section, placed immediately after the trust-boundary section**, titled
   **"Your ONE write — the quarantined pending file"**, stating literally:
   - The ONLY path you may ever write is
     `.ctoc/streaming/questions/pending/<sanitized-ref>.json`, where `<sanitized-ref>`
     is `ref` with every `/` and `\` replaced by `__`, then every character outside
     `[A-Za-z0-9._-]` replaced by `_`.
   - The file content is exactly one JSON object:
     `{ "ref": "<the brief's ref, verbatim>", "planMtimeMs": <the brief's stamp, digits copied character for character>, "questions": [ ... ] }`.
   - You NEVER write `.ctoc/streaming/questions/<sanitized-ref>.json` (the live path),
     never a plan file, never a settings file, never a log, never anywhere else. One
     path family, one file per dispatch.
   - You never read the file back and never read any other agent's pending file.
   - `ref` and the filename MUST agree. A file whose payload `ref` does not sanitise
     to its own filename is refused by the sweeper and deleted — say so, so the
     failure mode is not mysterious.
   - `planMtimeMs` older than the plan's current modification time is refused as
     superseded, and the fleet regenerates. That is correct behaviour, not an error.
   - Everything the "**Your output is written to disk — treat it as published**"
     boundary already says applies with full force: no secret, no credential, no
     non-plan file content in any field.
3. **Trust-boundary rule 6 (line ~79)** — rewrite the capability sentence to the
   post-change truth: you hold untrusted input and a SINGLE-PATH write into a
   quarantine directory whose content is validated by a separate process
   (`streaming-questions-sweeper` → `streaming-precompute.writePlanQuestions`) before
   it can affect anything a human reads; you still hold NO execution and NO outbound
   channel. Keep the Rule-of-Two citation and keep "never request, assume, or simulate
   a capability beyond it."
4. **Line 19** — replace "written to `.ctoc/streaming/questions/<ref>.json` (by the
   dispatcher, via `streaming-precompute.writePlanQuestions`)" with the new route:
   you write the pending file; the menu's render-time sweeper validates and promotes
   it. Keep the freshness-stamp warning verbatim — it is now the sweeper's stamp, and
   the debugging hint stays true.
5. **Line 330** — the paragraph beginning "**The object you emit is NOT the
   validator's input.**" Update: the sweeper passes `payload.questions` (the array,
   never the whole object) to `writePlanQuestions`, and the sweeper's own `ref` and
   `planMtimeMs` come from `payload.ref` and the plan's live modification time. Your
   top-level `ref` is now LOAD-BEARING (it is bound against the filename), not merely
   a cross-check — state that explicitly.
6. **Anti-Scope table row** "Validating and writing the questions file to disk | The
   dispatcher, via `streaming-precompute.writePlanQuestions`" → "Validating the
   questions and promoting them into the live store |
   `src/lib/streaming-questions-sweeper.js`, at menu render time, via
   `streaming-precompute.writePlanQuestions`. You drop the pending file; you never
   promote it and you never write the live path."
7. **Boundaries bullet** "**Advisory only.** Read/Grep only." → "**Advisory only.**
   Read and Grep, plus ONE quarantined write. You never write the plan, never move it,
   never stamp a marker, never call approvePlan." The rest of the bullet stands.
8. **`self_assessment` paragraph (line ~338)** — it currently says the payload is
   handed to a dispatcher. Add one sentence: when you persist via the pending file,
   `self_assessment` still travels ONLY in your return value to `cto-chief` and is
   never written to disk — it is not part of the pending payload.

**Not changed:** every quoting, neutralisation, id, tier, confidence, and ordering
rule. This slice changes the critic's *transport*, nothing about its *judgement*.

---

### File 7: `src/commands/menu.md`
**Action:** MODIFY
**Purpose:** the documented contract at "Streaming gate questions — background
precompute (never-wait)" (line 206) currently states a dispatcher-writes model that
is no longer true.

#### Changes
- **Step 4** (lines 302–308) — replace "**Validate and write** the synthesized JSON via
  `streaming-precompute.writePlanQuestions(root, ref, questions)` … The dispatcher
  writes the file; the critics never do." with: `gate-critic` writes its synthesized
  object to `.ctoc/streaming/questions/pending/<sanitized-ref>.json` itself — the
  payload never passes through the session model's context. The next menu render
  sweeps the quarantine directory (`streaming-questions-sweeper.sweepPendingQuestions`,
  reached from `streaming-gate.nextUnansweredQuestion`), validates each file through
  `streaming-precompute.writePlanQuestions`, stamps the plan's current modification
  time, and deletes the pending file. A malformed or hostile payload is discarded and
  logged; nothing is written and the human sees the plain Approve screen.
- Keep the "Any failure falls back silently to the plain gate question" paragraph — it
  is still exactly true.
- Keep the concurrency and fan-out prose unchanged.

---

## Security review (completed)

| Check | Result |
|---|---|
| Path traversal | Closed twice. The pending filename is produced by the SAME `sanitizeRef` (`/`,`\`→`__`, then `[^A-Za-z0-9._-]`→`_`), and step 7 binds `payload.ref` to the filename before anything is written. A pending file can only ever promote to the questions file its own name implies. |
| Symlink escape | `lstatSync` + `entry.isFile()`; symlink entries are never read, never unlinked-through, never promoted. |
| Input validation | Every field is type- and shape-checked before use; `writePlanQuestions` re-validates the full Question/Option contract independently, so the sweeper's checks are defence in depth, not the only line. |
| Untrusted content propagation | The report and the discard log carry only basenames and a CLOSED SET of reason literals. No payload string reaches the session model's context, the log, or the screen. |
| Denial of service | `MAX_PENDING_BYTES`, `MAX_FILES_PER_SWEEP`, `MAX_LOG_BYTES`; every rejected file is consumed so work never repeats. |
| Secrets | Nothing is read outside `.ctoc/streaming/questions/pending/` and the plan file's `stat` (never its content). No credential can enter the promoted file that `writePlanQuestions` would not already have accepted. |
| Prototype pollution | `JSON.parse` result is read field-by-field; no merge, no spread into a shared object, no dynamic property assignment from the payload. |
| Command injection | No `exec`, no `execSync`, no spawn, no shell anywhere in this slice. |
| Error-message leakage | Reasons are fixed literals; filesystem error messages go to `errors` (basename-scoped) and never to a rendered screen. |
| Fail-open vs fail-closed | The sweeper fails SOFT (render never breaks); the gate predicate `hasEnoughInformation` continues to fail CLOSED on `not-computed`, so a failed sweep can never cross a gate. |

---

## Decisions Taken Under Ambiguity

- **D-1 — the sweep hooks `nextUnansweredQuestion`, not `buildDashboardTable`.** The
  brief named "the render path that already runs the on-open reconcile". The
  dashboard reconcile is the *pattern* (render-time, best-effort, non-blocking); the
  dashboard is not where questions are read. `nextUnansweredQuestion` is the single
  funnel both question readers pass through, so one call site guarantees promotion
  precedes every read. Rationale recorded in the code comment at the call site.
- **D-2 — the sweeper stamps the plan's CURRENT mtime, and refuses a superseded
  payload.** The brief requires the current-mtime stamp (without it the file reads
  permanently stale). Stamping blindly would also launder questions written against
  an older revision into "fresh". Both are honoured: stamp current mtime, but reject
  when the payload's own `planMtimeMs` is strictly older than the plan's current
  mtime. `plansNeedingQuestions` then re-lists the plan and the fleet regenerates.
- **D-3 — a pending payload with no `planMtimeMs` is promoted, not refused.** The
  critic mints ids without a revision suffix when the dispatcher supplied no stamp
  (`gate-critic.md` line ~138), and that is documented as the honest state. Refusing
  it would delete a real critique over a missing optional field. It is stamped with
  the plan's current mtime, which is the same guarantee `writePlanQuestions` already
  gives every other producer.
- **D-4 — a rejected pending file is DELETED, not quarantined further.** Keeping it
  makes every later render re-read, re-reject, and re-log the same file forever. The
  discard log preserves the fact; the bytes are not needed, and the fleet regenerates
  from `plansNeedingQuestions`.
- **D-5 — the discard log lives at `.ctoc/logs/streaming-sweeper.jsonl`.** It mirrors
  the existing `.ctoc/logs/enforcement.json` pattern. Its READER is named in the
  module header: a human debugging "the critic ran but no question appeared". A log
  with no stated reader is a claim with no reader.
- **D-6 — seven files, not three.** The substantive code is three files (the sweeper,
  its test, one wiring call). The other four are the parts without which the slice
  ships dead: the critic cannot write without its frontmatter and rules
  (`gate-critic.md`), `pendingQuestionsPath` must live beside `sanitizeRef` so the
  sanitiser is not duplicated (`streaming-precompute.js`), the CF1 guard fails on an
  unlisted new writer (`cache-freshness.test.js`), and `menu.md` documents a contract
  this change makes false. Operating Lesson 16 forbids deferring the wiring to a
  follow-up; splitting here would ship exactly the dead machinery the lesson names.
- **D-8 (taken during Step 10) — `promotePendingFile` narrows its discriminated
  union with `=== true`, not a bare truthiness test.** `tsc --checkJs` could not
  narrow `{ok:true}|{ok:false,reason}` through `if (result.ok)` / `if (!written.ok)`
  and reported three TS2339 errors against the committed zero-error baseline. The
  fix is in the CODE (explicit literal comparison at both call sites), never a
  baseline raise. Typecheck is back to 0 errors.
- **D-9 (taken during Step 10) — the two permission-dependent test cases are
  REGISTERED CONDITIONALLY, never skipped.** Covering the `unreadable` reason and
  the failed-unlink error path needs real permission bits, which Windows ignores and
  root bypasses. `tests/streaming-questions-sweeper.test.js` probes the actual
  behaviour (write a file, `chmod 000`, attempt a read) and only registers those two
  cases when the probe proves the mechanism bites. A registered-but-skipped test
  would violate the zero-skipped gate; a registered-but-vacuous one would be false
  green. Measured result: the sweeper module is at **100.00% line / 93.85% branch /
  100.00% function** coverage, above the 90% target this plan set for a security
  boundary.
- **D-10 (found during Step 14, NOT resolved by me — see the report) — this slice
  adds one `src/lib` module and one test file, which increments two DOCUMENTED
  COUNTS** (`CLAUDE.md`'s "N JS modules" / "N test files" and the matching
  `README.md` numbers). Decision D-7's claim that no documentation outside this
  plan's `files:` set needs to change was WRONG on those count sentences. Those
  files are outside this plan's declared `files:` set AND are shared with a
  concurrent sibling plan that increments the same numbers, so editing them here
  would both widen scope and race another agent on the same file. Left untouched and
  reported instead.
- **D-7 — `CLAUDE.md` is NOT edited.** Its sentence "each writing through
  `streaming-precompute.writePlanQuestions`" remains true: every question still lands
  through that function. Only the caller changed — from the dispatcher to the sweeper.
  Editing it would add a file to the slice for no change in truth.

---

## Open Questions for the Human (asked, not guessed — Operating Lesson 15)

These are surfaced rather than decided. Neither blocks the slice as written.

1. **Do the three lens critics need the same quarantined write?**
   `src/hooks/SessionStart.js` (line ~199) instructs `premortem-critic`,
   `devils-advocate-critic`, and `red-team-critic` to write "via
   `streaming-precompute.writePlanQuestions`" — a JavaScript function call none of
   them can make (they hold no execution tool either). Their output feeds
   `gate-critic`, so today the loop still closes; but the directive as written
   describes something impossible. Extending the pending-file pattern to them, or
   rewording the directive, is a separate decision and a separate unit of work.
2. **Should the discard count surface in the menu INBOX?** Right now a discarded
   critique is visible only in `.ctoc/logs/streaming-sweeper.jsonl`. A repeatedly
   rejected critic is a real signal ("my questions never appear"), and CTOC's own rule
   is that a count with no door is the defect. Adding an inbox line is a UI decision.

---

## Acceptance criteria mapping

| Criterion | Implemented in | Test case |
|---|---|---|
| The critic can persist its questions without the session model | `gate-critic.md` frontmatter + the pending-write section; `streaming-precompute.pendingQuestionsPath` | 1, 19 |
| The promoted file is validated by `writePlanQuestions`, not by the critic | `promotePendingFile` step 11 | 1, 10 |
| A malformed or hostile payload writes nothing | `promotePendingFile` steps 1–10 | 5, 6, 7, 8, 9, 10, 11, 14 |
| Path traversal is impossible from a critic-authored ref | `pendingQuestionsPath` (shared `sanitizeRef`) + step 7 binding | 8, 9 |
| The freshness stamp is the plan's current mtime | `promotePendingFile` steps 9 and 11 | 2, 13 |
| The sweeper never crashes or blocks the render | try/catch at the call site; every sweeper path fail-soft | 3, 18, 20 |
| The sweeper is reachable from a live entry point in this slice | `streaming-gate.nextUnansweredQuestion` | 19 |
| Cross-platform | `path.join` + `safeFs` throughout | whole suite on the gate |

## Risk mitigations

| Risk | Mitigation | Where |
|---|---|---|
| A giving-Write regression re-opens the critic-authors-the-gate-screen hole | The critic can only reach `pending/`; the live path is written exclusively by `writePlanQuestions`, which re-validates independently | `promotePendingFile` step 11; `gate-critic.md` write-scope section |
| Stale questions laundered as fresh | Supersession check refuses an older payload stamp | `promotePendingFile` step 10; test 12 |
| Quarantine directory flooded | Per-file size cap, per-sweep file cap, consume-on-reject | `MAX_PENDING_BYTES`, `MAX_FILES_PER_SWEEP`; tests 14, 16 |
| A sweeper bug bricks the menu | Lazy require inside try/catch at the single call site; every sweeper path returns a report instead of throwing | `streaming-gate.js` call site; tests 3, 18 |
| Silent discards hide a broken critic | Discard log with a named reader, plus the report | D-5; test 17; Open Question 2 |
| CF1 drift (a new writer that does not bust the cache) | Justified whitelist entry, kept honest by the whitelist-honesty test | File 5 |

---

## Execution Plan

### Step 8: TEST — [x] DONE, RED CAPTURED 2026-07-18

`tests/streaming-questions-sweeper.test.js` written in full (all 20 specified cases
plus the path-helper and fail-soft cases) and RUN BEFORE any implementation existed.
Recorded red evidence, verbatim:

```
Error: Cannot find module '../src/lib/streaming-questions-sweeper.js'
Require stack:
- /Users/doctony/Code/ctoc/tests/streaming-questions-sweeper.test.js
    at Module._resolveFilename (node:internal/modules/cjs/loader:1456:15)
  code: 'MODULE_NOT_FOUND',
✖ tests/streaming-questions-sweeper.test.js (21.294875ms)
ℹ tests 1  ℹ pass 0  ℹ fail 1  ℹ skipped 0
```

The original specification of this step follows.

Write `tests/streaming-questions-sweeper.test.js` in full — all 20 cases above,
including the reachability case (19) that drives `streamingGateScreen`. Run it and
**watch it fail** (the module does not exist yet). Red is required evidence, not a
formality: record the failure output before writing any implementation.

### Step 9: PREPARE — [x] DONE
- Re-read `src/lib/streaming-precompute.js` (`sanitizeRef`, `questionsPath`,
  `refToPlanPath`, `writePlanQuestions`) and `src/lib/safe-fs.js` (confirm
  `lstatSync`, `readdirSync` with options, `appendFileSync` are exported) fresh from
  disk before writing code.
- Confirm `.ctoc/streaming/questions/` exists in this repo and note whether `pending/`
  must be created by the writer (`mkdirSync({recursive:true})` in the critic's path is
  the agent's Write tool's job; the sweeper never creates the directory — an absent
  directory is the normal empty case).
- No new dependency. Nothing to install.

### Step 10: IMPLEMENT — [x] DONE
One step, files as sub-items, in dependency order:
- `src/lib/streaming-precompute.js` — add `pendingQuestionsPath`; export it and
  `refToPlanPath`; add the quarantine JSDoc.
- `src/lib/streaming-questions-sweeper.js` — the module, exactly as specified
  (constants, `pendingDir`, `promotePendingFile`, `sweepPendingQuestions`, required
  header content including the `plans/<stage>/<file>.md` sentence).
- `src/lib/streaming-gate.js` — the single sweep call at the top of
  `nextUnansweredQuestion`, with the rationale comment.
- `tests/cache-freshness.test.js` — the justified whitelist entry.
- `agents/iron-loop/gate-critic.md` — the eight edits listed in File 6.
- `src/commands/menu.md` — the step-4 rewrite listed in File 7.
No stubs, no TODOs. Any ambiguity met while building is resolved with a documented
choice appended to `## Decisions Taken Under Ambiguity`.

### Step 11: REVIEW — [x] DONE
Self-review against the Architecture Validation checks:
- dependency direction (`lib` → `lib` only; no `hooks`/`commands` import);
- no circular require at load time (the sweeper require is lazy, inside the function);
- single responsibility (the sweeper promotes and deletes; it never renders, never
  crosses a gate, never edits a plan);
- interface segregation (`promotePendingFile` takes a path, not a directory listing,
  so deletion is testable apart from promotion);
- naming matches the existing `streaming-*` module family;
- every reason literal is a closed-set constant, never interpolated payload text.

### Step 12: OPTIMIZE — [x] DONE
Confirm the sweep costs one `existsSync` + one `readdirSync` on the common path (an
absent or empty quarantine directory) — the normal render must add no measurable
work. Remove any redundant `statSync`. Confirm the sort and the cap do not allocate
per render when the directory is empty.

### Step 13: SECURE — [x] DONE
Walk the Security Review table above item by item against the written code, and
additionally:
- prove by test that no payload-derived string reaches the report, the log, or a
  rendered screen (case 17);
- prove the filename↔ref binding rejects both the hostile ref (case 8) and the
  benign-looking cross-plan ref (case 9);
- confirm no `exec`, no `spawn`, no shell, no network call was introduced;
- re-read the edited `gate-critic.md` write-scope section and confirm it names exactly
  one path family and forbids the live path in so many words.

### Step 14: VERIFY — [x] DONE
Run the **FULL gate**, not a file-scoped subset:

```
npm test
```

This is `src/scripts/test-gate.js`: the whole suite plus the coverage floor from
`.ctoc/coverage-baseline.json` (**99**, scoped to `src/**`) plus the zero-skipped
gate. `node --test tests/*.test.js` is NOT acceptable evidence for this step — it
bypasses both gates. Required result: `# fail 0`, 0 skipped, coverage at or above the
floor. A file-scoped run is an automatic kickback for this plan.

Additionally confirm in the same run:
- `tests/cache-freshness.test.js` passes with the new whitelist entry AND the
  whitelist-honesty test still passes (the entry is genuinely broad-flagged);
- `tests/architecture-invariants.test.js` and `tests/no-tier-3.test.js` still pass
  after the `gate-critic.md` frontmatter change;
- any test asserting agent `tools:` lines or the menu.md streaming section still
  passes; if one fails because it pinned the old contract, fix the CODE first and
  change the test only if it pins a contract this plan deliberately replaced —
  tightening toward the new behaviour, never loosening (Operating Lesson 14).

### Step 15: DOCUMENT — [x] DONE
- JSDoc on every exported function, with `@param`/`@returns` and the fail-soft
  contract stated.
- The module header content required in File 2 (quarantine model, promoted path,
  `plans/<stage>/<file>.md`, non-counted write scope, named log reader).
- `src/commands/menu.md` step 4 rewritten (File 7) — the user-facing contract.
- `agents/iron-loop/gate-critic.md` write-scope section (File 6) — the producer
  contract.
- No `CLAUDE.md` change (D-7).

### Step 16: FINAL-REVIEW — [x] DONE
Confirm every line of the Quality Bar:
- every acceptance criterion maps to an implementation action AND a test case;
- every new function has a typed signature, a description, and stated error handling;
- the dependency graph has no cycle and no orphan;
- happy path, every error path, and the traversal edge case are covered;
- the security checklist has no unresolved item;
- the sweeper is reachable from a live entry point and case 19 proves it;
- cross-platform (`path.join`, `safeFs`, no shell);
- `npm test` green with `# fail 0`, 0 skipped, coverage ≥ the floor;
- the two Open Questions are surfaced to the human, not silently decided.

Then STOP at Gate 3. Do not cross it.
