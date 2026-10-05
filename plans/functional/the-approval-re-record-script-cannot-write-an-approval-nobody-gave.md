---
title: "The approval re-record script cannot write an approval nobody gave"
type: functional
status: functional
created: 2026-09-30
priority: high
effort: large
depends_on: none
---

# The approval re-record script cannot write an approval nobody gave

## 1. ASSESS — Problem Understanding

### What happened

On 2026-09-30 a session ran the approval-ledger backfill script with a plan that resided in the in-progress folder, the stage `todo`, the hash scope `specification` and a reason. This was done on your explicit word. The script wrote a ledger entry marked `approved_by: "human"` and `backfilled: true`. Straight afterwards the write-permission check accepted that plan as granting permission to write a file that had just been added to its declared list. The shell hook did not stop the run. Nothing in the code required your word. (This paragraph is the session's observation as given to me; I did not see it happen and I ran nothing.)

The incident was not a hook failing. By reading (fact 3) no layer of the shell hook was ever written to stop this command.

The requirement, as I received it: the script must not be able to produce an approval nobody gave, while the legitimate uses keep working (the legacy migration, and re-recording a plan's fingerprint after its declared files are widened), and it must be clear how the human's act authorises each, given that a model session can run any program.

### How to read this plan

Everything below was read from files on disk today. I hold no way to run a program in this session, so no behaviour was observed. Statements are labelled **read** (I read the code that does it), **believed** (inferred or recalled, not checked) or **not verified**. Every claim about what the code does at run time is therefore "by reading", and the first group of scenarios exists to turn the important ones into observations.

### What is true on disk today

**1. What the script accepts and what it writes (read).** The argument parser takes the next argument as a flag's value without looking at what it is:

```
      case '--plan': opts.plan = list[++i]; break;
      case '--stage': opts.stage = list[++i]; break;
      case '--reason': opts.reason = list[++i]; break;
      case '--hash-scope': opts.hashScope = list[++i]; break;
      case '--root': opts.root = list[++i]; break;
```

The project root comes from a flag only if the value is truthy, otherwise from the current directory:

```
  const root = opts.root ? String(opts.root) : cwd;
```

The single-plan mode resolves the path and checks only that something exists there. It does not compare the path or the stage with where the plan lives:

```
  const planPath = path.isAbsolute(opts.plan) ? opts.plan : path.join(root, opts.plan);
  if (!safeFs.existsSync(planPath)) {
    return { ok: false, ledgered: [], skipped: [], error: `plan not found: ${planPath}` };
  }
  const slug = ledger.slugFromPlanPath(planPath);
  if (opts.dryRun) return { ok: true, ledgered: [slug], skipped: [] };
```

The ledger function it calls reads that file, keys the entry on the file's base name, and writes the human marker with whatever stage was asked for:

```
  return writeEntry(slug, {
    ...digest,
    stage_from: sourceOf(stage_to) || 'backfill',
    stage_to,
    approved_by: 'human',
    backfilled: true,
    backfill_reason: reason !== undefined ? reason : '',
    plan_basename: originalBasename,
  }, projectPath);
```

**2. What each decision in the product does with such an entry (read).** The entry is classified like this, with `backfilled` tested before the human marker:

```
  if (entry.backfilled === true) return 'backfilled';
  if (entry.approved_by === 'human') return 'human';
  return 'unknown';
```

The residency check rejects an unknown kind, a pipeline kind outside the done folder, and a sufficiency kind outside the pre-build folders. It has no rejection for `backfilled`. So, by reading, a backfilled entry whose stage matches the folder (and whose hash matches, in the todo and done folders) is accepted. The consumers I read:

| Decision | Where | Accepts a backfilled entry, by reading |
|---|---|---|
| Permission to edit a file that a plan declares (Edit tools) | the plan-coverage scan, through the approved-residency check, which classifies a plan in todo or in-progress against the todo edge | yes, when the hash matches |
| The same permission for shell writes | the same scan, called by the shell hook | yes |
| Permission over CTOC's own enforcement code (hooks, the ledger, the coverage check, the gate order, this script) | the protected-paths list | yes: the human kinds are `human` and `backfilled` (excerpts below) |
| Permission over the whole repository through a wildcard entry | the coverage module's own description: an unanchored entry is accepted when the plan's approved text carries a non-empty acknowledgement line (the declared-breadth module itself was not read) | yes, by that description: the acknowledgement is text the same session writes into the plan |
| Whether a plan resident in implementation, todo or done is flagged by the sweep that runs on every tool call | the residency sweep | yes at all three; the hash is compared in todo and done only |
| Whether a freshly written slice in implementation is exempt from the sweep | the exemption for slices, which asks the residency check whether the named parent would be accepted | yes |
| The ordinary crossing from review to done | the review-to-done validator, which I read in full | it does not read the ledger at all: it checks the step boxes and the verification evidence |
| Permission granted by a plan resident in implementation | the closed edge map in the approved-residency module lists only todo and in-progress | no, even with an entry |

```
const HUMAN_COVERAGE_KINDS = new Set(['human', 'backfilled']);
```

```
        if (
          protectedPaths.isProtectedEnforcementPath(relTarget) &&
          !protectedPaths.isHumanCoverageKind(approval.kind)
        ) {
```

The consequence, by reading: an entry minted by this script can grant write permission over ordinary files, over the hook and ledger code, and (with a wildcard and an acknowledgement line the same session writes) over the whole tree; and it can make a plan written straight into the done folder pass the sweep. In this project, which is not marked as migrated (fact 5), the sweep reports rather than reverts a plan with no entry, so a forged entry here turns a reported violation into a silent one. In a migrated project it turns a revert into a keep. I have observed neither.

**3. What the shell hook does for the script (read).** The hook names the script in comments, in a constant, and in two deny messages that point people to it. It has no rule that allows the script and none that denies it. A command that runs the script carries no `.ctoc/approvals` path and is not an inline evaluation, so none of the ledger layers match. The classifier calls any `node` command an interpreter and returns its third answer, `indeterminate`:

```
  const classified = shellWrites.classifyWrites(command);
  const isWrite = classified.verdict !== 'none';
```

An indeterminate command counts as a write only for the build-step gate, which needs a feature in the state and a step of at least 8. The coverage stage acts only on the answer `writes`, so it never looks at this command. The one existing test that names the script asserts it is allowed:

```
  test('the sanctioned backfill script is ALLOWED', () => {
    assertAllowed('node src/scripts/ledger-backfill.js --vision', 'sanctioned ledger writer');
    assertAllowed('node "${CLAUDE_PLUGIN_ROOT}/src/scripts/ledger-backfill.js" --plan plans/done/x.md --stage done --reason legacy',
      'sanctioned ledger writer, plugin-root form');
  });
```

The inline-evaluation deny works from a token list that names the ledger module, the ledger directory and the ledger function names. It does not contain the script's name:

```
const LEDGER_EVAL_TOKENS = [
  /approval[-_]ledger/i,
  LEDGER_PATH_RE,
  /\bwriteEntry\b/,
  ...
  /\bapproveSubplans\b/,
];
```

The script exports its `run` function. So by reading, an inline evaluation that requires the script and calls `run` with the same arguments is not denied. Scenario 28 turns that into an observation.

**4. An older copy of the script exists on this machine (a directory listing, today).** `<home>/.claude/plugins/cache/robotijn/ctoc/6.14.67/src/scripts/ledger-backfill.js` exists; the repository is at 6.14.71. I read lines 96 to 235 of the older copy: the parser, vision mode and single-plan mode read the same as the current file. It takes `--root`, so it can be pointed at this project. Any fix inside the script alone is therefore bypassed by running the older copy by its path.

**5. This project has no migration marker (reading that path, today).** The file `.ctoc/approvals/.migration-complete.json` does not exist. The marker is what arms the revert of a plan with no ledger entry; without it the sweep only reports.

**6. The legitimate uses are four, not two (read).** They are: (a) the legacy migration of plans that crossed a human decision before the ledger existed; (b) re-recording after the hash rules changed, which the ledger module's own comment says moved 35 already-recorded digests and was repaired through this script with `--hash-scope specification`; (c) re-recording after the declared files are widened; (d) re-recording after a plan is sent back and reworked. Both real captured entries in the golden corpus are the fourth kind. One of them, byte for byte:

```
{
  "content_sha256": "1f2ab0092f1bd7658361689d3f8ef8b284dbea592c817d5c9ccae617aa2b35b7",
  "hash_scope": "file",
  "stage_from": "implementation",
  "stage_to": "todo",
  "approved_at": "2026-07-26T20:43:41.581Z",
  "approved_by": "human",
  "backfilled": true,
  "backfill_reason": "2026-07-26: human ruling — review-stage hardening wave (00003/04/05/09/10) sent back to todo for rework, each rebuilt on a GREEN full npm test gate. Residency re-backfilled after the r2c2 rework edits (autoApprove one-turn signal deleted so the human gate needs an explicit click; files: corrected to disk; Decisions record reconciled with disk); recorded as backfilled, not a live click.",
  "plan_basename": "00010-r2c2-persisted-answers-unblocked"
}
```

The other real sample carries the longest reason on record, 395 characters (the corpus manifest measures it). Both reasons are written in the human's ruling voice, which is why a mandatory, bounded reason is compatible with real data.

**7. There is no menu route for widening declared files or re-recording (read).** The scope-growth module files a question in the inbox questions stream. The inbox questions door is read-only: a test asserts its only action is `◀ Back`, the inbox area's key handler returns false, and the inbox module has functions that create and list items and none that answer one. The action table in the start instructions has no row that widens declared files or re-records a fingerprint. Yet both the scope-growth header and the executor's rule say a human widens scope "through the menu". The only mechanical way to regain coverage after a widening is therefore this script. I did not read all of the menu-screens module, so "no route exists" is a strong belief resting on the readers and the test above, not a census.

**8. Nothing in the code witnesses a human click anywhere (read).** The approval function validates the transition, moves the plan and writes the entry; it does not check that a human asked. The start instructions say to wait for the human's explicit click, which is an instruction to the session. So every approval in the product rests on the session obeying that instruction, and the ledger is protected only by keeping every writer other than the sanctioned code paths out. This script differs from the approval function in one important way: it skips the transition validation, the move and the source-stage check entirely. That is the gap this plan closes. The shared limit (no click witness in the menu path either) is stated in Question 1 and in the risks.

**9. The ten reported defects (read).** Status against the code:

| # | Reported defect | Status by reading |
|---|---|---|
| 1 | `--plan` and `--stage` are never compared with where the plan lives; absolute and `../` paths are accepted; the entry gets the requested stage | Confirmed (fact 1). Which decisions accept the result is scenarios 1 to 3. |
| 2 | A flag's missing value swallows the next flag (`--reason --dry-run` records the reason `--dry-run` and writes for real); `--root` last or empty becomes the current directory; a repeated flag keeps the last value | Confirmed. `--dry-run` is only recognised as its own argument, so as a reason value it is not a dry run. |
| 3 | `--reason` is optional and unbounded; an empty reason is recorded | Confirmed. An omitted reason is written as an empty string, and an existing test pins that. |
| 4 | Single-plan mode only checks existence; vision mode refuses links, non-regular files and oversized files | Confirmed. Vision mode reads the file's own status without following links and applies a size bound of 1 MiB (`1 << 20` in the file). A named pipe would pass the existence check and be read to its end (believed; scenario 6 decides). |
| 5 | `--mark-migrated` on a root with no plans folder writes a "verified" marker and exits 0 | Confirmed, with one correction. The sweep function returns an empty list for a missing folder, so nothing is pending and the marker is written. What gets created is the ledger folder under `.ctoc`, through the marker writer; the plans folders are not created. |
| 6 | An empty `--hash-scope` value falls back to whole-file scope | **Not a defect as stated.** An empty string is not undefined, matches neither scope, and the single-plan function returns an error for it. The real silent fallback is the flag given as the last argument with no value: it is stored as undefined, indistinguishable from absent, and means whole-file scope. That is defect 2 again. |
| 7 | The count of ledger entries written into the marker is 0 when the ledger cannot be read | Confirmed (excerpt below). A missing ledger folder is a real zero; an unreadable one is not. |
| 8 | A corrupt or unkeyable entry is reported as already ledgered | Confirmed (excerpt below). |
| 9 | Vision mode exits 0 when a ledger write failed, with the failure mixed into the skips | Confirmed, and an existing test asserts the success result. |
| 10 | The directory listing in vision mode sits outside any `try` although the function claims never to throw | Confirmed. The command-line block calls the function without a `try`, so a listing failure escapes as an uncaught exception with a stack trace; the exit status is still non-zero. |

```
function countLedgerEntries(root) {
  try {
    const dir = ledger.ledgerDir(root);
    if (!safeFs.existsSync(dir)) return 0;
    return safeFs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.')).length;
  } catch {
    return 0;
  }
}
```

```
    if (ledger.readEntryResult(slug, root).status !== 'absent') {
      skipped.push({ plan: slug, reason: 'already-ledgered' });
      continue;
    }
```

**10. Further defects I found while reading (mine, not from the two reviewers).**

- Dry run validates nothing. In single-plan mode it returns success straight after the existence check, so it reports success for a plan whose real run fails with an invalid slug.
- Vision mode records a done-folder residency for any file whose frontmatter says `type: vision`, without checking that a decomposition happened. The sweep module's header records that this exact weakness let any session put a one-line file into the done folder; the exemption was removed, but this script re-creates the same acceptance as a pipeline entry.
- The entry hashes bytes read a second time inside the ledger function, not the bytes the script examined. Nothing ties the digest to what was checked.
- The run function is callable in-process by an inline evaluation (fact 3).
- A backfilled entry counts as a human kind for CTOC's own enforcement code (fact 2). That is a rule of the coverage check, not of the script, and it is Question 2.

**11. A trap in the confinement module (read).** Two functions answer opposite questions and fail in opposite directions: one returns true when a target escapes the project, the other returns true when a target lands inside a protected directory, and both return true on any fault. Using the second to admit a plan path ("does it land under plans/todo?") would admit on a fault. The plan path check must be written with its own comparison of real paths, failing to refusal.

**12. Existing tests that pin behaviour this plan changes (read).** In the backfill coverage test: an omitted reason is recorded as empty; a vision-mode write failure yields success; a plan with an invalid slug is expected to fail with the text "Invalid slug". In the forgery test: the sanctioned script is asserted allowed with no confirmation, and several tests write through the script with no confirmation. Each change needs the written justification described under Definition of Done.

**13. What a witness could stand on (read).** The prompt hook is registered in the plugin's hook file and receives the human's prompt text in a field called `prompt`:

```
    const prompt = typeof input.prompt === 'string' ? input.prompt : '';
```

The ledger folder is denied to the Edit tools and to non-read shell commands, and reading it stays allowed (the forgery test asserts that `cat` and `ls` of the ledger pass). A shared append-only log primitive with a fixed bound already exists and is used by the gate hook:

```
function logViolation(entry) {
  durableLog.appendEntry(VIOLATIONS_FILE, entry, { maxEntries: 100 });
}
```

The test that classifies every real ledger entry lists the folder and treats every file ending in `.json` as an entry, and the entry counter does the same for names not starting with a dot. So any new record file in that folder must not end in `.json`.

### The problem in one paragraph

The only tool that writes approval records outside a live approval is a script that validates almost nothing and needs nobody's word. What it writes is accepted by the write-permission check (including over CTOC's own enforcement code), by the residency sweep, and by the exemption for slices. It also has real defects in argument handling and honest reporting. Its legitimate uses (four, not two) must keep working, and each must be authorised by the human in a way the code can check.

## 2. ALIGN — Approach

### The property

No run of the script, however it is invoked, records anything unless (1) the thing recorded is a true statement about where a plan already is and what already happened to it, and (2) a human, by an act the session cannot perform for them, ordered exactly that record.

The plan splits this in two on purpose. Part 1 is engineering: the script becomes incapable of recording untrue statements. That is chosen by quality and is not a question for you. Part 2 decides what counts as your approval, which is yours to decide (Question 1). The design below is complete for one answer to Question 1 and lists what changes for the others.

### Candidate mechanisms for the human's act, grounded in the code

| Mechanism | Grounded in | What it gives | What it costs or fails to do |
|---|---|---|---|
| A confirmation code you type as an ordinary message, recorded by the prompt hook into a store the session cannot write, and checked by the script | the registered prompt hook and its `prompt` field; the ledger folder's write denial; the bounded log primitive | The script's write is checked against something the session cannot produce; the code is derived from exactly what will be recorded, so a changed plan, reason, stage or list invalidates it; the entry records the code | You copy a code; a code given as the answer to a menu question tool is not a typed prompt; a new hook body runs on every prompt (it must never block); it depends on the harness firing the hook only for what you type (believed; scenario 29 measures it); it does not stop a session that writes and runs its own program |
| Reading the transcript in the shell hook, the way the escape phrase is read | the exported role-scoped extractor of user-typed text | No new hook body; already trusted for the escape phrase | The transcript also holds harness-injected user-role entries and, inside a background agent, the parent's brief (believed, not observed); the shell hook fails open on its own crash; the script cannot check it, so an in-process call skips it |
| You run the script in your own terminal and type at the terminal | none in the repository | Independent of every hook and of the session | You leave the session for each re-record, which during a build is frequent; terminal-device code differs on Windows and Unix and the project must run on both; a session with a shell can attempt to fake a terminal |
| A secret the hook holds and the script checks | none | Would not need you | The session runs as the same operating-system user and can read every project file (reading the ledger folder is allowed); a secret on disk is readable |
| The menu's ordinary approval path, trusting the session to wait for your click | the approval function and the start instructions | No new mechanism; identical trust to every approval today | The property is not enforced by code; this is today's observed behaviour |
| Remove the script's power: entries it writes are a kind that grants nothing | the entry-kind classifier | Removes the forgery outright | Defeats the point: a re-record must restore write permission after a widening, and the roughly 210 existing backfilled entries (the count comes from a dated comment in the ledger module; not re-measured today) would lose their standing |

### The design (complete for the typed-code answer)

**The script records only what is true.**

1. One inspection function serves every mode. A plan path must resolve, by real paths, to a regular file (not a link, directory, pipe or device) sitting directly inside the plans folder that the requested stage names, inside the project, at or under the size bound vision mode already uses. It fails to refusal on any fault.
2. The stage must equal the edge the plan's folder is classified against. The three gate-destination folders come from the one gate-order encoding, and the rule that in-progress is classified against todo already exists in the approved-residency module's edge map; the script reads both instead of restating them. A plan in review, functional, vision or canvas cannot be recorded at all.
3. A plan that already has a readable entry may be re-recorded only at the same edge. A corrupt, unkeyable or unrecognised entry is refused: the plan is reverted and crossed through the menu. A plan with no entry may be recorded for the first time only while the project has no migration marker (the legacy migration). Once the marker exists, a plan with no entry is by the project's own doctrine a forgery, and the recovery is revert and cross through the menu, which validates the transition. This keeps the script from being a second way across a gate that skips validation.
4. The reason is required in plan mode, must not be empty after trimming, must not exceed 2000 characters (about five times the longest real reason, 395), and must not contain control characters. The real reasons pass.
5. The digest recorded is the digest of the bytes the script examined and the human confirmed. The ledger function accepts those bytes instead of reading the file again.

**Argument handling is strict.** A value-taking flag with no value, or with a value that is itself a flag, is an error naming the flag. An empty root, or a root that is not a directory holding both a plans folder and a `.ctoc` folder, is an error and never falls back to the current directory. A repeated single-value flag is an error. `--plan` may be repeated to record a list in one confirmed run, which keeps the legacy migration of many plans workable (a stage-wide selector is not added); a duplicated path is an error.

**Results are honest.** The result has three lists: `recorded`, `skipped` (routine non-actions such as already recorded or not a vision) and `failed` (everything that went wrong). Any failure, refusal or missing confirmation makes the result not ok and the exit status 1, while the run still continues over the remaining items. The function never throws. Dry run performs the full validation and prints exactly what a confirmed run would record.

**Marking the project migrated** is refused unless the project has a plans folder and a `.ctoc` folder, is refused when the ledger cannot be listed (a missing ledger folder is a true zero), and records the number of entries only when it was read.

**Each write mode needs the human's typed code** (typed-code answer only).

- Without `--confirm`, a write mode records nothing, prints the summary and the code, and exits 1 so that it never reads as success. With `--dry-run` it prints the same and exits 0. With both, nothing is written.
- The code is the first twelve hexadecimal characters (48 bits) of a content hash over a canonical description of the request: the mode, the stage, the hash scope, whether force was given, the hash of the reason, and for each plan (sorted) its name, folder, the digest that would be recorded, and the entry it would replace (kind, edge and stored hash, or none).
- The summary lists every plan with nothing truncated: where it resides, the edge, the digest prefix, the entry it replaces, and the plan's declared files in full, with entries that name CTOC's own enforcement code or use a wildcard marked. It ends with the exact sentence for the human to type.
- You type `confirm <code>` as an ordinary message. The prompt hook records only a code that follows the word `confirm` (any capitalisation) and is exactly twelve hexadecimal characters, into a bounded store in the ledger folder. The store's name does not end in `.json`. The hook still always exits 0 and never blocks a prompt; if it cannot record, it stays silent and the script will refuse.
- With `--confirm <code>` the script recomputes the code from the disk as it is now and refuses unless it equals the given code (printing the current one), then refuses unless the code is in the store. Only then does it write. The entry records the code. A batch that partly fails keeps the code valid for a retry of the same request.

**The shell hook gets two small rules** (typed-code answer only). Inline evaluation that names the script is denied like the other ledger names. A command that runs any file named `ledger-backfill.js` by an explicit path is denied unless that file contains the fixed sentence the current script carries near its top, saying it requires a typed confirmation. That stops the older copy under the plugin cache (which lacks the sentence) while the current script, in this repository or in the plugin, passes. A path the hook cannot resolve is denied with an explanation to use the recipe form. The residual is a session that copies the script, edits it to add the sentence and removes its checks: that is a session writing its own program, the ceiling the ledger header already states.

**Wiring.** The recipe rows in the start instructions become the two-step route (dry run, then confirm after you type the code), and the two sentences that promise a menu route for widening scope are corrected to describe the real route. The library module that records and reads the typed codes is required by the prompt hook and by the script, both live roots.

### How the human's act authorises each use (typed-code answer)

| Use | What you see | What you type | What must hold for the write | What the entry records |
|---|---|---|---|---|
| Legacy migration of plans that predate the ledger (only while no migration marker exists) | the list of plans, where each sits, the edge, that none has an entry, the reason | `confirm` and the code | the code equals the recomputed one and is in the store; each plan sits in the folder its edge names | backfilled, the reason, the code |
| Marking the project migrated | the residents still without an entry (none unless forced), whether force is given | `confirm` and the code | the same, plus the plans and `.ctoc` folders exist and the ledger was listable | the marker with its mode and the code |
| Re-recording after the hash rules change (many plans) | the list, each entry it replaces, the specification scope | `confirm` and the code | each plan has a readable entry at the same edge | backfilled, the code |
| Re-recording after declared files are widened, or after rework | the declared files in full with wildcard and enforcement-code marks, the entry it replaces | `confirm` and the code | same edge; the digest is of the widened text you were shown | backfilled, the code |

Between the widening and the re-record the plan grants nothing (its old entry no longer matches its text). After the re-record it grants what you were shown. If you never type the code, it never does.

### What stays open, said plainly

A session that writes its own program and runs it is not stopped by anything here; the ledger header already says so. The summary you read is relayed by the session, so a session that misdescribes it can mislead you; the code is derived from the true request, so it cannot make a different request match. The menu's ordinary approval has no click witness either (fact 8). This plan builds a witness for the re-record script only. The same store could serve the menu path; this plan does not do that, and whether to is your decision.

## 3. CAPTURE — Acceptance Criteria

Every scenario is a committed test or a recorded output. Fixtures are real temporary directories with real plan files, the real ledger module, the real sweep, the real coverage scan and the real spawned hooks. Nothing is replaced by a test double. Each scenario is written as a test first, run, and seen failing against today's code before any product code changes. Where reading says a scenario already passes today it is marked *characterization* and is accounted for as a finding, not banked as progress. Scenarios marked *typed-code* apply if you answer Question 1 with the typed-code option; if you choose another option they are replaced as Question 1 lists.

### A. The running census (recorded outputs; no product code changes to take them)

1. **The blast radius, by running.** GIVEN a fixture project (with a real hook state at a step of 8 or more), WHEN today's script records a backfilled entry for each of: a plan the fixture wrote into todo; one into in-progress (recorded at todo); one into implementation; one written directly into done; one in review recorded at done, THEN the census records, per plan, the real answer of: (a) the coverage scan for an ordinary declared file; (b) the coverage scan for a declared file under the hooks folder; (c) the coverage scan for a wildcard entry with an acknowledgement line the fixture wrote; (d) whether the residency sweep flags the plan in its folder; (e) whether a slice naming it as parent is exempted; (f) whether a shell write to the declared file gets through the real spawned shell hook; (g) which build-step state the shell hook needed to let the script itself run. The review plan is recorded as "not scanned" where no decision reads that folder. Proof: the table is recorded in the plan's execution record before any change. It shows the yes answers the reading predicts, or the correction where reading was wrong. After the change the same census is re-run and every row without a confirmation shows a refusal.
2. **The final approval, by running.** GIVEN a plan in review with a backfilled entry claiming done and no verification evidence, WHEN the ordinary approval to done is attempted, THEN it is refused for the missing evidence (*characterization*: the entry does not stand in for evidence). GIVEN a plan written directly into done with a backfilled entry, THEN the sweep does not flag it (this is the finding; after the change the script cannot create that entry without your code, and a migrated project cannot create it at all). Proof: a test running the real approval function and the real sweep.
3. **Every consumer, by real analysis.** WHEN the reachability tooling (the call-graph analysis the repository already runs, never a text search) lists every caller of the ledger's entry readers, its kind classifier, the residency check and the coverage approval check, THEN each caller not in the table under fact 2 gets a row and is driven with a real backfilled entry. Proof: recorded output naming the tool and the callers found.

### B. The ten reported defects and my additions (a test first, seen failing)

4. **Defect 1, stage against location.** GIVEN a plan in review, WHEN `--plan plans/review/x.md --stage done` is run with valid confirmation, THEN it is refused with the reason that the plan sits in review, and no entry exists. Likewise a plan in todo with stage done, and a plan in in-progress with stage done. Positive cases: in-progress with todo, todo with todo, done with done, implementation with implementation are accepted.
5. **Defect 1, path confinement.** GIVEN an absolute path to a plan outside the project, a relative path with `..` leaving the plans folder, a plan in a nested subfolder of a stage folder, and a stage folder that is itself a link pointing elsewhere, THEN each is refused with a distinct reason and nothing is written.
6. **Defect 4, file kinds.** GIVEN the plan path is a symbolic link to a file inside the plans folder, a link to a file outside, a directory named `x.md`, a file over the size bound, and (on systems that support it) a named pipe, THEN each is refused with its own reason, the pipe case within a bounded time, and single-plan mode and vision mode give the same answer for the same file (one shared inspection function). The pipe and permission cases skip loudly with a printed reason on Windows and as the super-user.
7. **Defect 2, a flag without a value.** GIVEN each of `--plan`, `--stage`, `--reason`, `--hash-scope`, `--root`, `--confirm` as the last argument or immediately followed by another flag, THEN the run fails naming the flag and writes nothing. Specifically `--reason --dry-run` no longer records `--dry-run` as a reason and no longer writes.
8. **Defect 2, the root.** GIVEN `--root` with an empty value, a directory that does not exist, and a directory lacking a plans folder or a `.ctoc` folder, THEN each is an error and none falls back to the current directory.
9. **Defect 2, repeats.** GIVEN `--stage`, `--reason`, `--root`, `--hash-scope` or `--confirm` given twice, THEN the run fails naming the flag. GIVEN `--plan` given twice with different paths, THEN both are processed as a list; the same path twice is an error.
10. **Defect 3, the reason.** GIVEN no reason, an empty or blank reason, a reason of 2001 characters, and a reason containing a line break, THEN plan mode fails and writes nothing. GIVEN each of the two real reasons captured in the golden corpus (including the one of 395 characters), THEN the reason is accepted and recorded byte for byte.
11. **Defect 5, marking migrated.** GIVEN a root with no plans folder, and a root with a plans folder but no `.ctoc`, WHEN `--mark-migrated` is run, THEN it is refused, no marker is written and no ledger folder is created.
12. **Defect 6, hash scope.** GIVEN `--hash-scope ""`, THEN the run fails (*characterization*: passes today). GIVEN `--hash-scope` as the last argument, THEN the run fails (fails today: it silently means whole-file scope).
13. **Defect 7, the count.** GIVEN a ledger folder that cannot be listed but can be written to (owner write and search permission only, on systems that support it), WHEN `--mark-migrated` is run, THEN it is refused saying the ledger is unreadable, and no marker records a count. GIVEN no ledger folder at all, THEN the marker records a count of 0 (a true zero).
14. **Defect 8, corrupt and unkeyable entries.** GIVEN a vision archive whose ledger entry is corrupt, and one whose file name cannot be keyed, WHEN `--vision` is run, THEN each is reported under `failed` with its own reason (never as already recorded), the result is not ok, the exit status is 1, and the remaining archives are still processed. An archive with a good entry is still reported as already recorded.
15. **Defect 9, write failures.** GIVEN three archives where the write for the second fails, WHEN `--vision` is run, THEN the first and third are recorded, the second is under `failed`, and the exit status is 1. (The existing test that asserts success changes; see the justification rule.)
16. **Defect 10, the listing.** GIVEN the done folder exists but cannot be listed (a file where the folder belongs; a permissions variant on systems that support it), WHEN the run function is called in-process, THEN no exception escapes, the result is not ok, and the command line prints one plain line and exits 1 with no stack trace.
17. **My addition, dry run validates.** GIVEN a plan whose name cannot be keyed, WHEN `--dry-run` is run, THEN it fails exactly as the real run would (fails today: it reports success).
18. **My addition, the digest is of the confirmed bytes.** GIVEN the ledger function is handed bytes that differ from the file on disk, THEN the recorded digest is of the handed bytes and the file is not read again.

### C. Confirmation (typed-code)

19. **No confirmation, nothing recorded.** GIVEN a valid request with no `--confirm`, THEN nothing is written, the exit status is 1, and the output has the full summary (every plan, nothing truncated), the code, and the sentence for the human to type. With `--dry-run` the output is the same and the exit status is 0.
20. **A wrong code.** GIVEN `--confirm` with a code that is not the recomputed one, THEN nothing is written and the output shows the current code.
21. **A code you did not type.** GIVEN the recomputed code but a store that does not contain it, THEN nothing is written and the message says the code has not been typed by you.
22. **The code binds the request.** GIVEN a code in the store, WHEN any one of these changes: one character of the plan, the reason, the stage, the hash scope, the list of plans, the entry being replaced, force, THEN the recomputed code differs and the run is refused. GIVEN a batch of N plans, THEN one code covers exactly that list and dropping one plan changes it.
23. **A typed code is accepted.** GIVEN a code recorded by the real prompt hook from a real payload, THEN the run writes, the entry carries the code, its kind is `backfilled`, and the residency and coverage answers are the ones the census recorded for a legitimate entry.
24. **The prompt hook records only what it should.** GIVEN payloads through the real hook: `confirm 3f9a12c4b7e0` is recorded; `Confirm 3F9A12C4B7E0` is recorded lower-cased; the same code without the word `confirm` is not; an eleven or thirteen character token is not; a hundred and one different codes leave the store at its bound with the oldest gone; and in every case the hook exits 0 and its routing reminder is unchanged. GIVEN a store that cannot be written, THEN the hook still exits 0.
25. **The session cannot write the store.** GIVEN the real Edit hook and the real shell hook, THEN a write to the store by the Edit tools is denied and `echo x >> .ctoc/approvals/<store name>` is denied; `cat` of it is allowed.
26. **The store does not look like an entry.** GIVEN the store present in a fixture ledger folder, THEN the existing test that classifies every real ledger entry, and the entry counter, are unaffected because the store's name does not end in `.json`.
27. **The shell hook, current script.** GIVEN the real spawned shell hook, THEN the dry-run and confirm shapes of the current script (relative path and the plugin-root form) are allowed, and `cat` of the script is allowed.
28. **The shell hook, bypass shapes.** THEN `node -e` requiring the script and calling `run` is denied (fails today: allowed); a file named `ledger-backfill.js` without the fixed sentence, run by path, is denied (a fixture shaped like the older copy); an unresolvable path is denied with the explanation; the sentence placed beyond the bounded read is not seen.
29. **The real harness, recorded.** WHEN each of these happens in a real session, THEN the store shows: you type `confirm <code>` at the prompt: recorded; you type it while a background agent is running: recorded; the code is placed in a background agent's brief: not recorded; the code is in an agent's returned text: not recorded; you give the code as the answer to a menu question tool: not recorded; the code is inside a prompt fired by the session's scheduler: not recorded. Proof: a recorded observation in the execution record. If any "not recorded" row is recorded, the typed-code option does not meet the requirement, and the build stops and asks you again.

### D. The four uses, end to end (typed-code)

30. **Legacy migration.** GIVEN an unmigrated fixture with three plans in done and no entries, WHEN dry run, the code is typed through the real prompt hook, and the confirmed run happens, THEN three entries exist. WHEN `--mark-migrated` is then run the same way, THEN the marker exists; and a fourth plan with no entry is then refused with the reason that the project is migrated.
31. **Hash rules change.** GIVEN plans in in-progress and todo with existing entries at the todo edge, WHEN a batch is re-recorded with `--hash-scope specification`, THEN each entry is replaced and an execution record appended afterwards does not invalidate it.
32. **Scope growth.** GIVEN an approved plan in in-progress that grants file A, WHEN its declared files are widened to add B, THEN neither A nor B is granted (the old entry no longer matches). WHEN the confirmed re-record runs, THEN both are granted. Without the typed code, B stays ungranted. GIVEN B is under the hooks folder, THEN the summary marks it and the result follows the answer to Question 2.
33. **Rework after send-back.** GIVEN the real captured sample shown under fact 6 staged under its own plan name, and a fixture plan edited after it, WHEN re-recorded, THEN the entry is replaced with the same fields plus the code; and a plan whose existing entry says done cannot be re-recorded at todo.

### E. Real captured data

34. **The golden approvals, through the changed code.** GIVEN both real approval samples staged byte for byte into a fixture ledger under the names their own `plan_basename` values give, THEN the canonical reader parses each, the kind classifier says `backfilled`, the new same-edge rule accepts each as prior provenance for a re-record, the re-record replaces it, and every field of the sample survives in the new entry. A plan name differing only by case still trips the collision guard. The extremes ratchet of the corpus fence stays green.
35. **A captured sample of the new shape.** The entry now carries a code. The first real confirmed run on this repository is captured byte for byte into the corpus, and until it exists the manifest records the new shape as an uncaptured variant (the precedent the manifest already sets for the sufficiency entry). The existing test over every real ledger entry stays green.

### F. Reachability, fences, existing tests and wording

36. **Reachability.** THEN the file fence and the export fence stay green: the typed-code library is required by the prompt hook and by the script, the script keeps its live command-line caller and a start-instruction recipe, and the unreachable-file baseline does not rise.
37. **The recipe fence.** THEN the changed ledger recipe in the start instructions has a new recipe identity; the coverage list is updated so the recipe is covered by a fixture that runs it (the list may only grow), not re-listed as uncovered.
38. **The forgery test.** THEN the assertion that the script is allowed with no confirmation is replaced by: dry-run and confirm shapes allowed, the older-copy and inline shapes denied, and every `node -e` recipe in the start instructions still allowed verbatim.
39. **Every changed existing test carries a written justification** with three parts: the contract from outside the test, why the test and not the code, and what newly fails. Each change tightens toward the new behaviour; none loosens an assertion.
40. **Wording.** THEN the summary and every refusal are plain sentences, name no gate number, and the instruction-wording fence stays green.

## Definition of Done

- Every scenario passes as a committed test or a committed recorded output, with the failing-first run recorded, and every characterization case accounted for.
- The whole gate passes through the project's gated test command with the coverage floor unchanged and no skipped test (the platform-specific cases skip loudly and run on the development machine).
- The census (scenario 1) is recorded before any product change and re-recorded after.
- The real-harness observation (scenario 29) is recorded before the plan is reported as closing the property.
- The reachability fences, the recipe fence and the corpus fences are green in the same unit of work.
- Every changed existing test has its written justification.
- A human can see the summary, the code, the sentence to type, and the plain refusal for every case above.
- The hooks and the script run from the installed plugin. The property holds only once the installed version contains this change, and the older copy stays runnable until the shell hook of the new version is installed. The work is not reported as closing the property before then.

## Scope

### In Scope

- Strict argument handling, one shared plan inspection, the stage-against-location rule, the prior-approval and migration rules, the mandatory bounded reason, the honest three-list result, and never throwing.
- The mark-migrated fixes (missing folders, unreadable ledger, honest count).
- The vision-mode fixes (corrupt and unkeyable entries, write failures, listing) and the shared inspection.
- Dry run that validates; the digest of the confirmed bytes.
- The confirmation code, the typed-code store, the prompt hook recording, the script's check, and the entry stamp (typed-code answer).
- The two shell-hook rules (typed-code answer).
- The start-instruction recipes and the two corrected sentences.
- The census and the tests above.

### Out of Scope

- Writing the coverage-check or residency rules differently, except as Question 2 decides.
- A click witness for the menu's ordinary approval. It is a shared limit; whether to build it is your decision.
- A stage-wide migration selector, and removal of the older plugin copies (the plugin cache is outside the repository).
- A session writing and running its own program, and any change to the ledger header's stated ceiling.
- The other ledger writers (the stale reconciliation, the sufficiency crossing, the ordinary approval).
- Narrowing coverage to plans that are being built (an open finding recorded in the coverage module).

## Technical dependencies (stated as facts, not as a schedule)

- The confirmation code binds validated items, so the shared inspection and the result contract must exist before the code can be computed.
- The script's fixed sentence must exist before the shell hook's older-copy rule can pass the current script.
- The typed-code store and the prompt hook must exist before the script can check the store.
- The start-instruction recipe, the recipe fence entry and the corrected sentences change together, because the recipe's identity is a hash of its text.
- A plan that creates a counted artifact (a new library module, new test files) must declare `CLAUDE.md`, because the count check at the crossing into the build queue refuses otherwise (read in the count module).
- The hook files, the ledger module and the script are on the protected enforcement list, so a plan that edits them needs a covering plan approved by a human-kind entry.
- The golden-corpus fence requires a byte-for-byte real capture for a persisted contract a module reads; the new store and the new entry field each need one or a recorded uncaptured variant.
- The agent definitions and the hooks run from the installed plugin (a note in memory says an edit takes effect only after publishing, the plugin update and a restart; I did not re-verify it today).

## Candidate files (not a declaration; the implementation planner fixes the exact list)

```
src/scripts/ledger-backfill.js                     rewrite: parser, inspection, results, confirmation, fixed sentence
src/lib/approval-ledger.js                         backfill function: accept examined bytes, stamp the code (protected file)
src/lib/typed-confirmations.js                     new: record from a prompt, check a code (uses the bounded log primitive)
src/hooks/UserPromptSubmit.js                      record a typed code; never block (protected folder)
src/hooks/PreToolUse.Bash.js                       inline-evaluation token; older-copy rule (protected folder)
src/lib/approval-residency.js                      export or reuse the residence-to-edge rule (protected file)
src/lib/protected-paths.js                         only if Question 2 changes the human kinds (protected file)
src/commands/start.md                              two-step recipe rows
src/lib/scope-growth.js                            header sentence corrected
agents/iron-loop/iron-loop-executor.md             the "through the menu" sentence corrected
.ctoc/recipe-coverage.json                         recipe identity and coverage entry
CLAUDE.md                                          counts; the ledger paragraph
tests/ledger-backfill-coverage.test.js             changed with justification
tests/ledger-forgery-closed.test.js                changed with justification
tests/ (new files for the census, confirmation, prompt hook, uses)
tests/fixtures/golden-corpus/ (approvals sample of the new shape; manifest)
NOT changed by default: src/lib/plan-coverage.js, src/hooks/human-gate-check.js, src/lib/stale-detector.js
```

## Risks and what this does not defend

- **The session's own program.** Anything a session can write and run, including a copy of the script with the checks removed, can write the ledger. Nothing here changes that.
- **A rubber-stamp.** A human who types whatever code the session shows has approved what the session described. The code makes the act deliberate and binds it to the true request; it cannot make the description honest.
- **The harness assumption.** The typed-code option rests on the prompt hook firing only for what you type. That is believed and measured by scenario 29, not verified.
- **The shell hook fails open on its own crash.** The older-copy rule and the inline rule therefore depend on the hook running; the script's own check does not.
- **Cost on every prompt.** The prompt hook adds one pattern match per prompt. I did not measure it.
- **A change to safety-critical code.** This edits hooks, the ledger module and the gate script. The repository's rule is that such changes need your explicit approval, and the plan must show the exact change at its own approval moment. Nothing here is pre-approved.
- **Existing entries are not revisited.** The reader is unchanged, so the existing backfilled entries keep the standing they have. That is deliberate: a rule that separates old entries from new ones cannot tell a legitimate re-record made after the migration marker from a forged one. It also means a forged entry made before this change stays accepted.

## What was not verified

- Nothing was executed. No script, hook or test was run. Every behavioural statement is by reading.
- Whether the prompt hook fires for anything you did not type (briefs, returned text, scheduled prompts, menu question answers): believed no. Scenario 29 decides.
- How the harness shows the plugin-root variable in a command the shell hook receives: believed literal, not observed. Whether a hook can read that variable from its environment.
- The full set of consumers of ledger entries: I read the ones in the table under fact 2; scenario 3 is the census.
- Whether anything else lists the ledger folder and would treat the new store as an entry. I checked the entry test and the counter only.
- The rest of the menu-screens module, the enforcement checker for gate destinations, the file-guard hook, the durable-log module, the declared-breadth module and the project detector.
- Whether real decomposed-vision archives carry a decomposition marker (relevant to Question 3).
- Whether the ledger folder is tracked by git; if it is, the store should be ignored.
- The older copy beyond lines 96 to 235.
- Windows behaviour of links, junctions, the terminal and the permission cases.
- The count of existing backfilled entries today (the roughly 210 figure comes from a dated comment; I did not recount) and how many backfilled plans declare enforcement code (relevant to Question 2).
- Whether the named pipe case really blocks a read (believed; scenario 6).

## Decisions Taken Under Ambiguity

1. **The check lives in the script, backed by a store, not only in a hook.** Not chosen: a hook-only check (fails open on a crash, cannot cover an in-process call). Cost: a prompt hook body and a store.
2. **The witness is recorded from the prompt event, not read from the transcript.** Not chosen: the transcript route (harness-injected user-role entries and briefs; believed). Cost: the store.
3. **The code is twelve hexadecimal characters (48 bits) of a content hash over a canonical request.** Not chosen: a per-plan code for a batch (a hundred-plan migration would need a hundred messages). Cost: one code covers a list, so you must read the list.
4. **The code is not single-use and is content-bound.** A repeat of the same request records the same thing. Cost: a stale code stays valid for the same bytes until it leaves the store.
5. **The store is bounded to 100 codes, the bound the gate violation log already uses, oldest first.** Cost: a code older than the hundredth newer one must be typed again.
6. **The store's name does not end in `.json`** and it lives in the protected ledger folder (fact 13).
7. **`--plan` repeats as a list; a stage-wide selector is not added.** Cost: a long command line for a large migration.
8. **A first-time record is allowed only while the project has no migration marker; a re-record needs a readable entry at the same edge; anything corrupt, unkeyable or unrecognised is refused.** Cost: after migration a plan with a missing entry must be reverted and crossed through the menu. This keeps the script from being a validation-free way across a gate.
9. **The reason is mandatory in plan mode, at most 2000 characters, no control characters.** Cost: a one-word reason passes; you see it in the summary and the code binds it.
10. **The result has `recorded`, `skipped` and `failed`; any refusal or failure exits 1; the function never throws.**
11. **Dry run validates fully; dry run plus confirm never writes.**
12. **The older-copy rule reads the start of the file (a bounded read of 4096 bytes) and looks for a fixed sentence.** Not chosen: a path comparison (denies the repository's own copy while developing here) or a content hash (denies development edits). Cost: a copy edited to add the sentence passes.
13. **The ledger function keeps accepting calls without a confirmation.** The library is also how fixtures and the approval path mint entries; putting the check there would make every fixture ask for a human. The check is in the script.
14. **The reader is unchanged except as Question 2 decides.** Not chosen: a cut-off or grandfather rule (see risks).
15. **The summary shows declared files in full and marks wildcard and enforcement-code entries; it does not compare with earlier plan text.** Not chosen: a comparison against the last committed text (needs git and assumes plans are committed).
16. **`--mark-migrated` and `--force` are bound into the code and need it.**
17. **The two sentences that promise a menu route are corrected to describe the real route.**
18. **The confirmation keyword is `confirm`, case-insensitive; the code is compared lower-cased.**
19. **The vision-mode fixes (failed list, listing, corrupt entries) do not depend on Question 3.**

## Open Questions For The Human

**Question 1 — What counts as your act when the script records an approval?**

This decides what counts as your approval. I make no recommendation. The plan's scenarios are written for the first option because it is the one a running test can check. If you choose another, scenarios 19 to 29 are replaced (option B) or dropped (option C), and the typing step inside scenarios 30 to 33 changes to match. Under B the older-copy rule of the shell hook stays; under C it adds nothing, because the older copy then has the same power as the new script, and it is dropped.

| Option | What happens | Pros | Cons |
|---|---|---|---|
| A. A code you type as an ordinary message | The script prints a short code derived from exactly what it will record; you type `confirm <code>`; the prompt hook stores it; the script refuses to write unless its own recomputed code is in the store. | The write is checked by code against something the session cannot produce; the code binds the exact plans, hashes, stage, scope and reason; it works inside the running session and the entry records the code. | You copy a code each time and it must be an ordinary message (a menu-question answer does not count); it relies on the prompt hook firing only for what you type (believed; scenario 29 measures it) and adds a hook body on every prompt; a session that writes and runs its own program is not stopped. |
| B. You run the script yourself in your own terminal and type at the terminal | The script asks you to type the plan name or a code at the terminal it runs in. | It is independent of every hook and of anything the session influences; it adds no hook body; the act is unmistakably yours, typed at your own keyboard. | You leave the session for every re-record, and during a build scope growth is frequent; terminal-device code differs on Windows and Unix and must be tested on each; a session with a shell can attempt to simulate a terminal. |
| C. Keep today's rule: your word to the session is the authority | The script gains validation, strict arguments and honest exits, and nothing else. | No new mechanism, hook or typing; the same trust as the menu's approval today (fact 8); no existing flow changes beyond the ten fixes. | The property is not enforced by code: a session can run the script with no word from you and it writes, which is what was observed; the incident can be made less likely, not prevented; the word stays unverified. |

**Question 2 — Should a backfilled entry count as a human approval for CTOC's own enforcement code (the hooks, the ledger, the coverage and residency checks, the gate order, this script)?**

This decides what counts as your approval for the most sensitive files. I make no recommendation. I did not measure how many existing backfilled plans declare such files.

| Option | What happens | Pros | Cons |
|---|---|---|---|
| A. Yes, as today | `backfilled` stays a human kind for every path. | No plan currently building loses coverage; a re-record can restore hook coverage for a plan that edits hooks. | A re-record, however confirmed, can restore write access over hook and ledger code without the plan having gone through the validated crossing; the weakest recorded kind guards the most sensitive files. |
| B. No | Enforcement code needs an entry from an ordinary crossing (kind `human`). | Enforcement code can only be edited under a plan that passed the validated crossing; the widest reach of a forged or mistaken entry is removed. | A plan that edits hooks and needs a re-record (scope growth, rework) must go back through the ordinary crossing; every existing backfilled plan that declares such files stops covering them. |
| C. Only entries carrying a confirmation code count | New witnessed re-records keep enforcement coverage; older migrated entries do not. | Re-records keep working for enforcement-code plans while your typed code witnesses them; new entries are held to a stricter test without revoking the older entries' other coverage. | Legacy migrated plans lose enforcement coverage, and there is one more branch in a permission decision shared by both write channels; it only exists if Question 1 is A or B. |

**Question 3 — How should vision mode (which records a finished-vision residency as a pipeline entry) be authorised?**

Today any file with `type: vision` in the done folder is recorded. The start instructions run this mode automatically after you approve stubs. I make no recommendation.

| Option | What happens | Pros | Cons |
|---|---|---|---|
| A. The same typed code | Vision mode needs `confirm <code>` like the other modes. | One rule for every write mode; a one-line file cannot be recorded without you. | You type a second time on a flow you already approved in the menu; the automatic step after stub approval now waits for you. |
| B. No code, but evidence | Vision mode records an archive only if it carries `status: decomposed` and at least one functional plan names it as its parent vision. | No extra typing; the evidence is objective, not a claim. | Plans are files a session can write, so this raises the cost of the squat without needing a human; I did not read real archives, so a legitimate old archive may be wrongly refused. |
| C. Unchanged apart from the ten fixes | Vision mode keeps its current test. | Nothing new to learn or maintain; no effect on the automatic step. | A file whose only frontmatter is `type: vision`, placed in the done folder, is recorded as finished and passes the sweep; the sweep module's own comment records this exact squat as a hole it closed elsewhere. |
