---
title: "The configuration directory stops granting writes to its own command tables — two files whose contents become a subprocess leave the blanket whitelist"
type: implementation
parent_plan: none
depends_on: 00200-two-sibling-hooks-trust-an-environment-variable-the-harness-never-sets
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/hooks/PreToolUse.Edit.js"
  - "tests/config-command-tables-protected.test.js"
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

Two carve-outs sit above it, at `:430` and `:443`: `.ctoc/approvals/` (human-approval
provenance) and `.ctoc/state/verify/` (Gate-3 evidence). Both exist because a file whose
*contents are believed by a gate* must not be agent-writable.

There is a third category under that whitelist, and it is not carved out: **files whose
contents become a subprocess.**

- `.ctoc/quality-config.yaml` — read by `tool-detector` as the explicit override for
  `lint`, `typecheck` and `test` (`tool-detector.js:2-10`);
- `.ctoc/capabilities/languages/*.yaml` — the per-project capability table, whose `cmd`,
  `lint`, `typecheck` and `test` strings reach the same consumer
  (`capability-registry.js:11-13, 60-63`).

Those strings reach `execSync` **with a shell** at `quality-agent.js:435`, `:459`,
`:523` and `:585`. `/ctoc:push` runs them, and the installed git post-commit hook runs
them detached after every commit.

An approval file is believed. An evidence file is believed. **A command table is
obeyed** — which is strictly worse, and it is the one with no carve-out.

The `.ctoc/capabilities` directory is the sharper of the two: `capability-registry.js`
states in its own header at `:19-24` that a hostile file there "must never be remote
code execution", and it keeps that promise for itself by never spawning. The promise is
broken downstream, and the file it is broken with is one the edit whitelist hands out
for free.

## The fix

A third protected-path guard in `enforce()`, alongside the ledger and verify-evidence
guards, covering the **command tables** — not the whole configuration directory.

