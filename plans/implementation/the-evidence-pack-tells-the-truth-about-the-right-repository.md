---
title: "The evidence pack tells the truth about the right repository — five defects in the compliance archiver, fixed"
type: functional
status: functional
created: 2026-09-03
priority: high
effort: medium
files:
  - src/scripts/evidence-pack.js
  - tests/evidence-pack-main.test.js
  - tests/evidence-pack-collect.test.js
  - tests/evidence-pack-security.test.js
approved_by: human
approved_at: 2026-09-03T11:09:33.334Z
gate_crossed: functional → implementation
---

# The evidence pack tells the truth about the right repository — slice index

One script and its three test files are one unit of work, so this plan has a
single slice.

## Slices (dependency-ordered)

| # | Slice file | Scope (one line) | depends_on |
|---|---|---|---|
| 1 | `00258-the-evidence-pack-tells-the-truth-about-the-right-repository-s1-five-fixes.md` | All five fixes in `src/scripts/evidence-pack.js` — root precedence with a loud refusal, the manifest as the archive's first member, a non-zero exit when tar is absent, a parseable manifest, and the window bound to every collector — with the pinning cases in the three test files tightened to the fixed contract. | – |

### What the slice found that this plan did not

Both corrections were established by reading the current files; the slice builds
to its own numbers where they disagree with the text below.

- **Three collectors ignore the window, not two.** The audit chain log, the
  provenance event log and each version's baseline manifest all push
  unconditionally. The wave's report missed the provenance collector because no
  fixture ever seeded `.ctoc/ai-provenance.jsonl`.
- **Six cases in `tests/evidence-pack-main.test.js` encode pinned behaviour, not
  three** — one per defect, plus a second case pinning the malformed window bytes
  and a case pinning the wrong-repository default by name.

---

## Original functional plan

## 1. ASSESS — Problem Understanding

`src/scripts/evidence-pack.js` gathers audit inputs (dispatches, chain head,
active regimes, baselines) over a time window and packs a tar evidence archive —
a compliance artifact for a regulatory regime. The coverage wave's first slice
ran it under a test for the first time and found five defects, each pinned as
current behaviour at the time (fixing them was out of that slice's scope and the
human has now ordered the fix — that order is the contract change that permits
tightening the pinning tests):

1. **It describes the wrong repository when installed.** `ROOT` comes from
   `path.resolve(__dirname, '..', '..')` — the script's own location. From a
   source checkout that is the repo; installed from the marketplace it is the
   **plugin cache**, so the evidence pack describes the plugin, not the user's
   project. The `CTOC_EVIDENCE_ROOT` seam added by the wave is inert when unset,
   so every installed invocation is wrong by default.
2. **The archive does not contain its own manifest.** `main()` writes
   `manifest.yaml` beside the archive but tars only the inputs — the artifact
   meant to stand alone cannot state what it contains.
3. **A missing `tar` exits 0.** The command prints "tar failed (…); writing JSON
   bundle instead." and succeeds — a compliance artifact silently degrading its
   promised format is a silent failure (red line: no silent failures).
4. **`manifest.yaml` is not parseable YAML.** Found by running it:
   `window:  since: …` collapsed onto one line and `active_regulatory_regimes:[]`
   without a space — js-yaml refuses the file. A machine-readable manifest that
   no machine can read.
5. **Two of the eight collectors ignore the `--since`/`--until` window**, so a
   pack claims a window its contents do not honour.

## 2. ALIGN — Approach

1. **Root resolution becomes explicit and fails loudly** (replacing the
   `__dirname` default): precedence `CTOC_EVIDENCE_ROOT` (existing seam,
   unchanged) → `process.cwd()` **when it contains a `.ctoc/` directory** → a
   loud non-zero failure naming both rules ("run from the project root, or set
   CTOC_EVIDENCE_ROOT"). From a source checkout the behaviour is unchanged (cwd
   is the repo); installed, the pack now describes the user's project; from an
   unrelated directory it refuses instead of packing the wrong thing.
