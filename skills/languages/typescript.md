# TypeScript CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses `any` as escape hatch — use `unknown` and narrow
- Claude suggests enum — use `as const` objects or union types
- Claude forgets TypeScript 6.0 will be rewritten in Go (10x faster)
- Claude uses legacy eslintrc — use flat config (`eslint.config.js`)

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `typescript 5.8+` | Strict mode always | Loose config |
| `eslint 9` flat config | Linting | Legacy .eslintrc |
| `vitest` | Testing | Jest (slower) |
| `tsx` | TS execution | `ts-node` (slower) |
| `biome` | Format + lint (optional) | Separate tools |

## Patterns Claude Should Use
```typescript
// Inferred type predicates (TS 5.5+)
const isString = (x: unknown) => typeof x === "string";
// TS now infers: (x: unknown) => x is string

// Discriminated unions for state
type State =
  | { status: "loading" }
  | { status: "success"; data: Data }
  | { status: "error"; error: Error };

// satisfies for type checking without widening
const config = {
  port: 3000,
  host: "localhost",
} satisfies ServerConfig;
```

## Anti-Patterns Claude Generates
- `as Type` assertions hiding bugs — use type guards
- `!` non-null assertion — handle nulls explicitly
- `@ts-ignore` without comment — use `@ts-expect-error` with reason
- `enum` with runtime overhead — use const objects
- `Function` type — use specific signatures

## Version Gotchas
- **5.6+**: `--noUncheckedSideEffectImports` catches bad imports
- **5.6+**: `IteratorObject` type for native iterators
- **5.5+**: Type predicates auto-inferred in filter callbacks
- **With Node**: Use `"type": "module"` and `.js` extensions in imports
- **With React**: Prefer `React.FC` removed — use function declarations

## Strict Mode and the Type System
`strict: true` is a bundle — it turns on `noImplicitAny`, `strictNullChecks`,
`strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`,
`noImplicitThis`, `useUnknownInCatchVariables`, and `alwaysStrict`. The two that
catch the most real bugs are `strictNullChecks` (null/undefined are separate
types you must handle) and `noImplicitAny` (untyped params/vars error instead of
silently becoming `any`). Turn `strict` on from day one — retrofitting it later is
far more painful.

```typescript
// unknown vs any: any DISABLES the checker; unknown FORCES a narrow.
function handle(x: any) { x.foo.bar(); }        // compiles, crashes at runtime
function safe(x: unknown) {
  if (typeof x === "object" && x !== null && "foo" in x) { /* narrowed */ }
}

// catch variables are `unknown` under strict — narrow before use:
try { risky(); }
catch (e) {                                     // e: unknown (useUnknownInCatchVariables)
  if (e instanceof Error) logger.error(e.message);
}
```
- Source: typescriptlang.org tsconfig (`strict`). See References.

## Structural Typing Gotchas
TypeScript is **structurally** typed: a value is assignable if its shape matches —
there is no nominal identity. Two unrelated types with the same members are
interchangeable, which surprises people coming from Java/C#.

```typescript
// Excess-property checks fire ONLY on fresh object literals, not on variables:
interface Opts { timeout: number }
const o = { timeout: 5, retries: 3 };
takesOpts(o);              // OK — extra `retries` allowed (structural)
takesOpts({ timeout: 5, retries: 3 });   // ERROR — excess property on a literal

// Want nominal-ish safety? use a branded type:
type UserId = string & { readonly __brand: "UserId" };
```
- `as` assertions and `!` bypass the checker — they are your promise to the
  compiler, not a check. A wrong assertion is a runtime bug the types no longer
  guard.

## Async / Error Handling
```typescript
// Floating promises are a lint-caught bug (@typescript-eslint/no-floating-promises):
void logAsync();                         // deliberate fire-and-forget
await save(x);                           // or handle it

// Type the error path — promises reject with `any`/`unknown`, narrow it:
try { await load(); }
catch (e: unknown) { if (e instanceof HttpError) retry(); }
```
Keep this coherent with the JavaScript guide: same event-loop semantics, same
`Promise.all` fail-fast vs `Promise.allSettled` trade-off, same
unhandled-rejection-crashes-the-process behavior on Node. TypeScript adds
compile-time detection of floating promises via ESLint, but does not change
runtime behavior.

## Security and Dependency Gotchas
TypeScript's types are **erased at runtime** — they are not a security boundary.
An `x: Opts` parameter does nothing to stop a malicious payload; you still need
runtime validation (`zod`, `valibot`, `@types` do not validate).

