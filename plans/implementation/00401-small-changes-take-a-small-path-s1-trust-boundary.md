---
title: "One trust-boundary list, and a typed escape phrase never unlocks a file on it"
type: implementation
status: implementation
parent_plan: small-changes-take-a-small-path
depends_on: none
priority: high
effort: medium
files:
  - src/lib/trust-boundary.js
  - src/hooks/PreToolUse.Edit.js
  - src/hooks/PreToolUse.Bash.js
  - tests/trust-boundary.test.js
  # Ratchet file: this slice creates a library module and a test file, which moves
  # two documented counts, and it changes the enforcement flow CLAUDE.md describes.
  - CLAUDE.md
---

# One trust-boundary list, and a typed escape phrase never unlocks a file on it

Read the parent plan first (`plans/implementation/small-changes-take-a-small-path.md`), in particular section 1.5, decisions 19 and 20, and criteria 29 and 30. This slice reopens none of them.

## The problem in plain words

The human's rule is that making small changes cheap must never make his gates cheap: anything on the trust boundary takes the full path whatever anyone types. Today there is no single list of what the trust boundary is. Three partial sources exist (the protected enforcement list, the four guards the edit hook exports, and the product risk-surface globs), and none of them is the human's list. Separately, a typed escape phrase today unlocks any file outside three denied directories, including the hook files that enforce the human's decisions.

This slice creates the one list (decision 20) and makes a typed escape phrase stop unlocking any file on it, on both write channels (decision 19). Nothing else about the escape phrases changes.

## What the code does today (read on 2026-09-30)

The edit hook's step 4, in `enforce` in `src/hooks/PreToolUse.Edit.js`, allows any target once the human typed a phrase:

```js
// 4. Escape phrase?
const transcript = readTranscript(stdinJson);
const escape = findEscapeInTranscript(transcript);
if (escape) {
  return allow('escape', {
    tool, target_file: targetFile, project_root: root,
    project_is_ctoc: true, escape_phrase: escape, mode, mode_source: modeSource,
  });
}
```

The shell hook's coverage stage, in `checkWriteCoverage` in `src/hooks/PreToolUse.Bash.js`, returns before looking at any target:

```js
if (editHook && typeof editHook.findEscapeInTranscript === 'function') {
  const escape = editHook.findEscapeInTranscript(transcript);
  if (escape) return { result: 'escape', target: null, plan: null, escape_phrase: escape };
}
```

The three existing sources, all read in full:

```js
// src/lib/protected-paths.js — pure, never throws, case-sensitive
function isProtectedEnforcementPath(rel) { /* src/hooks/** + eight named files */ }

// src/hooks/PreToolUse.Edit.js — exported; each resolves relative to process.cwd()
isProtectedLedgerPath(filePath)   // .ctoc/approvals
isProtectedVerifyPath(filePath)   // .ctoc/state/verify
targetsStreamingLive(filePath)    // .ctoc/streaming except questions/pending
isCommandTablePath(filePath)      // .ctoc/quality-config.y(a)ml, .ctoc/capabilities

// src/lib/refinement-loop.js — exported
loadTriggers(root)        // reads .ctoc/config/refinement-triggers.yaml; ABSENT → empty list;
                          // present but unreadable → throws (readFileSync is not guarded)
globMatch(filePath, glob) // "**/auth/**" becomes ^.*/auth/.*$ — a leading segment is required
```

Observed by reading `globMatch`: a glob such as `**/Dockerfile` or `**/auth/**` never matches a path at the repository root (`Dockerfile`, `auth/login.js`), because the translated expression requires a `/` before the named segment.

## Files and signatures

### Create `src/lib/trust-boundary.js`

