---
title: "W09 — Release and Metadata Truth"
created: "2026-07-11T00:00:00Z"
type: feature
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: MEDIUM
depends_on: none
---

# W09 — Release and Metadata Truth

## 1. ASSESS — Problem Understanding

### Business Context

`package.json` is the manifest npm, SBOM generators, license scanners, and every
contributor read first to learn what version and license this software is under.
Right now it reports a stale version and the wrong license to all of them. This is a
legal-correctness defect, not a cosmetic one — declaring `Apache-2.0` (a permissive
license with no noncompete clause) when the actual terms are `PolyForm Shield 1.0.0`
(a source-available license with a noncompete clause) materially misrepresents the
license grant to anyone relying on `package.json` as the source of truth — and a
trust defect: contributors and tooling are told something false about the software
they are consuming.

### Current State

Re-verified live against the repository on 2026-07-11 (no drift from the audit's
original findings — every value below matches exactly what H9/M7/M9 reported):

- `package.json:3` — `"version": "6.9.49"` vs `VERSION:1` — `6.10.3`. **Confirmed
  drift**, unchanged since the audit.
- `package.json:5` — `"license": "Apache-2.0"` vs `LICENSE:1` — `PolyForm Shield
  License 1.0.0`. **Confirmed drift**, unchanged since the audit.
- `.claude-plugin/plugin.json:3` and `.claude-plugin/marketplace.json:9,15` already
  report `6.10.3` — correctly synced. `release.js` DOES work for these two files;
  `package.json` is the one omission.
- `.claude-plugin/marketplace.json:21` — `"license": "PolyForm-Shield-1.0.0"` — the
  marketplace metadata already carries this exact identifier. This is the target
  value for `package.json.license`.
- `src/scripts/release.js:20-34` — `JSON_VERSION_FILES` lists only
  `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json`; `package.json`
  is absent from the array, so `release.js` never touches it.
- `src/scripts/release.js:77-82` — inside `updateJsonVersionFiles`, a `JSON.parse`
  failure on a target file is caught, logged via `console.error`, and the loop
  `continue`s to the next file. No failure flag is set or propagated to the caller.
- `src/scripts/release.js:142-160` (`main()`) — the only `process.exit(1)` path is
  when `getVersion()` throws (a malformed `VERSION` file, guarded at line 58-59); a
  per-file sync failure inside `updateJsonVersionFiles`/`updateVersionInFiles` never
  reaches an exit code, so `main()` always resolves and the process exits 0 even
  after a logged failure.
- `src/scripts/release.js:107` —
  `safeFs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n')` writes
  directly to the target path. No temp-file-plus-rename; a crash mid-write can leave
  a truncated or corrupt JSON file.
- `src/commands/update.js:190-198` — `installed_plugins.json` is read and
  `JSON.parse`d; on a parse error the `catch` block is empty (comment: `// Use
  default if file is corrupted`), silently leaving `installed` at its line-191
  default `{ version: 2, plugins: {} }`.
- `src/commands/update.js:215` —
  `safeFs.writeFileSync(INSTALLED_FILE, JSON.stringify(installed, null, 2))`
  unconditionally writes `installed` back. When the parse failed, this writes the
  empty default over the file, deregistering every plugin entry that was in the
  corrupted file — not just `ctoc@robotijn`.

### Impact

- Every SBOM/license-scanner run against this repo currently attributes the wrong
  license to software actually distributed under PolyForm Shield 1.0.0 — a
  compliance-relevant misrepresentation for any downstream consumer or legal review.
- `npm view ctoc version` / any tool reading `package.json.version` reports `6.9.49`
  while the shipped product is `6.10.3` — contributors debugging "the current
  version" get a false baseline.
- A `release.js` run that fails to write one of the three JSON targets currently
  reports success (exit 0) and can ship with `VERSION`, `plugin.json`, and
  `marketplace.json` disagreeing — a maintainer trusting the green exit code ships
  an inconsistent release unknowingly.
- A crash mid-write during `release.js` can leave any of the three JSON files
  truncated or invalid, breaking `npm install`, the marketplace listing parse, or
  the plugin loader on next read.
