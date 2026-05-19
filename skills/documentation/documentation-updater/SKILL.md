---
name: documentation-updater
description: Updates API docs, README, code comments, and changelog entries.
type: skill
when_to_load:
  - "update docs"
  - "update documentation"
  - "write README"
  - "API documentation"
  - "add docstrings"
  - "doc coverage"
related_skills:
  - documentation/changelog-generator
effort_level: medium
model_optimized_for: opus-4-7
tools: Read, Write, Edit
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Documentation Updater (skill)

> Converted from agents/documentation/documentation-updater.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You update documentation to reflect code changes. Runs in Step 15 (DOCUMENT) of the Iron Loop. You assume documentation drifts faster than code: every rename, every signature change, every new endpoint, every breaking change is a documentation defect until proven otherwise.

## 2026 Best Practices (Documentation category)

- **Docs live alongside code in the same repo**. Documentation-as-code is the default in 2026. Markdown + a static-site generator (Docusaurus, MkDocs, Mintlify, Astro Starlight, Hugo) rendered from the same Git tree the code lives in. Binary doc formats are rejected. PR-gated changes to `docs/` go through the same review as code.
- **Diataxis four-quadrant model** is the canonical IA: every doc page is one of *tutorial* (learning-oriented), *how-to* (task-oriented), *reference* (information-oriented), or *explanation* (understanding-oriented). Mixing modes on a page is a smell — split it.
- **CI lints links and tests snippets**. A docs PR with a broken link or a code block that no longer compiles is a failing build. Tools: lychee or markdown-link-check (links), Vale (prose style), language-specific runners for fenced code blocks (Python `doctest`, Rust `cargo test --doc`, TS `tsx`/`vitest`, Java `JCoTester`/Spring REST Docs snippet inclusion).
- **API docs are auto-generated from code**. Hand-written API tables drift. The source of truth is the code (docstrings, JSDoc/TSDoc, Javadoc, XML doc comments, doc-strings + type annotations) or an OpenAPI/AsyncAPI/GraphQL schema. The site renders from those — never from a hand-typed copy.
- **OpenAPI is the doc source for HTTP APIs**. The handler decorators (FastAPI, NestJS, Spring, ASP.NET Core, Express + zod-openapi) emit the spec; the site renders it (Redocly, Scalar, Mintlify, Swagger UI). Hand-edited OpenAPI files are tech debt unless the framework can't emit them.
- **ADRs for big decisions**. Architecturally significant choices (framework, database, auth model, queue, infra provider, public API contract, breaking change) get an ADR in `docs/adr/` using the **MADR template** (`adr/madr` on GitHub — full or minimal variant, annotated or bare). ADRs are append-only: superseded records link to the replacement; accepted records are never edited in place.
- **Versioned docs aligned to releases**. Each released major/minor has a snapshot. Docusaurus/Mintlify/Starlight all support versioning natively. Users on v2 should not read v3-only docs by accident.
- **Doc owner per section**. CODEOWNERS covers `docs/` too. Stale ownership = stale docs.
- **Migration guides for every breaking change**. Cross-link to [[backwards-compatibility-checker]] — a breaking change without a migration guide is a release blocker.
- **AI-readable docs**. Structured headings, code-fenced examples with language tags, explicit input/output sections, optional `llms.txt` at site root summarising the docs for LLM ingestion.
- **Last-updated metadata visible**. Each page shows last-edited date; `last-updated > 6 months` for a page covering actively changed code is a stale-doc finding.

## What This Skill Detects (Categories)

Each category maps to a finding kind in the letter schema below.

