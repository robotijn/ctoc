# Swift Strictest Quality Config

Maximum strictness configuration for Swift projects.

## Mode: Strictest

- Coverage: 90% minimum
- Complexity: Tight limits
- All warnings as errors
- All opt-in rules enabled
- Pedantic naming conventions

## SwiftLint Config (`.swiftlint.yml`)

```yaml
# SwiftLint Strictest Configuration
# Requires SwiftLint 0.54+ (2024)
# Maximum strictness - all opt-in rules enabled

disabled_rules: []

opt_in_rules:
  # ALL opt-in rules for maximum strictness
  - anonymous_argument_in_multiline_closure
  - anyobject_protocol
  - array_init
  - attributes
  - balanced_xctest_lifecycle
  - closure_body_length
  - closure_end_indentation
  - closure_spacing
  - collection_alignment
  - comma_inheritance
  - conditional_returns_on_newline
  - contains_over_filter_count
  - contains_over_filter_is_empty
  - contains_over_first_not_nil
  - contains_over_range_nil_comparison
  - convenience_type
  - direct_return
  - discouraged_assert
  - discouraged_none_name
  - discouraged_object_literal
  - discouraged_optional_boolean
  - discouraged_optional_collection
  - empty_collection_literal
  - empty_count
  - empty_string
  - empty_xctest_method
  - enum_case_associated_values_count
  - expiring_todo
  - explicit_acl
  - explicit_enum_raw_value
  - explicit_init
  - explicit_top_level_acl
  - explicit_type_interface
  - extension_access_modifier
  - fallthrough
  - fatal_error_message
  - file_header
  - file_name
  - file_name_no_space
  - file_types_order
  - final_class
  - first_where
  - flatmap_over_map_reduce
  - force_unwrapping
  - function_default_parameter_at_end
  - ibinspectable_in_extension
  - identical_operands
  - implicit_return
  - implicitly_unwrapped_optional
  - indentation_width
  - joined_default_parameter
  - last_where
  - legacy_multiple
  - legacy_objc_type
  - let_var_whitespace
  - literal_expression_end_indentation
  - local_doc_comment
  - lower_acl_than_parent
  - missing_docs
  - modifier_order
  - multiline_arguments
  - multiline_arguments_brackets
  - multiline_function_chains
  - multiline_literal_brackets
  - multiline_parameters
  - multiline_parameters_brackets
  - nimble_operator
  - no_extension_access_modifier
  - no_grouping_extension
  - no_magic_numbers
  - nslocalizedstring_key
  - nslocalizedstring_require_bundle
  - number_separator
  - object_literal
  - operator_usage_whitespace
  - optional_enum_case_matching
  - overridden_super_call
  - override_in_extension
  - pattern_matching_keywords
  - period_spacing
  - prefer_nimble
  - prefer_self_in_static_references
  - prefer_self_type_over_type_of_self
  - prefer_zero_over_explicit_init
  - prefixed_toplevel_constant
  - private_action
  - private_outlet
  - private_subject
  - private_swiftui_state
  - prohibited_interface_builder
  - prohibited_super_call
  - quick_discouraged_call
  - quick_discouraged_focused_test
  - quick_discouraged_pending_test
  - raw_value_for_camel_cased_codable_enum
  - reduce_into
  - redundant_nil_coalescing
  - redundant_self_in_closure
  - redundant_type_annotation
  - required_deinit
  - required_enum_case
  - return_value_from_void_function
  - self_binding
  - shorthand_optional_binding
  - single_test_class
  - sorted_first_last
  - sorted_imports
  - static_operator
  - strict_fileprivate
  - strong_iboutlet
  - switch_case_on_newline
  - test_case_accessibility
  - toggle_bool
  - trailing_closure
  - type_contents_order
  - unavailable_function
  - unneeded_parentheses_in_closure_argument
  - unowned_variable_capture
  - untyped_error_in_catch
  - vertical_parameter_alignment_on_call
  - vertical_whitespace_between_cases
  - vertical_whitespace_closing_braces
  - vertical_whitespace_opening_braces
  - weak_delegate
  - xct_specific_matcher
  - yoda_condition

# Strictest: All warnings are errors
strict: true

# Analyzer rules (requires compile commands)
analyzer_rules:
  - capture_variable
  - explicit_self
  - typesafe_array_init
  - unused_declaration
  - unused_import

# Tightest complexity limits
cyclomatic_complexity:
  warning: 5
  error: 7
  ignores_case_statements: false

function_body_length:
  warning: 25
  error: 30

file_length:
  warning: 300
  error: 400
  ignore_comment_only_lines: true

type_body_length:
  warning: 150
  error: 200

function_parameter_count:
  warning: 3
  error: 4
  ignores_default_parameters: false

line_length:
  warning: 100
  error: 120
  ignores_urls: true
  ignores_function_declarations: false
  ignores_comments: false
  ignores_interpolated_strings: false

nesting:
  type_level:
    warning: 1
    error: 2
  function_level:
    warning: 2
    error: 3

large_tuple:
  warning: 2
  error: 3

closure_body_length:
  warning: 15
  error: 25

# Strict identifier naming
identifier_name:
  min_length:
    warning: 3
    error: 2
  max_length:
    warning: 40
    error: 50
  excluded:
    - id
    - x
    - y
    - i

type_name:
  min_length:
    warning: 3
    error: 2
  max_length:
    warning: 40
    error: 50

# Indentation
indentation_width:
  indentation_width: 4
  include_comments: true
  include_compiler_directives: true
  include_multiline_strings: false

# File header (require license/copyright)
file_header:
  required_pattern: |
    \/\/
    \/\/  .*\.swift
    \/\/  .*
    \/\/
    \/\/  Created by .* on \d{1,2}\/\d{1,2}\/\d{2,4}\.
    \/\/

# Missing documentation required
missing_docs:
  warning: internal
  error: public

# Magic numbers not allowed
no_magic_numbers:
  test_parent_classes:
    - XCTestCase
  only_enforce_in_function_bodies: true

# Expiring TODOs
expiring_todo:
  approaching_expiry_severity: warning
  expired_severity: error
  date_format: "MM/dd/yyyy"
  date_delimiters:
    opening: "["
    closing: "]"

# Excluded paths
excluded:
  - .build
  - DerivedData
  - Carthage
  - Pods
  - Package.swift
  - "*/Generated/*"
  - "*/Mocks/*"
  - "*/Snapshots/*"

reporter: xcode
```

