---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:57.940Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-13T11:01:11.679Z
gate_crossed: functional → implementation
---

---
title: "W08 — Enforcement Stays On and Honest"
created: "2026-07-11T00:00:00Z"
type: feature
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: MEDIUM
depends_on: ctoc-audit-w01-enforcement-blocks
---

# W08 — Enforcement Stays On and Honest

> **SIP1 INDEX.** This functional-derived plan is decomposed into the
> dependency-ordered slices below (Iron Loop Steps 5–7). Each slice is a complete,
> independently executable implementation plan (`parent_plan:
> ctoc-audit-w08-enforcement-honest`) carrying its own Steps 8–16 and its own
> `files:` scope. The ASSESS / ALIGN / CAPTURE sections below are the retained
> upstream context that every slice was authored against.

## Slices (dependency-ordered)

| # | Slice file | Defect / finding | Scope (one line) | `files:` touched | `depends_on` |
|---|---|---|---|---|---|
| 1 | [`ctoc-audit-w08-s1-escape-role-scoping.md`](./ctoc-audit-w08-s1-escape-role-scoping.md) | Defect 1 / **H4** | Escape-phrase matcher extracts only genuinely user-*typed* transcript text (JSONL parse; exclude `tool_result`/assistant) **+** drop the verbatim phrase list from `block()`'s stderr message | `src/hooks/PreToolUse.Edit.js`, `tests/pretooluse-edit-escape-role-scoping.test.js` | none |
| 2 | [`ctoc-audit-w08-s2-detector-upward-walk.md`](./ctoc-audit-w08-s2-detector-upward-walk.md) | Defect 2 / **H5** | `isCtocProject()` walks up to the first ancestor with `.ctoc/` + `CLAUDE.md`, so a nested `cwd` keeps enforcement on; root-level result unchanged | `src/lib/ctoc-project-detector.js`, `tests/ctoc-project-detector-upward-walk.test.js` | none |
| 3 | [`ctoc-audit-w08-s3-sessionstart-honest.md`](./ctoc-audit-w08-s3-sessionstart-honest.md) | Defect 3 + 4 / **H6 + L3** | SessionStart self-repo guard uses package identity (`isCtocRepo`, not `__dirname`) so it never rewrites CTOC's own `CLAUDE.md`; injected banner drops the false "cryptographically enforced / no escape phrases" claim | `src/hooks/SessionStart.js`, `tests/sessionstart-self-repo-and-honest-banner.test.js` | none |

**Decomposition notes.**
- **Three cohesive slices, not four.** Defects 3 and 4 both edit
  `src/hooks/SessionStart.js`, so they are combined into slice s3 to avoid a
  same-file collision (per the coordination note); each of the other two defects
  is one file + its test.
- **All three slices are mutually independent** (`depends_on: none`), matching the
  parent's finding that the four defects are independent. The maintainer chooses
  the build order at the gate — the empty `depends_on` imposes none.
- **W01 is an *observability* dependency of this whole workstream, not a build/test
  dependency of any slice.** Every slice is authorable and unit-testable **today**
  with synthetic fixtures (role-tagged JSONL, nested temp-dir projects,
  `package.json` identity fixtures, banner-string assertions); W01 landing is
  required only to watch Defect 1's unlock-on-block-message fire inside a live
  blocked session. Slice `depends_on` therefore stays `none`.
- **Batched gates.** Gate 2 (implementation→todo) and Gate 3 (review→done) approve
  all three siblings at once via `approveSubplans("ctoc-audit-w08-enforcement-honest",
  fromStage)` — one human decision per stage stamps each sibling `approved_by:
  human`. Enforcement build order stays sequential/FIFO.
- **Transcript schema for s1 confirmed at PLAN** against a live 14,300-line Claude
  Code transcript: user-typed = `type:"user"` with **string** content (or `text`
  blocks); `tool_result` blocks carry `role:"user"` too and are excluded — a strict
  refinement of the CAPTURE-stage "`role === 'user'`" shorthand. See s1's Decisions
  Taken Under Ambiguity.

