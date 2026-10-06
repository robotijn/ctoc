---
iron_loop_verdict: true
iron_loop: true
title: "The gate check does not reread every plan on every tool call"
type: functional
status: functional
created: 2026-10-06
priority: high
effort: medium
depends_on: none
files:
  - src/hooks/human-gate-check.js
  - src/lib/gate-migration.js
  - .claude-plugin/hooks.json
  - hooks/hooks.json
  - tests/the-gate-check-does-not-reread-unchanged-plans.test.js
  - tests/gate-migration.test.js
  - CLAUDE.md
  - README.md
  - .github/workflows/tests.yml
revision: 2
rejection_reason: "Parked by the owner: hooks stay hidden; unapproved plans live in functional."
tag: rejected
---
# REVISION 2

## Rejection Feedback

Parked by the owner: hooks stay hidden; unapproved plans live in functional.

---

# REVISION 1

## Rejection Feedback

Parked by the owner: CTOC hooks stay hidden on purpose, and hook milliseconds are not what users wait for (2026-10-06).

---


# The gate check does not reread every plan on every tool call

## Problem Statement

The owner, 2026-10-06: "also fix the gate check rereading every plan".

`src/hooks/human-gate-check.js` keeps the human approval moments the human's. Before a
tool call it sweeps `plans/implementation`, `plans/todo` and `plans/done` and moves back
any plan the approval ledger does not vouch for. It is registered with matcher `"*"`, so
it runs before every tool call, Read and Grep included, and every run reads every plan in
the three folders, reads every plan's ledger entry, and hashes the todo and done plans.

Measured on a copy of this repository (`.ctoc/audit/speed-and-size/hook-and-menu-profile.md`):
436 plans and 436 ledger files, about 9.3 MB, 1,361 synchronous file-system calls, about
50 ms above the 20 ms Node start, on every call. It is the slowest hook before every call
(70 ms against 28–52 ms for the others). The cost grows in a straight line with the plan
count (`when-ctoc-got-slower.md`): 22 ms at 3 plans, 67 ms at 1,500, 109 ms at 3,000, and
the 20 July code has the same curve. Read, Grep and WebFetch alone are 48% of this
repository's 5,902 recorded tool calls, and none of them can move a plan.

Fixed means:
- an unchanged plan that was already verified costs a status check of the plan file and
  of its ledger entry, never a read;
- a changed plan or a changed ledger entry is still caught on the next call;
- the remembered verdicts sit where only CTOC's own code can write them, and a forged,
  stale or corrupt entry never stops a revert;
- the check no longer runs before Read, Grep, Glob, WebFetch or WebSearch.

## Scope

This plan changes the gate check `src/hooks/human-gate-check.js` (it remembers accepted
verdicts and reads fewer files), the hook registration (one matcher), comments in
`src/lib/gate-migration.js` and `tests/gate-migration.test.js` that describe the old
matcher, the gate-check lines and the test-file count in `CLAUDE.md`, the test-file count
in `README.md`, and adds one test file. It adds one job to `.github/workflows/tests.yml`
that runs the new test file on Ubuntu, macOS and Windows (Decision 14).

It does not change the verdict itself: `src/lib/approval-residency.js` and
`src/lib/approval-ledger.js` are untouched, and every plan the sweep reverts today it
still reverts. It does not change `PreToolUse.Edit.js` or `PreToolUse.Bash.js` (the
cache goes inside the directory both already deny; see Decision 1).

Written by the implementation planner on 2026-10-06. Claims are labelled **verified**
(read in a file this session), **believed**, or **to verify** (a named step checks it).
Nothing was run: this planner has no shell.

## What was verified

1. **Every input of a verdict** (verified, by reading `human-gate-check.js`,
   `approval-residency.js`, `approval-ledger.js`). `checkFolder` calls `readPlan` for every
   `.md` file in every folder before anything else. `classifyResidency` reads the plan's
   ledger entry through `readEntryResult`, and in `todo/` and `done/`, when the entry
   names that folder, hashes the content through `contentMatches`. In `implementation/`,
   `isFreshSip1Slice` exempts a fresh slice (a planner-written plan carrying
   `parent_plan:` and no ledger entry of its own) when its parent's ledger entry is
   accepted into `implementation/`; that reads the parent's ledger entry only, because
   `implementation` is not a hash-checked folder. So a verdict depends on exactly four
   things: the plan's bytes, its own ledger entry, a fresh slice's parent ledger entry, and
   the verdict code. The folder and the file name are part of the key.
2. **Registration** (verified): `.claude-plugin/hooks.json` registers the gate check under
   `PreToolUse` with matcher `"*"`.
