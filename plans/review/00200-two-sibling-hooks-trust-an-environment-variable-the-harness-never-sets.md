---
iron_loop_verdict: true
title: "Two sibling hooks trust an environment variable the harness never sets — the fix applied to one of three is applied to all three, and the divergence is fenced"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/hooks/PreToolUse.Edit.js"
  - "src/hooks/guard-files.js"
  - "tests/hook-payload-single-source.test.js"
approved_by: human
approved_at: 2026-07-28T23:27:25.958Z
gate_crossed: implementation → todo
---

# Two sibling hooks trust an environment variable the harness never sets

## The defect, read on disk

`src/hooks/PreToolUse.Bash.js:49-53` records the lesson in its own header:

> INPUT (W01-s2, finding C2): the PreToolUse payload arrives on STDIN (fd 0) as
> JSON … The hook does **NOT** read `process.env.CLAUDE_TOOL_INPUT` (the harness
> never sets it; reading it made the gate see an empty command and allow everything).

That lesson was applied to exactly one of the three hooks that had it. The other two
still read the variable, and both read it **first**.

`src/hooks/PreToolUse.Edit.js:220-236`:

```js
function getTargetFile(stdinJson) {
  const fromEnv = process.env.CLAUDE_TOOL_INPUT || '';
  try {
    const parsed = JSON.parse(fromEnv);
    if (parsed.file_path) return parsed.file_path;      // returns BEFORE stdin is consulted
    if (parsed.path) return parsed.path;
    if (parsed.notebook_path) return parsed.notebook_path;
  } catch { /* fall through */ }

  if (stdinJson && stdinJson.tool_input) { … }
  const m = fromEnv.match(/file_path['":\s]+["']?([^"'\s,}]+)/);
  return m ? m[1] : null;
}
```

`src/hooks/guard-files.js:91-109`:

```js
const fromEnv = process.env.CLAUDE_TOOL_INPUT || '';
try {
  filePath = parsed.file_path || parsed.path || parsed.notebook_path || '';
  command  = parsed.command || '';
} catch { /* fall through to stdin */ }

if ((!filePath && !command) && stdinJson && stdinJson.tool_input) { … }
```

The guard-files form is the more subtle of the two: stdin is consulted **only when the
environment produced neither a path nor a command**, so a single non-empty field from
the environment discards the real payload entirely.

### What it buys an attacker

`getTargetFile` is the sole input to every decision `enforce()` makes. Set
`CLAUDE_TOOL_INPUT` to `{"file_path":"VERSION"}` and:

- `isProtectedLedgerPath("VERSION")` → false;
- `isProtectedVerifyPath("VERSION")` → false;
- `isWhitelisted("VERSION")` → **true** (`/^VERSION$/`) → `allow('whitelist', …)` at
  `:450-452`.

The real Edit lands on whatever the stdin payload actually named. The allow happens
**before** the ledger guard has seen the real target, before project detection, before
`findCoveringPlan`, before the escape-phrase check. Every protection this file provides
resolves against a decoy. `.ctoc/state/verify/<slug>.json` and `.ctoc/approvals/` — the
two stores whose whole purpose is being unforgeable by an agent — are reachable this way.

For guard-files the same setting makes `isSecretTarget` evaluate `"VERSION "` and
return false, so the secret-file guard passes on a `Read` of `.env`.

An environment variable is not an exotic channel. Any process in the session's
environment sets it, and it survives into every spawned hook.

## The fix

**One payload source: stdin.** Delete the environment read from both files. The
payload transport is the Claude Code PreToolUse JSON on fd 0, which both files already
read, and which `PreToolUse.Bash.js` already treats as the only source.

`PreToolUse.Edit.js:getTargetFile` becomes stdin-only, and the trailing best-effort
regex over `fromEnv` goes with it — it was a second read of the same untrusted string
and matches `file_path` out of arbitrary text.

`guard-files.js:getTarget` becomes stdin-only. The `(!filePath && !command)` guard
disappears with the branch it guarded.

