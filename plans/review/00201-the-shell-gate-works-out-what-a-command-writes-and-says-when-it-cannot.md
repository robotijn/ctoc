---
iron_loop_verdict: true
title: "The shell gate works out what a command writes, and says plainly when it cannot — a two-character prefix stops disabling the write gate"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/shell-write-targets.js"
  - "src/hooks/PreToolUse.Bash.js"
  - "tests/shell-write-targets.test.js"
approved_by: human
approved_at: 2026-07-28T22:58:55.662Z
gate_crossed: implementation → todo
---

# The shell gate works out what a command writes, and says plainly when it cannot

## The defect, read on disk

`src/hooks/PreToolUse.Bash.js:554-579`:

```js
function isWriteCommand(command) {
  if (!command) return false;
  const normalized = command.trim().toLowerCase();

  for (const pattern of ALWAYS_ALLOWED) {
    if (pattern.test(normalized)) {
      return false;                       // <- returns before any write pattern is read
    }
  }
  for (const pattern of WRITE_PATTERNS) { … }
  …
}
```

and the list it consults first, at `:92-108`:

```js
const ALWAYS_ALLOWED = [
  /^\s*node\s+/, /^\s*npm\s+/, /^\s*npx\s+/, /^\s*python\s+/, /^\s*pip\s+/,
  /^\s*cargo\s+/, /^\s*ls\s*/, /^\s*cat\s+[^>|]+$/, /^\s*find\s+/,
  /^\s*grep\s+/, /^\s*head\s+/, /^\s*tail\s+/, /^\s*pwd\s*/, /^\s*cd\s+/,
  /^\s*echo\s+[^>]+$/
];
```

Every pattern is anchored with `^` to the start of the **whole command string**, never
to a segment. The allowlist is consulted **before** any write pattern. Therefore any
command whose first token is `cd`, `ls`, `pwd`, `find`, `grep`, `head`, `tail`, `node`,
`npm`, `npx`, `python`, `pip` or `cargo` never reaches the write gate at all.

Verified against the real hook:

```
echo evil > src/hooks/PreToolUse.Edit.js              DENY
cd . && echo evil > src/hooks/PreToolUse.Edit.js      ALLOW
ls; echo evil > src/lib/plan-coverage.js              ALLOW
node -e 'fs.writeFileSync("src/lib/plan-coverage.js","x")'  ALLOW
```

`cd . &&` is not an exotic evasion. It is the ordinary spelling an agent reaches for
when it wants to be sure of its working directory. **This is accident-class, not
attack-class**, which is what makes it urgent: the bypass is on the path of least
resistance rather than at the end of a deliberate one.

The scope of what it disables is the whole write-surface permission programme — the
self-grant fix, the link confinement, the approval binding — because all of it hangs off
the Edit channel and the Bash channel's own gate is the thing being skipped.

## What is decidable about a shell command's write targets, and what is not

This is the load-bearing part of the slice, and getting it wrong is worse than shipping
nothing: **a permission gate built on a wrong answer is more dangerous than no gate**,
because it converts "unknown" into a recorded "allowed".

A shell command is a program in a language with expansion, substitution, indirection and
run-time-determined control flow. "Which files does this command write" is undecidable
in general. What follows is the boundary this slice commits to.

### Decidable — a determinate literal write target

For a segment whose every relevant token is a **plain literal** (no `$`, no backtick, no
`*`, `?`, `[`, `{`, no leading `~`), the write target is readable from the shape:

| shape | target |
|---|---|
| `> path`, `>> path`, `N> path`, `&> path`, `>\| path` | `path` |
| `tee [-a] p1 p2 …` | every non-flag operand |
| `cp [flags] src… dest` / `mv [flags] src… dest` | the last operand |
| `touch p…` | every non-flag operand |
| `sed -i … p…` / `perl -i … p…` | every non-flag operand after the script |
| `dd of=path` | `path` |
| `truncate [flags] p…`, `install … dest`, `mkdir p…`, `ln … dest` | as shown |
| `curl -o path` / `--output path`, `wget -O path` | `path` |

