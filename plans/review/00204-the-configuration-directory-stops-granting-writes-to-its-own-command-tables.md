---
iron_loop_verdict: true
title: >-
  The configuration directory stops granting writes to its own command tables —
  two files whose contents become a subprocess leave the blanket whitelist
type: implementation
parent_plan: none
depends_on: 00200-two-sibling-hooks-trust-an-environment-variable-the-harness-never-sets
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - src/hooks/PreToolUse.Edit.js
  - tests/config-command-tables-protected.test.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-07-31T01:33:33.456Z
gate_crossed: implementation → todo
kickback_counts:
  by_step:
    '8': 1
  total: 1
---

# The configuration directory stops granting writes to its own command tables

## The defect, read on disk

`src/hooks/PreToolUse.Edit.js:66-73`:

```js
const WHITELIST = [
  '.gitignore',
  '.gitattributes',
  /^\.ctoc\//,          // <- every path under the configuration directory
  /^\.local\//,
  /^plans\/.*\.md$/,
  /^VERSION$/,
];
```

Three carve-outs run ahead of it inside `enforce()`, at `:571`, `:584` and `:600`:
`.ctoc/approvals/` (human-approval provenance), `.ctoc/state/verify/` (Gate-3 evidence)
and `.ctoc/streaming/` (the gate question/answer store). All three exist because a file
whose *contents are believed by a gate* must not be agent-writable.

There is a fourth category under that whitelist, and it is not carved out: **files whose
contents become a subprocess.**

- `.ctoc/quality-config.yaml` — read by `tool-detector` as the explicit override for
  `lint`, `typecheck` and `test` (`tool-detector.js:5-9`);
- `.ctoc/capabilities/**/*.yaml` — the per-project capability table, whose `cmd`,
  `lint`, `typecheck` and `test` strings reach the same consumer
  (`capability-registry.js:11-13, 60-63`).

Those strings reach `quality-agent`'s `runConfiguredCommand` (`quality-agent.js:283`,
called at `:328/:642/:678`), which runs them as an ARGV VECTOR with `shell:false` — NOT
a shell. **CODE-WINS CORRECTION (2026-07-31):** the original premise of this plan said
the strings reach `execSync` with a shell at `quality-agent.js:111` and framed the
threat as shell injection. That is now FALSE: sibling plan 00203 SHIPPED (it is in
`plans/done/`), so `:111`'s shell `execSync` is a different function
(`runShellCommand`) that configured command tables no longer flow into. The still-valid
threat is one level milder but real: an argv subprocess of an agent-written program
string is still ARBITRARY-PROGRAM execution. `/ctoc:push` runs them, and the installed
git post-commit hook runs them detached after every commit. An agent that can write
these tables makes CTOC execute an arbitrary program on every push/commit — defense in
depth BEYOND 00203's shell fix, not a duplicate of it.

An approval file is believed. An evidence file is believed. **A command table is
obeyed** — which is strictly worse, and it is the one with no carve-out.

The `.ctoc/capabilities` directory is the sharper of the two: `capability-registry.js`
states in its own header at `:19-24` that a hostile file there "must never be remote
code execution". 00203 closed the shell channel; a hostile capability file can still
name an arbitrary program that quality-agent then spawns as argv, and the file it does
so with is one the edit whitelist hands out for free.

## The fix

An exclusion covering the **command tables** — not the whole configuration directory.
`enforce()` already carries three protected-path guards ahead of the whitelist (ledger,
verify-evidence, streaming); each of those DENIES. This one is deliberately different —
see "Fall through to coverage, not deny" below — so it is NOT a fourth guard in
`enforce()` but a negation inside `isWhitelisted`, the function that made the grant.

```js
/**
 * Configuration files whose CONTENTS BECOME A SUBPROCESS. `.ctoc/quality-config.yaml`
 * and `.ctoc/capabilities/**` supply the lint/typecheck/test/cmd strings that
 * tool-detector hands to quality-agent, which runs them (as an argv program, shell:false
 * since 00203) on /ctoc:push and on the detached git post-commit hook. The ledger is
 * BELIEVED and the verify evidence is BELIEVED; a command table is OBEYED. So these
 * leave the `/^\.ctoc\//` blanket
 * whitelist and fall through to ordinary plan coverage — a plan that genuinely needs to
 * change a project's toolchain declares the file and is approved like any other change.
 */
