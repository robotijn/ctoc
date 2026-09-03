---
iron_loop_verdict: true
title: "Replace the README with the verified course draft and derive its guard pins from disk"
type: implementation
iron_loop: true
parent_plan: readme-as-a-course
depends_on: none
priority: medium
effort: low
files:
  - README.md
  - tests/readme-numbers.test.js
  - .ctoc/drafts/README.course.md
approved_by: human
approved_at: 2026-09-03T10:22:49.906Z
gate_crossed: review → done
---

# Replace the README with the verified course draft and derive its guard pins from disk

The only slice of `readme-as-a-course`. `README.md` becomes the verified course draft;
`tests/readme-numbers.test.js` stops pinning five literals that disk already
contradicts and derives them from `computeDocCounts(ROOT)` and a walk of `skills/`
instead. The two are one unit: the test pins the README's numbers, so neither can be
green without the other.

The declared `files:` list is the write permission. Nothing outside those three paths
may be edited — not `CLAUDE.md`, not any other test, not `.ctoc/*` baselines.

## Implementation Details

### Dependency graph

```
.ctoc/drafts/README.course.md  ──copied verbatim──▶  README.md
                                                        │
src/lib/doc-counts.js (computeDocCounts) ──┐            │ read by
skills/**/SKILL.md walk (in-file helper) ──┴──▶ tests/readme-numbers.test.js
                                                        │
.ctoc/drafts/README.course.md  ──deleted last──▶ (gone)
```

No new module, no new export, no import added or removed. `computeDocCounts` is
already imported at line 18 of the test; `countSpecialistSkillBodies()` is already
defined at line 54 of the same file.

### Ground truth, measured on disk on 2026-08-31 (this repository)

| Quantity | Oracle | Measured | Draft states | Current README states |
|---|---|---:|---:|---:|
| skill files (`skills/**/*.md`) | `computeDocCounts(ROOT).skills` | 429 | 429 | 426 |
| specialist bodies (`skills/**/SKILL.md`) | `countSpecialistSkillBodies()` | 101 | 101 | 100 |
| knowledge files (skills − bodies) | derived | 328 | 328 | 326 |
| `src/lib/*.js` modules | `computeDocCounts(ROOT).libModules` | 134 | 134 | 104 |
| `tests/*.test.js` | `computeDocCounts(ROOT).testFiles` | 524 | 524 | (not pinned) |
| `VERSION` | `VERSION` file | 6.14.38 | **6.14.36** | 6.14.38 |

Every row above was read from disk during planning, not recalled. The version row is
the one place the draft is BEHIND the tree — handled in "Version tokens" below.

### File: `README.md`

**Action:** MODIFY (full replacement)
**Purpose:** The repository's front door becomes a course a new human can follow end
to end, instead of a feature inventory with mocked screens and stale counts.

- Replace the entire file with the bytes of `.ctoc/drafts/README.course.md`
  (1,178 lines), verbatim. No hand-editing of prose, no re-wrapping, no reordering —
  the draft is the approved artifact; a partial merge would be a different document
  than the one the human approved.
- Then, and only then, apply the three version-token corrections below.

**Version tokens (the one edit on top of the copy).** The draft was written when
`VERSION` read `6.14.36`; `VERSION` reads `6.14.38` today and may have moved again by
build time. Read `VERSION` at build time and set all three release-managed tokens to
that exact value. These are release-synced tokens (`src/scripts/release.js`
`VERSION_UPDATES`, lines 61–77), not screen captures, so correcting them does not
violate Decision 3 of the parent plan.

| Draft line | Token | Pattern release.js rewrites |
|---:|---|---|
| 9 | `<img alt="Version" src="https://img.shields.io/badge/version-6.14.36-blue">` | `/version-\d+\.\d+\.\d+-blue/g` |
| 1106 | `getVersion()       // → '6.14.36'` | `/getVersion\(\)\s+\/\/\s*→\s*'\d+\.\d+\.\d+'/` |
| 1175 | `**6.14.36** · Built by [@robotijn](https://github.com/robotijn)` | `/^\*\*\d+\.\d+\.\d+\*\*/m` |

