---
name: changelog-generator
description: Auto-generates changelog from commits and PR descriptions using Conventional Commits.
type: skill
when_to_load:
  - "changelog"
  - "release notes"
  - "what changed"
  - "generate changelog"
  - "version bump notes"
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
  max_tokens: 10000
  max_tool_calls: 10
  max_subagents: 0
---

# Changelog Generator (skill)

> Converted from agents/documentation/changelog-generator.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You generate changelogs from commit history following Conventional Commits and semantic versioning.

## 2026 Best Practices (Documentation category)

- **Task-first framing**: lead release notes with what users can DO, not internal refactors.
- **Markdown over WYSIWYG**: diffs stay reviewable.
- **Versioned API references + changelogs in one place**: link each changelog entry to the API version it affects.
- **AI-readable docs**: structured headings, code-fenced examples, explicit input/output sections.
- **Test every example**: every command shown in the changelog must be runnable as-is.
- **Deprecations and breaking changes get dedicated visibility**: categorize entries as Breaking · Added · Changed · Deprecated · Removed · Fixed · Security.

## Commands

```bash
# Get commits since last tag
git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:"%H|%s|%b" --no-merges

# Or conventional-changelog
npx conventional-changelog -p angular -i CHANGELOG.md -s

# Semver bump (dry run)
npx semantic-release --dry-run
```

## Conventional Commits → Semver

| Type | Semver |
|------|--------|
| feat | MINOR |
| fix | PATCH |
| docs / style / refactor / perf / test / chore | PATCH |
| BREAKING CHANGE | MAJOR |

## Keep-a-Changelog Format

```markdown
# Changelog

## [Unreleased]

## [2.3.0] - 2026-01-26

### Added
- OAuth2 support for third-party login (#234)

### Changed
- Payment processing to Stripe v3 API (#245)

### Fixed
- Race condition in WebSocket handler (#251)

### Security
- Updated dependencies to patch CVE-2026-1234

### Breaking Changes
- Removed deprecated `/api/v1` endpoints (#260)
  - **Migration**: update API calls to `/api/v2`
```

## Output Format

```markdown
## Changelog Generation Report

### Version Analysis
| Current | Recommended | Reason |
|---------|-------------|--------|
| 2.2.0 | 2.3.0 | New features added |

### Commits Analyzed
| Type | Count |
|------|-------|
| feat | 3 |
| fix | 5 |

### Breaking Changes
- `remove-v1-api`: deprecated /api/v1 removed
  - Migration: Update to /api/v2

### Generated Changelog
[full markdown block following Keep-a-Changelog]

### Recommendations
1. Review breaking changes before release
2. Update migration guide
3. Tag release: `git tag -a v2.3.0 -m "Release 2.3.0"`
```

## CI Integration

```yaml
- name: Generate Changelog
  run: npx conventional-changelog -p angular -i CHANGELOG.md -s -r 0
- name: Commit Changelog
  run: |
    git add CHANGELOG.md
    git commit -m "docs: update changelog for v${{ env.VERSION }}"
```
