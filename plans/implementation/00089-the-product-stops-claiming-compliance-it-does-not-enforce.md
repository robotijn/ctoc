---
title: "The product stops claiming compliance enforcement it does not perform — a recorded regime says so instead of implying coverage"
type: implementation
parent_plan: ctoc-honest-instruments
depends_on: 00088-the-reachability-fence-stops-counting-prose-as-a-caller
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "agents/coordinator/cto-chief.md"
  - "docs/INDEPENDENCE.md"
  - "docs/CRITICAL_CONTROL_POINTS.md"
  - "docs/PROCESS_FMEA.md"
  - "src/commands/start.js"
  - "tests/compliance-claims-match-code.test.js"
  - "README.md"
  - "CLAUDE.md"
---

# The product stops claiming compliance enforcement it does not perform

A false compliance claim is the one defect in this repository that can hurt a user
**legally**. Everything else costs time.

> **Rebase note (2026-07-30).** This plan was written against an older tree and has
> been rebased onto the current code without changing its intent or acceptance
> criteria. The command file `src/commands/menu.js` was renamed to
> `src/commands/start.js` (and `menu.md` → `start.md`); `attachComplianceQuestion`
> still lives at the same offset (`start.js:85-112`, banner at `:89-94`). The
> `cto-chief.md` control claims moved down the file. All line numbers below are
> re-verified against today's files; Step 9 still re-verifies and THE FILES WIN on
> any residual drift.

## What is actually true, verified by grep across all of `src/`

`src/lib/regulatory-regime.js:282` defines `isControlEnabled(projectRoot,
controlName)` — the single function that decides whether any of the 42 regulatory
controls is active. It is exported at `:381`. (Both line numbers re-verified today.)

**Nothing in `src/` calls it.** Not one file. The only place in the shipped product
that invokes it is an agent recipe, `agents/coordinator/ivv-chief.md:35-36`
(re-verified today):

```js
const { isControlEnabled } = require('../../src/lib/regulatory-regime.js');
if (isControlEnabled(projectRoot, 'independent_verification_validation')) {
```

So exactly one control out of 42 has a mechanism that consults it. The other 41 are
listed in profile files, are activated by the menu, are persisted to settings — and
are read by nothing.

The libraries that would perform those controls have no caller either. Grepped for a
`require` edge across the whole repository outside `plans/`:
`src/lib/four-eyes.js` — none (its only mention of `isControlEnabled` is a doc
COMMENT at `four-eyes.js:24`, not a call — re-verified today).
`src/lib/audit-chain.js` — none. `src/lib/legal-hold.js` — none.
`src/lib/spoliation-safe.js` — none. `src/lib/proportionality.js` — none.
`src/lib/ai-provenance.js` — none. `src/lib/data-lineage.js` — none.
`src/lib/traceability-matrix.js` — none. `src/lib/irac-schema.js` — none.
`src/lib/privilege-posture.js` — none.

And `src/hooks/human-gate-check.js` contains no reference to four-eyes of any kind
(re-verified today — grep for `four-eyes`, `four_eyes_gate3`, `verifyFourEyes`
returns nothing).

## The sharpest single item: a documented hook behaviour that does not exist

`docs/INDEPENDENCE.md:83`, verbatim (re-verified today):

> The pre-tool hook in `src/hooks/human-gate-check.js` consults `four-eyes.js` when
> the `four_eyes_gate3` control is active. If a plan reaches `done/` without both
> markers satisfying the identity-distinctness property, the hook auto-reverts the
> move, logs the violation to `.ctoc/logs/gate-violations.json`, and alerts the user.

That is a description of a mechanism, in the present indicative, naming a specific
file and a specific behaviour. The hook does not require `four-eyes.js`, does not
mention it, and performs no such check. A user reading that sentence — under
Sarbanes-Oxley Section 404, PCI DSS 6.5.4 or ISO 27001 Annex A 5.3, all three of
which that page cites — would reasonably believe segregation of duties is enforced
at Gate 3. It is not enforced at all.

`agents/coordinator/cto-chief.md` carries the same shape in the v6.9.27 section (all
four line numbers re-verified today):

- `:841` — "Four-eyes verification (`src/lib/four-eyes.js`) when `four_eyes_gate3` is
  active — Gate 3 **requires** two distinct … markers"
- `:846` — "Audit hash-chain (`src/lib/audit-chain.js`) — **every** dispatch entry
  **is** content-hashed … **Required when** `audit_hash_chain` is active (Securities
  and Exchange Commission 17a-4 / FINRA Rule 4511 audit-trail alternative)"
