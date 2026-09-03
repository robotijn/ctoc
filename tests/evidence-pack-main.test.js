'use strict';

// ===========================================================================
// evidence-pack — the COMMAND, run for real.
//
// `src/scripts/evidence-pack.js` ships as an executable command (a declared
// execution root in .ctoc/reachability-roots.json, named in the coordinator's
// own instructions). Until this file existed its `main()` had NEVER run under
// a test: the two sibling test files drive `parseArgs`, `collectInputs` and
// `packWithTar` only. A compliance-artifact generator whose command path has
// never executed is the shape Operating Lesson 16 names, one step over —
// tested helpers, unrun command.
//
// Every case here spawns the REAL file at its REAL path as a child process
// (argument array, no shell) against a seeded fixture project, so the shipped
// bytes are what is measured and a spawned child's coverage is attributed back
// to the real file.
//
// RANGES THIS FILE COVERS (the file measured 59.56 % before this slice; these
// are its uncovered ranges AS MEASURED THEN — the root seam this slice adds
// shifts every number below by +16):
//   97-101   collectInputs' .ctoc/baselines/<ver>/manifest.yaml walk
//   115      collectAllInWindow's recursive directory arm
//   123-125  hashFile
//   127-129  ensureDir
//   131-137  readChainHead (both the found and the absent arm)
//   139-146  readActiveRegimes
//   157-206  main — manifest, archive, the tar-absent fallback, the empty guard
//   208-221  yamlify
//
// RANGES THIS FILE DELIBERATELY LEAVES (re-measured after the five fixes: the
// file is at 99.05 % line coverage, up from 98.76 %; the SAME two lines remain,
// at their new numbers, both named here rather than faked):
//   205-206  `readActiveRegimes`' catch arm. It is entered only when requiring
//            ../lib/regulatory-regime THROWS. A fixture cannot make a
//            first-party module fail to load without mocking the loader inside
//            the child, and the arm returns [] — exactly what the success path
//            returns for a project with no regime settings — so a case there
//            would assert nothing a mutation would break.
//   311      `yamlify`'s scalar arm (`return String(obj)`). yamlify is not
//            exported and `main` only ever hands it the manifest object, so no
//            caller can reach it: DEAD within this file's reachable surface.
//            Reported to the human, never deleted here — removing a line is its
//            own decision with its own plan.
//
// WHAT THIS FILE USED TO PIN, AND NOW ASSERTS FIXED. Five behaviours were once
// asserted here exactly as the command really had them, and reported to the
// human as findings rather than changed. The human ordered the fix; that order
// is a contract change from OUTSIDE the tests, so each pin is replaced by a
// STRICTLY STRONGER assertion of the fixed contract (Operating Lesson 14 — no
// assertion is widened, deleted, or relaxed):
//   1. the pack's root was the repository the SCRIPT lives in, not the project
//      the human is in. Now: CTOC_EVIDENCE_ROOT, else a working directory that
//      holds a .ctoc/ DIRECTORY, else a loud refusal that writes nothing
//      ('packs the working directory…' and 'refuses a working directory…');
//   2. the archive did NOT contain the manifest. Now the manifest is its FIRST
//      member, and the member's bytes equal the manifest on disk ('puts its own
//      manifest first in the archive');
//   3. with `tar` unavailable the command exited 0. Now it exits non-zero and
//      the message names the degradation, with the salvage bundle still written
//      ('exits non-zero and names the degradation…');
//   4. the file it names `.manifest.yaml` was not valid YAML. Now js-yaml — a
//      real parser, not one of the repository's never-throwing hand-rolled
//      readers — loads it and the parsed window equals the requested window
//      ('the manifest parses, and the parsed window…');
//   5. three of the eight collectors ignored the --since/--until window (the
//      audit chain log, the provenance event log, and each version's baseline
//      manifest). Now every collector honours the same bounds ('the window
//      binds every collector', 'a 1970 window collects nothing').
//
// The provenance event log is seeded by buildFixture BECAUSE of finding 5: no
// fixture ever wrote .ctoc/ai-provenance.jsonl, so that collector's push line
// had never executed under any test and its window-blindness was invisible.
// ===========================================================================

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'src', 'scripts', 'evidence-pack.js');

// A window wide enough that a file created right now falls inside it in every
// timezone: two days back to two days forward, in UTC calendar dates.
const utcDay = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
const SINCE = utcDay(-2);
const UNTIL = utcDay(2);

