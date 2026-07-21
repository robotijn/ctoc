/**
 * Menu Screens
 * Deterministic screen renderers for the CTOC state machine.
 * Every screen outputs JSON with { text, ask, actions }.
 *
 * Usage:
 *   node start.js                            -> streaming-gate.streamingGateScreen()
 *   node start.js menu commands              -> dashboardCommands()
 *   node start.js browse {stage}             -> stageBrowse(stage)
 *   node start.js plan {stage}/{file}        -> streaming-gate.planDecisionScreen(ref)
 *   node start.js validate {stage}/{file}    -> validateScreen(stage, file)
 *
 * Opening a plan is a QUESTION, not a navigation menu. The four plan-menu screens
 * that used to live here — planActions, planActionsMore, reviewActions, discussMenu
 * — asked "What would you like to do with this plan?" over a list of routes. They
 * are replaced by `streaming-gate.planDecisionScreen`, which renders the plan's
 * BODY and asks the next real decision: the PRODUCT question when one is waiting,
 * the gate question only as a fallback. Every decision they carried survives there
 * (critique, view/edit, delete, approve, reject-to-stage, validation detail); only
 * their navigation rows are gone, which was the point.
 */

const safeFs = require('./safe-fs');
const path = require('path');
const { getPlanCounts, readPlans, getPlansDir, getAgentStatus, getVisionCounts, getVisionStubs } = require('./state');
const { SECTIONS, getSectionLabel, getStagesInSection, loadDashboardPrefs } = require('./sections');
const { getInboxCounts, listStaleCandidates, listQuestions, listDecisions, listPlansAtGates } = require('./inbox');
// Namespace import (not destructured) preserves the spy seam: a test can rewire
// staleDetector.verifyStaleCandidate / classifyStaleCandidate at the require
// boundary. inboxVerifyProposals is the SOLE call site of verifyStaleCandidate.
const staleDetector = require('./stale-detector');
const { validateTransition } = require('./plan-validator');
// Namespace import as well as the destructured helper: the disclosure line calls
// describeProjectRoot through the module object so there is one resolution seam.
const projectRootLib = require('./project-root');
const { findProjectRoot } = projectRootLib;
// NB2: the background-task registry (fs choke point via safe-fs) + its pure view.
const taskRegistry = require('./task-registry');
const taskView = require('./task-view');
// NB4: on-open reconciliation of the registry against the live harness TaskList.
const taskReconcile = require('./task-reconcile');
// Streaming gate-decision screen — the new `/ctoc:start` default. Its routes
// (`stream approve|skip|comment`) live here in the router; the `dashboard` route
// keeps the classic pipeline overview reachable.
const streamingGate = require('./streaming-gate');
// Z1: the residency sweep REPORTS (never moves) un-ledgered plans on a project whose
// approval provenance was never migrated. This is that report's READER — a report
// path with no reader is the same defect R3-D fixed for deploy-ready.
const gateMigration = require('./gate-migration');
// The ONE encoding of human-facing gate wording — say the MOMENT/decision, never the
// gate number, which is an internal code a person cannot decode.
const gateWords = require('./gate-words');

// R3-B item 4: the terminal set is IMPORTED from the registry — there is exactly ONE
// encoding. The former local mirror (`['done','failed','orphaned']`) was STALE in both
// directions: it included `orphaned`, so `menu task complete` on an orphaned task threw
// BEFORE updateTask and R2-A's orphaned→done late-completion contract was dead code; and
// it omitted `cancelled`, so a cancelled task looked mutable at the CLI boundary. Legality
// is now asked of the registry itself (`canTransition`), never re-encoded here.
const TASK_TERMINAL = taskRegistry.TERMINAL;

// Security (S1): strip C0 (0x00-0x1F) and C1 (0x7F-0x9F) control chars before
// rendering any attacker-influenceable string (e.g. a plan slug derived from a
// filename). An ESC / CR / BS / newline embedded in a slug could otherwise spoof
// or forge menu rows (ANSI clear-screen, cursor moves, mid-row line breaks).
// Defined once at module scope so any future slug renderer reuses one sanitizer.
const stripCtl = (s) => String(s).replace(/[\x00-\x1f\x7f-\x9f]/g, '');

/** Current instant as an ISO-8601 string (R3-B item 10: the cancel-deadline clock). */
const nowIso = () => new Date().toISOString();

// SP4 cleanup: single source of truth mapping a category to its execution action
// and human-facing verb. Mirrors the stale-cleanup.js dispatcher action names.
const CLEANUP_CATEGORY_TABLE = Object.freeze({
  'shipped-but-early': { action: 'archive-to-done', verb: 'archive' },
  'approved-but-stranded': { action: 'advance-via-reconciliation', verb: 'reconcile' },
  'dead-on-arrival': { action: 'revert', verb: 'revert' },
});
// Every category the cleanup screens act on (DOA included).
const ACTIONABLE_CLEANUP = Object.keys(CLEANUP_CATEGORY_TABLE);
// D9: the 'Clean up ▸' ENTRY gate on inboxVerifyProposals is gated on
// ACTIONABLE_CLEANUP (shipped-but-early ∪ approved-but-stranded ∪
// dead-on-arrival) — ANY actionable proposal surfaces the cleanup entry. (The
// former FORWARD_CLEANUP subset, which excluded DOA, left a pure-DOA set with no
// reachable cleanup; removed.)
const CLEANUP_ORDER = ['shipped-but-early', 'approved-but-stranded', 'dead-on-arrival'];
const CLEANUP_MAX_ROWS = 20;

// Stage to folder mapping
const STAGE_FOLDERS = {
  canvas: 'canvas',
  functional: 'functional',
  implementation: 'implementation',
  todo: 'todo',
  'in-progress': 'in-progress',
  review: 'review',
  done: 'done'
};

/**
 * A plan reference's file part is always a bare filename inside a stage folder.
 * Anything with a path separator, a ".." segment, an absolute path, or a NUL
 * byte is a directory-traversal attempt and must be refused before the path is
 * joined or read (e.g. "functional/../../etc/passwd").
 */
function isUnsafePlanFile(file) {
  return typeof file !== 'string'
    || file === ''
    || file.includes('/')
    || file.includes('\\')
    || file.includes('\0')
    || file.split(/[\\/]/).includes('..')
    || file.includes('..')
    || path.isAbsolute(file);
}

/**
 * The canonical "invalid plan reference" JSON screen — an unknown stage (no
 * STAGE_FOLDERS entry, so `folder` is undefined) or a traversal filename
 * (isUnsafePlanFile). Every plan-ref screen returns THIS shape rather than
 * throwing, so the menu's { text, ask, actions } contract holds for adversarial
 * input (M8 unknown-stage crash / M11 traversal gap). Defined once so the
 * refusal message is byte-identical across all call sites.
 */
function invalidPlanRefScreen(stage, file) {
  return {
    text: `Invalid plan reference: ${stage}/${file}\n${'─'.repeat(40)}\n\n  Refusing a reference that escapes the plans/ directory.\n\n\n`,
    ask: { questions: [{ question: 'Invalid reference.', header: 'Error', options: [{ label: '◀ Back', description: 'Return to dashboard' }] }] },
    actions: { '◀ Back': '' },
  };
}

// NEXT_STAGE (the full pipeline flow: functional → implementation → todo →
// in-progress → review → done) lived here to label the discussion menu's
// "Approve → <next stage>" row. That menu is gone — opening a plan asks a question
// now — and nothing else ever read it, so the constant went with its only reader
// rather than lingering as dead data. HUMAN_GATES below is the set that actually
// governs a crossing, and it is read by the live screens.

// Human gates: transitions requiring human approval marker
const HUMAN_GATES = {
  functional: 'implementation',
  implementation: 'todo',
  review: 'done'
};

/**
 * Get the project path for rendering
 * @param {string} [projectPath] - Optional override
 * @returns {string} Project root path
 */
function getProjectPath(projectPath) {
  return projectPath || findProjectRoot();
}

/**
 * The dashboard's disclosure line: WHICH project did this open?
 *
 * The root walk is a rule, and a rule has edges. The backstop is disclosure — when the
 * resolved root is not the directory the human is standing in, the header says so. That
 * is what turns "I opened a fresh repository and was shown a plan I never wrote" from a
 * mystery into five seconds of reading.
 *
 * Two guards:
 *  - The path is RELATIVE (`../..`), never absolute. An absolute path prints the user's
 *    directory layout onto a screen that gets pasted into issues and chat.
 *  - The line renders ONLY when `root` IS the ambient resolution from the working
 *    directory. A caller that injects an explicit `projectPath` (every test, and the
 *    task/verify surfaces) is not describing where the human is standing, so claiming
 *    "you opened a different project" would be false — and a header that names the wrong
 *    root is a worse defect than the one this exists to disclose.
 *
 * @param {string} root - The project root actually being rendered
 * @returns {string} The disclosure line (newline-terminated), or '' when silent
 */
function renderRootDisclosure(root) {
  try {
    const where = projectRootLib.describeProjectRoot(process.cwd());
    if (where.sameAsCwd) return '';
    if (path.resolve(String(root)) !== where.root) return '';
    const rel = path.relative(where.cwd, where.root);
    if (!rel) return '';
    return `Working in ${stripCtl(rel)}  —  opened from this directory's parent project\n`;
  } catch (err) {
    // Absorbed: the working directory could not be read (a deleted cwd) or the relative
    // path could not be computed. Silence here is not a claim that the root IS the
    // working directory — it is the absence of a claim, which is the only honest output
    // when the comparison could not be made. The dashboard still renders.
    void err;
    return '';
  }
}

/**
 * Read VERSION file
 * @param {string} projectPath
 * @returns {string} Version string
 */
function getVersion(projectPath) {
  try {
    // When used as plugin, __dirname is the lib/ dir of the plugin
    const versionPath = path.join(__dirname, '..', '..', 'VERSION');
    return safeFs.readFileSync(versionPath, 'utf8').trim();
  } catch {
    return '?.?.?';
  }
}

/** Cap on rendered entries per wedge category; the rest collapse to a count. */
const WEDGE_RENDER_CAP = 5;

/** Max characters of a recorded fault/summary message rendered on one line. */
const WEDGE_MESSAGE_CAP = 120;

/** Max characters of a captured reconcile-failure message rendered on one dashboard line. */
const FAILURE_MESSAGE_CAP = 120;

/**
 * Render the reconcile pass's TRUSTWORTHINESS — not its findings.
 *
 * NOT BRICKING AND NOT SAYING ANYTHING ARE DIFFERENT INSTRUCTIONS. The `catch` around
 * `taskReconcile.reconcileState` below used to be empty, on the reasoning that a reconcile
 * failure must never brick the dashboard. That reasoning is correct and it is only half the
 * job: with the failure discarded, the dashboard rendered the task registry EXACTLY as it
 * would have if the pass had succeeded — same TASKS block, same counts, no orphan line,
 * nothing amiss. The human read a screen asserting the background plane was in a known
 * state when nothing had checked it. That is presenting STALE STATE AS LIVE, and it is
 * worse than a blank section: a blank section prompts a question, a confident wrong section
 * does not. This function changes only whether the failure is REPORTED, never whether it is
 * SURVIVED.
 *
 * Three states mean "the task state below is not trustworthy right now", and none of them
 * had a reader. They differ in WHY, and the difference changes what the human should do, so
 * each renders its own line:
 *
 *   `threw`               the pass DID NOT RUN — likely a code defect; the counts are stale.
 *   `report.corrupt`      it ran against an EMPTY view — the registry file needs repairing.
 *   `report.saveFailed`   it ran and decided, but nothing was persisted — usually disk or
 *                         permissions; the same work is re-decided next open.
 *
 * Corrupt and save-failed can both hold, and both render, corrupt first: a bad read explains
 * a bad write, not the reverse. A thrown pass renders alone — there is no report to inspect.
 *
 * WHAT IS REACHABLE, verified against the code rather than assumed. An unparseable
 * registry file does NOT arrive here: `task-registry.load` fails OPEN to an empty registry,
 * so no corrupt marker is set and this function correctly stays silent — a false alarm is
 * the same defect class as a silent failure. `corrupt.reason === 'load-failed'` (the loader
 * itself threw) and `saveFailed` are the two reachable PARTIAL states, and a throw mid-pass
 * never delivers a half report, because the report object does not escape the throw.
 *
 * Every interpolated value comes from a registry file, which is attacker-influenceable, so
 * it passes through `stripCtl` AND is length-bounded: a crafted message must not be able to
 * forge an extra dashboard row.
 *
 * Returns '' when the pass ran, parsed and persisted — a healthy project's dashboard is
 * byte-identical.
 *
 * @param {string|null} threw  the caught reconcile error message, or null.
 * @param {object|null} report  the reconcile report, or null when the pass threw.
 * @returns {string}  zero or more complete newline-terminated lines, or ''.
 */
function renderReconcileHealth(threw, report) {
  const bounded = (v, fallback) => {
    const s = stripCtl(String(v == null ? fallback : v));
    return s.length > FAILURE_MESSAGE_CAP ? `${s.slice(0, FAILURE_MESSAGE_CAP)}…` : s;
  };

  if (typeof threw === 'string' && threw.length > 0) {
    return `  ⛔ the background task check DID NOT RUN — the task counts above are unchecked ` +
      `and may be stale: ${bounded(threw, 'no message recorded')} · view: tasks\n`;
  }

  if (!report || typeof report !== 'object') return '';

  let out = '';

  const corrupt = report.corrupt;
  if (corrupt && typeof corrupt === 'object') {
    const skipped = corrupt.skipped;
    const extra = (Number.isFinite(skipped) && skipped > 0)
      ? ` · ${skipped} malformed entr${skipped === 1 ? 'y' : 'ies'} skipped`
      : '';
    out += `  ⛔ the task registry could not be read (${bounded(corrupt.reason, 'unknown')}) — ` +
      `the check ran against an EMPTY view, so the task counts above are a floor, not the truth` +
      `${extra} · view: tasks\n`;
  }

  if (report.saveFailed) {
    out += `  ⛔ the task check ran but could NOT be saved — what you see is not what is stored, ` +
      `and the same work will be re-decided next open: ` +
      `${bounded(report.saveFailed, 'no message recorded')} · view: tasks\n`;
  }

  return out;
}

/**
 * Human wording for each `task-registry.unsatisfiableTasks` reason, and whether the wedge
 * is PERMANENT (no passage of time clears it) or a ONE-OFF (a re-run or a repaired
 * dependency clears it).
 *
 * The distinction is the whole point of the line. A dependency cycle needs a human to
 * break it; a failed dependency does not. Rendered as one undifferentiated "failed" line —
 * which is what the dashboard did before this slice — the two are indistinguishable from
 * the human's seat, and the permanent one waits forever.
 *
 * @type {Object<string,{permanent:boolean, text:string}>}
 */