The working directory is tracked across `cd`/`pushd` segments exactly as
`isLedgerWrite` at `:197-265` already does, because `cd src/lib && echo x > y.js` writes
`src/lib/y.js` and a gate that resolves it to `y.js` is checking the wrong file.

### Decidable — that the answer is unknown

A segment is **indeterminate** when a write shape is present but its target cannot be
read, or when a construct is present that makes the segment's effects unreadable:

- any token in a target position containing `$`, a backtick, `*`, `?`, `[`, `{`, or a
  leading `~` — expansion happens in the shell, not here;
- an interpreter: `node`, `deno`, `bun`, `python`, `ruby`, `perl`, `php`, `sh`, `bash`,
  `zsh`, `awk` — writes happen inside a program this gate cannot read;
- a script or task runner: `bash x.sh`, `npm run …`, `make`, `cargo`, `go build`,
  `gradle`, `mvn`, `dotnet`, `pip install` — the writes are determined at run time by
  content elsewhere;
- `xargs`, `find … -exec`, `parallel`, `eval` — the command is built from data;
- a heredoc (`<<`) — the payload is out of band;
- a `cd` whose operand is itself non-literal — every later segment's resolution is
  unanchored, so the whole remainder of the command is indeterminate.

### NOT decidable — that a command writes nothing

This is the boundary, stated plainly: **the recognized set is a denylist of write
shapes, and a denylist is never complete.** The classifier can honestly say "this
command definitely writes to P" and "this command's writes cannot be determined". It can
never soundly say "this command writes nothing". A binary that writes as a side effect
and appears in none of the tables above — a new interpreter, a code generator, an
installer, a formatter run in place, a compiler emitting artifacts — is classified
`none` and allowed.

Two further limits, named rather than hidden:

- **Segment boundaries inside quotes are wrong.** The classifier splits on `;`, `\n`,
  `&&`, `||`, `|` and `&` without tracking quoting, so `echo "a > b"` is read as a write
  to `b`. That is a false positive, which denies — the correct failing direction, and
  the same shape the current `command.includes(' > ')` at `:574` already has, so it is
  not a regression. The inverse (a real separator hidden from the splitter) is not
  reachable: quoting hides a separator from the *shell* too.
- **Windows.** The recognized set is the POSIX spelling plus `&`. PowerShell's
  `Out-File`, `Set-Content`, `Add-Content`, `Tee-Object` and `cmd.exe`'s `copy`/`move`
  are **not** recognized and classify as `none`. `path.posix` is used for all resolution
  because a command string carries POSIX-shaped paths even on Windows; a backslash path
  in a target position is normalized to forward slashes before resolution.

### The failing direction

`none` → allow. `writes:[…]` → the caller decides per target. `indeterminate` → the
caller decides, and this slice's caller does **not** yet deny on it (see below). Every
internal fault — a malformed token, an unexpected shape, an exception — resolves to
`indeterminate`, never to `none`. The module is written **return-never-throw**: it has
no `throw`, and its single top-level `try` returns `indeterminate` rather than
rethrowing, because `PreToolUse.Edit.js:493` demonstrates what a throw costs when the
catch above it fails open.

## The fix in this slice

Two changes, and deliberately not a third.

**1. A new module, `src/lib/shell-write-targets.js`,** implementing the classification
above as a pure function.

**2. `isWriteCommand` in `PreToolUse.Bash.js` is rebuilt on it.** The allowlist is
applied **per segment** rather than to the whole string, and it no longer short-circuits
the whole command: a command is a write command when **any** segment classifies as
`writes` or `indeterminate-with-a-write-shape`. `cd . && echo evil > src/x.js` reaches
the step gate.

**What this slice deliberately does not do:** it does not consult plan coverage, and it
does not deny an indeterminate command. Those are `00202`, which depends on this one.
The effect of this slice alone is that the Iron Loop **step** gate at `:749-763` — which
the shell channel loses entirely today — starts applying to the commands it was always
meant to cover. That is a real, independently valuable, independently testable
restoration, and it is the whole of the accident-class fix for cause (a).

## Implementation Details

### File: `src/lib/shell-write-targets.js`
**Action:** CREATE
**Purpose:** classify a shell command string into determinate write targets, an
indeterminate verdict, or no recognized write — with no I/O and no throw.