## Swift Compiler Strict Settings

Add to your `Package.swift` for maximum Swift strictness:

```swift
// swift-tools-version: 5.9
import PackageDescription

let strictSwiftSettings: [SwiftSetting] = [
    .enableExperimentalFeature("StrictConcurrency"),
    .enableUpcomingFeature("BareSlashRegexLiterals"),
    .enableUpcomingFeature("ConciseMagicFile"),
    .enableUpcomingFeature("ExistentialAny"),
    .enableUpcomingFeature("ForwardTrailingClosures"),
    .enableUpcomingFeature("ImplicitOpenExistentials"),
    .enableUpcomingFeature("DisableOutwardActorInference"),
    .unsafeFlags([
        "-warnings-as-errors",
        "-Xfrontend", "-warn-concurrency",
        "-Xfrontend", "-enable-actor-data-race-checks"
    ], .when(configuration: .debug))
]

let package = Package(
    name: "YourPackage",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
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
            dependencies: [],
            swiftSettings: strictSwiftSettings
        ),
        .testTarget(
            name: "YourPackageTests",
            dependencies: ["YourPackage"],
            swiftSettings: strictSwiftSettings
        )
    ]
)
```

## XCTest Coverage Configuration

```bash
# Run tests with coverage (strictest thresholds)
xcodebuild test \
  -scheme YourScheme \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -enableCodeCoverage YES \
  -resultBundlePath TestResults.xcresult

# Check 90% coverage threshold
xcrun xccov view --report TestResults.xcresult --json | \
  jq '.targets[].lineCoverage' | \
  awk '{if ($1 < 0.90) exit 1}'
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Branches | 90% |
| Functions | 90% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 7 |
| Cognitive | 10 |
| Function length | 30 lines |
| File length | 400 lines |
| Parameters | 4 |
| Nesting depth | 3 |
| Closure length | 25 lines |
| Type body | 200 lines |

## Install Command

```bash
# Using Homebrew (recommended)
brew install swiftlint