### The divergence fence

The reason this defect exists is that a one-file fix in a family of three siblings has
nothing that notices the other two. `tests/hook-payload-single-source.test.js` reads
**every file under `src/hooks/`** from disk and fails if any of them contains the string
`CLAUDE_TOOL_INPUT` outside a comment. A new hook written next year that reaches for the
variable fails the suite the day it is written, which is the only place this can be
caught cheaply.

The check is a source scan, not a behavioural one, and that is deliberate: the
behavioural test (below) proves the two hooks are fixed **today**; the source scan is
what makes the fix hold for a file that does not exist yet.

### The installation secret joins the secret patterns

`src/lib/crypto.js:14` places the HMAC key that signs all Iron Loop state at
`~/.ctoc/.secret`. `guard-files.js:PROTECTED_PATTERNS` covers `.env`, `credentials`,
`id_rsa`, `*.pem`, `*.key`, `.aws/`, `.ssh/`, `.kube/config`, `secrets.*` and token
files — and does not cover this one. A `Read` of the file that signs state is allowed
today.

One literal pattern is added in the same function of the same file:

```js
/(^|[/\\])\.secret\b/i,
```

This is merged into this slice rather than given its own, because a separate slice would
mean a second executor pass over `guard-files.js` for one array entry — the sizing rule
says merge. It is called out separately in Step 16 so it is reviewed as its own change.

## Implementation Details

### File: `src/hooks/PreToolUse.Edit.js`
**Action:** MODIFY — `getTargetFile` only

```js
/**
 * Extract the tool-call target from the PreToolUse payload.
 *
 * STDIN IS THE ONLY SOURCE. `process.env.CLAUDE_TOOL_INPUT` is NOT read: the harness
 * never sets it, and reading it first let any process in the session substitute a
 * decoy path — `{"file_path":"VERSION"}` resolved to the whitelist allow at :450
 * while the real Edit landed elsewhere, defeating the ledger guard, the verify-evidence
 * guard and plan coverage in one line. PreToolUse.Bash.js records the same lesson at
 * :49-53; this file is the second of the three siblings to apply it.
 */
function getTargetFile(stdinJson) {
  if (stdinJson && stdinJson.tool_input) {
    return stdinJson.tool_input.file_path
      || stdinJson.tool_input.path
      || stdinJson.tool_input.notebook_path
      || null;
  }
  return null;
}
```

Returning `null` when the payload is absent is the **existing** behaviour for a payload
with no recognized key, and `enforce()` already handles a null target: it skips the two
protected-path guards and the whitelist, reaches the coverage check with
`coverage && targetFile` false, and falls through to `block(...)` at `:490`. Null is
therefore fail-closed today, and this change does not alter that. Confirm it at Step 9
by reading the branch rather than trusting this paragraph.

`module.exports` is unchanged — `getTargetFile` stays exported.

### File: `src/hooks/guard-files.js`
**Action:** MODIFY — `getTarget`, plus one entry in `PROTECTED_PATTERNS`

```js
function getTarget(stdinJson) {
  const ti = (stdinJson && stdinJson.tool_input) || null;
  if (!ti) return '';
  return `${ti.file_path || ti.path || ti.notebook_path || ''} ${ti.command || ''}`;
}
```

The returned shape stays `"<path> <command>"` so `isSecretTarget` is untouched. An
absent payload returns `''`, and `isSecretTarget('')` returns false → allow. That is the
pre-existing fail-open on a missing payload for this hook; **this slice does not change
it** and says so in "What this plan does NOT fix" rather than smuggling a second
behavioural change in behind a defect fix.

Add to `PROTECTED_PATTERNS`, with a comment naming what it protects:

```js
// The Iron Loop signing key (src/lib/crypto.js:14 → ~/.ctoc/.secret). With it, any
// state file can be signed by hand, and state drives the Bash hook's write and commit
// gates. Anchored to a path-segment start so `mysecret.js` does not match.
/(^|[/\\])\.secret\b/i,
```

