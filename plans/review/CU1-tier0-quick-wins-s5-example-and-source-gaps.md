---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T21:09:40.576Z
gate_crossed: implementation → todo
---

---
iron_loop: true
title: "CU1 s5 — example + source-ref gaps (posthog SQL, sentry C++, react-native source refs)"
type: implementation
parent_plan: CU1-tier0-quick-wins
depends_on: none
priority: HIGH
risk_level: LOW
files:
  - skills/saas/posthog-analytics/SKILL.md
  - skills/saas/sentry-errors/SKILL.md
  - skills/mobile/react-native-bridge-checker/SKILL.md
---

# CU1 s5 — example + source-ref gaps

> Slice 5 of the CU1 decomposition. Three content-gap fixes across three skill
> files: (a) add a SQL BAD/SAFE example pair to `posthog-analytics`; (b) add a
> C++ example to `sentry-errors`; (c) raise `react-native-bridge-checker` to the
> 10+ dated-source-reference bar. All three are the SAME kind of work
> (multi-language / source-coverage completion) and no two touch overlapping
> concerns — a clean 3-file cohesive slice.

Maps to CU1 acceptance criteria: **"posthog-analytics gains a SQL BAD/SAFE
example pair"**, **"sentry-errors gains a C++ example"**,
**"react-native-bridge-checker reaches source-ref bar"**.

## Implementation Details

### Architecture Decision

The 7-language BAD/SAFE coverage standard (C#/.NET 9, Java 21+, Python 3.12+,
C C17/23, C++ 20/23, JS/TS, SQL) requires each multi-language SKILL.md to cover
all seven. Confirmed gaps (grounded against the audit + read-fresh at edit time):
- `posthog-analytics/SKILL.md` — no SQL BAD/SAFE pair. PostHog exposes SQL
  (HogQL/ClickHouse-backed) query surfaces, so SQL is in-scope for this skill.
- `sentry-errors/SKILL.md` — no C++ example. Sentry ships a native C++ SDK, so
  C++ is in-scope.
- `react-native-bridge-checker/SKILL.md` — ~2 dated source references against a
  ~10+ bar.

Each fix is an ADDITION to an existing skill (no section rewrite — no-churn
within file). The three files are unrelated in content, so grouping them is safe:
one executor pass touches three independent files, each a self-contained
addition. Under the SIP1 slice-sizing rule this is the ceiling (3 files) and is
justified because each edit is a small, homogeneous content addition rather than
three separate modules-with-tests.

### Dependency Graph

```
skills/saas/posthog-analytics/SKILL.md        (MODIFY: + SQL BAD/SAFE pair)
skills/saas/sentry-errors/SKILL.md            (MODIFY: + C++ example)
skills/mobile/react-native-bridge-checker/SKILL.md (MODIFY: + ≥10 dated source refs)
```

Three independent single-file additions. No cross-file dependency, no cycle.
`depends_on: none`.

### File Specifications

#### File: `skills/saas/posthog-analytics/SKILL.md`
**Action:** MODIFY (surgical addition)
**Change:** add a SQL `BAD` block and a SQL `SAFE` block demonstrating a real
PostHog footgun — e.g. an unbounded event query without a date filter causing a
full-table (ClickHouse) scan vs. the bounded/filtered SAFE form. The example must
be substantive (a real anti-pattern, not a placeholder). Mark the blocks `sql`.
Do not rewrite existing sections.

#### File: `skills/saas/sentry-errors/SKILL.md`
**Action:** MODIFY (surgical addition)
**Change:** add a C++ code block (marked `cpp` or `c++`) covering a real Sentry
native-SDK correctness concern — e.g. correct scope/breadcrumb usage and
`sentry_flush()` / graceful `sentry_close()` before process exit vs.
fire-and-forget that loses events on abrupt termination. The example must
demonstrate a non-trivial correctness concern. Do not rewrite existing sections.

#### File: `skills/mobile/react-native-bridge-checker/SKILL.md`
**Action:** MODIFY (surgical addition)
**Change:** add dated source references (each with a URL or document title AND a
retrieval/publication date) until the file has **≥10 distinct** source
references, covering: bridge architecture, JSI, Hermes compatibility, turbo
modules, and known bridge pitfalls. **Sources must be real and dated — no
invented references (hard user rule).** Prefer official React Native
documentation, the RN new-architecture docs, Hermes docs, and dated engineering
posts. Do not rewrite existing sections.

### Test Plan

**No new test file** — content additions. Verification is the content-contract
the CU1 AC defines, run against the REAL files (zero doubles):

Content-contract checks:
1. `posthog-analytics/SKILL.md` contains a SQL `BAD` block AND a SQL `SAFE`
   block (substantive PostHog anti-pattern).
2. `sentry-errors/SKILL.md` contains a code block marked `cpp`/`c++` with a
   non-trivial Sentry native-SDK concern.
3. `react-native-bridge-checker/SKILL.md` contains ≥10 distinct source
   references, each with URL/title + date.

If the executor adds a regression test for any of these, it MUST read the real
SKILL.md and assert (no mock/stub/fake).

### Security Review

- No code execution — content additions to three skill files.
- SQL/C++ examples are documentation snippets, not run — but they must be
  correct (they are corrective guidance Claude will follow).
- Source URLs are public — no secrets.
- Only the three enumerated files edited.

## Execution Plan

