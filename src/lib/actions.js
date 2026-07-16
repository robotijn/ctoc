/**
 * Plan Actions
 * Handle plan operations: approve, reject, move, etc.
 *
 * R5-B — approvePlan VALIDATES and records overrides:
 *   - `approvePlan` runs `plan-validator.validateTransition(from → to)` before every
 *     crossing. A FAILING validation REFUSES by default (`{ ok:false, refused:true }`)
 *     — no move, no marker, no ledger entry. The human's explicit
 *     `approvePlan(p, root, { override:{ reason } })` crosses anyway and RECORDS the
 *     override in both the ledger entry (`override:true`, `override_reason`) and the
 *     plan marker, so a forced crossing is never indistinguishable from a clean one.
 *   - The three human gate edges are the ONE encoding in `gate-order.js`
 *     (`GATE_EDGES` / `destinationOf` / `isHumanGate` / `GATE_DESTINATIONS`); the
 *     former private `flowMap` and `HUMAN_GATES` literals were duplicate encodings
 *     and are gone.
 *   - `assignDirectly` was DELETED — it inserted a plan into todo/ with no marker and
 *     no ledger entry (the gate hook reverted it). Reaching todo crosses Gate 2 via
 *     `approvePlan` only.
 */

const safeFs = require('./safe-fs');
const path = require('path');
const { parseMetadata, readPlans, getPlansDir, readTodoQueueOrder } = require('./state');
const { refineLoop, appendDeferredQuestions } = require('./iron-loop');
const { writeStatus, clearStatus } = require('./background');
const { findProjectRoot } = require('./project-root');
const { validateForReview, validateTransition } = require('./plan-validator');
const gateOrder = require('./gate-order');
const { logTransition } = require('./transition-log');
const { invalidate } = require('./cache');
const taskRegistry = require('./task-registry');

/**
 * Commit `data` to `target` ATOMICALLY (temp sibling + rename), mirroring the
 * reference-correct writer in approval-ledger.persistEntry and task-registry.save.
 * A bare in-place `writeFileSync(target, …)` truncates the file if a crash lands
 * between open(O_TRUNC) and the full write — corrupting the only copy of a
 * single-source-of-truth artifact (a committed ledger entry, a just-renamed plan).
 * Writing a temp then renaming makes the commit all-or-nothing: a reader sees either
 * the whole old file or the whole new file, never a truncation. On any failure the
 * temp is unlinked and the error rethrown, so a failed commit leaves the prior bytes
 * byte-identical and no litter. rename is atomic on POSIX and a same-directory replace
 * on Windows.
 *
 * @param {string} target - the destination path
 * @param {string|Buffer} data - the bytes to commit
 * @returns {void}
 */
function atomicWriteFileSync(target, data) {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    safeFs.writeFileSync(tmp, data);
    safeFs.renameSync(tmp, target);
  } catch (err) {
    try { safeFs.unlinkSync(tmp); } catch { /* temp may not exist */ }
    throw err;
  }
}

/**
 * Background Agent Types
 */
const AGENT_TYPES = {
  RESEARCH_ASSISTANT: 'research-assistant',
  IMPLEMENTATION_PLANNER: 'implementation-planner',
  IRON_LOOP_INTEGRATOR: 'iron-loop-integrator',
  REVIEW_PREPARER: 'review-preparer',
  CRITIC: 'critic',
  VISION_DECOMPOSER: 'vision-decomposer',
  PRODUCT_OWNER: 'product-owner'
};

/**
 * Record that a background agent should be spawned for a plan
 * This writes the status file - the actual agent spawning is done by Claude
 * following the instructions in ctoc.md
 *
 * @param {string} planPath - Path to the plan file
 * @param {string} agentType - Type of agent to spawn
 * @param {string} [message] - Optional status message
 */
function initBackgroundAgent(planPath, agentType, message) {
  writeStatus(planPath, {
    agent: agentType,
    status: 'working',
    message: message || `${agentType} processing...`
  });
}

// Move plan to new location.
// PRIMARY cache choke point: every stage transition flows through here
// (approve/reject/start/complete/queue-removal/cleanup), so invalidating the
// read cache at the end busts stale counts for all of them (CF1).
function movePlan(planPath, destination, projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = path.join(root, 'plans');
  const destDir = path.join(plansDir, destination);

  if (!safeFs.existsSync(destDir)) {
    safeFs.mkdirSync(destDir, { recursive: true });
  }

  const fileName = path.basename(planPath);
  const newPath = path.join(destDir, fileName);

  // PRIMARY chokepoint guard against silent data loss: renameSync atomically
  // REPLACES an existing destination, so a DIFFERENT same-basename plan already
  // resident at the target stage would be destroyed without a trace (exit 0,
  // "Moved"). In the normal pipeline a plan has ONE slug and lives in ONE stage, so
  // such a collision is always a bug (a stale revert copy, a re-created slug, a
  // manually staged file). Refuse loudly. This also protects approvePlan's internal
  // move (via stampAndLedger) — the rollback there always moves back onto an EMPTY
  // source, so it never trips this guard.
  //
  // A self-move (source path === destination path) is exempt: it is a legitimate
  // idempotent no-op — e.g. completeExecution re-running on a plan an agent already
  // moved to review/ calls movePlan(review/slug.md, 'review'). Moving a file onto
  // itself destroys nothing.
  if (safeFs.existsSync(newPath) && path.resolve(newPath) !== path.resolve(planPath)) {
    throw new Error(
      `Refusing to overwrite existing plan at ${destination}/${fileName} ` +
      `(a same-basename plan already resident there would be destroyed)`
    );
  }

  safeFs.renameSync(planPath, newPath);
  invalidate(); // CF1: bust cached counts so the next read reflects the move

  // PI3: additive, fail-open plan-index sync guard. A pure stage move only renames
  // the file (bytes byte-identical before/after), so the plan's contentHash is
  // unchanged → re-path the stored units via store.moveUnit (NO re-embed). Wrapped
  // in try/catch: an index error is logged and swallowed — it must NEVER break the
  // primary rename (the index is a rebuildable cache; SY-13). PI0 owns the store
  // wiring; until PI0 is integrated the wiring is absent and this is a no-op.
  try {
    // F1: pass the SAME `root` used to normalize the moveUnit keys (below) so the
    // guard opens the store keyed on that identical root. Passing `getWiring()` argless
    // resolved it against `process.cwd()` instead — on a symlinked checkout or any
    // `movePlan(projectPath ≠ cwd)` that re-pathed the WRONG store and silently no-op'd
    // (the seam looked live but re-pathed nothing). Keyed on `root`, the seam goes live
    // even when projectPath ≠ cwd.
    const wiring = loadPlanIndexWiring(root);
    if (wiring && wiring.store && typeof wiring.store.moveUnit === 'function') {
      const fromNorm = normalizePlanIndexPath(root, planPath);
      const toNorm = normalizePlanIndexPath(root, newPath);
      wiring.store.moveUnit(fromNorm, toNorm); // pure re-path; embedder untouched
    }
  } catch (err) {
    logPlanIndexError(root, 'movePlan', err);
  }

  return newPath;
}

/**
 * Best-effort load of PI0's plan-index composition-root wiring. Returns
 * `{ store, embedder, calibrationReady }` or null if PI0 is not yet integrated
 * (fail-open). Lazy-required inside the guard so there is no load-time cycle.
 *
 * @param {string} [root] The resolved project root the CALLER normalizes its store
 *   keys against. It MUST be passed through so `getWiring` opens the store keyed on
 *   the same root — otherwise `getWiring()` argless resolves against `process.cwd()`
 *   and re-paths a DIFFERENT store (the F1 dormancy bug). When omitted, `getWiring`
 *   falls back to its own resolution (backward-compatible).
 * @returns {object|null}
 */
function loadPlanIndexWiring(root) {
  try {
    // The PI0 wiring seam does not exist until PI0 integration lands. Require it
    // through an aliased binding so static module resolution does not flag a
    // missing module, while the argument stays a string literal (fail-open).
    const req = require;
    const wiring = req('./plan-index/wiring');
    if (wiring && typeof wiring.getWiring === 'function') {
      // Pass the caller's root so the opened store is keyed IDENTICALLY to the keys
      // the caller normalizes (F1). getWiring canonicalizes the root via realpath so a
      // symlinked root and its realpath map to the SAME singleton/store (F2).
      const w = typeof root === 'string' && root.length > 0
        ? wiring.getWiring({ projectPath: root })
        : wiring.getWiring();
      if (w && w.store) return w;
    }
  } catch {
    /* PI0 wiring not present — fail-open */
  }
  return null;
}

/**
 * Realpath-canonicalize a directory (fail-open). Mirrors `wiring.canonicalizeRoot`
 * so the store-open root (in getWiring) and the key-normalization root here are
 * byte-identical on a symlinked checkout (F2). Falls back to the input on any error
 * (realpath throws for a not-yet-existing path).
 * @param {string} dir
 * @returns {string}
 */
function canonicalizeRoot(dir) {
  try {
    return require('fs').realpathSync.native(dir);
  } catch {
    return dir;
  }
}

/**
 * Normalize a plan path to the canonical `plans/<stage>/<slug>.md` POSIX form the
 * plan index keys on (PI1 D9). Cross-platform.
 *
 * F2: `root` is realpath-canonicalized the SAME way `wiring.getWiring` canonicalizes
 * the root it opens the store against, so on a symlinked root the `path.relative`
 * anchor and the store-open anchor are byte-identical and the keys never diverge.
 * (The result is additionally sliced from the last `plans/` segment, so the key is
 * anchor-robust; canonicalizing `root` keeps the relative computation itself sound
 * when `planPath` is reached through a symlink.)
 * @param {string} root
 * @param {string} planPath
 * @returns {string}
 */
function normalizePlanIndexPath(root, planPath) {
  const canonRoot = canonicalizeRoot(root);
  const canonPlan = canonicalizeRoot(path.dirname(planPath));
  const planBase = path.basename(planPath);
  const rel = path.relative(canonRoot, path.join(canonPlan, planBase));
  const posix = rel.split(path.sep).join('/').replace(/\\/g, '/');
  const idx = posix.lastIndexOf('plans/');
  return idx >= 0 ? posix.slice(idx) : posix;
}

/**
 * Best-effort error log to `.ctoc/logs/plan-index-sync.json`. Never throws.
 * @param {string} root
 * @param {string} source
 * @param {Error} err
 */
function logPlanIndexError(root, source, err) {
  try {
    const logDir = path.join(root, '.ctoc', 'logs');
    if (!safeFs.existsSync(logDir)) safeFs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'plan-index-sync.json');
    let log = [];
    if (safeFs.existsSync(logPath)) {
      try { log = JSON.parse(safeFs.readFileSync(logPath, 'utf8')); } catch { log = []; }
    }
    if (!Array.isArray(log)) log = [];
    log.push({ timestamp: new Date().toISOString(), source, error: err && err.message });
    if (log.length > 500) log = log.slice(-500);
    safeFs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  } catch {
    /* best-effort */
  }
}

// Human gates are the ONE encoding in gate-order (R5-B): the former local
// `HUMAN_GATES` and `flowMap` literals were the SAME three edges declared twice,
// 108 lines apart. approvePlan now reads them via `gateOrder.GATE_EDGES` /
// `gateOrder.isHumanGate` / `gateOrder.destinationOf`, so changing an edge in
// gate-order moves every consumer and they can never diverge.