- `:849` — "Spoliation-safe deletion — **every** destructive operation **routes
  through** a content-addressed snapshot"
- `:848` — "while any hold has `status: active`, `src/lib/legal-hold.js` **blocks**
  destructive operations"

Nothing evaluates the trigger for any of them.

## What is NOT a false claim — a correction to the brief

The brief treats "zero callers in `src/`" as proof of a false claim. In CTOC's
architecture that inference is too broad, and applying it uniformly would retract
something that is true.

The compliance **dispatch seam** at `cto-chief.md:244-284` is a genuine, complete
recipe: it tells the CTO Chief to call `evaluateComplianceTrigger(projectRoot)`, to
call `runComplianceForTransition(projectRoot, {…})` when a regime is on, and to log
the dispatch. In this system the session model executing an agent definition **is**
the runtime — that is the same mechanism by which `approveSubplans(parentSlug,
'review')` at `src/commands/start.md:50` operates the Gate 3 approval, and the export
fence explicitly credits that form as a live caller. `runComplianceForTransition`,
`writeComplianceTrigger` and `evaluateComplianceTrigger` therefore have a real
caller, and `shouldRunGdpr` / `shouldRunEuAiAct` have a real consumer chain
(`gdpr-agent-runner` → `compliance-integration`).

**So the line this slice draws is not "no code caller". It is: a claim of ACTIVE
ENFORCEMENT for a control that nothing — not code, not a hook, not an agent recipe —
ever evaluates.** By that test, the compliance dispatch section stays; the v6.9.27
control claims and the `INDEPENDENCE.md` hook sentence go.

## What the menu must say

`src/commands/start.js:85-112` (`attachComplianceQuestion`) asks "Which EU compliance
regime applies to this project?" and persists the answer. That question is not inert —
a chosen regime does gate the advisory GDPR / EU AI Act agent dispatch described
above. But every regime profile also declares a `required_controls:` list
(`.ctoc/regulatory-regimes/gdpr.yaml:18` lists `audit_hash_chain`,
`sox-itgc.yaml:10-12` lists `audit_hash_chain` and `four_eyes_gate3`), and **not one
of those controls is activated by choosing the profile.** A user who picks a regime
and reads today's prompt has no way to learn that. The prompt must say it plainly.

## Implementation Details

### File: `agents/coordinator/cto-chief.md`
**Action:** MODIFY
**Purpose:** Every statement of active enforcement becomes an accurate statement of what happens today.
**Change type:** documentation correction across the v6.9.27 section (`:799-854`)

For each control claim in that section, apply this rule:

- **The control has an evaluator** (today: only `independent_verification_validation`,
  via `ivv-chief.md`) → the claim stays, unchanged.
- **The control has no evaluator** → the sentence is rewritten to state what is
  actually on disk, and must contain the exact marker `NOT ENFORCED`.

The rewrite pattern, applied to `:841`:

> - **Four-eyes verification** — `src/lib/four-eyes.js` implements the
>   identity-distinctness check for `four_eyes_gate3`. **NOT ENFORCED**: no hook,
>   gate or agent evaluates `isControlEnabled(root, 'four_eyes_gate3')`, so Gate 3
>   does not today require two distinct approvers. The library is present and
>   tested; wiring it to Gate 3 is unbuilt work.

Same treatment for `:846` (audit hash-chain), `:848` (legal hold), `:849`
(spoliation-safe), and every other control statement in the v6.9.27 section
(`:803-854`) that has no evaluator. Step 9 enumerates them exhaustively by the method
below — the four named here are the verified examples, not the complete list.

The section heading changes from "Cross-Industry Critique Integrations" (`:799`) to
something that does not assert integration; the executor chooses the wording and
records it.

**Do not delete the modules and do not delete these entries.** They are the basis of
the future wiring, and a reader needs to know the library exists.

---

### File: `docs/INDEPENDENCE.md`
**Action:** MODIFY
**Purpose:** Remove a statement of hook behaviour that is false.

Replace `:83` ("How it integrates with the Iron Loop") with an accurate statement:
the library implements the check, nothing calls it, Gate 3 does not require two
distinct approvers today, and the sentence carries the `NOT ENFORCED` marker. The
standards table above it (`:75-79`) stays — it describes when the control *would* be
required, which remains true. (Step 9 also revisits `:23`, which asserts the same
`human-gate-check.js` hook enforces the IV&V audit-directory separation; apply the
marker treatment there too if the enumeration confirms no evaluator.)

---

