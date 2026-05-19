---
name: changelog-generator
description: Auto-generates changelogs from commits and PRs — Keep a Changelog 1.1 + Conventional Commits, semver-driven, breaking-change-first, generated-and-curated hybrid.
type: skill
when_to_load:
  - "changelog"
  - "release notes"
  - "what changed"
  - "generate changelog"
  - "version bump notes"
  - "breaking changes"
  - "migration guide"
  - "release notes draft"
related_skills:
  - documentation/documentation-updater
  - versioning/backwards-compatibility-checker
effort_level: low
model_optimized_for: opus-4-7
tools: Bash, Read
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Changelog Generator (skill)

> Converted from agents/documentation/changelog-generator.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You generate changelogs from commit history and PR descriptions. You enforce Keep a Changelog 1.1 structure, parse Conventional Commits, derive the semver bump deterministically, and surface every breaking change with a migration guide. Generation produces a **draft** — a human curates copy before release. Internal-only items never leak into the public changelog.

## 2026 Best Practices (Documentation category)

- **Keep a Changelog 1.1 is the format**: six canonical sections in this order — `Added` · `Changed` · `Deprecated` · `Removed` · `Fixed` · `Security`. Breaking changes either get their own `### BREAKING CHANGES` section at the top of the release, or each breaking entry is prefixed `**BREAKING:**` inside the relevant section. The 1.1 spec emphasizes human-curated, user-facing notes over raw commit dumps.
- **Conventional Commits parsed for changeset, not blindly dumped**: a parser turns `feat:` → `Added`, `fix:` → `Fixed`, `refactor:` / `perf:` / `style:` / `test:` / `chore:` / `ci:` / `build:` / `docs:` → `Changed` (or excluded from public changelog). Footer `BREAKING CHANGE:` or `!` after the type (e.g. `feat!:`) triggers a major bump and a `BREAKING CHANGES` entry.
- **Semver-driven version bump**: derive the bump from parsed commits, not from human guessing. `feat` → minor, `fix`/`perf`/`refactor` → patch, anything with `BREAKING CHANGE` or `!` → major. A single `feat!` outranks 50 `fix`es.
- **Generated-and-curated hybrid (not pure-generated, not pure-manual)**: the tool drafts; a human edits headlines, removes internal noise, adds migration guides, reorders by user impact. Pure-generated changelogs read like commit logs and lose readers; pure-manual changelogs go stale.
- **Breaking changes are prominent and migration-paired**: every entry tagged `BREAKING` MUST include a migration guide (before → after code snippet, or link to a longer migration doc). A breaking change without a migration guide is a defect.
- **Task-first framing**: lead each release with what users can DO, not which file changed. `Added: log in with Google` beats `Added: GoogleAuthProvider class in src/auth/providers/google.ts`.
- **Internal-only items stay internal**: `chore:`, `ci:`, `build:`, `test:`, `refactor:` (unless user-visible) are excluded from the public changelog. Optionally surfaced in an `INTERNAL.md` or commit log link.
- **AI-readable docs**: structured headings, code-fenced examples, explicit input/output. AI agents (and search engines) parse Keep-a-Changelog headings reliably; arbitrary prose breaks tooling.
- **Markdown over WYSIWYG**: diffs stay reviewable in PRs.
- **One source of truth, one location**: `CHANGELOG.md` at repo root, mirrored to release tags. Don't fork a docs-site copy that drifts. In **monorepos**, each published package gets its own `CHANGELOG.md` inside the package folder (`packages/foo/CHANGELOG.md`) — a single root changelog hides per-package semver and breaks consumers who depend on individual packages.

## Categories (what to flag)

A draft changelog is wrong — and the skill emits a `critical` letter — if any of these are true:

- **No changelog file** at repo root for a versioned project. Users have no way to see what changed.
- **Generated-only with no human curation**: every entry is a verbatim commit subject. Indicates the workflow has no review step. Risk: noise dominates, internal refactors leak, no migration guides for breaks.
- **Missing BREAKING CHANGES callout for a major bump**: version went `1.x` → `2.0` but no entry is tagged breaking. Either the bump is wrong, or breaks are hidden.
- **Missing migration guide for a breaking change**: a `BREAKING` entry exists but has no before/after example or migration link. Users will hit it at upgrade time with no recourse.
- **Internal-only items leaked into the public changelog**: `chore(deps): bump prettier from 3.0.1 to 3.0.2` in user-facing notes. Buries the signal under noise.
- **Missing SECURITY section for vulnerability fixes**: a CVE was patched but no `### Security` entry. Users running vulnerable versions don't know to upgrade. Also breaks CVE scanners that key off changelog parsing.
- **Wrong section names** (`### New features` instead of `### Added`, `### Bug fixes` instead of `### Fixed`). Breaks parsers (release-drafter, conventional-changelog) and AI search.
- **Date missing or non-ISO** (`### [2.3.0] - Jan 2026`). Spec requires `YYYY-MM-DD`.
- **Unreleased section absent**: spec mandates an `## [Unreleased]` section at the top to accumulate pending changes between releases.
- **Reverse-chronological order violated**: newest releases must be at the top.
- **Semver version skipped or wrong**: bumping `1.4.0` → `1.6.0` (skipping `1.5.0`), or bumping minor when a `feat!` exists (should be major).

