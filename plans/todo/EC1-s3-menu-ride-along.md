---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T14:26:07.912Z
gate_crossed: implementation → todo
---

---
title: "EC1-s3 — compliance-regime ride-along question on the live menu"
type: implementation
parent_plan: EC1-compliance-mode-setting
depends_on: EC1-s1-gdpr-profile, EC1-s2-compliance-regime-resolver
iron_loop: true
priority: HIGH
files:
  - src/commands/menu.js
  - src/commands/menu.md
  - tests/compliance-ride-along.test.js
status: refined
risk_level: MEDIUM
---

# EC1-s3 — compliance-regime ride-along question on the live menu

Slice 3 of the EC1 decomposition. Surfaces the compliance-regime selection to the human on the
**LIVE mounted menu path** (`src/commands/menu.js:main()` non-interactive JSON branch) — the
SAME mechanism the environment question uses (`attachEnvironmentQuestion`), never a legacy or
unmounted module (PI4 lesson). The question rides ALONG with the dashboard; it never replaces
or gates the plan overview. Selecting a profile persists it to `regulatory_regime.active_profiles`
in `.ctoc/settings.yaml` via `writeActiveProfiles` from EC1-s2. The test drives the real
`menu.js` JSON flow end-to-end (`execFileSync(menu.js)` → parse JSON → assert), exactly like
`tests/menu-environment.test.js`.

Depends on **EC1-s2** (`writeActiveProfiles`, `shouldRunGdpr`, `shouldRunEuAiAct`) and
**EC1-s1** (writes the valid `gdpr` profile name).

## Implementation Details

### Architecture Decision (ADR)

**Context:** The compliance selection must reach a real human on the real menu and must not
gate the dashboard. The environment ride-along (menu.js:20-44, gated by
`needsEnvironmentPrompt`, attached in `main()` at menu.js:512-514) is the proven, tested
pattern.

**Decision:** Mirror it exactly. Add `attachComplianceQuestion(result, projectPath)` in
menu.js and a `needsComplianceRegimePrompt(projectRoot)` predicate (both profiles inactive ⇒
prompt once). In `main()`'s non-interactive branch, after the existing environment attach,
conditionally attach the compliance question — so the dashboard renders FIRST and BOTH
ride-along questions (environment + compliance) sit in `result.ask.questions` alongside the
always-first Pipeline question. Actions map to a new `claude:set-compliance-regime {profile}`
handler (spec added to menu.md) that calls `writeActiveProfiles`.

**Consequences:** One human decision surface, non-blocking, on the live path. AskUserQuestion's
≤4-questions limit: Pipeline is always present; environment and compliance each ride along only
when unset — worst case Pipeline + Environment + Compliance + Stale = 4, exactly at the limit
(a test pins ≤4). If that ceiling is a concern in practice, the compliance question is attached
only when the environment question is NOT also pending would violate "ask once each" — instead
we keep both and rely on the ≤4 invariant since Stale is conditional; a test asserts the count
never exceeds 4 across the pending-combinations.

### Dependency Graph

```
src/lib/compliance-regime.js  (from EC1-s2)
    ├── shouldRunGdpr / shouldRunEuAiAct ──used-by──> menu.js:needsComplianceRegimePrompt (NEW)
    └── writeActiveProfiles ──invoked-via claude action──> menu.md set-compliance-regime (NEW)
src/commands/menu.js  (MODIFY)
    ├── needsComplianceRegimePrompt(root)   (NEW helper)
    ├── attachComplianceQuestion(result, root)  (NEW helper, mirrors attachEnvironmentQuestion)
    └── main() non-interactive branch  (MODIFY: conditional attach)
src/commands/menu.md  (MODIFY: add claude:set-compliance-regime action row + a rule note)
tests/compliance-ride-along.test.js  (CREATE)  drives execFileSync(menu.js) JSON flow
```

Depth 2 (menu → compliance-regime → regulatory-regime). No cycle: `menu.js` already imports
from `lib/`; `compliance-regime` never imports `commands/`.

### File Specifications

#### File: `src/commands/menu.js`
**Action:** MODIFY
**Purpose:** Attach the compliance-regime ride-along question to the live dashboard JSON output.
**Change Type:** modify-existing (additive, mirrors the environment ride-along)

