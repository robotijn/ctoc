# Ruby Strictest Quality Config

Maximum strictness configuration for Ruby projects.

## Mode: Strictest

- Coverage: 90% minimum
- Complexity: Tight limits
- All cops enabled, no exceptions
- All warnings as errors

## RuboCop Config (`.rubocop.yml`)

```yaml
require:
  - rubocop-rspec
  - rubocop-performance
  - rubocop-rake
  - rubocop-thread_safety

AllCops:
  TargetRubyVersion: 3.2
  NewCops: enable
  SuggestExtensions: false
  EnabledByDefault: true
  Exclude:
    - 'bin/**/*'
    - 'db/schema.rb'
    - 'node_modules/**/*'
    - 'vendor/**/*'
    - 'tmp/**/*'

# Strictest mode: maximum enforcement
inherit_mode:
  merge:
    - Exclude

# Layout Cops - Strictest
Layout/LineLength:
  Max: 100
  AllowedPatterns: []

Layout/FirstArrayElementIndentation:
  EnforcedStyle: consistent

Layout/FirstHashElementIndentation:
  EnforcedStyle: consistent

Layout/MultilineMethodCallIndentation:
  EnforcedStyle: indented

Layout/EmptyLinesAroundAttributeAccessor:
  Enabled: true

Layout/SpaceAroundMethodCallOperator:
  Enabled: true

Layout/ClassStructure:
  Enabled: true
  Categories:
    module_inclusion:
      - include
      - prepend
      - extend
    associations:
      - has_one
      - has_many
      - belongs_to
      - has_and_belongs_to_many
  ExpectedOrder:
    - module_inclusion
    - constants
    - associations
    - public_class_methods
    - initializer
    - public_methods
    - protected_methods
    - private_methods

# Lint Cops - All enabled
Lint/AmbiguousBlockAssociation:
  Enabled: true

Lint/DeprecatedOpenSSLConstant:
  Enabled: true

Lint/DuplicateElsifCondition:
  Enabled: true

Lint/MixedRegexpCaptureTypes:
  Enabled: true

Lint/RaiseException:
  Enabled: true

Lint/StructNewOverride:
  Enabled: true

Lint/NumberConversion:
  Enabled: true

Lint/ConstantResolution:
  Enabled: true

# Metrics Cops - Strictest limits
Metrics/AbcSize:
  Max: 15

Metrics/BlockLength:
  Max: 15
  Exclude:
    - 'spec/**/*'
    - '*.gemspec'

Metrics/BlockNesting:
  Max: 3

Metrics/ClassLength:
  Max: 100

Metrics/CyclomaticComplexity:
  Max: 7

Metrics/MethodLength:
  Max: 30
  CountAsOne:
    - array
    - hash
    - heredoc

Metrics/ModuleLength:
  Max: 150

Metrics/ParameterLists:
  Max: 3
  CountKeywordArgs: true
  MaxOptionalParameters: 2

Metrics/PerceivedComplexity:
  Max: 7

# Naming Cops - Strictest
Naming/PredicateName:
  ForbiddenPrefixes:
    - is_
    - has_
    - have_

Naming/RescuedExceptionsVariableName:
  PreferredName: error

Naming/MethodParameterName:
  MinNameLength: 3
  AllowedNames:
    - id
    - to
    - by
    - on
    - in
    - io
    - ip
    - db
    - _

Naming/VariableName:
  EnforcedStyle: snake_case

# Style Cops - Strictest
Style/Documentation:
  Enabled: true

Style/DocumentationMethod:
  Enabled: true
  RequireForNonPublicMethods: false

Style/FrozenStringLiteralComment:
  Enabled: true
  EnforcedStyle: always

Style/StringLiterals:
  EnforcedStyle: double_quotes

Style/StringLiteralsInInterpolation:
  EnforcedStyle: double_quotes

Style/SymbolArray:
  EnforcedStyle: brackets

Style/WordArray:
  EnforcedStyle: brackets

Style/TrailingCommaInArrayLiteral:
  EnforcedStyleForMultiline: comma

Style/TrailingCommaInHashLiteral:
  EnforcedStyleForMultiline: comma

Style/TrailingCommaInArguments:
  EnforcedStyleForMultiline: comma

Style/HashEachMethods:
  Enabled: true

Style/HashTransformKeys:
  Enabled: true

Style/HashTransformValues:
  Enabled: true

Style/ExponentialNotation:
  Enabled: true

Style/SlicingWithRange:
  Enabled: true

Style/RedundantRegexpCharacterClass:
  Enabled: true

Style/RedundantRegexpEscape:
  Enabled: true

Style/RedundantFetchBlock:
  Enabled: true

Style/AccessorGrouping:
  Enabled: true

Style/BisectedAttrAccessor:
  Enabled: true

Style/RedundantAssignment:
  Enabled: true

Style/ArrayCoercion:
  Enabled: true

Style/CaseLikeIf:
  Enabled: true

Style/HashAsLastArrayItem:
  Enabled: true

Style/HashLikeCase:
  Enabled: true

Style/RedundantFileExtensionInRequire:
  Enabled: true

Style/TopLevelMethodDefinition:
  Enabled: true

Style/MethodCallWithArgsParentheses:
  Enabled: true
  AllowedMethods:
    - require
    - require_relative
    - puts
    - print
    - p
    - pp
    - raise
    - yield
    - include
    - extend
    - prepend
    - attr_reader
    - attr_writer
    - attr_accessor

Style/ImplicitRuntimeError:
  Enabled: true

Style/InlineComment:
  Enabled: false

Style/MethodCalledOnDoEndBlock:
  Enabled: true

Style/MissingElse:
  Enabled: true
  EnforcedStyle: case

Style/OptionHash:
  Enabled: true

Style/ReturnNil:
  Enabled: true
  EnforcedStyle: return

Style/Send:
  Enabled: true

Style/StringHashKeys:
  Enabled: true

# RSpec Cops - Strictest
RSpec/ExampleLength:
  Max: 15

RSpec/MultipleExpectations:
  Max: 3

RSpec/NestedGroups:
  Max: 3

RSpec/DescribeClass:
  Enabled: true

RSpec/EmptyExampleGroup:
  Enabled: true

RSpec/ExpectChange:
  EnforcedStyle: block

RSpec/ImplicitSubject:
  EnforcedStyle: single_statement_only

RSpec/LetSetup:
  Enabled: true

RSpec/MessageSpies:
  EnforcedStyle: receive

RSpec/MultipleMemoizedHelpers:
  Max: 5

RSpec/ContextWording:
  Prefixes:
    - when
    - with
    - without
    - if
    - unless
    - for

RSpec/ExampleWording:
  Enabled: true

RSpec/NamedSubject:
  Enabled: true

RSpec/VerifiedDoubles:
  Enabled: true

RSpec/VerifiedDoubleReference:
  Enabled: true
  EnforcedStyle: string

# Performance Cops - All enabled
Performance/AncestorsInclude:
  Enabled: true

Performance/BigDecimalWithNumericArgument:
  Enabled: true

Performance/BlockGivenWithExplicitBlock:
  Enabled: true

Performance/CollectionLiteralInLoop:
  Enabled: true

Performance/ConstantRegexp:
  Enabled: true

Performance/MethodObjectAsBlock:
  Enabled: true

Performance/RedundantSortBlock:
  Enabled: true

Performance/RedundantStringChars:
  Enabled: true

Performance/ReverseFirst:
  Enabled: true

Performance/SortReverse:
  Enabled: true

Performance/Squeeze:
  Enabled: true

Performance/StringInclude:
  Enabled: true

Performance/Sum:
  Enabled: true

Performance/OpenStruct:
  Enabled: true

Performance/ChainArrayAllocation:
  Enabled: true

# Thread Safety Cops
ThreadSafety/ClassAndModuleAttributes:
  Enabled: true

ThreadSafety/InstanceVariableInClassMethod:
  Enabled: true

ThreadSafety/NewThread:
  Enabled: true
```

