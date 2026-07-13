## Warnings-are-critical rule (v7 — refinement loop)

When you run as a critic in the Refinement Loop ([docs/REFINEMENT_LOOP.md](../../docs/REFINEMENT_LOOP.md)), classify ALL of the following as **critical-severity** findings:

- Compiler warnings (any language, any toolchain)
- Linter warnings (eslint, ruff, clippy, etc. — even at `warn` level)
- Type-checker warnings (TypeScript `noUnusedLocals`, mypy soft-warn, etc.)
- Deprecation notices (API deprecated, package deprecated, language feature deprecated)
- CVEs **of any severity** (low, medium, high, critical — all are critical-tier in the loop)
- Runtime warnings (UnhandledPromiseRejection, ResourceWarning, asyncio DeprecationWarning, etc.)
- Build-time warnings (peer-dependency mismatch, missing imports, circular deps)

**Why:** these are not "low priority" — they are signals of latent bugs. A linter warning today is a customer-visible bug after the next major-version upgrade strips the soft-warn affordance. A CVE rated "low" today may be the foothold for a chained exploit tomorrow. Code that ships green-with-warnings is code that ships with known latent failures.

**How to report:** emit each finding with `severity: critical` per the [letter schema](../../.ctoc/architecture/refinement-loop-schema.json). Do not invent a `warn` severity — the schema rejects it.

**Phase consequence:** because warnings are critical-tier, they block phase advancement. The loop does NOT proceed from `critical` → `medium` until every warning is resolved or explicitly waived (with a documented waiver under `## Decisions Taken Under Ambiguity` in the plan).

**Source principle:** [[principle_warnings_are_bugs]] — "even a warning or deprecation is a bug because it will crash the software in the future."
