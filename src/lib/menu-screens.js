/**
 * Menu Screens
 * Deterministic screen renderers for the CTOC state machine.
 * Every screen outputs JSON with { text, ask, actions }.
 *
 * Usage:
 *   node menu.js                            -> dashboardPipeline()
 *   node menu.js menu commands              -> dashboardCommands()
 *   node menu.js browse {stage}             -> stageBrowse(stage)
 *   node menu.js plan {stage}/{file}        -> planActions(stage, file)
 *   node menu.js plan {stage}/{file} more   -> planActionsMore(stage, file)
 *   node menu.js plan {stage}/{file} review -> reviewActions(stage, file)
 *   node menu.js plan {stage}/{file} discuss -> discussMenu(stage, file)
 *   node menu.js validate {stage}/{file}    -> validateScreen(stage, file)
 */

const fs = require('fs');
const path = require('path');
const { getPlanCounts, readPlans, getPlansDir, getAgentStatus, getVisionCounts, getVisionStubs } = require('./state');
const { SECTIONS, getSectionLabel, getStagesInSection, loadDashboardPrefs } = require('./sections');
const { getInboxCounts, listStaleCandidates } = require('./inbox');
// Namespace import (not destructured) preserves the spy seam: a test can rewire
// staleDetector.verifyStaleCandidate / classifyStaleCandidate at the require
// boundary. inboxVerifyProposals is the SOLE call site of verifyStaleCandidate.
const staleDetector = require('./stale-detector');
const { validateTransition } = require('./plan-validator');
const { findProjectRoot } = require('./project-root');

// Security (S1): strip C0 (0x00-0x1F) and C1 (0x7F-0x9F) control chars before
// rendering any attacker-influenceable string (e.g. a plan slug derived from a
// filename). An ESC / CR / BS / newline embedded in a slug could otherwise spoof
// or forge menu rows (ANSI clear-screen, cursor moves, mid-row line breaks).
// Defined once at module scope so any future slug renderer reuses one sanitizer.
const stripCtl = (s) => String(s).replace(/[\x00-\x1f\x7f-\x9f]/g, '');

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

// Stage flow: what stage comes next after approval
const NEXT_STAGE = {
  functional: 'implementation',
  implementation: 'todo',
  todo: 'in-progress',
  'in-progress': 'review',
  review: 'done'
};

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
 * Read VERSION file
 * @param {string} projectPath
 * @returns {string} Version string
 */
function getVersion(projectPath) {
  try {
    // When used as plugin, __dirname is the lib/ dir of the plugin
    const versionPath = path.join(__dirname, '..', '..', 'VERSION');
    return fs.readFileSync(versionPath, 'utf8').trim();
  } catch {
    return '?.?.?';
  }
}

/**
 * Build the dashboard table text
 * @param {string} projectPath
 * @returns {string} Dashboard table
 */
