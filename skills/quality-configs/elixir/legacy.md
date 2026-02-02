# Elixir Legacy Quality Config

Gradual adoption configuration for migrating existing Elixir projects.

## Mode: Legacy

- Coverage: 50% minimum
- Complexity: Relaxed limits
- Type checking: Optional typespecs
- Incremental Dialyzer adoption

## Credo Config (`.credo.exs`)

```elixir
# .credo.exs - Legacy mode configuration
%{
  configs: [
    %{
      name: "default",
      strict: false,
      color: true,
      files: %{
        included: [
          "lib/",
          "src/",
          "web/",
          "apps/*/lib/",
          "apps/*/src/",
          "apps/*/web/"
        ],
        excluded: [
          ~r"/_build/",
          ~r"/deps/",
          ~r"/node_modules/",
          ~r"/priv/static/",
          ~r"/test/"
        ]
      },
      plugins: [],
      requires: [],
      parse_timeout: 5000,
      checks: %{
        enabled: [
          #
          # Consistency Checks - Basic
          #
          {Credo.Check.Consistency.ExceptionNames, []},
          {Credo.Check.Consistency.LineEndings, []},
          {Credo.Check.Consistency.SpaceAroundOperators, []},
          {Credo.Check.Consistency.SpaceInParentheses, []},
          {Credo.Check.Consistency.TabsOrSpaces, []},

          #
          # Design Checks - Relaxed
          #
          {Credo.Check.Design.TagFIXME, [exit_status: 0]},

          #
          # Readability Checks - Essential only
          #
          {Credo.Check.Readability.FunctionNames, []},
          {Credo.Check.Readability.MaxLineLength, [priority: :low, max_length: 150]},
          {Credo.Check.Readability.ModuleAttributeNames, []},
          {Credo.Check.Readability.ModuleNames, []},
          {Credo.Check.Readability.ParenthesesInCondition, []},
          {Credo.Check.Readability.TrailingBlankLine, []},
          {Credo.Check.Readability.TrailingWhiteSpace, []},
          {Credo.Check.Readability.VariableNames, []},

          #
          # Refactoring Opportunities - Relaxed limits
          #
          {Credo.Check.Refactor.CyclomaticComplexity, [max_complexity: 15]},
          {Credo.Check.Refactor.FunctionArity, [max_arity: 8]},
          {Credo.Check.Refactor.Nesting, [max_nesting: 4]},
          {Credo.Check.Refactor.UnlessWithElse, []},

          #
          # Warnings - Critical only
          #
          {Credo.Check.Warning.Dbg, []},
          {Credo.Check.Warning.IExPry, []},
          {Credo.Check.Warning.IoInspect, [exit_status: 0]},
          {Credo.Check.Warning.OperationOnSameValues, []},
          {Credo.Check.Warning.OperationWithConstantResult, []},
          {Credo.Check.Warning.RaiseInsideRescue, []},
          {Credo.Check.Warning.UnsafeExec, []},
          {Credo.Check.Warning.UnsafeToAtom, []},
          {Credo.Check.Warning.UnusedEnumOperation, []},
          {Credo.Check.Warning.UnusedListOperation, []},
          {Credo.Check.Warning.UnusedStringOperation, []}
        ],
        disabled: [
          # Disabled for legacy - enable incrementally
          {Credo.Check.Consistency.ParameterPatternMatching, false},
          {Credo.Check.Consistency.UnusedVariableNames, false},
          {Credo.Check.Consistency.MultiAliasImportRequireUse, false},
          {Credo.Check.Design.AliasUsage, false},
          {Credo.Check.Design.DuplicatedCode, false},
          {Credo.Check.Design.TagTODO, false},
          {Credo.Check.Readability.AliasOrder, false},
          {Credo.Check.Readability.ModuleDoc, false},
          {Credo.Check.Readability.Specs, false},
          {Credo.Check.Readability.StrictModuleLayout, false},
          {Credo.Check.Refactor.ABCSize, false},
          {Credo.Check.Refactor.CondStatements, false},
          {Credo.Check.Refactor.DoubleBooleanNegation, false},
          {Credo.Check.Refactor.NegatedConditionsInUnless, false},
          {Credo.Check.Refactor.NegatedConditionsWithElse, false},
          {Credo.Check.Refactor.PipeChainStart, false},
          {Credo.Check.Refactor.VariableRebinding, false}
        ]
      }
    }
  ]
}
```

## Dialyzer Config (`mix.exs`)

```elixir
# In mix.exs - Legacy Dialyzer configuration (minimal)
def project do
  [
    app: :your_app,
    version: "1.0.0",
    elixir: "~> 1.15",
    start_permanent: Mix.env() == :prod,
    deps: deps(),
    dialyzer: dialyzer(),
    test_coverage: [tool: ExCoveralls],
    preferred_cli_env: [
      coveralls: :test,
      "coveralls.detail": :test,
      "coveralls.html": :test
    ]
  ]
end

defp dialyzer do
  [
    plt_core_path: "priv/plts",
    plt_local_path: "priv/plts",
    # Minimal flags for legacy code
    flags: [
      :error_handling,
      :no_return
    ],
    # Allow ignoring warnings during migration
    ignore_warnings: ".dialyzer_ignore.exs"
  ]
end
```

## Mix Dependencies (`mix.exs`)

```elixir
defp deps do
  [
    # Code quality
    {:credo, "~> 1.7", only: [:dev, :test], runtime: false},
    {:dialyxir, "~> 1.4", only: [:dev, :test], runtime: false},

    # Testing and coverage
    {:excoveralls, "~> 0.18", only: :test}
  ]
end
```

