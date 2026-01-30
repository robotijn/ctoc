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
  matchGlob
} = require('../lib/stack-detector');

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
    assert.ok(config.hasOwnProperty('language'), `${framework} has language property`);
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

  assert.ok(stack.hasOwnProperty('project'), 'Has project property');
  assert.ok(stack.hasOwnProperty('languages'), 'Has languages property');
  assert.ok(stack.hasOwnProperty('frameworks'), 'Has frameworks property');
  assert.ok(stack.hasOwnProperty('primary'), 'Has primary property');
  assert.ok(stack.primary.hasOwnProperty('language'), 'Has primary.language');
  assert.ok(stack.primary.hasOwnProperty('framework'), 'Has primary.framework');

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

  assert.ok(stack.hasOwnProperty('project'), 'Works with no arguments');
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

console.log('\n' + '='.repeat(50));
console.log('All stack-detector tests passed!\n');
