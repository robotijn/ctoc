---
approved_by: human
approved_at: 2026-07-19T16:47:51.605Z
gate_crossed: implementation → todo
title: "The reachability fence stops counting prose as a caller — a citation is not an invocation in the file fence either"
type: implementation
parent_plan: ctoc-honest-instruments
depends_on: none
blocks: 00090-the-plan-critic-stops-reporting-a-score-it-did-not-earn
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/reachability.js"
  - "tests/reachability.test.js"
  - ".ctoc/reachability-baseline.json"
  - ".ctoc/reachability-roots.json"
  - ".ctoc/export-reachability-baseline.json"
  - "CLAUDE.md"
---

# The reachability fence stops counting prose as a caller

> **REPAIR NOTE — an adversarial pre-mortem found a defect that inverts this
> slice's risk profile, and two structural corrections.** In summary: (1) every
> input path into the analyzer **fails silently toward "unreachable"**, and this
> slice deletes the prose-root rule that currently masks that — so one unreadable
> file during the single seeding run would commit live code to a shrink-only list
> whose only exits are wire or delete; (2) the proposed whitelist shape reintroduces
> the desynchronization the pattern it cites was built to prevent; (3) this slice
> and `00090` move the same strict-equality number with neither declaring the other.
> All three are fixed below. See decisions 9-13.

`.ctoc/reachability-baseline.json` says `maxUnreachable: 0` — every file in `src/`
is reachable from a live root. The file fence reaches that verdict two ways, and
both of them credit something that is not a call.

## Route one — any string literal ending in `.js`, matched by basename

`src/lib/reachability.js:145-153`, verified on disk:

```js
  const literalPattern = /['"]([^'"]*\.js)['"]/g;
  const selfBase = path.basename(file);
  while ((match = literalPattern.exec(content)) !== null) {
    const base = path.basename(match[1]);
    if (base === selfBase) continue;
    for (const candidate of allFiles) {
      if (path.basename(candidate) === base) out.add(candidate);
    }
  }
```

Any quoted string ending in `.js`, anywhere in any file — in a comment, in an error
message, in a configuration array — becomes an outbound call edge to **every** file
sharing that basename.

The live example is `src/lib/iron-loop-enforcer.js:73-82`:

```js
const REQUIRED_LIBS = [
  'src/lib/state.js',
  'src/lib/actions.js',
  'src/lib/quality-gate.js',
  'src/lib/iron-loop.js',
  'src/lib/plan-validator.js',
  'src/lib/escape-phrases.js',
  'src/lib/v8-dispatcher.js',
  'src/lib/product-loop.js',     // v8.4+ Product Loop
];
```

Those strings are used for an `existsSync` presence check. The enforcer never
requires, spawns or executes any of them. Yet the fence reads the array as eight
call edges, and `quality-gate.js`, `v8-dispatcher.js` and `product-loop.js` are
credited as live on the strength of a list that only checks whether they exist.

`edgesFrom` also scans the RAW file content — comments included. A `require('./x')`
written inside a comment is an edge. The export fence solved this exact problem in
this same module with `stripComments`, and documented why: *"A fence a comment can
disarm is not a fence."* The file fence never got the fix.

## Route two — any `src/**.js` path mentioned in any markdown becomes a ROOT

`src/lib/reachability.js:229-237`:

```js
    const mention = /src\/[A-Za-z0-9_\-/.]+\.js/g;
    let m;
    while ((m = mention.exec(text)) !== null) {
      const hit = byRel.get(m[0]);
      if (hit) roots.add(hit);
    }
```

No call syntax is required. A sentence in an agent definition that merely *names*
a file — "Audit hash-chain (`src/lib/audit-chain.js`) — every dispatch entry is
content-hashed" — promotes that file to a live execution root, on a par with a
registered hook or a shipped slash command. Roughly a third of the library is a
root by mention alone, and most of those mentions are descriptive prose in agent
markdown, not instructions to run anything.

## The correct rule is already written down in this repository

`.ctoc/export-reachability-baseline.json:2`, verbatim:

> A BARE PROSE TOKEN (even a backtick code-span that merely NAMES the function …)
> and COMMENTS are NOT callers — a citation is not an invocation.

The sibling EXPORT fence applies that rule: `surfaceCalledNames` credits a name only
when a surface *invokes* it (`name(`, `require('…').name`), never when prose merely
names it. `tests/export-reachability.test.js` pins the distinction with planted
fixtures. The FILE fence, twenty lines away in the same module, credits both prose
and comments. This slice makes the two fences agree on what a caller is.

---

## THE INVERTED RISK: every input path fails silently toward "dead"

This is the finding that changes how this slice must be built. Verified on disk —
three separate degradations, all silent, all toward *unreachable*:

| Site | Code | Silent consequence |
|---|---|---|
| `edgesFrom` `:129-133` | `try { content = readFileSync(file) } catch { return out; }` | an unreadable source file has **no outbound edges** — everything it reaches loses a caller |
| `liveRoots` `:200-202` | `try { raw = readFileSync(manifest) } catch { raw = ''; }` | an unreadable hooks manifest becomes the **empty string**, so `raw.includes(basename)` is false for EVERY hook — **every registered hook loses root status at once**, with no error |
| `liveRoots` `:226-228` | `try { text = readFileSync(surface) } catch { continue; }` | an unreadable instruction surface is **skipped** — every root it would have declared is lost |

**Today this is masked** by the prose-root rule: so many files are roots by mention
that a lost hook root is invisible. **This slice deletes that mask.** After it lands,
one unreadable manifest silently declares every hook — and its entire transitive
tree — unreachable.

