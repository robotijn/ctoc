# Dart Legacy Quality Config

Gradual adoption configuration for migrating existing Dart and Flutter projects.

## Mode: Legacy

- Coverage: 50% minimum (baseline)
- Complexity: Relaxed limits
- Warnings allowed (not errors)
- Gradual strictness adoption

## Analysis Options (`analysis_options.yaml`)

```yaml
# Legacy Dart analysis configuration
# Gradual adoption for existing projects (2024-2025)

include: package:flutter_lints/flutter.yaml

analyzer:
  language:
    strict-casts: false
    strict-inference: false
    strict-raw-types: false

  errors:
    # Legacy mode: most issues as warnings
    missing_return: warning
    missing_required_param: error
    must_be_immutable: warning
    must_call_super: warning
    invalid_annotation_target: warning
    invalid_use_of_protected_member: warning
    invalid_use_of_visible_for_testing_member: warning
    dead_code: info
    unused_import: info
    unused_local_variable: info
    unused_element: info
    deprecated_member_use: info
    todo: ignore
    avoid_print: info

  exclude:
    - "**/*.g.dart"
    - "**/*.freezed.dart"
    - "**/*.mocks.dart"
    - "**/generated/**"
    - "build/**"
    - ".dart_tool/**"

linter:
  rules:
    # Core rules only (errors that should be fixed)
    always_declare_return_types: false
    annotate_overrides: true
    avoid_dynamic_calls: false
    avoid_empty_else: true
    avoid_print: false
    avoid_relative_lib_imports: true
    avoid_returning_null_for_future: true
    avoid_slow_async_io: true
    avoid_types_as_parameter_names: true
    avoid_web_libraries_in_flutter: true
    cancel_subscriptions: true
    close_sinks: true
    collection_methods_unrelated_type: true
    control_flow_in_finally: true
    empty_statements: true
    hash_and_equals: true
    iterable_contains_unrelated_type: true
    list_remove_unrelated_type: true
    no_adjacent_strings_in_list: true
    no_duplicate_case_values: true
    no_logic_in_create_state: true
    prefer_void_to_null: true
    test_types_in_equals: true
    throw_in_finally: true
    unrelated_type_equality_checks: true
    use_build_context_synchronously: true
    use_key_in_widget_constructors: true
    valid_regexps: true

    # Style rules (relaxed)
    avoid_init_to_null: true
    avoid_null_checks_in_equality_operators: true
    avoid_renaming_method_parameters: true
    avoid_return_types_on_setters: true
    avoid_returning_null_for_void: true
    avoid_shadowing_type_parameters: true
    avoid_single_cascade_in_expression_statements: true
    avoid_unnecessary_containers: true
    await_only_futures: true
    camel_case_extensions: true
    camel_case_types: true
    constant_identifier_names: true
    curly_braces_in_flow_control_structures: true
    depend_on_referenced_packages: true
    directives_ordering: true
    empty_catches: true
    empty_constructor_bodies: true
    exhaustive_cases: true
    file_names: true
    implementation_imports: true
    library_names: true
    library_prefixes: true
    library_private_types_in_public_api: true
    non_constant_identifier_names: true
    null_check_on_nullable_type_parameter: true
    null_closures: true
    overridden_fields: true
    prefer_adjacent_string_concatenation: true
    prefer_collection_literals: true
    prefer_conditional_assignment: true
    prefer_const_constructors: false
    prefer_const_constructors_in_immutables: false
    prefer_const_declarations: false
    prefer_const_literals_to_create_immutables: false
    prefer_contains: true
    prefer_final_fields: true
    prefer_for_elements_to_map_fromIterable: true
    prefer_function_declarations_over_variables: true
    prefer_generic_function_type_aliases: true
    prefer_if_null_operators: true
    prefer_initializing_formals: true
    prefer_inlined_adds: true
    prefer_interpolation_to_compose_strings: true
    prefer_is_empty: true
    prefer_is_not_empty: true
    prefer_is_not_operator: true
    prefer_iterable_whereType: true
    prefer_null_aware_operators: true
    prefer_single_quotes: true
    prefer_spread_operator: true
    prefer_typing_uninitialized_variables: true
    provide_deprecation_message: true
    recursive_getters: true
    sized_box_for_whitespace: true
    slash_for_doc_comments: true
    sort_child_properties_last: true
    type_init_formals: true
    unawaited_futures: false
    unnecessary_brace_in_string_interps: true
    unnecessary_const: true
    unnecessary_constructor_name: true
    unnecessary_getters_setters: true
    unnecessary_lambdas: true
    unnecessary_late: true
    unnecessary_new: true
    unnecessary_null_aware_assignments: true
    unnecessary_null_in_if_null_operators: true
    unnecessary_nullable_for_final_variable_declarations: false
    unnecessary_overrides: true
    unnecessary_parenthesis: true
    unnecessary_string_escapes: true
    unnecessary_string_interpolations: true
    unnecessary_this: true
    use_full_hex_values_for_flutter_colors: true
    use_function_type_syntax_for_parameters: true
    use_rethrow_when_possible: true
    use_super_parameters: true
    void_checks: true

    # Disabled for gradual adoption
    always_put_required_named_parameters_first: false
    always_require_non_null_named_parameters: false
    always_specify_types: false
    avoid_annotating_with_dynamic: false
    avoid_bool_literals_in_conditional_expressions: false
    avoid_catches_without_on_clauses: false
    avoid_catching_errors: false
    avoid_classes_with_only_static_members: false
    avoid_equals_and_hash_code_on_mutable_classes: false
    avoid_positional_boolean_parameters: false
    avoid_returning_this: false
    avoid_setters_without_getters: false
    avoid_types_on_closure_parameters: false
    avoid_unused_constructor_parameters: false
    avoid_void_async: false
    cascade_invocations: false
    comment_references: false
    lines_longer_than_80_chars: false
    one_member_abstracts: false
    only_throw_errors: false
    package_api_docs: false
    parameter_assignments: false
    prefer_asserts_in_initializer_lists: false
    prefer_asserts_with_message: false
    prefer_constructors_over_static_methods: false
    prefer_expression_function_bodies: false
    prefer_final_in_for_each: false
    prefer_final_locals: false
    prefer_mixin: false
    public_member_api_docs: false
    require_trailing_commas: false
    sort_constructors_first: false
    sort_pub_dependencies: false
    sort_unnamed_constructors_first: false
    type_annotate_public_apis: false
    use_setters_to_change_properties: false
    use_string_buffers: false
    use_to_and_as_if_applicable: false
```

