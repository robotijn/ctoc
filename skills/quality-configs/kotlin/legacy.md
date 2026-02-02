# Kotlin Legacy Quality Config

Gradual adoption for existing Kotlin projects using detekt and ktlint.

## Mode: Legacy

- Coverage: 50% minimum
- Warnings allowed
- Relaxed limits
- Focus on critical issues only

## detekt Configuration (`detekt.yml`)

```yaml
build:
  maxIssues: -1  # Allow issues (report only)
  excludeCorrectable: true
  weights:
    complexity: 1
    style: 0
    potential-bugs: 2

config:
  validation: true
  warningsAsErrors: false

processors:
  active: true

console-reports:
  active: true

output-reports:
  active: true

complexity:
  active: true
  CyclomaticComplexMethod:
    active: true
    threshold: 15
  LongMethod:
    active: true
    threshold: 100
  LongParameterList:
    active: true
    functionThreshold: 6
    constructorThreshold: 8
  NestedBlockDepth:
    active: true
    threshold: 6
  TooManyFunctions:
    active: true
    thresholdInFiles: 25
    thresholdInClasses: 25
    thresholdInInterfaces: 20
    thresholdInObjects: 20
    thresholdInEnums: 20
  LargeClass:
    active: true
    threshold: 600
  ComplexCondition:
    active: true
    threshold: 6
  StringLiteralDuplication:
    active: false

coroutines:
  active: true
  GlobalCoroutineUsage:
    active: true
  RedundantSuspendModifier:
    active: true
  SleepInsteadOfDelay:
    active: true
  SuspendFunWithFlowReturnType:
    active: true

empty-blocks:
  active: true
  EmptyCatchBlock:
    active: true
    allowedExceptionNameRegex: '_|(ignore|expected).*'
  EmptyClassBlock:
    active: false
  EmptyDefaultConstructor:
    active: false
  EmptyDoWhileBlock:
    active: true
  EmptyElseBlock:
    active: false
  EmptyFinallyBlock:
    active: true
  EmptyForBlock:
    active: true
  EmptyFunctionBlock:
    active: true
    ignoreOverridden: true
  EmptyIfBlock:
    active: true
  EmptyInitBlock:
    active: false
  EmptyKtFile:
    active: true
  EmptySecondaryConstructor:
    active: false
  EmptyTryBlock:
    active: true
  EmptyWhenBlock:
    active: true
  EmptyWhileBlock:
    active: true

exceptions:
  active: true
  ExceptionRaisedInUnexpectedLocation:
    active: true
  InstanceOfCheckForException:
    active: false
  NotImplementedDeclaration:
    active: true
  PrintStackTrace:
    active: true
  RethrowCaughtException:
    active: false
  ReturnFromFinally:
    active: true
  SwallowedException:
    active: false
  ThrowingExceptionFromFinally:
    active: true
  ThrowingExceptionInMain:
    active: false
  ThrowingExceptionsWithoutMessageOrCause:
    active: false
  ThrowingNewInstanceOfSameException:
    active: true
  TooGenericExceptionCaught:
    active: false
  TooGenericExceptionThrown:
    active: true
    exceptionNames:
      - Error
      - Exception
      - Throwable

naming:
  active: true
  ClassNaming:
    active: true
    classPattern: '[A-Z][a-zA-Z0-9]*'
  ConstructorParameterNaming:
    active: false
  EnumNaming:
    active: true
    enumEntryPattern: '[A-Z][_a-zA-Z0-9]*'
  ForbiddenClassName:
    active: false
  FunctionMaxLength:
    active: false
  FunctionMinLength:
    active: false
  FunctionNaming:
    active: true
    functionPattern: '[a-z][a-zA-Z0-9]*'
    excludeClassPattern: '$^'
  FunctionParameterNaming:
    active: false
  InvalidPackageDeclaration:
    active: true
  MatchingDeclarationName:
    active: false
  MemberNameEqualsClassName:
    active: false
  ObjectPropertyNaming:
    active: false
  PackageNaming:
    active: true
    packagePattern: '[a-z]+(\.[a-z][A-Za-z0-9]*)*'
  TopLevelPropertyNaming:
    active: false
  VariableMaxLength:
    active: false
  VariableMinLength:
    active: false
  VariableNaming:
    active: true
    variablePattern: '[a-z][A-Za-z0-9]*'

performance:
  active: true
  ArrayPrimitive:
    active: true
  CouldBeSequence:
    active: false
  ForEachOnRange:
    active: true
  SpreadOperator:
    active: false
  UnnecessaryPartOfBinaryExpression:
    active: false
  UnnecessaryTemporaryInstantiation:
    active: true

potential-bugs:
  active: true
  CastToNullableType:
    active: false
  Deprecation:
    active: false
  DontDowncastCollectionTypes:
    active: true
  DoubleMutabilityForCollection:
    active: true
  EqualsAlwaysReturnsTrueOrFalse:
    active: true
  EqualsWithHashCodeExist:
    active: true
  ExplicitGarbageCollectionCall:
    active: true
  HasPlatformType:
    active: false
  IgnoredReturnValue:
    active: false
  ImplicitDefaultLocale:
    active: false
  ImplicitUnitReturnType:
    active: false
  InvalidRange:
    active: true
  IteratorHasNextCallsNextMethod:
    active: true
  IteratorNotThrowingNoSuchElementException:
    active: true
  LateinitUsage:
    active: false
  MapGetWithNotNullAssertionOperator:
    active: true
  MissingPackageDeclaration:
    active: true
  NullCheckOnMutableProperty:
    active: false
  NullableToStringCall:
    active: false
  UnconditionalJumpStatementInLoop:
    active: true
  UnnecessaryNotNullOperator:
    active: false
  UnnecessarySafeCall:
    active: false
  UnreachableCode:
    active: true
  UnsafeCallOnNullableType:
    active: false
  UnsafeCast:
    active: false
  UselessPostfixExpression:
    active: true
  WrongEqualsTypeParameter:
    active: true

style:
  active: true
  BracesOnIfStatements:
    active: false
  ClassOrdering:
    active: false
  CollapsibleIfStatements:
    active: false
  DataClassContainsFunctions:
    active: false
  DataClassShouldBeImmutable:
    active: false
  DestructuringDeclarationWithTooManyEntries:
    active: false
  EqualsNullCall:
    active: true
  EqualsOnSignatureLine:
    active: false
  ExplicitCollectionElementAccessMethod:
    active: false
  ExplicitItLambdaParameter:
    active: false
  ExpressionBodySyntax:
    active: false
  ForbiddenComment:
    active: false
  ForbiddenVoid:
    active: false
  FunctionOnlyReturningConstant:
    active: false
  LoopWithTooManyJumpStatements:
    active: false
  MagicNumber:
    active: false
  MandatoryBracesLoops:
    active: false
  MaxLineLength:
    active: true
    maxLineLength: 150
    excludeCommentStatements: true
  MayBeConst:
    active: false
  ModifierOrder:
    active: true
  MultilineLambdaItParameter:
    active: false
  NestedClassesVisibility:
    active: false
  NewLineAtEndOfFile:
    active: true
  NoTabs:
    active: true
  NullableBooleanCheck:
    active: false
  ObjectLiteralToLambda:
    active: false
  OptionalAbstractKeyword:
    active: true
  OptionalUnit:
    active: false
  PreferToOverPairSyntax:
    active: false
  ProtectedMemberInFinalClass:
    active: false
  RedundantExplicitType:
    active: false
  RedundantHigherOrderMapUsage:
    active: false
  RedundantVisibilityModifierRule:
    active: false
  ReturnCount:
    active: false
  SafeCast:
    active: false
  SerialVersionUIDInSerializableClass:
    active: false
  SpacingBetweenPackageAndImports:
    active: true
  ThrowsCount:
    active: false
  TrailingWhitespace:
    active: true
  UnderscoresInNumericLiterals:
    active: false
  UnnecessaryAbstractClass:
    active: false
  UnnecessaryAnnotationUseSiteTarget:
    active: false
  UnnecessaryApply:
    active: false
  UnnecessaryFilter:
    active: false
  UnnecessaryInheritance:
    active: true
  UnnecessaryInnerClass:
    active: false
  UnnecessaryLet:
    active: false
  UnnecessaryParentheses:
    active: false
  UntilInsteadOfRangeTo:
    active: false
  UnusedImports:
    active: true
  UnusedPrivateClass:
    active: true
  UnusedPrivateMember:
    active: false
  UnusedPrivateProperty:
    active: false
  UseArrayLiteralsInAnnotations:
    active: false
  UseCheckNotNull:
    active: false
  UseCheckOrError:
    active: false
  UseDataClass:
    active: false
  UseEmptyCounterpart:
    active: false
  UseIfEmptyOrIfBlank:
    active: false
  UseIfInsteadOfWhen:
    active: false
  UseIsNullOrEmpty:
    active: false
  UseOrEmpty:
    active: false
  UseRequire:
    active: false
  UseRequireNotNull:
    active: false
  UseSumOfInsteadOfFlatMapSize:
    active: false
  UselessCallOnNotNull:
    active: true
  VarCouldBeVal:
    active: false
  WildcardImport:
    active: false
```