## SimpleCov Config (`spec/spec_helper.rb`)

```ruby
# frozen_string_literal: true

require "simplecov"

SimpleCov.start do
  enable_coverage :branch

  add_filter "/spec/"
  add_filter "/config/"
  add_filter "/vendor/"

  add_group "Models", "app/models"
  add_group "Services", "app/services"
  add_group "Controllers", "app/controllers"
  add_group "Libraries", "lib"

  minimum_coverage 90
  minimum_coverage_by_file 80

  refuse_coverage_drop

  # Strictest: fail on any coverage drop
  maximum_coverage_drop 0
end

RSpec.configure do |config|
  config.expect_with :rspec do |expectations|
    expectations.include_chain_clauses_in_custom_matcher_descriptions = true
    expectations.syntax = :expect
    expectations.max_formatted_output_length = nil
  end

  config.mock_with :rspec do |mocks|
    mocks.verify_partial_doubles = true
    mocks.verify_doubled_constant_names = true
  end

  config.shared_context_metadata_behavior = :apply_to_host_groups
  config.filter_run_when_matching :focus
  config.example_status_persistence_file_path = "spec/examples.txt"
  config.disable_monkey_patching!
  config.warnings = true

  config.default_formatter = "doc" if config.files_to_run.one?

  config.order = :random
  Kernel.srand config.seed

  # Strictest: fail fast on first failure
  config.fail_fast = true

  # Strictest: raise on mocking methods that don't exist
  config.mock_with :rspec do |mocks|
    mocks.verify_partial_doubles = true
  end
end
```

## Gemfile Dependencies

```ruby
# frozen_string_literal: true

source "https://rubygems.org"

group :development, :test do
  gem "rspec", "~> 3.13"
  gem "rubocop", "~> 1.68"
  gem "rubocop-performance", "~> 1.23"
  gem "rubocop-rspec", "~> 3.2"
  gem "rubocop-rake", "~> 0.6"
  gem "rubocop-thread_safety", "~> 0.5"
  gem "simplecov", "~> 0.22"
end
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Branches | 90% |
| Functions | 90% |
| Per-file minimum | 80% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 7 |
| Perceived complexity | 7 |
| ABC size | 15 |
| Method length | 30 lines |
| Class length | 100 lines |
| Module length | 150 lines |
| Block length | 15 lines |
| Block nesting | 3 |
| Parameters | 3 |

## Install Command

```bash
bundle add rubocop rubocop-performance rubocop-rspec rubocop-rake rubocop-thread_safety simplecov rspec --group development,test
```

## Rake Tasks

```ruby
# frozen_string_literal: true

require "rubocop/rake_task"
require "rspec/core/rake_task"

RuboCop::RakeTask.new(:rubocop) do |task|
  task.options = ["--fail-level", "convention", "--display-only-fail-level-offenses"]
end

RSpec::Core::RakeTask.new(:spec) do |task|
  task.rspec_opts = ["--format", "documentation", "--fail-fast"]
end

desc "Run all quality checks with strictest settings"
task quality: [:rubocop, :spec]

task default: :quality
```
