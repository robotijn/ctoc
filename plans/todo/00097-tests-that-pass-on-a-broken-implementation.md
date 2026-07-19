---
approved_by: human
approved_at: 2026-07-19T16:48:06.244Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-19T15:29:41.454Z
gate_crossed: implementation → todo
---

---
title: "Tests that pass on a broken implementation get an assertion — this exact shape already let a real bug ship once"
type: implementation
parent_plan: ctoc-audit-w06-truthful-tests
depends_on: 00095-a-skipped-test-is-counted-as-a-skipped-test
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "tests/version.test.js"
  - "tests/deployment.test.js"
  - "tests/sync.test.js"
  - "tests/capability-databases.test.js"
  - "tests/settings.test.js"
---

# Tests that pass on a broken implementation

> **REPAIR NOTE — one narrow correction from an adversarial pre-mortem.** Addition
> 9's placeholder ban, as written, would have rejected the single most likely
> *legitimate* content of one of the two fields it guards: `XXX` is the universal
> convention for redacting a credential in a connection string
> (`postgres://user:XXX@host/db`). The rule is narrowed from "contains" to a
> whole-field / word-boundary match. See decision 10.
>
> **The `depends_on` declaration on `00095` was challenged and is CONFIRMED VALID —
> it stays.** A review reported that slice as non-existent; it exists at
> `plans/todo/00095-a-skipped-test-is-counted-as-a-skipped-test.md` and is being
> built now. The review searched the wrong folders. Decision 8 is unchanged.

This is not a hypothetical defect class. It has already cost this repository a
shipped bug, and the repository wrote down what happened.

`tests/version-syncplugin-path-fix.test.js:3-21`, read on disk:

> **Regression: syncToPluginJson wrote to the WRONG path.**
> `syncToMarketplace` correctly targets `<root>/.claude-plugin/marketplace.json`,
> but `syncToPluginJson` targeted `<root>/ctoc-plugin/.claude-plugin/plugin.json`
> — an extra `ctoc-plugin/` segment. … So `existsSync(pluginFile)` was always false
> → syncToPluginJson always returned `{success:false, error:'plugin.json not found'}`,
> and `syncAll().plugin` never actually synced the version. **The pre-existing test
> only asserted the result had a boolean `success` (true OR false), so it never
> caught the broken sync.**

That last sentence is this slice's entire justification, written by someone else,
before this audit existed. The version sync silently did nothing, indefinitely, and
the test watched it happen and reported green.

The test that watched is still there, at `tests/version.test.js:309-318`. So are its
two siblings, in the same shape, guarding the same kind of function, with **no**
regression test behind them.

## The shape

```js
const result = version.syncToMarketplace();
assert.ok(typeof result === 'object', 'Returns an object');
assert.ok('success' in result, 'Result has success property');
if (result.success) {
  assert.ok(result.version, 'Has version property when successful');
} else {
  assert.ok(result.error, 'Has error property when unsuccessful');
}
```

Both branches pass. `{ success: false, error: 'x' }` satisfies it completely. The
test asserts that the function has an opinion, never that the opinion is right.

## What this slice is, and what it is not

**It is not a test edit.** Not one existing assertion is modified, relaxed,
re-aimed or deleted anywhere in this slice. Every change is an **addition**
alongside assertions that remain byte-identical. That distinction is load-bearing:
the danger in touching a suite is weakening it, and a strictly-additive change
cannot weaken it. Where an addition makes an existing branch unreachable, the
existing branch stays in place and a comment records why it is now dead — removing
it would be a deletion, and deletions are what this slice refuses to make.

So the question "is the test wrong, or is the code wrong?" mostly does not arise
here: these tests are not **wrong**, they are **incomplete**. Where that framing
does not hold — where a test genuinely asserts the wrong thing — it is called out
explicitly below and treated as a finding rather than quietly corrected.

## The contract discipline this slice is held to

For every assertion added below, the plan states three things, and a reviewer
should reject any entry that cannot supply all three:

1. **The contract, sourced from outside the test being changed** — the module's own
   documented behaviour, a sibling regression test, a human decision recorded in a
   plan, or a caller's stated expectation. Never "what the code currently returns",
   which is circular and would encode today's bug as tomorrow's specification.
2. **Why an addition is the right move** rather than a code fix or a bare finding.
3. **What implementation passes today and fails after.** If nothing new fails, the
   addition bought nothing and is not made.

**Where a contract turns out to be genuinely undefined, this plan says so and adds
no assertion.** Two items below land in that category. An invented specification
that goes green is worse than the vacuous assertion it replaced, because it looks
like proof.

## Out of scope, named so nobody reads this as having fixed it

**The markdown-corpus test family is untouched by this slice.** That is the
`cu2-*`, `cu3-*`, `cu4a-*`, `cu4b-*`, `cu4c-*` and `skill-*` files — counted on
disk: 4 + 6 + 31 + 5 + 12 cu-prefixed files plus three skill-prefixed ones, **61
files**, close to the audit's "roughly 63". They assert line counts and code-fence
counts over documentation.

It is a real weakness and it is a **different** problem with a different answer: a
documentation corpus has no runtime behaviour to assert against, so the fix is not
"assert what the function does" but a decision about what a skill file must contain
to be worth shipping — which is a human's call about the corpus-quality programme,
not a test-tightening exercise. Folding 61 files in would make this slice
unreviewable and would smuggle that decision in as an implementation detail. It is
named here, not deferred by this plan; scheduling it is the human's.

## Where the audit's description was wrong

Verified against disk; recorded because the corrections change what gets done.

**1. `tests/sync.test.js:297` and `:385` are not the shape described.** The audit
says they assert `execSyncCalls.length > 0`, so "a completely wrong command
satisfies 'Should perform initial sync'". Both lines are immediately followed by a
stronger assertion:

```js
:297  assert.ok(execSyncCalls.length > 0, 'Should perform initial sync');
:298  assert.ok(execSyncCalls.some(c => c.cmd.includes('git status')), 'Should check git status');
```

```js
:385  assert.ok(execSyncCalls.length > 0, 'Should have exec calls');
:386  assert.strictEqual(execSyncCalls[0].opts.cwd, '/custom/project/path', 'Should use correct cwd');
```

At `:297` the very next line pins the command. A wrong command does **not** pass —
the audit's claim is false there, and there is nothing to fix. The `length > 0`
line is a redundant prelude, not a defect, and it is left exactly as it is. At
`:385` the residual gap is narrower and real: the *cwd* of the first call is pinned
but the *command* is not, so a wrong command with the right working directory
passes. Only that narrower gap is addressed.

**2. `tests/version.test.js:404`, `:443` and `:466` are not the both-branches
shape.** The audit reports "six occurrences of the same shape". There are **three**
(`:291-301`, `:309-318`, `:326-335`). The other three are a different, weaker-but-
distinct shape: they assert key presence and value types with no `if/else`, e.g.
`:404-411` asserts `'marketplace' in result` and `typeof result.marketplace === 'boolean'`.
They are still too weak and are still addressed, but they are addressed as their
own shape, not as instances of the first.

**3. `tests/capability-databases.test.js:78` sits inside a test that is far from
vacuous.** The audit's claim about that one line is accurate, but the surrounding
test at `:71-86` pins the database key against the filename, constrains `category`,
`rls` and `verified` to token sets, and requires a non-empty `deps` array; a
separate test at `:88-98` pins RLS posture per database and explicitly forbids
claiming MySQL row-level security is native. The residual gap is narrow — exactly
two free-prose fields — and is treated as narrow.

## Implementation Details

### Ordering

This slice declares `tests/version.test.js`, which slice
`00095-a-skipped-test-is-counted-as-a-skipped-test` also declares. That slice edits
`:269` and `:418-434` (the suite-level skips); this slice edits `:291-335`, `:404`,
`:443` and `:466`. Disjoint ranges, same file, so `depends_on` serialises them
rather than letting two executors hold one file. The audit's reading that all three
slices are independent is correct for slice `00096` and wrong here.

