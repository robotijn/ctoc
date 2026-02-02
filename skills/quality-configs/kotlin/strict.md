# Kotlin Strict Quality Config

Strict mode configuration for Kotlin projects using detekt and ktlint.

## Mode: Strict

- Coverage: 80% minimum
- detekt + ktlint standard rules
- Standard complexity limits

## detekt Configuration (`detekt.yml`)

```yaml
build:
  maxIssues: 0
  excludeCorrectable: false
  weights:
    complexity: 2
    style: 1
    potential-bugs: 2

config:
  validation: true
  warningsAsErrors: true

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
    threshold: 10
  LongMethod:
    active: true
    threshold: 50
  LongParameterList:
    active: true
    functionThreshold: 4
    constructorThreshold: 5
  NestedBlockDepth:
    active: true
    threshold: 4
  TooManyFunctions:
    active: true
    thresholdInFiles: 15
    thresholdInClasses: 15
    thresholdInInterfaces: 10
    thresholdInObjects: 10
    thresholdInEnums: 10
  LargeClass:
    active: true
    threshold: 400
  ComplexCondition:
    active: true
    threshold: 4
  StringLiteralDuplication:
    active: true
    threshold: 3

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
  EmptyClassBlock:
    active: true
  EmptyDefaultConstructor:
    active: true
  EmptyDoWhileBlock:
    active: true
  EmptyElseBlock:
    active: true
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
    active: true
  EmptyKtFile:
    active: true
  EmptySecondaryConstructor:
    active: true
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
    active: true
  NotImplementedDeclaration:
    active: true
  PrintStackTrace:
    active: true
  RethrowCaughtException:
    active: true
  ReturnFromFinally:
    active: true
  SwallowedException:
    active: true
  ThrowingExceptionFromFinally:
    active: true
  ThrowingExceptionInMain:
    active: true
  ThrowingExceptionsWithoutMessageOrCause:
    active: true
  ThrowingNewInstanceOfSameException:
    active: true
  TooGenericExceptionCaught:
    active: true
    exceptionNames:
      - ArrayIndexOutOfBoundsException
      - Error
      - Exception
      - IllegalMonitorStateException
      - NullPointerException
      - IndexOutOfBoundsException
      - RuntimeException
      - Throwable
  TooGenericExceptionThrown:
    active: true
    exceptionNames:
      - Error
      - Exception
      - Throwable
      - RuntimeException

naming:
  active: true
  ClassNaming:
    active: true
    classPattern: '[A-Z][a-zA-Z0-9]*'
  ConstructorParameterNaming:
    active: true
    parameterPattern: '[a-z][A-Za-z0-9]*'
  EnumNaming:
    active: true
    enumEntryPattern: '[A-Z][_a-zA-Z0-9]*'
  ForbiddenClassName:
    active: false
  FunctionMaxLength:
    active: true
    maximumFunctionNameLength: 40
  FunctionMinLength:
    active: true
    minimumFunctionNameLength: 3
  FunctionNaming:
    active: true
    functionPattern: '[a-z][a-zA-Z0-9]*'
    excludeClassPattern: '$^'
  FunctionParameterNaming:
    active: true
    parameterPattern: '[a-z][A-Za-z0-9]*'
  InvalidPackageDeclaration:
    active: true
  MatchingDeclarationName:
    active: true
    mustBeFirst: true
  MemberNameEqualsClassName:
    active: true
  ObjectPropertyNaming:
    active: true
    constantPattern: '[A-Za-z][_A-Za-z0-9]*'
    propertyPattern: '[A-Za-z][_A-Za-z0-9]*'
  PackageNaming:
    active: true
    packagePattern: '[a-z]+(\.[a-z][A-Za-z0-9]*)*'
  TopLevelPropertyNaming:
    active: true
    constantPattern: '[A-Z][_A-Z0-9]*'
    propertyPattern: '[A-Za-z][_A-Za-z0-9]*'
  VariableMaxLength:
    active: true
    maximumVariableNameLength: 40
  VariableMinLength:
    active: true
    minimumVariableNameLength: 1
  VariableNaming:
    active: true
    variablePattern: '[a-z][A-Za-z0-9]*'

performance:
  active: true
  ArrayPrimitive:
    active: true
  CouldBeSequence:
    active: true
    threshold: 3
  ForEachOnRange:
    active: true
  SpreadOperator:
    active: true
  UnnecessaryPartOfBinaryExpression:
    active: true
  UnnecessaryTemporaryInstantiation:
    active: true

potential-bugs:
  active: true
  CastToNullableType:
    active: true
  Deprecation:
    active: true
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
    active: true
  IgnoredReturnValue:
    active: true
  ImplicitDefaultLocale:
    active: true
  ImplicitUnitReturnType:
    active: true
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
    active: true
  NullableToStringCall:
    active: true
  UnconditionalJumpStatementInLoop:
    active: true
  UnnecessaryNotNullOperator:
    active: true
  UnnecessarySafeCall:
    active: true
  UnreachableCode:
    active: true
  UnsafeCallOnNullableType:
    active: true
  UnsafeCast:
    active: true
  UselessPostfixExpression:
    active: true
  WrongEqualsTypeParameter:
    active: true

style:
  active: true
  BracesOnIfStatements:
    active: true
    singleLine: 'never'
    multiLine: 'always'
  ClassOrdering:
    active: true
  CollapsibleIfStatements:
    active: true
  DataClassContainsFunctions:
    active: false
  DataClassShouldBeImmutable:
    active: true
  DestructuringDeclarationWithTooManyEntries:
    active: true
    maxDestructuringEntries: 3
  EqualsNullCall:
    active: true
  EqualsOnSignatureLine:
    active: true
  ExplicitCollectionElementAccessMethod:
    active: true
  ExplicitItLambdaParameter:
    active: true
  ExpressionBodySyntax:
    active: true
    includeLineWrapping: false
  ForbiddenComment:
    active: true
    values:
      - 'FIXME:'
      - 'STOPSHIP:'
      - 'TODO:'
  ForbiddenVoid:
    active: true
  FunctionOnlyReturningConstant:
    active: true
  LoopWithTooManyJumpStatements:
    active: true
    maxJumpCount: 1
  MagicNumber:
    active: true
    ignoreNumbers:
      - '-1'
      - '0'
      - '1'
      - '2'
    ignoreHashCodeFunction: true
    ignorePropertyDeclaration: true
    ignoreAnnotation: true
    ignoreEnums: true
    ignoreRanges: true
  MandatoryBracesLoops:
    active: true
  MaxLineLength:
    active: true
    maxLineLength: 120
    excludeCommentStatements: true
  MayBeConst:
    active: true
  ModifierOrder:
    active: true
  MultilineLambdaItParameter:
    active: true
  NestedClassesVisibility:
    active: true
  NewLineAtEndOfFile:
    active: true
  NoTabs:
    active: true
  NullableBooleanCheck:
    active: true
  ObjectLiteralToLambda:
    active: true
  OptionalAbstractKeyword:
    active: true
  OptionalUnit:
    active: true
  PreferToOverPairSyntax:
    active: true
  ProtectedMemberInFinalClass:
    active: true
  RedundantExplicitType:
    active: true
  RedundantHigherOrderMapUsage:
    active: true
  RedundantVisibilityModifierRule:
    active: true
  ReturnCount:
    active: true
    max: 3
    excludedFunctions:
      - 'equals'
    excludeLabeled: false
    excludeReturnFromLambda: true
    excludeGuardClauses: true
  SafeCast:
    active: true
  SerialVersionUIDInSerializableClass:
    active: true
  SpacingBetweenPackageAndImports:
    active: true
  ThrowsCount:
    active: true
    max: 2
  TrailingWhitespace:
    active: true
  UnderscoresInNumericLiterals:
    active: true
    acceptableLength: 5
  UnnecessaryAbstractClass:
    active: true
  UnnecessaryAnnotationUseSiteTarget:
    active: true
  UnnecessaryApply:
    active: true
  UnnecessaryFilter:
    active: true
  UnnecessaryInheritance:
    active: true
  UnnecessaryInnerClass:
    active: true
  UnnecessaryLet:
    active: true
  UnnecessaryParentheses:
    active: true
  UntilInsteadOfRangeTo:
    active: true
  UnusedImports:
    active: true
  UnusedPrivateClass:
    active: true
  UnusedPrivateMember:
    active: true
  UnusedPrivateProperty:
    active: true
  UseArrayLiteralsInAnnotations:
    active: true
  UseCheckNotNull:
    active: true
  UseCheckOrError:
    active: true
  UseDataClass:
    active: true
  UseEmptyCounterpart:
    active: true
  UseIfEmptyOrIfBlank:
    active: true
  UseIfInsteadOfWhen:
    active: true
    ignoreWhenContainingVariableDeclaration: true
  UseIsNullOrEmpty:
    active: true
  UseOrEmpty:
    active: true
  UseRequire:
    active: true
  UseRequireNotNull:
    active: true
  UseSumOfInsteadOfFlatMapSize:
    active: true
  UselessCallOnNotNull:
    active: true
  VarCouldBeVal:
    active: true
  WildcardImport:
    active: true
```

