---
iron_loop_verdict: true
title: >-
  The sync barrier is undefended where work actually starts — and the fourth
  instance of one pattern gets a mechanism instead of a fifth discovery
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00102-git-exclusivity-is-undefended-where-work-actually-starts
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - tests/scheduler-guarantees-under-mutation.test.js
  - tests/scheduler-rule-projection-gate.test.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-07-30T14:47:43.991Z
gate_crossed: implementation → todo
kickback_counts:
  by_step:
    '14': 1
  total: 1
---

# The sync barrier is undefended where work actually starts

> **Rebased 2026-07-30 against the current tree — intent and acceptance criteria unchanged.**
> Every source line number below was re-verified from disk and corrected. Since this plan was
> authored the scheduler grew a **concurrent-edit belt** in `canRun` (human ruling 2026-07-26),
> which shifted the whole ladder down by ~85 lines AND added a **seventh** decision-shaped
> reason, `staleness-orphan-quarantine` (`src/lib/task-registry.js:983`). That seventh reason
> is now enumerated by the gate and defended by its existing `canRun` cases (`BELT-1` /
> `BELT-1b` in `tests/task-registry.test.js`) — see the Decision section and the gate's
> mutation table. The belt is oracle-only by design (`nextRunnable` deliberately does not
> enforce it; its projection-side reporter is `task-reconcile.applyQuarantine`), so it is the
> one reason whose named red case lives on the `canRun` path rather than the `nextRunnable`
> path. Nothing about what this slice builds or asserts has changed; only the technical route
> is corrected to today's source.

## The defect, re-verified against the source rather than inherited

The scheduler's two entry points are different code paths:

| Function | Line | What it is |
|---|---|---|
| `canRun(candidate, registry)` | `src/lib/task-registry.js:969-986` | the **oracle** — may this one candidate run right now? |
| `nextRunnable(registry)` | `:1001-1013` | the **promotion projection** — the set that actually gets started |

Both delegate to `evaluateConcurrency` (`:923-953`), a ladder of
`1 max-concurrent → 2 sync-barrier → 3 git-exclusive → 4 file-conflict → ok`.
Rule 2 lives at `:930-932`, verbatim from disk:

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

1. **The vulnerable shape is accepted.** `assertSyncBlockedBy` (`:664`) constrains
   a `sync` only through its `blockedBy`; it says nothing about `gitOp`. And
   `addTask` normalises with `gitOp: spec.gitOp === true` (`:737`), as does the load
   path (`:340`). So **`addTask(r, { kind: 'sync', blockedBy: [...] })` produces a sync
   with `gitOp: false` by default** — the vulnerable shape is not exotic, it is what you
   get by not asking for a git flag. Two existing lifecycle tests in
   `tests/task-registry.test.js` already build it that way (exact positions shifted since
   authoring — Step 9 re-derives them), though both are lifecycle tests that never reach
   `nextRunnable`.
2. **Every `sync` that reaches the promotion path in the suite carries `gitOp: true`.**
   Confirmed by grep across `tests/scheduler-guarantees-under-mutation.test.js` and
   `tests/task-registry.test.js`, without exception. (The specific line numbers recorded at
   authoring have shifted — the belt rule and the sibling's Group C moved every case in
   these files. Step 9 re-derives the positions; the **claim**, not the positions, is what
   Step 9 verifies.)

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
  folded into `projected` as running at `:1009`, and `other` is then refused because
  `running.some(t => t.kind === 'sync')` is true.
- **Mutated code** promotes `['barrier','other']`. With Rule 2 gone, Rule 3 finds
  `candidate.gitOp === false` and `isEditing(other) === false` (empty `touches`), so both
  clauses are false; Rule 4's fast path skips on an empty candidate `touches`.

**A task starts alongside a live wave integration barrier** — precisely the one thing the
barrier exists to prevent.

### What this claim does NOT extend to, stated rather than glossed

The only production creator of a `sync` task is `src/lib/actions.js:1887`
(`enqueueWaveSync`), and it sets `gitOp: true` explicitly (`:1889`). So on today's shipped
call graph the vulnerable shape is **not** produced by the running product. The defect is
in the scheduler's *guarantee*, which is unconditional and is what `nextRunnable`'s own
comment (`:995-996`) promises — "so starting the whole returned set never violates ≤5 /
sync-barrier / git-exclusive / file-conflict". A registry loaded from disk, a second call
site, or any use of `addTask` without an explicit flag produces the shape. This slice
defends the guarantee; it does not claim a live production incident, and it must not be
written up as if it did.

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
checkable rather than asserted. `tests/task-registry.test.js:350-364` (ST-SYNC-4) calls
`nextRunnable` on a registry where a queued `sync` is refused with reason
`'sync-barrier'`, and asserts the resulting promoted set. Reason coverage would therefore
have reported Rule 2 as **covered on the promotion path** — while Rule 2 was in fact
undefended, because deleting it lets Rule 3 refuse the same candidate and the asserted set
never changes. **Coverage of any kind is blind to masking; masking is exactly the failure
mode here.** Line coverage was already 99.91% on this file when all four gaps were open.

