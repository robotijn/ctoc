'use strict';

/**
 * CAPABILITY REGISTRY — TOP-20 LANGUAGE DATA (CR2).
 *
 * CR1 seeded 6 languages (rust, python, typescript, go, dart, kotlin). CR2 adds the
 * remaining 14 to reach the top-20. These tests assert the DATA is complete, honest,
 * and argv-safe — they touch NO engine code (CR3 owns engine changes concurrently):
 *
 *   • COMPLETE — all 20 languages load; exactly 20 bundled YAML files exist.
 *   • HONEST PROVENANCE — every present toolchain phase has a non-empty cmd + a named
 *     tool + a `verified` value that is exactly `web-2026-07` or `UNVERIFIED`
 *     (never empty, never `guessed`). `lint` and `test` are present for every language.
 *   • DETECTABLE — detectLanguages finds each language via a real exact-filename marker
 *     fixture built on disk (no mocks; the real bundled data, the real engine).
 *   • SQL IS HONESTLY PARTIAL — SQL is not a runnable app: run.honest is false and it
 *     exposes NO run shape (runStrategyFor returns null).
 *   • ARGV-SAFE — no cmd (toolchain OR run shape) contains a shell control
 *     metacharacter that would break a later argv-split / enable command chaining
 *     (`;` `&` `|` backtick `$` `<` `>` newline). CR5/CR6 argv-split these strings.
 *
 * ZERO DOUBLES: every filesystem case builds a REAL project dir and reads the REAL
 * bundled seed YAML. Nothing is mocked.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const registry = require('../src/lib/capability-registry');

const BUNDLED_DIR = path.join(__dirname, '..', '.ctoc', 'capabilities', 'languages');
const ALLOWED_VERIFIED = new Set(['web-2026-07', 'UNVERIFIED']);

/** The full top-20 set: the 6 CR1 seeds + the 14 CR2 adds. */
const TOP20 = [
  'rust', 'python', 'typescript', 'go', 'dart', 'kotlin',           // CR1 seeds
  'java', 'csharp', 'cpp', 'c', 'javascript', 'sql', 'php', 'ruby', // CR2 adds
  'swift', 'r', 'scala', 'elixir', 'objectivec', 'lua'
];

/**
 * A real, EXACT-filename marker per language that the current (glob-less) engine can
 * detect. The detection test writes this exact file into an isolated project dir.
 * These are chosen to be mutually non-colliding under the current exact-match engine.
 */
const DETECT_MARKER = {
  rust: 'Cargo.toml',
  python: 'pyproject.toml',
  typescript: 'tsconfig.json',
  go: 'go.mod',
  dart: 'pubspec.yaml',
  kotlin: 'build.gradle.kts',
  java: 'pom.xml',
  csharp: 'global.json',
  cpp: 'CMakeLists.txt',
  c: 'Makefile',
  javascript: 'package.json',
  sql: 'dbt_project.yml',
  php: 'composer.json',
  ruby: 'Gemfile',
  swift: 'Package.swift',
  r: 'DESCRIPTION',
  scala: 'build.sbt',
  elixir: 'mix.exs',
  objectivec: 'Podfile',
  lua: '.luacheckrc'
};

