'use strict';

/**
 * Streaming GATE-DECISION screen — the `/ctoc:start` default.
 *
 * The owner's requirement: `/ctoc:start` must ASK the human the pending gate
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
 * persist — a fresh `/ctoc:start` open re-surfaces every still-pending decision,
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
const { approvePlan, movePlan } = require('./actions');
const gateOrder = require('./gate-order');
const gateWords = require('./gate-words');

// PRE-BUILD gate destinations (X6): the gates reached BEFORE any code is built,
// derived from the ONE gate-edge encoding, never hardcoded. A destination is
// pre-build iff it precedes the build phase (which begins at `in-progress`) in the
// stage order — implementation and todo qualify, `done` does not. A plan with ENOUGH
// INFORMATION crosses these gates by itself; `done` (Gate 3) is out of scope — it
// asks whether the work was built correctly, which a sufficiency verdict cannot
// answer. This mirrors `human-gate-check.PRE_BUILD_GATES` (same derivation).
const BUILD_PHASE_START = gateOrder.STAGE_ORDER.indexOf('in-progress');
const PRE_BUILD_DESTINATIONS = new Set(
  gateOrder.GATE_DESTINATIONS.filter((d) => gateOrder.STAGE_ORDER.indexOf(d) < BUILD_PHASE_START),
);

// Security (mirrors menu-screens.stripCtl): strip C0/C1 control chars from any
// plan-derived string before rendering, so a hostile slug/title cannot inject
// ANSI/control sequences or forge screen rows.
const stripCtl = (s) => String(s).replace(/[\x00-\x1f\x7f-\x9f]/g, '');

// The three approvePlan gate edges, in furthest-along-FIRST order (review first).
// Kept aligned with gate-order.GATE_EDGES.
//
// THERE IS NO GATE NUMBER HERE, deliberately. This table used to carry one, and the
// comment above it used to say the number WAS the human-facing name — that sentence
// was the defect, written down. What a human reads at each of these moments now
// comes from `gate-words`, which encodes what the moment IS. The field is DELETED
// rather than renamed: while it exists, somebody renders it.
const GATE_SOURCE_ORDER = ['review', 'implementation', 'functional'];
const GATE_META = Object.freeze({
  functional: { toStage: 'implementation' },
  implementation: { toStage: 'todo' },
  review: { toStage: 'done' },
});

/**
 * The ONLY plan file names this module passes on. A plan's reference reaches a command
 * line — the session runs `menu task add precompute <ref> …` for "Generate its
 * questions", and the Approve, Skip and comment actions carry the same reference — so a
 * name is restricted to plain characters before any descriptor or action is built from
 * it. A file named `x$(curl … | sh).md` is refused here, not escaped downstream.
 */
const SAFE_PLAN_FILE = /^[A-Za-z0-9_][A-Za-z0-9._-]*\.md$/;

/**
 * A plan reference's file part must be a bare, plain-character filename inside a stage
 * folder. Anything with a path separator, a ".." segment, a NUL byte, or an absolute
 * path is a traversal attempt, and anything outside SAFE_PLAN_FILE is a name CTOC will
 * not pass to a command; both are refused before the path is ever joined. (Stricter
 * than menu-screens.isUnsafePlanFile, which keeps only the traversal rule.)
 */
function isUnsafePlanFile(file) {
  return typeof file !== 'string'
    || file === ''
    || file.includes('/')
    || file.includes('\\')
    || file.includes('\0')
    || file.split(/[\\/]/).includes('..')
    || file.includes('..')
    || path.isAbsolute(file)
    || !SAFE_PLAN_FILE.test(file);
}

/**
 * How many plan files at a decision stage have a name `isUnsafePlanFile` refuses — the
 * plans `pendingGateDecisions` leaves out. Counted so the screen can say so: a plan
 * that silently vanished from the decisions would be hidden from the human. Fail-soft:
 * an unreadable stage directory counts zero (the decisions list skips it the same way).
 * @param {string} projectRoot
 * @returns {number}
 */
