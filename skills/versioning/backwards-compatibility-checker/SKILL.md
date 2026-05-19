---
name: backwards-compatibility-checker
description: Detects breaking changes between versions to enforce semantic versioning compliance.
type: skill
when_to_load:
  - "backwards compatibility"
  - "breaking change check"
  - "API version check"
  - "semver check"
  - "backward compatibility"
  - "breaking changes"
related_skills:
  - versioning/feature-flag-auditor
  - versioning/technical-debt-tracker
  - devex/api-deprecation-checker
  - specialized/api-contract-validator
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read, Grep
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Backwards Compatibility Checker (skill)

> Converted from agents/versioning/backwards-compatibility-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You detect breaking changes between versions to ensure proper semantic versioning compliance and help teams communicate changes to users. You assume **Hyrum's law** ("with a sufficient number of users of an API, all observable behaviors of your system will be depended on by somebody"): any observable behavior — documented or not — is part of the public contract once shipped. Your job is to catch the silent break before the consumer does.

## 2026 Best Practices (Versioning category)

- **SemVer is enforced via CI, not honor system.** Major.Minor.Patch is the contract; "we'll be careful" is not. Every PR runs a diff tool that fails the build when public API changes don't match the proposed version bump. Tools: `cargo-semver-checks` (Rust), `oasdiff` (OpenAPI), `japicmp` / `revapi` (Java), `Microsoft.CodeAnalysis.PublicApiAnalyzers` (C#), `api-extractor` + `tsd` (TS), `abi-compliance-checker` (C/C++), `pylint` deprecated detector (Python).
- **Deprecation cycle is at least two minor releases before removal.** Mark with the language-native deprecation annotation (`[Obsolete]`, `@Deprecated`, `@deprecated` JSDoc, `typing.deprecated` per PEP 702, `#[deprecated]` in Rust, `[[deprecated]]` in C++14/C23). Every `@deprecated` carries a **reason** AND **migration target** in the docstring — never a bare marker.
- **Major version bump on ANY observable public-API break.** Including: removed symbols, narrowed types, widened required args, changed defaults with semantic meaning, removed enum variants, changed exception/error types, changed event payload shape.
- **ABI stability is a separate axis for shared libraries.** A C/C++ shared lib can keep source-API stable while breaking ABI (struct layout change, vtable shift, symbol mangling change). For `.so`/`.dll`/`.dylib` consumers, run `abi-compliance-checker` in addition to source-API diff.
- **Hyrum's law is acknowledged in the deprecation policy.** Document an explicit "observable behavior" clause in the changelog template: bug fixes that change observable output are at minimum minor, sometimes major. Iteration order changes, hash-table seed changes, error message text consumed by parsers — all qualify.
- **Migration guides ship with the breaking release.** Not "we'll document later." Pair with [[api-deprecation-checker]] and [[api-contract-validator]].
- **OpenAPI / gRPC / GraphQL contracts get the same treatment as code.** Spec is source-of-truth; CI diffs the spec on every PR (`oasdiff breaking`, `buf breaking`, `graphql-inspector diff`).
- **Test cross-version compatibility.** Run the previous public test suite against the new build (contract tests). CI keeps the N-1 version's test fixtures and replays them.

## Semantic Versioning

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Breaking change | MAJOR | 1.0.0 → 2.0.0 |
| New feature (compatible) | MINOR | 1.0.0 → 1.1.0 |
| Bug fix (compatible) | PATCH | 1.0.0 → 1.0.1 |
| Pre-1.0 (0.y.z) | MINOR may break | 0.4.0 → 0.5.0 (allowed by spec but still announce) |

### What Counts as Breaking (the categories this skill detects)

> All categories below emit at `severity: critical` on the wire (warnings-are-bugs). The "Triage" column reflects internal priority order — see the Severity section below for the full mapping.

