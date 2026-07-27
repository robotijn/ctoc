---
title: "R7-A — The live dashboard sanitizes untrusted fields: stripCtl the area/tab render layer"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/tui.js"
  - "src/areas/pipeline.js"
  - "src/areas/agent.js"
  - "src/areas/inbox.js"
  - "src/tabs/overview.js"
  - "src/tabs/review.js"
  - "src/commands/start.js"
  - "tests/dashboard-injection.test.js"
  - "tests/tui*.test.js"
---

# R7-A — stripCtl the mounted dashboard

`menu-screens.js:47` and `task-view.js:35` define `stripCtl` and apply it. But
the LIVE dashboard is `menu.js` mounting `src/areas/*.js`, which render
untrusted agent-writable fields RAW. Attacker model is CTOC's own: an agent
writes plan `files:`/`title:`, inbox question/decision frontmatter, and task
registry entries (all Edit-whitelisted under plans/** and .ctoc/**). A field
with `\x1b`/`\r`/C0-C1 bytes injects clear-screen + a fake gate prompt on the
human's decision surface. The `files:` parser (`plan-coverage.js:132`,
`/[^"'\n]/`) permits ESC and every control char except newline, so pure
free-text reaches the terminal.

## Implementation Details
1. **Promote `stripCtl` to `src/lib/tui.js`** (next to the `c` color helper) as
   a shared export: `stripCtl = (s) => String(s).replace(/[\x00-\x1f\x7f-\x9f]/g, '')`.
   (menu-screens.js/task-view.js keep their local copies OR re-import — do NOT
   touch those files here; just add the shared export for the area layer.)
2. **Wrap every interpolated untrusted field** in the render layer through
   `stripCtl`, mirroring the inbox-door screens that already do it right:
   - `src/areas/pipeline.js`: the conflict panel `plan` + `files.join(', ')`
     (~:51-52) and `agent.plan` (~:146). severity is a fixed enum — leave it.
   - `src/areas/agent.js`: `agent.plan`, `agent.task`, `agent.stalePlan`
     (~:20,22,29).
   - `src/areas/inbox.js`: `q.source_plan/source_step/id` (~:35),
     `d.plan/step/id` (~:42), `p.plan/stage` (~:49).
   - `src/tabs/overview.js`: related-plan `id` (~:109), `agent.name`/`agent.task`
     (~:169,172).
   - `src/tabs/review.js`: `app.selectedPlan.name` in `renderRejectInput` (~:57).
   Only attacker-influenceable fields (slug/title/task/files/step/id/stage/name).
   Fixed enums, integers, and constants do NOT need wrapping (do not over-strip).

### Wiring — the live call sites (MANDATORY)
All are already-live render paths mounted by `menu.js`. `tui.stripCtl` gains
real callers (the area/tab renderers) — a live export, not a dead one.

### Test Plan (TDD-Red first) — new tests/dashboard-injection.test.js
For EACH area/tab renderer: feed a field containing `\x1b[2J\x1b[H`, `\r`, and a
C1 byte; assert the rendered output contains NONE of those bytes (no `\x1b`, no
`\r`, no `\x00-\x1f\x7f-\x9f`). The conflict-panel `files:` case is the headline:
a plan whose files: frontmatter holds the ESC payload → the dashboard render is
clean. Assert a benign field still renders its visible text unchanged.

## Execution Plan (Steps 8-16)
- [x] Step 8 TEST — `tests/dashboard-injection.test.js`; TDD-Red confirmed: 8 injection assertions failed, 2 benign passed (the payload reaches the terminal today).
- [x] Step 9 PREPARE — read all 5 renderers + the stripCtl model in menu-screens.js:47 / :546-569.
- [x] Step 10 IMPLEMENT — `stripCtl` promoted to `src/lib/tui.js` + exported; every listed untrusted field wrapped.
- [x] Step 11 REVIEW — grep of every untrusted-field interpolation across the 5 files; all wrapped or justified (see Decisions).
- [x] Step 13 SECURE — re-attack: `node --test tests/dashboard-injection.test.js` → 10/10 pass; no untrusted field renders a raw control byte.
- [x] Step 14 VERIFY — REAL gate re-run on rework (2026-07-27): `npx tsc --noEmit` clean (0 errors); `npm test` (full suite + coverage floor + zero-skipped) = **tests 10523, pass 10523, fail 0, skipped 0, coverage 99.12% (threshold 99%)** → `[CTOC test-gate] PASS`. The original "77/77 narrowed, no full suite" note was insufficient evidence for a security plan; the whole gate is now recorded. `tests/dashboard-injection.test.js` = 13/13.
- [x] Step 16 REPORT — see rework report at end of file.

## Decisions Taken Under Ambiguity
1. **Test-assertion shape.** The palette legitimately emits SGR colour escapes
   (`\x1b[…m`), so "output contains no `\x1b`" is literally impossible. The test
   strips the known-good SGR sequences first, then asserts the remainder holds no
   ESC, no CR, no other C0/C1/DEL byte (newline allowed). The attack `\x1b[2J` /
   `\x1b[H` terminate in `J`/`H`, not `m`, so they survive the SGR strip and are
   caught — a precise signal for the real vector without false-failing on colour.
2. **`getWiring` forced > 0 in the related-panel test.** `renderRelatedPanel`
   shows an "index building" indicator (never the list) when the semantic index
   has 0 units, which would have made the related-id injection test a false green.
   `plan-index.getWiring` is a getter-only accessor (configurable), so the test
   redefines it via `Object.defineProperty` to return `{store:{size:5}}`, forcing
   the list path so the payload actually renders.
3. **Extended the sweep to two sibling sites in the plan's own files** (both
   in-scope, no new files touched): (a) `inbox.js` `renderInboxRelated` id
   (~:80) — same agent-writable slug/path trust class as overview's related id,
   which the plan lists; (b) `review.js` `renderActions` heading (~:46) and the
   two rejected-`app.message` builds (~:118,:148) — the same `selectedPlan.name`
   the plan lists for `renderRejectInput`. All wrapped at the source. Left
   untouched: genuinely fixed values (`severity` — a computed enum from
   `conflict-detect.js`; `p.gate`; `agent.elapsed` — a `timeAgo`-formatted
   derived string; `agent.pid` — an integer, and in fact never set by
   `getAgentStatus`) per "do not over-strip".

   **CORRECTION (rework 2026-07-27): `agent.step` and `agent.phase` were WRONGLY
   listed as "fixed enums" here.** They are NOT. `state.getAgentStatus` reads both
   from `.ctoc/state/agent.json` (`detail.step` / `detail.phase`) — a file under
   `.ctoc/**`, which this plan's OWN threat model names Edit-whitelisted and
   agent-writable. `phase` is free text; `step` is never coerced to an integer. A
   hostile `agent.json` renders `\x1b[2J\x1b[H` through `phase`/`step` on the same
   surfaces as `plan`/`task`. The original tests fed benign `step: 7` /
   `phase: 'IMPLEMENT'`, so the raw renders passed VACUOUSLY (false green). Fixed:
   `stripCtl(agent.step)` + `stripCtl(agent.phase)` at all three render sinks —
   `agent.js:21`, `overview.js:172`, `pipeline.js:149` — and the tests now feed the
   ESC/CR/C1 payload through both fields (seen red first).
4. **`app.message` sink CLOSED (rework 2026-07-27), not deferred — and the stale
   path corrected.** The original Decision 4 claimed the only sources feeding
   `app.message` were the review rejects, so "the live path is safe today", and
   deferred hardening. That was WRONG on two counts. (a) The render site is
   `src/commands/start.js:374` (`${c.green}${app.message}${c.reset}`), NOT
   `src/commands/menu.js:353` — no `menu.js` exists; that was a stale record-vs-disk
   reference. (b) `src/areas/agent.js` (a file this plan already owns) writes
   `app.message` from agent-writable inputs the plan MISSED: `status.plan` (the
   task-registry slug, `.ctoc/**`, agent-writable) at `:63` and `res.plan.name`
   (agent-writable plan title/slug) at `:70`. A probe confirmed a raw ESC + CR
   reached the terminal through `app.message` today. Fixed at BOTH the source
   (`stripCtl` on those two `agent.js` interpolations) AND the sink (`stripCtl(app.message)`
   at `start.js:374` — the single chokepoint every writer flows through: `agent.js`,
   `tools.js` sync, release). `src/commands/start.js` added to `files:`. Tests
   (seen red first): an `agent.js` `handleKey` source test for each of the two
   fields, and a `start.render()` sink test asserting the carriage-return-led spoof
   never survives to the terminal while the benign visible text does. No follow-up
   plan is needed; the class is closed.

## Step 16 — Rework Report (2026-07-27)

Adversarial security re-audit of the mounted dashboard's control-character sweep.
Held to the bar: EVERY attacker-influenceable rendered field must pass `stripCtl`;
an un-swept field is the bug this plan exists to kill.

**Bypasses found and fixed (all agent-writable under the plan's own threat model,
`.ctoc/**` / `plans/**`; each fixed test-first, payload seen red before the fix):**
- `agent.phase` — free text from `.ctoc/state/agent.json`, rendered RAW at
  `overview.js:172` and `agent.js:21`. The plan had mislabeled it a "fixed enum".
- `agent.step` — from the same agent-writable file, never coerced to an integer,
  rendered RAW at `overview.js:172`, `agent.js:21`, `pipeline.js:149`.
- `app.message` — rendered RAW at `start.js:374` and fed the agent-writable
  `status.plan` (`agent.js:63`) and `res.plan.name` (`agent.js:70`). Closed at both
  the two missed sources and the render sink. `start.js` added to `files:`.

**Verified safe to leave raw (not over-stripped):** `severity` (computed enum in
`conflict-detect.js`), `agent.elapsed` (`timeAgo`-formatted derived string),
`agent.pid` (integer; never set), `p.gate`. Every other untrusted interpolation
across `pipeline.js` / `agent.js` / `inbox.js` / `overview.js` / `review.js` /
`tui.js renderList` was already wrapped and re-confirmed by grep.

**Record-vs-disk drift corrected:** the plan pointed the defense-in-depth finding at
`src/commands/menu.js:353` — a file that does not exist; the real sink is
`src/commands/start.js:374`. Decision 3's "fixed enums" claim for `step`/`phase` was
refuted against `state.getAgentStatus` source and corrected. The original Step-14
note ("77/77 narrowed suite, no full suite") was insufficient evidence for a security
plan; the REAL gate is now recorded.

**Real-gate evidence (this rework):** `npx tsc --noEmit` clean (0 errors). `npm test`
(full suite + coverage floor + zero-skipped) → **tests 10523 · pass 10523 · fail 0 ·
skipped 0 · coverage 99.12% (threshold 99%)** → `[CTOC test-gate] PASS`. Any prior
"full-suite red / tsc errors" claim is REFUTED as stale — the tree is green. The
injection suite is 13/13, and each new assertion was confirmed non-vacuous (reverting
the sink fix reproduces exactly one failure). No security assertion was weakened to go
green.

**Files changed in rework:** `src/areas/agent.js`, `src/areas/pipeline.js`,
`src/tabs/overview.js`, `src/commands/start.js`, `tests/dashboard-injection.test.js`,
and this plan.
