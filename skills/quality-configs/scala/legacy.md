# Scala Legacy Quality Config

Gradual adoption configuration for migrating existing Scala projects to Scala 3.

## Mode: Legacy

- Coverage: 50% minimum (baseline)
- Complexity: Relaxed limits
- Warnings allowed (not errors)
- Gradual strictness adoption
- Migration path from Scala 2 to Scala 3

## Scalafmt Config (`.scalafmt.conf`)

```hocon
version = "3.8.3"
runner.dialect = scala3

# Relaxed line width
maxColumn = 120
indent.main = 2
indent.defnSite = 2
indent.callSite = 2

# Minimal alignment
align.preset = some
align.tokens = []

# Keep existing newline style
newlines.source = keep
newlines.topLevelStatementBlankLines = []

# Conservative rewrites (don't break existing code)
rewrite.rules = [
  RedundantParens
  SortModifiers
  Imports
]
rewrite.imports.sort = scalastyle
rewrite.imports.groups = [
  ["javax?\\..*"]
  ["scala\\..*"]
  [".*"]
]
# Don't force Scala 3 syntax on legacy code
rewrite.scala3.convertToNewSyntax = false
rewrite.scala3.removeOptionalBraces = no

# Docstrings
docstrings.style = Asterisk
docstrings.wrap = no

# Spaces
spaces.inImportCurlyBraces = false

# Trailing commas (safer for legacy)
trailingCommas = never

# Project
project.git = true
project.excludeFilters = [
  "target/"
]
```

## Scalafix Config (`.scalafix.conf`)

```hocon
rules = [
  # Only organize imports - safe for legacy
  OrganizeImports

  # Don't auto-remove unused - manual review needed for legacy
  # RemoveUnused  # Enable after review

  # Minimal syntax checks
  DisableSyntax
]

OrganizeImports {
  removeUnused = false  # Don't remove unused in legacy mode
  groupedImports = Keep
  groups = [
    "re:javax?\\."
    "scala."
    "*"
  ]
  importSelectorsOrder = Keep
  importsOrder = Keep
}

DisableSyntax {
  # Legacy mode: Allow imperative constructs
  noVars = false
  noThrows = false
  noNulls = false
  noReturns = false
  noWhileLoops = false
  noXml = false
  noFinalVal = false
  noFinalize = true  # This is always bad
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

    // Legacy-friendly compiler options
    scalacOptions ++= Seq(
      "-deprecation",
      "-feature",
      "-unchecked",

      // Warnings but NOT fatal (legacy compatibility)
      // "-Xfatal-warnings",  // Enable later

      // Selective unused warnings
      "-Wunused:imports",
      // "-Wunused:all",  // Enable later

      // Migration helpers
      "-source:3.4-migration",  // Migration mode
      "-rewrite",  // Enable automatic rewrites

      // Helpful error messages
      "-explain",
      "-explain-types",
    ),

    // Test settings
    Test / parallelExecution := false,  // Safer for legacy tests
    Test / fork := false,

    // Scalafix (optional in legacy)
    semanticdbEnabled := true,
    semanticdbVersion := scalafixSemanticdb.revision,

    // Coverage settings - baseline thresholds
    coverageMinimumStmtTotal := 50,
    coverageMinimumBranchTotal := 50,
    coverageFailOnMinimum := false,  // Don't fail in legacy mode
    coverageExcludedPackages := "<empty>;.*\\.generated\\..*;.*\\.legacy\\..*",
  )

// Scalafix rules (minimal for legacy)
ThisBuild / scalafixDependencies += "com.github.liancheng" %% "organize-imports" % "0.6.0"

libraryDependencies ++= Seq(
  // Testing
  "org.scalatest" %% "scalatest" % "3.2.18" % Test,
  "org.scalatestplus" %% "scalacheck-1-17" % "3.2.18.0" % Test,

  // Consider for migration
  // "org.scalameta" %% "munit" % "1.0.0" % Test,  // Modern alternative
)
```

## Plugin Configuration (`project/plugins.sbt`)

```scala
// Code formatting
addSbtPlugin("org.scalameta" % "sbt-scalafmt" % "2.5.2")

// Linting (optional for legacy)
addSbtPlugin("ch.epfl.scala" % "sbt-scalafix" % "0.12.1")

// Code coverage
addSbtPlugin("org.scoverage" % "sbt-scoverage" % "2.1.0")

// Migration helper
addSbtPlugin("ch.epfl.scala" % "sbt-scala3-migrate" % "0.6.2")
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Statements | 50% |
| Branches | 50% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 15 |
| Function length | 100 lines |
| File length | 600 lines |
| Parameters | 6 |
| Nesting depth | 6 |

## ScalaTest Configuration (Legacy Style)

```scala
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