**What the mechanism actually guarantees.** Two halves:

1. **Enumeration (a real mechanism, cheap, unconditional).** The gate extracts from
   `src/lib/task-registry.js` every decision-shaped reason literal — matching only
   `{ run: true|false, reason: '<literal>' }`, which selects exactly `:925`, `:931`,
   `:938`, `:949`, `:952`, `:972` and `:983` (the **seventh**,
   `staleness-orphan-quarantine`, added by the concurrent-edit belt) and deliberately
   excludes the unrelated `reason: 'dep-missing' | 'dep-failed' | 'dep-cycle'` sites at
   `:1119-1142` and `reason: 'already-queued'` at `:1201`, which carry no `run:` field.
   It asserts that set equals the declared set
   `{max-concurrent, sync-barrier, git-exclusive, file-conflict, blocked-dep,
   staleness-orphan-quarantine, ok}`, and that every member except `ok` has at least one
   entry in the mutation table.
   **A future rule that returns a new reason fails the gate immediately**, with a message
   naming the rule and demanding a defender. That is the property the human asked for, and
   it is genuinely mechanical — the belt's arrival after authoring is the first live proof
   that it works: the extractor picks up the new reason, and the plan had to answer it with
   a named defender rather than let it slip through.
2. **Execution (a real mechanism, costly).** For each table entry, the declared
   mutation is applied to a copy of the module outside the working tree
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
- **`staleness-orphan-quarantine` is defended on the ORACLE path, not the projection.**
  The belt lives only in `canRun` (`:982-984`) by deliberate design — `nextRunnable`
  offers the colliding candidate and lets the projection reporter
  (`task-reconcile.applyQuarantine`) hold it (`BELT-5` in `tests/task-registry.test.js`
  pins exactly this). So this reason's named red case is a `canRun` case (`BELT-1` /
  `BELT-1b`), not a `nextRunnable` case. The gate's real mechanism — mutate the source, run
  the scheduler suite, require a named case to go red — supports that cleanly; the
  "promotion path" narrative is the general case, and this is the one documented exception.
  The belt's *projection-side reporter* in `task-reconcile.js` stays out of this gate's
  scope (see "What this slice does NOT fix", item 5).

That is the honest ledger: enumeration is mechanised, fairness is not. The convention
half is written into the gate's failure text and the table's header comment, where the
next author is forced to read it, rather than into a document nobody opens.