## ktlint Legacy Configuration (`.editorconfig`)

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_size = 4
indent_style = space
insert_final_newline = true
max_line_length = 150
tab_width = 4
trim_trailing_whitespace = true

[*.{kt,kts}]
ktlint_code_style = ktlint_official
ktlint_standard = enabled

# Essential rules only - disable stylistic rules
ktlint_standard_annotation = enabled
ktlint_standard_argument-list-wrapping = disabled
ktlint_standard_blank-line-before-declaration = disabled
ktlint_standard_chain-wrapping = disabled
ktlint_standard_class-signature = disabled
ktlint_standard_colon-spacing = enabled
ktlint_standard_comma-spacing = enabled
ktlint_standard_comment-spacing = enabled
ktlint_standard_curly-spacing = enabled
ktlint_standard_dot-spacing = enabled
ktlint_standard_enum-entry-name-case = enabled
ktlint_standard_enum-wrapping = disabled
ktlint_standard_filename = enabled
ktlint_standard_final-newline = enabled
ktlint_standard_function-expression-body = disabled
ktlint_standard_function-literal = disabled
ktlint_standard_function-naming = enabled
ktlint_standard_function-signature = disabled
ktlint_standard_function-start-of-body-spacing = disabled
ktlint_standard_function-type-reference-spacing = disabled
ktlint_standard_if-else-bracing = disabled
ktlint_standard_if-else-wrapping = disabled
ktlint_standard_import-ordering = enabled
ktlint_standard_indent = enabled
ktlint_standard_kdoc = disabled
ktlint_standard_kdoc-wrapping = disabled
ktlint_standard_keyword-spacing = enabled
ktlint_standard_max-line-length = enabled
ktlint_standard_modifier-list-spacing = enabled
ktlint_standard_modifier-order = enabled
ktlint_standard_multiline-expression-wrapping = disabled
ktlint_standard_multiline-loop = disabled
ktlint_standard_no-blank-line-before-rbrace = disabled
ktlint_standard_no-blank-line-in-list = disabled
ktlint_standard_no-blank-lines-in-chained-method-calls = disabled
ktlint_standard_no-consecutive-blank-lines = enabled
ktlint_standard_no-consecutive-comments = disabled
ktlint_standard_no-empty-class-body = disabled
ktlint_standard_no-empty-file = enabled
ktlint_standard_no-empty-first-line-in-class-body = disabled
ktlint_standard_no-empty-first-line-in-method-block = disabled
ktlint_standard_no-line-break-after-else = disabled
ktlint_standard_no-line-break-before-assignment = disabled
ktlint_standard_no-multi-spaces = enabled
ktlint_standard_no-semi = enabled
ktlint_standard_no-single-line-block-comment = disabled
ktlint_standard_no-trailing-spaces = enabled
ktlint_standard_no-unit-return = disabled
ktlint_standard_no-unused-imports = enabled
ktlint_standard_no-wildcard-imports = disabled
ktlint_standard_nullable-type-spacing = enabled
ktlint_standard_op-spacing = enabled
ktlint_standard_package-name = enabled
ktlint_standard_parameter-list-spacing = disabled
ktlint_standard_parameter-list-wrapping = disabled
ktlint_standard_parameter-wrapping = disabled
ktlint_standard_paren-spacing = enabled
ktlint_standard_property-naming = disabled
ktlint_standard_property-wrapping = disabled
ktlint_standard_range-spacing = enabled
ktlint_standard_spacing-around-angle-brackets = enabled
ktlint_standard_spacing-around-colon = enabled
ktlint_standard_spacing-around-comma = enabled
ktlint_standard_spacing-around-curly = enabled
ktlint_standard_spacing-around-dot = enabled
ktlint_standard_spacing-around-double-colon = enabled
ktlint_standard_spacing-around-keyword = enabled
ktlint_standard_spacing-around-operators = enabled
ktlint_standard_spacing-around-parens = enabled
ktlint_standard_spacing-around-range-operator = enabled
ktlint_standard_spacing-around-unary-operator = enabled
ktlint_standard_spacing-between-declarations-with-annotations = disabled
ktlint_standard_spacing-between-declarations-with-comments = disabled
ktlint_standard_spacing-between-function-name-and-opening-parenthesis = enabled
ktlint_standard_statement-wrapping = disabled
ktlint_standard_string-template = enabled
ktlint_standard_string-template-indent = disabled
ktlint_standard_trailing-comma-on-call-site = disabled
ktlint_standard_trailing-comma-on-declaration-site = disabled
ktlint_standard_try-catch-finally-spacing = disabled
ktlint_standard_type-argument-list-spacing = enabled
ktlint_standard_type-parameter-list-spacing = enabled
ktlint_standard_unnecessary-parentheses-before-trailing-lambda = disabled
ktlint_standard_value-argument-comment = disabled
ktlint_standard_value-parameter-comment = disabled
ktlint_standard_wrapping = disabled