function countUnsafePlanFiles(projectRoot) {
  let n = 0;
  const plansDir = getPlansDir(projectRoot);
  for (const stage of GATE_SOURCE_ORDER) {
    let names = [];
    try {
      names = safeFs.readdirSync(path.join(plansDir, stage));
    } catch {
      names = []; // an unreadable stage is skipped by the decisions list too
    }
    for (const name of names) {
      if (typeof name === 'string' && name.endsWith('.md') && isUnsafePlanFile(name)) n += 1;
    }
  }
  return n;
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

// ── Opening a plan ───────────────────────────────────────────────────────────
// Every stage a plan file can sit in. `parseRef` above is deliberately narrow (the
// three approvePlan gate stages); OPENING a plan is legitimate at any stage, so the
// plan route needs its own, wider parser with the identical traversal guard.
const ALL_STAGES = Object.freeze({
  canvas: true,
  functional: true,
  implementation: true,
  todo: true,
  'in-progress': true,
  review: true,
  done: true,
});

/** Parse a `stage/file.md` ref for ANY known stage, or null when malformed/unsafe. */
function parseAnyRef(ref) {
  if (typeof ref !== 'string') return null;
  const slash = ref.indexOf('/');
  if (slash === -1) return null;
  const stage = ref.substring(0, slash);
  const file = ref.substring(slash + 1);
  if (!ALL_STAGES[stage]) return null;
  if (isUnsafePlanFile(file)) return null;
  return { stage, file };
}

/**
 * The refusal screen for a reference that escapes plans/ or names no known stage.
 * Mirrors menu-screens.invalidPlanRefScreen exactly (same text, same shape). It is
 * duplicated rather than imported because menu-screens requires THIS module — an
 * import back would close a load-time cycle.
 */
function invalidPlanRefScreen(stage, file) {
  return {
    text: `Invalid plan reference: ${stripCtl(String(stage))}/${stripCtl(String(file))}\n${'─'.repeat(40)}\n\n  Refusing a reference that escapes the plans/ directory.\n\n\n`,
    ask: { questions: [{ question: 'Invalid reference.', header: 'Error', options: [{ label: '◀ Back', description: 'Return to the pending decisions' }] }] },
    actions: { '◀ Back': '' },
  };
}

/**
 * Drop every LEADING frontmatter block and return the body that follows.
 *
 * Plans in this repository routinely carry TWO stacked frontmatter blocks — an
 * `approved_by: human` approval block, a blank line, then the real
 * `title`/`type`/`files` block. `state.parseMetadata` already merges stacked blocks
 * for METADATA (via stale-detector.extractFrontmatterRegion), but rendering needs
 * the opposite operation: skip ALL of them and show the prose. Skipping only the
 * first block would print the second block's raw YAML at the top of the body.
 *
 * Reading-only: this never edits a plan.
 *
 * @param {string} content
 * @returns {string} the body after the leading frontmatter blocks
 */
function stripLeadingFrontmatter(content) {
  if (typeof content !== 'string' || content.length === 0) return '';
  const lines = content.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  while (i < lines.length && lines[i].trim() === '---') {
    let j = i + 1;
    let closed = false;
    while (j < lines.length) {
      if (lines[j].trim() === '---') { closed = true; break; }
      j++;
    }
    if (!closed) break; // unterminated block — leave the text alone
    i = j + 1;
    while (i < lines.length && lines[i].trim() === '') i++;
  }
  return lines.slice(i).join('\n');
}

/**
 * A plan with nothing in it. `stripLeadingFrontmatter` drops every stacked
 * frontmatter block; what remains is what a human would read. A file carrying only a
 * `# Heading` and no other content counts as EMPTY: a title is a LABEL, not a plan,
 * and nobody can decide whether a label is finished — so a title-only file is exactly
 * as undecidable as a blank one (Decision 4 in plan 00155, the judgement most likely
 * to be argued with, pinned by case 5 of its test).
 *
 * Only a SINGLE leading top-level `# ` heading is stripped: one title-as-label, no
 * more. A second heading, a sentence, a list — any non-heading, non-whitespace
 * character — makes the plan non-empty.
 *
 * Never throws; a non-string input is empty.
 *
 * @param {string} content raw plan file content (already read by the caller — no re-read)
 * @returns {boolean}
 */
function isEmptyPlan(content) {
  if (typeof content !== 'string') return true;
  const body = stripLeadingFrontmatter(content).replace(/^\s*#\s+[^\n]*\n?/, '');
  return body.trim() === '';
}

// A plan body is shown in full up to this many lines; beyond it the body is cut and
// the cut is DISCLOSED (never silently swallowed).
const MAX_BODY_LINES = 120;

// At most this many declared `files:` entries are printed at the gate; beyond it the
// list is cut and the remainder DISCLOSED, mirroring MAX_BODY_LINES' honesty.
const MAX_SCOPE_ENTRIES = 40;

/** "1 file" / "N files" — singular is not a rounding error a human should read. */
function fileWord(n) {
  return n === 1 ? '1 file' : `${n} files`;
}

/**
 * The SCOPE block — the files an approval grants write access to, rendered between
 * the plan title and its body so a human sees WHAT they are consenting to before the
 * prose. The `files:` list IS the write permission (plan-coverage.findCoveringPlan
 * reads it; the enforcement hook allows/refuses every edit on it), and until this
 * block existed the gate screen stripped it with the frontmatter — showing the human
 * everything about the plan EXCEPT the one line that carries consequence.
 *
 * Follows renderPlanBody's conventions exactly: `stripCtl` on every emitted line (a
 * hostile `files:` entry is author-controlled text arriving on a screen and must not
 * forge rows or emit ANSI), two-space indentation, an HONEST disclosure whenever
 * anything is cut, and — critically — a fault renders a LINE, never an empty string
 * (empty is indistinguishable from "grants nothing", the most reassuring possible lie
 * about a permission). TOTAL by contract: it never throws, so the gate screen's only
 * approval surface can never be taken down by this display feature.
 *
 * The count is computed by declared-breadth.countMatching — the SAME glob matcher the
 * enforcement hook uses, so the number shown is the number that will be granted. A
 * count that cannot be computed prints as "not counted", NEVER as 0.
 *
 * @param {string} content raw plan file content (already read by the caller — no re-read)
 * @param {string} projectRoot repository root the declaration is rooted at
 * @param {{ maxEntries?: number }} [opts] forwarded to countMatching (walk cap; for tuning/tests)
 * @returns {string}
 */
function renderDeclaredScope(content, projectRoot, opts) {
  try {
    const planCoverage = require('./plan-coverage');
    const declaredBreadth = require('./declared-breadth');
    const declared = planCoverage.readPlanFiles(null, content);
    if (!Array.isArray(declared) || declared.length === 0) {
      return '  Scope — this plan declares no files.\n';
    }
    const shown = declared.slice(0, MAX_SCOPE_ENTRIES);
    const hidden = declared.length - shown.length;
    const res = declaredBreadth.countMatching(shown, projectRoot, opts);

    let out = '  Scope — what approving this grants write access to:\n';
    for (const g of res.perGlob) {
      const countText = g.count === null ? 'not counted' : fileWord(g.count);
      const marker = g.anchored ? '' : '  ← rooted at the repository';
      out += stripCtl(`    ${g.glob}  —  ${countText}${marker}`) + '\n';
      if (!g.anchored) {
        out += stripCtl(`    (this plan declares an unanchored scope: "${g.glob}")`) + '\n';
      }
    }
    if (res.capped) {
      const cap = opts && Number.isInteger(opts.maxEntries) && opts.maxEntries > 0 ? opts.maxEntries : 20000;
      out += `    more than ${cap} entries — not counted\n`;
    } else if (res.total === null) {
      out += '    total — the scope size could not be counted\n';
    } else {
      out += `    ${fileWord(res.total)} total\n`;
    }
    if (hidden > 0) {
      out += `    … ${hidden} more entries — open the file to read the rest.\n`;
    }
    return out;
  } catch {
    // TOTAL by contract: a fault renders a line, never an empty string, and never
    // takes the gate screen down.
    return '  Scope — the declared file list could not be read.\n';
  }
}

/**
 * The plan's body, ready to render: frontmatter dropped, control characters
 * stripped (a hostile plan must not be able to forge screen rows or emit ANSI), and
 * bounded to MAX_BODY_LINES with an honest "… N more lines" notice.
 *
 * @param {string} content raw plan file content
 * @returns {string}
 */
function renderPlanBody(content) {
  const body = stripLeadingFrontmatter(content).replace(/\s+$/, '');
  if (body === '') return '  (this plan file has no body yet)\n';
  const lines = body.split('\n').map((l) => stripCtl(l));
  const shown = lines.slice(0, MAX_BODY_LINES);
  let out = shown.map((l) => (l === '' ? '' : `  ${l}`)).join('\n');
  if (lines.length > MAX_BODY_LINES) {
    out += `\n\n  … ${lines.length - MAX_BODY_LINES} more lines — open the file to read the rest.`;
  }
  return out + '\n';
}

/**
 * The next question for `ref` that the human has not answered yet, or null when
 * there are no fresh precomputed questions or every one is already answered.
 *
 * This is the PRODUCT-question lookup. The questions are written ahead of time by
 * the dispatcher (`streaming-precompute.writePlanQuestions`) from what the
 * `product-owner` / vision agents emit and what the adversarial gate-critique fleet
 * synthesizes. The read is instant and fail-soft — the human NEVER waits for a
 * critique to run.
 *
 * It binds answers EXACTLY as the gate does: it passes the questions to the one reader
 * (`readAnsweredQuestionIds`), so an entry counts only when it names one of the question's
 * option keys and carries that question's `questionDigest` — the screen never stops asking a
 * question the gate still counts as open. A plan the human holds gets CTOC's own
 * keep-or-release question (`holdQuestion`, `held: true`) whatever its question file now
 * holds. Otherwise the first unanswered question that goes to the human
 * (`streaming-precompute.goesToHuman`, the gate's own rule), else the first unanswered one.
 *
 * @param {string} root
 * @param {string} ref
 * @returns {{ question: object, index: number, total: number, held: boolean }|null}
 */
function nextUnansweredQuestion(root, ref) {
  if (!isNonEmptyStr(root)) return null;

  // X9: promote any question file the gate critic dropped in the quarantine
  // directory BEFORE reading the store. The lazy require + try/catch mirrors the
  // established pattern below (lines ~246 and ~324): a sweeper failure must never
  // reach the render. The sweep is idempotent and cheap (a readdir of a normally
  // empty directory).
  //
  // WHY HERE and not menu-screens.buildDashboardTable: this function is the single
  // funnel BOTH question consumers pass through — richQuestionScreen (serving
  // streamingGateScreen / advanceAfter / advanceExcludingSlug) and
  // planDecisionScreen. The dashboard's on-open reconcile is the PATTERN this
  // copies (render-time, best-effort, never blocking), but the dashboard is not
  // where questions are read, so sweeping only there would leave a promoted file
  // unread until the human happened to open the dashboard. One call site, both
  // readers, promotion always precedes the read.
  try {
    require('./streaming-questions-sweeper').sweepPendingQuestions(root);
  } catch { /* fail-soft: the human still gets the plain Approve screen */ }

  let questions;
  let answered;
  let classified;
  let precompute;
  try {
    // Lazy require avoids a load-time circular dependency (streaming-precompute
    // requires this module at call time for plansNeedingQuestions).
    precompute = require('./streaming-precompute');
    // ONE status call, not two: it yields the questions AND the revision in a
    // single read (`loadPlanQuestions` would call the same status internally and
    // then throw the revision away).
    const st = precompute.planQuestionsStatus(root, ref);
    // A held plan is asked keep-or-release first even when it has no readable question file.
    if (st.status !== 'ready') return heldWithoutQuestions(precompute, root, ref) ? { question: holdQuestion(precompute.HOLD), index: 0, total: 1, held: true } : null;
    questions = st.questions;
    classified = st.classified;
    answered = precompute.readAnsweredQuestionIds(root, ref, {
      questionsRevisionMs: st.questionsRevisionMs,
      planMtimeMs: st.planMtimeMs,
      questions,
    });
  } catch {
    return null;
  }
  if (answered.held.length > 0) return { question: holdQuestion(precompute.HOLD), index: 0, total: 1, held: true };
  // An author's file the gate critic has not checked is never put to the human as his
  // decision: the screen says it is being checked, or offers to check it.
  if (classified !== true) return null;
  if (!Array.isArray(questions) || questions.length === 0) return null;
  // A question whose only answer belongs to an OLDER revision is offered again —
  // that is the point, not a regression: the human never saw this question.
  const open = questions.map((q, i) => [q, i]).filter(([q]) => !answered.ids.has(q.id));
  if (open.length === 0) return null;
  const [question, index] = open.find(([q]) => precompute.goesToHuman(q, classified)) || open[0];
  return { question, index, total: questions.length, held: false };
}

/**
 * Is the plan at `ref` held when it has no readable question file? A hold lives in the answers
 * log, matched by the plan's file name and independent of any question revision, so it is read
 * with no revision to bind. An unreadable log reads as not held here: the crossings stay closed
 * on it on their own (`crossOnEvidence`, the not-ready verdict), and the screen keeps its
 * fail-soft fallback.
 * @param {object} precompute the loaded `streaming-precompute` module
 * @param {string} root
 * @param {string} ref
 * @returns {boolean}
 */
function heldWithoutQuestions(precompute, root, ref) {
  const answers = precompute.readAnsweredQuestionIds(root, ref, { questionsRevisionMs: 0, planMtimeMs: 0 });
  return answers.ok === true && answers.held.length > 0;
}

/**
 * CTOC's own keep-or-release question for a held plan, built from `HOLD` alone — never from a
 * question file. Neither option is recommended: keeping or releasing is the owner's decision.
 * Its `questionDigest` equals `HOLD.digest`.
 * @param {object} HOLD `streaming-precompute.HOLD`
 * @returns {object} a Question
 */
function holdQuestion(HOLD) {
  return { id: HOLD.questionId, prompt: HOLD.prompt, critical: true, important: false, options: [HOLD.keep, HOLD.release] };
}

/**
 * One word for the session's shell: wrapped in single quotes, an embedded quote closed,
 * escaped and reopened. The stored values are already plain characters; this is a second wall.
 * @param {*} value
 * @returns {string}
 */
function quoteArg(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/** Is `id` the gate ruling, bare or with a `-r<digits>` revision suffix? */
function isGateRuling(id) {
  return id === 'q99-gate-ruling' || /^q99-gate-ruling-r[0-9]+$/.test(id);
}

/**
 * Turn ONE precomputed question into the screen's question + actions. The
 * recommended option leads (the menu convention); every option's pros/cons are
 * composed into the description the human reads.
 *
 * @param {object} q the Question
 * @param {string} ref the plan it belongs to
 * @param {string} header the question header
 * @returns {{ question: object, matrix: string, actions: object }}
 */
function precomputedQuestionParts(q, ref, header) {
  const { HOLD, questionDigest } = require('./streaming-precompute');
  const own = q.id === HOLD.questionId;
  const digest = questionDigest(q);
  const ordered = [
    ...q.options.filter((o) => o.recommended === true),
    ...q.options.filter((o) => o.recommended !== true),
  ];
  const entries = ordered.map((o) => ({
    key: o.key,
    label: stripCtl(o.label),
    description: precomputedOptionDescription(o),
  }));
  // An action that can let a plan move carries the digest of the question exactly as this
  // screen shows it; an action that holds never needs one (a hold is never refused).
  const actions = {};
  const answer = (key, withDigest) => `stream answer ${ref} ${quoteArg(q.id)} ${quoteArg(key)}`
    + (withDigest && digest ? ` ${quoteArg(digest)}` : '');
  for (const e of entries) actions[e.label] = answer(e.key, !own || e.key === HOLD.release.key);
  const options = entries.map((e) => ({ label: e.label, description: e.description }));
  if (!own) {
    // CTOC's own Hold, from `HOLD` alone — never text from the question file.
    options.push({ label: HOLD.hold.label, description: HOLD.hold.description });
    actions[HOLD.hold.label] = answer(HOLD.hold.key, false);
  }
  return {
    question: {
      question: stripCtl(q.prompt),
      // CTOC's own keep-or-release question is about the hold, never the stage's moment.
      header: own ? 'Held' : header,
      options,
    },
    // The same structured fields, tabulated for the screen TEXT. The flattened
    // one-sentence description above stays the ask layer's; the matrix is what the
    // human actually reads while deciding.
    matrix: precomputedQuestionMatrix(q, ordered),
    actions,
  };
}

/**
 * This plan's ENOUGH-INFORMATION verdict, shaped for DISPLAY.
 *
 * The predicate is `streaming-precompute.hasEnoughInformation` — the computable
 * form of the owner's principle, "the gate is enough information, not human
 * approval". It answers whether a plan can be built WITHOUT GUESSING: its decision
 * questions were computed against the CURRENT plan text, and every real fork among
 * them has been answered. It FAILS CLOSED on every state where the answer is not
 * known, and that property is preserved here — a predicate that throws degrades to
 * `enough: false` ('unavailable'), never to a pass.
 *
 * ── IT SHOWS, AND AT A PRE-BUILD GATE IT CROSSES. ────────────────────────────
 * `enough: true` is rendered to the human AND, at a PRE-BUILD gate whose transition
 * validation passes, it authorises the plan to cross ITSELF — `pendingGateDecisions`
 * calls `crossBySufficiency`, which records a SUFFICIENCY ledger entry (advanced_by:
 * 'sufficiency', NO approved_by) and moves the plan. The human approves nothing and
 * the crossing is never attributed to a human.
 *
 * This became safe ONLY once `approval-ledger.entryKind` began FAILING CLOSED. It
 * once classified any entry whose `advanced_by` it did not recognise as `'human'`,
 * so an automatic crossing would have been recorded as the human's own approval — a
 * forged approval created by a classifier default. `entryKind` now returns
 * `'unknown'` for an unrecognised provenance (it recognises only 'pipeline' and
 * 'sufficiency'), so the automatic crossing is attributed honestly. That history is
 * kept here deliberately: it is the reason the design is defensible, and deleting it
 * would leave the crossing looking unjustified to the next reader. The done/ gate
 * stays out of scope — a sufficiency verdict cannot answer whether the work was
 * built correctly.
 *
 * The require is LAZY, mirroring `nextUnansweredQuestion` above (the established
 * idiom in this file). It is not strictly required today — `streaming-precompute`
 * reaches this module only through its own call-time require, so ONE load-time edge
 * would not close a cycle. It is kept lazy for consistency with the sibling call
 * site and so that a future top-level edge from precompute back to here cannot
 * silently create one.
 *
 * @param {string} root project root
 * @param {string} ref plan reference ("stage/file.md")
 * `defaults` are the questions this verdict decides by their recommended option: every
 * unanswered question NOT in its `blocking` set (so a file the gate critic did not classify,
 * where every open question blocks, yields none), each `{ id, prompt, choice }` with `choice`
 * the recommended option's label (or the only option's), every string single-line,
 * control-stripped and capped at 200 characters. Taken from the SAME verdict, never a second
 * read of the questions.
 *
 * @returns {{enough:boolean, reason:string, unansweredQuestionIds:string[],
 *   blockingQuestionIds:string[], computed:(number|null),
 *   answeredQuestionIds:string[], unboundAnswers:number,
 *   defaults:Array<{id:string, prompt:string, choice:string}>,
 *   questionsClassified:(boolean|null), questionsRevisionMs:(number|null)}} the last two say
 *   whether the gate critic classified the stored questions, and their revision stamp
 */
function sufficiencyFor(root, ref) {
  const closed = (reason) => ({
    enough: false, reason, defaults: [], questionsClassified: null, questionsRevisionMs: null,
    unansweredQuestionIds: [], blockingQuestionIds: [],
    // A predicate that could not run knows NEITHER the denominator nor the answered
    // set — `computed: null` (never 0), empty lists, 0 unbound. The evidence composer
    // renders `unknown`, so a failed check is never recorded as an empty-list plan.
    computed: null, answeredQuestionIds: [], unboundAnswers: 0,
  });
  if (!isNonEmptyStr(root)) return closed('unavailable');
  try {
    const precompute = require('./streaming-precompute');
    const v = precompute.hasEnoughInformation(root, ref);
    // With no readable question file the predicate never reads the answers log, so a hold
    // there would read as "not computed": the plan is named as held instead, everywhere the
    // verdict is shown (the screen, the session status), and still never crosses.
    if (QUESTIONS_NOT_READY.has(v.reason) && heldWithoutQuestions(precompute, root, ref)) v.reason = 'held';
    const ids = (list) => (Array.isArray(list) ? list.map((q) => stripCtl(String(q && q.id))) : []);
    const blockingIds = new Set(ids(v.blocking));
    const defaults = (Array.isArray(v.unanswered) ? v.unanswered : [])
      .filter((q) => q && !blockingIds.has(stripCtl(String(q.id))) && Array.isArray(q.options) && q.options.length > 0)
      .map((q) => {
        const chosen = q.options.find((o) => o && o.recommended === true) || q.options[0];
        return { id: oneLine(q.id), prompt: oneLine(q.prompt), choice: oneLine(chosen && chosen.label) };
      });
    return {
      enough: v.enough === true,
      defaults,
      questionsClassified: typeof v.classified === 'boolean' ? v.classified : null,
      questionsRevisionMs: Number.isFinite(v.revisionMs) ? v.revisionMs : null,
      reason: stripCtl(String(v.reason)),
      unansweredQuestionIds: ids(v.unanswered),
      blockingQuestionIds: ids(v.blocking),
      // Threaded from the SINGLE verdict `hasEnoughInformation` already computed —
      // never a second read. `computed` stays null when the predicate could not
      // establish a count; `answeredQuestionIds` are the bound ids of current questions.
      computed: Number.isFinite(v.computed) ? v.computed : null,
      answeredQuestionIds: Array.isArray(v.answered) ? v.answered.map((id) => stripCtl(String(id))) : [],
      unboundAnswers: Number.isFinite(v.unboundAnswers) ? v.unboundAnswers : 0,
    };
  } catch {
    // The predicate could not run. That is IGNORANCE, not sufficiency — fail closed.
    return closed('unavailable');
  }
}

/** One line of untrusted text for a plan file or a status: whitespace runs to one space,
 *  control characters stripped, capped at 200 characters. */
function oneLine(value) {
  return stripCtl(String(value == null ? '' : value).replace(/\s+/g, ' ')).trim().slice(0, 200);
}

/**
 * Append the questions a crossing decided by their recommended option to the plan the
 * builder reads, under `## Decisions Taken Under Ambiguity` — a heading outside the approval
 * hash (`approval-ledger.EXECUTION_SECTION_PRODUCERS`), so the crossing record stays valid.
 * One sentence, then one line per question, `- <prompt> — <choice> (question <id>)`. A line
 * already in the file is skipped, so a second pass writes nothing twice. Never throws: a
 * write failure returns 0 and the caller reports it.
 * @param {string} planPath the plan's path after the crossing
 * @param {Array<{id:string, prompt:string, choice:string}>} defaults from `sufficiencyFor`
 * @returns {number} how many lines it wrote
 */
function appendDefaultDecisions(planPath, defaults) {
  try {
    const text = safeFs.readFileSync(planPath, 'utf8');
    const lines = defaults
      .map((d) => `- ${d.prompt} — ${d.choice} (question ${d.id})`)
      .filter((line, i, all) => all.indexOf(line) === i && !text.includes(line));
    if (lines.length === 0) return 0;
    const block = `${text.endsWith('\n') ? '' : '\n'}\n## Decisions Taken Under Ambiguity\n\n`
      + 'Decided by the recommended option when this plan moved on; none of these needed the human.\n\n'
      + `${lines.join('\n')}\n`;
    safeFs.appendFileSync(planPath, block, 'utf8');
    return lines.length;
  } catch {
    return 0; // reported by the caller as decisions that could not be written
  }
}

/** A number for the evidence string, or `unknown` — never `0` for a value that cannot be read. */
function evidenceNumber(n) {
  return Number.isFinite(n) ? String(n) : 'unknown';
}

/**
 * The pipeline evidence for a built plan finishing on its evidence: the check record, its
 * time, coverage, floor and skipped count, the checked steps, the questions, and that the
 * human approved nothing. Composed from what was read; every plan-derived text is stripped
 * and capped; no command text.
 */
function composeDoneEvidence(slug, record, verdict) {
  const tests = record && record.checks && typeof record.checks === 'object' ? record.checks.tests : null;
  const t = tests && typeof tests === 'object' ? tests : {};
  const when = record && typeof record.timestamp === 'string' ? oneLine(record.timestamp) : 'unknown';
  const summary = record && record.summary != null ? oneLine(record.summary) : 'no summary recorded';
  const questions = verdict.reason === 'not-computed'
    ? 'none were stored'
    : `${evidenceNumber(verdict.computed)} stored, none needs the human`;
  // Coverage is said as it was measured: with its floor, without one, or not at all.
  const coverage = !Number.isFinite(t.coverage)
    ? 'coverage not measured'
    : Number.isFinite(t.coverageFloor)
      ? `coverage ${t.coverage}% against a floor of ${t.coverageFloor}%`
      : `coverage ${t.coverage}% (no floor declared)`;
  return `evidence: review→done — checks passed, recorded ${when} in .ctoc/state/verify/${slug}.json (${summary}); `
    + `${coverage}, ${evidenceNumber(t.skipped)} skipped; `
    + 'every required step 8–16 is checked in the plan, including REVIEW, SECURE and FINAL-REVIEW (checked by the build itself); '
    + `questions: ${questions}; crossed on evidence, not approved by the human`;
}

/**
 * Finish a BUILT plan on its evidence: review → done with no human act, recorded as a
 * pipeline entry (`advanced_by: 'pipeline'`, evidence, never `approved_by`) that
 * `approval-residency` accepts at done. Called only from the continuation's crossing pass
 * (`pendingGateDecisions` with `opts.crossed`), and only for a plan whose transition
 * validation passed (every required step checked, a fresh passing check record) and whose
 * questions need nobody.
 *
 * Requires a recorded admission to building: the plan's ledger entry ends at `todo`. An entry
 * already at done (or anything else) returns false, so it is idempotent. A plan the human
 * holds never crosses: the verdict already says `held` when its questions are readable, and
 * when none are stored the answers log is read here for a hold (an unreadable log is not
 * knowing, so the plan stays). Entry and move, or neither: when the move fails the ledger file
 * is restored to its bytes from before. With deployment enabled the plan is recorded
 * deploy-ready (`actions.recordDeployReadyNotice`); nothing deploys. Never throws.
 *
 * @param {string} root
 * @param {string} planPath the plan in review/
 * @param {string} ref `review/<file>.md`
 * @param {object} verdict the verdict `pendingGateDecisions` computed for it
 * @returns {boolean} true when the plan was recorded and moved to done
 */
function crossOnEvidence(root, planPath, ref, verdict) {
  try {
    const ledger = require('./approval-ledger');
    const slug = ledger.slugFromPlanPath(planPath);
    const existing = ledger.readEntry(slug, root);
    if (!existing || existing.stage_to !== 'todo') return false;
    const answers = require('./streaming-precompute').readAnsweredQuestionIds(root, ref, { questionsRevisionMs: 0, planMtimeMs: 0 });
    if (!answers.ok || answers.held.length > 0) return false;
    const fileSlug = path.basename(planPath, '.md');
    const record = require('./step-13-verify').readVerifyEvidence(root, fileSlug);
    if (!record || record.passed !== true) return false;
    const content = safeFs.readFileSync(planPath, 'utf8');
    const ledgerFile = ledger.ledgerPath(slug, root);
    const prior = safeFs.readFileSync(ledgerFile, 'utf8');
    ledger.writePipelineEntry(slug, {
      content,
      stage_from: 'review',
      stage_to: 'done',
      evidence: composeDoneEvidence(stripCtl(fileSlug), record, verdict),
      plan_basename: fileSlug,
    }, root);
    // The plan's status file stays with the stage it leaves, exactly as approvePlan clears it.
    require('./background').clearStatus(planPath);
    let newPath;
    try {
      newPath = movePlan(planPath, 'done', root);
    } catch {
      restoreLedgerFile(ledgerFile, prior, ledger, slug, root);
      return false;
    }
    // Both are fail-soft by contract: the config falls back to its defaults, and the notice
    // writer logs its own failure; a notice never undoes the crossing.
    if (require('./deployment').getDeploymentConfig(root).enabled) {
      require('./actions').recordDeployReadyNotice(newPath, root, 'evidence');
    }
    return true;
  } catch {
    return false; // fail-soft: never brick the read
  }
}

/**
 * Put the ledger file back to its bytes from before a crossing whose move failed. When even
 * that write fails, the entry is removed, so no record ever names `done` for a plan still in
 * review (the plan then lacks its admission record and cannot finish on its evidence — the
 * fail-closed direction).
 * @returns {boolean} true when the prior bytes were restored
 */
function restoreLedgerFile(ledgerFile, prior, ledger, slug, root) {
  try {
    safeFs.writeFileSync(ledgerFile, prior);
    return true;
  } catch {
    try {
      ledger.removeEntry(slug, root);
    } catch {
      return false; // neither restored nor removed: the plan stays in review either way
    }
    return false;
  }
}

// The joined answered-id list is capped so a producer-authored id — untrusted text
// on a PERMANENT record — cannot inject unbounded content into a ledger entry. Each
// id is already control-stripped; this bounds the total.
const MAX_EVIDENCE_ID_LIST = 500;

/**
 * Compose the SUFFICIENCY evidence string from a threaded verdict — nothing is read
 * from disk. This is the audit record of a self-crossed gate, and it states the
 * DENOMINATOR (how many questions existed) alongside the numerator (how many were
 * answered), so the record can answer the one question an auditor brings to it:
 * "how much was this plan actually asked?" The old string carried only the answered
 * count, so an empty questions file and a plan whose many questions were all still
 * open produced identical bytes.
 *
 * Fixed field order, fixed labels (an auditor parses them positionally):
 *   `sufficiency: <ref> — <N> question(s) computed, <M> answered (<ids>);
 *    <U> unanswered, <B> blocking; attested by: not recorded[;
 *    <K> recorded answer(s) did not bind to this revision]; enough (no unanswered fork)`
 *
 * A count that is not a finite number renders `unknown`, NEVER `0` — an unavailable
 * count must be distinct from a genuine zero. A genuine zero (`computed === 0`) gets
 * an explicit, greppable "no questions were computed" phrase so every historical
 * empty-list crossing is findable in one text search. The attestation slot is a
 * fixed `attested by: not recorded` today — there is no attestation data source
 * until the critique-record work lands — so the format is forward-compatible and an
 * absent clause never reads as an older record.
 *
 * @param {string} ref the plan reference ("stage/file.md")
 * @param {object} verdict the sufficiency verdict that AUTHORISED the crossing
 * @returns {string}
 */
function composeSufficiencyEvidence(ref, verdict) {
  const v = verdict && typeof verdict === 'object' ? verdict : {};
  const safeRef = stripCtl(String(ref));
  const num = (n) => (Number.isFinite(n) ? String(n) : 'unknown');

  const computed = Number.isFinite(v.computed) ? v.computed : null;
  const answeredIds = Array.isArray(v.answeredQuestionIds)
    ? v.answeredQuestionIds.map((id) => stripCtl(String(id)))
    : [];
  const unanswered = Array.isArray(v.unansweredQuestionIds) ? v.unansweredQuestionIds.length : null;
  const blocking = Array.isArray(v.blockingQuestionIds) ? v.blockingQuestionIds.length : null;
  const unbound = Number.isFinite(v.unboundAnswers) ? v.unboundAnswers : 0;

  let idList = answeredIds.join(', ');
  if (idList.length > MAX_EVIDENCE_ID_LIST) idList = idList.slice(0, MAX_EVIDENCE_ID_LIST) + '… (list truncated)';
  const answeredClause = answeredIds.length ? ` (${idList})` : '';

  const head = computed === 0
    // Explicit, greppable empty-list phrase — distinct from "N computed, N answered".
    ? `${safeRef} — no questions were computed (0 question(s) computed), ${num(answeredIds.length)} answered${answeredClause}`
    : `${safeRef} — ${num(computed)} question(s) computed, ${num(answeredIds.length)} answered${answeredClause}`;

  const unboundClause = unbound > 0
    ? `; ${unbound} recorded answer(s) did not bind to this revision`
    : '';

  return `sufficiency: ${head}; ${num(unanswered)} unanswered, ${num(blocking)} blocking`
    + `; attested by: not recorded${unboundClause}; enough (no unanswered fork)`;
}

/**
 * X6 — CROSS a plan by SUFFICIENCY: the plan had enough information to be built
 * without guessing, so the pipeline advances it ITSELF and the human approves
 * nothing. Writes a sufficiency ledger entry (advanced_by:'sufficiency', evidence,
 * NO approved_by) keyed to the plan's CURRENT bytes, then performs the pure stage
 * move. A pure move leaves the bytes byte-identical, so a hash-sensitive destination
 * (todo/) still matches the recorded hash.
 *
 * INVARIANT: entry-and-moved, or NEITHER. The entry is written FIRST; if the move
 * then fails (e.g. a same-basename collision at the destination), the orphan entry is
 * rolled back. IDEMPOTENT (Decision 3): a plan already carrying an entry for this
 * destination is never re-crossed. FAIL-SOFT: any error returns false so a cross
 * failure never bricks the pending-decisions read.
 *
 * @param {string} root project root
 * @param {string} planPath absolute path to the plan at its gate-source stage
 * @param {string} ref the plan reference ("stage/file.md")
 * @param {string} fromStage the gate source stage
 * @param {string} toStage the gate destination stage (a PRE-BUILD destination)
 * @param {object} verdict the SINGLE sufficiency verdict that authorised the
 *   crossing (computed once in `pendingGateDecisions`). The evidence is composed from
 *   THIS verdict — never a second, independent read that could observe a different
 *   revision than the one that authorised the crossing.
 * @returns {boolean} true iff the plan was crossed (entry written + moved)
 */
function crossBySufficiency(root, planPath, ref, fromStage, toStage, verdict) {
  try {
    const ledger = require('./approval-ledger');
    const slug = ledger.slugFromPlanPath(planPath);
    // IDEMPOTENT: an entry already recorded for THIS destination means the plan
    // already crossed this edge — never write a second one, never re-cross.
    const existing = ledger.readEntry(slug, root);
    if (existing && existing.stage_to === toStage) return false;

    const content = safeFs.readFileSync(planPath, 'utf8');
    // The audit record of a self-crossed gate: composed from the SAME verdict that
    // authorised the crossing, so the numbers describe the exact state the decision
    // was based on. It states the DENOMINATOR (how many questions existed) as well as
    // the numerator (how many were answered) — the count that made "0 answered"
    // meaningful. No second read of its own: a second read could see a different
    // revision than the verdict, describing a state that was never the decision basis.
    const evidence = composeSufficiencyEvidence(ref, verdict);

    ledger.writeSufficiencyEntry(slug, {
      // SPECIFICATION scope, for the same reason as the human gate crossing in
      // `actions.stampAndLedger`: a sufficiency entry advances a plan to a PRE-BUILD
      // destination (implementation, todo), so that plan is about to be BUILT — and the
      // executor writes its execution log into the plan file itself. A whole-file
      // binding would go stale on the very build this entry authorises. The ledger
      // derives the digest and the scope stamp together.
      content,
      stage_from: fromStage,
      stage_to: toStage,
      evidence,
      plan_basename: path.basename(planPath).replace(/\.md$/i, ''),
    }, root);

    try {
      movePlan(planPath, toStage, root);
    } catch {
      // Roll back the orphan entry so the invariant holds (entry-and-moved, or neither).
      try { ledger.removeEntry(slug, root); } catch { /* best-effort */ }
      return false;
    }
    return true;
  } catch {
    return false; // fail-soft: never brick the read
  }
}

/**
 * The ORDERED list of plans currently sitting at a human gate awaiting a decision.
 *
 * X6 — THE GATE CROSSES ITSELF. This is no longer a pure read: before listing, any
 * plan at a PRE-BUILD gate (implementation, todo) that has ENOUGH INFORMATION to be
 * built without guessing AND passes its transition validation is CROSSED here, by a
 * sufficiency ledger entry + the stage move (`crossBySufficiency`), and OMITTED from
 * the returned list — the human is never shown a decision that has already been
 * answered. Everything else is still a pure, fail-soft read: readPlans skips an
 * unreadable plan, a validator that throws degrades that plan to
 * passesValidation:false, and a cross that fails leaves the plan listed.
 *
 * FAIL CLOSED. A plan crosses ONLY on `enough === true` (every fork answered) at a
 * pre-build gate with passing validation. An unanswered fork, never-computed
 * questions, a failing validation, or the `done/` gate all keep the plan pending —
 * X6 adds an automatic YES, never an automatic NO, and never silences a question.
 *
 * Each still-pending decision carries its SUFFICIENCY VERDICT (`enough`,
 * `sufficiencyReason`, `unansweredQuestionIds`, `blockingQuestionIds`) so the human
 * SEES exactly which questions are still open — see `sufficiencyFor`.
 *
 * ── THE CONTINUATION'S PASS (`opts.crossed` is an array) ─────────────────────────
 * Only `menu-screens.continueAfterCrossing` passes `opts.crossed`, and only on the session's
 * three live paths (a completion with `--continue`, `stream approve`, `stream answer`). On
 * that pass every crossing is pushed as `{ ref, toStage, name }` (the new ref, the plan's
 * human name, and `decisionsNotRecorded: true` when its decided-by-default questions could
 * not be written into it), and a BUILT plan in review finishes on its evidence
 * (`crossOnEvidence`) when its transition validation passes, it is not empty, and its
 * questions need nobody (`enough`, or none stored). Every pre-build crossing, on any call,
 * appends the questions it decided by default to the plan (`appendDefaultDecisions`). Without `opts.crossed` — the default
 * screen, the on-open banner, the session-start status — a review plan is listed for the
 * human exactly as before, so nothing finishes when the menu opens.
 *
 * @param {string} projectRoot
 * @param {{crossed?: Array<{ref:string, toStage:string, name:string}>}} [opts]
 * @returns {Array<{ref:string, slug:string, title:string, summary:string,
 *   fromStage:string, toStage:string, moment:string, chip:string,
 *   approveLabel:string, passesValidation:boolean,
 *   critical:boolean, enough:boolean, sufficiencyReason:string,
 *   unansweredQuestionIds:string[], blockingQuestionIds:string[],
 *   questionsClassified:(boolean|null), questionsRevisionMs:(number|null)}>}
 */
function pendingGateDecisions(projectRoot, opts = {}) {
  const crossed = opts && Array.isArray(opts.crossed) ? opts.crossed : null;
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
      // A name CTOC will not pass to a command gets NO descriptor, so no action can
      // carry it, and it is never validated; `countUnsafePlanFiles` tells the human
      // how many were left out.
      if (isUnsafePlanFile(`${plan.name}.md`)) continue;
      let passesValidation = false;
      try {
        const v = validateTransition(plan.path, stage, meta.toStage, projectRoot);
        passesValidation = !(v && v.valid === false);
      } catch {
        passesValidation = false; // an exploding validator → honestly "does not pass"
      }
      const ref = `${stage}/${plan.name}.md`;
      // Decision 5: the predicate is called ONCE per decision; the SAME verdict both
      // ACTS (the cross below) and, if the plan stays, DISPLAYS (pushed into `out`).
      const sufficiency = sufficiencyFor(projectRoot, ref);

      // X6: enough information at a pre-build gate crosses the plan by itself and it
      // stops being a pending decision. Fail-closed conditions are all short-circuited.
      if (sufficiency.enough === true && passesValidation
          && PRE_BUILD_DESTINATIONS.has(meta.toStage)
          && crossBySufficiency(projectRoot, plan.path, ref, stage, meta.toStage, sufficiency)) {
        // Every crossing writes its decided-by-default questions into the plan, whichever
        // call made it (the default screen crosses pre-build plans too, as before).
        const newPath = path.join(plansDir, meta.toStage, `${plan.name}.md`);
        const written = sufficiency.defaults.length > 0 ? appendDefaultDecisions(newPath, sufficiency.defaults) : 0;
        if (crossed) {
          const record = { ref: `${meta.toStage}/${plan.name}.md`, toStage: meta.toStage, name: humanPlanName(planTitle(plan), plan.name) };
          if (sufficiency.defaults.length > 0 && written === 0) record.decisionsNotRecorded = true;
          crossed.push(record);
        }
        continue;
      }
      // A BUILT plan finishes on its evidence — only on the continuation's pass.
      if (crossed && stage === 'review' && passesValidation && !isEmptyPlan(plan.content)
          && (sufficiency.enough === true || sufficiency.reason === 'not-computed')
          && crossOnEvidence(projectRoot, plan.path, ref, sufficiency)) {
        crossed.push({ ref: `done/${plan.name}.md`, toStage: 'done', name: humanPlanName(planTitle(plan), plan.name) });
        continue;
      }

      const title = planTitle(plan);
      out.push({
        ref,
        slug: stripCtl(plan.name),
        title,
        summary: title,
        fromStage: stage,
        toStage: meta.toStage,
        // What the human READS at this moment — never a number, never a stage name.
        moment: gateWords.moment(stage),
        chip: gateWords.chip(stage),
        approveLabel: gateWords.approveLabel(stage),
        passesValidation,
        critical: isCritical(plan.metadata),
        // A broken artifact is MARKED, never hidden: excluding it would make the file
        // invisible — sitting at a gate forever with nothing saying so — a worse
        // dishonesty than being asked about it. `gateScreenAt` renders the
        // broken-plan screen for a broken descriptor. Computed on content already read
        // (no second file read).
        broken: isEmptyPlan(plan.content),
        // The ENOUGH-INFORMATION verdict — shown to the human, acted on by nothing.
        enough: sufficiency.enough,
        sufficiencyReason: sufficiency.reason,
        unansweredQuestionIds: sufficiency.unansweredQuestionIds,
        blockingQuestionIds: sufficiency.blockingQuestionIds,
        // Whether the gate critic classified its stored questions (null: none stored or not
        // readable) and their revision — so the screen never offers an unchecked author's file.
        questionsClassified: sufficiency.questionsClassified,
        questionsRevisionMs: sufficiency.questionsRevisionMs,
      });
    }
  }

  // Stable critical-first partition: criticals keep their relative (gate) order.
  const critical = out.filter(d => d.critical);
  const rest = out.filter(d => !d.critical);
  return critical.concat(rest);
}

/**
 * Compose a precomputed OPTION's description from its pros/cons/description, with a
 * "Recommended — " prefix on the recommended option. All fields pass through
 * stripCtl (they are subagent-authored, so treated as untrusted for rendering).
 */
function precomputedOptionDescription(option) {
  const parts = [];
  if (isNonEmptyStr(option.description)) parts.push(stripCtl(option.description));
  if (isNonEmptyStr(option.pros)) parts.push(`Pros: ${stripCtl(option.pros)}`);
  if (isNonEmptyStr(option.cons)) parts.push(`Cons: ${stripCtl(option.cons)}`);
  let body = parts.join('  ·  ');
  if (option.recommended === true) body = body ? `Recommended — ${body}` : 'Recommended';
  return body || 'Select this option.';
}

function isNonEmptyStr(v) {
  return typeof v === 'string' && v.length > 0;
}

// ── The DECISION MATRIX ────────────────────────────────────────────────────────
// The precompute layer stores every option's pros, cons and recommendation as
// SEPARATE structured fields. `precomputedOptionDescription` above flattens them
// into ONE sentence, which is correct for the option descriptions handed to the
// question interface — but rendering only that made the critique fleet's reasoning
// invisible: the human read a wall of run-on text and could not decide. The screen
// TEXT therefore carries the canonical decision matrix from
// `.ctoc/ask-me-questions.md`: a real box-drawing table whose columns are exactly
// Option, Pros, Cons and Recommendation.
//
// WIDTH IS A HARD CONSTRAINT. A matrix that wraps in a narrow terminal is worse
// than no matrix at all, so the TOTAL rendered width — every border character
// included — never exceeds this ceiling. Long cell text WRAPS inside its cell;
// nothing is ever dropped or truncated to fit. Tune the whole matrix here.
const MATRIX_TOTAL_WIDTH = 108;
const MATRIX_COLUMNS = Object.freeze(['Option', 'Pros', 'Cons', 'Recommendation']);
// Share of the available content width per column. Weights, not absolute widths,
// so MATRIX_TOTAL_WIDTH stays the single tuning knob. Option is the NARROWEST: it
// carries the label and nothing else. Pros and Cons carry the critique's full
// reasoning and get the most room. Recommendation carries one short clause.
const MATRIX_COLUMN_WEIGHTS = Object.freeze([0.20, 0.29, 0.29, 0.22]);
const MATRIX_MIN_COLUMN_WIDTH = 6;

// Characters a long token may be broken AFTER. A file path or a dotted identifier
// wider than its column has to break somewhere; breaking it at a separator keeps
// each fragment readable and the whole token reconstructable by eye. Breaking it
// mid-word — `src/lib/task-reconci` / `le.js` — does neither.
const MATRIX_TOKEN_BREAK_AFTER = /[/\\\-_.:,;]/;
// A fragment shorter than this is not worth a line of its own, so a separator that
// close to the start of a token is ignored and a later break point is used.
const MATRIX_MIN_FRAGMENT = 4;

/**
 * Content width of each column, derived from MATRIX_TOTAL_WIDTH. Each row spends
 * (columns + 1) characters on vertical rules and 2 per column on padding; whatever
 * remains is the content, split by weight with the rounding remainder given to the
 * last column so the widths always sum EXACTLY to the available content width.
 */
function matrixColumnWidths() {
  const n = MATRIX_COLUMNS.length;
  const content = MATRIX_TOTAL_WIDTH - (n + 1) - n * 2;
  const widths = MATRIX_COLUMN_WEIGHTS.map(
    (w) => Math.max(MATRIX_MIN_COLUMN_WIDTH, Math.floor(content * w)),
  );
  const used = widths.reduce((a, b) => a + b, 0);
  widths[n - 1] += content - used;
  return widths;
}

// Box-drawing block. A cell value carrying any of these characters — or a newline —
// would FORGE the matrix's own structure, making planted text render as a real row
// in the pane the human reads while deciding. Every field here is subagent-authored
// and therefore untrusted, so structure is neutralised before rendering (the same
// concern the gate critic's quoting rules describe for the composer strings).
const MATRIX_BOX_DRAWING = /[\u2500-\u257F]/g;

/** Neutralise one untrusted cell value: no control characters, no newlines, no
 *  box-drawing characters, whitespace collapsed to single spaces. */
function matrixCellText(value) {
  if (typeof value !== 'string') return '';
  return stripCtl(value.replace(/[\r\n\t\v\f]+/g, ' '))
    .replace(MATRIX_BOX_DRAWING, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Where to break a token that is wider than its column. Prefers the LAST separator
 * inside the column window, so `plans/vision/ctoc-background-engine-rebuild.md:227`
 * breaks after a slash or a hyphen rather than through a word. Falls back to the
 * column width only for a token that has no separator to break at.
 */
function tokenBreakPoint(word, width) {
  for (let i = width - 1; i >= MATRIX_MIN_FRAGMENT - 1; i--) {
    if (MATRIX_TOKEN_BREAK_AFTER.test(word[i])) return i + 1;
  }
  return width;
}

/** Wrap already-neutralised text to `width` on WORD boundaries, breaking a single
 *  token only when it is wider than the column. Never drops a character. */
function wrapMatrixCell(text, width) {
  const lines = [];
  let current = '';
  for (let word of String(text).split(' ').filter(Boolean)) {
    while (word.length > width) {
      if (current) { lines.push(current); current = ''; }
      const cut = tokenBreakPoint(word, width);
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    if (!word) continue;
    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/**
 * The reason for the Recommendation cell — a REAL argument, never a pointer.
 *
 * A cell reading "confidence high, on the reasoning in the Pros column" is not a
 * recommendation: it states how sure the critic is of the FINDING and then points at
 * the cell beside it. Confidence is how sure you are; tier is how bad it is; neither
 * is a reason to pick an option. That phrasing shipped and the human rejected it on
 * sight, correctly.
 *
 * The synthesizer's rule 7d requires the recommended option's `pros` to carry, after
 * the confidence sentence, at least one further sentence arguing in its own words why
 * THIS OPTION produces the better outcome. That sentence is the recommendation, so it
 * is what this extracts: drop a leading confidence sentence, take what follows.
 *
 * On questions generated before that rule existed there may be no such sentence. Then
 * the first substantive sentence of the case is used — a real claim the human can
 * weigh, rather than an instruction to go read another column.
 */
function recommendationReason(pros, description) {
  const source = isNonEmptyStr(pros) ? pros : (isNonEmptyStr(description) ? description : '');
  if (!source) return 'the highest-quality option on the evidence gathered.';

  // Sentence split that keeps decimals and file:line references intact.
  const sentences = source
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((t) => t.trim())
    .filter(Boolean);

  // Drop a leading confidence sentence — it rates the finding, not the option.
  const argued = sentences.filter((t) => !/^confidence\s+(high|medium|low)\b/i.test(t));
  const chosen = (argued.length > 0 ? argued : sentences)[0];
  return chosen || 'the highest-quality option on the evidence gathered.';
}

/**
 * The plan's name AS A HUMAN READS IT.
 *
 * The screen used to print the slug — `00003-r2a-scheduler-lifecycle-honesty` — which
 * names a file, not a piece of work. A reader cannot decode a number and an internal
 * code, and asking someone to rule on "00003-r2a" is asking them to approve a filename.
 * So: prefer the plan's title, drop any leading internal code (`R2-A — `, `X9 — `), and
 * keep only the part before a colon, which is the sentence a person would actually say.
 * Falls back to the slug only when there is no title at all.
 */
function humanPlanName(title, slug) {
  const raw = isNonEmptyStr(title) ? String(title).trim() : '';
  if (!raw) return stripCtl(String(slug || '').trim());
  // The separator MUST be surrounded by whitespace. Without that requirement a bare
  // `-` is ambiguous — it can be the code's own suffix hyphen (`R2-A`) or the
  // separator — and two readings of one character is exponential backtracking on a
  // hostile title. Whitespace disambiguates it in one pass.
  // Two flat patterns, never one nested one. `(?:-[A-Za-z0-9]+)?` puts a `+` inside a
  // `?` — star height 2 — and that is the shape that backtracks exponentially.
  const split = /^(\S+)\s+[—–-]\s+(.*)$/.exec(raw);
  const head = split ? split[1] : '';
  const isCode = /^[A-Z]{1,3}[0-9]+$/.test(head) || /^[A-Z]{1,3}[0-9]+-[A-Za-z0-9]+$/.test(head);
  const withoutCode = isCode ? split[2].trim() : raw;
  const headline = withoutCode.split(':')[0].trim();
  return stripCtl(headline || withoutCode || raw);
}

/** One horizontal edge: left/junction/right characters over the column widths. */
function matrixEdge(left, junction, right, widths) {
  return left + widths.map((w) => '─'.repeat(w + 2)).join(junction) + right;
}

/** One content row, as many physical lines as the tallest wrapped cell needs. */
function matrixRow(cells, widths) {
  const wrapped = cells.map((c, i) => wrapMatrixCell(c, widths[i]));
  const height = Math.max(...wrapped.map((w) => w.length));
  const lines = [];
  for (let line = 0; line < height; line++) {
    lines.push(`│ ${widths.map((w, i) => (wrapped[i][line] || '').padEnd(w)).join(' │ ')} │`);
  }
  return lines;
}

/**
 * Render ONE precomputed question's options as the canonical decision matrix.
 *
 * Layout per option: the Option cell carries the label and, when present, the
 * option's one-line description beneath it; Pros and Cons carry their own fields
 * verbatim (neutralised); the Recommendation cell is filled for EXACTLY ONE option —
 * the recommended one — with a short reason, and is empty for every other row. The
 * reason is the option's pros, falling back to its description, falling back to a
 * plain statement, so the cell always says WHY rather than only "Recommended".
 *
 * @param {object} q a precomputed Question
 * @param {Array<object>} ordered its options, recommended-first (same order as the ask)
 * @returns {string} the matrix, or '' when there is nothing to tabulate
 */
function precomputedQuestionMatrix(q, ordered) {
  if (!Array.isArray(ordered) || ordered.length === 0) return '';
  const widths = matrixColumnWidths();
  const lines = [matrixEdge('┌', '┬', '┐', widths)];
  lines.push(...matrixRow(MATRIX_COLUMNS, widths));

  let recommendationTaken = false;
  for (const option of ordered) {
    lines.push(matrixEdge('├', '┼', '┤', widths));
    const label = matrixCellText(option.label);
    const description = matrixCellText(option.description);
    const pros = matrixCellText(option.pros);
    const cons = matrixCellText(option.cons);

    let recommendation = '';
    if (option.recommended === true && !recommendationTaken) {
      recommendationTaken = true;
      recommendation = `Recommended — ${recommendationReason(pros, description)}`;
    }
    // The Option cell is the LABEL ALONE. The `description` field is the critique's
    // evidence — in real data a paragraph of file-and-line citations — and putting
    // it here wrapped a narrow column twenty lines down the page and made the whole
    // matrix unreadable. It is NOT lost: it still rides in the flattened one-sentence
    // description handed to the question interface, where the human reads it while
    // choosing an option. The matrix is the scanning surface; it stays scannable.
    lines.push(...matrixRow([label, pros, cons, recommendation], widths));
  }
  lines.push(matrixEdge('└', '┴', '┘', widths));
  return lines.join('\n');
}

// ── "What counts as an answered question" lives in ONE place, deliberately ──────
// A local `answeredQuestionIds` used to live here: a second, independent read of
// the answers log that matched on `(ref, questionId)` alone. It was DELETED rather
// than turned into a wrapper — a wrapper is still a second name for the rule and a
// second place to add a special case. The encoding is now
// `streaming-precompute.readAnsweredQuestionIds`, which binds an answer to the plan
// REVISION it was given for, and both call sites in this file reach it through the
// established lazy require. This module still WRITES the log (see `streamAnswer`);
// it no longer interprets it.

/**
 * Build the RICH single-question screen for decision `d` from its PRECOMPUTED
 * questions, or return null to fall back to the simple Approve screen. Null is
 * returned when there are no fresh precomputed questions OR when every precomputed
 * question has already been answered (in which case the fallback screen offers the
 * FINAL gate crossing — `stream approve <ref>` — which stays the human's explicit
 * answer).
 *
 * @param {object} d one pendingGateDecisions descriptor
 * @param {number} index its position in the ordered list (for the counter text)
 * @param {number} total the total decision count
 * @param {string|undefined} statusLine optional status prepended to the text
 * @param {string} root project root
 * @returns {object|null} a { text, ask, actions } screen, or null to fall back
 */
function richQuestionScreen(d, index, total, statusLine, root) {
  const next = nextUnansweredQuestion(root, d.ref);
  if (next === null) return null; // none / all answered → simple Approve (final gate crossing)
  const { question: q, index: nextIdx, total: qTotal } = next;

  const parts = precomputedQuestionParts(q, d.ref, d.chip);
  const actions = Object.assign({}, parts.actions);

  // The question's options and CTOC's Hold, then Skip and Open the plan while they fit the
  // harness's 4-explicit-option cap; their actions stay whatever is asked (comment rides the
  // built-in "Other" free-text path).
  const options = parts.question.options.slice();
  if (options.length < 4) {
    options.push({ label: 'Skip for now', description: 'Move to the next pending decision (nothing is changed).' });
  }
  if (options.length < 4) {
    options.push({ label: 'Open the plan', description: 'View the plan before deciding.' });
  }

  actions['Skip for now'] = `stream skip ${d.ref}`;
  actions['Open the plan'] = `plan ${d.ref}`;
  actions['Other'] = `stream comment ${d.ref}`;

  let text = '';
  if (statusLine) text += `${stripCtl(statusLine)}\n\n`;
  // The moment phrase replaces both the gate number and the (from → to) stage
  // parenthetical. `decision N of M` stays: a count of things the human must do is a
  // fact he asked to see and can act on. The rule is about gate numbers, not arithmetic.
  text += `Topic: ${humanPlanName(d.title, d.slug)}  ·  ${d.moment}  ·  `
    + `decision ${index + 1} of ${total}  ·  question ${nextIdx + 1} of ${qTotal}\n`;
  text += `${'─'.repeat(40)}\n\n`;
  // Matrix FIRST, then the question sentence (the ask-me-questions contract).
  if (parts.matrix) text += `${parts.matrix}\n\n`;
  text += `  ${stripCtl(q.prompt)}\n\n\n`;

  return {
    text,
    ask: { questions: [Object.assign({}, parts.question, { options })] },
    actions,
  };
}

/**
 * A BROKEN plan at a gate is an artifact to be told about, not a decision to make.
 *
 * THE GENERAL RULE this screen embodies, made checkable: an option whose description
 * says it will be refused must not be an option. Validation has already answered
 * "this cannot cross"; offering an Approve anyway — greyed, last, or explained — is
 * the defect (a surface presenting a verdict it already computed and then ignored).
 * So there is NO Approve here, and NO "Check validation": the screen already says
 * why. Only actions that DO something are offered — Write it, Delete it, Leave it —
 * and each already exists in this file's action vocabulary.
 *
 * The plan is NOT named by its slug: an empty plan has no title, and printing the
 * filename as a title would show a person a filename to rule on. The filename appears
 * only in the small print, labelled as a filename.
 *
 * TOTAL by contract: never throws. `gateWords.moment` yields '' off a gate, and the
 * moment line is then omitted — the human still learns WHERE the file sits when it is
 * at a gate, with no number and without being asked to act on it.
 *
 * @param {string} stage the stage the plan sits in
 * @param {string} file the plan filename (shown LABELLED as a filename, never as a title)
 * @param {string} projectRoot
 * @param {'empty'|'unreadable'} reason why the artifact is broken
 * @returns {{text: string, ask: object, actions: object}}
 */
function brokenPlanScreen(stage, file, projectRoot, reason) {
  const safeFile = stripCtl(String(file));
  const momentLine = gateWords.moment(stage); // '' when the plan is not at a gate
  let text;
  if (reason === 'unreadable') {
    text = `This plan could not be read.\n${'─'.repeat(40)}\n\n`;
    text += '  The file is there but its contents could not be read — it may not be a\n';
    text += '  plain file. Nobody can decide anything about it, and nothing can be built\n';
    text += '  from it.\n\n';
  } else {
    text = `This plan is empty.\n${'─'.repeat(40)}\n\n`;
    text += '  The file exists and has no content — no title, no problem statement,\n';
    text += '  nothing to build from. Nobody can decide anything about it, and nothing\n';
    text += '  can be built from it.\n\n';
  }
  if (momentLine) text += `  ${momentLine}\n\n`;
  text += `  Filename on disk: ${safeFile}\n\n\n`;

  const stageFile = `${stage}/${file}`;
  return {
    text,
    ask: {
      questions: [{
        question: reason === 'unreadable'
          ? 'This plan cannot be read — what now?'
          : 'This plan is empty — what now?',
        header: 'Broken plan',
        options: [
          { label: 'Write it', description: 'Recommended — open the plan and give it a body. The only thing that turns it into something decidable.' },
          { label: 'Delete it', description: 'Remove the file. There is nothing in it, so nothing is lost.' },
          { label: 'Leave it', description: 'Nothing changes for now.' },
        ],
      }],
    },
    // Every action already exists in this file's vocabulary; nothing new is invented.
    actions: {
      'Write it': `claude:view-edit ${stageFile}`,
      'Delete it': `claude:delete ${stageFile}`,
      'Leave it': '',
    },
  };
}

/**
 * `plan <ref>` — OPEN a plan. This is a QUESTION, never a navigation menu.
 *
 * What it renders:
 *   text — the plan's BODY. Opening a plan shows the work.
 *   ask  — the NEXT DECISION about this plan, in priority order:
 *            1. the PRODUCT question waiting for it (what the application should
 *               DO), with its precomputed pros/cons and one recommendation;
 *            2. otherwise, if the plan sits at a human gate, the plain gate
 *               question — the LAST-RESORT fallback, not the main event;
 *            3. otherwise the plan-lifecycle decision (critique / edit / delete).
 *
 * Every option DOES something. None of them is a route to another list. The plan's
 * remaining lifecycle decisions ride along as a second question (the established
 * ride-along pattern — environment, compliance, task board) so that no capability
 * is lost to AskUserQuestion's four-option cap.
 *
 * Pure read: renders only. Nothing here crosses a gate — crossing stays on the
 * explicit `stream approve`, which routes through the gate-safe `approvePlan`.
 *
 * @param {string} ref plan reference ("stage/file.md")
 * @param {string} projectRoot
 * @returns {{text: string, ask: object, actions: object}}
 */
function planDecisionScreen(ref, projectRoot) {
  const parsed = parseAnyRef(ref);
  if (!parsed) {
    const slash = typeof ref === 'string' ? ref.indexOf('/') : -1;
    const stage = slash === -1 ? String(ref) : String(ref).substring(0, slash);
    const file = slash === -1 ? '' : String(ref).substring(slash + 1);
    return invalidPlanRefScreen(stage, file);
  }
  const { stage, file } = parsed;
  const slug = file.replace(/\.md$/, '');
  const planPath = path.join(getPlansDir(projectRoot), stage, file);

  let content = '';
  let unreadable = false;
  try {
    if (safeFs.existsSync(planPath)) content = safeFs.readFileSync(planPath, 'utf8');
  } catch {
    unreadable = true; // e.g. the path is a directory — handled here, never thrown
  }

  // BROKEN ARTIFACT branches FIRST, before any title, scope, product-question or gate
  // logic. An empty or unreadable plan is not a decision to make — it is a broken file
  // to be told about — and it has no product question to ask (the precompute branch
  // below would be asking about a document with no content).
  if (unreadable) return brokenPlanScreen(stage, file, projectRoot, 'unreadable');
  if (isEmptyPlan(content)) return brokenPlanScreen(stage, file, projectRoot, 'empty');

  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? stripCtl(titleMatch[1].trim()) : slug;

  const gate = GATE_META[stage];
  // The plan's HUMAN name, then what the moment IS. Neither the slug (which names a
  // file, not a piece of work), nor the stage chip, nor a gate number reaches the
  // header any more — a plan not at a gate simply renders with no moment phrase,
  // exactly as it previously rendered with no gate label.
  const name = humanPlanName(title, slug);
  const momentLabel = gate ? `  ·  ${gateWords.moment(stage)}` : '';

  let text = `Topic: ${name}${momentLabel}\n`;
  text += `${'─'.repeat(40)}\n\n`;
  text += `  ${title}\n\n`;
  // Scope ABOVE the body: the `files:` list IS the write permission this approval
  // grants, and below 120 lines of prose it would be functionally invisible — which
  // is exactly the defect (the frontmatter, and the file list with it, was stripped
  // before the human saw anything). renderDeclaredScope is TOTAL by contract, so a
  // fault here renders a fallback line and NEVER takes the gate screen down.
  text += renderDeclaredScope(content, projectRoot);
  text += '\n';
  text += renderPlanBody(content);
  text += '\n\n';

  const questions = [];
  const actions = {};

  // 1. The PRODUCT question — what the application should do. Always first.
  const next = nextUnansweredQuestion(projectRoot, ref);
  if (next !== null) {
    const parts = precomputedQuestionParts(
      next.question,
      ref,
      gate ? gateWords.chip(stage) : name
    );
    questions.push(parts.question);
    // Matrix FIRST, then the question sentence — the same contract the streaming
    // gate screen follows, from the same helper, so both surfaces stay identical.
    if (parts.matrix) text += `${parts.matrix}\n\n  ${stripCtl(next.question.prompt)}\n\n\n`;
    Object.assign(actions, parts.actions);
    actions['Other'] = `stream comment ${ref}`;
  } else if (gate) {
    // 2. Fallback: the plain gate question. Reached only when no product question
    //    is waiting — this is the rubber stamp, kept honest but never promoted.
    let passes = false;
    try {
      const v = validateTransition(planPath, stage, gate.toStage, projectRoot);
      passes = !(v && v.valid === false);
    } catch {
      passes = false;
    }
    const approveLabel = gateWords.approveLabel(stage);
    // THE GENERAL RULE: an option that validation has already refused is not offered.
    // When the plan passes, the affirmative option leads; when it fails, it is ABSENT
    // (not greyed, not buried) — offering an Approve whose own description announces
    // its refusal is the exact defect this slice removes. The `stream approve` ACTION
    // string is preserved below regardless, because it is a machine identifier no
    // human reads and the send-back/validate actions must stay byte-identical.
    const approve = {
      label: approveLabel,
      description: 'Recommended — everything checks out. Your answer is recorded as yours.',
    };
    // `validate <ref>` is the ONLY route to the validation detail screen and to the
    // deliberate `claude:approve --override` force-crossing — the human's own
    // escape hatch when they choose to cross past a failed check. It leads when the
    // plan fails, because then it is the only thing that can move the plan forward.
    const check = {
      label: 'Check validation',
      description: passes
        ? 'Show the pre-transition validation detail before crossing.'
        : 'Recommended — show exactly which checks fail, with the option to override.',
    };
    const options = passes ? [approve, check] : [check];
    if (stage === 'review') {
      // The human chooses between WHAT IS WRONG — the thing, or the way. The stage
      // identifier survives only in the action string, which no human reads, so the
      // action strings below are byte-identical to what they always were.
      for (const sb of gateWords.SEND_BACK) {
        options.push({ label: sb.label, description: sb.description });
        actions[sb.label] = `claude:reject ${stage}/${file} ${sb.toStage}`;
      }
    }
    actions[approveLabel] = `stream approve ${ref}`;
    actions['Check validation'] = `validate ${stage}/${file}`;
    actions['Other'] = `stream comment ${ref}`;
    // An author's file the gate critic has not checked: offer the check, never its questions.
    let st = null;
    try {
      st = require('./streaming-precompute').planQuestionsStatus(projectRoot, ref);
    } catch {
      st = null; // no stored questions to speak of
    }
    if (st && st.status === 'ready' && st.classified === false && options.length < 4) {
      const state = checkState(projectRoot, ref, st.questionsRevisionMs);
      text += CHECK_LINES[state];
      if (state === 'none') {
        options.push({ label: CHECK_LABEL, description: 'Ask the gate critic to check the questions its author wrote, in the background. Nothing else changes.' });
        actions[CHECK_LABEL] = `stream check ${ref}`;
      }
    }
    questions.push({
      question: gateWords.question(stage, name),
      header: gateWords.chip(stage),
      options,
    });
  } else {
    // 3. Not at a gate and nothing precomputed: the plan-lifecycle decision.
    questions.push({
      question: `What should happen to ${name}?`,
      header: name,
      options: [
        { label: 'Discuss', description: 'EXTREME adversarial critique — nothing held back. The most important step.' },
        { label: 'View/Edit', description: 'Show the plan, then edit it' },
        { label: 'Delete', description: 'Remove this plan permanently' },
      ],
    });
    actions['Discuss'] = 'claude:discuss';
    actions['View/Edit'] = `claude:view-edit ${stage}/${file}`;
    actions['Delete'] = `claude:delete ${stage}/${file}`;
  }

  // The plan's remaining lifecycle decisions ride along, so that opening a plan to
  // answer a product question never costs the human the ability to edit or delete
  // it. Ride-along only — the primary question above stays the one decision asked.
  const taken = new Set(questions[0].options.map((o) => o.label));
  const rest = [
    { label: 'Discuss', description: 'EXTREME adversarial critique — nothing held back. The most important step.', action: 'claude:discuss' },
    { label: 'View/Edit', description: 'Show the plan, then edit it', action: `claude:view-edit ${stage}/${file}` },
    { label: 'Delete', description: 'Remove this plan permanently', action: `claude:delete ${stage}/${file}` },
  ].filter((o) => !taken.has(o.label));

  if (rest.length > 0) {
    const options = rest.slice(0, 3).map((o) => ({ label: o.label, description: o.description }));
    options.push({ label: 'Not now', description: 'Nothing else for this plan.' });
    for (const o of rest.slice(0, 3)) actions[o.label] = o.action;
    actions['Not now'] = '';
    questions.push({
      question: `Anything else for ${name}?`,
      header: 'This plan',
      options,
    });
  }

  return { text, ask: { questions }, actions };
}

/**
 * The one line that tells the human whether this plan has ENOUGH INFORMATION to be
 * built without guessing, and what is still open if not. This is the whole point of
 * carrying the verdict: a person deciding a gate can see, before they decide,
 * whether the implementer would have to guess.
 *
 * Each not-ready reason is spelled out in plain words — a human should never have
 * to decode a status code (`not-computed`, `open-forks`) to know what is going on.
 *
 * @param {object} d a pendingGateDecisions descriptor
 * @returns {string}
 */
function sufficiencyLine(d) {
  if (d.enough === true) {
    return '  Enough information: YES — every decision this plan needs has been answered.\n';
  }
  const open = Array.isArray(d.blockingQuestionIds) ? d.blockingQuestionIds : [];
  const why = {
    'open-forks': open.length > 0
      ? `${open.length} decision${open.length === 1 ? '' : 's'} still unanswered (${open.join(', ')})`
      : 'a decision is still unanswered',
    'not-computed': 'nobody has worked out what this plan still needs to be asked',
    'stale': 'the plan changed after its questions were worked out',
    'invalid': 'the stored questions are unreadable',
    'unknown-plan': 'the plan file could not be read',
    'answers-unreadable': 'the answers log could not be read, and a decision is open',
    'unavailable': 'the check could not run',
    'held': 'you are holding this plan; choose Release the hold on it to let it move on',
    'unclassified': 'the gate critic has not yet checked the questions its author wrote, so it cannot move on by itself; it waits for that check or for your approval',
  }[d.sufficiencyReason] || String(d.sufficiencyReason);
  return `  Enough information: NO — ${why}.\n`;
}

/** The option label that asks for one plan's questions to be generated. */
const GENERATE_LABEL = 'Generate its questions';
/** The option label that asks the gate critic to check an author's questions. */
const CHECK_LABEL = 'Check its questions';

/**
 * Where the gate critic's check of an author's question file stands, read from the task
 * registry: `'checking'` while a `classify` task for this revision is queued or running,
 * `'ended'` when one finished or failed (it is never retried in a loop), `'none'` otherwise.
 * A registry that cannot be read reads `'none'` (the human may ask; the menu adds nothing twice).
 * @param {string} root
 * @param {string} ref
 * @param {number} revisionMs the question file's revision stamp
 * @returns {'checking'|'ended'|'none'}
 */
function checkState(root, ref, revisionMs) {
  const label = `revision-${Math.floor(revisionMs)}`;
  let tasks = [];
  try {
    tasks = require('./task-registry').load(root).tasks.filter((t) => t.kind === 'classify' && t.plan === ref && t.label === label);
  } catch {
    tasks = []; // an unreadable registry: the menu itself refuses a second task for one revision
  }
  if (tasks.some((t) => t.status === 'queued' || t.status === 'running' || t.status === 'cancelling')) return 'checking';
  return tasks.length > 0 ? 'ended' : 'none';
}

/** The one plain line a screen shows for a plan whose questions the gate critic has not checked. */
const CHECK_LINES = Object.freeze({
  checking: '  Its questions are being checked by the gate critic; it moves on by itself once they are, or when you approve it.\n',
  none: '  The gate critic has not yet checked the questions its author wrote; choose Check its questions, or approve it yourself.\n',
  ended: "  The gate critic's check of its questions did not finish; approve it yourself, or change the plan to have them checked again.\n",
});

/**
 * The sufficiency reasons that ARE a question-store status other than 'ready'
 * (`streaming-precompute.hasEnoughInformation` returns the store status as its reason
 * when the store is not ready). 'unavailable' — the check could not run — is NOT here:
 * a store nobody could read is not evidence that questions are missing.
 */
const QUESTIONS_NOT_READY = new Set(['not-computed', 'stale', 'invalid', 'unknown-plan']);

/**
 * Build the option list; the RECOMMENDED option is placed FIRST (menu convention).
 *
 * THE GENERAL RULE: an option validation has already refused is NOT offered. On a
 * failing plan the affirmative Approve is ABSENT (not last, not with a self-refusing
 * description) — Open leads, then Skip. On a clean plan Approve leads. The
 * `stream approve` ACTION is still built by the caller regardless; this governs only
 * what the human is OFFERED.
 *
 * `canGenerate` (the plan's questions are missing or stale) appends "Generate its
 * questions" LAST and never as the recommendation: question generation runs only when
 * the human chooses it, for that one plan. At most four options, the limit of the
 * asking tool.
 *
 * @param {object} d - the pending-decision descriptor
 * @param {boolean} [canGenerate] - offer "Generate its questions"
 * @returns {Array<{label: string, description: string}>}
 */
function buildOptions(d, canGenerate) {
  const open = {
    label: 'Open the plan',
    description: d.passesValidation
      ? 'View the plan before deciding.'
      : 'Recommended — this plan fails validation; open it to see what to fix.',
  };
  const skip = { label: 'Skip for now', description: 'Move to the next pending decision (nothing is changed).' };
  const generate = canGenerate ? [{
    label: GENERATE_LABEL,
    description: 'Run the question critique for this plan in the background. Its questions appear the next time this decision is shown; nothing else changes.',
  }] : [];
  if (!d.passesValidation) return [open, skip, ...generate];
  const approve = {
    label: d.approveLabel,
    description: 'Recommended — everything checks out. Your answer is recorded as yours.',
  };
  return [approve, open, skip, ...generate];
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
function gateScreenAt(decisions, index, statusLine, root) {
  if (!Array.isArray(decisions) || index < 0 || index >= decisions.length) {
    return nothingPendingScreen(statusLine);
  }
  const d = decisions[index];
  const total = decisions.length;

  // BROKEN ARTIFACT first: an empty plan is not a decision and has no product
  // question to ask. Render the broken-plan screen instead of the approval question,
  // deriving the stage/file from the descriptor's ref (a broken descriptor is only
  // ever produced for a readable-but-empty plan — an unreadable one is skipped by
  // readPlans and never reaches here — so the reason is always 'empty').
  if (d.broken) {
    const parsed = parseRef(d.ref);
    const stage = parsed ? parsed.stage : d.fromStage;
    const file = parsed ? parsed.file : `${d.slug}.md`;
    return brokenPlanScreen(stage, file, root, 'empty');
  }

  // PRE-COMPUTE: if this plan has fresh, not-yet-fully-answered precomputed
  // questions, ask the first unanswered one INSTANTLY. Otherwise (no precompute,
  // or all answered) fall through to the simple Approve question below — which,
  // once every precomputed question is answered, is the FINAL gate crossing. The
  // read is fail-soft: any hiccup returns null and we ask the simple question.
  if (isNonEmptyStr(root)) {
    let rich = null;
    try {
      rich = richQuestionScreen(d, index, total, statusLine, root);
    } catch { rich = null; }
    if (rich) return rich;
  }

  // The plan's questions are missing or stale. Read off the verdict
  // `pendingGateDecisions` already computed for this descriptor: a sufficiency reason in
  // QUESTIONS_NOT_READY is exactly a question-store status other than 'ready', which is
  // `!isFresh` — the predicate `plansNeedingQuestions` uses — so the option appears on
  // exactly the decisions `plansNeedingQuestions` lists, except an empty plan (it got
  // the broken-plan screen above). The session-start line counts the unbuilt ones and
  // lists the built ones under "Waiting for your OK"; a built plan keeps the option. No
  // second read and no require here: a store that cannot even load yields
  // 'unavailable', which offers nothing, and the screen still renders.
  const canGenerate = isNonEmptyStr(root) && QUESTIONS_NOT_READY.has(d.sufficiencyReason);
  // An author's file the gate critic has not checked: one plain line, and one action to check
  // it when no check exists for this revision. Its questions are never offered as options.
  const unchecked = isNonEmptyStr(root) && d.questionsClassified === false && d.sufficiencyReason !== 'held'
    ? checkState(root, d.ref, d.questionsRevisionMs) : null;

  let text = '';
  if (statusLine) text += `${stripCtl(statusLine)}\n\n`;
  text += `Topic: ${humanPlanName(d.title, d.slug)}  ·  ${d.moment}  ·  decision ${index + 1} of ${total}\n`;
  text += `${'─'.repeat(40)}\n\n`;
  text += `  ${d.summary}\n\n`;
  text += unchecked ? CHECK_LINES[unchecked] : sufficiencyLine(d);
  text += '\n\n';

  const actions = {
    [d.approveLabel]: `stream approve ${d.ref}`,
    'Open the plan': `plan ${d.ref}`,
    'Skip for now': `stream skip ${d.ref}`,
    // AskUserQuestion's built-in "Other" free-text path records a comment.
    'Other': `stream comment ${d.ref}`,
  };
  if (canGenerate) actions[GENERATE_LABEL] = `claude:generate-questions ${d.ref}`;
  const options = buildOptions(d, canGenerate);
  if (unchecked === 'none') {
    options.push({ label: CHECK_LABEL, description: 'Ask the gate critic to check the questions its author wrote, in the background. Nothing else changes.' });
    actions[CHECK_LABEL] = `stream check ${d.ref}`;
  }

  return {
    text,
    ask: {
      questions: [{
        question: gateWords.question(d.fromStage, humanPlanName(d.title, d.slug)),
        header: d.chip,
        options,
      }],
    },
    actions,
  };
}

/**
 * The streaming gate screen: the FIRST pending decision, or the nothing-pending
 * screen when the queue is empty. This is the new `/ctoc:start` default.
 *
 * Question GENERATION is NOT kicked here, and this module spawns no subprocess. The
 * CTOC runtime is a plugin inside the Claude command-line interface — plain code
 * cannot dispatch a CTOC subagent, and it must never spawn a second Claude. Generation
 * runs ONLY when the human asks: a decision whose questions are missing offers
 * "Generate its questions" (`claude:generate-questions <ref>`), and `start.md` runs the
 * gate-critique precompute for that one plan as background work, which writes through
 * `streaming-precompute.writePlanQuestions`. Nothing is generated when the menu opens
 * or a session starts. This screen only READS that store (instant, fail-soft).
 * @param {string} projectRoot
 * @param {string} [statusLine]
 * @param {{banner?: boolean}} [opts] - `banner:false` suppresses the on-open engine
 *   banner (streamAnswer sets this because it appends loopBDirective itself).
 */
function streamingGateScreen(projectRoot, statusLine, opts) {
  // Sweep the waiting folder FIRST, so the banner and the decisions describe the questions
  // this very render shows (a file swept in later in the render would read as missing above).
  // Fail-soft: a sweep that throws is reported on the status line, and the render below sweeps
  // again before it reads any question.
  let sweepFault = '';
  if (isNonEmptyStr(projectRoot)) {
    try {
      require('./streaming-questions-sweeper').sweepPendingQuestions(projectRoot);
    } catch (err) {
      sweepFault = `New questions could not be taken in (${stripCtl((err && err.message) || String(err))}).`;
    }
  }
  // THE ON-OPEN ENGINE BANNER. Compute it BEFORE pendingGateDecisions so
  // loopBDirective's own before/after snapshot straddles the sufficiency cross (the
  // same ordering streamAnswer uses at its call site). The banner is added ONCE, here
  // at the top-level default-screen assembly, so every default entry path shows it and
  // no path double-renders. streamAnswer passes `{ banner: false }` because it appends
  // loopBDirective itself — without the flag its screen would carry loopB twice.
  const withBanner = !opts || opts.banner !== false;
  const banner = withBanner ? engineStatusBanner(projectRoot) : '';
  const decisions = pendingGateDecisions(projectRoot);
  // Plans left out of the decisions because of their file name are COUNTED on the
  // status line, never hidden.
  const unsafe = countUnsafePlanFiles(projectRoot);
  const notice = unsafe > 0
    ? `${unsafe} plan file(s) have a name CTOC will not pass to a command — rename them.`
    : '';
  const status = [statusLine, notice, sweepFault].filter((x) => isNonEmptyStr(x)).join('  ');
  const screen = gateScreenAt(decisions, 0, status || statusLine, projectRoot);
  if (banner && screen && typeof screen.text === 'string') {
    screen.text = banner + screen.text;
  }
  return screen;
}

/**
 * The engine's human-facing status, prepended to the DEFAULT `/ctoc:start` screen so the
 * human SEES it on open — not only in SessionStart's injected context (which the session
 * MODEL reads) and streamAnswer (which fires only after answering). Composes the two
 * existing plain-words sources, in order: what was produced since you last looked
 * (`increment-feed.whileYouWereAway`) then the build-loop state
 * (`loop-b-driver.loopBDirective`). Both return a leading-newline string or '' (already
 * capped, gate-number-clean, plain-title) — used verbatim. FAIL-OPEN per source: a throw
 * yields '' so the screen always renders (mirrors SessionStart's try/catch-to-'' shape).
 * @param {string} root
 * @returns {string} '' or "line(s)\n\n"
 */
function engineStatusBanner(root) {
  if (!isNonEmptyStr(root)) return '';
  let away = '';
  try { away = require('./increment-feed').whileYouWereAway(root) || ''; } catch { away = ''; }
  let loopB = '';
  try { loopB = require('./loop-b-driver').loopBDirective(root) || ''; } catch { loopB = ''; }
  const body = `${away}${loopB}`.replace(/^\n+/, '');
  return body ? `${body}\n\n` : '';
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
  return gateScreenAt(decisions, nextIndex, statusLine, projectRoot);
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
  return gateScreenAt(decisions, 0, statusLine, projectRoot);
}

/**
 * `stream approve <ref>` — the human answered "Approve". This reply IS the human's
 * gate approval. Cross via the gate-safe `approvePlan` (validates + stamps
 * `approved_by: human`; REFUSES an invalid transition). Surface the refusal; never
 * override it. Returns the NEXT pending decision with a one-line status.
 *
 * After a successful approve the work keeps moving: `menu-screens.continueAfterCrossing` runs
 * with the plan just crossed, and what it started (a planner, a classification, a build) rides
 * on the screen as `promote` for the session to launch, named in one status sentence.
 */
function streamApprove(ref, projectRoot) {
  const parsed = parseRef(ref);
  if (!parsed) {
    return streamingGateScreen(projectRoot, `Ignored an invalid plan reference: ${stripCtl(String(ref))}`);
  }
  const planPath = path.join(getPlansDir(projectRoot), parsed.stage, parsed.file);
  let statusLine;
  let cont = null;
  try {
    const res = approvePlan(planPath, projectRoot);
    if (res && res.refused) {
      statusLine = `Refused ${parsed.file}: ${stripCtl(String(res.reason || 'failed validation'))}`;
    } else {
      // approvePlan crossed the gate (it either returns { newPath, … } or throws /
      // refuses — there is no silent no-op return).
      const to = GATE_META[parsed.stage].toStage;
      statusLine = `Approved ${parsed.file} → ${to} (approved_by: human).`;
      cont = continueAfter(projectRoot, [{ ref: `${to}/${parsed.file}`, toStage: to, name: nameOfPlanAt(projectRoot, to, parsed.file) }]);
      if (cont.sentence) statusLine += `  ${cont.sentence}`;
    }
  } catch (err) {
    statusLine = `Could not approve ${parsed.file}: ${stripCtl((err && err.message) || String(err))}`;
  }
  const slug = parsed.file.replace(/\.md$/, '');
  const screen = advanceExcludingSlug(slug, projectRoot, statusLine);
  if (cont && cont.promote.length > 0) screen.promote = cont.promote;
  return screen;
}

/** The human name of the plan file at `stage/file`, or its slug when it cannot be read. */
function nameOfPlanAt(root, stage, file) {
  const slug = file.replace(/\.md$/, '');
  try {
    const m = safeFs.readFileSync(path.join(getPlansDir(root), stage, file), 'utf8').match(/^#\s+(.+)$/m);
    return humanPlanName(m ? m[1].trim() : '', slug);
  } catch {
    return stripCtl(slug);
  }
}

/**
 * Run the continuation (`menu-screens.continueAfterCrossing`, required lazily: menu-screens
 * requires this module) and phrase what it started in one sentence. Fail-soft: a fault
 * starts nothing and says nothing.
 * @returns {{crossed: Array<object>, pending: Array<object>, promote: Array<object>, sentence: string}}
 */
function continueAfter(root, extraCrossed) {
  try {
    const cont = require('./menu-screens').continueAfterCrossing(root, extraCrossed);
    const started = Array.isArray(cont.started) ? cont.started : [];
    const sentence = started.length > 0 ? `Started in the background: ${started.join('; ')}.` : '';
    return { crossed: cont.crossed, pending: cont.pending, promote: Array.isArray(cont.promote) ? cont.promote : [], sentence };
  } catch {
    return { crossed: [], pending: [], promote: [], sentence: '' };
  }
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

/**
 * Append one entry to the answers log (`.ctoc/streaming/answers.jsonl`) — the one writer of
 * that log. The entry is written as `'\n' + JSON + '\n'` in ONE append, so every entry starts on
 * a new line whatever the log's last byte is: a torn last line stays alone on its line instead
 * of fusing with the entry after it (the reader skips blank lines). Throws on a write failure;
 * the caller reports it.
 * @param {string} root
 * @param {object} record
 */
function appendAnswerEntry(root, record) {
  const dir = path.join(root, '.ctoc', 'streaming');
  if (!safeFs.existsSync(dir)) safeFs.mkdirSync(dir, { recursive: true });
  safeFs.appendFileSync(path.join(dir, 'answers.jsonl'), `\n${JSON.stringify(record)}\n`, 'utf8');
}

/**
 * `stream answer <ref> '<questionId>' '<optionKey>' ['<digest>']` — the human answered ONE
 * question, held a plan, kept a hold, or released one. Records exactly one entry in the
 * answers log through `appendAnswerEntry`, never edits a plan, and then lets the work keep
 * moving (`menu-screens.continueAfterCrossing`), whose crossings and started work are named
 * in the screen and returned as `promote`.
 *
 * What is recorded, and what is refused (nothing written, the human told why):
 *   - CTOC's own question (`HOLD.questionId`): key `hold` keeps the hold; key `release` ends
 *     it only when the screen's digest is `HOLD.digest`. Any other key is refused. Neither
 *     needs the plan's question file.
 *   - any other question: its set must be readable and hold the question; the key must be
 *     `HOLD.hold.key` or one of its option keys. A hold — `hold`, or any gate-ruling option
 *     whose label does not begin "Approve " — records CTOC's hold (`heldOn` names the
 *     question) and no answer, whatever the digest: holding is never refused. Any other
 *     answer is recorded only when `shownDigest` equals the stored question's digest, so a
 *     question rewritten between showing and clicking is asked again instead of inheriting
 *     the click.
 * Every `ctoc-hold` entry carries `HOLD.digest`; every answer carries the digest it was given
 * for and the question set's revision stamp.
 *
 * @param {string} ref plan reference ("stage/file.md")
 * @param {string} questionId the answered question's id
 * @param {string} optionKey the chosen option's key
 * @param {string} projectRoot
 * @param {string} [shownDigest] the digest of the question as the screen showed it
 */
function streamAnswer(ref, questionId, optionKey, projectRoot, shownDigest) {
  const parsed = parseRef(ref);
  if (!parsed) {
    return streamingGateScreen(projectRoot, `Ignored an answer for an invalid plan reference: ${stripCtl(String(ref))}`);
  }
  const qid = stripCtl(String(questionId == null ? '' : questionId)).trim();
  const key = stripCtl(String(optionKey == null ? '' : optionKey)).trim();
  if (!qid || !key) {
    return streamingGateScreen(projectRoot, `Ignored an incomplete answer for ${parsed.file}.`);
  }
  const shownRaw = stripCtl(String(shownDigest == null ? '' : shownDigest)).trim();
  const shown = /^[0-9a-f]{64}$/.test(shownRaw) ? shownRaw : null;
  const nothing = (why) => streamingGateScreen(projectRoot, `Nothing was recorded for ${parsed.file}: ${why}`);
  const notAnAnswer = "that is not one of the question's answers.";
  const changed = 'this answer does not match the question as it stands now, so it cannot be checked. The question will be asked again.';

  let precompute;
  let st = null;
  try {
    precompute = require('./streaming-precompute');
    if (qid !== precompute.HOLD.questionId) st = precompute.planQuestionsStatus(projectRoot, ref);
  } catch (err) {
    return nothing(`its questions could not be read (${stripCtl((err && err.message) || String(err))}), so your answer cannot be checked. The question will be asked again.`);
  }
  const { HOLD } = precompute;
  const ts = new Date().toISOString();
  let record;
  let holds;
  if (qid === HOLD.questionId) {
    if (key === HOLD.keep.key) {
      holds = true;
      record = { ts, ref, questionId: HOLD.questionId, optionKey: HOLD.keep.key, holds: true, questionDigest: HOLD.digest };
    } else if (key === HOLD.release.key) {
      if (shown !== HOLD.digest) return nothing(changed);
      holds = false;
      record = { ts, ref, questionId: HOLD.questionId, optionKey: HOLD.release.key, holds: false, questionDigest: HOLD.digest };
    } else {
      return nothing(notAnAnswer);
    }
  } else {
    if (st.status !== 'ready') {
      return nothing(`its questions could not be read (${stripCtl(String(st.reason))}), so your answer cannot be checked. The question will be asked again.`);
    }
    const q = st.questions.find((x) => x.id === qid);
    if (!q) return nothing('it does not ask that question now.');
    const chosen = q.options.find((o) => o.key === key);
    if (key !== HOLD.hold.key && !chosen) return nothing(notAnAnswer);
    holds = key === HOLD.hold.key || (isGateRuling(qid) && !String(chosen.label).startsWith('Approve '));
    if (holds) {
      record = { ts, ref, questionId: HOLD.questionId, optionKey: HOLD.hold.key, holds: true, heldOn: qid, questionDigest: HOLD.digest };
    } else {
      if (shown === null || shown !== precompute.questionDigest(q)) return nothing(changed);
      record = { ts, ref, questionId: qid, optionKey: key, holds: false, planMtimeMs: st.questionsRevisionMs, questionDigest: shown };
    }
  }

  try {
    appendAnswerEntry(projectRoot, record);
  } catch (err) {
    return streamingGateScreen(projectRoot, `Could not record the answer for ${parsed.file}: ${stripCtl((err && err.message) || String(err))}`);
  }
  const released = record.questionId === HOLD.questionId && holds === false;
  const status = holds
    ? `You are holding ${parsed.file}. Nothing moves it until you release the hold.`
    : released ? `Released the hold on ${parsed.file}.` : `Recorded your answer for ${parsed.file}.`;

  // THE WORK KEEPS MOVING: the continuation crosses what this answer allowed, queues a planner
  // or a classification, and starts approved builds; the directive names what moved. FAIL-OPEN:
  // any fault omits the directive but NEVER loses the recorded answer or breaks the screen.
  const cont = continueAfter(projectRoot);
  let directive = '';
  try {
    directive = require('./loop-b-driver').loopBDirective(projectRoot, { crossed: cont.crossed, pending: cont.pending });
  } catch {
    directive = '';
  }
  const statusLine = cont.sentence ? `${status}  ${cont.sentence}` : status;
  // A hold (or a keep) moves the screen past the plan just held; otherwise the screen shows
  // the next question or decision. `{ banner: false }`: the directive is appended here.
  const screen = holds
    ? advanceAfter(ref, projectRoot, statusLine)
    : streamingGateScreen(projectRoot, statusLine, { banner: false });
  if (directive && screen && typeof screen.text === 'string') screen.text += directive;
  if (cont.promote.length > 0) screen.promote = cont.promote;
  return screen;
}

module.exports = {
  pendingGateDecisions,
  streamingGateScreen,
  streamApprove,
  streamSkip,
  streamComment,
  streamAnswer,
  planDecisionScreen,
  renderDeclaredScope,
  humanPlanName,
  // Exported as the testable seam for the sufficiency audit record. Both are live
  // internally: `composeSufficiencyEvidence` is called by `crossBySufficiency`, which
  // is called by `pendingGateDecisions` on every gate-screen render.
  composeSufficiencyEvidence,
  crossBySufficiency,
};
