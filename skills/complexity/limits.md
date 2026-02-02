# Complexity Limits
> Thresholds and tool configurations by strictness level and language. Updated February 2026.

## Universal Thresholds

### Three Strictness Levels

| Metric | Strict | Standard | Legacy |
|--------|--------|----------|--------|
| **Cyclomatic Complexity** | <= 7 | <= 10 | <= 15 |
| **Cognitive Complexity** | <= 10 | <= 15 | <= 25 |
| **Function Lines (SLOC)** | <= 30 | <= 50 | <= 100 |
| **File Lines (SLOC)** | <= 300 | <= 400 | <= 600 |
| **Parameter Count** | <= 3 | <= 4 | <= 6 |
| **Nesting Depth** | <= 3 | <= 4 | <= 6 |
| **Maintainability Index** | >= 75 | >= 65 | >= 40 |
| **WMC (Class)** | <= 20 | <= 35 | <= 50 |
| **CBO (Coupling)** | <= 4 | <= 7 | <= 10 |

### When to Use Each Level

| Level | Use Case |
|-------|----------|
| **Strict** | New projects, critical systems, security-sensitive code |
| **Standard** | Most production code, established projects |
| **Legacy** | Existing codebases being gradually improved |

---

## Python Configuration

### Radon (Cyclomatic Complexity)
```bash
# Strict: Block grade C and above (CC > 5)
radon cc src/ --min C --show-complexity --total-average
xenon --max-absolute B --max-modules A --max-average A src/

# Standard: Block grade D and above (CC > 10)
radon cc src/ --min D --show-complexity
xenon --max-absolute C --max-modules B --max-average B src/

# Legacy: Block grade E and above (CC > 20)
radon cc src/ --min E --show-complexity
xenon --max-absolute D --max-modules C --max-average C src/
```

### Radon Grade Reference
| Grade | CC Range | Meaning |
|-------|----------|---------|
| A | 1-5 | Low risk, simple |
| B | 6-10 | Low risk, well-structured |
| C | 11-20 | Moderate risk |
| D | 21-30 | High risk |
| E | 31-40 | Very high risk |
| F | 41+ | Critical |

### Pylint Configuration
```ini
# .pylintrc - Strict
[DESIGN]
max-args=3
max-locals=10
max-returns=3
max-branches=7
max-statements=30
max-parents=5
max-attributes=8
max-bool-expr=3
max-nested-blocks=3
max-line-length=88

# .pylintrc - Standard
[DESIGN]
max-args=4
max-locals=15
max-returns=5
max-branches=10
max-statements=50
max-parents=7
max-attributes=12
max-bool-expr=4
max-nested-blocks=4
max-line-length=100

# .pylintrc - Legacy
[DESIGN]
max-args=6
max-locals=20
max-returns=8
max-branches=15
max-statements=100
max-parents=10
max-attributes=20
max-bool-expr=6
max-nested-blocks=6
max-line-length=120
```

### Ruff Configuration
```toml
# pyproject.toml - Strict
[tool.ruff.lint]
select = ["C901", "PLR0911", "PLR0912", "PLR0913", "PLR0915"]

[tool.ruff.lint.pylint]
max-args = 3
max-branches = 7
max-returns = 3
max-statements = 30

[tool.ruff.lint.mccabe]
max-complexity = 7

# pyproject.toml - Standard
[tool.ruff.lint.pylint]
max-args = 4
max-branches = 10
max-returns = 5
max-statements = 50

[tool.ruff.lint.mccabe]
max-complexity = 10

# pyproject.toml - Legacy
[tool.ruff.lint.pylint]
max-args = 6
max-branches = 15
max-returns = 8
max-statements = 100

[tool.ruff.lint.mccabe]
max-complexity = 15
```

### Flake8 Configuration
```ini
# .flake8 - Strict
[flake8]
max-complexity = 7
max-line-length = 88
max-function-length = 30

# .flake8 - Standard
[flake8]
max-complexity = 10
max-line-length = 100
max-function-length = 50

# .flake8 - Legacy
[flake8]
max-complexity = 15
max-line-length = 120
max-function-length = 100
```

