---
iron_loop_verdict: true
title: "The dev-tool credit reads all four dependency maps — a canonical Create React App detects"
type: implementation
iron_loop: true
parent_plan: a-canonical-create-react-app-is-detected
depends_on: none
priority: high
effort: small
files:
  - src/lib/framework-detector.js
  - tests/framework-detector.test.js
  - tests/framework-detector-coverage.test.js
  - tests/remainder-security-tooling-coverage.test.js
approved_by: human
approved_at: 2026-09-03T12:12:02.258Z
gate_crossed: implementation → todo
---

# The dev-tool credit reads all four dependency maps

One slice. One changed lookup in `calculateConfidence`, its doc comment, five new
regression cases, one strengthened existing case, one corrected file header.

## Implementation Details

### What was read to write this slice

- `src/lib/framework-detector.js` in full (525 lines): the `FRAMEWORKS` table
  (lines 32–134), `hasDependency` (181–194, carrying the FINDING 5(b) comment),
  `hasDevDependency` (201–204), `calculateConfidence` (211–249, the three weighted
  loops), `detect()` (255–319) including the priority order (268–271), the
  react-vite disqualifier (293–296) and the react-cra disqualifier (297–300),
  `hasViteSignal` (327–335), `hasRemixSignal` (343–346), `isWebApp` (441–449).
- `tests/framework-detector.test.js` (380 lines) and
  `tests/framework-detector-coverage.test.js` (413 lines) — every fixture read.
- `tests/remainder-security-tooling-coverage.test.js` header (lines 1–116),
  which classifies `framework-detector.js 298-300` as unreachable under (c) at
  lines 95–102 and records the live defect as a FINDING at lines 104–112.
- The two consumers, `src/lib/app-runner.js` and
  `src/lib/playwright-scaffolder.js` (see "Consumers" below). A grep for
  `require('./framework-detector')` across `src/` returns exactly those two files
  — there is no third consumer.

### The source edit

`src/lib/framework-detector.js`, `calculateConfidence`, the third loop. Line 241
today reads `if (this.hasDevDependency(dep)) {`. It becomes
`if (this.hasDependency(dep)) {`. The `+10` weight, the `break`, the `checks++`
and both other loops are untouched. The comment above the loop (line 237,
`// Check dev dependencies (lower weight)`) is replaced, because a reader who
sees `packageDevDeps` looked up with `hasDependency` must be told why:

```js
    // Tooling signal (lower weight). `packageDevDeps` names the packages a project
    // of this shape TYPICALLY declares as dev dependencies — the signal is the
    // package's PRESENCE, not its placement, so it is looked up with hasDependency
    // (all four maps), never hasDevDependency. Create React App's own generator
    // puts react-scripts in `dependencies`; reading devDependencies alone scored
    // that canonical project 40, below react-vite's 40 on priority order, and
    // detect() returned null for a real React app — its whole security surface
    // silently skipped. Same philosophy as FINDING 5(b) on hasDependency above:
    // under-detecting a real web app is the failure that matters. The weight stays
    // +10; this is a placement fix, not a rescore.
    if (framework.packageDevDeps) {
      checks++;
      for (const dep of framework.packageDevDeps) {
        if (this.hasDependency(dep)) {
          score += 10;
          break;
        }
      }
    }
```

`hasDevDependency` is **not** deleted and does not become dead: `hasViteSignal`
(lines 332–333) still calls it twice. Do not remove it.

Nothing else in the module changes. In particular the react-cra disqualifier at
lines 297–300 is left exactly as it is — see "The react-cra disqualifier" below.

### Every profile carrying `packageDevDeps` (read from the table, all five)

| id | `packageDevDeps` | Other score sources |
|---|---|---|
| `vue` | `@vue/cli-service`, `vite` | configFiles `vue.config.js`, `vite.config.ts`, `vite.config.js` (+50); packageDeps `vue` (+40) |
| `svelte` | `@sveltejs/kit` | configFiles `svelte.config.js` (+50); packageDeps `svelte` (+40) |
| `react-vite` | `vite`, `@vitejs/plugin-react` | configFiles `vite.config.ts`, `vite.config.js` (+50); packageDeps `react` (+40) |
| `react-cra` | `react-scripts` | packageDeps `react` (+40). No configFiles — its ceiling without the dev-tool credit is 40. |
| `remix` | `@remix-run/dev` | configFiles `remix.config.js` (+50); packageDeps `@remix-run/react`, `@remix-run/dev`, `@remix-run/node`, `@remix-run/serve` (+40) |