| Kind | Trigger | Example |
|---|---|---|
| `stale_doc` | Page's `last-updated` > 6 months and the underlying code changed within that window | `docs/api/users.md` last edited 2025-09, `src/api/users.py` edited 2026-03 |
| `broken_link` | Internal or external link returns 4xx/5xx, or anchor target missing | `[install](./install.md)` — file moved |
| `untested_snippet` | Fenced code block in docs not covered by a snippet runner | ` ```python ` block in tutorial never executed in CI |
| `missing_adr` | Architecturally significant change merged without a matching ADR | New auth provider added; no `docs/adr/NNNN-*.md` accompanies the PR |
| `missing_api_doc` | New public endpoint / exported function / public class lacks generator-readable docstring | `POST /v2/orders` exists in router but missing from OpenAPI / Swagger output |
| `missing_migration_guide` | Breaking change in code with no migration entry — cross-links to [[backwards-compatibility-checker]] | Renamed `getUser` → `fetchUser`; no upgrade note in `CHANGELOG.md` or `docs/migrations/` |
| `inconsistent_code_doc` | Symbol renamed/removed in code, docs still reference old name | Doc says `db.users.findByEmail()`, code now exposes `db.users.lookupByEmail()` |

Findings emit even if the underlying feature is correct — drift between code and docs is the defect.

## What to Update (when invoked to fix, not just detect)

1. **API Documentation** — new endpoints, changed request/response shapes, new error codes, auth changes. Regenerate from OpenAPI / Javadoc / TypeDoc / Sphinx where possible; hand-edit only the prose around it.
2. **README** — new features, installation, configuration, env vars, quickstart that actually runs end-to-end.
3. **Code Comments / Docstrings** — public-API surface only. Internal helpers documented if non-obvious.
4. **Changelog** — every user-visible change, with migration note if breaking — see [[changelog-generator]] and [[backwards-compatibility-checker]].
5. **ADR** — write a new MADR-format file in `docs/adr/` for any decision matching the "architecturally significant" bar (provider swap, data-model change, public-contract change, security-model change).
6. **Migration guide** — for every breaking change, a `docs/migrations/<version>.md` page with before/after snippets.

## 7-Language Coverage — How Docs Get Generated

The skill must know the toolchain per language. Detection is by file extension + framework signal.

### C# / .NET 9+
- **Generator**: DocFX (Microsoft) renders XML doc comments + Markdown into a static site. Or Mintlify / Docusaurus pulling from generated JSON.
- **Source format**: triple-slash XML comments (`/// <summary>...</summary>`, `<param>`, `<returns>`, `<exception>`).
- **API surface**: ASP.NET Core minimal API + `Microsoft.AspNetCore.OpenApi` (built-in in .NET 9) emits OpenAPI; render with Scalar / Swagger UI.
- **Build-time enforcement**: `<GenerateDocumentationFile>true</GenerateDocumentationFile>` + treat CS1591 (missing XML comment on public type) as error for public APIs.

```csharp
/// <summary>Creates a new user account.</summary>
/// <param name="email">Email address; must be unique.</param>
/// <param name="name">Display name.</param>
/// <returns>The created <see cref="User"/>.</returns>
/// <exception cref="ValidationException">If email is malformed.</exception>
/// <exception cref="DuplicateEmailException">If email already exists.</exception>
public async Task<User> CreateUserAsync(string email, string name) { ... }
```

### Java 21+
- **Generator**: `javadoc` (JDK built-in) or modern alternatives (Spring REST Docs for HTTP APIs — generates Asciidoc snippets from passing tests, guaranteeing docs match real behaviour).
- **Source format**: Javadoc `/** ... */` with `@param`, `@return`, `@throws`, `@since`, `@deprecated`.
- **API surface**: Spring Boot + `springdoc-openapi` emits OpenAPI from controllers.
- **Build-time enforcement**: `-Xdoclint:all` on the `javadoc` tool fails build on missing/broken doc tags.

```java
/**
 * Creates a new user account.
 *
 * @param email user's email address; must be unique and RFC 5322 compliant
 * @param name  display name (1–128 chars)
 * @return the created {@link User}
 * @throws ValidationException if {@code email} is malformed
 * @throws DuplicateEmailException if {@code email} already exists
 * @since 2.4
 */
public User createUser(String email, String name) { ... }
```

### Python 3.12+
- **Generator**: Sphinx (with `sphinx.ext.autodoc` + `napoleon` for Google/NumPy style) or MkDocs + `mkdocstrings[python]` (Markdown-first, popular for FastAPI projects).
- **Source format**: PEP 257 docstrings, Google or NumPy style.
- **API surface**: FastAPI emits OpenAPI from path-operation decorators + Pydantic models — render with Scalar / Redocly / Swagger UI.
- **Build-time enforcement**: `ruff` with `D` (pydocstyle) ruleset, or `pydocstyle` standalone. `interrogate` reports docstring coverage and can fail under a threshold.

```python
def create_user(email: str, name: str) -> User:
    """Create a new user account.

    Args:
        email: User's email address (must be unique, RFC 5322).
        name:  Display name (1–128 chars).

    Returns:
        The created User.

    Raises:
        ValidationError: If `email` is malformed.
        DuplicateError:  If `email` already exists.
    """
```

