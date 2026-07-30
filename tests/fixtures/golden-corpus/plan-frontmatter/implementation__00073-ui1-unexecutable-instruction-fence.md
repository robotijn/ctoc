---
iron_loop: true
title: "A ratcheting fence against a documented vocabulary word nothing accepts, and a setting nothing reads"
type: implementation
parent_plan: none
depends_on: 00110-agents-told-to-run-code-they-cannot-run
priority: critical
files:
  - src/lib/unexecutable-instruction-scan.js
  - src/lib/iron-loop-enforcer.js
  - tests/unexecutable-instruction-fence.test.js
  - .ctoc/unexecutable-instruction-baseline.json
---

# The unexecutable-instruction fence — the two remaining detections

## SCOPE NARROWED — SETTLED BY THE HUMAN, DO NOT RE-OPEN

This plan originally specified **three** detections. **The human ruled on 2026-07-19 that
its middle detection moves out, and the ruling is his** — not the planner's and not the
coordinator's. It is recorded here as settled so nobody rediscovers the conflict and
re-litigates it.

**What moved.** The detection of *an order to an agent to run code its own `tools:` grant
gives it no way to run* is now owned entirely by the plan titled **"Five agents are ordered
to run code they have no way to run — the orders are corrected and a fence stops the next
one"** (`plans/implementation/00110-agents-told-to-run-code-they-cannot-run.md`). That plan
found five live instances, corrects all five agent bodies, and builds the detection with
three signatures rather than this plan's one — including two signatures this plan's design
would have missed entirely.

**Why it moved.** That detection was the only one of the three with a live, unfixed root
cause; it carries by far the highest false-positive risk and deserved its own slice of
attention; and Operating Lesson 16 says a fix and the fence that prevents its recurrence
belong in the same unit of work.

**THE BOUNDARY RULE — this sentence appears in both plans, and it is the boundary. It is
this plan's own decision 2, and it is why the detection moved rather than being
duplicated:**

> **One fence per invariant, or the two drift and the human trusts neither.**

Concretely, and permanently:

| Invariant | Owner | The other plan must never grow a checker for it |
|---|---|---|
| an order to an agent to run code its `tools:` grant cannot execute | **the five-agents plan** | **this plan must not add this detection back** |
| a document naming a task kind the accepted vocabulary rejects | **this plan** | that plan must not add it |
| a configuration key written or documented that nothing reads | **this plan** | that plan must not add it |

**What this plan now builds:** detections (a) and (c) only, **added to the scanner the
five-agents plan ships**. It creates no new module, no new baseline file, no new test file
and no new `CHECKS` entry — those four artifacts already exist by the time this plan runs.
Its `files:` list is unchanged for exactly that reason: the same four paths, extended
rather than created.

**Ordering:** `depends_on` the five-agents plan. Its two remaining detections extend a
module that does not exist until that plan lands. **If
`src/lib/unexecutable-instruction-scan.js` is absent at Step 9, STOP and report — do not
create it here.**

The earlier build conflict with the false-green fence over `src/lib/iron-loop-enforcer.js`
has **cleared**: that fence has landed (`.ctoc/false-green-baseline.json` is live and
`CLAUDE.md` documents it). It is no longer a reason to serialize anything.

## Problem — a defect class that fails in total silence

In plain words: **something is documented, registered, or instructed, and nothing on
the other end can act on it.** It never throws at the point of authorship, it never
shows up as a failing assertion, and the pipeline reports success. All the confirmed
instances were found **by accident**, never by a check — which is the whole argument
for a mechanical fence.

It is a sibling of the false-green class (00071) but a *distinct* mechanic. False-green
is an instrument reporting a verdict on input it never received. This class is an
instruction with no receiver at all. They need different detectors, which is why this
is its own plan and not a section of that one.

### The confirmed instances in this plan's remaining scope (verified against disk, 2026-07-18)

