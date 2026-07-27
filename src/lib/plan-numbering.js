/**
 * Global sequential numbering for CTOC implementation plans.
 *
 * Convention: an implementation plan is named with a single global, zero-padded
 * five-digit prefix — e.g. "00001-make-the-block-actually-stop",
 * "00002-fix-the-install-path", "00003-remove-dead-code". This yields ONE global
 * order across every implementation plan, rather than a per-parent count.
 *
 * Two entry points:
 *   - `nextImplementationPlanNumber(root)` — pure helper returning the next global
 *     number as a five-digit string, computed from the highest existing prefix.
 *   - `renumberImplementationPlans(root)` — one-time migration that walks the
 *     implementation-stage plans in dependency-then-creation order, assigns a
 *     prefix to every plan that lacks one, renames the files on disk, and rewrites
 *     every `parent_plan` / `depends_on` reference that names a renamed plan.
 *
 * Both operate on an explicit `root`, so they are testable against temporary
 * fixtures. `nextImplementationPlanNumber` is pure (read-only, no side effects).
 *
 * Decisions taken under ambiguity (documented per the no-stub rule):
 *   - The "next number" is (highest existing prefix) + 1, NOT (count + 1). This
 *     keeps numbering stable when a plan is removed and matches the stated intent
 *     of a single monotonic global order.
 *   - `renumber` only assigns prefixes to plans that LACK one; already-prefixed
 *     plans keep their name. When assigning, numbers already in use by prefixed
 *     plans are skipped, so no two plans ever collide on a number.
 *   - References are rewritten across ALL plan stages (not just implementation),
 *     because a `parent_plan`/`depends_on` in any stage that names a renamed
 *     implementation plan would otherwise dangle.
 *   - `depends_on` is treated as an inline scalar — `none` or a comma-separated
 *     list of slugs — matching the CTOC convention used elsewhere (see
 *     `parseDependsOn` in `state`/`actions`). YAML block-list form is not the
 *     convention and is left untouched.
 */

const path = require('path');
const safeFs = require('./safe-fs');
const { invalidate } = require('./cache');

