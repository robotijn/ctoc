---
title: "W08 — Enforcement Stays On and Honest"
created: "2026-07-11T00:00:00Z"
type: stub
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: MEDIUM
status: stub
depends_on: ctoc-audit-w01-enforcement-blocks
---

# W08 — Enforcement Stays On and Honest

## Problem

Even once enforcement actually blocks (W01), four defects let it quietly turn itself
off or lie about its own state:

- **Self-unlocking on its own block message.** The escape-phrase check greps the
  whole transcript tail across *all* roles. CTOC's own block message *names* the
  escape phrases, so the very act of blocking injects a phrase into the transcript
  that unlocks the *next* edit. A plain `Read` of `CLAUDE.md` (which also lists the
  phrases) does the same.
- **Self-disable from a subdirectory.** The project detector does no upward walk for
  `.ctoc/`, so running from any subdirectory fails to find the project root and
  enforcement silently treats the project as out of scope.
- **Editing the maintainer's own `CLAUDE.md` every session.** `SessionStart.js`'s
  self-repo guard compares `__dirname` instead of `pkg.name`, so it fails to
  recognize the CTOC repo and injects operating-manual text into the maintainer's own
  `CLAUDE.md` every session. Observed live this session: **+122 lines injected.**
- **False self-description.** The injected SessionStart text claims enforcement is
  "cryptographically enforced" with "no escape phrases" — neither is true; escape
  phrases exist and are the mechanism above.

**Observability note:** these bugs are only *observable* after W01 lands. Until a
PreToolUse deny actually blocks the tool call, the unlock-on-block-message bug cannot
be seen to fire (nothing was blocked to unlock), which is why this workstream
`depends_on` W01.

## Scope

- **Escape-phrase matcher:** parse the transcript as JSONL and match an escape phrase
  only in recent messages with `role === 'user'` (never assistant/tool/system), and
  **drop the phrase list out of the block message** so a block cannot seed its own
  unlock.
- **Project detector:** walk up the directory tree to find `.ctoc/`, so enforcement
  stays active from any subdirectory.
- **SessionStart self-repo guard:** gate the injection on `isCtocRepo`
  (`pkg.name === 'ctoc'`) instead of `__dirname`, so CTOC's own repo is never
  self-edited.
- **Injected text:** regenerate the SessionStart operating-manual text to describe
  the *real* flow (escape phrases exist, block uses exit 2 / `permissionDecision`),
  removing the "cryptographically enforced / no escape phrases" falsehoods.

**Does NOT touch:** the exit-code / deny mechanism itself (that is W01, the
prerequisite), CRLF parsing or shell-outs (W07), release/metadata (W09), or the
human-gate ledger (W02). This workstream is scoped to keeping an *already-blocking*
enforcer honest and undismissable.

## Story Map

**Goal:** Enforcement cannot be tricked into disabling itself and never describes
itself falsely to the session.
- **Actor:** The CTOC user running with `--dangerously-skip-permissions` (for whom
  the hook is the only guardrail) and the maintainer whose `CLAUDE.md` must not be
  silently rewritten.
- **Impact:** A block message, a doc read, or a subdirectory `cwd` no longer disables
  enforcement; the session is told the truth about how enforcement works.
- **Success metric:** Zero paths by which a non-user message unlocks an edit; zero
  self-edits of CTOC's own `CLAUDE.md`; the injected text matches the real mechanism.

### Activity 1 — Only a real user can invoke an escape phrase
- `[MVP]` As a user relying solely on PreToolUse, I want an escape phrase to count
  only when *I* typed it, so that CTOC's own block message cannot unlock my next edit.
  - Acceptance: given a transcript where the most recent escape phrase appears in an
    assistant/tool block message (not a user message), the matcher returns no match
    and the edit stays blocked.
- As a user, I want a `Read` of `CLAUDE.md` to never unlock enforcement, so that
  viewing the docs does not disable the guardrail.
  - Acceptance: the block message no longer contains the phrase list; a transcript
    whose only phrase occurrence is a doc Read yields no match.

### Activity 2 — Enforcement stays active from any directory
- `[MVP]` As a user working in a subdirectory, I want enforcement to find the project
  root by walking up to `.ctoc/`, so that it does not silently treat the project as
  out of scope.
  - Acceptance: with `cwd` set several levels below the repo root, the detector
    resolves the same project root as when run from the root.

