# Coverage Enforcement Guide
> Claude Code coverage thresholds and enforcement reference. Updated February 2026.

## Coverage Types Explained

### Line Coverage
Measures the percentage of executed lines.

```javascript
function calculate(a, b, mode) {
  if (mode === 'add') {      // Line 1
    return a + b;            // Line 2 - only covered if mode === 'add'
  }                          // Line 3
  return a * b;              // Line 4 - only covered if mode !== 'add'
}
```

**Limitation**: A line with multiple statements counts as one line.

### Branch Coverage
Measures the percentage of executed decision branches.

```javascript
function validate(user) {
  // Branch 1a: user exists, Branch 1b: user is null/undefined
  if (user && user.age >= 18) {
    // Branch 2a: age >= 18
    return true;
  }
  // Branch 2b: age < 18 OR user doesn't exist
  return false;
}
```

**To achieve 100% branch coverage, test**:
- `user = null` (branch 1b)
- `user = { age: 17 }` (branch 2b)
- `user = { age: 18 }` (branch 2a)

### Function Coverage
Measures the percentage of functions that have been called at least once.

```javascript
export const utils = {
  add: (a, b) => a + b,     // Covered if called once
  subtract: (a, b) => a - b, // Uncovered if never called
  multiply: (a, b) => a * b  // Covered if called once
};
```

### Statement Coverage
Measures the percentage of executed statements.

```javascript
const x = 1; const y = 2; const z = x + y;  // 3 statements on 1 line
```

**Difference from line coverage**: One line can have multiple statements.

## Coverage Thresholds by Mode

### Strict Mode (Default for new projects)
```json
{
  "coverageThreshold": {
    "global": {
      "lines": 80,
      "branches": 75,
      "functions": 80,
      "statements": 80
    }
  }
}
```

**When to use**: New projects, greenfield development, high-quality codebases.

### Strictest Mode (Critical systems)
```json
{
  "coverageThreshold": {
    "global": {
      "lines": 90,
      "branches": 85,
      "functions": 90,
      "statements": 90
    }
  }
}
```

**When to use**: Financial systems, healthcare, security-critical code, public APIs.

### Legacy Mode (Brownfield projects)
```json
{
  "coverageThreshold": {
    "global": {
      "lines": 50,
      "branches": 40,
      "functions": 50,
      "statements": 50
    }
  }
}
```

**When to use**: Legacy codebases being improved incrementally.

### Ratcheting Strategy (Continuous improvement)
```javascript
// coverage-ratchet.js
const fs = require('fs');
const current = require('./coverage/coverage-summary.json');

const ratchetFile = '.coverage-ratchet.json';
const previous = fs.existsSync(ratchetFile)
  ? JSON.parse(fs.readFileSync(ratchetFile))
  : { lines: 0, branches: 0, functions: 0, statements: 0 };

const metrics = ['lines', 'branches', 'functions', 'statements'];
const regression = metrics.filter(m =>
  current.total[m].pct < previous[m]
);

if (regression.length > 0) {
  console.error(`Coverage regression detected: ${regression.join(', ')}`);
  process.exit(1);
}

// Save new thresholds (only allows upward movement)
const newThresholds = {};
metrics.forEach(m => {
  newThresholds[m] = Math.max(previous[m], Math.floor(current.total[m].pct));
});

fs.writeFileSync(ratchetFile, JSON.stringify(newThresholds, null, 2));
```

### Per-Directory Thresholds
```json
{
  "coverageThreshold": {
    "global": {
      "lines": 70,
      "branches": 60
    },
    "./src/core/": {
      "lines": 95,
      "branches": 90
    },
    "./src/utils/": {
      "lines": 90,
      "branches": 85
    },
    "./src/legacy/": {
      "lines": 40,
      "branches": 30
    }
  }
}
```

## Coverage Tools by Language

### JavaScript/TypeScript: Istanbul (nyc) / Vitest / Jest

**Istanbul (via nyc)**:
```bash
npm install --save-dev nyc
```

```json
// package.json
{
  "scripts": {
    "test": "nyc mocha",
    "coverage": "nyc report --reporter=lcov"
  },
  "nyc": {
    "check-coverage": true,
    "lines": 80,
    "branches": 75,
    "functions": 80,
    "statements": 80,
    "include": ["src/**/*.js"],
    "exclude": ["**/*.test.js", "**/*.spec.js"],
    "reporter": ["text", "lcov", "html"]
  }
}
```

