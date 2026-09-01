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
// RANGES THIS FILE DELIBERATELY LEAVES (measured after this slice: the file is
// at 98.76 % line coverage, up from 59.56 %; two lines remain, both named here
// rather than faked):
//   160-161  `readActiveRegimes`' catch arm. It is entered only when requiring
//            ../lib/regulatory-regime THROWS. A fixture cannot make a
//            first-party module fail to load without mocking the loader inside
//            the child, and the arm returns [] — exactly what the success path
//            returns for a project with no regime settings — so a case there
//            would assert nothing a mutation would break.
//   236      `yamlify`'s scalar arm (`return String(obj)`). yamlify is not
//            exported and `main` only ever hands it the manifest object, so no
//            caller can reach it: DEAD within this file's reachable surface.
//            Reported to the human, never deleted here — removing a line is its
//            own decision with its own plan.
//
// WHAT THIS FILE PINS RATHER THAN FIXES — four behaviours the command really
// has, which differ from what the approved plan describes. They are asserted as
// they are and carried to the human as decisions (see the plan's Decisions
// Taken Under Ambiguity):
//   1. the pack's root is the repository the SCRIPT lives in, not the project
//      the human is in ('defaults to the repository the script ships in' pins
//      that default);
//   2. the archive does NOT contain the manifest ('packs an archive whose
//      members are exactly the collected artifacts' asserts the absence);
//   3. with `tar` unavailable the command does NOT fail — it writes a JSON
//      bundle and exits 0 ('falls back to a JSON bundle' asserts it);
//   4. the file it names `.manifest.yaml` is not valid YAML — the nested window
//      map is written on its parent's line and an empty list carries no space
//      after the colon, so a real parser refuses the document. Found by running
//      the command; pinned, not fixed, because the format of a compliance
//      artifact is the human's call.
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
];