### Activity 3 — SessionStart never edits CTOC's own CLAUDE.md
- `[MVP]` As the maintainer, I want SessionStart to recognize the CTOC repo via
  `pkg.name === 'ctoc'`, so that it never injects operating-manual text into my own
  `CLAUDE.md`.
  - Acceptance: running SessionStart inside the CTOC repo produces zero diff to
    `CLAUDE.md` (the +122-line injection no longer occurs).

### Activity 4 — The session is told the truth
- As a user, I want the injected session text to describe the real enforcement flow,
  so that I am not falsely told it is "cryptographically enforced" with "no escape
  phrases."
  - Acceptance: the regenerated text contains no "cryptographically enforced" /
    "no escape phrases" claims and does describe exit-2/`permissionDecision` blocking
    and the user-only escape-phrase rule.

## Rough acceptance criteria (Given / When / Then)

1. **Block cannot self-unlock.** Given enforcement has just emitted a block message,
   When the next edit is attempted, Then the escape-phrase matcher finds no phrase in
   any `role === 'user'` message and the edit remains blocked.
2. **Doc read cannot unlock.** Given the transcript's only escape-phrase occurrence is
   inside a `Read` of `CLAUDE.md`, When an edit is attempted, Then the matcher returns
   no match.
3. **Subdirectory stays enforced.** Given `cwd` is a nested subdirectory of a CTOC
   project, When the project detector runs, Then it walks up, finds `.ctoc/`, and
   enforcement is active (project is in scope).
4. **No self-edit.** Given SessionStart runs inside the CTOC repo
   (`pkg.name === 'ctoc'`), When it completes, Then `CLAUDE.md` is unchanged.
5. **Honest self-description.** Given SessionStart injects operating-manual text into a
   consumer project, When the text is generated, Then it omits the
   "cryptographically enforced / no escape phrases" claims and states the real
   exit-2 + user-only-escape-phrase behavior.

## Findings addressed

- **H4** — escape-phrase check greps all roles; the block message unlocks the next
  edit; a `CLAUDE.md` Read unlocks too.
- **H5** — enforcement self-disables from a subdirectory (no upward `.ctoc/` walk).
- **H6** — SessionStart edits the maintainer's own `CLAUDE.md` (`__dirname` vs
  `pkg.name` self-repo guard); observed +122 lines this session.
- **L3** — injected SessionStart text falsely claims "cryptographically enforced" /
  "no escape phrases."

**Observability:** H4/H5/H6/L3 are OBSERVABLE only after W01 lands — until deny
actually blocks a tool call, the unlock-on-block-message bug cannot be seen to fire.

## INVEST status

| Story | I | N | V | E | S | T | Notes |
|---|---|---|---|---|---|---|---|
| A1 MVP — user-only phrase match | Y* | Y | Y | Y | Y | Y | *Observable only after W01; logic itself is independent |
| A1 — drop phrase list from block | Y | Y | Y | Y | Y | Y | Small; drivable by asserting message text |
| A2 MVP — upward `.ctoc/` walk | Y | Y | Y | Y | Y | Y | Independent; drivable with nested cwd fixture |
| A3 MVP — `isCtocRepo` guard | Y | Y | Y | Y | Y | Y | Independent; drivable by asserting zero CLAUDE.md diff |
| A4 — honest injected text | Y | Y | Y | Y | Y | Y | Text-content assertion |

## Decisions Taken Under Ambiguity

- **No Business Model Canvas.** No canvas exists at
  `plans/canvas/ctoc-self-audit-remediation.md`. This is a technical remediation
  vision; a BMC is N/A. Recorded here and proceeding — no kickback.
- **`depends_on: ctoc-audit-w01-enforcement-blocks` is an observability dependency,
  not a code-merge dependency.** The W08 code changes are independently authorable and
  testable in isolation (unit tests on the matcher, detector, and guard drive the
  behavior directly); W01 is required only to *observe* the end-to-end unlock-on-block
  path. Encoded as `depends_on` per the vision's stated prerequisite so the maintainer
  sequences it after W01 at the gate.