**Vitest (built-in v8 coverage)**:
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      enabled: true,
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/types/**'],
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage'
    }
  }
});
```

**Jest**:
```javascript
// jest.config.js
module.exports = {
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'cobertura'],
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 75,
      functions: 80,
      statements: 80
    }
  },
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{js,jsx,ts,tsx}'
  ]
};
```

### Python: coverage.py

```bash
pip install coverage pytest-cov
```

```ini
# .coveragerc
[run]
source = src
branch = True
omit =
    */tests/*
    */__pycache__/*
    */migrations/*

[report]
fail_under = 80
show_missing = True
exclude_lines =
    pragma: no cover
    def __repr__
    raise NotImplementedError
    if TYPE_CHECKING:

[html]
directory = htmlcov
```

```toml
# pyproject.toml alternative
[tool.coverage.run]
source = ["src"]
branch = true

[tool.coverage.report]
fail_under = 80
show_missing = true
```

```bash
# Run with pytest
pytest --cov=src --cov-report=html --cov-report=xml --cov-fail-under=80
```

### Java: JaCoCo

```xml
<!-- pom.xml -->
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <version>0.8.12</version>
    <executions>
        <execution>
            <goals>
                <goal>prepare-agent</goal>
            </goals>
        </execution>
        <execution>
            <id>report</id>
            <phase>test</phase>
            <goals>
                <goal>report</goal>
            </goals>
        </execution>
        <execution>
            <id>check</id>
            <goals>
                <goal>check</goal>
            </goals>
            <configuration>
                <rules>
                    <rule>
                        <element>BUNDLE</element>
                        <limits>
                            <limit>
                                <counter>LINE</counter>
                                <value>COVEREDRATIO</value>
                                <minimum>0.80</minimum>
                            </limit>
                            <limit>
                                <counter>BRANCH</counter>
                                <value>COVEREDRATIO</value>
                                <minimum>0.75</minimum>
                            </limit>
                        </limits>
                    </rule>
                </rules>
            </configuration>
        </execution>
    </executions>
</plugin>
```

```groovy
// build.gradle (Kotlin DSL)
plugins {
    jacoco
}

jacoco {
    toolVersion = "0.8.12"
}

tasks.jacocoTestCoverageVerification {
    violationRules {
        rule {
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "0.80".toBigDecimal()
            }
            limit {
                counter = "BRANCH"
                value = "COVEREDRATIO"
                minimum = "0.75".toBigDecimal()
            }
        }
    }
}

tasks.check {
    dependsOn(tasks.jacocoTestCoverageVerification)
}
```

### Go: go cover

```bash
# Run tests with coverage
go test -coverprofile=coverage.out -covermode=atomic ./...

# View coverage report
go tool cover -html=coverage.out -o coverage.html

# Check coverage threshold
go tool cover -func=coverage.out | grep total | awk '{print $3}' | \
  awk -F'%' '{if ($1 < 80) exit 1}'
```

```go
// coverage_test.go - Custom threshold checker
package main

import (
    "os"
    "os/exec"
    "strconv"
    "strings"
    "testing"
)

func TestCoverageThreshold(t *testing.T) {
    if os.Getenv("CHECK_COVERAGE") != "true" {
        t.Skip("Skipping coverage check")
    }

    out, err := exec.Command("go", "tool", "cover", "-func=coverage.out").Output()
    if err != nil {
        t.Fatalf("Failed to get coverage: %v", err)
    }

    lines := strings.Split(string(out), "\n")
    for _, line := range lines {
        if strings.Contains(line, "total:") {
            fields := strings.Fields(line)
            pctStr := strings.TrimSuffix(fields[len(fields)-1], "%")
            pct, _ := strconv.ParseFloat(pctStr, 64)
            if pct < 80 {
                t.Fatalf("Coverage %.1f%% is below 80%% threshold", pct)
            }
        }
    }
}
```

### Rust: llvm-cov / tarpaulin

**llvm-cov (recommended)**:
```bash
# Install
cargo install cargo-llvm-cov

# Run with coverage
cargo llvm-cov --html --output-dir coverage

# With threshold enforcement
cargo llvm-cov --fail-under-lines 80

# Generate multiple formats
cargo llvm-cov --lcov --output-path lcov.info
cargo llvm-cov --cobertura --output-path cobertura.xml
```

```toml
# .cargo/config.toml
[alias]
cov = "llvm-cov --html --open"
cov-ci = "llvm-cov --lcov --output-path lcov.info --fail-under-lines 80"
```

**tarpaulin (alternative)**:
```bash
cargo install cargo-tarpaulin

cargo tarpaulin --out Html --out Lcov --fail-under 80
```

### Ruby: SimpleCov

```ruby
# spec/spec_helper.rb (top of file, before any other requires)
require 'simplecov'

SimpleCov.start 'rails' do
  enable_coverage :branch

  add_filter '/spec/'
  add_filter '/config/'
  add_filter '/vendor/'

  add_group 'Models', 'app/models'
  add_group 'Controllers', 'app/controllers'
  add_group 'Services', 'app/services'

  minimum_coverage line: 80, branch: 75
  minimum_coverage_by_file line: 50

  refuse_coverage_drop
end
```

```ruby
# Gemfile
group :test do
  gem 'simplecov', require: false
  gem 'simplecov-lcov', require: false  # For CI integration
end
```

```ruby
# For LCOV output (CI integration)
require 'simplecov-lcov'

SimpleCov::Formatter::LcovFormatter.config do |c|
  c.report_with_single_file = true
  c.output_directory = 'coverage'
  c.lcov_file_name = 'lcov.info'
end

SimpleCov.formatter = SimpleCov::Formatter::MultiFormatter.new([
  SimpleCov::Formatter::HTMLFormatter,
  SimpleCov::Formatter::LcovFormatter
])
```

## Coverage Report Formats

### LCOV (Universal format)
```
TN:
SF:/path/to/source/file.js
FN:1,functionName
FNDA:5,functionName
FNF:1
FNH:1
DA:1,5
DA:2,5
DA:3,0
LF:3
LH:2
BRF:2
BRH:1
end_of_record
```

**Used by**: SonarQube, Codecov, Coveralls, most CI tools.

### Cobertura (XML format)
```xml
<?xml version="1.0"?>
<coverage version="1.0" timestamp="1234567890"
          lines-valid="100" lines-covered="80"
          line-rate="0.8" branches-valid="50"
          branches-covered="40" branch-rate="0.8">
  <packages>
    <package name="src" line-rate="0.8" branch-rate="0.8">
      <classes>
        <class name="Calculator" filename="src/calculator.js"
               line-rate="0.9" branch-rate="0.85">
          <methods>
            <method name="add" signature="" line-rate="1.0"/>
          </methods>
          <lines>
            <line number="1" hits="5"/>
            <line number="2" hits="5"/>
          </lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>
```

**Used by**: Azure DevOps, Jenkins, GitLab CI.

### Clover (XML format)
```xml
<?xml version="1.0"?>
<coverage generated="1234567890">
  <project timestamp="1234567890">
    <metrics statements="100" coveredstatements="80"
             conditionals="50" coveredconditionals="40"
             methods="20" coveredmethods="18"/>
    <file name="src/calculator.js">
      <metrics statements="10" coveredstatements="8"/>
      <line num="1" count="5" type="stmt"/>
    </file>
  </project>
</coverage>
```

**Used by**: Atlassian tools, Bamboo.

## CI/CD Integration Patterns

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test with Coverage

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests with coverage
        run: npm test -- --coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage/lcov.info
          fail_ci_if_error: true

      - name: Coverage threshold check
        run: |
          COVERAGE=$(grep -Po '(?<=<coverage line-rate=")[^"]+' coverage/cobertura.xml)
          if (( $(echo "$COVERAGE < 0.80" | bc -l) )); then
            echo "Coverage $COVERAGE is below 80% threshold"
            exit 1
          fi
```

### GitLab CI

```yaml
# .gitlab-ci.yml
test:
  stage: test
  script:
    - npm ci
    - npm test -- --coverage
  coverage: '/Lines\s*:\s*(\d+\.?\d*)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura.xml
    paths:
      - coverage/
    expire_in: 1 week

coverage_gate:
  stage: test
  needs: [test]
  script:
    - |
      COVERAGE=$(grep -oP 'line-rate="\K[^"]+' coverage/cobertura.xml | head -1)
      PERCENT=$(echo "$COVERAGE * 100" | bc)
      if (( $(echo "$PERCENT < 80" | bc -l) )); then
        echo "Coverage ${PERCENT}% is below 80% threshold"
        exit 1
      fi
```

### Azure DevOps

```yaml
# azure-pipelines.yml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'

  - script: npm ci
    displayName: 'Install dependencies'

  - script: npm test -- --coverage --coverageReporters=cobertura
    displayName: 'Run tests'

  - task: PublishCodeCoverageResults@2
    inputs:
      summaryFileLocation: '$(System.DefaultWorkingDirectory)/coverage/cobertura.xml'

  - task: BuildQualityChecks@9
    inputs:
      checkCoverage: true
      coverageFailOption: 'fixed'
      coverageType: 'lines'
      coverageThreshold: '80'
```

### Jenkins Pipeline

```groovy
// Jenkinsfile
pipeline {
    agent any

    stages {
        stage('Test') {
            steps {
                sh 'npm ci'
                sh 'npm test -- --coverage'
            }
            post {
                always {
                    publishCoverage adapters: [
                        coberturaAdapter('coverage/cobertura.xml')
                    ],
                    sourceFileResolver: sourceFiles('STORE_LAST_BUILD'),
                    failUnhealthy: true,
                    failUnstable: true,
                    globalThresholds: [
                        [thresholdTarget: 'Line', unhealthyThreshold: 70.0, unstableThreshold: 80.0]
                    ]
                }
            }
        }
    }
}
```

## Coverage Exclusion Patterns

### Legitimate Exclusions

```javascript
// JavaScript/TypeScript
/* istanbul ignore next */
function debugOnly() { /* development debugging code */ }