**Where the gate runs — decided, not deferred.** It runs inside `npm test`, the gated
entry point, unconditionally. A gate that lives behind an environment flag silently stops
being true, which is the failure this whole family of slices exists to correct. Its
runtime has **not been measured** and cannot be from this plan (executors are editing
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
    └── names ──> Group D case ids in tests/scheduler-guarantees-under-mutation.test.js,
                  and BELT-1/BELT-1b in tests/task-registry.test.js
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
(`:50-94`), which bypass `addTask` — required here, because `addTask` refuses an
`implement` task with empty `touches` and refuses a `sync` with an empty `blockedBy`.

**Every case below uses a `sync` with `gitOp: false`.** A `sync` carrying `gitOp: true` is
refused by Rule 3 when Rule 2 is deleted and therefore proves nothing — that is the
masking this group exists to break.

| # | Case | Registry (order matters — `nextRunnable` is FIFO over queued) | Assertion | Mutation it kills |
|---|---|---|---|---|
| D1 | **a `sync` candidate is NOT promoted while a real task runs** | `t1` implement **running** `touches:['a.js']` `gitOp:false`; `t2` sync queued `gitOp:false` `touches:[]` `blockedBy:[]` | promoted set is exactly `[]` | deleting the `candidate.kind === 'sync'` disjunct from `:930` |
| D2 | **no candidate is promoted while a real `sync` runs** | `t1` sync **running** `gitOp:false` `touches:[]`; `t2` review queued `touches:[]` `gitOp:false` | promoted set is exactly `[]` | deleting the `running.some(t => t.kind === 'sync')` disjunct from `:930` |
| D3 | **headline — a barrier promoted in THIS pass blocks the follower behind it** | `dep` implement `status:'done'` `touches:['a.js']`; `barrier` sync queued `gitOp:false` `touches:[]` `blockedBy:['dep']`; `other` review queued `touches:[]` `gitOp:false` | promoted set is exactly `['barrier']` | deleting Rule 2 (`:930-932`) entirely; and separately, dropping `kind` from the fold at `:1009` (mutate `projected.push({ ...cand, status: 'running' })` to `projected.push({ ...cand, kind: 'review', status: 'running' })`) |
| D4 | **control — the barrier itself IS promoted when nothing occupies a slot** | `dep` implement `status:'done'` `touches:['a.js']`; `barrier` sync queued `gitOp:false` `touches:[]` `blockedBy:['dep']` | promoted set is exactly `['barrier']` | over-tightening Rule 2 into "never promote a sync", which would pass D1-D3 and deadlock every wave |
| D5 | **control — two ordinary non-sync tasks with disjoint files DO both promote** | `t1` implement queued `touches:['a.js']`; `t2` implement queued `touches:['b.js']` | both promoted | over-tightening Rule 2 into "one task at a time", which would pass D1-D4 and destroy concurrency |
| D6 | **the reason is `sync-barrier`, through the oracle, on D2's shapes** | D2's registry — note `t1` is **running**, deliberately | `canRun(t2, r)` → `{ run:false, reason:'sync-barrier' }` | pins that D1-D3's refusals are Rule 2 and not Rule 1, 3 or 4 firing by accident |

**D6 carries an explicit warning in its own comment, because the sibling slice got this
wrong once.** `canRun` builds its opposition from `runningTasks(registry, id)` (`:829-831`),
which filters on `isOccupying` — status `running` or `cancelling`. A registry whose tasks
are all `queued` gives `canRun` an EMPTY running set, and the correct answer is then
`{ run:true, reason:'ok' }`. D6's opposition must therefore be genuinely `running`. Writing
D6 against an all-queued registry produces a case that fails against correct code, and
"fixing" it by relaxing the assertion manufactures exactly the vacuous case this file
exists to prevent.

**Why D1/D2 and D3 are not redundant.** `projected` is seeded from the real running set at
`:1002` and grown by the fold at `:1009`. D1 and D2 exercise the **seeded** path; D3 exercises
the **fold** path, where the blocking sync did not exist as a running task when the pass
began. A mutation that drops `kind` from the fold leaves D1 and D2 green and kills only D3.

#### Masking analysis — which other rules could fire first, and why they cannot

A case that passes because an earlier rule caught the candidate has proven nothing. Rule 2
sits second in the ladder, so only Rule 1 precedes it; Rules 3 and 4 follow and would mask
it by producing the same refusal. The arithmetic is written out rather than assumed.

- **Rule 1 (max-concurrent, `:925`) cannot fire.** `MAX_CONCURRENT` is 5 (`:122`). No case
  in Group D puts more than two tasks in the projected set.
- **Rule 3 (git-exclusive, `:936-938`) cannot fire.** First clause needs
  `candidate.gitOp` — every candidate in Group D has `gitOp: false`, explicitly, and this
  is the single load-bearing choice in the whole group. Second clause needs
  `isEditing(candidate) && running.some(t => t.gitOp)`; `isEditing` is `touches.length > 0`
  (`:817-819`), and no task in any Group D case carries `gitOp: true`, so the right-hand side
  is false regardless of the candidate's files.
- **Rule 4 (file-conflict, `:940-950`) cannot fire.** In D1 the candidate's `touches` is
  empty, so the fast path at `:944` skips the rule entirely. In D2 and D3 the *blocking*
  task's `touches` is empty, so the `occupied` union is empty and `touchesOverlap` has
  nothing to match. In D5 the two files are disjoint by construction, which is what makes
  D5 a control rather than a coincidence.
- **Rule 0 (the dependency gate, `nextRunnable`'s `continue` at `:1005`) cannot fire for the
  wrong reason.** Every queued task in Group D either declares an empty `blockedBy` or names
  a dependency whose status is `done`, which satisfies both the sync branch (TERMINAL) and
  the non-sync branch (done-only) of `depsSatisfied` (`:857-872`).

Proof rather than argument: under the single-disjunct mutations the refusal must disappear
**entirely**, which it could not do if another rule were carrying it. Step 8 records that.

**No production file changes.** Rule 2 is implemented correctly; it is undefended on the
path that starts work. If any production behaviour changes, this slice is wrong.

---

### File: `tests/scheduler-rule-projection-gate.test.js`
**Action:** CREATE
**Purpose:** Assert that every scheduler rule is exercised by a named case in the scheduler
suite, so a rule added to the scheduler without a defender fails immediately.

#### Structure

**1. The declared reason set (the ratchet).**

```js
const DECLARED_REASONS = Object.freeze([
  'max-concurrent', 'sync-barrier', 'git-exclusive', 'file-conflict',
  'blocked-dep', 'staleness-orphan-quarantine', 'ok'
]);
```

**2. The extractor.** Reads `src/lib/task-registry.js` as text with `fs.readFileSync` and
matches only decision-shaped returns:

```js
/\{\s*run:\s*(?:true|false)\s*,\s*reason:\s*'([a-z-]+)'\s*\}/g
```

This selects `:925`, `:931`, `:938`, `:949`, `:952`, `:972` and `:983` and excludes the
`reason: 'dep-missing' | 'dep-failed' | 'dep-cycle'` sites at `:1119-1142` and
`reason: 'already-queued'` at `:1201`, which have no `run:` field. **If the extractor finds
zero matches it FAILS** — a scanner whose no-match result is indistinguishable from success
is the exact false-green signature this repository fences. Never default to the passing
value.

**3. The mutation table.** One entry per rule, several permitted per reason:

```js
{ reason, name, find, replace, expectRedCases: ['D3: ...', ...] }
```

`find`/`replace` are exact source substrings. **An entry whose `find` does not occur
exactly once in the source FAILS the gate** — a mutation that silently applies nowhere
would report "no red" and be read as an undefended rule, or worse, apply in two places.
Initial entries:

| reason | mutation | must turn red |
|---|---|---|
| `sync-barrier` | delete Rule 2's body at `:930-932` | D1, D2, D3 |
| `git-exclusive` | delete Rule 3's body at `:936-938` | Group C cases (the sibling's) |
| `max-concurrent` | `running.length >= MAX_CONCURRENT` → `false` at `:925` | the existing max-concurrency promotion cases |
| `file-conflict` | `touchesOverlap(candTouches, occupied)` → `false` at `:949` | the existing file-conflict promotion cases |
| `blocked-dep` | delete `if (!depsSatisfied(cand, registry)) continue;` at `:1005` | Group B cases |
| `staleness-orphan-quarantine` | delete the concurrent-edit belt in `canRun` at `:982-984` (`if (overlapsStaleOrphanReservation(candidate, registry)) { return { run: false, reason: 'staleness-orphan-quarantine' }; }`) | `BELT-1`, `BELT-1b` in `tests/task-registry.test.js` |

The `staleness-orphan-quarantine` entry is the one **oracle-side** mutation in the table:
its rule lives only in `canRun` by design (see the Decision section and `BELT-5`), so its
named red cases are `canRun` cases rather than `nextRunnable` cases. That is not a weakness
in the gate — mutating the source and requiring a named suite case to go red proves the
rule is defended regardless of which entry point exercises it. A header comment states this
so a later author does not "fix" the entry by chasing a non-existent `nextRunnable` case.

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
| G1 | the extractor finds the decision reasons | the extracted set is non-empty and equals `DECLARED_REASONS` (seven reasons) |
| G2 | every rule has a defender | every declared reason except `ok` has ≥1 table entry; failure message names the reason and demands one |
| G3 | every mutation applies exactly once | each entry's `find` occurs exactly once in the source |
| G4 | the no-op control is green | control run: `fail 0`, `skipped 0`; otherwise the gate fails with "the harness is invalid" |
| G5 | every declared mutation is caught by its named case | for each entry, the mutated run is red AND every id in `expectRedCases` appears among the failures |
| G6 | the tracked source is never modified | modification times identical before and after every run |

G2 is the ratchet the human asked for. G5 is what makes G2 mean something. G4 is what makes
G5 believable.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| Group D | `reg.nextRunnable` / `reg.canRun`, the real exported scheduler functions, called by `src/lib/task-reconcile.js` on every dashboard render | `npm test`, and `node src/commands/start.js` |
| the gate | it IS a test file, executed by `node --test tests/*.test.js` and by `src/scripts/test-gate.js` | `npm test` |

Both files drive the real module through its real exports. Nothing is mocked, and the
ladder is not re-implemented in any test.

**Why the gate is a test file and not a module under `src/lib/`.** Two reasons, both
decisive. First, `src/lib/reachability.js:314` records that `tests/` is deliberately not a
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
   In particular, `staleness-orphan-quarantine`'s *projection-side reporter*
   (`task-reconcile.applyQuarantine`) is out of scope; the gate defends that reason through
   the `canRun` belt only.
6. **It does not build a general mutation-testing framework.** The table is hand-written,
   scheduler-specific, and deliberately small.
7. **It does not touch `src/lib/task-registry.js`, `src/lib/task-reconcile.js`, or any
   other production file.**
8. **It does not re-run the sibling's asymmetry hunt.** That hunt is complete and this is
   its last open instance; the gate exists so the hunt need not be repeated.

## What could NOT be verified from this plan, and must be at Step 8

Executors are editing `src/` and `tests/` concurrently. Running the suite from here would
contend with them and produce an uninterpretable result, so it was not run. The following
are therefore **inherited or reasoned, not measured**, and each is a Step 8 obligation:

1. **That disabling Rule 2 on the promotion path leaves all 410 assertions green.** The
   sibling's recorded measurement. Reproduce it before writing a line of Group D; if it does
   not reproduce, stop and report — the premise is gone.
2. **The count of scheduler-touching test files (eleven) and assertions (410).** Re-derive
   both; do not restate the sibling's numbers as if freshly measured. (The suite grew since
   authoring — the belt rule alone added the BELT-1 through BELT-5 cases — so the assertion count in
   particular is expected to differ; re-derive it, do not assume 410.)
