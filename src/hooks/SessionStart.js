#!/usr/bin/env node
/**
 * CTOC Session Start Hook
 * Initializes session, detects stack, restores state
 */

const path = require('path');

const safeFs = require('../lib/safe-fs');

// Note: For Claude Code plugins, hooks are loaded relative to the plugin root
const { loadState, createState, saveState, STEP_NAMES, isInterruptedSession, formatTimeSince } = require('../lib/state-manager');
const { detectStack } = require('../lib/stack-detector');
const { getVersion } = require('../lib/version');
const { describeProjectRoot } = require('../lib/project-root');
const { writeToTerminal } = require('../lib/ui');

/**
 * Main session start handler.
 *
 * THE RULE (2026-07-20): a session never creates the evidence it will later read as
 * proof that a directory is a project. Scaffolding — the plan tree, the learnings
 * tree, the plan-index files, and CLAUDE.md — runs ONLY when resolution reports an
 * EVIDENCED marker (`marker !== 'fallback'`: a `.ctoc` root, a `plans` tree, a `.git`
 * repository, or a project file found on disk).
 *
 * The self-ratifying loop this closes: in an empty directory `describeProjectRoot`
 * returns `marker: 'fallback'` — an explicit admission it found no project. The old
 * hook discarded that and created `plans/vision` … `plans/done`; on the NEXT session
 * those very directories resolved as a confident `plans` marker, and CLAUDE.md (which
 * the lessons injector created) resolved as a `project-file` marker. The guess became
 * indistinguishable from a fact and ratified itself. Ownership of first-time
 * scaffolding belongs to the menu (`initProject`), where opening the menu is the
 * signal the human wants CTOC here; opening a terminal in a directory is not.
 */
