---
approved_by: human
approved_at: 2026-07-20T08:40:32.392Z
gate_crossed: implementation → todo
---

---
title: "The Bash channel reaches the approval ledger through a link — and adding the link command to the write list would not stop it"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00140-a-link-that-points-at-nothing-yet-is-reported-as-a-path-inside-the-tree
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/hooks/PreToolUse.Bash.js"
  - "tests/the-bash-channel-cannot-reach-the-ledger-through-a-link.test.js"
  - "CLAUDE.md"
  - "tests/readme-numbers.test.js"
---

# The Bash channel reaches the approval ledger through a link

## The question this slice was asked, answered first because it changes the fix

**Asked:** is the answer to add link-creating commands to the hook's write-pattern
list, or is a text-matching command guard the wrong instrument entirely?

**Answer: adding `ln` to `WRITE_PATTERNS` would not stop the attack, and would not even
inconvenience it.** This is not an argument about blocklists being weak in general. It
is what the code does, read line by line.

`WRITE_PATTERNS` membership has exactly one consequence, at
`src/hooks/PreToolUse.Bash.js:749-763`:

```js
if (isWriteCommand(command)) {
  if (!state || !state.feature) { …block… }
  if (currentStep < MINIMUM_STEP_FOR_WRITE) { …block… }   // MINIMUM_STEP_FOR_WRITE = 8
}
process.exit(0);
```

A write command is denied **only** when there is no active feature or the Iron Loop is
before Step 8. The agent in this threat model is an executor at **Step 10** with an
active feature. Every entry in `WRITE_PATTERNS` is already permitted to it. Adding one
more entry adds one more permitted command.

Worse, `isWriteCommand` consults `ALWAYS_ALLOWED` **first** (`:560-564`), and that list
begins `/^\s*node\s+/`, `/^\s*npm\s+/`, `/^\s*npx\s+/`, `/^\s*python\s+/`. So
`node -e "require('fs').symlinkSync('..','src/anywhere')"` never reaches
`WRITE_PATTERNS` at all, whatever is in it.

The enumeration is therefore dead twice over: the wrong list, and a consequence that
does not apply to the attacker.

### Can text matching on a command line be made sound here? No, and here is the proof rather than the opinion

Three independent reasons, each sufficient on its own:

1. **The spellings are unbounded and the language is hostile to enumeration.** A shell
   can create a link as `ln -s`, `cp -s`, `cp --symbolic-link`, `rsync -l`,
   `find … -exec ln`, `xargs ln`, `sh -c 'ln …'`, `env ln`, `busybox ln`, through any
   interpreter (`node -e fs.symlinkSync`, `python -c os.symlink`, `perl -e symlink`,
   `ruby -e File.symlink`), on Windows as `mklink` or PowerShell's
   `New-Item -ItemType SymbolicLink`, and as `$'l''n'` or `l\n` where quote-stripping
   is the attacker's tool rather than the defender's. A blocklist over that set is a
   list of the spellings someone thought of.
2. **Legitimate work in THIS product creates links, through a path no blocklist may
   refuse.** `npm install` creates symbolic links in `node_modules/.bin`, and workspace
   installs link package directories. `git checkout`, `tar -x` and `unzip` all
   materialize a symbolic link that is present in their input. `npm`, `npx` and `git`
   are load-bearing here — `npm test` is the quality gate. So the guard would have to
   permit exactly the commands that create the most links, which is the definition of
   a blocklist that cannot be complete.
3. **The existing ledger text guard is already evadable by string arithmetic, and this
   is visible in the file.** `LEDGER_EVAL_TOKENS` matches `/\.ctoc\/+approvals/i`
   against a quote-stripped command. `normalizeForMatch` (`:127-131`) removes quote
   characters, so `node -e "const d='.ctoc'+'/approvals'; …"` normalizes to
   `.ctoc+/approvals`, which the pattern does not match. **Derived by reading, and
   PROBED at Step 13 of this plan — reported, not fixed here.** A guard that a `+`
   defeats is not a guard that a longer list of command names would rescue.

