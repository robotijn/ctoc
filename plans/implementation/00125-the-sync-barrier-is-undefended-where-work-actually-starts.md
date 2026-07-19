---
title: "The sync barrier is undefended where work actually starts — and the fourth instance of one pattern gets a mechanism instead of a fifth discovery"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00102-git-exclusivity-is-undefended-where-work-actually-starts
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "tests/scheduler-guarantees-under-mutation.test.js"
  - "tests/scheduler-rule-projection-gate.test.js"
---

# The sync barrier is undefended where work actually starts

## The defect, re-verified against the source rather than inherited

The scheduler's two entry points are different code paths:

| Function | Line | What it is |
|---|---|---|
| `canRun(candidate, registry)` | `src/lib/task-registry.js:884-889` | the **oracle** — may this one candidate run right now? |
| `nextRunnable(registry)` | `:904-916` | the **promotion projection** — the set that actually gets started |

Both delegate to `evaluateConcurrency` (`:838-868`), a ladder of
`1 max-concurrent → 2 sync-barrier → 3 git-exclusive → 4 file-conflict → ok`.
Rule 2 lives at `:845-847`, verbatim from disk:

```js
if (running.length > 0 && (candidate.kind === 'sync' || running.some(t => t.kind === 'sync'))) {
  return { run: false, reason: 'sync-barrier' };
}
```

The sibling slice established EMPIRICALLY — by running the eleven scheduler-touching
test files against a mutated copy, not by reading — that disabling Rule 2 **on the
promotion path only** leaves all 410 assertions green. That result is inherited, not
re-derived here, and Step 8 below requires it be reproduced before anything else is
believed.

What this plan DID verify by reading the current source:

1. **The vulnerable shape is accepted.** `assertSyncBlockedBy` (`:635-637`) constrains
   a `sync` only through its `blockedBy`; it says nothing about `gitOp`. And
   `addTask` normalises with `gitOp: spec.gitOp === true` (`:708`), as does the load
   path (`:327`). So **`addTask(r, { kind: 'sync', blockedBy: [...] })` produces a sync
   with `gitOp: false` by default** — the vulnerable shape is not exotic, it is what you
   get by not asking for a git flag. Two existing tests already build it that way
   (`tests/task-registry.test.js:506, :791`), though both are lifecycle tests that never
   reach `nextRunnable`.
2. **Every `sync` that reaches the promotion path in the suite carries `gitOp: true`.**
   Grepped: `scheduler-guarantees-under-mutation.test.js:224, :251, :277, :289`;
   `task-registry.test.js:332, :338, :345, :353, :361, :413, :548, :629, :883, :894,
   :903, :909, :914, :962`. Without exception.

### The mutual masking — this is the part worth understanding

The sibling slice closed the mirror image of this defect. The two rules have been
covering for each other:

- **Rule 3 was masked by Rule 2**, because every promotion-path candidate carrying a git
  flag was a `sync`, and Rule 2 refuses a sync before Rule 3 is reached.
- **Rule 2 is masked by Rule 3**, because every `sync` in the suite carries `gitOp: true`,
  and a git-flagged sync beside a running editor is refused as `git-exclusive` anyway.

Delete either rule and the other catches the same candidate, produces the same promoted
set, and every assertion stays green. Two rules, each undefended, each invisible because
the other was standing behind it.

The candidate that walks through the gap is a `sync` with `gitOp: false`. Traced by hand
through the ladder on the sibling's verified registry — `dep` implement done
`touches:['a.js']`; `barrier` sync `gitOp:false` queued `touches:[] blockedBy:['dep']`;
`other` review queued `touches:[]`:

- **Real code** promotes `['barrier']`. `barrier` starts (nothing occupies a slot), is
  folded into `projected` as running at `:912`, and `other` is then refused because
  `running.some(t => t.kind === 'sync')` is true.
- **Mutated code** promotes `['barrier','other']`. With Rule 2 gone, Rule 3 finds
  `candidate.gitOp === false` and `isEditing(other) === false` (empty `touches`), so both
  clauses are false; Rule 4's fast path skips on an empty candidate `touches`.

**A task starts alongside a live wave integration barrier** — precisely the one thing the
barrier exists to prevent.

### What this claim does NOT extend to, stated rather than glossed

The only production creator of a `sync` task is `src/lib/actions.js:1691`, and it sets
`gitOp: true` explicitly (`:1693`). So on today's shipped call graph the vulnerable shape
is **not** produced by the running product. The defect is in the scheduler's *guarantee*,
which is unconditional and is what `nextRunnable`'s own comment (`:897-899`) promises —
"starting the whole returned set never violates ≤5 / sync-barrier / git-exclusive /
file-conflict". A registry loaded from disk, a second call site, or any use of `addTask`
without an explicit flag produces the shape. This slice defends the guarantee; it does
not claim a live production incident, and it must not be written up as if it did.

