'use strict';

/**
 * THE PROJECT-TYPE DIMENSION (CR3) — a language tells you the toolchain; a project
 * TYPE tells you which phases matter, the run strategy, and the config scaffold.
 * A Flutter app, a Rust CLI, a data-science notebook and a microservice monorepo
 * need different pipelines even in the same language.
 *
 * These tests prove:
 *   • loadProjectTypes — all 13 bundled project types load, zero warnings, and each
 *     carries the required contract (projectType + phases + run + configScaffold).
 *   • projectTypeFor — data-driven marker detection with priority (a monorepo marker
 *     beats a plain package.json; infra beats a bare source tree; a publish-config
 *     marks a library — the honest "no runtime" type).
 *   • pipelineFor — MERGES a language's toolchain commands with a project type's
 *     phase-relevance + run strategy + scaffold union. Honest run: library
 *     honest:false (no runtime), web-backend honest:true, mobile build-is-last-mile.
 *   • WIRED — app-runner's detectRunTarget consumes projectTypeFor + pipelineFor for
 *     richer native run evidence (the new engine functions are LIVE, not test-only).
 *
 * ZERO DOUBLES: every filesystem case builds a REAL project dir on disk and reads
 * the REAL bundled project-type YAML. Nothing is mocked.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const registry = require('../src/lib/capability-registry');

const THE_13 = [
  'web-frontend', 'web-backend', 'mobile-crossplatform', 'mobile-native-android',
  'mobile-native-ios', 'desktop', 'cli', 'library', 'data-science', 'ml-service',
  'microservice', 'monorepo', 'infra'
];
const HONEST_VALUES = new Set([true, false, 'build-is-last-mile', 'notebook-executes', 'per-workspace']);

/** Make a fresh temp project dir. */
function makeProject(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
/** Remove a temp dir, best-effort. */
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe('capability-registry: loadProjectTypes() — the 13 bundled project types', () => {
  it('loads all 13 bundled project types with zero warnings', () => {
    const reg = registry.loadProjectTypes();
    assert.ok(reg && typeof reg === 'object', 'loadProjectTypes must return an object');
    assert.ok(reg.projectTypes && typeof reg.projectTypes === 'object', 'must return a projectTypes map');
    for (const t of THE_13) {
      assert.ok(reg.projectTypes[t], `bundled data must include the project type "${t}"`);
    }
    assert.equal(Object.keys(reg.projectTypes).length, THE_13.length, 'exactly the 13 project types ship');
    assert.ok(Array.isArray(reg.warnings), 'must expose a warnings array');
    assert.deepEqual(reg.warnings, [], 'the shipped project-type data must load with zero warnings');
  });

  it('every project type declares phases + run + configScaffold, with an honest run flag', () => {
    const { projectTypes } = registry.loadProjectTypes();
    for (const [name, t] of Object.entries(projectTypes)) {
      assert.equal(t.projectType, name, `${name}: projectType key must match the declared name`);
      assert.ok(t.phases && typeof t.phases === 'object' && !Array.isArray(t.phases), `${name}: phases must be an object`);
      assert.ok(t.run && typeof t.run === 'object', `${name}: run must be an object`);
      assert.ok(Array.isArray(t.configScaffold) && t.configScaffold.length > 0, `${name}: configScaffold must be a non-empty array`);
      assert.ok(HONEST_VALUES.has(t.run.honest), `${name}: run.honest must be an honest flag, saw "${t.run.honest}"`);
      // Every phase-relevance is a recognized relevance token — never a fabricated status.
      for (const [phase, rel] of Object.entries(t.phases)) {
        assert.ok(
          ['required', 'recommended', 'optional', 'skip'].includes(rel),
          `${name}.${phase} relevance must be required|recommended|optional|skip, saw "${rel}"`
        );
      }
    }
  });

  it('the honest-run invariant: library has NO runtime (honest:false), web-backend genuinely runs (honest:true)', () => {
    const { projectTypes } = registry.loadProjectTypes();
    assert.equal(projectTypes.library.run.honest, false, 'a library has no human-facing runtime — never a false "it ran"');
    assert.equal(projectTypes['web-backend'].run.honest, true, 'a web-backend server genuinely runs and can be probed');
    assert.equal(projectTypes['mobile-crossplatform'].run.honest, 'build-is-last-mile', 'a mobile build is the CI-safe last mile, not a live launch');
    assert.equal(projectTypes.infra.run.honest, false, 'infra has no app-sense runtime');
  });
});

describe('capability-registry: projectTypeFor() — data-driven marker detection with priority', () => {
  it('detects mobile-crossplatform from a pubspec.yaml', () => {
    const dir = makeProject('ctoc-pt-flutter-');
    try {
      fs.writeFileSync(path.join(dir, 'pubspec.yaml'), 'name: x\n');
      assert.equal(registry.projectTypeFor(dir), 'mobile-crossplatform');
    } finally { rm(dir); }
  });

  it('detects monorepo from a turbo.json even when a package.json is present (priority beats web types)', () => {
    const dir = makeProject('ctoc-pt-mono-');
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"root"}\n');
      fs.writeFileSync(path.join(dir, 'turbo.json'), '{"pipeline":{}}\n');
      assert.equal(registry.projectTypeFor(dir), 'monorepo');
    } finally { rm(dir); }
  });

  it('detects infra from a main.tf', () => {
    const dir = makeProject('ctoc-pt-infra-');
    try {
      fs.writeFileSync(path.join(dir, 'main.tf'), 'resource "null_resource" "x" {}\n');
      assert.equal(registry.projectTypeFor(dir), 'infra');
    } finally { rm(dir); }
  });

  it('detects library from a publish/build config (the honest "no run entry" type)', () => {
    const dir = makeProject('ctoc-pt-lib-');
    try {
      fs.writeFileSync(path.join(dir, 'tsup.config.ts'), 'export default {};\n');
      assert.equal(registry.projectTypeFor(dir), 'library');
    } finally { rm(dir); }
  });

  it('returns null for an empty directory (no markers)', () => {
    const dir = makeProject('ctoc-pt-empty-');
    try {
      assert.equal(registry.projectTypeFor(dir), null);
    } finally { rm(dir); }
  });
});

