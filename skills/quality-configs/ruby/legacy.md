# Ruby Legacy Quality Config

Gradual adoption configuration for migrating existing Ruby projects.

## Mode: Legacy

- Coverage: 50% minimum (baseline)
- Complexity: Relaxed limits
- Warnings allowed (not errors)
- Gradual strictness adoption

## RuboCop Config (`.rubocop.yml`)

```yaml
require:
  - rubocop-rspec
  - rubocop-performance

AllCops:
  TargetRubyVersion: 3.0
  NewCops: disable
  SuggestExtensions: false
  Exclude:
    - 'bin/**/*'
    - 'db/schema.rb'
    - 'db/migrate/**/*'
    - 'node_modules/**/*'
    - 'vendor/**/*'
    - 'tmp/**/*'
    - 'log/**/*'

# Legacy mode: relaxed for gradual adoption
inherit_mode:
  merge:
    - Exclude

# Layout Cops - Relaxed
Layout/LineLength:
  Max: 150
  AllowedPatterns:
    - '^\s*#'
    - '^\s*it '
    - '^\s*describe '
    - '^\s*context '

Layout/FirstArrayElementIndentation:
  Enabled: false

Layout/FirstHashElementIndentation:
  Enabled: false

Layout/MultilineMethodCallIndentation:
  Enabled: false

Layout/EmptyLinesAroundAttributeAccessor:
  Enabled: false

# Lint Cops - Essential only
Lint/AmbiguousBlockAssociation:
  Enabled: true

Lint/DeprecatedOpenSSLConstant:
  Enabled: true

Lint/DuplicateElsifCondition:
  Enabled: true

Lint/RaiseException:
  Enabled: true

Lint/StructNewOverride:
  Enabled: true

Lint/UselessAssignment:
  Enabled: true

Lint/UnusedBlockArgument:
  Enabled: false

Lint/UnusedMethodArgument:
  Enabled: false

# Metrics Cops - Relaxed limits
Metrics/AbcSize:
  Max: 40

Metrics/BlockLength:
  Max: 50
  Exclude:
    - 'spec/**/*'
    - 'config/**/*'
    - '*.gemspec'
    - 'Rakefile'

Metrics/BlockNesting:
  Max: 6

Metrics/ClassLength:
  Max: 300

Metrics/CyclomaticComplexity:
  Max: 15

Metrics/MethodLength:
  Max: 100
  CountAsOne:
    - array
    - hash
    - heredoc

Metrics/ModuleLength:
  Max: 400

Metrics/ParameterLists:
  Max: 6
  CountKeywordArgs: false

Metrics/PerceivedComplexity:
  Max: 15

# Naming Cops - Relaxed
Naming/PredicateName:
  Enabled: false

Naming/RescuedExceptionsVariableName:
  Enabled: false

Naming/MethodParameterName:
  Enabled: false

Naming/VariableName:
  Enabled: false

# Style Cops - Minimal enforcement
Style/Documentation:
  Enabled: false

Style/FrozenStringLiteralComment:
  Enabled: false

Style/StringLiterals:
  Enabled: false

Style/StringLiteralsInInterpolation:
  Enabled: false

Style/SymbolArray:
  Enabled: false

Style/WordArray:
  Enabled: false

Style/TrailingCommaInArrayLiteral:
  Enabled: false

Style/TrailingCommaInHashLiteral:
  Enabled: false

Style/HashEachMethods:
  Enabled: false

Style/HashTransformKeys:
  Enabled: false

Style/HashTransformValues:
  Enabled: false

Style/GuardClause:
  Enabled: false

Style/IfUnlessModifier:
  Enabled: false

Style/Next:
  Enabled: false

Style/NumericLiterals:
  Enabled: false

Style/PercentLiteralDelimiters:
  Enabled: false

Style/RegexpLiteral:
  Enabled: false

Style/RescueModifier:
  Enabled: true

Style/SafeNavigation:
  Enabled: false

Style/SignalException:
  Enabled: false

Style/SpecialGlobalVars:
  Enabled: false

Style/TernaryParentheses:
  Enabled: false

# RSpec Cops - Relaxed
RSpec/ExampleLength:
  Enabled: false

RSpec/MultipleExpectations:
  Enabled: false

RSpec/NestedGroups:
  Max: 6

RSpec/DescribeClass:
  Enabled: false

RSpec/EmptyExampleGroup:
  Enabled: true

RSpec/ExpectChange:
  Enabled: false

RSpec/ImplicitSubject:
  Enabled: false

RSpec/LetSetup:
  Enabled: false

RSpec/MessageSpies:
  Enabled: false

RSpec/MultipleMemoizedHelpers:
  Enabled: false

RSpec/ContextWording:
  Enabled: false

RSpec/ExampleWording:
  Enabled: false

RSpec/NamedSubject:
  Enabled: false

RSpec/VerifiedDoubles:
  Enabled: false

# Performance Cops - Warnings only
Performance/AncestorsInclude:
  Enabled: false

Performance/BigDecimalWithNumericArgument:
  Enabled: false

Performance/BlockGivenWithExplicitBlock:
  Enabled: false

Performance/CollectionLiteralInLoop:
  Enabled: false

Performance/ConstantRegexp:
  Enabled: false

Performance/MethodObjectAsBlock:
  Enabled: false

Performance/StringInclude:
  Enabled: false

Performance/Sum:
  Enabled: false
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
  add_filter "/db/"

  add_group "Models", "app/models"
  add_group "Services", "app/services"
  add_group "Controllers", "app/controllers"
  add_group "Libraries", "lib"

  # Legacy: baseline coverage
  minimum_coverage 50
  minimum_coverage_by_file 30

  # Legacy: allow some coverage drop during migration
  # refuse_coverage_drop
end

RSpec.configure do |config|
  config.expect_with :rspec do |expectations|
    expectations.include_chain_clauses_in_custom_matcher_descriptions = true
  end

  config.mock_with :rspec do |mocks|
    mocks.verify_partial_doubles = false
  end

  config.shared_context_metadata_behavior = :apply_to_host_groups
  config.filter_run_when_matching :focus
  config.example_status_persistence_file_path = "spec/examples.txt"
  config.warnings = false

  config.default_formatter = "progress"

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
  gem "simplecov", "~> 0.22"
end
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |
| Branches | 50% |
| Functions | 50% |
| Per-file minimum | 30% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 15 |
| Perceived complexity | 15 |
| ABC size | 40 |
| Method length | 100 lines |
| Class length | 300 lines |
| Module length | 400 lines |
| Block length | 50 lines |
| Block nesting | 6 |
| Parameters | 6 |

## Upgrade Path

To gradually upgrade from Legacy to Strict mode:

1. **Fix all errors first**
   - Run `bundle exec rubocop --only-recognized-file-types`
   - Focus on security and bug-related cops first

2. **Enable cops incrementally**
   ```yaml
   # Add these one by one to .rubocop.yml:
   Style/FrozenStringLiteralComment:
     Enabled: true

   Metrics/MethodLength:
     Max: 75  # Gradually reduce

   Style/Documentation:
     Enabled: true
   ```

3. **Add frozen string literal comments**
   ```bash
   bundle exec rubocop -a --only Style/FrozenStringLiteralComment
   ```

4. **Enable stricter metrics gradually**
   ```yaml
   # Reduce limits over time:
   # 100 -> 75 -> 60 -> 50
   Metrics/MethodLength:
     Max: 75

   # 15 -> 12 -> 10
   Metrics/CyclomaticComplexity:
     Max: 12
   ```

5. **Increase coverage thresholds**
   ```ruby
   # In spec_helper.rb:
   # 50% -> 60% -> 70% -> 80%
   minimum_coverage 60
   ```

6. **Enable RSpec cops**
   ```yaml
   RSpec/ExampleLength:
     Max: 30  # Start high, reduce

   RSpec/MultipleExpectations:
     Max: 8  # Start high, reduce
   ```

7. **Add frozen string literal comments project-wide**
   ```bash
   # Add to all Ruby files
   find . -name "*.rb" -exec sed -i '1i# frozen_string_literal: true\n' {} \;
   bundle exec rubocop -a
   ```

## Install Command

```bash
bundle add rubocop rubocop-performance rubocop-rspec simplecov rspec --group development,test
```

## Rake Tasks

```ruby
# frozen_string_literal: true

require "rubocop/rake_task"
require "rspec/core/rake_task"

# Legacy: allow autocorrect without failing
RuboCop::RakeTask.new(:rubocop) do |task|
  task.options = ["--display-only-correctable", "--format", "simple"]
end

RuboCop::RakeTask.new("rubocop:fix") do |task|
  task.options = ["-A"]
end

RSpec::Core::RakeTask.new(:spec) do |task|
  task.rspec_opts = ["--format", "progress"]
end

desc "Run all quality checks (warnings allowed)"
task quality: [:rubocop, :spec]

task default: :spec
```

## Migration Checklist

Use this checklist to track progress toward Strict mode:

- [ ] All syntax errors fixed
- [ ] `Style/FrozenStringLiteralComment` enabled
- [ ] Coverage above 60%
- [ ] `Metrics/MethodLength` below 75
- [ ] `Metrics/CyclomaticComplexity` below 12
- [ ] Coverage above 70%
- [ ] `Metrics/MethodLength` below 60
- [ ] `Style/Documentation` enabled
- [ ] Coverage above 80%
- [ ] All Strict mode cops enabled
- [ ] All complexity limits at Strict levels