---

## JavaScript/TypeScript Configuration

### ESLint Configuration
```javascript
// .eslintrc.js - Strict
module.exports = {
  rules: {
    'complexity': ['error', { max: 7 }],
    'max-depth': ['error', { max: 3 }],
    'max-lines-per-function': ['error', { max: 30, skipBlankLines: true, skipComments: true }],
    'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    'max-params': ['error', { max: 3 }],
    'max-nested-callbacks': ['error', { max: 3 }],
    'max-statements': ['error', { max: 15 }],
  }
};

// .eslintrc.js - Standard
module.exports = {
  rules: {
    'complexity': ['error', { max: 10 }],
    'max-depth': ['error', { max: 4 }],
    'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
    'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
    'max-params': ['error', { max: 4 }],
    'max-nested-callbacks': ['error', { max: 4 }],
    'max-statements': ['error', { max: 25 }],
  }
};

// .eslintrc.js - Legacy
module.exports = {
  rules: {
    'complexity': ['error', { max: 15 }],
    'max-depth': ['error', { max: 6 }],
    'max-lines-per-function': ['error', { max: 100, skipBlankLines: true, skipComments: true }],
    'max-lines': ['error', { max: 600, skipBlankLines: true, skipComments: true }],
    'max-params': ['error', { max: 6 }],
    'max-nested-callbacks': ['error', { max: 6 }],
    'max-statements': ['error', { max: 50 }],
  }
};
```

### SonarJS Plugin (Cognitive Complexity)
```javascript
// .eslintrc.js
module.exports = {
  plugins: ['sonarjs'],
  rules: {
    // Strict
    'sonarjs/cognitive-complexity': ['error', 10],

    // Standard
    // 'sonarjs/cognitive-complexity': ['error', 15],

    // Legacy
    // 'sonarjs/cognitive-complexity': ['error', 25],
  }
};
```

### TypeScript-Specific (typescript-eslint)
```javascript
// .eslintrc.js
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    // Strict
    '@typescript-eslint/max-params': ['error', { max: 3 }],

    // Standard
    // '@typescript-eslint/max-params': ['error', { max: 4 }],
  }
};
```

---

## Go Configuration

### golangci-lint Configuration
```yaml
# .golangci.yml - Strict
linters-settings:
  gocyclo:
    min-complexity: 7
  gocognit:
    min-complexity: 10
  funlen:
    lines: 30
    statements: 20
  nestif:
    min-complexity: 3
  goconst:
    min-len: 2
    min-occurrences: 2

linters:
  enable:
    - gocyclo
    - gocognit
    - funlen
    - nestif
    - goconst
    - maintidx

# .golangci.yml - Standard
linters-settings:
  gocyclo:
    min-complexity: 10
  gocognit:
    min-complexity: 15
  funlen:
    lines: 50
    statements: 35
  nestif:
    min-complexity: 4

# .golangci.yml - Legacy
linters-settings:
  gocyclo:
    min-complexity: 15
  gocognit:
    min-complexity: 25
  funlen:
    lines: 100
    statements: 60
  nestif:
    min-complexity: 6
```

### Standalone Go Tools
```bash
# Strict
gocyclo -over 7 ./...
gocognit -over 10 ./...

# Standard
gocyclo -over 10 ./...
gocognit -over 15 ./...

# Legacy
gocyclo -over 15 ./...
gocognit -over 25 ./...
```

---

## Java Configuration

