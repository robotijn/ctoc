'use strict';

/**
 * THE CAPABILITY REGISTRY — the keystone that all four detection surfaces will
 * consume instead of four drifting language tables (CR1).
 *
 * These tests prove the ENGINE (data-driven, no hardcoded language logic), the
 * SEED DATA (6 web-grounded 2026 toolchains), and three properties the vision
 * makes non-negotiable:
 *   • FAIL-OPEN — a malformed/hostile capability file is SKIPPED + warned, never
 *     fatal, and NEVER executed (the registry RETURNS command strings; it does
 *     not run them — a hostile `.ctoc/capabilities` file must not be RCE).
 *   • PARITY — python/typescript/go lint+test commands match tool-detector's
 *     current DEFAULT_TOOLS, so CR5's later swap is behavior-preserving.
 *   • HONEST RUN — mobile/desktop "run" is build+test as the CI-safe last mile,
 *     flagged, never a false "it ran".
 *
 * ZERO DOUBLES: every filesystem case builds a REAL project dir on disk and reads
 * the REAL bundled seed YAML. Nothing is mocked.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const registry = require('../src/lib/capability-registry');

const SEED_LANGS = ['dart', 'kotlin', 'rust', 'python', 'typescript', 'go'];
const ALLOWED_VERIFIED = new Set(['web-2026-07', 'UNVERIFIED']);

/** Make a fresh temp project dir. */
function makeProject(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
/** Remove a temp dir, best-effort. */
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
/** Write a capability override YAML into a project. */
function writeOverride(dir, name, body) {
  const d = path.join(dir, '.ctoc', 'capabilities', 'languages');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, name), body);
}

describe('capability-registry: load() — data-driven, fail-open', () => {
  it('loads all six seed languages from the bundled data', () => {
    const reg = registry.load();
    assert.ok(reg && typeof reg === 'object', 'load must return an object');
    assert.ok(reg.languages && typeof reg.languages === 'object', 'load must return a languages map');
    for (const lang of SEED_LANGS) {
      assert.ok(reg.languages[lang], `bundled data must include ${lang}`);
    }
    assert.ok(Array.isArray(reg.warnings), 'load must expose a warnings array');
    assert.deepEqual(reg.warnings, [], 'the shipped seed data must load with zero warnings');
  });

  it('a malformed override entry is SKIPPED + warned; valid entries still load', () => {
    const dir = makeProject('ctoc-cap-bad-');
    try {
      // A syntactically broken YAML the tolerant parser cannot make an object of,
      // plus a valid override — the valid one must survive.
      writeOverride(dir, 'broken.yaml', ':::not yaml at all\n\t- [unclosed\n');
      writeOverride(dir, 'elixir.yaml',
        'language: elixir\n' +
        'detectionMarkers: [mix.exs]\n' +
        'extensions: [.ex, .exs]\n' +
        'toolchain:\n' +
        '  lint:  { cmd: "mix credo", tool: credo, verified: UNVERIFIED }\n' +
        '  test:  { cmd: "mix test", tool: mix, verified: UNVERIFIED }\n' +
        'verified: UNVERIFIED\n');
      const reg = registry.load(dir);
      assert.ok(reg.languages.elixir, 'the valid override must load');
      assert.ok(reg.languages.rust, 'bundled languages must still load alongside overrides');
      assert.ok(reg.warnings.length >= 1, 'the malformed entry must produce a warning');
      assert.ok(
        reg.warnings.some((w) => /broken\.yaml/.test(JSON.stringify(w))),
        'the warning must name the offending file'
      );
    } finally { rm(dir); }
  });

  it('NEVER throws on a hostile capability file (fail-open), and returns the cmd as an inert STRING (no RCE)', () => {
    const dir = makeProject('ctoc-cap-hostile-');
    try {
      // A hostile override: a "command" that would be catastrophic if EXECUTED.
      // The registry must RETURN it as a string, never run it.
      writeOverride(dir, 'evil.yaml',
        'language: evil\n' +
        'detectionMarkers: [evil.marker]\n' +
        'extensions: [.evil]\n' +
        'toolchain:\n' +
        '  test:  { cmd: "rm -rf / --no-preserve-root", tool: evil, verified: UNVERIFIED }\n' +
        'verified: UNVERIFIED\n');
      assert.doesNotThrow(() => { registry.load(dir); }, 'load must fail-open, never throw');
      const tc = registry.toolchainFor('evil', 'test', dir);
      assert.equal(typeof tc.cmd, 'string', 'a command is always an inert string');
      assert.equal(tc.cmd, 'rm -rf / --no-preserve-root', 'the string is returned verbatim, never executed');
    } finally { rm(dir); }
  });

  it('the engine contains no dynamic-execution primitive (defense against RCE via data)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'capability-registry.js'), 'utf8');
    for (const banned of ['eval(', 'child_process', 'execSync', 'execFileSync', 'new Function(']) {
      assert.ok(!src.includes(banned), `the registry must not contain ${banned} — it returns commands, it never runs them`);
    }
  });
});