#### Exports

```js
/**
 * @param {string} command - a raw shell command string
 * @returns {{
 *   verdict: 'none'|'writes'|'indeterminate',
 *   targets: string[],       // POSIX-relative, cd-resolved; only when verdict === 'writes'
 *   reason: string|null      // why indeterminate, for the deny banner; never file contents
 * }}
 */
function classifyWrites(command)
```

```js
/**
 * Split a command into shell segments on `;`, newline, `&&`, `||`, `|`, `&`.
 * Quote-unaware by design — see the limit stated in the plan. Exported because the
 * Bash hook applies its allowlist per segment.
 * @param {string} command
 * @returns {string[]}
 */
function splitSegments(command)
```

```js
/**
 * Resolve one literal token against an accumulated `cd` prefix, or return null when
 * the token is non-literal (expansion / glob / tilde) and therefore unresolvable.
 * @param {string} prefix
 * @param {string} token
 * @returns {string|null}
 */
function resolveTarget(prefix, token)
```

`module.exports = { classifyWrites, splitSegments, resolveTarget }`.

#### Behaviour notes

- `classifyWrites` walks segments in order, maintaining the `cd` prefix. A `cd` with a
  non-literal operand sets an `unanchored` flag; from that point every later segment
  carrying a write shape is `indeterminate` with reason `working directory unknown`.
- Precedence when a command yields several verdicts: `indeterminate` outranks `writes`
  outranks `none`. A command that writes one determinate target *and* runs an
  interpreter is `indeterminate` — the determinate half is not a licence for the opaque
  half. `targets` is still returned in that case (it is true information), but the
  verdict is the conservative one.
- Every regex is a **literal, linear-time** pattern with no nested quantifier and no
  data-derived `RegExp`, matching the constraint `PreToolUse.Bash.js:110-115` already
  imposes on itself. The command string is attacker-influenced and this runs on every
  Bash call.
- Bounded work: a command longer than 64 KiB, or with more than 256 segments, returns
  `indeterminate` with reason `command too large to analyse` rather than being scanned.
  An unbounded scan on attacker-sized input is the shape this repository already fences.
- `reason` carries a fixed vocabulary only — `interpreter`, `task runner`,
  `command substitution`, `glob or variable in a write target`, `heredoc`,
  `working directory unknown`, `command too large to analyse`. It never carries the
  command text, which may contain a secret and will be written to a log by `00202`.

### File: `src/hooks/PreToolUse.Bash.js`
**Action:** MODIFY — `isWriteCommand` only, plus one `require`

```js
const shellWrites = require('../lib/shell-write-targets');
```

A **literal, first-party** require, loaded eagerly and NOT fail-soft: without it this
gate cannot decide, and a silent degradation to the old allow-everything behaviour is
the defect. A load failure crashes the hook, which the outer catch at `:775-778` turns
into `exit(1)`.

```js
/**
 * Is this a file-writing command that the Iron Loop step gate must judge?
 *
 * PER SEGMENT (the cd-prefix bypass). The old form tested a whole-string-anchored
 * ALWAYS_ALLOWED list FIRST and returned false on a match, so any command whose FIRST
 * token was cd/ls/node/npm/find/… never reached the write patterns at all:
 * `cd . && echo evil > src/lib/plan-coverage.js` was ALLOWED. The allowlist now
 * applies to the segment it describes, and a benign segment can no longer vouch for
 * the one after it.
 *
 * INDETERMINATE counts as a write here: a command whose targets cannot be read has not
 * been shown to be harmless, and the step gate is the weaker of the two consequences.
 */
function isWriteCommand(command) {
  if (!command) return false;
  const result = shellWrites.classifyWrites(command);
  if (result.verdict === 'none') return false;
  // A segment that is entirely covered by ALWAYS_ALLOWED and carries no write shape
  // was already 'none'; reaching here means a real write shape or an unreadable one.
  return true;
}
```

`ALWAYS_ALLOWED` stays in the file **and stays used**: `classifyWrites` is the write
decision, and the allowlist's remaining job is to keep a pure-read segment from being
mis-read — it is applied inside the per-segment walk via `splitSegments`, not to the
whole string. Step 9 must confirm by reading whether any other function in the file
consumes `ALWAYS_ALLOWED`; if nothing does after this change, **delete it** rather than
leave a dead table that reads like a live policy.

