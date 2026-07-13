---
title: "W05-s1 — Persist and read real VERIFY evidence"
type: feature
parent_plan: "ctoc-audit-w05-gate3-verifies"
depends_on: none
priority: HIGH
files:
  - src/lib/step-13-verify.js
  - tests/ctoc-audit-w05-verify-evidence.test.js
---

# W05-s1 — Persist and read real VERIFY evidence

SIP1 slice 1 of 5 for the functional plan `ctoc-audit-w05-gate3-verifies`
(finding **C9**, vision `ctoc-self-audit-remediation`). This slice gives the
existing `runVerify` its first real caller and a persisted artifact, so that a
later slice (`s2`) can make the review→done gate consult a real verification
run instead of a self-reported checkbox. It builds the *evidence substrate*
only; consuming it at the gate is `s2`'s job.

Load-bearing defect this slice addresses (verified against the running code):
`src/lib/step-13-verify.js` exports `runVerify(projectPath)` but **no file
under `src/` calls it**, and nothing persists or reads its result. "Step 14
VERIFY" is therefore a checklist item an agent ticks, never a command whose
outcome is recorded.

## Implementation Details

### Architecture Decision (ADR)

**Context.** The parent plan's "Decisions Taken Under Ambiguity" resolves that
"VERIFY evidence" for the gate means *a persisted artifact produced by an actual
`runVerify` execution* (pass/fail, per-check detail, and a timestamp), not merely
Step-14 checkbox state — because a checkbox is self-reported by the same
agent-writable file the parent vision distrusts.

**Decision.** Add three functions to `step-13-verify.js`:
`verifyEvidencePath`, `persistVerifyResult` (the real caller for `runVerify`),
and `readVerifyEvidence`. The artifact is a JSON file at
`.ctoc/state/verify/<planSlug>.json`.

**Why `.ctoc/state/verify/` and not plan frontmatter.** Unlike the kickback
counters (`s5`), this data is produced by a *tool run*, not authored by a
human/agent; the parent plan explicitly leaves this artifact's location to
Steps 5-7 and notes "the durability tradeoff differs." A separate JSON file
(a) keeps a possibly-large `checks` payload out of the human-readable plan
frontmatter, (b) lives under `.ctoc/*` which the enforcement whitelist always
allows to be written, and (c) is naturally keyed by plan slug for `s2` to read.

### Dependency Graph

```
runVerify (existing, no callers today)
   ▲
   │ called by
persistVerifyResult(projectPath, planSlug) ──writes──▶ .ctoc/state/verify/<slug>.json
                                                              │ read by
readVerifyEvidence(projectPath, planSlug) ◀───────────────────┘
   ▲
   │ (consumed in s2 by validateReviewToDone — NOT in this slice)
```

No cycles. This slice adds no dependency on any other `src/lib` module beyond
what `step-13-verify.js` already requires (`child_process`, `./safe-fs`,
`path`).

### File Specifications

#### File: `src/lib/step-13-verify.js`
**Action:** MODIFY
**Purpose:** Add persistence + readback around the existing `runVerify` so a
real verification outcome can be recorded and later consulted.

**New exports:**

- `verifyEvidencePath(projectPath, planSlug)` → returns `string`
  - Pure path helper: `path.join(projectPath, '.ctoc', 'state', 'verify', \`${planSlug}.json\`)`.
  - `planSlug` is a bare slug (no `.md`, no directory). Callers pass
    `path.basename(planPath, '.md')`.

- `persistVerifyResult(projectPath, planSlug)` → returns the persisted artifact `Object`
  - Calls `runVerify(projectPath)` (**this is the real caller that closes the
    zero-callers defect**).
  - Builds artifact `{ planSlug, timestamp: new Date().toISOString(), passed,
    method, checks, errors, summary }` from the `runVerify` result.
  - `safeFs.mkdirSync(dir, { recursive: true })` then
    `safeFs.writeFileSync(verifyEvidencePath(...), JSON.stringify(artifact, null, 2))`.
  - Returns the artifact object.
  - Throws only on an unrecoverable write error (propagate `safeFs` error).

- `readVerifyEvidence(projectPath, planSlug)` → returns `Object | null`
  - Returns `null` when the artifact file does not exist.
  - Returns the parsed artifact object when present and valid JSON.
  - Returns `null` (never throws) on unparseable/corrupt JSON — absent-or-
    corrupt both read as "no usable evidence," which `s2` treats as a rejectable
    condition.

**Changes:**
- **Add** the three functions after `runVerify`.
- **Update** `module.exports` to add `verifyEvidencePath`, `persistVerifyResult`,
  `readVerifyEvidence` (keep existing `runVerify`, `runFallbackChecks`,
  `tryCommand`, `tryCommands`).

**Dependencies:** reuses the module's existing `safeFs` and `path`. No new
`require`.

**Cross-platform:** path built with `path.join`; directory created with
`recursive: true`; `os`-agnostic. No shell-out added.

### Test Plan

#### Tests: `tests/ctoc-audit-w05-verify-evidence.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`assert`).

**Zero-doubles constraint (project rule):** no mocking/stubbing of `runVerify`.
The persist path is exercised against a **real empty temp project** (no
`package.json`/`pyproject.toml`/`go.mod`/`Cargo.toml`), for which `runVerify`'s
fallback finds no toolchain and returns `passed:true` deterministically and
fast. The failing-evidence read path is exercised against a **real
hand-written artifact JSON file on disk** (a data fixture, not a code double).

**Test cases (all assert BEHAVIOR):**
1. **read: absent → null.** `readVerifyEvidence(tempRoot, 'nope')` returns
   `null` when no artifact exists.