3. **Who may write `.ctoc/approvals/`** (verified, by reading). The edit hook denies any
   path at or under `.ctoc/approvals` (case-insensitive, with real-path resolution) before
   its `.ctoc/` whitelist. The shell hook's `isLedgerForgery` denies any non-read command
   that touches `.ctoc/approvals`, including a path split across a `cd`, and any inline
   evaluation naming the ledger module or its write functions. The migration marker
   `.ctoc/approvals/.migration-complete.json` already lives there for this reason. No
   other directory is denied on both channels (see Neighbours 1).
4. **How Claude Code matches a hook to a tool** (verified, by reading the matcher function
   inside the installed Claude Code 2.1.291 program):

   ```js
   function m5(e,n,r,s,g,h){if(!n||n==="*")return!0;let b=xen(n,r,s),w=Aen(e,g,h);
     if(b!==void 0)return b.includes(e)||w.some((M)=>b.includes(M));
     try{let M=new RegExp(n);if(M.test(e))return!0; /* …also aliases… */ return!1}
     catch{return t(`Invalid regex pattern in hook matcher: ${n}`),!1}}
   function xen(e,n,r){if(!(n?/^[a-zA-Z0-9_|, -]+$/:/^[a-zA-Z0-9_|]+$/).test(e))return;
     return e.split(n?/[|,]/:"|").map((g)=>g.trim()).filter(Boolean).flatMap((g)=>o7(gl(g),r))}
   ```

   `"*"` or empty matches every tool. A matcher made only of letters, digits, `_` and `|`
   (for this event also `,`, space and `-`) is split into exact tool names. Anything else
   is compiled with `new RegExp` and tested, unanchored, against the tool name and its
   legacy aliases; an invalid pattern logs a warning and matches nothing.
5. **Tool names** (verified, same program): the legacy-alias table maps `Task` to `Agent`
   (so `PreToolUse.Task.js`, registered as `Task`, does fire for the `Agent` tool; this
   answers the profile report's open question), and a `PowerShell` tool is defined beside
   `Bash`.
6. **Subagents** (verified that the field exists; believed that it means what it says):
   the hook input that program builds carries `agent_id` and `agent_type`, which exists
   because tool hooks fire inside subagents. CTOC's enforcement of the iron-loop executor's
   edits relies on the same fact.
7. **The fingerprint-method fix** (verified absent): no plan in `plans/` covers the
   `contentMatches` change described in `.ctoc/audit/speed-and-size/plans-revert-after-update.md`.

## Implementation Details

### 1. The gate check remembers each accepted verdict

**Where.** Inside `src/hooks/human-gate-check.js`, as private functions. There is no new
module and no new export, so no function anywhere accepts a verdict from a caller. A
module with a "store this verdict" function would be a forgery route through
`node -e "require(…)"` that the shell hook's inline-evaluation deny does not name.

**The file.** `.ctoc/approvals/.gate-check-cache/verdicts.json`, with a sibling
`.ctoc/approvals/.gate-check-cache/.gitignore` whose content is `*`. The path is built from
`approval-ledger.ledgerDir(projectPath)`. The directory is created only when the ledger
directory exists; a project with no ledger has nothing to accept.

```json
{
  "format": 1,
  "code": "<SHA-256 hex of the verdict code>",
  "codeFiles": ["hooks/human-gate-check.js", "lib/approval-ledger.js", "…"],
  "accepted": {
    "todo/some-plan.md": {
      "plan":   "<dev>:<ino>:<size>:<mtimeNs>:<ctimeNs>",
      "ledger": "<dev>:<ino>:<size>:<mtimeNs>:<ctimeNs>",
      "parent": null
    },
    "implementation/some-parent-s2-wire.md": {
      "plan":   "<…>",
      "ledger": "absent",
      "parent": { "slug": "some-parent", "ledger": "<…>" }
    }
  }
}
```

**The status key.** `safeFs.statSync(p, { bigint: true, throwIfNoEntry: false })`, written
as the five fields in decimal (device, file number, size, modification time and
status-change time, both in nanoseconds), or `absent`. Times have nanosecond resolution on
macOS's APFS and Linux's ext4, and 100-nanosecond resolution on Windows' NTFS (believed;
Step 9 records it on this machine, and the three-platform job checks it on all three). The
status-change time is load-bearing: an ordinary program can set a file's modification time
back but cannot set its status-change time on Linux or macOS, so an edit with the old
modification time restored still changes the key.

**The code fingerprint.** SHA-256 over every CTOC `src/` module present in `require.cache`
when the sweep starts, sorted, each contributing its relative path, a zero byte, and its
bytes. `approval-ledger` and `stale-detector`, today required lazily inside functions, are
required at the top of `main()` so they are in the set. The fingerprint is computed at most
once per sweep and only if the cache is consulted. Any change to the verdict code changes
it and discards every entry, including the coming change to `contentMatches` (see
Dependencies). `codeFiles` records the set so test 10 can prove nothing on the verdict path
escaped it.