**Challenged and re-confirmed:** a later review claimed slice `00095` does not
exist and that this dependency should be dropped. It does exist — 
`plans/todo/00095-a-skipped-test-is-counted-as-a-skipped-test.md`, currently being
built — and the review had searched the wrong folder set. **The dependency stays.**

---

### File: `tests/version.test.js`
**Action:** MODIFY — additions only
**Purpose:** Give the three sync functions and the three update-check functions assertions that a broken implementation fails.

#### Addition 1 — `syncToMarketplace` (:290-302)

**Contract, sourced outside this test.** `src/lib/version.js:116-142` documents
"Sync VERSION to marketplace.json / Updates both metadata.version and
plugins[0].version", and writes both. CLAUDE.md names `VERSION` the single source of
truth and `.claude-plugin/marketplace.json` a tracked file present in every
checkout. The sibling regression test
`tests/version-syncplugin-path-fix.test.js:6-7` states as established fact that
"`syncToMarketplace` correctly targets `<root>/.claude-plugin/marketplace.json`" —
that is the expected path, recorded outside this test.

**Why an addition.** Nothing here is wrong; it is incomplete. The code is correct
today. The risk is that it silently stops being correct in the way its sibling
already did, and this test is structurally incapable of noticing.

**Add, keeping every existing line:** `result.success === true`;
`result.version === version.getVersion()`; and, read back from disk,
`.claude-plugin/marketplace.json` now carries that version at **both**
`metadata.version` and `plugins[0].version`.

**What fails after that passes today.** Exactly the shipped `syncToPluginJson`
bug transplanted to this function: any `getPluginRoot()` or path-segment error
makes `existsSync` false and returns `{success:false, error:'marketplace.json not
found'}` forever. Today: green. After: red. Also caught — a regression that updates
`metadata.version` but not `plugins[0].version`, which the current test cannot see
and which the documented contract forbids.

**Safety.** The write is idempotent — it writes the version already in `VERSION`
— but the test must still snapshot and restore the file, following the pattern
already used by the fixture block at `:342-395`.

#### Addition 2 — `syncToPluginJson` (:308-319)

**Contract, sourced outside this test.** `tests/version-syncplugin-path-fix.test.js`
in full. It states the target path, that the function "must SUCCEED", that it writes
exactly once, and that the written JSON carries the synced version.

**Why an addition, and an honest note on its value.** That regression test already
covers this function well — but it covers it through a mocked `safe-fs` boundary,
against a synthetic version `9.9.9`. It proves the path logic; it does not prove the
function works against this repository's real files. The addition is modest and is
described as modest. It is included because leaving the one function with a known
history as the only untightened member of the trio would be perverse.

**Add:** `result.success === true`; `result.version === version.getVersion()`;
`.claude-plugin/plugin.json` on disk now carries that version.

**What fails after.** A path regression that the mocked test's `existsSync` stub
would mask — the stub returns true for anything not containing `ctoc-plugin`, so a
*different* wrong path passes it. Against real files, no wrong path passes.

#### Addition 3 — `syncToReadme` (:325-336)

**Contract, sourced outside this test.** `src/lib/version.js:166-182` is explicit,
including the failure semantics the coordinator flagged as possibly undecided —
they were decided, and documented:

> **FAIL LOUD:** if the version line token is absent (e.g. the README format drifted
> so no `**X.Y.Z**` appears at a line start), the sync cannot do its job and returns
> `{ success: false, matched: false }` instead of a phantom success — so a future
> format drift surfaces loudly rather than silently disabling the sync.

So the partial-write contract is defined, not undefined. It is additionally already
tested, well, by the fixture block at `tests/version.test.js:342-395`, which drives
a fixture README through a real update and asserts `success:false, matched:false`
with the file untouched on drift.

