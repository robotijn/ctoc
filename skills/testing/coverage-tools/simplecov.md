# SimpleCov Coverage Guide
> Claude Code Ruby coverage reference. Updated February 2026.

## Overview

SimpleCov is the standard code coverage tool for Ruby. It uses Ruby's built-in Coverage library and provides line and branch coverage with flexible reporting and filtering options.

## Installation

```ruby
# Gemfile
group :test do
  gem 'simplecov', require: false
  gem 'simplecov-lcov', require: false  # For CI integration
  gem 'simplecov-cobertura', require: false  # For GitLab/Azure DevOps
end
```

```bash
bundle install
```

## Configuration

### Basic Setup

```ruby
# spec/spec_helper.rb (or test/test_helper.rb)
# MUST be at the very top, before any other require
require 'simplecov'

SimpleCov.start do
  # Track branch coverage (Ruby 2.5+)
  enable_coverage :branch

  # Minimum coverage
  minimum_coverage line: 80, branch: 75

  # Fail if coverage drops
  refuse_coverage_drop

  # Grouping
  add_group 'Models', 'app/models'
  add_group 'Controllers', 'app/controllers'
  add_group 'Services', 'app/services'
  add_group 'Libraries', 'lib'

  # Filtering
  add_filter '/spec/'
  add_filter '/test/'
  add_filter '/config/'
  add_filter '/vendor/'
  add_filter '/db/'
end

# Then your other requires
require 'rspec' # or 'minitest/autorun'
```

### Rails Setup

```ruby
# spec/spec_helper.rb
require 'simplecov'

SimpleCov.start 'rails' do
  enable_coverage :branch

  # Rails preset includes common groups and filters
  # Customize as needed

  minimum_coverage line: 80, branch: 75
  refuse_coverage_drop

  # Additional groups
  add_group 'Services', 'app/services'
  add_group 'Serializers', 'app/serializers'
  add_group 'Jobs', 'app/jobs'

  # Additional filters
  add_filter 'app/admin'  # ActiveAdmin
  add_filter 'app/channels'  # ActionCable
end
```

### Full Configuration

```ruby
# spec/spec_helper.rb
require 'simplecov'

SimpleCov.start do
  # Branch coverage
  enable_coverage :branch

  # Coverage thresholds
  minimum_coverage line: 80, branch: 75
  minimum_coverage_by_file line: 50
  refuse_coverage_drop

  # Output directory
  coverage_dir 'coverage'

  # Formatter(s)
  if ENV['CI']
    require 'simplecov-lcov'
    SimpleCov::Formatter::LcovFormatter.config do |c|
      c.report_with_single_file = true
      c.output_directory = 'coverage'
      c.lcov_file_name = 'lcov.info'
    end

    SimpleCov.formatter = SimpleCov::Formatter::MultiFormatter.new([
      SimpleCov::Formatter::HTMLFormatter,
      SimpleCov::Formatter::LcovFormatter
    ])
  else
    SimpleCov.formatter = SimpleCov::Formatter::HTMLFormatter
  end

  # Grouping
  add_group 'Models', 'app/models'
  add_group 'Controllers', 'app/controllers'
  add_group 'Services', 'app/services'
  add_group 'Mailers', 'app/mailers'
  add_group 'Jobs', 'app/jobs'
  add_group 'Libraries', 'lib'

  # Filtering
  add_filter '/spec/'
  add_filter '/test/'
  add_filter '/config/'
  add_filter '/vendor/'
  add_filter '/db/migrate'
  add_filter 'app/admin'

  # Track files that have no tests
  track_files '{app,lib}/**/*.rb'

  # Merge timeout (for parallel tests)
  merge_timeout 3600
end
```

## Running Coverage

### With RSpec

```bash
# Run tests with coverage
bundle exec rspec

# Coverage report is in coverage/index.html
open coverage/index.html
```

### With Minitest

```ruby
# test/test_helper.rb
require 'simplecov'
SimpleCov.start

require 'minitest/autorun'
```

```bash
bundle exec rake test
```

### With Rails

```bash
# RSpec
bundle exec rspec

# Minitest
bundle exec rails test
```

### Check Threshold

Coverage thresholds are checked automatically:

```ruby
SimpleCov.start do
  minimum_coverage line: 80
end
```

