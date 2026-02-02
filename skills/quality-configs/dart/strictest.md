# Dart Strictest Quality Config

Maximum strictness configuration for Dart and Flutter projects.

## Mode: Strictest

- Coverage: 90% minimum
- Complexity: Tight limits
- No dynamic anywhere
- All warnings as errors (--fatal-infos)

## Analysis Options (`analysis_options.yaml`)

```yaml
# Strictest Dart analysis configuration
# Based on very_good_analysis 6.0+ (2024-2025)

include: package:very_good_analysis/analysis_options.yaml

analyzer:
  language:
    strict-casts: true
    strict-inference: true
    strict-raw-types: true

  errors:
    # All infos and warnings as errors
    missing_return: error
    missing_required_param: error
    must_be_immutable: error
    must_call_super: error
    invalid_annotation_target: error
    invalid_use_of_protected_member: error
    invalid_use_of_visible_for_testing_member: error
    dead_code: error
    unused_import: error
    unused_local_variable: error
    unused_element: error
    deprecated_member_use: error
    todo: error
    avoid_print: error
    prefer_const_constructors: error
    prefer_const_declarations: error
    prefer_const_literals_to_create_immutables: error
    unnecessary_null_checks: error
    unnecessary_nullable_for_final_variable_declarations: error
    inference_failure_on_function_invocation: error
    inference_failure_on_instance_creation: error
    inference_failure_on_uninitialized_variable: error
    inference_failure_on_untyped_parameter: error

  exclude:
    - "**/*.g.dart"
    - "**/*.freezed.dart"
    - "**/*.mocks.dart"
    - "**/generated/**"
    - "build/**"
    - ".dart_tool/**"

linter:
  rules:
    # Strictest: Zero tolerance for dynamic
    always_declare_return_types: true
    always_put_required_named_parameters_first: true
    always_require_non_null_named_parameters: true
    always_specify_types: true
    annotate_overrides: true
    avoid_annotating_with_dynamic: true
    avoid_catches_without_on_clauses: true
    avoid_catching_errors: true
    avoid_dynamic_calls: true
    avoid_empty_else: true
    avoid_print: true
    avoid_relative_lib_imports: true
    avoid_returning_null_for_future: true
    avoid_slow_async_io: true
    avoid_type_to_string: true
    avoid_types_as_parameter_names: true
    avoid_types_on_closure_parameters: false
    avoid_web_libraries_in_flutter: true
    cancel_subscriptions: true
    close_sinks: true
    collection_methods_unrelated_type: true
    comment_references: true
    control_flow_in_finally: true
    discarded_futures: true
    empty_statements: true
    hash_and_equals: true
    implicit_reopen: true
    invalid_case_patterns: true
    invariant_booleans: true
    iterable_contains_unrelated_type: true
    list_remove_unrelated_type: true
    literal_only_boolean_expressions: true
    no_adjacent_strings_in_list: true
    no_duplicate_case_values: true
    no_logic_in_create_state: true
    prefer_void_to_null: true
    test_types_in_equals: true
    throw_in_finally: true
    unnecessary_statements: true
    unrelated_type_equality_checks: true
    use_build_context_synchronously: true
    use_key_in_widget_constructors: true
    valid_regexps: true

    # Strictest style rules
    always_put_control_body_on_new_line: true
    avoid_bool_literals_in_conditional_expressions: true
    avoid_classes_with_only_static_members: true
    avoid_double_and_int_checks: true
    avoid_equals_and_hash_code_on_mutable_classes: true
    avoid_escaping_inner_quotes: true
    avoid_field_initializers_in_const_classes: true
    avoid_final_parameters: false
    avoid_function_literals_in_foreach_calls: true
    avoid_implementing_value_types: true
    avoid_init_to_null: true
    avoid_js_rounded_ints: true
    avoid_multiple_declarations_per_line: true
    avoid_null_checks_in_equality_operators: true
    avoid_positional_boolean_parameters: true
    avoid_private_typedef_functions: true
    avoid_redundant_argument_values: true
    avoid_renaming_method_parameters: true
    avoid_return_types_on_setters: true
    avoid_returning_null: true
    avoid_returning_null_for_void: true
    avoid_returning_this: true
    avoid_setters_without_getters: true
    avoid_shadowing_type_parameters: true
    avoid_single_cascade_in_expression_statements: true
    avoid_unnecessary_containers: true
    avoid_unused_constructor_parameters: true
    avoid_void_async: true
    await_only_futures: true
    camel_case_extensions: true
    camel_case_types: true
    cascade_invocations: true
    cast_nullable_to_non_nullable: true
    combinators_ordering: true
    conditional_uri_does_not_exist: true
    constant_identifier_names: true
    curly_braces_in_flow_control_structures: true
    dangling_library_doc_comments: true
    depend_on_referenced_packages: true
    deprecated_consistency: true
    diagnostic_describe_all_properties: true
    directives_ordering: true
    do_not_use_environment: true
    document_ignores: true
    empty_catches: true
    empty_constructor_bodies: true
    eol_at_end_of_file: true
    exhaustive_cases: true
    file_names: true
    flutter_style_todos: true
    implementation_imports: true
    implicit_call_tearoffs: true
    join_return_with_assignment: true
    leading_newlines_in_multiline_strings: true
    library_annotations: true
    library_names: true
    library_prefixes: true
    library_private_types_in_public_api: true
    lines_longer_than_80_chars: true
    matching_super_parameters: true
    missing_whitespace_between_adjacent_strings: true
    no_default_cases: true
    no_leading_underscores_for_library_prefixes: true
    no_leading_underscores_for_local_identifiers: true
    no_literal_bool_comparisons: true
    no_runtimeType_toString: true
    no_self_assignments: true
    no_wildcard_variable_uses: true
    non_constant_identifier_names: true
    noop_primitive_operations: true
    null_check_on_nullable_type_parameter: true
    null_closures: true
    omit_local_variable_types: false
    one_member_abstracts: true
    only_throw_errors: true
    overridden_fields: true
    package_api_docs: true
    package_prefixed_library_names: true
    parameter_assignments: true
    prefer_adjacent_string_concatenation: true
    prefer_asserts_in_initializer_lists: true
    prefer_asserts_with_message: true
    prefer_collection_literals: true
    prefer_conditional_assignment: true
    prefer_const_constructors: true
    prefer_const_constructors_in_immutables: true
    prefer_const_declarations: true
    prefer_const_literals_to_create_immutables: true
    prefer_constructors_over_static_methods: true
    prefer_contains: true
    prefer_expression_function_bodies: true
    prefer_final_fields: true
    prefer_final_in_for_each: true
    prefer_final_locals: true
    prefer_final_parameters: true
    prefer_for_elements_to_map_fromIterable: true
    prefer_function_declarations_over_variables: true
    prefer_generic_function_type_aliases: true
    prefer_if_elements_to_conditional_expressions: true
    prefer_if_null_operators: true
    prefer_initializing_formals: true
    prefer_inlined_adds: true
    prefer_int_literals: true
    prefer_interpolation_to_compose_strings: true
    prefer_is_empty: true
    prefer_is_not_empty: true
    prefer_is_not_operator: true
    prefer_iterable_whereType: true
    prefer_mixin: true
    prefer_null_aware_method_calls: true
    prefer_null_aware_operators: true
    prefer_single_quotes: true
    prefer_spread_operator: true
    prefer_typing_uninitialized_variables: true
    provide_deprecation_message: true
    public_member_api_docs: true
    recursive_getters: true
    require_trailing_commas: true
    secure_pubspec_urls: true
    sized_box_for_whitespace: true
    sized_box_shrink_expand: true
    slash_for_doc_comments: true
    sort_child_properties_last: true
    sort_constructors_first: true
    sort_pub_dependencies: true
    sort_unnamed_constructors_first: true
    strict_top_level_inference: true
    tighten_type_of_initializing_formals: true
    type_annotate_public_apis: true
    type_init_formals: true
    type_literal_in_constant_pattern: true
    unawaited_futures: true
    unnecessary_await_in_return: true
    unnecessary_brace_in_string_interps: true
    unnecessary_breaks: true
    unnecessary_const: true
    unnecessary_constructor_name: true
    unnecessary_final: false
    unnecessary_getters_setters: true
    unnecessary_lambdas: true
    unnecessary_late: true
    unnecessary_library_directive: true
    unnecessary_new: true
    unnecessary_null_aware_assignments: true
    unnecessary_null_aware_operator_on_extension_on_nullable: true
    unnecessary_null_checks: true
    unnecessary_null_in_if_null_operators: true
    unnecessary_nullable_for_final_variable_declarations: true
    unnecessary_overrides: true
    unnecessary_parenthesis: true
    unnecessary_raw_strings: true
    unnecessary_string_escapes: true
    unnecessary_string_interpolations: true
    unnecessary_this: true
    unnecessary_to_list_in_spreads: true
    unreachable_from_main: true
    use_colored_box: true
    use_decorated_box: true
    use_enums: true
    use_full_hex_values_for_flutter_colors: true
    use_function_type_syntax_for_parameters: true
    use_if_null_to_convert_nulls_to_bools: true
    use_is_even_rather_than_modulo: true
    use_late_for_private_fields_and_variables: true
    use_named_constants: true
    use_raw_strings: true
    use_rethrow_when_possible: true
    use_setters_to_change_properties: true
    use_string_buffers: true
    use_string_in_part_of_directives: true
    use_super_parameters: true
    use_test_throws_matchers: true
    use_to_and_as_if_applicable: true
    void_checks: true
```