`module.exports` is unchanged.

### File: `tests/hook-payload-single-source.test.js`
**Action:** CREATE — `node:test`

| # | Case | Assertion |
|---|---|---|
| 1 | Edit: the environment cannot substitute a target | set `process.env.CLAUDE_TOOL_INPUT` to `{"file_path":"VERSION"}`, call `getTargetFile({tool_input:{file_path:'src/lib/plan-coverage.js'}})` → returns the **stdin** path |
| 2 | Edit: the environment alone yields nothing | env set, `getTargetFile(null)` → `null` |
| 3 | Edit: the regex fallback is gone | env set to prose containing `file_path: "x"`, `getTargetFile(null)` → `null` |
| 4 | Edit: notebook and `path` keys still resolve from stdin | three payload shapes → three paths |
| 5 | **the decoy no longer reaches the whitelist allow** | env set to `{"file_path":"VERSION"}`, target from a stdin payload naming `.ctoc/approvals/x.json` → `isProtectedLedgerPath(getTargetFile(payload))` is **true**. This is the defect measured end to end at the guard it defeated |
| 6 | guard-files: the environment cannot substitute a target | env set to `{"file_path":"README.md"}`, `getTarget({tool_input:{file_path:'.env'}})` contains `.env` |
| 7 | guard-files: the environment cannot mask a command | env set to `{"command":"ls"}`, stdin command `cat .env` → the returned target contains `cat .env` |
| 8 | guard-files: absent payload | `getTarget(null)` → `''` |
| 9 | **the installation secret is a secret target** | `isSecretTarget('/home/u/.ctoc/.secret')` and `isSecretTarget('cat ~/.ctoc/.secret')` → true |
| 10 | the secret pattern does not over-match | `isSecretTarget('src/lib/mysecret.js')` and `isSecretTarget('src/secretly.js')` → false |
| 11 | Windows separators | `isSecretTarget('C:\\Users\\u\\.ctoc\\.secret')` → true (backslashes are normalized at `:72`) |
| 12 | **the divergence fence** | read every `*.js` under `src/hooks/`; for each, strip `//` and `/* */` comments; assert none contains `CLAUDE_TOOL_INPUT`. Failure message names the offending file and line |

Case 12 must strip comments, because `PreToolUse.Bash.js:51` mentions the variable in
prose deliberately and that mention is the documentation of the rule — a test that
forced its deletion would delete the reason the rule exists.

`getTarget` is not currently exported from `guard-files.js`; cases 6-8 require it.
Add it to `module.exports` alongside `isSecretTarget`. Note the reachability rule: the
export is not a new live surface, it is a second view of a function `main()` already
calls in the same file, so the file's live call site is unchanged.

Restore `process.env.CLAUDE_TOOL_INPUT` to its prior value in a `finally` in every case
that sets it, so no case leaks state into the next.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `getTargetFile` | `enforce()` at `PreToolUse.Edit.js:423` | the registered `PreToolUse` hook on Edit/Write/MultiEdit/NotebookEdit |
| `getTarget` | `main()` at `guard-files.js:114` | the registered `PreToolUse` hook, matcher `Read\|Edit\|Write\|Bash` |
| the `.secret` pattern | `isSecretTarget` at `guard-files.js:116` | same |

Every change is inside a function the registered hook already calls on every matching
tool call. Nothing here is reachable only from a test.

## Test Plan

Covered by `tests/hook-payload-single-source.test.js`. Cases 1, 3, 5, 6, 7 and 9 are the
defects; cases 4, 8 and 10 are the guards that stop the fix from becoming "the hooks
resolve nothing".

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the file in full and run only it. Cases 1, 3, 5, 6, 7, 9 and 11 must be RED, and
case 12 must be RED naming both files. Record case 5's red verbatim: a ledger path that
does not register as protected is the sentence that justifies this slice.