const COMMAND_TABLE_PATHS = [
  '.ctoc/quality-config.yaml',
  '.ctoc/quality-config.yml',
  '.ctoc/capabilities',
];
```

### Fall through to coverage, not deny

The ledger, verify and streaming guards **deny outright**, because no legitimate agent
edit to those stores exists — they are written by the pipeline or by a human crossing a
gate.

That is not true here. Changing a project's lint command is ordinary, legitimate work.
So a command table is not denied; it is **removed from the whitelist** and falls through
to the normal flow: project detection → plan coverage → escape phrase → block. A plan
that declares `.ctoc/quality-config.yaml` in its `files:` and has been approved may edit
it. An agent with no plan may not.

This is the weaker action and the correct one. Denying outright would break legitimate
configuration work and get the guard removed; the point is that changing what runs on
every commit should require the same approval as changing what ships.

### Mechanism

`isWhitelisted` gains an early return: a normalized path that is a command table, or
under one, is **not** whitelisted. Placing it inside `isWhitelisted` rather than as a
fourth guard in `enforce()` is deliberate — `isWhitelisted` is the function that made
the grant, and the negation belongs where the grant is, so a future reader of the
whitelist sees the exception without having to find it forty lines away.

Matching reuses the two helpers already in the file:

- `normalizeForProtection` (`:185`) — absolute → relative, backslash → slash, `.`/`..`
  resolved, escape-the-root rejected;
- `isUnderProtectedDir` (`:212`) — case-insensitive, segment-precise, so
  `.ctoc/CAPABILITIES/x.yaml` matches (macOS and Windows route it to the real directory)
  while `.ctoc/capabilities-old/x.yaml` does not.

`real-path-confinement.resolvesUnder` is also consulted, exactly as the ledger, verify
and streaming guards do at `:238-239`, `:256-257` and `:298-299`, so a symbolic link
under an ordinary `.ctoc/` path whose real destination is `.ctoc/capabilities/` is
caught. It returns true to deny on every fault and never throws — the failing direction
the file already established.

## Implementation Details

### File: `src/hooks/PreToolUse.Edit.js`
**Action:** MODIFY — `COMMAND_TABLE_PATHS`, `isCommandTablePath`, and one early return
in `isWhitelisted`

```js
/**
 * Whether `filePath` is one of the configuration COMMAND TABLES — a file whose strings
 * are executed as a subprocess by quality-agent on /ctoc:push and on the detached git
 * post-commit hook. Same two-check shape as isProtectedLedgerPath: arithmetic plus
 * real-path confinement, with the confinement check returning TRUE (excluded from the
 * whitelist) on every fault, and never throwing.
 *
 * @param {string} filePath
 * @returns {boolean}
 */
function isCommandTablePath(filePath) {
  const norm = normalizeForProtection(filePath);
  return COMMAND_TABLE_PATHS.some((dir) =>
    isUnderProtectedDir(norm, dir)
    || (realPathConfinement !== null
      && realPathConfinement.resolvesUnder(filePath, dir, process.cwd())));
}
```

In `isWhitelisted`, after the normalization block (whose last line is `:90`,
`if (norm.startsWith('../')) return false;`) and before the pattern loop at `:91`:

```js
  // A command table is NOT whitelisted, even though it lives under `.ctoc/`: its
  // contents become a subprocess. It falls through to plan coverage like any other
  // source file, so changing what runs on every commit needs the same approval as
  // changing what ships.
  if (isCommandTablePath(filePath)) return false;
