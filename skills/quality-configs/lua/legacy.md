# Lua Legacy Quality Config

Gradual adoption configuration for migrating existing Lua projects.

## Mode: Legacy

- Coverage: 50% minimum
- Complexity: Relaxed limits
- Linting: Essential errors only

## Luacheck Config (`.luacheckrc`)

```lua
-- Luacheck configuration for legacy mode
-- Focus on critical errors, not style

-- Standard globals
std = "lua54"

-- Allow common globals in legacy code
globals = {
  -- Add your project globals here
}

read_globals = {
  -- Common legacy globals
  "arg",
  "bit",
  "bit32",
  "jit",
}

-- Enable only critical warnings
codes = true

-- Relaxed unused detection
unused = true
unused_args = false  -- Allow unused arguments (common in callbacks)
unused_secondaries = false

-- Allow redefinitions in legacy code
redefined = false

-- Allow shadowing (common in legacy code)
allow_defined = true
allow_defined_top = true

-- Global access allowed (legacy code often uses globals)
global = false

-- Ignore common legacy patterns
ignore = {
  "212",    -- Unused argument
  "213",    -- Unused loop variable
  "542",    -- Empty if branch
  "611",    -- Line with only whitespace
  "612",    -- Line with trailing whitespace
  "614",    -- Trailing whitespace in string
}

-- Relaxed line length
max_line_length = 150

-- Relaxed cyclomatic complexity
max_cyclomatic_complexity = 15

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
  -- Ignore vendor/external code
  ["vendor/**"] = {
    ignore = { ".*" },
  },
  ["lua_modules/**"] = {
    ignore = { ".*" },
  },
}
```

## StyLua Config (`stylua.toml`)

```toml
# StyLua configuration for legacy mode
# Relaxed formatting to minimize churn

column_width = 150
line_endings = "Unix"
indent_type = "Spaces"
indent_width = 2
quote_style = "AutoPreferDouble"
call_parentheses = "NoSingleTable"  # Common legacy style
collapse_simple_statement = "FunctionOnly"

[sort_requires]
enabled = false  # Don't reorder requires in legacy code
```

## Busted Test Config (`.busted`)

```lua
return {
  _all = {
    coverage = false,  -- Optional coverage in legacy mode
    lpath = "?.lua;?/init.lua;src/?.lua;src/?/init.lua",
    verbose = true,
  },
  default = {
    ROOT = { "spec", "test", "tests" },  -- Support multiple test directories
    pattern = "_spec",
    output = "utfTerminal",
  },
  ci = {
    ROOT = { "spec", "test", "tests" },
    pattern = "_spec",
    output = "TAP",
    coverage = true,
  },
}
```

## LuaCov Config (`.luacov`)

```lua
-- LuaCov configuration for legacy mode
return {
  statsfile = "luacov.stats.out",
  reportfile = "luacov.report.out",

  include = {
    "src/",
  },

  exclude = {
    "spec/",
    "test/",
    "tests/",
    "luarocks/",
    "lua_modules/",
    "vendor/",
    "external/",
  },

  runreport = true,

  -- Legacy coverage: 50% minimum
}
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |
| Branches | 50% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 15 |
| Line length | 150 |
| Function length | 100 lines |
| Arguments | 7 |

## LuaRocks Dependencies (`*-dev-1.rockspec`)

```lua
-- Development dependencies for legacy mode
build_dependencies = {
  "luacheck >= 1.1.0",
  "busted >= 2.2.0",
  "luacov >= 0.15.0",
}
```

Or install directly:

```bash
luarocks install luacheck
luarocks install busted
luarocks install luacov
```

StyLua installation (optional for legacy):

```bash
# Via cargo
cargo install stylua

# Via npm
npm install -g @johnnymorganz/stylua-bin
```

## Project Scripts (Makefile)

```makefile
.PHONY: lint format test coverage quality

# Lint with relaxed rules
lint:
	luacheck src/ spec/ || true  # Don't fail build initially

# Lint (errors only, for CI)
lint-errors:
	luacheck src/ spec/ --codes --no-max-line-length

# Format (optional in legacy mode)
format:
	stylua src/ spec/ || echo "StyLua not installed, skipping format"

# Format check (non-blocking)
format-check:
	stylua --check src/ spec/ || echo "Format issues found (non-blocking)"

# Run tests
test:
	busted

# Run tests with coverage
coverage:
	busted --coverage || true
	luacov || true
	@cat luacov.report.out 2>/dev/null || echo "Coverage report not generated"

# Check coverage meets 50% threshold (warning only)
coverage-check:
	@busted --coverage && luacov && \
	coverage=$$(awk '/^Total:/{gsub(/%/,"",$$2); print $$2}' luacov.report.out); \
	if [ $$(echo "$$coverage < 50" | bc) -eq 1 ]; then \
		echo "WARNING: Coverage $$coverage% is below 50%"; \
	else \
		echo "Coverage: $$coverage%"; \
	fi

# Quality check (permissive)
quality: lint-errors test
	@echo "Basic quality checks passed"
```

## Directory Structure

```
project/
├── .luacheckrc
├── stylua.toml            # Optional
├── .busted
├── .luacov
├── project-dev-1.rockspec
├── Makefile
├── src/
│   ├── init.lua
│   └── module.lua
├── spec/                  # Or test/ or tests/
│   └── module_spec.lua
├── vendor/                # Excluded from linting
└── README.md
```

## Upgrade Path

Gradually increase quality requirements:

### Phase 1: Setup (Week 1-2)
1. Add luacheck with legacy config
2. Add busted test framework
3. Fix critical errors only

### Phase 2: Basic Quality (Month 1)
1. Achieve 50% test coverage
2. Enable unused variable detection
3. Fix obvious lint errors

### Phase 3: Improved Quality (Month 2-3)
1. Move to strict mode config
2. Increase coverage to 80%
3. Add StyLua formatting

### Phase 4: Full Quality (Month 4+)
1. Consider strictest mode
2. Target 90% coverage
3. Enable all lint rules

## CI Configuration (GitHub Actions)

```yaml
name: Quality (Legacy)

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

      - name: Install dependencies
        run: |
          luarocks install luacheck
          luarocks install busted
          luarocks install luacov

      - name: Lint (errors only)
        run: luacheck src/ spec/ --codes --no-max-line-length

      - name: Test
        run: busted

      - name: Coverage report (informational)
        run: |
          busted --coverage || true
          luacov || true
          cat luacov.report.out || echo "No coverage report"
        continue-on-error: true
```

## Legacy Mode Philosophy

1. **Don't break what works** - Minimal changes to existing code
2. **Fix critical bugs first** - Focus on undefined globals, syntax errors
3. **Add tests gradually** - Start with critical paths
4. **Improve incrementally** - Move to stricter modes over time
5. **Track progress** - Monitor coverage and lint errors over time
