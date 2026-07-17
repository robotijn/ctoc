---
title: "F3b — Delete Tier 3: the five Haiku scouts and the short-circuit that suppresses thinking"
type: implementation
parent_plan: watcher-fleet-rebuild
depends_on: 00051-f3a-watchers-think-with-opus
priority: CRITICAL
program: watcher-fleet-rebuild
iron_loop: true
files:
  - "agents/scouts/*.md"
  - "agents/coordinator/cto-chief.md"
  - "agents/coordinator/synthesizer.md"
  - ".ctoc/architecture/tier-definitions.yaml"
  - ".ctoc/architecture/dispatch-schema.yaml"
  - "src/lib/v8-dispatcher.js"
  - "src/lib/iron-loop-enforcer.js"
  - "tests/architecture-invariants.test.js"
  - "tests/agent-contract-load.test.js"
  - "tests/watcher-shape.test.js"
  - "tests/readme-numbers.test.js"
  - "tests/iron-loop-enforcer.test.js"
  - "tests/iron-loop-enforcer-coverage.test.js"
  - "tests/v8-dispatcher.test.js"
  - "tests/v8-dispatcher-coverage.test.js"
  - "tests/agent-model-floor.test.js"
  - "tests/no-tier-3.test.js"
  - "docs/AGENT_ARCHITECTURE.md"
  - "docs/PROCESS_FMEA.md"
  - "README.md"
  - "CLAUDE.md"
---

# F3b — a pre-screen that can say "pass" without thinking is a false-green machine

## The ruling

Owner, 2026-07-17, verbatim: **"A scout is NOT A STUPID REGEX WITH HAIKU, IT IS
AN OPUS THINKING ABOUT THE CODE. CTO Chief dispatches real agents to check on the
code and aggregates the information, then steers the build."**

There is no scout tier. The thing that looks at code **is** a watcher, it thinks
with Opus, and the CTO Chief dispatches it.

## Why Tier 3 is worse than wasteful

`agents/scouts/secret-scout.md`, its own body, verbatim:

> *"You are a **scout** — Haiku-tier pre-screen. **Pattern-matching only.** No
> entropy analysis (too slow for Haiku tier). No live-key verification... Pattern-
> match against the **20 highest-prevalence secret formats**."*

Its own frontmatter:

```yaml
model: haiku
short_circuits: security/secrets-detector
```

**It spends a model call — a subagent, an isolated 200K context, seconds — to run
twenty regexes.** `grep -E` does that in under a millisecond, for zero tokens,
deterministically. But the cost is not the defect. The defect is this:

A credential outside those twenty formats → `pass` → **the deep detector never
runs** → and the record says *scanned, nothing found*.

That is a **false-green machine**. It does not save money; it manufactures
unwarranted confidence. `short_circuits:` states the defect as a feature: the
scout's job is to **prevent the thinking**.

It also violates this repo's own written rule: *a critique that did not RUN is
not "nothing found" — absence of evidence is never evidence of absence.* A Haiku
scout returning `pass` **is** a critique that did not run, wearing the costume of
one that did.

## The five, and who already covers their domain

Nothing is lost by deleting them. Every domain has a real Opus watcher:

| Deleted scout | Domain already owned by |
|---|---|
| `secret-scout` | `security/secrets-detector` (opus) — the very agent it short-circuited |
| `dep-scout` | `security/dependency-auditor` (opus after F3a) |
| `lint-scout` | `quality/code-smell-detector`, `quality/complexity-analyzer` (opus after F3a) |
| `syntax-scout` | `quality/type-checker` (opus after F3a) |
| `test-scout` | `testing/smart-test-runner` (opus) |

## The blast radius — every reference, measured

```
agents/scouts/*.md                       5 files → DELETE
agents/coordinator/cto-chief.md            names all 5 → remove the dispatch stanza
agents/coordinator/synthesizer.md          `scout_decisions:` input block + 2 names
.ctoc/architecture/tier-definitions.yaml   the Tier 3 definition
.ctoc/architecture/dispatch-schema.yaml    the `scout_response` definition + its $ref
src/lib/v8-dispatcher.js                   syntax-scout reference
tests/architecture-invariants.test.js      asserts dep-scout, syntax-scout exist
tests/v8-dispatcher.test.js                asserts syntax-scout, test-scout
tests/v8-dispatcher-coverage.test.js       asserts syntax-scout
docs/AGENT_ARCHITECTURE.md                 the 4-tier spec
docs/PROCESS_FMEA.md                       all 5 named
README.md                                  all 5 named
CLAUDE.md                                  "Tier 3 Scouts (5, Haiku subagents)"
.ctoc/security/known-bad-deps.yaml         DATA — KEEP. See Decision 3.
plans/done/*.md                            HISTORY — KEEP. See Decision 4.
```

