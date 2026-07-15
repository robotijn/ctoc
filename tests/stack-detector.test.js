/**
 * Stack Detector Tests
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  LANGUAGE_PATTERNS,
  FRAMEWORK_PATTERNS,
  detectLanguages,
  detectFrameworks,
  detectStack,
  matchGlob,
  readPackageDeps
} = require('../src/lib/stack-detector');

// Create temp directory for isolated tests
const tempDir = path.join(os.tmpdir(), 'stack-detector-test-' + Date.now());

function setupTempDir() {
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
}

function cleanupTempDir() {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function createTempFile(filename, content = '') {
  const filePath = path.join(tempDir, filename);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
  return filePath;
}

// ============================================
// matchGlob Tests
// ============================================

function testMatchGlobExactMatch() {
  assert.strictEqual(matchGlob('test.js', 'test.js'), true, 'Exact match');
  assert.strictEqual(matchGlob('test.js', 'test.ts'), false, 'Exact no match');
  console.log('# matchGlob - exact match');
}

function testMatchGlobWildcard() {
  assert.strictEqual(matchGlob('test.csproj', '*.csproj'), true, 'Wildcard match');
  assert.strictEqual(matchGlob('MyProject.csproj', '*.csproj'), true, 'Wildcard match complex name');
  assert.strictEqual(matchGlob('test.sln', '*.csproj'), false, 'Wildcard no match');
  console.log('# matchGlob - wildcard pattern');
}

function testMatchGlobQuestionMark() {
  assert.strictEqual(matchGlob('test1.js', 'test?.js'), true, 'Question mark match single char');
  assert.strictEqual(matchGlob('testX.js', 'test?.js'), true, 'Question mark match letter');
  assert.strictEqual(matchGlob('test12.js', 'test?.js'), false, 'Question mark no match multiple');
  console.log('# matchGlob - question mark pattern');
}

function testMatchGlobSpecialChars() {
  assert.strictEqual(matchGlob('file.test.js', 'file.test.js'), true, 'Dots handled');
  assert.strictEqual(matchGlob('file[0].js', 'file[0].js'), true, 'Brackets escaped');
  console.log('# matchGlob - special characters');
}

// ============================================
// LANGUAGE_PATTERNS Tests
// ============================================

function testLanguagePatternsStructure() {
  const languages = Object.keys(LANGUAGE_PATTERNS);
  assert.ok(languages.length >= 10, 'At least 10 languages defined');

  for (const [lang, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    assert.ok(Array.isArray(patterns.files), `${lang} has files array`);
    assert.ok(Array.isArray(patterns.extensions), `${lang} has extensions array`);
    assert.ok(patterns.files.length > 0, `${lang} has at least one file`);
    assert.ok(patterns.extensions.length > 0, `${lang} has at least one extension`);
  }
  console.log('# LANGUAGE_PATTERNS - structure validation');
}

function testLanguagePatternsCommonLanguages() {
  const expectedLanguages = ['python', 'javascript', 'typescript', 'go', 'rust', 'java', 'ruby', 'php'];
  for (const lang of expectedLanguages) {
    assert.ok(LANGUAGE_PATTERNS[lang], `${lang} is defined`);
  }
  console.log('# LANGUAGE_PATTERNS - common languages present');
}

// ============================================
// FRAMEWORK_PATTERNS Tests
// ============================================

function testFrameworkPatternsStructure() {
  const frameworks = Object.keys(FRAMEWORK_PATTERNS);
  assert.ok(frameworks.length >= 15, 'At least 15 frameworks defined');

  for (const [framework, config] of Object.entries(FRAMEWORK_PATTERNS)) {
    assert.ok(Object.prototype.hasOwnProperty.call(config, 'language'), `${framework} has language property`);
    assert.ok(config.files || config.deps, `${framework} has files or deps`);
  }
  console.log('# FRAMEWORK_PATTERNS - structure validation');
}

function testFrameworkPatternsCommonFrameworks() {
  const expectedFrameworks = ['next.js', 'react', 'vue', 'express', 'django', 'flask', 'rails'];
  for (const framework of expectedFrameworks) {
    assert.ok(FRAMEWORK_PATTERNS[framework], `${framework} is defined`);
  }
  console.log('# FRAMEWORK_PATTERNS - common frameworks present');
}

// ============================================
// detectLanguages Tests
// ============================================

function testDetectLanguagesPython() {
  setupTempDir();
  createTempFile('requirements.txt', 'flask==2.0.0\n');

  const langs = detectLanguages(tempDir);
  assert.ok(langs.includes('python'), 'Detects Python from requirements.txt');

  cleanupTempDir();
  console.log('# detectLanguages - Python detection');
}

function testDetectLanguagesJavaScript() {
  setupTempDir();
  createTempFile('package.json', '{"name": "test"}');

  const langs = detectLanguages(tempDir);
  assert.ok(langs.includes('javascript'), 'Detects JavaScript from package.json');

  cleanupTempDir();
  console.log('# detectLanguages - JavaScript detection');
}

function testDetectLanguagesTypeScript() {
  setupTempDir();
  createTempFile('package.json', '{"name": "test"}');
  createTempFile('tsconfig.json', '{}');

  const langs = detectLanguages(tempDir);
  assert.ok(langs.includes('typescript'), 'Detects TypeScript from tsconfig.json');
  assert.ok(!langs.includes('javascript'), 'JavaScript removed when TypeScript present');

  cleanupTempDir();
  console.log('# detectLanguages - TypeScript detection (prefers over JS)');
}

function testDetectLanguagesGo() {
  setupTempDir();
  createTempFile('go.mod', 'module test\n\ngo 1.21');

  const langs = detectLanguages(tempDir);
  assert.ok(langs.includes('go'), 'Detects Go from go.mod');

  cleanupTempDir();
  console.log('# detectLanguages - Go detection');
}

function testDetectLanguagesRust() {
  setupTempDir();
  createTempFile('Cargo.toml', '[package]\nname = "test"');

  const langs = detectLanguages(tempDir);
  assert.ok(langs.includes('rust'), 'Detects Rust from Cargo.toml');

  cleanupTempDir();
  console.log('# detectLanguages - Rust detection');
}

function testDetectLanguagesJava() {
  setupTempDir();
  createTempFile('pom.xml', '<project></project>');

  const langs = detectLanguages(tempDir);
  assert.ok(langs.includes('java'), 'Detects Java from pom.xml');

  cleanupTempDir();
  console.log('# detectLanguages - Java detection (Maven)');
}

function testDetectLanguagesRuby() {
  setupTempDir();
  createTempFile('Gemfile', 'source "https://rubygems.org"');

  const langs = detectLanguages(tempDir);
  assert.ok(langs.includes('ruby'), 'Detects Ruby from Gemfile');

  cleanupTempDir();
  console.log('# detectLanguages - Ruby detection');
}

function testDetectLanguagesCSharp() {
  setupTempDir();
  createTempFile('MyProject.csproj', '<Project></Project>');

  const langs = detectLanguages(tempDir);
  assert.ok(langs.includes('csharp'), 'Detects C# from .csproj file');

  cleanupTempDir();
  console.log('# detectLanguages - C# detection (glob pattern)');
}

function testDetectLanguagesMultiple() {
  setupTempDir();
  createTempFile('requirements.txt', 'flask');
  createTempFile('go.mod', 'module test');

  const langs = detectLanguages(tempDir);
  assert.ok(langs.includes('python'), 'Detects Python in multi-lang');
  assert.ok(langs.includes('go'), 'Detects Go in multi-lang');

  cleanupTempDir();
  console.log('# detectLanguages - multiple languages');
}

function testDetectLanguagesEmptyDir() {
  setupTempDir();

  const langs = detectLanguages(tempDir);
  assert.ok(Array.isArray(langs), 'Returns array');
  assert.strictEqual(langs.length, 0, 'Empty array for empty dir');

  cleanupTempDir();
  console.log('# detectLanguages - empty directory');
}

function testDetectLanguagesNonExistentDir() {
  const langs = detectLanguages('/nonexistent/path/that/does/not/exist');
  assert.ok(Array.isArray(langs), 'Returns array for non-existent path');
  console.log('# detectLanguages - non-existent directory');
}

// ── CR5-s4: additive UNION with the capability registry ──────────────────────
// stack-detector now UNIONs in capability-registry.detectLanguages so it sees the
// registry-only languages (c, cpp, sql, r, scala, lua, objectivec) it never had —
// additively, without losing anything it already detected.

function testDetectLanguagesCViaRegistry() {
  setupTempDir();
  // A C project: Makefile marker + a .c source. stack-detector alone never had `c`;
  // the registry (c.yaml → [Makefile, *.c, *.h]) supplies it via the union.
  createTempFile('Makefile', 'all:\n\tcc main.c -o main\n');
  createTempFile('main.c', 'int main(void){return 0;}\n');

  const langs = detectLanguages(tempDir);
  assert.ok(langs.includes('c'), 'Unions in C from the capability registry');

  cleanupTempDir();
  console.log('# detectLanguages - C via registry union (additive)');
}

function testDetectLanguagesSqlViaRegistry() {
  setupTempDir();
  // A dbt project: dbt_project.yml → sql.yaml marker. New language via the union.
  createTempFile('dbt_project.yml', 'name: analytics\nversion: "1.0.0"\n');

  const langs = detectLanguages(tempDir);
  assert.ok(langs.includes('sql'), 'Unions in SQL from the capability registry (dbt)');

  cleanupTempDir();
  console.log('# detectLanguages - SQL via registry union (dbt_project.yml)');
}

function testDetectLanguagesZigSurvivesUnion() {
  setupTempDir();
  // REGRESSION: the registry has NO zig entry — zig exists ONLY in stack-detector's
  // LANGUAGE_PATTERNS (build.zig file marker). The union must not drop it.
  createTempFile('build.zig', 'const std = @import("std");\n');

  const langs = detectLanguages(tempDir);
  assert.ok(langs.includes('zig'), 'zig (stack-detector-only) survives the registry union');

  cleanupTempDir();
  console.log('# detectLanguages - zig survives union (registry lacks zig)');
}

function testDetectLanguagesTsOverJsPreservedAfterUnion() {
  setupTempDir();
  // REGRESSION: the registry returns BOTH javascript and typescript for a
  // package.json + tsconfig.json project (it has no preference logic). The union must
  // NOT re-introduce javascript — the TypeScript-over-JavaScript preference still holds.
  createTempFile('package.json', '{"name": "test"}');
  createTempFile('tsconfig.json', '{}');

  const langs = detectLanguages(tempDir);
  assert.ok(langs.includes('typescript'), 'TypeScript detected');
  assert.ok(!langs.includes('javascript'), 'JavaScript still removed when TypeScript present, even after union');

  cleanupTempDir();
  console.log('# detectLanguages - TS-over-JS preference preserved after union');
}

function testDetectLanguagesExtensionOnlyPythonUnchanged() {
  setupTempDir();
  // TRUTH GUARD: stack-detector's `detectLanguages` iterates only LANGUAGE_PATTERNS
  // `files` — the `extensions` arrays are inert data, never scanned. A lone `foo.py`
  // with NO marker file is therefore detected by NEITHER stack-detector NOR the
  // registry (which has no `*.py` marker). The additive union must not change that.
  // (The plan's claim of "extension-scan" detection here does not match the code;
  //  wiring extension-tree-walking is a separate, out-of-scope slice.)
  createTempFile('foo.py', 'print("hi")\n');

  const langs = detectLanguages(tempDir);
  assert.ok(Array.isArray(langs), 'Returns array');
  assert.ok(!langs.includes('python'), 'extension-only .py is not detected (no marker; extensions are inert) — union does not change this');

  cleanupTempDir();
  console.log('# detectLanguages - extension-only python unchanged by union');
}

// ============================================
// detectFrameworks Tests
// ============================================

function testDetectFrameworksFromFiles() {
  setupTempDir();
  createTempFile('package.json', '{"name": "test"}');
  createTempFile('tsconfig.json', '{}');
  createTempFile('next.config.js', 'module.exports = {}');

  const langs = detectLanguages(tempDir);
  const frameworks = detectFrameworks(tempDir, langs);
  assert.ok(frameworks.includes('next.js'), 'Detects Next.js from config file');

  cleanupTempDir();
  console.log('# detectFrameworks - file-based detection');
}

function testDetectFrameworksFromDeps() {
  setupTempDir();
  createTempFile('package.json', JSON.stringify({
    name: 'test',
    dependencies: {
      'react': '^18.0.0'
    }
  }));
  createTempFile('tsconfig.json', '{}');

  const langs = detectLanguages(tempDir);
  const frameworks = detectFrameworks(tempDir, langs);
  assert.ok(frameworks.includes('react'), 'Detects React from deps');

  cleanupTempDir();
  console.log('# detectFrameworks - dependency-based detection (TypeScript)');
}

function testDetectFrameworksExpressJS() {
  setupTempDir();
  createTempFile('package.json', JSON.stringify({
    name: 'test',
    dependencies: {
      'express': '^4.18.0'
    }
  }));
  // No tsconfig.json - pure JavaScript project

  const langs = detectLanguages(tempDir);
  const frameworks = detectFrameworks(tempDir, langs);
  assert.ok(langs.includes('javascript'), 'Detects JavaScript');
  assert.ok(frameworks.includes('express'), 'Detects Express from deps');

  cleanupTempDir();
  console.log('# detectFrameworks - Express.js (JavaScript)');
}

function testDetectFrameworksFromDevDeps() {
  setupTempDir();
  createTempFile('package.json', JSON.stringify({
    name: 'test',
    devDependencies: {
      'react': '^18.0.0'
    }
  }));
  createTempFile('tsconfig.json', '{}');

  const langs = detectLanguages(tempDir);
  const frameworks = detectFrameworks(tempDir, langs);
  assert.ok(frameworks.includes('react'), 'Detects React from devDependencies');

  cleanupTempDir();
  console.log('# detectFrameworks - devDependencies detection');
}

function testDetectFrameworksPythonDeps() {
  setupTempDir();
  createTempFile('requirements.txt', 'fastapi==0.100.0\nuvicorn\n');

  const langs = detectLanguages(tempDir);
  const frameworks = detectFrameworks(tempDir, langs);
  assert.ok(frameworks.includes('fastapi'), 'Detects FastAPI from requirements.txt');

  cleanupTempDir();
  console.log('# detectFrameworks - Python requirements.txt');
}

function testDetectFrameworksDjango() {
  setupTempDir();
  createTempFile('requirements.txt', 'django==4.0\n');
  createTempFile('manage.py', '#!/usr/bin/env python');

  const langs = detectLanguages(tempDir);
  const frameworks = detectFrameworks(tempDir, langs);
  assert.ok(frameworks.includes('django'), 'Detects Django from manage.py and deps');

  cleanupTempDir();
  console.log('# detectFrameworks - Django detection');
}

function testDetectFrameworksDocker() {
  setupTempDir();
  createTempFile('Dockerfile', 'FROM node:18');

  const langs = detectLanguages(tempDir);
  const frameworks = detectFrameworks(tempDir, langs);
  assert.ok(frameworks.includes('docker'), 'Detects Docker from Dockerfile');

  cleanupTempDir();
  console.log('# detectFrameworks - Docker detection (no language required)');
}

function testDetectFrameworksKubernetes() {
  setupTempDir();
  createTempFile('deployment.yaml', 'apiVersion: apps/v1\nkind: Deployment');

  const langs = detectLanguages(tempDir);
  const frameworks = detectFrameworks(tempDir, langs);
  assert.ok(frameworks.includes('kubernetes'), 'Detects Kubernetes from deployment.yaml');

  cleanupTempDir();
  console.log('# detectFrameworks - Kubernetes detection');
}

function testDetectFrameworksLanguageFilter() {
  setupTempDir();
  // Create Python project with Node.js framework deps in requirements
  createTempFile('requirements.txt', 'flask\n');
  // React should not be detected since JavaScript is not in languages

  const langs = detectLanguages(tempDir);
  const frameworks = detectFrameworks(tempDir, langs);
  assert.ok(!frameworks.includes('react'), 'Does not detect React without JS language');

  cleanupTempDir();
  console.log('# detectFrameworks - respects language filter');
}

function testDetectFrameworksAutoDetectsLanguages() {
  setupTempDir();
  createTempFile('requirements.txt', 'flask\n');

  // Don't pass languages - should auto-detect
  const frameworks = detectFrameworks(tempDir);
  assert.ok(frameworks.includes('flask'), 'Auto-detects languages when not provided');

  cleanupTempDir();
  console.log('# detectFrameworks - auto-detects languages');
}

function testDetectFrameworksEmptyDir() {
  setupTempDir();

  const frameworks = detectFrameworks(tempDir, []);
  assert.ok(Array.isArray(frameworks), 'Returns array');
  assert.strictEqual(frameworks.length, 0, 'Empty array for empty dir');

  cleanupTempDir();
  console.log('# detectFrameworks - empty directory');
}

// ============================================
// detectStack Tests
// ============================================

function testDetectStackStructure() {
  setupTempDir();
  createTempFile('package.json', JSON.stringify({
    name: 'test',
    dependencies: { react: '^18.0.0' }
  }));
  createTempFile('tsconfig.json', '{}');

  const stack = detectStack(tempDir);

  assert.ok(Object.prototype.hasOwnProperty.call(stack, 'project'), 'Has project property');
  assert.ok(Object.prototype.hasOwnProperty.call(stack, 'languages'), 'Has languages property');
  assert.ok(Object.prototype.hasOwnProperty.call(stack, 'frameworks'), 'Has frameworks property');
  assert.ok(Object.prototype.hasOwnProperty.call(stack, 'primary'), 'Has primary property');
  assert.ok(Object.prototype.hasOwnProperty.call(stack.primary, 'language'), 'Has primary.language');
  assert.ok(Object.prototype.hasOwnProperty.call(stack.primary, 'framework'), 'Has primary.framework');

  cleanupTempDir();
  console.log('# detectStack - return structure');
}

function testDetectStackProject() {
  setupTempDir();

  const stack = detectStack(tempDir);
  assert.strictEqual(stack.project, tempDir, 'Project path is correct');

  cleanupTempDir();
  console.log('# detectStack - project path');
}

function testDetectStackPrimary() {
  setupTempDir();
  createTempFile('package.json', JSON.stringify({
    name: 'test',
    dependencies: {
      next: '^14.0.0',
      react: '^18.0.0'
    }
  }));
  createTempFile('tsconfig.json', '{}');

  const stack = detectStack(tempDir);

  assert.strictEqual(stack.primary.language, 'typescript', 'Primary language is first in array');
  assert.ok(stack.primary.framework !== null, 'Primary framework is set');

  cleanupTempDir();
  console.log('# detectStack - primary language and framework');
}

function testDetectStackEmptyPrimary() {
  setupTempDir();

  const stack = detectStack(tempDir);

  assert.strictEqual(stack.primary.language, null, 'Primary language is null when empty');
  assert.strictEqual(stack.primary.framework, null, 'Primary framework is null when empty');

  cleanupTempDir();
  console.log('# detectStack - null primary for empty project');
}

function testDetectStackDefaultsToCurrentDir() {
  // This test verifies the function works with no arguments
  // We can't easily test process.cwd() behavior without changing dir
  const stack = detectStack();

  assert.ok(Object.prototype.hasOwnProperty.call(stack, 'project'), 'Works with no arguments');
  assert.ok(stack.project, 'Project is set to some path');

  console.log('# detectStack - defaults to current directory');
}

// ============================================
// Real Project Tests (ctoc-build)
// ============================================

function testRealProjectCtocBuild() {
  const ctocBuildPath = '/home/tijn/ctoc-build';

  if (!fs.existsSync(ctocBuildPath)) {
    console.log('# Real project test - SKIPPED (ctoc-build not found)');
    return;
  }

  const stack = detectStack(ctocBuildPath);

  assert.ok(Array.isArray(stack.languages), 'Languages is array');
  assert.ok(Array.isArray(stack.frameworks), 'Frameworks is array');
  assert.strictEqual(stack.project, ctocBuildPath, 'Project path matches');

  console.log('# detectStack - real project ctoc-build');
}

function testRealProjectCtocPublic() {
  const ctocPublicPath = '/home/tijn/ctoc-build/ctoc-public';

  if (!fs.existsSync(ctocPublicPath)) {
    console.log('# Real project test - SKIPPED (ctoc-public not found)');
    return;
  }

  const stack = detectStack(ctocPublicPath);

  assert.ok(Array.isArray(stack.languages), 'Languages is array');
  assert.ok(Array.isArray(stack.frameworks), 'Frameworks is array');
  assert.strictEqual(stack.project, ctocPublicPath, 'Project path matches');

  // ctoc-public doesn't have package.json, so it shouldn't detect JS
  // But if it does in the future, that's fine too
  console.log('# detectStack - real project ctoc-public');
}

// ============================================
// Edge Cases
// ============================================

function testMalformedPackageJson() {
  setupTempDir();
  createTempFile('package.json', 'not valid json {{{');

  const langs = detectLanguages(tempDir);
  const frameworks = detectFrameworks(tempDir, langs);

  assert.ok(langs.includes('javascript'), 'Detects JS even with malformed package.json');
  assert.ok(Array.isArray(frameworks), 'Returns empty array for malformed JSON');

  cleanupTempDir();
  console.log('# Edge case - malformed package.json');
}

function testEmptyPackageJson() {
  setupTempDir();
  createTempFile('package.json', '{}');

  const langs = detectLanguages(tempDir);
  const frameworks = detectFrameworks(tempDir, langs);

  assert.ok(langs.includes('javascript'), 'Detects JS with empty package.json');
  assert.strictEqual(frameworks.length, 0, 'No frameworks with empty deps');

  cleanupTempDir();
  console.log('# Edge case - empty package.json');
}

function testPythonVersionSpecifiers() {
  setupTempDir();
  createTempFile('requirements.txt', 'flask>=2.0.0\ndjango<5.0\nfastapi==0.100.0\nrequests~=2.28');

  const langs = detectLanguages(tempDir);
  const frameworks = detectFrameworks(tempDir, langs);

  assert.ok(frameworks.includes('flask'), 'Handles >= specifier');
  assert.ok(frameworks.includes('django'), 'Handles < specifier');
  assert.ok(frameworks.includes('fastapi'), 'Handles == specifier');

  cleanupTempDir();
  console.log('# Edge case - Python version specifiers');
}

function testRequirementsTxtWithComments() {
  setupTempDir();
  createTempFile('requirements.txt', '# Comment line\nflask\n\n# Another comment\n');

  const langs = detectLanguages(tempDir);
  const frameworks = detectFrameworks(tempDir, langs);

  assert.ok(frameworks.includes('flask'), 'Handles comments in requirements.txt');

  cleanupTempDir();
  console.log('# Edge case - requirements.txt with comments');
}

// ============================================
// F1 — Python deps beyond requirements.txt
// (pyproject.toml PEP 621 + poetry, Pipfile)
// ============================================

function testPyprojectPep621Deps() {
  setupTempDir();
  // PEP 621 [project].dependencies as an array of PEP 508 requirement strings.
  createTempFile('pyproject.toml',
    '[project]\nname = "svc"\nversion = "0.1.0"\ndependencies = [\n  "fastapi",\n  "psycopg2-binary>=2.9",\n]\n');

  const stack = detectStack(tempDir);
  assert.ok(stack.languages.includes('python'), 'Detects python from pyproject.toml');
  assert.ok(stack.frameworks.includes('fastapi'), 'Legacy frameworks detects fastapi from pyproject dependencies');
  assert.ok(stack.frameworkCapabilities.some(f => f.name === 'fastapi'),
    'frameworkCapabilities includes fastapi from PEP 621 dependencies');
  assert.ok(stack.databases.some(d => d.name === 'postgresql'),
    'databases includes postgresql from psycopg2-binary in pyproject');

  cleanupTempDir();
  console.log('# F1 - pyproject.toml PEP 621 dependencies parsed');
}

function testPyprojectPoetryDeps() {
  setupTempDir();
  // Poetry table: [tool.poetry.dependencies] is name = version (python excluded).
  createTempFile('pyproject.toml',
    '[tool.poetry]\nname = "svc"\n\n[tool.poetry.dependencies]\npython = "^3.11"\ndjango = "^4.2"\n');

  const stack = detectStack(tempDir);
  assert.ok(stack.languages.includes('python'), 'Detects python from pyproject.toml (poetry)');
  assert.ok(stack.frameworks.includes('django'), 'Detects django from [tool.poetry.dependencies]');
  assert.ok(stack.frameworkCapabilities.some(f => f.name === 'django'),
    'frameworkCapabilities includes django from poetry table');

  cleanupTempDir();
  console.log('# F1 - pyproject.toml [tool.poetry.dependencies] parsed');
}

function testPipfileDeps() {
  setupTempDir();
  // Pipfile [packages] table.
  createTempFile('Pipfile',
    '[[source]]\nname = "pypi"\nurl = "https://pypi.org/simple"\n\n[packages]\nflask = "*"\n\n[dev-packages]\npytest = "*"\n');

  const stack = detectStack(tempDir);
  assert.ok(stack.languages.includes('python'), 'Detects python from Pipfile');
  assert.ok(stack.frameworks.includes('flask'), 'Detects flask from Pipfile [packages]');
  assert.ok(stack.frameworkCapabilities.some(f => f.name === 'flask'),
    'frameworkCapabilities includes flask from Pipfile');

  cleanupTempDir();
  console.log('# F1 - Pipfile [packages] parsed');
}

// ============================================
// F2 — requirements.txt operator whitespace, extras, markers
// ============================================

function testRequirementsWhitespaceAroundOperator() {
  setupTempDir();
  createTempFile('requirements.txt', 'flask == 3.0\nfastapi>=0.1\n');

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('flask'), 'flask detected despite whitespace around ==');
  assert.ok(stack.frameworks.includes('fastapi'), 'fastapi still detected alongside');

  cleanupTempDir();
  console.log('# F2 - requirements.txt whitespace around operator');
}

function testRequirementsExtrasAndMarkers() {
  setupTempDir();
  createTempFile('requirements.txt',
    'flask[async] >= 3.0\nfastapi ; python_version > "3.8"\n');

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('flask'), 'flask detected with extras [async]');
  assert.ok(stack.frameworks.includes('fastapi'), 'fastapi detected with environment marker');

  cleanupTempDir();
  console.log('# F2 - requirements.txt extras + environment markers');
}

// ============================================
// F3 — PEP 503 normalized dep matching (case/separator insensitive)
// ============================================

function testPythonDepCanonicalSpellingNormalized() {
  setupTempDir();
  // Canonical PyPI spellings that the registry does NOT hand-dual-list.
  createTempFile('requirements.txt', 'FastAPI==0.110\nPsycopg2-binary==2.9\n');

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('fastapi'), 'FastAPI normalized to fastapi');
  assert.ok(stack.frameworkCapabilities.some(f => f.name === 'fastapi'),
    'frameworkCapabilities matches FastAPI via normalization');
  assert.ok(stack.databases.some(d => d.name === 'postgresql'),
    'Psycopg2-binary normalized to psycopg2-binary → postgresql');

  cleanupTempDir();
  console.log('# F3 - python dep names normalized (PEP 503)');
}

function testNodeDepCaseNormalized() {
  setupTempDir();
  // Non-canonical casing on a node dep still matches after normalization.
  createTempFile('package.json', JSON.stringify({
    name: 'test',
    dependencies: { 'React': '^18.0.0' }
  }));
  createTempFile('tsconfig.json', '{}');

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('react'), 'React (mixed case) normalized to react');

  cleanupTempDir();
  console.log('# F3 - node dep names normalized (lowercase)');
}

// ============================================
// F4 — monorepo / workspace dependency detection
// ============================================

function testWorkspaceArrayFormDeps() {
  setupTempDir();
  createTempFile('package.json', JSON.stringify({
    name: 'root', private: true, workspaces: ['packages/*']
  }));
  createTempFile('tsconfig.json', '{}');
  createTempFile('packages/web/package.json', JSON.stringify({
    name: 'web', dependencies: { next: '^15.0.0', react: '^18.0.0' }
  }));

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('next.js'), 'next.js detected from workspace package');
  assert.ok(stack.frameworks.includes('react'), 'react detected from workspace package');
  assert.ok(stack.frameworkCapabilities.some(f => f.name === 'nextjs'),
    'frameworkCapabilities includes nextjs from workspace');

  cleanupTempDir();
  console.log('# F4 - workspaces array form merges workspace deps');
}

function testWorkspaceObjectFormDeps() {
  setupTempDir();
  createTempFile('package.json', JSON.stringify({
    name: 'root', private: true, workspaces: { packages: ['apps/*'] }
  }));
  createTempFile('apps/api/package.json', JSON.stringify({
    name: 'api', dependencies: { express: '^4.18.0' }
  }));

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('express'), 'express detected from workspaces object form');

  cleanupTempDir();
  console.log('# F4 - workspaces object form merges workspace deps');
}

// ============================================
// F1(defect) — quote-aware multiline-array terminator in parsePyprojectDeps
// An extras bracket `]` inside a quoted value (uvicorn[standard], django[argon2])
// must NOT end the multiline `dependencies` array early and drop later deps.
// ============================================

function testPyprojectExtrasMultilineKeepsLaterDeps() {
  setupTempDir();
  // uvicorn[standard] has a `]` INSIDE a quoted value; fastapi follows on the next line.
  createTempFile('pyproject.toml',
    '[project]\nname = "svc"\ndependencies = [\n  "uvicorn[standard]",\n  "fastapi"\n]\n');

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('fastapi'),
    'fastapi (after an extras dep) survives — extras `]` does not end the array');

  cleanupTempDir();
  console.log('# F1(defect) - extras `]` in multiline array does not drop later deps');
}

function testPyprojectExtrasMultilineThreeDeps() {
  setupTempDir();
  createTempFile('pyproject.toml',
    '[project]\nname = "svc"\ndependencies = [\n  "flask",\n  "django[argon2]",\n  "fastapi"\n]\n');

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('flask'), 'flask (before extras dep) present');
  assert.ok(stack.frameworks.includes('django'), 'django[argon2] itself parsed');
  assert.ok(stack.frameworks.includes('fastapi'), 'fastapi (after extras dep) not dropped');

  cleanupTempDir();
  console.log('# F1(defect) - three deps with a middle extras dep all parsed');
}

function testPyprojectExtrasOnOpeningLine() {
  setupTempDir();
  // Extras bracket on the SAME line that opens the array — must still stay open.
  createTempFile('pyproject.toml',
    '[project]\nname = "svc"\ndependencies = ["flask[async]",\n  "fastapi"\n]\n');

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('flask'), 'flask[async] on opening line parsed');
  assert.ok(stack.frameworks.includes('fastapi'), 'fastapi on next line not dropped by opening-line extras');

  cleanupTempDir();
  console.log('# F1(defect) - extras `]` on the array-opening line keeps array open');
}

function testPyprojectOptionalExtrasKeepsLaterDeps() {
  setupTempDir();
  createTempFile('pyproject.toml',
    '[project]\nname = "svc"\ndependencies = [\n  "flask"\n]\n\n' +
    '[project.optional-dependencies]\ndev = [\n  "pytest[xdist]",\n  "fastapi"\n]\n');

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('flask'), 'main dep flask parsed');
  assert.ok(stack.frameworks.includes('fastapi'),
    'fastapi after pytest[xdist] in optional-dependencies not dropped');

  cleanupTempDir();
  console.log('# F1(defect) - extras `]` in optional-dependencies array does not drop later deps');
}

function testPyprojectSingleLineExtrasControl() {
  setupTempDir();
  // CONTROL: single-line array with extras still yields all deps (stays green).
  createTempFile('pyproject.toml',
    '[project]\nname = "svc"\ndependencies = ["uvicorn[standard]", "fastapi"]\n');

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('fastapi'), 'single-line extras array keeps fastapi');

  cleanupTempDir();
  console.log('# F1(defect) - control: single-line extras array unaffected');
}

// ============================================
// F2(defect) — legacy [tool.poetry.dev-dependencies] table read
// ============================================

function testPoetryLegacyDevDependencies() {
  setupTempDir();
  // Pre-Poetry-1.2 dev table (deprecated, still common). django lives ONLY here.
  createTempFile('pyproject.toml',
    '[tool.poetry]\nname = "svc"\n\n[tool.poetry.dependencies]\npython = "^3.11"\n\n' +
    '[tool.poetry.dev-dependencies]\ndjango = "^4.2"\n');

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('django'),
    'django from legacy [tool.poetry.dev-dependencies] detected');

  cleanupTempDir();
  console.log('# F2(defect) - legacy [tool.poetry.dev-dependencies] parsed');
}

function testPoetryModernDevGroupStillWorks() {
  setupTempDir();
  // CONTROL: modern group form still works alongside the legacy fix.
  createTempFile('pyproject.toml',
    '[tool.poetry]\nname = "svc"\n\n[tool.poetry.dependencies]\npython = "^3.11"\n\n' +
    '[tool.poetry.group.dev.dependencies]\nflask = "^3.0"\n');

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('flask'),
    'flask from modern [tool.poetry.group.dev.dependencies] still detected');

  cleanupTempDir();
  console.log('# F2(defect) - control: modern poetry dev group still parsed');
}

// ============================================
// F3(defect) — workspace path traversal containment
// A `workspaces: ["../evil"]` entry must NOT read a package.json outside the root.
// ============================================

function testWorkspaceOutsideRootNotRead() {
  setupTempDir();
  // Sibling of tempDir, referenced via `../evil` — OUTSIDE the project root.
  const outsideDir = path.join(tempDir, '..', 'evil');
  fs.mkdirSync(outsideDir, { recursive: true });
  fs.writeFileSync(path.join(outsideDir, 'package.json'), JSON.stringify({
    name: 'evil', dependencies: { react: '^18.0.0' }
  }));

  createTempFile('package.json', JSON.stringify({
    name: 'root', private: true, workspaces: ['../evil']
  }));
  createTempFile('tsconfig.json', '{}');

  const stack = detectStack(tempDir);
  // Clean the outside dir before asserting so a failure never leaks it.
  fs.rmSync(outsideDir, { recursive: true, force: true });

  assert.ok(!stack.frameworks.includes('react'),
    'react from an OUTSIDE ../evil package.json is NOT read (containment enforced)');

  cleanupTempDir();
  console.log('# F3(defect) - workspace outside project root is not read');
}

function testWorkspaceInsideStillWorksWithContainment() {
  setupTempDir();
  // CONTROL: a legit inside `packages/*` workspace still resolves after containment.
  createTempFile('package.json', JSON.stringify({
    name: 'root', private: true, workspaces: ['packages/*']
  }));
  createTempFile('tsconfig.json', '{}');
  createTempFile('packages/web/package.json', JSON.stringify({
    name: 'web', dependencies: { react: '^18.0.0' }
  }));

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('react'),
    'inside packages/* workspace still detected with containment on');

  cleanupTempDir();
  console.log('# F3(defect) - control: inside workspace still works');
}

// ============================================
// F4(defect) — recursive `**` workspace glob
// ============================================

function testWorkspaceRecursiveGlob() {
  setupTempDir();
  createTempFile('package.json', JSON.stringify({
    name: 'root', private: true, workspaces: ['packages/**']
  }));
  createTempFile('tsconfig.json', '{}');
  // Nested two levels deep — only a recursive `**` walk reaches it.
  createTempFile('packages/a/b/package.json', JSON.stringify({
    name: 'deep', dependencies: { react: '^18.0.0' }
  }));

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('react'),
    'react from a nested packages/a/b package.json detected via recursive `**`');

  cleanupTempDir();
  console.log('# F4(defect) - recursive `**` workspace glob reaches nested packages');
}

// ============================================
// F5 — null-prototype deps object (no prototype landmine)
// ============================================

function testNodeDepsNullPrototype() {
  setupTempDir();
  createTempFile('package.json', JSON.stringify({
    name: 'test', dependencies: { express: '^4.18.0' }
  }));

  const deps = readPackageDeps(tempDir);
  assert.strictEqual(Object.getPrototypeOf(deps), null, 'nodeDeps has null prototype');
  assert.strictEqual(deps.toString, undefined, 'no inherited toString on deps');
  assert.strictEqual(deps.constructor, undefined, 'no inherited constructor on deps');
  assert.ok(deps.express, 'real dependency present');

  cleanupTempDir();
  console.log('# F5 - readPackageDeps returns null-prototype object');
}

// ============================================
// F6 — peer / optional dependencies read
// ============================================

function testPeerDependenciesDetected() {
  setupTempDir();
  createTempFile('package.json', JSON.stringify({
    name: 'test', peerDependencies: { react: '^18.0.0' }
  }));
  createTempFile('tsconfig.json', '{}');

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('react'), 'react detected from peerDependencies');

  cleanupTempDir();
  console.log('# F6 - peerDependencies detected');
}

function testOptionalDependenciesDetected() {
  setupTempDir();
  createTempFile('package.json', JSON.stringify({
    name: 'test', optionalDependencies: { vue: '^3.0.0' }
  }));
  createTempFile('tsconfig.json', '{}');

  const stack = detectStack(tempDir);
  assert.ok(stack.frameworks.includes('vue'), 'vue detected from optionalDependencies');

  cleanupTempDir();
  console.log('# F6 - optionalDependencies detected');
}

// ============================================
// Run All Tests
// ============================================

console.log('\nStack Detector Tests\n');
console.log('='.repeat(50));

// matchGlob tests
console.log('\n## matchGlob\n');
testMatchGlobExactMatch();
testMatchGlobWildcard();
testMatchGlobQuestionMark();
testMatchGlobSpecialChars();

// Pattern structure tests
console.log('\n## Pattern Constants\n');
testLanguagePatternsStructure();
testLanguagePatternsCommonLanguages();
testFrameworkPatternsStructure();
testFrameworkPatternsCommonFrameworks();

// detectLanguages tests
console.log('\n## detectLanguages\n');
testDetectLanguagesPython();
testDetectLanguagesJavaScript();
testDetectLanguagesTypeScript();
testDetectLanguagesGo();
testDetectLanguagesRust();
testDetectLanguagesJava();
testDetectLanguagesRuby();
testDetectLanguagesCSharp();
testDetectLanguagesMultiple();
testDetectLanguagesEmptyDir();
testDetectLanguagesNonExistentDir();
testDetectLanguagesCViaRegistry();
testDetectLanguagesSqlViaRegistry();
testDetectLanguagesZigSurvivesUnion();
testDetectLanguagesTsOverJsPreservedAfterUnion();
testDetectLanguagesExtensionOnlyPythonUnchanged();

// detectFrameworks tests
console.log('\n## detectFrameworks\n');
testDetectFrameworksFromFiles();
testDetectFrameworksFromDeps();
testDetectFrameworksExpressJS();
testDetectFrameworksFromDevDeps();
testDetectFrameworksPythonDeps();
testDetectFrameworksDjango();
testDetectFrameworksDocker();
testDetectFrameworksKubernetes();
testDetectFrameworksLanguageFilter();
testDetectFrameworksAutoDetectsLanguages();
testDetectFrameworksEmptyDir();

// detectStack tests
console.log('\n## detectStack\n');
testDetectStackStructure();
testDetectStackProject();
testDetectStackPrimary();
testDetectStackEmptyPrimary();
testDetectStackDefaultsToCurrentDir();

// Real project tests
console.log('\n## Real Projects\n');
testRealProjectCtocBuild();
testRealProjectCtocPublic();

// Edge cases
console.log('\n## Edge Cases\n');
testMalformedPackageJson();
testEmptyPackageJson();
testPythonVersionSpecifiers();
testRequirementsTxtWithComments();

// F1 — python deps beyond requirements.txt
console.log('\n## F1 - pyproject.toml / Pipfile python deps\n');
testPyprojectPep621Deps();
testPyprojectPoetryDeps();
testPipfileDeps();

// F2 — requirements.txt operator whitespace / extras / markers
console.log('\n## F2 - requirements.txt parsing robustness\n');
testRequirementsWhitespaceAroundOperator();
testRequirementsExtrasAndMarkers();

// F3 — normalized dep matching
console.log('\n## F3 - PEP 503 normalized dep matching\n');
testPythonDepCanonicalSpellingNormalized();
testNodeDepCaseNormalized();

// F4 — workspace / monorepo deps
console.log('\n## F4 - monorepo workspace deps\n');
testWorkspaceArrayFormDeps();
testWorkspaceObjectFormDeps();

// F1(defect) — quote-aware multiline-array terminator
console.log('\n## F1(defect) - quote-aware pyproject array terminator\n');
testPyprojectExtrasMultilineKeepsLaterDeps();
testPyprojectExtrasMultilineThreeDeps();
testPyprojectExtrasOnOpeningLine();
testPyprojectOptionalExtrasKeepsLaterDeps();
testPyprojectSingleLineExtrasControl();

// F2(defect) — legacy poetry dev-dependencies
console.log('\n## F2(defect) - legacy poetry dev-dependencies\n');
testPoetryLegacyDevDependencies();
testPoetryModernDevGroupStillWorks();

// F3(defect) — workspace path traversal containment
console.log('\n## F3(defect) - workspace containment\n');
testWorkspaceOutsideRootNotRead();
testWorkspaceInsideStillWorksWithContainment();

// F4(defect) — recursive `**` workspace glob
console.log('\n## F4(defect) - recursive workspace glob\n');
testWorkspaceRecursiveGlob();

// F5 — null-prototype deps object
console.log('\n## F5 - null-prototype deps\n');
testNodeDepsNullPrototype();

// F6 — peer / optional dependencies
console.log('\n## F6 - peer / optional dependencies\n');
testPeerDependenciesDetected();
testOptionalDependenciesDetected();

console.log('\n' + '='.repeat(50));
console.log('All stack-detector tests passed!\n');