If coverage drops below 80%, the test suite will fail.

## Coverage Groups

### Default Groups

```ruby
SimpleCov.start 'rails'
# Includes: Controllers, Models, Helpers, Mailers, Libraries
```

### Custom Groups

```ruby
SimpleCov.start do
  add_group 'Services', 'app/services'
  add_group 'Serializers', 'app/serializers'
  add_group 'Validators', 'app/validators'
  add_group 'Decorators', 'app/decorators'
  add_group 'Policies', 'app/policies'

  # Group by pattern
  add_group 'Long Files' do |src_file|
    src_file.lines.count > 200
  end

  # Group by path pattern
  add_group 'API', 'app/controllers/api'
end
```

### Ungrouped Files

```ruby
SimpleCov.start do
  add_group 'Ungrouped' do |src_file|
    # Files not matching any other group
    true
  end
end
```

## Coverage Filtering

### File Filters

```ruby
SimpleCov.start do
  # Filter by path
  add_filter '/spec/'
  add_filter '/test/'
  add_filter '/config/'
  add_filter '/vendor/'

  # Filter by pattern
  add_filter %r{^/db/migrate/}
  add_filter /\.rake$/

  # Filter by block
  add_filter do |src_file|
    src_file.filename =~ /generated/ ||
      src_file.lines.count < 5
  end
end
```

### Line Filters (Comments)

```ruby
class MyClass
  # :nocov:
  def debug_method
    # This method is excluded from coverage
    puts "Debug info"
  end
  # :nocov:

  def normal_method
    # This is covered
  end
end
```

### Custom Exclusion Token

```ruby
SimpleCov.start do
  nocov_token 'skip_coverage'
end
```

```ruby
# skip_coverage
def excluded_method
end
# skip_coverage
```

## Report Formats

### HTML Report (Default)

```ruby
SimpleCov.start do
  formatter SimpleCov::Formatter::HTMLFormatter
end
```

### LCOV Format (Codecov, Coveralls)

```ruby
require 'simplecov-lcov'

SimpleCov::Formatter::LcovFormatter.config do |c|
  c.report_with_single_file = true
  c.output_directory = 'coverage'
  c.lcov_file_name = 'lcov.info'
end

SimpleCov.start do
  formatter SimpleCov::Formatter::LcovFormatter
end
```

### Cobertura XML (GitLab, Azure)

```ruby
require 'simplecov-cobertura'

SimpleCov.start do
  formatter SimpleCov::Formatter::CoberturaFormatter
end
```

### Multiple Formatters

```ruby
require 'simplecov-lcov'
require 'simplecov-cobertura'

SimpleCov.start do
  formatter SimpleCov::Formatter::MultiFormatter.new([
    SimpleCov::Formatter::HTMLFormatter,
    SimpleCov::Formatter::LcovFormatter,
    SimpleCov::Formatter::CoberturaFormatter
  ])
end
```

### JSON Format

```ruby
require 'simplecov-json'

SimpleCov.start do
  formatter SimpleCov::Formatter::JSONFormatter
end
```

## Parallel Test Coverage

### With parallel_tests

```ruby
# spec/spec_helper.rb
require 'simplecov'

SimpleCov.start do
  command_name "Job #{ENV['TEST_ENV_NUMBER']}" if ENV['TEST_ENV_NUMBER']
end
```

### Merging Results

```ruby
SimpleCov.start do
  # Results from last hour will be merged
  merge_timeout 3600

  # Custom result merger
  use_merging true
end
```

### CI Parallel Jobs

```yaml
# .github/workflows/test.yml
jobs:
  test:
    strategy:
      matrix:
        ci_node_index: [0, 1, 2, 3]
    steps:
      - run: bundle exec rspec --pattern "spec/**/*_spec.rb" --order defined
        env:
          TEST_ENV_NUMBER: ${{ matrix.ci_node_index }}

      - uses: actions/upload-artifact@v4
        with:
          name: coverage-${{ matrix.ci_node_index }}
          path: coverage/.resultset.json

  merge:
    needs: test
    steps:
      - uses: actions/download-artifact@v4

      - run: |
          mkdir -p coverage
          for i in 0 1 2 3; do
            cp coverage-$i/.resultset.json coverage/.resultset-$i.json
          done
          bundle exec rake coverage:merge
```