The file already says this about itself, at `:41-47`: *"this is a static string gate,
not a sandbox — do not read it as more than it is."* That comment is correct. The
honest completion of it is: **against an agent with an unrestricted Bash channel
running as the same operating-system user, no in-process text gate is sound, and the
only sound control is outside this product** — file permissions, a separate user, or a
sandbox. Nothing in these three plans changes that ceiling, and no plan of mine should
pretend otherwise.

**So where does the real control go?** At **resolution**, at the point where the guard
decides what a path IS — which is exactly where the sibling slice put it on the editing
channel. The Bash hook has one resolution-shaped decision in it already
(`resolveTokenPath`, `:161-166`), and that decision is pure `path.posix.normalize`:
arithmetic, blind to links, on the one guard in this file that denies unconditionally.
That is the defect worth fixing, and fixing it makes link CREATION uninteresting rather
than forbidden.

### And what legitimate work creates links in this product?

`npm install` does, on every install, inside `node_modules/`. That alone settles it:
refusing link creation outright is not cheap here, it is a refusal of the install step.
Separately, nothing in `src/`, `tests/`, `plans/`, `agents/`, `skills/` or `.ctoc/`
contains a link at all — the sibling slice measured **zero** — so nothing in the
product's own tree depends on one existing. The asymmetry is the point: refusing `ln`
specifically would cost nothing AND buy nothing, because npm's links are not made with
`ln`.

## The defect, derived from the shipped code

`isLedgerWrite` (`:197-265`) is the first deny layer in `main()`, ahead of
`ALWAYS_ALLOWED` and ahead of every step gate. It is the one unconditional deny in this
file, and it decides whether a command touches `.ctoc/approvals` two ways: an adjacency
match on the normalized segment text, and an operand match after
`resolveTokenPath` applies the accumulated `cd` prefix. Both are `path.posix.normalize`
and a regular expression. Neither touches the filesystem.

So, with a symbolic link that never spells the protected directory:

```
ln -s .ctoc src/link                       # ALLOWED — `ln` is not a write pattern,
                                           #   and `.ctoc/approvals` is not spelled
echo '{"kind":"human"}' > src/link/approvals/forged.json
```

Traced through `isLedgerWrite` for the second command: `normalizeForMatch` yields
`echo {kind:human} > src/link/approvals/forged.json`; `LEDGER_SEGMENT_RE` requires
`.ctoc/approvals` and does not match; the operands are `{kind:human}` and
`src/link/approvals/forged.json`; `resolveTokenPath('', …)` returns
`src/link/approvals/forged.json`; `LEDGER_RESOLVED_RE` requires `.ctoc/approvals` at a
path boundary and does not match. `touches` is false. The forgery gate does not fire.
Execution falls through to `isWriteCommand`, which matches the redirect — and then
permits it, because the step is 10.

**The write lands in the real approval ledger.** The sibling slice closed this chain on
the editing channel; the Bash channel was explicitly out of its scope, and this is the
half that remained open. It does not need the editing channel at any point.

**VERIFIED by reading**: every step above follows from the code as written.
**VERIFIED by the sibling executor**: `ln -s .. src/anywhere` and `ln -s /etc src/anywhere`
are ALLOWED, and only the command that literally spells `.ctoc/approvals` is blocked.
**NOT VERIFIED, and required to be confirmed or refuted at Step 8**: that the redirect
through the link really reaches the ledger end to end against the spawned hook. If Step
8 finds it blocked, **say so plainly and strike the finding** rather than defending it.

## The fix

`isLedgerWrite` gains a third, independent test on each non-read segment: does an
operand **really** resolve under `<root>/.ctoc/approvals`, whatever links it passes
through? That is precisely `realPathConfinement.resolvesUnder(operand, '.ctoc/approvals', root)`,
already built, already live on the editing channel, and repaired for dangling links by
the slice this one depends on. **Wiring, not a second encoding** — a second encoding of
a confinement predicate is the divergence surface this codebase names by name.

Ordering inside the function is load-bearing: the two arithmetic tests run FIRST and
short-circuit, so a command that already matches costs no syscall, and the overwhelming
majority of commands (which name no ledger path at all) pay resolution only on their
operands.