## pubspec.yaml Dev Dependencies

```yaml
dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^4.0.0
  test: ^1.25.0
  mockito: ^5.4.4
  build_runner: ^2.4.8
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
| Cyclomatic | 15 |
| Cognitive | 20 |
| Function length | 100 lines |
| File length | 600 lines |
| Parameters | 6 |
| Nesting depth | 6 |

## Commands

```bash
# Run analyzer (warnings allowed)
dart analyze

# Run tests with coverage
flutter test --coverage

# Check coverage threshold
dart run coverage:format_coverage --lcov --in=coverage --out=coverage/lcov.info --report-on=lib
```

## Makefile

```makefile
.PHONY: lint test coverage quality

lint:
	dart analyze
	dart format --set-exit-if-changed lib/ test/ || echo "Format issues found (warning)"

format:
	dart format lib/ test/

test:
	flutter test

coverage:
	flutter test --coverage
	@coverage=$$(lcov --summary coverage/lcov.info 2>&1 | grep 'lines' | sed 's/.*: //' | sed 's/%.*//' | tr -d ' '); \
	if [ "$${coverage%.*}" -lt 50 ]; then \
		echo "Coverage $${coverage}% is below 50% threshold"; \
		exit 1; \
	fi

quality: lint test coverage
```

## Upgrade Path

To gradually upgrade from Legacy to Strict mode:

### Phase 1: Enable Basic Strictness

```yaml
# Add to analysis_options.yaml incrementally:
analyzer:
  language:
    strict-raw-types: true  # Start here
```

### Phase 2: Enable Warning Lints

```yaml
linter:
  rules:
    # Enable one by one:
    prefer_const_constructors: true
    prefer_const_declarations: true
    always_declare_return_types: true
    avoid_dynamic_calls: true
