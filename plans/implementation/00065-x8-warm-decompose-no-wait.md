---
title: "X8 — Decompose without a cold-start wait: the model dispatches vision-decomposer; delete the last claude -p"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: streaming-human-loop
iron_loop: true
files:
  - "src/lib/streaming-render.js"
  - "src/lib/streaming-topics.js"
  - "src/lib/streaming-decompose.js"
  - "src/commands/menu.md"
  - "agents/planning/vision-decomposer.md"
  - "CLAUDE.md"
  - "README.md"
  - "tests/readme-numbers.test.js"
  - "tests/streaming-decompose.test.js"
  - "tests/streaming-render.test.js"
  - "tests/streaming-topics.test.js"
---

# X8 — the wait IS the cold-start second Claude; make it warm

## The ruling

Owner, 2026-07-18: "just make it work, a single claude -p won't hurt probably,
make it so that the user experience is the best which means the user is not
waiting."

The last `claude -p` lives in `streaming-decompose.js`: `decomposeIdea` uses
`spawnSync('claude', ['-p', …])` — a BLOCKING, cold-start of a whole second
Claude — called from `streaming-render.submitIdea` when the user submits a
free-text idea. **That spawn is the wait.** A fresh `claude` process must boot,
authenticate, and run a full turn before topics appear, and `spawnSync` freezes
the submit path until it does. Keeping it "won't hurt" correctness, but it is
literally the thing that makes the user wait — so the not-waiting fix is to make
it WARM: the session model dispatches `vision-decomposer` (the agent whose job is
decomposing ideas), with immediate feedback, no cold start, no second Claude.

## The flow today (blocking)

`streaming-render.submitIdea` (line ~254): `decompose(idea, root)` →
`defaultDecompose` → `decomposeIdea` → `spawnSync(claude -p)` → on `ok`,
`streamingTopics.loadTopics` and drive them. The user submits and the path FREEZES
for a cold-start turn.

## The flow after (warm, non-blocking)

1. User submits a free-text idea (idea mode, Enter).
2. `submitIdea` does NOT spawn anything. It sets an "awaiting decomposition"
   state and returns a screen: `Breaking "<idea>" into topics…`.
3. The session model — per `menu.md`'s instruction — dispatches `vision-decomposer`
   (background subagent) to decompose the idea and write topics to the store.
4. On the next render, `loadTopics` finds the topics and drives them; the model
   presents the first topic's question. The user saw an instant acknowledgment,
   never a frozen terminal, and no cold-start second Claude.

This is the X7 pattern (model-dispatched subagent, instruction-surface
reachability, never-wait) applied to decompose.

## The changes

1. **`streaming-render.submitIdea`**: remove `defaultDecompose` / the
   `streaming-decompose` require and the synchronous `decompose()` call. On submit
   with a non-empty idea, set the awaiting-decomposition state and render the
   `Breaking "<idea>" into topics…` screen. `renderIdea`/the router gains: if an
   idea was submitted and topics now exist → drive them; if submitted and none yet
   → the decomposing screen. Preserve the empty-idea prompt and the demo fallback.
2. **The topics WRITER moves into `streaming-topics.js`.** `streaming-decompose`'s
   `writeTopicsAtomic` is the only writer; `streaming-topics` today exports only
   readers (`loadTopics`, `validateTopics`). Add `writeTopics(root, topics)` to
   `streaming-topics.js` (atomic, validated), so the canonical topics module owns
   both read and write. `vision-decomposer` writes through it.
3. **`agents/planning/vision-decomposer.md`**: add a "Writing topics to the
   streaming store" section naming `src/lib/streaming-topics.js`
   `writeTopics(root, topics)` with the topic schema. This is the real write path
   AND the instruction-surface anchor keeping `writeTopics` a live export.
4. **`src/commands/menu.md`**: add the instruction — "when the user submits a
   free-text idea in the Build flow, dispatch `vision-decomposer` to decompose it
   into topics (written via `streaming-topics.writeTopics`), then re-render the
   build flow." This is what makes the model dispatch on submit.
5. **DELETE `src/lib/streaming-decompose.js`** and `tests/streaming-decompose.test.js`
   — the `claude -p` spawner is gone.
6. Reconcile reachability + counts.

## Decisions Taken Under Ambiguity

1. **Warm subagent, not a non-blocking `claude -p`.** The owner said `claude -p`
   "won't hurt" — permission, not a requirement. But it is a COLD-START second
   Claude; even backgrounded it is slower than a warm subagent in the existing
   session, and "best UX = not waiting" is the stated priority. The warm path
   removes the cold start; that it also removes the last `claude -p` is a side
   effect of choosing speed, not principle.
2. **`vision-decomposer`, not inline model decomposition.** Inline (the main model
   decomposing in its own response) is marginally faster but bypasses the agent
   built for this (User Story Mapping etc.) and pollutes the main context.
   `vision-decomposer` is warm, isolated, and idiomatic; immediate acknowledgment
   means the user does not perceive a wait. If the owner prefers inline for raw
   speed, it is a one-line change to the menu instruction.
3. **The writer moves to `streaming-topics.js`, not a new module.** The topics
   store should own its read AND write. `streaming-topics` is already reachable via
   `streaming-render` + `streaming-precompute`, so the file stays live; `writeTopics`
   stays a live export via the `vision-decomposer.md` instruction surface (the X7
   anchor pattern).