| Category (`kind` in letter) | Example | Triage |
|---|---|---|
| **removed-without-deprecation** | Public function deleted with no prior `@deprecated` cycle | CRITICAL |
| **deprecated-without-warning** | Symbol marked deprecated in changelog but no `@deprecated` / `[Obsolete]` / `#[deprecated]` annotation reaches the consumer's compiler/IDE | CRITICAL |
| **type-signature-changed-silently** | Param type narrowed, return type widened to nullable, generic variance flipped — no version bump | CRITICAL |
| **default-value-changed** (semantic break) | `timeout: 30000` → `timeout: 5000`; `strict_mode: false` → `strict_mode: true` | CRITICAL |
| **enum-value-removed** | `Status.PENDING` deleted; exhaustive consumers crash | CRITICAL |
| **magic-constant-changed** | Public `MAX_PAGE_SIZE = 100` → `50`; alignment / size constants in C headers | CRITICAL |
| **header-layout-broken** (ABI for C/C++) | Struct field reordered/inserted; enum re-numbered; vtable layout shift | CRITICAL |
| **missing-semver-bump** | Detected breaking change but proposed version is minor/patch | CRITICAL |
| **observable-behavior-change** (Hyrum) | Bug fix that flips iteration order, error message text, retry timing | HIGH |
| **error-type-changed** | Now raises `TypeError` where it used to raise `ValueError` | HIGH |
| **exception-no-longer-raised** | Function used to raise on bad input; now silently returns `None` | HIGH |
| **required-param-added** | New required positional/keyword arg with no default | CRITICAL |
| **public-constant-renamed-no-alias** | `MAX_USERS` → `USER_LIMIT` without keeping the old name | CRITICAL |

### What's NOT Breaking

- Added new function / type / class
- Added optional parameter with default that preserves prior behavior
- Added new configuration option (default = old behavior)
- Added new enum value (if consumers are documented as **non-exhaustive**; flag if consumers are exhaustive)
- Internal refactor with no public-surface change
- Documentation-only changes
- Performance improvement that doesn't alter observable behavior (note: a meaningful latency change can be a Hyrum break if consumers depend on timing)

## Detection Methods (per language)

### TypeScript / JavaScript

```bash
# Microsoft API Extractor — declarative .api.md report committed to repo, diffed in PR.
npx api-extractor run --local
git diff --exit-code etc/<package>.api.md   # fails CI if surface drifted without commit

# tsd — type assertions for type-level regression
npx tsd

# attw — verifies "Are The Types Wrong?" for dual-package / ESM/CJS exports
npx --package=@arethetypeswrong/cli attw <package>.tgz
```

### Python

```bash
# pylint deprecated detector (built-in checker: deprecated-method, deprecated-class)
pylint --enable=deprecated-method,deprecated-class src/

# pyright / mypy — both honor @typing.deprecated (PEP 702, accepted by Steering Council;
# mypy gained basic support via #17476; pyright has had it since 1.1.345).
pyright --outputjson | jq '.generalDiagnostics[] | select(.rule=="reportDeprecated")'

# griffe — extracts public API and checks for breaking changes between two refs.
pip install griffe
griffe check mypackage -a v1.4.0   # diff current working tree against tag/commit v1.4.0
# Exits non-zero on detected breaking changes. JSON output: griffe dump for snapshot diffing.
```

Mark every deprecation with PEP 702:

```python
from typing import deprecated  # 3.13+; or `from typing_extensions import deprecated`

@deprecated("Use parse_date_v2; removed in 3.0", category=DeprecationWarning)
def parse_date(s: str) -> date: ...
```

### Java (21+)

```bash
# japicmp — compares two jars; can fail-build on incompatibilities
mvn com.github.siom79.japicmp:japicmp-maven-plugin:cmp \
    -DoldVersion=com.acme:lib:1.4.0 -DnewVersion=com.acme:lib:1.5.0 \
    -DbreakBuildOnBinaryIncompatibleModifications=true \
    -DbreakBuildOnSourceIncompatibleModifications=true

# revapi — richer ruleset; integrates with Maven & Gradle
mvn org.revapi:revapi-maven-plugin:check
```