### Step 8: TEST
Confirm baseline green. Establish the content-contract checks against the CURRENT
files — they must FAIL now (no SQL pair in posthog, no C++ in sentry, <10 refs in
rn-bridge), proving the checks test something. READ each of the three files to
capture the existing structure/style so additions match.

### Step 9: PREPARE
For posthog: confirm the HogQL/ClickHouse SQL surface and a real full-scan
footgun. For sentry: confirm the native C++ SDK flush/close API shape (verify
against Sentry native SDK docs at edit time — no invented API). For rn-bridge:
gather ≥8 additional real, dated sources (bridge arch, JSI, Hermes, turbo
modules, pitfalls) to reach ≥10 total — verify each URL/date at edit time.

### Step 10: IMPLEMENT
(a) Add SQL BAD/SAFE pair to posthog-analytics. (b) Add C++ example to
sentry-errors. (c) Add dated source refs to react-native-bridge-checker to reach
≥10. ONE step, three independent sub-items.

### Step 11: REVIEW
Self-review: each addition is substantive (real footgun / real API / real dated
sources); language fences correct (`sql`, `cpp`); ≥10 distinct refs each dated;
no existing section rewritten.

### Step 12: OPTIMIZE
Keep each example focused (one clear anti-pattern each); avoid bloating the
skills beyond the 7-language/source bar.

### Step 13: SECURE
Run Security Review. Confirm example code is correct guidance (a wrong SAFE
example is worse than none). Confirm all source URLs public + dated.

### Step 14: VERIFY
Run the 3 content-contract checks against real files — all pass. `node --test
tests/*.test.js` → `# fail 0`.

### Step 15: DOCUMENT
Record in ledger (s6): the SQL footgun chosen, the C++ Sentry pattern chosen,
and the full list of ≥10 rn-bridge sources with dates + URLs.

### Step 16: FINAL-REVIEW
Confirm only the three enumerated files edited; 7-language coverage advanced for
posthog (SQL) and sentry (C++); rn-bridge at ≥10 dated refs; nothing fabricated.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Fabricated source ref / wrong SDK API (hard user rule) | Verify each URL/date + the Sentry C++ API at edit time; no invented refs | Step 9, Step 11, Step 16 |
| Placeholder (non-substantive) example | AC requires a REAL footgun; review rejects placeholders | Step 11 |
| Section-rewrite churn | Additions only; diff must show additions | Step 10, Step 11 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review

## Decisions Taken Under Ambiguity

- **posthog SQL footgun choice.** The file already carried a SQL BAD/SAFE pair,
  but it was a *schema/index* example (distinct_id mapping), not the
  *query* footgun the plan specifies. Rather than rewrite it (no-churn rule), I
  ADDED a new subsection "SQL query footgun (HogQL / warehouse — unbounded event
  scan)": BAD = aggregate over `analytics_events` with no time predicate →
  full-partition scan (times out in the HogQL editor, bills the whole table on
  the warehouse mirror); SAFE = `WHERE occurred_at >= now() - INTERVAL '7 days'`
  placed first so partition pruning skips old data. Grounded in ClickHouse's
  time-partitioned storage (PostHog's event backend) — a real, canonical PostHog
  SQL performance footgun.

- **sentry C++ example fence + BAD/SAFE.** The existing native section used a
  single `c`-fenced SAFE-only `sentry-native` init. The plan requires a
  `cpp`/`c++`-marked block with a non-trivial concern. Added a new subsection
  "C++ (C++20/23) — flush before exit or lose the last events (BAD / SAFE)":
  BAD = `sentry_capture_event` then `std::exit` before the background worker
  drains → event lost; SAFE = RAII `SentryGuard` (`sentry_close()` in the
  destructor) + explicit `sentry_flush(3000)` with its non-zero-on-timeout
  return checked. The C++ SAFE example is placed *before* the pre-existing `c`
  init snippet is unaffected — both remain.

- **sentry-native API verified, not invented.** `sentry_flush(uint64_t timeout)`
  returns 0 on success / non-zero on timeout and blocks the caller until the
  worker drains or times out; `sentry_close(void)` forces a final flush;
  `sentry_options_set_shutdown_timeout(opts, ms)` caps the drain. All three
  confirmed against the canonical header
  `getsentry/sentry-native/include/sentry.h` (curl'd at edit time) and the
  official native docs — no invented API.

- **react-native sources: 13 real dated refs (bar was ≥10).** Added a "## Sources"
  section (the file previously had none). Every URL was curl-verified HTTP 200 at
  edit time. Living doc pages carry a retrieval date (2026-07-08); the two RN
  blog posts carry their publication dates, which I confirmed from the page
  metadata (0.76 = 2024-10-23, 0.81 = 2025-08-12). No WebSearch tool was
  available in this executor context, so verification was done by direct HTTP
  fetch against the official sites (reactnative.dev, docs.expo.dev,
  developer.android.com, developer.apple.com) — no reliance on memory, nothing
  fabricated.

- **Content-contract test added (in scope per plan).** The plan said "no new test
  file" but permitted a regression test that reads the REAL SKILL.md files. I
  added `tests/skill-example-source-gaps.test.js` (3 assertions, zero doubles),
  RED before the edits and GREEN after — this is the TDD evidence the caller
  asked for. It reads the real files with `fs.readFileSync`.

- **Out-of-slice working-tree files left untouched.**
  `skills/security/dependency-checker/SKILL.md` (modified) and
  `tests/skill-regulatory-citations.test.js` (untracked) were already present in
  the working tree from a sibling slice; they are outside this slice's `files:`
  declaration and I did not touch them.
