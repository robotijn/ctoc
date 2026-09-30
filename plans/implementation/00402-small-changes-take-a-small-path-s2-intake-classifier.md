---
title: "The intake classifier names the path a change should take, and the session can run it"
type: implementation
status: implementation
parent_plan: small-changes-take-a-small-path
depends_on: 00401-small-changes-take-a-small-path-s1-trust-boundary
priority: high
effort: large
files:
  - src/lib/intake-classifier.js
  - src/lib/golden-corpus-scan.js
  - src/scripts/light-path.js
  - src/hooks/PreToolUse.Bash.js
  - src/commands/start.md
  - tests/intake-classifier.test.js
  # Ratchet file: a new library module and a new test file move documented counts.
  - CLAUDE.md
---

# The intake classifier names the path a change should take, and the session can run it

Read the parent plan first, in particular "The classification table", "The decision rule", decisions 1 to 8 and 15, and criteria 1 to 6, 15, 16 and 17.

## The problem in plain words

Every request that reads as a change is routed to a full plan today. The parent plan replaces that one answer with three paths — direct, quick, full — chosen from measured signals. This slice builds the classifier that computes the path from the files a session proposes to change, and the read-only `classify` command the session runs to get it. It writes nothing and grants nothing: the grant is a later slice. What the human gets from this slice alone is an honest answer, with its reasons, to "how much process does this change need".

## What the code does today (read on 2026-09-30)

- `src/lib/golden-corpus-scan.js` holds the five persisted contracts in a module-private `CONTRACTS` table and a module-private `detectConsumer(modulePath, source)`; its only export is `scanGoldenCorpus`.
- `analyzeExports(projectRoot)` in `src/lib/reachability.js` returns `live` and `dead` keys of the form `src/rel/path.js#name` for live modules only.
- Any command whose first word is `node` classifies as `indeterminate` in `src/lib/shell-write-targets.js`, and the shell hook denies an indeterminate command unless the signed state names a feature at step 8 or later:

```js
// src/hooks/PreToolUse.Bash.js, main()
const classified = shellWrites.classifyWrites(command);
const isWrite = classified.verdict !== 'none';
if (isWrite) {
  if (!state || !state.feature) { /* deny: No feature context */ }
  if (currentStep < MINIMUM_STEP_FOR_WRITE) { /* deny: planning not complete */ }
}
```

- `createState` in `src/lib/state-manager.js` is called only by `src/hooks/SessionStart.js`, with `feature: null`, and a presence search found no code under `src/` and no instruction under `agents/`, `skills/` or `src/commands/` that sets a feature. By reading, therefore, a session in a project whose signed state carries no feature cannot run any `node` command through the shell hook — including this slice's `classify`. This was read, not run (see "First, establish" below).

## First, establish (before any code)

1. In a scratch project outside this repository, drive the real shell hook as a child process with a signed state that carries no feature, once with `node "<absolute plugin root>/src/commands/start.js"` and once with `node -e "1"`. Record both outcomes in the slice's execution record. If the menu's own command is allowed, find out which input allowed it before writing the allowance below, and record it.
2. In a real session, record whether a command the session copies from `src/commands/start.md` arrives at the hook with `${CLAUDE_PLUGIN_ROOT}` already replaced by an absolute path. The allowance below accepts only the absolute path of the plugin's own script.

## Files and signatures

### Create `src/lib/intake-classifier.js`

```js
/**
 * Classify a proposed change into a path. NEVER throws: any internal fault returns
 * path 'full' with deciding.signal 'classifier-fault' (fail toward the full path).
 * Never calls pendingGateDecisions (it crosses plans as a side effect).
 *
 * @param {{ root: string,
 *           files: string[],                 // repository-relative, exact, no globs
 *           fork: (boolean|null),            // true: a decision is open; false: asserted none; null: not stated
 *           structureOnly: boolean,          // asserted: no behaviour change
 *           dependency: ({ name: string, from: (string|null), to: string }|null),
 *           override: ('plan-it'|'just-do-it'|null) }} input
 * @returns {{ path: ('direct'|'quick'|'full'|'ask'),
 *   deciding: ({ signal: string, source: string, detail: string }|null),
 *   signals: Array<{ name: string, status: ('measured'|'partial'|'none'|'asserted'),
 *                    pushes: ('direct'|'quick'|'full'), source: string, detail: string }>,
 *   overridden: string[], refusedOverride: boolean,
 *   question: ({ prompt: string, options: Array<{ key: ('plan-it'|'just-do-it'), label: string, consequence: string }> }|null),
 *   announcement: string }}
 */
function classifyChange(input) { /* … */ }
module.exports = { classifyChange };
```

Signals (fixed names), each recorded with its status and source:

| Signal | Status | Rule |
|---|---|---|
| `trust-boundary` | measured | `trustBoundary` from the first slice on each file; any hit → full, and "just do it" is refused |
| `files-proposed` | partial | empty list, or an entry that is absolute, contains `..`, a backslash, or a glob character → full |
| `new-file` | measured for proposed paths | a proposed path that does not exist and is not a test file → full (a new module must be wired); a new test file → quick |
| `modules` | partial | more than one existing non-test source file with a behaviour change (`structureOnly` false) → full |
| `persisted-format` | partial (five contracts) | `persistedContractOf` reports a contract for a file → full |
| `public-interface` | partial (paths) | under `.claude-plugin/` → full; under `src/commands/`, `agents/` or `skills/` → quick at least |
| `dependency-manifest` | measured by path | `package.json` listed: a claimed dependency with `from` null (new) or a non-patch change → full; a patch change → direct; no claim → direct (the finish-time re-measure in the gate slice verifies no dependency changed) |
| `exports-measurable` | partial | `package.json` and a `src/` directory both exist → measured at finish; otherwise none → a direct path is not available |
| `fork` | asserted | true or null → ask; false → recorded as an assertion by a model |
| `behaviour` | asserted | `structureOnly` false → quick; true → direct |

Decision rule, in order: "plan it" → full. A trust-boundary hit → full; "just do it" is refused and recorded. Any other signal pushing full → full, unless "just do it", in which case each such signal is listed in `overridden` and the floor becomes quick. A fork stated or unstated → ask, unless an override answers it (plan it → full; just do it → quick at least). A direct claim with `exports-measurable` at none → ask with that signal deciding; "just do it" then gives quick, never direct (criterion 15). Otherwise the highest remaining push.

The question, when `path` is `ask`, names the deciding signal and offers exactly two answers — "plan it" and "just do it" — each with its consequence in plain words, and carries no recommendation marker (an owner decision: how much process to spend). The announcement names the path, the files, the deciding signal and its source, the signals that had no source, any overridden signal, and how to override; it contains no approval-moment number and no internal code.

A test file is a path under `tests/`, `test/`, `__tests__/` or `spec/`, or one ending in `.test.<ext>` or `.spec.<ext>`.

### Modify `src/lib/golden-corpus-scan.js`

```js
/**
 * The persisted contract a module reads or writes, or null: the contract whose
 * canonical reader IS this module, or the one `detectConsumer` reports for it.
 * Pure over the given source; never throws.
 * @param {string} modulePath - repository-relative path
 * @param {string} source - the module's source text
 * @returns {string|null} a contract id from the registry
 */
function persistedContractOf(modulePath, source) { /* … */ }
module.exports = { scanGoldenCorpus, persistedContractOf };
```

### Create `src/scripts/light-path.js` (this slice: the `classify` subcommand only)

```
node <plugin root>/src/scripts/light-path.js classify --files a.js,b.js (--fork|--no-fork)
     [--structure-only] [--dep-name <name> --dep-from <version|new> --dep-to <version>]
     [--override plan-it|just-do-it]
```

Argument array only, no shell, no free text; each file entry must match `^[A-Za-z0-9._/@-]+$`. Root is `process.cwd()`. Prints the classifier's result as JSON plus `script` (this file's absolute path, so the session can quote it exactly) on stdout; exit 0. Bad arguments: a plain message on stderr and exit 2. An unknown subcommand: exit 2. Exits by setting `process.exitCode` and returning, never `process.exit` with pending output (the false-green fence's exit signature).

### Modify `src/hooks/PreToolUse.Bash.js`

```js
/**
 * Is this the plugin's OWN light-path script run as one simple command with an
 * allowed subcommand? Pure; never throws.
 *   • the whole command is `node "<path>" <subcommand> <args…>` with no shell
 *     metacharacter anywhere (; & | < > ` $ ( ) and newlines are all refused);
 *   • <path>, resolved against process.cwd(), equals
 *     path.resolve(__dirname, '..', 'scripts', 'light-path.js') — never a copy elsewhere;
 *   • <subcommand> is in LIGHT_PATH_OPEN_SUBCOMMANDS (this slice: 'classify').
 */