Always annotate the public surface with `@Deprecated(since="1.5", forRemoval=true)` — Java 9+ accepts these attributes and javac warns on usage.

### C# / .NET (.NET 9+)

```bash
# Microsoft.CodeAnalysis.PublicApiAnalyzers — declarative PublicAPI.Shipped.txt /
# PublicAPI.Unshipped.txt files committed to repo. Any public surface drift fails build.
dotnet add package Microsoft.CodeAnalysis.PublicApiAnalyzers
# Files: PublicAPI.Shipped.txt (released surface), PublicAPI.Unshipped.txt (new in this version)

# PublicApiGenerator — alternative: snapshots public surface as text for diffing
dotnet add package PublicApiGenerator

# Roslyn Obsolete enforcement
# [Obsolete("Use NewMethod; removed in 4.0", error: false)]   // warn
# [Obsolete("Removed; use NewMethod", error: true)]           // error
```

Used by the .NET runtime team, Azure SDK, Dapper, Polly, and most major .NET OSS libraries.

### C (C17/C23) and C++ (20/23) — ABI matters

```bash
# abi-compliance-checker — diffs two shared library builds
abi-dumper libfoo.so.1.4.0 -o ABI-1.4.0.dump -lver 1.4.0
abi-dumper libfoo.so.1.5.0 -o ABI-1.5.0.dump -lver 1.5.0
abi-compliance-checker -l libfoo -old ABI-1.4.0.dump -new ABI-1.5.0.dump
# Outputs Source compatibility / Binary compatibility verdicts (Yes/No).

# libabigail — Red Hat's abi diff (abidiff)
abidiff libfoo.so.1.4.0 libfoo.so.1.5.0

# headers — `cpp-dependencies` + manual review of struct layout
```

Mark deprecations with `[[deprecated("reason; use new_api()")]]` (C++14+, C23). For pure C without C23, fall back to `__attribute__((deprecated("...")))` (GCC/Clang) or `__declspec(deprecated("..."))` (MSVC).

**Common C/C++ ABI breaks the scanner must flag:**
- Adding/reordering/removing a field in a public struct
- Changing enum integer width (`enum X { A }` → `enum X : uint8_t { A }`)
- Changing virtual function table layout (added virtuals, reordered virtuals)
- Changing `sizeof` of any exported type
- Default-argument value changes in inline functions exposed in headers
- Inline function body changes that affect template instantiation
- Changing exception specification (`noexcept` ↔ throwing)

### Rust

```bash
# cargo-semver-checks — diffs your crate against the last published version on crates.io
cargo install cargo-semver-checks
cargo semver-checks check-release          # fails if version bump doesn't match changes
cargo semver-checks check-release --baseline-rev origin/main
```

Uses rustdoc JSON output and the Trustfall query engine; lints are open and extensible. Use `#[deprecated(since = "1.5.0", note = "use Foo::new_v2")]` to mark deprecations.

### Go

```bash
# gorelease (golang.org/x/exp/cmd/gorelease) — official tool, suggests version
gorelease -base=v1.4.0
# apidiff (golang.org/x/exp/cmd/apidiff) — programmatic diff
apidiff old.api new.api
```

Mark deprecated symbols with the magic comment `// Deprecated: <reason>; use Foo instead.` — `go vet`, `staticcheck`, and `gopls` all surface these.

### OpenAPI / gRPC / GraphQL contracts

```bash
# OpenAPI — oasdiff (Tufin) — best maintained, distinguishes breaking vs non-breaking
oasdiff breaking old.yaml new.yaml --fail-on ERR
oasdiff changelog old.yaml new.yaml

# gRPC / Protobuf — buf
buf breaking --against '.git#branch=main'

# GraphQL — graphql-inspector
graphql-inspector diff old.graphql new.graphql --rule suppressRemovalOfDeprecatedField
```