---

## The pattern is now the subject

This is the **fourth** instance of one asymmetry: the scheduler's oracle is tested
exhaustively while the promotion projection that actually starts work is tested thinly.
Three were closed earlier today. The sibling ran a systematic hunt — eight predicates
mutated on the projection side across eleven test files — and found seven already
defended and this one open. **The hunt is complete and this is the last known instance.**

So closing it is necessary and insufficient. The question the human posed is whether the
pattern can be *prevented* rather than repeatedly *discovered*. The answer below is a
decision, not a menu.

### Decision: a mechanism is possible, it must be mutation-based, and it is PARTIAL

**A mechanism is possible.** It is built in this slice as
`tests/scheduler-rule-projection-gate.test.js`. But two honest qualifications ride with
it, and both are stated in the gate's own failure messages so the next author meets them
where it matters.

**Why it must be mutation-based.** "Is this condition defended?" means "does removing it
change an outcome some assertion observes." That is the definition of mutation testing.
Static analysis cannot answer it: defendedness is a property of the test suite's
assertions relative to program semantics, not a syntactic property of the source. No
parser can see it.

**The cheap alternative was considered and is provably useless here.** The obvious
lighter mechanism is *reason coverage*: instrument `evaluateConcurrency` to record which
`reason` it returned during a `nextRunnable` call, then assert every reason has been
observed on the promotion path. It fails on this exact defect, and the falsification is
checkable rather than asserted. `tests/task-registry.test.js:359-363` (ST-SYNC-4) calls
`nextRunnable` on a registry where a queued `sync` is refused with reason
`'sync-barrier'`, and asserts the resulting promoted set. Reason coverage would therefore
have reported Rule 2 as **covered on the promotion path** — while Rule 2 was in fact
undefended, because deleting it lets Rule 3 refuse the same candidate and the asserted set
never changes. **Coverage of any kind is blind to masking; masking is exactly the failure
mode here.** Line coverage was already 99.91% on this file when all four gaps were open.

**What the mechanism actually guarantees.** Two halves:

1. **Enumeration (a real mechanism, cheap, unconditional).** The gate extracts from
   `src/lib/task-registry.js` every decision-shaped reason literal — matching only
   `{ run: true|false, reason: '<literal>' }`, which selects exactly `:840`, `:846`,
   `:853`, `:864`, `:867`, `:887` and deliberately excludes the unrelated
   `reason: 'dep-missing' | 'dep-failed' | 'dep-cycle'` sites at `:1031-1045`, which
   carry no `run:` field. It asserts that set equals the declared set
   `{max-concurrent, sync-barrier, git-exclusive, file-conflict, blocked-dep, ok}`, and
   that every member except `ok` has at least one entry in the mutation table.
   **A future rule that returns a new reason fails the gate immediately**, with a message
   naming the rule and demanding a projection-side mutation. That is the property the
   human asked for, and it is genuinely mechanical.
2. **Execution (a real mechanism, costly).** For each table entry, the declared
   projection-side mutation is applied to a copy of the module outside the working tree
   and the eleven scheduler test files are run against it in place. The entry passes only
   when the **named** case goes red — not merely "something went red". Requiring a named
   case is what stops the confound that produced this whole family of defects: a rule that
   looks defended because a different rule's test caught the candidate.

**Where it is only a convention, said plainly.** The human ruled today that a rule which
cannot be checked is a wish. So:

- **A new rule that reuses an existing reason string is invisible to the enumeration.**
  Adding a third clause to Rule 3 that still returns `'git-exclusive'` slips through. No
  mechanism in this slice catches that. **Convention, not mechanism.**
- **Whether a declared mutation faithfully disables its rule is a human judgement.** The
  gate can prove a mutation makes a named case red; it cannot prove the mutation is the
  strongest available or that it isolates the rule. **Convention, not mechanism.**
- **Per-clause completeness is not enforced.** Rule 2 has two disjuncts and Rule 3 has two
  clauses. The table is keyed by reason and permits several entries per reason, but the
  gate only requires **at least one**. **Convention, not mechanism.**

That is the honest ledger: enumeration is mechanised, fairness is not. The convention
half is written into the gate's failure text and the table's header comment, where the
next author is forced to read it, rather than into a document nobody opens.