**Why an addition, and an honest note.** Given `:342-395` exists, the weak test at
`:325-336` contributes almost nothing. The one thing the fixture block does not
cover is the success path **against the real tracked README**. That is the addition;
it is small, and the honest framing is that this entry is the least valuable of the
three.

**Add:** `result.success === true`; `result.matched === true`;
`result.version === version.getVersion()`. Snapshot and restore `README.md` exactly
as `:347-349` already does.

**What fails after.** A drift in the tracked README's own format — the very
condition the fail-loud contract exists for — currently returns
`{success:false, matched:false}` and this test passes. After, it goes red, which is
the entire point of having made the function fail loud.

#### Addition 4 — `syncAll` (:401-412)

**Contract, sourced outside this test.** `tests/version-syncplugin-path-fix.test.js:12-13`
records the consequence that defines this function's job: "`syncAll().plugin` never
actually synced the version". `syncAll`'s three booleans are claims about whether
each sibling succeeded, and CLAUDE.md's release procedure depends on them
(`node src/scripts/release.js` — "Sync VERSION to all JSON files").

**Why an addition.** The current test asserts the three keys exist and are booleans.
`{marketplace:false, plugin:false, readme:false}` — the exact state during the
shipped bug — passes.

**Add:** all three booleans are `true` in this repository, and each equals the
`success` field of the corresponding function called directly.

**What fails after.** The shipped bug's exact signature: `plugin:false` while the
suite stays green. Also a `syncAll` that hardcodes `true` regardless of outcome, or
that drops one sibling's failure — the second assertion catches both.

#### Additions 5 and 6 — `checkForUpdatesSync` (:440-457) and `checkForUpdates` (:463-474)

**Contract, sourced outside this test.** The function's name and its
`updateAvailable` field: an update is available exactly when the latest published
version is greater than the current one. `compareVersions` is the module's own
ordering primitive and is separately tested. `currentVersion` must be this
repository's version.

**Add:** `result.currentVersion === version.getVersion()`; and the derivable
invariant, stated conditionally — **when** `latestVersion` is a non-empty semantic
version string, `result.updateAvailable === (version.compareVersions(result.latestVersion, result.currentVersion) === 1)`.

**Honest weakness, stated rather than papered over.** These two functions consult a
network or a cache, so `latestVersion` may legitimately be absent offline, and the
invariant is then vacuous — the assertion protects nothing on an offline machine.
That is a real limitation of an assertion made against a live dependency. The clean
fix is a seam (drive the cache and the fetch through an injected boundary, as
`version-syncplugin-path-fix.test.js` does with `safe-fs`), which would make the
invariant unconditional and testable in both directions. **Step 9 must determine
whether such a seam exists on this call path.** If it does, use it and assert
unconditionally. If it does not, add the conditional invariant, and record in the
Execution Record that this pair remains weaker than the other four — do not report
them as closed.

**What fails after.** An implementation that reports `updateAvailable: true` while
the latest version equals or trails the current one — a false update prompt shown to
every user, which the current test cannot see.

---

### File: `tests/deployment.test.js`
**Action:** MODIFY — additions only
**Purpose:** Assert the part of the deployment result contract that is actually specified.

#### Addition 7 — `duration` on the failure path (currently untested)

**Contract, sourced outside the assertion being strengthened.**
`src/lib/deployment.js:222-247` documents `@returns {Promise<object>} Result with
name, status, duration, error` and returns `duration` on **both** the success path
(`:236`) and the failure path (`:244`). The failure path's `duration` has no test at
all; `tests/deployment.test.js:264` only reaches the success path.

**Add:** a case driving `deployToEnvironment` with a strategy that throws, asserting
`status === 'failed'`, `error` is a non-empty string, **and** `duration` is a finite
number — the documented shape, on the branch nobody checks.

**What fails after.** An error path that omits `duration` (a plausible refactor —
the two return objects are constructed separately and only one is tested) or that
returns `undefined` for it.

#### The `duration >= 0` assertion at :264 — a deliberate non-change, with reasoning

