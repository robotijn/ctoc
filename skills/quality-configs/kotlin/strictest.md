# Kotlin Strictest Quality Config

Maximum strictness for Kotlin projects using detekt and ktlint.

## Mode: Strictest

- Coverage: 90% minimum
- All checks enabled
- Tight complexity limits
- All warnings as errors

## detekt Additions (`detekt.yml`)

```yaml
build:
  maxIssues: 0
  excludeCorrectable: false
  weights:
    complexity: 3
    style: 2
    potential-bugs: 3

config:
  validation: true
  warningsAsErrors: true

complexity:
  active: true
  CyclomaticComplexMethod:
    active: true
    threshold: 7
  LongMethod:
    active: true
    threshold: 30
  LongParameterList:
    active: true
    functionThreshold: 3
    constructorThreshold: 4
  NestedBlockDepth:
    active: true
    threshold: 3
  TooManyFunctions:
    active: true
    thresholdInFiles: 10
    thresholdInClasses: 10
    thresholdInInterfaces: 8
    thresholdInObjects: 8
    thresholdInEnums: 8
  LargeClass:
    active: true
    threshold: 300
  ComplexCondition:
    active: true
    threshold: 3
  ComplexInterface:
    active: true
    threshold: 10
    includeStaticDeclarations: false
    includePrivateDeclarations: false
  CognitiveComplexMethod:
    active: true
    threshold: 15
  LabeledExpression:
    active: true
  MethodOverloading:
    active: true
    threshold: 6
  NamedArguments:
    active: true
    threshold: 3
  ReplaceSafeCallChainWithRun:
    active: true
  StringLiteralDuplication:
    active: true
    threshold: 2

coroutines:
  active: true
  GlobalCoroutineUsage:
    active: true
  InjectDispatcher:
    active: true
  RedundantSuspendModifier:
    active: true
  SleepInsteadOfDelay:
    active: true
  SuspendFunSwallowedCancellation:
    active: true
  SuspendFunWithCoroutineScopeReceiver:
    active: true
  SuspendFunWithFlowReturnType:
    active: true

empty-blocks:
  active: true
  EmptyCatchBlock:
    active: true
    allowedExceptionNameRegex: '_|(ignore|expected).*'
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
    ignoreOverridden: false
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
  ObjectExtendsThrowable:
    active: true
  PrintStackTrace:
    active: true
  RethrowCaughtException:
    active: true
  ReturnFromFinally:
    active: true
  SwallowedException:
    active: true
    ignoredExceptionTypes:
      - InterruptedException
      - MalformedURLException
      - NumberFormatException
      - ParseException
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
    allowedExceptionNameRegex: '_|(ignore|expected).*'
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
  BooleanPropertyNaming:
    active: true
    allowedPattern: '^(is|has|are|can|should|may|will)'
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
    active: true
    forbiddenName:
      - 'Impl'
      - 'Helper'
      - 'Util'
      - 'Utility'
      - 'Manager'
  FunctionMaxLength:
    active: true
    maximumFunctionNameLength: 35
  FunctionMinLength:
    active: true
    minimumFunctionNameLength: 3
  FunctionNaming:
    active: true
    functionPattern: '([a-z][a-zA-Z0-9]*)|(`.*`)'
    excludeClassPattern: '$^'
  FunctionParameterNaming:
    active: true
    parameterPattern: '[a-z][A-Za-z0-9]*'
  InvalidPackageDeclaration:
    active: true
    rootPackage: ''
  LambdaParameterNaming:
    active: true
    parameterPattern: '[a-z][A-Za-z0-9]*|_'
  MatchingDeclarationName:
    active: true
    mustBeFirst: true
  MemberNameEqualsClassName:
    active: true
  NoNameShadowing:
    active: true
  NonBooleanPropertyPrefixedWithIs:
    active: true
  ObjectPropertyNaming:
    active: true
    constantPattern: '[A-Z][_A-Z0-9]*'
    propertyPattern: '[A-Za-z][_A-Za-z0-9]*'
  PackageNaming:
    active: true
    packagePattern: '[a-z]+(\.[a-z][a-z0-9]*)*'
  TopLevelPropertyNaming:
    active: true
    constantPattern: '[A-Z][_A-Z0-9]*'
    propertyPattern: '[A-Za-z][_A-Za-z0-9]*'
  VariableMaxLength:
    active: true
    maximumVariableNameLength: 30
  VariableMinLength:
    active: true
    minimumVariableNameLength: 2
  VariableNaming:
    active: true
    variablePattern: '[a-z][A-Za-z0-9]*'

performance:
  active: true
  ArrayPrimitive:
    active: true
  CouldBeSequence:
    active: true
    threshold: 2
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
  AvoidReferentialEquality:
    active: true
  CastToNullableType:
    active: true
  Deprecation:
    active: true
  DontDowncastCollectionTypes:
    active: true
  DoubleMutabilityForCollection:
    active: true
  ElseCaseInsteadOfExhaustiveWhen:
    active: true
  EqualsAlwaysReturnsTrueOrFalse:
    active: true
  EqualsWithHashCodeExist:
    active: true
  ExitOutsideMain:
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
    active: true
    ignoreOnClassesPattern: ''
  MapGetWithNotNullAssertionOperator:
    active: true
  MissingPackageDeclaration:
    active: true
  NullCheckOnMutableProperty:
    active: true
  NullableToStringCall:
    active: true
  PropertyUsedBeforeDeclaration:
    active: true
  UnconditionalJumpStatementInLoop:
    active: true
  UnnecessaryNotNullCheck:
    active: true
  UnnecessaryNotNullOperator:
    active: true
  UnnecessarySafeCall:
    active: true
  UnreachableCatchBlock:
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
  AlsoCouldBeApply:
    active: true
  BracesOnIfStatements:
    active: true
    singleLine: 'consistent'
    multiLine: 'always'
  BracesOnWhenStatements:
    active: true
    singleLine: 'necessary'
    multiLine: 'consistent'
  CanBeNonNullable:
    active: true
  CascadingCallWrapping:
    active: true
    includeElvis: true
  ClassOrdering:
    active: true
  CollapsibleIfStatements:
    active: true
  DataClassContainsFunctions:
    active: true
    conversionFunctionPrefix:
      - 'to'
  DataClassShouldBeImmutable:
    active: true
  DestructuringDeclarationWithTooManyEntries:
    active: true
    maxDestructuringEntries: 3
  DoubleNegativeLambda:
    active: true
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
    includeLineWrapping: true
  ForbiddenAnnotation:
    active: true
    annotations:
      - reason: 'Use @Suppress instead'
        value: 'java.lang.SuppressWarnings'
  ForbiddenComment:
    active: true
    values:
      - 'FIXME:'
      - 'STOPSHIP:'
      - 'TODO:'
      - 'HACK:'
      - 'XXX:'
    allowedPatterns: ''
  ForbiddenImport:
    active: true
    imports:
      - 'java.util.stream.*'
    forbiddenPatterns: ''
  ForbiddenMethodCall:
    active: true
    methods:
      - reason: 'Use Kotlin println instead'
        value: 'java.io.PrintStream.println'
      - reason: 'Use structured logging'
        value: 'kotlin.io.println'
  ForbiddenSuppress:
    active: true
    rules: []
  ForbiddenVoid:
    active: true
    ignoreOverridden: false
    ignoreUsageInGenerics: false
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
    ignoreHashCodeFunction: true
    ignorePropertyDeclaration: false
    ignoreAnnotation: true
    ignoreEnums: false
    ignoreRanges: false
  MandatoryBracesLoops:
    active: true
  MaxChainedCallsOnSameLine:
    active: true
    maxChainedCalls: 5
  MaxLineLength:
    active: true
    maxLineLength: 120
    excludeCommentStatements: false
  MayBeConst:
    active: true
  ModifierOrder:
    active: true
  MultilineLambdaItParameter:
    active: true
  MultilineRawStringIndentation:
    active: true
    indentSize: 4
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
  OptionalWhenBraces:
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
    max: 2
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
  StringShouldBeRawString:
    active: true
    maxEscapedCharacterCount: 2
    ignoredCharacters: []
  ThrowsCount:
    active: true
    max: 2
    excludeGuardClauses: true
  TrailingWhitespace:
    active: true
  TrimMultilineRawString:
    active: true
    trimmingMethods:
      - 'trimIndent'
      - 'trimMargin'
  UnderscoresInNumericLiterals:
    active: true
    acceptableLength: 4
  UnnecessaryAbstractClass:
    active: true
  UnnecessaryAnnotationUseSiteTarget:
    active: true
  UnnecessaryApply:
    active: true
  UnnecessaryBackticks:
    active: true
  UnnecessaryBracesAroundTrailingLambda:
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
  UnusedParameter:
    active: true
  UnusedPrivateClass:
    active: true
  UnusedPrivateMember:
    active: true
  UnusedPrivateProperty:
    active: true
  UseAnyOrNoneInsteadOfFind:
    active: true
  UseArrayLiteralsInAnnotations:
    active: true
  UseCheckNotNull:
    active: true
  UseCheckOrError:
    active: true
  UseDataClass:
    active: true
    allowVars: false
  UseEmptyCounterpart:
    active: true
  UseIfEmptyOrIfBlank:
    active: true
  UseIfInsteadOfWhen:
    active: true
    ignoreWhenContainingVariableDeclaration: false
  UseIsNullOrEmpty:
    active: true
  UseLet:
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
    excludeImports:
      - 'java.util.*'
```