And the original Step 10 instruction was to seed the permanent list from that output
with *"do not round, trim or curate the list."* Composed together, that is:

> a silent input failure during the single seeding run becomes committed debt, in a
> list whose only sanctioned exits are **wire or delete**.

**A fence whose failure mode is "everything is dead", feeding a list that can only
shrink, nominates live code for deletion.** That is the same defect class as the
coverage floor silently becoming 80 — an instrument reporting a verdict on input it
never received — and it must be fixed the same way, in the same slice, because this
slice is what removes its camouflage.

### Change 0 — the analyzer FAILS LOUD on unreadable input

This is a new, load-bearing change and it is **prerequisite to seeding**:

- **An unreadable hooks manifest is FATAL.** `analyze()` throws with the path and the
  underlying error. It must never proceed with `raw = ''`. A manifest that cannot be
  read is a broken instrument, not a project with no hooks. (An **absent** manifest
  is a different, legitimate state and keeps its current handling — the same
  absent-versus-unreadable distinction the coverage-floor repair draws.)
- **An unreadable source file is FATAL by default.** It throws with the path.
- **An unreadable instruction surface is FATAL by default.** It throws with the path.
- **`analyze()` returns a `readErrors` array** alongside its result, and the count of
  files it could not read. A run with a non-empty `readErrors` **may not be used to
  seed a baseline** — the seeding path asserts `readErrors.length === 0` and refuses
  otherwise.

**The seeding run must record how many files it could not read**, and that number
must be **zero** for the seed to be accepted. A seed taken from a partial read is
committed debt built on absence of evidence.

---

## The count will rise, and that is the fence starting to work

Tightening the rule will move a substantial number of files out of the reachable
set — an independent recount put it near 23, but **this plan deliberately does not
hardcode that number.** The executor computes the real list at Step 10 and seeds
the baseline from what the analyzer actually reports.

A rise from 0 to N here is **not a regression**: the files were always dead; the
instrument was reporting a verdict on evidence it never had. Follow the pattern
this repository already uses for exactly this situation, in
`.ctoc/false-green-baseline.json` — two deliberately separate structures:

- **`unreachable`** — pre-existing DEBT. May only ever SHRINK. No per-entry
  justification required (demanding one for every entry is how a fence never lands).
- **`whitelist`** — a PERMANENT exemption for a file that is genuinely reachable by
  a mechanism the analyzer cannot see. Starts EMPTY. Every entry requires a written
  justification. Adding to `whitelist` is a reviewable act; adding to `unreachable`
  is forbidden.

Conflating those two is what kills a fence. `CLAUDE.md` says so outright.

**Seed the debt list with whatever is actually found. Whitelist nothing.**

### The whitelist is ONE object, not an array plus a side-table

**Corrected.** This plan originally proposed `"whitelist": []` alongside a separate
`"whitelistJustifications": {}`. That reintroduces exactly the desynchronization the
cited pattern was built to prevent: two structures that must be kept in step by hand,
where an entry can exist in one and not the other.

The pattern this plan claims to follow stores them as **one object keyed by entry,
with the justification as the value**. Verified on disk —
`.ctoc/false-green-baseline.json:221` is `"whitelist": {}`, and
`tests/false-green-fence.test.js:284` iterates it as key-and-reason pairs:

```js
for (const [key, reason] of Object.entries(baseline.whitelist || {})) {
```

with `:229` reading `new Set(Object.keys(baseline.whitelist || {}))`.

**Align exactly:** `"whitelist": {}` — an object mapping file path to written
justification. `whitelistJustifications` is **not created**. One object makes the
entry and its justification impossible to desynchronize, because they are the same
key-value pair.

## Implementation Details

### File: `src/lib/reachability.js`
**Action:** MODIFY
**Purpose:** Make the file fence credit invocations only — the same rule the export fence already enforces — and stop it failing silently toward "dead".
**Change type:** modify-existing — `edgesFrom`, the surface-root scan inside `liveRoots`, and the three read paths

#### Change 0 — fail loud on unreadable input (see the section above)

The three `catch` sites at `:129-133`, `:200-202` and `:226-228` stop degrading
silently. `analyze()` gains a `readErrors` array. **This change lands FIRST**, before
any seeding, because the seed's validity depends on it.

#### Change 1 — strip comments before extracting edges

In `edgesFrom`, run the existing `stripComments` over the content before either
pattern executes. `stripComments` is defined below `edgesFrom` in the same module;
function declarations hoist, so no reordering is needed — confirm at Step 9.

A `require` in a comment is not a call. This is the fix the export fence already
carries, applied to the file fence.

#### Change 2 — a path literal is an edge only when something INVOKES it

Replace the basename-matched literal scan with a spawn-context scan. Two
conditions, both required:

1. **Invocation context.** The literal appears as an argument to a process-spawning
   call, or inside a command string that runs it. Recognised forms, matched with
   bounded, linear, disjoint-class regexes in the style of `SURFACE_CALL_RE`:
   - `spawn(`, `spawnSync(`, `fork(`, `exec(`, `execSync(`, `execFile(`,
     `execFileSync(` — the literal appears within that call's argument text;
   - a command string containing `node` followed by the path (covers
     `` `node "${…}/src/commands/menu.js"` `` and the hooks manifest's command
     strings).
