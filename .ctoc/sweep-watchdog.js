/* eslint-disable n/no-process-exit, security/detect-non-literal-fs-filename, security/detect-object-injection, security/detect-unsafe-regex */
'use strict';

/**
 * ── Why the ESLint disables above (a CONFIG GAP, not an exemption) ─────────────
 * `eslint.config.js` already declares these patterns intentional for CTOC's own
 * scripts: `n/no-process-exit` is off because "CLI entry points and hooks exit by
 * design", and `security/detect-object-injection` is off repo-wide as "extremely
 * noisy and low-signal on trusted internal data". That tuning block's `files` glob
 * covers only the src, tests and evals directories, so `.ctoc` scripts never
 * inherited it and get the raw plugin defaults. The two remaining security rules
 * are off for the same reason the tests block turns them off: this is a hand-run
 * operator script working over the repo's own files, not a production surface
 * taking untrusted input. The honest fix is a `.ctoc` script block in
 * eslint.config.js; that file is not in this plan's `files:` declaration, so it is
 * reported rather than edited here.
 *
 * The shebang was REMOVED rather than disabled: `n/hashbang` was right. This script
 * is not a package.json `bin` entry and is documented to run as `node .ctoc/…`, so
 * the shebang served nothing. A file-level disable could not have covered it anyway
 * — the shebang is line 1, ahead of any directive.
 *
 * SWEEP WATCHDOG — survives the session limit, resumes by itself.
 *
 * Why this exists: a 30-round sweep died when the session limit hit at 04:50, and
 * the workflow REPORTED "roundsRun: 30" for every skill because it counted loop
 * iterations instead of successful agent calls. 719 of 721 agents had errored.
 * Then the fix itself lied: four agents reported "ok", score 4.7, 30 rounds
 * earned — against a file untouched since May. Every Edit had been denied while
 * the CLI still exited 0, and exit 0 was being read as work.
 *
 * So this script trusts NOTHING a process says about itself:
 *
 *   1. THE DISK IS THE ONLY WITNESS. Every round hashes the artifact before and
 *      after. A round counts only if all four calls succeeded AND either the hash
 *      MOVED (real edits landed) or a GOOD artifact honestly had nothing left to
 *      fix. Two ways to fail, both measured on real runs, both never counted:
 *        WRITES-NOT-LANDING — "FOUND: 3" against a byte-identical file. The
 *          writes are denied, or the agent lied about fixing. Same failure.
 *        NO-OP-ON-POOR — the critics score the artifact POOR (it HAS defects),
 *          report FOUND: 0, and change nothing. Both claims cannot be honest.
 *          FOUND: 0 is a clean round only from an artifact already scored GOOD.
 *      Three WRITES-NOT-LANDING in a row exits non-zero — that failure is
 *      systemic plumbing and nothing else will work either. Three NO-OP-ON-POOR
 *      in a row BLOCKS just that artifact and moves on — that failure is local,
 *      and halting 228 artifacts over one is its own kind of dishonesty. Either
 *      way the rounds are never counted, and the end-of-sweep report lists every
 *      blocked artifact and exits non-zero. A watchdog that loops forever
 *      achieving nothing is the same lie as a fake round count, only slower.
 *   2. A failed call is recorded as a failure and RETRIED — never counted.
 *   3. It probes hourly, and resumes the moment the limit lifts.
 *   4. State lives on disk, so a kill -9 loses at most one round. `lastHash`
 *      makes progress auditable instead of asserted.
 *   5. ONE subagent at a time. No fan-out, ever.
 *   6. Agents get a SCOPED tool grant (no Bash), never a permission bypass —
 *      CTOC's own gates stay in force. See the toolSet grant below.
 *
 * Progress:  .ctoc/sweep-state.json     (the truth: per-skill successful rounds)
 * Log:       .ctoc/sweep-watchdog.log   (append-only, timestamped)
 *
 * Run:   node .ctoc/sweep-watchdog.js            (foreground)
 *        nohup node .ctoc/sweep-watchdog.js &    (detached, survives this session)
 * Stop:  touch .ctoc/sweep-STOP
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STATE_FILE = path.join(ROOT, '.ctoc', 'sweep-state.json');
const LOG_FILE = path.join(ROOT, '.ctoc', 'sweep-watchdog.log');
const STOP_FILE = path.join(ROOT, '.ctoc', 'sweep-STOP');

// ── ADAPTIVE ROUND BUDGET — effort follows risk ────────────────────────────────
// The owner's rule: the deep 30-round grind is for the POOR SCORERS. Grinding 30
// rounds on an already-good artifact is the same number-chasing disease as the
// fake "roundsRun: 30" report this script was written to prevent.
//
//   score < POOR_SCORE   → ROUNDS_POOR (30). No early exit. Grind it.
//   score >= POOR_SCORE  → ROUNDS_GOOD (10), and it may stop at MIN_GOOD_ROUNDS
//                          once DRY_TARGET consecutive rounds find nothing.
//   score unknown        → treated as POOR. Fail-safe: an unscored artifact is
//                          never assumed good (absence of evidence is not evidence).
const ROUNDS_POOR = 30;
const ROUNDS_GOOD = 10;
const MIN_GOOD_ROUNDS = 6;
const DRY_TARGET = 2;
const POOR_SCORE = 8;
const ROUNDS = ROUNDS_POOR;              // upper bound, used for reporting/state init
const PROBE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour, per the owner's instruction
const CALL_TIMEOUT_MS = 15 * 60 * 1000;   // a single model call may take a while at max effort

// ── SCOPED TOOL GRANT — least privilege, never a permission bypass ─────────────
// A round must READ the artifact and EDIT it; Grep/Glob let it ground a claim in
// the wider corpus, WebSearch lets it check a citation rather than invent one.
//
// BASH IS DELIBERATELY ABSENT, and that is the security boundary of this sweep.
// These agents read the skill/agent corpus — untrusted text, and exactly the
// prompt-injection surface (OWASP LLM01) this repo hardened its critics against.
// Injected text plus a shell is arbitrary code execution; injected text without a
// shell is bounded by the tool set. Do NOT add Bash "just to run the tests".
//
// WHICH FLAG ACTUALLY DOES THAT is not obvious, and getting it wrong buys a
// boundary that only LOOKS real. All three facts below were MEASURED against this
// CLI (2.1.211) with a write probe, not read off a help page:
//
//   --allowedTools  does NOT restrict anything. It is an auto-APPROVE allowlist
//                   ("tool names to allow"), not a sandbox. Probe: granting only
//                   `--allowedTools Read` still edited the file. A tool grant that
//                   grants nothing is exactly the kind of silent lie this file exists
//                   to kill, so it is NOT used as the boundary.
//   --tools         restricts the BUILT-IN set only ("from the built-in set").
//                   Necessary, NOT sufficient: probe `--tools Read` removed Edit, and
//                   the agent calmly wrote the file anyway through an MCP server
//                   (desktop-commander), which also carries process-spawning tools.
//                   MCP tools are not built-ins, so --tools never touched them.
//   --strict-mcp-config --mcp-config '{"mcpServers":{}}'
//                   loads ZERO MCP servers, closing that bypass. Verified: the agent
//                   then reports exactly the five tools below and "there is no Bash
//                   tool in this session. Nothing I have spawns a process."
//
// So the boundary is --tools AND empty strict MCP config, together. Remove either
// and the sweep silently regains a shell.
//
// `--permission-mode bypassPermissions` is BANNED here. It makes the subprocess
// route around CTOC's OWN PreToolUse enforcement hooks, and the project's first
// law is: never route around CTOC or self-cross its gates — that is exactly how
// rot accumulates unseen. The sweep's edits are legitimate because an active plan
// (plans/implementation/00050-sweep-corpus-adversarial-critique.md) DECLARES this
// corpus in its `files:` block, not because the guardrail was disabled.
//
// ── CRITIQUE READS. THE WRITER WRITES. ────────────────────────────────────────
// A round used to be four calls that were each told to "fix defects directly in
// the file" — which contradicts CTOC's own Actor-Critic split, where the critic
// "provides gradient signal (specific fixes) for the Actor (agent-writer)" and
// `agents/pipeline/agent-critic.md` line 855 states plainly:
//     "- Does NOT implement fixes -- that is agent-writer's job"
// and grants itself only `tools: Read, Grep`. Asking one agent to be both is how
// you get a round that scores 4.8 and changes nothing.
//
// So the stages get the tool grants their contracts actually declare: the critics
// CANNOT write (no Edit — the restriction is enforced by --tools, not by asking
// nicely), and one writer applies their findings. This also makes the disk-hash
// verdict unambiguous: only the writer can move the hash, so hash-changed means
// exactly "the writer worked".
const CRITIC_TOOLS = ['Read', 'Grep', 'Glob', 'WebSearch'];
const WRITER_TOOLS = ['Read', 'Edit', 'Grep', 'Glob'];
const EMPTY_MCP_CONFIG = '{"mcpServers":{}}';

// Append-only, one JSON line per model call and one per round. The owner's rule:
// measure the agents, rate them, do statistics — and every number in the report
// must come from this file. Never an estimate, never an interpolation.
// Overridable ONLY so the report can be exercised against a fixture without
// writing into the real corpus log — a statistics path nobody can test is the
// last place this project should be taking things on faith.
const STATS_FILE = process.env.CTOC_SWEEP_STATS || path.join(ROOT, '.ctoc', 'sweep-stats.jsonl');

// Consecutive WRITES-NOT-LANDING rounds on ONE artifact before the sweep gives up
// and exits non-zero. A watchdog that loops forever achieving nothing is the same
// lie as a fake round count, just slower.
const WRITE_FAIL_LIMIT = 3;

// Consecutive NO-OP rounds on a POOR artifact before the sweep gives up. Measured,
// not hypothetical: five rounds scored the first artifact POOR (5.8, 6.2, 4.6, 4.0,
// 4.8), reported FOUND: 0, and changed zero bytes — and the "FOUND: 0 means a
// legitimately clean round" rule COUNTED the first of them. Left alone that banks
// 30/30 "genuinely completed" rounds against a file untouched since May.
//
// The CAUSE of those particular no-ops is now known and fixed upstream: FOUND used
// to mean "defects you FIXED", and the agents were fixing nothing because Edit was
// permission-denied. FOUND now means defects FOUND, the critics are not asked to
// fix at all, and the writer has an approved Edit. So this rule should fire far
// less — and when it does it means something real: the critics called a file bad
// and then found nothing wrong with it, which cannot both be true.
//
// FOUND: 0 stays credible ONLY from a GOOD artifact. This file already encodes that
// judgement for convergence ("a quiet round on a bad artifact means the critics
// missed something, not that it is fine"); the round COUNT obeys it too.
const NOOP_LIMIT = 3;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(LOG_FILE, line); } catch { /* logging must never kill the sweep */ }
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveState(state) {
  const tmp = `${STATE_FILE}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE); // atomic: a crash mid-write never corrupts progress
}

/** Every SKILL.md and every agent .md, discovered from disk — never a hardcoded list. */
function discoverArtifacts() {
  const out = [];
  const walk = (dir, pick) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, pick);
      else if (pick(full)) out.push(path.relative(ROOT, full));
    }
  };
  walk(path.join(ROOT, 'skills'), (p) => path.basename(p) === 'SKILL.md');
  walk(path.join(ROOT, 'agents'), (p) => p.endsWith('.md') && !p.includes(`${path.sep}_shared${path.sep}`));
  return out;
}

function initState() {
  const artifacts = discoverArtifacts();
  const state = {
    startedAt: new Date().toISOString(),
    roundsTarget: ROUNDS,
    concurrency: 1,
    artifacts: {},
  };
  for (const a of artifacts) {
    // lastHash starts at the artifact's CURRENT bytes, so the very first round has
    // a real baseline to be judged against and progress is auditable from zero.
    state.artifacts[a] = {
      roundsSucceeded: 0, roundsFailed: 0, lastError: null, done: false,
      lastHash: fileHash(a), writeFailStreak: 0, noopStreak: 0,
    };
  }
  log(`initialised state: ${artifacts.length} artifacts x ${ROUNDS} rounds`);
  return state;
}

/**
 * Run ONE model call via the Claude CLI. Resolves {ok, output} or {ok:false, error}.
 * NEVER throws. The CLI is CTOC's runtime — there is no raw API key here.
 */
function callClaude(prompt, tools) {
  return new Promise((resolve) => {
    const bin = process.platform === 'win32' ? 'claude.cmd' : 'claude';
    const toolSet = Array.isArray(tools) && tools.length ? tools : CRITIC_TOOLS;
    let child;
    try {
      // The TOOL GRANT is LOAD-BEARING. `claude -p` is non-interactive: there is
      // nobody to answer a permission prompt, so WITHOUT an explicit grant every
      // Edit is auto-denied — the agent critiques, its writes hit a wall, the CLI
      // still exits 0, and the round gets counted as "ok" against a file that was
      // never touched. That exact bug ran for eight minutes: four agents "ok",
      // score 4.7, file unchanged since May.
      //
      // The tool set is SCOPED (see toolSet), never a permission bypass.
      // --tools bounds the built-ins; the empty strict MCP config removes every
      // MCP server (without it, an MCP file-writer/process-spawner walks straight
      // through --tools). Both are load-bearing — see the toolSet note.
      child = spawn(bin, [
        '-p', prompt,
        '--output-format', 'json',
        // --tools BOUNDS what exists (the security boundary: no Bash, no Write).
        '--tools', toolSet.join(','),
        '--strict-mcp-config',
        '--mcp-config', EMPTY_MCP_CONFIG,
        // --allowedTools APPROVES what exists. Both are needed and they are not
        // the same job: `claude -p` is non-interactive, so a tool that is
        // available but unapproved is DENIED — silently, while the CLI exits 0.
        // Measured: this exact spawn without --allowedTools returns
        // permission_denials:[{tool_name:"Edit"}] and the writer reports
        // "denied permission ... zero edits made" — the original bug, exactly.
        // (A probe run straight from an interactive session's shell inherits a
        // grant and writes ANYWAY, which is why hand-probing the flags from a
        // terminal proves nothing about this spawn. Test the spawn, not a shell.)
        '--allowedTools', ...toolSet,
      ], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      return resolve({ ok: false, error: `spawn failed: ${err.message}` });
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (r) => { if (!settled) { settled = true; resolve(r); } };

    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      finish({ ok: false, error: 'timeout' });
    }, CALL_TIMEOUT_MS);

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => { clearTimeout(timer); finish({ ok: false, error: err.message }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const blob = `${stdout}\n${stderr}`;
      // The limit messages are the whole reason this watchdog exists — detect them
      // explicitly so a limited call is NEVER mistaken for completed work.
      if (/session limit|usage limit|rate limit|temporarily limiting/i.test(blob)) {
        return finish({ ok: false, error: 'LIMIT', limited: true });
      }
      if (code !== 0) return finish({ ok: false, error: `exit ${code}: ${stderr.slice(0, 300)}` });
      finish({ ok: true, output: stdout });
    });
  });
}

/** Cheap liveness probe. Returns true only when the model actually answered. */
async function probe() {
  const r = await callClaude('Reply with exactly: READY');
  if (r.ok) return true;
  log(`probe: not available (${r.error})`);
  return false;
}

const LENSES = ['pre-mortem', 'devils-advocate', 'red-team'];

function roundPrompt(file, round, lens) {
  const base = `You are running round ${round} of ${ROUNDS} of a MANDATORY adversarial sweep on ONE CTOC artifact: ${file}

Repo root: ${ROOT}. Read ${file} FRESH from disk, IN FULL. It changes between rounds.

NON-NEGOTIABLE:
- NO FAKING. Every claim must be grounded in text you actually read. This repo is full of documents asserting work that never happened.
- NO FABRICATED CITATIONS. Name standards by name (OWASP, CWE, ISO, NIST, MITRE); never invent a URL, statistic, or percentage. If you cannot verify a number, state the claim qualitatively.
- Depth, not padding. Length is not quality. Never pad to look thorough.
- No stubs, no TODOs. Spell every term out; no invented abbreviations.
- Round ${round} is NOT a formality: an earlier round claiming this file is fine is a CLAIM, not evidence. Hunt for what earlier rounds MISSED.`;

  if (lens) {
    const instr = {
      'pre-mortem': 'Assume this artifact shipped, a human relied on it, and it FAILED them. Work backward to the instruction that was vague enough for two runs to diverge, or the gap that let broken work pass.',
      'devils-advocate': 'Build the strongest case AGAINST this artifact being good enough to ship: instructions that sound specific but operationalize into nothing, unjustified thresholds, claimed scope the body never implements, missing error and edge paths.',
      'red-team': 'Reason as reality and the adversary. Would it actually catch what it claims? Is any claim or citation fabricated — check them. What failure modes that ACTUALLY occur in this domain in 2026 does it miss? Work through the relevant OWASP / CWE / MITRE classes by name.',
    }[lens];
    return `${base}\n\nLENS: ${lens}. ${instr}\n\n${REPORT_CONTRACT}\n\nEnd with one line: ROUND ${round} ${lens} COMPLETE`;
  }
  return `${base}\n\nEvaluate it as CTOC's agent-critic would, scoring bottom-up (start at 0, award points for demonstrated quality — never start at 10 and deduct): specificity, completeness, boundaries, actionability, integration, robustness, calibration, research grounding.\n\n${REPORT_CONTRACT}\n\nThen end with EXACTLY these two lines, nothing after them:\nSCORE: <the weighted overall, one decimal, 0-10>\nFOUND: <how many real defects you FOUND this round, an integer>\n\nFOUND is what you FOUND, not what you fixed — you cannot fix anything, and you are not being asked to. FOUND: 0 means you genuinely found nothing. Reporting 0 while scoring this artifact below 8 says "it is bad and there is nothing wrong with it", which cannot be true; the sweep treats that contradiction as a failed round, so do not paper over it — either find the defects or score it honestly.\n\nThe SCORE decides how much further effort this artifact earns, so it must be honest. Inflating it to look good buys the artifact LESS scrutiny than it needs — that is not a favour to anyone. Deflating it to look thorough wastes rounds another artifact needs. Report what you actually assessed.`;
}