const WEDGE_REASONS = Object.freeze({
  'dep-cycle':   { permanent: true,  text: 'dependency cycle — this can NEVER clear on its own; a human must break the cycle' },
  'dep-failed':  { permanent: false, text: 'a dependency failed' },
  'dep-missing': { permanent: false, text: 'a dependency is gone from the registry' }
});

/**
 * Render the reconcile pass's five WEDGE REPORTS as dashboard lines.
 *
 * These fields — `report.unsatisfiable`, `report.deferred`, `report.stalenessOrphaned`
 * (written by `task-reconcile.reconcileState`), plus `report.quarantined` and
 * `report.quarantineFaulted` (written by `task-reconcile.applyQuarantine`, shipped by
 * plans/review/00076-quarantine-fault-fails-safe.md and
 * plans/review/00077-quarantine-on-every-promote-path.md) — had NO reader on this screen
 * before this function existed. The pass computed them on every menu open and threw them
 * away, so queued work that can NEVER run, work held one pass, an agent orphaned on age
 * alone that may still be alive, and a safety check that did not run at all were ALL
 * invisible. `report.quarantined` was the near miss: it IS surfaced on the three
 * `menu task fail|cancel|complete` results, so a human who never ran one of those
 * commands saw no held task at all. A computed value with no reader is the same defect
 * class as a claim with no test: the system looks like it knows something, and no human
 * ever learns it.
 *
 * ORDER IS A CLAIM. The fault leads, because it is the only line that says a CHECK did not
 * happen; everything below it is a RESULT that check produced. A reader who has not seen
 * the fault line will read those results as decisions, when they were a blanket
 * precaution. The held block follows it immediately so the fault's count of held tasks has
 * its evidence directly beneath it, rather than citing tasks that appear nowhere.
 *
 * TOTAL and fail-open: a null/absent/malformed report, or a malformed entry inside a
 * well-formed report, yields fewer lines — never a throw. An EMPTY report yields the EMPTY
 * STRING, so a project with no wedges renders a byte-identical dashboard.
 *
 * @param {object|null} report  a reconcile report (see ReconcileReport in task-reconcile.js).
 * @returns {string}  zero or more complete newline-terminated lines, or ''.
 */
function renderWedgeReports(report) {
  if (!report || typeof report !== 'object') return '';
  const list = (v) => (Array.isArray(v) ? v : []);
  const clean = (v, fallback) => stripCtl(String(v == null ? fallback : v));
  const plural = (n) => (n === 1 ? '' : 's');
  const overflow = (n) => (n > WEDGE_RENDER_CAP ? `      … and ${n - WEDGE_RENDER_CAP} more\n` : '');
  const depsOf = (e) => list(e && e.deps).map((d) => stripCtl(String(d))).join(', ') || 'none recorded';
  const bounded = (s) => (s.length > WEDGE_MESSAGE_CAP ? `${s.slice(0, WEDGE_MESSAGE_CAP)}…` : s);

  let out = '';

  // 1. THE FAULT — the safety check that did not run. `report.quarantined` says "these
  // tasks are waiting" (normal, self-clearing); this says "the check that decides who
  // waits did not run" (abnormal, recurring, and the wait was a precaution, not a
  // decision). Without this line a human sees held tasks and reasonably concludes the
  // system is working as designed. One line, not a list: the field is a single object
  // describing one incident, and the dropped ids are named in the held block directly
  // below — repeating them here would imply two separate problems.
  const fault = report.quarantineFaulted;
  if (fault && typeof fault === 'object') {
    const phase = clean(fault.phase, 'unknown');
    const held = list(fault.dropped).length;
    const error = bounded(clean(fault.error, 'no message recorded'));
    out += `  ⛔ the concurrent-edit safety check FAILED to run (${phase}) — ${held} task${plural(held)} ` +
      `held as a blanket precaution, not by a decision: ${error} · view: tasks\n`;
  }

  // 2. HELD — the candidates the concurrent-edit guard excluded from promote this pass.
  // The guard writes two distinct reasons — `staleness-orphan-quarantine` (a real
  // decision) and `quarantine-fault` (the check could not decide) — and its own summary
  // text already distinguishes them, so the summary is rendered rather than re-worded.
  const held = list(report.quarantined);
  if (held.length > 0) {
    const n = held.length;
    out += `  ⊙ ${n} task${plural(n)} held this pass — files reserved by an agent that was never ` +
      `confirmed dead · view: tasks\n`;
    for (const e of held.slice(0, WEDGE_RENDER_CAP)) {
      const why = bounded(clean(e && (e.summary == null ? e.reason : e.summary), 'held'));
      out += `      ${clean(e && e.id, 'unknown')} — ${why}\n`;
    }
    out += overflow(n);
  }

  // 3. WEDGED — the scheduler already failed these; they can never run as things stand.
  const wedged = list(report.unsatisfiable);
  if (wedged.length > 0) {
    const n = wedged.length;
    out += `  ⛔ ${n} task${plural(n)} can NEVER run — the scheduler failed ${n === 1 ? 'it' : 'them'} · view: tasks\n`;
    for (const e of wedged.slice(0, WEDGE_RENDER_CAP)) {
      const known = WEDGE_REASONS[e && e.reason];
      const marker = known && known.permanent ? '⛔ PERMANENT — ' : '⚠ ';
      const reason = known ? known.text : clean(e && e.reason, 'no reason recorded');
      out += `      ${marker}${clean(e && e.id, 'unknown')} — ${reason} · depends on: ${depsOf(e)}\n`;
    }
    out += overflow(n);
  }

  // 4. DEFERRED — left queued one pass because every dead dependency was orphaned on age
  // alone and may still finish. Not failed; re-evaluated next pass.
  const deferred = list(report.deferred);
  if (deferred.length > 0) {
    const n = deferred.length;
    out += `  ⊙ ${n} task${plural(n)} held one pass — every dead dependency was orphaned on age alone ` +
      `and may still finish · view: tasks\n`;
    for (const e of deferred.slice(0, WEDGE_RENDER_CAP)) {
      out += `      ${clean(e && e.id, 'unknown')} — waiting on: ${depsOf(e)}\n`;
    }
    out += overflow(n);
  }

  // 5. ORPHANED ON AGE ALONE — the agent was never confirmed dead. `ageMs` is null when the
  // start time could not be parsed (task-reconcile records null there deliberately), so it
  // renders `unknown`, never NaN.
  const aged = list(report.stalenessOrphaned);
  if (aged.length > 0) {
    const n = aged.length;
    out += `  ⚠ ${n} task${plural(n)} orphaned on age alone — the agent was never confirmed dead ` +
      `and may still be alive · view: tasks\n`;
    for (const e of aged.slice(0, WEDGE_RENDER_CAP)) {
      const mins = Number.isFinite(e && e.ageMs) ? Math.round(e.ageMs / 60000) : 'unknown';
      const floor = Number.isFinite(e && e.thresholdMs) ? Math.round(e.thresholdMs / 60000) : 'unknown';
      out += `      ${clean(e && e.id, 'unknown')} (${clean(e && e.kind, 'unknown')}) — ` +
        `${mins} min old, the floor for this kind is ${floor} min\n`;
    }
    out += overflow(n);
  }

  return out;
}

/**
 * Build the dashboard table text
 * @param {string} projectPath
 * @returns {string} Dashboard table
 */
function buildDashboardTable(projectPath, opts = {}) {
  const root = getProjectPath(projectPath);
  const counts = getPlanCounts(root);
  const visionCounts = getVisionCounts(root);
  const agent = getAgentStatus(root);
  const version = getVersion(root);
  const prefs = loadDashboardPrefs(root);

  // Per-stage count lookup. Sections.js stages are canonical strings.
  const stageCount = (stage) => {
    switch (stage) {
      case 'vision':       return visionCounts.total;
      case 'canvas':       return counts.canvas || 0;
      case 'functional':   return counts.functional;
      case 'implementation': return counts.implementation;
      case 'todo':         return counts.todo;
      case 'in-progress':  return counts.inProgress;
      case 'review':       return counts.review;
      case 'done':         return counts.done || 0;
      default:             return 0;
    }
  };

  let out = '';
  out += `CTOC v${version}\n`;
  out += renderRootDisclosure(root);
  out += `${'─'.repeat(60)}\n\n`;

  // Render 3 sections (A2 / v7) — Business / Implementation / Execution.
  // Per I4: JSON mode is sectioned; TUI overview.js still renders the flat
  // table until A3 lands and the menu is fully restructured.
  for (const section of Object.keys(SECTIONS)) {
    const stages = getStagesInSection(section);
    const sectionTotal = stages.reduce((sum, s) => sum + stageCount(s), 0);
    const collapsed = prefs.collapsed[section];
    const chevron = collapsed ? '▶' : '▼';
    out += `${chevron} ${getSectionLabel(section)} (${sectionTotal})\n`;
    if (!collapsed) {
      for (const stage of stages) {
        const c = stageCount(stage);
        const label = stage.charAt(0).toUpperCase() + stage.slice(1).replace(/-/g, ' ');
        out += `    ${label.padEnd(14)} ${c}\n`;
      }
    }
    out += '\n';
  }

  // NB2: TASKS section — background-task run/queue/done counts. Rendered BEFORE
  // the INBOX block (order: sections → TASKS → INBOX → AGENT, per the vision mock).
  // Fail-open: a corrupt/absent registry loads as empty → renderTasksSection === ''
  // → ZERO added output, so the dashboard is byte-for-byte unchanged for a project
  // with no background tasks (protects every dashboard substring/count regression).
  // NB4/H8: reconcile the registry against the live harness TaskList BEFORE rendering,
  // so a session-restart orphan (a `running` task with no live agent) stops blocking
  // the ≤5 concurrency count and is offered for re-run — WITHOUT falsely orphaning a
  // genuinely-live long-running agent. The live agent-id list now flows in from the
  // caller as `opts.liveAgentIds` (start.js parses it from the `--live-agent-ids <csv>`
  // argv flag the parent session appends on each on-open render). When it is absent
  // (`undefined`/`null` — a true session restart or the TUI child with no Task access),
  // reconcile falls back to the staleness backstop, exactly as before. Fail-open but NOT
  // SILENT: any reconcile failure still falls back to the plain load so the dashboard
  // always renders, AND the reason is now kept and rendered by renderReconcileHealth. The
  // pass is no longer treated as purely best-effort — not bricking and not saying anything
  // are different instructions.
  // The pass's report is now kept WHOLE, not reduced to the orphan count: its four wedge
  // fields (unsatisfiable / deferred / stalenessOrphaned / quarantineFaulted) are rendered
  // by renderWedgeReports below. They were computed on every open and discarded before.
  let orphanedCount = 0;
  /** The WHOLE report — not one number. See renderWedgeReports for why. @type {object|null} */
  let reconcileReport = null;
  /** The captured failure message — NOT discarded. See renderReconcileHealth. @type {string|null} */
  let reconcileThrew = null;
  try {
    const { report } = taskReconcile.reconcileState(root, { liveAgentIds: opts.liveAgentIds });
    reconcileReport = report || null;
    orphanedCount = (report && Array.isArray(report.orphaned)) ? report.orphaned.length : 0;
  } catch (err) {
    // NOT swallowed. A reconcile failure must not BRICK the dashboard — it must also not be
    // INVISIBLE. Rendering the registry as though the pass succeeded presents stale state as
    // live, which is the more dangerous of the two failures: a blank section prompts a
    // question, a confident wrong section does not. The dashboard still renders; only the
    // reason is kept, and renderReconcileHealth puts it on screen.
    reconcileThrew = (err && err.message) ? String(err.message) : String(err);
  }
  let taskReg;
  try { taskReg = taskRegistry.load(root); } catch { taskReg = taskRegistry.emptyRegistry(); }
  let tasksBlock = '';
  try { tasksBlock = taskView.renderTasksSection(taskReg); } catch { tasksBlock = ''; }
  if (tasksBlock) out += tasksBlock + '\n';
  // TRUSTWORTHINESS BEFORE FINDINGS. A human who reads the counts without knowing the check
  // never ran, ran against an empty view, or could not persist what it decided has been
  // actively MISLED, not merely under-informed. So this leads every FINDING: above the
  // orphan line and above every wedge line, asserted by the tests rather than left to
  // convention. It sits INSIDE the TASKS section, directly beneath the counts it qualifies —
  // which is why each line says "the task counts ABOVE"; detaching it to sit above the
  // section header would leave a bare ⛔ line belonging to nothing.
  out += renderReconcileHealth(reconcileThrew, reconcileReport);
  // NB4: surface newly-orphaned tasks on the existing TASKS line as a re-run offer.
  // Re-run is routed through the scheduler (canRun/nextRunnable) by the menu driver,
  // never a direct launch (start.md Two-Plane Protocol). No new screen (D-NB4-5).
  if (orphanedCount > 0) {
    out += `  ⚠ ${orphanedCount} task${orphanedCount === 1 ? '' : 's'} orphaned — offer re-run\n`;
  }
  // The four wedge reports the reconcile pass computes on EVERY open finally have a READER.
  // Before this, a task the scheduler had already failed for a permanent dependency cycle
  // was indistinguishable on screen from an ordinary one-off failure, and a concurrent-edit
  // guard that never ran looked exactly like one that ran and decided to hold. Returns ''
  // for a clean project, so a project with no wedges renders byte-identically.
  out += renderWedgeReports(reconcileReport);

  // Inbox (A3 — async-overnight surface; SP2 adds the possibly-stale stream)
  const inbox = getInboxCounts(root);
  const stale = inbox.staleCandidates || 0;
  const escalations = inbox.escalations || 0;
  // R3-D: the deploy-ready log finally has a READER (a claim without a reader is a
  // lie). Counted into the inbox total so a deploy-ready plan cannot sit invisible
  // behind "Inbox clear"; zero notices add zero output (no dashboard regression).
  const deployReady = readDeployReady(root).length;
  // Z1: plans the gate sweep REPORTED instead of reverting (this project's approval
  // provenance was never migrated). Counted in so the notice cannot sit invisible
  // behind "Inbox clear"; zero pending adds zero output, so the dashboard renders
  // byte-identically for a migrated or clean project.
  const migrationPending = gateMigration.readPendingNotice(root).length;
  const inboxTotal = inbox.questions + inbox.decisions + inbox.gatesWaiting + stale + escalations
    + deployReady + migrationPending;
  // NB2: completed background work slots into the inbox as a pull notice (D3).
  let bgLine = '';
  try { bgLine = taskView.tasksInboxLine(taskReg); } catch { bgLine = ''; }
  out += `INBOX\n`;
  // "Inbox clear" only when BOTH the async items AND the background line are empty —
  // otherwise done tasks would print both "Inbox clear" and the bg line.
  if (inboxTotal === 0 && !bgLine) {
    out += `  ○ Inbox clear — no async items waiting\n`;
  } else {
    if (inboxTotal > 0) {
      // W1: each count names its door route (a count with no door is the defect).
      // The hint is appended AFTER the existing line text and only when the count
      // is > 0, so no existing substring assertion regresses and a 0-line shows no
      // (dead) door hint.
      out += `  ⊙ ${inbox.questions} morning question${inbox.questions === 1 ? '' : 's'}${inbox.questions > 0 ? ' · view: inbox questions' : ''}\n`;
      if (escalations > 0) {
        // R3-D: the most urgent signal in the system now NAMES ITS DOOR. It was the
        // one count rendered with no route — the exact "a count with no door is the
        // defect" bug W1 closed for the other three.
        out += `  ⛔ ${escalations} circuit-breaker escalation${escalations === 1 ? '' : 's'} — a plan keeps failing and needs you · view: inbox escalations\n`;
      }
      if (deployReady > 0) {
        out += `  ⊙ ${deployReady} plan${deployReady === 1 ? '' : 's'} waiting to be deployed — deploying is a separate decision, and it is still yours · view: inbox escalations\n`;
      }
      if (migrationPending > 0) {
        out += `  ⛔ ${migrationPending} plan${migrationPending === 1 ? '' : 's'} would be reverted — approval ledger not migrated · view: inbox migration\n`;
      }
      out += `  ⊙ ${inbox.decisions} decision${inbox.decisions === 1 ? '' : 's'} awaiting review${inbox.decisions > 0 ? ' · view: inbox decisions' : ''}\n`;
      out += `  ⊙ ${inbox.gatesWaiting} plan${inbox.gatesWaiting === 1 ? '' : 's'} at gates${inbox.gatesWaiting > 0 ? ' · view: inbox gates' : ''}\n`;
      // SP2: conditional — present iff > 0 (M2), absent when 0 (M3). "possibly-stale"
      // (not "stale") sets correct expectations: cheap detection is unverified (SP3).
      if (stale > 0) {
        out += `  ⊙ ${stale} possibly-stale plan${stale === 1 ? '' : 's'}\n`;
      }
    }
    if (bgLine) out += bgLine;
  }
  out += '\n';

  // Agent status (lock-aware)
  const isAgentActive = agent.active;
  out += `AGENT\n`;
  if (isAgentActive) {
    out += `  ● Active: ${agent.plan || 'unknown'}`;
    if (agent.pid) out += ` (PID ${agent.pid})`;
    out += '\n';
  } else if (agent.stale) {
    out += `  ⚠ Stale lock: ${agent.stalePlan || 'unknown'} (process died)\n`;
  } else {
    out += `  ○ Idle\n`;
  }

  return out;
}

