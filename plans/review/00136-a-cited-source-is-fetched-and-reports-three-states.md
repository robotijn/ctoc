---
approved_by: human
approved_at: 2026-07-19T21:33:26.633Z
gate_crossed: implementation → todo
---

---
title: "A cited source is fetched and reports three states — verified, refuted, or could-not-look"
type: implementation
parent_plan: corpus-claim-verification
depends_on: 00135-guides-declare-their-checkable-claims-and-the-corpus-reports-how-many-it-has
blocks: 00137-the-verification-verdict-is-enforced-offline-on-every-build
priority: HIGH
program: corpus-quality
iron_loop: true
files:
  - "src/lib/claim-fetcher.js"
  - "tests/claim-fetcher.test.js"
  - "src/scripts/verify-claims.js"
---

# A cited source is fetched and reports three states

> Design derivations live in
> `plans/implementation/00135-guides-declare-their-checkable-claims-and-the-corpus-reports-how-many-it-has.md`.
> Read it first. This slice builds the network half.

## The one thing this slice must not get wrong

A verification suite that goes green because the network was down would be the
single worst instance of the defect class this repository exists to fence — a
check reporting "verified" about a page it never fetched. `CLAUDE.md` names five
shipped instances of that class; `src/lib/false-green-scan.js` scans for their
signatures. **An unreachable source must fail loudly, not pass quietly.**

The discipline to follow already exists in this repository and is not to be
reinvented. `src/lib/stale-detector.js` distinguishes "I looked and found nothing"
from "I could not look" in two places:

- `verifyStaleCandidate` returns `gitAvailable: false` and
  `classifyStaleCandidate` maps it to `inconclusive` (`:656-663`) rather than to a
  clean result;
- `scanCheapCandidates` returns `unread` / `unreadCount`, with the contract stated
  at `:55-66`: **`count === 0` means the backlog is clean ONLY when
  `unreadCount === 0`.**

This slice carries the identical shape to claim verification.

## The three states

| State | Meaning | Produced when |
|---|---|---|
| **`VERIFIED`** | Fetched, parsed, the claim holds. | 200 (or a revalidating 304), body parsed, selector resolved, value equals `expect`. |
| **`REFUTED`** | Fetched, parsed, the claim does **not** hold. | Same as above, value differs. **This is the finding the whole mechanism exists to produce.** |
| **`UNVERIFIABLE`** | **I could not look.** | Everything else — and it is never folded into either of the other two. |

`UNVERIFIABLE` carries a **closed-enum reason**, deliberately closed for the same
reason `UnreadReason` is (`src/lib/stale-detector.js:89-102`): this value reaches a
report a human reads, and a raw error string carries absolute paths, host names
and occasionally credentials.

| `UnverifiableReason` | Meaning |
|---|---|
| `network-unreachable` | DNS failure, connection refused, offline |
| `timeout` | exceeded the per-request budget |
| `http-error` | non-200/304 response (status recorded, body not) |
| `rate-limited` | 429, or 403 from a registry known to rate-limit |
| `parse-failed` | body was not valid JSON |
| `selector-missing` | JSON parsed, but the `select` path does not resolve |
| `body-too-large` | response exceeded the cap and was abandoned mid-stream |
| `cache-only` | **served from cache with no live contact** — see below |
| `blocked-host` | source failed the host policy (server-side request forgery guard) |

### Why `cache-only` is a first-class unverifiable reason

This is the load-bearing anti-false-green property of the cache. A cached body
served without any contact with the origin **is not a verification** — it is a
memory of one. If a cache hit could return `VERIFIED`, then a permanently dead
source would keep reporting verified forever, which is exactly "a verdict on input
never received" wearing a performance optimisation's clothes.

So: **a cache hit alone yields `UNVERIFIABLE: cache-only` and does NOT advance the
claim's `lastVerifiedAt`.** Only live contact — a fresh 200, or a **304 Not
Modified** in response to a conditional request — counts as looking. A 304 is
genuine live contact: the origin was asked and answered.

## Caching and rate limits

Sixty-one files times many claims is a lot of fetches, and registries rate-limit.

