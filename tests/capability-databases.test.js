'use strict';

/**
 * THE DATABASES CAPABILITY DIMENSION — wave 1 (data + dep detection + live wiring).
 *
 * Databases live in a project's DEPENDENCIES (pg, mongoose, redis), not in marker
 * files — so detection is dep-parsing in stack-detector, and the capability data
 * (category + security posture + migration) lives in the registry as 10 web-grounded
 * 2026 YAMLs. This wave proves three things end to end:
 *
 *   • DATA — all 10 database YAMLs load with ZERO warnings and carry category,
 *     security (injection/rls/connection/leastPrivilege), and migration.
 *   • DETECTION — a project's deps map each database's `deps` to a detected DB,
 *     ENRICHED with its capability (postgres → rls supported; mongo → rls
 *     not-applicable).
 *   • WIRING — detectStack gains an additive `databases` field; languages /
 *     frameworks / primary are UNCHANGED (wired-is-done: the registry data flows
 *     through stack-detector → detectStack → SessionStart, never dead).
 *
 * ZERO DOUBLES: every case builds a REAL project dir on disk and reads the REAL
 * bundled seed YAML. Nothing is mocked.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const registry = require('../src/lib/capability-registry');
const stackDetector = require('../src/lib/stack-detector');

const THE_TEN = [
  'postgresql', 'mysql', 'mongodb', 'redis', 'sqlite',
  'sqlserver', 'oracle', 'clickhouse', 'duckdb', 'pgvector'
];
const ALLOWED_VERIFIED = new Set(['web-2026-07', 'UNVERIFIED']);
const ALLOWED_CATEGORY = new Set(['relational', 'document', 'keyvalue', 'analytics', 'vector']);
const ALLOWED_RLS = new Set(['supported', 'not-applicable', 'not-native']);
// Per the plan + the human's design note.
const RLS_SUPPORTED = new Set(['postgresql', 'sqlserver', 'oracle', 'clickhouse', 'pgvector']);
const RLS_NOT_APPLICABLE = new Set(['mongodb', 'redis', 'sqlite', 'duckdb']);

/** Make a fresh temp project dir. */
function makeProject(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
/** Remove a temp dir, best-effort. */
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
/** Write a file into a project, creating parent dirs. */
function writeFile(dir, name, body) {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}

describe('databases: loadDatabases() — data-driven, fail-open', () => {
  it('loads all 10 bundled databases with ZERO warnings', () => {
    const reg = registry.loadDatabases();
    assert.ok(reg && typeof reg === 'object', 'loadDatabases must return an object');
    assert.ok(reg.databases && typeof reg.databases === 'object', 'must return a databases map');
    for (const db of THE_TEN) {
      assert.ok(reg.databases[db], `bundled data must include ${db}`);
    }
    assert.ok(Array.isArray(reg.warnings), 'must expose a warnings array');
    assert.deepEqual(reg.warnings, [], 'the shipped seed data must load with zero warnings');
  });

  it('every database carries category, security and migration', () => {
    const { databases } = registry.loadDatabases();
    for (const name of THE_TEN) {
      const db = databases[name];
      assert.equal(db.database, name, `${name}: database key must match filename`);
      assert.ok(ALLOWED_CATEGORY.has(db.category), `${name}: category must be a known token (got ${db.category})`);
      assert.ok(db.security && typeof db.security === 'object', `${name}: must carry a security object`);
      assert.ok(typeof db.security.injection === 'string' && db.security.injection.length > 0, `${name}: security.injection required`);
      assert.ok(ALLOWED_RLS.has(db.security.rls), `${name}: security.rls must be a known token (got ${db.security.rls})`);
      assert.ok(typeof db.security.connection === 'string' && db.security.connection.length > 0, `${name}: security.connection required`);
      assert.ok(db.migration && typeof db.migration === 'object', `${name}: must carry a migration object`);
      assert.ok(Array.isArray(db.migration.tools), `${name}: migration.tools must be an array`);
      assert.ok(ALLOWED_VERIFIED.has(db.verified), `${name}: verified must be web-2026-07 or UNVERIFIED (got ${db.verified})`);
      assert.ok(Array.isArray(db.deps) && db.deps.length > 0, `${name}: deps must be a non-empty array (detection depends on it)`);
    }
  });

  // ADDITION 9 — a placeholder is definitionally not content.
  //
  // The honest limit, stated rather than papered over: there is NO defined
  // contract anywhere in this repository for what security.injection or
  // security.connection must SAY. Verified — capability-registry.js validates
  // neither field, tests/capability-data-correctness.test.js asserts on neither,
  // and no template or plan defines their content. So NO content specification is
  // invented here. Asserting a minimum length, a keyword or a structure would
  // encode an opinion as a shipped requirement and would go green, which is worse
  // than the non-emptiness check it replaced because it would LOOK like proof.
  //
  // What CAN be asserted without inventing anything: TODO / TBD / FIXME / XXX and
  // an empty-after-trim string are authoring artefacts, not a description of
  // injection posture. Today `injection: "TODO"` satisfies
  // `typeof … === 'string' && length > 0`.
  //
  // WHY `XXX` IS MATCHED WHOLE-FIELD ONLY, NEVER BY SUBSTRING — do not "simplify"
  // this back into a `.includes('XXX')`: `XXX` is the universal convention for
  // redacting a credential in a connection string (`postgres://user:XXX@host/db`).
  // In a field literally named security.connection a redacted example connection
  // string is legitimate content, and a substring rule would reject it. A
  // tightening that rejects legitimate content is not tighter, it is broken. The
  // false-positive case below proves that rejection is absent rather than assumed.
  // TODO / TBD / FIXME keep a word-boundary match — they are unambiguous in prose.
  const WORD_BOUNDED_PLACEHOLDER = /\b(TODO|TBD|FIXME)\b/i;
  const WHOLE_FIELD_PLACEHOLDER = /^[\s\p{P}]*(TODO|TBD|FIXME|XXX)[\s\p{P}]*$/iu;

  function placeholderReason(value) {
    if (typeof value !== 'string' || value.trim().length === 0) return 'empty or not a string';
    if (WHOLE_FIELD_PLACEHOLDER.test(value)) return `the whole field is a placeholder token: ${JSON.stringify(value)}`;
    if (WORD_BOUNDED_PLACEHOLDER.test(value)) return `contains an authoring placeholder: ${JSON.stringify(value)}`;
    return null;
  }

  it('no shipped security field is a placeholder (TODO/TBD/FIXME/XXX or blank)', () => {
    const { databases } = registry.loadDatabases();
    for (const name of THE_TEN) {
      const db = databases[name];
      for (const field of ['injection', 'connection']) {
        const reason = placeholderReason(db.security[field]);
        assert.equal(reason, null, `${name}: security.${field} must be content, not a placeholder — ${reason}`);
      }
    }
  });

  it('a REDACTED connection string is legitimate content, not a placeholder', () => {
    // The false-positive case. `XXX` here is a redaction marker inside real
    // documentation — it must pass. The value is a synthetic, non-routable
    // example with no real credential in it.
    assert.equal(placeholderReason('tls-required; e.g. postgres://user:XXX@db.example.invalid/app'), null,
      'a redacted example connection string must NOT be rejected');
    assert.equal(placeholderReason('parameterized-queries only; never concatenate input'), null,
      'ordinary prose must not be rejected');

    // …and the rule still bites where it should.
    assert.notEqual(placeholderReason('TODO'), null, 'a bare TODO is a placeholder');
    assert.notEqual(placeholderReason('  tbd  '), null, 'a padded TBD is a placeholder');
    assert.notEqual(placeholderReason('XXX'), null, 'a field that IS XXX is a placeholder');
    assert.notEqual(placeholderReason('TODO: describe injection posture'), null, 'a prose TODO is a placeholder');
    assert.notEqual(placeholderReason('   '), null, 'blank is not content');
  });

  it('RLS posture matches the design: supported vs not-applicable per database', () => {
    const { databases } = registry.loadDatabases();
    for (const name of RLS_SUPPORTED) {
      assert.equal(databases[name].security.rls, 'supported', `${name}: RLS must be supported`);
    }
    for (const name of RLS_NOT_APPLICABLE) {
      assert.equal(databases[name].security.rls, 'not-applicable', `${name}: RLS must be not-applicable`);
    }
    // MySQL RLS is NOT native — it must be honestly flagged, never claimed 'supported'.
    assert.notEqual(databases.mysql.security.rls, 'supported', 'mysql RLS must not be claimed supported (not native)');
  });

  it('a malformed override is SKIPPED + warned; valid ones still load', () => {
    const dir = makeProject('ctoc-db-bad-');
    try {
      writeFile(dir, '.ctoc/capabilities/databases/broken.yaml', ':::not yaml at all\n\t- [unclosed\n');
      writeFile(dir, '.ctoc/capabilities/databases/cockroach.yaml',
        'database: cockroach\n' +
        'category: relational\n' +
        'deps: [pg]\n' +
        'security:\n' +
        '  injection: parameterized-queries\n' +
        '  rls: supported\n' +
        '  connection: tls-required\n' +
        '  leastPrivilege: separate-identities\n' +
        'migration:\n' +
        '  tools: [atlas]\n' +
        '  safetyLint: "atlas migrate lint"\n' +
        'verified: UNVERIFIED\n');
      const reg = registry.loadDatabases(dir);
      assert.ok(reg.databases.cockroach, 'the valid override must load');
      assert.ok(reg.databases.postgresql, 'bundled databases must still load alongside overrides');
      assert.ok(reg.warnings.length >= 1, 'the malformed entry must warn');
      assert.ok(reg.warnings.some((w) => /broken\.yaml/.test(JSON.stringify(w))), 'the warning must name the offending file');
    } finally { rm(dir); }
  });
});

describe('databases: databaseCapability(name)', () => {
  it('returns the full capability for a known database, null for unknown', () => {
    const pg = registry.databaseCapability('postgresql');
    assert.ok(pg, 'postgresql must resolve');
    assert.equal(pg.category, 'relational');
    assert.equal(pg.security.rls, 'supported');
    assert.equal(pg.security.connection, 'tls-required');
    assert.equal(registry.databaseCapability('no-such-db'), null, 'unknown database resolves to null');
  });
});

describe('databases: detectDatabases() — dep-driven, enriched', () => {
  it('a package.json with `pg` detects postgresql, enriched (rls supported, tls)', () => {
    const dir = makeProject('ctoc-db-pg-');
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'x', dependencies: { pg: '^8.0.0' } }));
      const dbs = stackDetector.detectDatabases(dir);
      const pg = dbs.find((d) => d.name === 'postgresql');
      assert.ok(pg, 'must detect postgresql from the `pg` dependency');
      assert.equal(pg.category, 'relational');
      assert.equal(pg.security.rls, 'supported');
      assert.equal(pg.security.connection, 'tls-required');
    } finally { rm(dir); }
  });

  it('a requirements.txt with `psycopg2` detects postgresql', () => {
    const dir = makeProject('ctoc-db-psy-');
    try {
      writeFile(dir, 'requirements.txt', 'psycopg2==2.9.9\nflask\n');
      const dbs = stackDetector.detectDatabases(dir);
      assert.ok(dbs.some((d) => d.name === 'postgresql'), 'must detect postgresql from psycopg2');
    } finally { rm(dir); }
  });

  it('a `mongoose` dependency detects mongodb (rls not-applicable)', () => {
    const dir = makeProject('ctoc-db-mongo-');
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'x', dependencies: { mongoose: '^8.0.0' } }));
      const dbs = stackDetector.detectDatabases(dir);
      const mongo = dbs.find((d) => d.name === 'mongodb');
      assert.ok(mongo, 'must detect mongodb from mongoose');
      assert.equal(mongo.category, 'document');
      assert.equal(mongo.security.rls, 'not-applicable');
    } finally { rm(dir); }
  });

  it('returns an empty array for a project with no database deps', () => {
    const dir = makeProject('ctoc-db-empty-');
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'x', dependencies: { lodash: '^4.0.0' } }));
      const dbs = stackDetector.detectDatabases(dir);
      assert.deepEqual(dbs, [], 'no database deps → empty array');
    } finally { rm(dir); }
  });
});

