/**
 * CR5-s3 — sast-runner consumes the capability registry, HONESTLY.
 *
 * TWO invariants, tested with REAL fixtures and ZERO mocks:
 *
 *   1. DETECTION SUPERSET. detectLanguages() now delegates to the capability
 *      registry (20 languages, glob-aware) instead of the old hardcoded 8-language
 *      exact-filename table. Languages that were invisible before (C via a Makefile,
 *      C# via a *.csproj glob, Elixir via mix.exs, a Ruby project carrying only a
 *      *.gemspec) are now detected.
 *
 *   2. HONEST PARSER ROUTING (the load-bearing one). This runner has REAL result
 *      parsers only for bandit / gosec / eslint / semgrep. A detected language is
 *      scanned by a NATIVE tool ONLY when that tool is one we can actually parse;
 *      every other language (rust→cargo-audit, php→psalm, ruby→brakeman,
 *      java→spotbugs, c→cppcheck, …) is covered by the multi-language semgrep
 *      UNIVERSAL config, which we parse. We NEVER invoke a scanner whose output we
 *      cannot parse — that would fabricate findings or silently drop them. So
 *      securityRouteFor(lang).native is ALWAYS one of {bandit, gosec, eslint} or
 *      null; it is NEVER a parser-less tool.
 *
 * No scanner binaries are assumed installed, so these tests do not run any scanner —
 * they assert detection (pure file I/O) and routing (a pure function over the config
 * tables). That is exactly the honesty boundary that matters.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SASTRunner, TOOL_CONFIGS, SEVERITY } = require('../src/lib/sast-runner');
const registry = require('../src/lib/capability-registry');

/** Make an isolated temp project, seed the given files, return its path. */
function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr5s3-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── 1. detection superset (RED before the registry wiring) ──────────────────────

test('detectLanguages detects C from a Makefile (invisible to the old 8-language table)', () => {
  const dir = fixture({ Makefile: 'all:\n\tcc main.c\n', 'main.c': 'int main(){return 0;}\n' });
  try {
    const langs = new SASTRunner(dir).detectLanguages();
    assert.ok(langs.includes('c'), `expected C detected, got ${JSON.stringify(langs)}`);
  } finally { cleanup(dir); }
});

test('detectLanguages detects C# from a *.csproj GLOB marker', () => {
  const dir = fixture({ 'App.csproj': '<Project Sdk="Microsoft.NET.Sdk" />\n' });
  try {
    const langs = new SASTRunner(dir).detectLanguages();
    assert.ok(langs.includes('csharp'), `expected csharp detected, got ${JSON.stringify(langs)}`);
  } finally { cleanup(dir); }
});

test('detectLanguages detects Elixir from mix.exs', () => {
  const dir = fixture({ 'mix.exs': 'defmodule X.MixProject do\nend\n' });
  try {
    const langs = new SASTRunner(dir).detectLanguages();
    assert.ok(langs.includes('elixir'), `expected elixir detected, got ${JSON.stringify(langs)}`);
  } finally { cleanup(dir); }
});

test('detectLanguages detects Ruby from a *.gemspec-only project (glob, was invisible)', () => {
  const dir = fixture({ 'mylib.gemspec': 'Gem::Specification.new do |s|\nend\n' });
  try {
    const langs = new SASTRunner(dir).detectLanguages();
    assert.ok(langs.includes('ruby'), `expected ruby detected, got ${JSON.stringify(langs)}`);
  } finally { cleanup(dir); }
});

test('detectLanguages detects Rust from Cargo.toml and routes it AWAY from cargo-audit', () => {
  const dir = fixture({ 'Cargo.toml': '[package]\nname = "x"\n' });
  try {
    const runner = new SASTRunner(dir);
    assert.ok(runner.detectLanguages().includes('rust'));
    const route = runner.securityRouteFor('rust');
    assert.strictEqual(route.native, null, 'rust has no native parser here — must NOT run cargo-audit');
    assert.strictEqual(route.semgrepUniversal, true, 'rust must be covered by semgrep universal');
  } finally { cleanup(dir); }
});

test('detectLanguages detects PHP from composer.json and routes it to semgrep universal', () => {
  const dir = fixture({ 'composer.json': '{"name":"acme/site"}\n' });
  try {
    const runner = new SASTRunner(dir);
    assert.ok(runner.detectLanguages().includes('php'));
    const route = runner.securityRouteFor('php');
    assert.strictEqual(route.native, null, 'php psalm has no parser here — must route to semgrep universal');
    assert.strictEqual(route.semgrepUniversal, true);
  } finally { cleanup(dir); }
});