2. **persist: writes a readable, timestamped, passing artifact.** In an empty
   temp project, `persistVerifyResult(tempRoot, 'plan-a')` returns an object
   with `passed === true`, an ISO `timestamp`, and `planSlug === 'plan-a'`; the
   file at `verifyEvidencePath(tempRoot, 'plan-a')` exists and round-trips via
   `readVerifyEvidence` to a deep-equal object.
3. **persist: runVerify actually ran (caller exists).** The returned artifact
   has a `method` field populated by `runVerify` (`'ctoc-quality-gate'` or
   `'fallback-direct'`), proving `persistVerifyResult` invoked `runVerify`
   rather than fabricating a result.
4. **read: faithfully surfaces a recorded FAILURE.** Write a real artifact JSON
   fixture `{ planSlug:'plan-b', passed:false, errors:['Tests failed: 1'],
   timestamp: <ISO> }` to `verifyEvidencePath(tempRoot,'plan-b')`;
   `readVerifyEvidence` returns it with `passed === false` and the `errors`
   intact (this is the datum `s2` will reject on).
5. **read: corrupt JSON → null (never throws).** Write `"{ not json"` to the
   artifact path; `readVerifyEvidence` returns `null` without throwing.

**Coverage target:** ≥80% lines/branches on the three new functions; every
`return`/`throw` path exercised. Teardown removes the temp dir.

### Security Review

- [x] **Path traversal:** `planSlug` is joined via `path.join` under a fixed
  `.ctoc/state/verify/` root; callers derive it from `path.basename(...)`.
  Document that `persistVerifyResult`/`readVerifyEvidence` must receive a bare
  basename, never a raw user path — asserted by a test using a slug with no
  separators. (Hardening of slug provenance is `s2`/W02 scope, not this slice.)
- [x] **No secrets:** artifact stores only check names/outcomes; no credentials.
- [x] **Safe file ops:** writes only under `.ctoc/state/verify/`.
- [x] **Error messages:** `readVerifyEvidence` swallows parse errors into `null`
  (no stack/path leak); write errors propagate as-is from `safeFs`.
- [x] **No command injection added:** no new `execSync`; `runVerify`'s existing
  command surface is unchanged.

## Decisions Taken Under Ambiguity

- **Artifact location `.ctoc/state/verify/<planSlug>.json`.** The parent left
  this open. Chosen over plan frontmatter because the payload is tool-produced
  and potentially large; see ADR above. Documented, not escalated.
- **Corrupt artifact reads as `null` (== absent).** The parent did not specify
  behavior for a damaged artifact. Treating corrupt == absent is the safe
  default: `s2` rejects "no usable evidence," so a corrupt artifact fails
  closed (blocks the gate) rather than open.
- **This slice does NOT wire `persistVerifyResult` into the live Step-14
  executor.** The tested deliverable is the persist/read functions plus their
  real `runVerify` call. The natural runtime call site is the Iron-Loop
  executor's Step-14 (`src/lib/iron-loop.js` / the executor), which is a
  separate integration touching a file outside this slice's scope; it is
  flagged for a follow-up wiring slice and is not asserted by any acceptance
  criterion here (mirrors how the parent defers the kickback call site).

## Execution Plan

### Step 8: TEST
- [ ] Write `tests/ctoc-audit-w05-verify-evidence.test.js` FIRST (TDD RED),
      covering the 5 behavior cases above. Use real temp dirs + a real artifact
      JSON fixture; NO mocking of `runVerify` (zero-doubles rule).
- [ ] Confirm the suite is RED: the three functions do not exist yet, so the
      import/behavior assertions fail.

### Step 9: PREPARE
- [ ] Confirm `js-yaml` is not needed here (JSON artifact); confirm `safeFs`
      and `path` are already required in `step-13-verify.js`.
- [ ] Confirm `.ctoc/state/` is writable / created with `recursive: true`.

### Step 10: IMPLEMENT
- [ ] `src/lib/step-13-verify.js`: add `verifyEvidencePath(projectPath, planSlug)`.
- [ ] `src/lib/step-13-verify.js`: add `persistVerifyResult(projectPath, planSlug)`
      that calls `runVerify` and writes the timestamped artifact.
- [ ] `src/lib/step-13-verify.js`: add `readVerifyEvidence(projectPath, planSlug)`
      returning the parsed artifact or `null` (absent/corrupt).
- [ ] `src/lib/step-13-verify.js`: extend `module.exports` with the three
      functions.

### Step 11: REVIEW
- [ ] Self-review: `runVerify` is now genuinely called by `persistVerifyResult`
      (zero-callers defect closed); no cycle introduced; functions are single-
      responsibility; naming matches existing camelCase.

### Step 12: OPTIMIZE
- [ ] Ensure the artifact is written once per persist call; no redundant reads;
      `readVerifyEvidence` does a single `existsSync`+`readFileSync`.

### Step 13: SECURE
- [ ] Verify the Security Review checklist items; add the bare-basename slug
      assertion; confirm no new shell surface.

### Step 14: VERIFY
- [ ] Run `node --test tests/ctoc-audit-w05-verify-evidence.test.js` → all green.
- [ ] Run the full suite `node --test tests/*.test.js` → `# fail 0`, `0 skipped`.
- [ ] Confirm coverage ≥80% on the new functions.

### Step 15: DOCUMENT
- [ ] JSDoc on all three new functions (params, return, throws, artifact shape).

### Step 16: FINAL-REVIEW
- [ ] Confirm: real caller for `runVerify` exists; artifact round-trips;
      corrupt/absent both read as `null`; no scope creep beyond the two declared
      files; ready to hand `readVerifyEvidence` to `s2`.