## Output Format (human-readable report)

```markdown
## Backwards Compatibility Report

### Version Comparison
| Field | Value |
|-------|-------|
| Current Version | 1.5.0 |
| Compared Against | 1.4.0 |
| Recommended Version | **2.0.0** |
| Tool(s) used | api-extractor, oasdiff, japicmp |

### Breaking Changes Detected

**1. removed-without-deprecation — parseDate**
- Was: `export function parseDate(str: string): Date`
- Now: Removed
- Detected by: api-extractor
- Impact: Any code calling `parseDate()` will fail at compile time (TS) / runtime (JS).
- Migration: Use `new Date(str)` or `date-fns.parse()`.
- Required: MAJOR bump + 2-minor deprecation cycle skipped — flag in changelog.

**2. type-signature-changed-silently — sendEmail**
- Was: `sendEmail(to: string, subject: string, body: string)`
- Now: `sendEmail(options: EmailOptions)`
- Detected by: api-extractor (signature diff)
- Impact: All existing call sites fail.

**3. default-value-changed — timeout**
- Was: 30000 ms
- Now: 5000 ms
- Detected by: source diff + behavior test
- Impact: Slow endpoints that previously succeeded now timeout. Classic Hyrum-law break.
- Migration: Explicitly set `{ timeout: 30000 }` if old behavior required.

**4. header-layout-broken (ABI) — struct user_t**
- Was: `struct user_t { uint32_t id; char name[64]; }`
- Now: `struct user_t { uint64_t id; char name[64]; uint32_t flags; }`
- Detected by: abi-compliance-checker (Binary compatibility: No)
- Impact: Any consumer compiled against 1.4 will read garbage after the `id` field.
- Required: SONAME bump (libfoo.so.1 → libfoo.so.2).

### Non-Breaking Changes
| Type | Count | Details |
|------|-------|---------|
| Added exports | 2 | `formatCurrency`, `formatNumber` |
| Added optional params | 1 | `locale` in `formatDate` |
| Extended enums | 1 | Added `pending` to Status (verify consumers are non-exhaustive) |

### Version Recommendation
Correct version: **2.0.0** — breaking changes require MAJOR bump per semver.org §8.

### Migration Guide Draft
[Auto-generate per change above]
```

## CI Integration

```yaml
# Example: GitHub Actions job that runs the per-language tool and writes the letter
- name: Check API compatibility (TypeScript)
  run: |
    npm run build
    npx api-extractor run --local
    git diff --exit-code etc/

- name: Check API compatibility (Rust)
  run: cargo semver-checks check-release --baseline-rev origin/main

- name: Check API compatibility (OpenAPI)
  run: oasdiff breaking openapi/main.yaml openapi/pr.yaml --fail-on ERR

- name: Check API compatibility (Java)
  run: mvn org.revapi:revapi-maven-plugin:check

- name: Check API compatibility (C#)
  run: dotnet build /warnaserror   # PublicApiAnalyzers RS0016/RS0017 fire as errors

- name: Check ABI (C/C++)
  run: |
    abi-dumper build-old/libfoo.so -o old.dump -lver old
    abi-dumper build-new/libfoo.so -o new.dump -lver new
    abi-compliance-checker -l libfoo -old old.dump -new new.dump
```

## Tool Integration (2026)

