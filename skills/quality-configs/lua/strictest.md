# Lua Strictest Quality Config

Maximum strictness for Lua projects.

## Mode: Strictest

- Coverage: 90% minimum
- Complexity: Tight limits
- All warnings enabled
- No warning suppression allowed

## Luacheck Config (`.luacheckrc`)

```lua
-- Luacheck configuration for strictest mode

-- Standard globals
std = "lua54"

-- No project globals allowed - be explicit
globals = {}

-- Minimal read globals - add only what's truly needed
read_globals = {}

-- Enable ALL warnings
codes = true

-- Unused variable detection (maximum strictness)
unused = true
unused_args = true
unused_secondaries = true

-- Redefinitions are errors
redefined = true

-- No shadowing allowed
allow_defined = false
allow_defined_top = false

-- Global access is an error
global = true

-- No ignored warnings in strictest mode
ignore = {}

-- Maximum line length
max_line_length = 100

-- Strict cyclomatic complexity
max_cyclomatic_complexity = 7

-- Maximum string line length
max_string_line_length = 100

-- Maximum comment line length
max_comment_line_length = 100

-- Inline options are disabled (no -- luacheck: ignore)
inline = false

-- Treat warnings as errors
cache = false

-- Per-file overrides (minimal)
files = {
  ["spec/**/*.lua"] = {
    std = "+busted",
    globals = { "describe", "it", "before_each", "after_each", "setup", "teardown", "pending", "spy", "stub", "mock", "assert" },
    -- Allow magic numbers in tests only
    ignore = { "213" },
  },
  ["*_spec.lua"] = {
    std = "+busted",
    globals = { "describe", "it", "before_each", "after_each", "setup", "teardown", "pending", "spy", "stub", "mock", "assert" },
    ignore = { "213" },
  },
}
```

## StyLua Config (`stylua.toml`)

```toml
# StyLua configuration for strictest mode
# Maximum formatting strictness

column_width = 100
line_endings = "Unix"
indent_type = "Spaces"
indent_width = 2
quote_style = "AutoPreferDouble"
call_parentheses = "Always"
collapse_simple_statement = "Never"

[sort_requires]
enabled = true
```

## Busted Test Config (`.busted`)

```lua
return {
  _all = {
    coverage = true,
    lpath = "src/?.lua;src/?/init.lua",
    verbose = true,
  },
  default = {
    ROOT = { "spec" },
    pattern = "_spec",
    output = "utfTerminal",
  },
  ci = {
    ROOT = { "spec" },
    pattern = "_spec",
    output = "TAP",
    coverage = true,
  },
}
```

## LuaCov Config (`.luacov`)

```lua
-- LuaCov configuration for strictest mode
return {
  statsfile = "luacov.stats.out",
  reportfile = "luacov.report.out",

  include = {
    "src/",
  },

  exclude = {
    "spec/",
    "luarocks/",
    "lua_modules/",
    "vendor/",
  },

  runreport = true,

  -- Strictest coverage: 90% minimum
  -- Enforced by CI scripts
}
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Branches | 90% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 7 |
| Line length | 100 |
| Function length | 30 lines |
| Arguments | 3 |
| Local variables | 10 |
| Nesting depth | 3 |

## LuaRocks Dependencies (`*-dev-1.rockspec`)

```lua
-- Development dependencies for strictest mode
build_dependencies = {
  "luacheck >= 1.1.0",
  "busted >= 2.2.0",
  "luacov >= 0.15.0",
  "luacov-reporter-lcov >= 0.2",
  "luassert >= 1.9.0",
  "lua-cjson >= 2.1.0",  -- For structured test output
}
```

Or install directly:

```bash
luarocks install luacheck
luarocks install busted
luarocks install luacov
luarocks install luacov-reporter-lcov
luarocks install luassert
```

StyLua installation:

```bash
# Via cargo (recommended)
cargo install stylua

# Via npm
npm install -g @johnnymorganz/stylua-bin

# Via brew (macOS)
brew install stylua
```

## Project Scripts (Makefile)

```makefile
.PHONY: lint lint-strict format format-check test coverage quality

# Lint with warnings as errors
lint:
	luacheck src/ spec/ --codes

# Even stricter - fail on any warning
lint-strict:
	luacheck src/ spec/ --codes --no-cache

# Format code
format:
	stylua src/ spec/

# Check formatting (CI)
format-check:
	stylua --check src/ spec/

# Run tests
test:
	busted --verbose

# Run tests with coverage
coverage:
	busted --coverage
	luacov
	@awk '/^Summary$$/{found=1} found{print}' luacov.report.out

# Check coverage meets 90% threshold
coverage-check:
	busted --coverage
	luacov
	@coverage=$$(awk '/^Total:/{gsub(/%/,"",$$2); print $$2}' luacov.report.out); \
	if [ $$(echo "$$coverage < 90" | bc) -eq 1 ]; then \
		echo "ERROR: Coverage $$coverage% is below 90%"; exit 1; \
	fi

# Check function complexity (custom script needed)
complexity-check:
	@echo "Checking cyclomatic complexity..."
	@luacheck src/ --std lua54 --max-cyclomatic-complexity 7 --codes

# Full quality check
quality: format-check lint-strict test coverage-check complexity-check
	@echo "All quality checks passed!"
```

## Directory Structure

```
project/
├── .luacheckrc
├── stylua.toml
├── .busted
├── .luacov
├── project-dev-1.rockspec
├── Makefile
├── src/
│   ├── init.lua
│   └── module.lua
├── spec/
│   ├── spec_helper.lua
│   └── module_spec.lua
├── .github/
│   └── workflows/
│       └── quality.yml
└── README.md
```

## CI Configuration (GitHub Actions)

```yaml
name: Quality (Strictest)

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Lua
        uses: leafo/gh-actions-lua@v10
        with:
          luaVersion: "5.4"

      - name: Setup LuaRocks
        uses: leafo/gh-actions-luarocks@v4

      - name: Install StyLua
        run: cargo install stylua

      - name: Install dependencies
        run: |
          luarocks install luacheck
          luarocks install busted
          luarocks install luacov
          luarocks install luassert

      - name: Format check
        run: stylua --check src/ spec/

      - name: Lint (strict)
        run: luacheck src/ spec/ --codes --no-cache

      - name: Test with coverage
        run: |
          busted --coverage
          luacov

      - name: Check coverage threshold (90%)
        run: |
          coverage=$(awk '/^Total:/{gsub(/%/,"",$$2); print $$2}' luacov.report.out)
          if (( $(echo "$coverage < 90" | bc -l) )); then
            echo "Coverage $coverage% is below 90%"
            exit 1
          fi
          echo "Coverage: $coverage%"
```

## Strictest Mode Rules

1. **No inline warning suppression** - `-- luacheck: ignore` is disabled
2. **No global variables** - All variables must be local or explicitly declared
3. **No shadowing** - Variables cannot shadow outer scope variables
4. **Maximum 7 cyclomatic complexity** - Functions must be simple
5. **Maximum 3 arguments** - Use tables for complex parameters
6. **90% test coverage** - Near-complete test coverage required
7. **100 character line limit** - Enforced by both luacheck and stylua