3. **That `spawnSync` with `--require <shim>` correctly redirects module resolution for
   node's test runner in a child process.** Reasoned from the sibling's in-process shim,
   not executed. G4, the no-op control, is what proves it; if the control is not green the
   harness design is wrong and must be rebuilt, not worked around.
4. **The gate's runtime.** Unmeasured. Step 12 measures it.

---

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] **Reproduce the premise before writing anything.** Apply the Rule 2 projection-side
      mutation to a copy and run the eleven scheduler test files. Expected: all green. Record
      the verbatim counters. If it goes red, STOP — the premise is gone and the plan is wrong.
- [x] Run the no-op control FIRST and record it verbatim. **If the control is not perfectly
      green, the harness is invalid and no result from it may be reported** — rebuild the
      harness, do not interpret its output.
- [x] Write Group D (six cases) before any fix, each naming its file, line and exact
      mutation text in its own comment
- [x] Run Group D against the unmutated module; green from birth is expected and is treated
      as INSUFFICIENT evidence
- [x] Apply each named mutation to a COPY and observe each case go RED under its own
      mutation. Record a per-mutation table with verbatim counters and the case ids
- [x] Write `tests/scheduler-rule-projection-gate.test.js` and observe G1 fail if the
      declared reason set omits `staleness-orphan-quarantine`, G2 fail when a table entry is
      removed, and G5 fail when a table entry's `expectRedCases` is pointed at a case that
      does not defend it — a gate never seen failing is not a gate
