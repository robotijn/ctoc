# Handoff — CTOC backlog sweep ("do them all")

<!-- Maintained by the `handoff` skill. Left by the previous Claude instance so
     the next one (claude or claudex) can continue. Treat as last-known state —
     verify against the repo before acting. -->

- Updated: 2026-07-08 by claude
- Branch: main
- Status: in progress

## Goal
Drive the ENTIRE remaining CTOC functional backlog through the gated Iron Loop to
`done`, one program at a time, per the user's standing "do them all" directive. Full
adversarial review (code + security where it applies) on every plan; fix all kickbacks;
human gates are batched per parent plan but NEVER auto-crossed. Report at program
boundaries; no mid-task "want to continue?" questions.

## Current status
- **Done this sweep (~25 plans, all shipped + pushed, v6.9.60 → v6.10.3):** the whole
  vector chain (PI1–PI6: store, embeddings, sync, wiring, hybrid search + related-plans
  panel, duplicate-on-create guard, conflict/dependency detection — all LIVE and
  human-usable); SIP1 (implementation-planner now DECOMPOSES functional→N small slices);
  opuspack (OM1 generic operating-manual merge on init/update, OM2 3 bash guards→Node
  hooks); VP1 (validator basename fix); NB1–4; SP4/SD1/SP5 (stale-detection); CF1
  (always-read-fresh); LH1 (warnings→0); EC1 (compliance-mode foundation).
- **In progress RIGHT NOW:** two background decomposer agents are splitting **EC2**
  (GDPR agent) and **EC3** (EU-AI-Act agent) into SIP1 slices. When this handoff was
  written they were mid-write (e.g. `plans/implementation/EC2-s1-gdpr-helpers.md`
  untracked). Verify they finished — `listSubplans('EC2-gdpr-agent-plan-and-code')` and
  `listSubplans('EC3-eu-ai-act-agent-plan-and-code')` should each return ≥1 slice, and
  the parents should be `is_slice_index: true`. If a decomposer died mid-run (transient
  API errors happen), re-dispatch it to complete (parent→index, `iron_loop: true` on
  slices, PI4 lesson honored).
- **Next:** EC2/EC3 batched Gate 2 → build slices → review → batched Gate 3; then
  **EC4** (recommender) → **EC5** (iron-loop integration) → **EC6** (tests); then the
  **CU** program (CU1 tier-0 quick wins → CU2/CU3 languages+frameworks → CU4a/b/c
  long-tail → CU5 wrapper-coverage) — 7 functional plans still at Gate 1.

## Key decisions
- **SIP1 cadence (how every remaining plan is built):** after Gate 1, dispatch the
  `ctoc:planning:implementation-planner` as a DECOMPOSER → it writes N cohesive-slice
  plan files (each ≈ one module + its test, ~1–3 files, `parent_plan:` set,
  `depends_on` ordered, `iron_loop: true` in the FIRST frontmatter block, canonical
  Step 8–16). Parent becomes an INDEX (`is_slice_index: true`, no `files:`, no
  `iron_loop`, `## Slices` table). Then batched **Gate 2** =
  `actions.approveSubplans(parentSlug, 'implementation', root)`; implement each slice
  one at a time via `ctoc:iron-loop:iron-loop-executor` (dependency order); reconcile
  each built slice to `review/` (startExecution → completeExecution); batched **Gate 3**
  = `approveSubplans(parentSlug, 'review', root)`; then move the parent index to `done/`.
- **Gates are batched per parent but a human still approves each batch** via
  AskUserQuestion — never auto-cross. `approveSubplans` just loops the existing
  `approvePlan` (gate-safety preserved; mutation-proven).
- **Vector storage:** in-memory JSON + brute-force cosine (NOT sqlite-vec) — the corpus
  is ~1700 units, far below the ANN crossover.
- **Version:** patch per commit; already bumped to v6.10.x (user said "minor" once).
  Only bump minor/major on explicit user request.

## Open questions / blockers
None. Standing authorization is "do them all." The user has been approving each batched
gate promptly via AskUserQuestion.

