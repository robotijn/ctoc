'use strict';
/* eslint-disable security/detect-non-literal-fs-filename, security/detect-non-literal-require, security/detect-object-injection --
   a measurement tool: every path is one it builds under the scratch work folder or a checkout the
   operator names, and it loads each checkout's own modules on purpose. */
/**
 * CTOC fix benchmark (small by design): behaviour, agent sizes, quality, before vs after.
 *   node bench.js --before <dir> --after <dir> --label "<fix name>" [--plans 300] [--work <dir>] [--skip-quality]
 * Node only, no dependency, no shell (npm on Windows aside). Both checkouts are treated
 * read-only: each is cloned fresh into the work folder and run from there. Hooks run as child
 * processes the way Claude Code runs them (JSON on standard input, the project as working
 * folder, home redirected, CTOC and Claude variables cleared), against one synthetic
 * project per version built through that version's own ledger and question-store modules.
 * A crash, an unexpected exit code, a wrong session-start count or a fixture the gate
 * check did not read fails the run and nothing is written. Appends to results.json and
 * regenerates RESULTS.md (newest first).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const HERE = __dirname;
const TOKEN_RE = /fxp\d{5}/g;
const FROM = { implementation: 'functional', todo: 'implementation', done: 'review' };
const LABEL = 'bench batch';
const fail = (m) => { throw new Error(`SELF-CHECK FAILED: ${m}`); };
const sh = (c, a, o = {}) => cp.spawnSync(c, a, { encoding: 'utf8', maxBuffer: 16 << 20, ...o });

function args(argv) {
  const a = { plans: 300, quality: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--skip-quality') { a.quality = false; continue; }
    const v = argv[++i];
    if (v === undefined) throw new Error(`${k} needs a value`);
    if (k === '--before' || k === '--after' || k === '--work') a[k.slice(2)] = path.resolve(v);
    else if (k === '--label') a.label = v;
    else if (k === '--plans') a.plans = Number(v);
    else throw new Error(`unknown argument ${k}`);
  }
  if (!a.before || !a.after || !a.label || !(a.plans >= 10)) throw new Error('usage: --before <dir> --after <dir> --label "<fix>" [--plans N>=10]');
  a.work = a.work || path.join(os.tmpdir(), `ctoc-bench-${Date.now()}`);
  return a;
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(s), d);
    else if (e.isDirectory()) copyDir(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

function prepare(name, src, work) {
  const head = sh('git', ['-C', src, 'rev-parse', 'HEAD']).stdout.trim();
  const dirty = sh('git', ['--no-optional-locks', '-C', src, 'status', '--porcelain', '--untracked-files=no']).stdout.trim() !== '';
  // Always a fresh clone: npm test rewrites files in the tree it runs in (the README version
  // lines), so reusing a tree would let one run's test side effects leak into the next.
  const code = path.join(work, `code-${name}`);
  {
    fs.rmSync(code, { recursive: true, force: true });
    const c = process.platform === 'darwin' ? sh('cp', ['-c', '-R', src, code]) : { status: 1 };
    if (c.status !== 0) {
      if (c.stderr) process.stderr.write(`[bench] copy-on-write clone failed, plain copy instead: ${c.stderr.slice(0, 300)}\n`);
      fs.rmSync(code, { recursive: true, force: true });
      copyDir(src, code);
    }
  }
  const home = path.join(work, `home-${name}`);
  fs.mkdirSync(home, { recursive: true });
  const transcript = path.join(work, `transcript-${name}.jsonl`);
  fs.writeFileSync(transcript, JSON.stringify({ type: 'user', message: { role: 'user', content: 'Show me the open plans.' } }) + '\n');
  const pj = JSON.parse(fs.readFileSync(path.join(code, '.claude-plugin', 'plugin.json'), 'utf8'));
  return {
    name, code, home, transcript,
    ref: `${head || 'not a git checkout'}${head && dirty ? ' with uncommitted fix' : ''}`,
    version: fs.readFileSync(path.join(code, 'VERSION'), 'utf8').trim(),
    hooksLoaded: 'hooks' in pj || fs.existsSync(path.join(code, 'hooks', 'hooks.json')),
  };
}

// One project: 5% functional, 7% implementation, 20% todo, 23% review, rest done. Every
// second functional/implementation plan has no questions (waiting); the rest, and every
// review plan, hold fresh questions with one open fork. implementation/todo/done are approved.
function fixture(v, dir, n) {
  fs.rmSync(dir, { recursive: true, force: true });
  const shape = { functional: Math.round(n * 0.05), implementation: Math.round(n * 0.07), todo: Math.round(n * 0.2), review: Math.round(n * 0.23) };
  shape.done = n - shape.functional - shape.implementation - shape.todo - shape.review;
  for (const s of ['vision', 'canvas', 'in-progress', ...Object.keys(shape)]) fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc'));
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# CTOC Project Instructions\n');
  const ledger = require(path.join(v.code, 'src/lib/approval-ledger.js'));
  const store = require(path.join(v.code, 'src/lib/streaming-precompute.js'));
  const facts = { plans: n, ...shape, waiting: 0, approved: 0 };
  let k = 0;
  for (const [stage, count] of Object.entries(shape)) {
    for (let i = 0; i < count; i++) {
      const t = `fxp${String(k++).padStart(5, '0')}`;
      const file = path.join(dir, 'plans', stage, `${t}-fixture-plan.md`);
      const body = `Plan ${t} changes one module and its test so a human can reach it. `.repeat(120);
      const text = `---\ntitle: "Fixture plan ${t}"\ntype: ${stage === 'functional' ? 'functional' : 'implementation'}\nfiles:\n  - src/${t}.js\n---\n\n# Fixture plan ${t}\n\n## Problem Statement\n\n${body}\n\n## Execution Plan\n\n### Step 8: TEST\n- [ ] tests for ${t}\n`;
      fs.writeFileSync(file, text);
      if (FROM[stage]) { ledger.writeEntry(ledger.slugFromPlanPath(file), { content: text, stage_from: FROM[stage], stage_to: stage }, dir); facts.approved++; }
      const pre = stage === 'functional' || stage === 'implementation';
      if (pre && i % 2 === 0) { facts.waiting++; continue; }
      if (pre || stage === 'review') {
        const q = [{ id: 'q1', prompt: 'Which storage?', critical: true, important: true, options: [{ key: 'a', label: 'A file' }, { key: 'b', label: 'A database' }] }];
        const r = store.writePlanQuestions(dir, `${stage}/${path.basename(file)}`, q, fs.statSync(file).mtimeMs);
        if (!r.ok) fail(`writePlanQuestions: ${r.errors}`);
      }
    }
  }
  return facts;
}

function hook(v, dir, rel, payload, extraEnv = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CLAUDE|CTOC_|NODE_OPTIONS$)/.test(key)));
  Object.assign(env, { HOME: v.home, USERPROFILE: v.home, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: v.code }, extraEnv);
  const r = sh(process.execPath, [path.join(v.code, rel)], { cwd: dir, env, input: JSON.stringify({ session_id: 'bench', transcript_path: v.transcript, cwd: dir, ...payload }) });
  if (r.error || r.signal || ![0, 2].includes(r.status) || /\n\s+at .+:\d+:\d+\)?\n/.test(r.stderr)) fail(`${v.name} ${rel} crashed or exited ${r.status}: ${String(r.stderr).slice(0, 400)}`);
  return r;
}

function behaviour(v, dir, facts, work) {
  // The gate check really read the approved plans (counter preloaded into the real hook) and found no violation.
  const counter = path.join(work, 'read-counter.js');
  const countFile = path.join(work, `reads-${v.name}.txt`);
  fs.writeFileSync(counter, "const fs=require('fs');let n=0;const o=fs.readFileSync;fs.readFileSync=function(p,...a){if(typeof p==='string'&&p.startsWith(process.env.BENCH_ROOT))n++;return o.call(this,p,...a)};process.on('exit',()=>fs.writeFileSync(process.env.BENCH_OUT,String(n)));\n");
  const g = hook(v, dir, 'src/hooks/human-gate-check.js', { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: path.join(dir, 'CLAUDE.md') } },
    { NODE_OPTIONS: `--require ${counter}`, BENCH_ROOT: path.join(dir, 'plans') + path.sep, BENCH_OUT: countFile });
  const reads = Number(fs.readFileSync(countFile, 'utf8'));
  if (g.status !== 0 || g.stderr.trim() || reads < facts.approved) fail(`${v.name}: gate check read ${reads} of ${facts.approved} approved plans or reported violations`);

  const ss = hook(v, dir, 'src/hooks/SessionStart.js', { hook_event_name: 'SessionStart', source: 'startup' }).stdout;
  const shown = /(\d+) plan\(s\) wait for their questions/.exec(ss) || /awaiting the human \((\d+) plan/.exec(ss);
  if (!shown || Number(shown[1]) !== facts.waiting) fail(`${v.name}: session start shows ${shown && shown[1]} plans waiting, the fixture has ${facts.waiting}`);
  const dispatch = /dispatch\s+up\s+to/i.test(ss);
  const list = ss.split('\n').find((l) => l.startsWith('Plans needing questions:')) || '';
  if (dispatch && !list) fail(`${v.name}: dispatch order without its plan list (format changed?)`);

  const stop = (batch) => {
    for (const f of ['continuation.json', 'continuation-queue.json']) fs.rmSync(path.join(dir, '.ctoc', 'state', f), { force: true });
    if (batch) require(path.join(v.code, 'src/lib/continuation.js')).startBatch(dir, { label: LABEL, total: 5 });
    const r = hook(v, dir, 'src/hooks/stop-continuation-gate.js', { hook_event_name: 'Stop', stop_hook_active: false });
    const t = r.stderr + r.stdout;
    return { exit: r.status, chars: t.length, ordersWork: r.status === 2, plansNamed: new Set(t.match(TOKEN_RE) || []).size,
      dispatchOrder: /dispatch\s+up\s+to/i.test(t), namesOnlyBatch: new RegExp(`\\d+ of \\d+ unit\\(s\\) remaining in "${LABEL}"`).test(t) && !(t.match(TOKEN_RE) || []).length && !/dispatch\s+up\s+to/i.test(t) };
  };
  return { sessionStartChars: ss.length, sessionStartWaitingShown: Number(shown[1]), sessionStartPlansOrderedToDispatch: dispatch ? new Set(list.match(TOKEN_RE) || []).size : 0,
    stopQueuedNoBatch: stop(false), stopInBatch: stop(true), gateCheckPlanReads: reads };
}

function agentSizes(code) {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.md') ? [path.join(d, e.name)] : []));
  const rows = walk(path.join(code, 'agents')).map((f) => ({ agent: path.relative(code, f).split(path.sep).join('/'), bytes: fs.statSync(f).size }));
  const total = rows.reduce((s, r) => s + r.bytes, 0);
  return { agents: rows.length, totalBytes: total, estimatedTokens: Math.round(total / 4), largest: rows.sort((a, b) => b.bytes - a.bytes).slice(0, 5) };
}

function quality(v, work) {
  const log = path.join(work, `npm-test-${v.name}.log`);
  const fd = fs.openSync(log, 'w');
  const win = process.platform === 'win32';
  const r = cp.spawnSync(win ? 'npm.cmd' : 'npm', ['test'], { cwd: v.code, stdio: ['ignore', fd, fd], shell: win, timeout: 30 * 60 * 1000 });
  fs.closeSync(fd);
  if (r.error || r.signal) fail(`${v.name}: npm test did not finish within 30 minutes (a hung test); see ${path.basename(log)}`);
  const text = fs.readFileSync(log, 'utf8').split(String.fromCharCode(27)).join('').replace(/\[[0-9;]*m/g, '');
  const last = (re) => { const m = [...text.matchAll(re)].pop(); return m ? Number(m[1]) : null; };
  const q = { exit: r.status, tests: last(/^ℹ tests (\d+)/gm), passed: last(/^ℹ pass (\d+)/gm), failed: last(/^ℹ fail (\d+)/gm),
    skipped: last(/^ℹ skipped (\d+)/gm), coverage: last(/^ℹ all files\s+\|\s+([\d.]+)/gm), verdict: /\[CTOC test-gate\] PASS/.test(text) ? 'PASS' : 'FAIL' };
  q.failing = [...new Set([...text.matchAll(/^✖ (.+?) \([\d.]+ms\)$/gm)].map((m) => m[1]))].slice(0, 12).join('; ') || 'none';
  for (const [k, x] of Object.entries(q)) if (x === null) fail(`${v.name}: could not read ${k} from npm test output (${path.basename(log)})`);
  const f = sh(process.execPath, ['-e', 'const r=require(process.argv[1]+"/src/lib/reachability.js"),g=require(process.argv[1]+"/src/lib/false-green-scan.js"),c=process.argv[1];process.stdout.write(JSON.stringify({deadExports:r.analyzeExports(c).dead.length,unreachableFiles:r.analyze(c).unreachable.length,falseGreen:g.scanFalseGreen(c).findings.length}))', v.code], { cwd: v.code });
  if (f.status !== 0) fail(`${v.name}: fence counts failed`);
  return { ...q, ...JSON.parse(f.stdout) };
}

function render(runs) {
  const yn = (b) => (b ? 'yes' : 'no');
  const out = ['# CTOC fix benchmark', '', 'Where the minutes and hours go is measured from real transcripts in WHERE-THE-HOURS-GO.md in this folder.', ''];
  for (const r of [...runs].reverse()) {
    const [b, a] = [r.before, r.after];
    const row = (what, f) => `| ${what} | ${f(b)} | ${f(a)} |`;
    const stop = (s) => `exit ${s.exit}, ${s.chars} characters, orders work: ${yn(s.ordersWork)}, plans named: ${s.plansNamed}`;
    out.push(`## ${r.label}`, '', `${r.date.slice(0, 10)}. Before: \`${b.ref}\` (${b.version}). After: \`${a.ref}\` (${a.version}). One synthetic project of ${r.plans} plans, ${r.fixture.waiting} of them waiting for questions and ${r.fixture.todo} approved and queued. ${a.hooksLoaded ? '' : 'Claude Code does not load CTOC\'s hooks today (they sit in `.claude-plugin/hooks.json` and the manifest has no `hooks` field), so the hook rows show what users will get once the hooks are turned on.'}`, '');
    out.push('| Behaviour | Before | After |', '|---|---|---|',
      row('Stop, approved plans queued, no batch', (x) => stop(x.behaviour.stopQueuedNoBatch)),
      row('Stop inside a batch', (x) => `${stop(x.behaviour.stopInBatch)}, names only the batch and its count: ${yn(x.behaviour.stopInBatch.namesOnlyBatch)}`),
      row('Session start: plans named in an order to dispatch agents', (x) => x.behaviour.sessionStartPlansOrderedToDispatch),
      row('Session start: characters injected', (x) => x.behaviour.sessionStartChars), '');
    out.push('| Agent definitions | Before | After |', '|---|---|---|',
      row('Files', (x) => x.agents.agents), row('Bytes', (x) => x.agents.totalBytes), row('Tokens (estimate: bytes ÷ 4)', (x) => x.agents.estimatedTokens),
      ...[0, 1, 2, 3, 4].map((i) => row(`Largest ${i + 1}`, (x) => `\`${x.agents.largest[i].agent}\` ${x.agents.largest[i].bytes}`)), '');
    if (b.quality) {
      out.push('| Quality (`npm test`) | Before | After |', '|---|---|---|',
        ...[['tests', 'Tests'], ['passed', 'Passed'], ['failed', 'Failed'], ['skipped', 'Skipped'], ['coverage', 'Line coverage of src, percent'], ['verdict', 'Test gate'], ['deadExports', 'Exports with no live caller'], ['falseGreen', 'False-green findings'], ['unreachableFiles', 'Unreachable source files'], ['failing', 'Failing tests (top-level names)']]
          .map(([k, l]) => row(l, (x) => x.quality[k])), '');
    }
    if (r.note) out.push(r.note, '');
  }
  return out.join('\n');
}

function main() {
  const a = args(process.argv.slice(2));
  fs.mkdirSync(a.work, { recursive: true });
  const run = { label: a.label, date: new Date().toISOString(), plans: a.plans, node: process.version, cpu: os.cpus()[0].model, cores: os.cpus().length };
  for (const [name, src] of [['before', a.before], ['after', a.after]]) {
    const v = prepare(name, src, a.work);
    const dir = path.join(a.work, `fixture-${name}`);
    const facts = fixture(v, dir, a.plans);
    run.fixture = facts;
    run[name] = { ref: v.ref, version: v.version, hooksLoaded: v.hooksLoaded, behaviour: behaviour(v, dir, facts, a.work), agents: agentSizes(v.code), quality: a.quality ? quality(v, a.work) : null };
  }
  const file = path.join(HERE, 'results.json');
  const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  if (!Array.isArray(all)) fail('results.json is not an array');
  all.push(run);
  fs.writeFileSync(file, JSON.stringify(all, null, 2) + '\n');
  fs.writeFileSync(path.join(HERE, 'RESULTS.md'), render(all) + '\n');
  process.stdout.write(`[bench] appended run ${all.length}; see RESULTS.md\n`);
}

if (require.main !== module) module.exports = { render };
else try { main(); } catch (e) { process.stderr.write(`[bench] ${e.message}\n[bench] nothing was written.\n`); process.exitCode = 1; }