**Where the gate runs — decided, not deferred.** It runs inside `npm test`, the gated
entry point, unconditionally. A gate that lives behind an environment flag silently stops
being true, which is the failure this whole family of slices exists to correct. Its
runtime has **not been measured** and cannot be from this plan (four executors are editing
`src/` and `tests/` concurrently; running the suite now would contend and would produce an
uninterpretable result). Step 12 measures it. If the measured cost exceeds 60 seconds,
that is **reported to the human as a scheduling decision** — it is not resolved by quietly
moving the gate behind a flag.

---

## Implementation Details

### Dependency graph

```
tests/scheduler-guarantees-under-mutation.test.js  (Group D appended)
    └── requires ──> src/lib/task-registry.js            [UNCHANGED]

tests/scheduler-rule-projection-gate.test.js       (NEW)
    ├── reads (as text) ──> src/lib/task-registry.js     [UNCHANGED]
    ├── spawns ──> node --require <shim> --test <11 scheduler test files>
    └── names ──> Group D case ids in tests/scheduler-guarantees-under-mutation.test.js
```

No production file is created or modified. Nothing under `src/` is edited by this slice.

---

### File: `tests/scheduler-guarantees-under-mutation.test.js`
**Action:** MODIFY — append Group D; change nothing existing
**Purpose:** The promotion path's sync barrier gets its own defenders.

This file already carries the governing rule in its header: *every case names the EXACT
source mutation it defends against — file, line and the precise text to change*, and
*mutations are applied to a COPY of the module outside the working tree*. Group D follows
both unchanged, and extends the header with Group D's subject and the mutual-masking
explanation above.

Registries are built with the file's existing `mkReg`, `task` and `ago` helpers
(`:61-90`), which bypass `addTask` — required here, because `addTask` refuses an
`implement` task with empty `touches` and refuses a `sync` with an empty `blockedBy`.

**Every case below uses a `sync` with `gitOp: false`.** A `sync` carrying `gitOp: true` is
refused by Rule 3 when Rule 2 is deleted and therefore proves nothing — that is the
masking this group exists to break.

| # | Case | Registry (order matters — `nextRunnable` is FIFO over queued) | Assertion | Mutation it kills |
|---|---|---|---|---|
| D1 | **a `sync` candidate is NOT promoted while a real task runs** | `t1` implement **running** `touches:['a.js']` `gitOp:false`; `t2` sync queued `gitOp:false` `touches:[]` `blockedBy:[]` | promoted set is exactly `[]` | deleting the `candidate.kind === 'sync'` disjunct from `:845` |
| D2 | **no candidate is promoted while a real `sync` runs** | `t1` sync **running** `gitOp:false` `touches:[]`; `t2` review queued `touches:[]` `gitOp:false` | promoted set is exactly `[]` | deleting the `running.some(t => t.kind === 'sync')` disjunct from `:845` |
| D3 | **headline — a barrier promoted in THIS pass blocks the follower behind it** | `dep` implement `status:'done'` `touches:['a.js']`; `barrier` sync queued `gitOp:false` `touches:[]` `blockedBy:['dep']`; `other` review queued `touches:[]` `gitOp:false` | promoted set is exactly `['barrier']` | deleting Rule 2 (`:845-847`) entirely; and separately, dropping `kind` from the fold at `:912` (`projected.push({ ...cand, kind: 'review', status: 'running' })`) |
| D4 | **control — the barrier itself IS promoted when nothing occupies a slot** | `dep` implement `status:'done'` `touches:['a.js']`; `barrier` sync queued `gitOp:false` `touches:[]` `blockedBy:['dep']` | promoted set is exactly `['barrier']` | over-tightening Rule 2 into "never promote a sync", which would pass D1-D3 and deadlock every wave |
| D5 | **control — two ordinary non-sync tasks with disjoint files DO both promote** | `t1` implement queued `touches:['a.js']`; `t2` implement queued `touches:['b.js']` | both promoted | over-tightening Rule 2 into "one task at a time", which would pass D1-D4 and destroy concurrency |
| D6 | **the reason is `sync-barrier`, through the oracle, on D2's shapes** | D2's registry — note `t1` is **running**, deliberately | `canRun(t2, r)` → `{ run:false, reason:'sync-barrier' }` | pins that D1-D3's refusals are Rule 2 and not Rule 1, 3 or 4 firing by accident |

**D6 carries an explicit warning in its own comment, because the sibling slice got this
wrong once.** `canRun` builds its opposition from `runningTasks(registry, id)` (`:800-802`),
which filters on `isOccupying` — status `running` or `cancelling`. A registry whose tasks
are all `queued` gives `canRun` an EMPTY running set, and the correct answer is then
`{ run:true, reason:'ok' }`. D6's opposition must therefore be genuinely `running`. Writing
D6 against an all-queued registry produces a case that fails against correct code, and
"fixing" it by relaxing the assertion manufactures exactly the vacuous case this file
exists to prevent.