Nothing else in the file changes. `isLedgerForgery`, `isIrreversibleCommand`, the
plan-move gate and `isCommitCommand` keep their own segmenters; unifying them is
tempting and is not this slice — three call sites, three sets of pinned tests, and a
refactor riding along with a security fix is how a security fix gets reverted.

### File: `tests/shell-write-targets.test.js`
**Action:** CREATE — `node:test`

Unit cases against `classifyWrites`:

| # | Input | Expected |
|---|---|---|
| 1 | `echo evil > src/x.js` | `writes`, `['src/x.js']` |
| 2 | **`cd . && echo evil > src/x.js`** | `writes`, `['src/x.js']` — the defect |
| 3 | **`ls; echo evil > src/x.js`** | `writes`, `['src/x.js']` — the defect |
| 4 | **`cd src/lib && echo x > y.js`** | `writes`, `['src/lib/y.js']` — cd-resolved, not `y.js` |
| 5 | `cd src && cd ../tests && touch a.js` | `writes`, `['tests/a.js']` |
| 6 | `cp a.js src/lib/b.js` | `writes`, `['src/lib/b.js']` |
| 7 | `mv -f a b/c.js` | `writes`, `['b/c.js']` |
| 8 | `tee -a src/x.js < in` | `writes`, `['src/x.js']` |
| 9 | `sed -i 's/a/b/' src/x.js` | `writes`, `['src/x.js']` |
| 10 | `dd of=src/x.js if=/dev/zero` | `writes`, `['src/x.js']` |
| 11 | `curl -o src/x.js https://e` | `writes`, `['src/x.js']` |
| 12 | **`node -e 'fs.writeFileSync("src/x.js","x")'`** | `indeterminate`, reason `interpreter` — the defect |
| 13 | `python3 script.py` | `indeterminate`, `interpreter` |
| 14 | `npm run build` | `indeterminate`, `task runner` |
| 15 | `echo x > $TARGET` | `indeterminate`, `glob or variable in a write target` |
| 16 | ``echo x > `f` `` | `indeterminate`, `command substitution` |
| 17 | `echo x > src/*.js` | `indeterminate`, `glob or variable in a write target` |
| 18 | `cat <<EOF > src/x.js` | `indeterminate`, `heredoc` |
| 19 | `cd $D && echo x > y.js` | `indeterminate`, `working directory unknown` |
| 20 | `find . -name '*.js' -exec sed -i s/a/b/ {} \;` | `indeterminate` |
| 21 | `echo x > a.js && node -e 'y'` | `indeterminate`, and `targets` still contains `a.js` |
| 22 | `ls -la` | `none` |
| 23 | `grep -rn foo src/` | `none` |
| 24 | `git status` | `none` |
| 25 | `cat src/x.js` | `none` |
| 26 | `''` and `null` and `42` | `none`, no throw |
| 27 | a 100 KiB command | `indeterminate`, `command too large to analyse`, returns in under 100 ms |
| 28 | a 5000-`&&` command | `indeterminate` or a bounded result, no exponential time — assert wall time under 100 ms |
| 29 | **known false positive, asserted deliberately** | `echo "a > b"` → `writes`, `['b']`. Asserted so the limit is recorded in the suite rather than discovered later |
| 30 | backslash target | `echo x > src\\lib\\y.js` → `writes`, `['src/lib/y.js']` |
| 31 | `2> src/x.js` and `&> src/x.js` and `>| src/x.js` | `writes` in all three |
| 32 | never throws | run every case above through a wrapper asserting no exception, plus adversarial inputs: unbalanced quotes, a lone `>`, `cd` with no operand, `cp` with one operand |

Integration cases against the **real spawned hook** — the strongest available test,
matching how `tests/ledger-forgery-closed.test.js` already drives this file:

