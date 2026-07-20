---
title: "The shell gate stops allowing a command it could not read — an unreadable payload becomes a refusal, and the quote-truncating fallback is deleted"
type: implementation
parent_plan: none
depends_on: 00202-the-shell-channel-asks-the-coverage-question-the-edit-channel-asks-and-records-its-answer
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/hooks/PreToolUse.Bash.js"
  - "tests/bash-gate-payload-reader.test.js"
---

# The shell gate stops allowing a command it could not read

## The defect, read on disk

`src/hooks/PreToolUse.Bash.js:617-629`:

```js
function getCommand() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8') || ''; } catch { return ''; }
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return (parsed && parsed.tool_input && parsed.tool_input.command)
      || (parsed && parsed.command) || '';
  } catch {
    const m = raw.match(/command['":\s]+["']?([^"'\n]+)/);
    return m ? m[1] : '';
  }
}
```

and `main():671-673`:

```js
if (!command) {
  process.exit(0);
}
```

**Two defects, one shape.**

### An unreadable payload is an allow

Every failure route returns `''`, and `''` exits 0 — allowed. A read error, an empty
pipe, a payload with no recognized key, a parse failure that the regex also misses: all
of them mean "I could not see the command", and all of them are recorded as "nothing to
check". The hook's own comment at `:619-620` names this as intentional — "Fails OPEN
(returns '') on any read/parse error" — which makes it a documented decision rather than
an oversight, and it is the wrong one for a gate whose other layers deny an
inline-eval command it merely *cannot statically clear* (`:368-386`).

### The fallback evaluates less text than the shell will run

```js
const m = raw.match(/command['":\s]+["']?([^"'\n]+)/);
```

The captured group **stops at the first quote**. For a payload whose command contains a
quote — which is most real commands — the gate evaluates a **prefix** of what the shell
will execute:

```
{"tool_input":{"command":"echo \"x\" > src/lib/plan-coverage.js"}}
                                   ^ capture ends here
```

The gate sees `echo \`. The shell runs the redirect. Every deny layer in the file — the
ledger gate, the irreversible net, the plan-move gate, the write gate, and after `00202`
the coverage gate — is then evaluated against text that is not the command.

This is the **truncate-then-parse** signature `CLAUDE.md` names in the false-green
fence, and `src/lib/false-green-scan.js` exists to detect it. It is present in a
permission hook.

The regex only runs when `JSON.parse` fails, so it is reachable when the payload is
malformed or wrapped — but "the fallback is rarely reached" is not a defence for a
fallback that reports a verdict on input it never received.

## The fix

### An unreadable payload is a refusal

`getCommand` is replaced by `readPayload()`, returning a discriminated result rather
than a bare string:

```js
/**
 * Read the PreToolUse payload from STDIN (fd 0). The pipe is single-consumer, so
 * main() calls this exactly once.
 *
 * FAILS CLOSED. Every route that cannot produce the real command returns
 * {status:'unreadable'}, which main() DENIES. Returning '' and allowing — the previous
 * behaviour — meant the gate reported a verdict on input it never received: exactly the
 * truncate-then-parse / parse-default shape src/lib/false-green-scan.js fences, sitting
 * inside a permission hook. There is NO regex fallback: the old one stopped at the first
 * quote, so a command containing a quote was evaluated against a PREFIX of what the
 * shell would run.
 *
 * @returns {{status:'ok', command: string, payload: object}
 *          |{status:'empty'}
 *          |{status:'unreadable', reason: string}}
 */
