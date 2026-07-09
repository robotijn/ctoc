'use strict';

// CU4b s4 — content-contract test for the go/strictest + rust/legacy quality-config guides.
// ZERO TEST DOUBLES: reads the two REAL files off disk and asserts substance.
// No mocks, no fakes, no fixtures — the files under skills/quality-configs/{go,rust}/ are the SUT.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const QC_DIR = path.join(__dirname, '..', 'skills', 'quality-configs');

function read(lang, file) {
  return fs.readFileSync(path.join(QC_DIR, lang, file), 'utf8');
}

function sectionCount(md) {
  // Count level-2 (##) headings, not ### or deeper.
  return (md.match(/^##[^#]/gm) || []).length;
}

function fenceCount(md) {
  // Number of code blocks = pairs of ``` fence lines.
  const fences = md.match(/^```/gm) || [];
  return Math.floor(fences.length / 2);
}

function datedSourceLine(md) {
  // A single line carrying BOTH an http(s) URL and a >=2025 date token (verification integrity).
  return md.split('\n').some(
    (line) => /https?:\/\//.test(line) && /20(2[5-9]|[3-9]\d)/.test(line),
  );
}

// ---------------------------------------------------------------------------
// go/strictest — maximal Go lint preset (golangci-lint v2 default: all, tight limits, 90%)
// ---------------------------------------------------------------------------
{
  const label = 'go/strictest';
  const md = () => read('go', 'strictest.md');

  test(`${label}: has more than 5 level-2 sections`, () => {
    const n = sectionCount(md());
    assert.ok(n > 5, `expected > 5 '##' sections, got ${n}`);
  });

  test(`${label}: has more than 90 lines`, () => {
    const n = md().split('\n').length;
    assert.ok(n > 90, `expected > 90 lines, got ${n}`);
  });

  test(`${label}: names the required toolchain sections`, () => {
    const s = md();
    assert.match(s, /golangci-lint/i, 'must mention golangci-lint');
    assert.match(s, /coverage/i, 'must have a Coverage section');
    assert.match(s, /complexity/i, 'must have a Complexity section');
    assert.match(s, /install/i, 'must have an Install section');
    assert.match(s, /Makefile/i, 'must have a Makefile section');
    assert.match(s, /\bCI\b|GitHub Actions|workflow/i, 'must have a CI section');
  });

  test(`${label}: names Go-specific identifiers`, () => {
    const s = md();
    assert.match(s, /golangci-lint/i, 'must reference golangci-lint');
    assert.match(s, /\bgo\s*1\.2\d/i, 'must reference a Go 1.2x version');
    assert.match(s, /gocyclo/, 'must reference gocyclo');
    assert.match(s, /revive/, 'must reference revive');
    assert.match(s, /gosec/, 'must reference gosec');
    assert.match(s, /go install/, 'must reference go install');
  });

  test(`${label}: uses the golangci-lint v2 config schema (not deprecated v1)`, () => {
    const s = md();
    assert.match(s, /version:\s*["']?2["']?/, 'must declare golangci-lint config version "2"');
    assert.match(s, /default:\s*all/, 'v2 maximal preset uses `default: all` (v1 enable-all is removed)');
  });

  test(`${label}: has at least 4 code fences`, () => {
    const n = fenceCount(md());
    assert.ok(n >= 4, `expected >= 4 code fences, got ${n}`);
  });

  test(`${label}: carries at least one dated http source (>=2025)`, () => {
    const s = md();
    assert.match(s, /20(2[5-9]|[3-9]\d)/, 'must carry a >=2025 date token');
    assert.match(s, /https?:\/\//, 'must carry an http(s) source URL');
    assert.ok(datedSourceLine(s), 'expected a line carrying both a URL and a >=2025 date');
  });

  test(`${label}: gradient tokens — strictest 90% coverage`, () => {
    const s = md();
    assert.match(s, /90\s*%/, 'strictest must carry a 90% coverage floor');
  });

  test(`${label}: cross-language guard — no Rust tokens`, () => {
    const s = md();
    assert.doesNotMatch(s, /\bclippy\b/i, 'must not contain clippy');
    assert.doesNotMatch(s, /Cargo\.toml/, 'must not contain Cargo.toml');
    assert.doesNotMatch(s, /rustfmt/i, 'must not contain rustfmt');
    assert.doesNotMatch(s, /cargo /i, 'must not contain cargo commands');
  });
}

// ---------------------------------------------------------------------------
// rust/legacy — lenient/migration Rust config (clippy relaxed, edition migration, 50%)
// ---------------------------------------------------------------------------
{
  const label = 'rust/legacy';
  const md = () => read('rust', 'legacy.md');

  test(`${label}: has more than 5 level-2 sections`, () => {
    const n = sectionCount(md());
    assert.ok(n > 5, `expected > 5 '##' sections, got ${n}`);
  });

  test(`${label}: has more than 90 lines`, () => {
    const n = md().split('\n').length;
    assert.ok(n > 90, `expected > 90 lines, got ${n}`);
  });

  test(`${label}: names the required toolchain sections`, () => {
    const s = md();
    assert.match(s, /clippy/i, 'must have a Clippy section');
    assert.match(s, /Cargo\.toml/, 'must have a Cargo section');
    assert.match(s, /rustfmt/i, 'must have a Rustfmt section');
    assert.match(s, /coverage/i, 'must have a Coverage section');
    assert.match(s, /command/i, 'must have a Commands section');
    assert.match(s, /install/i, 'must have an Install section');
    assert.match(s, /\bCI\b|GitHub Actions|workflow/i, 'must have a CI section');
  });

  test(`${label}: names Rust-specific identifiers`, () => {
    const s = md();
    assert.match(s, /\bclippy\b/i, 'must reference clippy');
    assert.match(s, /rustfmt/i, 'must reference rustfmt');
    assert.match(s, /cargo-llvm-cov/, 'must reference cargo-llvm-cov');
    assert.match(s, /\[lints/, 'must reference a [lints...] table');
    assert.match(s, /edition\s*=\s*"20(21|24)"/, 'must name a Rust edition (2021 or 2024)');
  });

  test(`${label}: has at least 4 code fences`, () => {
    const n = fenceCount(md());
    assert.ok(n >= 4, `expected >= 4 code fences, got ${n}`);
  });

  test(`${label}: carries at least one dated http source (>=2025)`, () => {
    const s = md();
    assert.match(s, /20(2[5-9]|[3-9]\d)/, 'must carry a >=2025 date token');
    assert.match(s, /https?:\/\//, 'must carry an http(s) source URL');
    assert.ok(datedSourceLine(s), 'expected a line carrying both a URL and a >=2025 date');
  });

  test(`${label}: gradient tokens — legacy 50% coverage & unsafe=warn`, () => {
    const s = md();
    assert.match(s, /50\s*%/, 'legacy must carry a 50% coverage floor');
    assert.match(s, /unsafe_code\s*=\s*"warn"/, 'legacy keeps unsafe_code = "warn" (not deny/forbid)');
  });

  test(`${label}: cross-language guard — no Go tokens`, () => {
    const s = md();
    assert.doesNotMatch(s, /golangci-lint/i, 'must not contain golangci-lint');
    assert.doesNotMatch(s, /\.golangci/, 'must not contain .golangci');
    assert.doesNotMatch(s, /gocyclo/, 'must not contain gocyclo');
    // \b anchors the Go CLI verb "go install"; the boundary does NOT match inside "cargo install".
    assert.doesNotMatch(s, /\bgo install/, 'must not contain the go install CLI verb');
  });
}

// ---------------------------------------------------------------------------
// Cross-file gradient invariant: go/strictest is maximal, rust/legacy is lenient.
// ---------------------------------------------------------------------------
test('gradient: go/strictest 90% & default:all, rust/legacy 50% & unsafe=warn', () => {
  const go = read('go', 'strictest.md');
  const rust = read('rust', 'legacy.md');
  assert.match(go, /90\s*%/);
  assert.match(go, /default:\s*all/);
  assert.match(rust, /50\s*%/);
  assert.match(rust, /unsafe_code\s*=\s*"warn"/);
});
