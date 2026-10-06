'use strict';
/* eslint-disable security/detect-non-literal-fs-filename, security/detect-object-injection --
   a measurement tool: it reads only the transcript folders under the user's home it builds itself,
   writes only its own result file beside this script, and indexes plain aggregate objects by label. */
// Where CTOC's waiting time goes, measured from the real Claude Code transcripts on this machine.
// Reads every profile's projects/ folder, streams each JSONL line by line, writes ONLY aggregates
// (no prompt text, no paths, no session ids, no project names) to pipeline-time.json.
// Usage: node pipeline-time.js [--from 2026-06]  [--root <projects dir> ...] [--repo /abs/path/of/this/repository]
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const FROM = arg('--from', '2026-06');
const REPO = path.resolve(arg('--repo', path.join(__dirname, '..', '..', '..', '..')));
// Transcript roots: ~/.claude/projects, $CLAUDE_CONFIG_DIR/projects when set, and every --root <dir> given.
const ROOTS = [...new Set([path.join(os.homedir(), '.claude', 'projects'), process.env.CLAUDE_CONFIG_DIR && path.join(process.env.CLAUDE_CONFIG_DIR, 'projects'),
  ...process.argv.flatMap((a, i) => (a === '--root' && process.argv[i + 1] ? [process.argv[i + 1]] : []))].filter(Boolean).map((p) => path.resolve(p)))].filter((p) => fs.existsSync(p));

const month = (ts) => (ts || '').slice(0, 7);
const ms = (ts) => Date.parse(ts);
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const GAP = 30 * 60000; // a silence longer than this is a stall or pause, not work
const limits = {}; // month -> { hits, hours } : usage-limit errors and the silence that followed each
const isLimit = (o) => o.type === 'assistant' && o.error === 'rate_limit';
function limitTracker() { // fn(o, t) -> true while the run is stopped by a usage-limit error (until a real reply)
  let pending = null;
  return (o, t) => {
    const was = !!pending;
    if (isLimit(o)) { const L = (limits[month(o.timestamp)] = limits[month(o.timestamp)] || { hits: 0, hours: 0 }); L.hits++; if (!pending) pending = o; }
    else if (pending && o.type === 'assistant' && !o.error) { limits[month(pending.timestamp)].hours += Math.max(0, t - ms(pending.timestamp)) / 3600000; pending = null; }
    return was;
  };
}
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

// A shell command reduced to "program first-argument" — never the full string, never a path.
// A test-suite invocation anywhere in the command wins; a loop that sleeps is a "wait loop".
const PUBLIC = /^(npm|npx|pnpm|yarn|node|git|gh|docker|cargo|go|uv|pip|pip3|bun|deno|python|python3|pytest|make|ruby|java|gradle|mvn|swift|xcodebuild|xcrun|find|curl|wget|rsync|tar|zip|unzip|open|osascript|lsappinfo|say|playwright|until|while|for|if|echo|printf|cat|ls|head|tail|grep|rg|sed|awk|jq|wc|sort|test|cd|rm|mv|cp|mkdir|touch|chmod|ln|kill|pkill|pgrep|ps|lsof|sleep|date|export|set|source|unset|trap|wait|true|false|pwd|which|mktemp|tee|xargs|du|df|stat|uptime|diff|zsh|bash|sh|env|time|railway|vercel|supabase|psql|sqlite3|redis-cli|brew)$/;
function normaliseBash(cmd) {
  const keys = String(cmd || '').split(/&&|\|\||;|\n|\|/).map((seg) => {
    let w = seg.replace(/[(){}]/g, ' ').trim().split(/\s+/).filter((t) => t && !/^[A-Z_][A-Z0-9_]*=/.test(t));
    // Wrappers (nohup, nice, taskpolicy, timeout...) and their flags are skipped to reach the real program.
    while (w.length && (/^(nohup|time|env|exec|do|then|nice|taskpolicy|caffeinate|timeout|gtimeout)$/.test(w[0]) || (/^(nice|taskpolicy|caffeinate|timeout|gtimeout)$/.test(w._wrap) && (/^-/.test(w[0]) || /^\d+[smh]?$/.test(w[0]) || /^-/.test(w._prev || ''))))) {
      const wrap = /^(nice|taskpolicy|caffeinate|timeout|gtimeout)$/.test(w[0]) ? w[0] : w._wrap, prevTok = w[0]; w = w.slice(1); w._wrap = wrap; w._prev = prevTok;
    }
    if (!w.length || w[0] === 'cd') return null;
    const prog = path.basename(w[0]);
    if (prog === 'npm' && (w[1] === 'test' || (w[1] === 'run' && w[2] === 'test'))) return 'npm test';
    if (prog === 'node') return w[1] === '--test' ? 'node --test' : /test-gate/.test(w[1] || '') ? 'npm test' : w[1] === '-e' ? 'node -e' : 'node <script>';
    // First argument kept only for well-known tools; a script's own file name is never recorded.
    const a = /^(npm|npx|pnpm|yarn|git|docker|cargo|go|uv|pip|pip3|bun|deno)$/.test(prog) && /^[a-z][\w:-]*$/.test(w[1] || '') ? ' ' + w[1] : '';
    // Only well-known public program names are recorded; a project's own program name could identify the project.
    return prog.includes('.') ? '<script>' : PUBLIC.test(prog) ? prog + a : /^[\w+-]+$/.test(prog) ? "a project's own program" : '<other>';
  }).filter(Boolean);
  if (/^\s*(until|while|for)\b/m.test(cmd) && /\bsleep\b/.test(cmd)) return 'wait loop (sleep and re-check)';
  return keys.find((k) => k === 'npm test') || keys.find((k) => k === 'node --test') || keys[0] || '<other>';
}