function readPayload()
```

- read throws → `unreadable`, reason `payload could not be read`;
- `JSON.parse` throws → `unreadable`, reason `payload was not valid JSON`;
- parsed but no `tool_input.command` and no `command` → `unreadable`, reason
  `payload carried no command`;
- raw is the empty string → **`empty`** (see below);
- otherwise → `ok`.

`main()` treats `unreadable` as a deny, through the same `emitDeny` path every other
block uses, with a banner naming the reason and the fact that the gate could not inspect
the command.

### The empty case is separated, deliberately, because it is the risky one

An entirely empty stdin is **not** the same as a malformed payload. It is what happens
when the hook is invoked with no pipe at all — plausibly by a harness variation, a
manual run, or a future invocation shape. Denying it would block **every Bash command in
every installation** if that shape ever occurs.

So `empty` is handled separately: **deny, but as its own outcome with its own banner and
its own log entry**, so if it ever fires in the field the cause is legible in one line
instead of being indistinguishable from a malformed payload.

**This is the one decision in this whole set that most deserves a human's confirmation
before it ships**, and Step 8 must produce the evidence for it rather than the plan
asserting it: drive the **real spawned hook** with (a) a correct piped payload, (b) an
empty pipe, (c) no stdin redirection at all, and **report what the harness actually
does**. If the empty case is reachable in normal operation, the correct outcome is a
human decision, not a quiet allow and not a confident deny.

### The blast radius, stated

If the harness ever delivers a payload this reader refuses, **every Bash command is
denied**. That is the maximum-severity failure mode for a change of this kind, and it is
the reason this slice is ordered last in the shell-channel chain: `00201` and `00202`
land the substantive fixes first, so a rollback of this one does not take them with it.

Mitigations, all of which are ordinary and none of which is new machinery:

- the deny message names the reason and points at the escape hatch that already exists —
  disabling the hook via `.ctoc/settings.yaml` `enforcement.mode: off`;
- Step 14 drives the real hook through every payload shape the repository's existing
  tests use, so a shape in live use cannot be missed;
- the change is confined to one function plus one branch in `main()`.

## Implementation Details

### File: `src/hooks/PreToolUse.Bash.js`
**Action:** MODIFY — `getCommand` replaced by `readPayload`; the top of `main()`

`00202` already changed `getCommand` to return the parsed payload (the escape-phrase
check needs `transcript_path`). This slice changes its **failure semantics** and deletes
the regex fallback. Step 9 must read the post-`00202` shape on disk — the code as it
stands after the dependency, not as this plan describes it — and adapt.

In `main()`:

```js
  const payload = readPayload();
  if (payload.status === 'unreadable') {
    writeToTerminal(formatBlocked('(unreadable)', null,
      `the PreToolUse payload could not be inspected (${payload.reason}), so this `
      + 'command cannot be cleared. A gate that cannot read its input must not report a '
      + 'verdict on it.', 'PAYLOAD'));
    emitDeny(`CTOC: Bash command denied — the payload could not be inspected (${payload.reason}).`);
  }
  if (payload.status === 'empty') {
    writeToTerminal(formatBlocked('(no payload)', null,
      'no PreToolUse payload arrived on stdin, so this command cannot be inspected.',
      'PAYLOAD'));
    emitDeny('CTOC: Bash command denied — no payload arrived on stdin.');
  }
  const command = payload.command;