### PMD Rules
```xml
<!-- pmd-ruleset.xml - Strict -->
<ruleset name="Strict Complexity">
  <rule ref="category/java/design.xml/CyclomaticComplexity">
    <properties>
      <property name="methodReportLevel" value="7"/>
      <property name="classReportLevel" value="50"/>
    </properties>
  </rule>
  <rule ref="category/java/design.xml/CognitiveComplexity">
    <properties>
      <property name="reportLevel" value="10"/>
    </properties>
  </rule>
  <rule ref="category/java/design.xml/NPathComplexity">
    <properties>
      <property name="reportLevel" value="100"/>
    </properties>
  </rule>
  <rule ref="category/java/design.xml/ExcessiveMethodLength">
    <properties>
      <property name="minimum" value="30"/>
    </properties>
  </rule>
  <rule ref="category/java/design.xml/ExcessiveParameterList">
    <properties>
      <property name="minimum" value="3"/>
    </properties>
  </rule>
  <rule ref="category/java/design.xml/TooManyMethods">
    <properties>
      <property name="maxmethods" value="15"/>
    </properties>
  </rule>
</ruleset>

<!-- pmd-ruleset.xml - Standard -->
<!-- methodReportLevel: 10, reportLevel: 15, minimum: 50/4, maxmethods: 25 -->

<!-- pmd-ruleset.xml - Legacy -->
<!-- methodReportLevel: 15, reportLevel: 25, minimum: 100/6, maxmethods: 40 -->
```

### Checkstyle Configuration
```xml
<!-- checkstyle.xml - Strict -->
<module name="CyclomaticComplexity">
  <property name="max" value="7"/>
</module>
<module name="NPathComplexity">
  <property name="max" value="100"/>
</module>
<module name="JavaNCSS">
  <property name="methodMaximum" value="30"/>
  <property name="classMaximum" value="300"/>
  <property name="fileMaximum" value="400"/>
</module>
<module name="MethodLength">
  <property name="max" value="30"/>
</module>
<module name="ParameterNumber">
  <property name="max" value="3"/>
</module>
<module name="NestedIfDepth">
  <property name="max" value="3"/>
</module>
<module name="NestedTryDepth">
  <property name="max" value="2"/>
</module>
```

---

## C# Configuration

### EditorConfig with Roslyn
```ini
# .editorconfig - Strict
[*.cs]
dotnet_code_quality.CA1502.max_complexity = 7
dotnet_code_quality.CA1505.max_maintainability_index = 75
dotnet_diagnostic.CA1502.severity = error
dotnet_diagnostic.CA1505.severity = error

# Standard: max_complexity = 10, max_maintainability_index = 65
# Legacy: max_complexity = 15, max_maintainability_index = 40
```

### StyleCop Configuration
```json
// stylecop.json - Strict
{
  "settings": {
    "maintainabilityRules": {
      "topLevelMethodLines": 30,
      "topLevelClassLines": 300,
      "maxStatementDepth": 3,
      "maxCyclomaticComplexity": 7
    }
  }
}
```

### .NET Analyzers
```xml
<!-- .csproj -->
<PropertyGroup>
  <!-- Strict -->
  <AnalysisLevel>latest-recommended</AnalysisLevel>
  <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
  <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup>

<ItemGroup>
  <PackageReference Include="Microsoft.CodeAnalysis.NetAnalyzers" Version="8.0.0" />
</ItemGroup>
```

---

## Rust Configuration

### Clippy Lints
```toml
# Cargo.toml or .cargo/config.toml - Strict
[lints.clippy]
cognitive_complexity = { level = "warn", priority = 1 }
too_many_arguments = { level = "warn", priority = 1 }
too_many_lines = { level = "warn", priority = 1 }

# clippy.toml - Strict
cognitive-complexity-threshold = 10
too-many-arguments-threshold = 3
too-many-lines-threshold = 30
type-complexity-threshold = 150

# clippy.toml - Standard
cognitive-complexity-threshold = 15
too-many-arguments-threshold = 4
too-many-lines-threshold = 50
type-complexity-threshold = 250

# clippy.toml - Legacy
cognitive-complexity-threshold = 25
too-many-arguments-threshold = 6
too-many-lines-threshold = 100
type-complexity-threshold = 400
```

### rust-code-analysis
```bash
# Strict
rust-code-analysis --metrics -p . | jq '.[] | select(.cyclomatic > 7)'

# Standard
rust-code-analysis --metrics -p . | jq '.[] | select(.cyclomatic > 10)'
```