All three token SHAPES survive the replacement (verified in the draft at those exact
lines), so `release.js` and `version.syncToReadme()` keep working. Only the digits
change.

**Guard strings the draft already carries** (verified present, so the untouched
assertions in `tests/readme-numbers.test.js` stay green):

- `agents-124-orange` (line 11); `**124 agents** across **24 categories**` (16);
  `**124 agents** across 24 categories` (722); `124 across 24 categories` (1057);
  `**124 agents across 24 categories**` (938); `124 agent definitions across 24 categories` (1133)
- `14 languages` (735); `20 sub-orchestrators` (726); `17 canonical KPIs` (732) and `17 KPIs` (782)
- `3 slash commands` (605, 1123); `17 Claude Code hooks` (1124)
- `saas/b2c-subscription … ready` (794); `saas/b2b-sales-led … ready` (795)
- refinement-loop budget rows `Critical` / `Medium` / `Low` / `Final sweep` (706–709)
- `adversarial review and the four human gates catch what a first pass misses` (16)
- `the session model follows, not a code-enforced hook today` (668, 682)
- all nine required section headings: `## Commands` (603), `## The Iron Loop` (619),
  `## The 3-Tier Agent Architecture` (672), `## The Refinement Loop` (688),
  `## The Canvas — 6-Month Pre-Mortem + 5-Scenario Cash Flow` (741),
  `## The Product Loop` (762), `## SaaS Production-Readiness Templates` (788),
  `## Agents` (936), `## Skills` (980)

**Strings the draft correctly does NOT carry** (the `doesNotMatch` assertions):
`on the first try`, `plan-serial`, `Haiku scouts`, `| **Tier 3** |`, `ctoc:menu`,
and every `ctoc <word>` phantom (`ctoc doctor`, `ctoc validate`,
`ctoc process-issues`) — all four greps returned zero matches in the draft.

### File: `tests/readme-numbers.test.js`

**Action:** MODIFY (six `it` blocks in section 2 + two new module-level constants)
**Purpose:** The README's counts are a claim ABOUT this tree, so the contract comes
from the tree. A literal that disk contradicts is a pin holding a false number in
place.

**(a) Add two disk-derived constants** immediately after the helper block (after the
`countQualityConfigs()` definition ending at line 108, before the
`// 1. Sanity` banner at line 110). `computeDocCounts` is already imported;
`countSpecialistSkillBodies` is a hoisted function declaration, so placement is safe:

```js
// Disk-derived values the README must state. The README's counts are a claim ABOUT
// this tree, so the contract comes from the tree — never from a literal a growing
// project silently falsifies. Read once, used by section 2's pins below.
const counts = computeDocCounts(ROOT);
const skillBodies = countSpecialistSkillBodies();
```

Section 1 keeps its own inline `computeDocCounts(ROOT)` calls unchanged — this slice
touches section 2 only.

**(b) The six pin edits.** Each is quoted exactly as the file reads today. No
assertion is deleted; none is loosened; each keeps matching the same README site.

1. Lines 241–243:
```js
  it('badge: skills-422 (v6.10.3+)', () => {
    assert.match(README, /skills-426-blue/);
  });
```
becomes
```js
  it('badge: skills-<count> (derived from disk)', () => {
    assert.match(README, new RegExp(`skills-${counts.skills}-blue`));
  });
```

2. Lines 257–259:
```js
  it('Key Features: 426 skill files (v6.10.3+)', () => {
    assert.match(README, /\*\*426 skill files\*\*/);
  });
```
becomes
```js
  it('Key Features: skill-file total (derived from disk)', () => {
    assert.match(README, new RegExp(`\\*\\*${counts.skills} skill files\\*\\*`));
  });
```