test('detectLanguages returns [] for an empty project (regression)', () => {
  const dir = fixture({});
  try {
    assert.deepStrictEqual(new SASTRunner(dir).detectLanguages(), []);
  } finally { cleanup(dir); }
});

test('the detection set is a superset of the legacy eight and larger than eight', () => {
  const langNames = Object.keys(registry.load().languages);
  assert.ok(langNames.length > 8, `registry must know more than the legacy 8 languages, has ${langNames.length}`);
  for (const legacy of ['python', 'javascript', 'typescript', 'go', 'java', 'rust', 'ruby', 'php']) {
    assert.ok(langNames.includes(legacy), `registry must still know ${legacy}`);
  }
});

// ── 2. native-tool routing: python/js/ts/go UNCHANGED (regression) ───────────────

test('python still routes to bandit (unchanged native tool + parser)', () => {
  const route = new SASTRunner('/no/such/dir').securityRouteFor('python');
  assert.strictEqual(route.native, 'bandit');
  assert.strictEqual(route.semgrepUniversal, false);
  assert.strictEqual(TOOL_CONFIGS.python.primary, 'bandit', 'exported TOOL_CONFIGS shape preserved');
});

test('go still routes to gosec (unchanged native tool + parser)', () => {
  const route = new SASTRunner('/no/such/dir').securityRouteFor('go');
  assert.strictEqual(route.native, 'gosec');
  assert.strictEqual(route.semgrepUniversal, false);
  assert.strictEqual(TOOL_CONFIGS.go.primary, 'gosec');
});

test('javascript still routes to eslint (NOT the registry semgrep tool — behavior unchanged)', () => {
  const route = new SASTRunner('/no/such/dir').securityRouteFor('javascript');
  assert.strictEqual(route.native, 'eslint');
  assert.strictEqual(route.semgrepUniversal, false);
});

test('typescript still routes to eslint (unchanged)', () => {
  const route = new SASTRunner('/no/such/dir').securityRouteFor('typescript');
  assert.strictEqual(route.native, 'eslint');
});

test('java routes to semgrep universal — spotbugs has no result parser here', () => {
  const route = new SASTRunner('/no/such/dir').securityRouteFor('java');
  assert.strictEqual(route.native, null, 'spotbugs is unparsed here → no native scan');
  assert.strictEqual(route.semgrepUniversal, true);
});

// ── 3. THE HONESTY INVARIANT: no language ever gets a parser-less native tool ────

test('securityRouteFor NEVER returns a native tool we cannot parse — for ANY registry language', () => {
  const parseable = new Set(['bandit', 'gosec', 'eslint']);
  const runner = new SASTRunner('/no/such/dir');
  const langNames = Object.keys(registry.load().languages);
  for (const lang of langNames) {
    const route = runner.securityRouteFor(lang);
    if (route.native !== null) {
      assert.ok(
        parseable.has(route.native),
        `HONESTY VIOLATION: language ${lang} routed to native tool "${route.native}" which has NO parser here`
      );
      assert.strictEqual(route.semgrepUniversal, false, `${lang} has a native parser → not also universal`);
    } else {
      assert.strictEqual(route.semgrepUniversal, true, `${lang} has no native parser → must be semgrep universal`);
    }
  }
});

test('an unparsed-tool language never yields a finding attributed to a parser-less tool', async () => {
  // Rust: registry security tool is cargo-audit (no parser here). With no scanner
  // installed, the per-language path must add ZERO findings and never claim to have
  // run cargo-audit. Zero mocks: cargo-audit is simply not on PATH in CI.
  const dir = fixture({ 'Cargo.toml': '[package]\nname = "x"\n' });
  try {
    const runner = new SASTRunner(dir);
    const ran = await runner.runLanguageScanner('rust');
    assert.strictEqual(ran, false, 'rust has no parseable native scanner → runLanguageScanner returns false');
    assert.strictEqual(runner.findings.length, 0, 'no fabricated findings for an unparsed tool');
    assert.ok(
      !runner.findings.some(f => f.tool === 'cargo-audit' || f.tool === 'cargo'),
      'never a finding attributed to cargo-audit'
    );
  } finally { cleanup(dir); }
});

test('SEVERITY export is preserved (quality-agent + security.test depend on it)', () => {
  assert.strictEqual(SEVERITY.CRITICAL, 'CRITICAL');
  assert.strictEqual(SEVERITY.HIGH, 'HIGH');
  assert.strictEqual(SEVERITY.MEDIUM, 'MEDIUM');
  assert.strictEqual(SEVERITY.LOW, 'LOW');
});