| Concern | Decision |
|---|---|
| **What is cached** | Response body + `ETag` + `Last-Modified` + fetch timestamp, keyed by a hash of the URL, under `.ctoc/verification/cache/`. |
| **How re-checks stay cheap** | Conditional requests: `If-None-Match` / `If-Modified-Since`. A 304 is a few hundred bytes and still counts as live contact. This is what makes the mechanism affordable at corpus scale. |
| **Cache time-to-live** | `CACHE_TTL_MS`, default **6 hours**. |
| **How a stale cache is prevented from standing in for a live check** | **`CACHE_TTL_MS` must be strictly less than the ledger staleness horizon of `00137`.** This inequality is the whole property, and it is asserted by a test in `00137`, not left as a comment. If the cache could outlive the horizon, a stale cache would keep the ledger looking fresh with no live contact — the exact substitution being fenced. |
| **Politeness** | Per-host serialization with a small inter-request delay; global concurrency cap (default 4); a `Retry-After` on 429 is honoured as `rate-limited`, **never retried in a loop**. |
| **Retries** | **None.** A retry turns a flaky check into a slow check that lies (`CLAUDE.md`, the entry-point declaration section states this rule for the last-mile check; it applies identically here). One attempt, honest verdict. |

## Implementation Details

### Dependency Graph

```
src/lib/claim-extractor.js  (00135)
        ▲
        │ requires
src/scripts/verify-claims.js  (CREATE) ──requires──▶ src/lib/claim-fetcher.js (CREATE)
        ▲                                                     ▲
        │                                                     │
      human / scheduler                          tests/claim-fetcher.test.js (CREATE)
```

No cycles. `claim-fetcher.js` requires no project module other than `./safe-fs`;
it does **not** require `claim-extractor.js` (it consumes a claim record, it does
not produce one), so the two remain independently testable.

### File: `src/lib/claim-fetcher.js`
**Action:** CREATE
**Purpose:** Fetch one cited source and return a three-state verdict that can never say "verified" about a page it did not receive.

#### Exports

- `verifyClaim(claim: ClaimRecord, opts?) → ClaimVerdict`
  - `ClaimVerdict = { id, kind, source, state, reason, observed, expected, checkedAt, liveContact }`.
  - `state ∈ { 'VERIFIED', 'REFUTED', 'UNVERIFIABLE' }`; `reason` is `null` unless
    `UNVERIFIABLE`.
  - **`liveContact: boolean`** — true only on a fresh 200 or a 304. This is the
    field `00137` reads to decide whether `lastVerifiedAt` advances. It exists
    because a boolean that means "I actually touched the origin" must not be
    inferred from `state`.
  - `observed` is the selected value, **truncated to 128 characters**, or `null`.
    Never the response body.
  - Degrades, never throws, on any network or data fault. Throws `TypeError` on
    argument misuse only — the same split as
    `src/lib/stale-detector.js:437-450`.

- `verifyClaims(claims: ClaimRecord[], opts?) → {verdicts, counts}`
  - `counts = { verified, refuted, unverifiable, byReason: {…} }`.
  - **The contract, and it is the only thing that licenses reading a zero:**
    `refuted === 0` means "the corpus holds" **only when `unverifiable === 0`**.
    Stated in the module header in those words, mirroring
    `src/lib/stale-detector.js:55-66`.

#### `registry-version` verification

1. GET `source` with `Accept: application/json`, conditional headers from cache.
2. Cap the body at `MAX_BODY_BYTES` (1 MiB). **Abandon mid-stream on exceed** —
   do not buffer then measure. Unbounded capture is one of the five false-green
   signatures (`CLAUDE.md`); `body-too-large` is the honest verdict.
3. `JSON.parse` → `parse-failed` on throw.
4. Walk `select` as a dotted path with `Object.prototype.hasOwnProperty` at each
   step. Unresolved ⇒ `selector-missing`, never `REFUTED` — a moved field is a
   source-shape change, not a refuted claim, and conflating them produces false
   findings that train a human to ignore the report.
5. `String(value).trim() === String(expect).trim()` ⇒ `VERIFIED`, else `REFUTED`.

#### `url-live` verification

GET with a byte cap and a short timeout; 200/304 ⇒ `VERIFIED` (with `kind` on the
verdict, so a report never sums this with a version verdict — `00135` Decision 8);
any other status ⇒ `UNVERIFIABLE: http-error` with the status recorded.

