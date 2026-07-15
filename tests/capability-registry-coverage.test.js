'use strict';

/**
 * CAPABILITY REGISTRY — DARK-BRANCH COVERAGE (mutation-first).
 *
 * The two existing suites (capability-registry.test.js, capability-registry-top20.test.js)
 * exercise the LANGUAGE dimension's happy paths plus the F1/F2/F3 detection fixes. Scoped to
 * `tests/*capability-registry*.test.js`, that leaves whole regions dark:
 *
 *   • the DATABASE dimension    (isValidDatabase / readDatabaseDir / loadDatabases / databaseCapability)
 *   • the FRAMEWORK dimension   (isValidFramework / readFrameworkDir / loadFrameworks / frameworkCapability)
 *   • every loader's DEFENSE-IN-DEPTH error path (unreadable dir, > MAX_FILES, > MAX_FILE_BYTES, per-entry throw)
 *   • the tolerant-parser edges (single-quoted scalar, invalid-JSON double-quoted scalar, a colon inside a quoted key)
 *   • the honesty guard in runStrategyFor (an empty run command is null, never a fabricated empty run)
 *
 * Each test here pins a branch that goes RED under mutation — a mis-detection, an over-detected
 * shared marker, a fabricated command, a dropped fail-open warning, or a swallowed error. Nothing
 * is mocked: every case builds a REAL project dir under os.tmpdir() and reads the REAL bundled seed
 * YAML through the REAL module, cleaning up in `finally`.
 *
 * These tests were AI-drafted and then read line-by-line against the module source before commit
 * (the honesty clause in the unit-test-writer skill).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const registry = require('../src/lib/capability-registry');

// The module's defense-in-depth caps (mirrored from src/lib/capability-registry.js).
const MAX_FILE_BYTES = 64 * 1024;
const MAX_FILES = 500;

/** Make a fresh temp project dir. */
function makeProject(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
/** Remove a temp dir, best-effort. */
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
/** Create (and return) a `.ctoc/capabilities/<kind>` override dir inside a project. */
function overrideDir(dir, kind) {
  const d = path.join(dir, '.ctoc', 'capabilities', kind);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
/** Write one override YAML file into a project's `<kind>` capabilities dir. */
function writeOverride(dir, kind, name, body) {
  fs.writeFileSync(path.join(overrideDir(dir, kind), name), body);
}

// ── DATABASE DIMENSION — detection record, unknown/empty/non-string → null (620-724) ───────────

describe('capability-registry: databaseCapability() — the RIGHT record, and null for the absent/blank/non-string key', () => {
  it('returns the real postgresql record with its relational/RLS security posture', () => {
    // Arrange + Act
    const cap = registry.databaseCapability('postgresql');

    // Assert — the record is the persistence-security truth stack-detector enriches with,
    // not an empty stub. A mutant returning {} or the wrong file dies here.
    assert.equal(cap.database, 'postgresql');
    assert.equal(cap.category, 'relational');
    assert.equal(cap.security.rls, 'supported', 'postgres advertises native row-level security');
    assert.ok(cap.deps.includes('pg'), 'the node pg client dep drives detection');
  });

  it('returns null for an unknown database — the || fallback, never a fabricated record', () => {
    assert.equal(registry.databaseCapability('not-a-real-db'), null);
  });

  it('returns null for an empty-string name (second operand of the typeof/length guard)', () => {
    // '' is a string, so ONLY the `name.length === 0` operand rejects it — pins that operand.
    assert.equal(registry.databaseCapability(''), null);
  });

  it('returns null for a non-string name (first operand of the typeof/length guard)', () => {
    // A number never has a valid capability; the `typeof !== 'string'` operand must short-circuit
    // BEFORE `name.length` is read, so this must be null, not a throw.
    assert.equal(registry.databaseCapability(42), null);
  });
});

describe('capability-registry: loadDatabases() — bundled seed loads clean; a project override WINS', () => {
  it('loads the bundled databases with zero warnings and includes postgresql/mongodb/redis', () => {
    const { databases, warnings } = registry.loadDatabases();
    assert.deepEqual(warnings, [], 'the shipped database seed must load with zero warnings');
    for (const name of ['postgresql', 'mongodb', 'redis']) {
      assert.ok(databases[name], `bundled database data must include ${name}`);
    }
  });

  it('a project override for postgresql REPLACES the bundled record (later dir wins)', () => {
    const dir = makeProject('ctoc-db-override-');
    try {
      // A project may re-declare a bundled database; the override dir is read last and wins.
      writeOverride(dir, 'databases', 'postgresql.yaml',
        'database: postgresql\n' +
        'category: OVERRIDDEN-CATEGORY\n' +
        'deps: [pg]\n' +
        'security:\n' +
        '  injection: parameterized-queries\n');
      const cap = registry.databaseCapability('postgresql', dir);
      assert.equal(cap.category, 'OVERRIDDEN-CATEGORY',
        'the project override must replace the bundled postgresql record, not be ignored');
    } finally { rm(dir); }
  });
});

describe('capability-registry: isValidDatabase — a structurally-broken override is SKIPPED + WARNED (620-645, 681-684)', () => {
  // Each row is a database override that is valid EXCEPT for one field. It must NOT load, and the
  // skip must be LOUD (a warning naming the file) — the fail-open/fail-loud contract.
  const CASES = [
    {
      id: 'missing-category',
      body: 'database: nocat\ndeps: [x]\nsecurity:\n  injection: parameterized-queries\n'
    },
    {
      id: 'security-is-an-array-not-an-object',
      body: 'database: secarr\ncategory: relational\ndeps: [x]\nsecurity: [a, b]\n'
    },
    {
      id: 'empty-deps-array',
      body: 'database: nodeps\ncategory: relational\ndeps: []\nsecurity:\n  injection: parameterized-queries\n'
    },
    {
      id: 'missing-security',
      body: 'database: nosec\ncategory: relational\ndeps: [x]\n'
    }
  ];
  for (const c of CASES) {
    it(`rejects and warns on a database override that is ${c.id}`, () => {
      const dir = makeProject(`ctoc-db-bad-${c.id}-`);
      try {
        writeOverride(dir, 'databases', 'bad.yaml', c.body);
        const { databases, warnings } = registry.loadDatabases(dir);
        assert.ok(databases.postgresql, 'the bundled databases must still load alongside the bad override');
        assert.ok(
          warnings.some((w) => /bad\.yaml/.test(JSON.stringify(w)) && /malformed database/.test(JSON.stringify(w))),
          'the malformed override must be skipped WITH a warning naming the file'
        );
      } finally { rm(dir); }
    });
  }
});

// ── FRAMEWORK DIMENSION — enrichment record, unknown/empty/non-string → null (726-842) ─────────

describe('capability-registry: frameworkCapability() — the RIGHT record, and null for the absent/blank/non-string key', () => {
  it('returns the real nextjs record with its fullstack/typescript SSRF concern set', () => {
    const cap = registry.frameworkCapability('nextjs');
    assert.equal(cap.framework, 'nextjs');
    assert.equal(cap.category, 'web-fullstack');
    assert.equal(cap.language, 'typescript');
    assert.ok(cap.security.concerns.includes('ssrf'), 'nextjs server fetches make SSRF a first-class concern');
    assert.ok(cap.deps.includes('next'), 'the next dependency drives enrichment');
  });

  it('returns null for an unknown framework — the || fallback, never a fabricated record', () => {
    assert.equal(registry.frameworkCapability('not-a-real-framework'), null);
  });

  it('returns null for an empty-string name (second operand of the guard)', () => {
    assert.equal(registry.frameworkCapability(''), null);
  });

  it('returns null for a non-string name (first operand of the guard short-circuits)', () => {
    assert.equal(registry.frameworkCapability({}), null);
  });
});

describe('capability-registry: loadFrameworks() — bundled seed loads clean; a project override WINS', () => {
  it('loads the bundled frameworks with zero warnings and includes nextjs/express/django', () => {
    const { frameworks, warnings } = registry.loadFrameworks();
    assert.deepEqual(warnings, [], 'the shipped framework seed must load with zero warnings');
    for (const name of ['nextjs', 'express', 'django']) {
      assert.ok(frameworks[name], `bundled framework data must include ${name}`);
    }
  });

  it('a project override for nextjs REPLACES the bundled record (later dir wins)', () => {
    const dir = makeProject('ctoc-fw-override-');
    try {
      writeOverride(dir, 'frameworks', 'nextjs.yaml',
        'framework: nextjs\n' +
        'category: OVERRIDDEN\n' +
        'language: typescript\n' +
        'deps: [next]\n' +
        'security:\n' +
        '  concerns: [xss]\n');
      const cap = registry.frameworkCapability('nextjs', dir);
      assert.equal(cap.category, 'OVERRIDDEN',
        'the project override must replace the bundled nextjs record, not be ignored');
    } finally { rm(dir); }
  });
});

describe('capability-registry: isValidFramework — a structurally-broken override is SKIPPED + WARNED (726-762, 798-801)', () => {
  const CASES = [
    {
      id: 'missing-language',
      body: 'framework: nolang\ncategory: web-frontend\ndeps: [x]\nsecurity:\n  concerns: [xss]\n'
    },
    {
      id: 'missing-category',
      body: 'framework: nocat\nlanguage: typescript\ndeps: [x]\nsecurity:\n  concerns: [xss]\n'
    },
    {
      id: 'empty-security-concerns',
      body: 'framework: noconcern\ncategory: web-frontend\nlanguage: typescript\ndeps: [x]\nsecurity:\n  concerns: []\n'
    },
    {
      id: 'empty-deps',
      body: 'framework: nodeps\ncategory: web-frontend\nlanguage: typescript\ndeps: []\nsecurity:\n  concerns: [xss]\n'
    }
  ];
  for (const c of CASES) {
    it(`rejects and warns on a framework override that is ${c.id}`, () => {
      const dir = makeProject(`ctoc-fw-bad-${c.id}-`);
      try {
        writeOverride(dir, 'frameworks', 'bad.yaml', c.body);
        const { frameworks, warnings } = registry.loadFrameworks(dir);
        assert.ok(frameworks.nextjs, 'the bundled frameworks must still load alongside the bad override');
        assert.ok(
          warnings.some((w) => /bad\.yaml/.test(JSON.stringify(w)) && /malformed framework/.test(JSON.stringify(w))),
          'the malformed override must be skipped WITH a warning naming the file'
        );
      } finally { rm(dir); }
    });
  }
});

describe('capability-registry: isValidProjectType — a malformed override is SKIPPED + WARNED (389-403, 440-442)', () => {
  const CASES = [
    {
      id: 'missing-run-block',
      body: 'projectType: norun\ndetectionMarkers: [nr.marker]\nphases:\n  test: relevant\nconfigScaffold: [foo.cfg]\n'
    },
    {
      id: 'empty-configScaffold',
      body: 'projectType: nocfg\ndetectionMarkers: [nc.marker]\nphases:\n  test: relevant\nrun:\n  strategy: node\n  honest: true\nconfigScaffold: []\n'
    }
  ];
  for (const c of CASES) {
    it(`rejects and warns on a project-type override that is ${c.id}`, () => {
      const dir = makeProject(`ctoc-pt-bad-${c.id}-`);
      try {
        writeOverride(dir, 'project-types', 'bad.yaml', c.body);
        const { projectTypes, warnings } = registry.loadProjectTypes(dir);
        assert.ok(projectTypes.cli, 'the bundled project types must still load alongside the bad override');
        assert.ok(
          warnings.some((w) => /bad\.yaml/.test(JSON.stringify(w)) && /malformed project-type/.test(JSON.stringify(w))),
          'the malformed override must be skipped WITH a warning naming the file'
        );
      } finally { rm(dir); }
    });
  }
});

// ── LOADER ERROR PATHS — every dir, fail-open (unreadable / > MAX_FILES / > MAX_FILE_BYTES / per-entry throw) ──

// One config row per capability dimension: the read*Dir functions are structurally identical, so
// each dark error branch is a SEPARATE mutant per loader — we kill all four.
const DIMENSIONS = [
  {
    name: 'languages', kind: 'languages', load: (d) => registry.load(d),
    mapKey: 'languages', bundled: 'rust',
    msg: { unreadable: /unreadable capabilities dir/, tooMany: /too many capability files/, tooLarge: /capability file too large/, parseFail: /capability parse\/read failed/ }
  },
  {
    name: 'project-types', kind: 'project-types', load: (d) => registry.loadProjectTypes(d),
    mapKey: 'projectTypes', bundled: 'cli',
    msg: { unreadable: /unreadable project-types dir/, tooMany: /too many project-type files/, tooLarge: /project-type file too large/, parseFail: /project-type parse\/read failed/ }
  },
  {
    name: 'databases', kind: 'databases', load: (d) => registry.loadDatabases(d),
    mapKey: 'databases', bundled: 'postgresql',
    msg: { unreadable: /unreadable databases dir/, tooMany: /too many database files/, tooLarge: /database file too large/, parseFail: /database parse\/read failed/ }
  },
  {
    name: 'frameworks', kind: 'frameworks', load: (d) => registry.loadFrameworks(d),
    mapKey: 'frameworks', bundled: 'nextjs',
    msg: { unreadable: /unreadable frameworks dir/, tooMany: /too many framework files/, tooLarge: /framework file too large/, parseFail: /framework parse\/read failed/ }
  }
];

for (const dim of DIMENSIONS) {
  describe(`capability-registry: ${dim.name} loader — fail-open error paths (never throws, always warns, keeps the bundled seed)`, () => {
    it(`warns "unreadable ${dim.name} dir" when the override path is a FILE, not a directory (readdir throws)`, () => {
      const dir = makeProject(`ctoc-${dim.name}-unread-`);
      try {
        // existsSync is true for a file, so readdir is attempted and throws ENOTDIR → the catch.
        fs.mkdirSync(path.join(dir, '.ctoc', 'capabilities'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.ctoc', 'capabilities', dim.kind), 'i am a file, not a dir\n');
        const res = dim.load(dir);
        assert.ok(res[dim.mapKey][dim.bundled], 'the bundled seed must still load — the bad override dir is fail-open');
        assert.ok(res.warnings.some((w) => dim.msg.unreadable.test(JSON.stringify(w))),
          'an unreadable override dir must degrade to a warning, never a throw');
      } finally { rm(dir); }
    });

    it(`warns "too many ${dim.name} files" when the override dir exceeds MAX_FILES (${MAX_FILES}) and skips it whole`, () => {
      const dir = makeProject(`ctoc-${dim.name}-many-`);
      try {
        const od = overrideDir(dir, dim.kind);
        // MAX_FILES + 1 .yaml files — the cap is `entries.length > MAX_FILES`, so exactly one over trips it.
        for (let i = 0; i <= MAX_FILES; i++) fs.writeFileSync(path.join(od, `f${i}.yaml`), '');
        const res = dim.load(dir);
        assert.ok(res[dim.mapKey][dim.bundled], 'the bundled seed still loads — only the oversized override dir is skipped');
        assert.ok(res.warnings.some((w) => dim.msg.tooMany.test(JSON.stringify(w))),
          'a dir over the file cap must be skipped whole with a warning');
      } finally { rm(dir); }
    });

    it(`warns "${dim.name} file too large" when an override file exceeds MAX_FILE_BYTES (${MAX_FILE_BYTES}) and skips just that file`, () => {
      const dir = makeProject(`ctoc-${dim.name}-large-`);
      try {
        // One byte over the cap → skipped. Content is never parsed, so its shape is irrelevant.
        writeOverride(dir, dim.kind, 'huge.yaml', 'x'.repeat(MAX_FILE_BYTES + 1));
        const res = dim.load(dir);
        assert.ok(res[dim.mapKey][dim.bundled], 'the bundled seed still loads — only the oversized file is skipped');
        assert.ok(res.warnings.some((w) => /huge\.yaml/.test(JSON.stringify(w)) && dim.msg.tooLarge.test(JSON.stringify(w))),
          'an oversized capability file must be skipped with a warning naming it');
      } finally { rm(dir); }
    });

    it(`warns "${dim.name} parse/read failed" when a *.yaml entry is itself a DIRECTORY (readFile throws EISDIR)`, () => {
      const dir = makeProject(`ctoc-${dim.name}-eisdir-`);
      try {
        const od = overrideDir(dir, dim.kind);
        // A directory named like a capability file: readdir lists it, statSync passes the size cap,
        // then readFileSync throws EISDIR → the per-entry catch (fail-open, one warning).
        fs.mkdirSync(path.join(od, 'entry.yaml'));
        const res = dim.load(dir);
        assert.ok(res[dim.mapKey][dim.bundled], 'the bundled seed still loads — a single unreadable entry never aborts the load');
        assert.ok(res.warnings.some((w) => /entry\.yaml/.test(JSON.stringify(w)) && dim.msg.parseFail.test(JSON.stringify(w))),
          'a per-entry read failure must degrade to a warning naming the entry');
      } finally { rm(dir); }
    });
  });
}

// ── TOLERANT-PARSER EDGES via a real override (parseValue 190-194, topLevelColon quote-tracking 165-169) ──

describe('capability-registry: parser edges — quoting is respected, invalid JSON degrades, colons inside quotes are not separators', () => {
  it('a single-quoted scalar is stored as its inner string (parseValue single-quote branch)', () => {
    const dir = makeProject('ctoc-parse-sq-');
    try {
      writeOverride(dir, 'languages', 'sqlang.yaml',
        "language: sqlang\n" +
        "detectionMarkers: [sq.marker]\n" +
        "note: 'hello world'\n" +
        "toolchain:\n" +
        "  test: { cmd: \"t\", tool: t, verified: UNVERIFIED }\n");
      const cap = registry.capabilitiesFor('sqlang', dir);
      assert.equal(cap.note, 'hello world',
        "a single-quoted scalar must yield its inner text, not keep the quotes");
    } finally { rm(dir); }
  });

  it('a double-quoted scalar that is INVALID JSON falls back to the raw inner string (JSON.parse catch)', () => {
    const dir = makeProject('ctoc-parse-badjson-');
    try {
      // "in\qx" — \q is not a legal JSON escape, so JSON.parse throws and the catch returns the
      // inner slice verbatim. A mutant that drops the try/catch would throw and skip the file.
      writeOverride(dir, 'languages', 'bjlang.yaml',
        'language: bjlang\n' +
        'detectionMarkers: [bj.marker]\n' +
        'note: "in\\qx"\n' +
        'toolchain:\n' +
        '  test: { cmd: "t", tool: t, verified: UNVERIFIED }\n');
      const cap = registry.capabilitiesFor('bjlang', dir);
      assert.ok(cap, 'a file with an invalid-JSON scalar must still load (fail-open on the scalar, not the file)');
      assert.equal(cap.note, 'in\\qx',
        'an invalid double-quoted escape must degrade to the raw inner string, never throw');
    } finally { rm(dir); }
  });

  it('a colon inside a quoted (escaped) KEY is not treated as the key/value separator (topLevelColon quote+escape)', () => {
    const dir = makeProject('ctoc-parse-quotedkey-');
    try {
      // On disk the extra top-level line is:  "k\:x": val
      // topLevelColon must skip the escaped backslash and the in-quote colon and split at the
      // FINAL colon, so the key is `k\:x` and the value is `val`. Broken quote-tracking would
      // split at the in-quote colon and corrupt the field.
      writeOverride(dir, 'languages', 'qklang.yaml',
        'language: qklang\n' +
        'detectionMarkers: [qk.marker]\n' +
        '"k\\:x": val\n' +
        'toolchain:\n' +
        '  test: { cmd: "t", tool: t, verified: UNVERIFIED }\n');
      const cap = registry.capabilitiesFor('qklang', dir);
      assert.ok(cap, 'the override must load');
      assert.equal(cap['k\\:x'], 'val',
        'the key/value split must occur at the colon OUTSIDE the quotes, honoring the escaped char');
    } finally { rm(dir); }
  });
});

// ── HONESTY GUARD in runStrategyFor — an empty run command is null, never a fabricated empty run ──

describe('capability-registry: runStrategyFor() — an empty run command yields null (never a fabricated empty "it ran")', () => {
  it('returns null when the language declares the shape as an EMPTY string (second operand of the guard)', () => {
    const dir = makeProject('ctoc-run-empty-');
    try {
      // cli is declared but empty. `typeof command !== 'string'` is FALSE ("" is a string), so ONLY
      // `command.length === 0` can reject it — this test pins that operand. A caller must never get
      // { command: "" } and treat an empty string as a runnable command.
      writeOverride(dir, 'languages', 'emptyrun.yaml',
        'language: emptyrun\n' +
        'detectionMarkers: [er.marker]\n' +
        'toolchain:\n' +
        '  test: { cmd: "t", tool: t, verified: UNVERIFIED }\n' +
        'run:\n' +
        '  honest: true\n' +
        '  shapes: { cli: "" }\n');
      assert.equal(registry.runStrategyFor('emptyrun', 'cli', dir), null,
        'an empty run command must resolve to null, never { command: "" }');
    } finally { rm(dir); }
  });

  it('returns the command + honest flag when the shape IS a real non-empty string (positive control)', () => {
    const dir = makeProject('ctoc-run-real-');
    try {
      writeOverride(dir, 'languages', 'realrun.yaml',
        'language: realrun\n' +
        'detectionMarkers: [rr.marker]\n' +
        'toolchain:\n' +
        '  test: { cmd: "t", tool: t, verified: UNVERIFIED }\n' +
        'run:\n' +
        '  honest: true\n' +
        '  shapes: { cli: "realrun start" }\n');
      const s = registry.runStrategyFor('realrun', 'cli', dir);
      assert.equal(s.command, 'realrun start', 'a real shape command must be returned verbatim');
      assert.equal(s.honest, true, 'the run honesty flag is carried through from the language data');
    } finally { rm(dir); }
  });
});