function buildDashboardTable(projectPath) {
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

  // Inbox (A3 — async-overnight surface; SP2 adds the possibly-stale stream)
  const inbox = getInboxCounts(root);
  const stale = inbox.staleCandidates || 0;
  const inboxTotal = inbox.questions + inbox.decisions + inbox.gatesWaiting + stale;
  out += `INBOX\n`;
  if (inboxTotal === 0) {
    out += `  ○ Inbox clear — no async items waiting\n`;
  } else {
    out += `  ⊙ ${inbox.questions} morning question${inbox.questions === 1 ? '' : 's'}\n`;
    out += `  ⊙ ${inbox.decisions} decision${inbox.decisions === 1 ? '' : 's'} awaiting review\n`;
    out += `  ⊙ ${inbox.gatesWaiting} plan${inbox.gatesWaiting === 1 ? '' : 's'} at gates\n`;
    // SP2: conditional — present iff > 0 (M2), absent when 0 (M3). "possibly-stale"
    // (not "stale") sets correct expectations: cheap detection is unverified (SP3).
    if (stale > 0) {
      out += `  ⊙ ${stale} possibly-stale plan${stale === 1 ? '' : 's'}\n`;
    }
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
function dashboardPipeline(projectPath) {
  const root = getProjectPath(projectPath);
  const counts = getPlanCounts(root);
  const visionCounts = getVisionCounts(root);

  const businessTotal = visionCounts.total + (counts.canvas || 0) + counts.functional;
  const implTotal     = counts.implementation + counts.todo;
  const execTotal     = counts.inProgress + counts.review + (counts.done || 0);

  const text = buildDashboardTable(root) + '\n\n\n';

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
        { label: 'Not now', description: 'Dismiss for this menu turn' },
      ],
    });
    actions['View stale plans'] = 'inbox stale'; // label key only — NEVER a digit
    actions['Not now'] = '';                      // no-op (driver falls through to pipeline answer)
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
  const hasCandidates = candidates.length > 0;
  const options = hasCandidates
    ? [
        { label: 'Verify', description: 'Run git-backed verification (read-only) and view proposals' },
        { label: '◀ Back', description: 'Return to dashboard' },
      ]
    : [{ label: '◀ Back', description: 'Return to dashboard' }];
  const actions = hasCandidates ? { Verify: 'inbox verify', '◀ Back': '' } : { '◀ Back': '' };

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

  return {
    text,
    ask: {
      questions: [{
        question: 'Select a command:',
        header: 'Commands',
        options
      }]
    },
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
  text += plans.length > 0
    ? `\n  Reply with a plan number (1-${plans.length}) to open it · n = new ${stage} plan · b = back\n\n\n`
    : `\n  Reply:  n = new ${stage} plan · b = back\n\n\n`;

  const actions = {};
  plans.forEach((plan, i) => {
    actions[`${i + 1}`] = `plan ${stage}/${plan.name}.md`;
  });
  // Word-keyed navigation — NEVER numeric.
  actions['n'] = `claude:create-plan ${stage}`;
  actions['new'] = `claude:create-plan ${stage}`;
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
 * Plan Actions Menu A
 * Shows: View, Discuss, Approve, More
 */
function planActions(stage, file, projectPath) {
  const root = getProjectPath(projectPath);
  const plansDir = getPlansDir(root);
  const folder = STAGE_FOLDERS[stage];
  const planPath = path.join(plansDir, folder, file);
  const planName = file.replace('.md', '');

  // Check if this is a review plan - if so, use review actions
  if (stage === 'review') {
    return reviewActions(stage, file, projectPath);
  }

  let text = `[${stage}] ${planName}\n`;
  text += `${'─'.repeat(40)}\n`;

  // Read summary if file exists
  if (fs.existsSync(planPath)) {
    const content = fs.readFileSync(planPath, 'utf8');
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      text += `\n  ${titleMatch[1]}\n`;
    }
  }

  text += '\n  Type "more" for delete and other actions.\n\n\n';

  const nextStage = NEXT_STAGE[stage];
  const approveLabel = nextStage ? `Approve → ${nextStage}` : 'Approve';

  // Every plan menu carries the same four verbs: Create, View/Edit, Discuss,
  // Approve. View and Edit are one action — opening a plan shows it and lets
  // you edit it in the same step.
  const options = [
    { label: 'Create new', description: `Create a new ${stage} plan` },
    { label: 'View/Edit', description: 'Show the plan, then edit it' },
    { label: 'Discuss', description: 'Critique and refine the plan' },
    { label: approveLabel, description: `Validate and move to ${nextStage || 'next stage'}` }
  ];

  const actions = {
    'Create new': `claude:create-plan ${stage}`,
    'View/Edit': `claude:view-edit ${stage}/${file}`,
    'Discuss': 'claude:discuss',
    [approveLabel]: `validate ${stage}/${file}`
  };

  return {
    text,
    ask: {
      questions: [{
        question: 'What would you like to do with this plan?',
        header: planName,
        options
      }]
    },
    actions
  };
}

/**
 * Plan Actions Menu B (More)
 * Shows: Edit, Delete, Back to list, Actions
 */
