---
title: "The menu instructions carry the whole light-path flow, and every state-changing step of it is proven by running"
type: implementation
status: implementation
parent_plan: small-changes-take-a-small-path
depends_on: 00405-small-changes-take-a-small-path-s5-gate-and-commit
priority: high
effort: medium
files:
  - src/commands/start.md
  - src/lib/recipe-harness.js
  - tests/shipped-recipes-execute.test.js
  - .ctoc/recipe-coverage.json
  # Ratchet file: the three-paths description in CLAUDE.md must match the shipped flow.
  - CLAUDE.md
---

# The menu instructions carry the whole light-path flow, and every state-changing step of it is proven by running

Read the parent plan first: Part A in full, "Human moments", "When a light change grows", decisions 7 and 8, criteria 1, 3, 7, 11 and 16, and definition-of-done item 4 (the recipe fence).

## The problem in plain words

The classifier, the record, the grant, the gate and the commit rule exist after the previous slices, but the session is told how to use only `classify`. This slice writes the flow into `src/commands/start.md` — the instruction surface the session follows — in plain words, and registers the new state-changing commands with the recipe-execution fence, so each one is proven by running it rather than by reading it. Without the registration the fence would not even see them: its scope is an enumerated list of script basenames.

## What the code does today (read on 2026-09-30)

```js
// src/lib/recipe-harness.js
const STATE_CHANGING_SCRIPTS = new Set(['ledger-backfill.js']);
function isStateChanging(recipe) {
  if (recipe.kind === 'node-script') {
    return STATE_CHANGING_SCRIPTS.has(path.basename(recipe.scriptPath || ''));
  }
  return (recipe.calls || []).some((c) => STATE_CHANGING_CALLS.has(c));
}
// recipeId for a node-script recipe: sha1 of 's:' + scriptPath + ' ' + args, first 12 hex
```

`.ctoc/recipe-coverage.json` holds `covered` (proven by running; may only grow; `minCovered` 4 today) and `uncovered` (may only shrink; `maxUncovered` 5 today). A new state-changing recipe absent from both fails `tests/shipped-recipes-execute.test.js`.

## Files and changes

### Modify `src/commands/start.md`

Extend the section the intake-classifier slice added into "### Small changes — the light path", in this order, every command with the file's `${CLAUDE_PLUGIN_ROOT}` placeholder style and `{placeholders}` for values:

1. Classify (`classify`, from the intake-classifier slice). Show the human the printed announcement line before the first edit — the path, the files, the deciding signal, and how to override.
2. On `ask`: put the question in plain text and let the human TYPE "plan it" or "just do it". Do not use a question tool for it: its answer arrives as a tool result, which CTOC never treats as typed by the human.
3. On direct or quick: write the human's request, verbatim as typed, to `.ctoc/state/light-path-request.txt`, then run `open --files {files} --request-file .ctoc/state/light-path-request.txt --no-fork [--structure-only]` (with `--override just-do-it` only after the human typed it).
4. Before the first edit, run the tests `open` lists under `affected_tests` and see them green, so a red afterwards is attributable. When the list is empty, say so.
5. Quick: write the failing test first, run it, and see it fail, before the implementation.
6. Edit only the listed files. A refused write to any other file is the growth stop: file the existing scope-growth question (`requestScopeGrowth` in `src/lib/scope-growth.js`, the seven fields, with the record id as the plan) and stop; do not commit and do not revert; the working-tree diff stays for the planner.
7. Run `gate {id}`. On exit 4, report the stop reason in plain words and file the scope-growth question or ask the human to plan it. On exit 5, report the failing evidence in plain words; nothing is committed.
8. Dispatch `code-reviewer` once with the diff (`git diff` output) pasted into its brief as data — it holds Read, Grep and Glob only, so it cannot run git itself.
9. Quick: ask the human "finished?" with a short summary of the diff; on the human's yes, run `ack {id}`. Under an active keep-going batch, show a status line instead of asking.
10. Apply the project's patch bump (in this repository: the `VERSION` file and `node src/scripts/release.js`), then `git commit`. Never push; a push is surfaced to the human as a decision.
11. Run `close {id} --reason committed`, and give the human one milestone line.
12. At any moment, if the human types "plan it": run `close {id} --reason superseded`, leave the working-tree diff as it is, and create the functional plan through the existing create-plan route.