describe('capability-registry: pipelineFor() — MERGE language toolchain + project-type shape', () => {
  it("pipelineFor('dart','mobile-crossplatform') merges the flutter toolchain with the build-is-last-mile run", () => {
    const p = registry.pipelineFor('dart', 'mobile-crossplatform');
    assert.ok(p, 'the merge must produce a pipeline');
    assert.equal(p.language, 'dart');
    assert.equal(p.projectType, 'mobile-crossplatform');
    // toolchain command comes from the LANGUAGE; relevance comes from the TYPE.
    assert.equal(p.phases.lint.cmd, 'flutter analyze', 'lint cmd is the dart toolchain command');
    assert.equal(p.phases.lint.relevance, 'required', 'lint relevance is the project-type relevance');
    assert.equal(p.phases.security.relevance, 'recommended', 'a mobile app treats security as recommended');
    // run comes from the TYPE (strategy + honest) enriched with the LANGUAGE run command.
    assert.equal(p.run.honest, 'build-is-last-mile', 'mobile run is the honest CI-safe last mile');
    assert.equal(p.run.command, 'flutter run', 'the run command is merged from the dart run shape');
  });

  it('configScaffold is the UNION of the language scaffold and the project-type scaffold', () => {
    const p = registry.pipelineFor('dart', 'mobile-crossplatform');
    assert.ok(p.configScaffold.includes('pubspec.yaml'), 'keeps the shared scaffold file once');
    assert.ok(p.configScaffold.includes('analysis_options.yaml'), 'includes the dart scaffold');
    assert.ok(p.configScaffold.includes('.gitignore'), 'includes the project-type scaffold');
    // union, not duplication: pubspec.yaml appears in both sources but only once.
    assert.equal(p.configScaffold.filter((f) => f === 'pubspec.yaml').length, 1, 'the union de-duplicates shared files');
  });

  it('library merges honest:false (no runtime); web-backend merges honest:true (genuine server)', () => {
    const lib = registry.pipelineFor('typescript', 'library');
    assert.ok(lib, 'a typescript library pipeline must merge');
    assert.equal(lib.run.honest, false, 'a library has no runtime');
    const be = registry.pipelineFor('typescript', 'web-backend');
    assert.equal(be.run.honest, true, 'a web-backend genuinely runs');
    assert.equal(be.run.command, 'npm start', 'the server run command is merged from the typescript run shape');
  });

  it('returns null for an unknown language or an unknown project type', () => {
    assert.equal(registry.pipelineFor('cobol', 'cli'), null, 'unknown language → null');
    assert.equal(registry.pipelineFor('dart', 'nonsense-type'), null, 'unknown project type → null');
  });
});

describe('capability-registry: WIRED into app-runner (the new engine functions are LIVE, not test-only)', () => {
  const appRunner = require('../src/lib/app-runner');

  it('detectRunTarget enriches a native run target with the detected project-type taxonomy + merged pipeline', () => {
    const dir = makeProject('ctoc-wire-pt-flutter-');
    try {
      fs.writeFileSync(path.join(dir, 'pubspec.yaml'), 'name: x\nenvironment:\n  sdk: ">=3.0.0"\n');
      const target = appRunner.detectRunTarget(dir);
      assert.ok(target, 'a pubspec.yaml project is a native run target');
      assert.equal(target.language, 'dart');
      // The PROOF the new exports are live: detectRunTarget consulted projectTypeFor + pipelineFor.
      assert.equal(target.taxonomy, 'mobile-crossplatform', 'detectRunTarget must consult projectTypeFor');
      assert.ok(target.pipeline, 'detectRunTarget must merge a pipeline via pipelineFor');
      assert.equal(target.pipeline.run.honest, 'build-is-last-mile', 'the merged pipeline carries the honest mobile last mile');
    } finally { rm(dir); }
  });

  it('a JS project (package.json shape) is still not a native run target — the taxonomy enrichment does not leak', () => {
    const dir = makeProject('ctoc-wire-pt-js-');
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 's', scripts: { dev: 'node s.js' } }));
      assert.equal(appRunner.detectRunTarget(dir), null, 'the JS shape path is unchanged');
    } finally { rm(dir); }
  });
});