The five profiles WITHOUT `packageDevDeps` — `nextjs`, `nuxt`, `angular`,
`astro`, `gatsby` — cannot change at all: the loop is guarded by
`if (framework.packageDevDeps)` and never runs for them.

### Why the canonical layout returns null today (recomputed from the source)

`package.json` with `react`, `react-dom`, `react-scripts` all in `dependencies`,
no config file on disk:

- `react-vite` = 0 (no vite config) + 40 (`react`) + 0 (`hasDevDependency('vite')`
  and `hasDevDependency('@vitejs/plugin-react')` both false) = **40**.
- `react-cra` = 40 (`react`) + 0 (`hasDevDependency('react-scripts')` is false —
  it is in `dependencies`) = **40**.
- The priority walk visits `react-vite` (index 8) before `react-cra` (index 9)
  and the comparison is strict `>`, so `react-cra`'s 40 never displaces
  `react-vite`'s 40. `bestMatch` = react-vite.
- `!this.hasViteSignal()` is true → `bestMatch = null`, `highestConfidence = 0`.
- The react-cra disqualifier is then skipped (`bestMatch` is null) and `detect()`
  returns **null**.

After the edit `react-cra` scores 40 + 10 = **50**, which is `> 40`, so it becomes
`bestMatch`; the react-vite disqualifier does not apply to it; its own
disqualifier asks `hasDependency('react-scripts')`, which is true; 50 ≥ 40 →
`{ id: 'react-cra', confidence: 50, defaultPort: 3000, devCommand: 'npm run start' }`.

### Blast radius — every existing fixture, classified

The change can only alter a score when one of the six tool names above appears
**outside** `devDependencies`. A grep of `tests/` for `react-scripts`,
`@vue/cli-service`, `@sveltejs/kit`, `@vitejs/plugin-react`, `@remix-run/dev` and
`vite` found no such fixture. Full classification:

| Fixture (file:line) | Tool placement | Score today → after | Verdict change |
|---|---|---|---|
| framework-detector.test.js:74 vue + vite.config.ts | `vite` in devDeps | vue 100 → 100 | none |
| framework-detector.test.js:120 svelte + config | `@sveltejs/kit` in devDeps | svelte 100 → 100 | none |
| framework-detector.test.js:152 Remix v2 | `@remix-run/dev`, `vite` in devDeps | remix 50 → 50, react-vite 100 → 100 | none (override path unchanged) |
| framework-detector.test.js:172 minimal Remix v2 | devDeps | unchanged | none |
| framework-detector.test.js:183 Remix v1 | `@remix-run/dev` absent from every map | remix 90 → 90 | none |
| framework-detector.test.js:193 plain React+Vite | devDeps | react-vite 100 → 100 | none |
| framework-detector.test.js:218 bare react | no tool anywhere | react-vite 40 → 40, react-cra 40 → 40 | none (still null) |
| framework-detector.test.js:227 react + vite.config.ts | no tool package | react-vite 90 → 90 | none |
| framework-detector.test.js:235 react + vite devDep | devDeps | react-vite 50 → 50 | none |
| framework-detector.test.js:245 react + react-scripts devDep | devDeps | react-cra 50 → 50 | none |
| framework-detector-coverage.test.js:71 lone vite devDep | devDeps | vue 10 → 10 | none (still below the 40 floor) |
| framework-detector-coverage.test.js:82 bare astro | astro has no packageDevDeps | 40 → 40 | none |
| framework-detector-coverage.test.js:116 react + vite.config.js | no tool package | react-vite 90 → 90 | none |
| framework-detector-coverage.test.js:129 react + vite.config.mjs | no tool package | react-vite 40 → 40 | none — the asserted `confidence === 40` holds |
| framework-detector-coverage.test.js:143 react + @vitejs/plugin-react | devDeps | react-vite 50 → 50 | none — the asserted `confidence === 50` holds |
| framework-detector-coverage.test.js:268 next in devDeps + config | nextjs has no packageDevDeps | 90 → 90 | none — the asserted `confidence === 90` holds |
| app-runner.test.js:70 `scripts: { dev: 'vite' }` | `vite` is a SCRIPT STRING, not a dependency | no score effect | none |
| app-runner.test.js:127, :684 | `vite` in devDeps | unchanged | none |

**No existing test asserts the old credit behaviour.** Nothing pins the defect,
so no assertion is weakened, replaced or deleted anywhere in this slice. The one
existing case that is touched (framework-detector.test.js:245) is *strengthened*
— see the Test Plan.