// Shell control metacharacters that break a naive/quote-aware argv-split or enable
// command chaining, redirection, or substitution. A glob `*` is intentionally NOT
// here: it stays within a single token and does not chain commands (its expansion is
// CR6's execution concern), and quotes/parens stay within one argv token.
const UNSAFE_METACHAR = /[;&|`$<>\r\n]/;

/** Make a fresh temp project dir. */
function makeProject(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
/** Remove a temp dir, best-effort. */
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

/** Collect every command STRING an entry exposes (cmd + altCmd + run shape values). */
function allCommandsFor(cap) {
  const cmds = [];
  if (cap.toolchain && typeof cap.toolchain === 'object') {
    for (const entry of Object.values(cap.toolchain)) {
      if (entry && typeof entry.cmd === 'string') cmds.push(entry.cmd);
      if (entry && typeof entry.altCmd === 'string') cmds.push(entry.altCmd);
    }
  }
  if (cap.run && cap.run.shapes && typeof cap.run.shapes === 'object') {
    for (const v of Object.values(cap.run.shapes)) {
      if (typeof v === 'string') cmds.push(v);
    }
  }
  return cmds;
}

describe('capability-registry TOP-20: completeness', () => {
  it('all 20 languages load from the bundled data', () => {
    const reg = registry.load();
    assert.deepEqual(reg.warnings, [], 'the shipped seed data must load with zero warnings');
    for (const lang of TOP20) {
      assert.ok(reg.languages[lang], `bundled data must include ${lang}`);
    }
  });

  it('exactly 20 language YAML files ship in the bundled directory', () => {
    const files = fs.readdirSync(BUNDLED_DIR).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    assert.equal(files.length, 20, `expected exactly 20 bundled language files, found ${files.length}: ${files.join(', ')}`);
  });

  it('every top-20 language has its own YAML file on disk', () => {
    const files = new Set(fs.readdirSync(BUNDLED_DIR));
    for (const lang of TOP20) {
      assert.ok(files.has(`${lang}.yaml`), `${lang}.yaml must exist in the bundled directory`);
    }
  });
});

describe('capability-registry TOP-20: honest provenance (no empty/guessed/fabricated)', () => {
  const reg = registry.load();

  for (const lang of TOP20) {
    it(`${lang}: lint + test present; every phase has a real cmd + tool + honest provenance`, () => {
      const cap = reg.languages[lang];
      assert.ok(cap, `${lang} must be present`);
      assert.ok(cap.toolchain && typeof cap.toolchain === 'object', `${lang} must declare a toolchain`);
      assert.ok(cap.toolchain.lint, `${lang} must declare a lint phase (required)`);
      assert.ok(cap.toolchain.test, `${lang} must declare a test phase (required)`);
      for (const [phase, entry] of Object.entries(cap.toolchain)) {
        assert.equal(typeof entry.cmd, 'string', `${lang}.${phase}.cmd must be a string`);
        assert.ok(entry.cmd.trim().length > 0, `${lang}.${phase}.cmd must not be empty`);
        assert.ok(entry.tool && String(entry.tool).trim().length > 0, `${lang}.${phase}.tool must be named`);
        assert.ok(
          ALLOWED_VERIFIED.has(entry.verified),
          `${lang}.${phase}.verified must be web-2026-07 or UNVERIFIED, never "${entry.verified}"`
        );
      }
    });
  }

  it('no entry anywhere (toolchain or top-level) is flagged "guessed"', () => {
    for (const lang of TOP20) {
      const cap = reg.languages[lang];
      assert.notEqual(cap.verified, 'guessed', `${lang} top-level provenance must never be "guessed"`);
      for (const entry of Object.values(cap.toolchain)) {
        assert.notEqual(entry.verified, 'guessed', `${lang} phase provenance must never be "guessed"`);
      }
    }
  });
});

describe('capability-registry TOP-20: detection via a real marker fixture', () => {
  for (const lang of TOP20) {
    it(`detects ${lang} from a ${DETECT_MARKER[lang]} fixture`, () => {
      const dir = makeProject(`ctoc-top20-${lang}-`);
      try {
        fs.writeFileSync(path.join(dir, DETECT_MARKER[lang]), '# fixture\n');
        assert.ok(
          registry.detectLanguages(dir).includes(lang),
          `a ${DETECT_MARKER[lang]} project must detect ${lang}`
        );
      } finally { rm(dir); }
    });
  }
});

describe('capability-registry TOP-20: SQL is honestly partial (no run)', () => {
  it('SQL declares honest:false and exposes NO run shape', () => {
    const cap = registry.capabilitiesFor('sql');
    assert.ok(cap, 'sql must be present');
    assert.ok(cap.run && typeof cap.run === 'object', 'sql must carry a run block that declares its honesty');
    assert.equal(cap.run.honest, false, 'SQL is not a runnable app — honest must be false');
    const shapes = cap.run.shapes && typeof cap.run.shapes === 'object' ? cap.run.shapes : {};
    assert.equal(Object.keys(shapes).length, 0, 'SQL must declare no run shape');
    assert.equal(registry.runStrategyFor('sql', 'cli'), null, 'SQL has no runnable shape');
    assert.equal(registry.runStrategyFor('sql', 'server'), null, 'SQL has no runnable shape');
  });
});

describe('capability-registry TOP-20: argv-safe commands (no shell control metacharacters)', () => {
  const reg = registry.load();

  for (const lang of TOP20) {
    it(`${lang}: no cmd contains a chaining/redirect/substitution metacharacter`, () => {
      const cap = reg.languages[lang];
      for (const cmd of allCommandsFor(cap)) {
        assert.ok(
          !UNSAFE_METACHAR.test(cmd),
          `${lang} cmd "${cmd}" contains a shell control metacharacter that would break argv execution`
        );
      }
    });
  }

  it('every present run shape is a non-empty string', () => {
    for (const lang of TOP20) {
      const cap = reg.languages[lang];
      if (!cap.run || !cap.run.shapes) continue;
      for (const [shape, cmd] of Object.entries(cap.run.shapes)) {
        assert.equal(typeof cmd, 'string', `${lang}.run.${shape} must be a string`);
        assert.ok(cmd.trim().length > 0, `${lang}.run.${shape} must not be empty`);
      }
    }
  });
});