```js
/**
 * Configuration files whose CONTENTS BECOME A SUBPROCESS. `.ctoc/quality-config.yaml`
 * and `.ctoc/capabilities/**` supply the lint/typecheck/test/cmd strings that
 * tool-detector hands to quality-agent, which runs them on /ctoc:push and on the
 * detached git post-commit hook. The ledger is BELIEVED and the verify evidence is
 * BELIEVED; a command table is OBEYED. So these leave the `/^\.ctoc\//` blanket
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

The ledger and verify guards **deny outright**, because no legitimate agent edit to
those stores exists — they are written by the pipeline or by a human crossing a gate.

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

- `normalizeForProtection` (`:138`) — absolute → relative, backslash → slash, `.`/`..`
  resolved, escape-the-root rejected;
- `isUnderProtectedDir` (`:165`) — case-insensitive, segment-precise, so
  `.ctoc/CAPABILITIES/x.yaml` matches (macOS and Windows route it to the real directory)
  while `.ctoc/capabilities-old/x.yaml` does not.

`real-path-confinement.resolvesUnder` is also consulted, exactly as the ledger and
verify guards do at `:190-192` and `:208-210`, so a symbolic link under an ordinary
`.ctoc/` path whose real destination is `.ctoc/capabilities/` is caught. It returns true
to deny on every fault and never throws — the failing direction the file already
established.

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

In `isWhitelisted`, after the normalization block and before the pattern loop:

```js
  // A command table is NOT whitelisted, even though it lives under `.ctoc/`: its
  // contents become a subprocess. It falls through to plan coverage like any other
  // source file, so changing what runs on every commit needs the same approval as
  // changing what ships.
  if (isCommandTablePath(filePath)) return false;
```

Note the argument: `filePath`, the **original** value, not the locally normalized `norm`
— `isCommandTablePath` does its own normalization and the confinement check needs the
raw path to resolve links. Step 9 must confirm `resolvesUnder`'s expected input shape
before relying on this.

`isCommandTablePath` joins `module.exports` next to `isProtectedLedgerPath` and
`isProtectedVerifyPath`, for the same reason those are exported: it is a second view of
a function `enforce` reaches on every tool call.

Nothing else changes. `enforce`'s flow, its exit codes and its logging are untouched.

### File: `tests/config-command-tables-protected.test.js`
**Action:** CREATE — `node:test`

| # | Path | Expected |
|---|---|---|
| 1 | **`.ctoc/quality-config.yaml`** | `isWhitelisted` **false** — RED today |
| 2 | **`.ctoc/capabilities/languages/javascript.yaml`** | false — RED today |
| 3 | **`.ctoc/capabilities/project-types/x.yaml`** | false — the whole directory, not just `languages` |
| 4 | `.ctoc/quality-config.yml` | false — both spellings |
| 5 | absolute form of case 1 | false |
| 6 | Windows separators `.ctoc\\capabilities\\languages\\x.yaml` | false |
| 7 | case variant `.ctoc/CAPABILITIES/x.yaml` | false — case-insensitive, as the ledger guard is |
| 8 | traversal that lands back inside: `.ctoc/state/../capabilities/x.yaml` | false |
| 9 | traversal that resolves out: `.ctoc/capabilities/../settings.json` | **true** — still whitelisted, because it is not a command table. Guards against the exclusion over-reaching |
| 10 | sibling that must stay whitelisted: `.ctoc/capabilities-old/x.yaml` | **true** — the `/` boundary is required |
| 11 | `.ctoc/settings.json` | **true** — unchanged; this slice does not touch it |
| 12 | `.ctoc/state/agent-status.json` | true — unchanged |
| 13 | `VERSION`, `plans/todo/a.md`, `.gitignore` | true — the rest of the whitelist is intact |
| 14 | `.ctoc/approvals/x.json` | false via `isProtectedLedgerPath`, unchanged |
| 15 | `null`, `''`, `'../outside'` | false, no throw |
| 16 | **a symbolic link into the capabilities directory** | create `src/link.yaml` → `.ctoc/capabilities/languages/x.yaml` in a temp fixture; `isCommandTablePath` true. Skip with a **recorded reason** where link creation is unavailable (Windows without the privilege), never silently |
| 17 | **an approved plan declaring the file still grants the edit** | fixture with an approved `plans/todo/` plan whose `files:` includes `.ctoc/quality-config.yaml`; drive the real spawned hook → **allowed**, logged with the plan name. This is the case that proves the fix is an approval requirement and not a ban |
| 18 | **no plan, no escape phrase** | same fixture without the plan; drive the spawned hook → `permissionDecision:"deny"` |
| 19 | never throws | every case through a wrapper asserting no exception, plus a fixture where `real-path-confinement` is unresolvable |

Case 17 is the load-bearing guard. Without it, a later reader cannot tell this exclusion
from a ban, and the first person blocked from a legitimate toolchain change deletes it.

Fixtures under `os.tmpdir()`, `path.join` throughout, `fs.promises.rm` teardown.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `isCommandTablePath` | `isWhitelisted` at `PreToolUse.Edit.js:75`, called from `enforce():450` | the registered `PreToolUse` hook on Edit/Write/MultiEdit/NotebookEdit |

`isWhitelisted` runs on every editing tool call, and `PreToolUse.Write.js` delegates into
the same `enforce`. Nothing here is reachable only from a test.

## Test Plan

Covered by `tests/config-command-tables-protected.test.js`. Cases 1-8 and 16 are the
defect; cases 9-13 and 17 are the guards against the exclusion over-reaching into
ordinary configuration or becoming a ban.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the file in full and run only it. Cases 1-8, 16 and 18 must be RED. Record case 1's
red verbatim — a whitelist allow on a file whose contents run on every commit is the
sentence that justifies this slice.

### Step 9: PREPARE
Read from disk: `PreToolUse.Edit.js:66-211` (the whitelist, both protected-path guards
and both helpers), `src/lib/real-path-confinement.js` (**confirm** `resolvesUnder`'s
signature and its expected input shape before passing a raw path),
`src/lib/tool-detector.js` (confirm which configuration paths are actually read, and
whether the `.yml` spelling is supported — if it is not, case 4 changes and the CODE
wins), and `src/lib/capability-registry.js:55-80`. Grep the repository for every writer
of `.ctoc/quality-config.yaml` and `.ctoc/capabilities/**`: **if CTOC itself writes
either through an editing tool, this change breaks it and that must be found now, not at
Step 14.** `init-project.js` is the first place to look.

### Step 10: IMPLEMENT
- `src/hooks/PreToolUse.Edit.js` — `COMMAND_TABLE_PATHS`, `isCommandTablePath`, the
  early return in `isWhitelisted`, the export.
- `tests/config-command-tables-protected.test.js` — the nineteen cases.

### Step 11: REVIEW
Confirm the exclusion is inside `isWhitelisted` and that no other path can whitelist a
command table. Confirm `isCommandTablePath` has no `throw` and that the confinement
branch returns the exclusion-ward value on every fault. Confirm the rest of the whitelist
is untouched by re-reading cases 11-13 against the code.

### Step 12: OPTIMIZE
Three string comparisons and at most three confinement resolutions per editing tool
call, and only for paths already normalized. The confinement check is already run twice
per call for the ledger and verify guards; this is a third of the same cost.

### Step 13: SECURE
Re-attack: reach `.ctoc/quality-config.yaml` through a path spelling the exclusion misses
— a case variant, a traversal, a link, a Windows short name, a trailing dot or space
(Windows strips both), a unicode-normalization variant. Every success is either added to
the match set or written verbatim into "What this plan does NOT fix". Confirm no error
message echoes file contents.

### Step 14: VERIFY
`node --test` on the new file plus every existing enforcement, whitelist, coverage and
`init-project` test, then the full gated run `npm test`. Lint at `--max-warnings 0`. No
git operations. **Report whether any CTOC code path writes a command table through an
editing tool and is now blocked — that is the blast radius, and a blocked initializer is
a defect in this slice, not in the initializer.**

### Step 15: DOCUMENT
Update the whitelist description in `CLAUDE.md`'s enforcement section: `.ctoc/*` is
whitelisted except the approval ledger, the verify evidence and the command tables, and
say why the third one is different — its contents are obeyed, not believed. Update the
documented test-file count from disk.

### Step 16: FINAL-REVIEW
Report every Step 8 red verbatim, every Step 13 re-attack that succeeded, the Step 14
blast radius, and every decision taken under ambiguity.

## What this plan does NOT fix

- It does **not** stop the strings from reaching a shell. That is `00203`. Either slice
  alone is partial: this one requires approval to write the table, that one stops the
  table's contents being interpreted. **Both are needed** and neither is a substitute.
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
- It does **not** audit the rest of `.ctoc/` for a fourth category of believed-or-obeyed
  file. Three are now carved out; a systematic audit is separate work.
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
3. **The whole `.ctoc/capabilities` directory, not just `languages/`.** `project-types/`
   and `databases/` are read by the same registry, and enumerating subdirectories is a
   list that goes stale the day a fourth is added.
4. **Both `.yaml` and `.yml` are listed.** If Step 9 finds only one spelling is read,
   the unread one is harmless to include and protects against a later reader accepting
   it. If it turns out `.yml` is read and this plan named only `.yaml`, the CODE wins.
5. **Real-path confinement is consulted, matching the two existing guards.** A link is
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
   recorded at `:158-163` for the ledger guard.