describe('databases: detectStack adds `databases` ADDITIVELY', () => {
  it('a pg + react project keeps languages/frameworks/primary and gains databases', () => {
    const dir = makeProject('ctoc-db-stack-');
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'x', dependencies: { pg: '^8.0.0', react: '^18.0.0' } }));
      writeFile(dir, 'tsconfig.json', '{}');
      const stack = stackDetector.detectStack(dir);

      // Existing contract UNCHANGED.
      assert.ok(Array.isArray(stack.languages), 'languages preserved');
      assert.ok(stack.languages.includes('typescript'), 'typescript still detected');
      assert.ok(Array.isArray(stack.frameworks), 'frameworks preserved');
      assert.ok(stack.frameworks.includes('react'), 'react still detected');
      assert.ok(stack.primary && 'language' in stack.primary && 'framework' in stack.primary, 'primary preserved');

      // Additive field.
      assert.ok(Array.isArray(stack.databases), 'detectStack gains a databases array');
      assert.ok(stack.databases.some((d) => d.name === 'postgresql'), 'postgresql present in stack.databases');
    } finally { rm(dir); }
  });

  it('a project with no database deps still returns databases: []', () => {
    const dir = makeProject('ctoc-db-stack-empty-');
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'x', dependencies: { express: '^4.0.0' } }));
      const stack = stackDetector.detectStack(dir);
      assert.ok(Array.isArray(stack.databases), 'databases is always an array');
      assert.deepEqual(stack.databases, [], 'no db deps → empty databases');
    } finally { rm(dir); }
  });
});