# Using Swift Package Manager (as build tool plugin)
# Add to Package.swift dependencies:
# .package(url: "https://github.com/realm/SwiftLint.git", from: "0.54.0")

# Using Mint
mint install realm/SwiftLint
```

## Xcode Build Phase Script (Strictest)

```bash
#!/bin/bash
set -e

if command -v swiftlint >/dev/null 2>&1; then
    # Run SwiftLint in strict mode
    swiftlint --strict

    # Run analyzer if compile commands exist
    if [ -f "build/compile_commands.json" ]; then
        swiftlint analyze --strict --compiler-log-path build/compile_commands.json
    fi
else
    echo "error: SwiftLint not installed"
    exit 1
fi
```

## Script Commands

```bash
# Lint (strictest - all warnings as errors)
swiftlint --strict

# Lint with auto-fix
swiftlint --fix --strict

# Deep analysis (requires compile commands)
xcodebuild -workspace YourApp.xcworkspace -scheme YourScheme \
  -destination 'generic/platform=iOS' \
  build-for-testing | tee build/compile_commands.json
swiftlint analyze --strict --compiler-log-path build/compile_commands.json

# Run tests with coverage
swift test --enable-code-coverage --parallel

# Enforce 90% coverage
COVERAGE=$(xcrun llvm-cov report \
  .build/debug/*PackageTests.xctest/Contents/MacOS/*PackageTests \
  -instr-profile=.build/debug/codecov/default.profdata \
  -ignore-filename-regex=".build|Tests" | tail -1 | awk '{print $4}' | tr -d '%')
if (( $(echo "$COVERAGE < 90" | bc -l) )); then
    echo "Coverage $COVERAGE% is below 90% threshold"
    exit 1
fi
```

## CI/CD Integration (GitHub Actions)

```yaml
name: Swift Quality (Strictest)

on: [push, pull_request]

jobs:
  quality:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4

      - name: Select Xcode
        run: sudo xcode-select -s /Applications/Xcode_15.2.app

      - name: Install SwiftLint
        run: brew install swiftlint

      - name: Lint (Strict)
        run: swiftlint --strict

      - name: Build
        run: swift build -Xswiftc -warnings-as-errors

      - name: Test with Coverage
        run: swift test --enable-code-coverage --parallel

      - name: Enforce 90% Coverage
        run: |
          COVERAGE=$(xcrun llvm-cov report \
            .build/debug/*PackageTests.xctest/Contents/MacOS/*PackageTests \
            -instr-profile=.build/debug/codecov/default.profdata \
            -ignore-filename-regex=".build|Tests" | tail -1 | awk '{print $4}' | tr -d '%')
          echo "Coverage: $COVERAGE%"
          if (( $(echo "$COVERAGE < 90" | bc -l) )); then
            echo "::error::Coverage $COVERAGE% is below 90% threshold"
            exit 1
          fi

      - name: SwiftLint Analyze
        run: |
          swift build 2>&1 | tee build_log.txt
          swiftlint analyze --strict --compiler-log-path build_log.txt || true
```

## Documentation Requirements

All public APIs must be documented:

```swift
/// A service that manages user authentication.
///
/// Use this service to handle login, logout, and session management.
///
/// ## Usage
///
/// ```swift
/// let authService = AuthService(config: .default)
/// try await authService.login(email: "user@example.com", password: "secret")
/// ```
///
/// - Important: Always call `logout()` when the user session ends.
public final class AuthService {
    /// Creates a new authentication service.
    ///
    /// - Parameter config: The configuration for the service.
    /// - Throws: `AuthError.invalidConfig` if the configuration is invalid.
    public init(config: AuthConfig) throws { }

    /// Authenticates a user with email and password.
    ///
    /// - Parameters:
    ///   - email: The user's email address.
    ///   - password: The user's password.
    /// - Returns: The authenticated user session.
    /// - Throws: `AuthError.invalidCredentials` if authentication fails.
    public func login(email: String, password: String) async throws -> Session { }
}
```