**Why D1/D2 and D3 are not redundant.** `projected` is seeded from the real running set at
`:905` and grown by the fold at `:912`. D1 and D2 exercise the **seeded** path; D3 exercises
the **fold** path, where the blocking sync did not exist as a running task when the pass
began. A mutation that drops `kind` from the fold leaves D1 and D2 green and kills only D3.

#### Masking analysis — which other rules could fire first, and why they cannot

A case that passes because an earlier rule caught the candidate has proven nothing. Rule 2
sits second in the ladder, so only Rule 1 precedes it; Rules 3 and 4 follow and would mask
it by producing the same refusal. The arithmetic is written out rather than assumed.

- **Rule 1 (max-concurrent, `:840`) cannot fire.** `MAX_CONCURRENT` is 5 (`:109`). No case
  in Group D puts more than two tasks in the projected set.
- **Rule 3 (git-exclusive, `:851-852`) cannot fire.** First clause needs
  `candidate.gitOp` — every candidate in Group D has `gitOp: false`, explicitly, and this
  is the single load-bearing choice in the whole group. Second clause needs
  `isEditing(candidate) && running.some(t => t.gitOp)`; `isEditing` is `touches.length > 0`
  (`:788`), and no task in any Group D case carries `gitOp: true`, so the right-hand side is
  false regardless of the candidate's files.
- **Rule 4 (file-conflict, `:858-865`) cannot fire.** In D1 the candidate's `touches` is
  empty, so the fast path at `:859` skips the rule entirely. In D2 and D3 the *blocking*
  task's `touches` is empty, so the `occupied` union is empty and `touchesOverlap` has
  nothing to match. In D5 the two files are disjoint by construction, which is what makes
  D5 a control rather than a coincidence.
- **Rule 0 (the dependency gate, `:908`) cannot fire for the wrong reason.** Every queued
  task in Group D either declares an empty `blockedBy` or names a dependency whose status
  is `done`, which satisfies both the sync branch (TERMINAL) and the non-sync branch
  (done-only) of `depsSatisfied` (`:817-825`).

Proof rather than argument: under the single-disjunct mutations the refusal must disappear
**entirely**, which it could not do if another rule were carrying it. Step 8 records that.

**No production file changes.** Rule 2 is implemented correctly; it is undefended on the
path that starts work. If any production behaviour changes, this slice is wrong.

---

### File: `tests/scheduler-rule-projection-gate.test.js`
**Action:** CREATE
**Purpose:** Assert that every scheduler rule is exercised on the promotion path, so a
rule added to the oracle without a projection-side defender fails immediately.

#### Structure

**1. The declared reason set (the ratchet).**

```js
const DECLARED_REASONS = Object.freeze([
  'max-concurrent', 'sync-barrier', 'git-exclusive', 'file-conflict', 'blocked-dep', 'ok'
]);
```

**2. The extractor.** Reads `src/lib/task-registry.js` as text with `fs.readFileSync` and
matches only decision-shaped returns:

```js
/\{\s*run:\s*(?:true|false)\s*,\s*reason:\s*'([a-z-]+)'\s*\}/g
```

This selects `:840`, `:846`, `:853`, `:864`, `:867`, `:887` and excludes the
`reason: 'dep-missing' | 'dep-failed' | 'dep-cycle'` sites at `:1031-1045`, which have no
`run:` field. **If the extractor finds zero matches it FAILS** — a scanner whose no-match
result is indistinguishable from success is the exact false-green signature this repository
fences. Never default to the passing value.

**3. The mutation table.** One entry per rule, several permitted per reason:

```js
{ reason, name, find, replace, expectRedCases: ['D3: ...', ...] }
```

`find`/`replace` are exact source substrings. **An entry whose `find` does not occur
exactly once in the source FAILS the gate** — a mutation that silently applies nowhere
would report "no red" and be read as an undefended rule, or worse, apply in two places.
Initial entries:

| reason | mutation (projection side) | must turn red |
|---|---|---|
| `sync-barrier` | delete Rule 2's body at `:845-847` | D1, D2, D3 |
| `git-exclusive` | delete Rule 3's body at `:851-854` | Group C cases (the sibling's) |
| `max-concurrent` | `running.length >= MAX_CONCURRENT` → `false` | the existing max-concurrency promotion cases |
| `file-conflict` | `touchesOverlap(candTouches, occupied)` → `false` | the existing file-conflict promotion cases |
| `blocked-dep` | delete `if (!depsSatisfied(cand, registry)) continue;` at `:908` | Group B cases |

