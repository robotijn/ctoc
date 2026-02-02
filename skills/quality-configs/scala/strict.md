# Scala Strict Quality Config

Strict mode configuration for Scala 3 projects with scalafmt, scalafix, and ScalaTest.

## Mode: Strict

- Coverage: 80% minimum
- Complexity: Standard limits
- Warnings: Treated as errors
- Scala 3.4+ best practices

## Scalafmt Config (`.scalafmt.conf`)

```hocon
version = "3.8.3"
runner.dialect = scala3

# Line width and indentation
maxColumn = 100
indent.main = 2
indent.defnSite = 2
indent.callSite = 2
indent.ctrlSite = 2
indent.caseSite = 2

# Alignment
align.preset = more
align.tokens.add = [
  {code = "=>", owner = "Case"}
  {code = "=", owner = "(Enumerator.Val|Defn.(Va(l|r)|Def|Type|GivenAlias))"}
  {code = "<-", owner = "Enumerator.Generator"}
]

# Newlines
newlines.source = keep
newlines.topLevelStatementBlankLines = [
  {blanks = 1}
]
newlines.beforeMultiline = fold
newlines.alwaysBeforeElseAfterCurlyIf = false
newlines.implicitParamListModifierForce = [before]

# Rewrite rules for Scala 3
rewrite.rules = [
  RedundantBraces
  RedundantParens
  SortModifiers
  PreferCurlyFors
  Imports
]
rewrite.redundantBraces.stringInterpolation = true
rewrite.imports.sort = scalastyle
rewrite.imports.groups = [
  ["javax?\\..*"]
  ["scala\\..*"]
  [".*"]
]
rewrite.scala3.convertToNewSyntax = true
rewrite.scala3.removeOptionalBraces = yes

# Docstrings
docstrings.style = Asterisk
docstrings.wrap = yes
docstrings.oneline = fold

# Spaces
spaces.inImportCurlyBraces = true
spaces.inParentheses = false

# Trailing commas
trailingCommas = multiple

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

  # Semantic rules (requires semanticdb)
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
}

RemoveUnused {
  imports = true
  privates = true
  locals = true
  patternvars = true
}

DisableSyntax {
  noVars = false  # Allow vars in strict mode (error in strictest)
  noThrows = false
  noNulls = true
  noReturns = true
  noWhileLoops = false
  noXml = true
  noFinalVal = true
  noFinalize = true
  noValPatterns = false
  regex = []
}
```

## Build Configuration (`build.sbt`)

```scala
lazy val root = (project in file("."))
  .settings(
    name := "my-project",
    scalaVersion := "3.4.2",

    // Strict compiler options
    scalacOptions ++= Seq(
      "-deprecation",
      "-feature",
      "-unchecked",
      "-Wunused:all",
      "-Wvalue-discard",
      "-Xfatal-warnings",  // Treat warnings as errors
      "-Xkind-projector:underscores",
      "-source:future",
      "-language:strictEquality",
      "-explain",
      "-explain-types",
    ),

    // Test settings
    Test / parallelExecution := true,
    Test / fork := true,

    // Scalafix
    semanticdbEnabled := true,
    semanticdbVersion := scalafixSemanticdb.revision,

    // Coverage settings
    coverageMinimumStmtTotal := 80,
    coverageMinimumBranchTotal := 80,
    coverageFailOnMinimum := true,
    coverageExcludedPackages := "<empty>;.*\\.generated\\..*",
  )

// Scalafix rules
ThisBuild / scalafixDependencies += "com.github.liancheng" %% "organize-imports" % "0.6.0"

libraryDependencies ++= Seq(
  // Testing
  "org.scalatest" %% "scalatest" % "3.2.18" % Test,
  "org.scalatestplus" %% "scalacheck-1-17" % "3.2.18.0" % Test,
  "org.scalamock" %% "scalamock" % "6.0.0" % Test,
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

// Dependency management
addSbtPlugin("ch.epfl.scala" % "sbt-missinglink" % "0.3.6")

// Complexity analysis
addSbtPlugin("com.github.sbt" % "sbt-cpd" % "2.0.0")
```

## WartRemover Config (Optional Enhanced Linting)

Add to `build.sbt` for additional strict checks:

```scala
// In project/plugins.sbt:
// addSbtPlugin("org.wartremover" % "sbt-wartremover" % "3.1.6")

wartremoverErrors ++= Warts.unsafe
wartremoverExcluded += baseDirectory.value / "src" / "test"
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Statements | 80% |
| Branches | 80% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 10 |
| Function length | 50 lines |
| File length | 400 lines |
| Parameters | 4 |
| Nesting depth | 4 |

## ScalaTest Configuration

Example test with coverage-friendly practices:

```scala
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.prop.TableDrivenPropertyChecks

class MyServiceSpec extends AnyFlatSpec with Matchers with TableDrivenPropertyChecks:

  "MyService" should "process valid input" in {
    val service = MyService()
    val result = service.process("valid")
    result shouldBe Right("processed")
  }

  it should "reject invalid input" in {
    val service = MyService()
    val result = service.process("")
    result shouldBe Left(ValidationError("empty input"))
  }

  it should "handle edge cases" in {
    val cases = Table(
      ("input", "expected"),
      ("a", Right("a")),
      ("ab", Right("ab")),
      (null, Left(ValidationError("null input"))),
    )

    forAll(cases) { (input, expected) =>
      MyService().process(input) shouldBe expected
    }
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

# Run tests
sbt test

# Run tests with coverage
sbt clean coverage test coverageReport

# Check coverage minimums
sbt coverageAggregate

# All quality checks (CI)
sbt scalafmtCheckAll "scalafixAll --check" clean coverage test coverageReport coverageAggregate
```

## CI Integration (GitHub Actions)

```yaml
name: CI
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

      - name: Test with coverage
        run: sbt clean coverage test coverageReport

      - name: Coverage check
        run: sbt coverageAggregate
```