4. **The demo fallback and empty-idea prompt stay.** `submitIdea` today handles
   `empty-idea` and a no-topics demo fallback; preserve both. The `no-cli` branch
   (CLI absent) is DELETED with the spawn — there is no CLI to be absent anymore.

## Test Plan (TDD-Red first)

Write FIRST, observe RED:

1. **`submitIdea does NOT spawn a process and shows the decomposing screen`** — submit
   a non-empty idea; assert no `child_process`/spawn is invoked (inject a spawn spy
   that must NOT be called) and the returned state/screen says "Breaking … into
   topics". Red (still calls decompose).
2. **`once topics exist, the build flow drives them`** — write topics via the new
   `streaming-topics.writeTopics`, re-render after an idea submit, assert the flow
   initialises on the real topics. Green after.
3. **`streaming-topics.writeTopics writes validated topics that loadTopics reads`** —
   round-trip through the real reader/validator. Red (no writer yet).
4. **`writeTopics rejects invalid topics and writes nothing`** — the no-garbage guard.
5. **`vision-decomposer.md names streaming-topics + writeTopics`** — the instruction-
   surface anchor. Red.
6. **`menu.md instructs dispatch of vision-decomposer on idea submit`** — assert the
   command markdown contains the dispatch instruction naming vision-decomposer. Red.
7. **`streaming-decompose.js is gone and no claude -p / model spawn remains anywhere`** —
   walk `src/` with node; assert zero `spawnSync(claude…)` / `claude -p` code (comments
   allowed). Red (present).
8. **`reachability is at zero and writeTopics is live`** — real analyzer: 0 unreachable,
   `writeTopics` live via the agent markdown, `streaming-topics` still reachable.
9. **`counts reconcile`** — one fewer src/lib module, test-file changes.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write cases 1–9. Run. Cases 1,3,5,6,7 fail; 8/9 fail until reconciled. Quote the red. Touch no source first.

### Step 9: PREPARE — read `streaming-render.js` idea-mode + `submitIdea`/`renderIdea`/the key router IN FULL (the state machine is delicate — ideaMode, ideaBuffer, buildFlow). Read `streaming-decompose.js`'s `writeTopicsAtomic` (you are moving it). Read `streaming-topics.js`. Read `src/lib/reachability.js` to confirm the instruction-surface export rule (X7 relied on it; re-confirm). Use node, not the shell grep (it silently skips gitignored files).

### Step 10: IMPLEMENT — the six changes. Move `writeTopicsAtomic`→`streaming-topics.writeTopics` faithfully (keep atomic + validated). Rework `submitIdea` to the awaiting-decomposition state with immediate feedback; delete the `no-cli` branch. Delete `streaming-decompose.js`. Add the menu.md + vision-decomposer.md instructions.

### Step 11: REVIEW — re-read the submit/render state machine: empty-idea prompt preserved, demo fallback preserved, no dangling `streaming-decompose` reference, no spawn on the submit path. Run the REAL analyzer: 0 unreachable, `writeTopics` live. If it is NOT live via the agent markdown, STOP and report — do not add a token caller or lower a baseline.

### Step 12: OPTIMIZE — n/a.

### Step 13: SECURE — confirm zero model-spawning subprocess remains in the whole streaming path (node search). The plugin must never spawn a second Claude. The awaiting-decomposition screen is plain text; it executes nothing.

### Step 14: VERIFY — `npm test` with `FORCE_COLOR=0`, say you did. Target **fail 0**, coverage ≥ 99 (deleting the spawn module should not lower it; the moved writer is covered by case 3/4). Name any residual failure with its cause.

### Step 15: DOCUMENT — update `CLAUDE.md`/`README.md` counts and remove any streaming-decompose / `claude -p` mention; one sentence that idea-decompose is now a dispatched `vision-decomposer` (no cold-start CLI).

### Step 16: FINAL-REVIEW — report literally: the Step 8 red; all nine results; the analyzer output (0 unreachable, writeTopics live); confirm (searched with node) NO `claude -p`/model spawn remains ANYWHERE in `src/`; `npm test` totals; whether it reached fail 0. State plainly that the submit path no longer blocks on a cold-start process.

## Executor Verification (Steps 8-16)

- [x] Step 8 RED before source (writeTopics undefined; submit blocked 47s on the cold-start claude -p; markdown anchors, deletion, counts all red — quoted in the executor report)
- [x] `submitIdea` spawns nothing; shows immediate "decomposing" feedback (awaiting-decomposition state + `Breaking "<idea>" into topics…` screen; spawn-spy records 0 calls)
- [x] `writeTopicsAtomic` moved to `streaming-topics.writeTopics`, atomic + validated (validate-first → temp-file + rename; rejects invalid, writes nothing)
- [x] empty-idea prompt + demo fallback preserved; `no-cli` branch removed
- [x] `streaming-decompose.js` deleted; NO `claude -p`/model spawn anywhere in src/ (node-searched — 0 real offenders; the 17 grep hits were `.claude-plugin` false-positives)
- [x] menu.md dispatches vision-decomposer on idea submit; vision-decomposer.md names writeTopics (with CALL syntax `writeTopics(`)
- [x] REAL analyzer: 0 unreachable, `writeTopics` live via instruction surface (surface CALL in vision-decomposer.md), streaming-topics reachable, export dead count unchanged at 102
- [x] counts reconciled (src/lib 101→100, tests 416→415 in CLAUDE.md, 101→100 in README); `npm test` = fail 0 (9772/9772, coverage 99.04% ≥ 99, 0 skipped)