**The arithmetic tests are KEPT, not replaced.** They cost nothing, they catch the
spelling-level evasions the existing tests pin, and they work when the filesystem does
not. Either firing is a deny.

**The `cd` prefix must be applied before resolving.** `resolveTokenPath` already builds
the operand's path against the accumulated prefix; the resolution takes that result,
not the raw token, or `cd .ctoc && echo > link/approvals/x` slips past.

### Fail CLOSED, and it must be built as return-never-throw

`main()`'s outer handler is `main().catch(err => { console.error(…); process.exit(1); })`
(`:775-778`). Exit 1 is the **legacy cosmetic** code this hook's own header records the
harness treating as **non-blocking** (`:56-60`) — the real deny is
`emitDeny`'s decision JSON on stdout with exit 0. So a throw out of this guard does not
deny; it produces a non-blocking error and the command proceeds. **A throw here is an
ALLOW**, exactly as on the editing channel, and for a different reason that must be
written down at the code so nobody "tidies" the two into consistency and inverts one.

`resolvesUnder` already returns `true` — deny — on every fault, and never throws. The
new call site must not wrap it in anything that converts a fault into a permit.

## Pathological cases at this call site — every one enumerated, with its verdict

The resolver's own table lives in the plan this one depends on. These are the cases
specific to feeding shell tokens into it.

| case | resolution | guard verdict |
|---|---|---|
| operand is an ordinary in-tree path (`src/lib/x.js`) | resolves inside root | not ledger → command continues |
| operand does not exist yet (`src/lib/new.js`) | ancestor walk → inside root | continues |
| operand reaches the ledger through a live link | resolves into `.ctoc/approvals` | **DENY** |
| operand reaches the ledger through a **dangling** link | `dangling` fault | **DENY** (this is why 00140 comes first) |
| operand is a link **loop** | `loop` fault | **DENY** |
| operand is not a path at all (`-m`, `HEAD`, `origin/main`) | ancestor walk → inside root | continues — a false deny here would break `git` |
| operand contains a glob (`src/*.js`) | never expanded by the hook; walks to inside root | continues |
| operand is a URL or a flag value (`https://…`) | resolves under root as a nonsense name | continues |
| operand is absolute and outside the repository (`/etc/hosts`) | resolves, not under ledger | continues — this guard is about the ledger only |
| operand triggers `EACCES`/`ENOTDIR` | `denied` / `resolve-failed` | **DENY** — a rare false deny, accepted, and named in the residuals |
| more operands than the resolution cap | arithmetic result only | continues — **a stated ceiling**, see Decision 3 |
| the root is unresolvable | fault | **DENY** |
| any unexpected error | returned, never thrown | **DENY** |
| the link is created between this check and the command's own write | not seen | **not closable** — named in the residuals |

The two rows that DENY a legitimate command (`EACCES` on an operand, an unresolvable
root) are the price of failing closed on a permission check. They are measured at Step
9 against the real menu recipes rather than assumed harmless.

## Implementation Details

### Dependency graph

```
src/hooks/PreToolUse.Bash.js  (MODIFY)
  └─requires→ src/lib/real-path-confinement.js   [NEW edge, fail-soft]
                └─requires→ path, src/lib/safe-fs.js   [unchanged]
```

No cycle. No layer violation — the new edge points from `hooks/` into `lib/`, the
sanctioned direction. This file previously performed no filesystem access in its guard;
that property changes, deliberately, and the header must say so.

### File: `src/hooks/PreToolUse.Bash.js`
**Action:** MODIFY — one require, one predicate helper, one added test in `isLedgerWrite`

1. **A fail-soft require**, matching the shape used in `PreToolUse.Edit.js:57-64`,
   **with its degradation written into the comment**: if the module fails to load, the
   arithmetic guard alone remains and the link path into the ledger is open again. That
   is a real degradation, recorded rather than silent. Crashing instead would be worse,
   because this file's error handler exits 1, which the harness does not treat as a
   block.
