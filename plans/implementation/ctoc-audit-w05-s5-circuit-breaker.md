---
title: "W05-s5 — Circuit breaker: persisted, escalating kickback counters"
type: feature
parent_plan: "ctoc-audit-w05-gate3-verifies"
depends_on: none
priority: HIGH
files:
  - src/lib/circuit-breaker.js
  - tests/ctoc-audit-w05-circuit-breaker.test.js
---

# W05-s5 — Circuit breaker: persisted, escalating kickback counters

SIP1 slice 5 of 5 for `ctoc-audit-w05-gate3-verifies` (finding **C9**).
Implements the documented-but-nonexistent circuit breaker: per-step and per-plan
kickback counters, persisted in plan frontmatter, that escalate to the human.
Independent of the other slices (new module).

Load-bearing defect (verified against the running code): CLAUDE.md and
`docs/IRON_LOOP.md` both promise "Max 3 kickbacks to the same step, max 5 total
kickbacks per plan. If exceeded, escalate to the user." **No file under
`src/lib/` defines, increments, persists, or escalates on a kickback count** —
the mechanism is undocumented in code and unimplemented. Per the parent, the
acceptance criteria are written against this module's behavior directly (via
simulated `recordKickback` calls), so they do not block on wiring a live call
site.

## Implementation Details

### Architecture Decision (ADR)