// Add approval marker to plan content for human gate crossings. When `override` is
// present (the human's "Approve anyway" past a failing validation), the marker also
// records `override: true` and the reason, so a forced crossing is auditable in the
// plan body itself — never silently indistinguishable from a clean one (R5-B).
function addApprovalMarker(content, from, to, override = null) {
  let marker = `---\napproved_by: human\napproved_at: ${new Date().toISOString()}\ngate_crossed: ${from} → ${to}\n`;
  if (override) {
    const reason = String((override && override.reason) || '').replace(/[\r\n]+/g, ' ').trim();
    marker += `override: true\noverride_reason: ${reason}\n`;
  }
  marker += `---\n\n`;
  return marker + content;
}

/**
 * Atomically cross a human gate: stamp the approval marker ONLY at the
 * destination, commit the approval to the content-hashed ledger, and roll back to
 * a safe state on any failure (finding M18, ADR-5).
 *
 * Ordering (ledger-first commit semantics — approval "commits" when the ledger
 * entry lands for the destination):
 *   1. Compute `destContent = addApprovalMarker(sourceContent)` and its
 *      `content_sha256` over the EXACT bytes that will land at the destination, so
 *      s3's later `verify` hash matches on a residency sweep.
 *   2. Move (rename) source → destination, then write `destContent` at the dest.
 *   3. Write the ledger entry keyed to that hash and the EXACT gate edge.
 *   4. If the destination write OR the ledger write throws: ROLL BACK — move the
 *      file back to the source folder, restore the ORIGINAL unmarked content, and
 *      remove any partial ledger entry. Final state is (a) unmarked + in source.
 *
 * The marker is written ONLY at the destination (step 2), never in the source
 * folder — so the forbidden state (c) marked-and-resident-in-SOURCE is
 * structurally unreachable. A crash AFTER the move but BEFORE the ledger write
 * leaves a marked plan at the destination with NO ledger entry, which s3's
 * residency sweep flags and reverts — self-healing to (a). A crash AFTER the
 * ledger write is a full commit (b) marked + ledgered + in destination.
 *
 * @param {string} planPath - the plan's current (source) path
 * @param {string} from - source stage
 * @param {string} to - destination stage
 * @param {string} root - resolved project root
 * @param {{ move?: Function, writeEntry?: Function, removeEntry?: Function }} [deps]
 *   Injectable seams (default to the real implementations) so a crash-injection
 *   test can force step 3 to throw and assert the rollback. `move(planPath,
 *   destStage)` returns the new path; `writeEntry(slug, entry, root)` and
 *   `removeEntry(slug, root)` match the approval-ledger signatures.
 * @returns {string} the destination path
 */
function stampAndLedger(planPath, from, to, root, deps = {}, override = null) {
  const ledger = require('./approval-ledger');
  const move = deps.move || ((p, destStage) => movePlan(p, destStage, root));
  const writeEntry = deps.writeEntry || ledger.writeEntry;
  const removeEntry = deps.removeEntry || ledger.removeEntry;

  const slug = ledger.slugFromPlanPath(planPath);
  const originalContent = safeFs.readFileSync(planPath, 'utf8');
  const destContent = addApprovalMarker(originalContent, from, to, override);
  const contentHash = ledger.computeContentHash(destContent);

  // The slug is guaranteed ledger-keyable here: the ONLY live caller, `approvePlan`,
  // REFUSES an un-keyable slug (a basename outside `[a-z0-9-]`) BEFORE it ever reaches
  // this function, and the residency sweep uses the SAME `ledger.slugFromPlanPath`
  // derivation. The former "cross MARKER-ONLY when the slug is un-keyable" branch was
  // REMOVED: it moved + stamped a plan with NO ledger entry, and because residency is
  // ledger-driven (R3-C) the sweep then reverted that resident as a gate violation — a
  // genuinely-approved plan branded a forgery. So the ledger entry is ALWAYS written.

  // Step 2: move (rename) source → dest, then write the MARKED bytes at the dest.
  // The marker never touches the source file, so state (c) cannot occur.
  const newPath = move(planPath, to);
  try {
    // ATOMIC (temp+rename): the source was just renamed to newPath, so a bare in-place
    // write here would be the ONLY copy of the plan — a crash mid-write would truncate it.
    atomicWriteFileSync(newPath, destContent);
    // Step 3: commit the approval in the ledger (the source of approval truth).
    writeEntry(slug, {
      content_sha256: contentHash,
      stage_from: from,
      stage_to: to,
      approved_by: 'human',
      // Handover (a): the case-collision guard in approval-ledger.persistEntry only fires
      // when BOTH the existing and incoming records carry `plan_basename`. The live human-
      // approval path omitted it, so two case-differing plans (e.g. `case-plan.md` and
      // `Case-Plan.md`) silently overwrote each other's provenance on the shared canonical
      // key — and the first plan then FAILED its content-hash verify and got reverted out
      // of its gate destination. Recording the original-cased basename arms the guard.
      plan_basename: path.basename(planPath).replace(/\.md$/i, '')
    }, root);

    // R5-B: record the override PROVENANCE in the ledger entry. A silent override
    // — a forced crossing indistinguishable from a clean one — is the defect. The
    // approval ledger (READ-ONLY here) only persists its whitelisted fields, so the
    // override flag is merged into the persisted record via the ledger's OWN
    // ledgerPath, AFTER writeEntry, so the collision + required-field guards still
    // run first. Any failure here throws into the rollback below (never a partial,
    // provenance-less forced crossing).
    if (override) {
      const entryPath = ledger.ledgerPath(slug, root);
      if (safeFs.existsSync(entryPath)) {
        const persisted = JSON.parse(safeFs.readFileSync(entryPath, 'utf8'));
        persisted.override = true;
        persisted.override_reason =
          String((override && override.reason) || '').replace(/[\r\n]+/g, ' ').trim();
        // ATOMIC (temp+rename): this re-opens a COMMITTED ledger entry — the single source
        // of approval truth. A bare in-place write would truncate it on a crash, so verify()
        // would fail and the residency sweep would revert the freshly-approved plan as a forgery.
        atomicWriteFileSync(entryPath, JSON.stringify(persisted, null, 2));
      }
    }
  } catch (err) {
    // Step 4: ROLL BACK to (a) unmarked + in source. Each step is best-effort so a
    // secondary failure never masks the primary error that triggered the rollback.
    try { move(newPath, from); } catch { /* best-effort: leave for s3's sweep */ }
    try { safeFs.writeFileSync(planPath, originalContent); } catch { /* best-effort */ }
    // A case-collision refusal (handover a) means the ledger entry at this slug belongs to
    // a DIFFERENT plan (one differing only by case). writeEntry threw BEFORE writing, so
    // there is nothing OUR crossing added to remove — and removing it would erase the very
    // provenance the collision guard exists to protect. Skip removeEntry in that case.
    const isCollision = /collision/i.test(String(err && err.message));
    if (!isCollision) { try { removeEntry(slug, root); } catch { /* best-effort */ } }
    throw err;
  }
  return newPath;
}

// Approve a plan (move to next stage).
//
// R5-B — a gate that validates nothing is a rubber stamp. Before crossing, every
// transition is run through `plan-validator.validateTransition(from → to)`. A
// FAILING validation REFUSES by default: the plan is NOT moved, NO marker is
// stamped, NO ledger entry is written, and the return is
// `{ ok:false, refused:true, reason, failures, validation }`. The human's explicit
// "Approve anyway" passes `options.override = { reason }`, which crosses ANYWAY and
// RECORDS the override in both the ledger entry and the plan marker — a forced
// crossing is never indistinguishable from a clean one.
//
// The gate edges come from gate-order (`GATE_EDGES` / `isHumanGate`) — the ONE
// encoding; the former private `flowMap`/`HUMAN_GATES` literals are gone.
//
// On success returns { newPath, backgroundAgent, humanGate } (plus `overridden:true`
// on a forced crossing). `options.deps` is forwarded to stampAndLedger's seams.
function approvePlan(planPath, projectPath, options = {}) {
  const root = projectPath || findProjectRoot();
  const plansDir = path.join(root, 'plans');
  const relativePath = path.relative(plansDir, planPath);

  // Find matching flow (single gate-edge encoding — gate-order.GATE_EDGES). The
  // destination is resolved through gate-order.destinationOf(from), so the edge is
  // read from the ONE encoding, never re-declared here.
  for (const [from] of gateOrder.GATE_EDGES) {
    if (relativePath.startsWith(from)) {
      const to = gateOrder.destinationOf(from);
      const isHumanGate = gateOrder.isHumanGate(from, to); // true for every GATE_EDGE

      // VALIDATE before any mutation (R5-B). A refusal returns BEFORE clearStatus,
      // applyIronLoop, the marker/move, and the ledger write — so a refused plan is
      // left byte-identical and in place.
      const override = options.override && typeof options.override === 'object'
        ? options.override
        : null;
      const validation = validateTransition(planPath, from, to, root);
      if (validation && validation.valid === false && !override) {
        const failures = Array.isArray(validation.errors) ? validation.errors : [];
        return {
          ok: false,
          refused: true,
          reason: `${from}→${to} refused: ${failures.join('; ') || 'failed validation'}`,
          failures,
          validation
        };
      }

      // The approval ledger is the SOURCE OF APPROVAL TRUTH (R3-C): residency at a
      // gate destination is ledger-driven, so a crossing that CANNOT be recorded in
      // the ledger is NOT a real crossing. A slug the ledger cannot KEY (a basename
      // with an underscore, dot, space, or any char outside `[a-z0-9-]`) would cross
      // MARKER-ONLY — moved + stamped but with no ledger entry — and the residency
      // sweep (human-gate-check.js / iron-loop-enforcer.checkGateDestinationsApproved)
      // would then REVERT it and brand it a gate violation: a plan the human genuinely
      // approved, silently reverted as a forgery. Even a human override cannot rescue
      // it — an un-keyable slug can never be ledgered, so the override provenance has
      // nowhere to be recorded. REFUSE up front (before clearStatus/applyIronLoop, so
      // the refused plan is left byte-identical and in place), matching the failing-
      // validation refusal contract. `ledger.slugFromPlanPath` is the SAME derivation
      // the residency sweep uses, so this probe agrees with the sweep exactly.
      if (isHumanGate) {
        const ledger = require('./approval-ledger');
        try {
          ledger.ledgerPath(ledger.slugFromPlanPath(planPath), root);
        } catch {
          return {
            ok: false,
            refused: true,
            reason: `${from}→${to} refused: plan slug is not ledger-keyable ` +
                    `(rename to a lowercase [a-z0-9-] basename so the approval can be recorded)`,
            failures: ['un-keyable slug'],
            validation: null
          };
        }
      }

      // Clear any existing status from previous stage
      clearStatus(planPath);

      // Iron Loop refinement runs on the SOURCE file BEFORE the marker/move. It is
      // plan CONTENT, not an approval marker, so running it in the source folder
      // never creates the forbidden marked-in-source state — and doing it before
      // the destination hash is computed means the ledger hash matches the FINAL
      // committed bytes (otherwise a post-hash refinement would make s3's verify
      // fail and revert the freshly-approved plan).
      if (to === 'todo') {
        applyIronLoop(planPath);
      }

      // Cross the gate atomically: stamp at destination + ledger commit + rollback
      // on failure (M18). All three GATE_EDGES are human gates, so the else-branch
      // is a defensive fallback for a hypothetical non-gate flow. A recorded
      // `override` threads through to the marker and ledger provenance.
      let newPath;
      if (isHumanGate) {
        newPath = stampAndLedger(planPath, from, to, root, options.deps || {}, override);
      } else {
        newPath = movePlan(planPath, to, root);
      }

      // Initialize background agent based on transition
      let backgroundAgent = null;
      if (from === 'functional' && to === 'implementation') {
        // Spawn Implementation Planner to generate implementation details
        initBackgroundAgent(newPath, AGENT_TYPES.IMPLEMENTATION_PLANNER,
          'Generating implementation details...');
        backgroundAgent = AGENT_TYPES.IMPLEMENTATION_PLANNER;
      }
      // Note: implementation→todo already has Iron Loop applied synchronously
      // The Iron Loop integrator runs as part of applyIronLoop()

      // Trigger deployment pipeline after Gate 3 (review -> done)
      if (from === 'review' && to === 'done') {
        // Close the gate-violation loop: when the human re-approves a plan across
        // Gate 3, mark any pending gate-violation for it resolved. This is the
        // live consumer of violation-tracker's mutation side (markResolved) —
        // human-gate-check WRITES the violations, this READS+resolves them. Guard
        // on the log existing so a normal approval with no prior violation writes
        // nothing (no empty file created in fresh projects). Never breaks the gate.
        try {
          const violationLog = path.join(root, '.ctoc', 'logs', 'gate-violations.json');
          if (safeFs.existsSync(violationLog)) {
            const { markResolved } = require('./violation-tracker');
            markResolved(path.basename(planPath), root);
          }
        } catch (vtErr) {
          console.error('Gate-violation resolution failed:', vtErr.message);
        }

        try {
          const { getDeploymentConfig, runDeploymentPipeline } = require('./deployment');
          const config = getDeploymentConfig(root);
          if (config.enabled) {
            if (config.ship_gate_confirmed === true) {
              // The human confirmed, per-project, that Gate 3 approval may cross into
              // deploy. Only then does the pipeline fire. Run asynchronously — don't
              // block the plan transition.
              runDeploymentPipeline(newPath, root).catch(err => {
                console.error('Deployment pipeline failed:', err.message);
              });
            } else {
              // G4 (2026-07-14): Gate 3 approval must NEVER auto-cross into a live
              // deploy — deploy is a SEPARATE human ship gate. Record a deploy-ready
              // notice for the human instead of triggering; do not deploy.
              recordDeployReadyNotice(newPath, root);
            }
          }
        } catch (deployErr) {
          console.error('Deployment trigger failed:', deployErr.message);
        }
      }

      // Log transition to audit trail. Honestly record the validation outcome and
      // whether this crossing was a recorded override.
      try {
        logTransition({
          plan: path.basename(planPath),
          from,
          to,
          actor: 'human',
          validation: {
            passed: validation ? validation.valid !== false : true,
            checks: 0,
            warnings: (validation && Array.isArray(validation.warnings)) ? validation.warnings.length : 0
          },
          humanGate: isHumanGate,
          marker: isHumanGate,
          override: !!override
        }, root);
      } catch (logErr) {
        // Don't fail the transition if logging fails
        console.error('Transition logging failed:', logErr.message);
      }

      const result = { newPath, backgroundAgent, humanGate: isHumanGate };
      if (override) result.overridden = true;
      return result;
    }
  }

  throw new Error(`Unknown plan location: ${relativePath}`);
}