2. **The manifest goes into the archive** — `manifest.yaml` is the first member.
3. **`tar` absent fails loudly:** the JSON bundle is still written as
   best-effort salvage, but the process exits non-zero and the message names the
   degradation ("archive NOT produced in the promised format").
4. **The manifest becomes valid YAML** — nested `window:` block, a space after
   every colon; proven by parsing it back with the repository's YAML reader in a
   test (round-trip, not eyeball).
5. **Every collector honours the window.** The two window-blind collectors are
   identified by reading the file at build time and filtered by the same
   `sinceMs`/`untilMs` bounds the other six use.

**Test policy (Operating Lesson 14, justified):** the wave's
`tests/evidence-pack-main.test.js` deliberately pinned defects 2, 3 and 4 as
current behaviour, each case commented as a pin. Those cases are **tightened to
the fixed contract** — the contract change comes from outside the tests (this
human-ordered plan); each replacement asserts strictly more (manifest present in
the member list; exit non-zero on missing tar with the bundle still written;
manifest parses). No unrelated assertion is weakened.

### Scope

**In scope:** the five fixes in `src/scripts/evidence-pack.js`; tightening the
three pinning cases; new red-first cases for root resolution (cwd-with-`.ctoc`
selected; unrelated-cwd refusal), window enforcement on the two fixed
collectors, manifest round-trip parse, archive membership, and the tar-absent
exit code.

**Out of scope:** the reachability-roots entry for the script (it already
exists; its missing `reasons` note is a one-line cleanup allowed but not
required), any change to what counts as an input, retention or signing features,
and any scheduler wiring.

## 3. CAPTURE — Acceptance Criteria

```gherkin
Feature: The evidence pack is a truthful, standalone compliance artifact

  Scenario: The pack describes the caller's project
    Given the command runs with a working directory containing .ctoc/
    When no CTOC_EVIDENCE_ROOT is set
    Then the collected inputs come from that working directory

  Scenario: The pack refuses the wrong directory
    Given a working directory with no .ctoc/ and no CTOC_EVIDENCE_ROOT
    Then the command exits non-zero naming both resolution rules
    And nothing is written

  Scenario: The archive stands alone
    Then manifest.yaml is a member of the tar archive

  Scenario: A degraded format is loud
    Given tar is absent from PATH
    Then the JSON bundle is still written
    And the exit code is non-zero and the message names the degradation

  Scenario: The manifest is machine-readable
    Then manifest.yaml parses with the repository's YAML reader
    And the parsed window equals the requested --since/--until

  Scenario: The window binds every collector
    Given inputs inside and outside the window for each collector
    Then only in-window inputs appear in the manifest and archive

  Scenario: The gate holds
    When npm test runs
    Then fail 0, skipped 0, coverage at or above the floor
```

**Definition of Done:** all five fixes shipped; the three pins tightened with
stated justification in the slice's Decisions; red-first cases for every
scenario; `npm test` green; no assertion weakened, no baseline touched.

## Notes for the implementation planner

One slice (one script + its three test files are one unit). Verify at read time
which two collectors are window-blind — name them by function, do not trust this
plan's memory. Do NOT write an `## Execution Plan` section of your own. Mind
`tests/evidence-pack-security.test.js` and `tests/evidence-pack-collect.test.js`:
their existing assertions must stay green or be tightened with justification.

## Decisions Taken Under Ambiguity

1. **cwd-with-`.ctoc` over cwd-unconditional:** an unconditional cwd would pack
   an arbitrary directory when invoked from the wrong place; requiring `.ctoc/`
   makes the wrong invocation refuse instead of lie.
2. **Keep the JSON bundle on tar failure, but exit non-zero:** salvage is
   valuable in an incident; the exit code is what schedulers and humans read,
   and it must not say success for a degraded artifact.