`ok` is declared explicitly as the non-rule terminal with a written reason, so its absence
from the table is a stated decision rather than an omission.

**4. The no-op control — a required step, not a nicety.** Before any mutated run, the gate
runs the identical harness with **zero** mutations applied. **If the control is not
perfectly green, the harness is invalid and no result from it may be reported.** The gate
fails with that sentence as its message. The sibling learned this the hard way: its first
harness copied the whole `src` tree and ran COPIES of the test files, and its no-op control
returned four failures with zero mutations applied, because several tests resolve paths
from `__dirname` or read source text off disk. Every red that harness produced was
uninterpretable.

**5. The harness — the real tests run IN PLACE against a mutated module.**

1. `fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-sched-mut-'))`.
2. Copy `src/lib/task-registry.js` into it; rewrite each relative `require` to an absolute
   path built with `path.resolve` against the real module's own directory and embedded with
   `JSON.stringify`, so a Windows backslash cannot break the literal.
3. Apply the entry's `find` → `replace` **to the copy**.
4. Write a small loader into the same directory that patches `Module._resolveFilename` to
   redirect the one exact resolved path of `src/lib/task-registry.js` to the copy. The
   redirect map is an exact-path allow-list of a single entry — never a prefix or pattern.
5. `spawnSync(process.execPath, ['--require', loaderPath, '--test', ...SCHEDULER_TEST_FILES])`.
   The file list is explicit and **never includes this gate file**; the child additionally
   receives `CTOC_SCHEDULER_MUTATION_CHILD=1` and this file exits early when it sees it, so
   recursion is fenced twice.
6. `maxBuffer` is set explicitly and generously. The default 1 MB overflow throws and would
   record a passing suite as a failure — a false-green signature already fenced in this
   repository. Counters are parsed from the **complete** output, never a truncation, and the
   parser returns `null` (never `0`) when a counter is unreadable, exactly as
   `src/scripts/test-gate.js` does.
7. `fs.rmSync(dir, { recursive: true, force: true })` in a `finally`, so a thrown assertion
   cannot leak the directory.

**6. Tracked-file evidence, not attestation.** `fs.statSync(...).mtimeMs` is recorded for
`src/lib/task-registry.js`, `src/lib/task-reconcile.js` and both files in this plan's
`files:` list, before and after **every** run, and asserted unchanged. The tracked source is
never written, so there is nothing to revert and nothing to self-attest.

#### Cases

| # | Case | Assertion |
|---|---|---|
| G1 | the extractor finds the decision reasons | the extracted set is non-empty and equals `DECLARED_REASONS` |
| G2 | every rule has a projection-side mutation | every declared reason except `ok` has ≥1 table entry; failure message names the reason and demands one |
| G3 | every mutation applies exactly once | each entry's `find` occurs exactly once in the source |
| G4 | the no-op control is green | control run: `fail 0`, `skipped 0`; otherwise the gate fails with "the harness is invalid" |
| G5 | every declared mutation is caught by its named case | for each entry, the mutated run is red AND every id in `expectRedCases` appears among the failures |
| G6 | the tracked source is never modified | modification times identical before and after every run |

G2 is the ratchet the human asked for. G5 is what makes G2 mean something. G4 is what makes
G5 believable.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| Group D | `reg.nextRunnable` / `reg.canRun`, the real exported scheduler functions, called by `src/lib/task-reconcile.js` on every dashboard render | `npm test`, and `node src/commands/menu.js` |
| the gate | it IS a test file, executed by `node --test tests/*.test.js` and by `src/scripts/test-gate.js` | `npm test` |

Both files drive the real module through its real exports. Nothing is mocked, and the
ladder is not re-implemented in any test.

**Why the gate is a test file and not a module under `src/lib/`.** Two reasons, both
decisive. First, `src/lib/reachability.js:312` records that `tests/` is deliberately not a
caller surface — a scan module under `src/lib/` whose only caller is a test would trip the
reachability fence, and its second root would have to be
`src/lib/iron-loop-enforcer.js`. Second, that file is declared right now by two in-flight
plans (`00073` and `00110`); declaring it here would be a file conflict with concurrent
work — the scheduler's own Rule 4, applied to this slice's own scheduling. The gate's only
legitimate root is the gated test run, so it lives where that root reaches it.

---

## What this slice does NOT fix

1. **It changes no scheduler behaviour.** Rule 2 is already correct. This adds defenders
   and a gate, not a fix. If any production behaviour changes, the slice is wrong.
2. **It does not make the vulnerable shape unreachable.** It adds no guard forbidding a
   `sync` with `gitOp: false`. Whether the registry should refuse that shape outright is a
   production change and a separate decision that belongs to the human.