The audit is right that a hardcoded `0` passes it. The tightening available is to
inject a strategy that takes a known minimum time and assert `duration` reflects it.

**This is not done, and the reason is stated so a reviewer can dispute it.** The
contract for `duration` is thin: the source computes `Date.now() - start` and the
field name is its whole specification. Nothing outside the implementation says what
precision or floor it must have. Asserting `duration >= 45` after a ~50ms sleep
encodes a timing threshold that no one decided, introduces the only wall-clock
dependency in the file, and is exactly the kind of assertion that becomes flaky on a
loaded machine — trading a weak test for an unreliable one. `assert.ok(result.duration >= 0)`
is weak but it is not **wrong**, and the standing rule is that the default is to
leave a test alone.

**Recorded as a finding instead:** `duration` has no defined contract beyond its
name. If elapsed-time accuracy matters to anyone — a deployment report, a timeout
decision — that contract should be decided and then tested. That decision is the
human's, not this plan's.

---

### File: `tests/sync.test.js`
**Action:** MODIFY — one addition
**Purpose:** Pin the command at `:385`, the one place the audit's claim survives contact with the code.

#### Addition 8 — the command at `:385`, not just its working directory

**Contract, sourced outside this test.** The sibling test at `:298` establishes the
expectation for this module's git invocations by pinning `git status`. The test at
`:382-388` is named `'syncPlans uses correct project path'` and drives
`syncModule.syncPlans('/custom/project/path')`.

**Why an addition.** `:386` pins `execSyncCalls[0].opts.cwd` but never the command,
so an implementation that runs an arbitrary command in the right directory passes a
test whose name claims it verified plan syncing.

**Add:** an assertion that the first recorded call's `cmd` is a git command, in the
same style as `:298`.

**Explicitly not changed:** `:297` and its `length > 0` prelude, and `:385`'s own
`length > 0` prelude. They are redundant given the lines that follow them, and
redundancy is not a defect. Removing them would be a deletion.

---

### File: `tests/capability-databases.test.js`
**Action:** MODIFY — one narrow addition
**Purpose:** Forbid a placeholder in the two free-prose security fields, without inventing a content specification.

#### Addition 9 — placeholder tokens are not content

**Contract, and the honest limit of it.** There is **no** defined contract for what
`security.injection` or `security.connection` must say. Verified: the sibling
`tests/capability-data-correctness.test.js` contains no assertion on either field.
No plan, no header comment and no template defines their required content. They are
free prose.

**Therefore no content specification is invented here.** Asserting a minimum length,
a required keyword, or a required structure would be encoding this planner's opinion
as a shipped requirement, and it would go green — which is worse than the current
non-emptiness check, because it would look like the fields had been validated.

**What *can* be asserted without inventing anything:** a placeholder is definitionally
not content. `TODO`, `TBD`, `FIXME`, `XXX` and an empty-after-trim string are
authoring artefacts, not descriptions of injection posture.

**The match must be WHOLE-FIELD or WORD-BOUNDED — never "contains".** This is the
correction that makes the assertion safe, and it is not a technicality:

> `XXX` is the **universal convention for redacting a credential in a connection
> string** — `postgres://user:XXX@host/db`, `mongodb://admin:XXX@cluster/db`. In a
> field literally named `security.connection`, a redacted example connection string
> is **the single most likely piece of legitimate content**. A "contains `XXX`" rule
> would reject exactly the content the field exists to hold, and the cheapest way out
> of that false red is to delete the assertion.

The rule is therefore:

- **Whole-field match after trimming** — the field consists *only* of a placeholder
  token (case-insensitive), optionally with surrounding punctuation. `"TODO"`,
  `"  tbd  "`, `"FIXME"`, `"XXX"`, `""` all fail.
- **Word-boundary match** for the prose forms that are unambiguous even inside a
  sentence: `TODO`, `TBD` and `FIXME` bounded by `\b`, so "TODO: describe this" fails
  while a legitimate sentence containing the letters incidentally does not.
