# Ruby Strict Quality Config

Strict mode configuration for Ruby projects with RuboCop and RSpec.

## Mode: Strict

- Coverage: 80% minimum
- Complexity: Standard limits
- Warnings: Treated as errors

## RuboCop Config (`.rubocop.yml`)

```yaml
require:
  - rubocop-rspec
  - rubocop-performance
  - rubocop-rake

AllCops:
  TargetRubyVersion: 3.2
  NewCops: enable
  SuggestExtensions: false
  Exclude:
    - 'bin/**/*'
    - 'db/schema.rb'
    - 'node_modules/**/*'
    - 'vendor/**/*'
    - 'tmp/**/*'

# Strict mode: treat all offenses as errors
inherit_mode:
  merge:
    - Exclude

# Layout Cops
Layout/LineLength:
  Max: 120
  AllowedPatterns:
    - '^\s*#'
    - '^\s*it '

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

# Lint Cops
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

# Metrics Cops - Strict limits
Metrics/AbcSize:
  Max: 20

Metrics/BlockLength:
  Max: 25
  Exclude:
    - 'spec/**/*'
    - 'config/**/*'
    - '*.gemspec'

Metrics/ClassLength:
  Max: 150

Metrics/CyclomaticComplexity:
  Max: 10

Metrics/MethodLength:
  Max: 50
  CountAsOne:
    - array
    - hash
    - heredoc

Metrics/ModuleLength:
  Max: 200

Metrics/ParameterLists:
  Max: 4
  CountKeywordArgs: true

Metrics/PerceivedComplexity:
  Max: 10

# Naming Cops
Naming/PredicateName:
  ForbiddenPrefixes:
    - is_

Naming/RescuedExceptionsVariableName:
  PreferredName: error

# Style Cops
Style/Documentation:
  Enabled: true
  Exclude:
    - 'spec/**/*'
    - 'db/migrate/**/*'

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

# RSpec Cops
RSpec/ExampleLength:
  Max: 20

RSpec/MultipleExpectations:
  Max: 5

RSpec/NestedGroups:
  Max: 4

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
  Max: 10

# Performance Cops
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

  minimum_coverage 80
  minimum_coverage_by_file 70

  refuse_coverage_drop
end

RSpec.configure do |config|
  config.expect_with :rspec do |expectations|
    expectations.include_chain_clauses_in_custom_matcher_descriptions = true
    expectations.syntax = :expect
  end

  config.mock_with :rspec do |mocks|
    mocks.verify_partial_doubles = true
  end

  config.shared_context_metadata_behavior = :apply_to_host_groups
  config.filter_run_when_matching :focus
  config.example_status_persistence_file_path = "spec/examples.txt"
  config.disable_monkey_patching!
  config.warnings = true

  config.default_formatter = "doc" if config.files_to_run.one?

  config.order = :random
  Kernel.srand config.seed
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
  gem "simplecov", "~> 0.22"
end
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Branches | 80% |
| Functions | 80% |
| Per-file minimum | 70% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 10 |
| Perceived complexity | 10 |
| ABC size | 20 |
| Method length | 50 lines |
| Class length | 150 lines |
| Module length | 200 lines |
| Parameters | 4 |
| Nesting depth | 4 |

## Install Command

```bash
bundle add rubocop rubocop-performance rubocop-rspec rubocop-rake simplecov rspec --group development,test
```

## Rake Tasks

```ruby
# frozen_string_literal: true

require "rubocop/rake_task"
require "rspec/core/rake_task"

RuboCop::RakeTask.new(:rubocop) do |task|
  task.options = ["--fail-level", "error"]
end

RSpec::Core::RakeTask.new(:spec) do |task|
  task.rspec_opts = ["--format", "documentation"]
end

desc "Run all quality checks"
task quality: [:rubocop, :spec]

task default: :quality
```

## Package Scripts (in Rakefile)

```ruby
# frozen_string_literal: true

require "rubocop/rake_task"
require "rspec/core/rake_task"

RuboCop::RakeTask.new(:lint)
RuboCop::RakeTask.new("lint:fix") do |task|
  task.options = ["-a"]
end

RSpec::Core::RakeTask.new(:test)

desc "Run linter and tests with coverage"
task quality: [:lint, :test]
```