```js
'use strict';
/**
 * The ONE trust-boundary list (decision 20 of plan small-changes-take-a-small-path).
 * A file on it always takes the full path: no light path covers it, no override word
 * lowers it, and a typed escape phrase does not unlock it.
 *
 * Sources, consulted in this order, first hit wins:
 *   1. isProtectedEnforcementPath (src/lib/protected-paths.js), evaluated on the path
 *      as given AND lowercased (a case-variant write lands on the real file on macOS
 *      and Windows; protected-paths itself is not changed).
 *   2. The four guards the edit hook exports (ledger, verify evidence, streaming store,
 *      command tables) — required LAZILY inside the function, never at load time,
 *      because the edit hook requires this module.
 *   3. The named files of decision 20, plus the light-path record directory.
 *   4. The modules plan small-changes-take-a-small-path adds, including this one.
 *   5. The globs in .ctoc/config/refinement-triggers.yaml, read at CALL time through
 *      loadTriggers and matched through globMatch (refinement-loop.js) — tested against
 *      the path and against "/" + path, so a root-level file matches.
 *
 * RETURNS, NEVER THROWS, and fails TOWARD the boundary: the edit hook's outer catch
 * fails open, so a throw here would become an allow.
 */
const NAMED_FILES = Object.freeze([
  '.claude-plugin/hooks.json',
  'src/lib/escape-phrases.js',
  'src/lib/enforcement-mode.js',
  'src/lib/state-manager.js',
  'src/lib/step-13-verify.js',
  '.ctoc/settings.yaml',
  '.ctoc/settings.json',
]);
const NAMED_DIRS = Object.freeze(['.ctoc/light-path']); // the light-path record store
const PLAN_MODULES = Object.freeze([
  'src/lib/trust-boundary.js',
  'src/lib/intake-classifier.js',
  'src/lib/light-path.js',
  'src/scripts/light-path.js',
]);

/**
 * @param {string} target - a tool-call target, absolute or repository-relative
 * @param {string} root - the project root. The edit hook's guards resolve against
 *   process.cwd(), so callers run with process.cwd() === root (true in both hooks and
 *   in the light-path script).
 * @returns {{ boundary: boolean, source: (string|null) }} `source` is a fixed-vocabulary
 *   label: 'protected-enforcement-path' | 'approval-ledger' | 'verify-evidence' |
 *   'streaming-store' | 'command-table' | 'named-file' | 'plan-module' |
 *   'risk-surface:<glob>' | 'risk-surface-unreadable' | 'guards-unavailable' | 'fault'
 */
function trustBoundary(target, root) { /* … */ }

module.exports = { trustBoundary };
```

Normalisation: an absolute target is made relative to `root`; backslashes become `/`; a leading `./` is dropped; `.` and `..` are resolved with the POSIX normaliser; a result that escapes the repository returns `{ boundary: false, source: null }` (no source applies to a file outside the repository; the edit hook already handles those). Named files, named directories and plan modules are compared lowercased.

This file must never contain a `require(` whose argument mentions the mode resolver: `tests/enforcement-mode.test.js` case 25 allows exactly one production file to require it. Naming its path inside a string list is not a require and does not trip that case.

### Modify `src/hooks/PreToolUse.Edit.js`

```js
// fail-soft sibling require, like the other five
let trustBoundaryMod = null;
try { trustBoundaryMod = require('../lib/trust-boundary'); } catch { trustBoundaryMod = null; }

/**
 * May a typed escape phrase unlock THIS target? False for a file on the trust
 * boundary, and false on every fault (an unloadable module counts as boundary).
 * The ONE predicate both write channels use for the typed phrase.
 * @param {string} targetFile
 * @param {string} root
 * @returns {{ allowed: boolean, source: (string|null) }}
 */
function escapeAllowsTarget(targetFile, root) { /* … */ }
```