// The 1970 window used by the empty-window and default-root cases.
const OLD_SINCE = '1970-01-01';
const OLD_UNTIL = '1970-01-02';

// Everything this file could ever leave in the REPOSITORY's evidence directory.
const REPO_LEFTOVER_PREFIXES = [
  `${SINCE}_to_${UNTIL}`,
  `${OLD_SINCE}_to_${OLD_UNTIL}`,
  `.pack-${SINCE}`,
  `.pack-${OLD_SINCE}`,
];

const tempDirs = [];
function mkTemp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

// A fixture project seeded so every collector and every helper runs.
function buildFixture() {
  const fix = mkTemp('ctoc-evpack-main-');
  const write = (rel, content) => {
    const p = path.join(fix, ...rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
    return p;
  };
  write(['.ctoc', 'audit', 'dispatches', '2026-08-31', 'd1.yaml'], 'dispatch_id: d1\nagent: iron-loop-executor\n');
  write(['.ctoc', 'audit', 'chain.jsonl'], '{"seq":1,"event":"gate-crossed"}\n');
  write(['.ctoc', 'audit', 'chain-head.yaml'], 'seq: 1\nhash: abc123\n');
  write(['plans', 'done', 'a-plan.md'], '---\ntitle: an approved plan\napproved_by: human\n---\n\n# Body\n');
  write(['plans', 'done', 'not-approved.md'], '---\ntitle: never crossed a gate\n---\n\n# Body\n');
  write(['.ctoc', 'threat-models', 'nested', 't.json'], '{"threat":"spoofing"}\n');
  write(['.ctoc', 'baselines', '6.14.36', 'manifest.yaml'], 'version: 6.14.36\nfiles: []\n');
  write(['.ctoc', 'capa', 'c1.yaml'], 'capa_id: c1\nstatus: open\n');
  write(['.ctoc', 'ai-provenance.jsonl'], '{"event":"generation","model":"opus"}\n');
  return fix;
}

// The artifacts the fixture above must produce, in no particular order.
const FIXTURE_ARTIFACTS = [
  path.join('.ctoc', 'audit', 'dispatches', '2026-08-31', 'd1.yaml'),
  path.join('.ctoc', 'audit', 'chain.jsonl'),
  path.join('plans', 'done', 'a-plan.md'),
  path.join('.ctoc', 'threat-models', 'nested', 't.json'),
  path.join('.ctoc', 'baselines', '6.14.36', 'manifest.yaml'),
  path.join('.ctoc', 'capa', 'c1.yaml'),
  path.join('.ctoc', 'ai-provenance.jsonl'),
];

// `cwd` defaults to undefined, which spawnSync reads as "inherit this process's
// working directory" — byte-for-byte what every pre-existing call did.
function run({ root, since = SINCE, until = UNTIL, env = {}, cwd = undefined }) {
  const childEnv = { ...process.env, ...env };
  if (root === null) delete childEnv.CTOC_EVIDENCE_ROOT;
  else childEnv.CTOC_EVIDENCE_ROOT = root;
  return spawnSync(process.execPath, [SCRIPT, `--since=${since}`, `--until=${until}`], {
    env: childEnv,
    cwd,
    encoding: 'utf8',
  });
}

const packDir = (root) => path.join(root, '.ctoc', 'evidence-packs');
const manifestPath = (root, since = SINCE, until = UNTIL) =>
  path.join(packDir(root), `${since}_to_${until}.manifest.yaml`);
const tarPath = (root, since = SINCE, until = UNTIL) =>
  path.join(packDir(root), `${since}_to_${until}.tar.gz`);
const jsonPath = (root, since = SINCE, until = UNTIL) =>
  path.join(packDir(root), `${since}_to_${until}.json`);

// Top-level scalars of the hand-rolled YAML the command writes. Nested keys are
// indented, so a column-0 anchor reads exactly the top level.
function topLevel(text) {
  const out = {};
  for (const m of text.matchAll(/^([a-z_]+):[ ]?(.*)$/gm)) out[m[1]] = m[2];
  return out;
}

function artifactEntries(text) {
  const out = [];
  for (const m of text.matchAll(/^ {2}- path: (.+)\r?\n {4}sha256: ([0-9a-f]{64})\r?\n {4}size_bytes: (\d+)$/gm)) {
    out.push({ path: m[1], sha256: m[2], size: Number(m[3]) });
  }
  return out;
}

// Removes anything this file could have left in the REPOSITORY's own evidence
// directory and reports what it removed. Every fixture case asserts this
// returns nothing: a run pointed at a fixture must not touch the repository.
function sweepRepoEvidenceDir() {
  const dir = packDir(REPO_ROOT);
  const removed = [];
  if (!fs.existsSync(dir)) return removed;
  for (const name of fs.readdirSync(dir)) {
    if (REPO_LEFTOVER_PREFIXES.some((p) => name.startsWith(p))) {
      fs.rmSync(path.join(dir, name), { force: true });
      removed.push(name);
    }
  }
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  return removed;
}

after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  sweepRepoEvidenceDir();
});

