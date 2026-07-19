---
approved_by: human
approved_at: 2026-07-19T21:33:26.659Z
gate_crossed: implementation → todo
---

---
title: "The verification verdict is enforced offline on every build, so a scheduled check nobody watches becomes a build failure"
type: implementation
parent_plan: corpus-claim-verification
depends_on: 00136-a-cited-source-is-fetched-and-reports-three-states
blocks: 00138-the-corpus-verification-verdict-reaches-a-human
priority: HIGH
program: corpus-quality
iron_loop: true
files:
  - "src/lib/claim-ledger.js"
  - "tests/claim-ledger-gate.test.js"
  - ".ctoc/verification/claims-ledger.json"
---

# The verification verdict is enforced offline on every build

> Design derivations live in
> `plans/implementation/00135-guides-declare-their-checkable-claims-and-the-corpus-reports-how-many-it-has.md`.
> The three-state fetcher is
> `plans/implementation/00136-a-cited-source-is-fetched-and-reports-three-states.md`.

## The ruling: gated versus scheduled

The dilemma was posed exactly right and both horns are real.

> *A network fetch inside `npm test` makes every build depend on the open
> internet, which is its own failure mode. But a check that only runs "sometimes"
> is a check nobody sees fail. Where does the verdict live so a human actually
> meets it?*

**The ruling — the fetch is scheduled, the VERDICT is gated.**

| | Network | Runs |
|---|---|---|
| `src/scripts/verify-claims.js` (`00136`) | **yes** | on a schedule, and on demand |
| the gate in this slice | **none** | **every `npm test`** |

`verify-claims.js` writes a ledger. `npm test` reads that ledger **off disk, with
no network**, and fails the build when:

1. the ledger is **missing, corrupt, or malformed** — it refuses rather than
   defaulting;
2. **any claim's verdict is `REFUTED`**;
3. the ledger is **older than the staleness horizon** — so a scheduled job that
   silently stopped running becomes a loud build failure;
4. the ledger's claim set has **drifted** from the claims extractable from the
   corpus on disk — so a claim cannot be added, or an expected value edited,
   without a verdict.

**This is the answer to "a check nobody sees fail".** The network check runs on a
schedule; its verdict is enforced offline, on every single build, at the gate a
human already meets. The build never touches the internet, and the temptation to
write `if (networkFailed) pass` never arises — because the gate has no network
branch to write.

**Rule 3 is what makes the whole thing honest.** Without it, a scheduler that dies
leaves a permanently-green ledger and the mechanism becomes decorative within
weeks. With it, a dead scheduler is indistinguishable from a broken build, which
is correct: both mean nobody is checking.

**The cost, stated rather than waved through: a refutation is discovered up to one
staleness horizon late.** A version can move the day after a scheduled run and the
gate stays green until the horizon expires. That is the price of not putting the
network in the build, and it is the right trade — a corpus fact going stale for a
day is an ordinary risk, while a build that fails when a registry has an outage is
a build people learn to re-run until it passes, which destroys every gate in the
suite by teaching that red is noise.

## How an unreachable source reports, at the gate

`00136` produces three states per claim. The gate must not collapse them, and it
must not treat a transient outage as a finding. Three candidate policies for
`UNVERIFIABLE`:

| Policy | Verdict |
|---|---|
| (a) fail the build immediately | **Rejected.** One network blip during a scheduled run breaks every subsequent build. This is how a gate gets disabled. |
| (b) pass silently | **Rejected — this is the defect.** It is the check reporting a verdict on input it never received. |
| (c) **retain the last known verdict; do not advance `lastVerifiedAt`** | **Chosen.** |

Under (c), an `UNVERIFIABLE` claim **keeps its previous verdict**, but its
`lastVerifiedAt` **does not move**. The staleness horizon then does the work: a
transient outage is absorbed (one failed fetch is genuinely not a finding), while
a **persistently** unreachable source ages past the horizon and becomes a build
failure. Transient and permanent are separated by time, not by a guess, and at no
point does anything report "verified" about a page never fetched — because
`lastVerifiedAt` is the honest field and it is what the gate reads.

This is the same shape as `src/lib/stale-detector.js`'s `inconclusive`: a
degraded signal is neither a pass nor a finding, it is a named third thing that a
downstream rule handles explicitly.

