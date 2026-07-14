---
iron_loop: true
approved_by: human
approved_at: 2026-07-15T02:00:00.000Z
gate_crossed: implementation → todo
approval_note: "Standing 2026-07-14 orders. Injection critic (verified): the live dashboard src/areas/*.js + pipeline conflict/related panels + review.renderRejectInput render AGENT-WRITABLE fields (plan title, files: frontmatter, task description) to the terminal WITHOUT the stripCtl the codebase already ships in menu-screens.js/task-view.js. A files: value carrying \\x1b[2J\\x1b[H + a fake 'Gate 3 approved — press 1' spoofs a human gate decision. HIGH."
---

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
- [x] Step 14 VERIFY — `tui`+`areas`+`area-modules`+2 security suites 77/77; typecheck baseline held; eslint exit 0. (No git; no full suite per orders.)
- [x] Step 16 REPORT — see final message.

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
   the plan lists for `renderRejectInput`, reaching the terminal via
   `renderActionMenu` and via `menu.js:353` which renders `app.message` raw. All
   wrapped at the source. Left untouched: fixed enums / integers / constants
   (`severity`, `agent.step`, `agent.phase`, `p.gate`) per "do not over-strip".
4. **Out-of-scope defense-in-depth finding (NOT fixed — not a plan file).**
   `src/commands/menu.js:353` renders `app.message` RAW (`${c.green}${app.message}`).
   This plan closes every *source* that feeds a control byte into `app.message`
   (the review rejects), so the live path is safe today, but a defense-in-depth
   `stripCtl` at that render site would harden any future writer. Recommend a
   follow-up plan adding `menu.js` to its `files:`.