### Step 9: PREPARE
Read from disk: `PreToolUse.Edit.js:213-236` and `:419-498` (confirm the null-target
path through `enforce` genuinely reaches `block`), `guard-files.js:84-136`,
`PreToolUse.Bash.js:49-53`, `src/lib/crypto.js:1-40`. Grep the whole repository for
other callers of `getTargetFile` — `PreToolUse.Write.js` delegates into `enforce` and
must be re-read to confirm it passes a real parsed payload. **Where the code disagrees
with this plan, THE CODE WINS.**

### Step 10: IMPLEMENT
- `src/hooks/PreToolUse.Edit.js` — `getTargetFile` stdin-only; the regex fallback deleted.
- `src/hooks/guard-files.js` — `getTarget` stdin-only; `getTarget` exported; the
  `.secret` pattern added.
- `tests/hook-payload-single-source.test.js` — the twelve cases.

### Step 11: REVIEW
Confirm no path in either file reads `process.env`. Confirm the Edit hook's null-target
behaviour is unchanged by reading `enforce` end to end rather than reasoning about it.
Confirm no existing test asserted the environment-first order; if one does, the CODE is
right and the test is corrected toward the real behaviour, **never loosened**.

### Step 12: OPTIMIZE
Two branches removed and one regex deleted from the per-tool-call path. Nothing added.

### Step 13: SECURE
Confirm the new pattern cannot be turned into a denial-of-service: it is a literal
RegExp with no nested quantifier and no data-derived construction, matching the
constraint stated at `guard-files.js:22-24`. Confirm the block banner does not echo the
matched path back into the transcript beyond what it already prints.

### Step 14: VERIFY
`node --test` on the new file plus every existing test touching either hook
(`tests/*enforcement*`, `tests/*guard-files*`, `tests/*hook*`), then the full gated run
`npm test`. Lint at `--max-warnings 0`. No git operations. **Report whether any existing
test relied on the environment variable — that is the blast radius and must be measured,
not assumed.**

### Step 15: DOCUMENT
Add one line to the enforcement section of `CLAUDE.md`: the PreToolUse payload arrives on
stdin only, and no hook reads `CLAUDE_TOOL_INPUT`. Update the documented test-file count
in both places from the live count on disk.

### Step 16: FINAL-REVIEW
Report every Step 8 red verbatim, the blast radius from Step 14, the `.secret` pattern
as its own reviewed change, and every decision taken under ambiguity.

## What this plan does NOT fix

- It does **not** change guard-files' fail-open on an absent or unreadable payload. A
  missing payload still yields `''` and allows. That is a real residual and it is stated
  rather than fixed here, because changing it is a behavioural change to a hook with
  matcher `Read|Edit|Write|Bash` — the widest blast radius in the repository — and it
  belongs in its own slice with its own evidence.
- It does **not** change `PreToolUse.Edit.js`'s outer `catch` that fails OPEN at `:493`.
  A throw anywhere in `enforce` still allows the edit. The two protected-path checks are
  already written return-never-throw for exactly that reason; nothing new is added that
  can throw.
- It does **not** protect the installation secret from being written, only from being
  read through a guarded tool. `~/.ctoc/.secret` sits outside the project root, so plan
  coverage never applied to it and does not now.
- It does **not** address the state file that the secret signs. That is `00205`.
- It does **not** unify the three hooks' payload readers into one module. Three
  independent readers remain; the source-scan fence is what keeps them honest.

## Decisions Taken Under Ambiguity

1. **Delete the environment read rather than rank stdin above it.** Preferring stdin and
   falling back to the environment would leave the decoy live whenever the payload is
   absent or malformed — which is precisely the condition an attacker can arrange. A
   fallback to an attacker-controlled source is not a fallback.
2. **The regex fallback goes with it.** It read the same untrusted string and matched
   `file_path` out of arbitrary text; keeping it would preserve the defect in a less
   obvious spelling.
3. **The divergence fence is a source scan, not a behavioural test.** No behavioural
   test can cover a hook file that has not been written yet, and "a one-file fix in a
   three-file family" is the exact failure being repaired. The scan strips comments so
   the Bash hook's documentation of the rule survives.
