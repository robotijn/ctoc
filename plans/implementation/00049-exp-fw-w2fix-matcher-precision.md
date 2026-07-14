---
title: "FW-w2 fix — client-secret matcher precision (false positives block legit code)"
type: implementation
parent_plan: ctoc-registry-expansion
depends_on: 00048-exp-fw-w2-client-secret-check
priority: HIGH
program: ctoc-registry-expansion
iron_loop: true
files:
  - "src/lib/framework-security-checker.js"
  - ".ctoc/capabilities/frameworks/fastapi.yaml"
  - ".ctoc/capabilities/frameworks/nestjs.yaml"
  - "tests/framework-security-checker.test.js"
---

# FW-w2 fix — matcher precision (5 confirmed false positives + 1 data semantics)

The check is correctly WIRED and the true positive fires (NEXT_PUBLIC_API_SECRET → HIGH,
verified). The defects are matcher PRECISION — confirmed false positives that each produce a
HIGH and BLOCK the gate on legitimate, common code. Fix them (fail-safe direction is not an
excuse to block valid work — "the measure is the human").

## F1 (MEDIUM-HIGH) — `TOKEN` flags public web3/search config
CONFIRMED: `NEXT_PUBLIC_TOKEN_ADDRESS=0xabc` → HIGH. A crypto contract address / symbol / a
search-only token is public, deliberately client-shipped. web3 + Next.js is very common.
FIX: drop bare `TOKEN` from SECRET_INDICATORS; require the AUTH-token compounds only:
`ACCESS_TOKEN`, `AUTH_TOKEN`, `API_TOKEN`, `BEARER_TOKEN`, `SESSION_TOKEN`, `REFRESH_TOKEN`
(the same "compound, not bare" treatment `KEY` already gets). `NEXT_PUBLIC_TOKEN_ADDRESS` →
0; `NEXT_PUBLIC_ACCESS_TOKEN` → HIGH.

## F2 (MEDIUM) — comment lines are scanned; a var NAMED in a comment → HIGH
CONFIRMED: `.env.example` line `# never expose NEXT_PUBLIC_API_SECRET` → HIGH; a `//`
source comment likewise. `.env.example` is conventionally full of documented var names.
FIX: in `scanContent`, skip full-comment lines — `#`-leading lines in `.env*` files, and
`//`-leading lines + `/* … */` blocks in source (strip block comments like migration-safety
does). A line whose first non-whitespace is a comment marker is not an assignment.

## F3 (LOW-MEDIUM) — prefix pooling + `SECRET` substring in benign flags
CONFIRMED: `PUBLIC_AUTH_TOKEN=abc` in a Next-only repo → HIGH (Next does not expose `PUBLIC_`;
that is SvelteKit/Astro's prefix). And `NEXT_PUBLIC_SECRET_SANTA_ENABLED=true` → HIGH (a
feature flag).
FIX (two parts):
1. SCOPE prefixes to the DETECTED frameworks. Add a framework→prefixes map in the checker
   (NEXT_PUBLIC_→nextjs; NUXT_PUBLIC_→nuxt; VITE_→vue/svelte/react/astro; PUBLIC_→svelte/astro;
   REACT_APP_→react; GATSBY_→gatsby; EXPO_PUBLIC_→expo), and build the active prefix set from
   ONLY the detected env-exposure frameworks (from `frameworkCapabilities`). A Next-only repo
   then never scans for `PUBLIC_`. (If cleaner, put a `publicEnvPrefixes` list on the frontend
   framework YAMLs and read it — either is fine; scope to detected frameworks is the point.)
2. Tighten `SECRET`: match only as a TERMINAL segment (`…_SECRET` end of name) or `…SECRET_KEY`,
   not a mid-name substring. `NEXT_PUBLIC_API_SECRET` (terminal) → HIGH; `NEXT_PUBLIC_CLIENT_SECRET`
   → HIGH; `NEXT_PUBLIC_SECRET_SANTA_ENABLED` (SECRET mid-name) → 0.

## F4 (MEDIUM, mostly inherent) — docstring overstates coverage
The module docstring claims exposure happens "only when the name carries the public prefix."
Next.js `env`/`publicRuntimeConfig` and Vite `define` inline ANY listed var into the client
bundle with NO prefix. FIX: soften the docstring to "prefix-named exposures only" and note the
config-block escape hatch (next.config `env`/`publicRuntimeConfig`, vite `define`) as an
explicit KNOWN blind spot. No code change for this one.