```

`formatBlocked` takes a state argument and dereferences it with optional chaining at
`:637-639`, so passing `null` is safe — **confirm that on disk at Step 9**. Deliberately
no `loadState` call here: the payload check runs before any state read, so a broken state
cannot turn a payload refusal into a crash.

Both branches record a log entry through the `00202` logging, with a fixed-vocabulary
reason and **no payload text** — an unreadable payload is exactly the kind of thing that
might contain a secret, and it is untrusted bytes.

### File: `tests/bash-gate-payload-reader.test.js`
**Action:** CREATE — `node:test`, driving the **real spawned hook**

| # | Payload delivered to the spawned hook | Expected |
|---|---|---|
| 1 | valid JSON, benign command, state at step 10 | exit 0, no deny |
| 2 | **valid JSON whose command contains quotes and a redirect**: `echo "x" > src/uncovered.js` | **deny** — the truncation defect: the old fallback saw `echo \` |
| 3 | **malformed JSON containing a command with quotes** | **deny** with the unreadable reason — never a verdict on a prefix |
| 4 | **empty stdin** | deny with the no-payload reason, and **the observed harness behaviour is recorded in the test file as a comment** |
| 5 | **no stdin redirection at all** | deny; Step 8 records what actually happens, and if the process hangs on `readFileSync(0)` that is a finding that changes this slice |
| 6 | valid JSON with no `command` key | deny with `payload carried no command` |
| 7 | valid JSON where `command` is a number / an object / `null` | deny — a non-string command is unreadable, not empty |
| 8 | valid JSON, `command: ""` | deny — an empty command string is not a licence; it is a payload with nothing to clear |
| 9 | **the regex fallback is gone** | grep the file's source from disk for `raw.match` and assert no match; a behavioural test cannot prove the absence of a fallback that only fires on inputs the test would have to guess |
| 10 | stdin is a closed pipe (read throws) | deny, no crash, exit code is the deny path's 0 with the decision JSON on stdout |
| 11 | a very large valid payload (1 MiB command) | handled without truncation — assert the classification matches what the full command implies, proving nothing is capped mid-read |
| 12 | the deny banner and the log carry no payload text | after case 3, read `.ctoc/logs/enforcement.json` and the captured stderr; assert neither contains the payload bytes |
| 13 | **every payload shape used by the repository's existing Bash-hook tests still works** | enumerate the shapes from `tests/ledger-forgery-closed.test.js` and its siblings and assert each still reaches a decision. This is the blast-radius guard |
| 14 | Windows | run cases 1, 2 and 4 with `\r\n` line endings in the payload |

Case 9 is a source assertion and is deliberate: the fallback's danger is on inputs
nobody enumerated, so its absence is what is asserted, not its behaviour.

Fixtures under `os.tmpdir()`, `path.join` throughout, `fs.promises.rm` teardown; state
written through `state-manager.saveState` (unsigned fixtures stop loading once `00205`
lands).

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `readPayload` | the first statement of `main()` in `PreToolUse.Bash.js` | the registered `PreToolUse` hook, matcher `Bash` |

`main()` runs on every Bash tool call. Nothing here is reachable only from a test.

## Test Plan

Covered by `tests/bash-gate-payload-reader.test.js`. Cases 2, 3, 6, 7, 8 and 10 are the
defect; cases 1, 11 and 13 are the guards against the fix denying ordinary work. Cases 4
and 5 are the **measurements** on which the empty-stdin decision rests, and they must be
reported before Gate 3 rather than settled by this plan.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the file in full and run only it. Cases 2, 3, 6, 7, 8, 9, 10 and 12 must be RED.
**Before anything else, run cases 4 and 5 against the real spawned hook and record the
observed behaviour verbatim** — whether an empty pipe and an absent pipe are
distinguishable, and whether `readFileSync(0)` blocks. That measurement is the input to
the empty-stdin decision and this slice must not proceed past Step 10 without it.

### Step 9: PREPARE
Read from disk: `PreToolUse.Bash.js:611-780` **as it stands after `00202`**,
`formatBlocked:634-662` (confirm a null state is safe), `src/lib/hook-deny-signal.js`,
`src/lib/false-green-scan.js` (the `truncate-then-parse` and `parse-default` signatures
this fix removes), and every existing test that spawns this hook, for case 13. Read
`.claude-plugin/hooks.json` to confirm how the harness invokes the hook. **Where the
code disagrees with this plan, THE CODE WINS.**

### Step 10: IMPLEMENT
- `src/hooks/PreToolUse.Bash.js` — `readPayload` replaces `getCommand`; the regex
  fallback deleted; the two new branches at the top of `main()`; the two log entries.
- `tests/bash-gate-payload-reader.test.js` — the fourteen cases.

### Step 11: REVIEW
Confirm no route through `readPayload` returns a usable command it did not fully parse.
Confirm the two deny branches run **before** any `loadState`. Confirm no error message or
log entry carries payload bytes. Confirm the reader is still called exactly once — a
second read of a drained pipe is the defect `PreToolUse.Edit.js:21-33` documents.

### Step 12: OPTIMIZE
One regex removed from the per-command path; nothing added. No read cap is introduced —
capping the read would reintroduce truncate-then-parse in a new spelling.

### Step 13: SECURE
Confirm the payload is never interpolated into a `RegExp`, a message, or a log field.
Re-attack: a payload with a `command` key inside a nested string, a payload with two
`command` keys, a payload using unicode escapes for the redirect character, a payload
whose JSON is valid but 50 MiB. Report what each does; a hang or an unbounded allocation
on the last one is a finding.

### Step 14: VERIFY
`node --test` on the new file plus **every** existing test that spawns this hook, then
the full gated run `npm test`. Lint at `--max-warnings 0`. Run `false-green-scan` and
confirm `src/hooks/PreToolUse.Bash.js` **loses** its `truncate-then-parse` entry from
`.ctoc/false-green-baseline.json` — that baseline may only shrink, and this slice is
what shrinks it. No git operations. **Report the case-13 result: whether any payload
shape in live use is now denied. Any such shape is a defect in this slice.**

### Step 15: DOCUMENT
Record in `CLAUDE.md` that the Bash gate denies a command whose payload it cannot
inspect, and remove any documentation stating the hook fails open on an unreadable
payload. Update the documented test-file count from disk.

### Step 16: FINAL-REVIEW
Report every Step 8 red verbatim, the **case 4 and case 5 measurements in full**, every
Step 13 re-attack result, the case-13 blast radius, the baseline shrink, and every
decision taken under ambiguity. **Name the empty-stdin deny explicitly as a decision the
human should confirm rather than inherit.**

## What this plan does NOT fix

- It does **not** change the Edit channel's reader. `PreToolUse.Edit.js:213-218` returns
  `null` on a parse failure and `enforce` reaches `block`, which is already fail-closed
  for a *missing* target — but its outer catch at `:493` still fails OPEN on a throw.
  That catch is untouched here.
- It does **not** change guard-files' fail-open on an absent payload (named in `00200`).
- It does **not** unify the three hooks' payload readers into one module. Three readers
  remain, with three different failure semantics; two are now fail-closed and one is not.
- It does **not** bound the payload size. Step 13 reports what a very large payload does;
  acting on that report is separate work, because a cap is a truncation and this slice
  exists to remove one.
- It does **not** make the hook's outer catch at `:775-778` fail closed. A throw still
  exits 1, which the harness treats as non-blocking — a separate defect of the same
  family, deliberately not folded in.

## Decisions Taken Under Ambiguity

1. **Unreadable denies.** A gate that reports a verdict on input it never received is
   the false-green shape this repository already fences in five places. A permission hook
   is the worst place for it.
2. **The regex fallback is deleted, not repaired.** A regex that extracts a shell command
   from arbitrary text is guessing; a repaired one guesses more accurately and is still
   guessing. Refusing is the honest answer, and `isLedgerForgery` already refuses what it
   cannot statically clear.
3. **`empty` is a separate status from `unreadable`.** They have different causes and
   different likelihoods of firing in the field, and one shared banner would make the
   riskiest failure mode illegible at the moment someone needs to read it.
4. **The empty case denies, and the decision is flagged for the human rather than
   settled here.** It is the one change in this set that could block every Bash command
   in every installation. Steps 8 and 16 produce and report the measurement; the plan
   does not assert its way past it.
5. **This slice is ordered last in the shell chain.** `00201` and `00202` carry the
   substantive fixes; if this one must be reverted, they survive.
6. **No read cap is added.** A cap is a truncation, and truncation is the defect.
7. **Payload bytes never reach a message or a log.** They are untrusted, may contain a
   secret, and the log is a file people paste into issues.
8. **The payload branches run before `loadState`.** A broken state must not be able to
   turn a payload refusal into a crash, which the outer catch would turn into a
   non-blocking exit 1 — an allow by another name.
