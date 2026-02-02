# Istanbul (nyc) Coverage Guide
> Claude Code JavaScript/TypeScript coverage reference. Updated February 2026.

## Overview

Istanbul is the standard coverage tool for JavaScript/TypeScript. It works through:
- **nyc**: Command-line interface for Istanbul
- **babel-plugin-istanbul**: For Babel-based builds
- **v8-to-istanbul**: For native V8 coverage (Node.js, Vitest)

## Installation

```bash
# nyc (command-line)
npm install --save-dev nyc

# For TypeScript
npm install --save-dev nyc @istanbuljs/nyc-config-typescript

# For Babel
npm install --save-dev babel-plugin-istanbul

# For ESM projects
npm install --save-dev c8  # Alternative to nyc for ESM
```

## Configuration

### Basic nyc Configuration

```json
// package.json
{
  "nyc": {
    "check-coverage": true,
    "lines": 80,
    "branches": 75,
    "functions": 80,
    "statements": 80,
    "include": [
      "src/**/*.js",
      "src/**/*.ts"
    ],
    "exclude": [
      "**/*.test.js",
      "**/*.spec.js",
      "**/*.d.ts",
      "**/node_modules/**",
      "**/coverage/**"
    ],
    "reporter": [
      "text",
      "text-summary",
      "lcov",
      "html"
    ],
    "report-dir": "coverage",
    "temp-dir": ".nyc_output",
    "all": true,
    "cache": true
  }
}
```

### TypeScript Configuration

```json
// .nycrc.json
{
  "extends": "@istanbuljs/nyc-config-typescript",
  "check-coverage": true,
  "lines": 80,
  "branches": 75,
  "functions": 80,
  "statements": 80,
  "include": [
    "src/**/*.ts"
  ],
  "exclude": [
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/*.d.ts"
  ],
  "reporter": [
    "text",
    "lcov",
    "html"
  ],
  "report-dir": "coverage",
  "all": true
}
```

### Babel Plugin Configuration

```javascript
// babel.config.js
module.exports = {
  presets: ['@babel/preset-env', '@babel/preset-typescript'],
  env: {
    test: {
      plugins: ['istanbul']
    }
  }
};
```

### ESM Projects (c8)

```json
// package.json
{
  "scripts": {
    "test": "c8 node --test",
    "coverage": "c8 report --reporter=html"
  },
  "c8": {
    "check-coverage": true,
    "lines": 80,
    "branches": 75,
    "functions": 80,
    "statements": 80,
    "include": ["src/**"],
    "exclude": ["**/*.test.js"],
    "reporter": ["text", "lcov", "html"]
  }
}
```

## Running Coverage

### With Mocha

```bash
# Run tests with coverage
npx nyc mocha

# With specific reporters
npx nyc --reporter=text --reporter=lcov mocha

# Check coverage thresholds
npx nyc --check-coverage mocha
```

```json
// package.json
{
  "scripts": {
    "test": "mocha",
    "test:coverage": "nyc mocha",
    "coverage:check": "nyc check-coverage"
  }
}
```

### With Jest

Jest has built-in Istanbul support:

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

```bash
# Run with coverage
npx jest --coverage

# Update snapshots with coverage
npx jest --coverage --updateSnapshot
```

### With Vitest

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',  // or 'istanbul'
      enabled: true,
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', '**/*.spec.ts'],
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage'
    }
  }
});
```

```bash
# Run with coverage
npx vitest --coverage

# Run in watch mode with coverage
npx vitest --coverage --watch
```

### With Node.js Test Runner

```bash
# Using c8 with Node.js test runner
npx c8 node --test

# With specific configuration
npx c8 --check-coverage --lines 80 node --test
```

## Coverage Exclusion

### File-Level Exclusion

```javascript
/* istanbul ignore file */
// This entire file will be excluded from coverage

export function debugOnly() {
  console.log('debug');
}
```

### Function-Level Exclusion

```javascript
/* istanbul ignore next */
function unreachableErrorHandler() {
  // Error handling that should never run
  throw new Error('This should never happen');
}
```

### Branch-Level Exclusion

```javascript
function validate(input) {
  /* istanbul ignore if */
  if (process.env.NODE_ENV === 'development') {
    console.log('Debug:', input);
  }

  return input != null;
}
```

### Else Branch Exclusion

```javascript
function getValue(key) {
  if (cache.has(key)) {
    return cache.get(key);
  }
  /* istanbul ignore else */
  else if (defaultValues[key]) {
    return defaultValues[key];
  }
  // Defensive fallback - should never reach
  return null;
}
```

### Conditional Expression Exclusion

```javascript
const value = process.env.DEBUG
  ? /* istanbul ignore next */ expensiveDebugValue()
  : productionValue();
