---
title: "Vision files are never overwritten or left without a name, and planning agents are never ordered to run code they cannot run"
type: implementation
created: 2026-10-05
priority: high
effort: large
depends_on: goal-titles-cannot-write-frontmatter-lines-into-a-stub
files:
  - src/tabs/vision.js
  - tests/vision-tab-behavior.test.js
  - agents/planning/vision-advisor.md
  - agents/planning/product-owner.md
  - agents/planning/implementation-planner.md
  - src/hooks/SessionStart.js
  - tests/session-start-question-dispatch.test.js
  - src/lib/streaming-questions-sweeper.js
  - tests/streaming-questions-sweeper.test.js
  - src/lib/unexecutable-instruction-scan.js
  - tests/unexecutable-instruction-fence.test.js
  - .ctoc/unexecutable-instruction-baseline.json
  - src/lib/background.js
  - tests/lib-final-gap.test.js
  - CLAUDE.md
---

# Vision files are never overwritten or left without a name, and planning agents are never ordered to run code they cannot run

## Problem Statement

Three defects found while reviewing the agent tool-grants work share this plan, because they share files: the vision tab library carries two of them and the vision-advisor agent carries two. All three were in the code before that work.

**A vision is overwritten without warning.** `createVision` in `src/tabs/vision.js` writes `plans/vision/<name>.md` without checking whether that file exists (line 343). A second vision whose title gives the same name replaces the first, and every answer recorded in it is lost. `convertToFunctional` in the same file does the same to `plans/functional/<name>.md` (line 477), replacing a functional plan that may already have been refined.

**A title in non-Latin letters gives an empty file name.** Both functions build the name by keeping only `a-z` and `0-9` (lines 285-287 and 417-419). A title written entirely in, for example, Japanese gives `''` and the file `plans/vision/.md`. That file is hidden on macOS and Linux, a second such vision overwrites it, and the approval ledger refuses its name, so it can never be approved. The vision-advisor agent's own rule (line 227) gives the same rule in prose. Its wording, "non-alphanumeric replaced with hyphens", also lets the agent keep the Japanese letters, and the ledger refuses that name as well.

**Three planning agents are ordered to run JavaScript they cannot run.** `product-owner`, `vision-advisor` and `implementation-planner` hold no Bash, yet their definitions tell them to call `writePlanQuestions`, `markNeedsInput`, `markComplete`, `writeStatus` and `readStatus`. When the session starts, it dispatches these agents to write the decision questions a human must answer before a plan is built. Writing those questions is the agent's only job in that mode, and it silently never happens. The live question store bears this out: it holds 15 files, every one for a review-stage plan written through the gate critic's quarantine, and none for a functional or implementation plan. The product-owner's documented workaround, reading the `.status` file and writing it back, is refused by the edit-enforcement hook in its default strict mode. And the fence built to catch exactly this kind of order, `src/lib/unexecutable-instruction-scan.js`, flags none of these lines.

Who it hurts: the owner never sees the decision forks the planning agents were sent to find, a plan reaches its approval without them, and a vision started with a non-Latin title can never move through the pipeline.

Fixed means four things:

- A vision or functional plan is never written over an existing one.
- A title with no Latin letter or digit gives the name `untitled`, in the library and in the agent rule alike.
- A question a planning agent writes, in exactly the way its definition says, appears on that plan's decision screen in `/ctoc:start`.
- The widened fence flags every one of the reported lines in a planted copy and finds none in the corrected agents.

## Scope

**In:** `createVision` and `convertToFunctional` (no overwrite, shared name rule). The vision-advisor's name rule. The three planning agents' status and question orders. The session-start directive that briefs them. The pending-questions sweeper, which now takes a file per producer, merges sets for the same plan revision, and refuses an empty list (on the recommended answers below). The unexecutable-order fence. The deletion of `background.markNeedsInput`, which loses its last caller. CLAUDE.md's two affected paragraphs.

**Out**, each listed under "Neighbours":

- the unreachable parts of the vision tab;
- the broken completion command printed by `src/hooks/PostToolUse.status-check.js`;
- the dashboard reader of a `needs-input` status;
- whether a vision plan should get streaming questions at all.

This plan depends on `goal-titles-cannot-write-frontmatter-lines-into-a-stub.md`, whose `slugify` (with its `untitled` fallback) the vision tab reuses.

Written by the implementation planner on 2026-10-05. Everything below was read from files in this repository; nothing was run. Claims are labelled **read**, **believed** or **to verify**.

## What was verified, and how

### The silent overwrite and the empty name

- **read**: `createVision` (src/tabs/vision.js lines 276-350) computes the name, joins `plans/vision/<name>.md` and calls `safeFs.writeFileSync` (line 343) with no existence check. `convertToFunctional` (lines 402-498) does the same for `plans/functional/<name>.md` (line 477) and records that name in the vision's conversion note (line 488).
- **read**: the name rule (lines 285-287, 417-419) is `toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`. With no Latin letter or digit, this gives `''`.
- **read**: `approval-ledger.SLUG_RE` is `/^[a-z0-9][a-z0-9-]*$/` (line 137). `ledgerPath` throws "Invalid slug" for anything else (lines 161-171), and the residency check reports `ledger-unkeyable`. Neither an empty name nor a name in Japanese letters can ever carry an approval.
- **read**: the vision-advisor's rule, line 227: "`{slug}` is the title lowercased, non-alphanumeric replaced with hyphens, leading/trailing hyphens removed". It has no fallback and no length cap. Line 385 uses the same `{slug}` for the functional plan. This rule is the path a human actually reaches: the vision-advisor writes the vision with Write. Since the tool-grants work it already checks with Glob and adds `-2`, `-3`, so the agent path does not overwrite. Only the library does.
- **believed (by reading)**: neither `createVision` nor `convertToFunctional` has a caller in `src/` other than tests. `src/commands/start.js` loads only the overview, review and tools tabs (lines 266-268). `src/tabs/overview.js` takes only `getVisionCounts` from the vision tab. The modes the vision tab sets (`new-vision`, `convert-vision`, `vision-explore`) are read nowhere. The dead-export fence lists `convertToFunctional` as dead. It credits `createVision` only because vision-advisor.md line 225 writes `createVision()` with parentheses in a sentence telling the agent to match its template. That is a citation, not a call. **to verify** at Step 9 with `reachability.analyze` and `analyzeExports`.