## F5 (LOW) — mixed-case indicator after a valid uppercase prefix
`VITE_apiSecret` / `NEXT_PUBLIC_apiSecret` → no match (real exposures, camelCase tail). The
uppercase-prefix requirement is correct; the case-sensitive INDICATOR is the miss. FIX: match
the indicator case-INSENSITIVELY *after* a correctly-uppercased prefix (keep the prefix
case-sensitive). Verify this does not reintroduce a mid-word false positive (the terminal/
compound anchoring from F1/F3 must still hold case-insensitively). If it risks new FPs, instead
DOCUMENT it honestly as a limitation — do not ship a fix that trades a rare FN for common FPs.

## F6 (LOW, data) — `env-exposure` on backend frameworks
CONFIRMED: `fastapi.yaml` and `nestjs.yaml` list `env-exposure`, but they have NO client bundle
— the client-secret check should not consider them relevant. FIX: change their concern from
`env-exposure` to `sensitive-settings` (matching django.yaml's honest backend term). The
client-secret check keys off `env-exposure`, so this correctly stops it considering a pure
backend relevant.

## TDD-Red FIRST — add the confirmed FPs as guards to tests/framework-security-checker.test.js
`NEXT_PUBLIC_TOKEN_ADDRESS` → 0; `NEXT_PUBLIC_ACCESS_TOKEN` → HIGH; `.env.example` comment
`# … NEXT_PUBLIC_API_SECRET` → 0; a `//` source comment → 0; `PUBLIC_AUTH_TOKEN` in a Next-only
repo → 0; a SvelteKit repo `PUBLIC_AUTH_TOKEN` → HIGH; `NEXT_PUBLIC_SECRET_SANTA_ENABLED` → 0;
`NEXT_PUBLIC_API_SECRET` (control) → HIGH; a FastAPI-only repo is not relevant (scanned:false).
Run RED first.

## VERIFY (Step 14) — paste verbatim
`node --test tests/framework-security-checker.test.js tests/quality-fleet-wiring.test.js
tests/security.test.js tests/capability-frameworks.test.js` all green; a hand-run replaying the
4 confirmed FPs (all now 0) + the true positive (still HIGH) + the SvelteKit PUBLIC_ positive;
eslint clean; tsc 0; enforcer 0 block; NO git. Step 16: confirm each FP is gone, the true
positives still fire, and the docstring/F6 honesty fixes.

## Decisions Taken Under Ambiguity

- **F5 — chose the FIX for underscore-delimited tails, DOCUMENTED the residual camelCase
  miss as a limitation.** The name TAIL after a correctly-uppercased prefix is now matched
  case-INSENSITIVELY (via per-letter `[Ss]`-style classes built at module load — NO `i` flag,
  so the PREFIX stays case-sensitive as required). This catches `VITE_api_secret` /
  `VITE_Api_Secret` (uppercase prefix, lower/mixed underscore-delimited tail). A pure
  camelCase-glued tail with NO underscore before the indicator (`VITE_apiSecret`) is left as a
  documented FALSE-NEGATIVE, because the only way to catch it is matching `SECRET` mid-token,
  which reintroduces common false positives (`theSecretDoor`, `SecretAgent`, `TokenBucket`) —
  the plan forbids trading a rare FN for common FPs. Recorded in the module docstring.

- **Framework→prefix map completeness (F3.1).** The plan's map omitted three detected
  env-exposure frameworks. Decisions: `laravel` → `VITE_` (Laravel's front-end tooling IS Vite;
  its client env prefix is literally `VITE_`, so mapping it prevents a real Laravel+Vite false
  NEGATIVE). `angular` and `remix` → NO entry: their env exposure is not prefix-named (Angular's
  build-time `environment.ts` replacement; Remix's loader/`window.ENV`), so this NAME-based,
  prefix-scoped scan cannot key on them — that is exactly the F4 documented blind spot, not a
  covered case. A detected framework with no map entry contributes no prefix (never a false pool).

- **Dead-export fence (wired-is-done).** The refactor made the old flat `PUBLIC_PREFIXES` and
  `SECRET_INDICATORS` exports internally unreferenced (they used to feed the single old regex).
  Rather than leave dead exports, both were DELETED; `FRAMEWORK_PUBLIC_PREFIXES`,
  `COMPOUND_INDICATORS`, and `TERMINAL_INDICATOR` are the live sources (internally referenced +
  exported). Confirmed `enforcer --mode=thorough` block count returns to 0.