// Apply Iron Loop automation to plan
// Runs Integrator + Critic refinement loop to generate detailed execution steps
function applyIronLoop(planPath) {
  let content = safeFs.readFileSync(planPath, 'utf8');
  const metadata = parseMetadata(content);

  if (metadata.iron_loop) {
    return; // Already has Iron Loop
  }

  // Run the refinement loop to generate detailed Steps 8-16
  try {
    const result = refineLoop(planPath);

    // If max rounds reached, append deferred questions
    if (result.status === 'max-rounds' && result.deferredQuestions) {
      appendDeferredQuestions(planPath, result.deferredQuestions);
    }

    // Update metadata to mark iron_loop as applied
    content = safeFs.readFileSync(planPath, 'utf8');
    if (content.match(/^---\n/)) {
      content = content.replace(/^---\n/, '---\niron_loop: true\n');
    } else {
      content = `---\niron_loop: true\n---\n\n${content}`;
    }
    safeFs.writeFileSync(planPath, content);

    // Decision 7 (docs/REFINEMENT_LOOP.md): compute whether the multi-agent
    // refinement loop is indicated for THIS plan, at the exact moment it enters
    // the todo queue — the point the iron-loop-integrator needs the gate result.
    // Persisted durably (NOT into the plan body, to keep plan content stable) so
    // the integrator/menu can read it. Advisory + fail-open: it never blocks the
    // transition. This is the live consumer of refinement-loop's shouldRunLoop,
    // which previously had zero callers under src/ (finding C9).
    recordRefinementGate(planPath);
  } catch (err) {
    // Fallback to basic template if refinement fails
    console.error('Iron Loop refinement failed, using basic template:', err.message);
    applyBasicIronLoopTemplate(planPath);
  }
}

// Fallback basic Iron Loop template
function applyBasicIronLoopTemplate(planPath) {
  let content = safeFs.readFileSync(planPath, 'utf8');

  const ironLoopTemplate = `

---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Verify dev environment ready

### Step 10: IMPLEMENT
- [ ] Implement the feature

### Step 11: REVIEW
- [ ] Self-review code

### Step 12: OPTIMIZE
- [ ] Performance review

### Step 13: SECURE
- [ ] Security audit

### Step 14: VERIFY
- [ ] Run full test suite

### Step 15: DOCUMENT
- [ ] Update documentation

### Step 16: FINAL-REVIEW
- [ ] Final review before merge
`;

  // Update metadata
  if (content.match(/^---\n/)) {
    content = content.replace(/^---\n/, '---\niron_loop: true\n');
  } else {
    content = `---\niron_loop: true\n---\n\n${content}`;
  }

  content += ironLoopTemplate;
  safeFs.writeFileSync(planPath, content);
}

/**
 * Compute and durably record the refinement-loop gate decision for a plan
 * (docs/REFINEMENT_LOOP.md, Decision 7). Reads the plan's `files:` and `effort:`
 * frontmatter and asks `refinement-loop.shouldRunLoop` whether the multi-agent
 * critic loop is indicated, then writes the verdict to
 * `<root>/.ctoc/state/refinement/<slug>.json` for the integrator/menu to read.
 *
 * Advisory only and fully fail-open: any error is swallowed (the refinement gate
 * must never block a plan reaching the todo queue). Does NOT mutate the plan .md.
 *
 * @param {string} planPath - the plan .md path
 */
function recordRefinementGate(planPath) {
  try {
    const { shouldRunLoop } = require('./refinement-loop');
    const content = safeFs.readFileSync(planPath, 'utf8');
    const metadata = parseMetadata(content) || {};

    // `files:` may parse as an array or a comma/newline string; normalize to globs.
    let files = [];
    if (Array.isArray(metadata.files)) {
      files = metadata.files.filter((f) => typeof f === 'string');
    } else if (typeof metadata.files === 'string') {
      files = metadata.files.split(/[,\n]/).map((f) => f.trim()).filter(Boolean);
    }
    const effortLevel = typeof metadata.effort === 'string' ? metadata.effort : 'medium';

    const decision = shouldRunLoop({ effortLevel, files, recentMessages: [] });

    const root = findProjectRoot(path.dirname(planPath));
    const stateDir = path.join(root, '.ctoc', 'state', 'refinement');
    safeFs.mkdirSync(stateDir, { recursive: true });
    const slug = path.basename(planPath, '.md');
    safeFs.writeFileSync(
      path.join(stateDir, `${slug}.json`),
      JSON.stringify({ plan: slug, at: new Date().toISOString(), ...decision }, null, 2)
    );
  } catch {
    /* advisory + fail-open: the refinement gate never blocks entry to todo */
  }
}

// Reject a plan with feedback
function rejectPlan(planPath, feedback, projectPath) {
  const root = projectPath || findProjectRoot();
  let content = safeFs.readFileSync(planPath, 'utf8');
  const metadata = parseMetadata(content);

  const revision = (metadata.revision || 0) + 1;

  // Prepend rejection feedback
  const rejectionHeader = `# REVISION ${revision}

## Rejection Feedback

${feedback}

---

`;

  // Update metadata
  const metadataUpdates = `revision: ${revision}\nrejection_reason: "${feedback.replace(/"/g, '\\"').slice(0, 100)}"\ntag: rejected\n`;

  if (content.match(/^---\n/)) {
    content = content.replace(/^---\n/, `---\n${metadataUpdates}`);
  } else {
    content = `---\n${metadataUpdates}---\n\n${content}`;
  }

  content = rejectionHeader + content;
  safeFs.writeFileSync(planPath, content);

  // Move to functional
  return movePlan(planPath, 'functional', root);
}

// Rename a plan
function renamePlan(planPath, newName) {
  const dir = path.dirname(planPath);
  const ext = path.extname(planPath);
  const newPath = path.join(dir, newName + ext);

  safeFs.renameSync(planPath, newPath);
  return newPath;
}

// Delete a plan
function deletePlan(planPath) {
  safeFs.unlinkSync(planPath);
  invalidate(); // CF1: removing a plan file changes counts; bust the cache
}

// Persist the todo queue order as an ordered array of *.md basenames to
// .ctoc/state/todo-order.json. Atomic: write a pid-scoped temp file, then rename
// it over the target (rename is atomic on POSIX and a same-directory replace on
// Windows), so a concurrent reader never sees a half-written file.
function writeTodoOrder(todoDir, order) {
  const stateDir = path.join(todoDir, '..', '..', '.ctoc', 'state');
  if (!safeFs.existsSync(stateDir)) {
    safeFs.mkdirSync(stateDir, { recursive: true });
  }
  const target = path.join(stateDir, 'todo-order.json');
  const tmp = path.join(stateDir, `todo-order.json.tmp-${process.pid}`);
  safeFs.writeFileSync(tmp, JSON.stringify(order, null, 2) + '\n', 'utf8');
  safeFs.renameSync(tmp, target);
}

// Move plan up in queue (finding H10).
// The order lives in the explicit, mutable key .ctoc/state/todo-order.json —
// read through the SAME source state.js' readPlans uses (readTodoQueueOrder),
// so display order and swap order can never diverge. The former utimes/birthtime
// swap was a silent no-op (birthtime is not writable via fs.utimesSync).
function moveUpInQueue(planPath, projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = path.join(root, 'plans', 'todo');
  const order = readTodoQueueOrder(plansDir); // *.md basenames in queue order
  const target = path.basename(planPath);
  const index = order.indexOf(target);

  // Top boundary (or not found) → a real no-op: return false WITHOUT invalidating.
  if (index <= 0) return false;

  // Swap the target with its previous neighbor.
  [order[index - 1], order[index]] = [order[index], order[index - 1]];
  writeTodoOrder(plansDir, order);

  invalidate(); // CF1: an actual reorder is a write; bust the cache.
  return true;
}

// Move plan down in queue (finding H10). Mirror of moveUpInQueue.
function moveDownInQueue(planPath, projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = path.join(root, 'plans', 'todo');
  const order = readTodoQueueOrder(plansDir);
  const target = path.basename(planPath);
  const index = order.indexOf(target);

  // Bottom boundary (or not found) → a real no-op: return false WITHOUT invalidating.
  if (index < 0 || index >= order.length - 1) return false;

  // Swap the target with its next neighbor.
  [order[index + 1], order[index]] = [order[index], order[index + 1]];
  writeTodoOrder(plansDir, order);

  invalidate(); // CF1: an actual reorder is a write; bust the cache.
  return true;
}