- Any user whose `installed_plugins.json` is transiently corrupted (disk error,
  concurrent write, partial write from a prior crash) loses every other installed
  plugin's registration the next time `/ctoc:update` runs — a destructive side
  effect of an unrelated update.

## 2. ALIGN — Business Alignment

**Job to Be Done:** When I run `release.js` to cut a CTOC release, or when
compliance tooling / a contributor reads `package.json`, I want every metadata
source (`VERSION`, `package.json`, `plugin.json`, `marketplace.json`, `LICENSE`) to
agree and the release process to fail loudly on any partial sync, so I can trust
the green exit code and the license/version fields as ground truth.

**Impact Map:**
- **Goal:** Release metadata is consistent and trustworthy (parent vision Success
  Criterion 8: "VERSION, `package.json`, `plugin.json`, `marketplace.json`, and the
  LICENSE all agree, enforced by an invariant test").
- **Actor:** The maintainer running `release.js`; contributors and
  license/compliance tooling reading `package.json`; every user whose
  `installed_plugins.json` an `/ctoc:update` run touches.
- **Impact:** A `release.js` run either fully syncs all four version-bearing files
  and exits 0, or fails to sync one and exits non-zero (no more silent partial
  sync); `package.json.license` reads the true license; an `/ctoc:update` run with a
  corrupted `installed_plugins.json` never silently erases other plugins'
  registrations.
- **Deliverable:** `release.js` extended to cover `package.json`, exiting non-zero
  on any sync failure and writing atomically; `package.json.license` corrected to
  `PolyForm-Shield-1.0.0`; `update.js` changed to abort or back up rather than
  overwrite `installed_plugins.json` on a parse failure; a version/license
  single-source invariant test.

**Success metric:** `VERSION === package.json.version === plugin.json.version ===
marketplace.json`'s version fields, and `package.json.license ===
"PolyForm-Shield-1.0.0"` (matching `LICENSE` and `marketplace.json`'s license
field) — both enforced by an automated test, not manual inspection.

**Alignment checks:**
1. Does the Goal trace to the parent vision's problem statement? **YES** — vision
   Success Criterion 8 and Findings H9/M7/M9 name this exact defect set.
2. Is the Actor named in the vision's target audience? **YES** — "the CTOC
   maintainer," "contributors and license/compliance tooling" are named verbatim in
   the vision's Target Audience section.
3. Does the Impact describe an observable behavior change? **YES** — a version/
   license field either equals its source of truth or it doesn't; an exit code is
   either 0 or non-zero; `installed_plugins.json` either retains other plugins'
   entries or doesn't.
4. Is the Deliverable scoped to a single functional area? **YES** — the
   release-script sync path, `package.json`'s two fields, and the updater's
   parse-failure handling are one coherent "release/update path" boundary, matching
   the vision's own workstream-9 boundary. No split recommended.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As** compliance tooling / a contributor reading `package.json`, **I want** its
`version` and `license` fields to match `VERSION` and `LICENSE`, **so that** SBOMs,
scanners, and `npm view` report the truth about this software.

**As** the maintainer running `release.js`, **I want** the release to fail loudly
(non-zero exit) on any partial sync and write every JSON target atomically, **so
that** I never ship — or discover after the fact — a split-brain version set.

**As** a CTOC user running `/ctoc:update`, **I want** a transient parse failure on
my `installed_plugins.json` to never be silently replaced with an empty registry,
**so that** my other installed plugins are never deregistered by an unrelated CTOC
update.

### Acceptance Criteria (Given/When/Then)

- [ ] **Scenario: package.json version syncs with release**
  Given `VERSION` contains `X.Y.Z`
  When `release.js` runs successfully
  Then `package.json.version === "X.Y.Z"`, matching `plugin.json.version` and
  `marketplace.json`'s version fields

- [ ] **Scenario: package.json license matches LICENSE**
  Given the `LICENSE` file declares PolyForm Shield License 1.0.0
  When any tool reads `package.json.license`
  Then the value is `"PolyForm-Shield-1.0.0"` (matching
  `marketplace.json.plugins[0].license`), never `"Apache-2.0"`

- [ ] **Scenario: version/license single-source invariant test**
  Given a test run against the repo in its current state
  When the invariant test executes
  Then it asserts `VERSION === package.json.version === plugin.json.version ===
  marketplace.json.metadata.version === marketplace.json.plugins[0].version`, AND
  `package.json.license === "PolyForm-Shield-1.0.0"`

- [ ] **Scenario: mutating one version value fails the invariant test**
  Given the invariant test above is passing
  When any one of `VERSION`, `package.json.version`, `plugin.json.version`, or
  `marketplace.json`'s version fields is changed to a different value (in a test
  fixture, not the real repo file)
  Then the invariant test fails (goes red)

- [ ] **Scenario: release fails loudly on a partial sync failure**
  Given one of the JSON version-file writes fails during a `release.js` run (e.g.
  the target file is read-only or its directory is missing)
  When the run completes
  Then the process exits non-zero, and the failure is reported on stderr naming the
  file that failed to sync

- [ ] **Scenario: release succeeds cleanly reports exit 0**
  Given all JSON version-file writes succeed during a `release.js` run
  When the run completes
  Then the process exits 0

- [ ] **Scenario: atomic write survives a simulated mid-write crash**
  Given a `release.js` write to a JSON version file is interrupted mid-write
  (simulated crash after the temp file is written but before/during the rename)
  When the target file is inspected afterward
  Then it contains either the fully old content or the fully new content — never
  truncated or partial JSON

- [ ] **Scenario: update aborts on an unparseable plugin registry**
  Given `installed_plugins.json` contains bytes that fail `JSON.parse`
  When `/ctoc:update` (`update.js`'s `update()`) runs
  Then it does not write an empty `{ version: 2, plugins: {} }` (or any default)
  over the file — it aborts with a non-zero exit and a clear error message

- [ ] **Scenario: other plugins survive an update after a registry parse failure**
  Given `installed_plugins.json` was unparseable
  When `/ctoc:update` runs and aborts per the scenario above
  Then the original (corrupted) bytes are left completely untouched on disk — no
  plugin registration is silently lost, and the file remains available for manual
  inspection/repair

- [ ] **Scenario: a valid, parseable registry is updated normally**
  Given `installed_plugins.json` parses successfully and contains an entry for
  `some-other-plugin@some-org`
  When `/ctoc:update` runs and updates the `ctoc@robotijn` entry
  Then the `some-other-plugin@some-org` entry is still present, byte-identical, in
  the file afterward

### In Scope

- Add `package.json` to `release.js`'s `JSON_VERSION_FILES` (or equivalent sync
  target list) so its `version` field syncs with `VERSION` on every `release.js`
  run. [criteria: "package.json version syncs with release"]
- Change `release.js`'s partial-sync-failure path to exit non-zero (not 0) and
  report which file failed. [criteria: "release fails loudly on a partial sync
  failure", "release succeeds cleanly reports exit 0"]
- Change `release.js`'s JSON writes to be atomic (temp file + rename) so a
  mid-write crash cannot truncate a target file. [criteria: "atomic write survives
  a simulated mid-write crash"]
- Fix `package.json`'s `license` field value to `"PolyForm-Shield-1.0.0"`.
  [criteria: "package.json license matches LICENSE"]
- Add a version/license single-source invariant test comparing `VERSION`,
  `package.json`, `plugin.json`, `marketplace.json`, and `LICENSE`. [criteria:
  "version/license single-source invariant test", "mutating one version value
  fails the invariant test"]
- Change `update.js`'s `installed_plugins.json` parse-failure handling from
  "silently default to empty" to "abort non-zero, leave file untouched." [criteria:
  "update aborts on an unparseable plugin registry", "other plugins survive an
  update after a registry parse failure"]
- Preserve existing, unrelated plugin registry entries on a normal
  (successfully-parsed) update run — the regression guard for the fix above.
  [criteria: "a valid, parseable registry is updated normally"]

### Out of Scope

- The enforcement hooks and their exit-code semantics (parent vision workstream 1)
  — separate workstream.
- CRLF/frontmatter-parsing portability (workstream 7) — unrelated code path.
- Agent contracts, the registry, or Iron Loop step-agent resolution (workstreams
  3-4) — unrelated.
- Human-gate integrity / approval-provenance ledger (workstream 2) — unrelated to
  release metadata.
- The suite-wide "truthful tests" infrastructure program itself (workstream 6,
  a.k.a. W06) beyond the shared-assertion coordination noted under Test Strategy
  below — W06 owns the general skip-guard/coverage/cross-file-invariant program;
  this stub owns only the version/license invariant specific to its own fix.
- Any documentation-file version-reference updates already handled by
  `release.js`'s existing `VERSION_UPDATES` array (README badge/version
  references) — already working, not touched by this stub.
- Any change to how `marketplace.json`'s or `plugin.json`'s sync already works —
  both already sync correctly today; this stub only adds `package.json` to the
  same mechanism.

### Story Breakdown — INVEST

| Story | I | N | V | E | S | T | Notes |
|---|---|---|---|---|---|---|---|
| Version/license truth (`package.json` syncs + license fix + invariant test) | Y | Y | Y | Y | Y | Y | Independent of the other two stories; drivable by asserting field equality post-`release.js`-run |
| Release fails loudly (non-zero exit + atomic write) | Y | Y | Y | Y | Y | Y | Independent; drivable by injecting a write failure and a simulated mid-write crash |
| Update never destroys the registry (abort on parse failure) | Y | Y | Y | Y | Y | Y | Independent; drivable with an unparseable `installed_plugins.json` fixture |

### Files Likely Touched

- `package.json` — `version` sync target, `license` field fix.
- `src/scripts/release.js` — add `package.json` to `JSON_VERSION_FILES` (or
  equivalent), non-zero exit on sync failure, atomic write (temp file + rename).
- `src/commands/update.js` — `installed_plugins.json` parse-failure handling
  (abort-and-leave-untouched instead of default-and-overwrite).
- A new or existing test file asserting the version/license invariant (exact path
  and whether it is new or shared with W06's infrastructure test file is an
  Implementation Planner decision — see Test Strategy below).

### Test Strategy

This stub's acceptance is driven by a version/license single-source invariant test
(BDD scenarios "version/license single-source invariant test" and "mutating one
version value fails the invariant test" above) asserting `VERSION ===
package.json.version === plugin.json.version === marketplace.json`'s version
fields, and `package.json.license === "PolyForm-Shield-1.0.0"`.

**Coordination with workstream 6 (truthful test suite):** the parent vision
separately calls for the identical comparison as suite-wide infrastructure — a
reusable cross-file invariant helper covering "registry paths resolve, step agents
resolve, version/license single-source, documented counts self-verify, installer-
written paths exist." Here, that same comparison is this stub's ACCEPTANCE test; in
W06 it is generic INFRASTRUCTURE the whole suite reuses. To avoid two
independently-authored, divergently-maintained copies of the same assertion (the
exact failure class this stub exists to fix, reintroduced at the test level):
whichever of this stub or W06's implementation lands first exports the field-by-
field comparison as a single shared, importable assertion function; the other
workstream's test imports and calls it rather than reimplementing the comparison
logic. This is a coordination note for the Implementation Planner, not a scope
boundary — this stub owns shipping the fix plus a passing acceptance test either
way.

Additional coverage: an injected-write-failure test for `release.js`'s non-zero
exit path; a simulated-mid-write-crash test for the atomic-write path; and a
fixture-based unparseable-`installed_plugins.json` test plus a
valid-registry-survives-update regression test for `update.js`'s abort path. Every
test asserts observable behavior (exit code, field values, file bytes, other-
plugin-entry survival) — never internal implementation structure.

## Risks

### Technical Risks

- **Risk:** Adding `package.json` to `release.js`'s sync targets could collide with
  `package.json`'s other fields (`devDependencies`, `scripts`) if the JSON-path
  update logic is misconfigured, corrupting the manifest npm itself depends on to
  install/run CTOC.
  - Likelihood: LOW
  - Impact: HIGH
  - Mitigation: Scope the update to the exact JSON paths `['version']` and
    `['license']`, mirroring the existing `plugin.json` config (`{ path:
    ['version'] }`) exactly; add a test asserting every other `package.json` key is
    byte-identical before and after a sync run.
- **Risk:** Cross-platform atomic writes (temp file + rename) can behave
  differently on Windows (file-locking on rename-over-an-existing-file) than on
  POSIX, potentially reintroducing a Windows-specific write failure.
  - Likelihood: MEDIUM
  - Impact: MEDIUM
  - Mitigation: Use Node's built-in `fs.renameSync` (which already handles the
    POSIX-atomic-rename / Windows-`MoveFileEx` difference internally) rather than a
    hand-rolled rename, and add a test exercising the write path (temp-file
    creation, content, rename) without asserting platform-specific syscall
    behavior.

### Business Risks

- **Risk:** `PolyForm-Shield-1.0.0` is not on the official SPDX license list (it is
  a source-available, non-OSI license with a noncompete clause); tooling that
  strictly validates `package.json.license` against the SPDX list may flag or
  reject the value.
  - Likelihood: MEDIUM
  - Impact: LOW
  - Mitigation: Match the exact string `marketplace.json.plugins[0].license`
    already uses (`"PolyForm-Shield-1.0.0"`) for consistency with the repo's own
    existing metadata rather than inventing a different string — this is a
    pre-existing, already-shipped convention, not a new decision introduced by
    this stub.

### Dependency Risks

- **Risk:** This stub's invariant test and workstream 6's suite-wide invariant
  infrastructure could each independently implement the same version/license
  comparison, producing two copies that drift from each other over time — the
  exact defect class this stub exists to fix, recreated at the test level.
  - Likelihood: MEDIUM
  - Impact: MEDIUM
  - Mitigation: Coordinate at the Implementation Planner stage — whichever of this
    stub or workstream 6 lands first exports a single shared comparison function;
    the other imports it rather than reimplementing it. Documented above under
    Test Strategy.

## Priority

**Priority: MEDIUM** (Score: 6/9)
- Dependency: MEDIUM (2) — this stub runs in parallel with the parent vision's
  other ten workstreams; nothing depends on it shipping first, and it depends on
  nothing (the vision's dependency graph names only workstream 1, "enforcement
  actually blocks," as a technical prerequisite for other fixes' observability —
  this stub is not on that chain).
- Business Impact: MEDIUM (2) — supports the vision's overall trustworthy-gates
  goal and is explicitly named as vision Success Criterion 8, but is not the
  vision's primary/blocking goal (that is workstream 1).
- Technical Risk: MEDIUM (2) — well-understood JSON I/O and error-handling
  changes, no new technology, but cross-platform atomic writes and the
  shared-assertion coordination with workstream 6 add moderate complexity beyond a
  trivial field edit.

## Decisions Taken Under Ambiguity

- **No Business Model Canvas.** No canvas exists at
  `plans/canvas/ctoc-self-audit-remediation.md`. This is a technical remediation
  vision; a BMC is N/A. Recorded here and proceeding — no kickback.
- **SPDX license identifier — re-verified.**
  `marketplace.json.plugins[0].license` already carries `"PolyForm-Shield-1.0.0"`
  (confirmed live, `.claude-plugin/marketplace.json:21`) — this stub's fix to
  `package.json.license` uses the identical string for consistency with the
  repo's own existing metadata, not a newly-invented value. PolyForm Shield 1.0.0
  is not on the official SPDX license list (source-available, non-OSI, with a
  noncompete clause), so `"PolyForm-Shield-1.0.0"` is a project convention, not a
  registered SPDX id — flagged under Business Risks above, but it is the correct,
  already-established value to match `LICENSE` and `marketplace.json`.
- **`update.js` failure mode — PINNED.** Abort (exit non-zero) and leave
  `installed_plugins.json` completely untouched on a parse failure, rather than
  writing a `.bak` first. Rationale: (1) it requires zero new file-write logic —
  the safest possible fix touches the file exactly as much as before this fix
  (never), eliminating any risk of a backup-write itself failing or corrupting
  something; (2) it matches this stub's own philosophy applied to `release.js`
  (fail loudly rather than partially write) — the update path should fail loudly
  rather than partially write too; (3) the corrupted file is left in place for the
  user to inspect or repair, which a `.bak`-then-overwrite approach would also
  achieve but with strictly more moving parts for no added safety. This resolves
  the prior draft's open either/or (abort vs. backup-then-proceed) so the
  Implementation Planner has one concrete path to build, per the acceptance
  criteria "update aborts on an unparseable plugin registry" and "other plugins
  survive an update after a registry parse failure" above.