/**
 * The reporting contract shared by all four critique lenses. They are READ-ONLY
 * by tool grant (--tools has no Edit), which mirrors what
 * `agents/pipeline/agent-critic.md` declares about itself: "Does NOT implement
 * fixes -- that is agent-writer's job", `tools: Read, Grep`. Telling them to edit
 * anyway is what produced rounds that scored an artifact POOR and changed nothing.
 * They report; the writer applies.
 */
const REPORT_CONTRACT = `YOU CANNOT EDIT. You have no edit tool, by design — you are the critic, not the writer. Do not attempt an edit; do not describe an edit as if you had made one. Your job is to REPORT what a writer must change.

For each real, grounded defect, emit a block in EXACTLY this shape:

DEFECT <n>
CLAIM: <what is wrong, in one sentence>
EVIDENCE: <the exact text you read in the file that shows it — quote it>
FIX: <the precise change a writer should make: what to replace, and with what>

An honest empty result beats invented concern — but look hard first. If nothing survives your lens, say NOTHING FOUND and emit no DEFECT blocks.`;

/**
 * The WRITE stage. One agent, one file, the collected findings, and the only
 * Edit grant in the round. This is the stage that moves the hash — so a round
 * whose hash does not move is precisely a round where this agent did nothing,
 * which is a signal worth having rather than a fact worth hiding.
 *
 * @param {string} file - the artifact, repo-relative
 * @param {number} round
 * @param {string} findings - the concatenated critique output
 * @returns {string} the writer prompt
 */