| # | Site | What is instructed | What is on the other end | State |
|---|---|---|---|---|
| 1 | `src/commands/menu.md:232` documented the recipe "Record a task per ref (`menu task add`, kind `precompute`…)" | a task of kind `precompute` | `KINDS` in `src/lib/task-registry.js` did not contain `precompute`; `addTask` threw on every call | **FIXED** — `precompute` now sits in `KINDS` at `task-registry.js:136-139` with the post-mortem in its docblock |
| 3 | `src/lib/init-project.js:509-510` writes `enforcement:\n  mode: strict` into every new project's `settings.yaml`, and `CLAUDE.md` documents it as live per-project tuning | an enforcement-strictness setting | nothing in `src/` reads it. `src/hooks/PreToolUse.Task.js:27` says so outright: *"`enforcement.mode` from `.ctoc/settings.yaml` today — no hook does"*. The similarly-named `workflow.enforcementMode` at `src/lib/settings.js:59` is a **different key on a different surface** (`settings.json`) | **STILL LIVE** (plan 00069 wires it; the fence must catch the general case regardless) |

Instance 1's blast radius is the argument for urgency: every `menu task add precompute`
call threw, so the record-first step failed, so **no critic was ever dispatched, no
questions file was ever written**, and the streaming screen silently fell back to a
bare prompt for all 64 pending plans. Nothing was red. Nobody was told.

**Instance 2 — agents instructed to call JavaScript functions they cannot execute — has
MOVED to the five-agents plan** and is not this plan's work. It is deliberately left out of
the table above, rather than listed as "moved", so that nobody builds against it here by
reflex. The numbering gap between 1 and 3 is the only trace, and it is intentional.

## What this builds

Two additional detections in the **existing** scanner — a **test that fails, inside
`npm test`**, not a linter hint and not a documentation note.

It follows this repository's established fence pattern exactly: `tests/reachability.test.js`
for the ratchet, `tests/menu-task-wiring.test.js` for bidirectional vocabulary parity,
`tests/cache-freshness.test.js` for the justified-minimal-exemption list and the
prescriptive failure message.

### Debt versus exemption — the distinction that makes this landable

Conflating these is what has killed fences in this repository before, so they are two
separate structures in the baseline file with two different meanings. **The five-agents
plan already ships this structure; this plan adds entries to it and never redefines it.**

| | Meaning | Justification | Direction | Starts at |
|---|---|---|---|---|
| **DEBT** | A real defect that exists today and is being paid down | none required per entry | may only **shrink** | seeded from a real scan |
| **EXEMPTION** | Not a defect — the detector is wrong about this one | **required**, per entry, ≥ 20 chars | may only grow by deliberate review | **empty** |

A finding in DEBT is a bug awaiting a fix. A finding in EXEMPTION is a false positive
awaiting nothing. Anything in neither list **fails the build**.

## The two detections

Two genuinely different mechanics, added to the one scanner.

### (a) Recipe verb versus accepted vocabulary

**Instruction side.** Parse `src/commands/*.md` for references to the task-add verb.
Two textual shapes both occur in the live file and both must be extracted:

1. inline — `menu task add <kind>` (the shape at `menu.md:112` uses the metavariable
   `K`, which is skipped as a placeholder, not read as a kind);
2. **displaced** — a `menu task add` mention followed within 200 characters by a
   `` kind `<token>` `` phrase. This is the shape of the *actual instance*:
   `menu.md:232` reads ``Record a task per ref (`menu task add`, kind `precompute` …)``.
   A naive `menu task add (\w+)` regex would **not** have caught the real bug. This is
   the single most important design detail in detection (a).

**Accepted side.** `require('./task-registry').KINDS`.

**Both directions**, following the bidirectional pattern already proven at
`tests/menu-task-wiring.test.js:636-664`:

- *forward* (**hard**) — a kind the docs instruct that `KINDS` rejects. This is
  instance 1 and it is a hard failure: any new one blocks.
- *reverse* (**debt-seeded**) — a kind in `KINDS` that no recipe documents. Weaker by
  nature: `sync` is enqueued programmatically via `actions.enqueueWaveSync` and never
  typed by a human, so it is legitimately undocumented as a recipe. Reverse findings
  are therefore seeded into DEBT rather than treated as instant failures.

**Sibling enumerations swept the same way** (each is a registered vocabulary a document
can name and code can reject): `STATUSES` and `TERMINAL` in `task-registry.js`, and the
`claude:` action-key parity already fenced in `menu-task-wiring.test.js`. That existing
key parity is **not duplicated** — the scanner records it as already-fenced and skips it,
so there is exactly one fence per invariant.