const PREFIX_RE = /^(\d{5})-/;
const STAGES = ['vision', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

/** Zero-pad a positive integer to five digits (grows past five for >= 100000). */
function pad5(n) {
  return String(n).padStart(5, '0');
}

/** Strip one layer of surrounding single/double quotes and trim. */
function unquote(v) {
  if (v === undefined || v === null) return v;
  return String(v).replace(/^["']|["']$/g, '').trim();
}

/** Path to a stage directory under `<root>/plans/`. */
function stageDir(root, stage) {
  return path.join(root, 'plans', stage);
}

/** Max exclusive-create claim attempts before a race is declared pathological. */
const MAX_ALLOC_ATTEMPTS = 50;

/** The advisory claim store — additive-only reservations, never pruned. */
function claimsDir(root) {
  return path.join(root, '.ctoc', 'state', 'plan-numbers');
}

/**
 * Every NUMBERED plan across ALL seven stages. Plans keep their number when they
 * move between stage directories, so a scan of one stage is blind to every number
 * that has advanced past it (Defect A). Reads filenames only — the number lives in
 * the name, never open a plan file to find it.
 *
 * ABSENT vs UNREADABLE are different facts (Defect B). An absent `plans/` is a
 * legitimate fresh project (→ empty list → 00001). An absent stage directory is
 * normal and contributes nothing. But a stage directory that EXISTS and cannot be
 * read is a broken instrument: it is exactly where a higher number may live, so it
 * THROWS naming the repository-relative directory rather than returning a number
 * derived from the stages that did read. Never the success-value default.
 *
 * @param {string} root - project root
 * @returns {Array<{number:number, slug:string, stage:string, path:string}>}
 * @throws {Error} naming `plans/<stage>` when a present stage directory is unreadable
 */
function scanNumberedPlans(root) {
  const plansDir = path.join(root, 'plans');
  if (!safeFs.existsSync(plansDir)) return []; // fresh project — absent, not unreadable
  const out = [];
  for (const stage of STAGES) {
    const dir = stageDir(root, stage);
    if (!safeFs.existsSync(dir)) continue; // absent stage — normal, contributes nothing
    let files;
    try {
      files = safeFs.readdirSync(dir);
    } catch (err) {
      const e = /** @type {NodeJS.ErrnoException} */ (err);
      throw new Error(
        `plan-numbering: cannot read stage directory plans/${stage} (${e.code || e.message}). ` +
        'An unreadable stage is exactly where a higher plan number may live, so the allocator ' +
        'REFUSES rather than returning a number that would collide the moment the premise is wrong.'
      );
    }
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const m = f.match(PREFIX_RE);
      if (!m) continue;
      out.push({ number: parseInt(m[1], 10), slug: f.replace(/\.md$/, ''), stage, path: `plans/${stage}/${f}` });
    }
  }
  return out;
}

/**
 * Highest numeric prefix across EVERY stage, or 0 when none exist. Global — the
 * single monotonic order the module header describes. Throws on an unreadable
 * present stage (see `scanNumberedPlans`).
 *
 * @param {string} root - project root
 * @returns {number}
 */
function highestPlanNumber(root) {
  let max = 0;
  for (const p of scanNumberedPlans(root)) if (p.number > max) max = p.number;
  return max;
}

/**
 * Back-compat alias, KEPT: it is exported and exercised by two existing suites, so
 * removing it would force unrelated churn. The scan is now GLOBAL, not
 * implementation-only — the name is historical, the behaviour is corrected.
 *
 * @param {string} root - project root
 * @returns {number}
 */
function highestImplementationNumber(root) {
  return highestPlanNumber(root);
}

/**
 * Next global plan number as a five-digit string. "00001" when no numbered plans
 * exist ANYWHERE. Pure / read-only. Throws on an unreadable present stage.
 *
 * This is a READ, not a claim — two agents that read before either writes both get
 * the same answer (Defect C). For a race-safe number use `allocatePlanNumber`.
 *
 * @param {string} root - project root
 * @returns {string} zero-padded next number, e.g. "00007"
 */
function nextImplementationPlanNumber(root) {
  return pad5(highestImplementationNumber(root) + 1);
}

/**
 * Highest number staked in the advisory claim store, or 0. Claim files are named
 * with the bare zero-padded number and nothing else.
 *
 * @param {string} root - project root
 * @returns {number}
 */
function highestClaimNumber(root) {
  const dir = claimsDir(root);
  if (!safeFs.existsSync(dir)) return 0;
  let max = 0;
  for (const f of safeFs.readdirSync(dir)) {
    if (/^\d{5,}$/.test(f)) {
      const n = parseInt(f, 10);
      if (n > max) max = n;
    }
  }
  return max;
}

/**
 * Atomically ALLOCATE the next plan number and stake a claim, so two agents that
 * allocate without an intervening write get two DIFFERENT numbers (Defect C).
 *
 * The floor is always `max(filename scan, claim files) + 1` — filenames stay the
 * single source of truth and claims are advisory: a lost or hand-deleted claims
 * directory can only cause a number to be SKIPPED, never re-issued, because a
 * number that ever named a real plan file is caught by the filename scan forever.
 * The claim is staked with the exclusive-create flag (`wx`), atomic on Windows,
 * macOS and Linux. On a lost race (EEXIST) it re-scans and retries — the retry's
 * whole cost is the rescan, the work needed to re-decide anyway — bounded so a
 * pathological perpetual race becomes a LOUD failure instead of an infinite loop.
 *
 * Claims are additive-only and NEVER pruned: any expiry could reclaim a number
 * held by a plan not yet written to disk.
 *
 * @param {string} root - project root
 * @param {{ exclusiveCreate?: (claimPath: string) => void }} [opts] - `exclusiveCreate`
 *   defaults to the real atomic `wx` write; it exists ONLY so a test can simulate
 *   perpetual race contention, which a single process cannot produce. The
 *   compute-next core always runs for real.
 * @returns {string} the allocated zero-padded number
 * @throws {Error} on an unreadable stage (via the scan) or when the bounded retry is exhausted
 */
function allocatePlanNumber(root, opts = {}) {
  const dir = claimsDir(root);
  safeFs.mkdirSync(dir, { recursive: true });
  const stake = typeof opts.exclusiveCreate === 'function'
    ? opts.exclusiveCreate
    : (claimPath) => safeFs.writeFileSync(claimPath, '', { flag: 'wx' });

  for (let attempt = 0; attempt < MAX_ALLOC_ATTEMPTS; attempt++) {
    const next = Math.max(highestPlanNumber(root), highestClaimNumber(root)) + 1;
    const claimPath = path.join(dir, pad5(next));
    try {
      stake(claimPath);
      return pad5(next);
    } catch (err) {
      const e = /** @type {NodeJS.ErrnoException} */ (err);
      if (e && e.code === 'EEXIST') continue; // lost the race — re-scan and retry
      throw err;
    }
  }
  throw new Error(
    `plan-numbering: could not allocate a plan number after ${MAX_ALLOC_ATTEMPTS} attempts. ` +
    'Every attempt lost the exclusive-create race — this is a pathological contention, not a slow one, ' +
    'so it fails loudly rather than looping.'
  );
}

/**
 * Every number that names TWO OR MORE DIFFERENT plans (distinct slugs) across all
 * stages — existing damage, made visible instead of waiting for someone to trip
 * over it. The same slug present in two stages is ONE plan, not a collision.
 * Throws on an unreadable present stage (see `scanNumberedPlans`) — a partial scan
 * must never render as "no collisions".
 *
 * @param {string} root - project root
 * @returns {Array<{number:string, plans:string[]}>} sorted by number
 */
function findNumberCollisions(root) {
  const bySlug = new Map(); // number -> Set<slug>
  for (const p of scanNumberedPlans(root)) {
    if (!bySlug.has(p.number)) bySlug.set(p.number, new Set());
    bySlug.get(p.number).add(p.slug);
  }
  const out = [];
  for (const [number, slugs] of bySlug) {
    if (slugs.size > 1) out.push({ number: pad5(number), plans: [...slugs].sort() });
  }
  return out.sort((a, b) => a.number.localeCompare(b.number));
}

/** A numbered plan target: `plans/<stage>/<NNNNN>-<slug>.md`. */
const PLAN_TARGET_RE = /^plans\/([^/]+)\/(\d{5,})-(.+)\.md$/;

/**
 * The ONE encoding of the collision predicate the Write hook enforces:
 *
 *   REFUSE iff the target is `plans/<stage>/<NNNNN>-<slug>.md` AND some OTHER file
 *   under `plans/` is named `<NNNNN>-<different-slug>.md`. Same number, DIFFERENT
 *   slug, DIFFERENT path — all three.
 *
 * Cleanly separated, no heuristic:
 *   - a MOVE (same number, same slug, different stage) → allow (slug match);
 *   - a rewrite in place (target path equals the existing path) → allow (path match);
 *   - the same plan in two stages → allow (slug match);
 *   - an unnumbered or non-plan path → allow, reading NO directory (`scanned:false`);
 *   - a retitle-in-place → REFUSE (indistinguishable from a collision at write time;
 *     the accepted cost, with a delete-first remedy in the hook message);
 *   - reuse of a number freed by deletion → allow (nothing holds the number);
 *   - an unreadable `plans/` → `unknown` (never a false collision on unseen input).
 *
 * @param {string} root - project root
 * @param {string} targetRelPath - repository-relative, forward-slash target path
 * @returns {{collides:boolean, scanned:boolean, number?:string, conflictingPlan?:string,
 *   conflictingPath?:string, nextFree?:string} | {unknown:true, scanned:boolean, reason:string}}
 */
function checkPlanWriteCollision(root, targetRelPath) {
  const rel = String(targetRelPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
  const m = rel.match(PLAN_TARGET_RE);
  if (!m) return { collides: false, scanned: false }; // not a numbered plan path — read nothing

  const targetNumber = parseInt(m[2], 10);
  const targetSlug = rel.slice(rel.lastIndexOf('/') + 1).replace(/\.md$/, '');

  let entries;
  try {
    entries = scanNumberedPlans(root);
  } catch (err) {
    return { unknown: true, scanned: true, reason: err.message };
  }

  let conflict = null;
  for (const e of entries) {
    if (e.number !== targetNumber) continue;
    if (e.path === rel) continue;        // rewrite in place
    if (e.slug === targetSlug) continue; // move / same plan in two stages
    conflict = e;                        // different slug at a different path
    break;
  }

  const nextFree = nextImplementationPlanNumber(root);
  if (conflict) {
    return {
      collides: true,
      scanned: true,
      number: pad5(targetNumber),
      conflictingPlan: conflict.slug,
      conflictingPath: conflict.path,
      nextFree,
    };
  }
  return { collides: false, scanned: true, nextFree };
}

/**
 * Parse an inline `depends_on` scalar into a trimmed slug array.
 * `none`/absent/empty → []. Comma-separated → each trimmed non-empty token.
 * @param {*} raw
 * @returns {string[]}
 */
function parseDependsOn(raw) {
  if (raw === undefined || raw === null) return [];
  const s = String(raw).trim();
  if (s === '' || s.toLowerCase() === 'none') return [];
  return s.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

/**
 * Kahn topological sort over intra-set `depends_on` edges, seeded and
 * tie-broken by input order (creation order). A dependency precedes its
 * dependents. Edges naming a slug outside the set are ignored. On a cycle the
 * remaining nodes are appended in input order rather than throwing.
 *
 * @param {Array<{slug: string, dependsOn: string[]}>} plans
 * @returns {Array} same objects, dependency-ordered
 */
function topoOrder(plans) {
  const bySlug = new Map(plans.map(p => [p.slug, p]));
  const indeg = new Map(plans.map(p => [p.slug, 0]));
  const dependents = new Map(plans.map(p => [p.slug, []]));

  for (const p of plans) {
    for (const dep of p.dependsOn) {
      if (!bySlug.has(dep)) continue; // edge outside the set
      indeg.set(p.slug, indeg.get(p.slug) + 1);
      dependents.get(dep).push(p.slug);
    }
  }

  const queue = plans.filter(p => indeg.get(p.slug) === 0).map(p => p.slug);
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

  if (ordered.length < plans.length) {
    for (const p of plans) {
      if (!seen.has(p.slug)) ordered.push(p);
    }
  }
  return ordered;
}

/**
 * Remap a single-slug scalar value (e.g. `parent_plan`), preserving quoting.
 * `none`/empty is returned unchanged.
 * @param {string} rawValue - text after the colon (may be quoted)
 * @param {Map<string,string>} map - oldSlug → newSlug
 * @returns {string}
 */
function remapScalar(rawValue, map) {
  const raw = rawValue;
  const qm = raw.match(/^(["'])([\s\S]*)\1\s*$/);
  const quote = qm ? qm[1] : '';
  const inner = (qm ? qm[2] : raw).trim();
  if (inner === '' || inner.toLowerCase() === 'none') return raw;
  const mapped = map.has(inner) ? map.get(inner) : inner;
  return quote ? `${quote}${mapped}${quote}` : mapped;
}

/**
 * Remap a comma-separated list value (e.g. `depends_on`), preserving quoting.
 * `none`/empty is returned unchanged.
 * @param {string} rawValue - text after the colon (may be quoted)
 * @param {Map<string,string>} map - oldSlug → newSlug
 * @returns {string}
 */
function remapList(rawValue, map) {
  const raw = rawValue;
  const qm = raw.match(/^(["'])([\s\S]*)\1\s*$/);
  const quote = qm ? qm[1] : '';
  const inner = (qm ? qm[2] : raw).trim();
  if (inner === '' || inner.toLowerCase() === 'none') return raw;
  const tokens = inner.split(',').map(t => t.trim()).filter(Boolean);
  const mapped = tokens.map(t => (map.has(t) ? map.get(t) : t)).join(', ');
  return quote ? `${quote}${mapped}${quote}` : mapped;
}

/**
 * Rewrite `parent_plan` and `depends_on` references in file content using the
 * old→new slug map. Operates line-wise across every frontmatter block.
 * @param {string} content
 * @param {Map<string,string>} map
 * @returns {string}
 */
function remapReferences(content, map) {
  let out = content.replace(
    /^([ \t]*parent_plan[ \t]*:[ \t]*)(.*)$/gm,
    (_m, pre, val) => pre + remapScalar(val, map)
  );
  out = out.replace(
    /^([ \t]*depends_on[ \t]*:[ \t]*)(.*)$/gm,
    (_m, pre, val) => pre + remapList(val, map)
  );
  return out;
}

/**
 * Read the merged-frontmatter `depends_on` for a plan file (inline scalar).
 * Scans the whole file so a value in a second (gate-marker) block is still seen.
 * @param {string} content
 * @returns {string|undefined}
 */
function readDependsOn(content) {
  const m = content.match(/^\s*depends_on\s*:\s*(.+?)\s*$/m);
  return m ? unquote(m[1]) : undefined;
}

/**
 * Assign global sequential prefixes to implementation-stage plans that lack one,
 * rename the files on disk, and rewrite every `parent_plan`/`depends_on`
 * reference (in any stage) that names a renamed plan so no link dangles.
 *
 * Order: dependency order (via each plan's `depends_on`), falling back to
 * creation order (file birthtime, then slug for stability).
 *
 * @param {string} root - project root
 * @returns {Object<string,string>} mapping of old slug → new slug (renamed only)
 */
function renumberImplementationPlans(root) {
  const implDir = stageDir(root, 'implementation');
  if (!safeFs.existsSync(implDir)) return {};

  // Gather implementation plans with creation time + dependency edges.
  const plans = [];
  for (const f of safeFs.readdirSync(implDir)) {
    if (!f.endsWith('.md')) continue;
    const p = path.join(implDir, f);
    const content = safeFs.readFileSync(p, 'utf8');
    const stat = safeFs.statSync(p);
    plans.push({
      slug: f.replace(/\.md$/, ''),
      path: p,
      dependsOn: parseDependsOn(readDependsOn(content)),
      created: stat.birthtimeMs !== undefined ? stat.birthtimeMs : stat.birthtime.getTime()
    });
  }
  if (plans.length === 0) return {};

  // Stable creation order first, then dependency order.
  plans.sort((a, b) => (a.created - b.created) || a.slug.localeCompare(b.slug));
  const ordered = topoOrder(plans);

  // Numbers already claimed by pre-prefixed plans must not be reused.
  const used = new Set();
  for (const p of plans) {
    const m = p.slug.match(PREFIX_RE);
    if (m) used.add(parseInt(m[1], 10));
  }

  // Assign the next free number to each plan lacking a prefix.
  /** @type {Object<string, string>} */
  const mapping = {};
  /** @type {Map<string, string>} */
  const map = new Map();
  let n = 1;
  for (const p of ordered) {
    if (PREFIX_RE.test(p.slug)) continue; // already numbered — keep as-is
    while (used.has(n)) n++;
    used.add(n);
    const newSlug = `${pad5(n)}-${p.slug}`;
    mapping[p.slug] = newSlug;
    map.set(p.slug, newSlug);
    n++;
  }

  if (map.size === 0) return mapping; // nothing to rename

  // Rewrite references across every stage; rename the implementation files.
  for (const stage of STAGES) {
    const dir = stageDir(root, stage);
    if (!safeFs.existsSync(dir)) continue;
    for (const f of safeFs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const oldPath = path.join(dir, f);
      const slug = f.replace(/\.md$/, '');
      const content = safeFs.readFileSync(oldPath, 'utf8');
      const updated = remapReferences(content, map);

      if (stage === 'implementation' && map.has(slug)) {
        // This file is being renamed. Write new, remove old.
        const newPath = path.join(dir, `${map.get(slug)}.md`);
        safeFs.writeFileSync(newPath, updated, 'utf8');
        if (newPath !== oldPath) safeFs.unlinkSync(oldPath);
      } else if (updated !== content) {
        safeFs.writeFileSync(oldPath, updated, 'utf8');
      }
    }
  }

  // Renaming plan files changes what plan-count / plan-list reads see, so bust
  // the read cache immediately after the mutations (CF1 "always read fresh").
  invalidate();

  return mapping;
}

module.exports = {
  nextImplementationPlanNumber,
  allocatePlanNumber,
  findNumberCollisions,
  checkPlanWriteCollision,
  highestPlanNumber,
  renumberImplementationPlans,
  // exported for focused unit reuse / testing
  highestImplementationNumber,
  topoOrder,
  remapReferences
};