2. **`operandResolvesIntoLedger(prefix, token)`** — a small helper next to
   `resolveTokenPath`: builds the same prefixed path, then asks
   `realPathConfinement.resolvesUnder(...)` against `LEDGER_DIR_RELATIVE = '.ctoc/approvals'`
   and `process.cwd()`. Returns `false` when the module is absent (degraded), and
   otherwise returns whatever `resolvesUnder` returns — **including its fault-is-true
   inversion, unwrapped.** Bounded by the operand cap.
3. **Inside `isLedgerWrite`'s per-segment loop**, after the existing two tests and only
   when both were false:
   `if (!touches) touches = operands.some((t) => operandResolvesIntoLedger(prefix, t));`
   The existing `if (touches && !isReadOnlyLedgerCommand(seg)) return true;` is
   unchanged, so a READ of the ledger through a link stays allowed exactly as a direct
   read does.

Nothing else in this file changes. Not `ALWAYS_ALLOWED`, not `WRITE_PATTERNS` — **and
deliberately not**, per the ruling above. Not the irreversible net, not the plan-move
guard, not the commit gate, not the inline-eval tokens, not the deny messages, not the
`main()` ordering.

### File: `tests/the-bash-channel-cannot-reach-the-ledger-through-a-link.test.js`
**Action:** CREATE
**Framework:** `node:test`. The hook exports nothing on purpose, so every case
**SPAWNS the real hook process** with a PreToolUse payload on stdin and asserts on the
decision JSON — the same harness shape `tests/ledger-forgery-closed.test.js` uses, and
the strongest available test. Real `os.tmpdir()` fixtures, `path.join` throughout,
recursive-force cleanup in `finally`, and `cwd` set to the fixture so `process.cwd()`
is the fixture root.

| # | Case | Assertion |
|---|---|---|
| 1 | **the proved chain** — `link → .ctoc`, then `echo x > link/approvals/forged.json` | **denied** |
| 2 | **the parent-link variant** — `up → ..`, then `echo x > up/<repo>/.ctoc/approvals/f.json` | denied (already denied by adjacency today — pins that it stays) |
| 3 | **the link is the ledger directory itself** — `link → .ctoc/approvals`, then `tee link/f.json` | denied |
| 4 | **through a `cd`** — `cd src && echo x > link/approvals/f.json` with `src/link → ../.ctoc` | denied — proves the prefix is applied before resolution |
| 5 | **a dangling link into the ledger** — `link → .ctoc/approvals/notyet.json`, then `echo x > link` | denied — inherits 00140 |
| 6 | **cp through a link** — `cp forged.json link/approvals/f.json` | denied |
| 7 | **an interpreter through a link** — `node -e "require('fs').writeFileSync('link/approvals/f.json','x')"` | denied |
| 8 | **a READ through a link stays allowed** — `cat link/approvals/x.json` | **allowed.** Reading provenance is legitimate; without this the fix is a blanket denial |
| 9 | **the arithmetic guards still fire** — every existing direct spelling: quote-split, `cd`-split, `cd "--"`, `~`-prefixed, `cd ""` no-op | unchanged verdicts — the third test adds, it does not replace |
| 10 | **every menu recipe still runs** — the verbatim `node -e` recipes asserted by `tests/ledger-forgery-closed.test.js` | **allowed**, unchanged. This is the false-positive fence; a broken menu recipe is a CRITICAL regression |
| 11 | **ordinary development commands are unaffected** — `git commit -m "x"`, `npm test`, `git add src/lib/x.js`, `node src/commands/menu.js`, `grep -rn foo src/` | allowed |
| 12 | **an operand that is not a path** — `git log --oneline origin/main` | allowed |
| 13 | **a link loop in an operand** — `a → b`, `b → a`, `echo x > a/f.json` | **denied**, and the process **returns** — assert it exits and does not hang, with a bounded timeout |
| 14 | **the module missing degrades rather than crashes** — spawn with the module made unloadable | the hook still runs, direct spellings still denied, the link case allowed, **and the degradation is what the code comments predict** |
| 15 | **the fence is not vacuous** — the identical fixture with NO link: `echo x > src/ordinary.json` | **allowed**, proving cases 1–7 fail for the link reason and not because the harness denies everything |
| 16 | **cost** — a corpus of ordinary commands run through the spawned hook | asserts the guard returns; the timing number itself is recorded at Step 9, not asserted as a threshold in the suite (a timing assertion is a flaky test) |

