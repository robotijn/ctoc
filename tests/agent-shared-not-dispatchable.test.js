'use strict';

// W03-s3 — agents/_shared/*.md must NOT be in the dispatchable-agent set.
//
// Finding L5 / Story C: the 4 prose fragments under agents/_shared/ (ancestry-read,
// async-choice-protocol, no-stub-rule, warnings-are-critical) are shared context meant to
// be READ by sibling agents (via ../_shared/<name>.md links), never DISPATCHED as agents.
// With no `agents` field in .claude-plugin/plugin.json, the Claude Code plugin harness
// auto-discovers the whole agents/ tree — including _shared — and registers those fragments
// as dispatchable. The fix is a manifest whitelist: plugin.json.agents lists every real
// category directory EXCEPT ./agents/_shared, which excludes _shared by construction while
// leaving the files physically in place so every ../_shared/ cross-reference keeps resolving.
//
// These tests read the REAL manifest the harness consumes (.claude-plugin/plugin.json) and
// the REAL agents/ directory — no fixtures, no doubles. They model harness behavior per the
// official plugin-manifest schema: the `agents` component-path field REPLACES the default
// agents/ scan (docs.claude.com plugins reference, "Custom agent files (replaces default
// agents/)"), so an absent field means "walk everything" (the RED baseline) and a present
// array of directories means "walk exactly these" (the GREEN whitelist).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const agentsRoot = path.join(projectRoot, 'agents');
const manifestPath = path.join(projectRoot, '.claude-plugin', 'plugin.json');

// Normalize any absolute path under the repo to a forward-slash relative path so the
// assertions are identical on Windows, macOS, and Linux.
function relPosix(absPath) {
  return path.relative(projectRoot, absPath).split(path.sep).join('/');
}

// Recursively collect every *.md file under `dir`, returned as repo-relative posix paths.
// This is the harness's own behavior: it does NOT skip underscore-prefixed directories
// (confirmed live — the _shared fragments register as dispatchable today), so this walk
// must include them too, otherwise the test could not observe the RED baseline.
function walkMd(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMd(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(relPosix(full));
    }
  }
  return out;
}

// A manifest `agents` entry is a path relative to the plugin root; normalize it to a
// repo-relative posix path with no leading "./" and no trailing "/".
function normalizeManifestEntry(entry) {
  let e = String(entry).replace(/\\/g, '/');
  e = e.replace(/^\.\//, '');
  e = e.replace(/\/+$/, '');
  return e;
}

function readManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

// The whitelist directories declared in the manifest (repo-relative posix, no trailing
// slash). Empty array when the field is absent.
function manifestAgentDirs() {
  const manifest = readManifest();
  if (!('agents' in manifest)) return [];
  const raw = manifest.agents;
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(normalizeManifestEntry);
}

// The set the harness would actually dispatch, modeled from the manifest:
//   - no `agents` field  -> replace-default does not apply; harness walks all of agents/
//                           (RED baseline: _shared fragments included).
//   - `agents` present   -> the field REPLACES the default scan; expand each listed path
//                           (a directory -> its *.md files, a file -> itself).
function dispatchableSet(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
  const agentsDir = path.join(root, 'agents');
  if (!('agents' in manifest)) {
    return new Set(walkMd(agentsDir));
  }
  const raw = manifest.agents;
  const list = Array.isArray(raw) ? raw : [raw];
  const set = new Set();
  for (const entry of list) {
    const rel = normalizeManifestEntry(entry);
    const abs = path.join(root, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      for (const md of walkMd(abs)) set.add(md);
    } else if (fs.existsSync(abs) && abs.endsWith('.md')) {
      set.add(relPosix(abs));
    }
  }
  return set;
}

// A hypothetical or real relative path is "covered" if it lives under one of the
// whitelisted directories. Directory-scoped so it generalizes beyond today's 4 filenames.
function isCoveredByWhitelist(relPath, whitelistDirs) {
  return whitelistDirs.some((d) => relPath === d || relPath.startsWith(d + '/'));
}

const SHARED_FRAGMENTS = [
  'agents/_shared/ancestry-read.md',
  'agents/_shared/async-choice-protocol.md',
  'agents/_shared/no-stub-rule.md',
  'agents/_shared/warnings-are-critical.md',
];

test('no agents/_shared fragment is in the dispatchable set', () => {
  const set = dispatchableSet(projectRoot);
  for (const frag of SHARED_FRAGMENTS) {
    assert.ok(
      !set.has(frag),
      `${frag} must NOT be dispatchable (it is shared prose, read via ../_shared/ links, not an agent)`,
    );
  }
});

test('no real agent is dropped by the whitelist (over-exclusion guard)', () => {
  const set = dispatchableSet(projectRoot);
  const mustExist = [
    'agents/coordinator/cto-chief.md',
    'agents/scouts/dep-scout.md',
    'agents/scouts/lint-scout.md',
    'agents/scouts/secret-scout.md',
    'agents/scouts/syntax-scout.md',
    'agents/scouts/test-scout.md',
    'agents/planning/implementation-planner.md',
  ];
  for (const rel of mustExist) {
    // Guard the guard: the sample must actually exist on disk, else the assertion is vacuous.
    assert.ok(
      fs.existsSync(path.join(projectRoot, rel)),
      `sample agent ${rel} not found on disk — update the test sample`,
    );
    assert.ok(set.has(rel), `real agent ${rel} must remain dispatchable`);
  }
});

test('the exclusion generalizes to a future agents/_shared file, not just the 4 known ones', () => {
  const whitelistDirs = manifestAgentDirs();
  // A path that does not exist today; it must not be reachable through any whitelist dir.
  const hypothetical = 'agents/_shared/zzz-new-fragment.md';
  assert.ok(
    !isCoveredByWhitelist(hypothetical, whitelistDirs),
    'a new agents/_shared/*.md must be excluded by construction (directory-scoped whitelist, not a hardcoded filename list)',
  );
  // And every real shared fragment is likewise uncovered.
  for (const frag of SHARED_FRAGMENTS) {
    assert.ok(
      !isCoveredByWhitelist(frag, whitelistDirs),
      `${frag} must not be reachable through any whitelisted directory`,
    );
  }
});

test('drift guard: every immediate child of agents/ except _shared is whitelisted, and _shared never is', () => {
  const whitelistDirs = manifestAgentDirs();
  const childDirs = fs
    .readdirSync(agentsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  // _shared must never appear in the manifest.
  assert.ok(
    !whitelistDirs.includes('agents/_shared'),
    'agents/_shared must NOT be listed in plugin.json.agents',
  );

  // Every real category directory must be present, so a newly added category cannot
  // silently miss the manifest.
  for (const name of childDirs) {
    if (name === '_shared') continue;
    assert.ok(
      whitelistDirs.includes('agents/' + name),
      `category directory agents/${name} is missing from plugin.json.agents (drift)`,
    );
  }

  // And the whitelist must not name anything that is not a real category directory.
  for (const dir of whitelistDirs) {
    const name = dir.replace(/^agents\//, '');
    assert.ok(
      childDirs.includes(name) && name !== '_shared',
      `plugin.json.agents lists ${dir}, which is not a real (non-_shared) agents/ category`,
    );
  }
});