**Changes:**
- **Import** at top (near menu.js:14 `const { needsEnvironmentPrompt } = require('../lib/settings');`):
  `const { shouldRunGdpr, shouldRunEuAiAct } = require('../lib/compliance-regime');`
- **Add** `needsComplianceRegimePrompt(projectRoot)` → `boolean`: returns
  `!shouldRunGdpr(projectRoot) && !shouldRunEuAiAct(projectRoot)` (neither profile active ⇒
  ask once). Fail-open: wrap in try/catch returning `false` (never block the menu on a
  compliance read — the load-bearing menu invariant, `enterSearchMode` precedent).
- **Add** `attachComplianceQuestion(result, projectPath)` — mirrors `attachEnvironmentQuestion`
  (menu.js:20-44):
  - Prepend a one-line hint to `result.text`:
    `'⚖ No EU compliance regime chosen yet — pick one (gdpr = processes EU personal data under
    Regulation (EU) 2016/679 · eu-ai-act = deploys AI systems in the EU market under Regulation
    (EU) 2024/1689). The four human gates stay mandatory. Changeable later in settings.yaml.'`
    (parent Business Risk mitigation: one-line hint per option; the two Regulation numbers are
    the real citations, no invented figures.)
  - `result.ask.questions.push({ question: 'Which EU compliance regime applies to this
    project?', header: 'Compliance', options: [ {label:'None', ...}, {label:'GDPR', ...},
    {label:'EU AI Act', ...}, {label:'Both', ...} ] })` — exactly 4 options (≤4 limit).
  - `Object.assign(result.actions, { 'None': 'claude:set-compliance-regime none', 'GDPR':
    'claude:set-compliance-regime gdpr', 'EU AI Act': 'claude:set-compliance-regime eu-ai-act',
    'Both': 'claude:set-compliance-regime both' });`
  - Return `result`.
- **Modify** `main()` non-interactive branch (menu.js:505-519): after the existing
  `if (needsEnvironmentPrompt(...)) attachEnvironmentQuestion(result);`, add
  `if (needsComplianceRegimePrompt(app.projectPath)) attachComplianceQuestion(result, app.projectPath);`
  BEFORE the `justInitialized` text prepend and the `console.log`. Order: dashboard built →
  environment attach → compliance attach → init note → print. The Pipeline question stays
  first (never gated).
- **Update** `module.exports` to also export `attachComplianceQuestion` and
  `needsComplianceRegimePrompt` (so the test can unit them if needed; parity with the file's
  existing export of helpers).

**Called By:** `main()` (self); the test drives it via `execFileSync`.

#### Error Handling
- `needsComplianceRegimePrompt` fail-open (try/catch → false): a compliance read fault never
  blocks the dashboard.
- Malformed `result` (no `ask`/`actions`): `attachComplianceQuestion` guards
  `result.ask = result.ask || { questions: [] }` and `result.actions = result.actions || {}`
  before pushing (defensive, mirrors the additive contract; the real `route([])` always
  supplies both, per menu-screens.js:319).

#### Cross-Platform Notes
- No new path handling in menu.js; `app.projectPath` already resolved via `findProjectRoot`.
- The `claude:set-compliance-regime` action (menu.md) invokes the lib writer via `node -e`,
  same cross-platform shape as `claude:set-environment` (menu.md:53).

#### File: `src/commands/menu.md`
**Action:** MODIFY
**Purpose:** Document the new `claude:set-compliance-regime {profile}` action so the menu driver
persists the choice; add a ride-along rule note mirroring Rule 8 (environment).
**Change Type:** modify-existing (additive doc)