| # | Setup | Assertion |
|---|---|---|
| 33 | state at step 3, command `cd . && echo evil > src/x.js` | the spawned hook emits `permissionDecision:"deny"` — **RED today** |
| 34 | state at step 3, command `ls; echo evil > src/x.js` | deny — **RED today** |
| 35 | state at step 3, command `ls -la` | exit 0, no deny JSON on stdout |
| 36 | state at step 10, command `cd . && echo x > src/x.js` | **allowed** — this slice restores the step gate only; coverage is `00202`. Asserting the allow here records the honest scope |
| 37 | every `node -e` recipe quoted verbatim from `src/commands/menu.md` | still allowed at its normal step — a false positive that breaks a menu recipe is a CRITICAL regression, stated at `:22-23` |

Case 37 must read `src/commands/menu.md` **from disk** and extract the recipes, exactly
as the existing ledger-forgery test does, rather than hard-coding a copy that drifts.

Fixtures under `os.tmpdir()`, `path.join` throughout, teardown with
`fs.promises.rm(root, { recursive: true, force: true })`. State fixtures must be written
through `state-manager.saveState` so they are correctly signed — a hand-written state
file will be rejected once `00205` lands, and a test that depends on the current
acceptance of unsigned state would break that slice.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `classifyWrites` | `isWriteCommand` at `PreToolUse.Bash.js:749` | the registered `PreToolUse` hook, matcher `Bash` |
| `splitSegments` | the per-segment allowlist walk inside `isWriteCommand` | same |
| `resolveTarget` | `classifyWrites` internally, and `00202`'s coverage lookup | same |

`isWriteCommand` is called on every Bash tool call in `main()`. The module is live from
the moment it exists; nothing here is reachable only from a test.

## Test Plan

Covered by `tests/shell-write-targets.test.js`. Cases 2, 3, 12, 33 and 34 are the
defect. Cases 22-25, 35 and 37 are the guards against the fix becoming "every command is
a write", which would make the gate useless within a day of being installed. Case 29 and
case 36 record limits in the suite so a future reader finds them without re-deriving them.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the file in full and run only it. Cases 2, 3, 4, 12-21, 27-31, 33 and 34 must be
RED. Record case 2's and case 12's red verbatim — an ALLOW on `cd . && echo evil >`
is the sentence that justifies this slice, and it must be captured from the **spawned**
hook, not the unit function.

### Step 9: PREPARE
Read from disk: `PreToolUse.Bash.js` in full (it is 779 lines and the ledger logic at
`:197-265` is the reference implementation of cd-tracking to mirror), `src/commands/menu.md`
for the recipes case 37 must not break, `tests/ledger-forgery-closed.test.js` for the
spawn harness to reuse, and `src/lib/regex-utils.js` for the repository's linear-time
regex conventions. Grep for every consumer of `ALWAYS_ALLOWED` and `isWriteCommand`.
**Where the code disagrees with this plan, THE CODE WINS.**

### Step 10: IMPLEMENT
- `src/lib/shell-write-targets.js` — the classifier.
- `src/hooks/PreToolUse.Bash.js` — `isWriteCommand` rebuilt; `ALWAYS_ALLOWED` applied
  per segment or deleted if nothing consumes it.
- `tests/shell-write-targets.test.js` — the thirty-seven cases.

### Step 11: REVIEW
Confirm no path returns `none` after observing a write shape. Confirm the module has no
`throw` and no `fs`/`child_process` import. Confirm every fault path returns
`indeterminate` — the deny-ward value — by reading each `catch` and each early return.
Confirm the reason vocabulary is fixed and carries no command text.

### Step 12: OPTIMIZE
One pass over the segments, one pass over each segment's tokens. Assert the wall-clock
bound from cases 27 and 28 rather than reasoning about it: this runs on every Bash call
and a slow gate is a gate someone turns off.

### Step 13: SECURE
Re-attack the classifier as an adversary who has read it: try to construct a command
that writes a file and classifies `none`. Every success is either added to the
recognized set or **written into "What this plan does NOT fix" verbatim**. Confirm no
`RegExp` is built from the command string. Confirm the 64 KiB and 256-segment bounds
hold on adversarial input.