Second-order note, no test affected: because `hasDependency` reads
`peerDependencies` and `optionalDependencies` too, a tool declared there now also
earns +10. No fixture in the suite does that, and `app-runner.detectAppShape`
gates its hard `'web'` shape on a `dev`/`start` script, so a peer-only component
library cannot be pushed into the web shape by the extra 10.

### The react-cra disqualifier (lines 297–300) — dead before AND after

The parent plan expects this slice to make that branch execute. **It cannot, and
this slice does not claim it does.** Proof from the source as read:

`react-cra`'s only score sources are `packageDeps: ['react']` (+40) and
`packageDevDeps: ['react-scripts']` (+10); it declares no `configFiles`, so its
ceiling without `react-scripts` is 40. `react-vite` scores +40 from the SAME
`react` dependency via the same `hasDependency` call, and is walked first with a
strict `>` comparison. Therefore `react-cra` can only become `bestMatch` when it
scores 50, which requires the `react-scripts` credit — and after this edit that
credit is awarded by `hasDependency('react-scripts')`, which is the disqualifier's
own predicate. So `bestMatch.id === 'react-cra'` now implies
`this.hasDependency('react-scripts') === true`, making
`!this.hasDependency('react-scripts')` false by construction. The branch body is
unreachable; the `if` line itself still executes.

The same implication held before the edit (`hasDevDependency` ⊂ `hasDependency`),
which is exactly what the existing header classification (c) in
`tests/remainder-security-tooling-coverage.test.js` says. That classification
stays TRUE; only its mechanism wording needs the one-clause update below.

Deleting the guard, or reordering `priorityOrder` so `react-cra` is walked first,
would both change detection behaviour beyond the one lookup this plan authorises.
Neither is done here. Recorded as a finding for the human to schedule.

### Header correction — `tests/remainder-security-tooling-coverage.test.js`

Comment text only. No assertion, no fixture, no `test()` in that file is touched.
Line 54 (`framework-detector.js 298-300  SEE (c): unreachable. No case.`) stays
as it is — it remains accurate.

Replace lines 95–102 (the (c) entry) with:

```
 *   framework-detector.js 298-300 detect()'s react-cra bundler-evidence disqualifier. Its
 *                                 condition cannot be true. react-cra declares no config
 *                                 files, so it can only outrank react-vite (walked first,
 *                                 and `>` is strict) by the +10 its packageDevDeps entry
 *                                 `react-scripts` awards — and that credit is now looked up
 *                                 with `hasDependency`, the disqualifier's own predicate.
 *                                 So whenever react-cra is bestMatch the condition is
 *                                 already false: dead by construction, kept as the guard's
 *                                 honest statement of intent. Reordering the priority walk
 *                                 or deleting the guard are behaviour changes and belong to
 *                                 their own plan.
```

Replace lines 104–112 (the FINDING paragraph) with:

```
 * FIXED (2026-09-03, by the plan "a canonical Create React App is detected"). Create React
 * App's own generator puts `react-scripts` in `dependencies`. calculateConfidence used to
 * credit the packageDevDeps signal through `hasDevDependency` (devDependencies only), so
 * such a project scored react-cra 40 on the react dependency alone, tied react-vite at 40,
 * lost the tie on priority order, and was nulled by the react-vite Vite-evidence guard:
 * `detect()` returned **null** for a canonical Create React App and its whole security
 * surface was silently skipped. The credit loop now uses `hasDependency` — all four maps,
 * the FINDING 5(b) philosophy — at the unchanged +10 weight. Pinned by
 * tests/framework-detector.test.js, "canonical Create React App (react-scripts in
 * dependencies) → react-cra", and by the per-profile packageDevDeps sweep in
 * tests/framework-detector-coverage.test.js. The dead range above is unaffected; see (c).
```

### Consumers — no change needed, and why

- `src/lib/app-runner.js` requires `FrameworkDetector` at line 72 and uses it in
  `detectAppShape` (line 222): it calls `detector.isWebApp()` (line 247) and
  `detector.detectAll()`. `isWebApp` walks a fixed list of framework packages
  through `hasDependency` and never touches `calculateConfidence`, so it is
  bit-for-bit unaffected. `detectAll` returns whatever `detect()` returns; the
  shape of that object is unchanged and the function reads only `id`. A canonical
  Create React App member that previously surfaced as no framework now surfaces as
  `react-cra` — which is the fix, not a regression, and `detectAppShape` still
  requires a `dev`/`start` script before it claims the hard `'web'` shape.