```

## Report Formats

### Text Report

```bash
npx nyc --reporter=text mocha
```

Output:
```
--------------------|---------|----------|---------|---------|-------------------
File                | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
--------------------|---------|----------|---------|---------|-------------------
All files           |   85.71 |       75 |   83.33 |   85.71 |
 src/calculator.js  |     100 |      100 |     100 |     100 |
 src/utils.js       |   71.43 |       50 |   66.67 |   71.43 | 12-14,18
--------------------|---------|----------|---------|---------|-------------------
```

### HTML Report

```bash
npx nyc --reporter=html mocha
```

Generates interactive HTML report in `coverage/index.html`.

### LCOV Report

```bash
npx nyc --reporter=lcov mocha
```

Generates `coverage/lcov.info` for CI tools (Codecov, Coveralls, SonarQube).

### Cobertura XML

```bash
npx nyc --reporter=cobertura mocha
```

Generates `coverage/cobertura-coverage.xml` for Azure DevOps, Jenkins.

### JSON Report

```bash
npx nyc --reporter=json mocha
```

Generates `coverage/coverage-final.json` for programmatic access.

## Merging Coverage

### Multiple Test Runs

```bash
# Run different test suites
npx nyc --no-clean mocha test/unit/**/*.test.js
npx nyc --no-clean mocha test/integration/**/*.test.js

# Merge and report
npx nyc merge .nyc_output coverage/merged.json
npx nyc report --temp-dir .nyc_output
```

### CI Pipeline Merging

```yaml
# GitHub Actions
jobs:
  unit-tests:
    steps:
      - run: npx nyc --reporter=json mocha test/unit
      - uses: actions/upload-artifact@v4
        with:
          name: unit-coverage
          path: coverage/coverage-final.json

  integration-tests:
    steps:
      - run: npx nyc --reporter=json mocha test/integration
      - uses: actions/upload-artifact@v4
        with:
          name: integration-coverage
          path: coverage/coverage-final.json

  merge-coverage:
    needs: [unit-tests, integration-tests]
    steps:
      - uses: actions/download-artifact@v4
      - run: |
          mkdir -p .nyc_output
          cp unit-coverage/coverage-final.json .nyc_output/unit.json
          cp integration-coverage/coverage-final.json .nyc_output/integration.json
          npx nyc merge .nyc_output coverage/merged.json
          npx nyc report --reporter=lcov --reporter=text-summary
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Coverage

on: [push, pull_request]

jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - run: npm test -- --coverage
        env:
          CI: true

      - name: Check coverage thresholds
        run: npx nyc check-coverage

      - name: Upload to Codecov
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage/lcov.info
          fail_ci_if_error: true
```

### GitLab CI

```yaml
test:
  stage: test
  script:
    - npm ci
    - npm test -- --coverage
    - npx nyc check-coverage
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml
```

### Jenkins

```groovy
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
                        istanbulCoberturaAdapter('coverage/cobertura-coverage.xml')
                    ]
                }
            }
        }
    }
}
```

## Troubleshooting

### Source Maps Not Working

```json
// .nycrc.json
{
  "source-map": true,
  "instrument": false,
  "require": ["ts-node/register"]
}
```

### ESM Import Errors

Use c8 instead of nyc for ESM:

```bash
npm install --save-dev c8
npx c8 node --test
```

### Coverage Missing for Some Files

```json
// .nycrc.json
{
  "all": true,
  "include": ["src/**/*.js"],
  "instrument": true
}
```

### Slow Coverage Collection

```json
// .nycrc.json
{
  "cache": true,
  "temp-dir": ".nyc_output",
  "clean": false
}
```

### TypeScript Paths Not Resolving

```json
// .nycrc.json
{
  "extends": "@istanbuljs/nyc-config-typescript",
  "require": [
    "ts-node/register",
    "tsconfig-paths/register"
  ]
}
```

## Best Practices

### Use Configuration File

```json
// .nycrc.json (preferred over package.json)
{
  "check-coverage": true,
  "lines": 80,
  "branches": 75,
  "functions": 80,
  "statements": 80
}
```

### Exclude Appropriately

```json
{
  "exclude": [
    "**/*.test.js",
    "**/*.spec.js",
    "**/__tests__/**",
    "**/__mocks__/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "**/*.d.ts",
    "**/types/**"
  ]
}
```

### Use Per-File Thresholds

```json
{
  "per-file": true,
  "lines": 70,
  "branches": 60
}
```

### Clean Output Directory

```bash
# In CI
npx nyc clean
npx nyc mocha
```

## What NOT to Do

- Do NOT exclude files just because they are hard to test
- Do NOT use `/* istanbul ignore */` to hide untested code
- Do NOT run coverage in watch mode (slow)
- Do NOT forget to instrument source files
- Do NOT mix nyc and c8 in the same project
- Do NOT set thresholds too low initially — start at 60%, increase
- Do NOT ignore coverage drops in PRs
- Do NOT generate HTML reports in CI (use lcov/cobertura)