---

## Ruby Configuration

### RuboCop
```yaml
# .rubocop.yml - Strict
Metrics/CyclomaticComplexity:
  Max: 7
Metrics/PerceivedComplexity:
  Max: 10
Metrics/MethodLength:
  Max: 30
Metrics/ClassLength:
  Max: 200
Metrics/ParameterLists:
  Max: 3
Metrics/BlockNesting:
  Max: 3
Metrics/AbcSize:
  Max: 15

# .rubocop.yml - Standard
Metrics/CyclomaticComplexity:
  Max: 10
Metrics/PerceivedComplexity:
  Max: 15
Metrics/MethodLength:
  Max: 50
Metrics/ClassLength:
  Max: 300
Metrics/ParameterLists:
  Max: 4
Metrics/BlockNesting:
  Max: 4
Metrics/AbcSize:
  Max: 25

# .rubocop.yml - Legacy
Metrics/CyclomaticComplexity:
  Max: 15
Metrics/PerceivedComplexity:
  Max: 25
Metrics/MethodLength:
  Max: 100
Metrics/ClassLength:
  Max: 500
Metrics/ParameterLists:
  Max: 6
Metrics/BlockNesting:
  Max: 6
Metrics/AbcSize:
  Max: 40
```

---

## PHP Configuration

### PHP_CodeSniffer + PHPMD
```xml
<!-- phpmd.xml - Strict -->
<ruleset name="Strict">
  <rule ref="rulesets/codesize.xml/CyclomaticComplexity">
    <properties>
      <property name="reportLevel" value="7"/>
    </properties>
  </rule>
  <rule ref="rulesets/codesize.xml/NPathComplexity">
    <properties>
      <property name="minimum" value="100"/>
    </properties>
  </rule>
  <rule ref="rulesets/codesize.xml/ExcessiveMethodLength">
    <properties>
      <property name="minimum" value="30"/>
    </properties>
  </rule>
  <rule ref="rulesets/codesize.xml/ExcessiveParameterList">
    <properties>
      <property name="minimum" value="3"/>
    </properties>
  </rule>
  <rule ref="rulesets/codesize.xml/TooManyPublicMethods">
    <properties>
      <property name="maxmethods" value="10"/>
    </properties>
  </rule>
</ruleset>
```

---

## CI/CD Integration

### GitHub Actions
```yaml
# .github/workflows/complexity.yml
name: Complexity Check

on: [push, pull_request]

jobs:
  complexity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Python
      - name: Python Complexity
        run: |
          pip install radon xenon
          radon cc src/ --min D --show-complexity
          xenon --max-absolute C --max-modules B src/

      # JavaScript
      - name: JS Complexity
        run: |
          npm install
          npx eslint --rule 'complexity: [error, 10]' src/

      # Go
      - name: Go Complexity
        run: |
          go install github.com/fzipp/gocyclo/cmd/gocyclo@latest
          gocyclo -over 10 .
```

### Pre-commit Hooks
```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: complexity-check
        name: Check Complexity
        entry: bash -c 'radon cc src/ --min D -s && exit $?'
        language: system
        types: [python]
        pass_filenames: false
```

---

## Gradual Improvement Strategy

### Starting from Legacy
```
Week 1-4:   Legacy limits, identify worst offenders
Week 5-8:   Refactor top 10 complex functions
Week 9-12:  Move to Standard limits
Week 13-16: Refactor remaining Standard violations
Week 17+:   Consider Strict for new code
```

### Metrics to Track
1. **Violation Count**: Number of functions exceeding limits
2. **Max Complexity**: Highest CC in codebase
3. **Average Complexity**: Trend over time
4. **Hotspot Count**: Files with 3+ violations

### Ratchet Pattern
```bash
# Lock current violation count, only allow decreases
CURRENT=$(radon cc src/ --min D --json | jq '[.[].complexity] | add')
# Fail CI if count increases
```
