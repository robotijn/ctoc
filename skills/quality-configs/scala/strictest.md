# Scala Strictest Quality Config

Maximum strictness configuration for Scala 3 projects with all checks enabled.

## Mode: Strictest

- Coverage: 90% minimum
- Complexity: Tight limits
- `-Xfatal-warnings` with all lints enabled
- No vars, no nulls, no returns
- Pure functional style enforced

## Scalafmt Config (`.scalafmt.conf`)

```hocon
version = "3.8.3"
runner.dialect = scala3

# Tight line width
maxColumn = 100
indent.main = 2
indent.defnSite = 2
indent.callSite = 2
indent.ctrlSite = 2
indent.caseSite = 2

# Strict alignment
align.preset = most
align.tokens.add = [
  {code = "=>", owner = "Case"}
  {code = "=", owner = "(Enumerator.Val|Defn.(Va(l|r)|Def|Type|GivenAlias))"}
  {code = "<-", owner = "Enumerator.Generator"}
  {code = "%", owner = "Term.ApplyInfix"}
  {code = "%%", owner = "Term.ApplyInfix"}
]
align.multiline = true

# Newlines
newlines.source = keep
newlines.topLevelStatementBlankLines = [
  {blanks = 1}
]
newlines.beforeMultiline = fold
newlines.alwaysBeforeElseAfterCurlyIf = false
newlines.implicitParamListModifierForce = [before]
newlines.avoidForSimpleOverflow = [punct]

# Aggressive rewrite rules for Scala 3
rewrite.rules = [
  RedundantBraces
  RedundantParens
  SortModifiers
  PreferCurlyFors
  Imports
  AvoidInfix
]
rewrite.redundantBraces.stringInterpolation = true
rewrite.redundantBraces.ifElseExpressions = true
rewrite.redundantBraces.parensForOneLineApply = true
rewrite.imports.sort = scalastyle
rewrite.imports.groups = [
  ["javax?\\..*"]
  ["scala\\..*"]
  [".*"]
]
rewrite.scala3.convertToNewSyntax = true
rewrite.scala3.removeOptionalBraces = yes
rewrite.scala3.insertEndMarkerMinLines = 15
rewrite.sortModifiers.order = [
  "override"
  "private"
  "protected"
  "implicit"
  "final"
  "sealed"
  "abstract"
  "lazy"
  "inline"
  "transparent"
  "infix"
  "opaque"
  "open"
  "given"
]

# Docstrings - require them
docstrings.style = Asterisk
docstrings.wrap = yes
docstrings.oneline = fold
docstrings.blankFirstLine = yes

# Spaces
spaces.inImportCurlyBraces = true
spaces.inParentheses = false

# Trailing commas
trailingCommas = always

# Project
project.git = true
project.excludeFilters = [
  "target/"
]
```

## Scalafix Config (`.scalafix.conf`)

```hocon
rules = [
  # Organizing imports
  OrganizeImports

  # Removing unused code
  RemoveUnused

  # Strict semantic rules
  DisableSyntax
  LeakingImplicitClassVal
  NoValInForComprehension
]

OrganizeImports {
  removeUnused = true
  groupedImports = Merge
  groups = [
    "re:javax?\\."
    "scala."
    "*"
  ]
  importSelectorsOrder = Ascii
  importsOrder = Ascii
  coalesceToWildcardImportThreshold = null  # Never use wildcards
}

RemoveUnused {
  imports = true
  privates = true
  locals = true
  patternvars = true
  params = true  # Also remove unused parameters
}

DisableSyntax {
  # Strictest: Disallow imperative constructs
  noVars = true
  noThrows = true
  noNulls = true
  noReturns = true
  noWhileLoops = true
  noXml = true
  noFinalVal = true
  noFinalize = true
  noValPatterns = true
  noIsInstanceOf = true
  noAsInstanceOf = true
  noDefaultArgs = false  # Allow default args but consider disabling
  regex = [
    {
      id = "println"
      pattern = "println"
      message = "Use proper logging instead of println"
    }
    {
      id = "mutable"
      pattern = "scala\\.collection\\.mutable"
      message = "Avoid mutable collections - use immutable"
    }
  ]
}
```

