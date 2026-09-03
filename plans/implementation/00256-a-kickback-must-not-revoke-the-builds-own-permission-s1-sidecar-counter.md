---
title: "The kickback counter moves to a sidecar under .ctoc/state/kickbacks/ — the plan file is never written again"
type: implementation
iron_loop: true
parent_plan: a-kickback-must-not-revoke-the-builds-own-permission
depends_on: none
priority: high
effort: small
files:
  - src/lib/circuit-breaker.js
  - src/lib/actions.js
  - tests/ctoc-audit-w05-circuit-breaker.test.js
  - tests/circuit-breaker-coverage.test.js
  - tests/circuit-breaker-block-prepend.test.js
  - tests/circuit-breaker-malformed-frontmatter.test.js
  - tests/circuit-breaker-wiring.test.js
  - tests/approval-hash-survives-execution.test.js
  - tests/cache-freshness.test.js
---

# The kickback counter moves to a sidecar under `.ctoc/state/kickbacks/`

**Scope (one line):** `circuit-breaker.js` stops writing the plan file; the kickback
counter is persisted in `.ctoc/state/kickbacks/<slug>.json`, so a Step 14 kickback no
longer moves the hashed frontmatter and no longer revokes the build's own write
permission.

## Why this is ONE slice and why it is larger than three files

The whole change is a single storage move plus the one signature it forces
(`readKickbackCounts` needs the project root to find the sidecar). Every other file in
`files:` is a CALLER of that signature or a doc claim that becomes false the moment the
storage moves. A signature change cannot be half-landed: splitting this would leave the
suite red between slices, which is worse than one slightly wide slice. The work surface
is one module (`src/lib/circuit-breaker.js`); the rest is two doc-comment corrections
(`src/lib/actions.js`, `tests/cache-freshness.test.js`) and six test files that call the
changed reader.

No file in `files:` is being CREATED — every one already exists on disk — so
`documented-counts.checkPlanDeclaresCountMovers` finds no count mover and `CLAUDE.md` is
correctly NOT declared (verified: `src/lib/documented-counts.js:122` returns `null` for a
path that already exists).

## Implementation Details

### What is on disk today (read fresh, 2026-09-03)

- `src/lib/circuit-breaker.js:302-348` — `recordKickback(planPath, step, projectPath)`
  reads the plan, folds `kickback_counts` across every leading frontmatter block
  (`maxCountsAcrossBlocks`, lines 159-177), increments, then calls
  `writeCountsIntoText` (lines 209-251) and `safeFs.writeFileSync(planPath, newText)`
  (line 319). That write is the defect.
- `src/lib/approval-ledger.js:415-439` — `computeSpecHashWith` walks EVERY consecutive
  leading `---…---` block into the hashed region. The frontmatter is hashed in full and
  deliberately so (lines 263-273: "the frontmatter (including `files:`, the actual
  write-surface grant)" stays hashed). So a `kickback_counts` key written into that
  region changes the specification hash by construction.
- `src/lib/approval-residency.js:182` — `ledger.contentMatches(entry, text)` is THE single
  encoding of "does this content match this entry"; a mismatch returns
  `{ accepted: false, reason: 'hash-mismatch' }`, which is what revokes plan coverage.
- Observed live: `plans/review/00252-close-the-coverage-holes-s18-remainder-hooks-commands.md`
  lines 16-19 carry `kickback_counts: by_step: {'14': 1} total: 1` inside the SAME
  frontmatter block as `files:` (line 10) and `approved_by: human` (line 13).
- `src/lib/actions.js:1490-1512` — `recordStepKickback` is the only live caller of
  `recordKickback`. It already turns any throw into a loud console error plus
  `recordBreakerFailure` and returns `{ recorded: false }`. That surfacing path is REUSED
  unchanged; this slice adds no new escalation type.
- `readKickbackCounts` has NO caller under `src/` (verified by searching the whole
  repository for the identifier: it appears only in `src/lib/circuit-breaker.js` and in
  test files). Changing its signature therefore touches tests only.