**A `url-live` `VERIFIED` is explicitly a weaker verdict.** It proves the page
resolves, not that the guide's claim about it holds. Never presented as equal.

#### Network transport

Node's global `fetch` (Node ≥ 18, per `package.json` `engines`), with
`AbortController` for the timeout. **No new dependency** — this project has zero
runtime dependencies and this slice adds none.

### File: `tests/claim-fetcher.test.js`
**Action:** CREATE
**Purpose:** The fetcher's specification — proven **offline**, against a local server.

**No test in this file touches the real internet.** Every case runs against an
`http.createServer` bound to `127.0.0.1:0` (ephemeral port), torn down in
`finally`. A test suite that fetches real registries would be flaky by
construction and would eventually be "fixed" by weakening it. Loopback is exempted
from the host policy under an explicit test-only option (see Step 13).

| # | Case | Assertion |
|---|---|---|
| 1 | matching version ⇒ `VERIFIED`, `liveContact: true` | |
| 2 | **differing version ⇒ `REFUTED`** | `observed` and `expected` both present |
| 3 | **server refuses connection ⇒ `UNVERIFIABLE: network-unreachable`** | **and NOT `VERIFIED`** — the case this whole slice exists for |
| 4 | server hangs past the timeout ⇒ `UNVERIFIABLE: timeout` | asserted with a real slow handler, not a mock clock |
| 5 | 500 ⇒ `UNVERIFIABLE: http-error` | status recorded, body absent |
| 6 | 429 ⇒ `UNVERIFIABLE: rate-limited`, **exactly one request made** | server counts hits; a retry would fail this |
| 7 | non-JSON body ⇒ `UNVERIFIABLE: parse-failed` | |
| 8 | `select` path absent ⇒ `UNVERIFIABLE: selector-missing`, **not `REFUTED`** | |
| 9 | oversized body ⇒ `UNVERIFIABLE: body-too-large`, **abandoned mid-stream** | server asserts the client disconnected before sending it all |
| 10 | **304 ⇒ `VERIFIED` with `liveContact: true`** | conditional revalidation is real contact |
| 11 | **cache hit with no request ⇒ `UNVERIFIABLE: cache-only`, `liveContact: false`** | the anti-false-green property |
| 12 | `verifyClaims` counts: mixed set gives exact verified/refuted/unverifiable | |
| 13 | **`refuted === 0` with `unverifiable > 0` is NOT reported as clean** | the returned shape forces both numbers; assert the header contract holds in the data |
| 14 | `observed` truncated to 128 chars; response body never appears in a verdict | hostile 10 KB value |
| 15 | **`http://` and loopback-without-the-test-flag ⇒ `blocked-host`** | server-side request forgery guard |
| 16 | **a redirect to a different host ⇒ `blocked-host`** | the redirect target is re-validated, not trusted |

### File: `src/scripts/verify-claims.js`
**Action:** CREATE
**Purpose:** The fetcher's live call site — the command a human or a scheduler runs, which prints a verdict a human can read.

- Extracts claims via `00135`'s `censusCorpus` / `extractClaims`, verifies each,
  prints a legible report, exits **non-zero when `refuted > 0`**.
- **Prints the three numbers always, on one line, including the zeros**, so
  `unverifiable` can never be invisible:

  ```
  [CTOC claims] verified 128  refuted 0  unverifiable 3  (registry-version 84, url-live 44)
  [CTOC claims] UNVERIFIABLE: pypi.org/pypi/duckdb/json — timeout
  ```

- Uses `process.exitCode` and returns; **never `process.exit`** with writes
  pending. Discarding pending piped writes is one of the five named false-green
  signatures, and `src/lib/request-exit.js` is the fixed exemplar to follow
  (`CLAUDE.md`).
- Writes the ledger consumed by `00137`. Ledger shape and its gate are `00137`'s
  subject; this slice writes it and prints it.
- **Also annotates a first handful of guides with claim blocks** so the mechanism
  runs against real citations rather than fixtures — see Decision 4 for which, and
  raise `.ctoc/claim-coverage-baseline.json` accordingly.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `verifyClaim` / `verifyClaims` | `src/scripts/verify-claims.js` | **`node src/scripts/verify-claims.js`** — a command a human runs and reads |
| `verify-claims.js` | run by a human today; by the schedule documented in `00138` | shipped script |
| the ledger it writes | read by the offline gate in `00137` | `npm test` |