async function lines(file, fn) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let bad = 0;
  for await (const l of rl) { if (!l) continue; let o; try { o = JSON.parse(l); } catch { bad++; continue; } fn(o); }
  return bad;
}

// Polling follow-up: which launched job each sleep-and-re-check loop waited on, and whether the waiting was needed.
// Paths and task ids are used only in memory to link a poll to its launch; only program names and fixed labels leave.
const writes = (cmd) => [...String(cmd).matchAll(/(?:>>?|\btee(?: -a)?)\s*([^\s;&|<>()'"]+)/g)].map((m) => m[1]).filter((p) => p.length > 3 && !/^(&|\/dev\/null)/.test(p));
const shellBg = (cmd) => (/\bnohup\b/.test(cmd) ? 'nohup' : /(^|[^&>|])&(\s*$|\s*\n|\s*;|\s+(until|while|sleep|echo|wait|for)\b)/.test(cmd) ? "a trailing '&' in the shell" : null);
// The job a launch command runs: skip setup steps (export, rm, pkill...), wrappers (taskpolicy, timeout) and unwrap 'zsh -c'.
const SETUP = /^(export|set|source|cd|rm|mkdir|pkill|kill|echo|sleep|true|unset|trap|printf|touch|date|wait|ps|pgrep|lsof|ls|cat|head|tail|grep|wc|test|pwd|which|<other>)$/;
function jobKind(cmd) {
  const inner = String(cmd).match(/\b(?:zsh|bash|sh)\s+-l?c\s+(['"])([\s\S]*?)\1/); if (inner) return jobKind(inner[2]);
  for (const seg of String(cmd).split(/&&|\|\||;|\n|\||(?<![>&<])&(?![>&])/)) {
    const k = normaliseBash(seg);
    if (!SETUP.test(k.split(' ')[0])) return /^(zsh|bash|sh)$/.test(k) ? 'a shell script' : k;
  }
  return normaliseBash(cmd);
}
const resultText = (x) => (typeof x.content === 'string' ? x.content : Array.isArray(x.content) ? x.content.map((y) => y.text || '').join('') : '');

// One subagent run: duration, turns, tokens, model-versus-tool wall time, per-tool time.
async function subagent(file) {
  let first = null, last = null, prev = null, firstIn = null;
  const ids = new Set(), open = new Map(), toolTime = {}, idleBy = {}, cause = {}, r = { turns: 0, tools: 0, fresh: 0, cc: 0, cr: 0, out: 0, model: 0, tool: 0, idle: 0, limit: 0, parked: 0, resumes: 0, tests: [] };
  let finished = false; // the agent ended its turn; any silence now is it sitting finished until a new message resumes it
  const lim = limitTracker();
  const usage = new Map(), launches = [], byTask = new Map(), polls = [], pollSpans = [], timedOutKinds = new Set();
  const link = (cmd, t) => {
    for (let i = launches.length - 1; i >= 0; i--) if (launches[i].keys.some((s) => cmd.includes(s))) return launches[i];
    const pre = cmd.slice(0, Math.max(0, cmd.search(/\b(until|while)\b/))), how = shellBg(pre);
    if (!how) for (let i = launches.length - 1; i >= 0; i--) if (launches[i].end == null && !launches[i].byTiming) return Object.assign(Object.create(launches[i]), { byTiming: true, base: launches[i] });
    return how ? (launches.push({ k: jobKind(pre), t0: t, method: how + ', in the same command as the poll', keys: [] }), launches[launches.length - 1]) : null;
  };
  const bad = await lines(file, (o) => {
    const q = o.type === 'attachment' && o.attachment && o.attachment.type === 'queued_command' ? String(o.attachment.prompt || '').match(/<task-id>([^<]+)</) : null;
    if ((o.type !== 'user' && o.type !== 'assistant' && !q) || !o.timestamp) return;
    const t = Math.max(ms(o.timestamp), prev || 0); if (!first) first = o.timestamp; last = new Date(t).toISOString(); // out-of-order lines never count twice
    // Each wall-clock interval is: a wait after a usage-limit error; a silence over GAP; tool time shared by the
    // open tools when any is outstanding (background commands included); otherwise model time.
    const c = Array.isArray(o.message && o.message.content) ? o.message.content : [];
    const afterLimit = lim(o, t), d = prev == null ? 0 : t - prev;
    if (finished) { r.parked += d; if (o.type === 'user' && !c.some((x) => x.type === 'tool_result')) r.resumes++; }
    else if (prev != null) { // the same interval, filed under one cause for the ranking
      const ks = [...open.values()].map((u) => u.k), why = afterLimit ? 'stopped by a usage limit' : ks.some((k) => k.startsWith('wait loop')) ? 'polling: sleep-and-re-check loops'
        : ks.some((k) => k === 'npm test' || k === 'node --test') ? 'test runs' : ks.length ? (d > GAP ? 'silence over 30 minutes during another tool' : 'other tools')
        : d > GAP ? 'silence over 30 minutes with nothing outstanding' : 'model thinking and writing';
      cause[why] = (cause[why] || 0) + d;
      if (why.startsWith('polling')) pollSpans.push({ a: prev, b: t, polls: [...open.values()].filter((u) => u.poll).map((u) => u.poll) });
    }
    if (finished) { /* time sitting finished is already counted as parked above */ } else if (afterLimit) r.limit += d; else if (d > GAP) { r.idle += d; const k = open.size ? 'while waiting on ' + [...new Set([...open.values()].map((u) => u.k))].sort().join(' + ') : 'nothing outstanding';
      idleBy[k] = (idleBy[k] || 0) + d; } else if (prev != null) { if (open.size) { r.tool += t - prev; for (const u of open.values()) toolTime[u.k] = (toolTime[u.k] || 0) + (t - prev) / open.size; } else r.model += t - prev; }
    prev = t; finished = o.type === 'assistant' && !o.error && /^(end_turn|stop_sequence)$/.test(o.message.stop_reason) && !open.size;
    if (q) { const L = byTask.get(q[1]); if (L && L.end == null) L.end = t; if (open.has('bg:' + q[1])) done('bg:' + q[1], t); return; }
    if (o.type === 'assistant') {
      const id = o.message.id || o.uuid; if (!ids.has(id)) { ids.add(id); r.turns++; }
      const u = o.message.usage; if (u) { usage.set(id, u); if (firstIn == null) firstIn = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0); }
      for (const x of c) if (x.type === 'tool_use') {
        r.tools++; const cmd = x.name === 'Bash' ? String((x.input && x.input.command) || '') : null;
        const u = { t, cmd, bgFlag: !!(x.input && x.input.run_in_background), k: cmd != null ? normaliseBash(cmd) : x.name.startsWith('mcp__') ? 'an external connector tool' : x.name };
        if (u.k.startsWith('wait loop')) polls.push((u.poll = { t0: t, job: link(cmd, t), readsTaskOutput: /\/tasks\/|\.output\b/.test(cmd) }));
        open.set(x.id, u);
      }
    } else for (const x of c) if (x.type === 'tool_result' && open.has(x.tool_use_id)) {
      // A background command returns at once; it stays open until its completion notification arrives.
      const tr = o.toolUseResult || {}, bg = tr.backgroundTaskId, u = open.get(x.tool_use_id);
      if (u.cmd != null && tr.timedOutAfterMs) { timedOutKinds.add(u.k); if (u.poll) u.poll.timedOut = true; }
      if (u.cmd != null && !u.poll) { // a launch: run_in_background, auto-moved to the background at its timeout, or a shell '&'
        const how = bg ? (u.bgFlag ? 'run_in_background' + (timedOutKinds.has(u.k) ? ', after the same command had run past its timeout earlier' : '')
          : tr.timedOutAfterMs ? `ran past its ${tr.timedOutAfterMs === 120000 ? 'default 2-minute' : 'own longer'} timeout and was moved to the background` : 'background (other)') : shellBg(u.cmd);
        if (how) { const L = { k: jobKind(u.cmd), t0: u.t, method: how, keys: [bg, (resultText(x).match(/written to: (\S+)/) || [])[1], ...writes(u.cmd)].filter(Boolean) }; launches.push(L); if (bg) byTask.set(bg, L); }
      }
      if (bg) { open.set('bg:' + bg, open.get(x.tool_use_id)); open.delete(x.tool_use_id); } else done(x.tool_use_id, t);
    }
  });
  function done(id, t) {
    const u = open.get(id); open.delete(id); const d = t - u.t; if (u.poll) u.poll.t1 = t;
    if (u.k === 'npm test' || u.k === 'node --test') r.tests.push({ k: u.k, d });
  }
  for (const u of usage.values()) { r.fresh += u.input_tokens || 0; r.cc += u.cache_creation_input_tokens || 0; r.cr += u.cache_read_input_tokens || 0; r.out += u.output_tokens || 0; }
  r.polls = polls.map((p) => {
    const J = p.job, t1 = p.t1 != null ? p.t1 : ms(last), e = J && J.end;
    const outcome = !J ? 'no launch found in this run' : J.method.includes("'&'") || J.method.startsWith('nohup') ? 'job end not observable (shell background)'
      : e == null ? 'job never reported finishing' : e > t1 ? 'poll gave up before the job finished' : 'job finished while being polled';
    return { kind: p.kind = J ? J.k : p.readsTaskOutput ? "another task's output file (launched elsewhere)" : 'a file or marker (no launch found)', method: J ? J.method : 'no launch found',
      outcome: outcome + (J && J.byTiming ? ', linked by timing (inferred)' : ''), timedOut: !!p.timedOut, returned: p.t1 != null, pollMs: Math.max(0, t1 - p.t0), wasteMs: e != null && e <= t1 ? t1 - Math.max(p.t0, e) : 0, job: J };
  });
  // Each polling interval split at job end times and filed under the most justified state of the polls open in it.
  const RANK = ['job still running (needed wait)', 'job end not observable (shell background)', 'job never reported finishing', 'no launch found', 'job had already finished (wasted wait)'];
  const state = (p, x) => { const J = p.job, e = J && J.end; return !J ? 3 : J.method.includes("'&'") || J.method.startsWith('nohup') ? 1 : e == null ? 2 : x < e ? 0 : 4; };
  r.pollSplit = [];
  for (const sp of pollSpans) {
    const cuts = [sp.a, ...sp.polls.map((p) => p.job && p.job.end).filter((e) => e > sp.a && e < sp.b), sp.b].sort((x, y) => x - y);
    for (let i = 1; i < cuts.length; i++) if (sp.polls.length) {
      const best = sp.polls.map((p) => [state(p, cuts[i - 1]), p]).sort((x, y) => x[0] - y[0])[0], J = best[1].job;
      r.pollSplit.push({ state: RANK[best[0]] + (J && J.byTiming ? ', linked by timing (inferred)' : ''), kind: best[1].kind || (J ? J.k : 'unknown'), method: J ? J.method : 'no launch found', ms: cuts[i] - cuts[i - 1] });
    }
  }
  r.polledJobs = [...new Set(r.polls.map((p) => p.job && (p.job.base || p.job)).filter(Boolean))].map((J) => ({ kind: J.k, runMs: J.end != null ? J.end - J.t0 : null }));
  for (const p of r.polls) delete p.job;
  return first ? Object.assign(r, { start: first, dur: ms(last) - ms(first) - r.parked, firstIn, toolTime, idleBy, cause, bad }) : { bad, empty: true };
}

// Human wait per main-session turn: human message -> last assistant message before the next human message.
// Background agents the turn blocked on are included, because their completion re-wakes the same turn.
const isHuman = (o) => {
  if (o.type !== 'user' || o.isMeta || o.isSidechain) return false;
  if (o.origin) return o.origin.kind === 'human';
  const c = o.message && o.message.content;
  const s = typeof c === 'string' ? c : Array.isArray(c) && c[0] && c[0].type === 'text' ? c[0].text : null;
  return s != null && !/^\s*<(task-notification|local-command|command-name|system-reminder)/.test(s);
};
async function mainSession(file) {
  const waits = [], turnDur = []; let start = null, end = null; const lim = limitTracker();
  const close = () => { if (start && end) waits.push({ m: month(start), d: ms(end) - ms(start) }); };
  const bad = await lines(file, (o) => {
    if (!o.timestamp) return; lim(o, ms(o.timestamp));
    if (o.type === 'system' && o.subtype === 'turn_duration' && o.durationMs > 0) turnDur.push({ m: month(o.timestamp), d: o.durationMs });
    if (isHuman(o)) { close(); start = o.timestamp; end = null; } else if (o.type === 'assistant' && !o.isSidechain && start) end = o.timestamp;
  });
  close(); return { waits, turnDur, bad };
}

(async () => {
  const poll = {}, span = [], seen = new Set(), agg = {}, wait = {}, recorded = {}, tests = {}, projects = new Set(), unparsed = [];
  let subFiles = 0, subParsed = 0, sessions = 0;
  for (const root of ROOTS) for (const proj of fs.readdirSync(root)) {
    const pdir = path.join(root, proj); if (!fs.statSync(pdir).isDirectory()) continue;
    const isRepo = proj === REPO.replace(/[^A-Za-z0-9]/g, '-');
    for (const f of fs.readdirSync(pdir)) {
      if (f.endsWith('.jsonl') && !seen.has(f)) { seen.add(f); sessions++;
        const { waits, turnDur } = await mainSession(path.join(pdir, f));
        for (const w of waits) if (w.m >= FROM) (wait[w.m] = wait[w.m] || []).push(w.d / 60000);
        for (const w of turnDur) if (w.m >= FROM) (recorded[w.m] = recorded[w.m] || []).push(w.d / 60000);
      }
      const sroot = path.join(pdir, f, 'subagents'); if (!fs.existsSync(sroot)) continue;
      for (const rel of fs.readdirSync(sroot, { recursive: true })) {
        const s = path.basename(rel), sdir = path.join(sroot, path.dirname(rel));
        if (!s.endsWith('.jsonl') || seen.has(s)) continue; seen.add(s); subFiles++;
        let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(sdir, s.replace(/\.jsonl$/, '.meta.json')), 'utf8')); } catch { meta = { agentType: '<no meta file>' }; }
        const r = await subagent(path.join(sdir, s));
        if (r.empty) { unparsed.push('no user or assistant lines'); continue; }
        subParsed++; if (r.dur < 0) unparsed.push('negative duration');
        if (month(r.start) < FROM) continue;
        const type = meta.agentType || '<no agent type>', ctoc = type.startsWith('ctoc:');
        if (ctoc && !isRepo) projects.add(proj);
        const key = (ctoc ? type : 'non-CTOC agents') + '|' + month(r.start);
        const a = (agg[key] = agg[key] || { dur: [], firstIn: [], out: [], turns: [], tools: [], model: 0, tool: 0, idle: 0, limit: 0, toolTime: {}, idleBy: {}, cause: {}, causeHere: {}, resumes: 0, parked: 0, firstInHere: [], here: 0 });
        a.dur.push(r.dur / 60000); a.firstIn.push(r.firstIn || 0); a.out.push(r.out); a.turns.push(r.turns); a.tools.push(r.tools); a.resumes += r.resumes; a.parked += r.parked;
        a.model += r.model; a.tool += r.tool; a.idle += r.idle; a.limit += r.limit; if (isRepo) a.here++;
        for (const [k, v] of Object.entries(r.toolTime)) a.toolTime[k] = (a.toolTime[k] || 0) + v;
        for (const [k, v] of Object.entries(r.cause)) { a.cause[k] = (a.cause[k] || 0) + v; if (isRepo) a.causeHere[k] = (a.causeHere[k] || 0) + v; }
        if (isRepo) a.firstInHere.push(r.firstIn || 0);
        const bump = (dim, key, f) => f(((poll[dim] = poll[dim] || {})[key] = poll[dim][key] || {}));
        const add = (o, k, v) => (o[k] = (o[k] || 0) + v);
        if (ctoc) for (const x of r.pollSplit) for (const [dim, key] of [['hoursByState', x.state], ['hoursByAwaitedJob', x.kind], ['hoursByLaunchMethod', x.method], ['hoursByMonth', month(r.start)]])
          bump(dim, key, (o) => { add(o, 'pollingHours', x.ms / 3600000); if (dim !== 'hoursByState') add(o, x.state.startsWith('job had already') ? 'wastedHours' : x.state.startsWith('job still') ? 'neededHours' : 'otherHours', x.ms / 3600000); });
        if (ctoc) for (const p of r.polls) bump('pollCountsByOutcome', p.outcome, (o) => { add(o, 'polls', 1); add(o, 'pollNeverReturned', p.returned ? 0 : 1); add(o, 'pollRanPastItsOwnTimeout', p.timedOut ? 1 : 0); });
        if (ctoc) for (const j of r.polledJobs) { const J = ((poll.jobs = poll.jobs || {})[j.kind] = poll.jobs[j.kind] || { jobs: 0, endedJobs: 0, jobRunHours: 0 }); J.jobs++; if (j.runMs != null) { J.endedJobs++; J.jobRunHours += j.runMs / 3600000; } }
        if (!span[0] || r.start < span[0]) span[0] = r.start; if (!span[1] || r.start > span[1]) span[1] = r.start;
        for (const [k, v] of Object.entries(r.idleBy)) a.idleBy[k] = (a.idleBy[k] || 0) + v;
        for (const { k, d } of r.tests) ((tests[month(r.start)] = tests[month(r.start)] || {})[k] = tests[month(r.start)][k] || []).push(d / 60000);
      }
    }
  }
  const byAgent = Object.entries(agg).map(([k, a]) => {
    const [agent, m] = k.split('|'), wall = a.model + a.tool + a.idle + a.limit, h = (x) => r1(x / 3600000);
    return { agent, month: m, runs: a.dur.length, runsInThisRepository: a.here, medianMinutes: r1(pct(a.dur, 0.5)), p90Minutes: r1(pct(a.dur, 0.9)),
      totalHours: r1(a.dur.reduce((x, y) => x + y, 0) / 60), medianFirstTurnInputTokens: pct(a.firstIn, 0.5), medianOutputTokens: pct(a.out, 0.5),
      medianTurns: pct(a.turns, 0.5), medianToolCalls: pct(a.tools, 0.5), toolShareOfWall: wall ? r1((100 * a.tool) / wall) : null,
      wallHours: { model: h(a.model), tools: h(a.tool), silenceOver30Minutes: h(a.idle), afterUsageLimit: h(a.limit) }, toolHours: a.toolTime, idleBy: a.idleBy, resumedByAMessageAfterFinishing: a.resumes, hoursSittingFinishedBeforeResume: h(a.parked), cause: a.cause, causeHere: a.causeHere, medianFirstTurnInputTokensInThisRepository: pct(a.firstInHere, 0.5),
    };
  }).sort((x, y) => (x.month + x.agent).localeCompare(y.month + y.agent));
  const months = []; for (let d = new Date(FROM + '-01T00:00:00Z'); d <= new Date(); d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.toISOString().slice(0, 7));
  const dist = (v) => (v && v.length ? { turns: v.length, medianMinutes: r1(pct(v, 0.5)), p90Minutes: r1(pct(v, 0.9)), over10Minutes: v.filter((x) => x > 10).length,
    over1Hour: v.filter((x) => x > 60).length, totalHours: r1(v.reduce((x, y) => x + y, 0) / 60) } : 'no data');
  const monthTotals = Object.fromEntries(months.map((m) => {
    const rows = byAgent.filter((x) => x.month === m); if (!rows.length) return [m, 'no data'];
    const sum = (f, g = () => true) => r1(rows.filter(g).reduce((x, y) => x + f(y), 0)), ctoc = (x) => x.agent !== 'non-CTOC agents', tools = {}, idle = {}, cause = {}, here = {};
    for (const x of rows.filter(ctoc)) for (const [k, v] of Object.entries(x.cause)) cause[k] = (cause[k] || 0) + v;
    for (const x of rows.filter(ctoc)) for (const [k, v] of Object.entries(x.causeHere)) here[k] = (here[k] || 0) + v;
    for (const x of rows.filter(ctoc)) for (const [k, v] of Object.entries(x.toolHours)) tools[k] = (tools[k] || 0) + v;
    for (const x of rows.filter(ctoc)) for (const [k, v] of Object.entries(x.idleBy)) idle[k] = (idle[k] || 0) + v;
    return [m, { ctocRuns: sum((x) => x.runs, ctoc), ctocHours: sum((x) => x.totalHours, ctoc), nonCtocRuns: sum((x) => x.runs, (x) => !ctoc(x)), nonCtocHours: sum((x) => x.totalHours, (x) => !ctoc(x)),
      ctocWallHours: Object.fromEntries(['model', 'tools', 'silenceOver30Minutes', 'afterUsageLimit'].map((k) => [k, sum((x) => x.wallHours[k], ctoc)])),
      ctocTopToolHours: Object.entries(tools).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => ({ tool: k, hours: r1(v / 3600000) })),
      ctocAgentHoursByCause: Object.entries(cause).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ cause: k, hours: r1(v / 3600000) })),
      ctocAgentHoursByCauseInThisRepository: Object.entries(here).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ cause: k, hours: r1(v / 3600000) })),
      ctocRunsInThisRepository: sum((x) => x.runsInThisRepository, ctoc),
      ctocSilenceOver30MinutesBy: Object.entries(idle).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => ({ during: k, hours: r1(v / 3600000) })) }];
  }));
  for (const x of byAgent) { x.topToolsByMinutes = Object.entries(x.toolHours).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([t, v]) => ({ tool: t, minutes: r1(v / 60000) })); delete x.toolHours; delete x.idleBy; delete x.cause; delete x.causeHere; }
  const out = {
    generatedAt: new Date().toISOString(), from: FROM, months,
    selfCheck: { subagentFilesFound: subFiles, subagentFilesParsed: subParsed, unparsed, mainSessionFiles: sessions, firstSubagentRun: span[0], lastSubagentRun: span[1], otherCtocProjects: projects.size },
    humanWaitPerTurn: Object.fromEntries(months.map((m) => [m, dist(wait[m])])),
    turnDurationAsRecordedByClaudeCode: Object.fromEntries(months.map((m) => [m, dist(recorded[m])])),
    usageLimitHits: Object.fromEntries(months.map((m) => [m, limits[m] ? { hits: limits[m].hits, hoursOfSilenceAfter: r1(limits[m].hours) } : wait[m] || monthTotals[m] !== 'no data' ? { hits: 0, hoursOfSilenceAfter: 0 } : 'no data'])),
    monthTotals,
    testSuiteInsideAgents: Object.fromEntries(months.map((m) => [m, !tests[m] && monthTotals[m] !== 'no data' ? 'agents ran, no test runs recorded' : tests[m] ? Object.fromEntries(Object.entries(tests[m]).map(([k, v]) => [k, { runs: v.length,
      medianMinutes: r1(pct(v, 0.5)), p90Minutes: r1(pct(v, 0.9)), totalHours: r1(v.reduce((x, y) => x + y, 0) / 60) }])) : 'no data'])),
    pollingLoopsInCtocAgents: Object.fromEntries(Object.entries(poll).map(([dim, m]) => [dim, Object.entries(m).map(([k, v]) => ({ [dim === 'jobs' ? 'awaitedJob' : 'key']: k,
      ...Object.fromEntries(Object.entries(v).map(([a, b]) => [a, a.endsWith('Hours') ? r1(b) : b])) })).sort((x, y) => (y.pollingHours || y.jobRunHours || y.polls) - (x.pollingHours || x.jobRunHours || x.polls))])),
    byAgentAndMonth: byAgent,
  };
  fs.writeFileSync(path.join(__dirname, 'pipeline-time.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out.selfCheck));
})().catch((e) => { console.error(e); process.exitCode = 1; });