[*.md]
trim_trailing_whitespace = false
```

## Gradle Configuration (`build.gradle.kts`)

```kotlin
import io.gitlab.arturbosch.detekt.Detekt
import org.jlleitschuh.gradle.ktlint.reporter.ReporterType

plugins {
    kotlin("jvm") version "1.9.22"
    id("io.gitlab.arturbosch.detekt") version "1.23.5"
    id("org.jlleitschuh.gradle.ktlint") version "12.1.0"
    id("org.jetbrains.kotlinx.kover") version "0.7.6"
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation(platform("org.junit:junit-bom:5.10.2"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testImplementation("org.junit.jupiter:junit-jupiter-params")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")

    // AssertJ for fluent assertions
    testImplementation("org.assertj:assertj-core:3.25.3")

    // MockK for mocking
    testImplementation("io.mockk:mockk:1.13.9")
}

detekt {
    buildUponDefaultConfig = true
    config.setFrom(files("detekt.yml"))
    parallel = true
    ignoreFailures = true  // Report issues but don't fail build
}

ktlint {
    version.set("1.1.1")
    android.set(false)
    outputToConsole.set(true)
    ignoreFailures.set(true)  // Report issues but don't fail build
    reporters {
        reporter(ReporterType.CHECKSTYLE)
        reporter(ReporterType.HTML)
    }
}

kover {
    reports {
        verify {
            rule {
                bound {
                    minValue = 50
                    metric = kotlinx.kover.gradle.plugin.dsl.MetricType.LINE
                }
                bound {
                    minValue = 50
                    metric = kotlinx.kover.gradle.plugin.dsl.MetricType.BRANCH
                }
            }
        }
    }
}

tasks.test {
    useJUnitPlatform()
    finalizedBy(tasks.named("koverVerify"))
}

tasks.withType<Detekt>().configureEach {
    jvmTarget = "17"
    reports {
        html.required.set(true)
        xml.required.set(true)
        txt.required.set(false)
        sarif.required.set(false)
    }
}

// Don't block build on quality checks in legacy mode
tasks.check {
    dependsOn(tasks.named("ktlintCheck"))
    dependsOn(tasks.named("detekt"))
}
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |
| Branches | 50% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 15 |
| Method length | 100 lines |
| File length | 600 lines |
| Parameters | 6 (functions), 8 (constructors) |
| Nesting depth | 6 |
| Max functions per file | 25 |

## Migration Path

### Phase 1: Enable Reporting (Week 1-2)
1. Add detekt and ktlint with `ignoreFailures = true`
2. Generate baseline of current issues
3. Review reports to understand scope

### Phase 2: Fix Critical Issues (Week 3-4)
1. Fix potential bugs first
2. Fix empty catch blocks
3. Fix unused code

### Phase 3: Gradual Tightening (Month 2+)
1. Enable one rule category at a time
2. Start reducing complexity limits
3. Increase coverage requirements

### Baseline Generation

```bash
# Generate detekt baseline
./gradlew detektBaseline

# This creates detekt-baseline.xml
# Add to detekt config:
# baseline: "detekt-baseline.xml"
```

## Commands

```bash
# Run detekt (reports only, won't fail)
./gradlew detekt

# Run ktlint (reports only, won't fail)
./gradlew ktlintCheck

# Auto-format with ktlint
./gradlew ktlintFormat

# Run tests with coverage
./gradlew test koverVerify

# Generate baseline for existing issues
./gradlew detektBaseline

# View all reports
./gradlew check

# Generate coverage report
./gradlew koverHtmlReport
```

## Exclusion Patterns

For legacy code that cannot be immediately fixed:

```yaml
# In detekt.yml
build:
  excludes:
    - '**/legacy/**'
    - '**/generated/**'
```

```ini
# In .editorconfig for ktlint
[**/legacy/**]
ktlint = disabled

[**/generated/**]
ktlint = disabled
```
