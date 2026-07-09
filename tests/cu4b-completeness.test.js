/**
 * CU4b — the 9-file completeness check.
 *
 * ZERO DOUBLES: reads ALL 9 named CU4b quality-config files off disk via
 * fs.readFileSync, reads the corpus audit ledger (read-only), and reads the CU4b
 * slice plan files (read-only) to reconcile the per-file UPGRADED verdicts. No
 * mocks, no fixtures, no fakes.
 *
 * This is the CU4b-wide gate. It proves every named quality-config is substantive
 * (well past the stub floor, > 5 "## " sections, has a language-specific tool/rule
 * identifier, carries a dated source), that every named file has a recorded
 * UPGRADED verdict somewhere in the pipeline artifacts (no silent omission), and
 * that the quality-configs scope boundary holds (no thin quality-config file at
 * <= 5 "## " sections is silently left OUTSIDE the 9 named — the CU4b scope is
 * complete, nothing thin left behind).
 *
 * Verdict reconciliation (audit-ledger fallback, CU2/CU3 precedent): the corpus
 * audit JSON `.ctoc/audit/corpus-audit-2026-06-15.json` is OUTSIDE every CU4b
 * slice's `files:` set (it is CU1's DONE artifact), so each upgrade slice recorded
 * its per-file UPGRADED verdict in its own plan's "## Decisions Taken Under
 * Ambiguity" section. This test reconciles the verdict for each of the 9 named
 * files by scanning: (a) the audit ledger records, then (b) the CU4b slice plan
 * files. A named file with NO verdict in EITHER source is a silent omission and
 * FAILS.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(projectRoot, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(projectRoot, rel));
}

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

// The canonical CU4b in-scope set: the 9 read-fresh-confirmed thin quality-config
// files upgraded by s1–s4. `floor` is the strict lower bound on "## " section
// count — n > floor must hold. Every one of the 9 started at <= 5 sections, so the
// floor is 5 (n > 5). This defeats a no-op false-green.
//   s1 (csharp): legacy, strict, strictest
//   s2 (php):    legacy, strictest
//   s3 (jvm):    java/legacy, java/strictest
//   s4 (go/rust):go/strictest, rust/legacy
const NAMED = [
  { rel: 'skills/quality-configs/csharp/legacy.md', floor: 5 },
  { rel: 'skills/quality-configs/csharp/strict.md', floor: 5 },
  { rel: 'skills/quality-configs/csharp/strictest.md', floor: 5 },
  { rel: 'skills/quality-configs/php/legacy.md', floor: 5 },
  { rel: 'skills/quality-configs/php/strictest.md', floor: 5 },
  { rel: 'skills/quality-configs/java/legacy.md', floor: 5 },
  { rel: 'skills/quality-configs/java/strictest.md', floor: 5 },
  { rel: 'skills/quality-configs/go/strictest.md', floor: 5 },
  { rel: 'skills/quality-configs/rust/legacy.md', floor: 5 },
];

// Per-file language identifier — each named file must name a technology-specific
// tool/rule of its own language family.
const LANG_IDENTIFIER = {
  'skills/quality-configs/csharp/legacy.md': [/\.NET/, /Nullable/],
  'skills/quality-configs/csharp/strict.md': [/\.NET/, /Nullable/],
  'skills/quality-configs/csharp/strictest.md': [/\.NET/, /Nullable/],
  'skills/quality-configs/php/legacy.md': [/PHPStan/, /strict_types/],
  'skills/quality-configs/php/strictest.md': [/PHPStan/, /strict_types/],
  'skills/quality-configs/java/legacy.md': [/Checkstyle/, /JaCoCo/],
  'skills/quality-configs/java/strictest.md': [/Checkstyle/, /JaCoCo/],
  'skills/quality-configs/go/strictest.md': [/golangci-lint/],
  'skills/quality-configs/rust/legacy.md': [/clippy/],
};

// Cross-language guard — a named file must NOT carry another family's signature
// token (proves the upgrade content is language-correct, not copy-pasted).
const CROSS_LANG_FORBIDDEN = {
  'skills/quality-configs/csharp/legacy.md': [/detekt/, /ktlint/],
  'skills/quality-configs/csharp/strict.md': [/detekt/, /ktlint/],
  'skills/quality-configs/csharp/strictest.md': [/detekt/, /ktlint/],
  'skills/quality-configs/php/legacy.md': [/RuboCop/, /SimpleCov/],
  'skills/quality-configs/php/strictest.md': [/RuboCop/, /SimpleCov/],
  'skills/quality-configs/java/legacy.md': [/detekt/, /scalafmt/],
  'skills/quality-configs/java/strictest.md': [/detekt/, /scalafmt/],
  'skills/quality-configs/go/strictest.md': [/clippy/, /Cargo\.toml/],
  'skills/quality-configs/rust/legacy.md': [/golangci-lint/],
};

const AUDIT_LEDGER = '.ctoc/audit/corpus-audit-2026-06-15.json';

// CU4b slice plan files (any stage) — the reconciled verdict source of record.
const CU4B_PLAN_DIRS = [
  'plans/todo',
  'plans/in-progress',
  'plans/review',
  'plans/done',
  'plans/implementation',
];

// Gather every text artifact that may carry a recorded verdict: the audit ledger
// + every CU4b slice plan file on disk. Read once.
function verdictCorpus() {
  let text = '';
  if (exists(AUDIT_LEDGER)) text += read(AUDIT_LEDGER);
  for (const dir of CU4B_PLAN_DIRS) {
    const abs = path.join(projectRoot, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (/^CU4b-quality-configs.*\.md$/.test(f)) {
        text += '\n' + fs.readFileSync(path.join(abs, f), 'utf8');
      }
    }
  }
  return text;
}

// Enumerate every quality-config markdown file on disk (recursive).
function allQualityConfigs() {
  const root = path.join(projectRoot, 'skills/quality-configs');
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith('.md')) out.push(path.relative(projectRoot, fp).split(path.sep).join('/'));
    }
  })(root);
  return out.sort();
}

describe('CU4b — 9-file completeness check (real files + reconciled verdicts, zero doubles)', () => {
  it('the canonical NAMED list length is exactly 9 (no drift)', () => {
    assert.equal(NAMED.length, 9, 'the canonical CU4b in-scope set must be exactly 9 files');
  });

  it('all 9 named config files exist on disk', () => {
    for (const { rel } of NAMED) {
      assert.ok(exists(rel), `named CU4b config missing on disk: ${rel}`);
    }
  });

  describe('every named file exceeds its section floor (> 5 "## " sections)', () => {
    for (const { rel, floor } of NAMED) {
      it(`${rel} has > ${floor} "## " sections`, () => {
        const n = sectionCount(read(rel));
        assert.ok(n > floor, `expected > ${floor} "## " sections, found ${n}`);
      });
    }
  });

  describe('every named file is well past the stub floor (line count)', () => {
    for (const { rel } of NAMED) {
      it(`${rel} is > 90 lines`, () => {
        const lines = read(rel).split('\n').length;
        assert.ok(lines > 90, `expected > 90 lines (de-stubbed), found ${lines}`);
      });
    }
  });

  describe('every named file carries a dated source (>= 2025) with an http URL', () => {
    for (const { rel } of NAMED) {
      it(`${rel} has a >= 2025 date and an http source`, () => {
        const md = read(rel);
        assert.match(md, /20(2[5-9]|[3-9]\d)/, `expected a >= 2025 date token in ${rel}`);
        assert.match(md, /https?:\/\//, `expected an http(s) source URL in ${rel}`);
      });
    }
  });

  describe('every named file names its own language identifier', () => {
    for (const { rel } of NAMED) {
      it(`${rel} names a language-specific tool/rule identifier`, () => {
        const md = read(rel);
        const patterns = LANG_IDENTIFIER[rel];
        const hit = patterns.some((re) => re.test(md));
        assert.ok(
          hit,
          `expected one of ${patterns.map(String).join(', ')} in ${rel} (language identifier)`
        );
      });
    }
  });

  describe('cross-language guard — no named file carries another family signature token', () => {
    for (const { rel } of NAMED) {
      it(`${rel} is free of foreign-family signature tokens`, () => {
        const md = read(rel);
        for (const re of CROSS_LANG_FORBIDDEN[rel]) {
          assert.ok(
            !re.test(md),
            `${rel} contains a foreign-family token ${String(re)} — content is not language-correct`
          );
        }
      });
    }
  });

  describe('no silent omission — every named file has a recorded UPGRADED verdict', () => {
    const corpus = verdictCorpus();
    it('the reconciled verdict corpus contains an UPGRADED token', () => {
      assert.match(corpus, /UPGRADED/, 'no UPGRADED verdict token found in ledger or CU4b slice plans');
    });
    for (const { rel } of NAMED) {
      it(`${rel} appears in the reconciled verdict corpus`, () => {
        assert.ok(
          corpus.includes(rel),
          `no UPGRADED/verdict record found for ${rel} in the audit ledger or CU4b slice plans`
        );
      });
    }
  });

  it('scope boundary holds — no thin quality-config (<= 5 sections) is left outside the 9 named', () => {
    // Enumerate the on-disk quality-configs set. Every file at <= 5 "## " sections
    // is thin; if such a thin file is NOT one of the 9 named CU4b files, it was
    // silently skipped — CU4b scope would be incomplete. A config NOT in the 9 that
    // is > 5 sections is a pre-existing SOLID file and is fine.
    const named = new Set(NAMED.map((n) => n.rel));
    const thinOutside = [];
    for (const rel of allQualityConfigs()) {
      const n = sectionCount(read(rel));
      if (n <= 5 && !named.has(rel)) {
        thinOutside.push(`${rel} (${n} sections)`);
      }
    }
    assert.deepEqual(
      thinOutside,
      [],
      `thin quality-config file(s) left OUTSIDE the CU4b 9-file scope (silently skipped): ${thinOutside.join(', ')}`
    );
  });
});