### C
- **Generator**: Doxygen (the universal C/C++ standard) renders to HTML/LaTeX/XML.
- **Source format**: `/** ... */` blocks with `@brief`, `@param`, `@return`, `@retval`, `@warning`, `@since`.
- **Build-time enforcement**: `WARN_AS_ERROR = YES` in `Doxyfile` fails the build on undocumented public symbols.

```c
/**
 * @brief  Create a new user record.
 * @param  email NUL-terminated UTF-8 email; must be non-NULL.
 * @param  name  NUL-terminated UTF-8 display name; must be non-NULL.
 * @param  out   Out-parameter receiving the newly-allocated user; caller owns.
 * @retval 0     success
 * @retval -EINVAL invalid email format
 * @retval -EEXIST email already exists
 */
int user_create(const char *email, const char *name, user_t **out);
```

### C++
- **Generator**: Doxygen (default) — same syntax as C, with C++-specific tags (`@tparam` for template parameters).
- **Source format**: `/// ` lines or `/** ... */` blocks.
- **Modern complement**: `mkdocs-doxygen` / `m.css` for Markdown-flavoured rendering on top of Doxygen XML.

```cpp
/// @brief Create a new user.
/// @tparam Allocator allocator type (defaults to std::allocator<User>).
/// @param  email RFC 5322 email.
/// @param  name  display name.
/// @return std::expected<User, CreateError> — User on success, error code otherwise.
template<class Allocator = std::allocator<User>>
[[nodiscard]] std::expected<User, CreateError>
create_user(std::string_view email, std::string_view name);
```

### TypeScript / JavaScript
- **Generator**: TypeDoc (the canonical TS API doc generator) — emits Markdown or HTML. For product-facing docs, Mintlify / Astro Starlight / Docusaurus pull TypeDoc JSON and render it inside the site.
- **Source format**: TSDoc / JSDoc with `@param`, `@returns`, `@throws`, `@deprecated`, `@example`.
- **API surface**: NestJS + `@nestjs/swagger` or zod-openapi + Hono/Express → OpenAPI; render with Scalar.
- **Build-time enforcement**: ESLint `eslint-plugin-tsdoc` flags malformed tags; TypeDoc fails on missing docs when `--validation.invalidLink` + `--validation.notDocumented` are enabled.

```typescript
/**
 * Create a new user account.
 *
 * @param email - User's email; must be unique and RFC 5322 compliant.
 * @param name  - Display name (1–128 chars).
 * @returns The created {@link User}.
 * @throws {@link ValidationError} if email is malformed.
 * @throws {@link DuplicateEmailError} if email already exists.
 * @example
 * ```ts
 * const u = await createUser("a@b.com", "Ada");
 * ```
 */
export async function createUser(email: string, name: string): Promise<User> { ... }
```

### SQL / Data
- **Generator**: SchemaSpy (Java tool, JDBC-driven; renders ER diagrams + table catalog) for raw relational schemas. For dbt projects: `dbt docs generate` + `dbt docs serve` produces a lineage graph and column-level documentation.
- **Source format**: For raw SQL — `COMMENT ON TABLE`/`COMMENT ON COLUMN` (Postgres) or table/column comment DDL (MySQL/SQL Server). For dbt — `description:` fields in `schema.yml`.
- **Build-time enforcement**: `dbt-checkpoint` (or `dbt test`) fails CI on missing model/column descriptions.

```yaml
# dbt — models/marts/users.yml
version: 2
models:
  - name: dim_users
    description: One row per user, latest values. Refreshes hourly.
    columns:
      - name: user_id
        description: Surrogate key. Stable across email changes.
        tests: [unique, not_null]
      - name: email
        description: Current verified email. Lower-cased, NFC-normalised.
```

```sql
-- Postgres native
COMMENT ON TABLE users IS 'One row per user account. PK = user_id.';
COMMENT ON COLUMN users.email IS 'Verified, lower-cased, NFC-normalised email.';
```

## Documentation Standards — Quick Reference (auxiliary)

The 7-language section above is canonical. The shorter examples below are kept for skim-reading.

### Python docstring
```python
def create_user(email: str, name: str) -> User:
    """Create a new user account.

    Args:
        email: User's email address (must be unique)
        name:  User's display name

    Returns:
        The created User object

    Raises:
        ValidationError: If email is invalid
        DuplicateError:  If email already exists
    """
```

### JSDoc / TSDoc
```typescript
/**
 * Create a new user account
 * @param email - User's email address (must be unique)
 * @param name  - User's display name
 * @returns The created User object
 * @throws {ValidationError} If email is invalid
 */
function createUser(email: string, name: string): User { }
```