const LIGHT_PATH_OPEN_SUBCOMMANDS = new Set(['classify']);
function isSanctionedLightPathCommand(command) { /* … */ }
```

In `main`, the write step gate (feature and step 8) is skipped for a command this predicate accepts. Nothing else changes: the payload reader, the ledger-forgery gate, the opaque-decoder gate, the irreversible net, the raw plan-move deny and the commit gate all run before, and the coverage stage passes an indeterminate command exactly as today. The function stays internal (this file exports nothing by design) and is exercised through the spawned hook.

### Modify `src/commands/start.md`

Add a section "### Small changes — the intake classifier" with the read-only recipe, using the placeholder style the file already uses:

```
node "${CLAUDE_PLUGIN_ROOT}/src/scripts/light-path.js" classify --files {files} --no-fork --structure-only
```

and one paragraph: name the files you propose to change, say `--fork` if the request leaves a decision open, drop `--structure-only` if behaviour changes; show the human the printed `announcement` before the first edit; on `ask`, put the question to the human in plain text and let the human type "plan it" or "just do it" (an answer picked in a question tool arrives as a tool result, which the escape-phrase extraction excludes — believed from that code, not verified in a session); on `full`, create or activate a plan as today. Until the light-path slices that follow are built, direct and quick still need a plan or a typed escape phrase to edit — say so in the section rather than implying a grant. This recipe is read-only, so it is outside the recipe-execution fence's scope (that fence covers state-changing recipes only).

## Tests to write first (each run and seen failing before any code)

In `tests/intake-classifier.test.js`, against scratch projects with real files:

1. Criterion 1: three existing library files, `structureOnly` true, fork false, `package.json` and `src/` present → `direct`; every signal carries a source; the announcement names path, files and deciding signal and matches no `/gate\s*\d/i`.
2. Criterion 2: `package.json` with a claimed `1.4.2` → `1.4.3` → `direct`; `1.4.2` → `1.5.0` → `full`; `from: null` → `full`.
3. Criterion 3: one module plus its test, `structureOnly` false → `quick`.
4. Criterion 4: `src/hooks/PreToolUse.Bash.js` proposed → `full`, deciding `trust-boundary`, `question` null.
5. Criterion 5: fork true, and fork null → `ask`; exactly two options `plan-it` and `just-do-it`, each with a consequence, no `recommended` key anywhere.
6. Criterion 6: `src/hooks/human-gate-check.js` with override `just-do-it` → `full`, `refusedOverride` true.
7. "plan it" on an otherwise direct change → `full`.
8. Criterion 15: a scratch project with no `package.json` → a structure-only claim gives `ask` with deciding `exports-measurable`; with `just-do-it` it gives `quick`, never `direct`; the announcement lists the signals that had no source.
9. A proposed non-existing non-test file → `full`; a proposed non-existing test file alone → `quick`.
10. A file that requires `./streaming-precompute` and calls `loadPlanQuestions` → `full` via `persisted-format` (drives the real `persistedContractOf`).
11. Criterion 17 and the classifier half of criterion 30(d): adding `"**/widgets/**"` to the scratch triggers file flips `src/widgets/a.js` from `quick` to `full`.
12. Garbage input (no root, non-array files) → `full` with deciding `classifier-fault`; never throws.
13. The script as a child process in a scratch project: `classify` prints parseable JSON with `path` and `script`, exit 0; a bad argument exits 2.
14. The shell hook as a child process in a scratch project whose signed state carries NO feature: `node "<repo>/src/scripts/light-path.js" classify --files src/lib/a.js --no-fork --structure-only` is allowed (red today: "No feature context"); the same command with `; echo x > y` appended, with a backtick, or pointing at a copy of the script under the scratch project is denied exactly as today.

Every new line must be covered by these real callers; the coverage floor is read from `.ctoc/coverage-baseline.json` at run time and is not lowered.

## Where the new code is reached from

`src/commands/start.md` runs the script with `node`, which makes it a live root for the reachability fence (instruction-surface roots credit `node <path>`). The script requires the classifier; the classifier requires the trust-boundary module and calls `persistedContractOf`. The shell-hook predicate is called from `main` on every Bash command.

## Acceptance scenarios

- A session proposes a rename across three library files; `classify` prints `direct` with its reasons; the session shows the human one plain line before editing.
- A session proposes a change to a hook file; `classify` prints `full` naming the trust boundary; no question is asked.
- In a project whose signed state names no feature, the session can run `classify` through the shell hook.

## Security review

- The classifier and the script write nothing. The script takes an argument array, no free text, no shell.
- The shell allowance is narrow: one simple command, no metacharacters, the plugin's own copy of the script only, read-only subcommand only in this slice. It skips only the write step gate; every earlier deny still runs.
- Two inputs are asserted by a model (the fork statement and the structure-only claim); both are recorded as assertions and are re-checked against the real diff by the gate slice.

## Out of scope

Writing a record, any grant, the finish-time re-measure (the gate slice), the path-aware routing text (the routing slice).

## CLAUDE.md

Add a short paragraph under "Mandatory Pipeline Use (v7)" naming the intake classifier, the three paths and the read-only `classify` command, and update the documented counts.

## Decisions Taken Under Ambiguity

1. **No file-count ceiling on the direct path; the quick path allows one non-test source module.** The parent gives no number and forbids inventing one; "a small behaviour change inside one module" and "a rename … every caller" are its own words.
2. **A full signal lowered by "just do it" lands on quick, never direct**, because a change with a new module, a persisted format or a second module has behaviour worth a failing test first.
3. **An unstated fork counts as a signal with no source and asks.** "Unknown is not green" (decision 3).
4. **Agent and skill definitions are treated like command files (quick at least).** The parent names them in the same outward surface and gives a rule only for the manifest and command files.
5. **JavaScript measurability means `package.json` plus a `src/` directory**, because `analyzeExports` scans `src/`. Other stacks classify quick or full, as the parent says.
6. **The shell hook gets a narrow allowance for the plugin's own script.** Without it, by reading, `classify` (and, in the next slice, `open`) can never run in a project whose signed state names no feature, and no code sets one. This is a satisfier the parent's text does not list; it is stated here and in the parent index so the human sees it at the approach decision. Not chosen: a stateless proposal file classified inside the edit hook on every edit (moves classification onto the every-edit path and leaves no protected record).
7. **The export is one function, `persistedContractOf`, not the registry table**, so the registry stays module-private and the export has exactly one live caller.