describe('evidence-pack main() — the shipped command, executed', () => {
  it('writes the manifest with a nested, parseable window block', () => {
    const fix = buildFixture();
    const res = run({ root: fix });
    assert.equal(res.status, 0, `command must exit 0; stderr: ${res.stderr}`);

    const text = fs.readFileSync(manifestPath(fix), 'utf8');
    const top = topLevel(text);
    assert.equal(top.pack_id, `${SINCE}_${UNTIL}`);
    // Tightened (was: the malformed `window:  since: <date>` bytes, pinned as
    // finding 4). The human ordered the fix, so the byte assertion moves to the
    // correct shape — same exactness, the fixed bytes instead of the broken
    // ones: the parent key ends its line and both children sit one level in.
    assert.ok(
      text.includes(`window:\n  since: ${SINCE}\n  until: ${UNTIL}\n`),
      `the window is a nested block map. Manifest was:\n${text}`
    );

    const entries = artifactEntries(text);
    assert.equal(
      Number(top.artifact_count),
      entries.length,
      'artifact_count must equal the number of listed artifacts'
    );
    assert.deepEqual(
      entries.map((e) => e.path).sort(),
      [...FIXTURE_ARTIFACTS].sort(),
      'the manifest lists exactly the seeded artifacts'
    );
    assert.deepEqual(sweepRepoEvidenceDir(), [], 'a fixture run must not write into the repository');
  });

  it('lists every artifact with its real sha256 and its real byte size', () => {
    const fix = buildFixture();
    assert.equal(run({ root: fix }).status, 0);

    const entries = artifactEntries(fs.readFileSync(manifestPath(fix), 'utf8'));
    assert.ok(entries.length > 0, 'there must be artifacts to check');
    for (const entry of entries) {
      const full = path.join(fix, entry.path);
      const bytes = fs.readFileSync(full);
      assert.equal(
        entry.sha256,
        crypto.createHash('sha256').update(bytes).digest('hex'),
        `sha256 of ${entry.path} must be the hash of the file's BYTES`
      );
      assert.equal(entry.size, fs.statSync(full).size, `size_bytes of ${entry.path} must be the file's size`);
    }
    assert.deepEqual(sweepRepoEvidenceDir(), []);
  });

  it('carries the audit chain head into the manifest, and renders null when there is none', () => {
    const withHead = buildFixture();
    assert.equal(run({ root: withHead }).status, 0);
    assert.equal(
      topLevel(fs.readFileSync(manifestPath(withHead), 'utf8')).chain_head_at_pack_time,
      'abc123'
    );

    const withoutHead = buildFixture();
    fs.rmSync(path.join(withoutHead, '.ctoc', 'audit', 'chain-head.yaml'));
    assert.equal(run({ root: withoutHead }).status, 0);
    assert.equal(
      topLevel(fs.readFileSync(manifestPath(withoutHead), 'utf8')).chain_head_at_pack_time,
      'null',
      'an absent chain head renders the literal null, never an empty string'
    );
    assert.deepEqual(sweepRepoEvidenceDir(), []);
  });

  it('collects only the plans that carry an approval marker', () => {
    const fix = buildFixture();
    assert.equal(run({ root: fix }).status, 0);

    const listed = artifactEntries(fs.readFileSync(manifestPath(fix), 'utf8')).map((e) => e.path);
    assert.ok(listed.includes(path.join('plans', 'done', 'a-plan.md')), 'an approved plan is evidence');
    assert.ok(
      !listed.includes(path.join('plans', 'done', 'not-approved.md')),
      'a plan with no approval marker is not evidence'
    );
    assert.deepEqual(sweepRepoEvidenceDir(), []);
  });

  it('collects the configuration baseline manifest and walks nested artifact directories', () => {
    const fix = buildFixture();
    assert.equal(run({ root: fix }).status, 0);

    const listed = artifactEntries(fs.readFileSync(manifestPath(fix), 'utf8')).map((e) => e.path);
    assert.ok(
      listed.includes(path.join('.ctoc', 'baselines', '6.14.36', 'manifest.yaml')),
      'the per-version baseline manifest is collected'
    );
    assert.ok(
      listed.includes(path.join('.ctoc', 'threat-models', 'nested', 't.json')),
      'a file one directory down is reached by the recursive walk'
    );
    assert.deepEqual(sweepRepoEvidenceDir(), []);
  });

  it('puts its own manifest first in the archive, and the member is the manifest verbatim', () => {
    // Tightened (was: 'packs an archive whose members are exactly the collected
    // artifacts — and NOT the manifest', which asserted the ABSENCE of the
    // manifest as finding 2). An absence assertion becomes presence + position +
    // byte-identical content, and the artifact member list stays exact.
    const fix = buildFixture();
    assert.equal(run({ root: fix }).status, 0);

    const archive = tarPath(fix);
    assert.ok(fs.existsSync(archive), 'the archive is produced');

    const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
    assert.equal(listing.status, 0, `tar must list the archive; stderr: ${listing.stderr}`);
    const members = listing.stdout.split('\n').map((s) => s.trim()).filter(Boolean);

    const manifestRel = path.relative(fix, manifestPath(fix));
    assert.equal(members[0], manifestRel, 'the manifest is the FIRST member of the archive it describes');

    const listed = artifactEntries(fs.readFileSync(manifestPath(fix), 'utf8')).map((e) => e.path).sort();
    assert.deepEqual(
      members.slice(1).sort(),
      listed,
      'the remaining archive members are exactly the manifest artifact list'
    );

    // The archive stands alone: its manifest member is the manifest on disk.
    const extracted = spawnSync('tar', ['-xzOf', archive, manifestRel], { encoding: 'utf8' });
    assert.equal(extracted.status, 0, `tar must extract the manifest member; stderr: ${extracted.stderr}`);
    assert.equal(
      extracted.stdout,
      fs.readFileSync(manifestPath(fix), 'utf8'),
      'the manifest inside the archive is byte-for-byte the manifest beside it'
    );

    assert.ok(
      !fs.existsSync(path.join(packDir(fix), `.pack-${SINCE}.list`)),
      'the temporary tar input list is removed after packing'
    );
    assert.deepEqual(sweepRepoEvidenceDir(), []);
  });

  it('exits non-zero and names the degradation when tar cannot be found', () => {
    // Tightened (was: 'falls back to a JSON bundle and still exits 0…', which
    // pinned finding 3 with `assert.equal(res.status, 0, 'the documented
    // behaviour is a FALLBACK, not a failure')`). A compliance artifact that
    // degraded its promised format must not report success. Every bundle
    // assertion below is kept verbatim; only the exit code and the message
    // wording are tightened.
    const fix = buildFixture();
    const emptyPathDir = mkTemp('ctoc-evpack-nopath-');
    const res = run({ root: fix, env: { PATH: emptyPathDir, Path: emptyPathDir } });

    assert.equal(res.status, 1, `a degraded format must exit non-zero; stderr: ${res.stderr}`);
    assert.ok(
      res.stderr.includes('tar failed ('),
      `the fallback must announce itself on stderr — if this platform still resolved a tar ` +
        `binary the case did not test what it claims. stderr was: ${JSON.stringify(res.stderr)}`
    );
    assert.match(
      res.stderr,
      /archive was NOT produced in the promised format/,
      'the message names the degradation, not just the underlying tar error'
    );
    assert.match(res.stdout, /Archive: {2}NOT PRODUCED/, 'the final line must not name a .tar.gz that does not exist');
    assert.ok(!fs.existsSync(tarPath(fix)), 'no archive is produced when tar is unavailable');

    const bundle = JSON.parse(fs.readFileSync(jsonPath(fix), 'utf8'));
    assert.deepEqual(Object.keys(bundle).sort(), [...FIXTURE_ARTIFACTS].sort());
    for (const [rel, content] of Object.entries(bundle)) {
      assert.equal(content, fs.readFileSync(path.join(fix, rel), 'utf8'), `${rel} is bundled verbatim`);
    }
    assert.deepEqual(sweepRepoEvidenceDir(), []);
  });

  it('writes a manifest and no archive at all when the window is empty', () => {
    const bare = mkTemp('ctoc-evpack-bare-');
    const res = run({ root: bare, since: OLD_SINCE, until: OLD_UNTIL });
    assert.equal(res.status, 0);

    const text = fs.readFileSync(manifestPath(bare, OLD_SINCE, OLD_UNTIL), 'utf8');
    assert.equal(topLevel(text).artifact_count, '0');
    assert.equal(artifactEntries(text).length, 0);
    assert.ok(!fs.existsSync(tarPath(bare, OLD_SINCE, OLD_UNTIL)), 'no archive');
    assert.ok(!fs.existsSync(jsonPath(bare, OLD_SINCE, OLD_UNTIL)), 'and no fallback bundle either');
    assert.deepEqual(sweepRepoEvidenceDir(), []);
  });

  it('the window binds every collector — a 1970 window collects nothing', () => {
    // Tightened (was: 'pins which collectors ignore the window: the chain log
    // and the baseline manifest', whose exact set was those two files for this
    // very window — finding 5). The same 1970 window over the same full fixture
    // must now yield the EMPTY set: an exact set of two becomes an exact set of
    // zero, which is a strictly stronger claim about the same input.
    const fix = buildFixture();
    assert.equal(run({ root: fix, since: OLD_SINCE, until: OLD_UNTIL }).status, 0);

    const text = fs.readFileSync(manifestPath(fix, OLD_SINCE, OLD_UNTIL), 'utf8');
    assert.deepEqual(artifactEntries(text).map((e) => e.path).sort(), []);
    assert.equal(topLevel(text).artifact_count, '0');
    assert.ok(!fs.existsSync(tarPath(fix, OLD_SINCE, OLD_UNTIL)), 'no archive for an empty window');
    assert.ok(!fs.existsSync(jsonPath(fix, OLD_SINCE, OLD_UNTIL)), 'and no salvage bundle either');
    assert.deepEqual(sweepRepoEvidenceDir(), []);
  });

  it('the window binds every collector — the three formerly unconditional ones included', () => {
    // The audit chain log, the provenance event log and each version's baseline
    // manifest were pushed whenever they existed, whatever their mtime. Age
    // exactly those three out of the window and leave the other four inside it:
    // a mixed fixture proves the bound EXCLUDES without proving only that
    // everything is excluded.
    const fix = buildFixture();
    const aged = [
      path.join('.ctoc', 'audit', 'chain.jsonl'),
      path.join('.ctoc', 'ai-provenance.jsonl'),
      path.join('.ctoc', 'baselines', '6.14.36', 'manifest.yaml'),
    ];
    const old = new Date('2020-01-01T00:00:00Z');
    for (const rel of aged) fs.utimesSync(path.join(fix, rel), old, old);

    assert.equal(run({ root: fix }).status, 0);

    const listed = artifactEntries(fs.readFileSync(manifestPath(fix), 'utf8')).map((e) => e.path).sort();
    assert.deepEqual(
      listed,
      FIXTURE_ARTIFACTS.filter((p) => !aged.includes(p)).sort(),
      'only the artifacts whose mtime falls inside the window are collected'
    );
    assert.deepEqual(sweepRepoEvidenceDir(), []);
  });

  it('the manifest parses, and the parsed window is the window that was asked for', () => {
    // Tightened (was: 'pins a manifest.yaml that no YAML parser will read',
    // whose assertions were `assert.throws(() => yaml.load(text),
    // /bad indentation/)` and `text.includes('active_regulatory_regimes:[]')` —
    // finding 4). A refutation becomes a positive round-trip: the document
    // loads, and every field is asserted against what the command was told.
    //
    // The oracle is js-yaml deliberately. The repository's two hand-rolled YAML
    // readers (src/lib/budget.js, src/lib/v8-dispatcher.js) never throw — they
    // would "parse" the broken manifest into a garbage object and refute
    // nothing, which is the false-green shape this repository fences.
    const yaml = require('js-yaml');
    const fix = buildFixture();
    assert.equal(run({ root: fix }).status, 0);

    const text = fs.readFileSync(manifestPath(fix), 'utf8');
    assert.ok(text.includes('active_regulatory_regimes: []'), 'an empty list carries a space after the colon');

    const parsed = yaml.load(text);
    // js-yaml's default schema resolves an unquoted ISO date to a Date (YAML
    // 1.1 timestamps), so compare calendar days, not object identity — that is
    // what --since/--until name.
    const day = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);
    assert.deepEqual(
      { since: day(parsed.window.since), until: day(parsed.window.until) },
      { since: SINCE, until: UNTIL },
      'the parsed window is exactly the window the command was given'
    );
    assert.deepEqual(parsed.active_regulatory_regimes, [], 'an empty regime list parses as an empty sequence');
    assert.equal(parsed.artifact_count, parsed.artifacts.length, 'the count matches the parsed list length');
    assert.deepEqual(
      parsed.artifacts.map((a) => a.path).sort(),
      [...FIXTURE_ARTIFACTS].sort(),
      'the parsed artifact list is exactly the seeded artifacts'
    );
    for (const a of parsed.artifacts) {
      const bytes = fs.readFileSync(path.join(fix, a.path));
      assert.equal(a.sha256, crypto.createHash('sha256').update(bytes).digest('hex'), `${a.path} hash survives parsing`);
    }
    assert.equal(parsed.chain_head_at_pack_time, 'abc123');
    assert.deepEqual(sweepRepoEvidenceDir(), []);
  });

  it('packs the working directory when it holds .ctoc and no root is named', () => {
    // Replaces 'defaults to the repository the script ships in when no root is
    // named', which asserted finding 1 — the wrong-repository default — by
    // name. With CTOC_EVIDENCE_ROOT unset the command now packs the project the
    // caller is standing in.
    const fix = buildFixture();
    const res = run({ root: null, cwd: fix });
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);

    const written = manifestPath(fix);
    assert.ok(fs.existsSync(written), 'the pack lands under the working directory');
    const text = fs.readFileSync(written, 'utf8');
    assert.equal(topLevel(text).pack_id, `${SINCE}_${UNTIL}`);
    assert.deepEqual(
      artifactEntries(text).map((e) => e.path).sort(),
      [...FIXTURE_ARTIFACTS].sort(),
      'the artifacts come from the working directory, not from the script\'s own repository'
    );
    assert.deepEqual(sweepRepoEvidenceDir(), [], 'the repository is not touched');
  });

  it('refuses a working directory that is not a project, and writes nothing', () => {
    const outside = mkTemp('ctoc-evpack-outside-');
    const res = run({ root: null, cwd: outside });

    assert.equal(res.status, 1, `an unresolvable root must refuse; stdout: ${res.stdout}`);
    assert.match(res.stderr, /CTOC_EVIDENCE_ROOT/, 'the refusal names the explicit-project rule');
    assert.match(res.stderr, /\.ctoc\//, 'the refusal names the project-root rule');
    assert.deepEqual(fs.readdirSync(outside), [], 'the refusal path writes nothing at all');

    // A .ctoc that is a FILE is not a project either.
    const decoy = mkTemp('ctoc-evpack-decoy-');
    fs.writeFileSync(path.join(decoy, '.ctoc'), 'not a directory\n');
    const res2 = run({ root: null, cwd: decoy });
    assert.equal(res2.status, 1, `a .ctoc FILE is not a project root; stdout: ${res2.stdout}`);
    assert.match(res2.stderr, /CTOC_EVIDENCE_ROOT/);
    assert.deepEqual(fs.readdirSync(decoy), ['.ctoc'], 'nothing was written beside the decoy');

    assert.deepEqual(sweepRepoEvidenceDir(), []);
  });

  it('collectInputs refuses when no project can be resolved, naming the cause', () => {
    // The exported seam reads a ROOT frozen at require time. Without its own
    // guard a caller outside a project gets a path.join TypeError that names
    // neither the cause nor the remedy.
    const outside = mkTemp('ctoc-evpack-collect-');
    const childEnv = { ...process.env };
    delete childEnv.CTOC_EVIDENCE_ROOT;
    const child = spawnSync(
      process.execPath,
      ['-e', `require(${JSON.stringify(SCRIPT)}).collectInputs('1970-01-01', '1970-01-02');`],
      { cwd: outside, env: childEnv, encoding: 'utf8' }
    );

    assert.notEqual(child.status, 0, `collectInputs must refuse; stdout: ${child.stdout}`);
    assert.match(child.stderr, /CTOC_EVIDENCE_ROOT/, 'the throw names the explicit-project rule');
    assert.ok(
      !/must be of type string/.test(child.stderr),
      `the refusal must not be a bare path.join TypeError. stderr was:\n${child.stderr}`
    );
    assert.deepEqual(sweepRepoEvidenceDir(), []);
  });
});