describe('capability-registry: detectLanguages() — data-driven marker detection', () => {
  it('detects rust from a Cargo.toml', () => {
    const dir = makeProject('ctoc-det-rust-');
    try {
      fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\nname = "x"\n');
      assert.deepEqual(registry.detectLanguages(dir), ['rust']);
    } finally { rm(dir); }
  });

  it('detects dart from a pubspec.yaml', () => {
    const dir = makeProject('ctoc-det-dart-');
    try {
      fs.writeFileSync(path.join(dir, 'pubspec.yaml'), 'name: x\n');
      assert.deepEqual(registry.detectLanguages(dir), ['dart']);
    } finally { rm(dir); }
  });

  it('detects kotlin from a build.gradle.kts', () => {
    const dir = makeProject('ctoc-det-kotlin-');
    try {
      fs.writeFileSync(path.join(dir, 'build.gradle.kts'), 'plugins { }\n');
      assert.ok(registry.detectLanguages(dir).includes('kotlin'));
    } finally { rm(dir); }
  });

  it('detects nothing in an empty directory', () => {
    const dir = makeProject('ctoc-det-empty-');
    try {
      assert.deepEqual(registry.detectLanguages(dir), []);
    } finally { rm(dir); }
  });
});

describe('capability-registry: detectLanguages() — GLOB markers (CR5-s1, parity with tool-detector)', () => {
  it('detects csharp from a *.csproj file (glob, not exact filename)', () => {
    const dir = makeProject('ctoc-glob-csproj-');
    try {
      fs.writeFileSync(path.join(dir, 'Foo.csproj'), '<Project Sdk="Microsoft.NET.Sdk" />\n');
      assert.ok(registry.detectLanguages(dir).includes('csharp'),
        'a *.csproj file must detect csharp via the glob marker');
    } finally { rm(dir); }
  });

  it('detects ruby from a *.gemspec file (glob, not exact filename)', () => {
    const dir = makeProject('ctoc-glob-gemspec-');
    try {
      fs.writeFileSync(path.join(dir, 'lib.gemspec'), 'Gem::Specification.new\n');
      assert.ok(registry.detectLanguages(dir).includes('ruby'),
        'a *.gemspec file must detect ruby via the glob marker');
    } finally { rm(dir); }
  });

  it('a C project (main.c + util.h) detects c and NOT cpp', () => {
    const dir = makeProject('ctoc-glob-c-');
    try {
      fs.writeFileSync(path.join(dir, 'main.c'), 'int main(void){return 0;}\n');
      fs.writeFileSync(path.join(dir, 'util.h'), '#pragma once\n');
      const langs = registry.detectLanguages(dir);
      assert.ok(langs.includes('c'), 'main.c/util.h must detect c');
      assert.ok(!langs.includes('cpp'),
        'a *.c/*.h project must NOT detect cpp — the anchored glob keeps *.c out of *.cpp');
    } finally { rm(dir); }
  });

  it('a C++ project (app.cpp) detects cpp and NOT c', () => {
    const dir = makeProject('ctoc-glob-cpp-');
    try {
      fs.writeFileSync(path.join(dir, 'app.cpp'), 'int main(){return 0;}\n');
      const langs = registry.detectLanguages(dir);
      assert.ok(langs.includes('cpp'), 'app.cpp must detect cpp');
      assert.ok(!langs.includes('c'),
        'app.cpp must NOT match *.c — anchoring ^…$ is what prevents app.cpp matching *.c');
    } finally { rm(dir); }
  });

  it('a mixed project (main.c AND app.cpp) detects BOTH c and cpp', () => {
    const dir = makeProject('ctoc-glob-both-');
    try {
      fs.writeFileSync(path.join(dir, 'main.c'), 'int main(void){return 0;}\n');
      fs.writeFileSync(path.join(dir, 'app.cpp'), 'int f(){return 0;}\n');
      const langs = registry.detectLanguages(dir);
      assert.ok(langs.includes('c'), 'the .c file must detect c');
      assert.ok(langs.includes('cpp'), 'the .cpp file must detect cpp');
    } finally { rm(dir); }
  });

  it('REGRESSION: an exact-marker project stays stable — Cargo.toml only returns ["rust"], [0] unchanged', () => {
    const dir = makeProject('ctoc-glob-reg-');
    try {
      fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\nname = "x"\n');
      const langs = registry.detectLanguages(dir);
      assert.deepEqual(langs, ['rust'],
        'adding glob detection must not add a false positive for a Cargo.toml-only dir');
      assert.equal(langs[0], 'rust',
        'app-runner consumes detectLanguages[0]; it must stay rust for a rust project');
    } finally { rm(dir); }
  });
});