## Implementation Details

### Dependency Graph

```
src/lib/claim-extractor.js (00135) ──┐
                                      ├──▶ src/lib/claim-ledger.js (CREATE)
src/lib/claim-fetcher.js   (00136) ──┘              ▲          ▲
   (type-only; no runtime require)                  │          │
                                   tests/claim-ledger-gate.test.js   src/scripts/verify-claims.js
                                            │                          (writes; modified in 00136)
                                            ▼
                              .ctoc/verification/claims-ledger.json (CREATE)
```

**`claim-ledger.js` must not require `claim-fetcher.js`.** The gate is the
offline half; a runtime require would put a module containing `fetch` into the
`npm test` load graph. The claim-verdict shape crosses the boundary as a JSDoc
typedef only. **Enforced by a test case** (case 15), not by intention.

### File: `src/lib/claim-ledger.js`
**Action:** CREATE
**Purpose:** Read the verification ledger and decide, with no network, whether the corpus verdict is trustworthy and clean.

#### Exports

- `readLedger(root) → {ok, ledger, problem}`
  - **Absent and unreadable are DIFFERENT facts and are reported differently** —
    the exact distinction `plans/review/00098-the-coverage-floor-stops-silently-dropping-to-80.md`
    established for the coverage floor, applied unchanged:
    - **ABSENT** ⇒ a legitimate state on a project that has never run the
      verifier. `{ ok: false, problem: 'absent' }`. Whether that fails the build
      is the caller's policy, and it is **announced**, never silent.
    - **PRESENT but unreadable / unparseable / wrong-shaped** ⇒ **REFUSE**.
      `{ ok: false, problem: 'corrupt' }`. A corrupt ledger is a broken
      instrument, not permission to pass.
  - **No path returns a clean verdict it did not read.** Mirrors the `null`-not-`0`
    discipline in `src/scripts/test-gate.js`.

- `gateLedger(root, corpusClaims, opts?) → GateResult`
  - `{ pass, failures: GateFailure[], summary }` where `summary` always carries
    `{ verified, refuted, unverifiable, stalest, claimCount }` — **all of them,
    including the zeros**, so `unverifiable` is structurally impossible to omit
    from a report.
  - Applies the four rules above. Each failure is a `GateFailure` with a
    closed-enum `kind`: `ledger-absent` \| `ledger-corrupt` \| `refuted` \|
    `stale` \| `drift-unverified` \| `drift-orphan`.
  - **Pure and offline.** No network, no subprocess, no writes. Given the same
    ledger and corpus it returns the same result — so it is fully testable from
    fixtures.