## Build Configuration (`build.sbt`)

```scala
lazy val root = (project in file("."))
  .settings(
    name := "my-project",
    scalaVersion := "3.4.2",

    // Maximum strictness compiler options
    scalacOptions ++= Seq(
      // Standard warnings
      "-deprecation",
      "-feature",
      "-unchecked",

      // Fatal warnings - ALL warnings are errors
      "-Xfatal-warnings",

      // Unused warnings
      "-Wunused:all",

      // Value discards
      "-Wvalue-discard",

      // Safe initialization
      "-Ysafe-init",

      // Scala 3 specific
      "-source:future",
      "-language:strictEquality",
      "-Xkind-projector:underscores",

      // Detailed error messages
      "-explain",
      "-explain-types",

      // Additional strictness
      "-Yexplicit-nulls",  // Null safety
      "-Yrequire-targetName",  // Require @targetName for operators

      // Check exhaustive pattern matching
      "-Wconf:cat=unchecked:error",
    ),

    // Test settings
    Test / parallelExecution := true,
    Test / fork := true,

    // Scalafix
    semanticdbEnabled := true,
    semanticdbVersion := scalafixSemanticdb.revision,

    // Coverage settings - maximum thresholds
    coverageMinimumStmtTotal := 90,
    coverageMinimumBranchTotal := 90,
    coverageFailOnMinimum := true,
    coverageExcludedPackages := "<empty>;.*\\.generated\\..*",

    // Additional strict settings
    Compile / compile / wartremoverErrors ++= Warts.allBut(
      Wart.Nothing,
      Wart.Overloading,
      Wart.ToString,
      Wart.Equals,
    ),
    Test / compile / wartremoverErrors := Seq.empty,
  )

// Scalafix rules
ThisBuild / scalafixDependencies ++= Seq(
  "com.github.liancheng" %% "organize-imports" % "0.6.0",
)

libraryDependencies ++= Seq(
  // Testing
  "org.scalatest" %% "scalatest" % "3.2.18" % Test,
  "org.scalatestplus" %% "scalacheck-1-17" % "3.2.18.0" % Test,
  "org.scalamock" %% "scalamock" % "6.0.0" % Test,

  // Consider adding for pure FP
  "org.typelevel" %% "cats-core" % "2.10.0",
  "org.typelevel" %% "cats-effect" % "3.5.4",
)
```

## Plugin Configuration (`project/plugins.sbt`)

```scala
// Code formatting
addSbtPlugin("org.scalameta" % "sbt-scalafmt" % "2.5.2")

// Linting and refactoring
addSbtPlugin("ch.epfl.scala" % "sbt-scalafix" % "0.12.1")

// Code coverage
addSbtPlugin("org.scoverage" % "sbt-scoverage" % "2.1.0")

// WartRemover - additional linting
addSbtPlugin("org.wartremover" % "sbt-wartremover" % "3.1.6")

// Dependency management
addSbtPlugin("ch.epfl.scala" % "sbt-missinglink" % "0.3.6")

// Complexity analysis
addSbtPlugin("com.github.sbt" % "sbt-cpd" % "2.0.0")

// Mutation testing (optional, for highest quality)
addSbtPlugin("io.stryker-mutator" % "sbt-stryker4s" % "0.15.2")
```

## WartRemover Errors (Maximum Strictness)