- [x] Confirm deleting the `canRun` belt (`:982-984`) reddens `BELT-1`/`BELT-1b` in
      `tests/task-registry.test.js`, and that those cases appear in that file's scheduler
      run — the gate's only oracle-side entry depends on it
- [x] No case is rewritten to pass. If the plan specifies something impossible against
      correct code, record the correction here rather than adjusting silently

### Step 9: PREPARE
- [x] Read `src/lib/task-registry.js:800-1013` from disk — `isOccupying`, `isEditing`,
      `runningTasks`, `depsSatisfied`, `overlapsStaleOrphanReservation`,
      `evaluateConcurrency`, `canRun` (including the concurrent-edit belt), `nextRunnable`
- [x] Confirm from the current source: `MAX_CONCURRENT` (`:122`), the kind vocabulary
      `KINDS` (`:149`), `assertSyncBlockedBy` (`:664`), `addTask`'s `gitOp: spec.gitOp === true`
      (`:737`), and the load-path normalisation `gitOp: t.gitOp === true` (`:340`)
- [x] Confirm the SEVEN decision-reason sites (`:925, :931, :938, :949, :952, :972, :983`)
      and that the `dep-missing`/`dep-failed`/`dep-cycle` sites (`:1119-1142`) and
      `already-queued` (`:1201`) carry no `run:` field. Confirm the seventh reason
      `staleness-orphan-quarantine` (`:983`) is the `canRun` belt and is defended by
      `BELT-1`/`BELT-1b`
- [x] Read the whole of `tests/scheduler-guarantees-under-mutation.test.js`, including
      Groups A, B and C and the helper block at `:50-94`
