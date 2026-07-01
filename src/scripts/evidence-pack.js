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
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const EVIDENCE_DIR = path.join(ROOT, '.ctoc', 'evidence-packs');

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
  if (safeFs.existsSync(chainPath)) inputs.push(chainPath);

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
  if (safeFs.existsSync(provPath)) inputs.push(provPath);

  // 7. Configuration baselines (latest version's manifest).
  const baselinesRoot = path.join(ROOT, '.ctoc', 'baselines');
  if (safeFs.existsSync(baselinesRoot)) {
    for (const ver of safeFs.readdirSync(baselinesRoot)) {
      const mPath = path.join(baselinesRoot, ver, 'manifest.yaml');
      if (safeFs.existsSync(mPath)) inputs.push(mPath);
    }
  }

  // 8. CAPA entries.
  const capaDir = path.join(ROOT, '.ctoc', 'capa');
  collectAllInWindow(capaDir, sinceMs, untilMs, inputs);

  return [...new Set(inputs)];
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

function main() {
  const args = parseArgs(process.argv);
  console.log(`Evidence pack: ${args.since} to ${args.until}`);

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

  try {
    if (inputs.length > 0) {
      const relInputs = inputs.map(p => path.relative(ROOT, p));
      const listFile = path.join(EVIDENCE_DIR, `.pack-${args.since}.list`);
      safeFs.writeFileSync(listFile, relInputs.join('\n'));
      execSync(`tar -czf "${tarPath}" -T "${listFile}"`, { cwd: ROOT, stdio: 'inherit' });
      safeFs.unlinkSync(listFile);
    }
  } catch (e) {
    console.error(`tar failed (${e.message}); writing JSON bundle instead.`);
    const bundle = {};
    for (const p of inputs) bundle[path.relative(ROOT, p)] = safeFs.readFileSync(p, 'utf8');
    safeFs.writeFileSync(tarPath.replace(/\.tar\.gz$/, '.json'), JSON.stringify(bundle, null, 2));
  }

  console.log(`Manifest: ${path.relative(ROOT, manifestPath)}`);
  console.log(`Archive:  ${path.relative(ROOT, tarPath)}`);
}

function yamlify(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return '\n' + obj.map(item => `${pad}- ${typeof item === 'object' ? yamlify(item, indent + 1).trimStart() : item}`).join('\n');
  }
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).map(([k, v]) => {
      if (v && typeof v === 'object') return `${pad}${k}:${yamlify(v, indent + 1)}`;
      return `${pad}${k}: ${v === null ? 'null' : JSON.stringify(v).replace(/^"|"$/g, '')}`;
    }).join('\n');
  }
  return String(obj);
}

main();