Cross-platform: links are created with `fs.symlinkSync(target, linkPath, 'junction')`
for directories. **If link creation fails, the test FAILS LOUDLY with the platform and
the error** — it does not skip. Zero skipped is a gate here.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `operandResolvesIntoLedger` | `isLedgerWrite`'s per-segment loop | `isLedgerForgery` → `main()` at `:679`, the FIRST deny layer on every Bash tool call |
| the fail-soft require | the same | the same |
| `tests/the-bash-channel-cannot-reach-the-ledger-through-a-link.test.js` | the suite | `npm test` |

Nothing here is reachable only from a test. The hook is registered as the PreToolUse
Bash command, so `main()` runs on every Bash call the agent makes.

## What this does NOT fix

1. **Link creation is still permitted, deliberately.** `ln -s .. src/anywhere` remains
   allowed after this ships, and the reasoning is the ruling at the top: the spellings
   are unbounded, `npm install` legitimately creates links, and refusing `ln`
   specifically buys nothing because npm does not use it. What changes is that the link
   buys nothing against the ledger.
2. **The Bash channel is not made sound, and cannot be by this fix.** It remains a
   static string gate over the segmentation, the `cd` tracking and the read exemption.
   An agent that can write an arbitrary `.js` file under a plan-covered path and run
   `node that-file.js` reaches the ledger with no string this gate can see — the file's
   own honest-limits comment already says so, and it is still true afterwards. **The
   sound control is outside this product**: operating-system permissions on
   `.ctoc/approvals`, a separate user, or a sandbox. That is a decision for the human,
   not something this plan takes.
3. **The inline-eval token check is still defeated by string concatenation.**
   `node -e "const d='.ctoc'+'/approvals'; …"` normalizes to `.ctoc+/approvals` and
   matches nothing. **Derived by reading; PROBED and REPORTED at Step 13, not fixed
   here** — it is a different defect in a different predicate and belongs to a plan
   that says so.
4. **Hard links are not addressed here either, and do not get their own mechanism.**
   See the reasoning below; the residual is stated, not closed.
5. **Coverage enforcement does not exist on the Bash channel at all.** A redirect at
   Step 10 writes anywhere in the repository without a covering plan. That is the
   pre-existing shape of this hook, unchanged by this slice, and it is a much larger
   question than a link.
6. **The check-then-write race is not closable.** A link created between the guard's
   resolution and the command's own write is not seen.
7. **`isWhitelisted` is untouched** — that is the next slice.

### Hard links — the ruling, and why no second mechanism is built

The request was to decide honestly whether the hard-link residual is worth closing, and
whether closing the Bash channel closes it too. It largely does, and the part it does
not close should not be closed with inode comparison on a hot path.

A hard link is only dangerous here in one shape: an agent creates a second directory
entry for an **existing** ledger file at an innocuous path, then rewrites that file's
bytes through the innocuous path. Real-path resolution cannot see it, because the
resolved path genuinely IS inside the source tree.

But creating it requires naming the ledger file as the link source, and that is what
this slice closes: `ln .ctoc/approvals/x.json src/y.json` is already denied today
(the operand spells the directory, and `ln` is in the write-ish set of
`isReadOnlyLedgerCommand`), and the evasion `ln link/approvals/x.json src/y.json`
through a symbolic link is denied by the fix in this slice, because the source operand
resolves into the ledger. **So the reachable creation channel closes with item one, and
no second mechanism is warranted.**

What remains open, stated rather than implied: a hard link created **outside CTOC's
view** — by the human, by a script that ran before the hook existed, by `tar -x`, or by
a package manager — is invisible to every check in this codebase. Closing that would
need inode comparison. The cheapest correct form is a single `lstat` on the target and,
only when `nlink > 1`, a comparison against the inode set of the two protected
directories. That is genuinely cheap in the common case. **It is not built here**,
because: the shape has no measured occurrence; `nlink` and `ino` reliability on Windows
NTFS through Node is **unverified by me and I will not assume it**; and adding a second
inode-based confinement predicate alongside the real-path one is a second encoding of
the same question, which is the divergence surface this codebase already pays for.
If the human schedules it, it is its own plan with its own measurement.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
Write `tests/the-bash-channel-cannot-reach-the-ledger-through-a-link.test.js` in full
and run **only that file, before touching `src/`**. Record the starting state verbatim.