### (c) Config key written or documented versus read

**Read `docs/CONFIG_SOURCES.md` before touching this — the two surfaces have two
different readers and conflating them produces false results in both directions.**

| File | Read by | Owns |
|---|---|---|
| `.ctoc/settings.yaml` | the PreToolUse hooks and library code (`src/hooks/*`, `src/lib/budget.js`, `src/lib/regulatory-regime.js`) | `enforcement.mode`, `regulatory_regime`, `operations` |
| `.ctoc/settings.json` | `src/lib/settings.js` and `src/lib/deployment.js` | `general.environment`, `agents`, `workflow`, `learning`, `git`, `privacy`, `deployment` |

`enforcement.mode` (yaml) and `workflow.enforcementMode` (json) are **different keys on
different surfaces**. A name-only matcher would see "enforcement" in `settings.js:59`
and wrongly certify the yaml key as read. The scanner therefore keys every finding by
`<surface>::<dotted.path>` and only credits a reader that reads the **same** surface.

**Written side.** The keys emitted by `generateSettings()` in `src/lib/init-project.js`
(the yaml surface) and the schema defaults in `src/lib/settings.js` (the json surface).

**Read side.** A key counts as read when its leaf name, or its dotted path, appears in
`src/**` **outside** the writer that emits it and outside a comment. Deliberately
generous: this detector must **under**-report, exactly like the export fence. The bias is
stated in the header comment governing the export-level analysis at
`src/lib/reachability.js:333-335`. A fence that cries wolf gets whitelisted into
uselessness.

**A trap the five-agents plan documented and this plan inherits:** `src/lib/reachability.js`
contains **both** the exemplar and the counter-example for "a citation is not an
invocation". `exportedNames` (declared `:499`) calls `stripComments` as its first statement
(`:500`) and is the model to follow. `edgesFrom` (declared `:126`) does the opposite twenty
lines earlier — at `:145` any string literal ending in `.js` becomes a call edge, and at
`:231` any `src/…` path merely mentioned in any markdown becomes a reachability root, with
no comment stripping and no call syntax required. Follow `exportedNames`. A reader who
opens the file and lands on the wrong function concludes the opposite of the truth.

**Expected seed for the yaml surface**, from the live `generateSettings()` at
`init-project.js:504-535`: `enforcement.mode`, `quality.coverage_threshold`,
`quality.flaky_test_retries`, `quality.flaky_test_action`, `research.enabled`,
`research.auto_steps`, `detected.languages`, `detected.frameworks` — grepping `src/`
found no reader for any of them. `regulatory_regime.active_profiles` **is** read
(`src/lib/regulatory-regime.js` `loadActiveProfiles`) and must come back clean; that is
the detector's own non-vacuity control.

## Implementation Details

### Dependency graph

```
src/lib/unexecutable-instruction-scan.js        ← EXTENDED here, not created
   ├── requires  src/lib/safe-fs.js          (audited fs choke point — no raw fs)
   ├── requires  src/lib/task-registry.js    (KINDS / STATUSES / TERMINAL)   ← ADDED
   └── reads     src/commands/*.md, src/lib/init-project.js,
                 src/lib/settings.js, src/**  (as data)                       ← ADDED

src/lib/iron-loop-enforcer.js
   └── requires  src/lib/unexecutable-instruction-scan.js   ← the live call site,
                                                              ALREADY WIRED upstream

tests/unexecutable-instruction-fence.test.js    ← EXTENDED here, not created
   ├── requires  src/lib/unexecutable-instruction-scan.js
   └── reads     .ctoc/unexecutable-instruction-baseline.json
```

No cycle: the scanner requires `task-registry`, which requires only `safe-fs` and
`plan-coverage`. The enforcer already requires `reachability` the same way.

### Wiring — already live, and this plan must not duplicate it

| Module | Live call site | Root it is reachable from |
|---|---|---|
| `src/lib/unexecutable-instruction-scan.js` | the `CHECKS` entry `{ id: 'unexecutable-instruction-fence', … }` in `src/lib/iron-loop-enforcer.js`, **shipped by the five-agents plan** | `iron-loop-enforcer.checkAllInvariants`, reached from the shipped `src/commands/menu.js` self-check route |