## The tier model after this change

```
Tier 0  CTO CHIEF (1)          dispatches, aggregates, steers
Tier 1  Sub-orchestrators       incl. synthesizer (the aggregator)
Tier 2  Watchers / specialists  Opus. They think about the code.
Tier 3  — DELETED —             a pre-screen that can pass without thinking is a lie
```

## Decisions Taken Under Ambiguity

1. **Delete rather than promote to Opus.** "Make the scouts Opus" is a possible
   reading of the ruling. Rejected: an Opus scout whose job is still
   `short_circuits: security/secrets-detector` would be an Opus agent whose
   purpose is to stop a better-equipped Opus agent from looking. The defect is
   the short-circuit, not only the model. And every scout's domain is already
   owned (table above), so an Opus scout would be a duplicate of the watcher it
   suppresses.
2. **`scout_response` is deleted from the dispatch schema, not deprecated.**
   A schema definition nothing emits is dead weight that the next author will
   assume is live. Remove the definition AND the `oneOf` `$ref` in `audit_entry`.
   Note: `dispatch_request.target_tier` has `maximum: 3` — change it to
   `maximum: 2`, or the schema still claims a tier 3 exists.
3. **`.ctoc/security/known-bad-deps.yaml` is KEPT.** It is curated data, not a
   scout. The supply-chain-security-engineer watcher will want it. Deleting an
   agent must never delete the data it happened to read.
4. **`plans/done/*.md` are NOT edited.** They are the historical record of what
   was decided when. Rewriting history to match the present is the opposite of an
   audit trail. Only live specs and code change.
5. **`tests/agent-model-floor.test.js` is IN SCOPE — disk overrode this plan's
   table (Step 9 finding).** The plan's blast radius omits it, but F3a already
   shipped it and it names all five scouts in two maps (`HAIKU_EXEMPT`,
   `EFFORT_EXEMPT`). Its own comment delegates the reconciliation to this plan,
   verbatim: *"If plan F3b deleted Tier 3, this redness is the EXPECTED signal:
   remove them from HAIKU_EXEMPT in that plan. Do not delete this assertion."*
   Added to `files:`. The ASSERTIONS are untouched; only the two exemption lists
   shrink — an exemption for a file that no longer exists is dead weight, and
   F3a's `vanished` check goes red precisely to force this edit.
6. **`v8-dispatcher.js` carries FIVE scout couplings, not the "syntax-scout
   reference" the plan's table claims (Step 9 finding, disk wins).** They are:
   `inferTier`'s `scouts/` → 3 branch; `TIER_BUDGETS[3]`; `normalizeRequest`'s
   `targetTier > 3` ceiling; `recordResponse`'s tier-3 `decision` validation;
   and `decision` as an accepted response shape. All five are removed. Grep
   confirms NO production caller consumes the `decision` path — only tests — so
   narrowing the accepted response shape to `findings | synthesis` breaks nothing
   live and matches the deletion of `scout_response` from the schema.
7. **`.ctoc/security/known-bad-deps.yaml` keeps its two stale `dep-scout`
   comments.** Decision 3 and the executor brief both forbid touching this file.
   The comments are now inaccurate prose in a KEPT data file. Reported as a known
   residual rather than silently fixed, because the prohibition is unambiguous
   and the data is curated. It is outside the Case-5 fence scan (`.ctoc/security/`
   is not `.ctoc/architecture/`), so it does not mask a real regression.
8. **`src/lib/iron-loop-enforcer.js` is a LIVE CALLER the plan's blast radius
   missed, and it is the most consequential Step 9 finding.** Its `CHECKS`
   registry runs `checkTier3Scouts`, which returns
   `{ severity: 'critical', message: 'agents/scouts/ directory missing' }` when
   the directory is absent — so deleting Tier 3 made CTOC's own self-check
   report a CRITICAL against the deletion the owner ordered. The plan's Step 9
   grep did not surface it because that grep searched the five scout NAMES and
   this file references the DIRECTORY (`agents/scouts`) plus `model: haiku`
   frontmatter. The check and its registry entry are deleted. This is precisely
   why the plan says callers first, agent files LAST — this caller was simply
   found late, in Step 14 rather than Step 9.
