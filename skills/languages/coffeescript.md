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