3. Lines 301–303:
```js
  it('Project structure: 104 JS modules in src/lib', () => {
    assert.match(README, /104 JS modules/);
  });
```
becomes
```js
  it('Project structure: JS modules in src/lib (derived from disk)', () => {
    assert.match(README, new RegExp(`${counts.libModules} JS modules`));
  });
```

4. Lines 309–311:
```js
  it('Project structure: 426 skill files (v6.10.3+)', () => {
    assert.match(README, /426 skill files/);
  });
```
becomes
```js
  it('Project structure: skill files (derived from disk)', () => {
    assert.match(README, new RegExp(`${counts.skills} skill files`));
  });
```

5. Lines 317–319:
```js
  it('Skills intro: 426 skill files (v6.10.3+)', () => {
    assert.match(README, /\*\*426 skill files\*\*/);
  });
```
becomes
```js
  it('Skills intro: skill-file total (derived from disk)', () => {
    assert.match(README, new RegExp(`\\*\\*${counts.skills} skill files\\*\\*`));
  });
```

6. Lines 321–324:
```js
  it('Skills section names two kinds — Tier-2 (99) and Knowledge (322)', () => {
    assert.match(README, /Tier-2 specialist skill bodies \(100\)/);
    assert.match(README, /Knowledge skills \(326\)/);
  });
```
becomes
```js
  it('Skills section names two kinds — specialist bodies and knowledge files (derived from disk)', () => {
    assert.match(README, new RegExp(`Tier-2 specialist skill bodies \\(${skillBodies}\\)`));
    assert.match(README, new RegExp(`Knowledge skills \\(${counts.skills - skillBodies}\\)`));
  });
```

Note the escaping asymmetry, because it is the one place this edit can go quietly
wrong: inside a template literal handed to `new RegExp`, a regex metacharacter needs a
DOUBLE backslash (`\\*`, `\\(`) — a single backslash is consumed by the string
literal and the pattern silently becomes "any character", which is a loosened
assertion wearing the right shape. Verify by running the RED step: if any of the six
passes against the OLD README, its pattern is wrong, not the README.

**(c) Everything else in the file stays.** In particular:

- the agents `124` / categories `24` literals (lines 237–255, 305–307, 313–315) stay
  literal — they are a fixed contract, not a growing tally;
- section 1's sanity checks, section 3's required sections, and section 4's
  instruction-surface truths are untouched;
- the file header comment (lines 1–11) stays; the two-line note it makes about
  reality-versus-README is still accurate.

### File: `.ctoc/drafts/README.course.md`

**Action:** DELETE (last, after the copy is in place and verified)
**Purpose:** The draft's job ends when it becomes the README; leaving it behind
creates a second copy that will drift and that no test guards.

Delete only after `README.md` matches it. Deleting first and failing mid-copy would
destroy the approved artifact — this is the one ordering constraint in the slice.

### Reported, NOT changed here (each is outside the declared write permission)

1. `tests/no-phantom-command-family.test.js` holds `PHANTOM_DEBT_CEILING = 6`
   (CLAUDE.md 2 + README.md 4). The new README carries 0 phantoms, so the measured
   debt drops to 2. The assertion is `debtHits.length <= PHANTOM_DEBT_CEILING`
   (line 136–139), so it stays GREEN with the ceiling at 6 and the test prints the
   honest new total. Ratcheting the constant down to 2 is a real follow-up — a
   shrink-only ceiling left un-ratcheted is slack — but that file is not in `files:`
   and editing it here would be an undeclared write.
2. `CLAUDE.md`'s structure block reads `130 JS modules`, `428 skill files`,
   `518 test files` against a disk of 134 / 429 / 524. Those three lines are
   GENERATED by `release.js` `COUNT_UPDATES` and self-heal on the next release;
   `CLAUDE.md` is not declared here.
3. The parent plan file still carries `type: functional` / `status: functional` in
   frontmatter while sitting in `plans/implementation/`. Left untouched on purpose:
   its frontmatter bytes are what the approval ledger recorded.

## Wiring — the live call sites