```

Note the argument: `filePath`, the **original** value, not the locally normalized `norm`
— `isCommandTablePath` does its own normalization and the confinement check needs the
raw path to resolve links. Confirmed against the current file:
`resolvesUnder(targetFile, protectedDirRelative, root)` accepts an absolute OR
root-relative `targetFile` (`real-path-confinement.js:283, :299`) and returns true on
every fault without throwing, so the raw `filePath` (absolute from Claude Code, relative
in tests) is the correct input.

CAVEAT the test plan below already accounts for: `isWhitelisted` has a pre-existing
traversal guard at `:88` (`norm.includes('/../') → return false`) that fires BEFORE this
early return. So for any path containing `/../`, `isWhitelisted` returns false via that
guard and the command-table exclusion is never consulted. The exclusion's handling of
`..` (re-entering vs out-resolving) is therefore proven by testing `isCommandTablePath`
directly — cases 8 and 9.

`isCommandTablePath` joins `module.exports` (`:657-662`) next to `isProtectedLedgerPath`,
`isProtectedVerifyPath` and `targetsStreamingLive`, for the same reason those are
exported: it is a second view of a function `enforce` reaches on every tool call.

Nothing else changes. `enforce`'s flow, its exit codes and its logging are untouched.

### File: `tests/config-command-tables-protected.test.js`
**Action:** CREATE — `node:test`

| # | Function · Path | Expected |
|---|---|---|
| 1 | `isWhitelisted(`**`.ctoc/quality-config.yaml`**`)` | **false** — RED today (matches `/^\.ctoc\//` → true today) |
| 2 | `isWhitelisted(`**`.ctoc/capabilities/languages/javascript.yaml`**`)` | false — RED today |
| 3 | `isWhitelisted(`**`.ctoc/capabilities/project-types/x.yaml`**`)` | false — the whole directory, not just `languages` |
| 4 | `isWhitelisted(.ctoc/quality-config.yml)` | false — both spellings |
| 5 | `isWhitelisted(` absolute form of case 1 `)` | false |
| 6 | `isWhitelisted(` Windows separators `.ctoc\\capabilities\\languages\\x.yaml` `)` | false |
| 7 | `isWhitelisted(.ctoc/CAPABILITIES/x.yaml)` | false — case-insensitive, as the ledger guard is |
| 8 | **`isCommandTablePath`**`(.ctoc/state/../capabilities/x.yaml)` | **true** — `normalizeForProtection` resolves it to `.ctoc/capabilities/x.yaml`, which is under the table dir. (`isWhitelisted` also returns false, but via its own `/../` traversal guard at `:88`, which short-circuits before the exclusion — so the re-entry handling is proven on `isCommandTablePath` directly.) |
| 9 | **`isCommandTablePath`**`(.ctoc/capabilities/../settings.json)` | **false** — resolves to `.ctoc/settings.json`, NOT a command table; proves the exclusion does not over-reach. (`isWhitelisted` also returns false for this input, again via the `:88` traversal guard, independent of this change — it is NOT re-whitelisted by the exclusion.) |
| 10 | `isWhitelisted(.ctoc/capabilities-old/x.yaml)` | **true** — the `/` boundary is required; sibling stays whitelisted |
| 11 | `isWhitelisted(.ctoc/settings.json)` | **true** — unchanged; this slice does not touch it |
| 12 | `isWhitelisted(.ctoc/state/agent-status.json)` | true — unchanged |
| 13 | `isWhitelisted(VERSION)`, `plans/todo/a.md`, `.gitignore` | true — the rest of the whitelist is intact |
| 14 | `isProtectedLedgerPath(.ctoc/approvals/x.json)` | true — unchanged |
| 15 | `isCommandTablePath(null)`, `''`, `'../outside'` | false, no throw |
| 16 | **a symbolic link into the capabilities directory** | inside a temp fixture, a symbolic link at the fixture-relative path `link.yaml` under a `src` directory points to `.ctoc/capabilities/languages/x.yaml`; `isCommandTablePath` true. FAIL LOUDLY (never a recorded skip) where link creation is unavailable — see Decision 10; the repo `skip-visibility` fence forbids a runtime `t.skip()` |
| 17 | **an approved plan declaring the file still grants the edit** | fixture with an approved `plans/todo/` plan whose `files:` includes `.ctoc/quality-config.yaml`; drive the real spawned hook → **allowed**, logged with the plan name. This is the case that proves the fix is an approval requirement and not a ban |
| 18 | **no plan, no escape phrase** | same fixture without the plan; drive the spawned hook → `permissionDecision:"deny"` (via `emitDeny` in `block()`) |
| 19 | never throws | every case through a wrapper asserting no exception, plus a fixture where `real-path-confinement` is unresolvable |

Case 17 is the load-bearing guard. Without it, a later reader cannot tell this exclusion
from a ban, and the first person blocked from a legitimate toolchain change deletes it.

Fixtures under `os.tmpdir()`, `path.join` throughout, `fs.promises.rm` teardown. The
`isCommandTablePath` / `isWhitelisted` cases (1-16, 19) call the exported functions
directly with `process.cwd()` at the repo root, where `.ctoc/quality-config.yaml` and
`.ctoc/capabilities/**` really exist so `resolvesUnder` resolves real paths.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `isCommandTablePath` | `isWhitelisted` (defined at `PreToolUse.Edit.js:75`), called from `enforce()` at `:607` | the registered `PreToolUse` hook on Edit/Write/MultiEdit/NotebookEdit |