/* istanbul ignore if */
if (process.env.NODE_ENV === 'development') {
  enableDevTools();
}
```

```python
# Python
if TYPE_CHECKING:  # pragma: no cover
    from typing import Optional

def abstract_method(self):  # pragma: no cover
    raise NotImplementedError()
```

```java
// Java - via JaCoCo filter
@Generated  // Excluded by default
@lombok.Generated  // Excluded by default
```

### What to Exclude

| Exclude | Reason |
|---------|--------|
| Generated code | Not hand-written |
| Type definitions | No runtime behavior |
| Development-only code | Not production paths |
| Abstract methods | By definition untestable |
| Panic/unreachable paths | Defensive code |

### What NOT to Exclude

| Do NOT Exclude | Reason |
|----------------|--------|
| Error handlers | Critical production paths |
| Edge cases | Often where bugs hide |
| Fallback logic | Must work when triggered |
| Complex conditions | High defect density |

## Coverage Anti-Patterns

### Testing for Coverage, Not Behavior

```javascript
// BAD: Tests every line but not actual behavior
it('calls the function', () => {
  const result = calculate(1, 2);
  expect(result).toBeDefined();  // Useless assertion
});

// GOOD: Tests actual expected behavior
it('adds two numbers correctly', () => {
  expect(calculate(1, 2, 'add')).toBe(3);
  expect(calculate(-1, 1, 'add')).toBe(0);
});
```

### Coverage Theater

```javascript
// BAD: 100% coverage, zero value
it('has 100% coverage', () => {
  const obj = new ComplexClass();
  // Touch every method but verify nothing
  obj.methodA();
  obj.methodB();
  obj.methodC();
});
```

### Ignoring Hard-to-Test Code

```javascript
// BAD: Blanket ignore on complex logic
/* istanbul ignore next */
function complexBusinessLogic() {
  // 200 lines of critical logic...
}

// GOOD: Refactor to make testable
function complexBusinessLogic(deps = defaultDeps) {
  // Now injectable and testable
}
```

## What NOT to Do

- Do NOT pursue 100% coverage as a goal — 80% with quality beats 100% with test theater
- Do NOT ignore branch coverage — line coverage alone misses critical paths
- Do NOT exclude code because it is hard to test — refactor instead
- Do NOT use coverage as the only quality metric — combine with mutation testing
- Do NOT let coverage gate failures persist — fix or adjust threshold immediately
- Do NOT measure coverage on test files — exclude test directories
- Do NOT forget to enforce on CI — local coverage means nothing
- Do NOT use different tools locally vs CI — results will differ