- Step 4 consults the phrase only when `escapeAllowsTarget(targetFile, root).allowed` is true.
- When a phrase was typed and refused for this target, step 5 runs exactly as it does with no phrase typed (decision 19, read as: the phrase is not consulted). In strict mode the block carries the trust-boundary source: `buildBlockMessage` gains one "Why:" line — "this file is part of the trust boundary (`<source>`); a typed escape phrase does not unlock it, only an approved plan does" — and the `emitDeny` reason gains the same sentence. The block log entry gains an optional `trust_boundary: <source>` field. No verbatim list of phrases is added to any message (the rule recorded above `buildBlockMessage`).
- Soft and off keep deciding exactly as they do with no phrase typed.
- `escapeAllowsTarget` is added to `module.exports`; its live callers are this file's step 4 and the shell hook.

### Modify `src/hooks/PreToolUse.Bash.js`

In `checkWriteCoverage`: when a phrase is typed, it is honoured only if no determinate target that is not whitelisted is refused by `escapeAllowsTarget`. When one is refused, the stage falls through to the per-target coverage loop with no phrase, and a denied target that was refused for the boundary returns `{ result: 'uncovered', boundary: <source> }`; the log entry uses the fixed reason `trust-boundary` and the deny message names the boundary exactly as the edit channel does. A missing `escapeAllowsTarget` export means refused (fail closed). This file must not mention the enforcement mode in any form — `tests/enforcement-mode.test.js` case 27 forbids the tokens, including in comments.

## Tests to write first (each run and seen failing before any code)

In `tests/trust-boundary.test.js`, hooks driven as child processes with `cwd` set to a scratch project and a synthetic transcript (the pattern of `tests/bash-gate-plan-coverage.test.js`):

