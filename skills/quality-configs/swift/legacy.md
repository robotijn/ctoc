# Swift Legacy Quality Config

Gradual adoption configuration for migrating existing Swift projects.

## Mode: Legacy

- Coverage: 50% minimum (baseline)
- Complexity: Relaxed limits
- Warnings allowed (not errors)
- Gradual rule adoption

## SwiftLint Config (`.swiftlint.yml`)

```yaml
# SwiftLint Legacy Configuration
# Requires SwiftLint 0.54+ (2024)
# Gradual adoption - essential rules only

# Disable overly strict rules for legacy codebases
disabled_rules:
  - force_cast
  - force_try
  - force_unwrapping
  - implicitly_unwrapped_optional
  - line_length
  - file_length
  - type_body_length
  - function_body_length
  - cyclomatic_complexity
  - nesting
  - identifier_name
  - type_name
  - large_tuple
  - todo

# Minimal opt-in rules for legacy migration
opt_in_rules:
  - closure_spacing
  - empty_count
  - empty_string
  - first_where
  - last_where
  - sorted_imports
  - toggle_bool
  - redundant_nil_coalescing
  - yoda_condition

# Legacy: Warnings only, not errors
strict: false

# Relaxed complexity limits (as warnings)
cyclomatic_complexity:
  warning: 20
  error: 30
  ignores_case_statements: true

function_body_length:
  warning: 100
  error: 150

file_length:
  warning: 600
  error: 1000
  ignore_comment_only_lines: true

type_body_length:
  warning: 400
  error: 600

function_parameter_count:
  warning: 6
  error: 8
  ignores_default_parameters: true

line_length:
  warning: 150
  error: 200
  ignores_urls: true
  ignores_function_declarations: true
  ignores_comments: true
  ignores_interpolated_strings: true

nesting:
  type_level:
    warning: 3
    error: 5
  function_level:
    warning: 5
    error: 7

large_tuple:
  warning: 4
  error: 6

# Relaxed identifier naming
identifier_name:
  min_length:
    warning: 1
    error: 0
  max_length:
    warning: 60
    error: 80
  excluded:
    - id
    - x
    - y
    - z
    - i
    - j
    - k
    - n
    - a
    - b
    - c

type_name:
  min_length:
    warning: 2
    error: 1
  max_length:
    warning: 60
    error: 80

# Excluded paths
excluded:
  - .build
  - DerivedData
  - Carthage
  - Pods
  - Package.swift
  - "*/Generated/*"
  - "*/Mocks/*"
  - "*/Legacy/*"
  - "*/Vendor/*"
  - "*/ThirdParty/*"

reporter: xcode
```

## Swift Package Manager Configuration (`Package.swift`)

```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "YourPackage",
    platforms: [
        .iOS(.v13),
        .macOS(.v10_15)
    ],
    products: [
        .library(
            name: "YourPackage",
            targets: ["YourPackage"]
        )
    ],
    dependencies: [],
    targets: [
        .target(
            name: "YourPackage",
            dependencies: []
            // No strict Swift settings for legacy code
        ),
        .testTarget(
            name: "YourPackageTests",
            dependencies: ["YourPackage"]
        )
    ]
)
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |
| Branches | 50% |
| Functions | 50% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 30 |
| Cognitive | 40 |
| Function length | 150 lines |
| File length | 1000 lines |
| Parameters | 8 |
| Nesting depth | 7 |

## Upgrade Path

To gradually upgrade from Legacy to Strict mode:

### Phase 1: Enable Basic Rules (Week 1-2)

```yaml
# Add these rules one at a time
opt_in_rules:
  - sorted_imports
  - redundant_nil_coalescing
  - empty_count
  - toggle_bool
```

### Phase 2: Reduce Complexity Limits (Week 3-4)

```yaml
# Tighten gradually
cyclomatic_complexity:
  warning: 15  # was 20
  error: 20    # was 30

function_body_length:
  warning: 75   # was 100
  error: 100    # was 150