The fetcher is **not** reachable only from its own test: its call site ships in
this same slice, per Operating Lesson 16. The scheduled invocation and the menu
surface arrive in `00138`; the script is human-runnable and legible from the
moment it lands.

## Test Plan

Covered by `tests/claim-fetcher.test.js` above. The load-bearing cases are **3**
(unreachable must not read as verified — the failure mode named as the worst
possible outcome), **11** (a cache hit is not a verification), and **8**
(source-shape change is not a refutation).

## Build Record (executed 2026-07-27, worktree build to green gate)

All of Steps 8-16 executed. Summary of evidence:

- **Step 8 TEST (TDD-RED):** `tests/claim-fetcher.test.js` written in full first; run
  before the module existed → `Cannot find module '../src/lib/claim-fetcher'`, all cases
  red (the load-bearing case 3 could not even load). Then green. A batch to a dead port
  (`verifyClaims` over 5 closed-port claims) yields **zero** VERIFIED — the network-down
  proof.
- **Step 10 IMPLEMENT:** `src/lib/claim-fetcher.js` (`verifyClaim`/`verifyClaims`, cache
  with conditional requests + 304, closed-enum reasons, explicit `liveContact`);
  `tests/claim-fetcher.test.js` (32 cases, all against 127.0.0.1); `src/scripts/verify-claims.js`
  (`runVerification`, three counts always, ledger, `requestExit`). Two guides annotated
  (`duckdb.md`, `clickhouse.md`); `.ctoc/claim-coverage-baseline.json` floor raised 0→2.
- **Step 14 VERIFY:** `npm test` PASS — coverage **99.1%** (floor 99), **0 skipped, 0
  failed**. `tsc --noEmit` clean. Reachability fence **26** (unchanged), verify-claims.js
  reachable, no newly-dead file. False-green scan: **0** new findings. Export fence:
  `verifyClaim`/`verifyClaims`/`runVerification` all live. The gated suite makes **no**
  network call — every real socket targets loopback; external hosts appear only on
  SSRF-blocked-before-connect or `noNetwork` paths.
- **Live run** (`node src/scripts/verify-claims.js`, real pypi): `verified 1 refuted 2
  unverifiable 0`, exit 1. Both version claims **REFUTED** — clickhouse-connect
  1.4.2→**1.6.0**, duckdb 1.5.4→**1.5.5**. Per Decision 4 a refutation is a SUCCESS: the
  guides are genuinely stale (verified against pypi directly). The guides were NOT edited
  to force green. `npm test` never runs this script, so the exit-1 does not touch the gate.

### Additional Decisions Taken Under Ambiguity (this build)

9. **Body cap raised 1 MiB → 16 MiB (per-call overridable via `opts.maxBodyBytes`).**
   The plan's Decision 4 REQUIRES pypi's full `/pypi/<pkg>/json` for drift detection
   (its `info.version` is the LATEST release), but that endpoint is 3.44 MiB (duckdb) /
   7.77 MiB (clickhouse-connect) — larger than the plan's own 1 MiB cap, an internal
   contradiction. Resolved toward the STATED PURPOSE (drift detection): 16 MiB fits real
   registry JSON with margin, peak memory bounded at cap × concurrency (≈64 MiB), and
   `body-too-large` still fences a pathological body. **SURFACED FORK for the human:** no
   fixed cap fits every package (a registry with tens of thousands of releases exceeds any
   bound). The durable fix is a streaming extractor that pulls only `info.version` without
   buffering the whole document — deferred to your scheduling, not decided here.
10. **`verify-claims.js` wired as a DECLARED reachability root** in
    `.ctoc/reachability-roots.json` (outside the plan's declared `files:`, but the
    sanctioned escape hatch). The plan's wiring names `node src/scripts/verify-claims.js`
    as the live call site; the menu surface that would also name it arrives in 00138, and
    CLAUDE.md was out of scope for this build, so the declared root is the reviewable
    wiring today. `.gitignore` gained `.ctoc/verification/` (cache + ledger, regenerable).