async function main() {
  const rootInfo = describeProjectRoot(process.cwd());
  const projectPath = rootInfo.root;
  // Scaffolding requires an evidenced identification. `fallback` means resolution
  // itself could not identify a project — the one case where writing manufactures
  // the evidence a later session reads as proof.
  const identified = rootInfo.marker !== 'fallback';

  // 1. Detect project stack
  const stack = detectStack(projectPath);

  // 2. Load or create Iron Loop state
  let stateResult = loadState(projectPath);
  let state = stateResult.state;

  // 3. Check for interrupted session (crash recovery)
  if (state && isInterruptedSession(state)) {
    const stepName = STEP_NAMES[state.currentStep] || 'Unknown';
    const timeSince = formatTimeSince(state.lastActivity);

    const recoveryMenu = `
+------------------------------------------------------------+
|  INTERRUPTED IMPLEMENTATION DETECTED                       |
+------------------------------------------------------------+
|  Feature: ${(state.feature || 'Unknown').slice(0, 45).padEnd(45)}|
|  Step: ${state.currentStep} (${stepName})`.padEnd(61) + `|
|  Last activity: ${timeSince}`.padEnd(61) + `|
|                                                            |
|  [R] Resume - Continue from where it stopped               |
|  [S] Restart - Start implementation fresh from Step 7      |
|  [D] Discard - Abandon this implementation                 |
+------------------------------------------------------------+
`;
    writeToTerminal(recoveryMenu);
  }

  // 4. Create state if none exists
  if (!state) {
    state = createState(
      projectPath,
      null,
      stack.primary.language,
      stack.primary.framework
    );
    saveState(projectPath, state);
  } else {
    // Update session status
    state.sessionStatus = 'active';
    state.lastActivity = new Date().toISOString();
    saveState(projectPath, state);
  }

  // 5. Scaffolding + every project-WRITING side effect run ONLY for an EVIDENCED
  //    project. When resolution admits it could not identify a project
  //    (`marker === 'fallback'`) the session writes NOTHING into the working
  //    directory — see the self-ratifying-loop note on `main()`. State save at step 4
  //    is deliberately NOT gated: it writes only to the global `~/.ctoc/state/`
  //    (keyed by a hash of the project path), never into the project tree, so it can
  //    neither fabricate project identity nor feed any resolver marker.
  if (identified) {
    // 5a. Ensure project directories exist (created on first run). Fail-open: a
    //     broken filesystem (e.g. `plans` exists as a FILE) must never crash session
    //     start — the same fail-open contract every other side effect below already has.
    const directories = [
      // Plans workflow (matches init-project.js PLAN_DIRS)
      'plans/vision',
      'plans/canvas',          // PLAN_DIRS already has it; SessionStart was missing it
      'plans/functional',
      'plans/implementation',
      'plans/todo',
      'plans/in-progress',
      'plans/review',
      'plans/done',
      // Learnings system
      'learnings/pending',
      'learnings/approved',
      'learnings/applied'
    ];

    try {
      for (const subdir of directories) {
        const dir = path.join(projectPath, subdir);
        if (!safeFs.existsSync(dir)) {
          safeFs.mkdirSync(dir, { recursive: true });
        }
      }
    } catch (err) {
      console.error('[CTOC] Project directory scaffolding skipped:', err && err.message);
    }

    // 5b. Plan-index backfill kick (fire-and-forget, fail-open). Never blocks session
    //     start: the actual reconcile + calibration run in a DETACHED child process;
    //     this only spawns and returns. Double-guarded — kickBackfillBackground is
    //     itself non-throwing, and this try/catch is a belt-and-braces backstop so a
    //     missing/broken bootstrap module can NEVER break session start (the pi1 /
    //     task-reconcile precedent). It writes `.ctoc/index/` under the root, so it is
    //     inside the `identified` guard — under a fallback root it would manufacture a
    //     `.ctoc` the human never asked for.
    try {
      const { isBackfillNeeded, kickBackfillBackground } = require('../lib/plan-index/bootstrap');
      if (isBackfillNeeded(projectPath)) kickBackfillBackground(projectPath);
    } catch (err) {
      console.error('[CTOC] Plan-index backfill kick skipped:', err && err.message);
    }

    // 5c. Ensure CTOC-managed operating-lessons block in CLAUDE.md (fail-open).
    //     MUST NOT throw, block, or perceptibly slow session start. Double-guarded:
    //     ensureLessonsBlock itself never throws; the try/catch inside maybeInjectLessons
    //     is a belt-and-braces backstop. The self-repo guard now keys on PACKAGE IDENTITY
    //     (the project's own package.json name === 'ctoc', via the detector's isCtocRepo)
    //     rather than the running hook file's __dirname — so CTOC's own hand-maintained
    //     CLAUDE.md is protected from ANY install location (installed plugin or dev repo).
    //     It CREATES CLAUDE.md when absent, and CLAUDE.md is itself a `project-file`
    //     resolver marker — so it too lives inside the `identified` guard, closing the
    //     second self-ratifying route (a fabricated CLAUDE.md becoming tomorrow's proof).
    maybeInjectLessons(projectPath);
  }

  // 6. Check for updates (sync cache check only — no stderr output in hooks)
  const version = getVersion();
  const { checkForUpdatesSync } = require('../lib/version');
  const updateInfo = checkForUpdatesSync();

  // 7. Iron Loop self-check (fast mode — frontmatter-only scans, ~50ms target)
  let selfCheckSummary = null;
  try {
    const { checkAllInvariants, formatCompact } = require('../lib/iron-loop-enforcer');
    const sc = checkAllInvariants({ root: projectPath, mode: 'fast' });
    selfCheckSummary = formatCompact(sc);
  } catch (err) {
    // Self-check itself must never crash session start
    selfCheckSummary = `Self-check skipped: ${err.message}`;
  }

  // 8. Output context for Claude (to stdout for hook consumption). When plans are
  //    sitting at a gate without their decision questions, append the session-driven
  //    dispatch directive so the SESSION MODEL itself dispatches the producers — the
  //    plugin never spawns a second Claude (fail-open: any error → no directive).
  const context = generateContext(stack, state, version, updateInfo, selfCheckSummary, rootInfo);
  const directive = questionDispatchDirective(projectPath);
  // The durable-watchdog resume (plan 00231): when the human opens a new session and
  // an unfinished, fork-free batch has gone idle past the stall threshold, inject the
  // "drive the next unit" directive so the run picks up exactly where it stalled. Empty
  // (quiet start) for no batch / complete / forked / fresh / the kill-switch.
  const resume = resumeInjection(projectPath);
  // The Loop-B tick (plan 00226): one plain-language line describing the build loop's
  // state — what just auto-crossed on sufficiency, which plans still need questions, and
  // the next plan to build. Purely ADDITIVE and fail-open ('' when there is nothing to
  // report), so the injected context is byte-for-byte unchanged for an idle project.
  let loopB = '';
  try {
    loopB = require('../lib/loop-b-driver').loopBDirective(projectPath);
  } catch {
    loopB = ''; // the loop status must never break session start
  }
  console.log(context + (directive || '') + (resume || '') + (loopB || ''));
}

