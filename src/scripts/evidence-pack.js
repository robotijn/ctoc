#!/usr/bin/env node
/**
 * Evidence Pack — Continuous Controls Monitoring (v6.9.27)
 *
 * Bundles dispatch audit log, gate approvals, test runs, threat models,
 * model-risk attestations, provenance events, configuration baselines,
 * and Corrective and Preventive Action entries for a time window into a
 * tamper-evident archive at `.ctoc/evidence-packs/<date>.tar.gz`.
 *
 * Usage:
 *   node src/scripts/evidence-pack.js [--since=YYYY-MM-DD] [--until=YYYY-MM-DD]
 *
 * Environment:
 *   CTOC_EVIDENCE_ROOT  the project the pack is ABOUT, in strict precedence:
 *                       1. CTOC_EVIDENCE_ROOT, resolved as given;
 *                       2. otherwise the working directory, but ONLY when it
 *                          holds a .ctoc/ DIRECTORY;
 *                       3. otherwise the command REFUSES. It never falls back to
 *                          the script's own location — installed from the
 *                          marketplace that is the plugin cache, so the pack
 *                          would describe the plugin instead of the user's
 *                          project, and would say so in a compliance artifact.
 *
 * Cross-platform Node 18+. On Windows, falls back to .zip via the built-in
 * archive logic (tar may not be available). Pure JS, no native dependencies.
 *
 * References:
 *   - Screenata 2026 — Sarbanes-Oxley ITGC continuous controls monitoring:
 *     https://screenata.com/resources/blog/best-practices-for-automating-sox-itgc-evidence-in-2026-from-access-controls-to-continuous-monitoring
 */

const safeFs = require('../lib/safe-fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { requestExit } = require('../lib/request-exit');

/**
 * The project the evidence pack is ABOUT, in strict precedence:
 *   1. CTOC_EVIDENCE_ROOT — an explicit project, resolved as given.
 *   2. process.cwd() — but ONLY when it holds a .ctoc/ DIRECTORY, i.e. the
 *      caller is standing in a CTOC project.
 *   3. null — the command refuses. It does NOT fall back to the script's own
 *      location: installed from the marketplace that is the plugin cache, so
 *      the pack would describe the plugin instead of the user's project and
 *      would say so in a compliance artifact.
 *
 * @returns {string|null} An absolute project root, or null when none can be told.
 */
function resolveRoot() {
  const override = process.env.CTOC_EVIDENCE_ROOT;
  if (override) return path.resolve(override);
  const cwd = process.cwd();
  const dotCtoc = path.join(cwd, '.ctoc');
  if (safeFs.existsSync(dotCtoc) && safeFs.statSync(dotCtoc).isDirectory()) return path.resolve(cwd);
  return null;
}

// ONE encoding of the refusal, shared by the command and the exported collector,
// so the two cannot drift into naming different remedies.
const NO_ROOT_MESSAGE =
  'evidence-pack: refusing to run — cannot tell which project this pack is about. ' +
  'Run it from a project root (a directory containing .ctoc/), ' +
  'or set CTOC_EVIDENCE_ROOT to that project.';

const ROOT = resolveRoot();

function parseArgs(argv) {
  const args = { since: null, until: null };
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--(\w+)=(.+)$/);
    if (m) args[m[1]] = m[2];
  }
  // Defaults: last 24h
  if (!args.until) args.until = new Date().toISOString().slice(0, 10);
  if (!args.since) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    args.since = yesterday.toISOString().slice(0, 10);
  }
  return args;
}