- **`XXX` is matched WHOLE-FIELD ONLY**, never by word boundary, precisely because
  `user:XXX@host` is legitimate redaction. A field that *is* `XXX` is a placeholder;
  a field that *contains* `XXX` inside a connection string is documentation.

**What fails after.** A database entry shipped with `injection: "TODO"` — which
today satisfies `typeof … === 'string' && length > 0` at `:78`.

**What must still PASS, and is asserted as its own case:** a `connection` field whose
value is a redacted connection string containing `XXX`. Step 8 must drive that exact
fixture and show it green, so the false positive is proven absent rather than assumed
absent.

**Recorded as a finding:** these two fields are shipped, human-facing security
guidance with no defined quality bar. Given the corpus-quality programme's standing
rule about web-verified content and no fabricated claims, someone should decide what
they must contain. Not this plan.

---

### File: `tests/settings.test.js`
**Action:** MODIFY — one addition
**Purpose:** Make `testSettingsSchema` non-vacuous on an empty schema.

#### Addition 10 — the schema must actually have its categories

**Contract, sourced outside the assertion being strengthened.** The sibling function
in the same file, `testSettingsTabs` at `:45-57`, asserts that `SETTINGS_TABS`
contains the ids `general`, `agents`, `workflow`, `learning`, `git` and `privacy`.
The settings screen renders a tab against its schema category, so the schema must
carry a category for each tab the same file already requires. CLAUDE.md
independently documents `general.environment` as a live setting resolved by
`src/lib/settings.js`.

**Why an addition.** `assert.ok(typeof SETTINGS_SCHEMA === 'object')` at `:64` is
satisfied by `{}`, and the loop at `:67-78` iterates `Object.entries` — so on `{}`
the loop body never executes and the whole function passes having asserted nothing
about the schema at all. That is vacuity in the strict sense, not mere weakness.

**Add:** every id in `SETTINGS_TABS` has a corresponding key in `SETTINGS_SCHEMA`,
and `general` carries an `environment` setting.

**What fails after.** An empty or truncated schema — a config regression, a bad
merge, a refactor that drops a category — currently passes and would leave settings
tabs rendering nothing. After, it goes red.

---

### Wiring — the live call sites

Every file here is already discovered by `resolveTestFiles()`
(`src/scripts/test-gate.js:203-208`) and runs on every `npm test`. No new module is
created; nothing needs wiring that is not already reached by the gated entry point.

## Test Plan

No new test file. Ten additions across five existing files, each named above with
its contract source, its justification and the implementation it newly rejects.

**Every addition must be shown to reject something.** Step 8 applies, per addition,
the specific broken implementation named in its "what fails after" clause — as a
scratch edit, reverted immediately — and records the verbatim red. An addition whose
named implementation does not go red bought nothing and is removed before Step 10.

**Addition 9 additionally requires a FALSE-POSITIVE case**: a `connection` field
holding a redacted connection string (`postgres://user:XXX@host/db`) must be shown
GREEN. An assertion that rejects legitimate content is not a tighter test, it is a
broken one.