```scala
// All enabled warts for strictest mode
Warts.all contains:
  - Any, AnyVal, AsInstanceOf, DefaultArguments
  - Equals, ExplicitImplicitTypes, FinalCaseClass
  - FinalVal, ImplicitConversion, ImplicitParameter
  - IsInstanceOf, JavaConversions, JavaSerializable
  - LeakingSealed, MutableDataStructures, NonUnitStatements
  - Nothing, Null, Option2Iterable, OptionPartial
  - Overloading, Product, PublicInference, Recursion
  - Return, Serializable, StringPlusAny, Throw
  - ToString, TraversableOps, TryPartial, Var, While
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Statements | 90% |
| Branches | 90% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 7 |
| Function length | 30 lines |
| File length | 300 lines |
| Parameters | 3 |
| Nesting depth | 3 |

## ScalaTest Configuration (Property-Based)

```scala
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.scalacheck.ScalaCheckPropertyChecks
import org.scalacheck.Gen

class MyServiceSpec extends AnyFlatSpec
    with Matchers
    with ScalaCheckPropertyChecks:

  // Strictest: use property-based testing
  "MyService" should "satisfy laws for all valid inputs" in {
    forAll(Gen.alphaNumStr.suchThat(_.nonEmpty)) { input =>
      val result = MyService().process(input)
      result.isRight shouldBe true
    }
  }

  it should "be referentially transparent" in {
    val service = MyService()
    forAll { (input: String) =>
      whenever(input.nonEmpty) {
        val result1 = service.process(input)
        val result2 = service.process(input)
        result1 shouldBe result2  // Same input = same output
      }
    }
  }

  it should "compose correctly" in {
    forAll(Gen.alphaNumStr) { input =>
      val composed = MyService().process(input).flatMap(MyService().validate)
      val direct = MyService().processAndValidate(input)
      composed shouldBe direct
    }
  }
```

## Pure FP Example (Recommended Pattern)

```scala
import cats.effect.{IO, IOApp}
import cats.syntax.all.*

// Strictest: use effect types, no exceptions
object MyApp extends IOApp.Simple:

  def program: IO[Unit] =
    for
      config <- loadConfig
      _      <- validateConfig(config)
      result <- processData(config)
      _      <- IO.println(s"Result: $result")
    yield ()

  def run: IO[Unit] =
    program.handleErrorWith { error =>
      IO.println(s"Failed: ${error.getMessage}")
    }
```

## Commands

```bash
# Format code
sbt scalafmtAll

# Check formatting (CI)
sbt scalafmtCheckAll

# Run scalafix rules
sbt "scalafixAll"

# Check scalafix (CI)
sbt "scalafixAll --check"

# Run WartRemover
sbt compile  # Warts are checked during compilation

# Run tests
sbt test

# Run tests with coverage
sbt clean coverage test coverageReport

# Check coverage minimums
sbt coverageAggregate

# Mutation testing (optional)
sbt stryker

# All quality checks (CI)
sbt scalafmtCheckAll "scalafixAll --check" clean coverage test coverageReport coverageAggregate
```

## CI Integration (GitHub Actions)

```yaml
name: CI Strictest
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: 'sbt'

      - name: Check formatting
        run: sbt scalafmtCheckAll

      - name: Check scalafix
        run: sbt "scalafixAll --check"

      - name: Compile with strict warnings
        run: sbt compile

      - name: Test with coverage
        run: sbt clean coverage test coverageReport

      - name: Coverage check (90%)
        run: sbt coverageAggregate

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: target/scala-3.4.2/scoverage-report/scoverage.xml
```

## Non-Negotiables (Strictest Mode)

1. **No `var`** - All state must be immutable
2. **No `null`** - Use `Option` or explicit null types
3. **No `throw`** - Use `Either`, `Try`, or effect types
4. **No `return`** - Expression-oriented style only
5. **No `while` loops** - Use recursion or higher-order functions
6. **No `isInstanceOf`/`asInstanceOf`** - Use pattern matching
7. **No mutable collections** - Immutable only
8. **No `println`** - Use proper logging
9. **90% coverage minimum** - No exceptions
10. **All warnings are errors** - Zero tolerance
