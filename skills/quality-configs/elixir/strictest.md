# Elixir Strictest Quality Config

Maximum strictness for Elixir projects.

## Mode: Strictest

- Coverage: 90% minimum
- Complexity: Tight limits
- All Credo checks enabled
- Dialyzer with all warnings
- Typespecs required

## Credo Config (`.credo.exs`)

```elixir
# .credo.exs - Strictest mode configuration
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
          # Consistency Checks - All enabled
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
          # Design Checks - Strict
          #
          {Credo.Check.Design.AliasUsage,
           [priority: :high, if_nested_deeper_than: 1, if_called_more_often_than: 0]},
          {Credo.Check.Design.DuplicatedCode, [mass_threshold: 40]},
          {Credo.Check.Design.TagTODO, [exit_status: 2]},
          {Credo.Check.Design.TagFIXME, [exit_status: 2]},

          #
          # Readability Checks - All enabled with strict settings
          #
          {Credo.Check.Readability.AliasOrder, []},
          {Credo.Check.Readability.BlockPipe, []},
          {Credo.Check.Readability.FunctionNames, []},
          {Credo.Check.Readability.ImplTrue, []},
          {Credo.Check.Readability.LargeNumbers, []},
          {Credo.Check.Readability.MaxLineLength, [priority: :high, max_length: 100]},
          {Credo.Check.Readability.ModuleAttributeNames, []},
          {Credo.Check.Readability.ModuleDoc, [priority: :high]},
          {Credo.Check.Readability.ModuleNames, []},
          {Credo.Check.Readability.NestedFunctionCalls, [min_pipeline_length: 2]},
          {Credo.Check.Readability.OnePipePerLine, []},
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
          {Credo.Check.Readability.Specs, [exit_status: 2]},
          {Credo.Check.Readability.StrictModuleLayout, []},
          {Credo.Check.Readability.StringSigils, []},
          {Credo.Check.Readability.TrailingBlankLine, []},
          {Credo.Check.Readability.TrailingWhiteSpace, []},
          {Credo.Check.Readability.UnnecessaryAliasExpansion, []},
          {Credo.Check.Readability.VariableNames, []},
          {Credo.Check.Readability.WithCustomTaggedTuple, []},
          {Credo.Check.Readability.WithSingleClause, []},

          #
          # Refactoring Opportunities - Strict limits
          #
          {Credo.Check.Refactor.ABCSize, [max_size: 30]},
          {Credo.Check.Refactor.Apply, []},
          {Credo.Check.Refactor.CondStatements, []},
          {Credo.Check.Refactor.CyclomaticComplexity, [max_complexity: 7]},
          {Credo.Check.Refactor.DoubleBooleanNegation, []},
          {Credo.Check.Refactor.FilterCount, []},
          {Credo.Check.Refactor.FilterFilter, []},
          {Credo.Check.Refactor.FunctionArity, [max_arity: 4]},
          {Credo.Check.Refactor.IoPuts, []},
          {Credo.Check.Refactor.LongQuoteBlocks, [max_line_count: 100]},
          {Credo.Check.Refactor.MapJoin, []},
          {Credo.Check.Refactor.MapMap, []},
          {Credo.Check.Refactor.MatchInCondition, []},
          {Credo.Check.Refactor.ModuleDependencies, [max_deps: 10]},
          {Credo.Check.Refactor.NegatedConditionsInUnless, []},
          {Credo.Check.Refactor.NegatedConditionsWithElse, []},
          {Credo.Check.Refactor.NegatedIsNil, []},
          {Credo.Check.Refactor.Nesting, [max_nesting: 2]},
          {Credo.Check.Refactor.PassAsyncInTestCases, []},
          {Credo.Check.Refactor.PerceivedComplexity, [max_complexity: 8]},
          {Credo.Check.Refactor.PipeChainStart, []},
          {Credo.Check.Refactor.RedundantWithClauseResult, []},
          {Credo.Check.Refactor.RejectReject, []},
          {Credo.Check.Refactor.UnlessWithElse, []},
          {Credo.Check.Refactor.VariableRebinding, []},
          {Credo.Check.Refactor.WithClauses, []},

          #
          # Warnings - All enabled
          #
          {Credo.Check.Warning.ApplicationConfigInModuleAttribute, []},
          {Credo.Check.Warning.BoolOperationOnSameValues, []},
          {Credo.Check.Warning.Dbg, []},
          {Credo.Check.Warning.ExpensiveEmptyEnumCheck, []},
          {Credo.Check.Warning.ForbiddenModule, [modules: []]},
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
        disabled: []
      }
    }
  ]
}
```

## Dialyzer Config (`mix.exs`)