```ruby
# lib/tasks/coverage.rake
namespace :coverage do
  task :merge do
    require 'simplecov'

    SimpleCov.collate Dir['coverage/.resultset-*.json'] do
      formatter SimpleCov::Formatter::HTMLFormatter
      minimum_coverage line: 80
    end
  end
end
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Test with Coverage

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: '3.3'
          bundler-cache: true

      - name: Run tests
        run: bundle exec rspec
        env:
          COVERAGE: true

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: coverage/lcov.info
          fail_ci_if_error: true
```

### GitLab CI

```yaml
test:
  stage: test
  script:
    - bundle install
    - bundle exec rspec
  coverage: '/\(\d+.\d+\%\) covered/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/coverage.xml
```

### CircleCI

```yaml
version: 2.1

jobs:
  test:
    docker:
      - image: cimg/ruby:3.3
    steps:
      - checkout
      - run: bundle install
      - run: bundle exec rspec
      - store_artifacts:
          path: coverage
```

## Advanced Features

### Branch Coverage

```ruby
SimpleCov.start do
  enable_coverage :branch

  # Require both line and branch coverage
  minimum_coverage line: 80, branch: 75
end
```

### Track All Files

```ruby
SimpleCov.start do
  # Include files with no tests
  track_files '{app,lib}/**/*.rb'
end
```

### Custom Profiles

```ruby
# config/simplecov_profiles.rb
SimpleCov.profiles.define 'api' do
  add_group 'Controllers', 'app/controllers/api'
  add_group 'Serializers', 'app/serializers'
  add_filter '/spec/'
  minimum_coverage 85
end

# spec/spec_helper.rb
SimpleCov.start 'api'
```

### At Exit Hook

```ruby
SimpleCov.at_exit do
  SimpleCov.result.format!

  if SimpleCov.result.covered_percent < 80
    puts "Coverage below 80%!"
    exit 1
  end
end
```

### Coverage for Specific Files

```ruby
# Check coverage for modified files only
SimpleCov.start do
  if ENV['CI']
    modified_files = `git diff --name-only origin/main`.split("\n")
    modified_files.select! { |f| f.end_with?('.rb') }

    add_filter do |src_file|
      !modified_files.any? { |f| src_file.filename.end_with?(f) }
    end
  end
end
```

## Troubleshooting

### Coverage Not Collected

```ruby
# Ensure SimpleCov is loaded FIRST
require 'simplecov'
SimpleCov.start

# THEN load your app
require_relative '../config/environment'
```

### Wrong Files Tracked

```ruby
SimpleCov.start do
  # Explicitly set root
  root File.expand_path('..', __dir__)

  # Track specific patterns
  track_files '{app,lib}/**/*.rb'
end
```

### Spring Caching Issues

```bash
# Disable Spring for coverage runs
DISABLE_SPRING=1 bundle exec rspec
```

### Parallel Test Merge Issues

```ruby
SimpleCov.start do
  # Increase merge timeout
  merge_timeout 7200  # 2 hours

  # Use unique command names
  command_name "rspec-#{Process.pid}"
end
```

## Best Practices

### Load Order

```ruby
# ALWAYS first in spec_helper.rb
require 'simplecov'
SimpleCov.start
# Then everything else
```

### Meaningful Thresholds

```ruby
SimpleCov.start do
  minimum_coverage line: 80, branch: 75
  minimum_coverage_by_file line: 50
  refuse_coverage_drop
end
```

### CI-Specific Formatters

```ruby
SimpleCov.start do
  if ENV['CI']
    require 'simplecov-lcov'
    formatter SimpleCov::Formatter::LcovFormatter
  end
end
```

### Track Uncovered Files

```ruby
SimpleCov.start do
  track_files '{app,lib}/**/*.rb'
end
```

## What NOT to Do

- Do NOT load SimpleCov after your application code
- Do NOT use `# :nocov:` to hide untested code
- Do NOT set thresholds below 60% for new projects
- Do NOT forget branch coverage for complex logic
- Do NOT skip coverage in CI (fail builds on drops)
- Do NOT ignore parallel test coverage merging
- Do NOT exclude entire directories without justification
- Do NOT generate HTML reports in CI (use lcov/cobertura)