11. **CLAUDE.md documentation (Step 15) deferred.** The build brief explicitly forbade
    editing `CLAUDE.md` (other integrations touch it). The three states, the closed
    reason enum, the cache-only anti-false-green property, the no-retry rule, and
    "the gated suite makes no network call" are fully documented in the module header of
    `src/lib/claim-fetcher.js` and `src/scripts/verify-claims.js`. The CLAUDE.md prose
    update is a one-line follow-up for whoever holds that file.
12. **Redirects are never followed → `blocked-host`.** `redirect: 'manual'` yields an
    opaque redirect whose target the request cannot read; following one is an SSRF
    primitive. Refusing ALL redirects is the strongest form of "re-validate, never follow
    blindly" and satisfies case 16 (a redirect to a different host ⇒ blocked-host).

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [ ] Write `tests/claim-fetcher.test.js` in FULL and run ONLY that file before the module exists. Record TDD-RED verbatim.
- [ ] **Case 3 is the proof obligation of this slice.** Record its red, then its green, verbatim. Additionally, run the whole file once with the local server never started, and confirm **zero** cases report `VERIFIED`.

### Step 9: PREPARE
- [ ] Read from disk: `src/lib/stale-detector.js:55-66` and `:89-102` (the contract and the closed enum to mirror), `:437-450` (degrade-vs-throw split), `:484-504` (the `degraded()` shape).
- [ ] Read `src/lib/request-exit.js` — the exemplar for exiting without discarding writes.
- [ ] Read `src/lib/version.js` and `src/lib/deployment.js` for the existing network-call conventions in this repository, and follow them rather than inventing a third.
- [ ] Read `src/lib/false-green-scan.js` for the five signatures this module must not introduce.
- [ ] Confirm `package.json` `engines.node >= 18` so global `fetch` is available. **If the code disagrees with this plan, THE CODE WINS — record it.**

### Step 10: IMPLEMENT
- [ ] `src/lib/claim-fetcher.js` — `verifyClaim`, `verifyClaims`, cache with conditional requests, closed-enum reasons, `liveContact`.
- [ ] `tests/claim-fetcher.test.js` — the sixteen cases, all against `127.0.0.1`.
- [ ] `src/scripts/verify-claims.js` — extract, verify, print all three counts, write the ledger, `process.exitCode`.
- [ ] Annotate the first handful of guides with `ctoc:claims` blocks (Decision 4) and raise `.ctoc/claim-coverage-baseline.json` to the new live count.

### Step 11: REVIEW
- [ ] **No path returns `VERIFIED` without `liveContact === true`.** Grep the module for every `VERIFIED` literal and confirm each at its site.
- [ ] No `catch {}`; every catch maps to a named reason and a returned verdict.
- [ ] `selector-missing` and `REFUTED` are genuinely distinct at their branch.
- [ ] Confirm no retry loop exists anywhere.

### Step 12: OPTIMIZE
- [ ] Conditional requests confirmed to produce 304s against the local server — assert the byte count of a revalidation is far below a full body.
- [ ] Per-host serialization and the concurrency cap verified under a multi-claim run; no unbounded parallel fan-out.

### Step 13: SECURE
- [ ] **Server-side request forgery guard:** `https` only; reject userinfo, explicit ports, and hosts resolving to loopback / link-local / private ranges. **A redirect is re-validated against the same policy, never followed blindly** (case 16). Loopback is permitted only under an explicit test-only option that is off by default and asserted off in production paths.
- [ ] Response bodies never reach a verdict, a log line, or the ledger — only a 128-char truncated `observed`. A documentation page can contain anything.
- [ ] Cache files are written under `.ctoc/verification/cache/` with **hashed** filenames (a URL is not a safe filename on Windows) and are git-ignored.
- [ ] Cache reads are size-gated before the read, mirroring `src/lib/stale-detector.js:770-795`.
- [ ] The `select` walk uses `hasOwnProperty` at each step; the extractor already rejected `__proto__`-style selectors in `00135`, and this is the second layer.
- [ ] No URL, host, or path from the corpus is ever interpolated into a shell string — there is no subprocess in this slice at all.

### Step 14: VERIFY
- [ ] `node --test tests/claim-fetcher.test.js` green.
- [ ] **Run the whole gated suite `npm test` with the machine's network disabled**, and confirm it passes unchanged — **proof that the gated suite does not depend on the open internet**, which is `00137`'s central ruling and must be true from the moment a fetcher exists in the tree.
- [ ] Full gated run `npm test` normally; report the verbatim counts and coverage lines.
- [ ] Lint `--max-warnings 0`; typecheck clean.
- [ ] Run `src/scripts/verify-claims.js` against the newly annotated guides and **report its full output verbatim**, including the unverifiable count.
- [ ] `src/lib/false-green-scan.js` count reported before and after; no new finding.