```

### Phase 3: Promote Warnings to Errors

```yaml
analyzer:
  errors:
    # Change from warning to error:
    missing_return: error
    must_be_immutable: error
    unused_import: warning  # Then error
```

### Phase 4: Enable Strict Inference

```yaml
analyzer:
  language:
    strict-inference: true
    strict-casts: true
```

### Phase 5: Increase Coverage

```bash
# Increase thresholds gradually:
# 50% -> 60% -> 70% -> 80%
```

### Phase 6: Enable Documentation Rules

```yaml
linter:
  rules:
    public_member_api_docs: true
    package_api_docs: true
    comment_references: true
```

## Tracking Progress

Create a `QUALITY_ROADMAP.md` in your project:

```markdown
# Quality Roadmap

## Current Status: Legacy

### Phase 1: Basic Strictness
- [ ] Enable strict-raw-types
- [ ] Fix all analyzer errors
- [ ] Achieve 50% coverage

### Phase 2: Warning Lints (Target: Month 2)
- [ ] Enable prefer_const_* rules
- [ ] Enable always_declare_return_types
- [ ] Enable avoid_dynamic_calls

### Phase 3: Error Promotion (Target: Month 3)
- [ ] Promote missing_return to error
- [ ] Promote unused_* to warning
- [ ] Achieve 60% coverage

### Phase 4: Strict Inference (Target: Month 4)
- [ ] Enable strict-inference
- [ ] Enable strict-casts
- [ ] Achieve 70% coverage

### Phase 5: Full Strict Mode (Target: Month 6)
- [ ] Switch to strict.md config
- [ ] Achieve 80% coverage
- [ ] Enable --fatal-warnings
```

## CI/CD Integration (GitHub Actions)

```yaml
name: Legacy Quality Checks

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

      - name: Analyze (warnings allowed)
        run: dart analyze
        continue-on-error: true

      - name: Format check (informational)
        run: dart format --set-exit-if-changed lib/ test/ || echo "::warning::Format issues found"
        continue-on-error: true

      - name: Test with coverage
        run: flutter test --coverage

      - name: Check coverage threshold (50%)
        run: |
          sudo apt-get install -y lcov
          COVERAGE=$(lcov --summary coverage/lcov.info 2>&1 | grep 'lines' | sed 's/.*: //' | sed 's/%.*//' | tr -d ' ')
          echo "Coverage: ${COVERAGE}%"
          if [ "${COVERAGE%.*}" -lt 50 ]; then
            echo "Coverage ${COVERAGE}% is below 50% threshold"
            exit 1
          fi
```

## Migration Script

Use this script to track your migration progress:

```bash
#!/bin/bash
# save as scripts/quality_check.sh

echo "=== Dart Quality Check (Legacy Mode) ==="
echo ""

# Run analyzer and count issues
echo "Analyzer issues:"
ERRORS=$(dart analyze 2>&1 | grep -c "error" || echo "0")
WARNINGS=$(dart analyze 2>&1 | grep -c "warning" || echo "0")
INFOS=$(dart analyze 2>&1 | grep -c "info" || echo "0")
echo "  Errors: $ERRORS"
echo "  Warnings: $WARNINGS"
echo "  Infos: $INFOS"
echo ""

# Check coverage
echo "Coverage:"
flutter test --coverage > /dev/null 2>&1
COVERAGE=$(lcov --summary coverage/lcov.info 2>&1 | grep 'lines' | sed 's/.*: //' | sed 's/%.*//' | tr -d ' ')
echo "  Line coverage: ${COVERAGE}%"
echo ""

# Recommendations
echo "=== Upgrade Recommendations ==="
if [ "$ERRORS" -gt 0 ]; then
    echo "- Fix $ERRORS errors before upgrading"
elif [ "${COVERAGE%.*}" -lt 50 ]; then
    echo "- Increase coverage to 50% before upgrading"
elif [ "$WARNINGS" -gt 20 ]; then
    echo "- Consider fixing warnings before upgrading"
else
    echo "- Ready to try Phase 2 (enable more lints)"
fi
```