## pubspec.yaml Dev Dependencies

```yaml
dev_dependencies:
  flutter_test:
    sdk: flutter
  very_good_analysis: ^6.0.0
  test: ^1.25.0
  mockito: ^5.4.4
  mocktail: ^1.0.3
  build_runner: ^2.4.8
  coverage: ^1.7.2
  dart_code_metrics: ^5.7.6
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
| File length | 300 lines |
| Parameters | 3 |
| Nesting depth | 3 |
| Statements per function | 15 |

## Commands

```bash
# Run analyzer with --fatal-infos (strictest mode)
dart analyze --fatal-infos

# Run tests with coverage
flutter test --coverage

# Check coverage threshold
dart run coverage:format_coverage --lcov --in=coverage --out=coverage/lcov.info --report-on=lib

# Run dart_code_metrics for complexity analysis
dart run dart_code_metrics:metrics analyze lib --reporter=console --set-exit-on-violation-level=warning
```

## dart_code_metrics Config (`dart_code_metrics.yaml`)

```yaml
dart_code_metrics:
  metrics:
    cyclomatic-complexity: 7
    halstead-volume: 150
    lines-of-code: 30
    maintainability-index: 50
    maximum-nesting-level: 3
    number-of-methods: 10
    number-of-parameters: 3
    source-lines-of-code: 30
    technical-debt:
      threshold: 1
      todo-cost: 4
      ignore-cost: 8
      ignore-for-file-cost: 16
      as-dynamic-cost: 8
      deprecated-annotations-cost: 4
      file-nullsafety-migration-cost: 2
      unit-type: "hours"
    weight-of-class: 0.33

  metrics-exclude:
    - test/**
    - "**/*.g.dart"
    - "**/*.freezed.dart"

  rules:
    - avoid-banned-imports
    - avoid-cascade-after-if-null
    - avoid-collection-methods-with-unrelated-types
    - avoid-double-slash-imports
    - avoid-duplicate-exports
    - avoid-dynamic
    - avoid-global-state
    - avoid-ignoring-return-values
    - avoid-late-keyword
    - avoid-missing-enum-constant-in-map
    - avoid-nested-conditional-expressions:
        acceptable-level: 2
    - avoid-non-ascii-symbols
    - avoid-non-null-assertion
    - avoid-passing-async-when-sync-expected
    - avoid-redundant-async
    - avoid-throw-in-catch-block
    - avoid-top-level-members-in-tests
    - avoid-unnecessary-type-assertions
    - avoid-unnecessary-type-casts
    - avoid-unrelated-type-assertions
    - avoid-unused-parameters
    - binary-expression-operand-order
    - double-literal-format
    - format-comment
    - member-ordering:
        alphabetize: true
        order:
          - constructors
          - named-constructors
          - factory-constructors
          - static-public-fields
          - static-private-fields
          - public-fields
          - private-fields
          - getters
          - setters
          - public-methods
          - private-methods
    - newline-before-return
    - no-boolean-literal-compare
    - no-empty-block
    - no-equal-arguments
    - no-equal-then-else
    - no-magic-number:
        allowed: [0, 1, 2, -1]
    - no-object-declaration
    - prefer-async-await
    - prefer-commenting-analyzer-ignores
    - prefer-conditional-expressions
    - prefer-correct-identifier-length:
        min-identifier-length: 2
        max-identifier-length: 30
    - prefer-correct-type-name:
        min-length: 2
        max-length: 40
    - prefer-enums-by-name
    - prefer-first
    - prefer-immediate-return
    - prefer-iterable-of
    - prefer-last
    - prefer-match-file-name
    - prefer-moving-to-variable
    - prefer-static-class
    - prefer-trailing-comma