- [x] Enumerate the scheduler-touching test files from disk; do not inherit the list. Confirm
      `tests/task-registry.test.js` (which carries BELT-1/BELT-1b) is among them
- [x] Re-grep every `kind: 'sync'` in `tests/` and confirm the premise still holds — that no
      promotion-path sync carries `gitOp: false`. Concurrent executors may have added one
- [x] Record every place the code disagrees with this plan, and prefer the code

### Step 10: IMPLEMENT
- [x] `tests/scheduler-guarantees-under-mutation.test.js` — Group D appended; header extended
      with Group D's subject and the mutual-masking explanation; Groups A, B, C untouched
- [x] `tests/scheduler-rule-projection-gate.test.js` — created, with G1-G6, the frozen reason
      set (seven reasons), the mutation table (six entries, one per non-`ok` reason), the
      no-op control and the harness
- [x] `path.join` and `os.tmpdir()` throughout; no hardcoded separator, no `~`, no shell
- [x] No production file edited; no file outside this plan's `files:` list touched
- [x] No stub, no TODO, no skipped case

### Step 11: REVIEW
- [x] Groups A, B and C are byte-identical apart from the header addition; all still green
- [x] Every Group D case names a mutation and was OBSERVED red under it
- [x] Every Group D case uses `gitOp: false` on its `sync` — a git-flagged sync proves
      nothing and its presence is a defect in the case
- [x] The masking analysis is re-checked against the cases as written, not as planned
- [x] The gate's failure messages state the convention half plainly — that a rule reusing an
      existing reason string is not caught, that mutation fairness is a human judgement, and
      that `staleness-orphan-quarantine` is defended on the `canRun` oracle path by design
- [x] The gate was observed FAILING for each of its own reasons before being accepted

### Step 12: OPTIMIZE
- [x] Group D is pure in-memory registry literals; no disk, no sleeps, no wall-clock read,
      no platform branch
- [x] **Measure the gate's wall-clock runtime and record it verbatim.** If it exceeds 60
      seconds, report that to the human as a scheduling decision — do NOT move the gate
      behind an environment flag to make the number look better
- [x] Confirm the mutated runs execute only the scheduler test files, never the whole suite

### Step 13: SECURE
- [x] The harness writes only under `os.tmpdir()` via `fs.mkdtempSync`, and removes the
      directory in a `finally` block so a thrown assertion cannot leak it
- [x] Requires in the copy are rewritten with `path.resolve` and embedded with
      `JSON.stringify`; no external input reaches a `require`; the resolution redirect is an
      exact-path allow-list of one entry, never a prefix or pattern
- [x] `spawnSync` is called with an argument array and no shell; `maxBuffer` is explicit
- [x] Counters are parsed from complete output and the parser returns `null`, never `0`, on
      an unreadable counter
- [x] Modification times of `src/lib/task-registry.js`, `src/lib/task-reconcile.js` and both
      declared files recorded before and after EVERY run and asserted unchanged
- [x] No harness artefact is written inside the working tree

### Step 14: VERIFY
- [x] `node --test` on the scheduler-touching test files plus the new gate — verbatim counters
- [x] Full gated run `npm test` — verbatim counters and the coverage line
- [x] Coverage floor left at 99 — not lowered, and not raised
- [x] No ratchet tripped: the reachability fence, the export-reachability fence and the
      false-green fence all green. Nothing whitelisted; no baseline file edited
- [x] `npx eslint` clean on both declared files
- [x] **No git operation of any kind.** Working-tree difference established by reading
      modification times, not by `git status`
- [x] Any failure originating outside this plan's two files is reported as FOREIGN with
      evidence, never repaired and never used to justify re-rolling the run until it looks green

### Step 15: DOCUMENT
- [x] The mutation test file's header states Group D's subject and the mutual masking in one
      paragraph: every promotion-path git candidate was a sync, and every sync was a git op,
      so each rule hid the other's absence
- [x] The gate file's header states, in its own words, what it mechanises and what it does
      not — the reason-reuse blind spot, the mutation-fairness judgement, and that
      `staleness-orphan-quarantine` is an oracle-only rule defended through `canRun`
- [x] The header records why reason coverage was rejected, with the ST-SYNC-4 falsification,
      so the cheap option is not re-proposed
- [x] No CHANGELOG entry — this slice changes no product behaviour

### Step 16: FINAL-REVIEW
- [x] All prior steps complete; all quality checks passed
- [x] The eight things this slice does NOT fix are restated unchanged
- [x] The four unverified items are either verified or reported still unverified — never
      quietly dropped