**A hit** (inside `checkFolder`, before any read). For the key `<folder>/<file>`:
- the entry exists, `format` is 1 and `code` equals the current fingerprint;
- `plan` equals the plan's status key now, and `ledger` equals its own ledger entry's
  status key now;
- if `ledger` is `absent`, the folder is `implementation` and `parent` is present with a
  ledger key that equals the parent ledger entry's key now and is not `absent`.

Anything else is a miss. In `todo/` and `done/` a remembered acceptance is never used for a
plan with no ledger entry. So the commonest forgery, a plan placed in a gate folder with no
approval at all, is reverted even by someone able to write the cache.

**A miss** is judged exactly as today, with each status key taken before the read it
vouches for:
1. status of the plan and of its own ledger entry;
2. in `implementation/` only, read the plan, take `parent_plan` through one small helper
   that `isFreshSip1Slice` also uses (one encoding of that parse), then the status of the
   parent's ledger entry;
3. `isFreshSip1Slice` and `classifyResidency`, unchanged.

A key taken after a read could describe a newer file than the one judged, and would then
vouch for content nobody checked. Only acceptances are recorded. A violation is judged
afresh on every call (there are few, and most are moved out of the folder at once).

**Recently changed files are not remembered.** A change inside one timestamp tick can leave
size and both times unchanged: two seconds on FAT, one on macOS's older HFS+, and the
kernel's clock tick on ext4. Git calls this the racy-clean case. An acceptance is recorded
only if every recorded modification time and status-change time is at least 3 seconds older
than the filesystem's own clock. That clock is read once, from the temporary file the sweep
opens in the cache directory before its first recompute; the same file becomes the new cache
by rename. Using the filesystem's clock rather than `Date.now()` keeps a network share with
a skewed clock correct. A plan changed in the last 3 seconds is read again on the next call.

**Fewer reads in `todo/` and `done/`.** `checkFolder` reads a plan up front only in
`implementation/`, where the slice check needs it. In `todo/` and `done/` it passes no
content, and `classifyResidency` reads the plan only when the entry exists and names that
folder. A plan with no entry, or an entry naming another folder, is no longer read there.
This matters most in an unmigrated project, where reported-but-not-moved plans were reread
on every call. The verdicts are identical.

**Reading the cache fails closed.** An absent, unreadable or unparseable file, an unknown
`format`, a different `code`, a non-object `accepted`, or an entry of the wrong shape counts
as absent: the plan is recomputed. Lookups use `Object.prototype.hasOwnProperty.call`. No
path out of the cache code ends in "accepted" except an exact hit.