**Changes:**
- **Add** an action row after the `claude:env-decide-later` row (menu.md:54):
  `| `claude:set-compliance-regime {profile}` | Persist the chosen EU compliance regime. Map
  {profile}: `none`→no write; `gdpr`→`['gdpr']`; `eu-ai-act`→`['eu-ai-act-high-risk']`;
  `both`→`['gdpr','eu-ai-act-high-risk']`. Run `node -e
  "require('${CLAUDE_PLUGIN_ROOT}/src/lib/compliance-regime').writeActiveProfiles(process.cwd(),
  ARR)"` with the mapped array, confirm the choice, then continue with the user's
  pipeline-section choice. Never weakens a human gate. |`
- **Add** a numbered rule mirroring Rule 8: "Compliance question rides along, never gates: when
  neither EU compliance profile is active, `menu.js` attaches a **second/third** question
  (`header: 'Compliance'`) alongside Pipeline (and Environment when also pending). Present all
  in one AskUserQuestion call (≤4 questions). Apply the compliance side-effect
  (`claude:set-compliance-regime {profile}`) then fall through to the pipeline answer. The
  dashboard is NEVER replaced; the four human gates stay mandatory."

### Test Plan

#### Tests: `tests/compliance-ride-along.test.js`
**Action:** CREATE
**Framework:** `node:test`, EXACT pattern of `tests/menu-environment.test.js`:
`execFileSync(process.execPath, [MENU], { cwd, encoding:'utf8' })` → `JSON.parse` → assert on
`r.text`, `r.ask.questions`, `r.actions`. This DRIVES THE REAL LIVE MENU (PI4 lesson).

Helper `projectWith(settingsYaml, settingsJson)` mkdtemps a project with `plans/functional/`,
a `.ctoc/settings.yaml` (with a `regulatory_regime.active_profiles:` line) and optionally
`.ctoc/settings.json`, and copies the real `regulatory-regimes/` dir (so the regime read
works). Cleanup in `after()`.

**Test Cases:**
1. **Neither profile active → compliance question rides along, dashboard intact:**
   `active_profiles: []` (and environment SET to prod so only the compliance question rides).
   Assert: `r.text` still contains the Business/Implementation/Execution overview (dashboard
   NOT replaced); `r.ask.questions[0].header === 'Pipeline'` (overview never gated); one
   question has `header === 'Compliance'` with exactly 4 options
   (None/GDPR/EU AI Act/Both); `r.actions['GDPR'] === 'claude:set-compliance-regime gdpr'`,
   `r.actions['Both'] === 'claude:set-compliance-regime both'`, `r.actions['None'] ===
   'claude:set-compliance-regime none'`.
2. **A profile already active → NO compliance question (asked once):** `active_profiles: [gdpr]`.
   Assert: no question has `header === 'Compliance'`; no `set-compliance-regime` action present;
   dashboard still renders.
3. **eu-ai-act active also suppresses the prompt:** `active_profiles: [eu-ai-act-high-risk]` →
   no Compliance question.
4. **AskUserQuestion limits: ≤4 questions, ≤4 options each** with environment UNSET AND
   compliance unset (both ride along + Pipeline): assert `r.ask.questions.length <= 4` and
   every `q.options.length <= 4`.
5. **Pipeline always first (overview never gated), both ride-alongs present:** environment
   unset + compliance unset; assert `r.ask.questions[0].header === 'Pipeline'` and the set of
   headers includes both `'Environment'` and `'Compliance'`.
6. **End-to-end persistence via the real writer (integration):** start `active_profiles: []`;
   directly call the wired write path used by the action —
   `require('src/lib/compliance-regime').writeActiveProfiles(dir, ['gdpr'])` — then re-run
   `runMenu(dir)` and assert the Compliance question is GONE (proving the write landed in the
   real settings.yaml and the live menu re-read it). This closes the human loop:
   ask → choose → persisted → not re-asked.
7. **Gate safety on the live path:** with `active_profiles: [gdpr, eu-ai-act-high-risk]`, run
   the menu; assert the output contains NO action or text that sets `enforcementMode`/
   `requireReviewGate` and the Pipeline question is intact — compliance activation does not
   alter the menu's gate surface.

**Coverage Targets:** the new menu helpers `needsComplianceRegimePrompt` and
`attachComplianceQuestion` fully exercised (present/absent branches, both-pending branch).
≥ 80% on the added lines. Error path: a project whose `settings.yaml` is missing still renders
the menu with the compliance question (fail-open) — asserted.

### Security Review
- [x] Path traversal: no user path input; `app.projectPath` from `findProjectRoot`. The action
      maps a fixed enum {none,gdpr,eu-ai-act,both} to a fixed profile array — no arbitrary
      profile name reaches the writer.
- [x] Input validation: the four options are a closed set; `writeActiveProfiles` (s2) filters
      to non-empty strings.
- [x] No secrets.
- [x] Safe file operations: the write goes through s2's targeted-replace writer (only
      `settings.yaml`, round-trip verified); menu.js itself writes nothing.
- [x] Error messages: fail-open, no path leakage.
- [x] Command injection: the `node -e` action uses a fixed literal array mapped from the enum,
      never interpolated user free-text (mirrors the safe `set-environment` pattern).
- [x] Gate safety (parent Success Metric 5): the ride-along only writes `active_profiles`;
      cannot reach `enforcementMode`/`requireReviewGate`. Asserted by test 7 + s2 test 13.

## Execution Plan

### Step 8: TEST
Write `tests/compliance-ride-along.test.js` (7 cases) driving the real `menu.js` JSON flow
(red — helpers absent).

### Step 9: PREPARE
Confirm EC1-s2 exports `shouldRunGdpr`/`shouldRunEuAiAct`/`writeActiveProfiles` and EC1-s1's
`gdpr.yaml` exist (dependencies). Confirm the environment ride-along pattern at menu.js:20-44,
505-519 is unchanged.

### Step 10: IMPLEMENT
Modify `src/commands/menu.js`: add the import, `needsComplianceRegimePrompt`,
`attachComplianceQuestion`, the conditional attach in `main()`, and the exports. Modify
`src/commands/menu.md`: add the `claude:set-compliance-regime` action row and the ride-along
rule note.

### Step 11: REVIEW
Verify the dashboard is built BEFORE the attach (overview never gated); Pipeline question stays
first; fail-open guards in place; ≤4 questions preserved; no legacy/unmounted module touched
(only the live `menu.js` main path — PI4 lesson satisfied).

### Step 12: OPTIMIZE
Reuse the environment ride-along shape verbatim; no new abstraction. No duplicate read — call
`shouldRun*` once each inside the predicate.

### Step 13: SECURE
Run the checklist; confirm the enum→array mapping is a closed set and the `node -e` action
carries no free-text interpolation; confirm no gate key is reachable.

### Step 14: VERIFY
`node --test tests/compliance-ride-along.test.js` → `# fail 0`. Then full suite `node --test
tests/*.test.js` → `# fail 0` — CRITICALLY including `tests/menu-environment.test.js`,
`tests/menu-protocol.test.js`, `tests/menu-screens.test.js` (no regression to the existing
ride-along / ≤4-question contracts).

### Step 15: DOCUMENT
The menu.md action row + rule note ARE the documentation. Add a short comment above
`attachComplianceQuestion` cross-referencing `attachEnvironmentQuestion` as the mirrored pattern.

### Step 16: FINAL-REVIEW
Confirm: dashboard never gated, question asked once, persistence round-trips on the live path,
≤4 questions, gates intact. Ready for batched Gate 2 with siblings s1, s2.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — 8 tests: 4 pass (absent-branch), 4 fail (ride-along-present) → RED confirmed

### Step 9: PREPARE
- [x] Install dependencies if needed — none
- [x] Check prerequisites — EC1-s2 (`compliance-regime.js` exports shouldRunGdpr/shouldRunEuAiAct/writeActiveProfiles) + EC1-s1 (gdpr.yaml, eu-ai-act-high-risk.yaml) confirmed on disk
- [x] Verify dev environment ready
- [x] Create directories/config if needed — n/a

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — menu.js: import + needsComplianceRegimePrompt + attachComplianceQuestion + main() conditional attach + exports; menu.md: action row + Rule 14
- [x] Add error handling — fail-open predicate (try/catch→false); defensive ask/actions guards in attach
- [x] Wire up integration points — attach in main() JSON branch after env attach

### Step 11: REVIEW
- [x] Self-review all new code — dashboard built (route([])) BEFORE attach; Pipeline stays first; only live menu.js touched (PI4)
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations — reused env ride-along shape verbatim, no new abstraction; single shouldRun* call each
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — no user path input; app.projectPath from findProjectRoot
- [x] Sanitize outputs — closed 4-option enum → fixed action strings; no free-text interpolation
- [x] No secrets in code
- [x] Safe file operations — menu.js writes nothing; writer is s2's targeted-replace; no gate key reachable

### Step 14: VERIFY
- [x] Run lint + type check — eslint . --max-warnings 0 → exit 0; tsc baseline-neutral (4 pre-existing menu.js errors only, no new)
- [x] Run ALL tests (TDD Green) — node --test tests/*.test.js → tests 3180, pass 3180, fail 0
- [x] Check coverage >= 80% — new helpers fully exercised (present/absent/both-pending/fail-open branches)
- [x] 0 skipped, 0 flaky tests — skipped 0, todo 0

### Step 15: DOCUMENT
- [x] Update relevant documentation — menu.md claude:set-compliance-regime row + Rule 14
- [x] Add JSDoc comments to new functions — cross-ref comment above attachComplianceQuestion ("MIRRORS attachEnvironmentQuestion")
- [x] Update CHANGELOG if needed — n/a

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed — real-menu-drive proof: dashboard intact + question rides along (see decisions)
- [x] Ready for human review — batched Gate 2 with siblings s1, s2 (plan left in todo per CTO Chief directive)

---

## Decisions Taken Under Ambiguity (EC1-s3 execution)

1. **Plan left in `plans/todo/` (not moved to in-progress or review).** The CTO Chief
   dispatch directive was explicit: "Do NOT move the plan." EC1-s3 batches with siblings
   s1/s2 at Gate 2 (plan's Step 16). I implemented Steps 8–16 in place and did not cross any
   human gate. (Rule 1 note: `EC1-s1-gdpr-profile.md` sits in the legacy `plans/in-progress/`
   dir, but its code deliverables — gdpr.yaml, eu-ai-act-high-risk.yaml — are already shipped
   on disk; it is a stale kanban artifact, not active work. Dependencies verified present.)

2. **`attachComplianceQuestion(result, projectPath)` keeps the `projectPath` param unused.**
   The plan spec's signature includes it for parity with the write-side, but the write happens
   in the `claude:set-compliance-regime` action handler (menu.md), not in the attach. ESLint's
   `args: after-used` does not flag a trailing unused arg, so the signature stays as specified
   with no lint suppression needed (removed the initial eslint-disable directive that ESLint
   itself reported as unused).

3. **Pinned menu-structure tests updated to isolate ride-alongs.** Three existing tests
   (`menu-environment.test.js` env-unset/env-set cases; `e2e-menu-lifecycle.test.js` cases 6 &
   6b) asserted exact question counts (2 and 1) and now would see the compliance question also
   ride along when no profile is active. Per the plan's coexistence contract (both ride-alongs
   present, ≤4), I updated those fixtures to mark a compliance profile active
   (`active_profiles: [gdpr]` in a real settings.yaml) so each suite pins the ENVIRONMENT
   ride-along in isolation. The compliance ride-along has its own suite. No environment behavior
   changed; the coexistence (env + compliance + Pipeline, ≤4) is pinned by
   compliance-ride-along.test.js cases 4 & 5.

4. **Test fixture uses inline `active_profiles: [...]` + a trailing top-level key.** The real
   reader (`regulatory-regime.js:loadActiveProfiles`) extracts the `regulatory_regime:` block up
   to the next top-level key, so the fixture settings.yaml carries a following `general:` key to
   terminate the block. This matches the real settings.yaml shape and the writer's round-trip
   format (EC1-s2).

## Execution Proof (for review)

- **RED→GREEN:** new suite 8 tests → RED 4 fail (ride-along-present cases) / GREEN 8 pass.
- **Real ride-along attachment (live menu.js `main()` JSON branch):**
  `if (needsComplianceRegimePrompt(app.projectPath)) attachComplianceQuestion(result, app.projectPath);`
  placed AFTER the environment attach and BEFORE the `justInitialized` text prepend / `console.log`.
  Order: dashboard built → env attach → compliance attach → init note → print.
- **Real-menu-drive proof (execFileSync(menu.js) → JSON):** compliance question rides along
  when unset (`▼ Business/Implementation/Execution` all present + `ask.questions[0].header ===
  'Pipeline'` + a `Compliance` question with exactly 4 options); when a profile is active it
  does NOT ride along; end-to-end persistence via `writeActiveProfiles` → not re-asked; gate
  surface never carries `enforcementMode`/`requireReviewGate`.
- **Tallies:** compliance-ride-along 8/8; menu-environment 4/4; e2e-menu-lifecycle 10/10;
  readme-numbers 47/47; full suite tests 3180 / pass 3180 / fail 0 / skipped 0 / todo 0;
  eslint exit 0; tsc baseline-neutral.
