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
 * A real detection marker per language that the (now glob-aware) engine matches. The
 * detection test writes this file into an isolated project dir. Most are exact
 * filenames; `c` and `objectivec` use a source-file marker (`main.c` → `*.c`,
 * `foo.m` → `*.m`) because CR5-FIX F1/F2 narrowed those languages to their source
 * extensions — a generic `Makefile`/`Podfile` no longer asserts the language. The
 * fixtures are chosen to be mutually non-colliding.
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
  c: 'main.c',
  javascript: 'package.json',
  sql: 'dbt_project.yml',
  php: 'composer.json',
  ruby: 'Gemfile',
  swift: 'Package.swift',
  r: 'DESCRIPTION',
  scala: 'build.sbt',
  elixir: 'mix.exs',
  objectivec: 'foo.m',
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

  it('F5: kotlin + java security are honestly flagged UNVERIFIED (detekt/SpotBugs are not a confirmed SAST)', () => {
    const kotlin = reg.languages.kotlin;
    const java = reg.languages.java;
    assert.ok(kotlin && kotlin.toolchain.security, 'kotlin must declare a security phase');
    assert.ok(java && java.toolchain.security, 'java must declare a security phase');
    assert.equal(kotlin.toolchain.security.verified, 'UNVERIFIED',
      'detekt is a code-smell linter, not a SAST — its security claim must be UNVERIFIED');
    assert.equal(java.toolchain.security.verified, 'UNVERIFIED',
      'plain SpotBugs is a bug-pattern finder (no find-sec-bugs) — its security claim must be UNVERIFIED');
  });

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

describe('capability-registry: narrowed C / Objective-C markers (CR5-FIX F1/F2)', () => {
  it('a root Makefile ALONE does NOT detect c (Makefile is a generic build tool, not a C signal)', () => {
    const dir = makeProject('ctoc-narrow-c-');
    try {
      fs.writeFileSync(path.join(dir, 'Makefile'), 'all:\n\techo hi\n');
      assert.ok(
        !registry.detectLanguages(dir).includes('c'),
        'a bare Makefile must not assert C — C is detected by its *.c/*.h source'
      );
    } finally { rm(dir); }
  });

  it('a *.c source file DOES detect c', () => {
    const dir = makeProject('ctoc-narrow-c2-');
    try {
      fs.writeFileSync(path.join(dir, 'main.c'), 'int main(void){return 0;}\n');
      assert.ok(registry.detectLanguages(dir).includes('c'), 'a *.c source file must detect C');
    } finally { rm(dir); }
  });

  it('a Podfile ALONE does NOT detect objectivec (CocoaPods is shared with Swift)', () => {
    const dir = makeProject('ctoc-narrow-objc-');
    try {
      fs.writeFileSync(path.join(dir, 'Podfile'), "platform :ios, '15.0'\n");
      assert.ok(
        !registry.detectLanguages(dir).includes('objectivec'),
        'a bare Podfile must not assert Objective-C — Swift uses CocoaPods too'
      );
    } finally { rm(dir); }
  });

  it('an *.xcodeproj ALONE does NOT detect objectivec (Xcode projects are shared with Swift)', () => {
    const dir = makeProject('ctoc-narrow-objc-xc-');
    try {
      fs.mkdirSync(path.join(dir, 'App.xcodeproj'));
      assert.ok(
        !registry.detectLanguages(dir).includes('objectivec'),
        'a bare *.xcodeproj must not assert Objective-C — Swift ships *.xcodeproj too'
      );
    } finally { rm(dir); }
  });

  it('a *.m source file DOES detect objectivec', () => {
    const dir = makeProject('ctoc-narrow-objc2-');
    try {
      fs.writeFileSync(path.join(dir, 'foo.m'), '#import <Foundation/Foundation.h>\n');
      assert.ok(
        registry.detectLanguages(dir).includes('objectivec'),
        'a *.m source file must detect Objective-C'
      );
    } finally { rm(dir); }
  });

  it('r.yaml is left UNCHANGED: a DESCRIPTION file still detects r', () => {
    const dir = makeProject('ctoc-narrow-r-');
    try {
      fs.writeFileSync(path.join(dir, 'DESCRIPTION'), 'Package: x\nVersion: 1.0\n');
      assert.ok(
        registry.detectLanguages(dir).includes('r'),
        'DESCRIPTION is R’s canonical package descriptor and must remain a marker'
      );
    } finally { rm(dir); }
  });
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