describe('capability-registry: toolchainFor() / capabilitiesFor()', () => {
  it("toolchainFor('rust','test') returns the cargo test command", () => {
    const tc = registry.toolchainFor('rust', 'test');
    assert.equal(tc.cmd, 'cargo test');
    assert.equal(tc.tool, 'cargo');
  });

  it("toolchainFor('dart','lint') returns flutter analyze", () => {
    const tc = registry.toolchainFor('dart', 'lint');
    assert.equal(tc.cmd, 'flutter analyze');
    assert.equal(tc.tool, 'flutter');
  });

  it('toolchainFor returns null for an unknown language or phase', () => {
    assert.equal(registry.toolchainFor('cobol', 'test'), null);
    assert.equal(registry.toolchainFor('rust', 'nonsense-phase'), null);
  });

  it('capabilitiesFor returns the whole capability object for a seed language', () => {
    const cap = registry.capabilitiesFor('rust');
    assert.equal(cap.language, 'rust');
    assert.ok(Array.isArray(cap.detectionMarkers) && cap.detectionMarkers.includes('Cargo.toml'));
    assert.ok(cap.toolchain && cap.toolchain.build, 'a capability carries its toolchain');
  });
});

describe('capability-registry: runStrategyFor() — HONEST mobile/desktop last mile', () => {
  it("runStrategyFor('dart','mobile') is build-is-last-mile (honest), command flutter run", () => {
    const s = registry.runStrategyFor('dart', 'mobile');
    assert.ok(s, 'dart mobile must have a run strategy');
    assert.equal(s.command, 'flutter run');
    assert.equal(s.honest, 'build-is-last-mile',
      'mobile run is NOT a live launch — build+test is the CI-safe last mile');
  });

  it("runStrategyFor('rust','cli') is a real runnable binary (honest:true), command cargo run", () => {
    const s = registry.runStrategyFor('rust', 'cli');
    assert.ok(s, 'rust cli must have a run strategy');
    assert.equal(s.command, 'cargo run');
    assert.equal(s.honest, true, 'a rust binary genuinely runs');
  });

  it('runStrategyFor returns null for a shape the language does not define', () => {
    assert.equal(registry.runStrategyFor('rust', 'mobile'), null);
    assert.equal(registry.runStrategyFor('cobol', 'cli'), null);
  });
});