- [x] The mechanism-versus-convention split is stated in the completion report in the same
      terms as here: enumeration is mechanised, fairness is not
- [x] Plan moved to review with evidence; Gate 3 left to the human

---

## Ordering and file conflicts

**`depends_on: 00102-git-exclusivity-is-undefended-where-work-actually-starts`.** That
sibling adds Group C to `tests/scheduler-guarantees-under-mutation.test.js`, which this
slice also modifies. Same file, so this slice must not start until that one has settled.
(The sibling is currently in `plans/review/` — built and awaiting the human's sign-off — so
Group C is present in the file today.) The sibling also produced the finding this slice acts
on, and its Group C cases are named in this gate's mutation table — the table would be
unsatisfiable without them.

`tests/scheduler-rule-projection-gate.test.js` is new and declared by no other plan.

`src/lib/iron-loop-enforcer.js` is deliberately NOT declared here, because plans `00073`
and `00110` both declare it and are in flight. That is the reason the gate is a test file
rather than a scan module, recorded above under Wiring.

No production file is declared, so this slice cannot collide with the executors
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
   `tests/task-registry.test.js:350-364` returns `'sync-barrier'` from a `nextRunnable`
   call and asserts the promoted set, so a reason-coverage instrument would have reported
   Rule 2 as covered while it was undefended. Coverage cannot see masking; masking is the
   defect. Recorded so the cheaper option is not re-proposed later.
4. **The mechanism is declared PARTIAL, and the convention half is named.** A rule that
   reuses an existing reason string, the fairness of a chosen mutation, and per-clause
   completeness are all conventions. The human ruled that a rule which cannot be checked is
   a wish; so the wishes are labelled as wishes and written where the next author meets
   them, rather than dressed up as enforcement.
5. **The enumeration keys on decision-shaped reason literals, not on rule count.** Matching
   `{ run: true|false, reason: '<literal>' }` selects exactly the seven decision sites and
   excludes the unrelated `reason:` sites at `:1119-1142` (`dep-missing`/`dep-failed`/
   `dep-cycle`) and `:1201` (`already-queued`). Counting `if` statements or parsing the
   function body would be more fragile and no more complete.
6. **The gate runs inside `npm test` unconditionally, and its cost is reported rather than
   hidden.** A gate behind an environment flag silently stops being true. If the measured
   runtime is unacceptable, that is the human's scheduling decision, not the executor's.
7. **The gate is a test file, not a module under `src/lib/`.** `reachability.js:314` records
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
    `kind` from the fold at `:1009` kills only D3, which is why D3 exists separately.
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
    `actions.js:1887` (`enqueueWaveSync`) is the only production creator of a `sync` and it
    sets `gitOp: true`. The guarantee `nextRunnable` documents at `:995-996` is unconditional
    and is broken; the running product does not currently produce the shape. Both facts are
    stated rather than the stronger one alone.
16. **Nothing was measured from this plan, and the four unmeasured items are listed rather
    than assumed.** Executors are editing `src/` and `tests/` concurrently; running the
    suite would contend and produce an uninterpretable result. Step 8 reproduces the premise
    before anything is built on it.
17. **The sibling's asymmetry hunt is treated as complete and is not repeated.** Eight
    predicates across eleven test files, seven already defended and this one open. Repeating
    it would cost a full mutation sweep to re-derive a result already recorded; the gate is
    what replaces the hunt going forward.
18. **The seventh reason `staleness-orphan-quarantine` (rebase, 2026-07-30) is enumerated and
    defended, not deferred.** The concurrent-edit belt (human ruling 2026-07-26) added a
    decision-shaped reason in `canRun` (`:983`) after this plan was authored. The gate's own
    ratchet requires it in `DECLARED_REASONS` and in the mutation table, so it is added:
    the mutation deletes the belt (`:982-984`) and the named red cases are `BELT-1`/`BELT-1b`
    in `tests/task-registry.test.js`. It is the one oracle-side entry — `nextRunnable`
    deliberately does not enforce the belt (`BELT-5`), and its projection-side reporter
    (`task-reconcile.applyQuarantine`) is out of this gate's scope. Its arrival is the first
    live confirmation that the enumeration mechanism catches a rule the plan's author never
    saw.


## Decisions Taken Under Ambiguity (executor addendum)