- The sidecar pattern to copy: `src/lib/step-13-verify.js:912-914` —
  `path.join(projectPath, '.ctoc', 'state', 'verify', `${planSlug}.json`)`, a FIXED root
  plus a BARE slug so every write stays inside that directory. The atomic-write
  discipline to copy: `src/lib/task-registry.js:504-521` — `mkdirSync(dir, {recursive:true})`,
  write to `${target}.tmp-<pid>-<now>-<rand>`, `renameSync(tmp, target)`, and on failure
  unlink the temp and rethrow.

### 1. New persistence in `src/lib/circuit-breaker.js`

**Path helper (pure, no filesystem access), mirroring `verifyEvidencePath`:**

```
kickbackStatePath(projectPath, planSlug)
  → path.join(projectPath, '.ctoc', 'state', 'kickbacks', `${planSlug}.json`)
```

`planSlug` is the module's existing `planSlug(planPath)` (`path.basename(planPath, '.md')`,
line 287), so the key is always a bare basename and cannot escape the fixed directory.
Document that requirement on the helper exactly as `step-13-verify.js` does.

**On-disk record** (JSON, `2`-space indent, trailing newline):

```json
{
  "plan": "<slug>",
  "by_step": { "14": 1 },
  "total": 1,
  "updated_at": "2026-09-03T00:00:00.000Z"
}
```

**Read — `readKickbackState(projectPath, planSlug)` (module-private):**
returns `{ status: 'ok' | 'absent' | 'unreadable', counts }`.

- file absent → `{ status: 'absent', counts: zeros }`
- read throws, `JSON.parse` throws, the parsed value is not a plain object, `total` is not
  a finite number `>= 0`, or `by_step` is not an object → `{ status: 'unreadable', counts: zeros }`
- otherwise → `{ status: 'ok', counts: normalizeCounts(parsed) }` (the existing
  `normalizeCounts`, lines 85-99, already drops prototype-polluting keys and
  non-positive values).

A malformed-but-parseable record must classify `unreadable`, NOT `ok`-with-zeros:
returning zeros for a record we could not trust is the "reported a verdict on input it
never received" shape this repository fences.

**Write — `writeKickbackState(projectPath, planSlug, counts)` (module-private), atomic:**

```
target = kickbackStatePath(projectPath, planSlug)
tmp    = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
mkdirSync(path.dirname(target), { recursive: true })
writeFileSync(tmp, JSON.stringify(record, null, 2) + '\n', 'utf8')
renameSync(tmp, target)
on error → try unlinkSync(tmp) (ignore), then RETHROW
```

The rethrow is load-bearing: it propagates to `actions.recordStepKickback`'s existing
catch, which reports `{ recorded: false }`, prints the loud console error, and appends a
durable `breaker-failure` escalation. A breaker that cannot persist its count must never
report success.

### 2. `recordKickback(planPath, step, projectPath)` — signature UNCHANGED

New body, in order:

1. `const stepKey = normalizeStep(step);` — unchanged, still throws BEFORE any
   filesystem access (keeps the two "plan file byte-identical after a rejected call"
   cases green, and they are now trivially stronger because nothing writes the plan at all).
2. `const slug = planSlug(planPath);`
3. `const state = readKickbackState(projectPath, slug);`
4. `const raw = safeFs.readFileSync(planPath, 'utf8');` — **KEPT, unguarded, on every
   call.** This is what makes a missing plan file throw and hard-escalate; deleting it
   would silently turn the "ghost plan" case
   (`tests/circuit-breaker-malformed-frontmatter.test.js:117-128`) green-but-blind.
5. `const fromPlan = maxCountsAcrossBlocks(raw);` — the existing fold, unchanged. This
   is the migration read: an existing frontmatter counter is honoured, in whichever
   leading block it now sits.