- **Cases 1, 3, 4, 5, 6 and 7 must be RED** — this is the claim that the Bash channel
  reaches the ledger through a link. **If they are not red, STOP**: the finding is
  wrong and so is this plan, and the report says so rather than defending it.
- **Cases 2, 8, 9, 10, 11, 12 and 15 must be GREEN already** and must stay green. Case
  10 is the false-positive fence over the live menu recipes; case 15 proves the harness
  is capable of allowing.
- **Case 13** — record whether a link loop in an operand currently returns, throws or
  hangs. The sibling slice found a loop returning a MATCH on the editing channel, which
  was a silent allow; record what it does here rather than assuming the same.
- **Case 14** — record the degraded behaviour before the require exists, so the after
  state is a comparison rather than a claim.

### Step 9: PREPARE
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
Read from disk, in full: `src/hooks/PreToolUse.Bash.js` — all of `isLedgerWrite`,
`resolveTokenPath`, `isReadOnlyLedgerCommand`, `isLedgerForgery`, `isWriteCommand` and
`main()`; `src/lib/real-path-confinement.js` as built by 00140;
`src/hooks/PreToolUse.Edit.js:57-64` for the fail-soft require precedent;
`tests/ledger-forgery-closed.test.js` for the menu-recipe corpus and the spawn harness.

Then MEASURE:

1. **Timing on the spawned hook**, before and after, over a corpus of at least 30 real
   commands: the menu recipes, `npm test`, `git` invocations, `grep`/`find`, and a
   long `git add` with many operands. Record the median and the worst case. **Above
   roughly 10 milliseconds added per command, stop and report** — this guard runs on
   every Bash call the agent makes.
2. **The operand-count distribution** across that corpus, so the resolution cap
   (Decision 3) is set from data rather than from a guess.
3. **The false-deny rate over the corpus**: how many ordinary commands would be denied
   by a resolution fault. **If it is not zero, stop and report before Step 10** — a
   guard that denies real work is worse than the hole it closes.
4. **Whether `process.cwd()` is the project root when this hook runs.** The editing
   hook already assumes it; this one currently does not depend on it at all, and the
   fix introduces that dependency. If the assumption is wrong the whole approach is
   wrong — **stop and report** rather than working around it.

Where the code disagrees with this plan, **the code wins and the discrepancy is
recorded.**

### Step 10: IMPLEMENT
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
One step, files as sub-items.
- `src/hooks/PreToolUse.Bash.js` — the fail-soft require with its degradation comment,
  `operandResolvesIntoLedger`, the third test inside `isLedgerWrite`, and a header
  paragraph recording that this guard now touches the filesystem and why the
  "pure string check, no filesystem walk" property was given up.
- `tests/the-bash-channel-cannot-reach-the-ledger-through-a-link.test.js` — the sixteen
  cases.
- `CLAUDE.md` and `tests/readme-numbers.test.js` — **count ratchets ONLY**, measured
  live, if adding one test file trips them. Nothing else, no assertion loosened.

### Step 11: REVIEW
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
Confirm there is still exactly ONE encoding of real-path confinement and that this file
contains no copy of it. Confirm the two arithmetic tests run first and short-circuit,
so a command already matching costs no syscall. Confirm the `cd` prefix is applied
before resolution. Confirm the read exemption still runs after the new test, so a read
through a link is allowed. Confirm `resolvesUnder`'s fault-is-`true` inversion is
unwrapped and documented at this call site. Confirm nothing in `ALWAYS_ALLOWED`,
`WRITE_PATTERNS`, the irreversible net or `main()`'s ordering changed. Confirm no
`require` points from `lib/` into `hooks/`. Confirm the operand cap is bounded and its
beyond-cap behaviour is the documented ceiling rather than an accident.

