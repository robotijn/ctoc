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
  - "agents/coordinator/ivv-chief.md"
  - "docs/INDEPENDENCE.md"
  - "docs/CRITICAL_CONTROL_POINTS.md"
  - "docs/PROCESS_FMEA.md"
  - "docs/REALTIME.md"
  - "docs/REGULATORY_OPS.md"
  - "docs/CONTINUOUS_IMPROVEMENT.md"
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
controlName)` — the single function that decides whether any of the 40 regulatory
controls is active. It is exported at `:381`. (Both line numbers re-verified today.)

**Nothing in `src/` calls it.** Not one file. The only place in the shipped product
that invokes it is an agent recipe, `agents/coordinator/ivv-chief.md:35-36`
(re-verified today):

```js
const { isControlEnabled } = require('../../src/lib/regulatory-regime.js');
if (isControlEnabled(projectRoot, 'independent_verification_validation')) {
```

So exactly one control out of 40 has a mechanism that consults it. The other 39 are
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

### Files: `docs/REALTIME.md`, `docs/REGULATORY_OPS.md`, `docs/CONTINUOUS_IMPROVEMENT.md`, `agents/coordinator/ivv-chief.md` — the rest of the claim surface
**Action:** MODIFY
**Purpose:** Close the scope gap that kept the fence unbuildable.

The regression fence (`tests/compliance-claims-match-code.test.js`, Case 4) scans
EVERY control name in `src/lib/regulatory-regime.js`'s `KNOWN_CONTROLS` set across the
WHOLE claim surface — all of `agents/**/*.md`, `docs/*.md`, `README.md`, `CLAUDE.md` —
not only the eight files this plan first declared. Three documentation files and the
IV&V Chief agent name Cluster 5, 6 and 7 controls as live, none of which has an
evaluator, so each keeps Case 4 RED until it carries the literal `NOT ENFORCED`
marker; and the PreToolUse coverage hook blocks the executor from marking any file
outside `files:`. Both facts together are why they are added to `files:`.

**[Decision — human, Tijn, 2026-07-30]** EXPAND the scope to the full claim surface;
do NOT narrow the fence's Case-4 scan to the declared files. A fence that only checks
the files it happens to declare cannot catch the next unmarked claim, which is the
whole point of the fence.

**Verification method (repeatable).** For every one of the 40 control tokens in
`KNOWN_CONTROLS`, grep each file; for each hit confirm (a) the token is presented as a
live control in prose, a heading, or a table row — not only inside a fenced code block
or comment; (b) the naming block carries no `NOT ENFORCED` marker today; (c) the
control has NO `isControlEnabled(` evaluator anywhere in `src/**/*.js` or a shipped
instruction surface. Verified today: the ONLY control with an evaluator in the entire
repository is `independent_verification_validation` (the live call at
`agents/coordinator/ivv-chief.md:36`; `src/lib/four-eyes.js:24` is a doc COMMENT, and
the `tests/` occurrences are test files — neither counts). So
`ENFORCED = { independent_verification_validation }`, and every other named control
needs the marker.

**A figure corrected while verifying:** `KNOWN_CONTROLS` today holds **40** controls
(Cluster 1: 8, 2: 3, 3: 5, 4: 4, 5: 11, 6: 3, 7: 6), not the "42"/"41" this plan
originally stated. The fence asserts only "> 20 entries" (Case 1), so the exact count
does not affect buildability; the figures earlier in this plan are corrected to
40/39 for honesty. THE FILE WINS.

#### `docs/REALTIME.md` — 3 unmarked, unenforced controls
| control | named at (line) | disposition |
|---|---|---|
| `wcet_budget` | 26, 34, 44, 260 | not enforced → mark |
| `hil_test_ladder` | 27, 93, 122, 260 | not enforced → mark |
| `precision_time_protocol` | 28, 161, 172, 260 | not enforced → mark |

#### `docs/REGULATORY_OPS.md` — 6 unmarked, unenforced controls
| control | named at (line) | disposition |
|---|---|---|
| `dsar_handler` | 15, 26, 35 | not enforced → mark |
| `cra_incident_clocks` | 16, 26, 48 | not enforced → mark |
| `nydfs_dora_incident_class` | 17, 26, 63 | not enforced → mark |
| `business_continuity_plan` | 18, 26, 101 | not enforced → mark |
| `proportionality_test` | 19, 26, 120 | not enforced → mark |
| `clm_obligations_tracker` | 20, 26, 139 | not enforced → mark |

(The `.ctoc/settings.yaml` example at lines 185–188 lists controls inside a fenced
YAML block; a configuration example is not a claim of active enforcement and is
excluded from the marker requirement — see the Test Plan's block rule.)

#### `docs/CONTINUOUS_IMPROVEMENT.md` — 13 unmarked, unenforced controls
| control | named at (line) | disposition |
|---|---|---|
| `capa_register` | 16, 334, 338, 340 | not enforced → mark |
| `eight_d_incident_template` | 17, 339, 341 | not enforced → mark |
| `control_chart_variance` | 18, 336 | not enforced → mark |
| `defects_per_million` | 19, 335 | not enforced → mark |
| `process_capability_index` | 20, 336, 340 | not enforced → mark |
| `defect_density_target` | 21, 337 | not enforced → mark |
| `andon_cord_halt` | 22, 212, 352 | not enforced → mark |
| `critical_control_points` | 23 | not enforced → mark |
| `kaizen_backlog` | 24, 336 | not enforced → mark |
| `lessons_learned_closure` | 25, 82, 243, 335 | not enforced → mark |
| `graceful_degradation_matrix` | 26, 264, 338 | not enforced → mark |
| `process_fmea_loop` | 335 | not enforced → mark |
| `cra_incident_clocks` | 124 | not enforced → mark |

**Two of these are BEYOND the brief's original list — a materially-different finding,
recorded here rather than guessed past:** `critical_control_points` (line 23) and
`cra_incident_clocks` (line 124, the same Cluster 7 control that also appears in
`REGULATORY_OPS.md`) are both named as live controls, both unmarked, both without an
evaluator. The Case-4 scan flags them regardless of the brief, so both are enumerated
and both get the marker. (The `andon_cord_halt: false` YAML at line 363 is a settings
example — excluded, like the REGULATORY_OPS example.)

#### `agents/coordinator/ivv-chief.md` — 1 to mark, 1 correctly left unmarked
| control | named at (line) | disposition |
|---|---|---|
| `independent_verification_validation` | 3, 19, 36, 163 | **ENFORCED** (live `isControlEnabled` call at `:36`) → stays UNMARKED |
| `four_eyes_gate3` | 59 | not enforced → mark |

Invariant 5 at `:59` states that where `four_eyes_gate3` is co-active,
`src/lib/four-eyes.js` "enforces that this marker's identity differs from the
author-side approver." Nothing evaluates `isControlEnabled(root, 'four_eyes_gate3')`,
so this is an unenforced-control claim and the bullet must carry `NOT ENFORCED`. The
surrounding hedges ("no hook today … not a filesystem poll") are true but are not the
literal marker the fence requires. `independent_verification_validation` is the one
enforced control and its four mentions stay unmarked — exactly the asymmetry Case 6
(a stale marker on an enforced control must fail) protects.

**Total across the four added files: 23 unenforced-control instances to mark**
(3 + 6 + 13 + 1), plus 1 enforced control (`independent_verification_validation`)
correctly left unmarked.

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

Step 9 enumerates. Verified today: **neither `README.md` nor `CLAUDE.md` contains a
single control token from `KNOWN_CONTROLS`**, so neither carries an unenforced-control
claim and neither obliges a marker edit. `CLAUDE.md` already handles its one adjacent
instance correctly — it says dispatch logging "is an instruction-level protocol … not
by an enforcement hook today" — which is exactly the tone the rest adopts. Both stay
declared: `CLAUDE.md` for the Step 15 test-count bump and rule note, and both as guard
against a future control claim landing in either file.

---

### Wiring — the live call sites

| changed surface | live reader | root |
|---|---|---|
| `cto-chief.md` v6.9.27 section (`:799-854`) | the session model executing the CTO Chief definition | every CTO Chief dispatch |
| `agents/coordinator/ivv-chief.md` `:59` (four-eyes claim) | the session model executing the IV&V Chief definition | an IV&V dispatch when `independent_verification_validation` is active |
| the menu banner and option text (`start.js:85-112`) | rendered by `attachComplianceQuestion` on first open | `/ctoc:start` |
| `docs/INDEPENDENCE.md`, `CRITICAL_CONTROL_POINTS.md`, `PROCESS_FMEA.md`, `REALTIME.md`, `REGULATORY_OPS.md`, `CONTINUOUS_IMPROVEMENT.md`, `README.md` | a human evaluating whether CTOC covers their regulatory obligation | the repository |
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
2. **Every claim-surface BLOCK that names a control must carry the marker.** For each
   control name in `regulatory-regime.js`'s `KNOWN_CONTROLS`, scan the claim surfaces
   (`agents/**/*.md`, `docs/*.md`, `README.md`, `CLAUDE.md`). The unit is the Markdown
   BLOCK: a paragraph, a list item, a table ROW, or a heading together with the prose
   immediately beneath it up to the next heading. For each block naming a control that
   is NOT in `ENFORCED`, that block must contain the literal marker `NOT ENFORCED`.
   **Fenced code blocks and comment lines are NOT claim surface** — a settings/YAML
   example that lists controls is configuration, not a claim of active enforcement,
   and is stripped exactly as the `ENFORCED` computation strips comments (Case 3).
   Fail with the file, the line number and the offending block.

| # | Case | Assertion |
|---|---|---|
| 1 | **the analysis is non-vacuous** | the control list has > 20 entries (40 today), the claim-surface scan reads > 5 files (8 carry control tokens today), and `ENFORCED` is non-empty (it contains `independent_verification_validation` today) — a broken scan that finds nothing must FAIL, never pass |
| 2 | **`ENFORCED` is computed, not hardcoded** | a planted temporary fixture with a source file calling `isControlEnabled(root, 'planted_control')` yields `planted_control` in `ENFORCED` |
| 3 | **a comment cannot enforce a control** | a fixture whose only occurrence is `// isControlEnabled(root, 'ghost_control')` does NOT yield `ghost_control` (this is exactly the shape of the real `four-eyes.js:24` comment, so the live scan must not credit it either) |
| 4 | **the repository is honest today** | across the FULL claim surface (`agents/**/*.md`, `docs/*.md`, `README.md`, `CLAUDE.md`), every unenforced control named in a prose block, heading, list item or table row carries the `NOT ENFORCED` marker — RED before this slice, green after. The claim surface carrying a control token today is exactly EIGHT files, all now declared in `files:` — `cto-chief.md`, `ivv-chief.md`, `INDEPENDENCE.md`, `CRITICAL_CONTROL_POINTS.md`, `PROCESS_FMEA.md`, `REALTIME.md`, `REGULATORY_OPS.md`, `CONTINUOUS_IMPROVEMENT.md`; `README.md` and `CLAUDE.md` are declared but carry no control token |
| 5 | **a re-introduced bare claim FAILS** | a fixture claim surface asserting `four_eyes_gate3` with no marker fails the check — the regression this fence exists for |
| 6 | **a stale marker also fails** | a fixture marking an ENFORCED control `NOT ENFORCED` fails, so markers get removed when a control is finally wired |
| 7 | **the hook really does not consult four-eyes** | `src/hooks/human-gate-check.js` contains no reference to `four-eyes`, `four_eyes_gate3` or `verifyFourEyes` — pinning the fact the documentation used to misstate. If a future slice wires it, this case fails and is updated as part of that wiring |
| 8 | **the menu tells the truth** | driving `attachComplianceQuestion` (imported from `src/commands/start.js`) on a real result object yields text containing `NOT ENFORCED` and `RECORDED`, and still contains all four options and all four `claude:set-compliance-regime` actions |
| 9 | **the compliance dispatch recipe is untouched** | `cto-chief.md` still contains the `runComplianceForTransition(` and `evaluateComplianceTrigger(` call recipes and the `dispatcher: "cto-chief"` literal — proving this slice retracted claims without breaking the one compliance path that IS wired |

Cases 2, 3, 5 and 6 use planted fixtures in a temporary project so the fence's own
logic is proved without depending on the live repository's wording.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises`, POSIX-normalised paths.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/compliance-claims-match-code.test.js` in full and run only that file. Cases 4, 7 and 8 MUST be red today (unmarked claims exist across the eight-file claim surface, and the menu says nothing about enforcement); case 7's assertion is red only if the documentation-versus-code mismatch is mis-stated, so record its result verbatim either way. Cases 1, 2, 3, 5, 6 and 9 must be green from the start — they prove the fence's own mechanics.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
### Step 9: PREPARE — enumerate the claim surfaces EXHAUSTIVELY and record the list in the execution record. Method, stated so it is repeatable: for every control name in `src/lib/regulatory-regime.js`'s `KNOWN_CONTROLS`, grep `agents/**/*.md`, `docs/*.md`, `README.md` and `CLAUDE.md`; for each hit, determine whether any evaluator exists by the `ENFORCED` rule above. Also re-read `src/hooks/human-gate-check.js` in full to confirm the four-eyes absence, and `src/commands/start.js:85-112`. The added files `docs/REALTIME.md`, `docs/REGULATORY_OPS.md`, `docs/CONTINUOUS_IMPROVEMENT.md` and `agents/coordinator/ivv-chief.md` are part of this surface; the enumeration tables in the Implementation Details above are the verified starting point (23 unenforced-control instances across those four, plus `independent_verification_validation` correctly excluded as the one enforced control) and Step 9 re-confirms them against the live files. Where this plan's line numbers or quotations disagree with the files, THE CODE AND THE FILES WIN — record every discrepancy.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
### Step 10: IMPLEMENT — one step, files as sub-items. For each file, add one `**NOT ENFORCED**: …` note inside the block that names the control — a heading together with the paragraph immediately beneath it, a list item, or a table row; one section-level note covers a heading plus the prose mentions in that section, and each summary-table row naming an unenforced control gains a `NOT ENFORCED` annotation in a cell. Settings/YAML examples are left byte-identical (they are not claim surface).
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
  - `agents/coordinator/cto-chief.md` — the v6.9.27 control claims (`:803-854`), marker-corrected; the compliance dispatch section at `:244-284` left byte-identical.
  - `docs/INDEPENDENCE.md` — the false hook sentence at `:83` replaced.
  - `docs/CRITICAL_CONTROL_POINTS.md`, `docs/PROCESS_FMEA.md` — the enumerated instances (`:69` left untouched — already corrected upstream).
  - `docs/REALTIME.md` — the 3 enumerated Cluster 6 controls (`wcet_budget`, `hil_test_ladder`, `precision_time_protocol`), marker-corrected.
  - `docs/REGULATORY_OPS.md` — the 6 enumerated Cluster 7 controls, marker-corrected (the `.ctoc/settings.yaml` example at `:185-188` left as-is).
  - `docs/CONTINUOUS_IMPROVEMENT.md` — the 13 enumerated Cluster 5/7 controls (including `critical_control_points` at `:23` and `cra_incident_clocks` at `:124`), marker-corrected (settings examples left as-is).
  - `agents/coordinator/ivv-chief.md` — the `four_eyes_gate3` claim in invariant 5 at `:59` marker-corrected; the `independent_verification_validation` mentions left unchanged (it is the one enforced control, and Case 6 fails if it is wrongly marked).
  - `src/commands/start.js` — the RECORDED-not-ENFORCED banner and option descriptions in `attachComplianceQuestion`.
  - `README.md`, `CLAUDE.md` — no control token present (verified), so no marker edit; `CLAUDE.md` still takes the Step 15 count/rule note.
### Step 11: REVIEW — read every edited sentence back and ask one question of each: could a person reading this believe a control is active when it is not? Confirm no module was deleted, no export removed and no gate logic changed. Confirm the compliance dispatch recipe still passes case 9, and that `independent_verification_validation` was NOT marked (case 6). Confirm the export and reachability fences are unmoved — if a retracted sentence removed the last mention of a `src/**.js` path, say so explicitly and check the baselines.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
### Step 12: OPTIMIZE — the new test scans a bounded file set once. Read each file once, share the control list, and keep every regex linear with disjoint classes. The block-splitter over Markdown is linear over lines.
### Step 13: SECURE — no code path, gate, hook or permission is changed. Confirm the menu edit touches only display text and cannot alter `regulatory_regime.active_profiles`, any enforcement key, or any gate key. Confirm no absolute path or user identity is written into the prompt text.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
### Step 14: VERIFY — run the new test plus `tests/menu*.test.js`, `tests/compliance-ride-along.test.js`, `tests/cto-chief-compliance-dispatch.test.js`, `tests/reachability.test.js`, `tests/export-reachability.test.js` and any agent-content test, then the full gated run `npm test`. Lint the changed JavaScript. Do not lower the coverage floor. No git operations.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
### Step 15: DOCUMENT — bump the documented test-file count in `CLAUDE.md` (read the live count from disk first). Add one short paragraph to `CLAUDE.md` recording the rule this slice establishes: a claim of active enforcement requires an evaluator, and the fence — scanning the WHOLE claim surface, not a declared subset — that keeps it true.
### Step 16: FINAL-REVIEW — report the exhaustive claim list from Step 9 with each item's disposition, the verbatim red and green evidence, and every decision taken under ambiguity.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).

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
7. **Twelve files are declared, and that is the WHOLE Case-4 claim surface — verified,
   not asserted.** The earlier version of this decision said "eight files are
   declared" and implied they covered every claim surface. They did NOT. The fence's
   Case 4 scans all of `agents/**/*.md`, `docs/*.md`, `README.md` and `CLAUDE.md`, and
   three further docs (`REALTIME.md`, `REGULATORY_OPS.md`, `CONTINUOUS_IMPROVEMENT.md`)
   plus the IV&V Chief agent (`ivv-chief.md`) name unenforced controls with no marker —
   so the original eight-file set left the fence permanently RED and left the executor
   unable to fix it, because the PreToolUse coverage hook blocks edits to any file
   outside `files:`. Per the human decision of 2026-07-30 the scope is EXPANDED, not
   the fence narrowed. Grepping the full surface today, exactly EIGHT files carry a
   control token — `cto-chief.md`, `ivv-chief.md`, `INDEPENDENCE.md`,
   `CRITICAL_CONTROL_POINTS.md`, `PROCESS_FMEA.md`, `REALTIME.md`, `REGULATORY_OPS.md`,
   `CONTINUOUS_IMPROVEMENT.md` — and all eight are now declared. `README.md` and
   `CLAUDE.md` carry no control token (they remain declared for the Step 15 count/rule
   note and to guard against a future claim, but oblige no marker edit); `start.js` and
   the test file complete the twelve. Each file is edited only where the enumeration
   above / Step 9 finds an instance; declaring a file does not oblige a change.
8. **Fenced code blocks and comments are not claim surface.** A `.ctoc/settings.yaml`
   example that lists controls (REGULATORY_OPS `:185-188`, CONTINUOUS_IMPROVEMENT
   `:363`) is configuration a user would copy, not a claim of active enforcement.
   Requiring a `NOT ENFORCED` marker inside example YAML would corrupt the example.
   The fence therefore strips fenced code and comments on the claim side exactly as it
   does on the `ENFORCED` side (Case 3) — which also protects the `isControlEnabled`
   call inside the `js` block at `ivv-chief.md:36` from being read as a bare claim.

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

## Execution Record (Steps 8-16, executed 2026-07-30)

**Result:** fence RED before, GREEN after. `npm test` exit 0 — `coverage 99.08%
(threshold 99%), skipped 0, failed 0`. Steps 8-16 complete.

**Step 8 RED evidence (fence-only run before any doc edit):** Cases 1, 2, 3, 5, 6, 6b,
7, 9 GREEN from the start (the fence's own mechanics); Case 4 RED with **120
unenforced-control instances** unmarked across the eight token-bearing files; Case 8 RED
(the menu banner said nothing about enforcement). Case 7 GREEN (verbatim: `human-gate-check.js`
contains no `four-eyes` / `four_eyes_gate3` / `verifyFourEyes` reference), pinning the
documentation mis-statement the slice removes.

**Enforced set, computed from code (not assumed):** exactly ONE control is enforced —
`independent_verification_validation`, via the real `isControlEnabled(` call at
`agents/coordinator/ivv-chief.md:36` (inside a fenced code block). `src/lib/four-eyes.js:24`
is a comment and does not count; the tests/ occurrences are test files. All other 39
controls have no evaluator anywhere in `src/**/*.js` or a shipped instruction surface.

**Marked vs. left unmarked:** 120 unenforced-control instances marked with the literal
`NOT ENFORCED` across 8 files (cto-chief 22, ivv-chief 1, CONTINUOUS_IMPROVEMENT 33,
CRITICAL_CONTROL_POINTS 20, INDEPENDENCE 6, PROCESS_FMEA 8, REALTIME 12, REGULATORY_OPS
18). The one ENFORCED control (`independent_verification_validation`, ~5 mentions across
ivv-chief, cto-chief:840 and PROCESS_FMEA:257/261) was CONFIRMED enforced against the
live code and deliberately left UNMARKED — the fence's rule-2 (stale-marker) check
reported 0 violations, proving no enforced control was mis-marked.

### Decisions Taken Under Ambiguity (execution)

9. **The plan's per-file enumeration tables were incomplete and stale-lined (rebase
   drift) — THE FILES WON.** A full scan of every `KNOWN_CONTROLS` token across the claim
   surface found 120 unenforced-control instances, not the ~24 the tables listed. All lie
   inside the eight declared token-bearing files; the plan explicitly delegated the rest to
   "Step 9 enumerates." Notable drift: the cto-chief v6.9.27 section is now at `:799-855`
   and names far more controls than the four examples (also `fmeda_design`,
   `fault_tree_analysis`, `graceful_degradation_matrix`, `proportionality_test`,
   `tool_qualification`, `ai_provenance_stamp`, `data_lineage`, `cra_incident_clocks`,
   `spec_code_reconciliation`, `dsar_handler`, `clm_obligations_tracker`,
   `irac_compliance_output`, `requirements_traceability_matrix`, `config_baseline`, …); the
   plan's `:848 legal_hold` / `:849 spoliation` lines carry no control TOKEN (they use prose
   "legal hold" / "spoliation-safe"), so the token-based fence does not require a marker
   there — they are covered by the section disclaimer for honesty. `CRITICAL_CONTROL_POINTS`
   and `PROCESS_FMEA` similarly carry many more token instances than the two lines the plan
   named.

10. **Two markers BEYOND the brief confirmed present, as the plan predicted:**
    `critical_control_points` (CONTINUOUS_IMPROVEMENT and CRITICAL_CONTROL_POINTS) and
    `cra_incident_clocks` (in REGULATORY_OPS, CONTINUOUS_IMPROVEMENT AND cto-chief AND
    CRITICAL_CONTROL_POINTS) — all named live, all unmarked, none with an evaluator. Marked.

11. **Fence block granularity (decoupled, mechanical).** Coverage (rule 1): a table ROW and
    a list ITEM are marked in place (each is its own block); a heading or prose paragraph is
    covered by a `NOT ENFORCED` marker anywhere in its heading-delimited SECTION. Stale-marker
    guard (rule 2): a marker may NEVER sit in the fine block (row / item / paragraph) that
    names an ENFORCED control. Pure section-level coverage was impossible because
    `cto-chief.md:840` (`independent_verification_validation`, enforced) and `:841`
    (`four_eyes_gate3`, unenforced) are adjacent list items in one section — per-item
    granularity is required there and is what the plan's "a list item / a table row" units
    describe.

12. **ENFORCED is computed from `src/**/*.js` (comment-stripped) plus FENCED code blocks of
    shipped instruction surfaces only.** A prose citation of `isControlEnabled(...)` outside a
    fence is NOT a call — the same "a citation is not an invocation" discipline the
    reachability fence (00088) uses. This was load-bearing: without it, the honest marker
    prose ("nothing evaluates the control") could itself have been mis-read as a call and
    falsely credited the control as enforced. `reachability.js`'s `stripComments` is
    deliberately not exported and `reachability.js` is not a declared file, so the same
    comment-stripping discipline was reproduced in a local helper inside the test rather than
    minting a new export or editing an undeclared file.

13. **Section-heading rename (cto-chief `:799`):** "Cross-Industry Critique Integrations" →
    "Cross-Industry Critique Controls (opt-in profiles; libraries present, NOT ENFORCED until
    wired)", and the cross-cutting subheading gained "the profile-gated ones are NOT ENFORCED".

14. **CLAUDE.md carries no control token and needs no marker** (confirmed). Its Step-15 rule
    note spells out "Independent Verification and Validation" instead of the control TOKEN, so
    the note (which contains the literal `NOT ENFORCED`) does not trip the fence's own rule-2
    on an enforced-control block. Documented test-file count bumped 500 → 501.

15. **`src/commands/start.js`** gained the RECORDED-not-ENFORCED banner sentence and the
    "advisory review only — controls NOT ENFORCED" suffix on the three non-None option
    descriptions; the four option labels and four `claude:set-compliance-regime` actions are
    byte-identical, so `tests/compliance-ride-along.test.js` still passes.

16. **The compliance DISPATCH seam was left byte-identical** (Case 9 green): the CTO Chief
    still carries `runComplianceForTransition(`, `evaluateComplianceTrigger(` and
    `dispatcher: "cto-chief"` — the one wired compliance path, correctly NOT retracted.