### Step 14: VERIFY
`node --test` on the new file plus every existing test that spawns `PreToolUse.Bash.js`
(`tests/ledger-forgery-closed.test.js` and siblings), then the full gated run `npm test`.
Lint at `--max-warnings 0`. Run `src/lib/false-green-scan.js` against the new module and
confirm it adds nothing to `.ctoc/false-green-baseline.json` — a classifier whose
no-match default is the permissive value is precisely the `parse-default` signature that
file exists to fence. No git operations. **Report how many commands in the repository's
own recipes and scripts change classification — that is the blast radius.**

### Step 15: DOCUMENT
Add to `CLAUDE.md`'s enforcement section: the Bash channel classifies a command's write
targets, the allowlist is per segment, and the honest boundary (determinate targets,
indeterminate, and the fact that "writes nothing" is not soundly decidable). Update the
documented module and test counts from the live counts on disk.

### Step 16: FINAL-REVIEW
Report every Step 8 red verbatim, every Step 13 re-attack that succeeded, the blast
radius from Step 14, and every decision taken under ambiguity.

## What this plan does NOT fix

- It does **not** check plan coverage. A command at step 8 or later still writes any file
  it likes through the shell. That is `00202`, which depends on this slice.
- It does **not** deny an indeterminate command. `node -e '…'` at step 10 is still
  allowed; this slice only makes it visible to the step gate. `00202` decides the deny.
- It does **not** log its decisions. The Bash channel still records nothing. `00202`.
- It **cannot** decide that a command writes nothing. The recognized set is a denylist
  and a denylist is never complete. Any binary that writes as a side effect without
  appearing in the tables above is classified `none`.
- It does **not** understand quoting. `echo "a > b"` is read as a write to `b` (case 29).
  The failing direction is toward deny.
- It does **not** cover PowerShell or `cmd.exe` write forms — `Out-File`, `Set-Content`,
  `Add-Content`, `Tee-Object`, `copy`, `move`. Windows commands using them classify
  `none`.
- It does **not** unify the three other segmenters in `PreToolUse.Bash.js`.
- It does **not** raise the ceiling the owner already stated: against an agent with an
  unrestricted shell running as the same user, no in-process text gate is sound. This
  closes the accidental path and names what stays open.

## Decisions Taken Under Ambiguity

1. **A three-valued verdict, not a boolean.** A boolean forces "unknown" into one of the
   two answers, and whichever way it is forced, the gate lies. The whole value of this
   slice is that `indeterminate` is sayable.
2. **`indeterminate` counts as a write for the step gate.** A command that has not been
   shown to be harmless is treated as a write. The consequence here is only the step
   gate, whose cost when wrong is "wait until step 8" — cheap enough that the
   conservative call is affordable.
3. **`indeterminate` outranks `writes` when both appear.** Otherwise a command could
   launder an opaque half behind a determinate one, and the caller would check coverage
   on the visible target while the invisible one wrote anywhere.
4. **The `cd` prefix is tracked.** Not tracking it would mean checking coverage on the
   wrong path in `00202` — a gate that authoritatively clears the wrong file, which is
   the "worse than none" case.
5. **Segmentation is quote-unaware.** A correct shell parser is a large dependency and a
   large attack surface, and the failure it prevents (a false-positive deny on
   `echo "a > b"`) fails in the safe direction. Recorded as case 29 so it is visible.
6. **The module is return-never-throw with no top-level rethrow.** `PreToolUse.Edit.js`
   demonstrates the cost: a throw reaching a fail-open catch becomes an allow.
7. **Coverage and logging are split into `00202`.** This slice is already three files
   with a new pure module and a hook rewrite. Splitting keeps each pass reviewable and
   means a crash mid-build loses one slice, not the set.
8. **The eager, non-fail-soft require is deliberate.** The four fail-soft requires in
   `PreToolUse.Edit.js:49-56` degrade enforcement silently when a module is missing.
   Here, silent degradation restores the exact defect being fixed, so a load failure must
   be loud.
9. **`ALWAYS_ALLOWED` is kept per segment rather than deleted outright.** Deleting it
   entirely risks re-classifying benign read commands the existing suite pins. If Step 9
   finds no live consumer after the rewrite, it is deleted then — with evidence rather
   than in advance.