## Commands

```bash
# Get commits since last tag
git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:"%H|%s|%b" --no-merges

# conventional-changelog (Angular preset → Keep a Changelog-ish output)
npx conventional-changelog -p angular -i CHANGELOG.md -s

# semantic-release (dry-run shows next version + changelog)
npx semantic-release --dry-run

# Changesets (monorepo-friendly, intent-based)
npx changeset                # author writes the changeset
npx changeset version        # consume changesets → bump versions + write CHANGELOG.md
npx changeset publish        # publish + tag

# release-please (Google — generates release PRs)
npx release-please release-pr --token=$GITHUB_TOKEN --repo-url=$REPO

# git-cliff (Rust, language-agnostic, highly templatable)
git cliff --tag v2.3.0 --output CHANGELOG.md

# Python — commitizen
cz bump --changelog                # bump version + update CHANGELOG.md
# Python — towncrier (news-fragment workflow used by Twisted, pip, attrs)
towncrier build --version 2.3.0

# Validate Keep a Changelog 1.1 structure
npx keep-a-changelog-cli validate CHANGELOG.md   # community tool; alternatives exist
```

## Conventional Commits → Keep a Changelog Section + Semver

| Conventional type | Keep-a-Changelog section | Semver bump | Public? |
|---|---|---|---|
| `feat:` | Added | MINOR | yes |
| `fix:` | Fixed | PATCH | yes |
| `perf:` | Changed | PATCH | yes |
| `refactor:` | Changed (only if user-visible) | PATCH | conditional |
| `revert:` | matches the reverted commit's section (mark as "Reverted: …") | inverse of original (revert of `feat` → patch; revert of `fix` → patch; revert of breaking change → major) | yes |
| `docs:` | excluded (or Changed if user-facing docs) | PATCH | conditional |
| `style:` | excluded | PATCH | no |
| `test:` | excluded | PATCH | no |
| `build:` / `ci:` / `chore:` | excluded | PATCH | no |
| `feat!:` or `BREAKING CHANGE:` footer | BREAKING CHANGES (+ original section) | **MAJOR** | yes — always |
| `deprecate:` (non-standard but used) | Deprecated | MINOR | yes |
| removed API | Removed | MAJOR | yes |
| security fix (`fix(security):` or CVE in footer) | Security | PATCH (or MAJOR if API change) | yes — always |

## Keep a Changelog 1.1 Format

```markdown
# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Webhook retry policy with exponential backoff (#312)

## [2.3.0] - 2026-05-19

### BREAKING CHANGES
- Removed deprecated `/api/v1` endpoints (#260)
  - **Migration**: update API calls to `/api/v2`. The path is identical; only the version prefix changed.
  - **Before**: `GET /api/v1/users/42`
  - **After**:  `GET /api/v2/users/42`
  - **Why**: v1 lacked the per-field permission model added in 2.0.

### Added
- OAuth2 login via Google, GitHub, Microsoft (#234)
- Webhook signature verification (HMAC-SHA256) (#241)

### Changed
- Payment processing now uses Stripe API v3, with idempotency keys on all charge creations (#245)

### Deprecated
- `User.legacyId` — will be removed in 3.0. Use `User.publicId`.

### Removed
- `/api/v1` endpoints (see BREAKING CHANGES above)

### Fixed
- Race condition in WebSocket reconnect causing duplicate messages (#251)
- Timezone off-by-one when daylight-saving boundary crossed mid-session (#258)

### Security
- Updated `node-jsonwebtoken` to 9.0.2 to patch [CVE-2026-1234](https://...) — algorithm-confusion attack on `alg: none` tokens.

[Unreleased]: https://github.com/org/repo/compare/v2.3.0...HEAD
[2.3.0]: https://github.com/org/repo/compare/v2.2.0...v2.3.0
```