3. **It does not catch a new rule that reuses an existing reason string.** Stated above as
   a convention, not a mechanism.
4. **It does not enforce per-clause completeness.** One mutation per reason is the floor.
5. **It does not extend the gate to `src/lib/task-reconcile.js`.** The quarantine and the
   terminal-retention sweep are defended by existing cases (the sibling's hunt confirmed
   both go red under projection-side mutation), but they are not enumerated by this gate.
6. **It does not build a general mutation-testing framework.** The table is hand-written,
   scheduler-specific, and deliberately small.
7. **It does not touch `src/lib/task-registry.js`, `src/lib/task-reconcile.js`, or any
   other production file.**
8. **It does not re-run the sibling's asymmetry hunt.** That hunt is complete and this is
   its last open instance; the gate exists so the hunt need not be repeated.

## What could NOT be verified from this plan, and must be at Step 8

Four executors are editing `src/` and `tests/` concurrently. Running the suite from here
would contend with them and produce an uninterpretable result, so it was not run. The
following are therefore **inherited or reasoned, not measured**, and each is a Step 8
obligation:

1. **That disabling Rule 2 on the promotion path leaves all 410 assertions green.** The
   sibling's recorded measurement. Reproduce it before writing a line of Group D; if it does
   not reproduce, stop and report — the premise is gone.
2. **The count of scheduler-touching test files (eleven) and assertions (410).** Re-derive
   both; do not restate the sibling's numbers as if freshly measured.
3. **That `spawnSync` with `--require <shim>` correctly redirects module resolution for
   node's test runner in a child process.** Reasoned from the sibling's in-process shim,
   not executed. G4, the no-op control, is what proves it; if the control is not green the
   harness design is wrong and must be rebuilt, not worked around.
4. **The gate's runtime.** Unmeasured. Step 12 measures it.

---

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] **Reproduce the premise before writing anything.** Apply the Rule 2 projection-side
      mutation to a copy and run the eleven scheduler test files. Expected: all green. Record
      the verbatim counters. If it goes red, STOP — the premise is gone and the plan is wrong.
- [ ] Run the no-op control FIRST and record it verbatim. **If the control is not perfectly
      green, the harness is invalid and no result from it may be reported** — rebuild the
      harness, do not interpret its output.
- [ ] Write Group D (six cases) before any fix, each naming its file, line and exact
      mutation text in its own comment
- [ ] Run Group D against the unmutated module; green from birth is expected and is treated
      as INSUFFICIENT evidence
- [ ] Apply each named mutation to a COPY and observe each case go RED under its own
      mutation. Record a per-mutation table with verbatim counters and the case ids
- [ ] Write `tests/scheduler-rule-projection-gate.test.js` and observe G2 fail when a table
      entry is removed, and G5 fail when a table entry's `expectRedCases` is pointed at a
      case that does not defend it — a gate never seen failing is not a gate
- [ ] No case is rewritten to pass. If the plan specifies something impossible against
      correct code, record the correction here rather than adjusting silently

### Step 9: PREPARE
- [ ] Read `src/lib/task-registry.js:780-930` from disk — `isEditing`, `isOccupying`,
      `runningTasks`, `depsSatisfied`, `evaluateConcurrency`, `canRun`, `nextRunnable`
- [ ] Confirm from the current source: `MAX_CONCURRENT` (`:109`), the kind vocabulary
      (`:137`), `assertSyncBlockedBy` (`:635-637`), `addTask`'s `gitOp: spec.gitOp === true`
      (`:708`), and the load-path normalisation (`:327`)
- [ ] Confirm the decision-reason sites (`:840, :846, :853, :864, :867, :887`) and that the
      `dep-missing`/`dep-failed`/`dep-cycle` sites (`:1031-1045`) carry no `run:` field
- [ ] Read the whole of `tests/scheduler-guarantees-under-mutation.test.js`, including
      Groups A, B and C and the helper block at `:50-90`
- [ ] Enumerate the scheduler-touching test files from disk; do not inherit the list
- [ ] Re-grep every `kind: 'sync'` in `tests/` and confirm the premise still holds — that no
      promotion-path sync carries `gitOp: false`. Concurrent executors may have added one
- [ ] Record every place the code disagrees with this plan, and prefer the code

### Step 10: IMPLEMENT
- [ ] `tests/scheduler-guarantees-under-mutation.test.js` — Group D appended; header extended
      with Group D's subject and the mutual-masking explanation; Groups A, B, C untouched
- [ ] `tests/scheduler-rule-projection-gate.test.js` — created, with G1-G6, the frozen reason
      set, the mutation table, the no-op control and the harness