### Step 15: DOCUMENT
- [ ] Record the three states and the closed reason enum in `CLAUDE.md`, in the same voice as the false-green fence section.
- [ ] State in `CLAUDE.md` that the gated suite performs **no** network access, and that `verify-claims.js` is the only network path.
- [ ] Update documented test-file and module counts in both places, read live from disk.

### Step 16: FINAL-REVIEW
- [ ] Report: files, tests, Step 8 red verbatim, the network-disabled `npm test` result, the live `verify-claims.js` output, which guides were annotated, the baseline movement, and every decision taken under ambiguity.
- [ ] Ready for human review at Gate 3.

---

## What this slice does NOT fix

1. **Nothing runs on a schedule yet.** `verify-claims.js` is human-invoked here.
   The schedule and its documentation are `00138`.
2. **Nothing is enforced at the gate yet.** A refutation exits the script
   non-zero, but `npm test` does not read the ledger until `00137`. Between this
   slice and that one, **a refutation is only seen by someone who runs the
   script** — a real, named gap of exactly one slice.
3. **`url-live` still proves only that a page resolves**, never that it says what
   the guide claims. It is counted separately for that reason.
4. **The 246 uncited files remain uncited.** This slice annotates a handful; the
   ratchet moves, the gap does not close.

## Decisions Taken Under Ambiguity

1. **A cache hit without live contact is `UNVERIFIABLE: cache-only`, never
   `VERIFIED`.** This is the single decision that keeps a cache from becoming the
   false-green vector. A 304 counts as contact because the origin was genuinely
   asked and answered; a silent cache read was not.
2. **`CACHE_TTL_MS` must be strictly below the ledger staleness horizon**, and the
   inequality is asserted by a test in `00137` rather than written as a comment.
   A comment is not a fence. If the cache could outlive the horizon, a dead source
   would keep the ledger fresh with no contact.
3. **No retries, at all.** A retry converts a flaky check into a slow check that
   lies, and it multiplies rate-limit pressure. One attempt, honest verdict. This
   follows the explicit no-retry rule already stated in `CLAUDE.md` for the
   last-mile entry-point check.
4. **The first annotated guides are `skills/frameworks/data/duckdb.md` and
   `skills/frameworks/data/clickhouse.md`.** They were read in full during
   planning, they already cite machine-readable registry JSON endpoints
   (`pypi.org/pypi/duckdb/json`, `pypi.org/pypi/clickhouse-connect/json`), and
   they carry exact version claims (`1.5.4`, `1.4.2`) — so the very first run
   exercises `VERIFIED` and, when a release lands, `REFUTED` against real sources.
   Starting with fixtures only would leave the mechanism unproven against reality.
   **A refutation on the first run is a SUCCESS, not a defect** — it means a
   version moved and the corpus is stale. Record it; do not edit the guide to make
   the run green without checking the source yourself.
5. **A missing `select` path is `selector-missing`, not `REFUTED`.** A registry
   that renames a field has changed shape, not falsified a claim. Reporting that
   as a refutation would produce findings that are wrong, and a report that is
   wrong is a report that gets ignored.
6. **Tests run against a loopback server, never the real internet.** A test that
   fetches `pypi.org` is flaky by construction and would eventually be weakened to
   make red go green — the precise failure Operating Lesson 14 forbids. The real
   sources are exercised by `verify-claims.js` at Step 14, where a failure is a
   finding rather than a build break.
7. **`liveContact` is an explicit field, not inferred from `state`.** Inferring it
   would mean the one property that prevents a false green is a derived
   convention. A boolean that a downstream gate depends on gets stored, not
   recomputed.
8. **Global `fetch` rather than `https.get`.** Node 18 is the declared floor in
   `package.json`, `fetch` gives `AbortController` timeouts and streaming body
   caps directly, and it adds no dependency. `src/lib/version.js` uses the older
   shape; **read it at Step 9 and, if it is load-bearing convention rather than
   age, follow it instead and record the correction.**
</content>