### Step 12: OPTIMIZE
Confirm the resolution runs only on segments the arithmetic did not already match, and
only on operands. Confirm the root is resolved once per operand at worst and that this
is acceptable, or hoist it. Record the after-timing against Step 9's numbers, median
and worst case. Confirm a command with no operands costs zero syscalls.

### Step 13: SECURE
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
This is the security step of a security fix; do it adversarially, against the built
code and by hand, not only through the suite.
- Re-attack the full chain: create the link, then write through it, in the direct,
  parent, `cd`-split, dangling and loop shapes. Record each verdict.
- Attack the fix itself: an operand hidden behind a command substitution; an operand
  supplied through `xargs` or `find -exec`; a link created and used **in the same
  command** (`ln -s .ctoc src/l && echo x > src/l/approvals/f.json`) — the check runs
  once, before the command, so the link does not exist yet when the guard looks.
  **Record that verdict honestly; it is the check-then-write race in its most concrete
  form and it may well be an ALLOW.** If it is, say so in the Step 16 report as a
  residual of this fix, not as a success.
- **PROBE and REPORT, do not fix**: the string-concatenation evasion of
  `LEDGER_EVAL_TOKENS` (`node -e "'.ctoc'+'/approvals'"`), confirming or refuting the
  reading in this plan.
- Confirm every fault path DENIES by RETURNING and that no throw escapes the guard —
  a throw reaches `main().catch`, which exits 1, which this file's own header records
  the harness treating as **non-blocking**.
- Confirm the deny messages leak no absolute paths, no file contents and no stack
  traces, and name the sanctioned writer as they do today.

### Step 14: VERIFY
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
Targeted run first: the new file, plus `tests/ledger-forgery-closed.test.js`,
`tests/security-enforcement-evasion.test.js`, `tests/enforcement-hook.test.js`,
`tests/e2e-enforcement-and-gates.test.js`, `tests/a-link-cannot-leave-the-repository.test.js`,
`tests/a-dangling-link-is-not-a-path-inside-the-tree.test.js`,
`tests/false-green-fence.test.js`, `tests/architecture-invariants.test.js`,
`tests/doc-counts.test.js`, `tests/readme-numbers.test.js`.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The floor must not be lowered.
Lint every changed JavaScript file at `--max-warnings 0` and run `npx tsc --noEmit -p .`.

Then prove the product still runs: drive `node src/commands/menu.js` far enough to
confirm the dashboard renders, and re-run the menu-recipe corpus through the spawned
hook. **A guard that denies the menu's own recipes is a worse defect than the one being
fixed.** If any recipe is denied, stop and report. **No git operations.**

### Step 15: DOCUMENT
Amend the file header: this guard is no longer a pure string check; it resolves operand
paths through the filesystem, and here is why a longer list of command names was
rejected instead — the spellings are unbounded, `npm install` legitimately creates
links, and the enumeration's only consequence is a step gate the attacker is already
past. State at the new call site that `resolvesUnder` returns `true` to DENY and
returns `true` on every fault, and that **a throw here is an ALLOW because
`main().catch` exits 1, which the harness does not treat as a block** — a different
reason from the editing hook's fail-open catch, reaching the same conclusion, and both
must be preserved rather than unified.

### Step 16: FINAL-REVIEW
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.
Report: the paths; the Step 8 verbatim red, naming which cases confirmed or **refuted**
the finding; the timing median and worst case before and after; the operand-count
distribution and the cap chosen from it; the false-deny count over the corpus; the
verdict for the create-and-use-in-one-command race, stated as a residual if it allows;
the string-concatenation probe result, reported and not fixed; the ruling that link
creation stays permitted and why; the hard-link ruling and what remains open; the
verbatim green from Step 14; the seven things this does NOT fix; and every decision
taken under ambiguity.

## Ordering and file conflicts

**Depends on 00140** — the dangling-link repair to `real-path-confinement.js`. Without
it, `ln -s .ctoc/approvals/notyet.json link` followed by a write through `link` is
still permitted, and a forged approval entry is by definition a file that does not
exist until it is forged, so the dangling case is the ordinary case for this attack.
Building this slice first would ship a guard with a hole in exactly its main shape.

