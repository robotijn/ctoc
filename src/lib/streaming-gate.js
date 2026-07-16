'use strict';

/**
 * Streaming GATE-DECISION screen — the `/ctoc:menu` default.
 *
 * The owner's requirement: `/ctoc:menu` must ASK the human the pending gate
 * decisions ONE AT A TIME, not render a navigation dashboard. The plans sitting at
 * the three human gates ARE the real questions. This module computes that ordered
 * set of pending decisions and renders the { text, ask, actions } screen the menu
 * state machine already speaks.
 *
 * ── Scope of gates (documented) ────────────────────────────────────────────────
 * The gates here are EXACTLY the three edges `approvePlan` crosses
 * (gate-order.GATE_EDGES): functional→implementation (Gate 1),
 * implementation→todo (Gate 2), review→done (Gate 3). Vision → functional (Gate 0)
 * is deliberately EXCLUDED: `approvePlan` does not cross it — vision approval is a
 * separate stubs-handoff (`claude:approve-stubs`), not a gate approvePlan can
 * honor. Offering a vision here would produce an Approve action whose promise
 * (`stream approve` → approvePlan) cannot be kept ("Unknown plan location"). The
 * honest scope is the three approvePlan gates.
 *
 * ── Ordering (documented) ──────────────────────────────────────────────────────
 * CRITICAL-FIRST, then furthest-along-first by gate (review→done, then
 * implementation→todo, then functional→implementation), then FIFO within a gate.
 * Rationale: a plan carrying a criticality signal is surfaced before anything else;
 * absent that, the plan closest to shipping value (review) is decided first so
 * finished work is released soonest.
 *
 * ── Skip semantics (documented) ────────────────────────────────────────────────
 * `stream skip <ref>` is a WITHIN-PASS advance: it shows the next pending decision
 * AFTER <ref> in the ordered list and writes nothing. It intentionally does NOT
 * persist — a fresh `/ctoc:menu` open re-surfaces every still-pending decision,
 * which is correct: they are still pending and still the human's to decide. This
 * avoids a persistence/reset design with no behavioral gain.
 *
 * Pure reads never mutate. `stream approve` mutates ONLY through the gate-safe
 * `approvePlan` (which validates + stamps `approved_by: human` and REFUSES an
 * invalid transition). `stream comment` appends to an out-of-band log and never
 * touches a plan body or crosses a gate.
 */

const path = require('path');
const safeFs = require('./safe-fs');
const { readPlans, getPlansDir } = require('./state');
const { validateTransition } = require('./plan-validator');
const { approvePlan } = require('./actions');

// Security (mirrors menu-screens.stripCtl): strip C0/C1 control chars from any
// plan-derived string before rendering, so a hostile slug/title cannot inject
// ANSI/control sequences or forge screen rows.
const stripCtl = (s) => String(s).replace(/[\x00-\x1f\x7f-\x9f]/g, '');

// The three approvePlan gate edges, in furthest-along-FIRST order (Gate 3 → 2 → 1).
// Kept aligned with gate-order.GATE_EDGES; the gate NUMBER is the human-facing name.
const GATE_SOURCE_ORDER = ['review', 'implementation', 'functional'];
const GATE_META = Object.freeze({
  functional: { toStage: 'implementation', gate: 1 },
  implementation: { toStage: 'todo', gate: 2 },
  review: { toStage: 'done', gate: 3 },
});

/**
 * A plan reference's file part must be a bare filename inside a stage folder.
 * Anything with a path separator, a ".." segment, a NUL byte, or an absolute path
 * is a traversal attempt and is refused before the path is ever joined.
 * (Same rule as menu-screens.isUnsafePlanFile — duplicated locally to keep this
 * module's guard self-contained.)
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

/** Parse a `stage/file.md` ref into { stage, file } or null when malformed/unsafe. */
function parseRef(ref) {
  if (typeof ref !== 'string') return null;
  const slash = ref.indexOf('/');
  if (slash === -1) return null;
  const stage = ref.substring(0, slash);
  const file = ref.substring(slash + 1);
  if (!GATE_META[stage]) return null;
  if (isUnsafePlanFile(file)) return null;
  return { stage, file };
}

/** True when a plan's frontmatter carries a criticality signal. */
function isCritical(metadata) {
  if (!metadata || typeof metadata !== 'object') return false;
  const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();
  const pri = norm(metadata.priority);
  const crit = norm(metadata.criticality);
  const flag = norm(metadata.critical);
  return pri === 'critical'
    || crit === 'critical'
    || crit === 'high'
    || flag === 'true'
    || flag === 'yes';
}