- [ ] `path.join` and `os.tmpdir()` throughout; no hardcoded separator, no `~`, no shell
- [ ] No production file edited; no file outside this plan's `files:` list touched
- [ ] No stub, no TODO, no skipped case

### Step 11: REVIEW
- [ ] Groups A, B and C are byte-identical apart from the header addition; all still green
- [ ] Every Group D case names a mutation and was OBSERVED red under it
- [ ] Every Group D case uses `gitOp: false` on its `sync` — a git-flagged sync proves
      nothing and its presence is a defect in the case
- [ ] The masking analysis is re-checked against the cases as written, not as planned
- [ ] The gate's failure messages state the convention half plainly — that a rule reusing an
      existing reason string is not caught, and that mutation fairness is a human judgement
- [ ] The gate was observed FAILING for each of its own reasons before being accepted

### Step 12: OPTIMIZE
- [ ] Group D is pure in-memory registry literals; no disk, no sleeps, no wall-clock read,
      no platform branch
- [ ] **Measure the gate's wall-clock runtime and record it verbatim.** If it exceeds 60
      seconds, report that to the human as a scheduling decision — do NOT move the gate
      behind an environment flag to make the number look better
- [ ] Confirm the mutated runs execute only the scheduler test files, never the whole suite

### Step 13: SECURE
- [ ] The harness writes only under `os.tmpdir()` via `fs.mkdtempSync`, and removes the
      directory in a `finally` block so a thrown assertion cannot leak it
- [ ] Requires in the copy are rewritten with `path.resolve` and embedded with
      `JSON.stringify`; no external input reaches a `require`; the resolution redirect is an
      exact-path allow-list of one entry, never a prefix or pattern
- [ ] `spawnSync` is called with an argument array and no shell; `maxBuffer` is explicit
- [ ] Counters are parsed from complete output and the parser returns `null`, never `0`, on
      an unreadable counter
- [ ] Modification times of `src/lib/task-registry.js`, `src/lib/task-reconcile.js` and both
      declared files recorded before and after EVERY run and asserted unchanged
- [ ] No harness artefact is written inside the working tree

### Step 14: VERIFY
- [ ] `node --test` on the scheduler-touching test files plus the new gate — verbatim counters
- [ ] Full gated run `npm test` — verbatim counters and the coverage line
- [ ] Coverage floor left at 99 — not lowered, and not raised
- [ ] No ratchet tripped: the reachability fence, the export-reachability fence and the
      false-green fence all green. Nothing whitelisted; no baseline file edited
- [ ] `npx eslint` clean on both declared files
- [ ] **No git operation of any kind.** Working-tree difference established by reading
      modification times, not by `git status`
- [ ] Any failure originating outside this plan's two files is reported as FOREIGN with
      evidence, never repaired and never used to justify re-rolling the run until it looks green

### Step 15: DOCUMENT
- [ ] The mutation test file's header states Group D's subject and the mutual masking in one
      paragraph: every promotion-path git candidate was a sync, and every sync was a git op,
      so each rule hid the other's absence
- [ ] The gate file's header states, in its own words, what it mechanises and what it does
      not — the reason-reuse blind spot and the mutation-fairness judgement
- [ ] The header records why reason coverage was rejected, with the ST-SYNC-4 falsification,
      so the cheap option is not re-proposed
- [ ] No CHANGELOG entry — this slice changes no product behaviour

### Step 16: FINAL-REVIEW
- [ ] All prior steps complete; all quality checks passed
- [ ] The eight things this slice does NOT fix are restated unchanged
- [ ] The four unverified items are either verified or reported still unverified — never
      quietly dropped
- [ ] The mechanism-versus-convention split is stated in the completion report in the same
      terms as here: enumeration is mechanised, fairness is not
- [ ] Plan moved to review with evidence; Gate 3 left to the human

---

## Ordering and file conflicts

**`depends_on: 00102-git-exclusivity-is-undefended-where-work-actually-starts`.** That
sibling adds Group C to `tests/scheduler-guarantees-under-mutation.test.js`, which this
slice also modifies. Same file, so this slice must not start until that one has settled.
The sibling also produced the finding this slice acts on, and its Group C cases are named in
this gate's mutation table — the table would be unsatisfiable without them.

`tests/scheduler-rule-projection-gate.test.js` is new and declared by no other plan.

`src/lib/iron-loop-enforcer.js` is deliberately NOT declared here, because plans `00073`
and `00110` both declare it and are in flight. That is the reason the gate is a test file
rather than a scan module, recorded above under Wiring.

No production file is declared, so this slice cannot collide with the four executors
currently editing `src/`.

---

## Decisions Taken Under Ambiguity