```

### Phase 3: Enable Force Rules as Warnings (Week 5-6)

```yaml
# Remove from disabled_rules, add as opt-in with warnings
# In custom_rules or move from disabled
force_unwrapping: warning
force_cast: warning
force_try: warning
```

### Phase 4: Increase Coverage (Week 7-8)

```bash
# Increase coverage thresholds gradually
# 50% -> 60% -> 70% -> 80%
```

### Phase 5: Enable Strict Mode (Week 9-10)

```yaml
# Final step
strict: true
```

## Install Command

```bash
# Using Homebrew (recommended)
brew install swiftlint

# Using Mint
mint install realm/SwiftLint

# For Xcode projects (CocoaPods)
pod 'SwiftLint'
```

## Xcode Build Phase Script (Legacy)

```bash
#!/bin/bash

if command -v swiftlint >/dev/null 2>&1; then
    # Legacy mode - warnings only, don't fail build
    swiftlint || true
else
    echo "warning: SwiftLint not installed, download from https://github.com/realm/SwiftLint"
fi
```

## Script Commands

```bash
# Lint (legacy - warnings only)
swiftlint

# Lint with auto-fix (safe fixes only)
swiftlint --fix

# Generate baseline for existing violations
swiftlint --baseline baseline.json

# Lint against baseline (only report new violations)
swiftlint --baseline baseline.json

# Run tests
swift test

# Check coverage (50% threshold)
swift test --enable-code-coverage
xcrun llvm-cov report \
  .build/debug/*PackageTests.xctest/Contents/MacOS/*PackageTests \
  -instr-profile=.build/debug/codecov/default.profdata
```

## Using Baselines for Legacy Code

SwiftLint baselines allow you to ignore existing violations while catching new ones:

```bash
# Step 1: Generate baseline from current violations
swiftlint --baseline baseline.json

# Step 2: Commit the baseline
git add baseline.json
git commit -m "Add SwiftLint baseline for legacy code"

# Step 3: Use baseline in CI (only new violations fail)
swiftlint --baseline baseline.json
```

## CI/CD Integration (GitHub Actions)

```yaml
name: Swift Quality (Legacy)

on: [push, pull_request]

jobs:
  quality:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4

      - name: Install SwiftLint
        run: brew install swiftlint

      - name: Lint (with baseline)
        run: |
          if [ -f "baseline.json" ]; then
            swiftlint --baseline baseline.json
          else
            swiftlint || echo "::warning::SwiftLint found violations"
          fi

      - name: Build
        run: swift build

      - name: Test
        run: swift test --enable-code-coverage

      - name: Check Coverage (50% threshold)
        run: |
          COVERAGE=$(xcrun llvm-cov report \
            .build/debug/*PackageTests.xctest/Contents/MacOS/*PackageTests \
            -instr-profile=.build/debug/codecov/default.profdata \
            -ignore-filename-regex=".build|Tests" | tail -1 | awk '{print $4}' | tr -d '%')
          echo "Coverage: $COVERAGE%"
          if (( $(echo "$COVERAGE < 50" | bc -l) )); then
            echo "::warning::Coverage $COVERAGE% is below 50% threshold"
          fi
```

## Gradual Migration Tracking

Create a `QUALITY_PROGRESS.md` to track your migration:

```markdown
# Quality Migration Progress

## Current Status: Legacy

- [ ] Phase 1: Enable basic rules
- [ ] Phase 2: Reduce complexity limits
- [ ] Phase 3: Enable force rules as warnings
- [ ] Phase 4: Increase coverage to 80%
- [ ] Phase 5: Enable strict mode

## Metrics

| Date | Coverage | Lint Warnings | Lint Errors |
|------|----------|---------------|-------------|
| 2024-01-01 | 35% | 245 | 12 |
| 2024-02-01 | 42% | 180 | 0 |
| ... | ... | ... | ... |

## Baseline Violations

Total violations in baseline: 523
- force_unwrapping: 89
- line_length: 156
- cyclomatic_complexity: 23
- ...
```