function writerPrompt(file, round, findings) {
  return `You are the WRITER in round ${round} of a CTOC corpus sweep. Repo root: ${ROOT}.

Four independent critics have just examined ONE artifact: ${file}. They cannot edit — you can, and you are the only stage that can. Their findings are below.

YOUR JOB: read ${file} FRESH from disk, IN FULL, then APPLY every finding that is real, using your Edit tool. Edit ONLY ${file}. Do not run git. Do not create files.

NON-NEGOTIABLE:
- APPLY, do not re-critique. The critique already happened. You are here to make the file better on disk.
- A finding you judge WRONG or ungrounded: skip it, and say why in one line. You are the last check against invented concern — a critic's claim is a claim, and the file itself is the evidence.
- NO FABRICATED CITATIONS. Never invent a URL, statistic, or percentage. If you cannot verify a number, state the claim qualitatively or drop it.
- No stubs, no TODOs. Spell every term out; no invented abbreviations.
- Do not report a change you did not make. Every count you give must correspond to an edit that actually landed. This repo's defining failure is documents asserting work that never happened; the file on disk is checked against what you say here.

CRITIC FINDINGS:
${findings}

End with EXACTLY this line, nothing after it:
APPLIED: <how many findings you actually applied to the file, an integer>`;
}

/**
 * The content hash of an artifact on disk. This is the ONLY evidence that work
 * happened. An agent saying "ok" is a claim; a changed hash is a fact. The whole
 * point of this watchdog is that it trusts the second and never the first.
 */