- `src/lib/playwright-scaffolder.js` requires it at line 14 and calls
  `this.detector.detect()` once in the constructor (line 35), then reads
  `this.framework.name` (lines 95, 202, 514) and `.defaultPort` (line 515) — the
  same fields the `FRAMEWORKS` table already supplies for `react-cra`
  (`name: 'React (Create React App)'`, `defaultPort: 3000`,
  `devCommand: 'npm run start'`). No consumer reads `confidence`; the only
  consumer of that number is `detect()`'s own `>= 40` floor.

## Test Plan (TDD — red first)

Every case builds a real temp project on disk and runs the real detector, exactly
as both existing suites do (`makeProject` / `write` / `writePkg`, cleaned up in
`afterEach`). Zero doubles.

### RED against the current code — 5 cases

**R1 — canonical Create React App** → `tests/framework-detector.test.js`, in the
FINDING 3 describe block (line 213), next to the existing react-cra regression.

```js
// Create React App's generator writes react-scripts into `dependencies`.
write(dir, 'package.json', JSON.stringify({
  dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1', 'react-scripts': '5.0.1' }
}));
const result = new FrameworkDetector(dir).detect();
assert.ok(result, 'a canonical Create React App must not read as no-framework');
assert.strictEqual(result.id, 'react-cra');
assert.strictEqual(result.confidence, 50, 'react dep 40 + react-scripts 10');
assert.strictEqual(result.defaultPort, 3000);
```
RED today on the first assertion: `detect()` returns `null` (arithmetic above).

**R2–R5 — the packageDevDeps sweep**, one case per remaining profile, in a new
describe block in `tests/framework-detector-coverage.test.js` (the scoring-contract
companion). For `vue`, `svelte` and `remix` the VERDICT is unchanged — they clear
the 40 floor on their framework dependency alone — so `confidence` is the only
observable that moves and is what goes red. Each asserts the id as well, to prove
no neighbour profile stole the match.

| # | Profile | Fixture | Today | After |
|---|---|---|---|---|
| R2 | `vue` | `dependencies: { vue, '@vue/cli-service' }`, no config file | `vue` @40 | `vue` @50 |
| R3 | `svelte` | `dependencies: { svelte, '@sveltejs/kit' }`, no `svelte.config.js` | `svelte` @40 | `svelte` @50 |
| R4 | `react-vite` | `dependencies: { react, react-dom, vite }` **plus `vite.config.ts` on disk** | `react-vite` @90 | `react-vite` @100 |
| R5 | `remix` | `dependencies: { '@remix-run/dev', react, react-dom }`, no config file | `remix` @40 | `remix` @50 |

R4 carries the config file deliberately: `hasViteSignal()` is a separate gate that
still reads `devDependencies` only, so without a config file that fixture would
score 50 and then be disqualified to `null`. The config file isolates the credit
change from that gate. See Decision 3.

R5 also proves the priority walk is unchanged: `remix` (index 5) is visited before
`react-vite` (index 8), both score 40 today, and the strict `>` keeps `remix`.

### GREEN guards — 2 cases, and one strengthened existing case

