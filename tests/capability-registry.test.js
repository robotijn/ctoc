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
/** Write a project-type override YAML into a project. */
function writeProjectTypeOverride(dir, name, body) {
  const d = path.join(dir, '.ctoc', 'capabilities', 'project-types');
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

  it('detects dart from a pubspec.yaml (and additively yaml — a pubspec IS YAML)', () => {
    const dir = makeProject('ctoc-det-dart-');
    try {
      fs.writeFileSync(path.join(dir, 'pubspec.yaml'), 'name: x\n');
      const detected = registry.detectLanguages(dir);
      assert.ok(detected.includes('dart'), 'pubspec.yaml must detect dart');
      // Expansion wave 5 added the config-quality `yaml` language (markers *.yaml/*.yml).
      // A pubspec.yaml is itself YAML, so yaml is ADDITIVELY (and correctly) detected —
      // this is the deliberate "fires widely but is right wherever it fires" case, not a
      // mis-classification. dart stays the Dart signal; yaml means "there is YAML to lint".
      assert.ok(detected.includes('yaml'), 'a pubspec.yaml is YAML — yaml is additively detected');
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

  // DEFECT 1: a poetry.lock/uv.lock-only repo IS a python project — its markers must
  // surface python so the SCA path (runSecurityScan → sca.run) is reached. Without
  // these markers detectLanguages returned [] and the poetry-locked dependency set was
  // audited by NEITHER runner.
  it('python detectionMarkers include poetry.lock and uv.lock (the osv-only python locks)', () => {
    const cap = registry.capabilitiesFor('python');
    assert.ok(cap && Array.isArray(cap.detectionMarkers), 'python must carry detectionMarkers');
    assert.ok(cap.detectionMarkers.includes('poetry.lock'),
      'poetry.lock must be a python detection marker (a poetry repo IS a python project)');
    assert.ok(cap.detectionMarkers.includes('uv.lock'),
      'uv.lock must be a python detection marker (a uv repo IS a python project)');
  });

  it('detects python from a poetry.lock-only project', () => {
    const dir = makeProject('ctoc-det-poetry-');
    try {
      fs.writeFileSync(path.join(dir, 'poetry.lock'), '');
      assert.ok(registry.detectLanguages(dir).includes('python'),
        'a poetry.lock-only repo must detect python');
    } finally { rm(dir); }
  });

  it('detects python from a uv.lock-only project', () => {
    const dir = makeProject('ctoc-det-uv-');
    try {
      fs.writeFileSync(path.join(dir, 'uv.lock'), '');
      assert.ok(registry.detectLanguages(dir).includes('python'),
        'a uv.lock-only repo must detect python');
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

describe('capability-registry: GLOB markers are ReDoS-safe against a hostile multi-star override (S1)', () => {
  // A project-LOCAL override under <projectRoot>/.ctoc/capabilities is UNTRUSTED input the
  // module explicitly defends against. A detectionMarker with MORE THAN ONE '*' compiles to
  // ^.*a.*a…a$ and causes catastrophic backtracking against a single crafted filename — an
  // empirical ~59s hang (exponential in star count) on the Step-14 / init / quality hot paths.
  // Only single-'*' globs are valid and shipped. A multi-star marker must be SKIPPED (treated
  // as non-matching), never compiled into a backtracking regex. MAX_FILE_BYTES does not
  // mitigate — a ~40-byte file suffices.
  const STARS = 20;
  const EVIL_MARKER = '*a'.repeat(STARS);           // *a*a…*a → ^.*a.*a…a$ (backtracking)
  const EVIL_FILE = 'a'.repeat(46) + '!';           // 47-byte no-match input → exponential blowup
  const TIME_BOUND_MS = 1000;                        // generous; the fix is O(1) skip, unfixed hangs ~59s

  it('detectLanguages completes FAST and does not detect a hostile multi-star language marker', () => {
    const dir = makeProject('ctoc-redos-lang-');
    try {
      writeOverride(dir, 'evilglob.yaml',
        'language: evilglob\n' +
        `detectionMarkers: [${EVIL_MARKER}]\n` +
        'toolchain:\n' +
        '  test: { cmd: "echo hi", tool: echo, verified: UNVERIFIED }\n' +
        'verified: UNVERIFIED\n');
      fs.writeFileSync(path.join(dir, EVIL_FILE), '');
      const start = Date.now();
      const langs = registry.detectLanguages(dir);
      const elapsed = Date.now() - start;
      assert.ok(elapsed < TIME_BOUND_MS,
        `detectLanguages must not backtrack on a multi-star marker (took ${elapsed}ms, bound ${TIME_BOUND_MS}ms)`);
      assert.ok(!langs.includes('evilglob'),
        'a multi-star marker is invalid — it must be skipped (match nothing), never compiled to a ReDoS regex');
    } finally { rm(dir); }
  });

  it('projectTypeFor completes FAST and does not detect a hostile multi-star project-type marker', () => {
    const dir = makeProject('ctoc-redos-type-');
    try {
      writeProjectTypeOverride(dir, 'eviltype.yaml',
        'projectType: eviltype\n' +
        `detectionMarkers: [${EVIL_MARKER}]\n` +
        'phases:\n' +
        '  test: required\n' +
        'run:\n' +
        '  strategy: build\n' +
        '  honest: build-is-last-mile\n' +
        'configScaffold: [evil.cfg]\n' +
        'priority: 999\n');
      fs.writeFileSync(path.join(dir, EVIL_FILE), '');
      const start = Date.now();
      const detected = registry.projectTypeFor(dir);
      const elapsed = Date.now() - start;
      assert.ok(elapsed < TIME_BOUND_MS,
        `projectTypeFor must not backtrack on a multi-star marker (took ${elapsed}ms, bound ${TIME_BOUND_MS}ms)`);
      assert.notEqual(detected, 'eviltype',
        'a multi-star project-type marker must be skipped, never compiled to a ReDoS regex');
    } finally { rm(dir); }
  });

  it('a legitimate SINGLE-star glob override still detects normally (the guard does not reject valid globs)', () => {
    const dir = makeProject('ctoc-redos-ok-');
    try {
      writeOverride(dir, 'singlestar.yaml',
        'language: singlestar\n' +
        'detectionMarkers: [*.widget]\n' +
        'toolchain:\n' +
        '  test: { cmd: "echo hi", tool: echo, verified: UNVERIFIED }\n' +
        'verified: UNVERIFIED\n');
      fs.writeFileSync(path.join(dir, 'thing.widget'), '');
      assert.ok(registry.detectLanguages(dir).includes('singlestar'),
        'a valid single-star glob must still match — only MULTI-star markers are rejected');
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

describe('capability-registry: detectLanguages() — DETERMINISTIC sorted order, cross-platform stable (F1)', () => {
  it('a polyglot repo returns a STABLE, sorted-by-capability-filename order across repeated loads', () => {
    const dir = makeProject('ctoc-det-order-');
    try {
      // One decisive single-language marker per bundled capability file:
      //   main.c → c.yaml, app.cpp → cpp.yaml, schema.sql → sql.yaml, config.yaml → yaml.yaml
      fs.writeFileSync(path.join(dir, 'main.c'), 'int main(void){return 0;}\n');
      fs.writeFileSync(path.join(dir, 'app.cpp'), 'int f(){return 0;}\n');
      fs.writeFileSync(path.join(dir, 'schema.sql'), 'select 1;\n');
      fs.writeFileSync(path.join(dir, 'config.yaml'), 'a: 1\n');
      const relevant = (arr) => arr.filter((l) => ['c', 'cpp', 'sql', 'yaml'].includes(l));
      const first = relevant(registry.detectLanguages(dir));
      // The order is the SORTED capability-filename order (c.yaml < cpp.yaml < sql.yaml <
      // yaml.yaml) — identical on every filesystem. It is NOT readdir order, which is
      // hash-ordered on ext4/xfs and would otherwise pick a different run target on Linux
      // CI than on a macOS laptop for the very same repo.
      assert.deepEqual(first, ['c', 'cpp', 'sql', 'yaml'],
        'primary-language order must be the deterministic sorted-filename order on every platform');
      // Stability: detectLanguages(root)[0] — app-runner\'s run target — never shifts.
      const second = relevant(registry.detectLanguages(dir));
      const third = relevant(registry.detectLanguages(dir));
      assert.deepEqual(second, first, 'order must be identical on a second fresh load');
      assert.deepEqual(third, first, 'order must be identical on a third fresh load');
      assert.equal(first[0], 'c',
        'the run target detectLanguages[0] is deterministic (c here), never filesystem-dependent');
    } finally { rm(dir); }
  });
});

describe('capability-registry: detectLanguages() — MANIFEST markers outrank stray SOURCE-FILE globs (F1)', () => {
  // The primary key for detectLanguages ordering is MARKER KIND, not alphabetical
  // capability-filename. A language matched by an EXACT manifest marker (Cargo.toml,
  // go.mod, requirements.txt) ranks AHEAD of a language matched only by a source-file
  // GLOB (*.c, *.h). Alphabetical was the WRONG primary key: `c.yaml` sorts first of
  // all languages, so any Rust/Go/Python repo carrying an incidental C/C++ file at the
  // root (FFI wrapper.h, cgo bridge.c, C-extension _ext.c) was mis-ranked with `c`
  // first — and app-runner's run target (detectLanguages[0]) became `c` → `./a.out`, a
  // gcc default that is not the app. Within each tier order stays sorted (deterministic,
  // cross-platform); only the tier boundary is new.
  it('Cargo.toml + incidental wrapper.h → rust (manifest) ranks ahead of c (glob)', () => {
    const dir = makeProject('ctoc-f1-rust-');
    try {
      fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\nname = "x"\n');
      fs.writeFileSync(path.join(dir, 'wrapper.h'), '#pragma once\n');
      const langs = registry.detectLanguages(dir);
      assert.ok(langs.includes('rust') && langs.includes('c'), 'both must still be detected');
      assert.ok(langs.indexOf('rust') < langs.indexOf('c'),
        'a manifest-matched rust must rank ahead of a glob-matched c');
      assert.equal(langs[0], 'rust', 'the run target must be rust, not c');
    } finally { rm(dir); }
  });

  it('go.mod + incidental bridge.c → go (manifest) ranks ahead of c (glob)', () => {
    const dir = makeProject('ctoc-f1-go-');
    try {
      fs.writeFileSync(path.join(dir, 'go.mod'), 'module x\n');
      fs.writeFileSync(path.join(dir, 'bridge.c'), 'int f(){return 0;}\n');
      const langs = registry.detectLanguages(dir);
      assert.ok(langs.indexOf('go') < langs.indexOf('c'),
        'a manifest-matched go must rank ahead of a glob-matched c');
      assert.equal(langs[0], 'go', 'the run target must be go, not c');
    } finally { rm(dir); }
  });

  it('requirements.txt + incidental _ext.c → python (manifest) ranks ahead of c (glob)', () => {
    const dir = makeProject('ctoc-f1-py-');
    try {
      fs.writeFileSync(path.join(dir, 'requirements.txt'), 'flask\n');
      fs.writeFileSync(path.join(dir, '_ext.c'), 'int f(){return 0;}\n');
      const langs = registry.detectLanguages(dir);
      assert.ok(langs.indexOf('python') < langs.indexOf('c'),
        'a manifest-matched python must rank ahead of a glob-matched c');
      assert.equal(langs[0], 'python', 'the run target must be python, not c');
    } finally { rm(dir); }
  });

  it('CONTROL: a pure C project (main.c + Makefile) still detects c first (no manifest to outrank it)', () => {
    const dir = makeProject('ctoc-f1-purec-');
    try {
      fs.writeFileSync(path.join(dir, 'main.c'), 'int main(void){return 0;}\n');
      fs.writeFileSync(path.join(dir, 'Makefile'), 'all:\n\tgcc main.c\n');
      const langs = registry.detectLanguages(dir);
      assert.ok(langs.includes('c'), 'a pure C project must still detect c');
      assert.equal(langs[0], 'c', 'with no manifest language present, c stays the run target');
    } finally { rm(dir); }
  });

  it('within the manifest tier order stays sorted+deterministic across repeated loads', () => {
    const dir = makeProject('ctoc-f1-multi-');
    try {
      // go.mod (manifest) + Cargo.toml (manifest) + stray bridge.c (glob).
      fs.writeFileSync(path.join(dir, 'go.mod'), 'module x\n');
      fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\nname = "x"\n');
      fs.writeFileSync(path.join(dir, 'bridge.c'), 'int f(){return 0;}\n');
      const pick = (a) => a.filter((l) => ['go', 'rust', 'c'].includes(l));
      const first = pick(registry.detectLanguages(dir));
      // Manifest tier sorted among itself (go before rust — go.yaml < rust.yaml), then
      // glob-only c last.
      assert.deepEqual(first, ['go', 'rust', 'c'],
        'manifest langs sorted first, glob-only c last — deterministic');
      assert.deepEqual(pick(registry.detectLanguages(dir)), first, 'identical on a second load');
    } finally { rm(dir); }
  });
});

describe('capability-registry: pipelineFor() — honest:true is IMPOSSIBLE with a null run command (F-honest)', () => {
  // A null run command means the app CANNOT be honestly claimed runnable. app-runner treats
  // pipeline.run.honest as AUTHORITATIVE, so honest:true + command:null propagates a lie to
  // the human ("it ran"). When the runShape resolves to no language command, a true honest
  // flag must degrade to false. Honest NON-true flags (false, 'build-is-last-mile') are
  // consistent with a null command — they never claimed a live run — and are preserved.
  it("pipelineFor('typescript','cli') is honest:false when the run command is null", () => {
    const p = registry.pipelineFor('typescript', 'cli');
    assert.ok(p, 'the typescript/cli merge must resolve');
    assert.equal(p.run.command, null, 'typescript defines no cli run shape → null command');
    assert.equal(p.run.honest, false,
      'a null run command can never be honestly claimed runnable — honest:true must degrade to false');
  });

  it("pipelineFor('dockerfile','web-fullstack') is honest:false when the run command is null", () => {
    const p = registry.pipelineFor('dockerfile', 'web-fullstack');
    assert.ok(p, 'the dockerfile/web-fullstack merge must resolve');
    assert.equal(p.run.command, null, 'dockerfile declares no run shapes → null command');
    assert.equal(p.run.honest, false,
      'honest:true with a null command is a lie app-runner would propagate — force false');
  });

  it("pipelineFor('typescript','web-fullstack') STAYS honest:true when a real run command exists", () => {
    const p = registry.pipelineFor('typescript', 'web-fullstack');
    assert.ok(p, 'the typescript/web-fullstack merge must resolve');
    assert.equal(p.run.command, 'npm start', 'typescript supplies the server run command');
    assert.equal(p.run.honest, true,
      'a genuine run command keeps honest:true — the guard only downgrades the null-command lie');
  });

  it("pipelineFor('rust','desktop') KEEPS honest:'build-is-last-mile' with a null command (not a lie)", () => {
    const p = registry.pipelineFor('rust', 'desktop');
    assert.ok(p, 'the rust/desktop merge must resolve');
    assert.equal(p.run.command, null, 'the desktop taxonomy supplies no language run command');
    assert.equal(p.run.honest, 'build-is-last-mile',
      'build-is-last-mile is honest about NOT launching — a null command is consistent, it stays');
  });
});

describe('capability-registry: detectLanguages() — ancillary infra/config langs never take the primary slot (F-ancillary)', () => {
  // Dockerfile and .github/workflows are EXACT markers, so before the fix dockerfile /
  // github-actions landed in the decisive manifest tier and sorted early by filename —
  // AHEAD of every real application language. Since almost every real repo has a Dockerfile
  // and/or CI, detectLanguages[0] (the run target every consumer drives) was wrong for most
  // projects. The fix marks them role:ancillary in their YAML and sorts ancillary languages
  // into a LOWER tier than real application languages: still detected/reported, never primary.
  it('a Node+TS repo with a Dockerfile and CI resolves primary to typescript, not dockerfile', () => {
    const dir = makeProject('ctoc-anc-nodets-');
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), '{}');
      fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}');
      fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM node:22-alpine\n');
      fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
      const langs = registry.detectLanguages(dir);
      assert.equal(langs[0], 'typescript',
        'the run target must be a real app language, never the ancillary dockerfile/github-actions');
      assert.ok(langs.includes('dockerfile') && langs.includes('github-actions'),
        'ancillary languages are still detected and reported');
      assert.ok(
        langs.indexOf('dockerfile') > langs.indexOf('typescript')
        && langs.indexOf('dockerfile') > langs.indexOf('javascript'),
        'dockerfile ranks after every real application language');
      assert.ok(langs.indexOf('github-actions') > langs.indexOf('javascript'),
        'github-actions ranks after every real application language');
    } finally { rm(dir); }
  });

  it('a Go repo with a Dockerfile resolves primary to go, not dockerfile', () => {
    const dir = makeProject('ctoc-anc-godock-');
    try {
      fs.writeFileSync(path.join(dir, 'go.mod'), 'module x\n');
      fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM golang:1.23\n');
      const langs = registry.detectLanguages(dir);
      assert.equal(langs[0], 'go', 'the run target must be go, not the ancillary dockerfile');
      assert.ok(langs.includes('dockerfile'), 'dockerfile is still detected');
      assert.ok(langs.indexOf('go') < langs.indexOf('dockerfile'), 'go ranks ahead of dockerfile');
    } finally { rm(dir); }
  });

  it('dockerfile + github-actions carry role:ancillary in the shipped data; real app langs do not', () => {
    assert.equal(registry.capabilitiesFor('dockerfile').role, 'ancillary',
      'dockerfile is cross-cutting infra config — role:ancillary keeps it out of the primary slot');
    assert.equal(registry.capabilitiesFor('github-actions').role, 'ancillary',
      'github-actions is cross-cutting CI config — role:ancillary keeps it out of the primary slot');
    assert.notEqual(registry.capabilitiesFor('typescript').role, 'ancillary',
      'a real application language is never ancillary');
    assert.notEqual(registry.capabilitiesFor('go').role, 'ancillary',
      'a real application language is never ancillary');
  });

  it('an ancillary-only repo (Dockerfile alone) still detects dockerfile (detection is not lost)', () => {
    const dir = makeProject('ctoc-anc-only-');
    try {
      fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM alpine:3.20\n');
      const langs = registry.detectLanguages(dir);
      assert.deepEqual(langs, ['dockerfile'],
        'with no real app language present, the ancillary language is still detected');
    } finally { rm(dir); }
  });
});

describe('capability-registry: detectLanguages() — typescript outranks javascript on a TS repo (F-tsrank)', () => {
  // typescript's SOLE detection marker is tsconfig.json, so typescript is detected IFF a
  // tsconfig.json exists — meaning "both javascript and typescript detected" already implies
  // tsconfig.json is present. Before the fix both were manifest-tier and javascript.yaml
  // sorted first, so every TS repo resolved primary `javascript`, driving the UNVERIFIED
  // `tsc --allowJs --checkJs` instead of typescript's `tsc --noEmit`. typescript.yaml now
  // declares `outranks: [javascript]`: a data-driven pairwise precedence that ranks
  // typescript ahead of javascript whenever both are present, keeping BOTH detected.
  it('a package.json + tsconfig.json repo resolves primary to typescript (not javascript)', () => {
    const dir = makeProject('ctoc-tsjs-');
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), '{}');
      fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}');
      const langs = registry.detectLanguages(dir);
      assert.equal(langs[0], 'typescript',
        'a repo with tsconfig.json is a TypeScript project — typescript is primary, driving tsc --noEmit');
      assert.ok(langs.includes('javascript'),
        'javascript is still detected (a mixed repo legitimately has both) — just ranked after typescript');
      assert.ok(langs.indexOf('typescript') < langs.indexOf('javascript'),
        'typescript must rank before javascript whenever tsconfig.json is present');
    } finally { rm(dir); }
  });

  it('a package.json-only repo (no tsconfig.json) stays primary javascript', () => {
    const dir = makeProject('ctoc-jsonly-');
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), '{}');
      const langs = registry.detectLanguages(dir);
      assert.equal(langs[0], 'javascript',
        'without a tsconfig.json typescript is not detected — javascript stays primary');
      assert.ok(!langs.includes('typescript'), 'no tsconfig.json → no typescript');
    } finally { rm(dir); }
  });
});

describe('capability-registry: isValidCapability — a structurally-broken override is SKIPPED + warned, not silently accepted (F2)', () => {
  it('a BLOCK-sequence detectionMarkers (rendered as {} by the flow-only parser) is skipped WITH a warning', () => {
    const dir = makeProject('ctoc-cap-blockseq-');
    try {
      // Idiomatic YAML the flow-only parser cannot represent: a block sequence parses to {}.
      // Before F2 this passed isValidCapability, then silently never detected — no warning.
      writeOverride(dir, 'blockseq.yaml',
        'language: blockseq\n' +
        'detectionMarkers:\n' +
        '  - Block.toml\n' +
        'toolchain:\n' +
        '  test: { cmd: "echo hi", tool: echo, verified: UNVERIFIED }\n' +
        'verified: UNVERIFIED\n');
      const reg = registry.load(dir);
      assert.ok(!reg.languages.blockseq,
        'a block-sequence detectionMarkers override must NOT be silently accepted');
      assert.ok(reg.warnings.some((w) => /blockseq\.yaml/.test(JSON.stringify(w))),
        'the skip must be LOUD — a warning naming the offending file (skip-and-warn contract)');
    } finally { rm(dir); }
  });

  it('an empty (tab-mangled) toolchain override is skipped WITH a warning', () => {
    const dir = makeProject('ctoc-cap-emptytc-');
    try {
      // toolchain: with no representable children → {} → previously passed validation, then
      // toolchainFor returned null silently. Non-empty-toolchain check makes it loud.
      writeOverride(dir, 'emptytc.yaml',
        'language: emptytc\n' +
        'detectionMarkers: [emptytc.marker]\n' +
        'toolchain:\n' +
        'verified: UNVERIFIED\n');
      const reg = registry.load(dir);
      assert.ok(!reg.languages.emptytc,
        'an empty-toolchain override must be rejected, not silently accepted');
      assert.ok(reg.warnings.some((w) => /emptytc\.yaml/.test(JSON.stringify(w))),
        'the empty-toolchain skip must be warned');
    } finally { rm(dir); }
  });

  it('a valid FLOW-list override still loads with no warning (the tightening does not reject good data)', () => {
    const dir = makeProject('ctoc-cap-flowok-');
    try {
      writeOverride(dir, 'flowlang.yaml',
        'language: flowlang\n' +
        'detectionMarkers: [flow.marker]\n' +
        'toolchain:\n' +
        '  lint: { cmd: "flowlint", tool: flowlint, verified: UNVERIFIED }\n' +
        '  test: { cmd: "flowtest", tool: flowtest, verified: UNVERIFIED }\n' +
        'verified: UNVERIFIED\n');
      const reg = registry.load(dir);
      assert.ok(reg.languages.flowlang, 'a valid flow-list override must still load');
      assert.deepEqual(reg.warnings, [], 'a valid override must produce no warning');
    } finally { rm(dir); }
  });
});

describe('capability-registry: parseValue — version-like scalars are preserved as strings (F3)', () => {
  it('verified: 1.0 stays the STRING "1.0" (a trailing-.0 version is not coerced to Number 1)', () => {
    const dir = makeProject('ctoc-f3-ver-');
    try {
      writeOverride(dir, 'verlang.yaml',
        'language: verlang\n' +
        'detectionMarkers: [ver.marker]\n' +
        'toolchain:\n' +
        '  test: { cmd: "t", tool: t, verified: 1.0 }\n' +
        'verified: UNVERIFIED\n');
      const cap = registry.capabilitiesFor('verlang', dir);
      assert.ok(cap, 'the override must load');
      assert.strictEqual(cap.toolchain.test.verified, '1.0',
        'a trailing-.0 version scalar must be preserved verbatim, never coerced to Number 1');
    } finally { rm(dir); }
  });

  it('a leading-zero scalar 007 stays the string "007" (not Number 7)', () => {
    const dir = makeProject('ctoc-f3-lz-');
    try {
      writeOverride(dir, 'lzlang.yaml',
        'language: lzlang\n' +
        'detectionMarkers: [lz.marker]\n' +
        'toolchain:\n' +
        '  test: { cmd: "t", tool: t, verified: 007 }\n' +
        'verified: UNVERIFIED\n');
      const cap = registry.capabilitiesFor('lzlang', dir);
      assert.strictEqual(cap.toolchain.test.verified, '007',
        'a leading-zero scalar must be preserved verbatim, never coerced to Number 7');
    } finally { rm(dir); }
  });

  it('a genuine integer scalar still parses to Number (coercion is preserved for real numbers)', () => {
    const dir = makeProject('ctoc-f3-int-');
    try {
      writeOverride(dir, 'intlang.yaml',
        'language: intlang\n' +
        'detectionMarkers: [int.marker]\n' +
        'budget: 2\n' +
        'toolchain:\n' +
        '  test: { cmd: "t", tool: t, verified: UNVERIFIED }\n' +
        'verified: UNVERIFIED\n');
      const cap = registry.capabilitiesFor('intlang', dir);
      assert.strictEqual(cap.budget, 2, 'a real integer must still coerce to Number 2');
      assert.strictEqual(typeof cap.budget, 'number', 'genuine numbers stay numbers');
    } finally { rm(dir); }
  });

  it('a float like 3.5 still parses to Number (no over-correction)', () => {
    const dir = makeProject('ctoc-f3-float-');
    try {
      writeOverride(dir, 'floatlang.yaml',
        'language: floatlang\n' +
        'detectionMarkers: [f.marker]\n' +
        'ratio: 3.5\n' +
        'toolchain:\n' +
        '  test: { cmd: "t", tool: t, verified: UNVERIFIED }\n' +
        'verified: UNVERIFIED\n');
      const cap = registry.capabilitiesFor('floatlang', dir);
      assert.strictEqual(cap.ratio, 3.5, 'a genuine float must still coerce to Number 3.5');
    } finally { rm(dir); }
  });
});