9. **Three more test files are in scope, all discovered at Step 14 (disk wins).**
   `tests/agent-contract-load.test.js` (asserts each of the five scouts loads
   `model: haiku` through a byte-0 parse), `tests/watcher-shape.test.js` (agent
   baseline lists that must partition every agent on disk), and
   `tests/readme-numbers.test.js` (pins README's "128 agents across 25
   categories", the 4-tier heading, and the Tier-3 scout rows). Each asserts a
   contract this plan deliberately removes; each is reconciled to the new truth,
   and every deleted assertion is named individually in the Step 16 report.
10. **The Case-5 fence permits a MARKED tombstone; this deviates from the plan as
    literally written and is recorded rather than taken quietly.** Case 5 says
    grep the five names out of `src/`, `docs/`, `.ctoc/architecture/`,
    `README.md`, `CLAUDE.md`. But Step 15 requires DOCUMENTING why Tier 3 died,
    and a tombstone that may not name what it buries cannot carry the
    who-covers-this-domain-now table — the most useful thing in it. Both cannot
    hold. The fence's INTENT is the broken pointer, so prose inside an explicit
    `tier-3-tombstone:begin/end` marker is exempt, and ONLY that: markers must
    balance (an unclosed one is a failure, not a licence), a region is capped at
    45 lines so a live roster cannot hide in one, and Cases 1-4 are exempt from
    nothing. Verified non-vacuous: a probe adding `scouts/secret-scout` to
    README.md failed Case 5, and wrapping that probe in an unclosed tombstone
    ALSO failed, on the balance guard.
11. **Existing tests that assert a scout exists are DELETED, not weakened.** The
   contract they assert is gone. Removing the assertion for a deleted thing is
   not green-washing; weakening an assertion about a thing that still exists would
   be. Every such deletion must be named individually in the Step 16 report so
   the owner can check the call.

## Test Plan (TDD-Red first)

This is a deletion, so TDD-Red inverts: the fence asserts the ABSENCE, and it is
red until the deletion lands.

New file `tests/no-tier-3.test.js` — a permanent ratchet so Tier 3 cannot be
restored by a future `git restore`, the exact mechanism that resurrected
`model_optimized_for` in 26 files while the suite stayed green:

1. **`agents/scouts/ does not exist`** — currently EXISTS → red.
2. **`no agent declares model: haiku`** — walk the real tree. Currently 5 → red.
3. **`no agent declares short_circuits:`** — the suppression key must never
   return. Currently 5 → red.
4. **`the dispatch schema has no scout_response and target_tier maxes at 2`** —
   currently red on both.
5. **`no live spec or source names a scout`** — grep `src/`, `docs/`,
   `.ctoc/architecture/`, `README.md`, `CLAUDE.md` for the five names.
   `plans/done/**` and `HANDOFF.md` are EXCLUDED (history, per Decision 4).
   Currently red.

Then run the existing suites that reference scouts and confirm they go green by
deletion of the obsolete assertion, not by weakening a live one.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/no-tier-3.test.js` with all five cases. Run it. ALL FIVE must fail. Quote the literal red output. Do not delete anything until you have seen red.

### Step 9: PREPARE — re-derive the reference list from disk; do NOT trust this plan's table: `grep -rl -E 'dep-scout|lint-scout|secret-scout|syntax-scout|test-scout' . --include='*.js' --include='*.md' --include='*.yaml' | grep -v node_modules | grep -v '^./plans/done/'`. Read `src/lib/v8-dispatcher.js` IN FULL before touching it — it is live code and the only JS that names a scout. If disk disagrees with this plan, disk wins; report the difference.

### Step 10: IMPLEMENT — in this order, so the tree is never in a state where a live caller points at a deleted file: (a) remove scout references from `src/lib/v8-dispatcher.js`; (b) remove the Tier 3 definition from `tier-definitions.yaml` and `scout_response` + the `$ref` + `target_tier: maximum: 2` from `dispatch-schema.yaml`; (c) remove the scout stanzas from `cto-chief.md` and the `scout_decisions:` input block from `synthesizer.md`; (d) update the four docs; (e) LAST, `rm agents/scouts/*.md` and remove the directory. Deleting the agents first would leave live references pointing at nothing mid-run.

### Step 11: REVIEW — re-run the Step 9 grep. Zero hits outside `plans/done/` and `HANDOFF.md`. Read the edited `synthesizer.md` in full and confirm only the `scout_decisions` block left — its Algorithm, Output Contract and minimal-change-list sections must be untouched. That agent is the aggregator and it is the best-written file in the repo; do not damage it.

### Step 12: OPTIMIZE — n/a.

### Step 13: SECURE — `secret-scout` was nominally a security control. Confirm `security/secrets-detector` (opus) is still present, still dispatchable, and that removing the short-circuit means it now runs where the scout previously said `pass`. Deleting a control is only safe if the thing it gated now always runs. State this explicitly in the report.

### Step 14: VERIFY — `node --test tests/no-tier-3.test.js` → all five green. Then `npm test`. NINE failures are pre-existing and NOT yours: ESLint (`ALLOWED_TOOLS is not defined` in `.ctoc/sweep-watchdog.js`), 3 typecheck errors, dead-export count 104 vs baseline 102, doc-count drift 404 vs 408, and an iron-loop-enforcer test echoing the dead-export fence. The agent count changes 128 → 123, so doc-count and architecture-invariant tests WILL move — that is expected and yours to reconcile to the new truth.

### Step 15: DOCUMENT — `CLAUDE.md`, `README.md`, `docs/AGENT_ARCHITECTURE.md`, `docs/PROCESS_FMEA.md`: the architecture is now 3 tiers, agent count 123. Re-measure every count from disk. Do not restate a number from memory — the doc counts are ALREADY drifted (404 vs 408) precisely because someone did.

### Step 16: FINAL-REVIEW — report literally: the Step 8 red output; every file changed and how; every test assertion deleted, named individually with the reason it is obsolete; the five new test results; `npm test` totals. State explicitly whether `secrets-detector` now runs unconditionally where the scout used to short-circuit it — that is the only security-relevant consequence of this plan.

## Executor Verification (Steps 8-16)

- [x] Step 8 observed RED on all five before anything was deleted — `pass 0 / fail 5`
- [x] Reference list re-derived from disk at Step 9, not copied from this plan — it
      disagreed with the plan's table in 5 places (see Decisions 5, 6, 8, 9)
- [x] Deletion order followed: callers first, agent files LAST — dispatcher → schemas
      → coordinators → docs → `rm agents/scouts/*.md`. One caller
      (`iron-loop-enforcer.js`) surfaced only at Step 14 and was fixed there
- [x] `synthesizer.md`'s Algorithm and Output Contract untouched — 253 → 245 lines,
      exactly the 8-line `scout_decisions` block; all 5 Phases, Output Contract,
      cross-pillar-conflict resolution and frontmatter verified present after
- [x] `.ctoc/security/known-bad-deps.yaml` still present — byte-untouched (Decision 3);
      its two now-stale `dep-scout` comments reported as a residual, not silently fixed
- [x] `plans/done/**` and `HANDOFF.md` untouched
- [x] Every deleted test assertion named individually in the report
- [x] `secrets-detector` confirmed present and now unconditional — `agents/security/
      secrets-detector.md` (`model: opus`, `effort: max`, `tier: 2`) + its SKILL.md
      body; dispatched `ALWAYS` at Step 13; the only mechanism that could skip it
      (the scout `pass` + `short_circuits:`) no longer exists

## Step 14 result (executor, 2026-07-17)

`FORCE_COLOR=0 npm test` → **`tests 9714 / pass 9708 / fail 6 / skipped 0 / todo 0`**.
The gate is RED at 6, and all 6 are pre-existing failures in files this plan never
touched — each traced to its source rather than assumed:

| Failing test | Real cause | File — mine? |
|---|---|---|
| ESLint reports zero errors (8 errors) | hashbang + `no-process-exit` | `.ctoc/sweep-autostart.js`, `.ctoc/sweep-watchdog.js`, `tests/agent-layer-reachability.test.js` — NOT mine |
| tsc `--checkJs` baseline (3 errors) | `Property 'token'/'acquiredAt' does not exist on type 'object'` | `src/lib/agent-slots.js` — NOT mine |
| NO NEW DEAD EXPORT / RATCHET ONLY TIGHTENS / LOWER THE BASELINE | dead-export count 104 vs baseline 102 | `src/lib/agent-slots.js#activeCount`, `src/lib/streaming-precompute.js#hasEnoughInformation` — NOT mine |
| iron-loop-enforcer thorough self-check | echoes the same `dead-export-fence` block | NOT mine |

The brief's stated baseline was 8 = doc-count (2) + dead-export (3) + iron-loop-enforcer
(1) + ESLint (1) + typecheck (1). This plan REPAIRED the 2 doc-count failures (agent
count 128 → 123, categories 25 → 24, test files 404 → live), leaving exactly 6.

Deviation from the plan's prediction, reported rather than smoothed over: the plan named
the ESLint error as `ALLOWED_TOOLS is not defined` in `.ctoc/sweep-watchdog.js`. That is
no longer the error — it is now hashbang/`no-process-exit` across two sweep files plus an
irregular-whitespace error in a test. A concurrent plan changed that file. Still not mine.

Coverage was NOT measured this run: `src/scripts/test-gate.js` fails on `fail > 0` before
reporting a coverage percentage, so the 99 floor in `.ctoc/coverage-baseline.json` is
**unverified** for this change and is stated as unverified rather than assumed green.