**G1 — the historical layout still detects.** The existing case
`tests/framework-detector.test.js:245` ("REGRESSION: a real Create React App
(react + react-scripts) still → react-cra") already builds this fixture with
`react-scripts` in `devDependencies`. It is **strengthened, never weakened**, in
two ways, and both are additive:
- title → `REGRESSION: react-scripts in devDependencies (the historical layout) still → react-cra`, because after R1 exists, calling the devDependencies shape "a real Create React App" mislabels which of the two layouts the generator actually writes;
- one assertion ADDED: `assert.strictEqual(result.confidence, 50)`.

Justification (Lesson 14): no assertion is removed, loosened or re-scoped — the
existing `assert.ok(result)` and `assert.strictEqual(result.id, 'react-cra')`
stay verbatim. The added assertion is earned by this change: the credit for that
fixture now flows through `hasDependency` instead of `hasDevDependency`, and the
+10 is the only thing proving the new lookup still reads the `devDependencies`
map. A mutant narrowing `hasDependency` to `dependencies` alone would leave the id
correct and be caught only by this number.

**G2 — react with no react-scripts anywhere and no Vite signal → null.** New case
in `tests/framework-detector-coverage.test.js`:

```js
writePkg(dir, { dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' } });
assert.equal(new FrameworkDetector(dir).detect(), null);
```
GREEN today and after — a guard, not a red. Its comment must state the mechanism
honestly: the null comes from the **react-vite** disqualifier (react-vite wins the
40/40 tie on priority order and is nulled by `!hasViteSignal()`), and the react-cra
disqualifier body is never entered, before or after this change, for the reason
proved above. Do not label this case as covering lines 297–300.

The existing looser sibling at `tests/framework-detector.test.js:218`
(`!result || result.id !== 'react-vite'`) is left untouched — it is not wrong, and
G2 states the stronger fact in the companion file rather than rewriting a passing
assertion.

**G3 — the whole suite.** `npm test`: `# fail 0`, 0 skipped, coverage at or above
the `.ctoc/coverage-baseline.json` floor. The four new cases in the coverage
companion and one in the main suite add covered lines in an already-covered
module, so the floor is not at risk from this slice.

### Coverage note, stated rather than papered over

This slice does NOT increase branch coverage of `framework-detector.js` lines
298–299; that body stays unexecuted for the structural reason proved above, and
`tests/remainder-security-tooling-coverage.test.js` continues to classify it under
(c). Any claim that the slice "covers the disqualifier" would be false.

## Wiring — the live call sites

No new module. The changed function is `FrameworkDetector.calculateConfidence`,
already reached from a live entry point by both consumers:

- `src/lib/app-runner.js:222` → `detectAppShape()` → `detector.detectAll()` →
  `detect()` → `calculateConfidence()`. `app-runner` is the Step 14 last-mile
  check, reached from the shipped verification path.
- `src/lib/playwright-scaffolder.js:35` → `this.detector.detect()` →
  `calculateConfidence()`, in the scaffolder's constructor.

Both are existing live call sites; nothing in this slice needs new wiring, and
nothing it touches can become dead code.

## Decisions Taken Under Ambiguity

1. **The parent plan's scenario 3 rationale is wrong and is corrected here, not
   silently followed.** It expects the new case to make lines 297–300 execute
   "for the first time". The arithmetic above proves that branch body is
   unreachable before and after the edit. The scenario's OUTCOME (react without
   react-scripts and without a Vite signal → null) is still worth pinning and is
   pinned as G2; the mechanism claim is not repeated in the test comment. Making
   the branch reachable requires reordering `priorityOrder` or deleting the guard
   — both are behaviour changes outside this plan's one-lookup scope, and both are
   the human's to schedule.

2. **Scenario 2's guard already exists, so it is strengthened in place rather than
   duplicated.** A second fixture asserting the same thing is noise; the added
   `confidence === 50` assertion is what the change actually earns.

3. **The sibling placement defect in `hasViteSignal()` is reported, not fixed, and
   NOT pinned by a test.** `hasViteSignal` (lines 327–335) still calls
   `hasDevDependency('vite')` and `hasDevDependency('@vitejs/plugin-react')`, so a
   real React + Vite app that declares `vite` in `dependencies` and ships no
   `vite.config.*` file scores 50 after this fix and is then disqualified to
   `null` — the same placement-blindness, in the gate instead of the score, with
   the same consequence FINDING 5(b) warns about. It is a second changed lookup
   and the parent plan authorises exactly one. No test asserts that shape's
   current `null`, because such a test would pin the defect and make the eventual
   fix red. Surfaced for the human to schedule.

4. **`hasDevDependency` is kept.** It stops being called by
   `calculateConfidence` but is still called twice by `hasViteSignal`, so it is
   live code. A reviewer must not delete it as newly-dead.

5. **The sweep asserts `confidence`, not just `id`, for vue/svelte/remix.** Those
   three already clear the 40 floor on their framework dependency alone, so their
   verdict does not move and only the score does; asserting the id alone would be
   green before and after and would prove nothing.

6. **R4 (react-vite) carries `vite.config.ts` deliberately.** Without it the
   fixture would exercise decision 3's residual gate defect instead of this
   slice's credit change, and would assert `null` — pinning that defect. The
   config file isolates the one thing this slice changes.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation — R1 (canonical Create React App) added to the FINDING 3 block of tests/framework-detector.test.js; R2-R5 (the packageDevDeps sweep: vue, svelte, react-vite, remix) and G2 (react with no react-scripts and no Vite signal → null) added as one new describe block in tests/framework-detector-coverage.test.js; G1 (the historical devDependencies layout) strengthened in place — title corrected and `confidence === 50` ADDED, both existing assertions verbatim.
- [x] Test error conditions — the under-detection failure is the error condition: R1 pins that a real project must not read as no-framework, and G2 pins that a React project with no bundler evidence still returns null (no false-positive run strategy). Both go through the real detector on a real temp project; zero doubles.
- [x] Run tests - expect RED (failing) — `node --test tests/framework-detector.test.js tests/framework-detector-coverage.test.js tests/remainder-security-tooling-coverage.test.js` BEFORE any source edit: tests 64, pass 59, fail 5, skipped 0. The five reds are exactly the five predicted cases, each on its predicted assertion: R1 `assert.ok(result)` actual null / expected true; R2 vue confidence actual 40 / expected 50; R3 svelte actual 40 / expected 50; R4 react-vite actual 90 / expected 100; R5 remix actual 40 / expected 50. G1 and G2 were GREEN in that same pre-edit run, as the plan states they must be — they are guards, not reds.