/** Best-effort one-line title: the `# Heading`, else frontmatter title, else slug. */
function planTitle(plan) {
  const m = typeof plan.content === 'string' ? plan.content.match(/^#\s+(.+)$/m) : null;
  if (m) return stripCtl(m[1].trim());
  if (plan.metadata && plan.metadata.title) return stripCtl(String(plan.metadata.title).trim());
  return stripCtl(plan.name);
}

/**
 * The ORDERED list of plans currently sitting at a human gate awaiting the human's
 * approval decision. Pure read: never mutates. Fail-soft: readPlans skips an
 * unreadable/unparseable plan file, and a validator that throws degrades that plan
 * to passesValidation:false rather than crashing the whole list.
 *
 * @param {string} projectRoot
 * @returns {Array<{ref:string, slug:string, title:string, summary:string,
 *   fromStage:string, toStage:string, gateName:string, passesValidation:boolean,
 *   critical:boolean}>}
 */
function pendingGateDecisions(projectRoot) {
  const plansDir = getPlansDir(projectRoot);
  const out = [];

  for (const stage of GATE_SOURCE_ORDER) {
    const meta = GATE_META[stage];
    let plans;
    try {
      plans = readPlans(path.join(plansDir, stage)); // fail-soft, FIFO-ordered
    } catch {
      plans = []; // a stage read failure must never brick the whole list
    }
    for (const plan of plans) {
      let passesValidation = false;
      try {
        const v = validateTransition(plan.path, stage, meta.toStage, projectRoot);
        passesValidation = !(v && v.valid === false);
      } catch {
        passesValidation = false; // an exploding validator → honestly "does not pass"
      }
      const title = planTitle(plan);
      out.push({
        ref: `${stage}/${plan.name}.md`,
        slug: stripCtl(plan.name),
        title,
        summary: title,
        fromStage: stage,
        toStage: meta.toStage,
        gateName: `Gate ${meta.gate}`,
        passesValidation,
        critical: isCritical(plan.metadata),
      });
    }
  }

  // Stable critical-first partition: criticals keep their relative (gate) order.
  const critical = out.filter(d => d.critical);
  const rest = out.filter(d => !d.critical);
  return critical.concat(rest);
}

/** Build the option list; the RECOMMENDED option is placed FIRST (menu convention). */
function buildOptions(d) {
  const approve = {
    label: 'Approve',
    description: d.passesValidation
      ? 'Recommended — passes validation. Cross the gate now (records approved_by: human).'
      : 'This plan FAILS validation — approving is refused. Open it first to fix it.',
  };
  const open = {
    label: 'Open the plan',
    description: d.passesValidation
      ? 'View the plan before deciding.'
      : 'Recommended — this plan fails validation; open it to see what to fix.',
  };
  const skip = { label: 'Skip for now', description: 'Move to the next pending decision (nothing is changed).' };
  // Recommended-first: Approve leads on a clean plan; Open leads when it fails.
  return d.passesValidation ? [approve, open, skip] : [open, approve, skip];
}

/**
 * The "nothing pending" screen — shown when there are no gate decisions. It says
 * so and offers to start something new or open the dashboard. It is NOT the
 * dashboard itself.
 * @param {string} [statusLine] optional one-line status to prepend
 */
function nothingPendingScreen(statusLine) {
  let text = '';
  if (statusLine) text += `${stripCtl(statusLine)}\n\n`;
  text += `No gate decisions pending\n${'─'.repeat(40)}\n\n`;
  text += '  Every plan at a human gate has been decided. Start something new, or\n';
  text += '  open the dashboard for the full pipeline overview.\n\n\n';
  return {
    text,
    ask: {
      questions: [{
        question: 'Nothing waiting at a gate — what next?',
        header: 'Gate decisions',
        options: [
          { label: 'Start something new', description: 'Enter Vision Mode to explore a new idea' },
          { label: 'Open the dashboard', description: 'Show the full pipeline overview (all phases)' },
        ],
      }],
    },
    actions: {
      'Start something new': 'claude:vision',
      'Open the dashboard': 'dashboard',
    },
  };
}

/**
 * Build the focused single-decision screen for decisions[index]. When the index is
 * out of range (nothing left), returns the nothing-pending screen (carrying any
 * status line). `statusLine` reports what the previous action just did.
 */
function gateScreenAt(decisions, index, statusLine) {
  if (!Array.isArray(decisions) || index < 0 || index >= decisions.length) {
    return nothingPendingScreen(statusLine);
  }
  const d = decisions[index];
  const total = decisions.length;

  let text = '';
  if (statusLine) text += `${stripCtl(statusLine)}\n\n`;
  text += `Topic: ${d.slug}  ·  ${d.gateName} (${d.fromStage} → ${d.toStage})  ·  decision ${index + 1} of ${total}\n`;
  text += `${'─'.repeat(40)}\n\n`;
  text += `  ${d.summary}\n\n\n`;

  const actions = {
    'Approve': `stream approve ${d.ref}`,
    'Open the plan': `plan ${d.ref}`,
    'Skip for now': `stream skip ${d.ref}`,
    // AskUserQuestion's built-in "Other" free-text path records a comment.
    'Other': `stream comment ${d.ref}`,
  };

  return {
    text,
    ask: {
      questions: [{
        question: `Approve ${d.slug} across ${d.gateName}?`,
        header: d.gateName,
        options: buildOptions(d),
      }],
    },
    actions,
  };
}

/**
 * The streaming gate screen: the FIRST pending decision, or the nothing-pending
 * screen when the queue is empty. This is the new `/ctoc:menu` default.
 * @param {string} projectRoot
 * @param {string} [statusLine]
 */
function streamingGateScreen(projectRoot, statusLine) {
  const decisions = pendingGateDecisions(projectRoot);
  return gateScreenAt(decisions, 0, statusLine);
}

/**
 * Advance to the next pending decision AFTER `ref`, carrying a status line. Used by
 * skip/comment where the plan is unchanged and still present: the next is the one
 * after it in the ordered list.
 */
function advanceAfter(ref, projectRoot, statusLine) {
  const decisions = pendingGateDecisions(projectRoot);
  const idx = decisions.findIndex(d => d.ref === ref);
  const nextIndex = idx >= 0 ? idx + 1 : 0;
  return gateScreenAt(decisions, nextIndex, statusLine);
}

/**
 * Advance to the next pending decision, EXCLUDING every decision for `slug`. Used
 * after an approve: a plan crossed functional→implementation lands in
 * implementation/ (also a gate-source stage) and would otherwise immediately
 * re-surface at Gate 2 — but it is not ready to cross Gate 2 yet (its
 * implementation details are still being generated). Excluding its slug for this
 * turn skips that noise; it re-surfaces on a later, deliberate open once ready.
 * A refused plan (unmoved) is likewise skipped past for the turn rather than
 * re-asked first.
 */
function advanceExcludingSlug(slug, projectRoot, statusLine) {
  const decisions = pendingGateDecisions(projectRoot).filter(d => d.slug !== slug);
  return gateScreenAt(decisions, 0, statusLine);
}

/**
 * `stream approve <ref>` — the human answered "Approve". This reply IS the human's
 * gate approval. Cross via the gate-safe `approvePlan` (validates + stamps
 * `approved_by: human`; REFUSES an invalid transition). Surface the refusal; never
 * override it. Returns the NEXT pending decision with a one-line status.
 */
function streamApprove(ref, projectRoot) {
  const parsed = parseRef(ref);
  if (!parsed) {
    return streamingGateScreen(projectRoot, `Ignored an invalid plan reference: ${stripCtl(String(ref))}`);
  }
  const planPath = path.join(getPlansDir(projectRoot), parsed.stage, parsed.file);
  let statusLine;
  try {
    const res = approvePlan(planPath, projectRoot);
    if (res && res.refused) {
      statusLine = `Refused ${parsed.file}: ${stripCtl(String(res.reason || 'failed validation'))}`;
    } else {
      // approvePlan crossed the gate (it either returns { newPath, … } or throws /
      // refuses — there is no silent no-op return).
      statusLine = `Approved ${parsed.file} → ${GATE_META[parsed.stage].toStage} (approved_by: human).`;
    }
  } catch (err) {
    statusLine = `Could not approve ${parsed.file}: ${stripCtl((err && err.message) || String(err))}`;
  }
  const slug = parsed.file.replace(/\.md$/, '');
  return advanceExcludingSlug(slug, projectRoot, statusLine);
}

/**
 * `stream skip <ref>` — advance to the next pending decision after `ref`. Writes
 * nothing (see the skip-semantics note at the top of this file).
 */
function streamSkip(ref, projectRoot) {
  const parsed = parseRef(ref);
  const label = parsed ? parsed.file : stripCtl(String(ref));
  return advanceAfter(ref, projectRoot, `Skipped ${label} for now.`);
}

/**
 * `stream comment <ref> <text>` — record a free-text comment to an append-only log
 * (`.ctoc/streaming/comments.jsonl`). The LEAST-invasive record: it never edits the
 * plan body and never crosses a gate. Then advance to the next decision.
 */
function streamComment(ref, text, projectRoot) {
  const parsed = parseRef(ref);
  const comment = stripCtl(String(text == null ? '' : text)).trim();
  if (!parsed) {
    return streamingGateScreen(projectRoot, `Ignored a comment for an invalid reference: ${stripCtl(String(ref))}`);
  }
  let status;
  try {
    const dir = path.join(projectRoot, '.ctoc', 'streaming');
    if (!safeFs.existsSync(dir)) safeFs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ref,
      slug: parsed.file.replace(/\.md$/, ''),
      comment,
    }) + '\n';
    safeFs.appendFileSync(path.join(dir, 'comments.jsonl'), line, 'utf8');
    status = `Comment recorded for ${parsed.file}.`;
  } catch (err) {
    status = `Could not record the comment for ${parsed.file}: ${stripCtl((err && err.message) || String(err))}`;
  }
  return advanceAfter(ref, projectRoot, status);
}

module.exports = {
  pendingGateDecisions,
  streamingGateScreen,
  streamApprove,
  streamSkip,
  streamComment,
};