function run({ root, since = SINCE, until = UNTIL, env = {} }) {
  const childEnv = { ...process.env, ...env };
  if (root === null) delete childEnv.CTOC_EVIDENCE_ROOT;
  else childEnv.CTOC_EVIDENCE_ROOT = root;
  return spawnSync(process.execPath, [SCRIPT, `--since=${since}`, `--until=${until}`], {
    env: childEnv,
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
  it('writes a manifest describing the window it was given', () => {
    const fix = buildFixture();
    const res = run({ root: fix });
    assert.equal(res.status, 0, `command must exit 0; stderr: ${res.stderr}`);

    const text = fs.readFileSync(manifestPath(fix), 'utf8');
    const top = topLevel(text);
    assert.equal(top.pack_id, `${SINCE}_${UNTIL}`);
    // Pinned drift, NOT a fix (finding 4): the writer never breaks the line
    // before a nested map, so the window's first key lands on its parent's
    // line — `window:  since: <date>` — and the next line is indented under a
    // scalar. The bytes are asserted exactly as they are; the case below shows
    // a real parser refusing the file.
    assert.ok(
      text.includes(`window:  since: ${SINCE}\n  until: ${UNTIL}\n`),
      `the window is written as the command really writes it. Manifest was:\n${text}`
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

  it('packs an archive whose members are exactly the collected artifacts — and NOT the manifest', () => {
    const fix = buildFixture();
    assert.equal(run({ root: fix }).status, 0);

    const archive = tarPath(fix);
    assert.ok(fs.existsSync(archive), 'the archive is produced');

    const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
    assert.equal(listing.status, 0, `tar must list the archive; stderr: ${listing.stderr}`);
    const members = listing.stdout.split('\n').map((s) => s.trim()).filter(Boolean).sort();

    const listed = artifactEntries(fs.readFileSync(manifestPath(fix), 'utf8')).map((e) => e.path).sort();
    assert.deepEqual(members, listed, 'the archive members are exactly the manifest artifact list');

    // Pinned drift, NOT a fix: the manifest is written beside the archive, never
    // into it. Asserted so the omission is visible instead of assumed.
    const manifestRel = path.relative(fix, manifestPath(fix));
    assert.ok(!members.includes(manifestRel), 'the manifest is not a member of the archive it describes');

    assert.ok(
      !fs.existsSync(path.join(packDir(fix), `.pack-${SINCE}.list`)),
      'the temporary tar input list is removed after packing'
    );
    assert.deepEqual(sweepRepoEvidenceDir(), []);
  });

  it('falls back to a JSON bundle and still exits 0 when tar cannot be found', () => {
    const fix = buildFixture();
    const emptyPathDir = mkTemp('ctoc-evpack-nopath-');
    const res = run({ root: fix, env: { PATH: emptyPathDir, Path: emptyPathDir } });

    assert.equal(res.status, 0, 'the documented behaviour is a FALLBACK, not a failure');
    assert.ok(
      res.stderr.includes('tar failed ('),
      `the fallback must announce itself on stderr — if this platform still resolved a tar ` +
        `binary the case did not test what it claims. stderr was: ${JSON.stringify(res.stderr)}`
    );
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

  it('pins which collectors ignore the window: the chain log and the baseline manifest', () => {
    // Six of the eight collectors filter by mtime. Two do not: the audit chain
    // log and every version's baseline manifest are pushed whenever they exist.
    // A 1970 window over the full fixture therefore yields exactly those two.
    // Pinned as current behaviour, and reported — a "window" two collectors do
    // not honour is a finding for the human, not this slice's to change.
    const fix = buildFixture();
    assert.equal(run({ root: fix, since: OLD_SINCE, until: OLD_UNTIL }).status, 0);

    const text = fs.readFileSync(manifestPath(fix, OLD_SINCE, OLD_UNTIL), 'utf8');
    assert.deepEqual(
      artifactEntries(text).map((e) => e.path).sort(),
      [path.join('.ctoc', 'audit', 'chain.jsonl'), path.join('.ctoc', 'baselines', '6.14.36', 'manifest.yaml')].sort()
    );
    assert.deepEqual(sweepRepoEvidenceDir(), []);
  });

  it('pins a manifest.yaml that no YAML parser will read', () => {
    // Finding 4, discovered by running the command: `yamlify` emits a nested
    // map with no line break after its parent key (`window:  since: ...`) and
    // an empty list with no space after the colon
    // (`active_regulatory_regimes:[]`). The file the command names
    // `.manifest.yaml` is therefore not YAML — js-yaml, already used by
    // src/lib/circuit-breaker.js and three sibling test files, refuses it.
    // Whether a compliance manifest must be machine-readable is the human's
    // decision, so this slice pins the behaviour and reports it rather than
    // quietly changing the format of a regulatory artifact.
    const yaml = require('js-yaml');
    const fix = buildFixture();
    assert.equal(run({ root: fix }).status, 0);

    const text = fs.readFileSync(manifestPath(fix), 'utf8');
    assert.ok(text.includes('active_regulatory_regimes:[]'), 'an empty list is written with no space after the colon');
    assert.throws(
      () => yaml.load(text),
      /bad indentation/,
      'the manifest is not parseable YAML — pinned as current behaviour, reported to the human'
    );
    assert.deepEqual(sweepRepoEvidenceDir(), []);
  });

  it('defaults to the repository the script ships in when no root is named', () => {
    // The guard on the seam: with CTOC_EVIDENCE_ROOT unset the command must
    // behave exactly as it always has — pack the repository the file lives in.
    // This is the one case that deliberately writes into the repository tree,
    // so its cleanup is unconditional.
    try {
      const res = run({ root: null, since: OLD_SINCE, until: OLD_UNTIL });
      assert.equal(res.status, 0, `stderr: ${res.stderr}`);
      const written = manifestPath(REPO_ROOT, OLD_SINCE, OLD_UNTIL);
      assert.ok(fs.existsSync(written), 'the pack lands under the repository, not anywhere else');
      assert.equal(topLevel(fs.readFileSync(written, 'utf8')).pack_id, `${OLD_SINCE}_${OLD_UNTIL}`);
    } finally {
      const removed = sweepRepoEvidenceDir();
      assert.ok(removed.length > 0, 'the default-root run wrote into the repository and was cleaned up');
    }
  });
});