**Saving.** At most once per sweep, and only when an entry was added or dropped (plan gone,
key stale, cache unreadable). The write is a temporary file plus a rename, like
`approval-ledger.persistEntry`. In the steady state nothing is written. A failed save never
throws and never changes a verdict: it returns its reason, and the next sweep recomputes.
There are no empty catch blocks (the false-green fence's silent-catch signature).

**`checkFolder(folderName, projectPath, cache)`.** The third parameter is optional. `main()`
passes the cache. Every other caller (`ledger-backfill.js --mark-migrated`,
`iron-loop-enforcer.js` through `classifyResidency`, the existing tests) gets today's sweep
with no cache.

**Cost (believed; Step 9, Step 14 and Step 16 measure).** Two status checks per plan (three
for a fresh slice), three folder listings, one cache read and one fingerprint of about ten
files. At 436 plans that is about 6 ms above Node start instead of about 50. It is two
status checks, not one, because the ledger entry decides the verdict too.

### 2. Why it cannot fail open

- **Only CTOC's own code writes the cache.** It sits in the one directory both agent write
  channels deny (verified 3), and test 7 pins that the file the sweep trusts is that one.
- **Storing the plan's content hash in the entry would not, alone, stop a forger** who can
  write the cache and can read the file's status. A hit uses the stored verdict without
  reading the plan, so nothing ever compares the stored hash with the file. Every design
  that skips the read trusts whoever wrote the entry. The protection therefore has to be the
  write deny, and it is the ledger's own: whoever can write the cache can already write an
  approval directly. The cache adds no route the ledger does not already have.
- **What an agent can do without writing the cache does not work.** Restoring a plan's
  modification time after an edit fails because the status-change time moved (test 4).
  Moving a plan fails because it gets a new key or a status change. A plan with no ledger
  entry in `todo/` or `done/` is never vouched for (test 6). Deleting or corrupting the cache
  makes the sweep recompute (test 8). A different CTOC gives a different fingerprint (test 9).
- **Residual, stated plainly.** On Windows a program can set the status-change time through
  the native file-information call. Such a program can equally write the ledger. The shell
  channel's ledger deny is a static text check, as its own header says: a checked-in script
  run with `node`, or an inline evaluation that builds the path from pieces, reaches the
  ledger and the cache alike (believed, from reading).

### 3. The check stops running before the five read-only tools

New matcher for the gate check: `^(?!(?:Read|Grep|Glob|WebFetch|WebSearch)$).*`

| Tool | Can it move or edit a plan? | Gate check |
|---|---|---|
| Read | No: reads a file, image, PDF or notebook | skipped |
| Grep | No: searches file contents | skipped |
| Glob | No: lists file names | skipped |
| WebFetch | No: fetches a web page into the conversation | skipped |
| WebSearch | No: searches the web | skipped |
| Write, Edit, MultiEdit, NotebookEdit | Yes: write files, plans included (`plans/**.md` is edit-whitelisted) | runs |
| Bash, PowerShell | Yes: any shell command can move or rewrite a plan | runs |
| Agent (legacy name Task) | Not by itself, since a subagent's own tool calls fire this hook (verified 6). Kept: sweeping before a subagent is dispatched moves a planted plan back before a builder is pointed at it, and Agent is 1.6% of calls | runs |
| Model Context Protocol server tools (`mcp__…`), TodoWrite, Skill, any future tool | Some can write files, and the rest are unknown | runs |

**Why "everything except five" rather than a list of writing tools.** A list would silently
skip every tool not on it: PowerShell (the shell on Windows), a Model Context Protocol
server that writes files, and every future tool. Exclusion runs the check unless the tool is
one of five known to be read-only.

**Why this pattern works in Claude Code** (verified 4). It contains `^(?!…)`, so it is not
the plain-name form, and it is compiled with `new RegExp` and tested against the tool name.
It is valid JavaScript. It rejects exactly the five names and accepts every other name. The
trailing `.*` keeps the behaviour the same if some version anchors the pattern at both ends.
The regular-expression form was documented before Claude Code supported plugins, so every
version that can load CTOC is believed to treat it the same way; Step 9 confirms this with
the claude-code-guide agent. A tool whose alias is matched (for example a workspace
web-fetch tool) may still fire the hook, which costs time but is safe.

**The trade, stated.** Something outside Claude (the human's own terminal, a `git checkout`)
that moves a plan between calls is caught at the next non-read call instead of the next Read.
Nothing acts on plan state during a run of reads. The write-permission check
(`plan-coverage`) consults the ledger itself, so a planted plan grants no writes in the
meantime.

### 4. Words that must stay true

- `CLAUDE.md`, the "Human Gates" enforcement line (today: "Pre-tool hook monitors ALL tool
  calls … Plans at gate destinations need an `approved_by: human` marker or they get
  reverted", which is wrong on both counts). It becomes: the check runs before every tool
  call except the five read-only ones; a plan in a gate folder needs a ledger entry in
  `.ctoc/approvals/`, not a marker in its own text; and verdicts are remembered in
  `.ctoc/approvals/.gate-check-cache/`, inside the directory both channels deny. The
  test-file count goes from 547 to 548 in its two places in `CLAUDE.md` and once in
  `README.md` (or to whatever the documented-counts check reports at build time; the working
  tree already carries uncommitted edits to both files).
- Comments only:
  - `human-gate-check.js`: "Runs before EVERY tool call", the paragraph about matcher `"*"`,
    and the "fires on EVERY tool call" note at the withheld log;
  - `gate-migration.js`: header lines 7–9 and the "runs on every tool call" note;
  - `tests/gate-migration.test.js`: header line 6.

### 5. The three-platform job

One job added to `.github/workflows/tests.yml`, beside the existing Ubuntu job (which uses
`actions/checkout@v4` and `actions/setup-node@v4` and installs nothing; verified, read):

```yaml
  gate-check-cache:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22.x
      - run: node --test tests/the-gate-check-does-not-reread-unchanged-plans.test.js
```

`fail-fast: false`, so a failure on one system does not hide the result on the other two.
Test 4 (restored modification time) is the check that proves the status-change time on each
system; test 13 calibrates its limit to each runner's own status-check speed.

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| Verdict cache | `main()` → `checkFolder(folder, projectPath, cache)` in `src/hooks/human-gate-check.js` | the `PreToolUse` registration in the live hook manifest |
| Narrowed matcher | the gate check's entry in the live hook manifest | Claude Code's hook loader |
| Three-platform job | `.github/workflows/tests.yml` | every push and pull request to `main` |

### Security review

- No new module, no new export, no function that takes a verdict from its caller.
- The cache holds plan file names and file-status numbers only: no content, no secrets.
- It ignores itself in git, so it can never be committed.
- Every fault reads as a miss (recompute). A save fault changes nothing but speed.
- Status keys are taken before the reads they vouch for. Recent changes are not remembered.
- The trusted file's location is pinned against both agent write channels (test 7).

## Test plan (written first, Step 8)

One new file: `tests/the-gate-check-does-not-reread-unchanged-plans.test.js`.

**Harness.**
- Each case runs the real `main()` in a child process, rooted at a temporary project, the way
  `tests/human-gate-check-coverage.test.js` already does.
- A preload script, written into the temporary directory, wraps `fs.readFileSync`. It records
  every path under the fixture's `plans/` or `.ctoc/approvals/` (the cache directory
  excluded), and the time from the preload to exit. On `exit` it writes that JSON (`main()`
  ends with `process.exit`).
- Ledger entries are written by the real `approval-ledger`:
  - in `todo/`, `writeEntry` with `content` (the specification scope);
  - in `done/`, a precomputed whole-file hash;
  - in `implementation/`, a human entry.
- The migration marker is written, so reverts are armed.

**One wait.** Every fixture is built first, then the file waits 3.5 seconds once, because of
the 3-second rule. The first half of test 5 runs before that wait.

1. **Unchanged plans are not read.** A project with one accepted plan per folder and one fresh
   slice is swept twice. The second sweep reads no plan file and no ledger file. Red today.
2. **A changed plan is caught, and it is the only file read.** Append a path to the todo
   plan's `files:`. The next sweep moves it back to `implementation/` (`hash-mismatch`) and
   reads only that plan and its ledger entry. Red today, because today it reads every plan.
3. **A changed ledger entry is caught.**
   - Rewrite the done plan's entry to name `todo`: it is moved back (`wrong-edge`) and only it
     is read.
   - Rewrite the slice's parent entry to name `todo`: the slice and the parent are judged
     afresh and both flagged, and nothing else is read.

   Red today.
4. **Restoring the modification time does not fool it.** Before the wait, the fixture plan's
   times are set to a whole second, so they can be restored exactly. After warming the cache,
   replace one character in its `files:` line (same size, same file) and restore the times
   with `fs.utimesSync`. The plan is moved back, and no other plan is read. Red today (reads
   all). This proves the status-change time is load-bearing.
5. **Recent changes are read again.** A sweep right after the fixture is written remembers
   nothing, so the next immediate sweep reads the plans again. After the wait one sweep
   remembers them, and the following sweep reads none. Red today on the second half.
6. **A forged cache entry does not stop a revert.**
   - (a) The test writes into the real cache file a perfect entry, with current status keys
     and the current fingerprint, for a plan in `todo/` that has no ledger entry. The sweep
     moves the plan back, and the rewritten cache no longer holds the bogus entry.
   - (b) The same perfect entry is written where an agent could write it
     (`.ctoc/state/gate-check-cache.json`, `.ctoc/gate-check-cache/verdicts.json`). The plan
     is moved back.

   Red today on the rewritten-cache assertion.
7. **Only CTOC can write the trusted file.**
   - After a sweep the cache exists at `.ctoc/approvals/.gate-check-cache/verdicts.json`.
   - `isProtectedLedgerPath` from `PreToolUse.Edit.js` returns true for that path and for a
     letter-case variant of it.
   - The real shell hook, spawned as `tests/ledger-forgery-closed.test.js` spawns it, denies:
     - `echo {} > .ctoc/approvals/.gate-check-cache/verdicts.json`
     - `cp f.json .ctoc/approvals/.gate-check-cache/verdicts.json`
     - `cd .ctoc/approvals/.gate-check-cache && tee verdicts.json`
     - `rm -rf .ctoc/approvals/.gate-check-cache`

   Red today on the existence assertion. The deny assertions are green today by design (the
   location was chosen because it is already denied); they pin the location.
8. **Failing closed.** Each of these makes the sweep reread every plan, move back an edited
   plan, and write a valid cache again:
   - a cache file cut off mid-JSON;
   - `format: 2`;
   - a different `code`;
   - an entry with a malformed key;
   - the cache path replaced by a directory.

   Red today on the rewrite.
9. **A code change discards the cache.** After warming, the test sets `code` to 64 zeros. The
   next sweep reads every plan, and the one after that reads none. Red today on the second
   half.
10. **The fingerprint covers what the sweep loaded.** A sweep runs every branch (all three
    folders, a fresh slice, a hash-checked plan, a violation). Every CTOC `src/` module in
    `require.cache` at exit, as the preload records it, is listed in the cache's `codeFiles`.
    Red today.
11. **A plan with no ledger entry in `todo/` or `done/` is not read.** An unmigrated project
    holds three done plans with no entry. Over two sweeps they are reported, not moved, and
    never read. Red today.
12. **The matcher.**
    - The gate check's registration in the live manifest has exactly the new pattern.
    - It is not the plain-name form (`/^[a-zA-Z0-9_|, -]+$/` does not match it).
    - It compiles.
    - Tested both unanchored and anchored, it rejects exactly Read, Grep, Glob, WebFetch and
      WebSearch.
    - It accepts Bash, Edit, Write, MultiEdit, NotebookEdit, Agent, Task, PowerShell,
      TodoWrite, Skill, `mcp__filesystem__write_file`, `mcp__workspace__bash`,
      `ReadMcpResourceTool` and an invented future name.

    Red today (`"*"`). The test mirrors the 2.1.291 matching code read for this plan; it
    cannot run Claude Code itself, which is why Step 9 confirms the documentation.
13. **Speed, measured robustly.**
    - **Fixture and rounds.** 1,500 accepted plans, 500 per folder, about 8 KB each, with the
      cache warmed once after the wait. Two warm-up rounds, then 9 measured rounds, each
      alternating:
      - (a) the hook's `main()`;
      - (b) a bare script that lists the three folders and status-checks every plan and its
        ledger path with the same options, which is the irreducible work of this design.

      Both are timed from the preload to exit: the work after Node start, with no
      subtraction of two noisy numbers.
    - **Non-vacuity.** Every measured sweep read zero plan files; otherwise the timing
      measured the wrong path. The cache holds 1,500 entries.
    - **Assertion.** The median of (a) is at most `max(25 ms, 2 × median of (b))`. Every
      sample is printed on failure.
    - **Derivation.**
      - The profile measured a status-only sweep over 436 plans at 20.6 ms against an
        18.4 ms floor. That is 2.2 ms, about 5 microseconds per status check including the
        folder listings.
      - At 1,500 plans the cached sweep makes 3,000 status checks (about 15 ms). Module
        loading (0.2–4.9 ms in the profile), reading about 300 KB of cache and fingerprinting
        about ten files add a believed 3–5 ms: about 20 ms, under the owner's ceiling of
        about 25 ms of work above Node start.
      - The profile's load moved absolute times by up to 1.7 times. That would push a correct
        sweep to about 34 ms and fail a fixed 25 ms ceiling, so the ceiling rises with the
        bare run measured in the same rounds.
      - Today's uncached sweep at 1,500 plans is about 45 ms of work (67 measured, minus the
        20 ms floor and about 2 ms of loading). That is above 30 when unloaded and about 77
        against 51 at 1.7 times the load, so it fails. A correct sweep sits at about 20
        against 30, and about 34 against 51.
    - **Not repeated.** `tests/reachability-surface-scan-is-linear.test.js` failed under load
      because it took a single sample per side and used a fixed ratio; this test does
      neither.

    Red today (believed).

Recorded at Step 8, not asserted: the per-round numbers on this machine, and which existing
gate tests (if any) assert the old read pattern. If one does, the executor files a
scope-growth request; it does not edit a test outside `files:`.

## Acceptance Criteria

1. For an unchanged accepted plan, a sweep reads neither the plan file nor its ledger entry.
   It makes two status checks (three for a fresh slice).
2. A changed plan, a changed or removed ledger entry, or a changed parent ledger entry of a
   fresh slice is caught on the next call, and only the changed plans are read.
3. A forged, stale, corrupt or misplaced cache entry never stops a revert. A plan in `todo/`
   or `done/` with no ledger entry is never vouched for by the cache. The trusted cache file
   is one both agent write channels deny.
4. Any change to a CTOC `src/` module the sweep loads discards every remembered verdict.
5. The gate check no longer runs before Read, Grep, Glob, WebFetch or WebSearch. It runs
   before every other tool, PowerShell, Agent and Model Context Protocol server tools
   included.
6. Test 13 passes. On a copy of this repository (never the real one), the per-call time and
   per-call file reads of the gate check are measured before and after, median and maximum
   of 10 runs, and shown to the owner in full.
7. `npm test` passes: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json`
   `minPct`. The false-green, reachability, dead-export and golden-corpus fences do not move.
8. `CLAUDE.md`, `README.md` and the touched comments match the built behaviour.
9. The new test file passes on Ubuntu, macOS and Windows in the new job of
   `.github/workflows/tests.yml`.
10. At 3,000 plans the gate check's median is no longer growing with plan count. The
    threshold is the one test 13 uses: the median work above Node start is at most
    `max(25 ms, 2 × the median of a bare status-check run over the same 3,000 plans and their
    ledger entries)`, measured in the same rounds. What may still grow with the plan count is
    only the two status checks per plan, never the reading and hashing of plans (today:
    109 ms at 3,000 plans against 67 at 1,500, whole process).
11. The benchmark harness has recorded this fix in
    `.ctoc/audit/speed-and-size/benchmarks/results.json` and `RESULTS.md`: before and after
    medians of the per-tool-call hook cost and of the gate check alone at 300, 1,500 and
    3,000 plans, and the quality table (tests, failures, skipped, coverage).

## Dependencies and ordering

- **After the fingerprint-method fix in `contentMatches`, if both are approved** (the owner's
  ordering). That fix changes `src/lib/approval-ledger.js`, which this cache fingerprints, so
  either order stays correct: the first sweep after that fix discards the cache. No plan file
  for that fix exists yet (verified 7).
- **The hook-loading plan shares the manifest.** The functional plan "CTOC's hooks are actually
  loaded by Claude Code, and CTOC says out loud whenever they are not" moves the registration
  from `.claude-plugin/hooks.json` to `hooks/hooks.json`. Whichever plan builds second edits
  the live one; this plan never adds the other file. That plan also records that on
  2026-09-30 no CTOC hook ran in a live session. If that is still so, users pay none of this
  cost today, and gain none of this fix until that plan lands.
- **The shared benchmark harness** at `.ctoc/audit/speed-and-size/benchmarks/bench.js` must
  exist before Step 14. It is audit output under `.ctoc/`, edit-whitelisted, so it is not in
  `files:`.

## Question for the owner

None open. The one question this plan raised, how to verify the change signal on Windows and
macOS, was decided by CTO Chief (Decision 14).

## Decisions Taken Under Ambiguity

1. **The cache goes inside `.ctoc/approvals/` rather than onto the deny lists.**
   - Why: it is the only directory both channels deny today. `.ctoc/state/verify/` is denied
     on the edit channel only (Neighbours 1), so copying its treatment would have been weaker.
     The migration marker set the precedent.
   - Consequence: `PreToolUse.Edit.js` and `PreToolUse.Bash.js` are unchanged and left out of
     `files:`, giving the least write permission. Test 7 pins the location.
   - If test 7's deny half fails at Step 8 for any reason other than the missing cache, the
     executor files a scope-growth request.
2. **A subdirectory with its own `.gitignore`**, not a `.json` file at the top of
   `.ctoc/approvals/`.
   - `sufficiency-audit.auditSufficiencyCrossings` reads every top-level `*.json` there as a
     ledger entry, dot files included.
   - Git tracks the directory, so a top-level cache would show up as a changed file on every
     verdict change.
3. **Only acceptances are remembered.** The cache can only ever say "this exact state was
   accepted".
4. **No remembered acceptance for a ledger-less plan in `todo/` or `done/`.** It is two lines
   of code, and it makes the commonest forgery revert even against a cache writer.
5. **Fingerprint the verdict code's bytes, not `VERSION`.** `VERSION` does not move between
   releases while the code under test does.
6. **A 3-second margin, read from the filesystem's own clock.** It covers FAT's 2-second
   resolution with slack and is immune to clock skew on a network share.
7. **The matcher excludes five tools; it does not list the writers.** Agent stays in. The
   trailing `.*` keeps the pattern correct if a version anchors it.
8. **No new module.** The cache lives in the hook beside the sweep, so no export takes a
   verdict.
9. **`todo/` and `done/` read lazily.** The verdicts are the same and there are fewer reads.
10. **`type: functional`, because the plan sits in `plans/functional/`.** The body is
    implementation-level, as the brief asked.
11. **`approval-residency.js` and `approval-ledger.js` are not listed.** The verdict is not
    touched.
12. **Both manifest paths are listed.** Only the live one is edited, and the other is never
    added.
13. **Timing is taken from a preload and self-calibrated** against a bare status-check run in
    the same rounds.
14. **Decided by CTO Chief: a job in `.github/workflows/tests.yml` runs the new test file on
    Ubuntu, macOS and Windows on every push.** Reason: all three systems are checked on every
    change rather than once by hand.

## Neighbours (seen, not built here; scheduling is the owner's)

1. **The verify evidence checked before a plan is called done is not denied on the shell
   channel** (believed, from reading; not run). `checkWriteCoverage` in `PreToolUse.Bash.js`
   treats any path the edit hook's `isWhitelisted` accepts as infrastructure. `isWhitelisted`
   accepts all of `.ctoc/`; the verify and streaming denies live in `enforce()`, not in
   `isWhitelisted`. Only `isLedgerForgery` names a protected directory. So a determinate shell
   write into `.ctoc/state/verify/` would pass, while `CLAUDE.md` describes that directory as
   denied.
2. **The migration marker makes the sufficiency audit say "undetermined" in every migrated
   project** (believed, from reading). `.migration-complete.json` is listed as an entry, its
   name cannot be a slug, it reads as `unkeyable`, and any unreadable entry makes the verdict
   `undetermined`.
3. **The PowerShell tool and CTOC's shell gate.** CTOC registers its shell gate for `Bash`
   only. Whether Claude Code's tool-family matching extends a `Bash` matcher to PowerShell was
   not traced. If it does not, Windows sessions using PowerShell have no ledger deny and no
   shell write gate.
4. **The ledger's shell-channel deny is a text check.** An inline evaluation that builds the
   path from pieces is not named by it (believed, from reading). This holds equally for the
   ledger and the new cache.

## Execution Plan

### Step 8: TEST
- [ ] Add tests 1–13 to `tests/the-gate-check-does-not-reread-unchanged-plans.test.js`, with the preload harness and the single 3.5-second wait.
- [ ] Run the file. Expect red on every test, with the reasons listed above; record the failing lines and test 13's per-round numbers.
- [ ] Run the existing gate tests (`tests/human-gate-check-coverage.test.js`, `tests/gate-migration.test.js`, `tests/fresh-slice-exemption-parent-approval.test.js`, `tests/approval-hash-survives-execution.test.js`, `tests/gate-hook-revival.test.js`). Record that they are green today.

### Step 9: PREPARE
- [ ] Ask the claude-code-guide agent to confirm, from the official hooks documentation, that a matcher outside the plain-name form is a regular expression. Record the answer and any version range. If the installed Claude Code changed version, re-read its matcher function.
- [ ] Record `node --version`. On this machine, confirm that `statSync(…, { bigint: true, throwIfNoEntry: false })` returns nanosecond `mtimeNs` and `ctimeNs`, and that `ctimeNs` advances after `fs.utimesSync`.
- [ ] On a scratch copy of this repository, time a bare status-check run over its gate folders and ledger entries, to check the figure of about 5 microseconds per status check.
- [ ] Establish which manifest is live (`.claude-plugin/hooks.json` or `hooks/hooks.json`) at build time.
- [ ] Read the benchmark harness `.ctoc/audit/speed-and-size/benchmarks/bench.js` and record its exact options for the before tree, the after tree, the label and the plan counts. If it does not exist yet, record that Step 14 waits for it.

### Step 10: IMPLEMENT
- [ ] `src/hooks/human-gate-check.js`:
  - the status key, the fingerprint, the cache read (fail closed), the hit rule, the before-read status keys, the 3-second rule, the save;
  - the optional `cache` parameter of `checkFolder`, the lazy reads in `todo/` and `done/`, and the shared `parent_plan` helper;
  - `main()` requiring the verdict modules eagerly, opening the cache and saving it;
  - the header comments.
- [ ] The live hook manifest: the gate check's matcher.
- [ ] `src/lib/gate-migration.js` and `tests/gate-migration.test.js`: comments only.
- [ ] `CLAUDE.md` and `README.md`: the gate-check line, the cache sentence, the test-file count.
- [ ] `.github/workflows/tests.yml`: the three-platform job of Implementation Details 5.
- [ ] Run the new file and the existing gate tests. Expect green.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic` on the diff. Focus on:
  - every path out of the cache code that could yield "accepted";
  - status keys taken before reads, including the parent;
  - the 3-second rule's clock;
  - the ledger-less rule;
  - no new export;
  - the matcher against the verified matching code.

### Step 12: OPTIMIZE
- [ ] Fingerprint lazily, at most once per sweep. Serialise and write only when dirty. Make no status call twice for one file in a sweep.

### Step 13: SECURE
- [ ] Dispatch `security-scanner` on the diff:
  - the forged-entry, stale-entry and corrupt-cache cases;
  - the location pins on both channels;
  - no empty catch;
  - nothing from plan text reaches a path except through `slugFromPlanPath` and `ledgerPath`'s slug guard.

### Step 14: VERIFY
- [ ] Run `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`.
- [ ] Run the linter over the changed files: zero warnings.
- [ ] Run the new test file three times in a row, then once while `npm test` runs beside it. It must be green every time (the flakiness check).
- [ ] Confirm the false-green, reachability, dead-export and golden-corpus fences have unchanged counts.
- [ ] Confirm the three-platform job is green on Ubuntu, macOS and Windows.
- [ ] Run the benchmark harness `.ctoc/audit/speed-and-size/benchmarks/bench.js` with the before tree a git worktree (in the scratch directory) of the commit before this fix, the after tree the fixed tree, and the label "the gate check does not reread every plan", using the options recorded at Step 9. Remove the worktree afterwards.
- [ ] Confirm the harness appended to `results.json` and `RESULTS.md` in that folder:
  - before and after medians of the per-tool-call hook cost and of the gate check alone, at 300, 1,500 and 3,000 plans;
  - the quality table: tests, failures, skipped, coverage.
- [ ] Check acceptance criterion 10 at 3,000 plans: the gate check's median work above Node start is at most `max(25 ms, 2 × the median of a bare status-check run over the same plans and ledger entries)`, measured in the same rounds. Record the numbers.

### Step 15: DOCUMENT
- [ ] Confirm `CLAUDE.md`, `README.md` and the touched comments match the built behaviour.
- [ ] Add JSDoc to the cache helpers in `human-gate-check.js`.

### Step 16: FINAL-REVIEW
- [ ] On a copy of this repository, never the real one, show the owner in full:
  - the harness's before and after table for this fix, as recorded in `RESULTS.md`;
  - the gate check's per-call time and per-call file reads before and after (10 runs, median and maximum);
  - a plan planted in `todo/` with no approval still being moved back;
  - an approved todo plan edited with its modification time restored still being moved back.
- [ ] Dispatch `iron-loop-critic` for the final review against the acceptance criteria.
- [ ] Hand the result to the owner for his decision to call it done.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