10. **The bound is 64 KiB and 256 segments.** A gate that scans unbounded
    attacker-controlled input is a denial-of-service against the session, and an
    unbounded capture is one of the five false-green signatures this repository fences.
    Over-bound input fails toward `indeterminate`, never toward `none`.

## Decisions Taken During Implementation

1. **`patch` classifies as a write (`indeterminate`), reversing the plan's table
   omission — the existing real-hook contract wins.** The plan's determinate table did
   not list `patch`, but `tests/security-bash-hook.test.js` (which spawns the REAL
   hook) requires `patch -p1 < changes.patch` to BLOCK at a planning step. Step 9's rule
   is "where the code disagrees with the plan, the code wins." `patch`'s write targets
   live in the diff data, not on the command line, so `indeterminate` (reason `write
   target could not be read`) is the honest, block-ward verdict.
2. **The reason enum was extended by two command-text-free words beyond the plan's
   seven:** `write target could not be read` (an empty/missing redirect target such as
   `zz >`, a `cp`/`mv` with one operand, and `patch`) and `analysis fault` (the
   return-never-throw backstop). The plan's security-critical invariant — a reason NEVER
   carries command text (a command may hold a secret) — is preserved, and the enum stays
   closed. The alternative (forcing these into `task runner`) would be dishonest to the
   human reading `00202`'s deny banner.
3. **Both `ALWAYS_ALLOWED` and `WRITE_PATTERNS` were DELETED, not kept per segment
   (resolving Decision 9 with Step 9 evidence).** After the rebuild `isWriteCommand`
   calls only `classifyWrites`, which subsumes read-detection: every read command the
   existing suite pins (`ls`, `cat`, `grep`, `git status/log/diff`, `head`, `tail`,
   `pwd`, `find` without `-exec`) classifies `none`. Grep found no other consumer of
   either array, so keeping either would be dead code AND an eslint `no-unused-vars`
   error. The comments that named the deleted symbols were reworded to historical
   phrasing; no enforcement code (ledger-forgery, irreversible net, commit/plan-move
   gates) was touched.
4. **`perl` and `awk` classify as interpreters (`indeterminate`), not determinate
   in-place edits.** The plan's determinate table lists `perl -i`, but reading perl's
   write targets reliably past the `-e`/`-pe`/`-i.bak` forms is error-prone, no
   acceptance test pins perl's targets, and `indeterminate` still blocks (satisfying the
   security test's `perl -i -pe s/a/b/ f` block). `awk -i inplace` writes content
   determined by the awk program, so `interpreter` is honest. `sed -i` IS handled
   determinately (case 9 pins its targets and sed's operand grammar is simple).
5. **`splitSegments` was made clobber-redirect aware.** A single `|` immediately
   preceded by `>` is the `>|` clobber redirect, not a pipe, so it is not a split point
   (negative lookbehind). Without this, `>| src/x.js` (plan case 31) split into `>` and
   `src/x.js` and lost the target.
6. **The classifier's `token` variables were renamed (`spec`, `target`).** The eslint
   rule `security/detect-possible-timing-attacks` false-flags a variable named `token`
   (a shell command token is not a cryptographic token). Behaviour and the positional
   `resolveTarget(prefix, …)` signature are unchanged; "warnings are bugs" required a
   clean lint.
7. **SURFACED RISK for review / `00202` (not a build blocker — no acceptance criterion
   fails).** Because interpreters now classify `indeterminate` and `isWriteCommand`
   returns true for `indeterminate` (the plan's explicit "makes it visible to the step
   gate" doctrine, case 12), a benign `node -e` menu recipe run with **no active
   feature** now hits `main()`'s existing "no feature context" write-gate block —
   verified empirically: at no state and at state-with-`feature:null` the recipe is
   DENIED, where `ALWAYS_ALLOWED` previously waved it through. No existing test exercises
   this path (the menu recipes are pinned only at step 10 + feature, case 37, where they
   remain allowed), and the plan scopes the indeterminate deny/allow decision to
   `00202`. The natural fix lives in `00202` (distinguish an indeterminate-with-no-
   write-shape bare interpreter from an indeterminate write shape, or exempt the
   sanctioned menu recipes). Flagged so the human decides rather than discovering it.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