Neither artifact is a new module, so there is no new export to reach; both are
already reachable, and the slice must leave them reachable.

| Artifact | Live call site | Root it is reachable from |
|---|---|---|
| `README.md` | rendered by GitHub at the repository root and by the plugin marketplace listing; rewritten by `src/scripts/release.js` `updateVersionInFiles` and by `src/lib/version.js` `syncToReadme()` on every release | `node src/scripts/release.js` (the shipped release command) |
| `tests/readme-numbers.test.js` | run by `src/scripts/test-gate.js` on `npm test` | `npm test` (the Step 14 gate) |

The five OTHER live readers of the real `README.md`, all of which must stay green
(enumerated by grepping `tests/` for `README.md` and keeping only the ones that read
the repository's own file, not a fixture):

| Test | What it reads the README for |
|---|---|
| `tests/no-phantom-command-family.test.js` | `ctoc <word>` phantom debt, shrink-only ceiling |
| `tests/ctoc-start-command.test.js` (case 3) | no shipped file prints the literal `ctoc:menu` |
| `tests/compliance-claims-match-code.test.js` (case 4) | any named regulatory control that is not enforced carries the `NOT ENFORCED` marker |
| `tests/no-tier-3.test.js` (case 5) | no live pointer to a deleted scout agent |
| `tests/version.test.js` | `syncToReadme()` finds the `**X.Y.Z**` token and the badge in the tracked README |

Checked during planning: the draft names no `KNOWN_CONTROLS` identifier (the only
snake_case tokens in it are `depends_on`, `entry_point`, `regulatory_regime`,
`active_profiles`, `dry_run`, `parent_plan`, `on_success`, `on_failure`,
`auto_rollback`, `keep_history`, `when_to_load` and the five product KPI names), and
it contains no `scout`, no `ctoc:menu`, and no phantom `ctoc <word>`.
`src/lib/instruction-gate-words-scan.js` scans `src/commands/*.md` and
`agents/**/*.md` only — `README.md` is not in its surface list, so the gate numbers
the draft keeps in its reference part (parent Decision 2) are not a fence violation.

## Test Plan (TDD-Red first)

**Step 8 writes the pins first, against the OLD README, and every one must be seen
RED.** That is the whole point: each RED proves the pin is now reading disk rather
than restating a literal.

| # | Assertion after the edit | Reads on the OLD README | Verdict |
|---|---|---|---|
| 1 | `skills-429-blue` | `skills-426-blue` | RED |
| 2 | `**429 skill files**` (Key Features) | `**426 skill files**` | RED |
| 3 | `134 JS modules` | `104 JS modules` | RED |
| 4 | `429 skill files` (project structure) | `426 skill files` | RED |
| 5 | `**429 skill files**` (Skills intro) | `**426 skill files**` | RED |
| 6a | `Tier-2 specialist skill bodies (101)` | `… (100)` | RED |
| 6b | `Knowledge skills (328)` | `Knowledge skills (326)` | RED |

Run the one file to see the red: `node --test tests/readme-numbers.test.js`. Expect
6 failing `it` blocks (7 failing assertions). **If any of the six passes before the
README is copied, stop** — either the pattern lost an escape and matches too much, or
disk moved since planning; re-measure with
`node -e "console.log(require('./src/lib/doc-counts').computeDocCounts(process.cwd()))"`
and fix the README text (declared) rather than the assertion.

**Then GREEN after the copy.** With the draft in place all seven pass, because the
draft states 429 (lines 12, 723, 982, 1134), 134 (1126), 101 (986) and 328 (987).

**Regressions to hold green:** the whole rest of `tests/readme-numbers.test.js`
(sections 1, 3, 4) plus the five other README readers listed above. Full-suite
verification is Step 14 — not a per-file run, which cannot see them.

**No test is deleted, skipped, weakened, or given an exemption in this slice.**

## Decisions Taken Under Ambiguity

1. **The version tokens are synced to the live `VERSION` after the copy.** The draft
   says 6.14.36; the tree says 6.14.38. No test fails either way (`syncToReadme`
   rewrites and the suite restores), but a README whose thesis is "every number here
   is true" cannot publish a stale version. These are release-managed tokens, not
   screen captures, so parent Decision 3 does not apply.
2. **The phantom-debt ceiling stays at 6.** The assertion is `<=`, so the drop to 2
   is green and printed. Lowering the constant is correct and is reported as a
   follow-up; doing it here would be an undeclared write to a test outside `files:`.
3. **Section 1 of the guard test is left alone.** It already tracks the generator for
   agents, skills and lib modules; re-pointing its inline `computeDocCounts(ROOT)`
   calls at the new `counts` constant would be churn with no contract change.
4. **The `it` titles lose their version tags rather than gain new numbers.** Three
   titles were already lying (`badge: skills-422` over a 426 regex; `Tier-2 (99) and
   Knowledge (322)` over `(100)`/`(326)`) — a number in a title is a second, unpinned
   copy that drifts. The new titles say the value is derived from disk and carry no
   digits.
5. **The draft is copied whole, not merged.** Any hand-edit at copy time produces a
   document other than the one approved.

## Execution Plan

### Step 8: TEST

- Apply edit (a) — the two module-level constants — and edits (b)1–(b)6 to
  `tests/readme-numbers.test.js`. Do NOT touch `README.md` yet.
- Run `node --test tests/readme-numbers.test.js` and record the output.
- Confirm exactly the six `it` blocks above fail (7 assertions). A pass here is a
  finding, not a bonus: investigate before continuing (see the Test Plan).

### Step 9: PREPARE

- Read `VERSION` and note the exact string for the token sync.
- Re-measure the four counts against disk:
  `node -e "console.log(require('./src/lib/doc-counts').computeDocCounts(process.cwd()))"`
  and count `skills/**/SKILL.md`. Compare with 429 / 134 / 101 / 328 / 524. If any
  moved since planning, the README text is the thing to correct (it is declared), never
  the assertion.
- Confirm `.ctoc/drafts/README.course.md` exists and is 1,178 lines.
- Confirm no other in-flight build is editing `README.md`.

### Step 10: IMPLEMENT

One step, three sub-items, in this order:

1. Replace `README.md` with the bytes of `.ctoc/drafts/README.course.md`, verbatim.
2. Set the three version tokens (badge, `getVersion()` comment, footer line) to the
   `VERSION` value read at Step 9.
3. Delete `.ctoc/drafts/README.course.md` — last, only after 1 and 2 are in place.

### Step 11: REVIEW

- Diff `README.md` against the draft's original bytes: the only differences may be
  the three version digits. Any other difference is an unapproved edit — revert it.
- Re-read the six edited `it` blocks: each still asserts the same README site, each
  still uses `assert.match` (never `assert.ok` on a boolean, which would swallow the
  failure message), and the double-backslash escapes are present in patterns 2, 5 and 6.
- Confirm nothing outside the three declared files changed.

### Step 12: OPTIMIZE

- Nothing to optimize in a document. The only structural question is whether
  `counts` / `skillBodies` should be computed once (they are — module scope, read once
  at load, not per-test). Confirm no helper became dead: `countSpecialistSkillBodies`
  now has two callers (section 1 and the new constant), `countAllSkillMd` keeps its
  section-1 caller. If any helper lost its last caller, that is a finding to report,
  not a deletion to make here.

### Step 13: SECURE

- Confirm no secret, credential, absolute home path, or user name survives in any
  capture in the new `README.md`. Checked during planning against the draft:
  `/Users/`, `/home/`, the maintainer's user name, `sk-`, `ghp_`, `AKIA`, `Bearer `,
  and `api_key` / `api-key` all return zero matches. Re-run the same check on the
  file as written, because the check must be made against the shipped bytes.
- Confirm every URL in the README points at a public GitHub, shields.io, or cited
  public source — no internal host, no token in a query string.
- Confirm the deletion targets exactly `.ctoc/drafts/README.course.md` and nothing
  else under `.ctoc/`.

### Step 14: VERIFY

- Run **`npm test`** — the gated entry point. `node --test tests/*.test.js` alone is
  NOT the gate: it enforces neither the coverage floor nor the zero-skipped rule.
- Required: `# fail 0`, 0 skipped, coverage at or above the floor in
  `.ctoc/coverage-baseline.json` (`minPct`, 99 today).
- Confirm by name that all six README readers pass: `readme-numbers`,
  `no-phantom-command-family` (and read its printed debt line — it should now report
  2), `ctoc-start-command`, `compliance-claims-match-code`, `no-tier-3`, `version`.
- Verify every relative link resolves, read-only, without writing a script file:
  ```
  node -e "const fs=require('fs'),p=require('path');const t=fs.readFileSync('README.md','utf8');const miss=[];for(const m of t.matchAll(/\]\(([^)\s]+)\)/g)){const l=m[1];if(/^(https?:|mailto:|#)/.test(l))continue;const f=l.split('#')[0];if(!f)continue;if(!fs.existsSync(p.join(process.cwd(),f)))miss.push(f);}console.log(miss.length?'MISSING:\n'+miss.join('\n'):'all relative links resolve');"
  ```
  Any miss is fixed in `README.md` (declared), never by removing the check.
- Confirm `.ctoc/drafts/README.course.md` no longer exists.

### Step 15: DOCUMENT

- The README **is** the documentation this slice ships; no other document is written
  or touched. `CLAUDE.md`, `docs/`, and the templates are out of the declared file set.
- Record in this plan, under a `## Verification Evidence` heading appended at build
  time: the `npm test` counts, the measured disk counts used, the `VERSION` string
  written into the three tokens, and the phantom-debt number the fence printed.
- Carry the three reported-not-changed findings (phantom ceiling at 6, `CLAUDE.md`
  count drift, parent frontmatter `type: functional`) into the finish report so they
  are visible rather than lost.

### Step 16: FINAL-REVIEW

- `README.md` equals the draft's bytes except the three version digits; the draft
  file is gone.
- The six pins derive from `computeDocCounts(ROOT)` and `countSpecialistSkillBodies()`;
  no assertion was deleted, loosened, skipped, or exempted.
- Every RED at Step 8 is accounted for and every one is GREEN at Step 14.
- `npm test`: `# fail 0`, 0 skipped, coverage at or above the floor.
- Exactly three files changed, all declared.
- Every acceptance criterion in the parent plan's Gherkin is met, or the gap is named
  in the finish report.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Wrote the pins first: two disk-derived constants (`counts`, `skillBodies`) plus the six pin edits in `tests/readme-numbers.test.js`, README untouched
- [x] Test error conditions — each pattern verified for the double-backslash escape (patterns 2, 5, 6a, 6b) so none silently became "any character"
- [x] Ran `node --test tests/readme-numbers.test.js` and SAW RED: tests 59, pass 53, fail 6, skipped 0. Exactly the six edited `it` blocks failed and nothing else

### Step 9: PREPARE
- [x] No dependency to install (no new import, no new module)
- [x] Re-measured disk: skills 429, libModules 134, testFiles 524, agents 124, SKILL.md bodies 101, knowledge 328 — all equal to the planning measurement
- [x] `VERSION` read at build time: 6.14.38
- [x] Draft present (1177 newline-terminated lines); no other in-progress or todo plan declares `README.md`

### Step 10: IMPLEMENT
- [x] Sub-item 1 — `README.md` replaced with the draft's bytes verbatim
- [x] Sub-item 2 — the three release-managed version tokens set to 6.14.38 (badge line 9, `getVersion()` comment line 1106, footer line 1175). A byte diff against the draft shows exactly those 3 lines differing and nothing else
- [x] Sub-item 3 — `.ctoc/drafts/README.course.md` deleted last, after 1 and 2 were in place
- [x] Wiring unchanged: `release.js` `VERSION_UPDATES` and `version.syncToReadme()` still match all three token shapes (both tests green); the guard test still runs under `npm test`

### Step 11: REVIEW
- [x] Diff against the draft: 3 lines, all version digits — no other edit
- [x] All six edited `it` blocks still use `assert.match` against the same README site; no assertion deleted, loosened, skipped or exempted
- [x] `git status` shows exactly three changed paths, all declared: `README.md` (M), `tests/readme-numbers.test.js` (M), `.ctoc/drafts/README.course.md` (D)

### Step 12: OPTIMIZE
- [x] `counts` / `skillBodies` computed once at module scope, not per test
- [x] No helper lost its last caller — `countSpecialistSkillBodies` now has two callers, every other helper keeps its existing one

### Step 13: SECURE
- [x] Shipped README bytes scanned for `/Users/`, `/home/`, the maintainer's user name, `sk-`, `ghp_`, `AKIA`, `Bearer `, `api_key`/`api-key`: zero real hits (the only `sk-` matches are inside the words "task-shaped", "risk-surface", "risk-tier", "ask-me-questions")
- [x] Every URL host is public: github.com, img.shields.io, code.claude.com, polyformproject.org, diataxis.fr, link.springer.com, sheridan.brown.edu, tll.mit.edu, ncbi.nlm.nih.gov, and `hooks.example.com` inside a configuration example. No token in any query string
- [x] The deletion targeted exactly `.ctoc/drafts/README.course.md`; nothing else under `.ctoc/` was touched

### Step 14: VERIFY
- [x] Ran the gate: `npm test` → `[CTOC test-gate] PASS`, exit 0
- [x] tests 11704, pass 11704, fail 0, skipped 0, todo 0
- [x] coverage 99.05% against the 99% floor in `.ctoc/coverage-baseline.json`
- [x] All six README readers green by name: readme-numbers (59/59), no-phantom-command-family (7/7, printed debt 2 against ceiling 6), ctoc-start-command (7/7), compliance-claims-match-code (10/10), no-tier-3 (5/5), version (61/61); release-script-coverage also green (21/21)
- [x] Every relative link in the new README resolves ("all relative links resolve")
- [x] `.ctoc/drafts/README.course.md` confirmed gone

### Step 15: DOCUMENT
- [x] The README is the documentation this slice ships; no other document written or touched
- [x] Verification evidence recorded below
- [x] The three reported-not-changed findings carried into the finish report

### Step 16: FINAL-REVIEW
- [x] README equals the draft's bytes except the three version digits; the draft is gone
- [x] The six pins derive from `computeDocCounts(ROOT)` and `countSpecialistSkillBodies()`
- [x] Every RED at Step 8 accounted for and GREEN at Step 14
- [x] Exactly three files changed, all declared
- [x] Waiting for the human's OK to call it done

## Verification Evidence

| Item | Value |
|---|---|
| `npm test` | `[CTOC test-gate] PASS` — tests 11704, pass 11704, fail 0, skipped 0, todo 0 |
| Coverage | 99.05% (floor 99%) |
| Corpus claims ledger | verified 3, refuted 0, unverifiable 0 — offline gate PASS |
| Disk counts used | skills 429 · libModules 134 · testFiles 524 · agents 124 · SKILL.md bodies 101 · knowledge 328 |
| `VERSION` written into the three tokens | 6.14.38 |
| Phantom-command debt printed by the fence | 2 (ceiling 6, was 6) |
| Step 8 RED | 59 tests, 6 failed — exactly the six edited blocks |
| Step 14 GREEN (this file alone) | 59 tests, 59 passed |

**One accounting note on the RED.** The plan predicted 7 failing assertions across 6
blocks; the runner reported 6 failures, because the last block's first assertion
(`Tier-2 specialist skill bodies (101)`) throws and its sibling
(`Knowledge skills (328)`) is never reached. The sibling was independently red — the
old README stated `Knowledge skills (326)` — so no predicted red went missing and
none was banked.

## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