6. **Fold: element-wise MAX of the sidecar counts and the frontmatter counts.** One rule,
   no branches, monotone. On a normal post-migration plan the frontmatter contributes
   nothing (absent or a stale lower value) so the sidecar wins; on the first kickback
   after this change the sidecar is zeros so the frontmatter value seeds the count; on a
   corrupt sidecar the frontmatter floor prevents a silent reset to zero. See Decision 2.
7. Increment `by_step[stepKey]` and `total`.
8. `writeKickbackState(projectPath, slug, counts)`.
9. **The plan file is NEVER written.**
10. If `state.status === 'unreadable'`, call
    `recordBreakerFailure(projectPath, { plan: slug, step: stepKey, error: 'kickback state unreadable — the count was rebuilt from the plan file and may be low' })`.
    The breaker keeps counting AND says it was degraded. Never silent.
11. Escalation logic (lines 321-340) **unchanged**: `nextByStep > SAME_STEP_MAX (3)` wins
    over `counts.total > PER_PLAN_MAX (5)`; `appendEscalation` on either.
12. Return shape unchanged: `{ recorded: true, byStep, total, escalation }`.

### 3. `readKickbackCounts(planPath, projectPath)` — the one signature change

`projectPath` is REQUIRED. When it is absent or not a non-empty string, THROW
`Error('projectPath required')`. Returning zeros without a root would be a false zero
for a plan that has been kicked back six times — the exact defect class
`src/scripts/test-gate.js` documents against ("never return a number you did not read").
This is a programming-error throw on a missing argument; it does NOT weaken the
module's "never throws on bad DATA" contract, which is preserved:

- sidecar `ok` → its counts
- sidecar `absent` or `unreadable` → the max of the sidecar counts and
  `maxCountsAcrossBlocks(plan text)`; an unreadable plan file contributes zeros (the
  existing try/catch at lines 189-194 stays)
- return a plain object `{ by_step, total }` (null prototype dropped), unchanged.

### 4. Deletions

`writeCountsIntoText` (lines 209-251), `splitFrontmatter` (lines 109-117) and
`FRONTMATTER_RE` (line 51) have no remaining caller once the plan write is gone. DELETE
all three — the plan-write path must be structurally impossible, not merely unused.
Rewrite the module header's "Persistence:" paragraph (lines 18-22) to state the sidecar,
the migration fold, and that the plan file is never written.

### 5. `src/lib/actions.js` — documentation only, no code change

Two claims become false and must be corrected in place (no signature, no call-site line
moves):

- line 1480-1481: "The circuit breaker persists the counter in the plan frontmatter and,
  on an escalation, appends…" → the counter is persisted in
  `<root>/.ctoc/state/kickbacks/<slug>.json`; the escalation log path is unchanged.
- line 1485: `@param {string} planPath - the plan .md path (counter lives in its frontmatter)`
  → `(the counter lives in a sidecar keyed by this path's slug)`.

### 6. `tests/cache-freshness.test.js` — one justification string

Line 561's whitelist entry claims circuit-breaker.js "rewrites kickback counters into the
plan frontmatter" and "edits an existing plan body in place". After this slice it writes
NO plan file at all. Correct the entry and the comment above it (lines 557-561) to the
truth: *writes only `.ctoc/state/kickbacks/<slug>.json` (atomic temp+rename) and
`.ctoc/logs/escalations.json`; never writes a plan file, so the plan-stage counts are
invariant.* The entry STAYS (the whitelist-honesty test at lines 728-744 requires each
entry to remain broad-flagged, and the module still matches `MUTATING_FS` and the
`\bplans\b` token in its concurrency comment). A false justification inside an honesty
fence is the rot this repository exists to stop.

### Wiring — the live call sites

Nothing new becomes reachable; the storage under an EXISTING live call site changes.

- `recordKickback` ← `src/lib/actions.js:1494` `recordStepKickback` ←
  `actions.completeExecution` (a blocked pre-review completion and a failing Step 14
  VERIFY), driven end-to-end by `tests/circuit-breaker-wiring.test.js` through the real
  `completeExecution` path.