function fileHash(rel) {
  try {
    return require('crypto').createHash('sha256')
      .update(fs.readFileSync(path.join(ROOT, rel)))
      .digest('hex');
  } catch {
    return null;
  }
}

/** Size of an artifact on disk in bytes, or null when unreadable. */
function fileBytes(rel) {
  try {
    return fs.statSync(path.join(ROOT, rel)).size;
  } catch {
    return null;
  }
}

/**
 * Append ONE measurement line to the stats log. Append-only and fail-soft: a
 * statistics failure must never kill a sweep, but it must also never invent a
 * number. Anything this cannot record is simply absent from the report — which
 * the report then shows as absent, not as zero-that-means-fine.
 *
 * @param {object} obj - one measurement record
 */
function appendStat(obj) {
  try {
    fs.appendFileSync(STATS_FILE, `${JSON.stringify(obj)}\n`);
  } catch { /* statistics must never kill the sweep */ }
}

/** Read every stats line. Unparseable lines are DROPPED, never guessed at. */
function readStats() {
  let raw;
  try { raw = fs.readFileSync(STATS_FILE, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a corrupt line is not data */ }
  }
  return out;
}

/**
 * The agent's prose out of a `--output-format json` reply. The CLI hands back a
 * JSON envelope; the critics' findings live in its `result`. Handing the raw
 * envelope to the writer would feed it escaped JSON instead of the critique, so
 * unwrap it — and fall back to the raw text rather than lose a finding.
 *
 * @param {string} output - raw stdout from the CLI
 * @returns {string} the agent's reply text
 */
function resultText(output) {
  if (typeof output !== 'string') return '';
  try {
    const j = JSON.parse(output);
    if (j && typeof j.result === 'string') return j.result;
  } catch { /* not an envelope — use the raw text below */ }
  return output;
}

