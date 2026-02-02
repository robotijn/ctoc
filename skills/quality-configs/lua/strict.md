# Lua Strict Quality Config

Strict mode configuration for Lua projects with Luacheck and StyLua.

## Mode: Strict

- Coverage: 80% minimum
- Complexity: Standard limits
- Linting: Luacheck standard rules

## Luacheck Config (`.luacheckrc`)

```lua
-- Luacheck configuration for strict mode

-- Standard globals
std = "lua54"

-- Project-specific globals
globals = {
  -- Add your project globals here
}

read_globals = {
  -- Third-party globals (read-only)
}

-- Warning codes to enable
-- See: https://luacheck.readthedocs.io/en/stable/warnings.html

-- Enable standard warnings
codes = true

-- Unused variables
unused = true
unused_args = true
unused_secondaries = true

-- Redefinitions
redefined = true

-- Shadowing
allow_defined = false
allow_defined_top = false

-- Global access
global = true

-- Ignore patterns
ignore = {
  "212/_.*",  -- Unused argument starting with _
}

-- Max line length (handled by StyLua, but check anyway)
max_line_length = 120

-- Max cyclomatic complexity
max_cyclomatic_complexity = 10

-- Max code column
max_code_line_length = 120

-- Per-file overrides
files = {
  ["spec/**/*.lua"] = {
    std = "+busted",
    globals = { "describe", "it", "before_each", "after_each", "setup", "teardown", "pending", "spy", "stub", "mock", "assert" },
  },
  ["*_spec.lua"] = {
    std = "+busted",
    globals = { "describe", "it", "before_each", "after_each", "setup", "teardown", "pending", "spy", "stub", "mock", "assert" },
  },
}
```

## StyLua Config (`stylua.toml`)

```toml
# StyLua configuration for strict mode
# See: https://github.com/JohnnyMorganz/StyLua

column_width = 120
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
-- LuaCov configuration
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
  },

  runreport = true,

  -- Coverage thresholds (checked by CI)
  -- Lines: 80%, Branches: 80%
}
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Branches | 80% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 10 |
| Line length | 120 |
| Function length | 50 lines |
| Arguments | 5 |

## LuaRocks Dependencies (`*-dev-1.rockspec`)

```lua
-- Development dependencies
build_dependencies = {
  "luacheck >= 1.1.0",
  "busted >= 2.2.0",
  "luacov >= 0.15.0",
  "luacov-reporter-lcov >= 0.2",
}
```

Or install directly:

```bash
luarocks install luacheck
luarocks install busted
luarocks install luacov
luarocks install luacov-reporter-lcov
```

StyLua is installed separately (Rust binary):

```bash
# Via cargo
cargo install stylua

# Via npm
npm install -g @johnnymorganz/stylua-bin

# Via brew (macOS)
brew install stylua
```

## Project Scripts (Makefile)

```makefile
.PHONY: lint format test coverage quality

lint:
	luacheck src/ spec/

format:
	stylua src/ spec/

format-check:
	stylua --check src/ spec/

test:
	busted

coverage:
	busted --coverage
	luacov
	@awk '/^Summary$$/{found=1} found{print}' luacov.report.out

coverage-check:
	busted --coverage
	luacov
	@coverage=$$(awk '/^Total:/{gsub(/%/,"",$$2); print $$2}' luacov.report.out); \
	if [ $$(echo "$$coverage < 80" | bc) -eq 1 ]; then \
		echo "Coverage $$coverage% is below 80%"; exit 1; \
	fi

quality: format-check lint test coverage-check
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
└── README.md
```

## CI Configuration (GitHub Actions)

```yaml
name: Quality

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

      - name: Format check
        run: stylua --check src/ spec/

      - name: Lint
        run: luacheck src/ spec/

      - name: Test with coverage
        run: |
          busted --coverage
          luacov
```
