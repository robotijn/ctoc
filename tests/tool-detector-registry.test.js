'use strict';

/**
 * CR5-s2 — tool-detector consumes the capability registry.
 *
 * These tests prove the SWAP: `detectTools` resolves lint/typecheck/test/coverage
 * from the capability registry (`toolchainFor`) instead of the static DEFAULT_TOOLS
 * table, so ALL 20 registry languages get tool commands — including csharp and php,
 * which the old DEFAULT_TOOLS table detected but left with NO commands.
 *
 * Two documented build-system nuances live INSIDE tool-detector (never in a YAML):
 *   • JAVA — the registry command set is Maven-only; when a Gradle build file is
 *     present the Gradle form is used instead (preserving the old gradle||mvn
 *     fallback behavior), else the Maven (registry) command.
 *   • RUBY — the registry drops the `bundle exec` prefix; when a Gemfile is present
 *     the ruby test/coverage commands are re-prefixed `bundle exec` (bundler semantics).
 *
 * REGRESSION guards: python still yields `ruff check .` + `pytest`; go still
 * `golangci-lint run` + `go test ./...` — the swap is behavior-preserving there.
 *
 * ZERO DOUBLES: every case builds a REAL project dir on disk and reads the REAL
 * bundled seed YAML through the real registry. Nothing is mocked.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const toolDetector = require('../src/lib/tool-detector');

/** Make a fresh temp project dir. */
function makeProject(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
/** Remove a temp dir, best-effort. */
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
/** Write a file into a project dir (creating parents). */
function write(dir, rel, body) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

describe('tool-detector ← capability-registry: csharp/php now get tool commands', () => {
  it('a *.csproj project resolves csharp WITH lint + test commands (was: none)', () => {
    const dir = makeProject('ctoc-td-csharp-');
    try {
      write(dir, 'App.csproj', '<Project Sdk="Microsoft.NET.Sdk" />\n');
      const res = toolDetector.detectTools(dir);
      assert.ok(res.languages.includes('csharp'), 'a *.csproj project must detect csharp');
      const cs = res.tools.csharp;
      assert.ok(cs, 'csharp must have a tools entry');
      assert.equal(cs.lint, 'dotnet format --verify-no-changes',
        'csharp lint must come from the registry, not be absent');
      assert.equal(cs.test, 'dotnet test', 'csharp test must come from the registry');
      assert.equal(cs.typecheck, 'dotnet build', 'csharp typecheck must come from the registry');
      assert.equal(cs.coverage, 'dotnet test --collect:"XPlat Code Coverage"',
        'csharp coverage must come from the registry');
    } finally { rm(dir); }
  });

  it('a composer.json project resolves php WITH lint + test commands (was: none)', () => {
    const dir = makeProject('ctoc-td-php-');
    try {
      write(dir, 'composer.json', '{ "name": "vendor/pkg" }\n');
      const res = toolDetector.detectTools(dir);
      assert.ok(res.languages.includes('php'), 'a composer.json project must detect php');
      const php = res.tools.php;
      assert.ok(php, 'php must have a tools entry');
      assert.equal(php.lint, 'phpstan analyse', 'php lint must come from the registry');
      assert.equal(php.test, 'phpunit', 'php test must come from the registry');
      assert.equal(php.coverage, 'phpunit --coverage-clover coverage.xml',
        'php coverage must come from the registry');
    } finally { rm(dir); }
  });
});

describe('tool-detector ← capability-registry: JAVA build-system nuance (gradle vs maven)', () => {
  it('a Gradle Java project (build.gradle) uses the gradle test command, NOT bare `mvn test`', () => {
    const dir = makeProject('ctoc-td-java-gradle-');
    try {
      write(dir, 'build.gradle', "plugins { id 'java' }\n");
      const res = toolDetector.detectTools(dir);
      assert.ok(res.languages.includes('java'), 'build.gradle must detect java');
      assert.equal(res.tools.java.test, './gradlew test',
        'a Gradle project must use the Gradle test command');
      assert.notEqual(res.tools.java.test, 'mvn test',
        'a Gradle project must NOT get the bare Maven test command');
      assert.equal(res.tools.java.coverage, './gradlew jacocoTestReport',
        'a Gradle project must use the Gradle coverage command');
    } finally { rm(dir); }
  });

  it('a Maven Java project (pom.xml, no gradle) uses the registry `mvn test` command', () => {
    const dir = makeProject('ctoc-td-java-maven-');
    try {
      write(dir, 'pom.xml', '<project></project>\n');
      const res = toolDetector.detectTools(dir);
      assert.ok(res.languages.includes('java'), 'pom.xml must detect java');
      assert.equal(res.tools.java.test, 'mvn test',
        'a Maven project must use the registry Maven test command');
      assert.equal(res.tools.java.lint, 'mvn checkstyle:check',
        'a Maven project must use the registry Maven lint command');
    } finally { rm(dir); }
  });
});

describe('tool-detector ← capability-registry: RUBY bundle-exec nuance', () => {
  it('a Ruby project with a Gemfile prefixes `bundle exec` on the test command', () => {
    const dir = makeProject('ctoc-td-ruby-');
    try {
      write(dir, 'Gemfile', "source 'https://rubygems.org'\n");
      const res = toolDetector.detectTools(dir);
      assert.ok(res.languages.includes('ruby'), 'a Gemfile must detect ruby');
      assert.equal(res.tools.ruby.test, 'bundle exec rspec',
        'a Gemfile project must prefix `bundle exec` on the ruby test command');
      assert.equal(res.tools.ruby.coverage, 'bundle exec rspec',
        'a Gemfile project must prefix `bundle exec` on the ruby coverage command');
    } finally { rm(dir); }
  });
});

describe('tool-detector ← capability-registry: REGRESSION (python/go behavior-preserved)', () => {
  it('a Python project still yields `ruff check .` + `pytest`', () => {
    const dir = makeProject('ctoc-td-python-');
    try {
      write(dir, 'pyproject.toml', '[tool.pytest.ini_options]\n');
      const res = toolDetector.detectTools(dir);
      assert.ok(res.languages.includes('python'), 'pyproject.toml must detect python');
      assert.equal(res.tools.python.lint, 'ruff check .', 'python lint must stay ruff');
      assert.equal(res.tools.python.test, 'pytest', 'python test must stay pytest');
      assert.equal(res.tools.python.coverage, 'pytest --cov --cov-report=json',
        'python coverage must stay the registry pytest-cov command');
    } finally { rm(dir); }
  });

  it('a Go project still yields `golangci-lint run` + `go test ./...`', () => {
    const dir = makeProject('ctoc-td-go-');
    try {
      write(dir, 'go.mod', 'module x\n\ngo 1.22\n');
      const res = toolDetector.detectTools(dir);
      assert.ok(res.languages.includes('go'), 'go.mod must detect go');
      assert.equal(res.tools.go.lint, 'golangci-lint run', 'go lint must stay golangci-lint');
      assert.equal(res.tools.go.test, 'go test ./...', 'go test must stay `go test ./...`');
      assert.equal(res.tools.go.coverage, 'go test -coverprofile=coverage.out ./...',
        'go coverage must stay the registry go-cover command');
    } finally { rm(dir); }
  });
});

describe('tool-detector ← capability-registry: all 20 registry languages now get commands', () => {
  it('a Kotlin project (build.gradle.kts) — a language DEFAULT_TOOLS never covered — gets tool commands', () => {
    const dir = makeProject('ctoc-td-kotlin-');
    try {
      write(dir, 'build.gradle.kts', 'plugins { kotlin("jvm") }\n');
      const res = toolDetector.detectTools(dir);
      assert.ok(res.languages.includes('kotlin'),
        'build.gradle.kts must detect kotlin via the registry (legacy table never had it)');
      assert.ok(res.tools.kotlin && typeof res.tools.kotlin.test === 'string'
        && res.tools.kotlin.test.length > 0,
        'kotlin must now get a real test command from the registry');
    } finally { rm(dir); }
  });
});