This plan adds detections to a scanner that is **already reachable**. It must **not** add a
second `CHECKS` entry — one fence, one entry. If a second entry appears, the human sees two
verdicts for one invariant family and trusts neither.

### File: `src/lib/unexecutable-instruction-scan.js`

**Action:** MODIFY — extend the existing `scan(root)`.
**Exports:** unchanged. Still exactly one name, `scan`. Any second export would be flagged
by the dead-export fence.

The `Finding.detection` union widens from `'instruction-tool'` to
`'instruction-tool'|'recipe-kind'|'recipe-kind-reverse'|'config-key'`, and `scanned` gains
`commandDocs` and `settingsKeys` counters beside the existing `agents` and `withGrant` —
because a scan that read zero command documents must fail the fence, never pass it silently.

**Additional module-private helpers** (none exported), beside the five the five-agents plan
already ships:

| Helper | Signature | Behaviour |
|---|---|---|
| `recipeKinds` | `(md: string) => Array<{kind, line}>` | both the inline and the displaced shapes; skips single-uppercase-letter metavariables |
| `writtenSettingsKeys` | `(root: string) => Array<{surface, path, line, file}>` | yaml keys from `generateSettings()`'s emitted literal; json keys from the `settings.js` schema |
| `keyIsRead` | `(root, surface, dottedPath) => boolean` | leaf-or-dotted occurrence in `src/**`, excluding the emitting writer and comment lines |

**Baseline key shapes** — stable identifiers, **no line numbers** (a line number in a
key makes the baseline churn on every unrelated edit and turns the fence into noise), in
the same namespace the five-agents plan established:

```
recipe-kind          src/commands/menu.md::recipe-kind::precompute
recipe-kind-reverse  src/lib/task-registry.js::recipe-kind-reverse::sync
config-key           settings.yaml::config-key::enforcement.mode
```

**Failure-message contract** — every finding's `fix` **prescribes**, naming the file and
the safe shape. Vague messages are how a fence gets ignored:

- `recipe-kind` → *"`src/commands/menu.md` instructs kind `X`, which `KINDS` in
  `src/lib/task-registry.js` rejects — every such call throws and the recipe silently
  never runs. Either add `X` to `KINDS` (with a docblock note saying why) or correct the
  recipe to name an accepted kind."*
- `config-key` → *"`<writer>` writes `<surface>` key `<path>` but no code in `src/`
  reads it — a visible setting wired to nothing is a placebo. Either wire a reader (and
  note it in `docs/CONFIG_SOURCES.md`) or stop writing the key."*

**Cross-platform:** all paths via `path.join`; every baseline key and `file` field
normalized to forward slashes with `path.posix` so a Windows scan produces byte-identical
keys to a macOS one. All filesystem access through `src/lib/safe-fs.js`. No `execSync`.

### File: `src/lib/iron-loop-enforcer.js`

**Action:** MODIFY — **minimally**.

The `CHECKS` entry and `checkUnexecutableInstructionFence(root)` already exist. This plan
touches this file **only** if the new detections require the message to name a detection
kind. Do **not** add a second check, do **not** change the entry's `id`, and do **not**
change its `mode: 'thorough'`. The `null`-return guard for a non-CTOC tree widens from
`scanned.agents === 0` to also tolerate `scanned.commandDocs === 0`, and a malformed
baseline must continue to excuse **nothing**.

### File: `.ctoc/unexecutable-instruction-baseline.json`

**Action:** MODIFY — add the new detections' seeded debt from a **real scan at Step 8**,
never hand-guessed. The file, its `comment`, its `debt`/`exemptions` split and its
`maxDebt` ratchet already exist. `maxDebt` **rises** by exactly the count of newly seeded
findings and by nothing else — and that is the one and only circumstance in which this
number may rise: a **new detection revealing pre-existing debt**. It may never rise to
accommodate a newly introduced defect.

`exemptions` stays **empty**.

### Test plan: `tests/unexecutable-instruction-fence.test.js`