State in the section, in plain words, what stays absolute: the trust boundary is never a light path; a typed escape phrase does not unlock it; the full gate, one diff read and the human's word on push are never skipped.

### Modify `src/lib/recipe-harness.js`

```js
const STATE_CHANGING_SCRIPTS = new Set(['ledger-backfill.js', 'light-path.js']);
```

`classify` then also counts as a node-script recipe of a state-changing script, because the scope predicate is per script basename. It is covered by a fixture like the others (its assertion: no file is written), which is simpler than splitting the predicate per subcommand.

### Modify `tests/shipped-recipes-execute.test.js` and `.ctoc/recipe-coverage.json`

One fixture and one assertion per light-path recipe the section ships (`classify`, `open`, `ack`, `gate`, `close` for committed and for superseded), each run through the harness against a scratch project seeded so its declared effect must occur: `open` writes a record that the real reader accepts; `ack` sets `ack.at`; `gate` writes verify evidence under the `light-path-<id>` slug and the record's `gate` block (the scratch `package.json` carries a one-line passing `test` script and the project is a git repository with one commit); `close` moves the record to `closed/`; `classify` writes nothing. Each gets a `covered` entry with its `id`, `label`, `calls` or `script`, and `effect`; `minCovered` rises by the number added. `uncovered` does not grow.

## Tests to write first (each run and seen failing before any code)

1. With `light-path.js` added to the harness scope and the new recipes in `start.md` but no coverage entries yet, `tests/shipped-recipes-execute.test.js` fails by naming each new recipe as absent from both lists — the fence catching their arrival. Record that red, then add the fixtures.
2. Each fixture asserts its declared effect by reading the real files it produced (never by reading the recipe text).
3. `tests/ledger-forgery-closed.test.js` (which checks that every `start.md` recipe passes the forgery gate verbatim) stays green: none of the new recipes is an inline evaluation.
4. The instruction-surface fence for gate numbers (`instruction-gate-words-fence` in `src/lib/iron-loop-enforcer.js`) passes on the new section (criterion 16): it names moments in words, never numbers.

## Where the new text is reached from

`src/commands/start.md` is the shipped instruction surface of `/ctoc:start`; the session reads it on every open. The recipe harness is the live call site of the fence in `tests/shipped-recipes-execute.test.js`.

## Acceptance scenarios

- A session in a scratch project follows the section end to end for a direct rename and for a quick option, through the real hooks, and the human sees exactly two lines for the direct change (the announcement and the milestone) and one "finished?" for the quick change (parent definition of done, item 5).
- A session told "plan it" midway closes the record as superseded and starts a functional plan; nothing is committed or reverted.

## Security review

The section tells the session to relay the human's request verbatim and to let the human type override words; it never tells the session to type them itself. It names no secret. The commit step never pushes.

## Out of scope

The routing reminder text (the routing slice). Any change to how the scope-growth question is filed or read.

## CLAUDE.md

Add one paragraph under "Mandatory Pipeline Use (v7)" naming the three paths and what each runs, pointing at the section in `src/commands/start.md` as the flow a session follows.

## Decisions Taken Under Ambiguity

1. **The whole light-path script is in the fence's scope, `classify` included**, because the scope predicate is per script basename; `classify` gets a fixture asserting it writes nothing.
2. **The patch bump comes after `gate` and before the commit**, for the reason in the gate slice's decision 3.
3. **The affected-tests baseline before the first edit is an instruction, not a checked step.** The parent says a mechanical "red witnessed by CTOC" run is not required (decision 7); the same reasoning applies to the green baseline.