### The planning agents' orders

- **read**: grants. product-owner `Read, Write, Glob, Edit, Grep`; vision-advisor `Read, AskUserQuestion, Write, Edit, Grep, Glob`; implementation-planner `Read, Glob, Grep, Write, Edit`. None can run JavaScript.
- **read**: the orders, by line as read today:

| Agent | Line(s) | Order |
|---|---|---|
| product-owner | 24 | read-then-Write the `<stubPath>.status` file (the stated workaround) |
| product-owner | 32 | "Your only way to communicate with the user is through `markNeedsInput()`" |
| product-owner | 352 | record `complete` "(the `markComplete` shape …)" in the status file |
| product-owner | 358 | "1. Write the question to the status file: `markNeedsInput(stubPath, question)` …" |
| product-owner | 377 | "1. Read the status file with `readStatus(stubPath)` …" |
| product-owner | 381 | "5. Update status to `working` by calling `writeStatus(…)`" |
| product-owner | 520 | "4. `markComplete()` has been called with a summary message." |
| product-owner | 540 | "…, write intermediate progress to the status file: `writeStatus(…)`" |
| product-owner | 598-601 | "Write your questions through the real store-writer" + an indented `require(…)` / `writePlanQuestions(…)` block |
| vision-advisor | 615-618 | the same streaming paragraph and indented block |
| implementation-planner | 512-517 | "### 5.3 Mark Complete" + a fenced `markComplete(…)` |
| implementation-planner | 544-547 | "2. **Write a focused question** to the status file:" + a fenced `markNeedsInput(…)` |
| implementation-planner | 698-701 | the same streaming paragraph and indented block |

