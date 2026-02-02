# Elixir Strict Quality Config

Strict mode configuration for Elixir projects with Credo and Dialyzer.

## Mode: Strict

- Coverage: 80% minimum
- Complexity: Standard limits
- Type checking: Dialyzer standard
- Static analysis: Credo strict

## Credo Config (`.credo.exs`)

```elixir
# .credo.exs - Strict mode configuration
%{
  configs: [
    %{
      name: "default",
      strict: true,
      color: true,
      files: %{
        included: [
          "lib/",
          "src/",
          "test/",
          "web/",
          "apps/*/lib/",
          "apps/*/src/",
          "apps/*/test/",
          "apps/*/web/"
        ],
        excluded: [
          ~r"/_build/",
          ~r"/deps/",
          ~r"/node_modules/",
          ~r"/priv/static/"
        ]
      },
      plugins: [],
      requires: [],
      parse_timeout: 5000,
      checks: %{
        enabled: [
          #
          # Consistency Checks
          #
          {Credo.Check.Consistency.ExceptionNames, []},
          {Credo.Check.Consistency.LineEndings, []},
          {Credo.Check.Consistency.ParameterPatternMatching, []},
          {Credo.Check.Consistency.SpaceAroundOperators, []},
          {Credo.Check.Consistency.SpaceInParentheses, []},
          {Credo.Check.Consistency.TabsOrSpaces, []},
          {Credo.Check.Consistency.UnusedVariableNames, []},
          {Credo.Check.Consistency.MultiAliasImportRequireUse, []},

          #
          # Design Checks
          #
          {Credo.Check.Design.AliasUsage,
           [priority: :low, if_nested_deeper_than: 2, if_called_more_often_than: 0]},
          {Credo.Check.Design.DuplicatedCode, [mass_threshold: 60]},
          {Credo.Check.Design.TagTODO, [exit_status: 0]},
          {Credo.Check.Design.TagFIXME, []},

          #
          # Readability Checks
          #
          {Credo.Check.Readability.AliasOrder, []},
          {Credo.Check.Readability.FunctionNames, []},
          {Credo.Check.Readability.LargeNumbers, []},
          {Credo.Check.Readability.MaxLineLength, [priority: :low, max_length: 120]},
          {Credo.Check.Readability.ModuleAttributeNames, []},
          {Credo.Check.Readability.ModuleDoc, []},
          {Credo.Check.Readability.ModuleNames, []},
          {Credo.Check.Readability.ParenthesesInCondition, []},
          {Credo.Check.Readability.ParenthesesOnZeroArityDefs, []},
          {Credo.Check.Readability.PipeIntoAnonymousFunctions, []},
          {Credo.Check.Readability.PredicateFunctionNames, []},
          {Credo.Check.Readability.PreferImplicitTry, []},
          {Credo.Check.Readability.RedundantBlankLines, []},
          {Credo.Check.Readability.Semicolons, []},
          {Credo.Check.Readability.SeparateAliasRequire, []},
          {Credo.Check.Readability.SingleFunctionToBlockPipe, []},
          {Credo.Check.Readability.SinglePipe, []},
          {Credo.Check.Readability.SpaceAfterCommas, []},
          {Credo.Check.Readability.Specs, [exit_status: 0]},
          {Credo.Check.Readability.StrictModuleLayout, []},
          {Credo.Check.Readability.StringSigils, []},
          {Credo.Check.Readability.TrailingBlankLine, []},
          {Credo.Check.Readability.TrailingWhiteSpace, []},
          {Credo.Check.Readability.UnnecessaryAliasExpansion, []},
          {Credo.Check.Readability.VariableNames, []},
          {Credo.Check.Readability.WithSingleClause, []},

          #
          # Refactoring Opportunities
          #
          {Credo.Check.Refactor.Apply, []},
          {Credo.Check.Refactor.CondStatements, []},
          {Credo.Check.Refactor.CyclomaticComplexity, [max_complexity: 10]},
          {Credo.Check.Refactor.DoubleBooleanNegation, []},
          {Credo.Check.Refactor.FilterCount, []},
          {Credo.Check.Refactor.FilterFilter, []},
          {Credo.Check.Refactor.FunctionArity, [max_arity: 5]},
          {Credo.Check.Refactor.LongQuoteBlocks, []},
          {Credo.Check.Refactor.MapJoin, []},
          {Credo.Check.Refactor.MatchInCondition, []},
          {Credo.Check.Refactor.NegatedConditionsInUnless, []},
          {Credo.Check.Refactor.NegatedConditionsWithElse, []},
          {Credo.Check.Refactor.NegatedIsNil, []},
          {Credo.Check.Refactor.Nesting, [max_nesting: 3]},
          {Credo.Check.Refactor.PassAsyncInTestCases, []},
          {Credo.Check.Refactor.PipeChainStart, []},
          {Credo.Check.Refactor.RedundantWithClauseResult, []},
          {Credo.Check.Refactor.RejectReject, []},
          {Credo.Check.Refactor.UnlessWithElse, []},
          {Credo.Check.Refactor.WithClauses, []},

          #
          # Warnings
          #
          {Credo.Check.Warning.ApplicationConfigInModuleAttribute, []},
          {Credo.Check.Warning.BoolOperationOnSameValues, []},
          {Credo.Check.Warning.Dbg, []},
          {Credo.Check.Warning.ExpensiveEmptyEnumCheck, []},
          {Credo.Check.Warning.IExPry, []},
          {Credo.Check.Warning.IoInspect, []},
          {Credo.Check.Warning.LazyLogging, []},
          {Credo.Check.Warning.LeakyEnvironment, []},
          {Credo.Check.Warning.MapGetUnsafePass, []},
          {Credo.Check.Warning.MissedMetadataKeyInLoggerConfig, []},
          {Credo.Check.Warning.MixEnv, []},
          {Credo.Check.Warning.OperationOnSameValues, []},
          {Credo.Check.Warning.OperationWithConstantResult, []},
          {Credo.Check.Warning.RaiseInsideRescue, []},
          {Credo.Check.Warning.SpecWithStruct, []},
          {Credo.Check.Warning.UnsafeExec, []},
          {Credo.Check.Warning.UnsafeToAtom, []},
          {Credo.Check.Warning.UnusedEnumOperation, []},
          {Credo.Check.Warning.UnusedFileOperation, []},
          {Credo.Check.Warning.UnusedKeywordOperation, []},
          {Credo.Check.Warning.UnusedListOperation, []},
          {Credo.Check.Warning.UnusedPathOperation, []},
          {Credo.Check.Warning.UnusedRegexOperation, []},
          {Credo.Check.Warning.UnusedStringOperation, []},
          {Credo.Check.Warning.UnusedTupleOperation, []},
          {Credo.Check.Warning.WrongTestFileExtension, []}
        ],
        disabled: [
          # Too noisy for strict mode, enable in strictest
          {Credo.Check.Readability.BlockPipe, false},
          {Credo.Check.Refactor.ABCSize, false}
        ]
      }
    }
  ]
}
```