// Remove from queue (back to implementation)
function removeFromQueue(planPath, projectPath) {
  const root = projectPath || findProjectRoot();
  return movePlan(planPath, 'implementation', root);
}

// Note (R5-B): `assignDirectly` was DELETED. It inserted a plan into todo/ with NO
// approval marker and NO ledger entry — the revived gate hook classified that as
// `no-ledger-entry` and reverted it right after the tab UI printed "✓ added to todo
// queue". A plan reaching the todo queue crosses Gate 2 (implementation → todo),
// which is a human gate: the only sanctioned path is `approvePlan` (stamps + ledgers
// properly). The functional tab's dangerous "Assign (skips impl planning)" action was
// removed with it.

// Note (W11-s7, finding B2): five one-line agent-init wrappers (research,
// critic, decomposer, product-owner, review) were deleted here. They had ZERO
// call sites; the real state-transition spawns (approvePlan, completeExecution)
// call the generic initBackgroundAgent() directly with an inline AGENT_TYPES
// constant. See tests/actions-dead-exports-guard.test.js for the regression guard.

/**
 * Move plan to in-progress and prepare for execution
 * @param {string} planPath - Path to the plan in todo
 * @param {string} projectPath - Project root
 */
function startExecution(planPath, projectPath) {
  const root = projectPath || findProjectRoot();
  clearStatus(planPath);
  return movePlan(planPath, 'in-progress', root);
}

/**
 * Complete execution and move to review
 * Validates the plan before allowing transition.
 *
 * @param {string} planPath - Path to the plan in in-progress
 * @param {string} projectPath - Project root
 * @param {Object} [options] - Options
 * @param {boolean} [options.force] - Skip validation (requires CTO-Chief approval)
 * @returns {{ newPath: (string|null), backgroundAgent: (string|null),
 *   validation: Object, blocked: boolean, kickback?: Object, message?: string,
 *   verify?: Object }} the review-transition result; on a blocked completion
 *   `newPath`/`backgroundAgent` are null and `kickback`/`message` are present,
 *   otherwise `verify` carries the Step 14 evidence
 */
function completeExecution(planPath, projectPath, options = {}) {
  const root = projectPath || findProjectRoot();

  // VALIDATION GATE: Validate before moving to review
  const validation = validateForReview(planPath, root);

  if (!validation.valid && !options.force) {
    // A blocked completion IS a kickback: the plan tried to advance out of
    // execution and the pre-review gate refused it, so the executor must go back
    // and fix the failing step. Record it against the SPECIFIC failing step so
    // the circuit breaker can escalate (max 3 same-step / 5 total → human) and an
    // overnight loop cannot retry forever unseen (finding C9).
    const kickback = recordStepKickback(planPath, failingStepFrom(validation), root);
    // Return validation failure - caller must handle
    return {
      newPath: null,
      backgroundAgent: null,
      validation: validation,
      blocked: true,
      kickback,
      message: 'Plan failed pre-review validation. Fix errors or use force with CTO-Chief approval.'
    };
  }

  // If forced with errors, add warning to plan
  if (!validation.valid && options.force) {
    let content = safeFs.readFileSync(planPath, 'utf8');
    const forceWarning = `\n\n---\n## ⚠️ FORCED TO REVIEW\n\nThis plan was forced to review despite validation errors:\n${validation.errors.map(e => `- ${e}`).join('\n')}\n\nApproved by: CTO-Chief override\nDate: ${new Date().toISOString()}\n---\n`;
    content += forceWarning;
    safeFs.writeFileSync(planPath, content);
  }

  clearStatus(planPath);
  const newPath = movePlan(planPath, 'review', root);
  const planSlug = path.basename(newPath, '.md');

  // Couple the TASK state machine to the PLAN state machine (C1-3). The same
  // completion that moves the plan in-progress → review settles the plan's
  // non-terminal implement task in the registry, in ONE load→save:
  //   • a RUNNING task → done (the plan reached review = the implement work
  //     succeeded), recording result { ok: true, summary: 'plan reached review' };
  //   • a CANCELLING task keeps its R2-A status path (reconcile confirms death) but
  //     records a result so a cancelled plan's completion never reads as a clean
  //     success.
  // Fail-open: no registry, no matching task, or any registry error is logged and
  // NEVER breaks the transition (the plan has already moved to review).
  try {
    taskRegistry.withRegistry(root, (registry, ctx) => {
      // C2 (R3-B item 2): settle THE RUNNING task, never an earlier queued duplicate.
      // `findActivePlanTask` prefers the running/cancelling task over a queued one, so a
      // queued duplicate can no longer SHADOW the running task (the old `find()` returned
      // the EARLIEST non-terminal match → the running task was never marked done → a dead
      // file lock until the 120-min orphan sweep, after which the duplicate re-ran a plan
      // already in review).
      const taskForPlan = taskRegistry.findActivePlanTask(registry, planSlug, 'implement');
      if (!taskForPlan) {
        // Item 11: the no-match path is no longer SILENT. A running task used to occupy a
        // slot for two hours with zero trace linking it to the completed plan.
        ctx.abort();
        taskRegistry.warnLog(root, 'plan_task_coupling_missing', {
          plan: planSlug,
          detail: 'plan reached review but no non-terminal implement task was found to settle'
        });
        return;
      }
      if (taskForPlan.status === 'running') {
        taskRegistry.updateTask(registry, taskForPlan.id, {
          status: 'done',
          result: { ok: true, summary: 'plan reached review' }
        });
      } else if (taskForPlan.status === 'cancelling') {
        taskRegistry.updateTask(registry, taskForPlan.id, {
          result: { ok: true, summary: 'plan reached review during cancellation' }
        });
      }
      // Item 2: retire any SHADOW duplicates for this plan so they cannot re-run a plan
      // already in review. Each is a queued implement task for the same plan other than
      // the one we just settled; cancel it (queued → cancelled is immediate + safe).
      for (const dup of registry.tasks) {
        if (dup.kind === 'implement' && dup.plan === planSlug &&
            dup.id !== taskForPlan.id && dup.status === 'queued') {
          taskRegistry.updateTask(registry, dup.id, {
            status: 'cancelled',
            result: { ok: false, summary: 'superseded duplicate — the plan already reached review' }
          });
          taskRegistry.warnLog(root, 'duplicate_plan_task_retired', { plan: planSlug, id: dup.id });
        }
      }
    });
  } catch (couplingErr) {
    console.error(`Task/plan coupling failed for ${planSlug}: ${couplingErr.message}`);
  }

  // PRODUCE the VERIFY evidence Gate 3 depends on, by actually RUNNING Step 14 —
  // never by a human hand-fabricating the artifact (finding C9). Before this
  // wiring `persistVerifyResult` had zero live callers: a live gate with a dead
  // producer, which trained evidence fabrication. Now every in-progress→review
  // completion runs the real quality gate and records the real result on disk at
  // .ctoc/state/verify/<slug>.json. `validateReviewToDone` reads it at Gate 3.
  let verify = null;
  try {
    const { persistVerifyResult } = require('./step-13-verify');
    verify = persistVerifyResult(root, planSlug);
  } catch (err) {
    // A verify RUN error must never be silently swallowed (that would let a plan
    // reach review with no evidence and Gate 3 could not tell why). Surface it
    // loudly; the absent artifact makes Gate 3 fail closed on its own.
    console.error(`⚠️  Step 14 VERIFY failed to run for ${planSlug}: ${err.message}`);
  }

  // Honesty: a failing VERIFY does NOT silently pass to review as if verified.
  // The evidence honestly records passed:false (so Gate 3 refuses it), AND the
  // failure is a Step 14 kickback that the circuit breaker counts and escalates.
  if (verify && verify.passed === false) {
    console.error(
      `⚠️  Step 14 VERIFY FAILED for ${planSlug} — moved to review with evidence ` +
      `passed:false; Gate 3 (review→done) will refuse it. ${verify.summary || ''}`
    );
    recordStepKickback(newPath, 14, root);
  }

  // Initialize review preparer
  initBackgroundAgent(newPath, AGENT_TYPES.REVIEW_PREPARER,
    'Preparing review summary...');

  return {
    newPath,
    backgroundAgent: AGENT_TYPES.REVIEW_PREPARER,
    validation: validation,
    verify,
    blocked: false
  };
}

/**
 * THE KEY FOR THE LOCK (R3-D). Run the REAL completion for a scheduler task's plan.
 *
 * Before this, `completeExecution` — the ONLY producer of the Gate-3 VERIFY
 * evidence, the app-launch last-mile check, and the task/plan coupling — had ZERO
 * callers: the executor agent moved its plan to review/ with a raw file move, so no
 * evidence was ever produced and Gate 3 (correctly fail-closed on evidence) could
 * only be crossed with "Approve anyway". This is the live call site the menu's
 * `menu task complete` route uses for an `implement` task.
 *
 * Behavior (all outcomes REPORTED, never thrown — a completion must never wedge):
 *   • plan in `in-progress/` → the normal path: validate, move to review, run Step
 *     14 VERIFY, persist the evidence, settle the registry task.
 *   • plan already in `review/` (an agent moved it itself, or a re-run) → IDEMPOTENT:
 *     the completion still runs and still produces the evidence. A plan that moved
 *     itself must not be left evidence-less and un-shippable.
 *   • plan file nowhere on disk → `{ ran: false, reason }`. Not every task's `plan`
 *     field names a real plan file (a review/decompose task may name a vision slug),
 *     so this is a report, not an error.
 *   • pre-review validation fails → `{ ran: true, blocked: true, ... }`. The plan is
 *     NOT moved and NO evidence is written: a plan that cannot pass review does not
 *     get an evidence artifact minted for it. `completeExecution` records the
 *     kickback against the failing step (circuit breaker).
 *
 * Security: `planSlug` comes from the task registry, which is on disk and therefore
 * attacker-influenceable. Only a bare, safe slug is ever joined into a path — a
 * value with a separator, a `..`, a NUL, or an extension is REFUSED before any
 * filesystem access, so a crafted `plan` field can never escape `plans/`.
 *
 * @param {string} projectPath - project root
 * @param {string} planSlug - the task's `plan` field (a bare plan slug)
 * @returns {{ran: boolean, reason?: string, blocked?: boolean, stage?: string,
 *   newPath?: (string|null), verify?: Object|null, errors?: string[]}}
 */
/**
 * A plan slug is a bare filename token — the ONLY shape that may be joined into a
 * path under `plans/`. Anything with a separator, a `.`/`..` traversal, a NUL, or
 * any character outside `[A-Za-z0-9._-]` is UNSAFE and must be refused before any
 * `path.join`/filesystem access. Shared by `completeTaskPlan` (refuses) and
 * `planDependsOn` (skips) so both guard on one code path.
 * @param {*} slug
 * @returns {boolean} true iff `slug` is a bare, path-safe plan slug
 */
function isSafePlanSlug(slug) {
  return typeof slug === 'string'
    && /^[A-Za-z0-9._-]+$/.test(slug)
    && slug !== '.' && slug !== '..' && !slug.includes('..');
}