describe('capability-registry: SEED DATA integrity (no fabricated/empty/guessed commands)', () => {
  const reg = registry.load();

  for (const lang of SEED_LANGS) {
    it(`${lang}: every toolchain phase has a real cmd + tool + honest provenance`, () => {
      const cap = reg.languages[lang];
      assert.ok(cap, `${lang} must be present`);
      assert.ok(cap.toolchain && typeof cap.toolchain === 'object', `${lang} must declare a toolchain`);
      // Core phases every language must define.
      assert.ok(cap.toolchain.lint, `${lang} must declare a lint phase`);
      assert.ok(cap.toolchain.test, `${lang} must declare a test phase`);
      for (const [phase, entry] of Object.entries(cap.toolchain)) {
        assert.equal(typeof entry.cmd, 'string', `${lang}.${phase}.cmd must be a string`);
        assert.ok(entry.cmd.trim().length > 0, `${lang}.${phase}.cmd must not be empty`);
        assert.ok(entry.tool && String(entry.tool).trim().length > 0, `${lang}.${phase}.tool must be named`);
        assert.ok(
          ALLOWED_VERIFIED.has(entry.verified),
          `${lang}.${phase}.verified must be web-2026-07 or UNVERIFIED, never "${entry.verified}" (never guessed)`
        );
      }
    });
  }

  it('no seed entry anywhere is flagged "guessed" and no cmd is empty', () => {
    for (const lang of SEED_LANGS) {
      const cap = reg.languages[lang];
      assert.notEqual(cap.verified, 'guessed', `${lang} top-level provenance must never be "guessed"`);
      for (const entry of Object.values(cap.toolchain)) {
        assert.notEqual(entry.verified, 'guessed');
        assert.ok(entry.cmd.length > 0);
      }
    }
  });
});

describe('capability-registry: PARITY with the canonical tool-detector commands (CR5 swap is behavior-preserving)', () => {
  // CR5-s2 retired tool-detector's DEFAULT_TOOLS table (superseded by the registry).
  // The parity anchor lives here as a FROZEN local fixture holding the known-good
  // python/typescript/go lint+test commands the retired table defined; the registry
  // must still match them exactly, proving the swap was behavior-preserving.
  const CANONICAL = Object.freeze({
    python: Object.freeze({ lint: 'ruff check .', test: 'pytest' }),
    typescript: Object.freeze({ lint: 'eslint .', test: 'npm test' }),
    go: Object.freeze({ lint: 'golangci-lint run', test: 'go test ./...' })
  });
  for (const lang of ['python', 'typescript', 'go']) {
    it(`${lang}: registry lint+test commands match the canonical tool-detector commands`, () => {
      const expected = CANONICAL[lang];
      assert.equal(
        registry.toolchainFor(lang, 'lint').cmd, expected.lint,
        `${lang} lint must match the canonical command exactly (${expected.lint})`
      );
      assert.equal(
        registry.toolchainFor(lang, 'test').cmd, expected.test,
        `${lang} test must match the canonical command exactly (${expected.test})`
      );
    });
  }
});

describe('capability-registry: WIRED into app-runner (a live consumer, not test-only)', () => {
  const appRunner = require('../src/lib/app-runner');

  it('app-runner exposes a registry-backed native run-target detector', () => {
    assert.equal(typeof appRunner.detectRunTarget, 'function',
      'app-runner must consume the registry via detectRunTarget');
  });

  it('a Cargo.toml project (no package.json) is recognized as a rust native run target', () => {
    const dir = makeProject('ctoc-wire-rust-');
    try {
      fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\nname = "x"\n');
      const target = appRunner.detectRunTarget(dir);
      assert.ok(target, 'a Cargo.toml project must be recognized via the registry');
      assert.equal(target.language, 'rust');
      assert.equal(target.strategy.command, 'cargo run');
    } finally { rm(dir); }
  });

  it('a JS project (has package.json shape) is NOT a native run target (registry only fills the gap)', () => {
    const dir = makeProject('ctoc-wire-js-');
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 's', scripts: { dev: 'node s.js' } }));
      assert.equal(appRunner.detectRunTarget(dir), null,
        'the registry native fallback must not override the existing JS shape detection');
    } finally { rm(dir); }
  });

  it('driveApp reports a Flutter project HONESTLY: not-applicable-here with the build-is-last-mile strategy', async () => {
    const dir = makeProject('ctoc-wire-flutter-');
    try {
      fs.writeFileSync(path.join(dir, 'pubspec.yaml'), 'name: x\nenvironment:\n  sdk: ">=3.0.0"\n');
      const res = await appRunner.driveApp(dir);
      // Honest: the HTTP-probe last mile is NOT applicable to a mobile build, so it
      // must NOT fail the gate — but the evidence must name the language + strategy.
      assert.equal(res.applicable, false, 'a mobile build must not be gated on an HTTP probe here');
      assert.deepEqual(res.errors, [], 'not-applicable is never a failure');
      assert.ok(/dart|flutter/i.test(JSON.stringify(res.evidence)),
        'the evidence must honestly identify the detected native stack');
    } finally { rm(dir); }
  });
});