### Go
```go
// CreateUser creates a new user account.
//
// It validates the email format and checks for duplicates.
// Returns the created user or an error if validation fails.
func CreateUser(email, name string) (*User, error) { }
```

## ADR — MADR Template

Use the **MADR** (Markdown Architectural Decision Records) format. Source: `adr/madr` on GitHub. File path: `docs/adr/NNNN-short-title.md` where `NNNN` is a 4-digit sequence.

Minimal MADR fields (mandatory):

```markdown
---
status: proposed | accepted | superseded by [ADR-NNNN](./NNNN-...md) | deprecated
date: 2026-05-19
deciders: [person, person]
---

# {short noun phrase describing the decision}

## Context and Problem Statement
{what is the issue we're seeing that is motivating this decision?}

## Considered Options
- option 1
- option 2
- option 3

## Decision Outcome
Chosen option: "{option N}", because {justification}.

### Consequences
- Good: ...
- Bad:  ...
```

ADRs are **immutable once accepted**. If the decision changes: write a new ADR, set `status: superseded by [ADR-...]` on the old one, link both directions. Never edit an accepted ADR in place.

## What NOT to Document

- Self-explanatory code (`i++  // increment i`)
- Every line of implementation — comment intent and invariants, not mechanics
- Temporary workarounds (use `TODO(ticket-id):` referencing a tracker, not `TODO: fix later`)
- Private/internal helpers that are not part of the public API surface

## Output Format (human-readable report)

```markdown
## Documentation Update Report

### Files Updated
1. `README.md` — added Authentication section, updated env vars
2. `docs/api/users.md` — added POST /users endpoint + error codes
3. `src/services/auth.py` — docstrings on 3 public functions
4. `docs/adr/0042-switch-auth-provider.md` — new ADR (MADR format)
5. `docs/migrations/v3.md` — migration guide for renamed `getUser` → `fetchUser`

### Documentation Coverage
| Surface           | Before | After | Tool      |
|-------------------|--------|-------|-----------|
| Public functions  | <X%>   | <Y%>  | interrogate / TypeDoc / Javadoc |
| API endpoints     | <X%>   | <Y%>  | OpenAPI spec coverage |
| README sections   | <X%>   | <Y%>  | manual checklist |

> Coverage numbers come from the project's actual docstring-coverage tool output.
> Do not hand-author percentages — surface them from the tool's report or omit the row.

### Missing / Drift Findings
- `src/utils/helpers.py:18` — `parse_iso8601` lacks docstring (kind: missing_api_doc)
- `docs/install.md` — link to `./old-setup.md` is broken (kind: broken_link)
- `docs/tutorials/getting-started.md` — code block at L42 never executed in CI (kind: untested_snippet)
- Auth-provider swap merged in PR #318 — no ADR present (kind: missing_adr)

### Changelog Entry
[markdown block sourced from changelog-generator]
```

## Automation

- **OpenAPI** auto-rendered from framework decorators (FastAPI, NestJS, Spring + springdoc, ASP.NET Core minimal API, zod-openapi).
- **TypeDoc** from TSDoc.
- **Sphinx / mkdocstrings** from Python docstrings.
- **Javadoc / Spring REST Docs** from Java.
- **DocFX** from C# XML comments.
- **Doxygen** from C/C++.
- **SchemaSpy / dbt docs** from SQL/data layers.
- **Vale** for prose style; **lychee** or **markdown-link-check** for links; **language-specific snippet runners** for fenced code blocks.

## Tool Integration (2026)

Static-site generators:

| Tool | Strengths | When |
|------|-----------|------|
| **Docusaurus** (Meta) | React-based, large plugin ecosystem, native i18n + versioning | Engineering-heavy projects that already do React; want full theming control |
| **MkDocs** + Material theme | Python-native, dead-simple YAML config, fast | Python projects, small-to-medium docs, fastest setup |
| **Mintlify** | Hosted, ships AI search + analytics + OpenAPI rendering out of the box | Product teams that ship often and want managed infra |
| **Astro Starlight** | Fast runtime, MDX, lower opinionation than Docusaurus | Mixed JS/TS projects, MDX-heavy authors |
| **Hugo** | Fastest builder by far; Go-templated | Very large doc sites (thousands of pages) where build time matters |

Quality gates (must be in CI):

