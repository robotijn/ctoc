# Swift Strict Quality Config

Strict mode configuration for Swift projects using SwiftLint.

## Mode: Strict

- Coverage: 80% minimum
- Complexity: Standard limits
- Warnings: Treated as errors
- SwiftLint: Standard rules enabled

## SwiftLint Config (`.swiftlint.yml`)

```yaml
# SwiftLint Strict Configuration
# Requires SwiftLint 0.54+ (2024)

disabled_rules: []

opt_in_rules:
  # Idiomatic
  - anonymous_argument_in_multiline_closure
  - array_init
  - closure_body_length
  - closure_end_indentation
  - closure_spacing
  - collection_alignment
  - contains_over_filter_count
  - contains_over_filter_is_empty
  - contains_over_first_not_nil
  - contains_over_range_nil_comparison
  - convenience_type
  - discouraged_assert
  - discouraged_object_literal
  - empty_collection_literal
  - empty_count
  - empty_string
  - empty_xctest_method
  - enum_case_associated_values_count
  - explicit_init
  - extension_access_modifier
  - fallthrough
  - fatal_error_message
  - file_header
  - file_name
  - file_name_no_space
  - first_where
  - flatmap_over_map_reduce
  - force_unwrapping
  - function_default_parameter_at_end
  - ibinspectable_in_extension
  - identical_operands
  - implicit_return
  - implicitly_unwrapped_optional
  - joined_default_parameter
  - last_where
  - legacy_multiple
  - legacy_objc_type
  - let_var_whitespace
  - literal_expression_end_indentation
  - lower_acl_than_parent
  - modifier_order
  - multiline_arguments
  - multiline_arguments_brackets
  - multiline_function_chains
  - multiline_literal_brackets
  - multiline_parameters
  - multiline_parameters_brackets
  - nimble_operator
  - nslocalizedstring_key
  - nslocalizedstring_require_bundle
  - number_separator
  - object_literal
  - operator_usage_whitespace
  - optional_enum_case_matching
  - overridden_super_call
  - override_in_extension
  - pattern_matching_keywords
  - prefer_self_in_static_references
  - prefer_self_type_over_type_of_self
  - prefer_zero_over_explicit_init
  - private_action
  - private_outlet
  - private_subject
  - prohibited_interface_builder
  - prohibited_super_call
  - quick_discouraged_call
  - quick_discouraged_focused_test
  - quick_discouraged_pending_test
  - raw_value_for_camel_cased_codable_enum
  - reduce_into
  - redundant_nil_coalescing
  - redundant_type_annotation
  - return_value_from_void_function
  - self_binding
  - shorthand_optional_binding
  - single_test_class
  - sorted_first_last
  - sorted_imports
  - static_operator
  - strict_fileprivate
  - strong_iboutlet
  - test_case_accessibility
  - toggle_bool
  - trailing_closure
  - type_contents_order
  - unavailable_function
  - unneeded_parentheses_in_closure_argument
  - unowned_variable_capture
  - untyped_error_in_catch
  - vertical_parameter_alignment_on_call
  - vertical_whitespace_closing_braces
  - vertical_whitespace_opening_braces
  - xct_specific_matcher
  - yoda_condition

# Strict: Treat warnings as errors
strict: true

# Complexity limits
cyclomatic_complexity:
  warning: 8
  error: 10
  ignores_case_statements: true

function_body_length:
  warning: 40
  error: 50

file_length:
  warning: 400
  error: 500
  ignore_comment_only_lines: true

type_body_length:
  warning: 200
  error: 300

function_parameter_count:
  warning: 4
  error: 5
  ignores_default_parameters: true

line_length:
  warning: 120
  error: 150
  ignores_urls: true
  ignores_function_declarations: false
  ignores_comments: false
  ignores_interpolated_strings: true

nesting:
  type_level:
    warning: 2
    error: 3
  function_level:
    warning: 3
    error: 4

# Large tuple warning
large_tuple:
  warning: 3
  error: 4

# Closure body length
closure_body_length:
  warning: 30
  error: 50

# Identifier naming
identifier_name:
  min_length:
    warning: 2
    error: 1
  max_length:
    warning: 50
    error: 60
  excluded:
    - id
    - x
    - y
    - z
    - i
    - j
    - k

type_name:
  min_length:
    warning: 3
    error: 2
  max_length:
    warning: 50
    error: 60

# Excluded paths
excluded:
  - .build
  - DerivedData
  - Carthage
  - Pods
  - Package.swift
  - "*/Generated/*"
  - "*/Mocks/*"

# Reporter
reporter: xcode
```

## XCTest Coverage Configuration

For coverage collection with `xcodebuild`:

```bash
# Run tests with coverage
xcodebuild test \
  -scheme YourScheme \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -enableCodeCoverage YES \
  -resultBundlePath TestResults.xcresult

# Extract coverage report
xcrun xccov view --report TestResults.xcresult
```

## Swift Package Manager Test Configuration (`Package.swift`)

```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "YourPackage",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .library(
            name: "YourPackage",
            targets: ["YourPackage"]
        )
    ],
    dependencies: [
        // Add test dependencies here
    ],
    targets: [
        .target(
            name: "YourPackage",
            dependencies: [],
            swiftSettings: [
                .enableExperimentalFeature("StrictConcurrency")
            ]
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
| Lines | 80% |
| Branches | 80% |
| Functions | 80% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 10 |
| Cognitive | 15 |
| Function length | 50 lines |
| File length | 500 lines |
| Parameters | 5 |
| Nesting depth | 4 |

## Install Command

```bash
# Using Homebrew (recommended)
brew install swiftlint

# Using Swift Package Manager (as plugin)
# Add to Package.swift dependencies:
# .package(url: "https://github.com/realm/SwiftLint.git", from: "0.54.0")

# Using Mint
mint install realm/SwiftLint
```

## Xcode Build Phase Script

Add to your Xcode project's Build Phases:

```bash
if command -v swiftlint >/dev/null 2>&1; then
    swiftlint --strict
else
    echo "warning: SwiftLint not installed, download from https://github.com/realm/SwiftLint"
fi
```

## Script Commands

```bash
# Lint (strict mode - warnings as errors)
swiftlint --strict

# Lint with auto-fix
swiftlint --fix

# Analyze (deeper analysis)
swiftlint analyze --compiler-log-path build/compile_commands.json

# Generate baseline (for legacy codebases)
swiftlint --baseline baseline.json

# Run tests with coverage
swift test --enable-code-coverage

# View coverage report
xcrun llvm-cov report .build/debug/YourPackagePackageTests.xctest/Contents/MacOS/YourPackagePackageTests \
  -instr-profile=.build/debug/codecov/default.profdata \
  -ignore-filename-regex=".build|Tests"
```

## CI/CD Integration (GitHub Actions)

```yaml
name: Swift Quality

on: [push, pull_request]

jobs:
  quality:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4

      - name: Install SwiftLint
        run: brew install swiftlint

      - name: Lint
        run: swiftlint --strict

      - name: Build
        run: swift build

      - name: Test with Coverage
        run: swift test --enable-code-coverage

      - name: Check Coverage
        run: |
          xcrun llvm-cov report \
            .build/debug/*PackageTests.xctest/Contents/MacOS/*PackageTests \
            -instr-profile=.build/debug/codecov/default.profdata \
            | tail -1 | awk '{if ($4 < 80) exit 1}'
```