4. **The `.secret` pattern is merged into this slice.** A separate slice would be a
   second executor pass over one file for one array entry. It is reviewed separately at
   Step 16 so merging does not hide it.
5. **`.secret` is anchored to a path-segment start.** An unanchored `secret` would match
   `src/lib/secrets-scanner.js` and block reads of CTOC's own source, turning a security
   guard into an obstacle — which gets guards disabled.
6. **guard-files' fail-open on an absent payload is preserved deliberately.** Fixing it
   is correct and is not this slice: this hook matches four tools including every `Read`,
   so a wrong call there stops all work. It is named as an open residual instead.
7. **`getTarget` is newly exported.** Testing it through the spawned process would mean
   asserting on an allow, which is an absence — an unobservable pass. The export is a
   second view of an already-live function, not new machinery.

## Decisions Taken During Implementation

1. **Scope held to the two files with the defect.** Only `PreToolUse.Edit.js`
   (`getTargetFile`) and `guard-files.js` (`getTarget`) contained the env read in CODE.
   `PreToolUse.Write.js`, `PreToolUse.MultiEdit.js` and `PreToolUse.NotebookEdit.js`
   delegate to the exported `enforce()` and never reimplement the reader, so they needed
   NO source change. `PreToolUse.Bash.js` names the variable only in a comment (already
   stdin-only). No sibling-hook scope fork arose.
2. **Blast radius corrected toward the new contract (Rule 4).** Eight existing cases
   asserted the removed env-first behavior and went RED:
   - `tests/pretooluse-edit-coverage.test.js` — 4 cases in the `getTargetFile` block
     (env-first read, env `.path`/`.notebook_path`, env-wins-over-stdin precedence, the
     regex fallback). Each rewritten to assert the env is IGNORED and stdin is the sole
     source. Justification: they asserted the defect; the contract changed to stdin-only.
   - `tests/guard-files-coverage.test.js` — the env-only secret case, the two env-operand
     cases, and `should_NOT_consult_stdin_when_env_supplies_a_command`. Rewritten so the
     env decoy is proven IGNORED and the stdin target is always read. Stale comments
     (JSON.parse-of-env, "env may override") corrected. The two env-operand cases were
     re-pointed at stdin so the 2nd/3rd `||` operands of `getTarget` stay covered.
   No assertion was weakened; every rewrite tightens toward "the env cannot substitute a
   target." No other test in the enforcement/security surface (487 tests across the hook,
   ledger, verify-evidence, whitelist, link-confinement, e2e and parity suites) changed
   behavior.
3. **The `.secret` pattern is a literal, ReDoS-safe RegExp** `/(^|[/\\])\.secret\b/i` —
   anchored to a path-segment start (so `mysecret.js`/`secretly.js` do not match), no
   nested quantifier, no data-derived construction. Reviewed as its own change per the
   plan.
4. **False-green baseline TIGHTENED, not loosened.** Deleting the two
   `try { JSON.parse(env) } catch {}` blocks removed two `silent-catch` findings
   (`guard-files.js:silent-catch:getTarget`, `PreToolUse.Edit.js:silent-catch:getTargetFile`).
   `.ctoc/false-green-baseline.json` `maxFindings` lowered 210 → 208 and the two keys
   removed. Zero new false-green sites introduced by this change (verified by diffing the
   live scan against the baseline).
5. **CLAUDE.md NOT edited (executor Rule 7).** The plan's Step 15 asked for a one-line
   CLAUDE.md note and a test-count refresh; the build brief forbids editing CLAUDE.md
   (counts are auto-generated later). The stdin-only contract is fully documented in the
   two hook headers and in `tests/hook-payload-single-source.test.js`. The CLAUDE.md line
   is deferred to the later count-reconciliation pass.
6. **`npm install` was required** in this worktree so the lint and typecheck GATE tests
   could run (they fail loudly when the tools are absent — correctly). This touched
   `package-lock.json`, which is deliberately NOT staged in the commit.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
