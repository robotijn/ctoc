---
title: "W09 — Release and Metadata Truth"
created: "2026-07-11T00:00:00Z"
type: stub
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: MEDIUM
status: stub
depends_on: none
---

# W09 — Release and Metadata Truth

## Problem

CTOC's release metadata lies to every tool that reads it, and the release path can
ship an inconsistent set or destroy unrelated state:

- **Version drift.** `package.json` reports `6.9.49` while `VERSION` is `6.10.3`.
  `release.js` claims to sync "all JSON files" but never touches `package.json`.
- **Wrong license.** `package.json` declares `Apache-2.0`, but the actual `LICENSE`
  file and the marketplace metadata are **PolyForm Shield 1.0.0**. Every SBOM
  generator and license scanner reads `package.json`, so every downstream compliance
  report is wrong.
- **Silent partial sync.** `release.js` logs per-file sync errors but **exits 0**, so
  a run that half-updated the version set still reports success and ships an
  inconsistent release. It also writes files non-atomically (a crash mid-write leaves
  a truncated JSON).
- **Destructive updater.** `update.js` reads `installed_plugins.json`; if that file
  is momentarily unparseable, it substitutes an **empty default and writes it back**,
  deregistering *every other installed plugin*.

## Scope

- Add `package.json` to `release.js`'s `JSON_VERSION_FILES` so its version syncs with
  `VERSION`, `plugin.json`, and `marketplace.json`.
- Make `release.js` **exit non-zero** on any sync failure (no more green-on-partial)
  and write each JSON file **atomically** (temp file + rename).
- Fix `package.json`'s `license` field to `PolyForm-Shield-1.0.0` to match the
  `LICENSE` file and marketplace metadata.
- Make `update.js` **abort (or back up) rather than clobber** `installed_plugins.json`
  when it fails to parse — never write an empty default over a live registry.

**Does NOT touch:** the enforcement hooks (W01/W08), CRLF/shell-out portability
(W07), agent contracts, or the human gates. This workstream is scoped to the release
script, the updater's file-safety, and the two `package.json` fields.

## Story Map

**Goal:** Every metadata source agrees, a release fails loudly rather than shipping a
split-brain version set, and an update never destroys the plugin registry.
- **Actor:** Contributors and license/compliance tooling that read `package.json`;
  the maintainer running `release.js`; every user whose `installed_plugins.json` an
  update touches.
- **Impact:** SBOMs and scanners read the correct license/version; a partial release
  aborts; an update failure is non-destructive.
- **Success metric:** VERSION, `package.json`, `plugin.json`, and `marketplace.json`
  versions are all equal, enforced by an invariant test; `license` matches `LICENSE`.

### Activity 1 — One version, one license, everywhere
- `[MVP]` As compliance tooling, I want `package.json` to carry the same version as
  `VERSION` and the correct PolyForm Shield license, so that every SBOM and scanner
  reports the truth.
  - Acceptance: after `release.js` runs, `package.json.version === VERSION` and
    `package.json.license === "PolyForm-Shield-1.0.0"`.
- As a maintainer, I want an invariant test that fails when any of VERSION,
  `package.json`, `plugin.json`, `marketplace.json` disagree, so that drift is caught
  before ship.
  - Acceptance: mutating any one version value makes the invariant test go red.

### Activity 2 — A release fails loudly, not partially
- `[MVP]` As a maintainer, I want `release.js` to exit non-zero and write atomically
  on any sync failure, so that I never ship a half-synced, inconsistent version set.
  - Acceptance: injecting a write failure on one target makes `release.js` exit
    non-zero; a simulated mid-write crash leaves the original file intact (temp +
    rename), never truncated.

### Activity 3 — An update never destroys the registry
- `[MVP]` As a user, I want `update.js` to abort or back up rather than overwrite
  `installed_plugins.json` when it cannot parse it, so that a transient parse error
  does not deregister my other plugins.
  - Acceptance: given an unparseable `installed_plugins.json`, `update.js` does not
    write an empty default over it — it aborts (non-zero) or writes a `.bak` and
    leaves the original bytes.

## Rough acceptance criteria (Given / When / Then)

1. **Version single-source (headline).** Given `VERSION` is `X.Y.Z`, When `release.js`
   runs, Then `package.json`, `plugin.json`, and `marketplace.json` all report `X.Y.Z`
   and an invariant test asserts all four are equal.
2. **License truth.** Given the `LICENSE` file is PolyForm Shield 1.0.0, When a scanner
   reads `package.json`, Then `license === "PolyForm-Shield-1.0.0"` (not `Apache-2.0`).
3. **Loud partial-failure.** Given one version-file write fails during `release.js`,
   When the run completes, Then the process exits non-zero (not 0).
4. **Atomic write.** Given a crash is simulated mid-write of a version file, When the
   process is interrupted, Then the target file is either fully old or fully new,
   never truncated (temp-file + rename).
5. **Non-destructive update.** Given `installed_plugins.json` is unparseable, When
   `update.js` runs, Then it does not replace the file with an empty default; the
   original registry entries are preserved (aborted or backed up).

## Findings addressed

- **H9** — `release.js` logs sync errors but exits 0 (ships an inconsistent version
  set) and writes non-atomically.
- **M7** — `package.json` version (6.9.49) and license (Apache-2.0) disagree with
  `VERSION` (6.10.3) and the actual PolyForm Shield 1.0.0 license.
- **M9** — `update.js` clobbers `installed_plugins.json` with an empty default on a
  parse error, deregistering every other plugin.

## INVEST status

| Story | I | N | V | E | S | T | Notes |
|---|---|---|---|---|---|---|---|
| A1 MVP — sync version + license | Y | Y | Y | Y | Y | Y | Independent; drivable by asserting field equality post-run |
| A1 — invariant test | Y | Y | Y | Y | Y | Y | The truthful-test half; mutating a value goes red |
| A2 MVP — exit non-zero + atomic | Y | Y | Y | Y | Y | Y | Independent; drivable by injecting a write failure |
| A3 MVP — non-destructive update | Y | Y | Y | Y | Y | Y | Independent; drivable with an unparseable fixture |

## Decisions Taken Under Ambiguity

- **No Business Model Canvas.** No canvas exists at
  `plans/canvas/ctoc-self-audit-remediation.md`. This is a technical remediation
  vision; a BMC is N/A. Recorded here and proceeding — no kickback.
- **SPDX license identifier.** Used `PolyForm-Shield-1.0.0` (the SPDX-form identifier)
  for the `package.json` `license` field so scanners resolve it; the `LICENSE` file
  and marketplace metadata are the source of truth this must match.
- **update.js failure mode.** Left "abort (non-zero)" vs "write `.bak` then proceed"
  as an acceptance-level either/or for the Product Owner to pin — both satisfy the
  non-destructive invariant; the hard requirement is *never* overwrite the live
  registry with an empty default.