## Gotchas
- **THE big recurring lesson (cost 3 kickbacks — PI4-s4, PI5-s2):** "working = a human
  can use it." UI must wire into the LIVE mounted areas (`src/areas/pipeline.js`,
  `src/areas/inbox.js`, `src/commands/menu.js` main path) — NOT the legacy UNMOUNTED
  `src/tabs/overview.js`. And tests must DRIVE the real render/hook (spawn the process /
  call the real `render(app)`), never just call the helper directly — direct-call unit
  tests are green over a dead product. Bake this into every UI/hook slice brief.
- **`listSubplans` was fixed** (commit ~e4ddb13) to read `parent_plan`/`depends_on` from
  the MERGED frontmatter region — a Gate-2 approval marker prepends its own `---` block,
  which `parseMetadata` (first-block-only) can't see. If a future `approveSubplans`
  returns "approved 0", this regressed.
- **Validator basename false-positive (VP1):** prose like "create `foo.js`" makes
  `completeExecution` fail with "claimed as created but doesn't exist" when `foo.js`
  isn't at project root. VP1 fixed it for files declared in the plan's `files:`, but a
  plan whose prose describes OTHER files' basenames (test-fixture examples) still trips
  it → rephrase (move the verb after the name, e.g. "`foo.js` (a create-claim)").
- **A PreToolUse hook must not read stdin before its enforcement delegate re-reads it** —
  a pipe is single-consumer (the PI5-s2 bug blocked every plan write). `PreToolUse.Edit.js`
  now exposes `enforce(parsedPayload)`; `PreToolUse.Write.js` reads once and hands it over.
- **Slice executors run 200–600s; some crash on transient API errors.** Brief them to
  WRITE FILES INCREMENTALLY. If one dies, check disk state (files may be partially
  written) before re-dispatching.
- **Compliance/settings must never weaken a human gate** — assert `enforcementMode`/
  `requireReviewGate` untouched and `HUMAN_GATES` (3 entries in human-gate-check.js)
  unchanged in every EC slice (environment-profile precedent).
- The `plan-index/` modules live in a subdir NOT counted by `readme-numbers`; a NEW
  top-level `src/lib/*.js` module DOES need the README + `readme-numbers.test.js` count
  bumped (currently 115).
- All tests: `node --test tests/*.test.js` must show `# fail 0`; `npx eslint .
  --max-warnings 0` exit 0; tsc baseline is 89 pre-existing errors (baseline-neutral).

## Key files
- `agents/planning/implementation-planner.md` — the SIP1 decomposer prompt (the mechanism).
- `src/lib/actions.js` — `approveSubplans` / `listSubplans` (batched gates), `approvePlan`,
  `movePlan`, gate-safety.
- `src/lib/compliance-regime.js` — EC1's `shouldRunGdpr`/`shouldRunEuAiAct`/`writeActiveProfiles`
  (EC2/EC3 gate on these).
- `src/lib/plan-index/*` — the shipped vector system; `src/areas/pipeline.js` — the LIVE
  dashboard (search + related + conflict panels).
- `plans/implementation/EC2-*.md`, `EC3-*.md` — the in-flight decompositions;
  `plans/functional/CU*.md` + `EC4/EC5/EC6` (in implementation/) — remaining backlog.
- Memory: `~/.claude/projects/-Users-doctony-Code-ctoc/memory/` — esp.
  `feedback_small_focused_implementation_plans.md`, `project_vector_system_status.md`,
  `feedback_always_read_files_fresh.md`.

## Resume here
Verify EC2 + EC3 decomposers finished:
`node -e "const a=require('./src/lib/actions'); console.log(a.listSubplans('EC2-gdpr-agent-plan-and-code',process.cwd()).length, a.listSubplans('EC3-eu-ai-act-agent-plan-and-code',process.cwd()).length)"`
(both ≥1; parents `is_slice_index`). Commit each decomposition, then present the batched
**Gate 2** for EC2 (and EC3) via AskUserQuestion; on approval
`approveSubplans(parent,'implementation')`, build slices in `depends_on` order (one
executor at a time, incremental writes), review, batched **Gate 3**, ship + push. Then
continue EC4 → EC5 → EC6 → the CU program. Run every plan through full adversarial review;
apply the PI4 "measure is the human" lesson to any UI/hook slice.