## ExUnit Config (`test/test_helper.exs`)

```elixir
ExUnit.start(capture_log: true)

# Configure ExCoveralls
ExCoveralls.start()
```

## Coverage Config (`coveralls.json`)

```json
{
  "coverage_options": {
    "minimum_coverage": 50,
    "treat_no_relevant_lines_as_covered": true
  },
  "skip_files": [
    "test/",
    "deps/",
    "lib/your_app_web/telemetry.ex",
    "lib/your_app/release.ex"
  ]
}
```

## Dialyzer Ignore File (`.dialyzer_ignore.exs`)

```elixir
# Add patterns to ignore during migration
# Remove patterns as you fix the underlying issues
[
  # Example: ignore all warnings in legacy modules
  # ~r/lib\/your_app\/legacy\/.*/,

  # Example: ignore specific warning types temporarily
  # {:warn_return_only_exit, :_, :_}
]
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
| Function arity | 8 |
| Max nesting | 4 |
| Function lines | 100 |

## Install Commands

```bash
# Add dependencies
mix deps.get

# Build Dialyzer PLT (optional in legacy mode)
mkdir -p priv/plts
mix dialyzer --plt
```

## Project Scripts

Add to `mix.exs`:

```elixir
defp aliases do
  [
    lint: ["credo"],
    lint_strict: ["credo --strict"],
    dialyzer: ["dialyzer --format dialyxir"],
    test_cov: ["coveralls --min-coverage 50"],
    quality: ["lint", "test_cov"],
    # Use for CI - relaxed for legacy
    ci: ["format --check-formatted", "lint", "test_cov"]
  ]
end
```

## Commands

```bash
# Lint with Credo (relaxed)
mix credo

# Preview stricter checks
mix credo --strict

# Run Dialyzer (optional)
mix dialyzer

# Run tests with coverage
mix coveralls

# Check formatting
mix format --check-formatted

# Run basic quality checks
mix quality
```

## Upgrade Path

### Phase 1: Foundation (Week 1-2)
1. Fix all Credo warnings at current level
2. Add `.formatter.exs` and run `mix format`
3. Set up CI with basic checks
4. Reach 50% test coverage

### Phase 2: Gradual Strictness (Week 3-4)
1. Enable `--strict` flag in Credo
2. Enable additional Credo checks one by one:
   - `Credo.Check.Readability.ModuleDoc`
   - `Credo.Check.Readability.AliasOrder`
   - `Credo.Check.Design.AliasUsage`
3. Increase coverage to 60%

### Phase 3: Type Safety (Week 5-6)
1. Run Dialyzer, add all warnings to ignore file
2. Add `@spec` to new functions
3. Fix Dialyzer warnings one module at a time
4. Remove patterns from ignore file as fixed

### Phase 4: Strict Mode (Week 7-8)
1. Enable `Credo.Check.Readability.Specs`
2. Lower complexity limits
3. Increase coverage to 80%
4. Add Sobelow for security

### Configuration Transition

As you improve, replace `.credo.exs` sections:

```elixir
# Move checks from disabled to enabled:
{Credo.Check.Readability.ModuleDoc, []},
{Credo.Check.Readability.Specs, [exit_status: 0]},  # Warning first
{Credo.Check.Readability.Specs, []},                 # Then error

# Tighten limits gradually:
{Credo.Check.Refactor.CyclomaticComplexity, [max_complexity: 15]},  # Start
{Credo.Check.Refactor.CyclomaticComplexity, [max_complexity: 12]},  # Tighten
{Credo.Check.Refactor.CyclomaticComplexity, [max_complexity: 10]},  # Strict
```

## Directory Structure

```
project/
├── mix.exs
├── mix.lock
├── .credo.exs
├── .formatter.exs
├── .dialyzer_ignore.exs
├── coveralls.json
├── lib/
│   └── your_app/
│       ├── application.ex
│       └── module.ex
├── test/
│   ├── test_helper.exs
│   └── your_app/
│       └── module_test.exs
├── priv/
│   └── plts/
└── README.md
```

## Formatter Config (`.formatter.exs`)

```elixir
[
  inputs: [
    "{mix,.formatter}.exs",
    "{config,lib,test}/**/*.{ex,exs}"
  ],
  line_length: 150,  # Relaxed for legacy
  locals_without_parens: [
    # Phoenix
    plug: :*,
    pipe_through: :*,
    get: :*,
    post: :*,
    put: :*,
    patch: :*,
    delete: :*,
    resources: :*,
    # Ecto
    field: :*,
    belongs_to: :*,
    has_many: :*,
    has_one: :*,
    embeds_one: :*,
    embeds_many: :*
  ]
]
```

## Metrics Tracking

Track your progress with these metrics:

```bash
# Count Credo issues
mix credo --strict 2>&1 | grep "issues found"

# Count Dialyzer warnings
mix dialyzer 2>&1 | grep -c "warning:"

# Coverage percentage
mix coveralls | grep "Coverage:"

# Modules without typespecs
mix doctor --summary
```

## Tips for Legacy Migration

1. **Start with formatting** - `mix format` is safe and immediate
2. **Add tests for changes** - Don't refactor without tests
3. **One module at a time** - Focus efforts, don't boil the ocean
4. **Track technical debt** - Document known issues
5. **Celebrate progress** - Each check enabled is a win