## ktlint Strictest Configuration (`.editorconfig`)

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
ktlint_experimental = enabled

# All standard rules enabled
ktlint_standard_annotation = enabled
ktlint_standard_annotation-spacing = enabled
ktlint_standard_argument-list-wrapping = enabled
ktlint_standard_blank-line-before-declaration = enabled
ktlint_standard_block-comment-initial-star-alignment = enabled
ktlint_standard_chain-wrapping = enabled
ktlint_standard_class-naming = enabled
ktlint_standard_class-signature = enabled
ktlint_standard_colon-spacing = enabled
ktlint_standard_comma-spacing = enabled
ktlint_standard_comment-spacing = enabled
ktlint_standard_comment-wrapping = enabled
ktlint_standard_context-receiver-wrapping = enabled
ktlint_standard_curly-spacing = enabled
ktlint_standard_discouraged-comment-location = enabled
ktlint_standard_dot-spacing = enabled
ktlint_standard_double-colon-spacing = enabled
ktlint_standard_enum-entry-name-case = enabled
ktlint_standard_enum-wrapping = enabled
ktlint_standard_filename = enabled
ktlint_standard_final-newline = enabled
ktlint_standard_fun-keyword-spacing = enabled
ktlint_standard_function-expression-body = enabled
ktlint_standard_function-literal = enabled
ktlint_standard_function-naming = enabled
ktlint_standard_function-return-type-spacing = enabled
ktlint_standard_function-signature = enabled
ktlint_standard_function-start-of-body-spacing = enabled
ktlint_standard_function-type-modifier-spacing = enabled
ktlint_standard_function-type-reference-spacing = enabled
ktlint_standard_if-else-bracing = enabled
ktlint_standard_if-else-wrapping = enabled
ktlint_standard_import-ordering = enabled
ktlint_standard_indent = enabled
ktlint_standard_kdoc = enabled
ktlint_standard_kdoc-wrapping = enabled
ktlint_standard_keyword-spacing = enabled
ktlint_standard_max-line-length = enabled
ktlint_standard_mixed-condition-operators = enabled
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
ktlint_standard_when-entry-bracing = enabled
ktlint_standard_wrapping = enabled