### File: `docs/CRITICAL_CONTROL_POINTS.md` and `docs/PROCESS_FMEA.md`
**Action:** MODIFY
**Purpose:** The same correction where these pages restate an unenforced control as a live control.

Verified instances (re-verified today): `CRITICAL_CONTROL_POINTS.md:34` maps
record-keeping to the `audit_hash_chain` control; `PROCESS_FMEA.md:338` states that
"when the active profile requires `four_eyes_gate3`, two distinct approvers are
required" (and `PROCESS_FMEA.md:137` and `:334` name the four-eyes Gate 3 control as
reducing occurrence). All get the marker treatment. Step 9 enumerates the rest.

`CRITICAL_CONTROL_POINTS.md:69` — the plan-critic score claim — has **already been
corrected** in the current tree (that line now reads "No automated score stands
behind this limit" and explains the deleted `critique()` scores). There is nothing to
do there and nothing to collide with; **leave `:69` alone.**

---

### File: `src/commands/start.js`
**Action:** MODIFY
**Purpose:** Tell the user plainly that the regime is RECORDED, not ENFORCED.
**Change type:** modify-existing — the prompt text and option descriptions in `attachComplianceQuestion` (`start.js:85-112`)

Two edits, text only. No logic changes, no new key, no gate touched.

1. The banner at `start.js:89-94` (the `result.text = …` assignment) gains one
   sentence stating what choosing a regime does and does not do:

   > Choosing a regime is RECORDED in settings and switches on the advisory GDPR /
   > EU AI Act review that runs before Gate 2. It does **NOT** enforce the profile's
   > regulatory controls (audit hash-chain, four-eyes at Gate 3, legal hold and the
   > rest are present as libraries but NOT ENFORCED). Do not treat a chosen regime
   > as compliance coverage.

2. Each non-`None` option description gains the short form: "advisory review only —
   the profile's controls are NOT ENFORCED".

The wording must survive `stripCtl` (still present in `start.js`) and the dashboard's
line handling; keep it plain text with no control characters and no box-drawing. The
existing `tests/compliance-ride-along.test.js` asserts the four option labels and the
four `claude:set-compliance-regime` actions only (not the banner wording), so adding
the sentence must not change the option set or action map.

---

### File: `README.md`, `CLAUDE.md`
**Action:** MODIFY
**Purpose:** The same correction wherever these two make a control claim.

Step 9 enumerates. `CLAUDE.md` already handles one instance correctly — it says
dispatch logging "is an instruction-level protocol … not by an enforcement hook
today" — which is exactly the tone the rest must adopt. If a file makes no
enforcement claim, it is not edited; declaring it here does not oblige a change.

---

### Wiring — the live call sites

| changed surface | live reader | root |
|---|---|---|
| `cto-chief.md` v6.9.27 section (`:799-854`) | the session model executing the CTO Chief definition | every CTO Chief dispatch |
| the menu banner and option text (`start.js:85-112`) | rendered by `attachComplianceQuestion` on first open | `/ctoc:start` |
| `docs/INDEPENDENCE.md`, `CRITICAL_CONTROL_POINTS.md`, `PROCESS_FMEA.md`, `README.md` | a human evaluating whether CTOC covers their regulatory obligation | the repository |
| the new fence test | `npm test` | `src/scripts/test-gate.js` |

## Test Plan

### Tests: `tests/compliance-claims-match-code.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `node:assert`)

The fence must fail if a claim of active enforcement reappears while the calling
code is still absent — and it must not be a brittle phrase match. Guessing at
English is exactly how a fence starts crying wolf and then gets deleted.

**The rule is a marker requirement, not a natural-language judgement.** It has two
halves and both are mechanical:

1. **Compute `ENFORCED` from the code.** A control name is ENFORCED if and only if
   it appears as a string literal argument to `isControlEnabled(` in either
   (a) comment-stripped source under `src/**/*.js`, or (b) a shipped instruction
   surface (`agents/**/*.md`, `src/commands/*.md`, `skills/**/SKILL.md`) with call
   syntax. Reuse `reachability.js`'s comment-stripping discipline; do not invent a
   second lexer.
2. **Every claim-surface line that names a control must carry the marker.** For each
   control name in `regulatory-regime.js`'s control list, scan the claim surfaces
   (`agents/**/*.md`, `docs/*.md`, `README.md`, `CLAUDE.md`). For each line naming a
   control that is NOT in `ENFORCED`, the line — or the bullet it belongs to — must
   contain the literal marker `NOT ENFORCED`. Fail with the file, the line number
   and the sentence.

| # | Case | Assertion |
|---|---|---|
| 1 | **the analysis is non-vacuous** | the control list has > 20 entries, the claim-surface scan reads > 5 files, and `ENFORCED` is non-empty (it contains `independent_verification_validation` today) — a broken scan that finds nothing must FAIL, never pass |
| 2 | **`ENFORCED` is computed, not hardcoded** | a planted temporary fixture with a source file calling `isControlEnabled(root, 'planted_control')` yields `planted_control` in `ENFORCED` |
| 3 | **a comment cannot enforce a control** | a fixture whose only occurrence is `// isControlEnabled(root, 'ghost_control')` does NOT yield `ghost_control` (this is exactly the shape of the real `four-eyes.js:24` comment, so the live scan must not credit it either) |
| 4 | **the repository is honest today** | every unenforced control named in a claim surface carries the marker — RED before this slice, green after |
| 5 | **a re-introduced bare claim FAILS** | a fixture claim surface asserting `four_eyes_gate3` with no marker fails the check — the regression this fence exists for |
| 6 | **a stale marker also fails** | a fixture marking an ENFORCED control `NOT ENFORCED` fails, so markers get removed when a control is finally wired |
| 7 | **the hook really does not consult four-eyes** | `src/hooks/human-gate-check.js` contains no reference to `four-eyes`, `four_eyes_gate3` or `verifyFourEyes` — pinning the fact the documentation used to misstate. If a future slice wires it, this case fails and is updated as part of that wiring |
| 8 | **the menu tells the truth** | driving `attachComplianceQuestion` (imported from `src/commands/start.js`) on a real result object yields text containing `NOT ENFORCED` and `RECORDED`, and still contains all four options and all four `claude:set-compliance-regime` actions |
| 9 | **the compliance dispatch recipe is untouched** | `cto-chief.md` still contains the `runComplianceForTransition(` and `evaluateComplianceTrigger(` call recipes and the `dispatcher: "cto-chief"` literal — proving this slice retracted claims without breaking the one compliance path that IS wired |

Cases 2, 3, 5 and 6 use planted fixtures in a temporary project so the fence's own
logic is proved without depending on the live repository's wording.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises`, POSIX-normalised paths.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/compliance-claims-match-code.test.js` in full and run only that file. Cases 4, 7 and 8 MUST be red today (unmarked claims exist, and the menu says nothing about enforcement); case 7's assertion is red only if the documentation-versus-code mismatch is mis-stated, so record its result verbatim either way. Cases 1, 2, 3, 5, 6 and 9 must be green from the start — they prove the fence's own mechanics.
### Step 9: PREPARE — enumerate the claim surfaces EXHAUSTIVELY and record the list in the execution record. Method, stated so it is repeatable: for every control name in `src/lib/regulatory-regime.js`'s control list, grep `agents/**/*.md`, `docs/*.md`, `README.md` and `CLAUDE.md`; for each hit, determine whether any evaluator exists by the `ENFORCED` rule above. Also re-read `src/hooks/human-gate-check.js` in full to confirm the four-eyes absence, and `src/commands/start.js:85-112`. Where this plan's line numbers or quotations disagree with the files, THE CODE AND THE FILES WIN — record every discrepancy.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `agents/coordinator/cto-chief.md` — the v6.9.27 control claims (`:803-854`), marker-corrected; the compliance dispatch section at `:244-284` left byte-identical.
  - `docs/INDEPENDENCE.md` — the false hook sentence at `:83` replaced.
  - `docs/CRITICAL_CONTROL_POINTS.md`, `docs/PROCESS_FMEA.md` — the enumerated instances (`:69` left untouched — already corrected upstream).
  - `src/commands/start.js` — the RECORDED-not-ENFORCED banner and option descriptions in `attachComplianceQuestion`.
  - `README.md`, `CLAUDE.md` — only the enumerated instances, if any.
### Step 11: REVIEW — read every edited sentence back and ask one question of each: could a person reading this believe a control is active when it is not? Confirm no module was deleted, no export removed and no gate logic changed. Confirm the compliance dispatch recipe still passes case 9. Confirm the export and reachability fences are unmoved — if a retracted sentence removed the last mention of a `src/**.js` path, say so explicitly and check the baselines.
### Step 12: OPTIMIZE — the new test scans a bounded file set once. Read each file once, share the control list, and keep every regex linear with disjoint classes.
### Step 13: SECURE — no code path, gate, hook or permission is changed. Confirm the menu edit touches only display text and cannot alter `regulatory_regime.active_profiles`, any enforcement key, or any gate key. Confirm no absolute path or user identity is written into the prompt text.
### Step 14: VERIFY — run the new test plus `tests/menu*.test.js`, `tests/compliance-ride-along.test.js`, `tests/cto-chief-compliance-dispatch.test.js`, `tests/reachability.test.js`, `tests/export-reachability.test.js` and any agent-content test, then the full gated run `npm test`. Lint the changed JavaScript. Do not lower the coverage floor. No git operations.
### Step 15: DOCUMENT — bump the documented test-file count in `CLAUDE.md` (read the live count from disk first). Add one short paragraph to `CLAUDE.md` recording the rule this slice establishes: a claim of active enforcement requires an evaluator, and the fence that keeps it true.
### Step 16: FINAL-REVIEW — report the exhaustive claim list from Step 9 with each item's disposition, the verbatim red and green evidence, and every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **The test is a MARKER requirement, not a phrase match.** A fence that tries to
   recognise "sounds like a claim of enforcement" in English will produce false
   alarms, get whitelisted, and die. The mechanical rule — a control that no
   evaluator consults must be named alongside the literal `NOT ENFORCED` — is
   unambiguous in both directions, and case 6 makes stale markers fail too, so the
   marker is removed automatically when a control is finally wired.
2. **The compliance DISPATCH seam is not retracted, correcting the brief.** An agent
   recipe with real call syntax is CTOC's sanctioned execution mechanism — the same
   one that runs the Gate 3 approval from `start.md:50`, and the same one the export
   fence credits as a live caller. Retracting `runComplianceForTransition` as a false
   claim would have deleted a true statement about a working path.
   `evaluateComplianceTrigger`, `writeComplianceTrigger` and the `shouldRunGdpr` /
   `shouldRunEuAiAct` chain are in the same position.
3. **`independent_verification_validation` keeps its claim.** `ivv-chief.md:35-36`
   contains a real `isControlEnabled(projectRoot, …)` call. It is the one control
   with an evaluator, and the fence computes that rather than assuming it.
4. **The menu question is not removed and the regime is still recorded.** The
   recorded regime does drive the advisory review, and removing the question would
   break a working path to fix a wording problem. The defect is that the prompt let a
   user infer coverage; the fix is to say what it does.
5. **Nothing is deleted.** Every library named here stays on disk, tested, as the
   basis of the wiring the human will schedule. This slice changes only what the
   product SAYS about them.
6. **This slice depends on the reachability-fence slice, and that fence has now
   tightened.** When this plan was written, a `src/**.js` path merely NAMED in prose
   was promoted to an execution ROOT by the reachability analyzer, so several of these
   libraries — including `four-eyes.js` and `audit-chain.js` — were "reachable" ONLY
   through the very sentences this slice rewrites; retracting a claim first would have
   turned the reachability ratchet red for doing the right thing. `00088` (currently
   in `review`) has since corrected the analyzer: `src/lib/reachability.js` now credits
   a root only when a shipped instruction actually RUNS a file (`node <path>` /
   `require('<path>')`), and a path NAMED in prose is a CITATION, not a root (see the
   module header comment and `NODE_RUNS_SRC_RE`). The `depends_on` ordering therefore
   still holds until `00088` crosses to done, but the concern is already resolved in
   the tree: after the fence tightening, those files are tracked reachability DEBT and
   this slice's prose edits are inert to the ratchet.
7. **Eight files are declared.** The claim surfaces are genuinely spread across the
   agent definition, three documentation files, the menu command (`start.js`), and
   the two top-level docs. Each is edited only where Step 9's enumeration finds an
   instance; declaring a file does not oblige a change.

## What this plan does NOT fix

- **It wires nothing.** After this slice, `four_eyes_gate3` still does not require
  two approvers, the audit hash chain still hashes no dispatch, legal hold blocks
  nothing, and spoliation-safe deletion snapshots nothing. The only change is that
  the product no longer says otherwise. Wiring the subsystem is separate work the
  human schedules — the sibling plan `00191` (`depends_on` this one) scopes the
  four-eyes seam wiring and must not be built before this slice lands.
- It does not remove or alter any regulatory profile in `.ctoc/regulatory-regimes/`.
  A profile still lists the controls it *would* activate; the fence makes the product
  say that they are not active.
- It does not touch `docs/CRITICAL_CONTROL_POINTS.md:69` (the plan-critic score
  claim). That defect has already been corrected upstream — the line no longer makes
  the score claim — so there is nothing to edit and nothing to collide with.
- It does not change any human gate, enforcement key or permission.