**Action:** MODIFY — append cases. Framework `node:test` with `assert/strict`, matching
every sibling fence in `tests/`. The existing 19 cases must all still pass unchanged; if
any of them has to be weakened to accommodate a new detection, **STOP and report** — the
code changes, not the test.

| # | Test | Drives |
|---|---|---|
| 20 | **Non-vacuity, extended** — `scanned.commandDocs >= 1` and `scanned.settingsKeys >= 5`. A scan that read nothing must fail, never pass silently (the false-green trap this fence must not fall into itself). | the analyzer |
| 21 | **(a) REAL INSTANCE, historical** — a fixture reproducing `menu.md:232` verbatim (``Record a task per ref (`menu task add`, kind `precompute`…)``) scanned against a `KINDS` set lacking `precompute` yields exactly one `recipe-kind` finding keyed `…::recipe-kind::precompute`. Asserts the **displaced** shape is caught — a naive `menu task add (\w+)` regex would miss the real bug. | instance 1 |
| 22 | **(a) forward parity is clean today** — the live repo produces zero fresh `recipe-kind` findings, because `precompute` was added to `KINDS`. | the fix holds |
| 23 | **(c) REAL INSTANCE, live** — the live scan contains `settings.yaml::config-key::enforcement.mode`, and that key is in `debt`. | instance 3 |
| 24 | **(c) surface separation** — `workflow.enforcementMode` on the json surface does **not** satisfy `enforcement.mode` on the yaml surface. | the `CONFIG_SOURCES.md` split |
| 25 | **(c) non-vacuity control** — `regulatory_regime.active_profiles` is **not** flagged, because `regulatory-regime.js` `loadActiveProfiles` reads it. Proves the reader-detection is not stuck returning false. | the detector |
| 26 | **ONE FENCE, ONE ENTRY** — `src/lib/iron-loop-enforcer.js` contains **exactly one** `CHECKS` entry whose `id` is `unexecutable-instruction-fence`, and no second entry for any detection in this family. | the boundary rule |
| 27 | **THE MOVED DETECTION IS NOT DUPLICATED** — this plan's added code introduces no second implementation of the agent-tool-grant detection; `scan` still exposes exactly one code path producing `detection === 'instruction-tool'`. | the boundary rule |

Coverage target ≥ 80% on the added code, error paths included (a missing
`src/commands/` directory yields `scanned.commandDocs === 0` rather than a throw).

## Security Review

- **Path traversal** — every read path is built with `path.join(root, …)` from a
  caller-supplied root; no path segment comes from scanned file *content*.
- **Regex denial of service** — the added patterns use bounded character classes and a
  bounded 200-character window for the displaced recipe shape, never a nested quantifier
  over unbounded input. Each scanned line is length-capped at 2000 characters before
  matching, matching the existing scanner.
- **No secrets** — the scanner reads config **key paths**, never values; no finding
  message may contain a settings value. Asserted in test 23's message check.
- **Prototype pollution** — findings are built from named fields, never spread from
  parsed content; the baseline is read into a `Set` of strings, never merged into an
  object.
- **Command injection** — no `exec`, no `execSync`, no shell. The scan is pure reads.
- **Error messages** — repo-relative paths only, never absolute ones that would leak a
  developer's home directory into a build log.
- **Fail direction** — the scanner **under**-reports by design; a malformed baseline
  excuses nothing.

## Execution Plan

### Step 8: TEST
Append tests 20–27 to `tests/unexecutable-instruction-fence.test.js`. Run it, **see the new
cases fail red** — the detections do not exist yet — and confirm the existing 19 still pass.
Then run the extended scanner once to **seed** the new detections' debt into
`.ctoc/unexecutable-instruction-baseline.json` from a real scan; record the seeded counts
per detection in this plan and the resulting `maxDebt` rise.

### Step 9: PREPARE
**First, confirm the five-agents plan has landed:**
`src/lib/unexecutable-instruction-scan.js` must exist and export `scan`, and
`src/lib/iron-loop-enforcer.js` must already contain the `unexecutable-instruction-fence`
`CHECKS` entry. **If either is absent, STOP and report — do not create them here.** Then
read `docs/CONFIG_SOURCES.md`, `src/lib/task-registry.js` `KINDS`, and
`tests/menu-task-wiring.test.js` before writing the parity code.