19. **The mutated child's environment strips `NODE_TEST_CONTEXT`.** When the gate runs under
    `node --test`, that variable is set to `"child-v8"`; inherited by the spawned child it makes
    the child's OWN test runner report to a non-existent parent instead of running, so the child
    exited in ~25 ms doing nothing and the no-op control (G4) and every mutation (G5) falsely
    read as "no failure" — a false-green the gate's own G4 correctly refused to interpret. The
    harness now deletes `NODE_TEST_CONTEXT` from the child env (and keeps
    `CTOC_SCHEDULER_MUTATION_CHILD=1`). This is the concrete realisation of the plan's warning
    that the no-op control's failure invalidates every result: it caught a real harness bug
    before any mutated result was trusted. No plan text promised this env key; it is a
    documented reasonable choice, not a deviation from intent.

## Execution Evidence (Iron Loop Steps 8–16, executor 2026-07-30)

**Harness / test-file list.** The eleven scheduler-touching test files were re-derived from
disk (Step 9): task-registry, task-registry-coverage, scheduler-guarantees-under-mutation,
scheduler-enforced, actions-scheduler, task-reconcile, task-reconcile-coverage,
task-reconcile-quarantine-fault, promote-quarantine-parity, r3b-consolidation-rework,
w10-live-agent-reconcile. Assertion count re-derived, NOT inherited: the no-op control runs
**333 passing tests, 0 fail, 0 skipped** across those eleven files (the sibling's 410 was a
different count and is not restated as fresh).

**Premise reproduced (Step 8 obligation #1).** The promotion-path-only mutation — drop `kind`
from the fold at `:1009` (`projected.push({ ...cand, status: 'running' })` →
`{ ...cand, kind: 'review', status: 'running' }`) — leaves the whole scheduler suite green
**before Group D existed (333 pass, 0 fail)**. That is the undefended gap: the promotion-path
sync barrier can be broken and not one existing test notices. Deleting Rule 2 from the SHARED
`evaluateConcurrency` instead reddens 5 ORACLE cases (canRun) — confirming the mutual masking
(oracle defended, projection not).

**Per-mutation RED evidence (applied to a copy; named case observed red):**

| mutation | fail count | named case(s) that went red |
|---|---|---|
| delete `candidate.kind === 'sync'` disjunct (:930) | 4 | **D1** |
| delete `running.some(t => t.kind === 'sync')` disjunct (:930) | 5 | **D2** |
| delete Rule 2 body entirely (:930-932) | 9 | **D1, D2, D3** |
| fold `kind`-drop (:1009), promotion-path-only | **1** | **D3 only** (proves the seeded/fold split) |
| delete Rule 3 body (:936-939) | 9 | **C1, C2, C3, C5** |
| `running.length >= MAX_CONCURRENT` → `false` (:925) | 7 | **ST-06** |
| `touchesOverlap(candTouches, occupied)` → `false` (:949) | 17 | **ST-07b, ST-08** |
| delete `nextRunnable` dep gate (:1005) | 7 | **B7, B8** |
| delete concurrent-edit belt (:982-984) — ORACLE-side | 3 | **BELT-1, BELT-1b** (canRun cases) |

**Gate self-failure witnessed (Step 8 "a gate never seen failing is not a gate"):** G1+G2 go
red when `staleness-orphan-quarantine` is dropped from `DECLARED_REASONS`; G2 goes red when the
sync-barrier table entry is removed; G5 goes red when `expectRedCases` is pointed at a
non-existent case; G4/G5 went red for real (unforced) while the harness bug below was live.

**Oracle-only reason handled correctly (the rebase subtlety).** `staleness-orphan-quarantine`
is enumerated (G1 green), has a mutation-table defender whose named red cases are the `canRun`
cases BELT-1/BELT-1b (G5 green), and is NOT false-flagged as an undefended/undeclared rule. The
gate's mechanism — mutate source, require a named suite case to go red — is entry-point-agnostic,
so an oracle-only rule is defended cleanly without a fictitious `nextRunnable` case.

**Step 12 runtime.** The gate's full wall-clock is **~2.4 s** (G4 no-op ~0.26 s, G5 six
mutation runs ~1.56 s, G6 ~0.52 s) — well under the 60 s threshold, so no scheduling decision
is escalated to the human.

**Step 14 gate.** `npm test` exit code **0**; `[CTOC test-gate] coverage 99.05% (threshold
99%), skipped 0, failed 0; PASS`. Coverage floor left at 99 (not raised, not lowered). No fence
tripped (reachability, export-reachability, false-green — all green under the same exit 0).
`npx eslint` clean on both declared files. No production file edited; no file outside this
plan's `files:` list touched. Working-tree immutability of `src/lib/task-registry.js` and
`src/lib/task-reconcile.js` asserted by the gate itself (G6, mtime before/after every run),
never by `git status`.

## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