**Persistence store: plan frontmatter (per parent decision).** The parent's
"Decisions Taken Under Ambiguity" selects plan frontmatter over
`.ctoc/state/kickbacks.json`: the counter travels with the plan file, survives
independently of any separate state dir, and is visible on opening the plan. The
parent invited Steps 5-7 to escalate ONLY if a concrete technical blocker exists
(it named "write contention from concurrent background agents editing the same
plan file").

**No blocker exists — frontmatter stands.** CLAUDE.md mandates that **plans are
ALWAYS processed sequentially** ("Never parallelize plan implementation"). The
plan currently executing is the sole writer of its own kickback counter, so
there is no concurrent-writer contention on the counter. The one real friction —
`state.js:parseMetadata` reads only a FLAT first frontmatter block and cannot
parse a nested `kickback_counts:` map — is handled by using **`js-yaml`** (a
confirmed available dependency) to parse/serialize the plan's first frontmatter
block inside this module, rather than the flat `parseMetadata`. Documented, not
escalated.

**Stateless module ⇒ persistence is satisfied by construction.** The module
keeps NO in-memory counter. Every `recordKickback` does a read-modify-write of
the plan file's frontmatter. A "process restart" is therefore indistinguishable
from any two sequential calls — the count lives only on disk (satisfies M9).

**Frontmatter counter shape:**
```yaml
kickback_counts:
  by_step:
    "10": 2
    "14": 1
  total: 3
```

### Escalation thresholds (contradiction in the parent — resolved here)

The parent is internally inconsistent on the same-step threshold:
- M7, the scenario "Same-step kickback escalates on the **4th** occurrence"
  ("no escalation after the 1st, 2nd, or 3rd"), CLAUDE.md ("Max 3 … **if
  exceeded**"), and `docs/IRON_LOOP.md` all say **escalate when the count
  EXCEEDS the max** — same-step at the **4th**, per-plan at the **6th**.
- The lone parenthetical in the persistence scenario ("3 recorded kickbacks
  trigger it, per the escalate-at-3 rule") says the 3rd triggers.

**Decision (documented, not blocking): escalate on EXCEEDING the documented
maximum** — same-step escalation fires when `by_step[step] > 3` (i.e. the 4th
same-step kickback); per-plan escalation fires when `total > 5` (i.e. the 6th
total kickback). This aligns with M7, M8, both dedicated "4th"/"6th" scenarios,
CLAUDE.md, `docs/IRON_LOOP.md`, and the dispatch brief ("a 4th kickback to the
same step escalates"). The persistence test (M9) is written to prove persistence
under this SAME rule (see Test Plan case 5) instead of the contradicted
"escalate-at-3," so no test depends on the inconsistent phrasing.

Same-step takes precedence when both thresholds trip on one call.

### Dependency Graph

```
js-yaml (dependency)  +  safe-fs  +  path
        │ used by
circuit-breaker.js  ── read-modify-write ──▶ plan .md first frontmatter block
        │ escalation side-channel
        └── append ──▶ .ctoc/logs/escalations.json
```

Self-contained new module; requires only `js-yaml`, `./safe-fs`, `path`. No
other `src/lib` module requires it in this slice (live call-site wiring is
deferred — see Decisions). No cycle.

### File Specifications

#### File: `src/lib/circuit-breaker.js`
**Action:** CREATE
**Purpose:** Record kickbacks per `(plan, step)`, persist counts in plan
frontmatter, and return an escalation signal when a documented max is exceeded.

**Exports:**

- `readKickbackCounts(planPath)` → `{ by_step: Object<string,number>, total: number }`
  - Reads the plan's first frontmatter block via `js-yaml`; returns the
    `kickback_counts` map or a zeroed `{ by_step:{}, total:0 }` when absent.
    Never throws on a plan with no/という malformed counter (fail to zero).

- `recordKickback(planPath, step, projectPath)` → `{ recorded: true, byStep: number, total: number, escalation: Object|null }`
  - `step` is coerced to a string key (e.g. `String(step)`); reject a falsy step
    with a thrown `Error('step required')`.
  - Read current counts → increment `by_step[step]` by 1 and `total` by 1 →
    write the updated `kickback_counts` back into the plan's first frontmatter
    block (js-yaml serialize; preserve all other frontmatter keys and the plan
    body byte-for-byte outside the counter).
  - Compute `escalation`:
    - if `by_step[step] > 3` → `{ type:'same-step', plan: <slug>, step, count: by_step[step] }`
    - else if `total > 5` → `{ type:'per-plan', plan: <slug>, total }`
    - else → `null`.
  - On a non-null escalation, ALSO append an entry to
    `.ctoc/logs/escalations.json` (`{ plan, type, step?, count/total, at:<ISO> }`)
    as the human-facing side channel. The RETURN VALUE is the primary observable
    the tests assert; the log is the durable human record.
  - Returns the shape above.

- `getEscalations(projectPath)` → `Array` — reads `.ctoc/logs/escalations.json`
  (or `[]`), for callers/tests that inspect the human-facing record.

**Frontmatter write mechanism:** split the file into `[first frontmatter block,
rest]` by matching the leading `^---\n([\s\S]*?)\n---`; `js-yaml.load` the block,
set `kickback_counts`, `js-yaml.dump` it back, reassemble with the untouched
rest. If the plan has NO leading frontmatter block, create one containing only
`kickback_counts` and prepend it. (Sequential-writer assumption per ADR means no
locking is required; note this explicitly in code.)

**Error handling:** never corrupt a plan — on a js-yaml dump failure, throw
before writing (do not write a half-serialized file). `readKickbackCounts` fails
to a zeroed counter, never throws.

**Cross-platform:** `path.join`, `safeFs`, `\r?\n`-tolerant frontmatter regex
(the parent vision flags CRLF as a cross-cutting defect — use `/^---\r?\n/`).

### Test Plan

#### Tests: `tests/ctoc-audit-w05-circuit-breaker.test.js`
**Action:** CREATE
**Framework:** `node:test`.

**Zero-doubles:** a real temp plan `.md` file with real frontmatter; real
`js-yaml`; real `.ctoc/logs/escalations.json`. No mocking. "Process restart" is
simulated by calling `recordKickback` again (the module holds no state) and by
re-reading the file from disk.

**Test cases (assert BEHAVIOR):**
1. **M7 — same-step escalates on the 4th, not before.** 3 sequential
   `recordKickback(planPath,'10',root)` → each returns `escalation === null`.
   The 4th returns `escalation.type === 'same-step'` with `step==='10'`,
   `count===4`. Assert `.ctoc/logs/escalations.json` has exactly one same-step
   entry.
2. **M8 — per-plan escalates on the 6th across ≥2 steps, no single step at 4.**
   Record `10,10,10,11,11,11`. Assert calls 1-5 return `escalation===null`
   (no step reaches 4; total ≤5), and call 6 returns
   `escalation.type === 'per-plan'` with `total===6`. Assert no same-step
   escalation fired (both steps capped at 3).
3. **Counter is persisted in the plan frontmatter.** After 2 records to step 10,
   re-read the plan file from disk and `js-yaml.load` its first block; assert
   `kickback_counts.by_step['10']===2` and `total===2` are physically present in
   the file (not just in a return value).
4. **readKickbackCounts on a fresh plan → zeros.** A plan with frontmatter but no
   `kickback_counts` returns `{ by_step:{}, total:0 }` without throwing.
5. **M9 — persistence across a simulated restart (under the escalate-on-4th
   rule).** Record 3 kickbacks to step 10 (no escalation — 3 is not > 3).
   Simulate a restart: re-read the SAME file path with a fresh
   `recordKickback(planPath,'10',root)` (the module has no in-memory state).
   The 4th record returns `escalation.type==='same-step'`, proving the prior 3
   survived on disk — had the restart reset the count to 0, this call would be
   the 1st and return `null`.
6. **Falsy step throws.** `recordKickback(planPath, '', root)` throws
   `Error('step required')`; the plan file is unchanged.
7. **Frontmatter body preserved.** After recording, assert the plan's `title:`
   and body text below the frontmatter are byte-identical to before (only
   `kickback_counts` was added/updated).

**Coverage:** ≥80% on the module; same-step branch, per-plan branch, null
branch, zero-read branch, throw branch, and the no-frontmatter-prepend branch
all exercised.

### Security Review

- [x] **Plan integrity:** write is a parse-modify-serialize of the first
  frontmatter block only; the body and other keys are preserved (test case 7).
  A serialize failure throws BEFORE writing (no half-written plan).
- [x] **No prototype pollution:** counter keys come from `String(step)` and the
  fixed keys `by_step`/`total`; guard against `__proto__`/`constructor` step
  values (coerce + reject a step that is not a plain step identifier).
- [x] **Path safety:** `escalations.json` is written under `.ctoc/logs/`; plan
  writes target the passed `planPath` only.
- [x] **No secrets / no injection:** YAML + JSON only; no shell surface.
- [x] **CRLF safe:** frontmatter regex tolerates `\r?\n` (cross-platform).
- [x] **Fail closed on read:** a malformed counter reads as zero, so a corrupted
  count can never suppress an escalation silently by throwing.

## Decisions Taken Under Ambiguity

- **Escalate on EXCEEDING the max (4th same-step / 6th per-plan).** Resolves the
  parent's internal contradiction in favor of M7/M8 + both dedicated scenarios +
  CLAUDE.md + the dispatch brief. See "Escalation thresholds" above.
- **Persistence = plan frontmatter via `js-yaml`, stateless module.** Honors the
  parent's frontmatter decision; the named concurrency blocker does not apply
  because plans execute sequentially (ADR). `js-yaml` handles the nested map the
  flat `parseMetadata` cannot.
- **Escalation channel = return value (primary) + `.ctoc/logs/escalations.json`
  (durable human record).** The parent left the channel open, requiring only an
  observable human-facing escalation; this provides both an assertable return and
  a persistent log.
- **This slice ships the MODULE, not a live Iron-Loop call site.** The parent
  explicitly defers locating/creating the kickback call site and writes the
  acceptance criteria against simulated `recordKickback` calls. Wiring
  `recordKickback` into the executor's step-failure/retry path (`iron-loop.js` /
  the executor) is a separate integration outside this slice's declared files and
  is intentionally NOT implemented here (no acceptance criterion covers it;
  building it would be untested scope creep). The natural call site is flagged in
  the module's header comment for a follow-up wiring slice.

## Execution Plan

### Step 8: TEST
- [ ] Write `tests/ctoc-audit-w05-circuit-breaker.test.js` FIRST (TDD RED): the 7
      behavior cases above, real temp plan + real js-yaml + real escalations log,
      no doubles. Encode the escalate-on-4th / escalate-on-6th thresholds and the
      restart-persistence proof.
- [ ] Confirm RED: `src/lib/circuit-breaker.js` does not exist, so every import
      fails.

### Step 9: PREPARE
- [ ] Confirm `js-yaml` resolves (`require('js-yaml')`); confirm `safe-fs`
      read/write/mkdir helpers; decide the first-frontmatter-block split regex
      (`/^---\r?\n([\s\S]*?)\r?\n---/`).

### Step 10: IMPLEMENT
- [ ] `src/lib/circuit-breaker.js`: create the module — `readKickbackCounts`,
      `recordKickback` (increment + frontmatter read-modify-write + escalation
      computation + escalations.json append), `getEscalations`; header comment
      flagging the deferred live call site; `module.exports` for all three.

### Step 11: REVIEW
- [ ] Self-review: stateless (no module-level counter); same-step precedence;
      body/other-keys preserved; CRLF-safe; thresholds match the resolved rule;
      no cycle; no live wiring (scope).

### Step 12: OPTIMIZE
- [ ] One read + one write per `recordKickback`; single escalations.json append
      only when escalating; no redundant parses.

### Step 13: SECURE
- [ ] Walk the Security Review checklist; add the `__proto__`/`constructor` step
      guard; confirm serialize-before-write ordering (no half-written plan).

### Step 14: VERIFY
- [ ] Run `node --test tests/ctoc-audit-w05-circuit-breaker.test.js` → green.
- [ ] Run full suite `node --test tests/*.test.js` → `# fail 0`, `0 skipped`.
- [ ] Coverage ≥80% on `circuit-breaker.js`.

### Step 15: DOCUMENT
- [ ] JSDoc on all exports (counter shape, threshold rule, escalation shape,
      persistence semantics); header note on the deferred call site.

### Step 16: FINAL-REVIEW
- [ ] Confirm: counts persist in frontmatter across simulated restart; same-step
      escalates at the 4th; per-plan at the 6th; escalation is observable in the
      return AND the log; the plan body is preserved; scope limited to the two
      declared files (no live wiring).