### Step 10: IMPLEMENT
- `src/lib/unexecutable-instruction-scan.js` — the three added private helpers, the widened
  `detection` union, and the two added `scanned` counters.
- `src/lib/iron-loop-enforcer.js` — only if the message needs to name a detection kind.
- `.ctoc/unexecutable-instruction-baseline.json` — the seeded debt from Step 8 and the
  `maxDebt` rise.

### Step 11: REVIEW
Verify the dependency direction (lib never imports hooks or commands), that exactly one
name is still exported, that no baseline key carries a line number, that every failure
message prescribes a fix naming a file and a safe shape, and — the boundary rule — that
there is still exactly **one** `CHECKS` entry and exactly **one** code path producing an
`instruction-tool` finding.

### Step 12: OPTIMIZE
One pass per file; the line split computed once per file, not per detection. The whole
scan must stay under one second over the corpus — it runs in `thorough` mode inside the
self-check.

### Step 13: SECURE
Walk the Security Review list above item by item. Confirm the length caps and the bounded
200-character window are present in the shipped regexes.

### Step 14: VERIFY
Run the **full gate**: `npm test`. Requires lint clean, typecheck clean, all tests
passing, **coverage at or above the enforced floor of 99** in
`.ctoc/coverage-baseline.json`, 0 skipped, 0 flaky. `node --test tests/*.test.js` is
**not** sufficient — it bypasses both the coverage floor and the zero-skipped gate.

### Step 15: DOCUMENT
JSDoc on every added private helper, including the two rejected-signature rationales so a
future maintainer does not "helpfully" add them back, and a note in the scanner's header
recording that the agent-tool-grant detection is owned by the five-agents plan **and only
there**, per the boundary rule.

### Step 16: FINAL-REVIEW
Confirm: both remaining detections have a test driving a real instance from the list; no
second `CHECKS` entry and no second scanner were created; `exemptions` is still empty; the
ratchet fails loudly in both directions; and the boundary rule is restated in the scanner's
own documentation so the next reader inherits it.

## Decisions Taken Under Ambiguity

1. **Reverse parity for task kinds is debt-seeded, not a hard failure.** `sync` is
   enqueued programmatically and legitimately has no human-typed recipe. Treating
   reverse findings as instant failures would have forced a false exemption on day one.
   Forward parity — the direction of the real instance — stays hard.
2. **The `claude:` action-key parity is not re-implemented.** `tests/menu-task-wiring.test.js:636-664`
   already fences it bidirectionally. The scanner records it as already-fenced and skips
   it: **one fence per invariant, or the two drift and the human trusts neither.** This is
   the rule the human applied on 2026-07-19 when he moved the agent-tool-grant detection
   out of this plan — it was already this plan's own decision, and it now governs the
   boundary *between* the two plans as well as the boundary inside this one.
3. **Config readers are detected by name occurrence in `src/**`, not by data-flow.** A
   real reachability analysis of a config read is out of proportion here. Name matching
   under-reports (a key mentioned anywhere counts as read), which is the safe direction.
4. **Both settings surfaces are scanned, keyed by surface.** Scanning only the yaml
   surface would have missed the general case the human asked for; merging the two
   surfaces would have falsely certified `enforcement.mode` as read via
   `workflow.enforcementMode`.
5. **`scan` remains the only export.** The dead-export fence would flag any second export.
6. **Plan 00069 (wiring enforcement mode) will make the ratchet fail on purpose.** When that
   plan lands, `enforcement.mode` stops being a finding, the live count drops below
   `maxDebt`, and the "claim your progress" test fails with an instruction to lower the
   baseline. That is the ratchet working as designed, not a conflict.
7. **After the narrowing this plan creates nothing and extends everything** — four modified
   files, no new ones. The alternative, its own scanner and baseline and test file and
   `CHECKS` entry alongside the five-agents plan's, is precisely what decision 2 forbids.
8. **The three rejected instruction signatures from this plan's original detection (b) went
   with it.** They are recorded in the five-agents plan, which owns that detection. Nothing
   about them is repeated here, because a rejected-signature rationale sitting in a plan
   that no longer owns the signature is how a deleted detection grows back.