## Output Format

```markdown
## Changelog Generation Report

### Version Analysis
| Current | Recommended | Reason |
|---------|-------------|--------|
| 2.2.0 | 3.0.0 | 1 breaking change present (`feat!: replace /api/v1 with /api/v2`) — major bump required |

### Commits Analyzed (since v2.2.0)
| Type | Count | Public-facing |
|------|-------|---------------|
| feat | 3 | 3 |
| feat! (breaking) | 1 | 1 |
| fix | 5 | 5 |
| perf | 2 | 2 |
| chore / ci / build | 11 | 0 (excluded) |
| docs | 4 | 1 (user-facing release notes) |

### Breaking Changes Detected
- `remove-v1-api`: deprecated `/api/v1` removed (commit abc123)
  - Migration: update API calls to `/api/v2` (path identical, only prefix changes)
  - Migration guide: docs/migrations/v3.md

### Quality Checks
- [x] All breaking changes have migration guides
- [x] No internal-only commits (chore/ci/build) in public sections
- [x] `### Security` section present (1 CVE patched)
- [x] Sections in canonical order (Added · Changed · Deprecated · Removed · Fixed · Security)
- [x] Date in ISO-8601 (`YYYY-MM-DD`)
- [x] `## [Unreleased]` section present at top
- [x] Reverse-chronological ordering preserved

### Generated Changelog (DRAFT — human curation required)
[full markdown block following Keep a Changelog 1.1]

### Curation TODO for human reviewer
1. Re-read every `### Added` entry — rewrite from "what was built" to "what users can do now"
2. Confirm migration guide for `/api/v1` removal is complete
3. Decide whether the Stripe v3 upgrade entry should call out the breaking idempotency requirement
4. Verify CVE-2026-1234 reference link resolves