```

## Makefile

```makefile
.PHONY: lint test coverage metrics quality

lint:
	dart analyze --fatal-infos
	dart format --set-exit-if-changed lib/ test/

format:
	dart format lib/ test/

test:
	flutter test

coverage:
	flutter test --coverage
	@coverage=$$(lcov --summary coverage/lcov.info 2>&1 | grep 'lines' | sed 's/.*: //' | sed 's/%.*//' | tr -d ' '); \
	if [ "$${coverage%.*}" -lt 90 ]; then \
		echo "Coverage $${coverage}% is below 90% threshold"; \
		exit 1; \
	fi

metrics:
	dart run dart_code_metrics:metrics analyze lib \
		--reporter=console \
		--set-exit-on-violation-level=warning

quality: lint test coverage metrics
```

## CI/CD Integration (GitHub Actions)

```yaml
name: Strictest Quality Checks

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.24.0'
          channel: 'stable'

      - name: Install dependencies
        run: flutter pub get

      - name: Analyze (fatal-infos)
        run: dart analyze --fatal-infos

      - name: Format check
        run: dart format --set-exit-if-changed lib/ test/

      - name: Test with coverage
        run: flutter test --coverage

      - name: Check coverage threshold (90%)
        run: |
          sudo apt-get install -y lcov
          COVERAGE=$(lcov --summary coverage/lcov.info 2>&1 | grep 'lines' | sed 's/.*: //' | sed 's/%.*//' | tr -d ' ')
          echo "Coverage: ${COVERAGE}%"
          if [ "${COVERAGE%.*}" -lt 90 ]; then
            echo "Coverage ${COVERAGE}% is below 90% threshold"
            exit 1
          fi

      - name: Code Metrics
        run: |
          dart pub global activate dart_code_metrics
          dart pub global run dart_code_metrics:metrics analyze lib \
            --reporter=console \
            --set-exit-on-violation-level=warning
```
