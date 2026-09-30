---
title: "The per-prompt routing reminder asks the session to classify a change instead of sending every change to a plan"
type: implementation
status: implementation
parent_plan: small-changes-take-a-small-path
depends_on: 00406-small-changes-take-a-small-path-s6-light-path-recipe
priority: high
effort: small
files:
  - src/lib/ctoc-routing-reminder.js
  - tests/ctoc-routing-reminder.test.js
---

# The per-prompt routing reminder asks the session to classify a change instead of sending every change to a plan

Read the parent plan first: section 1.1 item 1, "Where the classifier runs", and criteria 16 and 17.

## The problem in plain words

The human's complaint starts here: on every prompt that reads as a change, the routing reminder tells the session to create or activate a plan "before editing any file", and offers only a typed escape phrase as the lighter route. After the previous slices a lighter route exists. This slice changes the one constant directive into a path-aware one: classify first, then take the path the classifier names. The quiet gates that keep the reminder mostly silent do not change.

## What the code does today (read on 2026-09-30)

```js
// src/lib/ctoc-routing-reminder.js
function buildRoutingDirective() {
  return [
    '## CTOC routing — this project runs its work through CTOC',
    '',
    'This request looks like work (build, change, fix, add). No CTOC plan is currently',
    'driving it. Before editing any file:',
    '',
    '1. Run /ctoc:start and create or activate a plan whose `files:` list covers what you',
    // … agents, human decisions, ask before building …
    'If this change is genuinely too small for a plan, say so plainly and let the human',
    'type an escape phrase. Do not route around the pipeline silently.',
  ].join('\n');
}
// buildReminder: silent in a non-CTOC project and on a typed escape phrase; the directive
// fires on a work prompt when nothing is in progress or the in-progress count changed.
```

`tests/ctoc-routing-reminder.test.js` pins, among others, that the reminder's text matches `/CTOC routing/` when the directive fires, that it is empty on an escape phrase, and that it is empty on a repeat work prompt for an unchanged in-progress set.

## Files and signatures

### Modify `src/lib/ctoc-routing-reminder.js`

```js
/**
 * The path-aware routing directive. Pure; never throws.
 * The script path is this module's own sibling — path.resolve(__dirname, '..', 'scripts',
 * 'light-path.js') — printed ABSOLUTE, so the command the session copies is exactly the
 * one the shell hook's allowance accepts, with no placeholder left to expand.
 * @returns {string}
 */
function buildRoutingDirective() { /* … */ }
```

Text, in plain words and in this order:

1. Heading: `## CTOC routing — classify this change first`.
2. "This request looks like a change. Before editing any file, name the files you propose to change and whether the request leaves a decision open, then run:" followed by the absolute `classify` command with `--files {files}` and the `--fork` / `--no-fork` / `--structure-only` flags explained in one line each.
3. "It prints the path — direct, quick or full — and the signal that decided it. Show the human the one announcement line it prints before your first edit."
4. "Direct or quick: follow 'Small changes — the light path' in /ctoc:start. Full: run /ctoc:start and create or activate a plan whose files: list covers what you will touch; edits no approved plan or light-path record covers are refused by the edit hook."
5. The existing lines about CTOC's own agents, the human's decisions (named in words, never by number), and asking before building on a missing decision.
6. "The human can type 'plan it' to take the full path or 'just do it' to keep a light one; the trust boundary is never a light path. A typed escape phrase still lifts plan coverage for files off the trust boundary. Do not route around the pipeline silently."

`buildReminder`, the memo, the quiet gates, the escape-phrase silence and the never-throw contract are unchanged. The module must still never require `streaming-gate` (the hazard its header records).

## Tests to write first (each run and seen failing before any code)

Added to `tests/ctoc-routing-reminder.test.js`:

1. The directive contains `classify`, an absolute path that exists on disk and ends in `src/scripts/light-path.js`, "plan it", "just do it", and `/ctoc:start`. Red: the constant directive names none of the first four.
2. The directive matches no `/gate\s*\d/i` and names no internal code (criterion 16).
3. The real hook, run as a child process on a work prompt in a scratch CTOC project, prints the new directive and exits 0.
4. Every existing case in the file stays green with its assertions unchanged (the `/CTOC routing/` match, the escape-phrase silence, the already-driving silence, the state block, never-throw).

## Where the new text is reached from

`buildReminder` calls `buildRoutingDirective`; `src/hooks/UserPromptSubmit.js` calls `buildReminder` on every human prompt and is registered in `.claude-plugin/hooks.json`.

## Acceptance scenarios

- The human types "rename formatRow to renderRow" in a CTOC project with nothing in progress: the session is told to classify first, runs the printed command, and proceeds on a direct path with one announcement line — no plan, no approval request.
- The human types a request touching a hook file: the session is told the same, the classifier says full, and the session opens the menu to plan it as today.

## Security review

The directive is an instruction to the session, not a fence; the fences are the grant and the step gates. It carries no transcript text and no secret; the only path it prints is the plugin's own script.

## Out of scope

The memo and quiet-gate behaviour; the state block; the escape-phrase list.

## Decisions Taken Under Ambiguity

1. **The directive prints the script's absolute path taken from the module's own location**, so the command the session copies matches the shell hook's allowance exactly, whether or not the harness expands `${CLAUDE_PLUGIN_ROOT}` for the session.
2. **The quiet gates stay as they are.** The parent changes what the directive says, not when it fires; a request made while a plan is already in progress and the session has seen it still gets no reminder, and the menu section still documents the light path for it.
3. **No `CLAUDE.md` change in this slice**: no documented count moves, and the light-path paragraphs added by the earlier slices already describe the intake point.