function collectInputs(since, until) {
  // The function is exported and reads a ROOT frozen at require time. Without
  // this a caller outside a project gets `TypeError: The "path" argument must
  // be of type string. Received null` from deep inside path.join, naming
  // neither the cause nor the remedy.
  if (ROOT === null) throw new Error(NO_ROOT_MESSAGE);
  const sinceMs = new Date(since).getTime();
  const untilMs = new Date(until + 'T23:59:59Z').getTime();
  const inputs = [];

  // 1. Dispatches in the window.
  const dispatchesRoot = path.join(ROOT, '.ctoc', 'audit', 'dispatches');
  if (safeFs.existsSync(dispatchesRoot)) {
    for (const dateDir of safeFs.readdirSync(dispatchesRoot)) {
      const dirPath = path.join(dispatchesRoot, dateDir);
      const dirStat = safeFs.statSync(dirPath);
      if (!dirStat.isDirectory()) continue;
      if (dirStat.mtimeMs < sinceMs || dirStat.mtimeMs > untilMs) continue;
      for (const f of safeFs.readdirSync(dirPath)) {
        inputs.push(path.join(dirPath, f));
      }
    }
  }

  // 2. Chain log slice.
  const chainPath = path.join(ROOT, '.ctoc', 'audit', 'chain.jsonl');
  pushIfInWindow(chainPath, sinceMs, untilMs, inputs);

  // 3. Gate approvals — every plan with approval markers.
  const plansDirs = ['vision', 'functional', 'implementation', 'todo', 'review', 'done'];
  for (const stage of plansDirs) {
    const dir = path.join(ROOT, 'plans', stage);
    if (!safeFs.existsSync(dir)) continue;
    for (const f of safeFs.readdirSync(dir)) {
      const full = path.join(dir, f);
      const stat = safeFs.statSync(full);
      if (stat.mtimeMs >= sinceMs && stat.mtimeMs <= untilMs && f.endsWith('.md')) {
        const content = safeFs.readFileSync(full, 'utf8');
        if (/approved_by/.test(content)) inputs.push(full);
      }
    }
  }

  // 4. Threat-model outputs (if any artifacts under .ctoc/threat-models/).
  const tmDir = path.join(ROOT, '.ctoc', 'threat-models');
  collectAllInWindow(tmDir, sinceMs, untilMs, inputs);

  // 5. Model-risk attestations.
  const mrDir = path.join(ROOT, '.ctoc', 'model-risk');
  collectAllInWindow(mrDir, sinceMs, untilMs, inputs);

  // 6. Provenance events.
  const provPath = path.join(ROOT, '.ctoc', 'ai-provenance.jsonl');
  pushIfInWindow(provPath, sinceMs, untilMs, inputs);

  // 7. Configuration baselines (latest version's manifest).
  const baselinesRoot = path.join(ROOT, '.ctoc', 'baselines');
  if (safeFs.existsSync(baselinesRoot)) {
    for (const ver of safeFs.readdirSync(baselinesRoot)) {
      const mPath = path.join(baselinesRoot, ver, 'manifest.yaml');
      pushIfInWindow(mPath, sinceMs, untilMs, inputs);
    }
  }

  // 8. CAPA entries.
  const capaDir = path.join(ROOT, '.ctoc', 'capa');
  collectAllInWindow(capaDir, sinceMs, untilMs, inputs);

  return [...new Set(inputs)];
}

/**
 * Push a single known file onto `out` only when its mtime falls inside the
 * window — the same `>= sinceMs && <= untilMs` bounds collectAllInWindow uses,
 * so a "window" means one thing across every collector.
 *
 * @param {string} file - Absolute path to the candidate artifact.
 * @param {number} sinceMs - Inclusive lower bound, epoch milliseconds.
 * @param {number} untilMs - Inclusive upper bound, epoch milliseconds.
 * @param {string[]} out - Collector accumulator, appended in place.
 * @returns {void}
 */
function pushIfInWindow(file, sinceMs, untilMs, out) {
  if (!safeFs.existsSync(file)) return;
  const stat = safeFs.statSync(file);
  if (stat.mtimeMs >= sinceMs && stat.mtimeMs <= untilMs) out.push(file);
}

function collectAllInWindow(dir, sinceMs, untilMs, out) {
  if (!safeFs.existsSync(dir)) return;
  for (const entry of safeFs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectAllInWindow(full, sinceMs, untilMs, out);
    } else if (entry.isFile()) {
      const stat = safeFs.statSync(full);
      if (stat.mtimeMs >= sinceMs && stat.mtimeMs <= untilMs) out.push(full);
    }
  }
}

function hashFile(p) {
  return crypto.createHash('sha256').update(safeFs.readFileSync(p)).digest('hex');
}

function ensureDir(dir) {
  if (!safeFs.existsSync(dir)) safeFs.mkdirSync(dir, { recursive: true });
}

function readChainHead() {
  const headPath = path.join(ROOT, '.ctoc', 'audit', 'chain-head.yaml');
  if (!safeFs.existsSync(headPath)) return null;
  const content = safeFs.readFileSync(headPath, 'utf8');
  const m = content.match(/^hash:\s+(\S+)$/m);
  return m ? m[1] : null;
}

function readActiveRegimes() {
  try {
    const { loadActiveProfiles } = require('../lib/regulatory-regime');
    return loadActiveProfiles(ROOT).profiles;
  } catch {
    return [];
  }
}

// execFileSync (argv form, no shell) — tarPath is derived from unvalidated
// --since/--until CLI args, so it must NEVER be interpolated into a shell
// string. Passing tar its arguments as a discrete argv array means shell
// metacharacters in the path ($(...), backticks, ;) are inert literal
// characters that tar receives as a filename, never as a command.
function packWithTar(tarPath, listFile, cwd = ROOT) {
  execFileSync('tar', ['-czf', tarPath, '-T', listFile], { cwd, stdio: 'inherit' });
}

