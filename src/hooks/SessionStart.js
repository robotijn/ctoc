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
const { findProjectRoot: findRoot } = require('../lib/project-root');
const { writeToTerminal } = require('../lib/ui');

/**
 * Find project root by looking for .git, .ctoc, or plans directory
 * Uses the shared utility from lib/project-root.js
 */
function findProjectRoot(startDir) {
  return findRoot(startDir);
}

/**
 * Main session start handler
 */
async function main() {
  const projectPath = findProjectRoot(process.cwd());

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

  // 5. Ensure project directories exist (created on first run)
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

  for (const subdir of directories) {
    const dir = path.join(projectPath, subdir);
    if (!safeFs.existsSync(dir)) {
      safeFs.mkdirSync(dir, { recursive: true });
    }
  }

  // 5a. Plan-index backfill kick (fire-and-forget, fail-open). Never blocks session
  //     start: the actual reconcile + calibration run in a DETACHED child process;
  //     this only spawns and returns. Double-guarded — kickBackfillBackground is
  //     itself non-throwing, and this try/catch is a belt-and-braces backstop so a
  //     missing/broken bootstrap module can NEVER break session start (the pi1 /
  //     task-reconcile precedent). Backfilling CTOC's own plans/ is desirable (it
  //     dogfoods), so no self-repo guard here.
  try {
    const { isBackfillNeeded, kickBackfillBackground } = require('../lib/plan-index/bootstrap');
    if (isBackfillNeeded(projectPath)) kickBackfillBackground(projectPath);
  } catch (err) {
    console.error('[CTOC] Plan-index backfill kick skipped:', err && err.message);
  }

  // 5b. Ensure CTOC-managed operating-lessons block in CLAUDE.md (fail-open).
  //     MUST NOT throw, block, or perceptibly slow session start. Double-guarded:
  //     ensureLessonsBlock itself never throws; the try/catch inside maybeInjectLessons
  //     is a belt-and-braces backstop. The self-repo guard now keys on PACKAGE IDENTITY
  //     (the project's own package.json name === 'ctoc', via the detector's isCtocRepo)
  //     rather than the running hook file's __dirname — so CTOC's own hand-maintained
  //     CLAUDE.md is protected from ANY install location (installed plugin or dev repo).
  maybeInjectLessons(projectPath);

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
  const context = generateContext(stack, state, version, updateInfo, selfCheckSummary);
  const directive = questionDispatchDirective(projectPath);
  console.log(directive ? context + directive : context);
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
 * Generate CTOC context instructions for Claude
 */
function generateContext(stack, state, version, updateInfo, selfCheckSummary) {
  const stepName = state?.feature ? STEP_NAMES[state.currentStep] : 'Ready';
  const updateLine = updateInfo?.updateAvailable
    ? `\nUpdate available: ${updateInfo.currentVersion} → ${updateInfo.latestVersion} (run: git pull origin main)`
    : '';
  const selfCheckLine = selfCheckSummary ? `\n${selfCheckSummary}` : '';
  const databasesLine = formatDatabasesLine(stack);
  const frameworksLine = formatFrameworksLine(stack);

  // NOTE: This 16-step banner is the compact, machine-readable copy. The CANONICAL
  // operating-lessons + methodology reference live in .ctoc/templates/operating-lessons.md.
  // Kept as a separate inline copy on purpose (no runtime file I/O on the hot session-start
  // path); the generateContext<->operating-lessons.md step labels are sync-guarded by
  // tests/claude-md-lessons.test.js (any divergence fails that test).
  return `
============================================================
CTOC v${version || '?'} - Your Virtual CTO is Active${updateLine}
============================================================
Project: ${path.basename(process.cwd())}
Stack: ${stack.languages.join('/') || 'unknown'}${databasesLine}${frameworksLine}
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

module.exports = { main, generateContext, questionDispatchDirective, formatDatabasesLine, formatFrameworksLine, shouldInjectLessons, maybeInjectLessons };