function completeTaskPlan(projectPath, planSlug) {
  const root = projectPath || findProjectRoot();

  if (typeof planSlug !== 'string' || planSlug.length === 0) {
    return { ran: false, reason: 'task carries no plan' };
  }
  // A plan slug is a bare filename token. Anything else is refused BEFORE path.join.
  const slug = planSlug.replace(/\.md$/i, '');
  if (!isSafePlanSlug(slug)) {
    return { ran: false, reason: `unsafe plan slug refused: ${slug.slice(0, 40)}` };
  }

  // Resolve the plan: in-progress is the expected home; review means it already moved.
  const plansDir = getPlansDir(root);
  const inProgress = path.join(plansDir, 'in-progress', `${slug}.md`);
  const inReview = path.join(plansDir, 'review', `${slug}.md`);
  let planPath = null;
  let stage = null;
  if (safeFs.existsSync(inProgress)) {
    planPath = inProgress;
    stage = 'in-progress';
  } else if (safeFs.existsSync(inReview)) {
    planPath = inReview;
    stage = 'review';
  } else {
    return { ran: false, reason: `no plan file for "${slug}" in in-progress/ or review/` };
  }

  const result = completeExecution(planPath, root);
  if (result.blocked) {
    return {
      ran: true,
      blocked: true,
      stage,
      newPath: null,
      errors: (result.validation && result.validation.errors) || [],
      reason: result.message
    };
  }
  return {
    ran: true,
    blocked: false,
    stage,
    newPath: result.newPath,
    verify: result.verify || null
  };
}

/**
 * Identify the Iron Loop step a failed pre-review validation should be kicked
 * back to: the lowest-numbered REQUIRED step that is missing or present-but-
 * incomplete. Falls back to 14 (VERIFY — "the quality gate") when the failure is
 * not step-shaped (e.g. an unmet acceptance criterion), so the counter always
 * has a concrete step key. Pure; reads only the validation result.
 *
 * @param {{checklist?: {steps?: Object}}} validation
 * @returns {number} the step number to key the kickback on
 */
