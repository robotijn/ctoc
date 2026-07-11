---
title: "W07 — Cross-Platform Correctness"
created: "2026-07-11T00:00:00Z"
type: stub
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: MEDIUM
status: stub
depends_on: none
---

# W07 — Cross-Platform Correctness

## Problem

The frontmatter parsers require a bare LF immediately after the opening `---`
(`/^---\n/`). On Windows with git's default `autocrlf=true`, every plan is checked
out with CRLF line endings, so `---\r\n` never matches `/^---\n/` and **every plan
parses as `{}`**. With empty frontmatter, the enforcement hook's `files:` coverage
resolves to nothing, so it covers no plan and **blocks every plan-covered edit** — a
full Windows lockout of the exact guardrail CTOC exists to provide.

Confirmed affected parsers (require `\n`, or `.split('\n')` a frontmatter block):
`plan-coverage.js:79/86`, `state.js:59/63`, `plan-index/sync-unit.js:59`,
`metrics-loop.js:567/573`, plus 8 more. The repo already ships the correct CRLF-safe
pattern in `stale-detector.js` and `human-gate-check.js` — the fix is to apply that
same pattern to the parsers that missed it.

Two more POSIX-only defects on hot paths compound the Windows breakage:
- **Shell-outs** that assume a POSIX shell: `sast-runner.js:355`
  (`2>/dev/null || true`) and `runner-detect.js:93` (`df | tail`) — neither is valid
  under `cmd.exe`.
- **`process.env.HOME`** used where `os.homedir()` is required:
  `agent-critic-loop.js:44` throws at module load on Windows (HOME is undefined), and
  `grading-system.js:32` resolves to `C:\tmp`.

## Scope

- Replace `/^---\n/` with `/^---\r?\n/` and frontmatter `.split('\n')` with
  `.split(/\r?\n/)` across the missed parsers (plan-coverage, state, sync-unit,
  metrics-loop, and the other 8), matching the pattern already used in
  stale-detector.js and human-gate-check.js.
- Replace POSIX-only shell-outs with `execFileSync` argument-arrays and
  `stdio: 'ignore'` (no shell string interpolation, no `2>/dev/null`, no `| tail`).
- Replace `process.env.HOME` with `os.homedir()` at both call sites.

**Does NOT touch:** enforcement exit-code semantics (W01), the escape-phrase matcher
or project-root walk (W08), release/metadata sync (W09), or any agent-contract or
gate-integrity code. Line-ending handling only where a parser or hot-path shell-out
is provably non-portable.

## Story Map

**Goal:** A plan authored or checked out on any OS parses identically, and no hot
path shells out to a POSIX-only construct — so Windows users are never locked out.
- **Actor:** Cross-platform (Windows) CTOC user and the enforcement hook that reads
  their plans.
- **Impact:** A CRLF-checked-out repo behaves exactly like an LF one; enforcement
  coverage resolves and hot paths run under `cmd.exe`.
- **Success metric:** A CRLF-checked-out plan yields byte-identical parsed
  frontmatter to its LF twin; zero POSIX-only shell-outs remain on hot paths.

### Activity 1 — Parse frontmatter regardless of line ending
- `[MVP]` As the enforcement hook, I want to parse a CRLF-authored plan's
  frontmatter identically to its LF twin, so that plan coverage resolves and Windows
  users are not locked out of every plan-covered edit.
  - Acceptance: swapping `\n`→`\r?\n` in the 12 parsers makes a CRLF fixture parse to
    the same object as its LF fixture.
- As a maintainer, I want the CRLF-safe pattern applied consistently across all
  frontmatter parsers, so that no future parser silently re-introduces the `\n`-only
  bug.

### Activity 2 — Run hot-path shell-outs portably
- `[MVP]` As a Windows user, I want the SAST runner and disk-space probe to run
  without a POSIX shell, so that a scan or runner-detect does not throw under
  `cmd.exe`.
  - Acceptance: `sast-runner.js` and `runner-detect.js` invoke `execFileSync` with an
    argument array and `stdio: 'ignore'`; no string contains `2>/dev/null` or
    `| tail`.

### Activity 3 — Resolve the home directory portably
- As a Windows user, I want home-directory lookups to use `os.homedir()`, so that
  `agent-critic-loop.js` loads without throwing and temp paths do not resolve to a
  bogus `C:\tmp`.
  - Acceptance: `process.env.HOME` no longer appears at either call site;
    `os.homedir()` is used and the module loads on a platform where `HOME` is unset.

## Rough acceptance criteria (Given / When / Then)

1. **CRLF parity (headline).** Given a plan file whose bytes use CRLF line endings,
   When any of the 12 frontmatter parsers reads it, Then the parsed frontmatter object
   equals the object parsed from the byte-for-byte LF twin of the same file.
2. **Coverage survives CRLF.** Given a CRLF-checked-out plan declaring
   `files: ["src/foo.js"]`, When the enforcement hook computes coverage, Then
   `src/foo.js` is covered (not treated as `{}` / uncovered).
3. **No POSIX shell-out on hot paths.** Given the SAST runner and runner-detect run
   on a shell-less spawn, When they execute, Then they complete via `execFileSync`
   arg-arrays with `stdio: 'ignore'` and no `2>/dev/null` / `df | tail` string is
   present in source.
4. **Home resolves without HOME.** Given an environment where `process.env.HOME` is
   undefined, When `agent-critic-loop.js` is required, Then it loads without throwing
   and any temp path derives from `os.homedir()`.

## Findings addressed

- **H1** — CRLF checkout locks Windows users out (frontmatter parsers require `\n`).
- **M13** — POSIX-only shell-outs (`2>/dev/null || true`, `df | tail`).
- **M22** — `process.env.HOME` used where `os.homedir()` is required.

## INVEST status

| Story | I | N | V | E | S | T | Notes |
|---|---|---|---|---|---|---|---|
| A1 MVP — CRLF-safe parse | Y | Y | Y | Y | Y | Y | Independent of W01/W08/W09; ~12 one-line regex/split edits |
| A1 — consistent pattern | Y | Y | Y | Y | Y | Y | Guards regression; testable by grep + fixture |
| A2 MVP — portable shell-outs | Y | Y | Y | Y | Y | Y | Two call sites; drivable by asserting no shell string |
| A2/A3 — os.homedir() | Y | Y | Y | Y | Y | Y | Two call sites; drivable with HOME unset |

## Decisions Taken Under Ambiguity

- **No Business Model Canvas.** No canvas exists at
  `plans/canvas/ctoc-self-audit-remediation.md`. This is a technical remediation
  vision; a BMC is N/A. Recorded here and proceeding — no kickback.
- **Regex over full CRLF normalization.** Chose the minimal `\r?\n` regex/`split`
  change (matching the existing stale-detector.js / human-gate-check.js pattern)
  rather than normalizing every file to LF on read, to keep the change surgical and
  avoid altering byte content the enforcement hash may later depend on.