function planActionsMore(stage, file, projectPath) {
  const root = getProjectPath(projectPath);
  const plansDir = getPlansDir(root);
  const folder = STAGE_FOLDERS[stage];
  const planPath = path.join(plansDir, folder, file);
  const planName = file.replace('.md', '');

  let text = `[${stage}] ${planName}\n`;
  text += `${'─'.repeat(40)}\n`;

  if (fs.existsSync(planPath)) {
    const content = fs.readFileSync(planPath, 'utf8');
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      text += `\n  ${titleMatch[1]}\n`;
    }
  }

  text += '\n\n\n';

  // Edit merged into the main menu's View/Edit action; this secondary screen
  // now carries only Delete plus navigation. Reached by typing "more".
  const options = [
    { label: 'Delete', description: 'Remove this plan permanently' },
    { label: 'Back to list', description: `Return to ${stage} plan list` },
    { label: '◀ Actions', description: 'Return to main action menu' }
  ];

  const actions = {
    'Delete': `claude:delete ${stage}/${file}`,
    'Back to list': `browse ${stage}`,
    '◀ Actions': `plan ${stage}/${file}`
  };

  return {
    text,
    ask: {
      questions: [{
        question: 'Select an action:',
        header: planName,
        options
      }]
    },
    actions
  };
}

/**
 * Review Actions (unique for review stage)
 * Shows: View, Approve -> Done, Feedback -> Functional, Rework -> Implementation
 */
function reviewActions(stage, file, projectPath) {
  const root = getProjectPath(projectPath);
  const plansDir = getPlansDir(root);
  const folder = STAGE_FOLDERS[stage] || 'review';
  const planPath = path.join(plansDir, folder, file);
  const planName = file.replace('.md', '');

  let text = `[Review] ${planName}\n`;
  text += `${'─'.repeat(40)}\n`;

  if (fs.existsSync(planPath)) {
    const content = fs.readFileSync(planPath, 'utf8');
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      text += `\n  ${titleMatch[1]}\n`;
    }
  }

  text += '\n\n\n';

  // Review is the human gate: inspect, then approve or kick back. The four
  // slots are View/Edit plus the three gate transitions.
  const options = [
    { label: 'View/Edit', description: 'Show the plan, then edit it' },
    { label: 'Approve → Done', description: 'Validate and mark as complete' },
    { label: 'Feedback → Functional', description: 'Send back to functional for requirements rework' },
    { label: 'Rework → Implementation', description: 'Send back to implementation for technical rework' }
  ];

  const actions = {
    'View/Edit': `claude:view-edit review/${file}`,
    'Approve → Done': `validate review/${file}`,
    'Feedback → Functional': `claude:reject review/${file} functional`,
    'Rework → Implementation': `claude:reject review/${file} implementation`
  };

  return {
    text,
    ask: {
      questions: [{
        question: 'Review this plan:',
        header: 'Review',
        options
      }]
    },
    actions
  };
}

/**
 * Discussion Menu
 * Shown after Claude's critique of a plan
 */