| Tool | Checks | Failure mode |
|------|--------|--------------|
| **lychee** | Broken internal + external links | Fail build on dead link (with retry for transient 5xx) |
| **markdown-link-check** | Per-file link verification | Alternative to lychee in Node-only stacks |
| **Vale** | Prose style, terminology consistency, voice rules | Warn or error per `.vale.ini` severity config |
| **(language-specific snippet runners)** | Fenced code blocks compile/execute | Fail build on snippet error |
| **interrogate** / **TypeDoc validation** / **`-Xdoclint:all`** | Public-API docstring coverage | Fail under threshold |

Data layer:

| Tool | Use |
|------|-----|
| **dbt docs** | Lineage graph + column docs for dbt models; gate with `dbt-checkpoint` |
| **SchemaSpy** | ER diagrams + table catalog from JDBC-reachable DBs |

API / contract:

| Tool | Use |
|------|-----|
| **OpenAPI** | Source-of-truth for HTTP APIs; render with Scalar / Redocly / Swagger UI / Mintlify |
| **AsyncAPI** | Same idea for event-driven / message-queue APIs |
| **GraphQL SDL + graphql-doc-generator** | GraphQL schemas |

ADR / decisions:

| Tool | Use |
|------|-----|
| **MADR template** (`adr/madr`) | Standard Markdown ADR format; full + minimal variants |
| **adr-tools** (npryce) | CLI scaffolding for ADR files + supersede links |
| **log4brains** | Web UI rendering of an ADR log; integrates with Docusaurus |

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used inside the human-readable report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers stay in the report for prioritization; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|-------------|----------|-----------------|
| CRITICAL    | Breaking change shipped with no migration guide; ADR-required decision merged without ADR; public API endpoint completely undocumented; broken link on landing page or install page | Fix before release |
| HIGH        | Code/doc inconsistency on public API (renamed symbol still in docs); broken link inside a tutorial; untested code snippet in a quickstart | Fix in same PR / sprint |
| MEDIUM      | Stale page (`last-updated > 6 mo`) where underlying code changed; missing docstring on a public-but-non-headline function; OpenAPI spec missing example values | Backlog; next docs sweep |
| LOW         | Internal-helper docstring gaps; prose-style nits from Vale (passive voice, weasel words); cosmetic ToC ordering | Opportunistic |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+target_file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                         # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                            # high = directly observed; low = heuristic match
engine: link-checker | snippet-runner | doc-coverage | ast-diff | adr-detector | vale | manual
kind: stale_doc | broken_link | untested_snippet | missing_adr | missing_api_doc | missing_migration_guide | inconsistent_code_doc
target_file: docs/api/users.md
line: 42                                                   # null if file-level
related_code_symbol: "src/api/users.py:create_user"        # for inconsistent_code_doc / missing_api_doc
related_decision: "PR #318 — switch auth provider"          # for missing_adr
last_updated: 2025-09-14                                   # for stale_doc; ISO 8601
message: "Public function `create_user` lacks a docstring; OpenAPI render will show empty description."
suggested_fix: |
  Add Google-style docstring to src/api/users.py:create_user with Args/Returns/Raises.
  Will be picked up by mkdocstrings on next build.
reference: https://diataxis.fr/reference/
```

`confidence: low` single-source findings (e.g. Vale-only style nits) do not block phase advancement on their own; two independent engines agreeing (e.g. lychee + manual review) escalate. `kind: missing_migration_guide` always cross-links to [[backwards-compatibility-checker]].

## Quality Checklist (before declaring Step 15 done)

- [ ] Every new/changed public API surface has generator-readable docs (docstring / XML doc / Javadoc / TSDoc)
- [ ] README reflects new features, env vars, and quickstart that actually runs
- [ ] Every breaking change has a migration entry (cross-linked from [[backwards-compatibility-checker]])
- [ ] Every architecturally significant decision in this plan has an ADR (MADR format)
- [ ] All examples are executed by CI (snippet runner or doctest)
- [ ] `lychee` (or equivalent) passes — no broken links
- [ ] Vale passes at the project's configured severity level
- [ ] Docstring-coverage tool meets project threshold (interrogate / TypeDoc / `-Xdoclint:all`)
- [ ] OpenAPI / SDL / AsyncAPI spec regenerated and committed

---

## Refinement Loop — critic mode (v6.9.16)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every doc drift, broken link, untested snippet, missing ADR, missing API doc, missing migration guide, and code/doc inconsistency you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Doc findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a doc that's wrong today is a support ticket tomorrow and a re-architecture meeting next quarter. Code that ships green-with-broken-docs ships with known latent confusion.