function failingStepFrom(validation) {
  const steps = validation && validation.checklist && validation.checklist.steps;
  if (steps && typeof steps === 'object') {
    const nums = Object.keys(steps)
      .map((k) => parseInt(k.replace(/^step_/, ''), 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    for (const n of nums) {
      const entry = steps[`step_${n}`];
      if (!entry || entry.required !== true) continue;
      const incomplete = entry.present === false ||
        (entry.present === true && entry.completed === false && entry.skipped === false);
      if (incomplete) return n;
    }
  }
  return 14;
}

/**
 * Record one Iron Loop kickback for a plan and SURFACE any resulting escalation
 * to the human. Wraps the circuit breaker (finding C9): before this wiring
 * `recordKickback`/`getEscalations` had zero live callers, so CLAUDE.md's promise
 * — max 3 kickbacks to the same step, max 5 total, then escalate — was enforced
 * NOWHERE and an overnight pipeline could loop forever, unseen.
 *
 * The circuit breaker persists the counter in the plan frontmatter and, on an
 * escalation, appends a durable record to `<root>/.ctoc/logs/escalations.json`
 * (read back via `circuit-breaker.getEscalations(root)`). A counter/IO error
 * never breaks the plan transition — it is reported, not swallowed.
 *
 * @param {string} planPath - the plan .md path (counter lives in its frontmatter)
 * @param {number|string} step - the Iron Loop step being kicked back to
 * @param {string} root - project root (for the escalations log)
 * @returns {{recorded: boolean, byStep?: number, total?: number, escalation?: Object|null, error?: string}}
 */
function recordStepKickback(planPath, step, root) {
  const cb = require('./circuit-breaker');
  const slug = path.basename(planPath, '.md');
  try {
    const res = cb.recordKickback(planPath, step, root);
    if (res.escalation) {
      surfaceEscalation(res.escalation, path.basename(planPath), root);
    }
    return res;
  } catch (err) {
    // A breaker that cannot record its own count is ITSELF a hard escalation: the
    // counter is frozen, so the plan could be kicked back FOREVER unseen. Never
    // silently continue — surface it durably (via the same escalations log the
    // menu/inbox reads) AND loudly, so an overnight loop cannot hide here.
    console.error(`⚠️  CIRCUIT BREAKER FAILURE — ${path.basename(planPath)}: could not record a kickback (${err.message}). Human review required; the counter is NOT advancing.`);
    try {
      cb.recordBreakerFailure(root, { plan: slug, step, error: err.message });
    } catch (logErr) {
      console.error(`⚠️  Failed to persist the breaker-failure escalation for ${slug}: ${logErr.message}`);
    }
    return { recorded: false, error: err.message };
  }
}

/**
 * Surface a circuit-breaker escalation to the human. The record is ALREADY
 * durable in `<root>/.ctoc/logs/escalations.json` (written by the circuit breaker
 * itself and readable via `circuit-breaker.getEscalations(root)`); this makes the
 * automated pipeline LOUD so an overnight run is never silent about a plan that
 * keeps failing.
 *
 * WHERE THE MENU READS IT: the inbox surface reads unresolved entries from
 * `.ctoc/logs/escalations.json` via `inbox.listEscalations(root)` (src/lib/inbox.js),
 * which wraps `circuit-breaker.getEscalations(root)` and filters out acknowledged
 * entries; the dashboard renders them (src/lib/menu-screens.js). This console
 * surface is the additional loud signal; the log is the durable, human-reachable
 * record.
 *
 * @param {{type: string, plan: string, step?: string, count?: number, total?: number}} escalation
 * @param {string} planName - the plan filename (for the message)
 * @param {string} root - project root
 */
function surfaceEscalation(escalation, planName, root) {
  const detail = escalation.type === 'same-step'
    ? `Step ${escalation.step} has been kicked back ${escalation.count} times (max 3).`
    : `plan kicked back ${escalation.total} times total (max 5).`;
  console.warn(
    `\n⚠️  CIRCUIT BREAKER ESCALATION — ${planName}: ${detail}\n` +
    `   Recorded to ${path.join(root, '.ctoc', 'logs', 'escalations.json')}.\n` +
    `   Human review required before the pipeline retries this plan again.\n`
  );
}

/**
 * Record a "deploy-ready" notice for the human ship gate (G4). Crossing Gate 3
 * (review → done) makes a plan DEPLOY-READY, but it must NEVER auto-cross into a
 * live deploy — the human decided push and deploy are the two separate ship gates
 * (2026-07-14). When deployment is enabled but `deployment.ship_gate_confirmed` is
 * not `true`, this writes a durable notice to `<root>/.ctoc/logs/deploy-ready.json`
 * (the same append+rotate pattern the other action logs use) INSTEAD of triggering
 * the pipeline. The menu/inbox surface reads this log to tell the human a plan is
 * awaiting the deploy ship gate.
 *
 * Fail-open: a notice-write error is logged and NEVER breaks the Gate 3 transition
 * (the plan has already crossed to done).
 *
 * @param {string} planPath - the approved plan's (done-stage) path
 * @param {string} root - project root
 */
function recordDeployReadyNotice(planPath, root) {
  try {
    const logDir = path.join(root, '.ctoc', 'logs');
    if (!safeFs.existsSync(logDir)) safeFs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'deploy-ready.json');
    let log = [];
    if (safeFs.existsSync(logFile)) {
      try { log = JSON.parse(safeFs.readFileSync(logFile, 'utf8')); } catch { log = []; }
    }
    if (!Array.isArray(log)) log = [];
    log.push({
      plan: path.basename(planPath),
      at: new Date().toISOString(),
      status: 'deploy-ready',
      message:
        'Plan approved at Gate 3 (review → done) and is DEPLOY-READY. Deploy is a ' +
        'separate human ship gate; set deployment.ship_gate_confirmed: true to enable ' +
        'auto-deploy on Gate 3, or deploy manually.'
    });
    if (log.length > 500) log = log.slice(-500);
    // Handover (b): write ATOMICALLY (temp sibling + rename), mirroring stale-cleanup's
    // pattern, so a crash mid-write never leaves a half-written deploy-ready.json that the
    // menu's reader (readDeployReady) would then treat as zero notices — dropping a plan's
    // ship-gate signal. rename is atomic on POSIX and a same-dir replace on Windows.
    const tmpFile = `${logFile}.tmp-${Date.now()}-${process.pid}`;
    safeFs.writeFileSync(tmpFile, JSON.stringify(log, null, 2));
    safeFs.renameSync(tmpFile, logFile);
  } catch (err) {
    console.error('Deploy-ready notice failed:', err && err.message ? err.message : String(err));
  }
}

/**
 * Extract a plan's declared `files:` globs from its frontmatter, multi-block-safe.
 *
 * A plan that has crossed a human gate carries a PREPENDED approval-marker block
 * ahead of its own frontmatter, so `plan-coverage.readPlanFiles` (single-block)
 * silently returns [] for EVERY plan in todo/. We therefore read the UNION of all
 * leading frontmatter blocks via `stale-detector.extractFrontmatterRegion` (the
 * same helper `state.parseMetadata` uses for exactly this reason) and walk the
 * `files:` list from that merged region. Lazy-required to avoid any load-time cycle.
 *
 * @param {{content?: string}} plan  a plan object from readPlans (carries `content`)
 * @returns {string[]}  declared file globs (repo-relative), [] when none
 */
function planDeclaredFiles(plan) {
  const content = plan && typeof plan.content === 'string' ? plan.content : '';
  if (content.length === 0) return [];
  let region;
  try {
    const { extractFrontmatterRegion } = require('./stale-detector');
    region = extractFrontmatterRegion(content);
  } catch {
    return [];
  }
  if (typeof region !== 'string' || region.length === 0) return [];
  const idx = region.search(/^files:\s*$/m);
  if (idx === -1) return [];
  const lines = region.slice(idx).split('\n').slice(1);
  const files = [];
  for (const line of lines) {
    const m = line.match(/^\s*-\s*["']?([^"'\n]+?)["']?\s*$/);
    if (m) {
      files.push(m[1]);
    } else if (/^\S/.test(line)) {
      break; // next top-level frontmatter key → the files: block is over
    }
  }
  return files;
}

/**
 * Parse a plan's `depends_on:` into a list of dependency slugs. The scalar
 * frontmatter reader stores `depends_on` as a single string; a slug list may be
 * comma- or whitespace-separated. `none`/empty resolve to no dependencies.
 * @param {{metadata?: object}} plan
 * @returns {string[]}
 */
function planDependsOn(plan) {
  const raw = plan && plan.metadata ? plan.metadata.depends_on : null;
  if (raw == null) return [];
  const parts = String(raw).split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  // `depends_on` is attacker-influenceable YAML frontmatter, and each slug is later
  // joined into a path (done/ and review/ existence probes). Drop the `none`
  // sentinel and REFUSE any unsafe token here — a crafted `../../../../etc/passwd`,
  // NUL-bearing, or separator-bearing entry is silently ignored rather than allowed
  // to escape plans/ as an existence oracle (documented choice: an unsafe depends_on
  // entry is ignored, not fatal — one malformed dependency must not throw the whole
  // scheduler).
  return parts.filter((s) => s.toLowerCase() !== 'none' && isSafePlanSlug(s));
}

/**
 * Translate a plan (as produced by `readPlans`) into a scheduler task spec.
 *
 * This is action-layer translation, NOT a new module. The result feeds
 * `task-registry.addAndClaim` directly (named fields only — never a frontmatter
 * spread). Contract:
 *   • kind is always `implement`; the plan's own repo-relative POSIX path is added
 *     to `touches` so two tasks on the same plan file-conflict (the per-plan
 *     serialization that survives the retirement of kind-based serialization).
 *   • A plan with NO `files:` declaration cannot honestly claim file-disjointness,
 *     so this REFUSES it (throws) — s1 makes empty touches on an implement a hard
 *     error; this is the action-layer message for it. The own-path alone is not
 *     enough: undeclared edits are the unasked question.
 *   • `blockedBy` resolves each `depends_on` slug against the registry: a
 *     non-terminal task on that plan → its id is a blocker; no task but the dep
 *     plan sits in done/ or review/ → satisfied (no blocker); no task and not
 *     done/review → REFUSE (enqueue the dependency first).
 *
 * @param {{name:string, path:string, content?:string, metadata?:object}} plan
 * @param {string} projectPath  project root
 * @returns {{kind:'implement', label:string, plan:string, touches:string[], blockedBy:string[]}}
 * @throws {Error} plan lacks a files: declaration, or a dependency cannot be resolved
 */
function taskSpecFromPlan(plan, projectPath) {
  const root = projectPath || findProjectRoot();
  if (!plan || typeof plan.name !== 'string' || typeof plan.path !== 'string') {
    throw new TypeError('taskSpecFromPlan requires a plan object with name and path');
  }

  const declared = planDeclaredFiles(plan);
  if (declared.length === 0) {
    throw new Error(
      `taskSpecFromPlan: plan "${plan.name}" declares no files: — an implement task ` +
      `must declare the files it edits so the scheduler can enforce file-conflict ` +
      `serialization. Add a files: block to the plan frontmatter and retry.`
    );
  }

  // The plan's own path as a repo-relative POSIX string (cross-platform).
  const ownPath = path.relative(root, plan.path).split(path.sep).join('/');
  const touches = Array.from(new Set([...declared, ownPath]));

  // Resolve dependency slugs against the live registry.
  const registry = taskRegistry.load(root);
  const TERMINAL = new Set(['done', 'failed', 'orphaned', 'cancelled']);
  const blockedBy = [];
  for (const slug of planDependsOn(plan)) {
    const nonTerminal = registry.tasks.find((t) => t.plan === slug && !TERMINAL.has(t.status));
    if (nonTerminal) {
      blockedBy.push(nonTerminal.id);
      continue;
    }
    const doneFile = path.join(root, 'plans', 'done', `${slug}.md`);
    const reviewFile = path.join(root, 'plans', 'review', `${slug}.md`);
    if (safeFs.existsSync(doneFile) || safeFs.existsSync(reviewFile)) {
      continue; // dependency already satisfied — no scheduler blocker
    }
    throw new Error(
      `taskSpecFromPlan: plan "${plan.name}" depends on "${slug}", which has no ` +
      `registry task and is not in done/ or review/. Enqueue "${slug}" first so the ` +
      `scheduler can order the work.`
    );
  }

  return {
    kind: 'implement',
    label: plan.name,
    plan: plan.name,
    touches,
    blockedBy
  };
}

/**
 * Start the todo executor agent (scheduler-backed, LOCK-FREE).
 *
 * The global agent lock is retired: the s1 scheduler is now the safety mechanism
 * (file-based serialization, git-exclusive, sync barrier, ≤5 concurrent), so
 * MULTIPLE plans may run concurrently when their declared files are DISJOINT —
 * that is the point of the file-based model, not a bug. Flow: clear any drain-stop
 * → sweep stale in-progress → pick the next todo plan (FIFO) → translate it to a
 * task spec → `addAndClaim`. A claimed task moves its plan to in-progress and
 * reports `started: true`; a task the scheduler cannot start yet stays QUEUED in
 * the registry and reports `{ started: false, queued: true, reason }` — an honest
 * "recorded, waiting on <reason>", not an error.
 *
 * Drain-stop is PROTECTED (C1-10): a graceful stop is only overridden by an
 * explicit human-initiated start — `startAgent(root, { force: true })`, which the
 * menu's start recipe passes (slice R2-D). Without `force`, a drain-stopped root
 * refuses to start new work and returns `{ started: false, drainStopped: true }`
 * with the flag left intact.
 *
 * The FIFO drain never stalls at the head (C1-4): a plan whose spec cannot be built
 * (no `files:`, or an unresolvable dependency) is recorded in `skipped[]` and the
 * NEXT plan is tried; the first plan with a valid spec wins. A single refusal never
 * blocks the plans queued behind it.
 *
 * @param {string} projectPath - Project root
 * @param {{ force?: boolean }} [options] - `force: true` clears a drain-stop and
 *   starts anyway (the human-initiated menu start). Without it a drain-stopped root
 *   is honored.
 * @returns {{ started: boolean, error?: string, queued?: boolean, reason?: string,
 *   task?: object, plan?: object, cleanedUp?: string[], drainStopped?: boolean,
 *   skipped?: Array<{plan:string, reason:string}>,
 *   queuedTasks?: Array<{plan:string, taskId:string, reason:string}>, remainingTodo?: number }}
 */
function startAgent(projectPath, options = {}) {
  const root = projectPath || findProjectRoot();
  const { readPlans, getPlansDir, setAgentStatus } = require('./state');

  // 1. Drain-stop protection (C1-10). A forced (human-initiated) start un-drains
  //    and proceeds; an unforced start honors the drain-stop and starts nothing.
  if (taskRegistry.isDrainStopRequested(root)) {
    if (options.force === true) {
      taskRegistry.clearDrainStop(root);
    } else {
      return { started: false, drainStopped: true };
    }
  }

  // 2. Sweep stale in-progress plans (D2). cleanupStaleInProgress returns
  //    { cleanedUp, skipped }; surface the moved-name list, preserving cleanedUp[].
  const { cleanedUp } = cleanupStaleInProgress(root);

  // 3. FIFO todo queue (already sorted by readPlans).
  const plansDir = getPlansDir(root);
  const todoPlans = readPlans(path.join(plansDir, 'todo'));
  if (todoPlans.length === 0) {
    return { started: false, error: 'No plans in todo queue', cleanedUp, skipped: [] };
  }

  // 4. Walk the FIFO queue and CLAIM the first plan the scheduler lets start. Two ways a
  //    plan yields to the next (C1-4 + R3-B items 2/3):
  //      • SPEC REFUSAL — no files:, or an unresolvable dependency → recorded in skipped[].
  //      • LADDER REFUSAL — a disjoint plan behind a file-conflicted / max-concurrent head
  //        must still start. The refused head KEEPS its SINGLE queued task (item 2: a
  //        non-terminal task already covering the plan is NOT duplicated) and is recorded
  //        in queued[]; the walk continues to the next plan.
  //    Only a CLAIMED plan is moved to in-progress and returns started:true.
  const skipped = [];
  const queuedTasks = [];
  let claimIndex = -1;
  for (let i = 0; i < todoPlans.length; i++) {
    const plan = todoPlans[i];
    let spec;
    try {
      spec = taskSpecFromPlan(plan, root);
    } catch (err) {
      skipped.push({ plan: plan.name, reason: err.message });
      continue;
    }
    // item 2: do NOT enqueue a second implement task for a plan that already has a live one.
    const existing = taskRegistry.findActivePlanTask(taskRegistry.load(root), plan.name, 'implement');
    if (existing) {
      queuedTasks.push({ plan: plan.name, taskId: existing.id, reason: 'already-queued' });
      continue;
    }
    const { task, claimed, reason } = taskRegistry.addAndClaim(root, spec);
    if (!claimed) {
      // item 3: the ladder refused this head; keep its single queued task and try the next.
      queuedTasks.push({ plan: plan.name, taskId: task.id, reason });
      continue;
    }
    // 5. Claimed → move the plan to in-progress and light up the dashboard status.
    claimIndex = i;
    const newPath = startExecution(plan.path, root);
    setAgentStatus(root, {
      active: true,
      plan: plan.name,
      step: 8,
      phase: 'TEST',
      task: 'Starting implementation'
    });
    return {
      started: true,
      task,
      plan: { name: plan.name, path: newPath },
      cleanedUp,
      skipped,
      queuedTasks,
      remainingTodo: todoPlans.length - 1
    };
  }

  // 6. Nothing was claimable this pass. A ladder-refused head reports queued:true (its
  //    task IS recorded, waiting on a slot); a pure spec-refusal queue reports the error.
  void claimIndex;
  if (queuedTasks.length > 0) {
    return { started: false, queued: true, reason: queuedTasks[0].reason, cleanedUp, skipped, queuedTasks };
  }
  return { started: false, error: 'No claimable plan in todo queue', cleanedUp, skipped, queuedTasks };
}

/**
 * Request a graceful agent stop (drain semantics: finish the current plan(s), then
 * stop). Sets the s1 drain-stop flag — no lock to consult — and reports which
 * plans are still running (the registry's running `implement` tasks).
 *
 * @param {string} projectPath - Project root
 * @returns {{ stopped: boolean, message: string, running: string[] }}
 */
function stopAgent(projectPath) {
  const root = projectPath || findProjectRoot();

  taskRegistry.requestDrainStop(root);

  const running = taskRegistry.load(root).tasks
    .filter((t) => t.status === 'running' && t.kind === 'implement')
    .map((t) => t.plan)
    .filter(Boolean);

  const message = running.length > 0
    ? `Stop requested. Will finish current plan(s): ${running.join(', ')}, then stop.`
    : 'Stop requested. No plan is currently running; nothing new will start.';

  return { stopped: true, message, running };
}

/**
 * Advance the agent to the next todo plan. Honors the drain-stop flag (drain
 * semantics unchanged for the human), otherwise runs the same scheduler claim flow
 * as startAgent. Completion marking of the FINISHED task lives in the menu's WORK
 * completion recipe + task-reconcile orphan handling — this function does not move it.
 *
 * The FIFO drain never stalls at the head (C1-4): a plan whose spec cannot be built
 * is recorded in `skipped[]` and the NEXT plan is tried; the first plan with a valid
 * spec wins. A single refusal never blocks the plans queued behind it.
 *
 * @param {string} projectPath - Project root
 * @returns {{ next: boolean, plan?: object, stopped?: boolean, done?: boolean,
 *   queued?: boolean, reason?: string, task?: object, error?: string,
 *   skipped?: Array<{plan:string, reason:string}>,
 *   queuedTasks?: Array<{plan:string, taskId:string, reason:string}>, remainingTodo?: number }}
 */
function advanceAgent(projectPath) {
  const root = projectPath || findProjectRoot();
  const { readPlans, getPlansDir, clearAgentStatus, setAgentStatus } = require('./state');

  // 1. Drain-stop → clear status and stop (no new claim).
  if (taskRegistry.isDrainStopRequested(root)) {
    clearAgentStatus(root);
    return { next: false, stopped: true };
  }

  // 2. Next from todo.
  const plansDir = getPlansDir(root);
  const todoPlans = readPlans(path.join(plansDir, 'todo'));
  if (todoPlans.length === 0) {
    clearAgentStatus(root);
    return { next: false, done: true };
  }

  // 3. Walk the FIFO queue and claim the first plan the scheduler lets start. A spec
  //    refusal goes to skipped[]; a ladder refusal keeps the head's SINGLE queued task
  //    (item 2 — no duplicate) and continues to the next plan (item 3). Mirrors startAgent.
  const skipped = [];
  const queuedTasks = [];
  for (const plan of todoPlans) {
    let spec;
    try {
      spec = taskSpecFromPlan(plan, root);
    } catch (err) {
      skipped.push({ plan: plan.name, reason: err.message });
      continue;
    }
    const existing = taskRegistry.findActivePlanTask(taskRegistry.load(root), plan.name, 'implement');
    if (existing) {
      queuedTasks.push({ plan: plan.name, taskId: existing.id, reason: 'already-queued' });
      continue;
    }
    const { task, claimed, reason } = taskRegistry.addAndClaim(root, spec);
    if (!claimed) {
      queuedTasks.push({ plan: plan.name, taskId: task.id, reason });
      continue;
    }
    const newPath = startExecution(plan.path, root);
    setAgentStatus(root, {
      active: true,
      plan: plan.name,
      step: 8,
      phase: 'TEST',
      task: 'Starting implementation'
    });
    return {
      next: true,
      task,
      plan: { name: plan.name, path: newPath },
      skipped,
      queuedTasks,
      remainingTodo: todoPlans.length - 1
    };
  }

  if (queuedTasks.length > 0) {
    return { next: false, queued: true, reason: queuedTasks[0].reason, skipped, queuedTasks };
  }
  return { next: false, error: 'No claimable plan in todo queue', skipped, queuedTasks };
}

/**
 * Cancel a background task — the live surface of the two-phase `cancel` transition
 * (C1-2). The registry only records the transition; killing the harness-level agent
 * is the CALLER's job, so the task's `agentTaskId` is returned for it.
 *
 *   • A QUEUED task → `cancelled` immediately: nothing is running, so freeing its
 *     files/slot at once is safe.
 *   • A RUNNING task → `cancelling` (NOT `cancelled`): the task keeps occupying its
 *     files, slot, gitOp and the sync barrier until `task-reconcile` confirms the
 *     harness agent is dead. Per R2-A a direct running→cancelled would free a live
 *     agent's files early and is forbidden by the transition guard. Files stay
 *     locked until reconcile confirms death.
 *   • An already-`cancelling` task → refused (a second cancel is not meaningful).
 *   • A terminal task (done/failed/orphaned/cancelled) → the transition guard in
 *     `updateTask` throws (terminal is terminal).
 *
 * @param {string} projectPath - Project root
 * @param {string} taskId - the task id to cancel
 * @returns {{ task: object, agentTaskId: string|null }} the updated task (status
 *   `cancelling` for a running task, `cancelled` for a queued one) and its
 *   agentTaskId so the caller can stop the live harness agent.
 * @throws {Error} unknown id, an already-cancelling task, or a terminal task
 */
function cancelTask(projectPath, taskId) {
  const root = projectPath || findProjectRoot();
  // R3-B item 7: the load→save cycle runs inside the compare-and-swap helper so a concurrent
  // writer cannot lose the cancel. A running-cancel stamps ts.cancelRequested so reconcile's
  // cancel deadline (item 10) has a clock.
  return taskRegistry.withRegistry(root, (registry) => {
    const existing = registry.tasks.find((t) => t.id === taskId);
    if (!existing) {
      throw new Error(`cancelTask: unknown task id ${taskId}`);
    }
    const agentTaskId = existing.agentTaskId || null;

    let nextStatus;
    let patch;
    if (existing.status === 'running') {
      nextStatus = 'cancelling'; // two-phase: keep files locked until reconcile confirms death
      patch = { status: nextStatus, ts: { cancelRequested: nowIsoActions() } };
    } else if (existing.status === 'queued') {
      nextStatus = 'cancelled'; // nothing running → free immediately
      patch = { status: nextStatus };
    } else if (existing.status === 'cancelling') {
      throw new Error(`cancelTask: task ${taskId} is already cancelling`);
    } else {
      // Terminal (done/failed/orphaned/cancelled): updateTask's guard throws below.
      nextStatus = 'cancelled';
      patch = { status: nextStatus };
    }

    // updateTask enforces the transition guard (a terminal task throws).
    const task = taskRegistry.updateTask(registry, taskId, patch);
    return { task, agentTaskId };
  });
}

/** Current instant as an ISO-8601 string (R3-B item 10: the cancel-deadline clock). */
function nowIsoActions() {
  return new Date().toISOString();
}

/**
 * Enqueue a wave `sync` task — the wave integration boundary (integrated suite +
 * ratchet reconcile + commit) as a REAL scheduled task instead of operator memory.
 * A `sync` is `gitOp: true` with empty `touches`; the scheduler's Rule 2 sync
 * barrier guarantees it runs ALONE once its blockers are done (no task co-runs with
 * it). Blocked by the wave's implement task ids, so it promotes only after the wave
 * finishes.
 *
 * Refuses an EMPTY wave (C1-6): a `sync` barrier with no `blockedBy` has nothing to
 * integrate and, with no blockers, would claim immediately against a live wave —
 * that is a caller bug, so a missing/empty `blockedBy` throws loudly.
 *
 * @param {string} projectPath - Project root
 * @param {{ blockedBy?: string[], label?: string }} [opts]
 * @returns {{ task: object, claimed: boolean, reason: string }} addAndClaim result
 * @throws {Error} blockedBy is missing or empty (an empty barrier is a caller bug)
 */
function enqueueWaveSync(projectPath, opts = {}) {
  const root = projectPath || findProjectRoot();
  const blockedBy = Array.isArray(opts.blockedBy) ? opts.blockedBy.slice() : [];
  if (blockedBy.length === 0) {
    throw new Error(
      'enqueueWaveSync: a wave sync must declare blockedBy — the wave\'s implement ' +
      'task ids it integrates. An empty barrier has nothing to integrate and would ' +
      'run immediately against a live wave (C1-6).'
    );
  }
  const label = typeof opts.label === 'string' && opts.label.length > 0 ? opts.label : 'wave-sync';
  return taskRegistry.addAndClaim(root, {
    kind: 'sync',
    label,
    gitOp: true,
    touches: [],
    blockedBy
  });
}

/**
 * Create a canvas file (Lean Canvas or BMC) for a vision.
 * Writes plans/canvas/<vision-slug>.md from the corresponding template.
 *
 * Behavior under ambiguity (no-stub rule):
 * - If vision file does not exist at plans/vision/<slug>.md OR plans/done/<slug>.md,
 *   creation proceeds with a warning (canvas can exist before vision is finalized).
 * - If canvas already exists for this vision, throws unless { overwrite: true }.
 *
 * @param {string} visionSlug - Slug of the parent vision (must match /^[a-z0-9][a-z0-9-]*$/)
 * @param {string} canvasType - 'lean' or 'bmc'
 * @param {string} [projectPath] - Project root path
 * @param {{ overwrite?: boolean }} [options] - { overwrite: true } to replace existing canvas
 * @returns {{ name: string, path: string, warnings: string[] }}
 */
function createCanvas(visionSlug, canvasType, projectPath, options = {}) {
  const root = projectPath || findProjectRoot();
  const warnings = [];

  if (canvasType !== 'lean' && canvasType !== 'bmc') {
    throw new Error(`Invalid canvas type '${canvasType}'. Must be 'lean' or 'bmc'.`);
  }

  if (typeof visionSlug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(visionSlug)) {
    throw new Error(`Invalid vision slug '${visionSlug}'. Must match /^[a-z0-9][a-z0-9-]*$/.`);
  }

  // I1: warn if parent vision not found at expected locations
  const visionPath = path.join(root, 'plans', 'vision', `${visionSlug}.md`);
  const doneVisionPath = path.join(root, 'plans', 'done', `${visionSlug}.md`);
  if (!safeFs.existsSync(visionPath) && !safeFs.existsSync(doneVisionPath)) {
    warnings.push(`No parent vision found at plans/vision/${visionSlug}.md or plans/done/${visionSlug}.md. Canvas will be created as an orphan.`);
  }

  const templateName = canvasType === 'lean'
    ? 'lean-canvas.md.template'
    : 'business-model-canvas.md.template';
  const templatePath = path.join(root, '.ctoc', 'templates', templateName);

  if (!safeFs.existsSync(templatePath)) {
    throw new Error(`Canvas template not found: ${templatePath}`);
  }

  const canvasDir = path.join(root, 'plans', 'canvas');
  if (!safeFs.existsSync(canvasDir)) {
    safeFs.mkdirSync(canvasDir, { recursive: true });
  }

  const filePath = path.join(canvasDir, `${visionSlug}.md`);

  // I2: refuse to silently overwrite existing canvas
  if (safeFs.existsSync(filePath) && !options.overwrite) {
    throw new Error(`Canvas already exists at ${filePath}. Pass { overwrite: true } to replace.`);
  }

  let template = safeFs.readFileSync(templatePath, 'utf8');

  const displayName = visionSlug
    .split('-')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
  template = template
    .replace(/\{\{NAME\}\}/g, displayName)
    .replace(/\{\{DATE\}\}/g, new Date().toISOString())
    .replace(/\{\{VISION_SLUG\}\}/g, visionSlug);

  safeFs.writeFileSync(filePath, template);
  invalidate(); // CF1: a new canvas file changes getPlanCounts().canvas; bust the cache

  return {
    name: visionSlug,
    path: filePath,
    warnings
  };
}

/**
 * Clean up orphaned in-progress plans (D2).
 *
 * Each orphaned in-progress plan is gated through `validateForReview` BEFORE the
 * move (finding C9): this stale-cleanup path is now validated identically to the
 * primary manual in-progress→review action, so a plan that could never pass
 * review is not smuggled to the Gate-3 doorstep. Behavior per plan:
 *   - valid   → logged as `moved` (reason `orphaned`) and moved to `review`.
 *   - invalid → NOT moved; left in `in-progress`, logged as `skipped` with the
 *               joined validation reason, and reported in the return's
 *               `skipped[]`. Fail-closed: a validator that THROWS is also
 *               treated as a skip (never a move).
 * One invalid plan never aborts the batch (async-overnight resilience).
 * Cleanup events are logged to .ctoc/logs/cleanup.json (keeps plan files clean).
 *
 * @param {string} projectPath - Project root
 * @returns {{ cleanedUp: string[], skipped: Array<{ name: string, reason: string }> }}
 *   `cleanedUp` — names of plans moved to review;
 *   `skipped` — plans left in place because validation failed, each with a reason.
 */
function cleanupStaleInProgress(projectPath) {
  const root = projectPath || findProjectRoot();
  const { readPlans, getPlansDir } = require('./state');
  const plansDir = getPlansDir(root);
  const inProgressDir = path.join(plansDir, 'in-progress');
  const plans = readPlans(inProgressDir);
  const cleanedUp = [];
  const skipped = [];

  // R3-B item 6: the sweep now has BOTH a liveness criterion and an age criterion. Under
  // the file-based wave model `startAgent` is called once per wave member WHILE its
  // siblings are mid-flight, and the old sweep had NEITHER guard — so it would move a
  // plan whose executor had finished its edits (and so passes validateForReview) but had
  // not yet called completeExecution, out from under its own live agent.
  //   • LIVENESS: skip any in-progress plan that still has a NON-TERMINAL implement task
  //     in the registry (its agent is alive/queued — never sweep it).
  //   • AGE backstop: only sweep a plan whose file has been idle longer than
  //     STALE_IN_PROGRESS_MS (a genuinely orphaned plan), so a just-finished plan inside
  //     the grace window is not raced out from under an executor about to complete it.
  const STALE_IN_PROGRESS_MS = 120 * 60_000; // matches the reconciler's implement floor
  let liveTaskPlans = new Set();
  try {
    const registry = taskRegistry.load(root);
    liveTaskPlans = new Set(
      registry.tasks
        .filter((t) => t.kind === 'implement' && t.plan != null && !taskRegistry.TERMINAL.has(t.status))
        .map((t) => t.plan)
    );
  } catch { /* registry unreadable → fail-open: no liveness veto, the age backstop still guards */ }

  const now = Date.now();
  for (const plan of plans) {
    // Liveness veto (item 6): a plan whose implement task is still live is NEVER swept —
    // its agent may be mid-flight or about to call completeExecution.
    if (liveTaskPlans.has(plan.name)) {
      skipped.push({ name: plan.name, reason: 'live registry task (implement not terminal) — agent still owns this plan' });
      continue;
    }
    // Age backstop: a young plan is inside the grace window (an executor may be seconds
    // from completeExecution). Only genuinely idle plans are eligible to be reconciled.
    let ageMs = Infinity;
    try {
      const st = safeFs.statSync(plan.path);
      if (st && Number.isFinite(st.mtimeMs)) ageMs = now - st.mtimeMs;
    } catch { /* stat failure → treat as very old (Infinity), fail toward the backstop */ }
    if (ageMs < STALE_IN_PROGRESS_MS) {
      skipped.push({ name: plan.name, reason: `young in-progress plan (idle ${Math.round(ageMs / 60000)}m < ${STALE_IN_PROGRESS_MS / 60000}m grace) — not orphaned yet` });
      continue;
    }

    // Gate the move behind validateForReview. Fail closed: a validation throw is
    // treated as an invalid plan (skip-with-reason), never a move.
    let reason = null;
    try {
      const validation = validateForReview(plan.path, root);
      if (validation.valid === false) {
        reason = validation.errors.join('; ') || 'validation failed';
      }
    } catch (err) {
      reason = `validation error: ${err && err.message ? err.message : String(err)}`;
    }

    // Log cleanup event to .ctoc/logs/cleanup.json
    const logDir = path.join(root, '.ctoc', 'logs');
    safeFs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'cleanup.json');
    let log = [];
    try {
      log = safeFs.existsSync(logFile) ? JSON.parse(safeFs.readFileSync(logFile, 'utf8')) : [];
    } catch { /* ignore */ }

    if (reason !== null) {
      // Invalid → record the skip and leave the plan in place.
      log.push({
        plan: plan.name,
        from: 'in-progress',
        to: 'in-progress',
        action: 'skipped',
        reason,
        at: new Date().toISOString()
      });
      safeFs.writeFileSync(logFile, JSON.stringify(log, null, 2));
      skipped.push({ name: plan.name, reason });
      continue;
    }

    log.push({
      plan: plan.name,
      from: 'in-progress',
      to: 'review',
      action: 'moved',
      reason: 'orphaned',
      at: new Date().toISOString()
    });
    safeFs.writeFileSync(logFile, JSON.stringify(log, null, 2));

    movePlan(plan.path, 'review', root);
    cleanedUp.push(plan.name);
  }

  return { cleanedUp, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// SIP1: sub-plan enumeration + batched-gate approval.
//
// A functional plan is decomposed by the implementation-planner into N small
// implementation plans, each linked to the parent via `parent_plan:` and ordered
// via `depends_on:`. `listSubplans` enumerates that set; `approveSubplans` crosses
// a whole batch through ONE human gate by LOOPING the existing gate-safe
// `approvePlan` per sibling (each still stamped `approved_by: human`). This adds
// NO new auto-cross path — it is a convenience over one human decision.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stages scanned for sub-plans of a parent (mirrors the plan stage set).
 */
const SUBPLAN_STAGES = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

/**
 * Stages from which a sub-plan SET may be batch-approved (the two human gates a
 * sibling set crosses together: implementation→todo and review→done).
 */
const BATCHED_GATE_SOURCES = ['implementation', 'review'];

/**
 * Parse a `depends_on` frontmatter value into a trimmed slug array.
 * `none`/absent/empty → []. Comma-separated → each trimmed non-empty token.
 *
 * @param {*} raw - the parsed frontmatter value (string, or undefined)
 * @returns {string[]}
 */
function parseDependsOn(raw) {
  if (raw === undefined || raw === null) return [];
  const s = String(raw).trim();
  if (s === '' || s.toLowerCase() === 'none') return [];
  return s.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

/**
 * Enumerate every plan under `plans/` whose frontmatter `parent_plan` equals
 * `parentSlug`. Mirrors `readPlans` (state.js) across all stages. Read-only.
 *
 * @param {string} parentSlug - the parent functional plan's slug
 * @param {string} [projectPath] - project root
 * @returns {Array<{slug: string, stage: string, path: string, dependsOn: string[], bgStatus: string}>}
 *   oldest-first per stage, in SUBPLAN_STAGES order.
 * @throws {Error} 'parentSlug required' when parentSlug is falsy/non-string.
 */
function listSubplans(parentSlug, projectPath) {
  if (typeof parentSlug !== 'string' || parentSlug.length === 0) {
    throw new Error('parentSlug required');
  }
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);
  // parseMetadata (via readPlans) reads only the FIRST frontmatter block, but a
  // gate-approval marker is prepended as its own block once a plan crosses Gate 2 —
  // pushing `parent_plan`/`depends_on` into the SECOND block where parseMetadata
  // can't see them (so listSubplans returned 0 for review-stage slices). Read the
  // MERGED frontmatter region (all blocks) instead. Lazy require avoids the
  // stale-detector <-> actions require cycle.
  const { extractFrontmatterRegion } = require('./stale-detector');
  const unquote = (v) => v === undefined ? undefined : v.replace(/^["']|["']$/g, '').trim();
  const readParent = (region) => { const m = region.match(/^\s*parent_plan\s*:\s*(.+?)\s*$/m); return m ? unquote(m[1]) : undefined; };
  const readDeps = (region) => { const m = region.match(/^\s*depends_on\s*:\s*(.+?)\s*$/m); return m ? unquote(m[1]) : undefined; };

  const out = [];
  for (const stage of SUBPLAN_STAGES) {
    const plans = readPlans(path.join(plansDir, stage));
    for (const plan of plans) {
      let parentPlan = plan.metadata && plan.metadata.parent_plan;
      let dependsOn = plan.metadata && plan.metadata.depends_on;
      if (String(parentPlan) !== parentSlug) {
        try {
          const region = extractFrontmatterRegion(safeFs.readFileSync(plan.path, 'utf8'));
          const p = readParent(region);
          if (p !== undefined) parentPlan = p;
          const d = readDeps(region);
          if (d !== undefined) dependsOn = d;
        } catch { /* fail-open: fall back to first-block metadata */ }
      }
      if (String(parentPlan) === parentSlug) {
        out.push({
          slug: plan.name,
          stage,
          path: plan.path,
          dependsOn: parseDependsOn(dependsOn),
          bgStatus: plan.bgStatus || 'none'
        });
      }
    }
  }
  return out;
}

/**
 * Order a set of sub-plans so a dependency precedes its dependents (Kahn topo
 * sort over `depends_on`). Best-effort: on a cycle (should not happen — the
 * planner caps chain depth at 3 with no cycles) the remaining nodes are appended
 * in input order rather than throwing. Only intra-batch edges are honored;
 * a `depends_on` naming a sibling outside the batch is ignored for ordering.
 *
 * @param {Array<{slug: string, dependsOn: string[]}>} subplans
 * @returns {Array} the same objects, dependency-ordered
 */
function topoOrderByDependsOn(subplans) {
  const bySlug = new Map(subplans.map(s => [s.slug, s]));
  const indeg = new Map(subplans.map(s => [s.slug, 0]));
  const dependents = new Map(subplans.map(s => [s.slug, []]));

  for (const s of subplans) {
    for (const dep of s.dependsOn) {
      if (!bySlug.has(dep)) continue; // edge outside the batch — ignore for ordering
      indeg.set(s.slug, indeg.get(s.slug) + 1);
      dependents.get(dep).push(s.slug);
    }
  }

  // Seed the queue with zero-indegree nodes, preserving input order.
  const queue = subplans.filter(s => indeg.get(s.slug) === 0).map(s => s.slug);
  const ordered = [];
  const seen = new Set();

  while (queue.length > 0) {
    const slug = queue.shift();
    if (seen.has(slug)) continue;
    seen.add(slug);
    ordered.push(bySlug.get(slug));
    for (const child of dependents.get(slug)) {
      indeg.set(child, indeg.get(child) - 1);
      if (indeg.get(child) === 0) queue.push(child);
    }
  }

  // Cycle fallback: append any nodes not yet emitted, in input order.
  if (ordered.length < subplans.length) {
    for (const s of subplans) {
      if (!seen.has(s.slug)) ordered.push(s);
    }
  }
  return ordered;
}

/**
 * Batch-approve ALL sub-plans of `parentSlug` currently in `fromStage`, crossing
 * each ONE gate via the EXISTING gate-safe `approvePlan`. This is the single
 * human decision expressed as a loop — NOT a new auto-cross path; every sibling
 * receives the `approved_by: human` marker via `approvePlan`/`addApprovalMarker`.
 *
 * Fail-safe (SIP1 D-AS-2): before crossing, each sibling is validated for the
 * transition (implementation→queue / review→done). A sibling that FAILS
 * validation, or whose `approvePlan` throws, is REPORTED in `skipped` with a
 * reason and left in place; the batch CONTINUES. No silent skips.
 *
 * @param {string} parentSlug - the parent functional plan's slug
 * @param {string} fromStage - 'implementation' or 'review'
 * @param {string} [projectPath] - project root
 * @returns {{approved: string[], skipped: Array<{slug: string, reason: string}>, results: Array<{slug: string, newPath: string, humanGate: boolean}>}}
 * @throws {Error} 'parentSlug required'; 'fromStage must be a gate source stage (implementation|review)'
 */
function approveSubplans(parentSlug, fromStage, projectPath) {
  if (typeof parentSlug !== 'string' || parentSlug.length === 0) {
    throw new Error('parentSlug required');
  }
  if (!BATCHED_GATE_SOURCES.includes(fromStage)) {
    throw new Error('fromStage must be a gate source stage (implementation|review)');
  }
  const root = projectPath || findProjectRoot();

  const batch = topoOrderByDependsOn(
    listSubplans(parentSlug, root).filter(s => s.stage === fromStage)
  );

  const approved = [];
  const skipped = [];
  const results = [];

  for (const sub of batch) {
    // R5-B: `approvePlan` now VALIDATES the transition itself and REFUSES a failing
    // one (one validation per crossing — no double-validate). A refused sibling is
    // REPORTED in `skipped` with its reason and left in place; the batch CONTINUES.
    // No silent skips.
    try {
      const res = approvePlan(sub.path, root);
      if (res && res.refused) {
        skipped.push({ slug: sub.slug, reason: res.reason || 'failed validation' });
        continue;
      }
      approved.push(sub.slug);
      results.push({ slug: sub.slug, newPath: res.newPath, humanGate: res.humanGate });
    } catch (err) {
      // One bad sibling never aborts the batch (async-overnight resilience).
      skipped.push({ slug: sub.slug, reason: err.message });
    }
  }

  return { approved, skipped, results };
}

module.exports = {
  movePlan,
  approvePlan,
  stampAndLedger,
  applyIronLoop,
  applyBasicIronLoopTemplate,
  rejectPlan,
  renamePlan,
  deletePlan,
  moveUpInQueue,
  moveDownInQueue,
  removeFromQueue,
  // Background agent functions
  AGENT_TYPES,
  initBackgroundAgent,
  startExecution,
  completeExecution,
  // R3-D: the live call site of completeExecution (menu `task complete` route)
  completeTaskPlan,
  // Finding C9 wiring: record + hard-escalate an Iron Loop kickback
  recordStepKickback,
  // Agent orchestration functions
  startAgent,
  stopAgent,
  advanceAgent,
  cleanupStaleInProgress,
  // F1-s2: plan→task translation, cancel, and wave-sync scheduler surfaces
  taskSpecFromPlan,
  cancelTask,
  enqueueWaveSync,
  createCanvas,
  // SIP1: sub-plan enumeration + batched-gate approval
  listSubplans,
  approveSubplans
};