Cross-platform: `path.join` throughout; the marketplace, plugin and README
snapshot-restore blocks use the existing `before`/`after` pattern at `:342-356` and
must restore on every exit path including a failed assertion.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write all ten additions and run the five files. Against the real, correct code every addition must be GREEN — these pin behaviour that already works, so a red means the assertion is wrong, not the code. Then, one at a time, apply each addition's named broken implementation as a scratch edit, run the affected file, and record VERBATIM which addition goes red. Revert each before the next. Any addition that does not reject its named implementation is deleted, not kept — a passing assertion that rejects nothing is the defect this slice exists to remove. **For Addition 9, additionally drive the false-positive fixture — a `connection` value of `postgres://user:XXX@host/db` — and record it GREEN. If it goes red, the match is still too broad and must be narrowed before Step 10.**
### Step 9: PREPARE — re-read from disk and confirm every contract this plan cites before writing a line: `src/lib/version.js:116-209` (the three sync functions and the documented FAIL LOUD semantics), the whole of `tests/version-syncplugin-path-fix.test.js` (the contract source for Additions 1, 2 and 4), `src/lib/version.js` for `checkForUpdatesSync`/`checkForUpdates` — and determine whether a cache or fetch seam exists that would make Additions 5 and 6 unconditional; if one does, use it. Also re-read `src/lib/deployment.js:222-247`, `tests/deployment.test.js:240-270`, `tests/sync.test.js:290-300` and `:378-390`, `tests/capability-data-correctness.test.js` (confirm it still has no assertion on `security.injection`), and `tests/settings.test.js:40-81`. **Read the live `security.connection` values of every shipped database entry and record whether any currently contains `XXX` or another placeholder token — that inventory decides whether Addition 9 lands green or exposes existing content.** Where disk disagrees with this plan, the code wins and the discrepancy is recorded.
### Step 10: IMPLEMENT — one step, files as sub-items. No existing assertion is modified, relaxed or removed in any of them.
  - `tests/version.test.js` — Additions 1-6.
  - `tests/deployment.test.js` — Addition 7.
  - `tests/sync.test.js` — Addition 8.
  - `tests/capability-databases.test.js` — Addition 9.
  - `tests/settings.test.js` — Addition 10.
### Step 11: REVIEW — diff every changed file and confirm the change is strictly additive: no assertion text altered, no range widened, no case deleted, no `if/else` branch removed. Confirm each addition's contract source is a real, quotable line outside the test it strengthens, and that no assertion encodes a specification this plan invented — Additions 9's placeholder ban and 5/6's conditional invariant are the two closest to that line and must be re-argued explicitly. **Confirm Addition 9 matches `XXX` whole-field only and never by substring, and that its false-positive case is present.** Confirm the `duration >= 0` assertion at `deployment.test.js:264` is untouched and its finding is recorded. Confirm the 61 markdown-corpus files are untouched.
### Step 12: OPTIMIZE — the file-write additions (1, 2, 3) must snapshot once and restore once, not per assertion. No addition may introduce a sleep, a poll or a wall-clock threshold.
### Step 13: SECURE — the marketplace, plugin and README writes target tracked repository files: confirm each is snapshot before and restored after on every exit path, and that a failed assertion cannot leave a tracked file modified. Confirm no secret or absolute home path is asserted on or printed. **Addition 9's fixtures include a connection string: it must be a REDACTED placeholder value, never a real credential, and must not resemble a live provider format.** Addition 8 asserts on a recorded command string and must not execute one.
### Step 14: VERIFY — run `node --test` on the five changed files plus `tests/version-coverage.test.js`, `tests/deployment-coverage.test.js`, `tests/deployment-execute.test.js`, `tests/sync-coverage.test.js`, `tests/sync-injection.test.js`, `tests/capability-registry.test.js` and `tests/capability-data-correctness.test.js`, recorded verbatim. Confirm by re-reading that `VERSION`, `README.md`, `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` are unmodified after the run. Then the full gated run `npm test` with `tests`, `suites`, `pass`, `fail`, `skipped`, `todo` and the coverage line verbatim. The coverage floor of 99 must NOT be lowered. Lint every changed file at `--max-warnings 0`. No git operations.
### Step 15: DOCUMENT — a comment above each addition naming the contract source by file and line, so the next reader can check the derivation rather than trusting it. **Addition 9's comment must state why `XXX` is whole-field only, naming the redacted-connection-string case, so a future tidy-up does not "simplify" it back into a substring match.** A comment at each existing `else` branch that Additions 1-3 render unreachable, stating that it is retained deliberately because this slice deletes nothing. No `src/` documentation changes.
### Step 16: FINAL-REVIEW — report the five paths, the Step 8 per-addition rejection evidence verbatim, the Addition 9 false-positive case result, the Step 9 inventory of live `security.connection` values, the three corrections to the audit's description, both recorded findings (`duration` has no contract; the two capability security fields have no quality bar), the honest weakness note on Additions 5 and 6 if no seam was found, an explicit restatement that the 61 markdown-corpus files are untouched, and every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **Every change is an addition; nothing is modified or deleted.** The danger in
   editing a suite is weakening it, and a strictly-additive change cannot. This also
   resolves the "is the test wrong or is the code wrong?" question honestly for most
   items: neither — the test is incomplete, and incompleteness is fixed by adding.