- **The `any` / assertion hole**: `any`, `as`, and `!` disable the very checks you
  rely on. `JSON.parse()` returns `any` — validate its shape at the boundary instead
  of asserting `as User`. An unchecked `as` on untrusted input is a runtime bug the
  types no longer guard.
- **Prototype pollution (CWE-1321)** applies exactly as in JavaScript, since TS
  compiles to JS on the same runtime: merging attacker-controlled `__proto__` /
  `constructor` keys pollutes `Object.prototype`. Types do not prevent it — reject
  the keys or use `Map` / `Object.create(null)`. (cwe.mitre.org CWE-1321.)
- **Supply chain**: a `@types/*` package is third-party code you install; typosquatted
  or malicious `@types` and transitive deps are the same npm risk as the JS guide.
  Run `npm audit`, commit `package-lock.json`, and prefer `npm ci --ignore-scripts`
  in CI. Source: cwe.mitre.org, docs.npmjs.com. See References.

## Module Resolution Edge Cases
- Set `moduleResolution: "bundler"` (TS 5.0+) for Vite/esbuild projects; use
  `"nodenext"` for native Node ESM.
- Under ESM (`"type": "module"`), relative imports need the **`.js`** extension in
  source even though the file is `.ts` — you import the emit path:
  `import { x } from "./util.js";`.
- `esModuleInterop` / `allowSyntheticDefaultImports` govern CJS-default interop;
  a missing default import from a CJS module is usually this flag, not a bug in the
  package.
- `verbatimModuleSyntax` (TS 5.0) makes `import type` vs value imports explicit and
  drops type-only imports from the emit.

## Declaration-File Pitfalls
- A hand-written `.d.ts` that lies about a module's shape produces silent runtime
  failures — the types compile, the code breaks. Prefer generated declarations
  (`"declaration": true`).
- `declare module "x"` with `any` members re-opens the `any` hole you closed
  everywhere else — type the surface you actually use.

## Testing / Type-Testing
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { expectTypeOf } from "expect-type";     // or `tsd`

test("parses", () => { assert.equal(parse("2"), 2); });

// Assert the TYPE, not just the value:
expectTypeOf(parse).returns.toEqualTypeOf<number>();
```
- Run via `vitest` (fast, type-aware) or `tsx --test`; add `tsc --noEmit` as the
  type gate in CI alongside the unit tests.

## Performance Traps
- Enable `incremental: true` (and `tsBuildInfoFile`) and **project references**
  (`composite: true`) for large monorepos — full rebuilds get slow otherwise.
- `skipLibCheck: true` skips type-checking `.d.ts` files — a large real-world
  build-time win, at the cost of not validating your dependencies' types.
- Deeply recursive conditional/mapped types blow up compile time and hit the
  instantiation-depth limit — keep type-level programming shallow.

## Version-Specific Gotchas (dated, sourced)
- **TypeScript 5.9** is the current 5.x line: 5.9.3 released **2025-09-30** (5.9.2
  2025-07-31). This is the version most `@types` packages and toolchains target.
  [registry.npmjs.org/typescript, retrieved 2026-07-09]
- **5.8** (2025-02-28) tightened `--erasableSyntaxOnly` / Node type-stripping
  compatibility; **5.5** (2024) added inferred type predicates and the
  `IteratorObject` types. [registry.npmjs.org/typescript, retrieved 2026-07-09]
- **TypeScript 7.0** (the native "tsgo" port, compiler rewritten in Go for ~10x
  speed) has begun shipping — `typescript@7.0.2` published **2026-07-08** on npm.
  It is API-compatible but its performance/tooling story differs; pin deliberately.
  [registry.npmjs.org/typescript, retrieved 2026-07-09]
- Under strict mode, `catch (e)` binds `e` as `unknown` (not `any`) since 4.4
  (`useUnknownInCatchVariables`) — narrow before use.
  [typescriptlang.org release notes, retrieved 2026-07-09]

## References (retrieved 2026-07-09)
- TypeScript releases (npm): https://registry.npmjs.org/typescript
- tsconfig `strict` reference: https://www.typescriptlang.org/tsconfig/#strict
- moduleResolution reference: https://www.typescriptlang.org/tsconfig/#moduleResolution
- TS 5.x release notes: https://www.typescriptlang.org/docs/handbook/release-notes/overview.html
- unknown vs any (handbook): https://www.typescriptlang.org/docs/handbook/2/functions.html
- CWE-1321 (Prototype Pollution — shared JS/TS runtime concern): https://cwe.mitre.org/data/definitions/1321.html