2. **Path form.** The literal contains a path separator and resolves — after
   normalising `/` and `\` — to a real file under `src/`. A bare basename
   (`'menu.js'`) no longer matches anything, and one basename never again fans out
   to every file that shares it.

Under this rule the `REQUIRED_LIBS` array manufactures no edges: it is a list of
strings passed to `existsSync`, which is not an invocation.

**KNOWN GAP — three real invocation shapes this rule does NOT recognise.** Named
here so they are checked rather than discovered as deletions:

| Shape | Example | Why the rule misses it |
|---|---|---|
| **hoisted variable** | `const script = path.join(root,'src/lib/w.js'); spawnSync(node,[script])` | the literal is not inside the spawn call's argument text |
| **`new Worker(...)`** | `new Worker('./src/lib/w.js')` | `Worker` is not in the recognised call list |
| **dynamic `import()`** | `await import('./src/lib/w.js')` | not a spawn form and not matched by the `require` pattern |

Each of these would put **live production code** onto a shrink-only list whose exits
are wire or delete. Step 9's enumeration (below) is therefore a **pass-or-fail
gate**, not a survey.

#### Change 3 — a markdown mention is a root only when the surface RUNS it

Replace the bare `mention` regex with an invocation-only scan over the same surface
files. A `src/**.js` path becomes a root only when it appears as:

- `node <path>` — with or without intervening flags, quotes or a
  `${CLAUDE_PLUGIN_ROOT}`-style prefix; or
- `require('<path>')` / `require("<path>")` — the session model's inline
  `node -e "require('./src/lib/x.js')"` form.

A path named in prose — with or without backticks — is a citation and is no longer
a root. This is `surfaceCalledNames`' rule, transposed from names to paths.

Update the module header (`:41-57`) so the documented root list matches the
implemented one: instruction-surface root 5 becomes "any src file a shipped
instruction INVOKES (`node <path>` or `require('<path>')`) — a file merely NAMED in
prose is a citation, not a root."

---

### File: `tests/reachability.test.js`
**Action:** MODIFY
**Purpose:** Teach the ratchet the debt/whitelist separation, pin the new caller rule with planted fixtures, and pin the fail-loud behaviour.
**Change type:** modify-existing — the baseline read and the four ratchet assertions, plus new fixture cases

1. **Read both structures.** `allowed` becomes `new Set(baseline.unreachable)`;
   add `exempt = new Set(Object.keys(baseline.whitelist || {}))` — **keys of an
   object**, mirroring `tests/false-green-fence.test.js:229`. The live set under test
   is `result.unreachable.filter((f) => !exempt.has(f))`.
2. **Every ratchet assertion runs against the exempt-filtered set**, so a whitelist
   entry cannot inflate the debt count and a debt entry cannot masquerade as an
   exemption.
3. **A new assertion — the whitelist is justified.** Iterate
   `Object.entries(baseline.whitelist || {})` and require every value to be a
   non-empty string justification, mirroring `false-green-fence.test.js:284-295`. An
   unjustified exemption fails the gate. With an empty whitelist this passes
   vacuously, which is the correct starting state.
4. The existing non-vacuity, no-new-dead, ratchet-only-tightens, lower-the-baseline
   and no-phantoms assertions are **kept and not weakened**. The
   `lower-the-baseline` equality assertion stays an equality.

New planted-fixture cases, in the style the export fence test already uses
(temporary project, real analyzer, no seams):

| # | Case | Fixture | Assertion |
|---|---|---|---|
| 1 | **a presence-check array is not a caller** | `live.js` requires nothing; `enforcer.js` (reachable) holds `const L = ['src/lib/orphan.js']; existsSync(L[0])` | `orphan.js` is UNREACHABLE |
| 2 | **a real spawn by path is still a caller** | a root that runs `spawnSync('node', [path.join(root,'src/lib/spawned.js')])` with the literal `'src/lib/spawned.js'` | `spawned.js` is REACHABLE |
| 3 | **a require inside a comment is not a caller** | a live file whose only reference is `// require('./ghost')` | `ghost.js` is UNREACHABLE |
| 4 | **prose naming a path is not a root** | an agent markdown containing "the audit chain (`src/lib/cited.js`) hashes each entry" and nothing else | `cited.js` is UNREACHABLE |
| 5 | **a surface that RUNS a path is a root** | a command markdown containing `node src/scripts/invoked.js` | `invoked.js` is REACHABLE |
| 6 | **an inline require recipe is a root** | a surface containing `` node -e "require('./src/lib/recipe.js').go()" `` | `recipe.js` is REACHABLE |
| 7 | **a basename collision cannot fan out** | two files named `helper.js` in different directories; one literal `'helper.js'` in a live file | NEITHER becomes reachable via that literal |
| 8 | **a test is still never a root** | unchanged assertion, re-run under the new rule | no test file in `roots` or `sources` |
| 9 | **the whitelist requires a justification** | a temporary baseline with a whitelist entry whose value is `""` | the gate FAILS |
| 10 | **an UNREADABLE hooks manifest is FATAL, not "no hooks"** | fixture project whose manifest exists but cannot be parsed/read | `analyze()` THROWS naming the manifest path. It must NOT return a result in which every hook is unreachable |
| 11 | **an ABSENT hooks manifest is still the legitimate no-hooks state** | fixture project with no manifest file | current behaviour preserved — absent and unreadable are different facts |
| 12 | **an unreadable source file is FATAL** | fixture with an unreadable `src/lib/x.js` | throws naming the path; does not silently report zero edges |
| 13 | **an unreadable instruction surface is FATAL** | fixture with an unreadable agent markdown | throws naming the path; does not silently skip |
| 14 | **`readErrors` is reported and blocks seeding** | a run with one unreadable input | `result.readErrors` is non-empty and names the file; the seeding path refuses |
| 15 | **the three known-gap shapes are pinned as KNOWN** | fixtures for hoisted-variable spawn, `new Worker(path)`, and dynamic `import(path)` | assert the ACTUAL behaviour of each and name it in the title. Whatever Step 9 decides (recognise or document), these cases make the answer visible instead of silent |

---

### File: `.ctoc/reachability-baseline.json`
**Action:** MODIFY
**Purpose:** Record the truth the tightened fence reports, as DEBT that may only shrink.

New shape — note `whitelist` is an **object**, and there is no separate
justifications map:

```json
{
  "comment": "THE DEAD-CODE FENCE baseline. RE-SEEDED <date>: the fence previously credited a BARE PROSE MENTION in markdown as an execution root and ANY string literal ending in .js as a call edge, matched by basename. Neither is an invocation — the sibling export fence has always said so ('a citation is not an invocation') and this fence now agrees. The count did not rise because code died; it rose because the instrument stopped reporting a verdict on evidence it never had.",
  "note": "DEBT, not blessing. This list may only ever SHRINK; entries leave it by being WIRED or DELETED. Never add a file here to make a failing build pass.",
  "whitelistNote": "SEPARATE from the debt list above. `whitelist` is a PERMANENT exemption for a file genuinely reachable by a mechanism the analyzer cannot see. It maps FILE -> WRITTEN JUSTIFICATION in ONE object (the shape .ctoc/false-green-baseline.json uses) so an entry and its reason cannot desynchronize. It starts EMPTY. Adding to `whitelist` is a reviewable act; adding to `unreachable` is forbidden.",
  "reseededAt": "<ISO date>",
  "seedReadErrors": 0,
  "maxUnreachable": <computed>,
  "unreachable": [ <computed, sorted> ],
  "whitelist": {},
  "lastLowered": "<date>"
}
```

`maxUnreachable` and `unreachable` are whatever `analyze()` actually returns. Do not
round, trim or curate the list — **and do not seed at all unless
`seedReadErrors` is 0.**

---

### File: `.ctoc/reachability-roots.json`
**Action:** MODIFY
**Purpose:** Declare a root for a file that is genuinely EXECUTED by a mechanism the analyzer cannot see.

The escape hatch already exists and is the honest home for exactly one known case:
`src/hooks/post-commit.js` is copied into `.git/hooks/` by
`src/lib/hooks-installer.js` and is then executed **by git**. That is real
execution, not a citation.

Rules for this file in this slice:

- A declared root is allowed ONLY when a real mechanism executes the file, and the
  entry carries a one-line reason naming that mechanism.
- Verify the installation path at Step 9 by reading `hooks-installer.js`. If it
  turns out the installer does not install that file, **the code wins**: no root is
  declared and the file goes to the debt list.
- Everything else goes to DEBT. Do not use this file to make the number look better.

`src/hooks/validate-plan-steps.js` is **not** a declared root: `CLAUDE.md` documents
it as a standalone script that is deliberately not wired as a runtime hook, and
`CLAUDE.md` is not a shipped instruction surface the analyzer reads. Unwired is the
truth about that file, so it belongs in the debt list — where a future slice can
wire it or delete it.

---

### File: `.ctoc/export-reachability-baseline.json`
**Action:** MODIFY
**Purpose:** Absorb the export fence's coupled movement.

`analyzeExports` calls `analyze()` and classifies exports only inside LIVE files
(`reachability.js:559-563`). Shrinking the live set therefore changes the dead-export
count, and `tests/export-reachability.test.js:131-138` asserts strict EQUALITY
against `maxDead`. So the export baseline must move in the same change or the suite
goes red for a reason that has nothing to do with a real defect.

Expected direction: exports inside newly-unreachable files leave the dead list
(their file is now the file fence's business — the module header at `:550-553` says
a dead export inside an already-dead file is not double-counted), so `maxDead`
should DROP. Remove exactly the entries the analyzer no longer reports, set
`maxDead` to the **live measured count**, and record the reason in the comment.
**If the count rises instead, STOP and report it** — that would mean the tightening
exposed dead exports in files that stayed live, which is a finding the human must see
rather than a number to absorb.

**COUPLING — `00090` moves this same key.** `00090-the-plan-critic-stops-reporting-a-score-it-did-not-earn`
also edits `maxDead` (it deletes two dead exports and predicted `102 → 100`). The two
movements are **not additive**: this slice changes what the analyzer *classifies*, so
whichever lands second sees a different starting number than its plan predicted.

**Ordering, declared:** this slice carries `blocks: 00090-…` and `00090` carries the
matching `depends_on`. **This slice lands FIRST.** Its own `maxDead` is measured, and
`00090` then measures again against the post-fence reality. **Neither plan's written
number is authoritative — read what the analyzer reports.**

---

### Wiring — the live call sites

| changed code | live call site | root |
|---|---|---|
| fail-loud read paths (Change 0) | `analyze` → `analyzeExports` (same module) | `npm test`; `iron-loop-enforcer` reachability check |
| `edgesFrom` (Changes 1 + 2) | `analyze` → `analyzeExports` (same module) | `npm test` via `src/scripts/test-gate.js`; `iron-loop-enforcer` reachability check |
| the surface-root scan (Change 3) | `liveRoots` → `analyze` | same |
| the debt/whitelist split | `tests/reachability.test.js` (this slice) | `npm test` |

`analyze` is already consumed by the shipped fences; this slice changes what it
reports, not who calls it.

## Test Plan

Covered above under `tests/reachability.test.js`. The load-bearing property is that
each new case is a **planted fixture in a temporary project** driving the real
analyzer — the same discipline `tests/export-reachability.test.js` uses. No case
asserts against the live repository's counts, so the suite does not have to be
edited every time a file is wired or deleted.

## Execution Plan (Steps 8-16)

### Step 8: TEST — add cases 1, 3, 4, 7, 9, 10, 12, 13 and 14 to `tests/reachability.test.js` FIRST and run only that file. Cases 1, 3, 4 and 7 MUST be red today (a presence-check array, a commented-out require, a prose mention and a basename collision all currently create edges or roots); case 9 must be red because the whitelist structure does not exist; **cases 10, 12, 13 and 14 must be red because all three read paths currently degrade silently.** Cases 2, 5, 6, 8 and 11 must be GREEN before and after — they pin behaviour that must not break. Record the red output verbatim.
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
### Step 9: PREPARE — re-read from disk: `src/lib/reachability.js` in full (confirm `stripComments` hoists above `edgesFrom`'s use, and the exact current line numbers — this plan cites `:129-133`, `:145-153`, `:200-202`, `:226-228` and `:229-237`); `src/lib/hooks-installer.js` (does it install `post-commit.js` into `.git/hooks`?); `.ctoc/false-green-baseline.json` and `tests/false-green-fence.test.js:225-296` (the whitelist-as-one-object shape to mirror exactly); and both baseline files. Where the code disagrees with this plan, THE CODE WINS — record the discrepancy.
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
###   **Step 9a — THE SPAWN-SITE ENUMERATION IS A PASS-OR-FAIL GATE, and it runs BEFORE seeding.** Enumerate EVERY real invocation site in `src/` and `.claude-plugin/hooks.json` — every `spawn`/`spawnSync`/`fork`/`exec*` call, every `new Worker(...)`, every dynamic `import(...)`, and every hoisted-variable spawn (`const p = …; spawnSync(node,[p])`). Produce an **explicit list, one line per site, each marked PASS (still resolves under the new rule) or FAIL (would be lost)**. **If ANY site is marked FAIL, STOP and report before seeding** — either extend Change 2 to recognise that shape, or surface it to the human. Seeding a shrink-only list while a live invocation shape is unrecognised is how live production code gets nominated for deletion. The three known gaps (hoisted variable, `new Worker`, dynamic `import`) are named in Change 2 and must each appear in this list with a verdict.
### Step 10: IMPLEMENT — one step, files as sub-items.
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
  - `src/lib/reachability.js` — Change 0 (fail-loud reads + `readErrors`), then Changes 1, 2 and 3, plus the header correction.
  - `tests/reachability.test.js` — the debt/whitelist read (object keys), the exempt-filtered ratchet assertions, the justification assertion, and cases 1-15.
  - `.ctoc/reachability-baseline.json` — re-seeded from the analyzer's ACTUAL output; `whitelist` an EMPTY OBJECT; `seedReadErrors` recorded. **The seed is INVALID and must not be committed if `readErrors` is non-empty.**
  - `.ctoc/reachability-roots.json` — at most the `post-commit.js` declaration, only if Step 9 confirms the installer.
  - `.ctoc/export-reachability-baseline.json` — the coupled movement, direction verified, set to the LIVE measured count.
### Step 11: REVIEW — print the newly-unreachable list in full in the execution record; do not summarise it. For each entry state in one line why it has no caller. **Cross-check the list against the Step 9a enumeration: no file that appears as a PASS invocation target may appear in the unreachable list.** Confirm no file was moved into `whitelist` and no declared root was added beyond the justified one. Confirm the two fences now state the same caller rule in their headers, word for word where possible. Confirm `whitelist` is an object and that no `whitelistJustifications` key was created.
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
### Step 12: OPTIMIZE — the scan runs once per file over already-read content. Confirm every new regex uses disjoint character classes with a literal sentinel (linear, ReDoS-safe, the `SURFACE_CALL_RE` discipline) and that no pattern backtracks over the whole file.
### Step 13: SECURE — the analyzer reads repository files and matches patterns; it executes nothing and spawns nothing. Confirm no new pattern can be driven into catastrophic backtracking by a crafted source file, that path resolution stays inside the project root, and that Windows and POSIX separators are both normalised (`path.sep` → `/`) before any comparison. Confirm the new fatal errors name a repository-relative path and never an absolute home directory.
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
### Step 14: VERIFY — run `tests/reachability.test.js` and `tests/export-reachability.test.js` together, then the full gated run `npm test`. The reachability and export ratchets must both be green against the RE-SEEDED baselines. Lint the changed JavaScript. The coverage floor is a ratchet — do not lower it. No git operations.
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
### Step 15: DOCUMENT — update the module header so the implemented rule and the documented rule match, **including the fail-loud contract and the `readErrors` return**. Update the two sentences in `CLAUDE.md` that describe the reachability fence so a reader learns the count is debt, not a regression, and bump the documented test-file count if a test file was added (read the live count from disk first).
### Step 16: FINAL-REVIEW — report the full newly-unreachable list, the Step 9a enumeration with every site's PASS/FAIL verdict, `seedReadErrors`, both baseline movements with their before/after numbers, verbatim red and green evidence, and every decision taken under ambiguity.
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.

## Decisions Taken Under Ambiguity

1. **The debt list is seeded from the analyzer's real output, not from a number in
   this plan.** An independent recount suggested roughly 23 files, but a planner who
   hardcodes a count invites an executor to make the code match the plan instead of
   making the baseline match reality. The plan specifies the METHOD; the executor
   records the RESULT.
2. **`whitelist` starts EMPTY and nothing is added to it.** `CLAUDE.md` states that
   conflating permanent exemption with tolerated debt is what kills a fence. The one
   file with a genuine invisible execution mechanism (`post-commit.js`, run by git)
   goes to the DECLARED ROOTS file instead — that is the existing, reviewable escape
   hatch for a real entry point, and it is a stronger claim than an exemption.
3. **`validate-plan-steps.js` goes to DEBT, not to a declared root.** `CLAUDE.md`
   documents it as deliberately unwired. Declaring it a root would restate the
   documentation as if it were a mechanism.
4. **Comment stripping is included even though the brief did not name it.** It is
   the same defect class in the same function, the fix already exists in this module
   (`stripComments`), and the export fence's header records that a comment-disarmable
   fence is not a fence. Leaving it would ship a half-tightened rule.
5. **Change 2 requires BOTH invocation context and path form.** Path form alone
   would still credit `REQUIRED_LIBS` (those entries are full paths). Invocation
   context alone would be brittle against multi-line spawn calls. Requiring both is
   what makes the presence-check array stop manufacturing edges.
6. **The export baseline is edited in the same slice.** The coupling is mechanical
   and the export test asserts strict equality, so splitting the two would leave the
   suite red between slices for a non-defect. The direction is verified rather than
   assumed, and a rise stops the work and is reported.
7. **This slice does not wire or delete a single unreachable file.** Discovering the
   truth and acting on it are different decisions, and which dead file gets wired
   versus deleted is the human's call, made against the list this slice produces.
8. **Six files are declared instead of the usual one to three.** Three are ratchet
   data files that move mechanically with the source change, and one is the
   documentation count the suite verifies. The substantive edit surface is two files.
9. **CHANGE 0 IS NEW AND IS PREREQUISITE TO SEEDING — the largest repair here.**
   All three read paths in the analyzer degrade silently toward *unreachable*: an
   unreadable source returns no edges (`:129-133`), an unreadable hooks manifest
   becomes `''` so every hook loses root status at once (`:200-202`), and an
   unreadable surface is skipped (`:226-228`). Today the prose-root rule masks this;
   **this slice deletes the mask**, and the original Step 10 then instructed seeding
   a shrink-only list from that output verbatim. Composed, a single silent read
   failure would commit live code to a list whose only exits are wire or delete —
   a fence whose failure mode is "everything is dead" nominating live code for
   deletion. Absent and unreadable are treated as DIFFERENT facts, exactly as the
   coverage-floor repair draws the same line.
10. **The seed is refused unless `readErrors` is zero, and the count is recorded in
    the baseline** (`seedReadErrors`). A seed taken from a partial read is committed
    debt built on absence of evidence. Recording the number makes a future reader
    able to tell a clean seed from a lucky one.
11. **The whitelist is ONE OBJECT — the original two-structure proposal is
    withdrawn.** `"whitelist": []` plus `"whitelistJustifications": {}` reintroduces
    precisely the desynchronization the cited pattern prevents. Verified: the pattern
    stores one object keyed by entry with the justification as the value
    (`.ctoc/false-green-baseline.json:221` is `"whitelist": {}`;
    `tests/false-green-fence.test.js:284` iterates `Object.entries`, `:229` reads
    `Object.keys`). Aligned exactly; `whitelistJustifications` is not created.
12. **The three known invocation gaps are NAMED and gated, not silently accepted.**
    A hoisted-variable spawn, `new Worker(path)`, and dynamic `import(path)` are all
    real shapes that Change 2 does not recognise. Rather than discover them as
    deletions later, Step 9a makes the spawn-site enumeration an explicit
    **pass-or-fail list that runs BEFORE seeding**, any FAIL stops the work, and case
    15 pins each shape's actual behaviour so the answer is visible rather than
    assumed.
13. **The `maxDead` coupling with `00090` is declared, with this slice FIRST.**
    Both slices edit `.ctoc/export-reachability-baseline.json`'s `maxDead`, which
    `tests/export-reachability.test.js:131-138` asserts by strict equality, and
    neither declared the other. The movements are not additive because this slice
    changes what the analyzer classifies. `blocks:`/`depends_on:` now fix the order,
    and both plans require reading the analyzer's live number rather than trusting
    any written one.

## Execution Record (Steps 8-16) — completed 2026-07-19

- [x] **Step 8 TEST (TDD RED, verbatim):** the 15 planted-fixture cases plus the
      readErrors and whitelist assertions were written and run FIRST against the
      unchanged analyzer: `tests 21 / pass 9 / fail 12`. Red: readErrors-is-empty,
      whitelist-is-one-object, case 1 (presence-check array), case 3 (require in a
      comment), case 4 (prose root), case 7 (basename fan-out), cases 10, 12, 13, 14
      (all three read paths degraded silently) and case 15 (the three known gaps).
      Green before and after, as predicted: cases 2, 5, 6, 8.
      **CORRECTION to the plan:** case 11 (absent manifest) was predicted green but
      was red, because it also asserts the NEW `readErrors` contract — the
      absent-manifest behaviour itself never changed.
- [x] **Step 9 PREPARE:** every line number this plan cites was confirmed on disk.
      `stripComments` is a function declaration and hoists — no reordering needed.
      `src/lib/hooks-installer.js:631` resolves `<pluginRoot>/src/hooks/post-commit.js`
      and installs a git hook that runs it, so the declared root is justified by the
      code, not by the plan.
- [x] **Step 9a SPAWN-SITE ENUMERATION (pass-or-fail gate, run BEFORE seeding):**
      every `spawn`/`spawnSync`/`fork`/`exec*`, `new Worker` and dynamic `import` in
      `src/` was enumerated. Exactly ONE site executes a `src/` file:
      `src/hooks/post-commit.js:68,77` — the HOISTED-VARIABLE shape
      (`const agentPath = path.join(__dirname,'..','lib','quality-agent.js')` then
      `spawn('node',[agentPath])`). It is NOT recognised by the tightened rule, and
      its target `src/lib/quality-agent.js` is nonetheless REACHABLE via a real
      require edge at `src/commands/push.js:26`. **No invocation target is lost: no
      FAIL, so seeding proceeded.** `new Worker` and dynamic `import()` of a src file:
      ZERO sites in the repository. Every other spawn runs an external binary
      (git, tar, semgrep, npx) or the project's own entry point, never a src file.
- [x] **Step 10 IMPLEMENT** — Change 0 (fail-loud reads + `readErrors`), Change 1
      (comment stripping), Change 2 (spawn-argument scan), Change 3 (surface
      invocation scan), header correction, both baselines re-seeded from measured
      output, one declared root added.
- [x] **Step 11 REVIEW** — the newly-unreachable list was cross-checked against the
      Step 9a enumeration: no invocation target appears in it. `whitelist` is an empty
      object; `whitelistJustifications` was not created; exactly one declared root was
      added, carrying the mechanism that executes it.
- [x] **Step 12 OPTIMIZE** — every new pattern is bounded and linear: the spawn
      argument list is scanned by a quote-aware depth walk capped at 2000 characters
      (a fixed character window would have credited whatever sat a few lines below the
      call), literal extraction is capped at 512, and both `node …` patterns are
      `[^\n]{0,80}?` with a literal `src/` sentinel. No pattern backtracks over the file.
- [x] **Step 13 SECURE** — the analyzer executes nothing. Every fatal error names a
      repository-relative path (`relLabel`), never an absolute home directory. Path
      literals are normalised for `\` and `/` before comparison and can only ever
      resolve to a file already enumerated under `src/`; an ambiguous literal
      resolves to NOTHING rather than to a guess.
- [x] **Step 14 VERIFY** — `npm test`: `tests 10094 / pass 10094 / fail 0 /
      cancelled 0 / skipped 0 / todo 0`, `[CTOC test-gate] coverage 99.04%
      (threshold 99%), skipped 0, failed 0`, `[CTOC test-gate] PASS`. ESLint clean on
      every changed file (`--max-warnings 0`); typecheck green. No ratchet was
      lowered and none was raised.
- [x] **Step 15 DOCUMENT** — module header rewritten to state the implemented rule,
      the fail-loud contract and the `readErrors` return; `CLAUDE.md` gained a
      dead-code-fence section explaining that 26 is DEBT, not a regression. The
      documented test-file count (433) was read from disk and is unchanged — no test
      file was added.
- [x] **Step 16 FINAL-REVIEW** — full list, enumeration verdicts, both baseline
      movements and every decision are recorded here and in the two baseline files.

### The newly-unreachable list, in full (26), with why each has no caller

Seeded from `analyze()`'s actual output with `readErrors: []`. Nothing was rounded,
trimmed or curated.

| # | file | why it has no live caller |
|---|---|---|
| 1 | `src/hooks/validate-plan-steps.js` | documented in `CLAUDE.md` as a standalone script deliberately NOT wired as a runtime hook; it is absent from `hooks.json`. Its only former credit was the `REQUIRED_LIBS` presence-check array. |
| 2 | `src/lib/ai-provenance.js` | nothing requires it; it was a root only by prose mention in agent markdown. |
| 3 | `src/lib/audit-chain.js` | no requirer. Its former root was the literal sentence the plan quotes: "Audit hash-chain (`src/lib/audit-chain.js`)". |
| 4 | `src/lib/budget.js` | required only by `src/lib/v8-dispatcher.js`, which is itself unreachable — a dead file vouching for a dead file. |
| 5 | `src/lib/compliance-dedup.js` | required only by `compliance-integration.js`, itself unreachable. |
| 6 | `src/lib/compliance-integration.js` | no requirer anywhere; it was a root by prose mention only. It is the head of the entire EU-compliance dead cluster. |
| 7 | `src/lib/data-lineage.js` | no requirer; prose mention only. |
| 8 | `src/lib/eu-ai-act-agent-runner.js` | required only by `compliance-integration.js`, itself unreachable. |
| 9 | `src/lib/eu-ai-act-helpers.js` | required only by `eu-ai-act-agent-runner.js`, itself unreachable. |
| 10 | `src/lib/eu-recommender-helpers.js` | no requirer at all. |
| 11 | `src/lib/four-eyes.js` | no requirer; prose mention only. |
| 12 | `src/lib/gdpr-agent-runner.js` | required only by `compliance-integration.js`, itself unreachable. |
| 13 | `src/lib/gdpr-helpers.js` | required only by `gdpr-agent-runner.js` and `compliance-integration.js`, both unreachable. |
| 14 | `src/lib/irac-schema.js` | no requirer; prose mention only. |
| 15 | `src/lib/iron-loop-compliance-trigger.js` | no requirer; the name promises wiring into the Iron Loop that does not exist in code. |
| 16 | `src/lib/legal-hold.js` | no requirer; prose mention only. |
| 17 | `src/lib/plan-numbering.js` | no requirer; prose mention only. |
| 18 | `src/lib/privilege-posture.js` | no requirer; prose mention only. |
| 19 | `src/lib/product-loop.js` | no requirer. Credited solely by the `REQUIRED_LIBS` array — the entry even carries the comment `// v8.4+ Product Loop`, which is a plan, not a call. |
| 20 | `src/lib/proportionality.js` | no requirer; prose mention only. |
| 21 | `src/lib/quality-gate.js` | no requirer. Credited solely by the `REQUIRED_LIBS` presence check — `CLAUDE.md` lists it as a key entry point, and it is reachable from none. |
| 22 | `src/lib/retention.js` | no requirer; prose mention only. |
| 23 | `src/lib/spoliation-safe.js` | no requirer; prose mention only. |
| 24 | `src/lib/stale-cleanup.js` | no requirer; prose mention only. |
| 25 | `src/lib/traceability-matrix.js` | no requirer; prose mention only. |
| 26 | `src/lib/v8-dispatcher.js` | required only by itself. Credited solely by the `REQUIRED_LIBS` presence check. |

`src/hooks/post-commit.js` appeared in the raw output (27 files) and was moved to
`.ctoc/reachability-roots.json` as a DECLARED ROOT, not to the debt list and not to
the whitelist: `hooks-installer.js` writes a `.git/hooks/post-commit` script that
runs it, so git really executes it. That is a mechanism, not a citation.

### Both baseline movements, measured live

| baseline | before | after | direction |
|---|---|---|---|
| `.ctoc/reachability-baseline.json` `maxUnreachable` | 0 | **26** | rose — the instrument started telling the truth; no file died |
| `.ctoc/export-reachability-baseline.json` `maxDead` | 102 | **71** | DROPPED, the predicted direction |

The export movement decomposes as **34 entries removed** and **3 added**. The 34 left
because their whole FILE is now reported unreachable and a dead export inside an
already-dead file is the file fence's business. The 3 that joined —
`src/lib/actions.js#deletePlan`, `src/lib/inbox.js#createQuestion`,
`src/lib/regulatory-regime.js#retentionDays` — are DEAD BY TRANSITIVITY and are
reported here rather than absorbed silently: each was credited by exactly one module
(`stale-cleanup.js`, the two compliance agent runners, and `retention.js`
respectively) and every one of those creditors is itself now unreachable. Their host
files are live; their only callers are not. The count fell, so the ratchet's
"only tightens" direction holds and the plan's stop-and-report condition (a RISE) did
not trigger.

## Decisions Taken Under Ambiguity — added at execution

14. **`analyze()` both THROWS and reports `readErrors`, resolved with an explicit
    opt-in.** The plan asked for fail-loud reads AND a `readErrors` array, which
    cannot both be the default. Resolution: `analyze(root)` THROWS (fail-loud is the
    default, so no caller can accidentally receive a verdict computed over unread
    input), and `analyze(root, { tolerateReadErrors: true })` collects the failures
    into `readErrors` instead. A clean run returns `readErrors: []`, which is what
    proves a seed is valid.
15. **"The seeding path refuses" is enforced as a TEST assertion, not a new exported
    function.** A `seedBaseline()` export would have had exactly one caller — a
    test — which is the dead-export shape this very fence exists to catch. Instead
    the ratchet asserts both that the live run reports `readErrors: []` and that the
    committed baseline carries `seedReadErrors: 0`.
16. **The fourth silent read — `analyzeExports`' per-module read — was fixed too,
    though the plan named only three.** It degraded to `content = ''`, which reports
    ZERO exports for a module the ratchet would then absorb as progress. `analyze()`
    has just read the identical file successfully, so a failure there is a broken
    instrument by the same argument. Same defect class, same function, one line.
17. **The known-gap invocation shapes were NOT taught to the analyzer.** Recognising
    a hoisted-variable spawn needs variable tracking, and crediting any `path.join`
    anywhere would re-open the presence-check hole this slice closes. The enumeration
    proved no file is lost today, and case 15 pins each shape's actual behaviour so a
    future change to it is loud rather than silent.
18. **Unreadable inputs are constructed in tests by a dangling symlink, with a
    `chmod 000` fallback and a LOUD failure if neither works.** `chmod` is a no-op on
    Windows and inert for root; a dangling symlink is enumerated by both directory
    walkers (`isDirectory()` is false) while the read fails. The hooks-manifest case
    needs a different shape — `existsSync` FOLLOWS a symlink and would report a
    dangling one as ABSENT, a different fact — so it uses a directory sitting where
    the file belongs. If no shape works the helper THROWS rather than letting a test
    pass on an input it never constructed.
19. **Two files outside the declared `files:` list were edited, both mechanically
    coupled to this change; both are recorded rather than quietly done.**
    (a) `src/lib/iron-loop-enforcer.js` — `checkReachabilityFence` blocked on ANY
    unreachable file, which was only tenable while the fence reported a false zero.
    It is now baseline-aware, mirroring its sibling `checkDeadExportFence` exactly:
    a NEW dead file blocks, committed debt does not. (b) `tests/streaming-render.test.js`
    and `tests/session-start-question-dispatch.test.js` each asserted
    `unreachable === []`. That literal zero was an artifact of the prose-root rule,
    never a fact. Neither assertion was weakened: each now asserts the files ITS OWN
    slice is about are reachable, plus that nothing was stranded outside the committed
    baseline — the global count is ratcheted in one place, by the fence that owns it.
20. **The false-green fence caught this executor introducing the very defect class it
    was repairing, and the CODE was fixed — nothing was whitelisted.** The
    baseline-aware rewrite in (19a) copied the sibling's `catch { /* … */ }`, and
    `tests/false-green-fence.test.js` flagged it as a new `silent-catch`. An
    unreadable baseline now returns an explicit BLOCK naming the read failure, which
    is strictly better than the sibling's swallow: proceeding with an empty set would
    still block, but on a message blaming the source files for a defect in the
    baseline file.

## What this plan does NOT fix

- It wires nothing and deletes nothing. Every file it exposes as unreachable is
  still unreachable when the slice lands — now visibly, in a list that can only
  shrink.
- It does not change the export fence's rule (that one was already correct); it only
  absorbs the coupled count movement.
- It does not add a JavaScript parser. The analysis stays regex-based with zero new
  dependencies, and every honest limit documented in the module header still applies.
- It does not touch `.ctoc/false-green-baseline.json`, the coverage floor, or any
  other ratchet.