| Language / Surface | Primary tool | Secondary | Detects |
|---|---|---|---|
| TypeScript / JS | `@microsoft/api-extractor` | `tsd`, `attw` | signature/type drift, ESM/CJS dual-package issues |
| Python | `griffe check` + `typing.deprecated` (PEP 702) | `pylint` deprecated detector, `pyright` `reportDeprecated` | signature, public-symbol removal, `@deprecated` usage |
| Java 21+ | `japicmp` | `revapi`, Roseau (2025 research, F1=0.99 vs japicmp 0.86) | source + binary incompatible changes |
| C# / .NET 9 | `Microsoft.CodeAnalysis.PublicApiAnalyzers` | `PublicApiGenerator` | declared-surface drift (PublicAPI.Shipped.txt) |
| C (C17/C23) | `abi-compliance-checker`, `libabigail` (`abidiff`) | clang `-Wdeprecated-declarations` | header struct/enum layout, ABI |
| C++ (20/23) | `abi-compliance-checker` | `libabigail`, `cpp-dependencies` | template/inline body, vtable, `noexcept`, ABI |
| Rust | `cargo-semver-checks` | `rust-semverver` | crate public API per rustdoc JSON |
| Go | `gorelease`, `apidiff` | `staticcheck` SA1019 (deprecated use) | exported identifiers, comment-style deprecations |
| OpenAPI | `oasdiff` (Tufin) | `openapi-diff`, Optic | endpoints, params, schemas, required fields |
| gRPC / Protobuf | `buf breaking` | `protolock` | message field number reuse, removed fields |
| GraphQL | `graphql-inspector diff` | Apollo `graphql-tools` | removed fields, changed nullability |

All produce machine-readable output (JSON / SARIF / XML) that the refinement loop converts into letters.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|-------|----------|--------|
| CRITICAL | Removed public symbol w/o deprecation cycle · type narrowed silently · ABI break with no SONAME bump · proposed patch/minor when MAJOR required | BLOCK |
| HIGH | Default value semantically changed · error/exception type changed · enum value removed | BLOCK |
| MEDIUM | Deprecated symbol still in public surface past announced removal version · new required param with sensible default-of-last-resort | Fix before release |
| LOW | Doc-only inconsistencies · missing `since=` on `@deprecated` annotations | Backlog |

## Red Lines

- NEVER release breaking changes in a MINOR or PATCH version (post-1.0). Pre-1.0 may break in MINOR per semver.org §4 but still announce.
- NEVER remove a public symbol without ≥2 minor releases of overlap + deprecation notice with reason + migration path.
- NEVER ship a major release without a migration guide.
- NEVER change a default value silently — call it out in the changelog under a dedicated "Behavior Changes" section.
- NEVER break ABI (C/C++ shared libraries) without bumping the SONAME / .dll version.
- NEVER suppress a `@deprecated` warning across the codebase to "silence noise" — fix the call site.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+type)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = tool-confirmed; low = single-pass heuristic
engine: api-extractor | griffe | japicmp | revapi | publicapianalyzers | cargo-semver-checks | oasdiff | buf | abi-compliance-checker | abidiff | gorelease | graphql-inspector | manual
kind: <one-of: removed-without-deprecation, deprecated-without-warning, type-signature-changed-silently, default-value-changed, enum-value-removed, magic-constant-changed, header-layout-broken, missing-semver-bump, observable-behavior-change, error-type-changed, exception-no-longer-raised, required-param-added, public-constant-renamed-no-alias>
breaking_change_kind: source | binary | both        # source = compile/runtime API; binary = ABI
target_file: src/api/foo.py
target_line: 42
old_signature: "def parse_date(s: str) -> date"
new_signature: "(removed)"
old_version: 1.4.0
new_version: 1.5.0
proposed_bump: minor
required_bump: major
suggested_fix: |
  Restore parse_date as a thin wrapper that calls parse_date_v2 and emits
  DeprecationWarning. Schedule removal for 3.0.0. Bump current release to 2.0.0.
reference: https://semver.org/#summary
```

The integrator weights findings by `confidence` and `breaking_change_kind`. `binary` breaks block phase advancement for any shared-library project; `source` breaks block if the proposed version bump doesn't match. `confidence: low` single-pass findings need corroboration from a second tool before they block.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