1. **No production file is edited.** Rule 2 is correct; the gap is in the defenders and in
   the absence of a mechanism. Touching `task-registry.js` would risk a real regression to
   close a test gap.
2. **A mechanism IS built, and it is mutation-based.** "Is this condition defended" is
   answered by removing the condition and observing whether an assertion notices. Static
   analysis cannot express that; mutation is its definition.
3. **Reason coverage was considered and rejected on evidence, not taste.** `ST-SYNC-4` at
   `tests/task-registry.test.js:359-363` returns `'sync-barrier'` from a `nextRunnable`
   call and asserts the promoted set, so a reason-coverage instrument would have reported
   Rule 2 as covered while it was undefended. Coverage cannot see masking; masking is the
   defect. Recorded so the cheaper option is not re-proposed later.
4. **The mechanism is declared PARTIAL, and the convention half is named.** A rule that
   reuses an existing reason string, the fairness of a chosen mutation, and per-clause
   completeness are all conventions. The human ruled that a rule which cannot be checked is
   a wish; so the wishes are labelled as wishes and written where the next author meets
   them, rather than dressed up as enforcement.
5. **The enumeration keys on decision-shaped reason literals, not on rule count.** Matching
   `{ run: true|false, reason: '<literal>' }` selects exactly the six decision sites and
   excludes the three unrelated `reason:` sites at `:1031-1045`. Counting `if` statements
   or parsing the function body would be more fragile and no more complete.
6. **The gate runs inside `npm test` unconditionally, and its cost is reported rather than
   hidden.** A gate behind an environment flag silently stops being true. If the measured
   runtime is unacceptable, that is the human's scheduling decision, not the executor's.
7. **The gate is a test file, not a module under `src/lib/`.** `reachability.js:312` records
   that a test is never a caller, so a scan module would need `iron-loop-enforcer.js` as a
   second root — and that file is declared by two in-flight plans. The gate's only
   legitimate root is the gated test run.
8. **Every Group D case uses a `sync` with `gitOp: false`.** This is the entire point. A
   git-flagged sync is refused by Rule 3 when Rule 2 is deleted, which is precisely the
   masking that hid this defect for four slices.
9. **D4 and D5 are controls and are not optional.** Without them the cheapest way to pass
   D1-D3 is to refuse everything, or never promote a sync at all — which would pass the
   group, deadlock every wave, and destroy concurrency. D4 pins that a barrier does start;
   D5 pins that ordinary work still runs in parallel.
10. **D6 pins the reason, and its opposition is genuinely running.** A case asserting only
    "not promoted" stays green under a mutation that breaks a different rule. And an
    all-queued registry gives `canRun` an empty running set, where the correct answer is
    `ok` — the sibling wrote that case impossibly once, so the warning is written into D6's
    own comment rather than left in this plan.
11. **Both the seeded path and the fold path are covered.** D1/D2 build the blocking task as
    really running; D3 has the barrier promoted within the same pass. A mutation that drops
    `kind` from the fold at `:912` kills only D3, which is why D3 exists separately.
12. **The no-op control is a required STEP, and its failure invalidates every result.** The
    sibling's first harness returned four failures with zero mutations applied, and every red
    it produced was uninterpretable. The control is written as a gate case (G4) with that
    sentence as its failure message, so the lesson cannot be forgotten by a later author.
13. **Mutations go to a copy outside the working tree, never to the tracked file, and the
    claim is evidenced by modification times rather than attested.** A self-attested revert
    of live scheduler source is how a mutated scheduler ships.
14. **The mutation table requires a NAMED case to go red, not merely "something".** The
    confound that produced this whole family of defects is a rule looking defended because a
    different rule's test caught the candidate. Naming the case is what excludes it. The cost
    is brittleness when a case is renamed, which is accepted, and which is itself a signal
    worth receiving.
15. **The claim is scoped to the scheduler's guarantee, not to a live production incident.**
    `actions.js:1691` is the only production creator of a `sync` and it sets `gitOp: true`.
    The guarantee `nextRunnable` documents at `:897-899` is unconditional and is broken; the
    running product does not currently produce the shape. Both facts are stated rather than
    the stronger one alone.
16. **Nothing was measured from this plan, and the four unmeasured items are listed rather
    than assumed.** Four executors are editing `src/` and `tests/` concurrently; running the
    suite would contend and produce an uninterpretable result. Step 8 reproduces the premise
    before anything is built on it.
17. **The sibling's asymmetry hunt is treated as complete and is not repeated.** Eight
    predicates across eleven test files, seven already defended and this one open. Repeating
    it would cost a full mutation sweep to re-derive a result already recorded; the gate is
    what replaces the hunt going forward.