/**
 * The SESSION-DRIVEN question-dispatch directive (X7).
 *
 * The ruling: "there is no model calling, it is a plugin in the Claude command-line
 * interface, not using online API calls" and "session driven — when starting CTOC,
 * CTOC starts at least one subagent immediately to find open issues and generate
 * questions, preferably up to 5." Plain code cannot dispatch a CTOC subagent; only the
 * MODEL can. So SessionStart INJECTS an instruction and the session model acts on it —
 * it never spawns a second Claude (the deleted detached-spawn producer did exactly that).
 *
 * Requiring `streaming-precompute` here also keeps that module reachable from a hook
 * root: `plansNeedingQuestions` is the list of plans at a gate whose decision
 * questions are missing or stale. When it is EMPTY the directive is '' — no
 * session-start noise. When it is NON-EMPTY the directive names the concurrency cap
 * (up to 5), the stage producers, the adversarial critics, the real write path
 * (`streaming-precompute.writePlanQuestions`) with its schema, and every plan ref that
 * needs questions.
 *
 * FAIL-OPEN: any error (a bad root, a broken require) yields '' — the directive can
 * never break session start.
 *
 * @param {string} projectPath - absolute path to the project root
 * @returns {string} the directive to append to the injected context, or '' when
 *   nothing is pending.
 */
function questionDispatchDirective(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.length === 0) return '';
  let needing = [];
  try {
    const { plansNeedingQuestions } = require('../lib/streaming-precompute');
    needing = plansNeedingQuestions(projectPath);
  } catch {
    return '';
  }
  if (!Array.isArray(needing) || needing.length === 0) return '';
  const refs = needing
    .map((d) => d && d.ref)
    .filter((r) => typeof r === 'string' && r.length > 0);
  if (refs.length === 0) return '';

  const n = refs.length;
  return `
## Streaming questions — open forks awaiting the human (${n} plan${n === 1 ? '' : '(s)'})

Before other work, dispatch UP TO 5 CTOC subagents IN THE BACKGROUND to find open
issues and generate their questions — at least one, at most 5 at a time, refilling
as they complete:
  • producers, per plan stage — product-owner (functional), vision-advisor (vision),
    implementation-planner (implementation) — generate a plan's decision forks;
  • the adversarial critics — premortem-critic, devils-advocate-critic, red-team-critic
    — surface forks nobody has asked yet.
Each subagent writes its questions to the streaming store via
src/lib/streaming-precompute.js → writePlanQuestions(root, ref, questions, planMtimeMs),
questions = [{ id, prompt, critical?, important?, options:[{key,label,pros?,cons?}] }].
The human answers them in /ctoc:start; a plan with every fork answered that passes
validation crosses its pre-build gate by itself.

Plans needing questions: ${refs.join(', ')}
`;
}