`isWhitelisted` runs on every editing tool call, and `PreToolUse.Write.js` delegates into
the same `enforce`. Nothing here is reachable only from a test.

## Test Plan

Covered by `tests/config-command-tables-protected.test.js`. Cases 1-8 and 16 are the
defect; cases 9-13 and 17 are the guards against the exclusion over-reaching into
ordinary configuration or becoming a ban.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
Write the file in full and run only it. Cases 1-8, 16 and 18 must be RED (cases 8, 16
red because `isCommandTablePath` does not exist yet; cases 1-7, 18 red because
`.ctoc/quality-config.yaml` is whitelisted/allowed today). Record case 1's red verbatim —
a whitelist allow on a file whose contents run on every commit is the sentence that
justifies this slice.

### Step 9: PREPARE
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
Read from disk: `PreToolUse.Edit.js:66-300` (the whitelist at `:66-73`, all THREE
protected-path guards — `isProtectedLedgerPath:226`, `isProtectedVerifyPath:251`,
`targetsStreamingLive:290` — and the two helpers `normalizeForProtection:185` and
`isUnderProtectedDir:212`), `src/lib/real-path-confinement.js` (already confirmed:
`resolvesUnder:283` accepts an absolute or root-relative `targetFile` and returns true on
every fault, never throwing), `src/lib/tool-detector.js` (confirm which configuration
paths are actually read — the docstring at `:5-9` names `.ctoc/quality-config.yaml`; if
the `.yml` spelling is not read, case 4 stays harmless per Decision 4 and the CODE wins),
and `src/lib/capability-registry.js:55-80`. Grep the repository for every writer of
`.ctoc/quality-config.yaml` and `.ctoc/capabilities/**`: **if CTOC itself writes either
through an editing tool, this change breaks it and that must be found now, not at
Step 14.** Already checked during this plan's rebase: `init-project.js` contains no
reference to either path (it and `capability-registry` write via safe-fs `fs` calls, NOT
editing tools, so they never pass through this hook). NOTE for the blast radius: in THIS
repo the bundled seed files `.ctoc/capabilities/**/*.yaml` (~75 tracked files) and
`.ctoc/quality-config.yaml` ARE real tracked files — after this change an Edit to any of
them needs an approved covering plan. That is the intended effect, not a regression.

### Step 10: IMPLEMENT
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
- `src/hooks/PreToolUse.Edit.js` — `COMMAND_TABLE_PATHS`, `isCommandTablePath`, the
  early return in `isWhitelisted`, the export.
- `tests/config-command-tables-protected.test.js` — the nineteen cases.

### Step 11: REVIEW
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
Confirm the exclusion is inside `isWhitelisted` and that no other path can whitelist a
command table. Confirm `isCommandTablePath` has no `throw` and that the confinement
branch returns the exclusion-ward value on every fault. Confirm the rest of the whitelist
is untouched by re-reading cases 11-13 against the code.

### Step 12: OPTIMIZE
Three string comparisons and at most three confinement resolutions per editing tool
call, and only for paths already normalized. The confinement check is already run for the
ledger, verify and streaming guards on every call; this is the same cost pattern.

### Step 13: SECURE
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
Re-attack: reach `.ctoc/quality-config.yaml` through a path spelling the exclusion misses
— a case variant, a traversal, a link, a Windows short name, a trailing dot or space
(Windows strips both), a unicode-normalization variant. Every success is either added to
the match set or written verbatim into "What this plan does NOT fix". Confirm no error
message echoes file contents.