function main() {
  // Before anything is printed and before anything is written: a pack that
  // cannot say which project it describes must not be produced at all.
  if (ROOT === null) {
    console.error(NO_ROOT_MESSAGE);
    requestExit(1);
    return;
  }

  const args = parseArgs(process.argv);
  console.log(`Evidence pack: ${args.since} to ${args.until}`);

  // Local, not module-level: at module scope a null ROOT would throw at require
  // time and take down every caller that only wants the exported helpers.
  const EVIDENCE_DIR = path.join(ROOT, '.ctoc', 'evidence-packs');
  ensureDir(EVIDENCE_DIR);

  const inputs = collectInputs(args.since, args.until);
  console.log(`Found ${inputs.length} evidence artifacts.`);

  const manifest = {
    pack_id: `${args.since}_${args.until}`,
    window: { since: args.since, until: args.until },
    generated_at: new Date().toISOString(),
    chain_head_at_pack_time: readChainHead(),
    active_regulatory_regimes: readActiveRegimes(),
    artifact_count: inputs.length,
    artifacts: inputs.map(p => ({
      path: path.relative(ROOT, p),
      sha256: hashFile(p),
      size_bytes: safeFs.statSync(p).size,
    })),
  };

  // Tar.gz on POSIX, fall back to a JSON bundle on systems where tar is unavailable.
  const tarPath = path.join(EVIDENCE_DIR, `${args.since}_to_${args.until}.tar.gz`);
  const manifestPath = path.join(EVIDENCE_DIR, `${args.since}_to_${args.until}.manifest.yaml`);

  // Write manifest first so it can be hashed into itself? No — manifest hash
  // lives in `chain_head_at_pack_time`. Pack then write.
  const manifestYaml = yamlify(manifest);
  safeFs.writeFileSync(manifestPath, manifestYaml);

  let degraded = null;                       // the salvage bundle path, when tar failed
  try {
    if (inputs.length > 0) {
      // The manifest goes in FIRST, so the archive states what it contains
      // without needing the file beside it. The member keeps its ROOT-relative
      // name: renaming it to a bare manifest.yaml needs GNU tar's --transform,
      // which macOS bsdtar does not have.
      const manifestRel = path.relative(ROOT, manifestPath);
      const relInputs = inputs.map(p => path.relative(ROOT, p));
      const listFile = path.join(EVIDENCE_DIR, `.pack-${args.since}.list`);
      safeFs.writeFileSync(listFile, [manifestRel, ...relInputs].join('\n'));
      packWithTar(tarPath, listFile);
      safeFs.unlinkSync(listFile);
    }
  } catch (e) {
    // Salvage is worth keeping in an incident, but a compliance artifact that
    // silently degraded its promised format must not report success.
    const bundlePath = tarPath.replace(/\.tar\.gz$/, '.json');
    const bundle = {};
    for (const p of inputs) bundle[path.relative(ROOT, p)] = safeFs.readFileSync(p, 'utf8');
    safeFs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
    degraded = bundlePath;
    console.error(
      `tar failed (${e.message}); the archive was NOT produced in the promised format. ` +
      `A JSON bundle was written as salvage: ${path.relative(ROOT, bundlePath)}`
    );
    requestExit(1);
  }

  console.log(`Manifest: ${path.relative(ROOT, manifestPath)}`);
  console.log(degraded
    ? `Archive:  NOT PRODUCED — salvage bundle at ${path.relative(ROOT, degraded)}`
    : `Archive:  ${path.relative(ROOT, tarPath)}`);
}

function yamlify(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return ' []';                     // a flow sequence needs the space after its key's colon
    return '\n' + obj.map(item => `${pad}- ${typeof item === 'object' ? yamlify(item, indent + 1).trimStart() : item}`).join('\n');
  }
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).map(([k, v]) => {
      if (Array.isArray(v)) return `${pad}${k}:${yamlify(v, indent + 1)}`;              // ' []' or '\n  - …'
      // A nested block map starts on its OWN line; writing its first key on the
      // parent's line made the document unparseable.
      if (v && typeof v === 'object') return `${pad}${k}:\n${yamlify(v, indent + 1)}`;
      return `${pad}${k}: ${v === null ? 'null' : JSON.stringify(v).replace(/^"|"$/g, '')}`;
    }).join('\n');
  }
  return String(obj);
}

if (require.main === module) main();

module.exports = { packWithTar, parseArgs, collectInputs };