### Step 9: PREPARE
- [x] Install dependencies if needed — none. The slice adds no dependency; both test files already require only `node:test`, `node:assert`, `node:fs`, `node:path`, `node:os` and the detector under test.
- [x] Check prerequisites — the four declared files all exist and were read in full before editing; the two consumers named in the plan (src/lib/app-runner.js, src/lib/playwright-scaffolder.js) were confirmed as the only requirers of the module.
- [x] Verify dev environment ready — the pre-edit run of the three files executed 64 cases against real temp projects on disk, proving the harness works before the change.
- [x] Create directories/config if needed — none. No new file, no new directory; the new cases live in the two existing test files the plan declares.

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — ONE lookup changed in `calculateConfidence`'s `packageDevDeps` loop: `this.hasDevDependency(dep)` → `this.hasDependency(dep)`. The `+10` weight, the `break`, the `checks++` and both other loops are byte-for-byte untouched. The comment above the loop was replaced with the presence-not-placement rationale exactly as the plan specifies. `hasDevDependency` was NOT deleted — `hasViteSignal` still calls it twice (Decision 4). Nothing else in the module changed; the react-cra disqualifier is untouched.
- [x] Add error handling — no new failure mode is introduced. `hasDependency` already guards `!this.packageJson` and every map access, so a missing or malformed package.json returns false exactly as before; the config-file fallback path (FINDING 5(a)) is unchanged. The change makes the module fail-open toward DETECTING a real web app, which is the direction FINDING 5(b) requires of a detector feeding a security router.
- [x] Wire up integration points — no new module and no new wiring is needed. `calculateConfidence` is already reached from two live call sites: src/lib/app-runner.js `detectAppShape()` → `detector.detectAll()` → `detect()`, and src/lib/playwright-scaffolder.js's constructor → `this.detector.detect()`. Both were re-read; neither reads `confidence` (the only consumer of that number is `detect()`'s own `>= 40` floor), and the returned shape for react-cra is unchanged.

### Step 11: REVIEW
- [x] Self-review all new code — the full diff was read back. src/lib/framework-detector.js: 13 lines, one of them the changed predicate and the rest the replaced comment. tests/remainder-security-tooling-coverage.test.js: 37 lines, and a diff filtered for any changed line NOT beginning with ` *` returns EMPTY — the edit is provably comment-only, no assertion, fixture or `test()` in that file was touched. The strengthened case at tests/framework-detector.test.js keeps `assert.ok(result)` and `assert.strictEqual(result.id, 'react-cra')` verbatim and only ADDS `confidence === 50` plus a corrected title; nothing anywhere was weakened, loosened, re-scoped or deleted (Lesson 14).
- [x] Verify integration points work together — the whole suite is the check; see Step 14. The blast-radius reasoning was re-derived rather than trusted: the credit can only move a score when one of the six tool names appears outside `devDependencies`, and every fixture the plan classified was confirmed unchanged by the full green run.
- [x] Check error handling completeness — the two boundary shapes are pinned by cases that were GREEN before and after and remain green: the historical devDependencies layout still detects at 50, and a React project with no bundler evidence at all still returns null rather than being handed a run strategy it cannot honour.

### Step 12: OPTIMIZE
- [x] Remove redundant operations — none to remove; the loop still breaks on the first hit and the `checks++` accounting is unchanged.
- [x] Optimize critical paths — nothing warranted. `hasDependency` reads up to four in-memory object maps instead of one, over a `packageDevDeps` list that is at most two entries long, on an already-parsed package.json. That is not a measurable path, and adding a cache for it would be code written for no reason.
- [x] Simplify complex code — the change SIMPLIFIES the contract: the credit loop and the framework-dependency loop above it now use the same lookup, so a reader no longer has to work out why two adjacent loops read the package differently.

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — no path is constructed from the change. The edited predicate performs object-key lookups on already-parsed package.json content; the only filesystem call in `calculateConfidence` is the untouched `fileExists`, which joins a filename taken from the constant `FRAMEWORKS` table, never from user input.
- [x] Sanitize outputs — the returned shape is unchanged (id, name, confidence, defaultPort, devCommand, buildCommand, startCommand from the constant table); no package.json content reaches the output. The security relevance of this slice runs the other way: this detector feeds the security surface, and under-detection SKIPPED that surface for a canonical Create React App. Detecting it is the security fix.
- [x] No secrets in code — none added. The new fixtures contain only public package names and version ranges.
- [x] Safe file operations — every new case writes into a fresh `fs.mkdtempSync` directory under `os.tmpdir()` and removes it in `afterEach`, using the existing `makeProject`/`write`/`writePkg`/`rm` helpers; nothing writes outside the temp directory and no fixture is shared between cases.