/**
 * Read the configured stall threshold (minutes) from `.ctoc/settings.json`
 * (`continuation.stallMinutes`). Returns `undefined` for an absent / unreadable /
 * invalid value so the caller applies resume-watchdog's own 90-minute default.
 * FAIL-SOFT: never throws — a broken settings file must not affect session start.
 *
 * @param {string} projectPath - absolute path to the project root.
 * @returns {number|undefined} a positive number of minutes, or undefined to default.
 */
function readStallMinutes(projectPath) {
  try {
    const p = path.join(projectPath, '.ctoc', 'settings.json');
    if (!safeFs.existsSync(p)) return undefined;
    const parsed = JSON.parse(safeFs.readFileSync(p, 'utf8'));
    const v = parsed && parsed.continuation ? Number(parsed.continuation.stallMinutes) : NaN;
    return Number.isFinite(v) && v > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The durable-watchdog RESUME injection (plan 00231, resume-on-session-open subset).
 *
 * On every session start, load the persisted continuation batch state and ask
 * resume-watchdog whether it should be resumed — true ONLY for an active, fork-free
 * batch with remaining units that has gone idle past the stall threshold. When true,
 * inject `resumeDirective` so the session model picks the batch back up exactly where
 * it stalled; when false (no batch / complete / forked / fresh advance) inject nothing
 * — a quiet start. Requiring resume-watchdog here is also what keeps that module (and
 * its two exports) reachable from a live hook root.
 *
 * The existing kill-switch `CTOC_SKIP_CONTINUATION=1` disarms the whole never-idle
 * system, this injection included — one switch for rollback isolation.
 *
 * FAIL-OPEN: any error (bad root, broken require, unreadable state) yields '' — the
 * resume injection can never break session start, and never wrongly resumes.
 *
 * @param {string} projectPath - absolute path to the project root.
 * @returns {string} the resume directive to append, or '' when nothing should resume.
 */
function resumeInjection(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.length === 0) return '';
  if (process.env.CTOC_SKIP_CONTINUATION === '1') return '';
  try {
    const continuation = require('../lib/continuation');
    const { shouldResume, resumeDirective } = require('../lib/resume-watchdog');
    const state = continuation.status(projectPath);
    const verdict = shouldResume(state, Date.now(), { stallMinutes: readStallMinutes(projectPath) });
    if (!verdict || verdict.resume !== true) return '';
    return resumeDirective(state);
  } catch {
    return '';
  }
}

/**
 * Decide whether SessionStart may inject the CTOC-managed operating-lessons block
 * into a project's CLAUDE.md.
 *
 * Identity is by PACKAGE, not by file location: the project is CTOC's own repo iff
 * its own `package.json` declares `"name": "ctoc"` (the detector's `isCtocRepo`).
 * This helper uses no `__dirname`, so the decision is independent of where the
 * running hook file physically lives (installed plugin vs. cloned dev repo) — the
 * exact case the old `__dirname` guard got wrong.
 *
 * Fail-safe direction: if identity cannot be determined at all (e.g. the detector
 * module cannot be required), return `false` (do NOT inject) — protecting the
 * maintainer's hand-maintained file is the headline of this fix, and this matches
 * SessionStart's existing "any error → skip injection" behaviour. (`isCtocProject`
 * is itself internally non-throwing, so this catch is belt-and-braces.)
 *
 * @param {string} projectPath - Absolute path to the target project root.
 * @returns {boolean} true when the project is a consumer project safe to inject into.
 */
function shouldInjectLessons(projectPath) {
  try {
    return !require('../lib/ctoc-project-detector').isCtocProject(projectPath).isCtocRepo;
  } catch {
    return false;
  }
}

/**
 * Inject the CTOC operating-lessons block into a project's CLAUDE.md when the
 * package-identity guard allows it. No-op for CTOC's own repo. Never throws.
 *
 * `__dirname` is used here for its ONE legitimate purpose — locating the plugin's
 * OWN operating-lessons template to pass as `ensureLessonsBlock`'s source-of-content
 * (`ctocRoot`) fallback. That is a correct "find the plugin's own asset" use of
 * where the code lives; it is NOT used for target-project identity (that is
 * `shouldInjectLessons` above).
 *
 * @param {string} projectPath - Absolute path to the target project root.
 * @returns {void}
 */
function maybeInjectLessons(projectPath) {
  try {
    if (!shouldInjectLessons(projectPath)) return;
    // Template source only — locating the plugin's own lessons asset, NOT identity.
    const ctocRoot = path.resolve(__dirname, '..', '..');
    const { ensureLessonsBlock } = require('../lib/claude-md-lessons');
    const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
    ensureLessonsBlock(claudeMdPath, ctocRoot);
  } catch (err) {
    console.error('[CTOC] Lessons block injection skipped:', err && err.message);
  }
}

/**
 * Render the one-line databases summary for the session banner (DB-w1).
 *
 * This is the LIVE human-facing consumer that makes the databases capability data
 * wired-is-done: detectStack's dep-detected `databases` (each enriched from the
 * registry) surface here as "Databases: postgresql (RLS-capable, TLS-capable)".
 * Returns '' when no database is detected, so the banner is unchanged for projects
 * with no persistence layer — the render is purely ADDITIVE.
 *
 * TRUTHFUL WORDING (F5). The posture comes purely from the STATIC registry capability
 * for the database engine, NOT from any check on THIS project's actual connection. So it
 * is worded as a CAPABILITY ("RLS-capable", "TLS-capable"), never as a verified runtime
 * assertion about the project ("TLS required" wrongly read as "this project's connection
 * uses TLS").
 *
 * CRASH-SAFE + HIDE-NOTHING (F2/F5). SessionStart runs EVERY session and must never
 * throw. A null / non-object / nameless element is SKIPPED (it never dereferences
 * `.name` on null, and never renders a garbled "Databases: " header with nothing after).
 *
 * @param {{databases?: Array<{name: string, security?: Object}>}} stack
 * @returns {string} a leading-newline line, or '' when there is nothing to show.
 */
function formatDatabasesLine(stack) {
  const dbs = Array.isArray(stack?.databases) ? stack.databases : [];
  if (dbs.length === 0) return '';
  const parts = dbs.map((db) => {
    // F2: guard the element — a null/non-object/nameless entry is skipped, never a throw
    // and never a garbled header.
    const label = db && typeof db === 'object' && db.name ? String(db.name) : '';
    if (!label) return null;
    const sec = db.security && typeof db.security === 'object' ? db.security : {};
    // F5: capability wording — "-capable", not a "required"/"supported" runtime assertion.
    const posture = [];
    if (sec.rls === 'supported') posture.push('RLS-capable');
    else if (sec.rls === 'not-applicable') posture.push('RLS n/a');
    else if (sec.rls === 'not-native') posture.push('RLS not native');
    if (sec.connection === 'tls-required') posture.push('TLS-capable');
    else if (sec.connection === 'file-local') posture.push('file-local');
    return posture.length ? `${label} (${posture.join(', ')})` : label;
  }).filter((p) => p);
  if (parts.length === 0) return '';
  return `\nDatabases: ${parts.join(' · ')}`;
}

/**
 * Render the one-line frameworks summary for the session banner (FW-w1).
 *
 * The LIVE human-facing consumer that makes the frameworks capability data
 * wired-is-done: detectStack's registry-enriched `frameworkCapabilities` (each carrying
 * its framework-specific security concern areas) surface here as
 * "Frameworks: nextjs (security-headers, env-exposure, ssrf, auth-middleware) · django (csrf, xss)".
 * Returns '' when no framework is detected, so the banner is unchanged for projects
 * with no application framework — the render is purely ADDITIVE.
 *
 * HIDE NOTHING (F4). ALL security concerns are shown — never silently truncated. Dropping
 * concerns beyond the first two (the old `slice(0, 2)`) hid real security concerns (ssrf,
 * auth-middleware) from the human with no indicator, violating the project's hard
 * "never hide anything from the human, never by truncation" rule.
 *
 * CRASH-SAFE (F3). SessionStart runs EVERY session and must never throw. A null /
 * non-object / nameless element is SKIPPED (it never dereferences `.name` on null, and
 * never renders a garbled "Frameworks: " header with nothing after).
 *
 * @param {{frameworkCapabilities?: Array<{name: string, security?: {concerns?: string[]}}>}} stack
 * @returns {string} a leading-newline line, or '' when there is nothing to show.
 */
function formatFrameworksLine(stack) {
  const fws = Array.isArray(stack?.frameworkCapabilities) ? stack.frameworkCapabilities : [];
  if (fws.length === 0) return '';
  const parts = fws.map((fw) => {
    // F3: guard the element — a null/non-object/nameless entry is skipped, never a throw
    // and never a garbled header.
    const label = fw && typeof fw === 'object' && fw.name ? String(fw.name) : '';
    if (!label) return null;
    const concerns = fw.security && Array.isArray(fw.security.concerns) ? fw.security.concerns : [];
    // F4: show ALL concern areas — hide nothing from the human, no silent truncation.
    return concerns.length ? `${label} (${concerns.join(', ')})` : label;
  }).filter((p) => p);
  if (parts.length === 0) return '';
  return `\nFrameworks: ${parts.join(' · ')}`;
}

/**
 * Sanitize a resolver `fallbackReason` for the injected session context (SECURE).
 *
 * The reason can carry a raw filesystem error message (`walk failed: EACCES … '/…'`),
 * which would leak an absolute path — and on some machines a user name — into the
 * session context, and an unbounded message could flood it. Absolute paths (POSIX and
 * Windows) are replaced with `<path>`, whitespace is collapsed, and the result is
 * bounded so no stack frame can fit. The common reason ("no project marker found in
 * the examined ancestry") contains no path and is returned verbatim.
 *
 * @param {*} reason - the resolver's `fallbackReason` (any type; coerced safely).
 * @returns {string} a bounded, path-free diagnostic safe to inject.
 */
function sanitizeReason(reason) {
  return String(reason || '')
    .replace(/[A-Za-z]:\\[^\s'"]*/g, '<path>')      // Windows absolute path
    .replace(/\/[^\s'"]*/g, '<path>')                // POSIX absolute path (ReDoS-safe: single quantifier)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * Generate CTOC context instructions for Claude.
 *
 * @param {Object} [rootInfo] - the FULL `describeProjectRoot` verdict. The banner
 *   names the RESOLVED root (not `process.cwd()`), discloses a working-directory
 *   mismatch when `sameAsCwd === false`, and, when `marker === 'fallback'`, tells the
 *   human nothing was created and how to set the directory up. Absent (legacy 5-arg
 *   callers) → behaviour is exactly as before, rendered from `process.cwd()`.
 */
function generateContext(stack, state, version, updateInfo, selfCheckSummary, rootInfo) {
  const stepName = state?.feature ? STEP_NAMES[state.currentStep] : 'Ready';
  const updateLine = updateInfo?.updateAvailable
    ? `\nUpdate available: ${updateInfo.currentVersion} → ${updateInfo.latestVersion} (run: git pull origin main)`
    : '';
  const selfCheckLine = selfCheckSummary ? `\n${selfCheckSummary}` : '';
  const databasesLine = formatDatabasesLine(stack);
  const frameworksLine = formatFrameworksLine(stack);
  // The approved-queue depth the continuation gate will act on (slice 1 of the
  // "when CTOC starts it must not stop" mechanism). Lazy require matches this file's
  // style and keeps continuation-queue.js reachable from a live hook root. Fail-open:
  // the helper returns '' for a null/invalid root, so legacy 5-arg callers (no
  // rootInfo) and projects with no approved work render an unchanged banner.
  const approvedQueueLine = require('../lib/continuation-queue')
    .approvedQueueBannerLine(rootInfo && typeof rootInfo.root === 'string' ? rootInfo.root : null);

  // The banner renders from the RESOLVED root, never the working directory. A human
  // who opened a terminal in repo/src/lib/ is operating on repo/, and must be told so.
  const resolvedRoot = rootInfo && typeof rootInfo.root === 'string' ? rootInfo.root : process.cwd();
  const workingDir = rootInfo && typeof rootInfo.cwd === 'string' ? rootInfo.cwd : process.cwd();
  const mismatch = rootInfo ? rootInfo.sameAsCwd === false : false;
  const projectLine = mismatch
    ? `Project: ${path.basename(resolvedRoot)}  (working directory: ${path.basename(workingDir)})`
    : `Project: ${path.basename(resolvedRoot)}`;
  const unidentifiedLine = rootInfo && rootInfo.marker === 'fallback'
    ? `\nCTOC: no project identified here (${sanitizeReason(rootInfo.fallbackReason)}). Nothing has been created. Run /ctoc:start to set this directory up as a CTOC project.`
    : '';

  // NOTE: This 16-step banner is the compact, machine-readable copy. The CANONICAL
  // operating-lessons + methodology reference live in .ctoc/templates/operating-lessons.md.
  // Kept as a separate inline copy on purpose (no runtime file I/O on the hot session-start
  // path); the generateContext<->operating-lessons.md step labels are sync-guarded by
  // tests/claude-md-lessons.test.js (any divergence fails that test).
  return `
============================================================
CTOC v${version || '?'} - Your Virtual CTO is Active${updateLine}
============================================================
${projectLine}${unidentifiedLine}
Stack: ${stack.languages.join('/') || 'unknown'}${databasesLine}${frameworksLine}${approvedQueueLine}
Iron Loop: ${state?.feature ? `Step ${state.currentStep} (${stepName})` : 'Ready for new feature'}${selfCheckLine}

## Iron Loop (16 Steps) - NON-NEGOTIABLE

IDEATION (1) -> PLANNING (2-7) -> DEVELOPMENT (8-11) -> DELIVERY (12-16)

1:IDEATE -> 2:ASSESS -> 3:ALIGN -> 4:CAPTURE -> 5:PLAN -> 6:DESIGN -> 7:SPEC
8:TEST -> 9:PREPARE -> 10:IMPLEMENT -> 11:REVIEW
12:OPTIMIZE -> 13:SECURE -> 14:VERIFY -> 15:DOCUMENT -> 16:FINAL-REVIEW

## Commands

| Command | Action |
|---------|--------|
| /ctoc | Interactive dashboard (all features) |

## MANDATORY: Edit/Write Blocked Before Step 8

The Iron Loop is enforced by hooks. You CANNOT Edit or Write files until:
- Steps 1-4 complete (functional plan approved)
- Steps 5-7 complete (technical plan approved)
- Current step >= 8

Enforcement runs as a PreToolUse hook. When no active plan covers a file and you
have not typed an escape phrase, the hook blocks the edit. Escape phrases exist
(see /ctoc:start) and count ONLY when you type them yourself — the hook ignores an
escape phrase that appears in tool output or when a file such as CLAUDE.md is read.

## Red Lines (Never Compromise)

- No code without tests for critical paths
- No secrets in code
- No unhandled errors in production paths
- No undocumented public APIs

============================================================
`;
}

if (require.main === module) {
  main().catch(err => {
    console.error('[CTOC] Session start error:', err.message);
    process.exit(1);
  });
}

module.exports = { main, generateContext, questionDispatchDirective, resumeInjection, formatDatabasesLine, formatFrameworksLine, shouldInjectLessons, maybeInjectLessons };
