---
title: "VP1 — Resolve created-file claims against the plan's files: declaration"
type: functional
status: functional
created: 2026-07-07
program: ctoc-pipeline-hygiene
priority: MEDIUM
files:
  - src/lib/plan-validator.js
  - tests/plan-validator.test.js
---

# VP1 — Resolve created-file claims against the plan's files: declaration

> Found while shipping OM2 (2026-07-07): a complete, correct plan was falsely blocked
> at Gate 3 (completeExecution → validateForReview) because its prose said
> "create `guard-files.js`" (bare basename) while the file lives at
> `src/hooks/guard-files.js`. Same false-positive CLASS as the v6.9.86 code-fence fix.

## 1. ASSESS — Problem Understanding

`validateNoContradictions` (`src/lib/plan-validator.js:302`) scans plan prose with
`createdFilePattern = /(?:created?|added?|new file)[:\s]*[`"]?([^\s`"'(),]+\.[a-z0-9]+)[`"]?/gi`
and, for each captured filename, checks existence at `path.join(projectPath, filePath)`
— i.e. the PROJECT ROOT. A plan that legitimately creates `src/hooks/guard-files.js`
but refers to it in prose by its bare basename (`create \`guard-files.js\``) resolves to
`<root>/guard-files.js`, which does not exist → hard error "claimed as created but
doesn't exist", blocking an otherwise-complete plan. The plan's `files:` frontmatter
ALREADY declares the authoritative path (`src/hooks/guard-files.js`) — the validator
just doesn't consult it. Today the only workaround is to hand-edit every prose mention
to a full path (what OM2 had to do, twice).

## 2. ALIGN — Business Alignment

The `files:` frontmatter is the authoritative declaration of what a plan creates.
A created-file claim in prose should be validated AGAINST that declaration: if a
claimed basename matches the basename of a declared file that EXISTS on disk, the claim
is satisfied — regardless of the prose's path precision. Only claims that match NO
declared file AND don't exist at the resolved path are real contradictions. This kills
the false-positive without weakening the genuine check (a plan claiming to create a file
it neither declares nor wrote still errors).

## 3. CAPTURE — Acceptance Criteria (BDD)

- [ ] **Scenario: bare-basename claim resolved via files: declaration**
  Given a plan whose `files:` declares `src/hooks/guard-files.js` (present on disk)
  And whose prose says "create `guard-files.js`" (bare basename)
  When `validateNoContradictions` runs
  Then NO "claimed as created but doesn't exist" error is raised for it

- [ ] **Scenario: genuine missing-file claim still errors**
  Given a plan whose prose claims "create `nowhere.js`"
  And `nowhere.js` is neither declared in `files:` nor present at project root
  When the validator runs
  Then the "claimed as created but doesn't exist" error IS raised

- [ ] **Scenario: full-path claim still works unchanged**
  Given a plan claiming "create `src/hooks/guard-files.js`" (present)
  Then it validates clean (no regression to the existing path-resolution behavior)

- [ ] **Scenario: basename collision is safe**
  Given `files:` declares `src/a/util.js` (present) and prose claims "create `util.js`"
  Then the claim is satisfied by the declared+existing file (basename match against the
  files: list, not a blind root check)

## Scope

**In:**
- `src/lib/plan-validator.js` — in `validateNoContradictions`, when a claimed filename
  does NOT exist at its resolved path, fall back to matching its basename against the
  plan's parsed `files:` declaration; if a declared file with that basename EXISTS,
  treat the claim as satisfied. Parse `files:` from the plan frontmatter (reuse the
  existing metadata parser). Keep the fenced-code-strip already in place.
- `tests/plan-validator.test.js` — the 4 BDD scenarios above; assert the OM2-shape
  (bare basename + subpath declaration) no longer false-blocks, and the genuine
  missing-file case still errors.

**Out:**
- Broadening the prose regex itself (keep it; the fix is the files:-declaration fallback).
- The script-existence Pattern 2 check (separate; only fix the created-file Pattern 1
  unless the same false-positive is proven there too).

## Decisions Taken

- **D-VP1-1:** the `files:` declaration is authoritative; a created-file prose claim is
  satisfied if its basename matches a declared file that exists — this is the minimal,
  correct fix and mirrors how the enforcement hook already trusts `files:`.
- **D-VP1-2:** do not weaken the genuine check — a claim matching no declared file and
  absent on disk still errors (prevents silent stub/no-op claims, the original intent).