# Experimental rules (enabled for strictest)
ktlint_experimental_blank-line-between-when-conditions = enabled
ktlint_experimental_class-signature = enabled
ktlint_experimental_condition-wrapping = enabled
ktlint_experimental_function-signature = enabled
ktlint_experimental_kdoc-wrapping = enabled
ktlint_experimental_property-wrapping = enabled

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

    // Kotest for property-based testing
    testImplementation("io.kotest:kotest-runner-junit5:5.8.0")
    testImplementation("io.kotest:kotest-assertions-core:5.8.0")
    testImplementation("io.kotest:kotest-property:5.8.0")
}

kotlin {
    jvmToolchain(17)
    compilerOptions {
        allWarningsAsErrors.set(true)
        freeCompilerArgs.add("-Xjsr305=strict")
    }
}

detekt {
    buildUponDefaultConfig = true
    config.setFrom(files("detekt.yml"))
    parallel = true
    allRules = true
}

ktlint {
    version.set("1.1.1")
    android.set(false)
    outputToConsole.set(true)
    ignoreFailures.set(false)
    enableExperimentalRules.set(true)
    reporters {
        reporter(ReporterType.CHECKSTYLE)
        reporter(ReporterType.HTML)
        reporter(ReporterType.SARIF)
    }
}

kover {
    reports {
        verify {
            rule {
                bound {
                    minValue = 90
                    metric = kotlinx.kover.gradle.plugin.dsl.MetricType.LINE
                }
                bound {
                    minValue = 90
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
        txt.required.set(true)
        sarif.required.set(true)
        md.required.set(true)
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
| Lines | 90% |
| Branches | 90% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 7 |
| Cognitive | 15 |
| Method length | 30 lines |
| File length | 300 lines |
| Parameters | 3 (functions), 4 (constructors) |
| Nesting depth | 3 |
| Max functions per file | 10 |
| Max return statements | 2 |
| Max chained calls | 5 |

## Compiler Flags

```kotlin
kotlin {
    compilerOptions {
        allWarningsAsErrors.set(true)
        freeCompilerArgs.addAll(
            "-Xjsr305=strict",
            "-Xexplicit-api=strict"
        )
    }
}
```

## Commands

```bash
# Run detekt with all rules
./gradlew detekt

# Run ktlint with experimental rules
./gradlew ktlintCheck

# Auto-format with ktlint
./gradlew ktlintFormat

# Run tests with coverage
./gradlew test koverVerify

# Run all quality checks
./gradlew check

# Generate all reports
./gradlew koverHtmlReport detekt ktlintCheck
```