function discussMenu(stage, file, projectPath) {
  const planName = file.replace('.md', '');
  const nextStage = NEXT_STAGE[stage];

  const text = `[Discussion] ${planName}\n\n\n`;

  const options = [
    { label: 'Continue', description: 'Continue the discussion' },
    { label: 'Apply edits', description: 'Make changes based on discussion' },
    { label: `Approve → ${nextStage || 'next'}`, description: `Validate and move to ${nextStage || 'next stage'}` },
    { label: 'Back to actions', description: 'Return to plan action menu' }
  ];

  const approveLabel = `Approve → ${nextStage || 'next'}`;

  const actions = {
    'Continue': 'claude:discuss',
    'Apply edits': 'claude:edit',
    [approveLabel]: `validate ${stage}/${file}`,
    'Back to actions': `plan ${stage}/${file}`
  };

  return {
    text,
    ask: {
      questions: [{
        question: 'How would you like to proceed?',
        header: 'Discussion',
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
    return {
      text: `Invalid plan reference: ${stage}/${file}\n${'─'.repeat(40)}\n\n  Refusing a reference that escapes the plans/ directory.\n\n\n`,
      ask: { questions: [{ question: 'Invalid reference.', header: 'Error', options: [{ label: '◀ Back', description: 'Return to dashboard' }] }] },
      actions: { '◀ Back': '' },
    };
  }
  const planPath = path.join(plansDir, folder, file);
  const nextStage = NEXT_STAGE[stage];

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

  let question;
  if (validationResult.valid) {
    question = validationResult.warnings.length > 0
      ? `${validationResult.warnings.length} warning(s). Proceed with approval?`
      : 'All checks passed. Proceed with approval?';
  } else {
    question = `${validationResult.errors.length} error(s) found. Fix issues or override?`;
  }

  const options = [];
  const actions = {};

  if (validationResult.valid) {
    options.push({ label: 'Confirm approve', description: `Move plan to ${nextStage}` });
    actions['Confirm approve'] = `claude:approve ${stage}/${file}`;
  } else {
    options.push({ label: 'Approve anyway', description: 'Override validation and move to next stage' });
    actions['Approve anyway'] = `claude:approve ${stage}/${file}`;
  }

  options.push({ label: 'Fix issues', description: 'Go back and fix the issues' });
  options.push({ label: 'Back', description: `Return to ${stage} list` });

  actions['Fix issues'] = `plan ${stage}/${file}`;
  actions['Back'] = `browse ${stage}`;

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
    validation: validationResult
  };
}

/**
 * Route a command string to the appropriate screen function
 *
 * @param {string[]} args - Command line arguments
 * @param {string} [projectPath] - Project root override
 * @returns {Object} Screen JSON { text, ask, actions }
 */
function route(args, projectPath) {
  if (!args || args.length === 0) {
    return dashboardPipeline(projectPath);
  }

  const cmd = args[0];

  switch (cmd) {
    case 'menu':
      if (args[1] === 'commands') {
        return dashboardCommands(projectPath);
      }
      return dashboardPipeline(projectPath);

    case 'browse':
      return stageBrowse(args[1], projectPath);

    case 'section':
      return sectionBrowse(args[1], projectPath);

    case 'inbox':
      if (args[1] === 'verify') return inboxVerifyProposals(projectPath);
      if (args[1] === 'stale') return inboxStalePlansDrillIn(projectPath);
      if (args[1] === 'cleanup') {
        if (args[2] === 'category') return inboxCleanupCategoryPick(projectPath);
        if (args[2] === 'confirm') return inboxCleanupCategoryConfirm(args[3], projectPath); // <category>
        if (args[2] === 'plan') return inboxCleanupPlanReview(args[3], projectPath); // <slug>|undefined
        if (args[2] === 'override') return inboxCleanupPlanOverride(args[3], projectPath); // <slug>
        return inboxCleanupReview(projectPath); // bare 'inbox cleanup'
      }
      return dashboardPipeline(projectPath); // unknown inbox subcommand → safe default

    case 'plan': {
      const ref = args[1]; // stage/file
      if (!ref) {
        return dashboardPipeline(projectPath);
      }
      const slashIndex = ref.indexOf('/');
      if (slashIndex === -1) {
        return dashboardPipeline(projectPath);
      }
      const stage = ref.substring(0, slashIndex);
      const file = ref.substring(slashIndex + 1);

      if (args[2] === 'more') {
        return planActionsMore(stage, file, projectPath);
      }
      if (args[2] === 'review') {
        return reviewActions(stage, file, projectPath);
      }
      if (args[2] === 'discuss') {
        return discussMenu(stage, file, projectPath);
      }
      return planActions(stage, file, projectPath);
    }

    case 'stubs':
      return visionStubsBrowse(args[1], projectPath);

    case 'validate': {
      const ref = args[1];
      if (!ref) {
        return dashboardPipeline(projectPath);
      }
      const slashIndex = ref.indexOf('/');
      if (slashIndex === -1) {
        return dashboardPipeline(projectPath);
      }
      const stage = ref.substring(0, slashIndex);
      const file = ref.substring(slashIndex + 1);
      return validateScreen(stage, file, projectPath);
    }

    default:
      return dashboardPipeline(projectPath);
  }
}

module.exports = {
  // Screen renderers
  dashboardPipeline,
  dashboardCommands,
  sectionBrowse,
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
  planActions,
  planActionsMore,
  reviewActions,
  discussMenu,
  validateScreen,
  // Router
  route,
  // Helpers (exported for testing)
  buildDashboardTable,
  getVersion,
  STAGE_FOLDERS,
  NEXT_STAGE,
  HUMAN_GATES
};