- `recordBreakerFailure` ← `src/lib/actions.js:1506` on the same path, plus the new
  degraded-sidecar call inside `recordKickback`.
- `getEscalations` ← `src/lib/inbox.js:280` → `menu-screens.js:678` (the dashboard
  "circuit-breaker escalations" row) — unchanged, and the escalation record shape is
  unchanged, so the human-reachable surface is untouched.
- `readKickbackCounts` remains a test-only reader (no `src/` caller today, verified);
  the module file itself stays reachable through `actions.js`.

### Security and cross-platform

- Sidecar key is `path.basename(planPath, '.md')` — no separators survive, so no
  traversal out of `.ctoc/state/kickbacks/`.
- `path.join` everywhere; `safeFs` for every operation; no shell.
- `.ctoc/state/` is gitignored (`.gitignore:6`), so the sidecar is local per-developer —
  the same residency as the verify evidence and `.ctoc/logs/` it sits beside.
- The sidecar is inside the plugin hook's `.ctoc/*` write whitelist, so an agent could
  edit it. That is not a new exposure: the counter previously lived in `plans/**.md`,
  which is equally whitelisted. No gate reads this file, so it is not an approval
  surface.

## Test Plan (TDD-Red first)

Write these RED first, run them, see them fail on the named assertion, then implement.

### `tests/approval-hash-survives-execution.test.js` — the headline regression