### Step 14: VERIFY
- [x] Run lint + type check — `npm run lint` (`eslint . --max-warnings 0`) exited 0 with no output; `npm run typecheck` (tests/typecheck.test.js) exited 0, pass 1 fail 0. Both exit codes were read from an UNPIPED run via `$?`, never through a pipe that could hide the status.
- [x] Run ALL tests (TDD Green) — `npm test` from the repository root: `[CTOC test-gate] PASS`, failed 0, process exit 0. The five Step-8 reds are now green and no previously-passing case turned red.
- [x] Check coverage >= 80% — `[CTOC test-gate] coverage 99.9% (threshold 99%)`, at or above the enforced floor in `.ctoc/coverage-baseline.json`. The floor was not touched.
- [x] 0 skipped, 0 flaky tests — the gate reports `skipped 0`. One flake WAS observed and is recorded honestly rather than papered over: the FIRST full-gate run failed a single case, `tests/compliance-seam-is-executable.test.js` #7, with `spawnSync … ETIMEDOUT` after 188 seconds against that harness's 20-second bound — a starved child process on a machine running at load average 10.8 with a local model server saturating the processor. It was investigated before being dismissed: the compliance seam requires no code this slice touches (a search of `src/lib/compliance-integration.js` and `src/lib/iron-loop-compliance-trigger.js` for `framework-detector` returns nothing), the whole file passes in isolation in 485 ms, and the clean re-run of the full gate passed it. Nothing was retried until it looked green — the gate was run twice, both runs are on record, and the first run's failure was a machine-load artifact in a file unrelated to this change, not a result this slice produced.