### Recommendations
1. Tag release after curation: `git tag -a v3.0.0 -m "Release 3.0.0"`
2. Open release PR (don't push tag directly) so reviewers can amend the changelog
3. Mirror to GitHub Releases UI — paste the curated section verbatim
```

## CI Integration

```yaml
# Conventional-changelog + commit on release branch
- name: Generate Changelog
  run: npx conventional-changelog -p angular -i CHANGELOG.md -s -r 0
- name: Commit Changelog
  run: |
    git add CHANGELOG.md
    git commit -m "docs: update changelog for v${{ env.VERSION }}"

# release-please (recommended for libraries)
- uses: googleapis/release-please-action@v4
  with:
    release-type: node    # or python, java, go, rust, etc.

# Changesets (recommended for monorepos)
- uses: changesets/action@v1
  with:
    publish: pnpm release
    version: pnpm changeset version
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Tool Integration (2026)

No single tool fits every project. Pick by language, repo shape, and release philosophy.

| Tool | Strengths | Trade-offs | Best fit |
|---|---|---|---|
| **semantic-release** | Fully automated · parses Conventional Commits · publishes to npm/GitHub releases in one step · widely adopted in JS/TS | Commits ARE the changelog — output reads like a commit log unless heavily templated · weak native monorepo support · all-or-nothing release cadence | Single-package JS/TS libs that want zero-touch releases |
| **changesets** | Authors write **intent** (a `.changeset` file) separate from commits · first-class monorepo support · human reviews/edits the changeset before release · changelog reads like product notes, not git log | More ceremony per change · authors must remember to write a changeset · less weekly download volume than semantic-release | Monorepos, libraries that prioritize narrative changelogs |
| **release-please** (Google) | Generates a **release PR** that bumps versions + updates CHANGELOG.md · review-and-merge gate before every release · supports 15+ languages (node, python, java, go, rust, ruby, php, dart, terraform, helm, …) | Requires Conventional Commits discipline · GitHub-only · the release PR can collect stale conflicts on busy repos | Multi-language repos, teams that want a human gate without writing changesets |
| **conventional-changelog** | Library that powers many other tools · Angular preset is the de-facto baseline · works as a CLI or programmatically | Lower-level — you'll typically wrap it in `standard-version`, `release-it`, or a custom script | Building your own pipeline |
| **commitizen** (Python) | Author-facing `cz commit` wizard + `cz bump --changelog` in one tool · respects Keep a Changelog · works in any language but Python-native | Python install dependency for non-Python projects | Python projects; teams onboarding Conventional Commits |
| **towncrier** (Python) | News-fragment workflow — each PR drops a `newsfragments/123.feature` file; `towncrier build` assembles them at release · used by Twisted, pip, attrs, pytest | Extra file per PR · authors must learn the fragment format · doesn't auto-derive version | Mature Python libraries that need carefully-curated release notes |
| **release-drafter** (GitHub Action) | Auto-drafts a GitHub Release as PRs are merged · category labels (feature/bug/breaking) drive sections · zero CLI · language-agnostic | Lives only in GitHub Releases UI — doesn't write CHANGELOG.md by default · category mapping is label-based, not commit-based | Any-language GitHub project that publishes via Releases (works for C#/.NET, Java/Maven, etc.) |
| **git-cliff** (Rust) | Single static binary, no runtime · highly templatable (Tera templates) · language-agnostic · respects Conventional Commits · cargo + brew + winget · runs in CI in ~1 sec on a 10k-commit repo | Steeper template learning curve · less off-the-shelf integration with package registries | C/C++ projects, Rust crates, polyglot repos, performance-sensitive CI |

### Per-language picks

| Language | Recommended tool(s) | Notes |
|---|---|---|
| TypeScript / JavaScript | changesets (monorepo) or semantic-release (single pkg) or release-please | All three thrive in JS — pick by repo shape |
| Python (3.12+) | commitizen, or towncrier for mature libraries | Both write Keep-a-Changelog format; towncrier when each release needs hand-curated narrative |
| C# / .NET 9 | release-drafter (GitHub Releases) + GitVersion for semver; or release-please (release-type: simple) | NuGet publish goes through `dotnet pack` / `dotnet nuget push` in the same workflow |
| Java 21+ (Maven/Gradle) | release-drafter, release-please (release-type: java), or git-cliff | `maven-release-plugin` handles version bumps; pair with release-drafter for the notes |
| C / C++ | git-cliff or gren | Both language-agnostic; git-cliff has better Conventional Commits support. `gren` (GitHub Release Notes) reads PR titles/labels |
| Rust | cargo-release + git-cliff, or release-plz | release-plz mimics release-please for Rust |
| Go | release-please (release-type: go), or git-cliff | goreleaser handles binary publishing; pair with release-please for notes |
| SQL / database-only repos | **skip language-specific tooling** — use plain Keep a Changelog 1.1 by hand, or release-drafter | Migration files (Flyway / Liquibase / sqlx) are the de-facto changelog; CHANGELOG.md summarizes user-visible schema changes only |

## Severity

These triage tiers are the **internal triage view** for your human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule — there is no soft tier on the wire. The triage tiers stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|---|---|---|
| CRITICAL | Major release with no BREAKING CHANGES section; security fix shipped without `### Security` entry; CHANGELOG.md missing entirely on a tagged release | BLOCK release |
| HIGH | Breaking change without migration guide; wrong semver bump (minor used for breaking); internal-only commits leaked into public changelog | BLOCK release |
| MEDIUM | Non-canonical section names; missing `## [Unreleased]`; date not ISO-8601; reverse-chronological order broken | Fix before release |
| LOW | Stylistic inconsistencies; commit hashes left raw without PR links; missing comparison-link footers | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = git history + tags confirm; low = inferred
engine: changelog-generator
kind: missing_changelog | generated_only_no_curation | missing_breaking_callout | missing_migration_guide | internal_leak | missing_security_section | wrong_section_name | wrong_semver_bump | missing_unreleased | non_iso_date | order_violation | monorepo_missing_per_package_changelog
target_file: CHANGELOG.md
line: 14                                            # 0 if file-level / missing-file finding
message: "Major bump v2 -> v3 has no '### BREAKING CHANGES' section; 1 breaking commit detected (abc123 'feat!: drop /api/v1')"
suggested_fix: |
  Add a top-level '### BREAKING CHANGES' subsection to the v3.0.0 release entry, with the migration
  block shown in the report. Re-tag once the changelog merges; do not push v3.0.0 with the current notes.
reference: https://keepachangelog.com/en/1.1.0/
```

The integrator uses `confidence` to weight findings — a `confidence: low` inference (e.g. couldn't read all tag history) doesn't block phase advancement on its own. A `wrong_semver_bump` or `missing_breaking_callout` at `confidence: high` blocks Gate 3.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every changelog defect (missing section, wrong section name, missing migration guide, internal-leak, wrong semver bump, missing CVE entry) emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Changelog defects block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a missing migration guide today is a customer-visible upgrade failure tomorrow. A `chore(deps)` leak today is a noisy changelog that nobody reads next quarter. Code that ships green-with-warnings ships with known latent failures.