**New case: "a kickback does NOT revoke the approval it was authorised by"**
Approve `SPEC_PLAN` (the file's existing fixture) via the existing `approve()` helper,
write it to `plans/todo/<slug>.md`, then call
`actions.recordStepKickback(planPath, 14, projectDir)` and assert:

- `gateHook.classifyResidency(planPath, 'todo', projectDir).accepted === true`
  — **RED today** on this assertion; today it is `false` with `reason: 'hash-mismatch'`.
- `ledger.verify(slug, fs.readFileSync(planPath,'utf8'), 'todo', projectDir) === true`
  — **RED today**.
- the plan file is byte-identical to the bytes written before the call — **RED today**.
- `.ctoc/state/kickbacks/<slug>.json` exists and parses to `total: 1`, `by_step['14'] === 1`
  — **RED today** (the file does not exist).

**New case: "the same plan after SIX kickbacks is still approved"** — six
`recordStepKickback` calls (which escalate per-plan), then `classifyResidency` is still
`accepted: true` and the plan bytes are still identical. Pins that the property holds
through an escalation, not only through a single quiet kickback.

Every existing case in this file is untouched.

### `tests/ctoc-audit-w05-circuit-breaker.test.js` — the persistence-location contract

Three cases assert the DEFECT as the contract and are REPLACED, each by a strictly
STRONGER assertion (justification: the contract changed outside the test — the approved
plan moves the counter out of the hashed frontmatter):

- **Case 3 (line 104) "counter is persisted in the plan frontmatter on disk"** → *"counter
  is persisted in the sidecar and the plan file is byte-identical"*: after two
  `recordKickback` calls, `fs.readFileSync(planPath)` equals the bytes written by
  `makeProject()`, and `.ctoc/state/kickbacks/sample-plan.json` parses to
  `by_step['10'] === 2`, `total === 2`. Byte-identity is stronger than the old
  "frontmatter contains a key". **RED today** on the byte-identity assertion.
- **Case 7 (line 160) "preserves the plan body and other frontmatter keys byte-for-byte"**
  → the WHOLE file is byte-identical (not body-plus-selected-keys), and the sidecar holds
  `by_step['14'] === 1`. Strictly stronger. **RED today.**
- **Case 9 (line 195) "prepends a frontmatter block when the plan has none"** → *"a plan
  with NO frontmatter is counted and is still not written"*: `recordKickback` returns
  `byStep 1 / total 1`, the file is byte-identical to `'# Plain plan\n\nNo frontmatter here.\n'`,
  and the sidecar holds the count. **RED today** (today a frontmatter block is prepended).
- **Case 4 (line 121)** `readKickbackCounts(planPath)` → `readKickbackCounts(planPath, root)`;
  the zeros assertion is unchanged.
- Cases 1, 2, 5, 6, 8, 10, 11 (thresholds, restart, falsy step, prototype-pollution key,
  empty log, precedence) are UNCHANGED and must stay green — they are the
  "thresholds still fire" regression, now firing from the sidecar. Case 5's
  "simulated restart" is now a genuinely stronger claim: the module holds no memory AND
  the plan file holds no count, so only the sidecar can carry it.

**New cases in this file:**

- *Migration — an existing frontmatter count is honoured:* a plan whose frontmatter
  carries `kickback_counts: by_step {'10': 5}, total: 5` and NO sidecar → the next
  `recordKickback(planPath, 12, root)` reports `total 6` with a `per-plan` escalation, the
  plan file is byte-identical, and the sidecar now holds `total 6`. **RED today** on the
  byte-identity and sidecar assertions.
- *Migration through a prepended approval block:* the same fixture with a counter-less
  approval block prepended (the shape
  `tests/circuit-breaker-block-prepend.test.js:49-51` builds) → still `total 6`. Pins that
  the migration read keeps the max-across-blocks fold.
- *An unreadable sidecar does not silence the breaker:* write
  `.ctoc/state/kickbacks/<slug>.json` containing `'{ not json'` with the plan frontmatter
  carrying `total: 5` → `recordKickback(planPath, 12, root)` reports `total 6` and a
  `per-plan` escalation, AND `getEscalations(root)` contains a `breaker-failure` entry for
  that plan. **RED today** on the `breaker-failure` assertion (nothing reads a sidecar today).
- *A sidecar that parses but is shaped wrong* (`{"total":"lots"}`) is treated the same:
  count continues from the frontmatter floor and a `breaker-failure` is recorded.
- *`readKickbackCounts` refuses to answer without a project root:*
  `assert.throws(() => readKickbackCounts(planPath), /projectPath required/)`.

### `tests/circuit-breaker-coverage.test.js` — dark branches of the new code

- Both `readKickbackCounts(...)` calls (lines 72, 88) take `root`; assertions unchanged.
- **New:** the sidecar write failing → `.ctoc/state/kickbacks` created as a FILE, so
  `mkdirSync` throws; drive it through `actions.recordStepKickback` and assert
  `{ recorded: false }` plus exactly one `breaker-failure` entry in the escalations log.
  Covers the temp-unlink-and-rethrow branch.
- **New:** `readKickbackCounts` with an absent plan file AND an absent sidecar → zeros
  (the existing plan-read catch stays live).
- **New:** `readKickbackCounts` with an `ok` sidecar and malformed plan YAML → the
  sidecar's counts, not zeros.
- The boundary and precedence cases (lines 122-203) are UNCHANGED — they are the
  "thresholds still fire, exactly at the documented boundary" regression.

### `tests/circuit-breaker-block-prepend.test.js`

All six `readKickbackCounts(planPath)` calls take `root`. Every assertion is unchanged;
the file's subject becomes the MIGRATION read (the max-across-blocks fold is now the
frontmatter seed rather than the live store). Update the header comment to say so, and
add to `written_counter_stays_monotonic…` (line 151) an assertion that the plan file is
byte-identical after `recordKickback` — the monotonicity now comes from the sidecar, and
that must be visible in the test.

### `tests/circuit-breaker-malformed-frontmatter.test.js`

`readKickbackCounts` calls (lines 61, 83) take `root`. Every assertion unchanged — a plan
with unterminated-quote frontmatter and a plan with scalar frontmatter must still record
six kickbacks and escalate. Header comment updated: the write-path-versus-read-path
tolerance gap is now structurally impossible (there is no frontmatter write), and these
cases pin that the property survived the storage move. The "ghost plan hard-escalates"
case (line 117) is unchanged and must stay green — it is why the plan read stays unguarded.