// ── fail-open + null-path robustness (CR2/CR3 boundary) ──────────────────────────
// The registry is fail-OPEN: a malformed or oversized override file is skipped with a
// warning, never a throw; an unknown language or project type yields null, never a
// crash. Every case builds a REAL override dir on disk — zero doubles.
describe('capability-registry: fail-open + null paths', () => {
  /** Build a project whose .ctoc/capabilities/<kind>/ override dir holds `files`. */
  function makeOverride(prefix, kind, files) {
    const root = makeProject(prefix);
    const dir = path.join(root, '.ctoc', 'capabilities', kind);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content);
    }
    return root;
  }

  it('a malformed project-type override file is skipped with a warning, not a throw', () => {
    const root = makeOverride('ctoc-pt-bad-', 'project-types', {
      'broken.yaml': 'projectType: broken\n# missing phases/run/configScaffold\n'
    });
    try {
      const { projectTypes, warnings } = registry.loadProjectTypes(root);
      assert.ok(!projectTypes.broken, 'the malformed entry must NOT be registered');
      assert.ok(warnings.some(w => /broken\.yaml/.test(w.file) && /malformed project-type/.test(w.message)),
        'a malformed-entry warning must be recorded');
    } finally { rm(root); }
  });

  it('an oversized project-type override file is skipped with a warning', () => {
    const root = makeOverride('ctoc-pt-big-', 'project-types', {
      'huge.yaml': 'projectType: huge\n' + '#'.repeat(70 * 1024) + '\n'
    });
    try {
      const { projectTypes, warnings } = registry.loadProjectTypes(root);
      assert.ok(!projectTypes.huge, 'the oversized entry must NOT be registered');
      assert.ok(warnings.some(w => /huge\.yaml/.test(w.file) && /too large/.test(w.message)),
        'an oversized-file warning must be recorded');
    } finally { rm(root); }
  });

  it('a malformed language override file is skipped with a warning (fail-open)', () => {
    const root = makeOverride('ctoc-lang-bad-', 'languages', {
      'nolang.yaml': 'detectionMarkers: [x]\n# missing language + toolchain\n'
    });
    try {
      const { warnings } = registry.load(root);
      assert.ok(warnings.some(w => /nolang\.yaml/.test(w.file) && /malformed capability/.test(w.message)),
        'a malformed-capability warning must be recorded');
    } finally { rm(root); }
  });

  it('an oversized language override file is skipped with a warning', () => {
    const root = makeOverride('ctoc-lang-big-', 'languages', {
      'huge.yaml': 'language: huge\n' + '#'.repeat(70 * 1024) + '\n'
    });
    try {
      const { warnings } = registry.load(root);
      assert.ok(warnings.some(w => /huge\.yaml/.test(w.file) && /too large/.test(w.message)),
        'an oversized-file warning must be recorded');
    } finally { rm(root); }
  });

  it('a single-quoted scalar in an override capability parses to its inner value', () => {
    const root = makeOverride('ctoc-lang-sq-', 'languages', {
      'qtest.yaml':
        "language: qtest\n" +
        "detectionMarkers: [qtest.marker]\n" +
        "toolchain:\n" +
        "  lint: { cmd: 'quoted-lint-cmd', tool: qlint, verified: web-2026-07 }\n" +
        "configScaffold: [qtest.config]\n"
    });
    try {
      const { languages } = registry.load(root);
      assert.ok(languages.qtest, 'the valid single-quoted entry must load');
      assert.equal(languages.qtest.toolchain.lint.cmd, 'quoted-lint-cmd',
        'a single-quoted scalar must parse to its unquoted inner value');
    } finally { rm(root); }
  });

  it('pipelineFor returns null for an unknown language', () => {
    assert.equal(registry.pipelineFor('no-such-language', 'library'), null);
  });

  it('pipelineFor returns null for an unknown project type', () => {
    assert.equal(registry.pipelineFor('rust', 'no-such-project-type'), null);
  });

  it('projectTypeFor returns null for an empty root and for a marker-less project', () => {
    assert.equal(registry.projectTypeFor(''), null, 'empty root → null');
    const bare = makeProject('ctoc-pt-bare-');
    try {
      assert.equal(registry.projectTypeFor(bare), null, 'no markers → null');
    } finally { rm(bare); }
  });
});
