# CoffeeScript CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses CoffeeScript 1 syntax — use CoffeeScript 2 (ES6+)
- Claude mixes tabs and spaces — use consistent 2-space indentation
- Claude forgets implicit return issues — be explicit for side effects
- Claude uses backticks for JS — rarely justified

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `coffeescript 2` | ES6+ output | CoffeeScript 1 |
| `coffeelint` | Style checking | No linting |
| `source maps` | Debugging | Debugging compiled JS |
| `mocha`/`jest` | Testing (on JS output) | Ad-hoc tests |
| `esbuild` | Bundling | Webpack (slower) |

## Patterns Claude Should Use
```coffee
# Fat arrow for bound context
class UserService
  constructor: (@api) ->

  # Fat arrow preserves this
  fetchUser: (id) =>
    @api.get("/users/#{id}")
      .then (response) =>
        @processUser(response.data)

  processUser: (data) ->
    name: data.name.trim()
    email: data.email.toLowerCase()

# Comprehensions over manual loops
squares = (x * x for x in [1..10])

# Destructuring
{name, email} = user

# Explicit return for side effects
logAndReturn = (value) ->
  console.log value
  return value  # Explicit, not implicit

# Default parameters
greet = (name = 'World') ->
  "Hello, #{name}!"
```

## Anti-Patterns Claude Generates
- CoffeeScript 1 syntax — upgrade to CoffeeScript 2
- Mixed tabs/spaces — use 2 spaces consistently
- Implicit return confusion — be explicit for side effects
- Backticks for inline JS — use proper CoffeeScript
- Thin arrow when fat needed — use `=>` for callbacks

## Version Gotchas
- **CoffeeScript 2**: Outputs ES6+, modern syntax
- **Source maps**: Enable for debugging
- **Fat arrow**: Use `=>` when `this` binding needed
- **Implicit returns**: Last expression returns automatically
- **Consider TypeScript**: CoffeeScript is in maintenance mode

## Legacy Status / Migration
- **CoffeeScript is a legacy, low-cadence language.** The features that once justified it —
  arrow functions, classes, destructuring, default params, spread, template strings,
  `async`/`await` — are now native to modern JavaScript and TypeScript. The latest release,
  **CoffeeScript 2.7.0, was published 2022-04-24** and the cadence is minimal. — https://coffeescript.org/ (retrieved 2026-07-10)
- **For NEW code, recommend TypeScript** (type safety + first-class tooling + the same ES2015+
  output CoffeeScript targets). This guide exists to correct edits to **existing** CoffeeScript
  codebases, not to greenfield new ones.
- Migration path: CoffeeScript 2 emits readable ES2015+; `decaffeinate` converts a codebase
  to modern JS, after which you can adopt TypeScript incrementally.

## Async Footguns
- **Classic CoffeeScript predates `async`/`await`** in its own syntax surface; CoffeeScript 2
  supports `await` (it transpiles to the JS equivalent), but a lot of legacy CoffeeScript is
  callback- or Promise-chain-based. Know which era the file is from.
- **Implicit return silently captures a Promise**: the last expression of a function is its
  return value, so a function whose last line is `foo.then(...)` returns that Promise whether
  you meant to or not — and a function ending in an `await` expression returns the resolved
  value. This bites callers who didn't expect a thenable.
- **Callback nesting**: legacy CoffeeScript's terse syntax hides deep callback pyramids —
  refactor to Promises/`await` when touching them.

```coffee
# Implicit return captures the Promise — often unintended.
loadUser = (id) ->
  fetch("/users/#{id}").then (r) -> r.json()   # returns a Promise implicitly

# Be explicit when the return matters (or when it's a side effect):
saveUser = (u) ->
  db.save(u)
  return                                        # explicit: do NOT leak db.save's value
```

## Error Handling Idioms
- **`try`/`catch` transpiles to JS semantics** — same event-loop caveats (a `throw` inside an
  async callback is not caught by a synchronous surrounding `try`).
- **Implicit return from `catch`**: because the last expression returns, a `catch` block's
  final expression becomes the function's return value on the error path — assert what you
  actually want to return.
- **Existential operator `?.` / `?=`** can *mask* real `undefined`/`null` bugs: `a?.b?.c`
  quietly yields `undefined` instead of throwing, hiding the fact that `a` was never set.
  Use it deliberately, not reflexively.

```coffee
parse = (raw) ->
  try
    JSON.parse raw
  catch e
    console.error e
    null            # explicit error-path return, not an accidental last expression

# Existential access can HIDE a missing-config bug:
timeout = config?.http?.timeout ? 5000    # silently 5000 if config is undefined
```

## Security and Dependency Gotchas
- **Transpiled output inherits the full JS supply-chain risk** — run `npm audit` (and pin
  via `package-lock.json`) on the project just as you would for any JS/TS codebase.
- **Backtick JS passthrough is `eval`-adjacent code injection — CWE-94.** CoffeeScript's
  backtick embeds raw JavaScript verbatim into the output; embedding anything derived from
  untrusted input inside backticks (or generating CoffeeScript/JS from user data) is
  Improper Control of Generation of Code. — https://cwe.mitre.org/data/definitions/94.html (retrieved 2026-07-10)
- **Source maps can leak original source** if `.map` files (or inline maps) are shipped to
  production — strip them from public bundles.

```coffee
# UNSAFE: backtick embeds raw JS verbatim => code injection (CWE-94)
`eval(userInput)`          # never — passthrough runs attacker JS

# Prefer real CoffeeScript; reserve backticks for trusted, static interop only.
```

## Testing Conventions
- Test the **transpiled JavaScript output**, not the `.coffee` source, with **Mocha** or
  Jasmine/Jest. A `coffee -c` (or build-step) compile precedes the test run.
- **Coverage** via `nyc` (Istanbul) on the compiled JS — map it back through the source maps
  so line numbers point at `.coffee`, not generated JS.
- Keep the compile step in CI so a syntax error in a `.coffee` file fails the build loudly
  rather than shipping stale JS.

## Performance Traps
- **Whitespace-significant syntax hides transpilation cost**: a terse comprehension or chained
  implicit return can generate more JS (and more allocations) than it looks like.
- **Comprehensions build and return arrays**: `(f(x) for x in xs)` allocates a result array
  even when you only wanted the side effects. Use an explicit loop (`for x in xs then f(x)`)
  when you don't need the collected result — otherwise you allocate an unused array every call.
- **Injected runtime helpers**: features like extends/splice generate helper functions in the
  output; bundling many small `.coffee` files can duplicate them — compile together or dedupe.

## Version-Specific Gotchas (CoffeeScript 2.x)
- **CoffeeScript 2.x targets ES2015+ output** (native `class`, arrow functions, `let`/`const`),
  whereas 1.x emitted ES5 with its own `class`-emulation helpers — output semantics differ, so
  a 1.x→2.x bump can change runtime behavior (e.g. bound-method and `class` semantics).
  — https://coffeescript.org/ (retrieved 2026-07-10)
- **Low maintenance cadence**: 2.7.0 (2022-04-24) is the current release; do not expect rapid
  fixes. Pin the compiler version and keep the compile step reproducible. — https://coffeescript.org/ (retrieved 2026-07-10)

## References
- CoffeeScript official site & docs — https://coffeescript.org/ (retrieved 2026-07-10)
- CWE-94 Code Injection — https://cwe.mitre.org/data/definitions/94.html (retrieved 2026-07-10)