#### Ledger shape

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-19T10:00:00.000Z",
  "generator": "src/scripts/verify-claims.js",
  "claims": {
    "skills/frameworks/data/duckdb.md#duckdb-python-version": {
      "kind": "registry-version",
      "state": "VERIFIED",
      "reason": null,
      "expectedHash": "…",
      "lastVerifiedAt": "2026-07-19T10:00:00.000Z",
      "lastAttemptAt": "2026-07-19T10:00:00.000Z",
      "lastAttemptState": "VERIFIED"
    }
  }
}
```

- **`lastVerifiedAt` versus `lastAttemptAt` is the load-bearing pair.** An
  `UNVERIFIABLE` attempt advances `lastAttemptAt` only. The horizon is measured
  against `lastVerifiedAt`. A claim that has been *attempted* every hour for a
  week and *verified* none of those times is stale, and the gate says so.
- **`expectedHash`** is a hash of the claim's `expect` + `source` + `select`. If a
  guide's expected value is edited, the hash changes and the ledger entry no
  longer matches the corpus claim ⇒ `drift-unverified`. **This is what stops
  someone editing a version number in a guide to silence a refutation** — the
  edited claim is simply unverified, and unverified fails.
- `drift-orphan` is the reverse: a ledger entry with no corresponding corpus
  claim. Reported, but **not** build-failing (a deleted guide legitimately orphans
  entries; the verifier prunes them on its next run).

#### The staleness horizon

`STALENESS_HORIZON_MS`, default **7 days**, read from
`.ctoc/verification/claims-ledger.json`'s own `horizonDays` when present so the
policy travels with the ledger.

**Invariant, asserted by case 13:** `CACHE_TTL_MS` (`00136`) **<**
`STALENESS_HORIZON_MS`. If the cache could outlive the horizon, a stale cache
would keep the ledger fresh with no live contact — the exact substitution being
fenced. **This is a test, not a comment.**

### File: `tests/claim-ledger-gate.test.js`
**Action:** CREATE
**Purpose:** The gate's specification, including every path that could make it pass on input it never received.

| # | Case | Assertion |
|---|---|---|
| 1 | clean, fresh, complete ledger ⇒ `pass: true` | |
| 2 | **one `REFUTED` claim ⇒ `pass: false`, kind `refuted`** | names the claim id and the guide path |
| 3 | **ledger ABSENT ⇒ `pass: false`, kind `ledger-absent`, ANNOUNCED** | and it must not throw |
| 4 | **ledger CORRUPT (`{not json`) ⇒ REFUSES** | kind `ledger-corrupt`; it must **not** return a passing result |
| 5 | **ledger present but wrong shape (`claims` is an array) ⇒ REFUSES** | the subtle one, and the likeliest in practice |
| 6 | **`lastVerifiedAt` older than the horizon ⇒ `pass: false`, kind `stale`** | **the dead-scheduler case** |
| 7 | **`UNVERIFIABLE` attempt retains the prior verdict and does NOT advance `lastVerifiedAt`** | policy (c), asserted directly on the data |
| 8 | **a claim `UNVERIFIABLE` since before the horizon ⇒ `stale`** | permanent unreachability becomes loud on a clock |
| 9 | a claim `UNVERIFIABLE` once but verified inside the horizon ⇒ `pass: true` | a transient blip is absorbed |
| 10 | **corpus claim with no ledger entry ⇒ `drift-unverified`, build FAILS** | a new claim cannot be added unverified |
| 11 | **edited `expect` ⇒ hash mismatch ⇒ `drift-unverified`, build FAILS** | editing a guide cannot silence a refutation |
| 12 | ledger entry with no corpus claim ⇒ `drift-orphan`, reported, **does not fail** | |
| 13 | **`CACHE_TTL_MS < STALENESS_HORIZON_MS`** | read both constants from their real modules; the inequality is the anti-false-green property |
| 14 | `summary` always carries all of verified/refuted/unverifiable, including zeros | shape assertion — a zero cannot be omitted |
| 15 | **`require('src/lib/claim-ledger.js')` does not pull `claim-fetcher.js` into the module graph** | inspect `require.cache` after a clean load; **the gated suite must have no network module loaded** |
| 16 | **the whole gated suite performs zero network calls** | run with `fetch`/`http.request`/`https.request` monkey-patched to throw, assert the suite still passes |

Fixtures under `os.tmpdir()`, removed in `finally`. Time is injected
(`nowMs` option), **never** manipulated with `utimes` — the injection seam
precedent is `src/lib/stale-detector.js:874`.

### File: `.ctoc/verification/claims-ledger.json`
**Action:** CREATE
**Purpose:** The committed verdict — the artifact that lets an offline gate know what a networked check found.

Seeded by running `src/scripts/verify-claims.js` at Step 10 against the guides
annotated in `00136`. **Committed deliberately**, so the verdict travels with the
repository and a fresh clone's first `npm test` enforces a real one. The cache
under `.ctoc/verification/cache/` is git-ignored; the ledger is not.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `gateLedger` | `tests/claim-ledger-gate.test.js` cases 1-12 | **`npm test`** — the gated entry point |
| `readLedger` | called by `gateLedger`; and by `src/scripts/verify-claims.js` for merge-on-write | `npm test`, and the runner |
| the ledger file | read by the gate on every build; written by the scheduled runner | both roots |

The gate's verdict is the product, reached on every `npm test` — the same wiring
shape `CLAUDE.md` records for `src/lib/false-green-scan.js` ↔
`tests/false-green-fence.test.js`. `00138` additionally puts the summary on the
menu so a human meets it without running the suite.

## Test Plan

Covered by `tests/claim-ledger-gate.test.js`. Load-bearing cases: **4 and 5** (a
corrupt or wrong-shaped ledger must refuse, never pass — the defect
`plans/review/00098-…` removed from the coverage floor, which would otherwise
reappear here verbatim), **6 and 8** (the dead scheduler and the permanently dead
source both become loud on a clock), **11** (an edit cannot silence a refutation),
and **15 and 16** (the gated suite genuinely has no network).

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] Write `tests/claim-ledger-gate.test.js` in FULL and run ONLY that file before the module exists. Record TDD-RED verbatim.
- [ ] **Prove the horizon bites:** build a fixture ledger dated one day inside the horizon (passes) and one day outside (fails), and record both outputs. A horizon never observed failing is not a horizon.
- [ ] **Prove case 16 before implementing anything else in this slice** — monkey-patch the network primitives to throw and run the existing suite. If it already fails, that is a finding about the current tree and must be reported, not worked around.

### Step 9: PREPARE
- [ ] Read from disk: `src/scripts/test-gate.js:180-260` — `resolveThreshold`'s absent-versus-corrupt split, and the `null`-never-`0` parsers. **This module copies that discipline; read the real implementation, not this plan's description of it.**
- [ ] Read `plans/review/00098-the-coverage-floor-stops-silently-dropping-to-80.md` Decisions 1, 2 and 10 — particularly Decision 10, where announcing a default from inside a library leaked a false alarm into the gate's own report. **The announcement belongs to the reporter, not the library.**
- [ ] Read `src/lib/stale-detector.js:644-734` (`classifyStaleCandidate`) — the pure, total, degrade-never-throw classifier this gate mirrors.
- [ ] Read the constants `CACHE_TTL_MS` (`00136`) and confirm the horizon inequality holds at the real values. **If the code disagrees with this plan, THE CODE WINS.**

### Step 10: IMPLEMENT
- [ ] `src/lib/claim-ledger.js` — `readLedger` (absent ≠ corrupt), `gateLedger` (four rules, closed-enum failures, complete summary), `STALENESS_HORIZON_MS`.
- [ ] `tests/claim-ledger-gate.test.js` — the sixteen cases.
- [ ] `.ctoc/verification/claims-ledger.json` — seeded by a real run of `verify-claims.js`.
- [ ] `src/scripts/verify-claims.js` — merge-on-write so an `UNVERIFIABLE` attempt retains the prior verdict and advances only `lastAttemptAt`. **This is a modification to a file created in `00136` and is the reason this slice depends on it.**

### Step 11: REVIEW
- [ ] No path in `readLedger` or `gateLedger` returns `pass: true` on input it did not fully read.
- [ ] `absent` and `corrupt` are genuinely distinct at their branch, and neither silently substitutes a passing verdict.
- [ ] The summary object cannot be constructed without `unverifiable` — confirm structurally, not by convention.
- [ ] Confirm the announcement of an absent ledger is emitted by the **reporter**, not written to stdout from inside the library (`00098` Decision 10 — the mistake to not repeat).
- [ ] Report whether any OTHER gate in this repository reads a committed artifact, and for each whether it fails loud on unreadable input. That column is this slice's finding to look for elsewhere.

### Step 12: OPTIMIZE
- [ ] One read of the ledger per gate invocation; the corpus claim extraction is already performed by `00135`'s census — reuse it, do not re-walk `skills/`.
- [ ] The gate must be fast enough to run on every build: assert its wall time on the real corpus and report the number.

### Step 13: SECURE
- [ ] Failure messages name **repository-relative** paths, never absolute (no user name on a report).
- [ ] Ledger contents are never echoed on a parse failure — only the closed-enum problem and the offending key name, capped at 32 characters (`00098` Step 13).
- [ ] Ledger read is size-gated before the read (`src/lib/stale-detector.js:770-795`).
- [ ] `JSON.parse` result is shape-validated before any property walk; `claims` must be a non-array object, and keys are read with `hasOwnProperty`.
- [ ] Fixtures under `os.tmpdir()`; the real ledger is never written by a test.

### Step 14: VERIFY
- [ ] `node --test tests/claim-ledger-gate.test.js` green.
- [ ] **`npm test` with the network disabled — must pass unchanged.** Report verbatim. This is the central claim of this slice and the one a reviewer should check first.
- [ ] Full gated run `npm test`; report verbatim counts and the coverage line.
- [ ] Lint `--max-warnings 0`; typecheck clean.
- [ ] **Deliberately corrupt a copy of the ledger and confirm the gate REFUSES**, printing the reason. Record the output. Restore.
- [ ] **Deliberately backdate a copy past the horizon and confirm the gate fails `stale`.** Record. Restore.
- [ ] `src/lib/false-green-scan.js` count reported before and after.

### Step 15: DOCUMENT
- [ ] Record the gated-versus-scheduled ruling in `CLAUDE.md` in one short paragraph: the fetch is scheduled, the verdict is gated, the gated suite touches no network, a dead scheduler is a build failure.
- [ ] Document the horizon and the `CACHE_TTL_MS < STALENESS_HORIZON_MS` invariant next to it.
- [ ] Update documented test-file and module counts in both places, read live from disk.

### Step 16: FINAL-REVIEW
- [ ] Report: files, tests, Step 8 red verbatim, the network-disabled run, the deliberately-corrupted and deliberately-backdated gate outputs, the Step 11 inventory of other artifact-reading gates, and every decision taken under ambiguity.
- [ ] Ready for human review at Gate 3.

---

## What this slice does NOT fix

1. **Nothing schedules the verifier yet.** Until `00138`, a human must run
   `verify-claims.js`, and the horizon will fail the build if they forget. **That
   is the intended behaviour, but it means this slice can break the build if
   `00138` is not scheduled promptly** — named here so it is a decision, not a
   surprise. Set `horizonDays` generously on the seeded ledger until the schedule
   exists (Decision 5).
2. **A refutation is still discovered up to one horizon late.** The stated cost of
   keeping the network out of the build.
3. **The gate cannot tell a correct guide from a well-cited wrong one.** It
   verifies that declared claims match their declared sources. A guide that cites
   a real page and describes it wrongly passes.
4. **`url-live` claims still only prove a page resolves.**

## Decisions Taken Under Ambiguity

1. **Scheduled fetch, gated verdict.** The network belongs nowhere near `npm test`
   — a build that depends on the open internet teaches people to re-run red until
   it goes green, which corrodes every other gate in the suite. But a verdict
   nobody meets is decorative. Separating the two, and enforcing the *artifact* on
   every build, gets both properties. The staleness horizon is the mechanism that
   makes the scheduled half impossible to quietly abandon.
2. **An `UNVERIFIABLE` claim retains its prior verdict and does not advance
   `lastVerifiedAt`.** Failing the build on any unverifiable result would make one
   network blip break every subsequent build; passing silently is the defect
   itself. Retaining the verdict while freezing the clock separates transient from
   permanent **by time rather than by a guess**, and never reports "verified"
   about a page never fetched.
3. **`lastVerifiedAt` and `lastAttemptAt` are separate fields.** One field would
   force a choice between "an attempt counts as a check" (false green) and "a
   failed attempt loses history" (no transient absorption). Two fields cost eight
   bytes and remove the dilemma.
4. **A corpus claim with no ledger entry FAILS the build; a ledger entry with no
   corpus claim does not.** The asymmetry is deliberate: an unverified claim is an
   unchecked assertion being shipped as authoritative, while an orphan entry is
   harmless residue from a deleted guide. Failing on orphans would make deleting a
   guide break the build.
5. **`expectedHash` covers `expect` + `source` + `select`.** Without it, the
   cheapest way to clear a refutation is to edit the number in the guide — which
   is the corpus-authoring equivalent of weakening a test to make red go green
   (Operating Lesson 14). Hashing makes that edit produce `drift-unverified`, so
   the only way to clear a refutation is to run the verifier again.
6. **The horizon default is 7 days, and `horizonDays` travels in the ledger.** A
   hard-coded constant would need a code change to tune; a value in the artifact
   lets a project with a slower schedule adjust without touching the gate. It is
   still a floor the gate reads, never a value the gate invents.
7. **The gate must not require `claim-fetcher.js`, and case 15 enforces it.** A
   JSDoc typedef crosses the boundary instead. Without the test this is an
   intention, and an intention is exactly what a future refactor silently breaks —
   putting `fetch` back into the `npm test` load graph and reopening the door this
   slice closed.
8. **The ledger is committed; the cache is not.** The verdict must travel with the
   repository so a fresh clone enforces something real on its first build. The
   cache is a local performance artifact whose staleness is bounded by
   `CACHE_TTL_MS` and which would only create merge noise.
</content>