### Step 14: VERIFY
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
`node --test` on the new file plus every existing enforcement, whitelist, coverage and
`init-project` test, then the full gated run `npm test`. Lint at `--max-warnings 0`. No
git operations. **Report whether any CTOC code path writes a command table through an
editing tool and is now blocked — that is the blast radius, and a blocked initializer is
a defect in this slice, not in the initializer.** (Expected: none — the writers route
through safe-fs, not editing tools; the only newly-gated writes are hand edits to this
repo's own tracked seed files, which is intended.)

### Step 15: DOCUMENT
Update the whitelist description in `CLAUDE.md`'s enforcement section: `.ctoc/*` is
whitelisted except the approval ledger, the verify evidence, the streaming store and the
command tables, and say why the command tables are different from the other three — their
contents are obeyed, not believed. Update the documented test-file count from disk.

### Step 16: FINAL-REVIEW
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
Report every Step 8 red verbatim, every Step 13 re-attack that succeeded, the Step 14
blast radius, and every decision taken under ambiguity.

## What this plan does NOT fix

- It does **not** stop the strings from reaching a shell. That was `00203`, which has
  ALREADY SHIPPED (`plans/done/`): configured command tables now run as an argv vector
  (`shell:false`), so no shell interprets them. This slice is the complementary,
  still-needed half — it requires approval to WRITE the table, so an agent cannot make
  CTOC spawn an arbitrary PROGRAM (argv) on the next push. Defense in depth on top of
  00203, not a duplicate of it.
- It does **not** protect `.ctoc/settings.json`, which carries the declared entry-point
  command. It is argv-only with shell operators rejected, so its blast radius is an
  arbitrary program rather than an arbitrary shell — and blanket-denying `settings.json`
  would block ordinary configuration work through the menu. A narrow guard on the
  `general.entry_point` key is the right shape and is not this slice.
- It does **not** protect `package.json` `scripts`, the same pattern one level out.
  `package.json` is not whitelisted, so an Edit already needs coverage — but an approved
  plan that declares it grants shell execution on the next push.
- It does **not** cover the **shell** channel. A shell command writing
  `.ctoc/quality-config.yaml` is governed by `00202`, which imports this same
  `isWhitelisted` — so this exclusion propagates there automatically once both have
  landed, and does not before.
- It does **not** audit the rest of `.ctoc/` for a fifth category of believed-or-obeyed
  file. Four are now carved out (ledger, verify, streaming, command tables); a systematic
  audit is separate work.
- It does **not** protect these files from a process outside the tool hooks. Any code
  running as the user writes them directly; this is a guard against agent mistakes and
  drift, not against intent.

## Decisions Taken Under Ambiguity

1. **Excluded from the whitelist, not denied outright.** Changing a project's lint
   command is legitimate work. A ban would be removed by the first person it blocked; an
   approval requirement is proportionate to the capability and matches how every other
   source file is treated.
2. **The exclusion lives inside `isWhitelisted`.** The negation of a grant belongs where
   the grant is written, so the next reader of the whitelist sees the exception without
   hunting for it.
3. **The whole `.ctoc/capabilities` directory, not just `languages/`.** `project-types/`,
   `databases/` and `frameworks/` are read by the same registry, and enumerating
   subdirectories is a list that goes stale the day a fifth is added.
4. **Both `.yaml` and `.yml` are listed.** If Step 9 finds only one spelling is read,
   the unread one is harmless to include and protects against a later reader accepting
   it. If it turns out `.yml` is read and this plan named only `.yaml`, the CODE wins.
5. **Real-path confinement is consulted, matching the three existing guards.** A link is
   how a name-based check is defeated, and the module for it is already loaded in this
   file with the correct failing direction.
6. **`.ctoc/settings.json` is deliberately excluded from this slice.** Protecting it
   wholesale blocks ordinary configuration; protecting one key inside a JSON file is a
   different mechanism (a content-aware guard, not a path guard) and deserves its own
   evidence.
7. **Case 17 is mandatory, not optional.** A security exclusion with no test proving the
   legitimate path still works is an exclusion that will be deleted the first time it
   inconveniences someone.
8. **Matching is case-insensitive.** macOS and Windows route a case variant to the real
   file, so a case-sensitive check is forgeable — the identical reasoning already
   recorded at `:204-217` for `isUnderProtectedDir` (shared by the ledger, verify and
   streaming guards).
9. **Traversal cases 8 and 9 assert on `isCommandTablePath`, not `isWhitelisted`.**
   `isWhitelisted`'s pre-existing `/../` traversal guard at `:88` short-circuits before
   the exclusion, so it returns false for both traversal inputs regardless of this change.
   Testing `isCommandTablePath` directly is what actually exercises the exclusion's `..`
   handling — re-entering (case 8, caught) vs out-resolving (case 9, not over-reached).
10. **Case 16 FAILS LOUDLY on symlink-creation failure; it does NOT record-and-skip.**
    The plan's original wording asked for a recorded skip where link creation is
    unavailable. CODE WINS: `tests/skip-visibility.test.js` forbids a runtime `t.skip()`
    (it makes the zero-skipped gate nondeterministic across machines) and the sibling
    `the-whitelist-cannot-leave-the-repository.test.js` establishes the CTOC convention
    that a symlink enforcement test fails loudly with the platform and error rather than
    skipping. Case 16 follows that convention — the recorded-skip wording is superseded.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