## Dialyzer Config (`mix.exs`)

```elixir
# In mix.exs
def project do
  [
    app: :your_app,
    version: "1.0.0",
    elixir: "~> 1.17",
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
    plt_add_apps: [:ex_unit],
    flags: [
      :unmatched_returns,
      :error_handling,
      :no_opaque,
      :unknown,
      :no_return
    ],
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
    {:excoveralls, "~> 0.18", only: :test},
    {:ex_doc, "~> 0.34", only: :dev, runtime: false},

    # Optional: Additional static analysis
    {:sobelow, "~> 0.13", only: [:dev, :test], runtime: false}
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
    "minimum_coverage": 80,
    "treat_no_relevant_lines_as_covered": true
  },
  "skip_files": [
    "test/",
    "deps/",
    "lib/your_app_web/telemetry.ex"
  ]
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
| Function arity | 5 |
| Max nesting | 3 |
| Function lines | 50 |

## Install Commands

```bash
# Add dependencies
mix deps.get

# Build Dialyzer PLT (first time)
mkdir -p priv/plts
mix dialyzer --plt
```

## Project Scripts

Add to `mix.exs`:

```elixir
defp aliases do
  [
    lint: ["credo --strict"],
    dialyzer: ["dialyzer --format dialyxir"],
    test_cov: ["coveralls --min-coverage 80"],
    quality: ["lint", "dialyzer", "test_cov"],
    ci: ["format --check-formatted", "lint", "dialyzer", "test_cov"]
  ]
end
```

## Commands

```bash
# Lint with Credo
mix credo --strict

# Run Dialyzer
mix dialyzer

# Run tests with coverage
mix coveralls

# Check formatting
mix format --check-formatted

# Run all quality checks
mix quality
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
  line_length: 120,
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