This slice declares `src/hooks/PreToolUse.Bash.js`, which no plan in `todo/` or
`in-progress/` declares, and which neither sibling touches. Plans build **sequentially**;
the executor reads live at Step 9 and never takes content from a plan.

If an existing enforcement test breaks, it is **not declared here**: stop, name the file
and the exact change, and ask.

## Decisions Taken Under Ambiguity

1. **Link-creating commands are NOT added to `WRITE_PATTERNS`, and no link blocklist is
   built.** The list's only consequence is a Step-8 gate the attacker is already past;
   `ALWAYS_ALLOWED` routes every interpreter around it; the spellings are unbounded;
   and `npm install` legitimately creates links. The control goes at resolution
   instead. **This is the plan's central ruling and the reason it exists in this shape.**
2. **The fix wires `resolvesUnder` rather than encoding confinement a second time.** A
   second encoding of a permission predicate is how the two halves diverge.
3. **The resolution is capped at a bounded number of operands per segment, and beyond
   the cap the arithmetic result alone stands.** Denying a long command outright would
   deny real work (`git add` with many files); the cap is a **stated ceiling** rather
   than a silent one, set from the Step 9 measurement, and reported at Step 16.
4. **A fault on an operand DENIES the whole command.** This is a permission check and
   permitting because it could not look is the defect. The false-deny rate is measured
   at Step 9 and, if it is not zero, the plan stops rather than shipping.
5. **A READ of the ledger through a link stays ALLOWED.** Reading provenance is
   legitimate and already allowed directly; making the link case stricter than the
   direct case would be an inconsistency with no security value.
6. **`process.cwd()` is used as the root**, matching the editing hook. The assumption is
   verified at Step 9 rather than inherited, and if it is wrong the plan stops.
7. **The string-concatenation evasion of the inline-eval tokens is REPORTED, not
   fixed.** It is a different predicate with a different fix, and folding it in would
   make this slice two changes wearing one plan.
8. **Hard links get no mechanism.** The reachable creation channel closes with this
   slice; the out-of-view residual would need inode comparison whose Windows behaviour
   I have not verified, and it would be a second encoding of confinement. Stated as
   open, with the cheapest correct design recorded so the human can schedule it.
9. **The honest ceiling is written into the plan and into the code.** Against an agent
   with an unrestricted Bash channel running as the same user, no in-process text gate
   is sound; the sound control is operating-system level and outside this product.
   Saying so is not a reason to skip the fix — it is the reason the fix must not be
   described as closing the channel.
10. **Nothing is asserted that planning could not verify.** The end-to-end chain, the
    timing, the operand distribution, the false-deny rate, the `process.cwd()`
    assumption, the loop behaviour and the concatenation evasion are all marked MEASURE
    or PROBE, and the central finding is **required to be confirmed or refuted at Step
    8**, with refutation reported plainly rather than defended.
11. **The resolution candidates are the shell operands PLUS the segment's quoted string
    literals — a correction to the plan's implementation detail, made at Step 8.** The
    plan's described set (`operands = tokens.slice(1)`) was insufficient for its OWN
    case 7 (an interpreter through a link,
    `node -e "require('fs').writeFileSync('src/link/approvals/f.json','x')"`):
    whitespace tokenization mashes the whole eval body into one token and
    `resolveTokenPath` strips quotes, so the embedded path resolves to the garbage
    `requirefs.writeFileSyncsrc/link/approvals/f.json,x` and never reaches the ledger.
    Case 7 stayed RED after the operand-only fix. The clean path IS a quoted literal,
    so `quotedLiterals(seg)` (single- and double-quoted contents) are resolved too.
    Measured false-deny over every real start.md `node -e` recipe (56 candidates) plus
    the dev corpus against the real repo root: **zero**, so Decision 4's gate holds.
    This closes the interpreter shape; it does NOT close the write-a-file-then-run-it
    shape (residual 2, unchanged) or the string-concatenation eval evasion (residual 3,
    reported not fixed).