- **read**: the status-file workaround is refused. `<plan>.md.status` (`background.getStatusPath`, line 15) is not matched by the edit whitelist's `^plans\/.*\.md$` (PreToolUse.Edit.js line 77). No plan declares it, so in strict mode `enforce` reaches the block at lines 758-768. **to verify** at Step 9 by running the hook on a crafted payload.
- **read**: the quarantine is writable. `targetsStreamingLive` exempts `.ctoc/streaming/questions/pending/` (PreToolUse.Edit.js line 308), and the `^\.ctoc\/` whitelist then allows the write. The gate critic already uses this route (`agents/iron-loop/gate-critic.md` lines 95-102). `streaming-questions-sweeper.sweepPendingQuestions` promotes such files through `writePlanQuestions`, and its live call site is `streaming-gate.nextUnansweredQuestion` (line 361), the one funnel both decision screens read through.
- **read**: the store contract requires `critical` and `important` as booleans on every question (`validatePlanQuestions`, streaming-precompute.js lines 252-267). All three agent definitions, and the session-start directive, call them optional (`critical?, important?`). A set written exactly as instructed would be refused.
- **read**: the live store `.ctoc/streaming/questions/` holds 15 files, all named `review__…`. There is none for a functional or implementation plan.
- **read**: one quarantine file per plan. `promotePendingFile` requires the file name to equal `pendingQuestionsPath(root, ref)` exactly (sweeper line 169), and `writePlanQuestions` replaces the live file (streaming-precompute.js lines 406-431). If a producer and the gate critic both write for the same plan, whichever lands last erases the other's questions, at the quarantine file or at the live file.
- **read**: the session-start directive (`SessionStart.questionDispatchDirective`, lines 230-264) tells the session that "Each subagent writes its questions to the streaming store via … writePlanQuestions(…)", including the three lens critics. Those critics hold only `Read, Grep` (agents/iron-loop/*.md line 4).

### Why the fence misses every one of them

- **read**: `scanAgentOrders` only looks at backtick spans that start with a name followed by `(` (`callTokens`, lines 168-177), and drops every fenced block (`stripFences`, lines 141-147). A token then needs one of three signatures (`classify`, lines 215-222). The misses:
  - Lines 358 and 377 open with an imperative verb ("Write", "Read"). No signature looks at the sentence's first word. The call verb test (`S1_CALL_VERB`, line 124) wants the bare word call or invoke right before the token, and the second-person test cuts the clause at the colon (`SENTENCE_BREAK` is `[.!?:]`, line 129).
  - Line 381 says "by calling". `\b(?:call|invoke)\s*$` does not match "calling".
  - Line 540 has its "you" in an "If you need …" clause. The clause is cut at the colon right before the token, and even without the colon, the dots in "e.g." would cut it.
  - Lines 600-601, 617-618 and 700-701 are an indented code block with no backticks, so `callTokens` never sees them.
  - Lines 514-517 and 545-547 are fenced, so they are stripped.
- **read**: the three agents' lines are the only non-fenced `require(` of a repository module in an agent without Bash. A text search for `require(` with a `src/lib|hooks|scripts` path across `agents/` found eight lines. Five are in Bash-holding agents (cto-chief, ivv-chief, iron-loop-executor) or carry a third-person lead-in (vision-decomposer lines 666-670 and 702). **believed**, because a text search shows presence, not who runs it; Step 9 measures with the real scanner.

## Implementation Details

### `src/tabs/vision.js` — no overwrite, one name rule

In both `createVision` and `convertToFunctional`:

```js
// The name rule lives in ONE place (vision-decomposer.slugify: a-z0-9 runs, 60
// characters, 'untitled' when nothing is left). Required lazily so the overview tab,
// which loads this file for getVisionCounts, keeps its load path unchanged.
const { slugify } = require('../lib/vision-decomposer');
const base = slugify(title);
let name = base;
let filePath = path.join(visionDir, `${name}.md`);          // functionalDir in convertToFunctional
for (let n = 2; safeFs.existsSync(filePath); n += 1) {      // the -2, -3 rule createStub uses
  name = `${base}-${n}`;
  filePath = path.join(visionDir, `${name}.md`);
}
```

`createVision` returns `{ path: filePath, name, title }`. `convertToFunctional` writes the conversion note with the real name (`Converted to: plans/functional/${name}.md`) and returns `functionalSlug: name`.

### `agents/planning/vision-advisor.md` — the name rule

| Where (line as read) | Today | Change |
|---|---|---|
| "### Creating a New Vision", line 227 | "`{slug}` is the title lowercased, non-alphanumeric replaced with hyphens, leading/trailing hyphens removed." | the sentence in the fenced block below; the rest of the line (the Glob check and `-2`, `-3`) unchanged |
| "### Single Plan: Direct Conversion", line 385 | `plans/functional/{slug}.md` | add after the path: ", where `{slug}` follows the rule under "Creating a New Vision", `untitled` included" |
| "## Writing questions to the streaming store", lines 608-633 | the call-the-writer section | the shared section below, vision-advisor form |

```markdown
**File path:** `plans/vision/{slug}.md` where `{slug}` is the title lowercased, every run of characters other than the Latin letters `a`-`z` and the digits `0`-`9` replaced by one hyphen, leading and trailing hyphens removed, and cut to 60 characters; if nothing is left (a title written only in non-Latin letters or symbols), `{slug}` is `untitled`.
```

### `agents/planning/product-owner.md`

| Where (line as read) | Change |
|---|---|
| 20 | "surface it through the **status protocol** (below)" → "surface it as a question in your questions file (see "Writing questions to the streaming store")" |
| 22 | "Surface any question that needs the founder through the status protocol." → "Surface any question that needs the founder as a question in your questions file." |
| 24 | the "Status protocol" paragraph → text A below |
| 32 | → "- Your only way to ask the user something is a question in your questions file; the user sees it on that plan's decision screen in `/ctoc:start`." |
| 352 (Step 10) | → text B below |
| 356-362 (Needs-Input Protocol items 1-5) | → text C below |
| 376-381 (Resuming after user answers) | → text D below |
| 520 | → "4. Your final message carries the completion summary from Step 10." |
| 522 | "…record `needs-input` with a specific question in the status file." → "…write a specific question into your questions file." |
| 540 | → "- If you need more than 5 minutes (for example, many sibling stubs to read), finish each section's `Edit` before starting the next, so a re-run can continue from the first unfinished section." |
| 549 | → "- Write (a file that does not exist yet, and your questions file under `.ctoc/streaming/questions/pending/`; never an existing plan file, never a status file)" |
| 553-556 | → text E below |
| 566 | → "- Status: the dispatcher's status file (`src/lib/background.js`); this agent never writes it" |
| 591-616 | the shared section below, product-owner form |

```markdown
A — **What you cannot do, and what you do instead.** Your grant (`Read, Write, Glob, Edit, Grep`) cannot run JavaScript, so you never call a function in `src/lib/background.js`. You also never write the plan's `<stubPath>.status` file: it is not a `plans/**.md` file and no plan covers it, so the edit-enforcement hook refuses the write in its default strict mode. A question for the human goes into your questions file (see "Writing questions to the streaming store"). Your completion report is your final message.

B — End with a final message that reads 'Refined: [N] acceptance criteria, priority [HIGH/MEDIUM/LOW], [M] risks identified'. That message is your completion report.

C — 1. Put the question into your questions file, as "Writing questions to the streaming store" describes: `critical: true`, `important: true`, with its options.
2. Write that file last, after your final `Edit` of the stub, and leave `planMtimeMs` out, so the menu's sweeper stamps the plan as it then stands.
3. The next time `/ctoc:start` renders, the sweeper checks the file and moves it into the question store; the user sees the question on that plan's decision screen.
4. In your final message, say the stub is waiting for that answer and name the question.
5. When you are dispatched again with the user's answer, resume refinement from where you stopped.

D — 1. The user's answer is in your brief; the dispatcher passes it.
2. Incorporate the answer into the relevant step (e.g., if the question was about scope overlap, update the scope definition).
3. Continue from the step where you stopped. Do not restart from Step 1.

E — **Authorities it reads** (JavaScript in `src/lib/*`; this agent cannot execute JavaScript, so it consults these by name only):
- `src/lib/background.js` — the status file the dispatcher keeps for this run, and its 5-minute timeout (`isStale`); this agent never writes the status file
```

The other three bullets of the authorities list (state.js, plan-validator.js, actions.js) stay unchanged.

### `agents/planning/implementation-planner.md`

| Where (line as read) | Change |
|---|---|
| 113 | "`src/lib/background.js` -- status tracking (`writeStatus`, `markComplete`, `markNeedsInput`)" → "`src/lib/background.js` -- the status file the dispatcher keeps (`writeStatus`, `markComplete`)" |
| 512-517 | heading and fenced block → text F below |
| 541-549 (Needs-Input Protocol items 1-4) | → text G below |
| 691-716 | the shared section below, implementation-planner form |

```markdown
F — ### 5.3 Report completion

End with a final message that reads `Decomposed <parent> into N slices (<s1>, <s2>, …)`. That message is your completion report; you cannot run JavaScript and never write the status file.

G — 1. **Identify the ambiguity**: "The plan says 'add caching' but does not specify which caching strategy"
2. **Put a focused question into your questions file** (see "Writing questions to the streaming store"): one question, `critical: true`, `important: true`, with options such as (1) an in-memory Map with a time-to-live, (2) a file-based cache in `.ctoc/cache/`, (3) no cache, recomputed each time.
3. **Write that file last**, after your final plan edit, with `planMtimeMs` left out; the question then appears on that plan's decision screen in `/ctoc:start`.
4. **Resume** when you are dispatched again with the answer; re-read the plan for updated instructions.
```

### The shared streaming section (all three agents)

Product-owner form below. The vision-advisor form uses `vision/<file>.md`, the suffix `--vision-advisor` and the id prefix `va-`. The implementation-planner form uses `implementation/<file>.md`, `--implementation-planner` and `ip-`. The last paragraph follows the owner's answer on empty lists; it is written for the recommended answer.

```markdown
## Writing questions to the streaming store

When SessionStart injects the session-driven dispatch directive, you are one of the
subagents it dispatches — for a functional plan you generate the load-bearing DECISION
FORKS a human must answer before the plan can be built without guessing. In that mode you
do NOT edit the plan, move it, or stamp any approval; your only write is your questions
file. The same file carries a needs-input question when you are refining a stub.

You cannot run JavaScript. You write ONE file in a quarantine directory, and the menu's
sweeper (`src/lib/streaming-questions-sweeper.js`) checks it and moves it into the live
question store through `writePlanQuestions` in `src/lib/streaming-precompute.js` the next
time `/ctoc:start` renders.

- **The only path you may write** is
  `.ctoc/streaming/questions/pending/<sanitized-ref>--product-owner.json`, where
  `<sanitized-ref>` is the plan reference (`functional/<file>.md`) with every `/` and `\`
  replaced by `__`, then every character outside `[A-Za-z0-9._-]` replaced by `_`. For
  `functional/checkout-flow.md` the file is
  `.ctoc/streaming/questions/pending/functional__checkout-flow.md--product-owner.json`.
  The edit hook refuses every other path under `.ctoc/streaming/`.
- **Its contents, exactly:**
  `{ "ref": "<the plan reference, verbatim>", "planMtimeMs": <the stamp from your brief>, "questions": [ … ] }`.
  Copy `planMtimeMs` from your brief, digit for digit, only when you did not edit the plan
  in this run. When you did edit it, leave the key out and write this file last, after
  your final edit, so the sweeper stamps the plan as it now stands. A stamp older than the
  plan is refused as superseded.
- **`questions`** is an ARRAY in the streaming Question contract, exactly:
  `[{ id, prompt, critical, important, options: [{ key, label, recommended?, pros?, cons?, description? }] }]`.
  `critical` and `important` are REQUIRED booleans on every question; a question missing
  either is refused. `id`, `prompt`, `key` and `label` are non-empty strings. Start every
  id with `po-`, so it never collides with another producer's. Question ids are unique;
  option keys are unique within a question; mark exactly one option `recommended: true`.
  A real fork the builder must confront is `critical: true`; a strong preference is
  `critical: false, important: true`; a detail resolvable while building is `false` and
  `false`.

If the plan has no real fork, write no file and say so in your final message. NEVER invent
a question.
```

### `src/hooks/SessionStart.js` — the directive tells no subagent to run code

`questionDispatchDirective` keeps its shape and its fail-open contract. Its instruction text becomes:

```text
## Streaming questions — open forks awaiting the human (N plan(s))

Before other work, dispatch UP TO 5 CTOC subagents IN THE BACKGROUND to find open
issues and generate their questions — at least one, at most 5 at a time, refilling
as they complete:
  • producers, per plan stage — product-owner (functional), vision-advisor (vision),
    implementation-planner (implementation) — generate a plan's decision forks;
  • the adversarial critics — premortem-critic, devils-advocate-critic, red-team-critic
    — surface forks nobody has asked yet; they hold no write tool, so pass their
    findings to gate-critic, which synthesizes them.
No subagent runs code. A producer, or the gate-critic, drops its questions in the
quarantine .ctoc/streaming/questions/pending/ (a producer's file name ends in
--<producer>.json); the menu's sweeper validates each file and promotes it through
src/lib/streaming-precompute.js → writePlanQuestions on the next /ctoc:start render.
Give each subagent the plan's ref and planMtimeMs below. Question contract:
[{ id, prompt, critical, important, options:[{key,label,recommended?,pros?,cons?,description?}] }]
— critical and important are REQUIRED booleans.
The human answers them in /ctoc:start; a plan with every fork answered that passes
validation crosses its pre-build gate by itself.

Plans needing questions: functional/magic.md (planMtimeMs 1784500000000.25), …
```

Each ref is followed by its plan's stamp: `precompute.refToPlanPath(projectPath, ref)`, then `safeFs.statSync(p, { throwIfNoEntry: false })`. The `mtimeMs` is printed exactly as Node returns it, never rounded, because a stamp rounded down reads older than the plan and the sweeper refuses it as superseded. A ref whose plan cannot be stat-ed is listed without a stamp (the sweeper accepts a missing stamp). The function gains no empty `catch`, which the false-green fence would flag.

### `src/lib/streaming-questions-sweeper.js` — one file per producer, merged, never emptied

1. **The file-name binding accepts a producer suffix from a closed set.** This replaces step 7 of `promotePendingFile`:

   ```js
   /** Producers that drop their own quarantine file beside the gate critic's. Closed set. */
   const PRODUCER_SUFFIXES = Object.freeze(['product-owner', 'implementation-planner', 'vision-advisor']);

   const expected = precompute.pendingQuestionsPath(root, ref);
   if (expected === null) return { ok: false, reason: 'ref-filename-mismatch' };
   const stem = expected.slice(0, -'.json'.length);
   const allowed = [expected, ...PRODUCER_SUFFIXES.map((p) => `${stem}--${p}.json`)];
   if (!allowed.some((a) => path.resolve(a) === path.resolve(absFile))) {
     return { ok: false, reason: 'ref-filename-mismatch' };
   }
   ```

   This is exact string equality against names built from the payload's own `ref`, with no parsing of the file name, so the traversal guard keeps its meaning. A ref always ends in `.md`, so a producer's name (`….md--product-owner.json`) can never equal another ref's plain name (`….md.json`).

2. **An empty list is never promoted** (on the recommended answer). A new step after supersession: `if (Array.isArray(payload.questions) && payload.questions.length === 0) return { ok: false, reason: 'empty-questions' };`. This adds the literal to the closed reason set and to the docstring's ladder.

3. **A set for a plan that already has fresh questions is merged, not replaced.** Before `writePlanQuestions`:

   ```js
   let questions = payload.questions;
   let attestation = payload.attestation;
   const live = precompute.planQuestionsStatus(root, ref);
   if (live.status === 'ready' && Array.isArray(questions)) {
     // Union by question id. The incoming version replaces a stored one with the same
     // id (a producer's re-run carries newer text); every other stored question stays.
     const incoming = new Set(questions.filter((q) => q && typeof q.id === 'string').map((q) => q.id));
     questions = [...live.questions.filter((q) => !incoming.has(q.id)), ...questions];
     if (live.attestation) attestation = live.attestation;   // the critique fleet's record stays
   }
   ```

   A stale live set (the plan changed since) is replaced, as today. `writePlanQuestions` re-validates the merged set in full.

4. The header comment's quarantine model names the three producers beside the gate critic, and the one-file-per-plan collision this closes.

### `src/lib/unexecutable-instruction-scan.js` — the fence catches this class

All patterns are literal and linear and run on lines capped at `MAX_LINE`. No pattern is built from file text.

1. **The call-verb signature also takes "by calling" and "by invoking":** `S1_BY_GERUND = /\bby\s+(?:calling|invoking)\s*$/i`, tested beside `S1_CALL_VERB` on the same 60-character look-back. A bare "calling" ("Any code calling `parseDate()`", backwards-compatibility-checker.md line 170) still does not fire.

2. **One sentence boundary, shared by the second-person test and the new lead-verb test.** A sentence ends at `.`, `!` or `?` followed by whitespace or the end of the line. A colon no longer ends one, and neither does the inner dot of an abbreviation such as "e.g.,". `s2SubjectInClause` uses this boundary in place of `SENTENCE_BREAK`. The existing negative, "The object you emit is NOT the validator's input. `validatePlanQuestions` takes …", still splits at its period.

3. **A new signature for a sentence that opens with an imperative verb.** The scanner takes the sentence containing the token, by the boundary above. It strips a leading list marker (`-`, `*`, `+` or `N.`) and bold markers, then a leading "If …," or "When …," clause up to its first comma outside parentheses. If the first remaining word, lower-cased, is in `IMPERATIVE_LEAD = {write, record, read, update, mark, set, save, store, persist, run, execute, use}`, the signature fires. A call token is still required, so a bare "write X" is never an order. This keeps the header's list of signatures deliberately not built true.

4. **A new signature for a code block that loads or calls repository code.** The scanner first marks code lines in the raw text: lines inside a fence, and lines indented four or more spaces (or by a tab) that follow a blank line or another such line. Then:
   - **Attributed names.** Every name in a backtick span on a non-code line that also names a `src/…​.js` path, plus every destructured name on a code line that requires a repository module.
   - **A finding.** A code line that requires a repository module (`require(` with a string argument containing `src/`) is a finding; the callee is each destructured name, or else the module's base name. So is a code line whose statement begins with a call (`name(`, `await name(`, or `const … = name(`) to an attributed name that is not a granted tool.
   - **The excuse.** A block whose lead-in paragraph (the contiguous non-blank lines just before it) matches the existing third-person test (`will`, `would`, `shall`, `calls`, `runs`, `invokes`, `executes`, `drives`) is a description of another actor. Nothing in it is a finding. This is what keeps vision-decomposer lines 664-671 ("… CTO Chief (which holds `Bash`) runs the writer via `node -e` …") clean.

   Fenced code stays outside the three older signatures, so a fenced example that calls nothing this agent attributes to repository code is still never an order.

5. `Finding.signature` widens to the five signatures. The header gains the two new signatures, the boundary change, and their honest limits: an order whose verb is outside the closed list is missed, and so is a code block that calls a repository function the agent's text never attributes to a `src/` file. Both are under-reported, the same bias as the existing three.

### `.ctoc/unexecutable-instruction-baseline.json`

On the recommended answer to the debt question, every finding the widened fence makes outside the three planning agents is added to `debt` by key, `maxDebt` rises by exactly that count, and the comment records the landing in the same form as the 15 entries seeded when detections (a) and (c) landed. `exemptions` stays empty. The three planning agents contribute no entry: they are fixed in this plan.

### `src/lib/background.js`

Delete `markNeedsInput` and its export. After the agent rewrite its only callers are gone. The remaining mentions were the call-syntax lines in product-owner.md and implementation-planner.md, and the dead-export fence would then fail with a new entry. Deleting rather than keeping a citation alive follows the fence baseline's own precedent ("keeping a dead require() so this fence still saw the token would have been gaming the instrument"). `readStatus`, `writeStatus` and `markComplete` keep live callers (actions.js, the intra-module calls, and the PostToolUse hook's printed command). **to verify** at Step 9 with `analyzeExports`.

### `CLAUDE.md`

- The streaming-questions paragraph ("the SESSION dispatches subagents on start") says the producers drop a quarantined file the sweeper promotes, one file per producer, merged for the same plan revision, with an empty list refused. It no longer says each subagent writes through `writePlanQuestions`.
- The unexecutable-order fence paragraph lists five signatures: the call verb (now with "by calling"), the second-person sentence (with the new boundary), the capability manifest, the imperative lead and the code block calling repository code.

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| sweeper: suffix, merge, empty refusal | `streaming-gate.nextUnansweredQuestion` (line 361) → both decision screens | `/ctoc:start` |
| the directive | `SessionStart.questionDispatchDirective` | the registered SessionStart hook |
| the three agents' new orders | dispatched by the session per the directive, and by the CTO Chief | session start; the pipeline |
| fence signatures | `scan` → `tests/unexecutable-instruction-fence.test.js` and the `unexecutable-instruction-fence` check in `src/lib/iron-loop-enforcer.js` (thorough mode) | `npm test`; the enforcer |
| `createVision`, `convertToFunctional` | **no live caller (believed)**; the human's path to a vision is the vision-advisor's rule, changed above | — |

## Test plan (written first, Step 8)

**`tests/vision-tab-behavior.test.js`**

1. "createVision never overwrites an existing vision". A file `plans/vision/my-idea.md` with custom content exists. `createVision('My Idea', root)` returns name `my-idea-2`, and the first file is byte-identical. Red today.
2. "createVision of a title with no Latin letter or digit writes untitled". A Japanese title gives name `untitled`, a second gives `untitled-2`, and no file named `.md` exists in `plans/vision/`. Red today.
3. "convertToFunctional never overwrites an existing functional plan". `plans/functional/portable-export.md` exists. Converting a vision titled "Portable Export" returns `functionalSlug: 'portable-export-2'`, the existing plan is byte-identical, and the vision's conversion note names `portable-export-2.md`. Red today.
4. "convertToFunctional of a non-Latin title writes untitled". Red today.
5. The existing `createVision` cases stay green.

**`tests/streaming-questions-sweeper.test.js`**

6. "a producer-suffixed quarantine file is promoted": `functional__magic.md--product-owner.json`. Red today (`ref-filename-mismatch`).
7. "a suffix outside the closed set is refused" (`--someone.json` gives `ref-filename-mismatch`, nothing written). Green today; it must stay green.
8. "two producers' sets for the same plan revision both survive, in either order": the gate critic then the product-owner, and the reverse. Red today (last writer wins).
9. "an incoming question replaces a stored one with the same id".
10. "the stored attestation is kept when a producer's set merges in" and "an incoming attestation is carried when the stored set has none".
11. "an empty quarantine list is refused with empty-questions and changes nothing", on the recommended answer. Red today: an empty list is promoted.
12. "a stale stored set is replaced, not merged".
13. **End to end, the human's screen.** Real sandbox with a functional plan `plans/functional/magic.md`. Write `.ctoc/streaming/questions/pending/functional__magic.md--product-owner.json` exactly as the product-owner text instructs, without `planMtimeMs`. Call `streaming-gate.nextUnansweredQuestion(root, 'functional/magic.md')`; it returns that question with `total: 1`. Then a gate-critic file for the same plan: `total: 2`. Then an empty product-owner list: still `total: 2`. Red today.

**`tests/session-start-question-dispatch.test.js`**

14. Case 1 is extended. The directive names `.ctoc/streaming/questions/pending/`, the `--<producer>.json` naming, gate-critic as the critics' writer, that critical and important are REQUIRED booleans, and `functional/magic.md (planMtimeMs <the plan's real mtimeMs, unrounded>)`. It still names `writePlanQuestions` and `streaming-precompute`, and contains neither "writes its questions to the streaming store via" nor `critical?`. Red today.
15. "a ref whose plan cannot be stat-ed is listed without a stamp": temporarily replace `plansNeedingQuestions` on the required module object to return `{ ref: 'functional/ghost.md' }`, and restore it in a `finally`. Red today: no stamp logic.
16. Case 3 (each producer agent names `writePlanQuestions` and `streaming-precompute`) stays green against the rewritten agents.

**`tests/unexecutable-instruction-fence.test.js`**

17. **The reported lines, planted byte for byte.** Copy, at Step 8 and before any agent is edited, the exact text of each pre-fix line from the table above, with the agent's real grant and (for implementation-planner) its line 113 attribution, into a temporary `agents/planning/` tree. Expected signatures:

    | Line | Callee | Signature |
    |---|---|---|
    | product-owner 358 | markNeedsInput | imperative lead |
    | product-owner 377 | readStatus | imperative lead |
    | product-owner 381 | writeStatus | call verb ("by calling") |
    | product-owner 540 | writeStatus | second person |
    | product-owner 600, 601 | writePlanQuestions | code block |
    | vision-advisor 617, 618 | writePlanQuestions | code block |
    | implementation-planner 516 | markComplete | code block |
    | implementation-planner 546 | markNeedsInput | code block |
    | implementation-planner 700, 701 | writePlanQuestions | code block |

    Red today: nothing fires.
18. **Negative controls, copied from the live corpus.** All green today, and all must stay green:
    - backwards-compatibility-checker.md line 170 ("Any code calling `parseDate()` will fail") is not flagged;
    - vision-decomposer.md lines 664-671 (third-person lead-in, fenced `node -e` require) are not flagged;
    - vision-advisor.md line 225 ("by calling `Write()`" under a Write grant) is not flagged;
    - a fenced test example calling `add(2, 3)` in an agent that attributes nothing is not flagged;
    - "The object you emit is NOT the validator's input. `validatePlanQuestions` takes …" is not flagged.
19. "the sentence boundary": "If you need X (e.g., Y), write to the file: `fn(…)`" fires (second person). "You are done. `fn(…)` is …" does not. Red today for the first.
20. **The three planning agents are fixed (live).** `scan(ROOT)` reports no `instruction-tool` finding in the three files. It is green today only because the scanner is blind. It goes red when Step 10 widens the scanner and green again after the rewrite; Step 10 records both runs.
21. Cases 13 to 15 (no new entry, ratchet, claim your progress) run against the baseline as updated on the debt answer.

**`tests/lib-final-gap.test.js`**

22. The export list no longer includes `markNeedsInput`, and `bg.markNeedsInput === undefined`. The case "markNeedsInput — sets needs-input with the question as message" is removed together with the function it tested. Red today on the undefined assertion.

## Security review

- **No new capability for any agent.** The three producers already hold Write. The quarantine was already writable under the edit hook. What they gain is a path the sweeper validates in full: regular file, size cap, parse, file-name binding, plan existence, supersession, and the full question contract through `writePlanQuestions`. No grant changes. Bash is not granted (see question 2).
- **The binding stays exact.** The suffix comes from a closed set and is compared by full-path equality, so a quarantine file can promote only to the questions of the plan its own name implies.
- **Merging cannot erase.** A later set can add questions or replace its own by id. It cannot remove another producer's question, and with the recommended answer an empty list is refused outright.
- **No payload text travels outward.** Discard reasons stay closed-set literals. The directive prints only plan references and numbers.
- **The directive no longer tells a read-only critic to write.**
- **Untrusted plan text is the input** to all three producers, as it already is for the gate critic. Their output still passes the sweeper's validation before a human sees it.

## Acceptance criteria

1. A second vision, or a second functional plan from `convertToFunctional`, whose title gives an existing name lands at `-2`, and the existing file is byte-identical.
2. A title with no Latin letter or digit gives `untitled` (then `-2`), never `.md`, in the library. The vision-advisor rule states the same, with the 60-character cap.
3. A question written exactly as a planning agent's definition says appears on that plan's decision screen on the next `/ctoc:start` render (test 13 through `nextUnansweredQuestion`).
4. Two producers' question sets for the same plan revision both appear, in either order. A later set never removes another producer's question.
5. On the recommended answer, an empty quarantine list is refused with `empty-questions`.
6. The three planning agents carry no order to run code or to write a status file. The widened fence finds nothing in them. Every planted pre-fix line is flagged with its expected signature, and every negative control stays clean.
7. The session-start directive tells no subagent to run code, names the quarantine and the required booleans, and lists each plan with its exact stamp.
8. `markNeedsInput` no longer exists. The dead-export fence's `maxDead` (65) and the dead-code fence's baseline are unchanged.
9. `npm test` passes: fail 0, skipped 0, coverage at or above the floor. `npm run lint` reports zero warnings. The false-green fence gains no finding.
10. CLAUDE.md describes the quarantine route and the five fence signatures.

## Questions for the owner

### 1. Your merge rule joins three defects into this one plan of 15 files. Keep it as one plan, or split it into two that share no file?

The vision tab library carries the silent overwrite and the empty name. The vision-advisor agent carries the empty name and the planning-agent orders. So by the rule "merge when two share a file", all three land here.

- **Recommended: (b) split into two plans that share no file.** Plan one, "vision files are never overwritten or left without a name": `src/tabs/vision.js` and its test. Plan two, "planning agents are never ordered to run code they cannot run": the other 13 files, carrying the vision-advisor's name rule, because that rule lives in vision-advisor.md. Reason: a 15-file build in one executor pass is the crash-loses-everything risk the implementation planner's own slice rule exists to prevent, and the two halves share no code. The cost is that the empty-name defect is fixed in two plans, the library half in one and the agent half in the other.
- (a) Keep it as one plan, as instructed. One approval and one build, larger.

### 2. How should the planning agents' questions reach you?

None of the three can run code. Their questions have to be carried by something that can.

- **Recommended: (a) a quarantined file the existing sweeper promotes** (this plan as written). The route already exists, already validates everything, needs no new capability, and runs without anyone waiting. The same file also carries a needs-input question, so the broken status-file protocol is withdrawn and `markNeedsInput` is deleted.
- (b) The agent returns its questions in its final message, and the dispatching session writes them with a shipped command-line recipe that calls `writePlanQuestions`. The session must remember to do it on every dispatch. The questions bypass the quarantine's binding and supersession checks. And agent-authored text ends up inside a shell command the session composes, which is an injection risk whenever a question contains a quote.
- (c) Grant Bash to the three planning agents. This widens three agents that read untrusted plan text, and hold no web access, to running any program. The shell channel lets `node -e` through unchanged (refusing such "indeterminate" commands is listed in CLAUDE.md as unbuilt), so they could write the live question store directly. That is the very capability the quarantine exists to deny the gate critic.

### 3. Should a planning agent's empty question list be able to move a plan through its approval?

Today the agents are told that an empty list is the honest "asked, nothing to ask". A plan whose question file is fresh and empty counts as having enough information, so it crosses its pre-build approval by itself. That has never happened through these agents, because their writes never landed. This plan makes them land.

- **Recommended: (a) no.** An agent that finds nothing to ask writes no file and says so, and the sweeper refuses an empty quarantine list. Reason: a race. The session dispatches the producer and the adversarial critics together. A producer's empty list promoted first can carry the plan through its approval before the critics' questions arrive. The cost: a plan where nobody finds a fork keeps being listed at session start until the critics write or you approve it yourself.
- (b) Yes, as the agents are told today. The sweeper promotes an empty list and the plan may cross with no question asked.

### 4. If the widened fence finds the same kind of order in other agents, fix them in this plan or record them as debt?

The count is unknown until Step 9 runs the widened scanner over all agent definitions. The text search in "What was verified" suggests few or none.

- **Recommended: (a) record each as named debt.** Add it to the baseline's `debt` by key, raising `maxDebt` by exactly that count, the same way the 15 existing entries were recorded when detections (a) and (c) landed. This plan stays the size it is, and every instance is visible and can only shrink.
- (b) Fix every one here. The executor files a scope-growth request per extra agent file, and this plan grows by that many files.

## Decisions Taken Under Ambiguity

1. **`createVision` and `convertToFunctional` are fixed in place although no live caller was found.** You asked for the overwrite fixed. The vision-advisor names `createVision` as the authority for its template. And the missing caller is believed, not yet measured. If Step 9 confirms no live caller, deleting the unreachable vision tab is the cleaner cure; it is reported under "Neighbours", not decided here.
2. **The vision tab reuses `slugify`** (lazily required), so vision names gain the 60-character cap. The vision-advisor rule now states the same cap, so library and agent stay one rule.
3. **Producer files carry a suffix from a closed set**, never a free-form suffix, so the binding stays exact equality.
4. **On a question-id collision the incoming question wins**, because a producer's re-run carries newer text. Producers' ids carry a prefix (`po-`, `ip-`, `va-`), so a collision between producers should not occur.
5. **The stored attestation is kept on merge.** It is the critique fleet's record, and a producer writes none.
6. **The status-file protocol is withdrawn rather than repaired.** Whitelisting `plans/**.status` for agents would let any agent write a status the dashboard shows as that agent's report.
7. **The vision-advisor keeps its streaming section**, though `pendingGateDecisions` never lists a vision plan (it covers functional, implementation and review). Whether a vision should get streaming questions is a product question, reported below.
8. **The stamp is printed unrounded**, since a stamp rounded down reads as superseded.
9. **Not split into slices of one to three files**: the owner's instruction for this work is one plan per defect, merged when two share a file. Question 1 offers the split.

## Neighbours (seen, not built here; scheduling is the owner's)

- **Most of the vision tab is unreachable (believed).** `render`, `handleKey`, `renderActions`, `executeAction`, `createVision`, `saveVisionProgress` and `convertToFunctional` have no live caller: the dashboard never loads the tab, and the modes it sets are read nowhere. The dead-export fence misses most of them, because generic names and a parenthesised citation credit them. Only `readVisions`, `getVisionCounts` and `parseVisionMetadata` are live, through the overview tab.
- **The completion command the PostToolUse hook prints cannot run.** `src/hooks/PostToolUse.status-check.js` line 215 prints `node -e "require('./lib/background').markComplete('<plan path>', 'Agent spawned')"`. `./lib/background` does not resolve from a project root: the module is `src/lib/background.js` here, and under the plugin root in an installed project. The plan path is also pasted into the program text, so a plan file name containing a quote changes the program. The recipe fence does not see it, because it scans only `src/commands/start.md`.
- **The dashboard keeps a reader for a `needs-input` status but loses its only writer** once `markNeedsInput` is deleted.
- **No vision plan is ever listed for questions**, so the vision-advisor is named in the directive as a producer that is never needed.
- **A stale comment in a test.** `tests/streaming-human-loop-e2e.test.js` lines 18-20 describe the dispatched subagent calling `writePlanQuestions`. The behaviour it tests is unchanged; the comment is wrong after this plan.
- **Two comments call the quarantine the gate critic's alone.** `PreToolUse.Edit.js` line 306 and the docstring of `streaming-precompute.pendingQuestionsPath` say this; the rule is unchanged, the description is now incomplete.

## Execution Plan

### Step 8: TEST
- [ ] Before any agent file is edited, copy the pre-fix lines listed in the table under "What was verified" byte for byte into the fixtures of test 17. Copy the negative controls of test 18 from the live files.
- [ ] Write tests 1 to 22 as listed (tests 11 and 21 per the recommended answers).
- [ ] Run `node --test tests/vision-tab-behavior.test.js tests/streaming-questions-sweeper.test.js tests/session-start-question-dispatch.test.js tests/unexecutable-instruction-fence.test.js tests/lib-final-gap.test.js`. Expect RED on 1, 2, 3, 4, 6, 8, 11, 13, 14, 15, 17, 19 and 22, and GREEN on 5, 7, 16, 18 and 20 (20 green for the wrong reason, recorded as such). Record the failing lines.

### Step 9: PREPARE
- [ ] Run `src/hooks/PreToolUse.Edit.js` in a scratch CTOC project in strict mode with two crafted Write payloads: `plans/functional/x.md.status` (expect refused) and `.ctoc/streaming/questions/pending/functional__x.md--product-owner.json` (expect allowed). Record both decisions in full.
- [ ] Run `reachability.analyze` and `reachability.analyzeExports` on the repository. Record the callers credited for `createVision`, `convertToFunctional`, `markNeedsInput`, `readStatus`, `writeStatus`, `markComplete` and `writePlanQuestions`.
- [ ] Run the widened scanner (from a scratch copy of the module) over the live `agents/` tree before the rewrite. Record every finding by key. Each is either one of the three planning agents (fixed here) or handled per the answer to question 4.
- [ ] Confirm by reading `streaming-gate.pendingGateDecisions` that no vision plan is ever listed. Record it.
- [ ] Record `node --version`.

### Step 10: IMPLEMENT
- [ ] `src/lib/streaming-questions-sweeper.js`: the producer suffix, the empty-list refusal, the merge, the header.
- [ ] `src/hooks/SessionStart.js`: the directive text and the per-plan stamp.
- [ ] `src/lib/unexecutable-instruction-scan.js`: the call-verb gerund, the sentence boundary, the imperative-lead and code-block signatures, the header. Run the fence test and record that test 20 is now red on the three live agents.
- [ ] `agents/planning/product-owner.md`, `agents/planning/implementation-planner.md`, `agents/planning/vision-advisor.md`: every change in the tables above. Re-run the fence test and record test 20 green.
- [ ] `src/lib/background.js`: delete `markNeedsInput` and its export.
- [ ] `src/tabs/vision.js`: the shared name rule and the no-overwrite loop in both functions.
- [ ] `.ctoc/unexecutable-instruction-baseline.json`: per the answer to question 4.
- [ ] `CLAUDE.md`: the two paragraphs.
- [ ] Run the five test files again. Expect GREEN.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic` on the diff. It should attack these points:
  - whether any merge order can remove another producer's question;
  - whether the suffix binding admits a file that promotes to a different plan;
  - whether each rewritten agent paragraph matches `validatePlanQuestions` exactly;
  - whether the directive still tells any subagent to run code;
  - every finding the widened fence makes outside the three agents, judged as a false positive or a real order.

### Step 12: OPTIMIZE
- [ ] The sweeper reads the stored set once per promoted file, and only when one exists. The scanner's code-line pre-pass runs once per agent file.

### Step 13: SECURE
- [ ] Dispatch `security-scanner` on the diff. It should confirm these points:
  - the sweeper's full validation ladder still runs for suffixed names;
  - the suffix set is closed;
  - no payload text reaches the discard log or a screen beyond validated questions;
  - the directive prints only references and numbers;
  - no agent gained a tool;
  - no new pattern is unsafe.

### Step 14: VERIFY
- [ ] Run `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`.
- [ ] Run `npm run lint`: zero warnings.
- [ ] Confirm the dead-export fence still reports `maxDead` 65 and the dead-code fence its committed baseline.
- [ ] Confirm the unexecutable-order fence's live count equals `maxDebt` exactly.
- [ ] Confirm the false-green fence has gained no finding.

### Step 15: DOCUMENT
- [ ] Confirm CLAUDE.md's streaming and fence paragraphs match the built code.
- [ ] Update the sweeper's header and validation ladder, and the scanner's header (signatures, boundary, honest limits).
- [ ] Write the JSDoc for the new scanner helpers and the sweeper's merge step.

### Step 16: FINAL-REVIEW
- [ ] In a scratch project, show the owner in full a product-owner quarantine file written exactly as the agent text instructs, and the decision-screen text `/ctoc:start` then renders for that plan.
- [ ] Show the owner in full the fence's output on the planted pre-fix lines.
- [ ] Dispatch `iron-loop-critic` for the final review against the acceptance criteria.
- [ ] Hand the result to the owner for his decision to call it done.