2. **Unreachable `else` branches are retained, not cleaned up.** Additions 1-3 make
   three `else` branches dead. Removing dead code is normally right; here it would be
   a deletion inside a slice whose credibility rests on making none. They stay, with
   a comment. A later slice may remove them as its own reviewed decision.
3. **No content specification is invented for the two capability security fields.**
   No contract exists for them anywhere in the repository. A placeholder ban is the
   most that can be asserted without inventing one, because a placeholder is not a
   description under any specification. The absence of a quality bar is reported as
   a finding for the human to schedule.
4. **`deployment.test.js:264` is deliberately NOT tightened.** The available
   tightening encodes an undecided timing threshold and adds the file's only
   wall-clock dependency, trading a weak test for a flaky one. The assertion is weak
   but not wrong, and the default is to leave a test alone. The missing failure-path
   coverage — which *is* specified, at `deployment.js:244` — is added instead.
   Recorded as a finding so the non-change is visible and disputable.
5. **Additions 5 and 6 may remain conditional, and that is stated rather than
   hidden.** They assert against a live network or cache dependency. Step 9 looks for
   a seam; if none exists, the invariant is vacuous offline and the Execution Record
   must say so instead of reporting the pair as closed.
6. **Addition 2 is included despite substantial overlap with an existing regression
   test, and its modest value is stated.** `version-syncplugin-path-fix.test.js`
   covers `syncToPluginJson` through mocked `safe-fs`; the addition covers it against
   real files. Leaving the one function with a known bug history as the only
   untightened member of the trio would be indefensible.
7. **The audit's three factual errors are recorded in the body rather than silently
   worked around**, because two of them change the work: there is nothing to fix at
   `sync.test.js:297`, and `version.test.js:404`/`:443`/`:466` are a different shape
   requiring different assertions than the three both-branches cases.
8. **`depends_on` is declared on slice `00095` despite the audit's reading that all
   three slices are independent.** Both slices declare `tests/version.test.js`. The
   ranges are disjoint, but two executors holding one file is exactly what the
   plan-scoped edit hook and the project's own serialisation rule exist to prevent.
   **A later review claimed slice `00095` does not exist and that this dependency
   should be removed. It does exist** —
   `plans/todo/00095-a-skipped-test-is-counted-as-a-skipped-test.md`, currently being
   built — and the review had searched the wrong folder set. The dependency STAYS.
   Recorded so the challenge is not raised a third time.
9. **The 61 markdown-corpus files are named as out of scope with the reason, not
   merely excluded.** The reason is that fixing them requires a human decision about
   what a skill file must contain — a corpus-quality question, not a test-tightening
   one. Naming it prevents this slice being read as having addressed it, and leaves
   the scheduling where it belongs.
10. **Addition 9's placeholder match is narrowed from "contains" to whole-field /
    word-bounded, and `XXX` is whole-field ONLY.** As originally written the rule
    forbade a field *containing* `XXX` — but `user:XXX@host` is the universal
    convention for redacting a credential in a connection string, so in a field named
    `security.connection` the single most likely legitimate content would have been
    rejected. A tightening that rejects legitimate content is not tighter, it is
    broken, and its cheapest resolution is deleting the assertion — which would have
    lost the whole addition. `TODO`/`TBD`/`FIXME` keep a word-boundary match (they
    are unambiguous in prose); `XXX` matches only when it *is* the entire field. A
    false-positive case is now required at Step 8 and pinned at Step 11, and Step 15
    requires the reasoning in a code comment so a future simplification does not
    reintroduce the substring match.