/** Parse `APPLIED: n` from a writer reply. Returns null when absent/unparseable. */
function parseApplied(output) {
  if (typeof output !== 'string') return null;
  const m = output.match(/APPLIED:\s*([0-9]+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Parse `SCORE: n` from a critic reply. Returns null when absent/unparseable. */
function parseScore(output) {
  if (typeof output !== 'string') return null;
  const m = output.match(/SCORE:\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null;
}

/** Parse `FOUND: n` from a critic reply. Returns null when absent/unparseable. */
function parseFound(output) {
  if (typeof output !== 'string') return null;
  const m = output.match(/FOUND:\s*([0-9]+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * How many rounds this artifact has earned. An unknown score counts as POOR —
 * we never assume an unscored artifact is fine.
 */
function targetRounds(rec) {
  if (typeof rec.score !== 'number') return ROUNDS_POOR;
  return rec.score < POOR_SCORE ? ROUNDS_POOR : ROUNDS_GOOD;
}

async function main() {
  log('=== sweep watchdog starting ===');
  let state = loadState();
  if (!state) { state = initState(); saveState(state); }
  else log(`resumed state: ${Object.keys(state.artifacts).length} artifacts`);

  for (;;) {
    if (fs.existsSync(STOP_FILE)) { log('STOP file present — exiting cleanly'); return; }

    const pending = Object.entries(state.artifacts).filter(([, v]) => !v.done);
    if (pending.length === 0) {
      // The final report is the last place this sweep could lie, so it counts the
      // three outcomes separately and NEVER folds the bad ones into a total.
      const all = Object.entries(state.artifacts);
      const blocked = all.filter(([, v]) => v.blocked);
      const missing = all.filter(([, v]) => v.missing);
      const swept = all.filter(([, v]) => !v.blocked && !v.missing);
      log('=== SWEEP FINISHED ===');
      log(`  ${swept.length}/${all.length} artifacts genuinely swept — every counted round backed by a`);
      log('      changed file on disk, or an honest clean round on an artifact already scored good.');
      if (missing.length) {
        log(`  ${missing.length} artifacts UNREADABLE on disk — never swept:`);
        for (const [f] of missing) log(`      ${f}`);
      }
      if (blocked.length) {
        log(`  ${blocked.length} artifacts BLOCKED — scored POOR, then ${NOOP_LIMIT} rounds running the critics`);
        log('      changed nothing. NOT swept. NOT fine. These need a human:');
        for (const [f, v] of blocked) log(`      ${f}  (score ${v.score ?? '?'}, ${v.roundsFailed} failed rounds)`);
      }
      if (blocked.length || missing.length) {
        log('  This sweep did NOT do what it set out to do on the artifacts listed above.');
        log('  Exiting NON-ZERO: a partial sweep must never read as a clean one.');
        return process.exit(1);
      }
      return;
    }

    if (!(await probe())) {
      log(`limited. ${pending.length} artifacts still pending. sleeping 1 hour.`);
      await new Promise((r) => setTimeout(r, PROBE_INTERVAL_MS));
      continue;
    }

    // ONE artifact, ONE call at a time. Sequential everywhere, by construction.
    const [file, rec] = pending[0];
    const round = rec.roundsSucceeded + 1;
    const target = targetRounds(rec);
    const band = typeof rec.score === 'number' ? (rec.score < POOR_SCORE ? 'POOR' : 'good') : 'unscored';
    log(`${file}: starting round ${round}/${target} [${band}${typeof rec.score === 'number' ? ' ' + rec.score : ''}] (${pending.length} artifacts pending)`);

    // The artifact's bytes BEFORE any call this round. This is the round's only
    // witness. Everything after it — four "ok" exits, a confident summary, a
    // score — is a CLAIM until this hash moves.
    const hashBefore = fileHash(file);
    if (hashBefore === null) {
      rec.roundsFailed += 1;
      rec.done = true;
      rec.missing = true;
      rec.lastError = `artifact unreadable on disk — cannot verify any round against it`;
      log(`${file}: UNREADABLE ON DISK — skipping. No round can be verified against a file that is not there.`);
      saveState(state);
      continue;
    }

    const bytesBefore = fileBytes(file);
    const roundStartedAt = Date.now();
    let allOk = true;
    let foundThisRound = 0;
    const findings = [];
    for (const lens of [null, ...LENSES]) {
      if (fs.existsSync(STOP_FILE)) { log('STOP file present — exiting mid-round'); return; }
      const label = lens || 'critic';
      const callStartedAt = Date.now();
      // CRITIC_TOOLS has no Edit: the critics physically cannot write, which is
      // both their declared contract and what makes the hash verdict attributable.
      const r = await callClaude(roundPrompt(file, round, lens), CRITIC_TOOLS);
      const durationMs = Date.now() - callStartedAt;
      let found = null;
      if (r.ok) {
        if (lens === null) {
          const s = parseScore(r.output);
          if (s !== null) {
            if (rec.score !== s) log(`${file}: score ${typeof rec.score === 'number' ? rec.score + ' -> ' : ''}${s} (${s < POOR_SCORE ? 'POOR: earns ' + ROUNDS_POOR + ' rounds' : 'good: earns ' + ROUNDS_GOOD})`);
            rec.score = s;
          }
        }
        // FOUND is asked of the critic, but read it wherever a call reports one.
        // parseFound returns null when absent, so this reads every honest number
        // and never invents one.
        found = parseFound(r.output);
        if (found !== null) foundThisRound += found;
        findings.push(`--- ${label} ---\n${resultText(r.output)}`);
      }
      appendStat({
        ts: new Date().toISOString(), artifact: file, round, lens: label,
        stage: 'critique',
        status: r.ok ? 'ok' : (r.limited ? 'limited' : 'failed'),
        score: lens === null && r.ok ? parseScore(r.output) : null,
        found, applied: null, hashChanged: null,
        bytesBefore, bytesAfter: null, durationMs,
      });
      if (!r.ok) {
        allOk = false;
        rec.roundsFailed += 1;
        rec.lastError = r.error;
        saveState(state);
        if (r.limited) {
          log(`${file} r${round} ${lens || 'critic'}: LIMITED — not counted, will retry. sleeping 1 hour.`);
          await new Promise((x) => setTimeout(x, PROBE_INTERVAL_MS));
        } else {
          log(`${file} r${round} ${lens || 'critic'}: FAILED (${r.error}) — not counted, will retry`);
        }
        break; // abandon the round; it does NOT count
      }
      log(`${file} r${round} ${lens || 'critic'}: ok`);
    }

    // A round needs all four calls to actually succeed. This is the line that makes
    // the 719-errors-reported-as-30-rounds lie impossible.
    if (!allOk) continue; // already recorded as a failure above

    // ── WRITE STAGE — the only agent in this round that can touch the file ─────
    // Skipped when the critics found nothing: there is nothing to apply, and
    // spending a call to prove that would be theatre. A POOR artifact that
    // reaches here with FOUND: 0 falls through to NO-OP-ON-POOR below, which is
    // the correct verdict — the critics failed to find defects in a file they
    // themselves called bad.
    // ── FOREIGN-EDIT GUARD ────────────────────────────────────────────────────
    // The disk-hash verdict assumes THIS SWEEP is the only thing writing to the
    // artifact. That assumption is not free: while this was being built, another
    // agent was concurrently editing the same corpus, and a round that "saw the
    // hash move" would have credited the WRITER for someone else's edit. That is
    // the original lie wearing its mirror image — reporting work that happened,
    // but not by us.
    //
    // The critics cannot write (no Edit in CRITIC_TOOLS), so ANY change between
    // round start and the writer call came from outside. Detect it, say so, and
    // re-baseline: the writer is judged only against the bytes that existed when
    // IT started.
    const hashPreWriter = fileHash(file);
    const foreignEdit = hashPreWriter !== hashBefore;
    if (foreignEdit) {
      log(`${file} r${round}: FOREIGN EDIT DETECTED — the file changed during the read-only critique phase (sha256 ${hashBefore.slice(0, 12)} -> ${String(hashPreWriter).slice(0, 12)}). The critics cannot write, so something OUTSIDE this sweep is editing this corpus. Re-baselining the writer against the current bytes so this round cannot take credit for that edit.`);
    }

    let applied = null;
    if (foundThisRound > 0) {
      const writerStartedAt = Date.now();
      const w = await callClaude(writerPrompt(file, round, findings.join('\n\n')), WRITER_TOOLS);
      const writerMs = Date.now() - writerStartedAt;
      applied = w.ok ? parseApplied(w.output) : null;
      appendStat({
        ts: new Date().toISOString(), artifact: file, round, lens: 'writer',
        stage: 'write',
        status: w.ok ? 'ok' : (w.limited ? 'limited' : 'failed'),
        score: null, found: foundThisRound, applied, hashChanged: null,
        bytesBefore, bytesAfter: fileBytes(file), durationMs: writerMs,
      });
      if (!w.ok) {
        rec.roundsFailed += 1;
        rec.lastError = w.error;
        saveState(state);
        if (w.limited) {
          log(`${file} r${round} writer: LIMITED — not counted, will retry. sleeping 1 hour.`);
          await new Promise((x) => setTimeout(x, PROBE_INTERVAL_MS));
        } else {
          log(`${file} r${round} writer: FAILED (${w.error}) — not counted, will retry`);
        }
        continue; // the round does NOT count
      }
      log(`${file} r${round} writer: ok (critics found ${foundThisRound}, writer APPLIED ${applied === null ? 'an unreported number of' : applied})`);
    } else {
      log(`${file} r${round} writer: skipped — the critics found nothing to apply`);
    }

    // ── THE VERDICT — decided by the DISK, never by an exit code ───────────────
    // Four "ok" exits prove four processes ran. They do not prove any work
    // happened. A round is real only if the artifact's bytes MOVED, or every
    // critic honestly reported there was nothing to fix.
    const hashAfter = fileHash(file);
    // Judged against the bytes the WRITER started from, not the bytes the round
    // started from — otherwise a foreign edit during the critique phase would be
    // counted as this round's work. Identical when nothing foreign happened.
    const changed = hashPreWriter !== hashAfter;
    // An unscored artifact counts as POOR — never assume an unscored file is fine.
    const isPoor = typeof rec.score !== 'number' || rec.score < POOR_SCORE;

    // ONE measurement line per round, written BEFORE the verdict acts on it, so
    // the statistics record what happened even if the process dies next line.
    // `hashChanged` is the fact; every other field is what the agents claimed.
    appendStat({
      ts: new Date().toISOString(), artifact: file, round, lens: null, stage: 'round',
      status: changed ? 'counted'
        : foundThisRound > 0 ? 'writes-not-landing'
          : isPoor ? 'no-op-on-poor' : 'counted-clean',
      score: typeof rec.score === 'number' ? rec.score : null,
      found: foundThisRound, applied, hashChanged: changed,
      hashBefore, hashPreWriter, hashAfter, foreignEdit,
      bytesBefore, bytesAfter: fileBytes(file),
      durationMs: Date.now() - roundStartedAt,
    });

    if (!changed && foundThisRound > 0) {
      // The critics claim they FIXED things and the file is byte-identical.
      // Either the writes are being denied, or the agent lied about fixing.
      // Both are the SAME failure: a reported round that did not happen. This is
      // the precise bug this watchdog was rewritten to make impossible.
      rec.roundsFailed += 1;
      rec.writeFailStreak = (rec.writeFailStreak || 0) + 1;
      rec.lastHash = hashAfter;
      rec.lastError = `WRITES-NOT-LANDING: critics reported FOUND: ${foundThisRound} fixes, but ${file} is byte-identical (sha256 ${hashBefore.slice(0, 12)}) — round NOT counted`;
      log(`${file} r${round}: *** WRITES-NOT-LANDING *** critics claimed ${foundThisRound} fixes; file UNCHANGED (sha256 ${hashBefore.slice(0, 12)}). NOT COUNTED (strike ${rec.writeFailStreak}/${WRITE_FAIL_LIMIT})`);
      saveState(state);

      if (rec.writeFailStreak >= WRITE_FAIL_LIMIT) {
        log([
          '',
          '=== FATAL: WRITES ARE NOT LANDING — the sweep is achieving nothing ===',
          `Artifact: ${file}`,
          `${WRITE_FAIL_LIMIT} consecutive rounds where the critics reported real fixes and the`,
          'file did not change by a single byte. This is exactly the failure this',
          'watchdog exists to catch: agents that "succeed" against a file they never',
          'touched. It will NOT spin pretending to work. Diagnose, in this order:',
          '',
          '  1. THE PERMISSION GRANT — start here, it is the measured favourite and it',
          '     is what caused the original bug. `claude -p` is non-interactive: a tool',
          '     that is AVAILABLE but not APPROVED is denied, silently, while the CLI',
          '     still exits 0. Without --allowedTools this exact spawn returns',
          '     permission_denials:[{tool_name:"Edit"}] and the writer honestly reports',
          '     "denied permission ... zero edits made" — four green calls, nothing done.',
          '     Check the raw envelope for permission_denials before blaming anyone:',
          `       node -e 'require("./.ctoc/sweep-watchdog.js")' # then inspect a call's JSON`,
          '     DO NOT "verify" this by running claude from your terminal. A shell inside',
          '     an interactive session inherits a grant this spawn does not get, so a',
          '     hand-probe WRITES and proves nothing. Test the spawn path, not a shell.',
          '',
          `  2. TOOL SET. The critics run --tools ${CRITIC_TOOLS.join(',')} (no Edit, by`,
          `     contract) and the writer runs --tools ${WRITER_TOOLS.join(',')}, both with`,
          '     an empty strict MCP config. If Edit ever leaves the WRITER list, every',
          '     write dies silently while the CLI still exits 0.',
          `       git diff --stat -- ${file}      # a changed file is the only proof`,
          '',
          '  3. CTOC PLAN COVERAGE. src/hooks/PreToolUse.Edit.js denies any edit to a file',
          '     no ACTIVE plan declares (stages: in-progress > todo > implementation).',
          '     This corpus is declared by',
          '       plans/implementation/00050-sweep-corpus-adversarial-critique.md',
          '     via globs skills/**/SKILL.md and agents/**/*.md. If that plan moved to',
          '     done/, or its files: block changed, coverage is GONE.',
          '     CAVEAT, measured: that hook does NOT currently fire inside a nested',
          '     `claude -p` subprocess (a probe with no covering plan still wrote, and left',
          '     no entry in .ctoc/logs/enforcement.json). So coverage is what makes these',
          '     edits LEGITIMATE, but it is not what is stopping them. Ask the hook directly',
          '     (exit 0 = allowed, 2 = denied) before believing it is the culprit:',
          `       echo '{"tool_name":"Edit","tool_input":{"file_path":"${path.join(ROOT, file)}"}}' \\`,
          '         | node src/hooks/PreToolUse.Edit.js',
          '',
          'FIX THE CAUSE. Do NOT reach for --permission-mode bypassPermissions: it routes',
          "around CTOC's own enforcement, which is the rot this project forbids.",
          '',
        ].join('\n'));
        saveState(state);
        process.exit(1);
      }
      continue; // the round does NOT count
    }

    if (!changed && isPoor) {
      // The critics called this artifact POOR — it HAS real defects — and then
      // changed nothing (FOUND: 0). Those two claims cannot both be honest. This
      // is NOT the "legitimately clean round" the FOUND: 0 rule was written for;
      // that rule only makes sense for an artifact already scored good.
      //
      // Counting this is how the sweep reports 30/30 rounds against a byte-
      // identical file. So it does not count.
      rec.roundsFailed += 1;
      rec.noopStreak = (rec.noopStreak || 0) + 1;
      rec.lastHash = hashAfter;
      rec.lastError = `NO-OP-ON-POOR: score ${rec.score ?? 'unscored'} says POOR, yet every critic reported FOUND: 0 and changed nothing — round NOT counted`;
      log(`${file} r${round}: *** NO-OP-ON-POOR *** score ${rec.score ?? 'unscored'} says this artifact has real defects, yet all four critics changed ZERO bytes (FOUND: 0). NOT COUNTED (strike ${rec.noopStreak}/${NOOP_LIMIT})`);
      saveState(state);

      if (rec.noopStreak >= NOOP_LIMIT) {
        // QUARANTINE, don't halt. This failure is artifact-LOCAL, not systemic:
        // the write path is proven open (a round on another artifact lands real
        // edits), so exiting here would strand the other 227 artifacts on account
        // of this one. Mark it BLOCKED — never "done" in the honest sense — keep
        // it in the end-of-sweep report, and move on. `done` only means "stop
        // spending rounds on it"; `blocked` is what the final summary reads.
        rec.done = true;
        rec.blocked = true;
        log([
          '',
          '=== BLOCKED: THIS ARTIFACT IS GETTING NOTHING DONE ===',
          `Artifact: ${file}`,
          `Score:    ${rec.score ?? 'unscored'} (POOR — this artifact HAS real defects)`,
          `${NOOP_LIMIT} consecutive rounds where all four critics ran, called this artifact`,
          'POOR, reported FOUND: 0, and changed not one byte. Both claims cannot be',
          'true of honest work: a POOR score says there ARE defects; FOUND: 0 says',
          'none were fixed.',
          '',
          'This is the ORIGINAL lie in a new hat. Not fake round counts this time —',
          'real rounds that accomplish nothing. Left to spin, it would report',
          `${ROUNDS_POOR}/${ROUNDS_POOR} "genuinely completed" rounds against an unchanged file, which is`,
          'exactly the report this watchdog exists to make impossible.',
          '',
          'It is NOT counted, NOT swept, and NOT fine. It is parked and listed in the',
          'end-of-sweep report, which exits non-zero while any artifact is blocked.',
          'The sweep continues on the rest — this failure is local to this artifact,',
          'not the plumbing.',
          '',
          'Diagnose, in this order:',
          '  1. THE CRITICS ARE NOT FIXING. The round prompt tells them to fix real',
          '     defects directly in the file. Re-run one round by hand and read the',
          '     output: does it describe defects it then never edited? That is an',
          '     agent honesty problem, and no plumbing change will fix it.',
          '  2. THE SCORE IS WRONG. If the artifact is genuinely fine, the critic is',
          '     under-scoring it below the POOR line and earning 30 rounds it does',
          '     not need. A wrong score buys the wrong amount of scrutiny.',
          '  3. THE WRITE PATH. Confirm Edit works at all — see the probe command in',
          '     the WRITES-NOT-LANDING diagnosis.',
          '',
        ].join('\n'));
        saveState(state);
      }
      continue; // the round does NOT count
    }

    // Earned: all four calls succeeded AND the disk agrees — either real edits
    // landed, or a GOOD artifact honestly had nothing left to fix.
    rec.roundsSucceeded += 1;
    rec.writeFailStreak = 0;
    rec.noopStreak = 0;
    rec.lastHash = hashAfter;
    rec.dryStreak = foundThisRound === 0 ? (rec.dryStreak || 0) + 1 : 0;
    log(`${file} r${round}: COUNTED — ${changed
      ? `edits LANDED on disk (sha256 ${hashBefore.slice(0, 12)} -> ${hashAfter.slice(0, 12)})`
      : `clean round on a good artifact (score ${rec.score}), every critic reported FOUND: 0`}`);

    const t = targetRounds(rec);

    if (rec.roundsSucceeded >= t) {
      rec.done = true;
      log(`${file}: DONE — ${rec.roundsSucceeded}/${t} rounds genuinely completed (score ${rec.score ?? '?'})`);
    } else if (!isPoor && rec.roundsSucceeded >= MIN_GOOD_ROUNDS && rec.dryStreak >= DRY_TARGET) {
      // Only a GOOD scorer may converge early. A poor scorer grinds its full 30
      // no matter how quiet the rounds go — a quiet round on a bad artifact means
      // the critics missed something, not that it is fine.
      rec.done = true;
      log(`${file}: DONE — converged at ${rec.roundsSucceeded} rounds (score ${rec.score}, ${rec.dryStreak} dry rounds)`);
    }
    saveState(state);
  }
}

// ── STATISTICS ────────────────────────────────────────────────────────────────
// Every number below is READ from .ctoc/sweep-stats.jsonl. Nothing is estimated,
// interpolated, or rounded up into a nicer story. Zero is reported as zero, and
// "not measured" is reported as not measured — never as zero, which would read as
// "fine". This repo's defining failure is documents asserting work that never
// happened; these statistics are the one place that must be beyond doubt.

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function stdev(nums) {
  if (nums.length < 2) return null;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const varc = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(varc);
}

function fmt(n, dp = 1) {
  return n === null || n === undefined ? 'not measured' : Number(n).toFixed(dp);
}

function report() {
  const stats = readStats();
  const rounds = stats.filter((s) => s && s.stage === 'round');
  const state = loadState();
  const out = (s) => process.stdout.write(`${s}\n`);

  out('');
  out('=== CTOC CORPUS SWEEP — MEASURED STATISTICS ===');
  out(`source: ${STATS_FILE}`);
  out(`stat lines: ${stats.length}   rounds recorded: ${rounds.length}`);
  if (!rounds.length) {
    out('');
    out('NO ROUNDS RECORDED. Not "the corpus is fine" — nothing has been measured.');
    out('Run the sweep (node .ctoc/sweep-watchdog.js) and report again.');
    return;
  }

  // ── per artifact ────────────────────────────────────────────────────────────
  const byArtifact = new Map();
  for (const r of rounds) {
    if (!byArtifact.has(r.artifact)) byArtifact.set(r.artifact, []);
    byArtifact.get(r.artifact).push(r);
  }

  out('');
  out('--- PER ARTIFACT ---------------------------------------------------------');
  out('artifact                                   rounds  score          found applied  bytes');
  const latestScores = [];
  let improved = 0, regressed = 0, unmoved = 0, totalFound = 0, totalApplied = 0;
  for (const [art, rs] of [...byArtifact.entries()].sort()) {
    const scored = rs.filter((r) => typeof r.score === 'number');
    const first = scored.length ? scored[0].score : null;
    const latest = scored.length ? scored[scored.length - 1].score : null;
    const found = rs.reduce((a, r) => a + (typeof r.found === 'number' ? r.found : 0), 0);
    const applied = rs.reduce((a, r) => a + (typeof r.applied === 'number' ? r.applied : 0), 0);
    const b0 = rs.find((r) => typeof r.bytesBefore === 'number');
    const bN = [...rs].reverse().find((r) => typeof r.bytesAfter === 'number');
    const dBytes = b0 && bN ? bN.bytesAfter - b0.bytesBefore : null;
    totalFound += found; totalApplied += applied;
    if (latest !== null) latestScores.push(latest);
    if (first !== null && latest !== null) {
      if (latest > first) improved++; else if (latest < first) regressed++; else unmoved++;
    }
    const band = latest === null ? '?' : (latest < POOR_SCORE ? 'POOR' : 'good');
    const blocked = state && state.artifacts[art] && state.artifacts[art].blocked ? '  BLOCKED' : '';
    const shown = art.length > 42 ? `…${art.slice(-41)}` : art.padEnd(42);
    out(`${shown} ${String(rs.length).padStart(5)}  ${fmt(first)}→${fmt(latest)} ${band.padEnd(5)} ${String(found).padStart(4)} ${String(applied).padStart(6)}  ${dBytes === null ? 'not measured' : (dBytes >= 0 ? '+' : '') + dBytes}${blocked}`);
  }

  // ── corpus ──────────────────────────────────────────────────────────────────
  out('');
  out('--- CORPUS ---------------------------------------------------------------');
  out(`artifacts measured:      ${byArtifact.size}`);
  out(`score min / median / max: ${fmt(latestScores.length ? Math.min(...latestScores) : null)} / ${fmt(median(latestScores))} / ${fmt(latestScores.length ? Math.max(...latestScores) : null)}`);
  out(`scored under ${POOR_SCORE} (POOR):     ${latestScores.filter((s) => s < POOR_SCORE).length} of ${latestScores.length}`);
  out(`improved / regressed / unmoved: ${improved} / ${regressed} / ${unmoved}`);
  out(`defects FOUND by critics:  ${totalFound}`);
  out(`defects APPLIED by writer: ${totalApplied}`);
  const roundsChanged = rounds.filter((r) => r.hashChanged === true).length;
  out(`rounds that changed the file on disk: ${roundsChanged} of ${rounds.length}`);
  for (const st of ['counted', 'counted-clean', 'no-op-on-poor', 'writes-not-landing']) {
    out(`  status ${st.padEnd(19)} ${rounds.filter((r) => r.status === st).length}`);
  }
  if (state) {
    const blocked = Object.entries(state.artifacts).filter(([, v]) => v.blocked);
    out(`blocked artifacts: ${blocked.length}`);
    for (const [f, v] of blocked) out(`  ${f}\n      why: ${v.lastError || 'not recorded'}`);
  }

  // ── score reliability — the one that decides the round budget ───────────────
  out('');
  out('--- SCORE RELIABILITY (same artifact, IDENTICAL bytes, scored more than once) ---');
  out('The 30-vs-10 round budget rests entirely on this score. If it moves while the');
  out('file does not, the band is noise and the budget is being set by a coin flip.');
  const byHash = new Map();
  for (const r of rounds) {
    if (typeof r.score !== 'number' || !r.hashBefore) continue;
    const k = `${r.artifact} ${r.hashBefore}`;
    if (!byHash.has(k)) byHash.set(k, []);
    byHash.get(k).push(r.score);
  }
  const repeats = [...byHash.entries()].filter(([, v]) => v.length >= 2);
  if (!repeats.length) {
    out('');
    out('NOT MEASURABLE YET: no artifact has been scored twice at the same hash.');
    out('This is not "the score is reliable" — it is "nobody has checked".');
  } else {
    out('');
    out('artifact                                   n   min   max  spread  stdev');
    let worst = 0;
    for (const [k, scores] of repeats.sort((a, b) => (Math.max(...b[1]) - Math.min(...b[1])) - (Math.max(...a[1]) - Math.min(...a[1])))) {
      const art = k.split(' ')[0];
      const spread = Math.max(...scores) - Math.min(...scores);
      worst = Math.max(worst, spread);
      const shown = art.length > 42 ? `…${art.slice(-41)}` : art.padEnd(42);
      out(`${shown} ${String(scores.length).padStart(2)}  ${fmt(Math.min(...scores))}  ${fmt(Math.max(...scores))}  ${fmt(spread)}   ${fmt(stdev(scores), 2)}`);
      out(`    samples: ${scores.join(', ')}`);
    }
    out('');
    out(`WORST SPREAD ON IDENTICAL BYTES: ${fmt(worst)} points, across ${repeats.length} artifact/hash pair(s).`);
    out(`The POOR/good line sits at ${POOR_SCORE}. A spread wider than the distance from a`);
    out('score to that line means the band — and therefore the whole round budget —');
    out('can flip between two runs that read the very same bytes.');
  }
  out('');
}

// Exported so the stages can be exercised INDIVIDUALLY — a writer stage nobody
// can test in isolation is how the last one shipped broken. Guarded with
// require.main so importing this file never launches a 228-artifact sweep.
module.exports = {
  roundPrompt, writerPrompt, callClaude, report,
  fileHash, fileBytes, parseScore, parseFound, parseApplied, resultText,
  appendStat, readStats, median, stdev,
  CRITIC_TOOLS, WRITER_TOOLS, POOR_SCORE, STATS_FILE,
};

if (require.main === module) {
  if (process.argv.includes('--report')) {
    report();
  } else {
    main().catch((err) => {
      log(`watchdog crashed: ${err && err.stack ? err.stack : err}`);
      process.exit(1);
    });
  }
}