1. `trustBoundary` reports boundary, with the expected source, for: `src/hooks/PreToolUse.Bash.js`, `src/lib/plan-coverage.js`, `.ctoc/approvals/x.json`, `.ctoc/state/verify/x.json`, `.ctoc/streaming/questions/x.json`, `.ctoc/quality-config.yaml`, `src/billing/charge.js`, a root-level `Dockerfile`, each of the seven named files, `.ctoc/light-path/lp-0123456789ab.json`, and each of the four plan modules. Red because the module does not exist.
2. `src/lib/format-row.js` and `.ctoc/streaming/questions/pending/x.json` are not boundary. Red for the same reason.
3. `isProtectedEnforcementPath` returns, for a fixed table of twelve paths, exactly the values it returns today (criterion 30(c)). This case is GREEN before any code: it is a regression pin on a file this slice does not edit, recorded as such rather than banked as a red.
4. Criterion 30(d), the typed-phrase half: in a scratch root whose triggers file gains `"**/widgets/**"`, `src/widgets/a.js` flips to boundary for `trustBoundary` AND the edit hook refuses a typed phrase for it. (The classifier half of 30(d) is in the intake-classifier slice.)
5. Criterion 30(e): a triggers file that exists but cannot be read makes every path boundary; an absent triggers file contributes nothing; neither throws. The unreadable case uses a permission change, so on Windows and as root it SKIPS LOUDLY with a printed reason (the repository's rule for permission-dependent cases).
6. Criterion 29(a): for each of the seven phrases typed by the human, strict mode, no covering plan, an editing-tool write to `src/hooks/PreToolUse.Edit.js` and to `src/lib/escape-phrases.js` is denied and the reason names the trust boundary. Red today: the phrase allows it.
7. Criterion 29(c): the same phrase on `src/lib/format-row.js` is still allowed with outcome `escape`. Green before (a pin on unchanged behaviour).
8. Criterion 29(b): with a signed state at step 10 carrying a feature (so the step gate is not what decides), `echo x > src/lib/escape-phrases.js` with a typed phrase is denied at strict, soft and off. Red today.
9. Criterion 29(d): soft mode, boundary file, phrase typed → logged outcome `soft-warn` (today `escape`); off → `off-allow`. Red today.
10. Criterion 29(e): a boundary file covered by a human-approved plan is allowed as today; `.ctoc/settings.json` with a phrase typed is allowed by the whitelist as today. Green before (pins).

## Where the new code is reached from

- `trustBoundary` is called by `escapeAllowsTarget` in the edit hook on every edit where a phrase was typed; the edit hook is registered for Edit, and Write, MultiEdit and NotebookEdit delegate to its `enforce` (read in their headers).
- `escapeAllowsTarget` is called by the edit hook's step 4 and by `checkWriteCoverage` in the shell hook, registered for Bash in `.claude-plugin/hooks.json`.
- Whether the registered hooks actually run in a live session was not established by running (see the parent index, "Facts read, not run"). The human-flow check below establishes it.

## Acceptance scenarios

- A human types "hotfix" and asks for an edit to `src/hooks/PreToolUse.Bash.js` with no approved plan: the edit is refused, and the message says the file is on the trust boundary and an approved plan is needed.
- The same human types "hotfix" for `src/lib/format-row.js`: the edit goes through as it does today.
- In a scratch project outside this repository, both of the above are driven through the real hooks and the enforcement log lines are captured and read (parent definition of done, item 5).

## Existing tests to open before building

Open every test the parent's definition of done lists in item 2, and additionally `tests/pretooluse-edit-escape-role-scoping.test.js`, `tests/w01-edit-write-deny-protocol.test.js` and `tests/the-whitelist-cannot-leave-the-repository.test.js`. A presence search over ten of these files found no target path from the trust-boundary list used together with a typed phrase; that search is not proof. If one pins a typed phrase allowing a boundary file, that single assertion changes only by tightening toward the new behaviour, with the justification written in the test (the contract is decision 19 of the parent, approved by the human; the test asserts the replaced contract; what newly fails is a typed phrase unlocking a boundary file).

## Security review

- Fails toward the boundary on every fault; never throws into a fail-open catch.
- The mode is not read on the shell channel; the three deny-outright guards and the whitelist still run before any of this.
- The list names the light-path record directory and the plan's own new modules, so no light path can ever cover its own grant machinery.
- No secret and no file content reaches a log or a message: sources are fixed-vocabulary labels; a glob label carries the glob text from the checked-in triggers file.

## Out of scope

Extending `src/lib/protected-paths.js` or changing what plan coverage accepts for any file (decision 20, finding 2). Removing the two settings files from the whitelist (finding 1). The classifier's use of the list (the intake-classifier slice).

## CLAUDE.md

Update "Mandatory Pipeline Use (v7)" step 4 and the shell-channel paragraph: a typed phrase is not consulted for a file on the trust boundary, which is the one list in `src/lib/trust-boundary.js`; soft and off still relax plan coverage on the edit channel exactly as before. Update the documented library-module and test-file counts.

## Decisions Taken Under Ambiguity

1. **The library module requires the edit hook lazily, inside the function.** The parent requires the four exported guards to be called, not copied. A lazy require avoids a load-time cycle (the edit hook requires this module) and has one precedent already: `src/lib/iron-loop-enforcer.js` requires `src/hooks/human-gate-check.js`. Not chosen: moving the four guards into a new library module (a larger edit to a protected hook for no behaviour gain).
2. **Root-level paths are tested against the risk-surface globs with a leading `/` added.** The reused matcher needs a segment before the named directory, so `Dockerfile` and `auth/x.js` at the root would otherwise never match. The matcher itself is not changed, because the refinement loop reads it too.
3. **Named files, named directories and plan modules compare case-insensitively**, and the protected enforcement list is evaluated on both spellings, because a case-variant path writes the real file on macOS and Windows (the reason the edit hook's own guards are case-insensitive).
4. **The light-path record directory is named in this slice**, before the record exists, so the boundary list is complete from its first commit.
5. **In a shell command that writes several files, one boundary target means the typed phrase is not consulted for the whole command.** A command is one decision; honouring the phrase for some of its targets would need a partial allow the hook does not have.
6. **An unloadable trust-boundary module means no typed phrase is honoured.** A permission lookup that cannot look must not grant.
7. **The streaming quarantine is not on the boundary**, because the guard that defines the streaming store exempts it by design and it is whitelisted.