/**
 * Dashboard Menu A (Pipeline) — v7
 *
 * Shows the 3 task-aligned sections (Business / Implementation / Execution)
 * plus More. Labels are STABLE — counts moved to descriptions so the option
 * labels don't shift as plans move between stages.
 *
 * Section selection → `section {name}` drills into the stages within.
 */
function dashboardPipeline(projectPath, opts = {}) {
  const root = getProjectPath(projectPath);
  const counts = getPlanCounts(root);
  const visionCounts = getVisionCounts(root);

  const businessTotal = visionCounts.total + (counts.canvas || 0) + counts.functional;
  const implTotal     = counts.implementation + counts.todo;
  const execTotal     = counts.inProgress + counts.review + (counts.done || 0);

  // H8: forward the live-agent ids into the reconcile the dashboard table runs.
  const text = buildDashboardTable(root, opts) + '\n\n\n';

  const options = [
    {
      label: 'Business',
      description: `Vision · Canvas · Functional  (${businessTotal} total — ${visionCounts.total} vision, ${counts.canvas || 0} canvas, ${counts.functional} functional)`
    },
    {
      label: 'Implementation',
      description: `Implementation · Todo  (${implTotal} total — ${counts.implementation} impl, ${counts.todo} todo)`
    },
    {
      label: 'Execution',
      description: `In-Progress · Review · Done  (${execTotal} total — ${counts.inProgress} in-progress, ${counts.review} review, ${counts.done || 0} done)`
    },
    { label: 'More ▶', description: 'Vision pipeline, start agent, sync plans, system' }
  ];

  // SP2: cheap stale count (memoized → cache hit after buildDashboardTable above).
  const stale = (getInboxCounts(root).staleCandidates) || 0;

  const questions = [{
    question: 'Select a section to drill into:',
    header: 'Pipeline',
    options
  }];
  const actions = {
    'Business': 'section business',
    'Implementation': 'section implementation',
    'Execution': 'section execution',
    'More ▶': 'menu commands'
  };

  // SP2 ride-along: a SECOND question, only when there is something to show (M3).
  // Navigation is by label only — NEVER a digit (menu discipline Rule 1/9).
  if (stale > 0) {
    questions.push({
      question: `${stale} possibly-stale plan${stale === 1 ? '' : 's'} detected — view them?`,
      header: 'Stale plans',
      options: [
        { label: 'View stale plans', description: `Inspect the ${stale} possibly-stale plan${stale === 1 ? '' : 's'} (read-only)` },
        // R2-C2 item 5: a DURABLE dismissal (staleDetector.dismissStale) — offered
        // AFTER 'View stale plans', never recommended. "Not now" stays a one-turn
        // skip (no write); "Don't ask again for these" persists across turns. The
        // menu render stays read-only — the write happens only when the human picks
        // this option and the session executes the claude:dismiss-stale recipe.
        { label: "Don't ask again for these", description: 'Durably dismiss the current possibly-stale set (a changed plan re-surfaces)' },
        { label: 'Not now', description: 'Dismiss for this menu turn' },
      ],
    });
    actions['View stale plans'] = 'inbox stale';           // label key only — NEVER a digit
    actions["Don't ask again for these"] = 'claude:dismiss-stale';
    actions['Not now'] = '';                                // no-op (driver falls through to pipeline answer)
  }

  return { text, ask: { questions }, actions };
}

/**
 * Section browse — drill-in for the 3 v7 sections.
 *
 * @param {string} sectionName - 'business' | 'implementation' | 'execution'
 * @param {string} [projectPath]
 */
function sectionBrowse(sectionName, projectPath) {
  const root = getProjectPath(projectPath);
  const counts = getPlanCounts(root);
  const visionCounts = getVisionCounts(root);

  const SECTION_STAGES = {
    business:       ['vision', 'canvas', 'functional'],
    implementation: ['implementation', 'todo'],
    execution:      ['in-progress', 'review', 'done'],
  };
  const SECTION_LABEL = {
    business: 'Business',
    implementation: 'Implementation',
    execution: 'Execution',
  };

  const stages = SECTION_STAGES[sectionName];
  if (!stages) {
    return {
      text: `Unknown section: ${sectionName}\n\n\n`,
      ask: {
        questions: [{
          question: 'Return to dashboard?',
          header: 'Error',
          options: [{ label: 'Back', description: 'Return to dashboard' }],
        }],
      },
      actions: { Back: '' },
    };
  }

  function stageCount(stage) {
    switch (stage) {
      case 'vision':         return visionCounts.total;
      case 'canvas':         return counts.canvas || 0;
      case 'functional':     return counts.functional;
      case 'implementation': return counts.implementation;
      case 'todo':           return counts.todo;
      case 'in-progress':    return counts.inProgress;
      case 'review':         return counts.review;
      case 'done':           return counts.done || 0;
      default:               return 0;
    }
  }

  let text = `${SECTION_LABEL[sectionName]} section\n${'─'.repeat(40)}\n\n`;
  for (const stage of stages) {
    const n = stageCount(stage);
    const label = stage.charAt(0).toUpperCase() + stage.slice(1).replace(/-/g, ' ');
    text += `  ${label.padEnd(14)} ${n}\n`;
  }
  text += '\n\n\n';

  // Build options — one per stage in the section, plus Back.
  const options = stages.map(stage => {
    const n = stageCount(stage);
    const label = stage.charAt(0).toUpperCase() + stage.slice(1).replace(/-/g, ' ');
    const description = stage === 'vision'
      ? `Enter Vision Mode — create, edit, or decompose visions (${n} active)`
      : `Browse ${label} stage (${n} plans)`;
    return { label, description };
  });
  // AskUserQuestion caps at 4 options. business has 3 stages, exec has 3, impl has 2 — all fit with Back.
  options.push({ label: '◀ Back', description: 'Return to pipeline view' });

  const actions = {};
  for (const stage of stages) {
    const label = stage.charAt(0).toUpperCase() + stage.slice(1).replace(/-/g, ' ');
    // Vision is not a plan-file stage — it is a separate pipeline handled by
    // Vision Mode (create / edit / decompose). `browse vision` has no
    // STAGE_FOLDERS entry and dead-ends on "Unknown stage". Route to Vision Mode.
    actions[label] = stage === 'vision' ? 'claude:vision' : `browse ${stage}`;
  }
  actions['◀ Back'] = '';

  return {
    text,
    ask: {
      questions: [{
        question: `Select a stage in ${SECTION_LABEL[sectionName]}:`,
        header: SECTION_LABEL[sectionName],
        options,
      }],
    },
    actions,
  };
}

// ===========================================================================
// W1 — Inbox doors. Every dashboard inbox COUNT (morning questions, decisions
// awaiting review, plans at gates) gets a reachable read-only list screen. "A
// count with no door is the defect." All three are PURE reads (no fs mutation),
// bullet-row rendered (numbers are reserved for opening a plan — these open
// nothing), capped at INBOX_DOOR_MAX_ROWS with a "… and N more" line, and every
// attacker-influenceable field (a plan slug / step / path derived from a
// filename or frontmatter) passes through stripCtl so a hostile value cannot
// inject ANSI/control chars or forge a row (S1).
// ===========================================================================

/** Cold-path row cap for the inbox door screens (mirrors the stale drill-in). */
const INBOX_DOOR_MAX_ROWS = 20;

/**
 * A compact best-effort relative age from an ISO timestamp. Returns '' for a
 * missing/unparseable/future value (never throws) so a malformed frontmatter
 * `created` degrades to no age rather than a crash.
 * @param {string} iso
 * @returns {string}
 */