// Legacy: FlatSpec style is fine
class MyServiceSpec extends AnyFlatSpec with Matchers {

  "MyService" should "work with basic input" in {
    val service = new MyService()
    val result = service.process("test")
    result should not be null  // Legacy code may use null
    result shouldBe "processed"
  }

  it should "handle existing behavior" in {
    // Legacy tests may be less comprehensive
    val service = new MyService()
    service.process("") should be("") // Preserve existing behavior
  }
}
```

## Migration Path

### Phase 1: Format and Organize (Week 1-2)

```bash
# Format all code
sbt scalafmtAll

# Organize imports
sbt "scalafixAll OrganizeImports"
```

### Phase 2: Enable Basic Warnings (Week 3-4)

```scala
// Add to build.sbt incrementally:
scalacOptions ++= Seq(
  "-Wunused:imports",
  "-Wunused:locals",
)
```

### Phase 3: Add Coverage Baseline (Week 5-6)

```bash
# Run coverage report
sbt clean coverage test coverageReport

# Review uncovered code
# Add tests for critical paths first
```

### Phase 4: Migrate to Scala 3 Syntax (Week 7-8)

```scala
// Enable in .scalafmt.conf:
rewrite.scala3.convertToNewSyntax = true
rewrite.scala3.removeOptionalBraces = yes

// Then run:
sbt scalafmtAll
```

### Phase 5: Enable Fatal Warnings (Week 9-10)

```scala
// In build.sbt:
scalacOptions += "-Xfatal-warnings"
```

### Phase 6: Upgrade to Strict Mode

Once all phases complete:
- Copy configuration from `strict.md`
- Update coverage thresholds: 50% -> 60% -> 70% -> 80%
- Reduce complexity limits gradually

## Commands

```bash
# Format code
sbt scalafmtAll

# Check formatting (CI - warning only)
sbt scalafmtCheckAll || echo "Formatting issues found"

# Run scalafix (imports only)
sbt "scalafixAll OrganizeImports"

# Run tests
sbt test

# Run tests with coverage (report only)
sbt clean coverage test coverageReport

# Check migration status
sbt scala3Migrate
```

## CI Integration (GitHub Actions)

```yaml
name: CI Legacy
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

      - name: Check formatting (warning only)
        run: sbt scalafmtCheckAll || true
        continue-on-error: true

      - name: Compile
        run: sbt compile

      - name: Test
        run: sbt test

      - name: Coverage report
        run: sbt clean coverage test coverageReport
        continue-on-error: true  # Don't fail on low coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: target/scala-3.4.2/scoverage-report/scoverage.xml
        continue-on-error: true
```

## Scala 2 to Scala 3 Migration Helper

For projects migrating from Scala 2:

```scala
// project/plugins.sbt
addSbtPlugin("ch.epfl.scala" % "sbt-scala3-migrate" % "0.6.2")
```

```bash
# Analyze migration readiness
sbt scala3Migrate

# Auto-fix some migration issues
sbt scala3MigrateScalacOptions
sbt scala3MigrateSyntax
```

## Common Legacy Issues and Fixes

| Issue | Legacy Behavior | Migration Path |
|-------|----------------|----------------|
| `null` usage | Allowed | Replace with `Option` over time |
| `var` usage | Allowed | Replace with `val` when safe |
| Procedure syntax | `def foo() { }` | `def foo(): Unit = { }` |
| Wildcard imports | `import foo._` | `import foo.*` |
| Type lambdas | `({type L[A] = ...})#L` | `[A] =>> ...` |

## Quality Improvement Roadmap

```
Month 1: Format + Basic CI
├── scalafmt everywhere
├── Basic test suite running
└── Coverage reporting enabled

Month 2: Warnings + Tests
├── Enable non-fatal warnings
├── Add missing tests (60% target)
└── Fix obvious issues

Month 3: Strict Mode Prep
├── Fix all warnings
├── 70% coverage
└── Enable fatal warnings

Month 4+: Full Strict Mode
├── Switch to strict.md config
├── 80% coverage
└── All quality checks passing
```