### `tests/circuit-breaker-wiring.test.js`

Line 107's `readKickbackCounts(planPath)` takes `root`; the two count assertions are
unchanged. The comment at lines 105-106 ("physically persisted in the plan's frontmatter")
is corrected to the sidecar, and an assertion is ADDED that the plan file's frontmatter
contains no `kickback_counts` after four live `completeExecution` kickbacks — the
end-to-end proof through the real path. **RED today.**

### `tests/cache-freshness.test.js`

No new case. The whitelist entry's justification string is corrected; the
whitelist-honesty case (line 728) must stay green, which requires circuit-breaker.js to
remain broad-flagged — verify by running the file, not by reasoning about the regex.

### Gate

`npm test` — fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json`
`minPct` (99 today). No baseline exemption is added; no entry is added to any
`whitelist` structure.

## Decisions Taken Under Ambiguity

1. **`readKickbackCounts` gains a REQUIRED `projectPath` rather than deriving the root
   from the plan path.** Deriving it (walking up from `plans/<stage>/`) would keep all six
   test call sites untouched, but it is a guess that breaks the moment a plan lives
   anywhere else — `tests/ctoc-audit-w05-circuit-breaker.test.js:40` already puts a plan
   at `<root>/sample-plan.md`, with no `plans/` directory. An optional argument that
   silently falls back to frontmatter-only would return zero for a plan with six
   kickbacks, which is the false-zero class this repository fences. Explicit and loud.

2. **The frontmatter count is folded in on EVERY read as a floor, not consumed once.**
   The parent plan says "honoured once, never written back". An element-wise MAX of
   sidecar and frontmatter gives the identical observable behaviour with no migration
   flag and no extra state: the frontmatter value can never grow (nothing writes it
   again), so once the sidecar passes it the fold is a no-op, and while the sidecar is
   missing or corrupt the frontmatter is a floor that stops a silent reset to zero. One
   rule, monotone, and it reuses the existing `maxCountsAcrossBlocks` fold rather than
   inventing a second one.

3. **A corrupt sidecar counts AND surfaces, via the existing `breaker-failure`
   escalation.** No new escalation type, no new log, no new reader — the dashboard row
   at `src/lib/menu-screens.js:678` already renders it. Returning zeros quietly would
   suppress every future escalation, which is the failure the module's own header warns
   about.

4. **The stale `kickback_counts` block stays in place on existing plans.** Deleting it
   from `plans/review/00252-…md` (or anywhere else) would change that plan's
   specification hash — the exact harm this slice exists to stop. It is ignored except as
   the migration floor. Repairing 00252's already-recorded mismatch is ruled separately
   and is out of scope here.

5. **The sidecar is keyed by the plan's basename, so a plan RENAMED after a kickback
   orphans its count.** Under the old storage the count travelled inside the file and
   survived a rename. Renaming (the numeric-prefix assignment) happens at plan creation,
   before any build and therefore before any kickback, so the exposure is a plan renamed
   mid-build — which the pipeline does not do. Accepting the narrow loss is preferable to
   inventing a content-addressed key; stage MOVES (`actions.movePlan`, line 104-127,
   preserves the basename) keep the count, which is the case that actually occurs.

6. **`.ctoc/state/kickbacks/` is NOT registered in the golden-corpus contract registry.**
   `src/lib/golden-corpus-scan.js:67` curates five persisted contracts; adding a sixth is
   a separate, deliberate decision with its own captured real sample, and the fence does
   not require registration of a new contract. Noted rather than silently skipped.

7. **`tests/cache-freshness.test.js` is in `files:` for a one-string factual correction.**
   The test passes either way (it only checks the justification's length), so this is not
   needed to go green — it is needed for the whitelist not to carry a false claim about
   what `circuit-breaker.js` writes.