### Step 15: DOCUMENT
- [x] Update relevant documentation — the header of tests/remainder-security-tooling-coverage.test.js was corrected exactly as the plan specifies: entry (c) for `framework-detector.js 298-300` now states the CURRENT mechanism (react-cra declares no config files, so it can only outrank react-vite by the react-scripts credit, which is now looked up with the disqualifier's own predicate — dead by construction, before and after), and the FINDING paragraph became a FIXED record naming the two tests that pin the behaviour. The line-54 index entry was left as it is; it remains accurate. Comment text only — a diff filtered to lines not beginning with ` *` is empty.
- [x] Add JSDoc comments to new functions — no function was added. The changed loop carries the replaced explanatory comment stating the presence-not-placement contract, the Create React App consequence, and that the +10 weight is unchanged, so a future reader is told why `packageDevDeps` is looked up with `hasDependency`.
- [x] Update CHANGELOG if needed — not applicable; this repository has no CHANGELOG.md. CLAUDE.md is not among this plan's declared files and was not edited.

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly — test-first order held: the cases were written and run to a recorded RED before any source edit, and the five failures matched the five predicted arithmetic outcomes assertion for assertion. Exactly the four declared files were changed and nothing else; no file outside the declared set was written, so no scope-growth request was needed.
- [x] All quality checks passed — lint 0, typecheck 0, full gate PASS with failed 0, skipped 0, coverage 99.9% against the 99% floor. The reachability and export-reachability fences ran inside that suite and are included in `failed 0`; this slice adds no module and no export, so neither could move.
- [x] Manual verification if needed — the behaviour was re-derived from the source before and after, not merely observed: a canonical Create React App (react, react-dom and react-scripts all in `dependencies`, no config file) returned `null` before the change and now returns `{ id: 'react-cra', confidence: 50, defaultPort: 3000 }`, which is what the new case asserts against a real project on disk.
- [x] Ready for human review — one thing this slice deliberately does NOT do is carried up to the human: the same placement blindness still lives in `hasViteSignal()`, and the react-cra disqualifier body remains unreachable. Both are behaviour changes beyond this plan's single authorised lookup and are the human's to schedule. See the Execution Record below.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

Landed exactly the four declared files, nothing else.

- `src/lib/framework-detector.js` — ONE predicate changed in `calculateConfidence`'s
  `packageDevDeps` loop, `hasDevDependency` → `hasDependency`, and the comment above
  it replaced with the presence-not-placement rationale. Weight, `break`, `checks++`
  and both other loops untouched. `hasDevDependency` kept (still called twice by
  `hasViteSignal`). The react-cra disqualifier untouched.
- `tests/framework-detector.test.js` — one case added (canonical Create React App,
  react-scripts in `dependencies`); the existing devDependencies regression
  strengthened in place with a corrected title and an ADDED `confidence === 50`,
  both original assertions verbatim.
- `tests/framework-detector-coverage.test.js` — one new describe block: the
  per-profile packageDevDeps sweep (vue, svelte, react-vite, remix) plus the green
  guard that a React project with no react-scripts and no Vite signal still returns
  null. That guard's comment states the mechanism honestly — the null comes from the
  react-vite disqualifier, and the case does not claim to cover lines 297-300.
- `tests/remainder-security-tooling-coverage.test.js` — header comment only. No
  assertion, fixture or `test()` touched.

### Carried to the human, not decided here

1. `hasViteSignal()` still reads `devDependencies` only, so a real React + Vite app
   that declares `vite` in `dependencies` and ships no `vite.config.*` file scores 50
   and is then disqualified to null — the same placement blindness, in the gate rather
   than the score. It is a second changed lookup and this plan authorises one. No test
   pins that shape's current null, because such a test would pin the defect and make
   the eventual fix red.
2. The react-cra bundler-evidence guard body is unreachable before AND after this
   change, for the structural reason proved in the plan. This slice does not claim to
   cover it. Making it reachable means reordering the priority walk or deleting the
   guard — both are behaviour changes.

## Verification Evidence

- Step 8 RED, recorded BEFORE any source edit —
  `node --test tests/framework-detector.test.js tests/framework-detector-coverage.test.js tests/remainder-security-tooling-coverage.test.js`:
  tests 64, pass 59, fail 5, skipped 0. Failures and their assertions: canonical
  Create React App `assert.ok(result)` actual `null` expected `true`; vue confidence
  actual 40 expected 50; svelte actual 40 expected 50; react-vite actual 90 expected
  100; remix actual 40 expected 50.
- After the source edit, the same command: tests 64, pass 64, fail 0, skipped 0.
- `npm run lint` (`eslint . --max-warnings 0`) exit 0, no output.
- `npm run typecheck` exit 0, pass 1, fail 0.
- `npm test` (the gated entry point) exit 0:
  `[CTOC test-gate] coverage 99.9% (threshold 99%), skipped 0, failed 0` and
  `[CTOC test-gate] PASS`.
- The gate was run twice. The first run failed one case,
  `tests/compliance-seam-is-executable.test.js` #7, on `spawnSync … ETIMEDOUT` at 188
  seconds against a 20-second harness bound, under load average 10.8. That file passes
  in isolation in 485 ms and requires nothing this slice touches. Both runs are on
  record; nothing was re-run until it looked green.

### Completion refused — blocked on a pre-review validation defect, not on this slice's work

`menu task complete t103` was invoked ONCE and returned
`ok:false, blocked:true`, with a single error:
`File "assert.strictEqual" claimed as created but doesn't exist.` The plan stays in
in-progress, no verify evidence was written, and one kickback is on the circuit
breaker. It was not re-invoked.

The claim is false and nothing in this slice produced it.
`plan-validator.validateNoContradictions` Pattern 1 scans un-masked plan prose for a
file-creation claim, and its capture stops at an open parenthesis. Applied to this
plan's own Test Plan line — `one assertion ADDED: `assert.strictEqual(result.confidence, 50)``,
written by the planner and approved by the human — it captures the JavaScript member
expression `assert.strictEqual` and demands a file by that name.

Neither available workaround is legitimate. That line sits inside the hash-covered
specification region of an approved plan (verified: the current specification digest
still equals the ledger's `content_sha256`, so every edit made during this build is
inside an excluded execution section), so rewording it would break the approval digest
and read as a forgery. `completeExecution`'s `options.force` is an explicit CTO-Chief
escape an executor must never self-authorize.

The defect is general, not local. The same pattern, run over every plan on disk,
misreads a JavaScript member expression as a missing file in ten plans already sitting
in `review/` and `done/` — `d.push`, `d.length`, `this.scannersRun`,
`taskRegistry.findActivePlanTask`, `safeFs.writeFileSync`, `stat.birthtime`,
`-b.created` — so any future plan whose prose names a method is blocked the same way.

The fix belongs in `src/lib/plan-validator.js`, which this plan does not declare. A
scope-growth request was filed rather than the file being edited, and is waiting in the
Inbox questions for the human's decision.