function _inboxAge(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  if (diff < 0) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Project-relative body path for an inbox item (stripCtl'd, never throws). */
function _inboxRelPath(root, p) {
  if (typeof p !== 'string' || p.length === 0) return '';
  try { return stripCtl(path.relative(root, p)); } catch { return ''; }
}

/**
 * Shared renderer for the three read-only inbox door screens. `rows` is already
 * a list of pre-sanitized single-line strings (no leading bullet).
 * @param {string} title  screen title (e.g. 'Morning questions')
 * @param {number} total  the TRUE item count (header shows this, not the capped count)
 * @param {string[]} rows sanitized row bodies (no bullet prefix)
 * @param {string} emptyMsg message shown when total === 0
 * @returns {{text:string, ask:Object, actions:Object}}
 */
function _inboxDoorScreen(title, total, rows, emptyMsg) {
  let text = `Inbox ▸ ${title} (${total})\n${'─'.repeat(40)}\n\n`;
  if (total === 0) {
    text += `  ${emptyMsg}\n`;
  } else {
    for (const r of rows.slice(0, INBOX_DOOR_MAX_ROWS)) text += `  • ${r}\n`;
    if (total > INBOX_DOOR_MAX_ROWS) text += `  … and ${total - INBOX_DOOR_MAX_ROWS} more\n`;
  }
  text += '\n\n\n';
  return {
    text,
    ask: {
      questions: [{
        question: `${title} (read-only).`,
        header: 'Inbox',
        options: [{ label: '◀ Back', description: 'Return to dashboard' }],
      }],
    },
    actions: { '◀ Back': '' },
  };
}

/**
 * Inbox ▸ Morning questions — the door behind the dashboard "N morning questions"
 * count (route `inbox questions`). Read-only.
 * @param {string} [projectPath]
 */
function inboxQuestionsScreen(projectPath) {
  const root = getProjectPath(projectPath);
  const items = listQuestions(root);
  const rows = items.map((it) => {
    const who = stripCtl(it.source_plan || it.id || '(question)');
    const step = it.source_step ? ` [step ${stripCtl(String(it.source_step))}]` : '';
    const age = stripCtl(_inboxAge(it.created));
    const where = _inboxRelPath(root, it.path);
    return `${who}${step}${age ? '  ' + age : ''}${where ? '  ' + where : ''}`;
  });
  return _inboxDoorScreen('Morning questions', items.length, rows, 'No morning questions.');
}

/**
 * Inbox ▸ Decisions awaiting review — the door behind the dashboard "N decisions
 * awaiting review" count (route `inbox decisions`). Read-only.
 * @param {string} [projectPath]
 */
function inboxDecisionsScreen(projectPath) {
  const root = getProjectPath(projectPath);
  const items = listDecisions(root);
  const rows = items.map((it) => {
    const who = stripCtl(it.plan || it.id || '(decision)');
    const step = it.step ? ` [step ${stripCtl(String(it.step))}]` : '';
    const amb = it.ambiguity ? `  ${stripCtl(String(it.ambiguity))}` : '';
    const age = stripCtl(_inboxAge(it.created));
    const where = _inboxRelPath(root, it.path);
    return `${who}${step}${amb}${age ? '  ' + age : ''}${where ? '  ' + where : ''}`;
  });
  return _inboxDoorScreen('Decisions awaiting review', items.length, rows, 'No decisions awaiting review.');
}

/**
 * Read the deploy-ready notices written by `actions.recordDeployReadyNotice` when a
 * human calls a plan finished (review → done, Gate 3 in the pipeline's own terms).
 * Calling work finished does NOT imply shipping it: deploying is a second, separate
 * human decision, so the pipeline records a notice instead of deploying.
 *
 * The number in this comment is fine — comments are exempt. What the human READS is
 * not: see the rendered line below, which says the moment in plain words.
 *
 * R3-D: that writer claimed "the menu/inbox surface reads this log" and NO reader
 * existed — a claim with no reader is a lie. This is the reader. Fail-open: a
 * missing or corrupt log is zero notices, never a crash.
 *
 * @param {string} root
 * @returns {Array<{plan:string, at:string, message:string}>}
 */
function readDeployReady(root) {
  try {
    const file = path.join(root, '.ctoc', 'logs', 'deploy-ready.json');
    if (!safeFs.existsSync(file)) return [];
    const parsed = JSON.parse(safeFs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e === 'object') : [];
  } catch {
    return [];
  }
}

/**
 * Inbox ▸ Escalations & deploy-ready — the door behind the dashboard's
 * "⛔ N circuit-breaker escalations" count (route `inbox escalations`), and the
 * reader for the deploy-ready notices.
 *
 * R3-D: the escalation count is the MOST URGENT signal in the system — a plan that
 * keeps failing and needs a human — and it was rendered with NO route to open it.
 * Same "a count with no door is the defect" bug W1 fixed for the other three counts.
 * Read-only: this screen opens nothing and crosses nothing; every attacker-
 * influenceable field (a plan slug or step out of the log) passes through stripCtl.
 *
 * @param {string} [projectPath]
 */
function inboxEscalationsScreen(projectPath) {
  const root = getProjectPath(projectPath);

  let escalations = [];
  try {
    const { listEscalations } = require('./inbox');
    escalations = listEscalations(root) || [];
  } catch {
    escalations = []; // fail-open: the door still opens
  }
  const deploys = readDeployReady(root);

  const total = escalations.length + deploys.length;
  let text = `Inbox ▸ Escalations & deploy-ready (${total})\n${'─'.repeat(40)}\n\n`;

  if (escalations.length === 0) {
    text += '  No circuit-breaker escalations.\n';
  } else {
    text += `  Circuit-breaker escalations (${escalations.length}) — a plan keeps failing and needs you\n`;
    for (const e of escalations.slice(0, INBOX_DOOR_MAX_ROWS)) {
      const plan = stripCtl(String(e.plan || '(unknown plan)'));
      const detail = e.type === 'same-step'
        ? `Step ${stripCtl(String(e.step))} kicked back ${stripCtl(String(e.count))}× (max 3)`
        : `${stripCtl(String(e.total))} kickbacks total (max 5)`;
      const age = stripCtl(_inboxAge(e.at));
      text += `  • ${plan}  ${detail}${age ? '  ' + age : ''}\n`;
    }
    if (escalations.length > INBOX_DOOR_MAX_ROWS) {
      text += `  … and ${escalations.length - INBOX_DOOR_MAX_ROWS} more\n`;
    }
  }

  if (deploys.length > 0) {
    text += `\n  Waiting to be deployed (${deploys.length}) — you called these finished. `
      + 'Deploying them is a separate decision, and it is still yours.\n';
    for (const d of deploys.slice(0, INBOX_DOOR_MAX_ROWS)) {
      const plan = stripCtl(String(d.plan || '(unknown plan)'));
      const age = stripCtl(_inboxAge(d.at));
      text += `  • ${plan}${age ? '  ' + age : ''}\n`;
    }
    if (deploys.length > INBOX_DOOR_MAX_ROWS) {
      text += `  … and ${deploys.length - INBOX_DOOR_MAX_ROWS} more\n`;
    }
  }
  text += '\n\n\n';

  return {
    text,
    ask: {
      questions: [{
        question: 'Escalations & deploy-ready notices (read-only).',
        header: 'Inbox',
        options: [{ label: '◀ Back', description: 'Return to dashboard' }],
      }],
    },
    actions: { '◀ Back': '' },
  };
}

/**
 * Inbox ▸ Approval-ledger migration — the door behind the dashboard's
 * "⛔ N plans would be reverted" count (route `inbox migration`).
 *
 * Z1: these plans sit in a gate-destination folder with NO recorded approval
 * provenance, which is the ordinary condition of every project that predates the
 * approval ledger. CTOC is deliberately NOT moving them: the residency sweep runs on
 * every tool call, and reverting them would rewrite the human's whole plan archive on
 * their first tool call after an update. Enforcement stays fully active for every
 * OTHER violation kind (a tampered hash, a forged provenance, a corrupt record) —
 * those still revert, on every project, migrated or not.
 *
 * Read-only: this screen opens nothing and crosses nothing. Every attacker-
 * influenceable field (a plan basename or reason off the notice) passes through
 * `stripCtl`, exactly as `inboxEscalationsScreen` does.
 *
 * @param {string} [projectPath]
 * @returns {{text:string, ask:Object, actions:Object}}
 */
function inboxMigrationScreen(projectPath) {
  const root = getProjectPath(projectPath);
  const pending = gateMigration.readPendingNotice(root);

  let text = `Inbox ▸ Approval-ledger migration (${pending.length})\n${'─'.repeat(40)}\n\n`;

  if (pending.length === 0) {
    text += '  Nothing pending — this project\'s approval provenance is recorded.\n';
  } else {
    text += '  These plans reside in a gate destination with no recorded approval\n';
    text += '  provenance. CTOC is NOT moving them. Enforcement is fully active for\n';
    text += '  every other violation kind (tampered, forged, or corrupt provenance\n';
    text += '  still reverts).\n\n';
    for (const e of pending.slice(0, INBOX_DOOR_MAX_ROWS)) {
      const plan = stripCtl(String(e.plan || '(unknown plan)'));
      const folder = stripCtl(String(e.folder || '?'));
      const age = stripCtl(_inboxAge(e.at));
      text += `  • ${folder}/${plan}${age ? '  ' + age : ''}\n`;
    }
    if (pending.length > INBOX_DOOR_MAX_ROWS) {
      text += `  … and ${pending.length - INBOX_DOOR_MAX_ROWS} more\n`;
    }
    text += '\n  Two ways forward:\n';
    text += '  1) Record provenance for each plan, one at a time:\n';
    text += '     node src/scripts/ledger-backfill.js --plan plans/done/<x>.md --stage done --reason "<why>"\n';
    text += `  2) Then mark the project migrated (this ARMS the revert from now on):\n`;
    text += `     ${gateMigration.MIGRATION_COMMAND}\n`;
  }
  text += '\n\n\n';

  return {
    text,
    ask: {
      questions: [{
        question: 'Approval-ledger migration (read-only).',
        header: 'Inbox',
        options: [{ label: '◀ Back', description: 'Return to dashboard' }],
      }],
    },
    actions: { '◀ Back': '' },
  };
}

/**
 * Inbox ▸ Plans at gates — the door behind the dashboard "N plans at gates" count
 * (route `inbox gates`). Lists plans sitting in a gate-SOURCE stage (awaiting the
 * human's approval decision). Read-only — crossing a gate stays a separate,
 * human-initiated action; this screen only shows what is waiting.
 * @param {string} [projectPath]
 */
function inboxGatesScreen(projectPath) {
  const root = getProjectPath(projectPath);
  const items = listPlansAtGates(root);
  const rows = items.map((it) => {
    const plan = stripCtl(it.plan);
    const stage = stripCtl(it.stage);
    // Say the DECISION the plan awaits, not the gate number: gate-words maps the
    // stage to the compact human label ("Finished?", "Build it?"). The number was an
    // internal code the reader cannot decode.
    return `${plan}  [${stage}]  ${gateWords.chip(it.stage)}  plans/${stage}/${plan}.md`;
  });
  return _inboxDoorScreen('Plans at gates', items.length, rows, 'No plans at gates.');
}

/**
 * SP2 drill-in: read-only list of possibly-stale candidates. No file op, no plan
 * move, no inputMode. The only selectable option is ◀ Back. "Verify (SP3)" is
 * affordance TEXT only — SP3 wires the verification.
 * @param {string} [projectPath]
 * @returns {{text:string, ask:Object, actions:Object}}
 */
function inboxStalePlansDrillIn(projectPath) {
  const root = getProjectPath(projectPath);
  const candidates = listStaleCandidates(root); // cold path; one fresh scan

  // S4: cap the cold-path list so a huge candidate set can't flood the screen
  // (matches the areas/inbox.js convention). Render at most the first MAX rows;
  // surplus is summarized on one trailing "… and N more" line.
  const MAX_ROWS = 20;

  let text = `Inbox ▸ Possibly-stale plans (${candidates.length})\n`;
  text += `${'─'.repeat(40)}\n\n`;
  if (candidates.length === 0) {
    text += '  No possibly-stale plans.\n';
  } else {
    // Bullet rows, NOT "1." — numbers are reserved for opening a plan (Rule 1/9).
    // This screen opens nothing, so it shows no numbers and exposes no numeric key.
    // S1: every attacker-influenceable field (slug, stage, each signal) is passed
    // through stripCtl so a hostile filename cannot inject ANSI/control chars.
    for (const cand of candidates.slice(0, MAX_ROWS)) {
      const label = cand.actionable ? 'actionable' : 'advisory';
      const plan = stripCtl(cand.plan);
      const stage = stripCtl(cand.stage);
      const signals = (cand.signals || []).map(stripCtl).join(', ');
      text += `  • ${plan}  [${stage}]  signals: ${signals}  — ${label}\n`;
    }
    if (candidates.length > MAX_ROWS) {
      text += `  … and ${candidates.length - MAX_ROWS} more\n`;
    }
    text += '\n  Select "Verify" to run git-backed verification (read-only).\n';
  }
  text += '\n\n\n';

  // 'Verify' is a real selectable LABEL (never a digit — Rule 1), offered only
  // when there is something to verify. An empty list shows just '◀ Back'.
  // R2-C2 item 5: a DURABLE "Don't ask again for these" (dismissStale) rides AFTER
  // 'Verify', before Back — never recommended. This render stays read-only; the
  // write happens only when the human picks the claude:dismiss-stale action.
  const hasCandidates = candidates.length > 0;
  const options = hasCandidates
    ? [
        { label: 'Verify', description: 'Run git-backed verification (read-only) and view proposals' },
        { label: "Don't ask again for these", description: 'Durably dismiss these possibly-stale plans (a changed plan re-surfaces)' },
        { label: '◀ Back', description: 'Return to dashboard' },
      ]
    : [{ label: '◀ Back', description: 'Return to dashboard' }];
  const actions = hasCandidates
    ? { Verify: 'inbox verify', "Don't ask again for these": 'claude:dismiss-stale', '◀ Back': '' }
    : { '◀ Back': '' };

  return {
    text,
    ask: {
      questions: [{
        question: 'Possibly-stale plans (read-only).',
        header: 'Stale plans',
        options,
      }],
    },
    actions,
  };
}

/**
 * Inbox ▸ Verified proposals — cold-path, read-only screen. The SOLE call site of
 * verifyStaleCandidate (never the hot path). Runs git-backed verification + the
 * pure classifier per candidate and renders proposals grouped by category. The
 * full-history slug scan is hoisted to ONE shared read via slugHistoryCache.
 * No write, no plan move, no gate crossing — proposals are display-only (SP4
 * executes).
 * @param {string} projectPath
 */
function inboxVerifyProposals(projectPath) {
  const root = getProjectPath(projectPath);
  const candidates = listStaleCandidates(root); // cold path; one fresh scan
  const slugHistoryCache = {}; // shared across all candidates (single git log read)
  const MAX_ROWS = 20; // matches inboxStalePlansDrillIn S4 cap

  // Fan-out cap (S4): cap the WORK before doing it. Each verify is ≥1 git spawn
  // (+1 per declared file, serial, 5s timeout each); verifying ALL candidates
  // before the display slice lets N plans × M files grind for minutes with no
  // feedback. Slice to the display cap FIRST, verify only those. The "… and N
  // more" line below is driven by the TRUE total (candidates.length) so the count
  // stays honest ("showing 20 of N").
  const toVerify = candidates.slice(0, MAX_ROWS);
  const proposals = toVerify.map((cand) => {
    // Per-row degrade (defense-in-depth layer B): one malformed candidate must
    // never crash the whole screen. If verify/classify throws (e.g. a candidate
    // that slipped past the cheap-scan guard with an empty plan slug), degrade
    // THAT row to an inconclusive proposal and keep rendering the siblings.
    try {
      const evidence = staleDetector.verifyStaleCandidate(cand, root, { slugHistoryCache });
      return staleDetector.classifyStaleCandidate(cand, evidence);
    } catch {
      return {
        plan: stripCtl((cand && cand.plan) || '(unknown)'),
        category: 'inconclusive',
        proposedAction: null,
        evidence: ['verification error — skipped'],
      };
    }
  });

  const ORDER = ['shipped-but-early', 'approved-but-stranded', 'dead-on-arrival', 'inconclusive'];

  let text = `Inbox ▸ Verified proposals (${proposals.length})\n`;
  text += `${'─'.repeat(40)}\n`;
  if (proposals.length === 0) {
    text += '\n  No proposals.\n';
  } else {
    let rows = 0;
    let truncated = 0;
    for (const cat of ORDER) {
      const group = proposals.filter((p) => p.category === cat);
      if (group.length === 0) continue;
      if (rows < MAX_ROWS) {
        text += `\n${stripCtl(cat)} (${group.length})\n`;
      }
      for (const p of group) {
        if (rows >= MAX_ROWS) {
          truncated++;
          continue;
        }
        // Every attacker-influenceable field passes through stripCtl.
        const plan = stripCtl(p.plan);
        const action = stripCtl(p.proposedAction || 'none');
        const ev = (p.evidence || []).map(stripCtl).join('; ');
        text += `  • ${plan} → ${action}  (${ev})\n`;
        rows++;
      }
    }
    // True remaining = un-verified surplus (candidates beyond the fan-out cap)
    // plus any rows truncated during grouped rendering. With the pre-verify slice,
    // truncated is normally 0 and overflow carries the count; summing both keeps
    // the line correct regardless.
    const overflow = candidates.length - toVerify.length;
    const remaining = overflow + truncated;
    if (remaining > 0) {
      text += `  … and ${remaining} more\n`;
    }
  }
  text += '\n\n\n';

  // SP4 (D9 broaden): surface the 'Clean up ▸' entry whenever there is ANY
  // actionable proposal — shipped-but-early, approved-but-stranded, OR
  // dead-on-arrival. Previously this gate excluded DOA, leaving a pure-DOA stale
  // set with NO reachable cleanup entry (dead-on-arrival by the human). The DOA
  // batch action remains revert and its delete remains override-only inside the
  // cleanup tree — only the ENTRY gate broadens here. Label-only navigation — no
  // digit maps to any cleanup action.
  const hasActionable = proposals.some((p) => ACTIONABLE_CLEANUP.includes(p.category));
  const options = [];
  const actions = {};
  if (hasActionable) {
    options.push({ label: 'Clean up ▸', description: 'Review & execute cleanup' });
    actions['Clean up ▸'] = 'inbox cleanup';
  }
  options.push({ label: '◀ Back', description: 'Return to the stale list' });
  actions['◀ Back'] = 'inbox stale';

  return {
    text,
    ask: {
      questions: [{
        question: 'Verified proposals (read-only).',
        header: 'Stale plans',
        options,
      }],
    },
    actions,
  };
}

// ===========================================================================
// SP4 — Human-gated grouped cleanup review & execution (screens, all PURE).
// Every render function below emits option labels and action STRINGS and
// performs NO filesystem mutation. Execution happens only when the human selects
// an explicit 'Confirm: …' / 'Approve' / 'Delete permanently' label, which maps
// to a `claude:cleanup-exec …` string that the executor (Claude) acts on by
// calling stale-cleanup.executeCleanup. The exec strings carry only slug+action
// (or a category) — NEVER a stage; executeCleanup re-derives stage at exec time.
// ===========================================================================

/**
 * Build cleanup display items by re-deriving candidates from disk + git on every
 * render (no cross-screen session state — D8). Reused by every cleanup screen.
 * `item.stage` is for DISPLAY/grouping only; it is NEVER serialized into a
 * `claude:cleanup-exec` string (the F1/F2 decoupling — executeCleanup re-derives
 * stage from its own scan).
 * @param {string} root
 * @returns {{ items: Array<object>, candidates: Array<object> }}
 */
function _buildCleanupItems(root) {
  const candidates = listStaleCandidates(root); // cheap scan; carries .stage
  const slugHistoryCache = {};
  const toVerify = candidates.slice(0, CLEANUP_MAX_ROWS); // fan-out cap, mirrors SP3
  const items = [];
  for (const cand of toVerify) {
    try {
      const ev = staleDetector.verifyStaleCandidate(cand, root, { slugHistoryCache });
      const p = staleDetector.classifyStaleCandidate(cand, ev);
      items.push({
        plan: p.plan,
        stage: cand.stage,
        category: p.category,
        proposedAction: p.proposedAction,
        evidence: p.evidence,
        explicitlyRejected: !!(ev && ev.explicitlyRejected === true),
      });
    } catch {
      items.push({
        plan: (cand && cand.plan) || '(unknown)',
        stage: cand && cand.stage,
        category: 'inconclusive',
        proposedAction: null,
        evidence: ['verification error — skipped'],
        explicitlyRejected: false,
      });
    }
  }
  return { items, candidates };
}

function _cleanupScreen(text, question, options, actions) {
  return { text, ask: { questions: [{ question, header: 'Clean up', options }] }, actions };
}

/**
 * inboxCleanupReview — entry screen (route `inbox cleanup`). Lists actionable
 * proposals grouped by category; offers Approve-a-category / Review-individually
 * / Back. NO execution here (render only).
 */
function inboxCleanupReview(projectPath) {
  const root = getProjectPath(projectPath);
  const { items } = _buildCleanupItems(root);
  const actionable = items.filter((i) => ACTIONABLE_CLEANUP.includes(i.category));

  let text = `Inbox ▸ Clean up (${actionable.length})\n${'─'.repeat(40)}\n`;
  if (actionable.length === 0) {
    text += '\n  No actionable proposals.\n';
  } else {
    let rows = 0;
    let truncated = 0;
    for (const cat of CLEANUP_ORDER) {
      const group = actionable.filter((i) => i.category === cat);
      if (group.length === 0) continue;
      if (rows < CLEANUP_MAX_ROWS) text += `\n${stripCtl(cat)} (${group.length})\n`;
      for (const it of group) {
        if (rows >= CLEANUP_MAX_ROWS) {
          truncated++;
          continue;
        }
        const verb = (CLEANUP_CATEGORY_TABLE[it.category] || {}).verb || 'review';
        const ev = (it.evidence || []).map(stripCtl).join('; ');
        text += `  • ${stripCtl(it.plan)} → ${verb}  (${ev})\n`;
        rows++;
      }
    }
    if (truncated > 0) text += `  … and ${truncated} more\n`;
  }
  text += '\n\n\n';

  const options = [];
  const actions = {};
  if (actionable.length > 0) {
    options.push({ label: 'Approve a category ▸', description: 'Batch-approve one category (with a confirm)' });
    actions['Approve a category ▸'] = 'inbox cleanup category';
    options.push({ label: 'Review individually ▸', description: 'Approve or override one plan at a time' });
    actions['Review individually ▸'] = 'inbox cleanup plan';
  }
  options.push({ label: '◀ Back', description: 'Return to verified proposals' });
  actions['◀ Back'] = 'inbox verify';

  return _cleanupScreen(text, 'Review & execute cleanup (human-gated).', options, actions);
}

/**
 * inboxCleanupCategoryPick — route `inbox cleanup category`. One option per
 * actionable category present (≤3 + Back). NO execution.
 */
function inboxCleanupCategoryPick(projectPath) {
  const root = getProjectPath(projectPath);
  const { items } = _buildCleanupItems(root);
  const present = CLEANUP_ORDER.filter((cat) => items.some((i) => i.category === cat));

  let text = `Inbox ▸ Clean up ▸ Approve a category\n${'─'.repeat(40)}\n`;
  const options = [];
  const actions = {};
  for (const cat of present) {
    const n = items.filter((i) => i.category === cat).length;
    const label = `${stripCtl(cat)} (${n}) ▸`;
    const verb = (CLEANUP_CATEGORY_TABLE[cat] || {}).verb || 'process';
    text += `  • ${stripCtl(cat)} (${n})\n`;
    options.push({ label, description: `Confirm then ${verb} ${n} plan(s)` });
    actions[label] = `inbox cleanup confirm ${cat}`;
  }
  text += '\n\n\n';
  options.push({ label: '◀ Back', description: 'Return to cleanup review' });
  actions['◀ Back'] = 'inbox cleanup';

  return _cleanupScreen(text, 'Pick a category to batch-approve.', options, actions);
}

/**
 * inboxCleanupCategoryConfirm — route `inbox cleanup confirm <category>`. Shows
 * the count + category + member plan names BEFORE any execution. The 'Confirm: …'
 * label is the ONLY place a batch executes, and only on explicit selection.
 */
function inboxCleanupCategoryConfirm(category, projectPath) {
  if (!ACTIONABLE_CLEANUP.includes(category)) {
    return inboxCleanupReview(projectPath); // invalid category → safe default
  }
  const root = getProjectPath(projectPath);
  const { items } = _buildCleanupItems(root);
  const group = items.filter((i) => i.category === category);
  const n = group.length;
  const verb = (CLEANUP_CATEGORY_TABLE[category] || {}).verb || 'process';

  let text = `Inbox ▸ Clean up ▸ Confirm\n${'─'.repeat(40)}\n`;
  text += `\n  ${verb} ${n} ${stripCtl(category)} plan(s):\n`;
  for (const it of group.slice(0, CLEANUP_MAX_ROWS)) text += `  • ${stripCtl(it.plan)}\n`;
  text += '\n\n\n';

  const confirmLabel = `Confirm: ${verb} ${n} ${category} plans`;
  const options = [
    { label: confirmLabel, description: 'Execute this batch now' },
    { label: '◀ Back', description: 'Return to the category picker' },
  ];
  const actions = {
    [confirmLabel]: `claude:cleanup-exec category ${category}`,
    '◀ Back': 'inbox cleanup category',
  };
  return _cleanupScreen(text, 'Confirm the batch before it executes.', options, actions);
}

/**
 * inboxCleanupPlanReview — route `inbox cleanup plan <slug>|undefined`. With no
 * slug: a label-only pick list of actionable plans. With a slug: the per-plan
 * Approve / Override ▸ / Skip / Back screen.
 */
function inboxCleanupPlanReview(slug, projectPath) {
  const root = getProjectPath(projectPath);
  const { items } = _buildCleanupItems(root);
  const actionable = items.filter((i) => ACTIONABLE_CLEANUP.includes(i.category));

  if (!slug) {
    let text = `Inbox ▸ Clean up ▸ Review individually\n${'─'.repeat(40)}\n`;
    const options = [];
    const actions = {};
    for (const it of actionable.slice(0, CLEANUP_MAX_ROWS)) {
      const label = stripCtl(it.plan);
      text += `  • ${label} (${stripCtl(it.category)})\n`;
      options.push({ label, description: `Review ${stripCtl(it.category)}` });
      actions[label] = `inbox cleanup plan ${it.plan}`;
    }
    text += '\n\n\n';
    options.push({ label: '◀ Back', description: 'Return to cleanup review' });
    actions['◀ Back'] = 'inbox cleanup';
    return _cleanupScreen(text, 'Pick a plan to review.', options, actions);
  }

  const item = actionable.find((i) => i.plan === slug);
  if (!item) {
    return inboxCleanupReview(projectPath); // unknown / no-longer-actionable slug → safe default
  }
  const verb = (CLEANUP_CATEGORY_TABLE[item.category] || {}).verb || 'review';
  const action = (CLEANUP_CATEGORY_TABLE[item.category] || {}).action;
  const ev = (item.evidence || []).map(stripCtl).join('; ');

  let text = `Inbox ▸ Clean up ▸ ${stripCtl(slug)}\n${'─'.repeat(40)}\n`;
  text += `\n  plan: ${stripCtl(item.plan)}\n  category: ${stripCtl(item.category)}\n  proposed: ${verb}\n  evidence: ${ev}\n`;
  text += '\n\n\n';

  const options = [
    { label: 'Approve', description: `Execute: ${verb}` },
    { label: 'Override ▸', description: 'Choose a different action' },
    { label: 'Skip', description: 'Leave in place; re-surfaces on the next scan' },
    { label: '◀ Back', description: 'Return to cleanup review' },
  ];
  const actions = {
    Approve: `claude:cleanup-exec plan ${item.plan} ${action}`,
    'Override ▸': `inbox cleanup override ${item.plan}`,
    Skip: 'inbox cleanup',
    '◀ Back': 'inbox cleanup',
  };
  return _cleanupScreen(text, 'Approve, override, or skip this plan.', options, actions);
}

/**
 * inboxCleanupPlanOverride — route `inbox cleanup override <slug>`. Lists the
 * allowed alternative actions for the plan's category. 'Delete permanently' is
 * offered ONLY for a DOA item with explicitlyRejected === true (the second
 * confirmation surface for an irreversible delete).
 */
function inboxCleanupPlanOverride(slug, projectPath) {
  const root = getProjectPath(projectPath);
  const { items } = _buildCleanupItems(root);
  const actionable = items.filter((i) => ACTIONABLE_CLEANUP.includes(i.category));
  const item = slug ? actionable.find((i) => i.plan === slug) : null;
  if (!item) {
    return inboxCleanupReview(projectPath); // unknown slug → safe default
  }

  let text = `Inbox ▸ Clean up ▸ Override ${stripCtl(slug)}\n${'─'.repeat(40)}\n\n`;
  text += '  Choose an alternative action.\n\n\n';
  const options = [];
  const actions = {};
  if (item.category === 'dead-on-arrival') {
    options.push({ label: 'Archive to done instead', description: 'Reconcile forward to done/' });
    actions['Archive to done instead'] = `claude:cleanup-exec plan ${item.plan} archive-to-done`;
    if (item.explicitlyRejected === true) {
      options.push({ label: 'Delete permanently', description: 'Irreversible — explicitly rejected' });
      actions['Delete permanently'] = `claude:cleanup-exec plan ${item.plan} delete`;
    }
  } else {
    options.push({ label: 'Revert instead', description: 'Move back one stage (reversible)' });
    actions['Revert instead'] = `claude:cleanup-exec plan ${item.plan} revert`;
  }
  options.push({ label: '◀ Back', description: 'Return to plan review' });
  actions['◀ Back'] = `inbox cleanup plan ${item.plan}`;

  return _cleanupScreen(text, 'Pick an alternative action.', options, actions);
}

/**
 * Dashboard Menu B (Commands)
 * Shows: Vision(n), Start agent, Sync plans, Pipeline
 */
function dashboardCommands(projectPath) {
  const root = getProjectPath(projectPath);
  const visionCounts = getVisionCounts(root);
  const agent = getAgentStatus(root);
  const isAgentActive = agent.active;

  const text = buildDashboardTable(root) + '\n\n\n';

  const options = [
    { label: `Vision (${visionCounts.total})`, description: 'Explore new ideas before formal planning' },
    { label: isAgentActive ? 'Stop agent' : 'Start agent', description: isAgentActive ? 'Stop after current task' : 'Execute next plan from todo queue' },
    { label: 'Sync plans', description: 'Pull, commit, and push plan changes' },
    { label: '◀ Pipeline', description: 'Return to pipeline view' }
  ];

  const actions = {
    [`Vision (${visionCounts.total})`]: 'claude:vision',
    [isAgentActive ? 'Stop agent' : 'Start agent']: isAgentActive ? 'claude:stop-agent' : 'claude:start-agent',
    'Sync plans': 'claude:sync',
    '◀ Pipeline': ''
  };

  const questions = [{
    question: 'Select a command:',
    header: 'Commands',
    options
  }];

  // NB3 (HIGH fix): reach the background-task board via a RIDE-ALONG second question
  // — NOT a 5th option on the primary Commands question. AskUserQuestion caps each
  // question at 4 options; a spliced 5th sat before ◀ Pipeline, so truncation would
  // drop Back and strand the user. Mirrors the environment (Rule 8) / stale (Rule 10)
  // ride-along pattern: the primary question stays at its 4 options with ◀ Pipeline
  // intact; the board rides along as its own ≤4-option, label-keyed question (never a
  // digit — Rule 1). FAIL-OPEN: a corrupt/unreadable registry omits the ride-along
  // rather than breaking Commands (load already fails open to empty; the try/catch is
  // defense in depth).
  let hasBackgroundTasks = false;
  try { hasBackgroundTasks = taskRegistry.load(root).tasks.length > 0; } catch { hasBackgroundTasks = false; }
  if (hasBackgroundTasks) {
    questions.push({
      question: 'Background tasks?',
      header: 'Background tasks',
      options: [
        { label: 'View board ▸', description: 'View the background task board' },
        { label: 'Not now', description: 'Dismiss for this menu turn' },
      ],
    });
    actions['View board ▸'] = 'tasks'; // label key only — NEVER a digit (Rule 1)
    actions['Not now'] = '';           // no-op (driver falls through to the Commands answer)
  }

  return {
    text,
    ask: { questions },
    actions
  };
}

/**
 * Stage Browse Screen
 * Lists plans in a stage with navigation options.
 * 1-3 plans: each plan is a button
 * 4+ plans: numbered text list with action buttons only
 */
function stageBrowse(stage, projectPath) {
  const root = getProjectPath(projectPath);
  const plansDir = getPlansDir(root);

  // Vision is not a plan-file stage — it is a separate pipeline (explore →
  // decompose → stubs) handled by Vision Mode. `browse vision` has no
  // STAGE_FOLDERS entry; rather than dead-end on "Unknown stage: vision",
  // point the user at Vision Mode, where visions are created, edited, and
  // decomposed into functional plans.
  if (stage === 'vision') {
    const visionCounts = getVisionCounts(root);
    return {
      text: `[vision] (${visionCounts.total} active)\n${'─'.repeat(40)}\n\n`
        + '  Visions are created, edited, and decomposed in Vision Mode —\n'
        + '  they are not browsed as plan files.\n\n\n',
      ask: {
        questions: [{
          question: 'Open Vision Mode?',
          header: 'Vision',
          options: [
            { label: 'Enter Vision Mode', description: 'Create, edit, or decompose a vision' },
            { label: '◀ Back', description: 'Return to pipeline view' },
          ],
        }],
      },
      actions: {
        'Enter Vision Mode': 'claude:vision',
        '◀ Back': '',
      },
    };
  }

  const folder = STAGE_FOLDERS[stage];

  if (!folder) {
    return {
      text: `Unknown stage: ${stage}\n\n\n`,
      ask: {
        questions: [{
          question: 'Return to dashboard?',
          header: 'Error',
          options: [{ label: 'Back', description: 'Return to dashboard' }]
        }]
      },
      actions: { 'Back': '' }
    };
  }

  const stageDir = path.join(plansDir, folder);
  const plans = readPlans(stageDir);

  let text = `[${stage}] (${plans.length} items)\n`;
  text += `${'─'.repeat(40)}\n`;

  if (plans.length === 0) {
    text += '\n  No plans in this stage.\n';
  } else {
    plans.forEach((plan, i) => {
      const icon = plan.bgIcon || '○';
      text += `\n  [${i + 1}] ${icon} ${plan.name}  ${plan.ago || ''}`;
    });
    text += '\n';
  }

  // Numbers are reserved EXCLUSIVELY for opening a plan — any count, multi-digit.
  // Meta-actions are WORDS ('n' new, 'b' back), so a number can never select
  // navigation by accident and every plan (including the 25th) is reachable by
  // typing its number. (Fixes the AskUserQuestion-numbering collision where the
  // first option grabbed "1" and >9 plans were unreachable.)
  // Bulk word shortcuts (WORDS only — a number never triggers a bulk action):
  //   • discuss  — bulk adversarial critique across every plan in the stage
  //                (both functional and implementation). Advisory only.
  //   • todo-all — implementation stage only: the human deliberately crossing
  //                the implementation→todo gate for EVERY implementation plan at
  //                once, then starting the iron loop to build them.
  const bulkDiscuss = stage === 'functional' || stage === 'implementation';
  const bulkAdvance = stage === 'implementation';

  // R2-C2 item 4 — review `done-all` (W3), menu-side. The human typing `done-all-
  // <parent>` on the review list IS the Gate-3 approval for EVERY reviewed slice of
  // that parent — symmetric to the implementation stage's `todo-all`. WORD shortcut
  // only, never a number. One key PER DISTINCT parent (approveSubplans is per
  // parent); a review plan with no parent_plan contributes none. The action-key
  // recipe (approveSubplans(parent, 'review')) already lives in start.md (same wave);
  // this only REGISTERS the typed key. Every parent slug is control-stripped and
  // must match a safe slug pattern before it can enter an action key/string (S1 —
  // a hostile parent_plan can neither inject ANSI nor forge a claude: verb).
  const doneAllParents = [];
  if (stage === 'review') {
    const seen = new Set();
    for (const p of plans) {
      const raw = p && p.metadata ? p.metadata.parent_plan : '';
      const parent = stripCtl(typeof raw === 'string' ? raw.trim() : '');
      if (parent && /^[A-Za-z0-9._-]+$/.test(parent) && !seen.has(parent)) {
        seen.add(parent);
        doneAllParents.push(parent);
      }
    }
  }

  const bulkHints = [];
  if (bulkDiscuss) bulkHints.push('discuss = critique every plan');
  if (bulkAdvance) bulkHints.push('todo-all = move all to todo + run iron loop');
  if (doneAllParents.length) bulkHints.push("done-all-<parent> = Gate-3 approve all of <parent>'s reviewed slices");
  const bulkSuffix = bulkHints.length ? ` · ${bulkHints.join(' · ')}` : '';

  text += plans.length > 0
    ? `\n  Reply with a plan number (1-${plans.length}) to open it · n = new ${stage} plan${bulkSuffix} · b = back\n\n\n`
    : `\n  Reply:  n = new ${stage} plan${bulkSuffix} · b = back\n\n\n`;

  const actions = {};
  plans.forEach((plan, i) => {
    actions[`${i + 1}`] = `plan ${stage}/${plan.name}.md`;
  });
  // Word-keyed navigation — NEVER numeric.
  actions['n'] = `claude:create-plan ${stage}`;
  actions['new'] = `claude:create-plan ${stage}`;
  // Bulk word shortcuts — words only, mapped to advisory/gate-crossing actions.
  if (bulkDiscuss) {
    actions['discuss'] = `claude:discuss-all ${stage}`;
  }
  if (bulkAdvance) {
    actions['todo-all'] = 'claude:advance-all-implementation';
  }
  // R2-C2 item 4: per-parent Gate-3 batch keys (words only — never a digit).
  for (const parent of doneAllParents) {
    actions[`done-all-${parent}`] = `claude:done-all-${parent}`;
  }
  actions['b'] = '';
  actions['back'] = '';

  return {
    text,
    // inputMode tells the driver: do NOT render a numbered AskUserQuestion for a
    // plan list. Show the list and take a free-text reply — a number opens that
    // plan via actions[number]; 'n'/'b' are the only non-plan shortcuts (words).
    inputMode: 'plan-select',
    prompt: plans.length > 0
      ? `Reply with a plan number (1-${plans.length}) to open it, or 'n' for a new plan, 'b' for back.`
      : `No plans in ${stage}. Reply 'n' to create one, or 'b' for back.`,
    actions
  };
}

/**
 * Vision Stubs Browse Screen
 * Human checkpoint table for vision decomposition.
 * Shows stubs created by the Vision Decomposer and options to approve/edit.
 */
function visionStubsBrowse(slug, projectPath) {
  const root = getProjectPath(projectPath);
  const stubs = getVisionStubs(slug, root);

  let text = `[Vision Decomposition] ${slug}\n`;
  text += `${'─'.repeat(40)}\n\n`;

  if (stubs.length === 0) {
    text += '  No stubs created yet.\n';
  } else {
    text += `  Vision "${slug}" decomposed into ${stubs.length} functional plans:\n\n`;
    text += `  | # | Stub                    | Scope                          | Depends on |\n`;
    text += `  |---|-------------------------|--------------------------------|------------|\n`;
    stubs.forEach((stub, i) => {
      const name = stub.name.padEnd(23).slice(0, 23);
      const scope = (stub.scope || '').padEnd(30).slice(0, 30);
      const deps = (stub.dependsOn || '-').padEnd(10).slice(0, 10);
      text += `  | ${i + 1} | ${name} | ${scope} | ${deps} |\n`;
    });
  }

  text += '\n\n\n';

  const options = [
    { label: 'Looks good -- refine all', description: 'Hand off stubs to Product Owner Agent for refinement' },
    { label: 'Edit stubs', description: 'Rename, merge, split, or remove stubs' },
    { label: 'Add a stub', description: 'Create a new stub for a missing piece' },
    { label: 'Start over', description: 'Discard all stubs and re-decompose' },
    { label: 'Back', description: 'Return to dashboard' }
  ];

  const actions = {
    'Looks good -- refine all': `claude:approve-stubs ${slug}`,
    'Edit stubs': `claude:edit-stubs ${slug}`,
    'Add a stub': `claude:add-stub ${slug}`,
    'Start over': `claude:decompose ${slug}`,
    'Back': ''
  };

  return {
    text,
    ask: {
      questions: [{
        question: 'Review the decomposition. What do you want to do?',
        header: 'Vision Stubs',
        options
      }]
    },
    actions
  };
}

/**
 * Validation Screen
 * Shows pre-transition validation results and options.
 */
function validateScreen(stage, file, projectPath) {
  const root = getProjectPath(projectPath);
  const plansDir = getPlansDir(root);
  const folder = STAGE_FOLDERS[stage];
  // Confine to a single plan file inside plans/<folder>/. A plan reference is
  // always a bare filename; anything containing path separators or ".." is a
  // traversal attempt (e.g. "functional/../../etc/passwd") and must not be
  // resolved or read.
  if (!folder || isUnsafePlanFile(file)) {
    return invalidPlanRefScreen(stage, file);
  }
  const planPath = path.join(plansDir, folder, file);
  // Approval crosses only the three human-gate edges (HUMAN_GATES). For any
  // other stage (canvas, todo, in-progress) there is no gate to validate:
  // running the transition-as-gate here returned autoApprove:true and the driver
  // auto-ran claude:approve → approvePlan THROWS "Unknown plan location". Refuse
  // with a non-approving screen (no autoApprove, no claude:approve) instead.
  const nextStage = HUMAN_GATES[stage];
  if (!nextStage) {
    return {
      text: `No approval gate for ${stage}\n${'─'.repeat(40)}\n\n  ${stage} plans do not cross a human gate here.\n  (todo advances via start-agent; in-progress → review via task completion.)\n\n\n`,
      ask: {
        questions: [{
          question: 'Not a human-gate approval.',
          header: 'Validate',
          options: [{ label: 'Back', description: `Return to ${stage} list` }]
        }]
      },
      actions: { 'Back': `browse ${stage}` },
      // One-turn signal is OFF: there is nothing to auto-approve here.
      autoApprove: false
    };
  }

  // Run validation
  const validationResult = validateTransition(planPath, stage, nextStage, root);

  // Build validation text
  let text = `Pre-transition validation: ${stage} → ${nextStage}\n`;
  text += `${'─'.repeat(40)}\n\n`;

  if (validationResult.errors.length === 0 && validationResult.warnings.length === 0) {
    text += '  All checks passed.\n';
  }

  if (validationResult.errors.length > 0) {
    validationResult.errors.forEach(err => {
      text += `  ✗ ${err}\n`;
    });
  }

  if (validationResult.warnings.length > 0) {
    validationResult.warnings.forEach(warn => {
      text += `  ⚠ ${warn}\n`;
    });
  }

  text += '\n\n\n';

  // R2-C2 item 3 — one-turn approve (R6/W2). The human already chose "Approve"
  // in planActions/reviewActions; a clean validation must NOT demand a second
  // "Proceed?" click. `autoApprove` is the one-turn SIGNAL: on a clean validation
  // the driver runs `claude:approve` in the SAME turn (the auto-run half lands in
  // the start.md instruction surface, R2-D, same wave). On a failed validation the
  // override ("Approve anyway") is DEMOTED to the LAST option, never recommended,
  // and labelled as recording an override. The approve→validate ROUTE and the
  // approve ACTION strings are unchanged (their pins survive).
  const autoApprove = validationResult.valid === true;

  let question;
  const options = [];
  const actions = {};

  if (autoApprove) {
    // Clean: a single decisive approve, no redundant "Proceed?" and no Fix option
    // (there is nothing to fix). The driver auto-runs this on a clean validation.
    question = validationResult.warnings.length > 0
      ? `All checks passed (${validationResult.warnings.length} warning(s)) — approving ${stage} → ${nextStage}.`
      : `All checks passed — approving ${stage} → ${nextStage}.`;
    options.push({ label: 'Confirm approve', description: `Approve now — move plan to ${nextStage}` });
    actions['Confirm approve'] = `claude:approve ${stage}/${file}`;
    options.push({ label: 'Back', description: `Return to ${stage} list` });
    actions['Back'] = `browse ${stage}`;
  } else {
    // Failed: fix or (buried) override. "Approve anyway" is the LAST option.
    question = `${validationResult.errors.length} error(s) found. Fix the issues, or override?`;
    options.push({ label: 'Fix issues', description: 'Go back and fix the issues' });
    actions['Fix issues'] = `plan ${stage}/${file}`;
    options.push({ label: 'Back', description: `Return to ${stage} list` });
    actions['Back'] = `browse ${stage}`;
    options.push({ label: 'Approve anyway', description: 'Override validation and move to the next stage (records an override)' });
    // R6-A — the forced crossing must be AUDITABLE at the action-string surface.
    // The `--override` token tells the start.md claude:approve recipe to call
    // approvePlan(path, root, { override: { reason } }) — which crosses AND records
    // override:true + the human's reason in both the ledger entry and the plan
    // marker. A bare claude:approve here would make the one forced crossing the one
    // invisible one. The clean "Confirm approve" path above carries no token.
    actions['Approve anyway'] = `claude:approve ${stage}/${file} --override`;
  }

  return {
    text,
    ask: {
      questions: [{
        question,
        header: 'Validate',
        options
      }]
    },
    actions,
    // One-turn signal for the driver (R2-D reads it to skip the second ask).
    autoApprove,
    validation: validationResult
  };
}

// ===========================================================================
// NB2 — Task wiring. `menu task <sub>` records/reads NB1 registry state; the
// `tasks` and `task <id>` routes render the board and detail screens. All
// registry I/O goes through task-registry (the safe-fs choke point) — NEVER raw
// fs here. NB2 records INTENT only; it launches nothing (NB3 dispatches).
// ===========================================================================

/**
 * Load the registry, fail-open to empty (a corrupt/absent registry must never
 * brick the NAV plane).
 * @param {string} root
 * @returns {{version:number, seq:number, tasks:Array<object>}}
 */
function loadReg(root) {
  try { return taskRegistry.load(root); } catch { return taskRegistry.emptyRegistry(); }
}

/**
 * Decode a `--b64` payload (base64 of compact JSON). Returns `null` on any
 * malformed input (fail-soft; the caller falls back to positional/flag args).
 * @param {string} v
 * @returns {object|null}
 */
function decodeB64(v) {
  try {
    const raw = String(v);
    // Bound the input BEFORE decoding — a crafted oversized `--b64` must not be
    // buffered/parsed (memory/DoS guard). 65536 chars comfortably covers any
    // legitimate compact-JSON task payload.
    if (raw.length > 65536) return null;
    const obj = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

/**
 * Parse `menu task <sub>` args into positionals + flags. Whitespace-free tokens
 * only (argv is split on whitespace by start.js); `--touches`/`--blocked` split on
 * a LITERAL comma (no dynamic RegExp). No `new RegExp` anywhere.
 * @param {string[]} subArgs
 * @returns {object}
 */
function parseTaskArgs(subArgs) {
  const out = { positional: [], gitop: false, fail: false };
  const args = Array.isArray(subArgs) ? subArgs : [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '--touches': out.touches = String(args[++i] == null ? '' : args[i]).split(',').filter(Boolean); break;
      case '--blocked': out.blocked = String(args[++i] == null ? '' : args[i]).split(',').filter(Boolean); break;
      case '--gitop': out.gitop = true; break;
      case '--fail': out.fail = true; break;
      // R3-B item 1: the HUMAN override of a scheduler refusal (`start`) or of the
      // two-phase cancel wait (`cancel`). Never the default; always logged + flagged.
      case '--force': out.force = true; break;
      case '--label': out.label = String(args[++i] == null ? '' : args[i]); break;
      case '--summary': out.summary = String(args[++i] == null ? '' : args[i]); break;
      case '--next': out.next = String(args[++i] == null ? '' : args[i]); break;
      // H8: the harness agent id to record on the task at `menu task start`, so the
      // on-open reconcile can match it against the live-agent-id set (never falsely
      // orphaning a genuinely-live long-running agent). Defaults to the task id
      // downstream when omitted.
      case '--agent-id': out.agentId = String(args[++i] == null ? '' : args[i]); break;
      case '--gate': out.gate = args[++i]; break;
      case '--b64': out.b64 = String(args[++i] == null ? '' : args[i]); break;
      default: out.positional.push(a);
    }
  }
  return out;
}

/**
 * Build an addTask spec from parsed args. Populates NAMED fields only (never
 * spreads a decoded payload → no prototype pollution). A `--b64` payload, when
 * present, overrides matching named fields.
 * @param {object} p  parsed args
 * @returns {object} spec for task-registry.addTask
 */
function buildAddSpec(p) {
  const spec = { kind: p.positional[0], plan: p.positional[1] == null ? null : p.positional[1] };
  if (p.touches) spec.touches = p.touches;
  if (p.blocked) spec.blockedBy = p.blocked;
  if (p.gitop) spec.gitOp = true;
  if (p.label != null) spec.label = p.label;
  if (p.b64) {
    const d = decodeB64(p.b64);
    if (d) {
      if (typeof d.kind === 'string') spec.kind = d.kind;
      if ('plan' in d) spec.plan = d.plan;
      if (typeof d.label === 'string') spec.label = d.label;
      if (Array.isArray(d.touches)) spec.touches = d.touches;
      if (Array.isArray(d.blockedBy)) spec.blockedBy = d.blockedBy;
      if (typeof d.gitOp === 'boolean') spec.gitOp = d.gitOp;
    }
  }
  return spec;
}

/**
 * `menu task add` — persist a queued task + report a scheduler decision.
 *
 * R3-B item 2 — ONE non-terminal implement task per plan. If a live (non-terminal)
 * implement task already exists for this plan, the EXISTING task is returned
 * (`existing: true`) and NOTHING is added. A duplicate would shadow the running task at
 * completion time (`findActivePlanTask`/`completeExecution` used to take the EARLIEST
 * non-terminal match), leaving the real task running forever — a dead file lock until the
 * 120-minute orphan sweep, after which the duplicate re-ran a plan already in review.
 *
 * R3-B item 7 — the load→save cycle runs inside the compare-and-swap helper.
 */
function taskAdd(root, rest) {
  const p = parseTaskArgs(rest);
  const spec = buildAddSpec(p);
  return taskRegistry.withRegistry(root, (reg, ctx) => {
    if (spec.kind === 'implement' && spec.plan != null) {
      const existing = taskRegistry.findActivePlanTask(reg, spec.plan, 'implement');
      if (existing) {
        ctx.abort(); // a refusal writes NOTHING
        return {
          ok: true,
          existing: true,
          taskId: existing.id,
          decision: existing.status === 'running' ? 'run' : 'queue',
          reason: 'already-queued',
          status: existing.status,
          text: `Task ${existing.id} already covers plan ${stripCtl(String(spec.plan))} ` +
            `(${existing.status}) — not duplicating it.`,
        };
      }
    }
    const task = taskRegistry.addTask(reg, spec); // throws on a bad spec BEFORE any save
    const decision = taskRegistry.canRun(task, reg);
    return {
      ok: true,
      taskId: task.id,
      decision: decision.run ? 'run' : 'queue',
      reason: decision.reason,
      status: 'queued',
      text: `Task ${task.id} queued (${task.kind}${task.plan ? ' ' + stripCtl(task.plan) : ''}) — ${decision.run ? 'run' : 'queue'}: ${decision.reason}`,
    };
  });
}

/**
 * NB3: the scheduler's newly-runnable set, projected onto the just-saved in-memory
 * registry, as a compact promote list — now with the CONCURRENT-EDIT GUARD applied.
 * This is the ONLY sanctioned promotion source for the COMPLETION turn — Claude
 * dispatches exactly these tasks (never a queued task the scheduler did not return).
 * Each entry carries only what the dispatcher needs (id + the scheduler inputs), never
 * the whole task object.
 *
 * Before this, the guard ran ONLY on the dashboard-open path (`reconcileState`), so
 * `menu task fail|cancel|complete` published a promote list that could hand a file still
 * reserved by a possibly-live age-only orphan to a conflicting queued task — two agents
 * on one file, which is the exact outcome the guard exists to prevent. Four routes now
 * share ONE encoding, `task-reconcile.applyQuarantine`. The scheduler stays pure: the
 * filter is in the PROJECTION, never in `canRun`/`nextRunnable`.
 *
 * A held candidate is RETURNED alongside the promote list, never silently dropped — a
 * candidate that vanishes with no explanation is the silent behaviour this program keeps
 * removing.
 *
 * @param {{tasks:Array<object>}} reg  a post-save in-memory registry value
 * @returns {{promote:Array<{id:string, kind:string, plan:(string|null), touches:string[], gitOp:boolean}>, quarantined:Array<{id:string,reason:string,summary:string}>}}
 */
function computePromote(reg) {
  const guarded = taskReconcile.applyQuarantine(reg, taskRegistry.nextRunnable(reg));
  const promote = guarded.promote
    // NB3 (LOW, defense in depth): only ids of the canonical `t<n>` shape may ride
    // into a `menu task start <id>` dispatch instruction, and id/plan are stripped of
    // control chars — a crafted registry entry can never inject an ANSI/newline
    // payload into the COMPLETION turn (mirrors the render layer's stripCtl guard).
    // This runs LAST, after the guard, so the injection defence is unweakened.
    .filter((t) => /^t\d+$/.test(t.id))
    .map((t) => ({
      id: stripCtl(t.id),
      kind: t.kind,
      plan: t.plan == null ? t.plan : stripCtl(t.plan),
      touches: t.touches,
      gitOp: t.gitOp
    }));
  return { promote, quarantined: guarded.quarantined };
}

/**
 * `menu task start|fail|cancel` — a single-status transition on a non-terminal task.
 *
 * R3-B item 1 — THE ENFORCEMENT POINT. `start` is where the concurrency ladder is
 * CHECKED, not merely defined: it calls `taskRegistry.canRun` and REFUSES (registry
 * byte-unchanged) when the ladder says no (deps / ≤5 / sync-barrier / git-exclusive /
 * file-conflict). `--force` is the human override — allowed, but recorded in the warn log
 * (`forced_start`) and SHOUTED in the result text, never silent. The whole cycle runs
 * inside the compare-and-swap helper (item 7), and a refusal `ctx.abort()`s so no write
 * (and no generation bump) happens.
 */
function taskTransition(root, rest, kind) {
  const p = parseTaskArgs(rest);
  const id = p.positional[0];
  return taskRegistry.withRegistry(root, (reg, ctx) => {
    const task = reg.tasks.find((t) => t.id === id);
    if (!task) throw new Error('task-registry: unknown task id ' + String(id));

    // Legality is asked of the registry's ONE lifecycle encoding (item 4) — no local
    // mirror. `start`/`fail` have a fixed target, so the guard is `canTransition`
    // (which correctly PERMITS, e.g., orphaned → failed). `cancel`'s effective target
    // varies with the current status (running → cancelling, queued → cancelled), so its
    // guard is "not terminal" — a terminal task cannot be cancelled.
    if (kind === 'start' && !taskRegistry.canTransition(task.status, 'running')) {
      throw new Error(`task-registry: invalid transition ${task.status} → running`);
    }
    if (kind === 'fail' && !taskRegistry.canTransition(task.status, 'failed')) {
      throw new Error(`task-registry: invalid transition ${task.status} → failed`);
    }
    if (kind === 'cancel' && TASK_TERMINAL.has(task.status)) {
      throw new Error(`task-registry: invalid transition ${task.status} → cancelled`);
    }

    // ── item 1: guarded start ────────────────────────────────────────────────────
    if (kind === 'start') {
      const decision = taskRegistry.canRun(task, reg);
      if (!decision.run && p.force !== true) {
        ctx.abort(); // REFUSED — the registry is provably unchanged (no write, no gen bump)
        return {
          ok: false,
          refused: true,
          taskId: id,
          reason: decision.reason,
          text: `Task ${id} NOT started — the scheduler refuses it (${decision.reason}). ` +
            `Wait for the blocker to clear, or override with --force (human decision, logged).`,
        };
      }
      const forced = !decision.run && p.force === true;
      if (forced) {
        // A human overrode a real ladder refusal — this must never be silent. Record it
        // durably in the warn log and SHOUT it in the returned text.
        taskRegistry.warnLog(root, 'forced_start', { id, reason: decision.reason });
      }
      // H8: record `agentTaskId` at start so the on-open reconcile can match it against
      // the live-agent-id set. Caller-supplied `--agent-id` (the harness id) wins; falls
      // back to the task id so the wiring works before the session passes the harness id.
      taskRegistry.updateTask(reg, id, { status: 'running', agentTaskId: p.agentId || id });
      const res = {
        ok: true,
        taskId: id,
        status: 'running',
        text: forced
          ? `Task ${id} → running — ⚠ FORCED past the scheduler (${decision.reason}); ` +
            `a human overrode the ladder. Recorded in the task warn log.`
          : `Task ${id} → running`,
      };
      if (forced) { res.forced = true; res.reason = decision.reason; }
      return res; // start never frees a slot → no promote
    }

    // ── fail ─────────────────────────────────────────────────────────────────────
    if (kind === 'fail') {
      taskRegistry.updateTask(reg, id, { status: 'failed', result: { ok: false, summary: p.summary || 'failed' } });
      const { promote, quarantined } = computePromote(reg);
      const failRes = {
        ok: true,
        taskId: id,
        status: 'failed',
        text: `Task ${id} → failed`,
        promote,
      };
      // Only when non-empty, so a project with no age-only orphans gets a byte-identical
      // result object and no existing protocol assertion regresses.
      if (quarantined.length > 0) failRes.quarantined = quarantined;
      return failRes;
    }

    // ── cancel (item 10: stamp the deadline clock; --force skips the two-phase wait) ─
    // R2-C honest cancel (C1-2): a RUNNING/`cancelling` task enters `cancelling` and KEEPS
    // its slot/touches/gitOp/sync barrier until the harness agent is confirmed gone — the
    // registry must not free a live agent's files early. A QUEUED task cancels immediately.
    // `--force` is the human tie-breaker: free a running task NOW (running→cancelling→
    // cancelled in one call), logged + shouted.
    const running = task.status === 'running' || task.status === 'cancelling';
    let cancelling = false;
    let forcedCancel = false;
    if (running && p.force === true) {
      // Two-step through the legal path: running → cancelling → cancelled.
      if (task.status === 'running') {
        taskRegistry.updateTask(reg, id, { status: 'cancelling', ts: { cancelRequested: nowIso() } });
      }
      taskRegistry.updateTask(reg, id, { status: 'cancelled' });
      forcedCancel = true;
      taskRegistry.warnLog(root, 'forced_cancel', { id, from: task.status });
    } else if (running) {
      // Stamp ts.cancelRequested so reconcile's cancel deadline (item 10) has a clock.
      taskRegistry.updateTask(reg, id, { status: 'cancelling', ts: { cancelRequested: nowIso() } });
      cancelling = true;
    } else {
      taskRegistry.updateTask(reg, id, { status: 'cancelled' });
    }
    const settled = reg.tasks.find((t) => t.id === id);
    const res = {
      ok: true,
      taskId: id,
      status: settled.status,
      cancelled: true,
      text: forcedCancel
        ? `Task ${id} → cancelled — ⚠ FORCED (the human freed a live agent's files past the ` +
          `two-phase wait). Recorded in the task warn log.`
        : cancelling
          ? `Task ${id} → cancelling (files stay locked until the agent is confirmed gone)`
          : `Task ${id} → ${settled.status}`,
    };
    if (forcedCancel) res.forced = true;
    const cancelPromote = computePromote(reg);
    res.promote = cancelPromote.promote;
    if (cancelPromote.quarantined.length > 0) res.quarantined = cancelPromote.quarantined;
    return res;
  });
}

/**
 * `menu task complete` — running → done, storing an optional result payload.
 *
 * R3-D — THE LAST MILE. For an `implement` task this is no longer a registry-only
 * status flip: it runs the REAL completion (`actions.completeTaskPlan` →
 * `completeExecution`), which validates the plan, moves it in-progress → review,
 * RUNS Step 14 VERIFY (including the app-launch last-mile check), and persists the
 * evidence artifact Gate 3 demands. Before this wiring `completeExecution` had ZERO
 * callers: no evidence was ever produced, and Gate 3 — correctly fail-closed on
 * missing evidence — was un-passable except by clicking "Approve anyway".
 *
 * A BLOCKED completion (the plan cannot pass pre-review validation) REFUSES the
 * whole complete: the task stays running, the plan stays in in-progress, and NO
 * evidence is minted. That is a kickback, not a completion — the completion path
 * must never fabricate the very evidence the gate exists to demand.
 *
 * Every other outcome completes as before: a non-implement task, or an implement
 * task whose plan file is not on disk, is a registry-only completion (reported via
 * `completion`, never thrown) so a scheduler task can never be wedged by a missing
 * plan file.
 */
function taskComplete(root, rest) {
  const p = parseTaskArgs(rest);
  const id = p.positional[0];
  const reg = taskRegistry.load(root);
  const task = reg.tasks.find((t) => t.id === id);
  if (!task) throw new Error('task-registry: unknown task id ' + String(id));
  // C3 (CRITICAL): legality is asked of the registry's ONE lifecycle encoding, not a
  // local mirror. The registry PERMITS `orphaned → done` (a falsely-orphaned agent's
  // late completion is ACCEPTED, not dropped). The old mirror listed `orphaned` as
  // terminal, so `menu task complete` on a reconciler-orphaned (i.e. crashed) executor's
  // task was refused — stranding a FINISHED plan in in-progress/ with no evidence and no
  // route in all of CTOC that could ever mint it, except the Gate-3 human override.
  if (!taskRegistry.canTransition(task.status, 'done')) {
    throw new Error(`task-registry: invalid transition ${task.status} → done`);
  }
  const extra = p.b64 ? decodeB64(p.b64) : null;
  const summary = p.summary != null ? p.summary : (extra && typeof extra.summary === 'string' ? extra.summary : undefined);
  const nextAction = p.next != null ? p.next : (extra && typeof extra.nextAction === 'string' ? extra.nextAction : undefined);
  // Gate-safety (Decision 5, load-bearing): a supplied nextAction may ONLY be a
  // navigation route — never a `claude:*` gate-crosser. Reject the WHOLE complete
  // rather than persist a route that would render as an executable gate cross.
  // Same allowlist the renderer enforces (taskView.isNavRoute) → defense in depth.
  if (nextAction != null && !taskView.isNavRoute(nextAction)) {
    return { ok: false, error: 'nextAction must be a navigation route', text: 'Rejected: nextAction must be a navigation route (not a gate-crossing action).' };
  }
  let gate;
  const gRaw = p.gate != null ? p.gate : (extra ? extra.gate : undefined);
  if (gRaw != null) {
    const g = parseInt(gRaw, 10);
    if (Number.isInteger(g)) gate = g;
  }
  const result = { ok: !p.fail };
  if (summary != null) result.summary = summary;
  if (nextAction != null) result.nextAction = nextAction;
  if (gate != null) result.gate = gate;

  // R3-D: run the REAL plan completion for an implement task BEFORE settling the
  // task, so a refusal (failed pre-review validation) can still stop the completion.
  // Lazy-required: actions.js is a heavier module and the NAV plane must stay thin.
  let completion = null;
  if (task.kind === 'implement' && !p.fail && task.plan != null) {
    try {
      const { completeTaskPlan } = require('./actions');
      completion = completeTaskPlan(root, task.plan);
    } catch (err) {
      // A completion ERROR is never swallowed (that is how evidence-less plans used
      // to reach review). Surface it and refuse — the task stays running.
      return {
        ok: false,
        taskId: id,
        error: `plan completion failed: ${err && err.message ? err.message : String(err)}`,
        text: `Task ${id} NOT completed — the plan completion threw: ${stripCtl(String(err && err.message))}`,
      };
    }
    if (completion.blocked === true) {
      const detail = (completion.errors || []).map(stripCtl).join('; ');
      return {
        ok: false,
        taskId: id,
        blocked: true,
        error: 'plan failed pre-review validation',
        errors: completion.errors || [],
        text:
          `Task ${id} NOT completed — ${stripCtl(task.plan)} failed pre-review validation ` +
          `and stays in in-progress (this is a kickback, recorded by the circuit breaker): ${detail}`,
      };
    }
    // C7 (HIGH): an implement task that names a real plan MUST produce evidence to
    // complete. `ran: false` means the completion never ran (the plan file is nowhere in
    // in-progress/ or review/) — a hand-moved or mis-slugged plan. Settling the task DONE
    // here would report ok:true with ZERO evidence: the executor agent keys off
    // ok:true/verify.passed, so it would record a clean completion for a plan the gate can
    // never pass. REFUSE (task stays as it is); `ran:false` remains a soft report only for
    // kinds whose `plan` field names a NON-plan (review/decompose — excluded above).
    if (completion.ran === false) {
      return {
        ok: false,
        taskId: id,
        blocked: true,
        error: 'no plan file — completion produced no evidence',
        completion,
        text:
          `Task ${id} NOT completed — ${completion.reason ? stripCtl(String(completion.reason)) : 'the plan file was not found'}. ` +
          `An implement task must produce Gate-3 evidence; the task is left unsettled ` +
          `(check the plan slug / that the plan is in in-progress/ or review/).`,
      };
    }
  }

  // Settle the task through the compare-and-swap helper on a FRESH load — the completion
  // above may have run its OWN registry write (the task/plan coupling in completeExecution,
  // which now bumps the generation), so the pre-completion `reg` snapshot is stale and a
  // blind save of it would be (correctly) refused as a stale write. withRegistry reloads and
  // re-applies; the coupling may already have settled this task done → done→done is a no-op.
  const settled = taskRegistry.withRegistry(root, (fresh) => {
    const t = fresh.tasks.find((x) => x.id === id);
    if (t && t.status !== 'done') {
      taskRegistry.updateTask(fresh, id, { status: 'done', result });
    } else if (t) {
      // Already settled by the coupling — still record the caller's result payload.
      taskRegistry.updateTask(fresh, id, { result });
    }
    return fresh;
  });

  let text = `Task ${id} → done`;
  if (completion && completion.ran && completion.newPath) {
    // The words a person reads, not the pipeline's own vocabulary: no gate number,
    // no step name ("VERIFY"), no stage-to-stage arrow. The VERDICT survives intact —
    // re-wording a status line must never cost the reader the fact it carried.
    const verified = completion.verify
      ? (completion.verify.passed ? 'the checks passed' : 'the checks FAILED')
      : 'no checks were run';
    text += ` · moved to review (${verified}; the evidence is saved for when you decide it’s finished)`;
  } else if (completion && completion.ran === false) {
    text += ` · ${stripCtl(String(completion.reason))}`;
  }

  // NB3: a completion frees a slot → surface the scheduler's newly-runnable set for
  // the COMPLETION turn to promote (scheduler-consulted every completion, Decision 4),
  // with the concurrent-edit guard applied — the same guard, on the same terms, as the
  // dashboard-open path.
  const { promote, quarantined } = computePromote(settled);
  const res = {
    ok: true,
    taskId: id,
    status: 'done',
    text,
    completion,
    promote,
  };
  if (quarantined.length > 0) res.quarantined = quarantined;
  return res;
}

/** `menu task list` — a pure read of the registry for rendering. */
function taskList(root) {
  const reg = taskRegistry.load(root);
  return {
    ok: true,
    tasks: reg.tasks.map((t) => ({ id: t.id, kind: t.kind, status: t.status, label: t.label, plan: t.plan })),
    text: taskView.renderTaskList(reg),
  };
}

/**
 * `menu task <sub>` dispatcher. Mutations FAIL-SOFT at this boundary: an illegal
 * transition / unknown id / invalid kind is a caller error, not data corruption,
 * so it returns `{ok:false,error,text}` and the process still exits 0 with JSON —
 * the NAV plane never crashes. (task-registry.save stays fail-LOUD; a real write
 * failure surfaces its message here, never swallowed.)
 * @param {string[]} subArgs
 * @param {string} [projectPath]
 * @returns {Object}
 */
function taskCommand(subArgs, projectPath) {
  const root = getProjectPath(projectPath);
  const sub = subArgs[0];
  const rest = subArgs.slice(1);
  try {
    switch (sub) {
      case 'add': return taskAdd(root, rest);
      case 'start': return taskTransition(root, rest, 'start');
      case 'complete': return taskComplete(root, rest);
      case 'fail': return taskTransition(root, rest, 'fail');
      case 'cancel': return taskTransition(root, rest, 'cancel');
      case 'list': return taskList(root);
      case 'board': return taskView.renderTaskBoard(loadReg(root));
      default:
        return { ok: false, error: 'unknown task subcommand', text: `Unknown task subcommand: ${stripCtl(String(sub == null ? '' : sub))}` };
    }
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err), text: 'Task command failed.' };
  }
}

/**
 * The task-board screen (route `tasks` / `menu task board`).
 * @param {string} [projectPath]
 */
function taskBoardScreen(projectPath) {
  const root = getProjectPath(projectPath);
  return taskView.renderTaskBoard(loadReg(root));
}

/**
 * The task-detail screen (route `task <id>`).
 * @param {string} id
 * @param {string} [projectPath]
 */
function taskDetailScreen(id, projectPath) {
  const root = getProjectPath(projectPath);
  return taskView.renderTaskDetail(loadReg(root), id);
}

/**
 * Route a command string to the appropriate screen function
 *
 * @param {string[]} args - Command line arguments
 * @param {string} [projectPath] - Project root override
 * @returns {Object} Screen JSON { text, ask, actions }
 */
function route(args, projectPath, opts = {}) {
  if (!args || args.length === 0) {
    return dashboardPipeline(projectPath, opts);
  }

  const cmd = args[0];

  switch (cmd) {
    case 'menu':
      if (args[1] === 'commands') {
        return dashboardCommands(projectPath);
      }
      // NB2: `menu task <sub> …` records/reads background-task state.
      if (args[1] === 'task') {
        return taskCommand(args.slice(2), projectPath);
      }
      return dashboardPipeline(projectPath, opts);

    // NB2: distinct top-level nav commands (no collision with `menu task …`).
    case 'tasks':
      return taskBoardScreen(projectPath);

    case 'task':
      return taskDetailScreen(args[1], projectPath);

    // Streaming gate-decision routes. The reply to a streaming question IS the
    // human's action: `approve` crosses the gate through the gate-safe approvePlan
    // (never automatically — only via this human-answered reply), `skip` advances,
    // `comment` records a free-text note out-of-band. Bare `stream` re-renders the
    // current gate screen.
    case 'stream': {
      const sub = args[1];
      const ref = args[2];
      if (sub === 'approve') return streamingGate.streamApprove(ref, projectPath);
      if (sub === 'skip') return streamingGate.streamSkip(ref, projectPath);
      if (sub === 'comment') return streamingGate.streamComment(ref, args.slice(3).join(' '), projectPath);
      // `stream answer <ref> <questionId> <optionKey>` — record a precomputed-
      // question answer (out-of-band log; never edits the plan, never crosses a
      // gate) and advance to the next question / final Approve.
      if (sub === 'answer') return streamingGate.streamAnswer(ref, args[3], args[4], projectPath);
      return streamingGate.streamingGateScreen(projectPath);
    }

    // The classic pipeline dashboard stays reachable behind an explicit route, so
    // nothing is orphaned once the no-args default becomes the streaming screen.
    case 'dashboard':
      return dashboardPipeline(projectPath, opts);

    case 'browse':
      return stageBrowse(args[1], projectPath);

    case 'section':
      return sectionBrowse(args[1], projectPath);

    case 'inbox':
      // W1 doors: a reachable read-only list behind every dashboard inbox COUNT.
      if (args[1] === 'questions') return inboxQuestionsScreen(projectPath);
      if (args[1] === 'decisions') return inboxDecisionsScreen(projectPath);
      if (args[1] === 'gates') return inboxGatesScreen(projectPath);
      if (args[1] === 'escalations') return inboxEscalationsScreen(projectPath);
      if (args[1] === 'migration') return inboxMigrationScreen(projectPath);
      if (args[1] === 'verify') return inboxVerifyProposals(projectPath);
      if (args[1] === 'stale') return inboxStalePlansDrillIn(projectPath);
      if (args[1] === 'cleanup') {
        if (args[2] === 'category') return inboxCleanupCategoryPick(projectPath);
        if (args[2] === 'confirm') return inboxCleanupCategoryConfirm(args[3], projectPath); // <category>
        if (args[2] === 'plan') return inboxCleanupPlanReview(args[3], projectPath); // <slug>|undefined
        if (args[2] === 'override') return inboxCleanupPlanOverride(args[3], projectPath); // <slug>
        return inboxCleanupReview(projectPath); // bare 'inbox cleanup'
      }
      return dashboardPipeline(projectPath, opts); // unknown inbox subcommand → safe default

    // Opening a plan is a QUESTION, never a navigation menu. The old screens
    // (planActions / planActionsMore / reviewActions / discussMenu) asked "What
    // would you like to do with this plan?" over a list of routes; every one of
    // them is replaced by `planDecisionScreen`, which renders the plan's BODY and
    // asks the next real decision — the PRODUCT question when one is waiting, the
    // gate question only as a fallback. The `more` / `review` / `discuss`
    // sub-screens are gone: their decisions (delete, edit, critique, reject) are
    // carried on the one screen, so nothing is reachable only by navigating.
    case 'plan': {
      const ref = args[1]; // stage/file
      if (!ref) {
        return streamingGate.streamingGateScreen(projectPath);
      }
      return streamingGate.planDecisionScreen(ref, projectPath);
    }

    case 'stubs':
      return visionStubsBrowse(args[1], projectPath);

    case 'validate': {
      const ref = args[1];
      if (!ref) {
        return dashboardPipeline(projectPath, opts);
      }
      const slashIndex = ref.indexOf('/');
      if (slashIndex === -1) {
        return dashboardPipeline(projectPath, opts);
      }
      const stage = ref.substring(0, slashIndex);
      const file = ref.substring(slashIndex + 1);
      return validateScreen(stage, file, projectPath);
    }

    default:
      return dashboardPipeline(projectPath, opts);
  }
}

module.exports = {
  // Screen renderers
  dashboardPipeline,
  dashboardCommands,
  sectionBrowse,
  inboxQuestionsScreen,
  inboxDecisionsScreen,
  inboxGatesScreen,
  // NOTE: inboxEscalationsScreen is deliberately NOT exported. It is reached the way a
  // human reaches it — through `route(['inbox','escalations'])` — and exporting it
  // solely so a test could call it directly would add a dead export on the very day
  // the dead-export fence shipped. Tests drive it through the router, like the user.
  inboxStalePlansDrillIn,
  inboxVerifyProposals,
  inboxCleanupReview,
  inboxCleanupCategoryPick,
  inboxCleanupCategoryConfirm,
  inboxCleanupPlanReview,
  inboxCleanupPlanOverride,
  _buildCleanupItems,
  stageBrowse,
  visionStubsBrowse,
  // planActions / planActionsMore / reviewActions / discussMenu are GONE — opening a
  // plan is a question now (streaming-gate.planDecisionScreen), not a route list.
  validateScreen,
  // NB2 — task wiring
  taskCommand,
  taskBoardScreen,
  taskDetailScreen,
  // Router
  route,
  // Helpers (exported for testing)
  buildDashboardTable,
  getVersion,
  STAGE_FOLDERS,
  HUMAN_GATES
};