## ktlint Configuration (`.editorconfig`)

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_size = 4
indent_style = space
insert_final_newline = true
max_line_length = 120
tab_width = 4
trim_trailing_whitespace = true

[*.{kt,kts}]
ktlint_code_style = ktlint_official
ktlint_standard = enabled

# Standard rules
ktlint_standard_annotation = enabled
ktlint_standard_argument-list-wrapping = enabled
ktlint_standard_blank-line-before-declaration = enabled
ktlint_standard_chain-wrapping = enabled
ktlint_standard_class-signature = enabled
ktlint_standard_colon-spacing = enabled
ktlint_standard_comma-spacing = enabled
ktlint_standard_comment-spacing = enabled
ktlint_standard_curly-spacing = enabled
ktlint_standard_dot-spacing = enabled
ktlint_standard_enum-entry-name-case = enabled
ktlint_standard_enum-wrapping = enabled
ktlint_standard_filename = enabled
ktlint_standard_final-newline = enabled
ktlint_standard_function-expression-body = enabled
ktlint_standard_function-literal = enabled
ktlint_standard_function-naming = enabled
ktlint_standard_function-signature = enabled
ktlint_standard_function-start-of-body-spacing = enabled
ktlint_standard_function-type-reference-spacing = enabled
ktlint_standard_if-else-bracing = enabled
ktlint_standard_if-else-wrapping = enabled
ktlint_standard_import-ordering = enabled
ktlint_standard_indent = enabled
ktlint_standard_kdoc = enabled
ktlint_standard_kdoc-wrapping = enabled
ktlint_standard_keyword-spacing = enabled
ktlint_standard_max-line-length = enabled
ktlint_standard_modifier-list-spacing = enabled
ktlint_standard_modifier-order = enabled
ktlint_standard_multiline-expression-wrapping = enabled
ktlint_standard_multiline-loop = enabled
ktlint_standard_no-blank-line-before-rbrace = enabled
ktlint_standard_no-blank-line-in-list = enabled
ktlint_standard_no-blank-lines-in-chained-method-calls = enabled
ktlint_standard_no-consecutive-blank-lines = enabled
ktlint_standard_no-consecutive-comments = enabled
ktlint_standard_no-empty-class-body = enabled
ktlint_standard_no-empty-file = enabled
ktlint_standard_no-empty-first-line-in-class-body = enabled
ktlint_standard_no-empty-first-line-in-method-block = enabled
ktlint_standard_no-line-break-after-else = enabled
ktlint_standard_no-line-break-before-assignment = enabled
ktlint_standard_no-multi-spaces = enabled
ktlint_standard_no-semi = enabled
ktlint_standard_no-single-line-block-comment = enabled
ktlint_standard_no-trailing-spaces = enabled
ktlint_standard_no-unit-return = enabled
ktlint_standard_no-unused-imports = enabled
ktlint_standard_no-wildcard-imports = enabled
ktlint_standard_nullable-type-spacing = enabled
ktlint_standard_op-spacing = enabled
ktlint_standard_package-name = enabled
ktlint_standard_parameter-list-spacing = enabled
ktlint_standard_parameter-list-wrapping = enabled
ktlint_standard_parameter-wrapping = enabled
ktlint_standard_paren-spacing = enabled
ktlint_standard_property-naming = enabled
ktlint_standard_property-wrapping = enabled
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
ktlint_standard_spacing-between-declarations-with-annotations = enabled
ktlint_standard_spacing-between-declarations-with-comments = enabled
ktlint_standard_spacing-between-function-name-and-opening-parenthesis = enabled
ktlint_standard_statement-wrapping = enabled
ktlint_standard_string-template = enabled
ktlint_standard_string-template-indent = enabled
ktlint_standard_trailing-comma-on-call-site = enabled
ktlint_standard_trailing-comma-on-declaration-site = enabled
ktlint_standard_try-catch-finally-spacing = enabled
ktlint_standard_type-argument-list-spacing = enabled
ktlint_standard_type-parameter-list-spacing = enabled
ktlint_standard_unnecessary-parentheses-before-trailing-lambda = enabled
ktlint_standard_value-argument-comment = enabled
ktlint_standard_value-parameter-comment = enabled
ktlint_standard_wrapping = enabled

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
}

ktlint {
    version.set("1.1.1")
    android.set(false)
    outputToConsole.set(true)
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
                    minValue = 80
                    metric = kotlinx.kover.gradle.plugin.dsl.MetricType.LINE
                }
                bound {
                    minValue = 80
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

tasks.check {
    dependsOn(tasks.named("ktlintCheck"))
    dependsOn(tasks.named("detekt"))
}
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Branches | 80% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 10 |
| Method length | 50 lines |
| File length | 400 lines |
| Parameters | 4 (functions), 5 (constructors) |
| Nesting depth | 4 |
| Max functions per file | 15 |

## Commands

```bash
# Run detekt
./gradlew detekt

# Run ktlint check
./gradlew ktlintCheck

# Auto-format with ktlint
./gradlew ktlintFormat

# Run tests with coverage
./gradlew test koverVerify

# Run all quality checks
./gradlew check

# Generate coverage report
./gradlew koverHtmlReport
```