```elixir
# In mix.exs - Strictest Dialyzer configuration
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
    plt_add_apps: [:ex_unit, :mix],
    # All warnings enabled for strictest mode
    flags: [
      :unmatched_returns,
      :error_handling,
      :no_opaque,
      :unknown,
      :no_return,
      :extra_return,
      :missing_return,
      :underspecs,
      :overspecs,
      :specdiffs,
      :no_undefined_callbacks
    ],
    # No ignores in strictest mode - fix all warnings
    # ignore_warnings: ".dialyzer_ignore.exs"
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
    {:stream_data, "~> 1.1", only: [:dev, :test]},
    {:mox, "~> 1.1", only: :test},

    # Documentation
    {:ex_doc, "~> 0.34", only: :dev, runtime: false},

    # Security analysis
    {:sobelow, "~> 0.13", only: [:dev, :test], runtime: false},

    # Additional static analysis
    {:doctor, "~> 0.21", only: [:dev, :test]},
    {:ex_check, "~> 0.16", only: [:dev, :test], runtime: false}
  ]
end
```

## ExUnit Config (`test/test_helper.exs`)

```elixir
ExUnit.start(
  capture_log: true,
  max_failures: 1,
  seed: 0,
  timeout: 60_000
)

# Configure ExCoveralls
ExCoveralls.start()

# Configure Mox for behavior verification
Mox.defmock(YourApp.MockService, for: YourApp.ServiceBehaviour)
```

## Coverage Config (`coveralls.json`)

```json
{
  "coverage_options": {
    "minimum_coverage": 90,
    "treat_no_relevant_lines_as_covered": false
  },
  "skip_files": [
    "test/support/",
    "lib/your_app_web/telemetry.ex"
  ]
}
```

## ex_check Config (`.check.exs`)

```elixir
[
  parallel: true,
  skipped: false,
  tools: [
    {:compiler, "mix compile --warnings-as-errors --force"},
    {:formatter, "mix format --check-formatted"},
    {:credo, "mix credo --strict"},
    {:dialyzer, "mix dialyzer --format dialyxir"},
    {:sobelow, "mix sobelow --config"},
    {:doctor, "mix doctor"},
    {:ex_doc, "mix docs"},
    {:ex_unit, "mix coveralls --min-coverage 90"}
  ]
]
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
| Perceived complexity | 8 |
| ABC size | 30 |
| Function arity | 4 |
| Max nesting | 2 |
| Function lines | 30 |
| Module dependencies | 10 |

## Install Commands

```bash
# Add dependencies
mix deps.get

# Build Dialyzer PLT (first time, takes a while)
mkdir -p priv/plts
mix dialyzer --plt
```

## Project Scripts

Add to `mix.exs`:

```elixir
defp aliases do
  [
    lint: ["credo --strict --all"],
    dialyzer: ["dialyzer --format dialyxir"],
    sobelow: ["sobelow --config"],
    test_cov: ["coveralls --min-coverage 90"],
    docs: ["docs --warnings-as-errors"],
    quality: [
      "compile --warnings-as-errors",
      "format --check-formatted",
      "lint",
      "dialyzer",
      "sobelow",
      "doctor",
      "test_cov"
    ],
    ci: ["quality"]
  ]
end
```

## Commands

```bash
# Lint with Credo (strictest)
mix credo --strict --all

# Run Dialyzer with all warnings
mix dialyzer

# Security analysis
mix sobelow --config

# Documentation quality
mix doctor

# Run tests with coverage
mix coveralls --min-coverage 90

# Check formatting
mix format --check-formatted

# Compile with warnings as errors
mix compile --warnings-as-errors

# Run all quality checks
mix quality
```

## Sobelow Config (`.sobelow-conf`)

```elixir
[
  verbose: true,
  exit: "high",
  format: "txt",
  ignore: [],
  ignore_files: [],
  private: false,
  router: "lib/your_app_web/router.ex",
  skip: false
]
```

## Doctor Config (`.doctor.exs`)

```elixir
%Doctor.Config{
  exception_moduledoc_required: true,
  failed: false,
  ignore_modules: [],
  ignore_paths: [],
  min_module_doc_coverage: 100,
  min_module_spec_coverage: 100,
  min_overall_doc_coverage: 90,
  min_overall_moduledoc_coverage: 100,
  min_overall_spec_coverage: 90,
  moduledoc_required: true,
  raise: false,
  reporter: Doctor.Reporters.Full,
  struct_type_spec_required: true,
  umbrella: false
}
```

## Directory Structure

```
project/
├── mix.exs
├── mix.lock
├── .credo.exs
├── .formatter.exs
├── .check.exs
├── .doctor.exs
├── .sobelow-conf
├── coveralls.json
├── lib/
│   └── your_app/
│       ├── application.ex
│       ├── behaviours/
│       │   └── service_behaviour.ex
│       └── module.ex
├── test/
│   ├── test_helper.exs
│   ├── support/
│   │   └── mocks.ex
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
    "{mix,.formatter,.credo,.doctor,.check}.exs",
    "{config,lib,test}/**/*.{ex,exs}"
  ],
  line_length: 100,
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
    embeds_many: :*,
    # ExUnit
    assert: :*,
    refute: :*
  ]
]
```

## Required Practices

1. **Every public function must have a @spec**
2. **Every module must have @moduledoc**
3. **No TODO/FIXME comments** (fix them or create issues)
4. **No debug statements** (IO.inspect, dbg, etc.)
5. **Property-based testing** for critical functions
6. **Mocks via behaviors** for external dependencies