## 1. ASSESS — Problem Understanding

### Business Context

Enforcement that *appears* active but can be tricked into disabling itself — or
that misdescribes its own mechanism to the session — is worse than having no
enforcement at all: it gives the exact population this layer exists to protect
(every CTOC user running with `--dangerously-skip-permissions`, and the
maintainer who trusts the four human gates) **false confidence**. A guardrail a
user believes is airtight, but which quietly unlocks itself on the guardrail's
own block message, is a silent regression to zero protection dressed as full
protection. The same is true of a maintainer whose own hand-maintained
`CLAUDE.md` is being rewritten every session without their knowledge: the file
they believe they control is drifting under them. CTOC's own project `CLAUDE.md`
(`/Users/doctony/Code/ctoc/CLAUDE.md`, "Mandatory Pipeline Use (v7)" section, item
4) already *documents* the intended contract correctly — "Escape phrase in
recent user messages (allow)... Case-insensitive, word-bounded" — the defects
below are where the code fails to implement what CTOC's own documentation
already promises.

### Current State

Four defects, confirmed by direct inspection of the code as it stands today
(2026-07-11), all independent of one another and independently unit-testable —
see Impact and Test Strategy for what "independently testable" does and does not
mean here:

- **Defect 1 — the escape-phrase check greps the whole transcript tail across
  all roles, so CTOC's own block message unlocks the next edit.**
  `findEscapeInTranscript()` at **`src/hooks/PreToolUse.Edit.js:115-120`** does no
  role-aware parsing at all — it takes the raw transcript file text (read by
  `readTranscript()`, `:109-113`, from `stdinJson.transcript_path`), slices the
  last 5000 characters (`transcript.slice(-5000)`, `:118`), and hands that raw
  slice to `escapePhrases.matchEscapePhrase()` (`:119`) — the function's own
  comment (`:117`) calls this "Crude: read last ~5KB and grep for any escape
  phrase." There is no filter for `role === 'user'` vs. assistant/tool/system
  content anywhere in this path. Compounding this: `block()`
  (`src/hooks/PreToolUse.Edit.js:122-142`) writes, at **`:128`**, `"Use an
  escape phrase (hotfix, trivial fix, urgent) if this is genuinely small."` —
  three of the seven canonical phrases verbatim, directly into the stderr text
  that becomes the harness's tool-result content shown back to the model on the
  next turn (per the hook protocol's "show stderr to model" behavior). Once that
  text lands in the transcript file, the next `findEscapeInTranscript()` call
  greps it — a phrase in CTOC's own denial becomes the ticket that unlocks the
  very next edit. A plain `Read` of CTOC's own `CLAUDE.md` does the same,
  because that file also documents all seven phrases verbatim (Mandatory
  Pipeline Use, item 4) and a `Read` tool result likewise lands in the
  transcript with no role distinguishing it from something the user typed.

- **Defect 2 — the project detector does no upward walk, so a subdirectory
  silently disables enforcement.** `isCtocProject(root)` at
  **`src/lib/ctoc-project-detector.js:29-55`** checks `.ctoc/` and `CLAUDE.md`
  only at the exact `root` argument (`:30-31`, `path.join(root, '.ctoc')` /
  `path.join(root, 'CLAUDE.md')`) — there is no loop or recursion toward a parent
  directory anywhere in the function. It is called with `root = process.cwd()`
  (`src/hooks/PreToolUse.Edit.js:177`). If `cwd` is any subdirectory that itself
  lacks `.ctoc/` and `CLAUDE.md` (e.g. `src/lib/`), `isCtoc` is `false` and
  `enforce()`'s step 2 (`:188-191`) returns `allow('silent-passthrough', ...)` —
  the tool call is allowed with **no plan-coverage, no escape-phrase check, no
  block ever considered** — not because the user typed an escape phrase, but
  because the detector never looked past the immediate directory.

- **Defect 3 — `SessionStart.js`'s self-repo guard compares `__dirname`
  instead of package identity, so it edits the maintainer's own `CLAUDE.md`
  every session.** The guard at **`src/hooks/SessionStart.js:120-129`** computes
  `ctocRoot = path.resolve(__dirname, '..', '..')` (`:121`) — the directory two
  levels above wherever *this hook file itself* physically lives — and compares
  it against `projectPath` (`:122`, `path.resolve(projectPath) !== ctocRoot`).
  This is correct only when the hook script executing *is itself* located
  inside the exact project tree being evaluated. When CTOC runs as an installed
  plugin (per this repo's own `CLAUDE.md`: "CTOC is ALWAYS installed from the
  online marketplace") while the maintainer is working inside the separately
  cloned dev repo — both legitimately named `ctoc` by `package.json` — the
  running hook's `__dirname` resolves to the *installed plugin's* location, not
  the dev repo's, so `ctocRoot !== projectPath` even though `projectPath` **is**
  the CTOC repo. The guard then proceeds to call `ensureLessonsBlock()`
  (`:123-125`), injecting operating-lessons text into the maintainer's own
  `CLAUDE.md`. **Observed live this session: +122 lines injected.** Notably,
  `src/lib/ctoc-project-detector.js:42-49` already computes a correct,
  package-identity-based `isCtocRepo` flag (`pkg.name === 'ctoc'`, read from the
  *project's own* `package.json`) — `SessionStart.js` does not use it, and
  reinvents an incorrect, location-based check instead.

- **Defect 4 — the injected SessionStart text falsely claims enforcement is
  "cryptographically enforced" with "no escape phrases."** The literal sentence
  in `generateContext()` is `"This is cryptographically enforced. There are no
  escape phrases."` at **`src/hooks/SessionStart.js:196`** (verified by direct
  line count — the surrounding `## MANDATORY: Edit/Write Blocked Before Step 8`
  section header begins at `:189`, and the sentence itself is five lines below
  that, at `:196`, not `:191`; recorded as a drift correction against the
  originating audit citation in Decisions Taken Under Ambiguity below). Neither
  claim is true: there is no cryptography anywhere in the enforcement path (it
  is exit-code / stdin-JSON hook logic), and `src/lib/escape-phrases.js` defines
  seven live, working escape phrases (`hotfix`, `trivial fix`, `trivial change`,
  `quick fix`, `urgent`, `skip planning`, `skip iron loop`) — the exact
  mechanism Defect 1 above shows can even be self-triggered.

### Impact

- A user who has just been blocked, or who reads `CLAUDE.md` to understand why,
  has — through no typed intent of their own — unlocked their very next edit
  (Defect 1). The only guardrail for `--dangerously-skip-permissions` users
  fails silently at the moment it is most needed.
- A user working one directory below a CTOC project root gets **zero**
  enforcement with no message, no log entry attributable to a decision, and no
  indication anything was skipped (Defect 2) — this is not a "hard case,"
  it is the common case of working inside `src/`, `plans/`, or any nested path.
- The maintainer's own hand-authored `CLAUDE.md` is silently rewritten on every
  session start (Defect 3), corrupting content the maintainer believes they
  fully control — the same failure class the parent vision calls out for the
  gate-ledger problem (a source of truth the human trusts turns out to be
  agent-writable).
- Every session is told a categorically false story about how it is protected
  (Defect 4), which can lead a user to trust the guardrail more than its real
  behavior warrants, or to not bother learning the real (and legitimate) escape
  hatch, since they are told none exists.
- **Observability note (carried from the stub, reverified):** none of these four
  defects can be observed *end-to-end in a live blocked session* until W01
  (`ctoc-audit-w01-enforcement-blocks`) lands a real deny — today,
  `block()` calls `process.exit(1)` (`PreToolUse.Edit.js:141`), which the
  harness does not treat as a block at all, so there is currently no real block
  for Defect 1's unlock-on-block-message bug to unlock. This is why this
  workstream `depends_on` W01. **This is an observability dependency, not a
  code or test dependency** — see Decisions Taken Under Ambiguity: all four
  fixes here are independently authorable and independently unit-testable today
  using synthetic transcripts, fixtures, and content assertions, without W01
  having landed.

## 2. ALIGN — Goals + Success Metrics

**Job to Be Done:** When enforcement has just blocked me, or I've read
`CLAUDE.md`, or I'm working in a subdirectory, or a session starts, I want the
system to neither trick itself into unlocking nor lie to me about how it works,
so I can trust that "blocked" means blocked and that what I'm told about
enforcement is true.

**Impact Map:**
- **Goal:** Enforcement cannot be tricked into disabling itself and never
  describes itself falsely to the session — the parent vision's success
  criterion #7.
- **Actor:** Every CTOC user running with `--dangerously-skip-permissions` (for
  whom the hook is the only guardrail), and the CTOC maintainer, whose
  `CLAUDE.md` must not be silently rewritten.
- **Impact:** A block message, a `CLAUDE.md` Read, or a subdirectory `cwd` no
  longer disables enforcement; the session-start banner states the true
  mechanism instead of a false one.
- **Deliverable:** A role-scoped escape-phrase matcher, a phrase-free block
  message, an upward-walking project detector, a package-identity self-repo
  guard, and honest injected session text.

**Success metrics** (each a behavior a targeted unit test can drive and observe
directly on the function under test — no subprocess/exit-code assertion is
required for this workstream, since none of these four fixes changes the
block/allow *signal*; they change what data feeds the decision or what text is
shown, see Test Strategy):

- [ ] Given a transcript whose most recent escape-phrase occurrence is inside a
  non-`user` entry, the matcher returns no match.
- [ ] Given a transcript whose most recent escape-phrase occurrence is inside a
  `user` entry, the matcher still returns that phrase (no regression).
- [ ] The block message contains none of the seven canonical escape phrases.
- [ ] Given a `cwd` several directories below a project root with `.ctoc/` and a
  CTOC-marked `CLAUDE.md`, the detector resolves the same `{ isCtoc, isCtocRepo
  }` result as when run from the root.
- [ ] Given a project whose `package.json` declares `"name": "ctoc"`, SessionStart
  never modifies that project's `CLAUDE.md`, regardless of where the running
  hook file itself is physically located.
- [ ] Given a project whose `package.json` name is not `ctoc`, SessionStart's
  injection behavior is unchanged from today (regression guard).
- [ ] The injected banner text contains neither "cryptographically enforced" nor
  "no escape phrases," and states the real block signal and the user-only
  escape-phrase rule.

## 3. CAPTURE

### Acceptance Criteria (BDD)

- [ ] **Scenario: CTOC's own block message cannot self-unlock the next edit**
  Given the most recent escape-phrase occurrence in the transcript tail is
  inside a non-`user` entry (e.g. the tool/stderr content of CTOC's own prior
  block message, which today lists "hotfix, trivial fix, urgent")
  When the next edit to the same uncovered target is attempted
  Then the escape-phrase check finds no match
  And the edit is evaluated as not-escaped (still subject to block/coverage
  logic, independent of W01's separate fix to make that block real).

- [ ] **Scenario: A Read of CLAUDE.md cannot unlock enforcement**
  Given the transcript's only escape-phrase occurrence is inside a tool-result
  entry produced by a `Read` of `CLAUDE.md` (which documents all seven canonical
  phrases verbatim)
  When an edit to an uncovered target is attempted
  Then the escape-phrase check returns no match.

- [ ] **Scenario: A genuinely user-typed escape phrase still unlocks**
  Given the most recent escape-phrase occurrence is inside an entry the
  transcript attributes to the user, who typed "hotfix"
  When an edit to an uncovered target is attempted
  Then the escape-phrase check returns "hotfix" and the edit is treated as
  escaped — proving the role-scoping fix does not also break the legitimate
  escape path.

- [ ] **Scenario: The block message no longer seeds its own unlock**
  Given enforcement produces a block message for an uncovered edit
  When the message text is generated
  Then it contains none of the seven canonical escape phrases verbatim.

- [ ] **Scenario: Enforcement stays active from a nested subdirectory**
  Given `cwd` is set several directories below a CTOC project root that itself
  has both `.ctoc/` and a CTOC-marked `CLAUDE.md`
  When the project detector runs
  Then it resolves the same project root, and the same `isCtoc` / `isCtocRepo`
  result, as when run directly from the root.

- [ ] **Scenario: Root-level detection is unchanged**
  Given `cwd` is exactly the project root
  When the project detector runs
  Then it returns the identical result it returned before the upward-walk was
  added — no behavior change at the root itself.

- [ ] **Scenario: SessionStart never edits CTOC's own CLAUDE.md, from any
  install location**
  Given SessionStart runs against a project whose `package.json` declares
  `"name": "ctoc"`, regardless of whether the executing hook file's own
  location is inside that same directory tree or an entirely separate
  installed-plugin path
  When SessionStart completes
  Then that project's `CLAUDE.md` is byte-identical before and after the run.

- [ ] **Scenario: SessionStart still injects into a real consumer project**
  Given SessionStart runs against a project whose `package.json` name is not
  `ctoc`
  When SessionStart completes
  Then the operating-lessons block is injected into that project's `CLAUDE.md`
  exactly as it was before the guard change (no regression to the intended
  consumer-project behavior).

- [ ] **Scenario: The injected session banner describes enforcement honestly**
  Given SessionStart generates its session-start banner text for a consumer
  project
  When the text is rendered
  Then it contains neither "cryptographically enforced" nor "no escape
  phrases"
  And it states that enforcement blocks via the harness's real signal and that
  an escape phrase counts only when the user themself supplied it.

### Scope

#### In Scope

- Scope the escape-phrase check to `role === 'user'` transcript entries only
  (`src/hooks/PreToolUse.Edit.js`, `readTranscript()` / `findEscapeInTranscript()`,
  `:109-120`) — the exact transcript-entry field name/schema to key off is
  confirmed against a live Claude Code transcript sample at Step 5 (PLAN), not
  here (see Decisions Taken Under Ambiguity).
- Remove the verbatim escape-phrase list from `block()`'s stderr message
  (`src/hooks/PreToolUse.Edit.js:122-142`, specifically `:128`).
- Add an upward directory walk to `isCtocProject()`
  (`src/lib/ctoc-project-detector.js:29-55`) so `.ctoc/` + `CLAUDE.md` are found
  from any subdirectory of a CTOC project, not only the exact `cwd`.
- Replace the `__dirname`-derived self-repo guard in `SessionStart.js`
  (`:120-129`) with a package-identity check (`pkg.name === 'ctoc'`, read from
  the *project's* `package.json`), reusing or aligning with the `isCtocRepo`
  flag `src/lib/ctoc-project-detector.js` already computes.
- Rewrite the injected session banner text in `SessionStart.js`'s
  `generateContext()` (`:189-197`, the false claim at `:196`) to drop the
  "cryptographically enforced" / "no escape phrases" claims and state the real
  block signal and the user-only escape-phrase rule.

#### Out of Scope

- The exit-code / `permissionDecision` deny mechanism itself — that is W01
  (`ctoc-audit-w01-enforcement-blocks`), the technical prerequisite for
  observing these fixes fire end-to-end in a live blocked session.
- CRLF-safe frontmatter parsing and POSIX-only shell-outs — W07.
- Release/version/license metadata truth — W09.
- The approval-provenance ledger and multi-hop human-gate bypass prevention —
  W02 (human-gate integrity).
- Any change to the seven canonical phrases themselves or their word-boundary
  matching regex in `src/lib/escape-phrases.js` — already correct, already
  covered by `tests/escape-phrases.test.js`; this workstream only fixes what
  text is scoped and fed into that matcher, not the matcher's own logic.
- Any change to plan-coverage matching (`src/lib/plan-coverage.js`) — untouched
  by this workstream.

### Story Breakdown (INVEST-validated)

**As a** CTOC user relying solely on PreToolUse enforcement (running with
`--dangerously-skip-permissions`), **I want** an escape phrase to count only
when I personally typed it, **so that** CTOC's own block message, or a `Read` of
`CLAUDE.md`, cannot unlock my next edit.
*(Independent — the role-scoping change and the block-message trim are one
self-contained fix inside one file. Negotiable — describes the desired
behavior, not the transcript-parsing implementation. Valuable — closes a
bypass in the user's only remaining guardrail. Estimable — bounded to
`findEscapeInTranscript()`/`readTranscript()` and `block()`'s message text.
Small. Testable via synthetic role-tagged transcript fixtures — no live blocked
session or W01 required to test, only to observe end-to-end. `[MVP]`.)*

**As a** CTOC user working from a subdirectory of a CTOC project, **I want**
enforcement to find the project root by walking up to `.ctoc/`, **so that**
running a tool from `src/lib/` or any nested folder does not silently disable
enforcement.
*(Independent of the other three stories. Negotiable. Valuable — enforcement
coverage no longer depends on which directory a tool happens to run from.
Small — bounded to `isCtocProject()`. Testable with a nested-`cwd` fixture
plus a root-level regression fixture. `[MVP]`.)*

**As** the CTOC maintainer, **I want** SessionStart to recognize the CTOC repo
by its package identity rather than by comparing the running hook file's own
install location, **so that** my own `CLAUDE.md` is never rewritten regardless
of whether CTOC is running as an installed plugin or I am working directly in
the dev repo.
*(Independent. Valuable — stops silent corruption of hand-maintained content
the maintainer believes they fully control. Small — one guard, and the correct
package-identity check already exists as `isCtocRepo` in
`ctoc-project-detector.js`, so this is "reuse," not "invent." Testable via a
zero-diff assertion plus a consumer-project regression fixture. `[MVP]`.)*

**As a** CTOC user, **I want** the text SessionStart injects into my session to
describe enforcement as it actually works, **so that** I am not told a false
story ("cryptographically enforced," "no escape phrases") that overstates the
guardrail or hides the one legitimate way around it from me.
*(Independent of the other three stories. Negotiable — wording, not mechanism.
Valuable — informed trust in the tool that is supposedly protecting the user.
Small — text-only change to `generateContext()`. Testable via
string-absence/presence assertions on the rendered banner.)*

### Files Likely Touched

- `src/hooks/PreToolUse.Edit.js` — `readTranscript()` / `findEscapeInTranscript()`
  (`:109-120`) to scope matching to `role === 'user'` entries; `block()`'s
  stderr text (`:122-142`, specifically the phrase list at `:128`) to drop the
  verbatim phrase list.
- `src/lib/ctoc-project-detector.js` — `isCtocProject()` (`:29-55`) to add an
  upward walk toward the filesystem root looking for `.ctoc/` + `CLAUDE.md`,
  before falling back to the current single-directory check.
- `src/hooks/SessionStart.js` — the self-repo guard (`:120-129`) to gate on
  package identity instead of `__dirname`; `generateContext()`'s injected banner
  text (`:189-197`, false claim at `:196`) to describe the real mechanism.
- `src/lib/escape-phrases.js` — already correct (word-bounded matcher, seven
  canonical phrases, covered by `tests/escape-phrases.test.js`); likely
  untouched. The bug this workstream fixes is in what text the caller feeds
  into this matcher, not in the matcher itself.

### Test Strategy

- Every scenario above is testable **today**, independent of W01, using
  synthetic fixtures: role-tagged transcript JSONL fixtures (for Defect 1),
  nested-`cwd` project fixtures with and without `.ctoc/`/`CLAUDE.md` at each
  level (for Defect 2), `package.json` fixtures with `name: "ctoc"` and
  `name: "some-other-app"` paired with a hook `__dirname` located both inside
  and outside the fixture tree (for Defect 3), and string assertions against
  the rendered banner (for Defect 4). W01 landing is required only to observe
  Defect 1's unlock-on-block-message failure mode *fire inside a real blocked
  session* — it is not required to write or pass any test in this plan.
- Assert on **content**, not structure: the block-message and banner-text
  scenarios must assert the literal absence of specific phrases/claims
  ("hotfix", "trivial fix", "urgent", "cryptographically enforced", "no escape
  phrases"), not merely that a message or banner was produced.
- Every regression-guard scenario (root-level detection unchanged; consumer-project
  injection unchanged; genuine user-typed phrase still unlocks) must exist
  alongside its corresponding fix scenario, so this workstream does not trade
  one defect class (self-unlock / self-edit) for another (over-widened
  detection walk, or a guard so broad it also blocks legitimate injection).
- The exact transcript-entry schema (the field name distinguishing a
  user-authored entry from an assistant/tool/system one, and whether historical
  transcripts always populate it) must be confirmed against a live Claude Code
  transcript sample at Step 5 (PLAN), immediately before implementation — see
  Decisions Taken Under Ambiguity.
- Because none of these four fixes changes the block/allow *signal* itself
  (unlike W01), no subprocess/exit-code-level test is required here — direct,
  in-process tests against the exported functions are sufficient and match the
  granularity of the defects (a matcher's input scope, a detector's directory
  walk, a guard's comparison basis, a string's content).

## Decisions Taken Under Ambiguity

- **No Business Model Canvas.** No canvas exists at
  `plans/canvas/ctoc-self-audit-remediation.md`. This is a technical
  remediation vision; a BMC is not applicable. Recorded here and proceeding —
  no kickback.
- **`depends_on: ctoc-audit-w01-enforcement-blocks` is an observability
  dependency, not a code-merge dependency.** All four fixes in this workstream
  are independently authorable and independently unit-testable in isolation
  today (synthetic transcript, `cwd`, and `package.json` fixtures drive the
  behavior directly, with no dependency on W01's exit-code/`permissionDecision`
  change). W01 is required only to *observe* the end-to-end
  unlock-on-block-message failure inside a real, live-blocked session — until a
  PreToolUse deny actually stops a tool call, there is no real block for
  Defect 1 to unlock. Encoded as `depends_on` per the vision's stated
  prerequisite so the maintainer sequences it after W01 at the gate, not
  because the code depends on W01's files.
- **Line-citation drift found and corrected against the originating audit
  finding (H4/H5/H6/L3, and the stub carrying them forward): the "cryptographically
  enforced / no escape phrases" false claim was cited at
  `SessionStart.js:191`; direct line-by-line re-verification against the file
  as it stands today places the exact sentence at `SessionStart.js:196`** — line
  `191` is the section's opening prose line ("The Iron Loop is enforced by
  hooks. You CANNOT Edit or Write files until:"), five lines above the false
  claim itself. This plan cites `:196` throughout as the verified location; the
  underlying finding (the claim is false and must be removed/rewritten) is
  unaffected by the citation correction. All other file:line citations carried
  from the stub (`PreToolUse.Edit.js:115`, `ctoc-project-detector.js:29`,
  `SessionStart.js:121`) were re-verified against the current code and are
  accurate as originally cited.


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
