---
approved_by: human
approved_at: 2026-07-13T20:53:24.297Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:57.808Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-13T11:01:11.555Z
gate_crossed: functional → implementation
---

---
title: "W03 — Agent Contracts Load At Runtime"
created: "2026-07-11T00:00:00Z"
type: feature
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: HIGH
depends_on: none
---

# W03 — Agent Contracts Load At Runtime

## 1. ASSESS — Problem Understanding

### Business Context

An agent contract that never loads is a safety and cost control silently turned off.
`cto-chief` is CTOC's sole top-level coordinator; its entire safety property is that it
is dispatched with a **read-only** tool set so it cannot edit files or bypass the
PreToolUse enforcement it coordinates around. The 5 Tier-3 scouts exist specifically to
be **cheap** — fast Haiku pre-screens that short-circuit expensive deep dispatches. Both
properties are declared in YAML frontmatter and enforced nowhere else. If the frontmatter
never parses, both properties are fiction: `cto-chief` runs with every tool, and every
scout runs on the full session model (Opus), burning cost with zero functional benefit.
This is not a cosmetic defect — it is the exact class of "tests structure, not truth"
failure the parent vision identifies as CTOC's core self-audit finding: a 5485-test green
suite currently certifies this broken state as correct.

### Current State

Verified directly against the plugin's live agent registration and the repo tree:

- **19 agent files place a `# H1` heading before their YAML frontmatter block.** The
  plugin runtime only recognizes a `---` frontmatter block when it begins at byte 0 of
  the file. For all 19 files, the runtime parses **none** of the declared frontmatter —
  not `tools:`, not `model:`, not `role:`. The entire declared contract is silently
  dropped, and the runtime falls back to its unconstrained default.
- **`cto-chief`'s live registration currently exposes "All tools"** instead of its
  declared read-only set — confirmed by inspecting the plugin's registered-agent object
  at session start, not merely by reading the source file (the source file's YAML is
  correct; it simply never loads).
- **All 5 scouts' live registrations currently expose the session model** instead of
  their declared `model: haiku` — same defect, same verification method.
- **`tests/architecture-invariants.test.js`'s frontmatter reader is more lenient than the
  runtime.** It matches `---` anywhere in the file (a `/^---/m` pattern plus a
  match-anywhere fallback), so for all 19 heading-first files it finds and parses the
  misplaced YAML block that the runtime ignores, and asserts the declared contract is
  present. The test is **certifying the exact broken state it exists to catch** — a false
  green over a real defect (Finding C7).
- **`agents/_shared/*.md` (4 prose fragments) carry no frontmatter at all** and live
  inside the auto-discovered `agents/` tree, so the discovery walker that builds the
  dispatchable-agent set currently auto-registers them as dispatchable agents. They are
  shared context prose meant to be read, not dispatched (Finding L5).

### Impact

- **Safety property off:** the top-level coordinator's "cannot edit" guarantee — the one
  property every other gate in the vision implicitly assumes holds — does not currently
  hold at runtime.
- **Cost architecture off:** every scout pre-screen that should short-circuit on Haiku
  instead runs the full session model, defeating the entire point of a Tier-3 fast-screen
  layer.
- **The safety net is blind to its own failure mode:** the invariants test that should be
  the first line of defense against exactly this defect class instead certifies it green,
  so the defect would never surface from the test suite — it was only found by direct live
  inspection.
- **Dispatch surface pollution:** prose fragments meant only for context injection are
  currently invocable as if they were executable agent roles, which is both a category
  error and a potential confused-deputy surface (a dispatch to a "prose fragment agent"
  has undefined, untested behavior).

## 2. ALIGN — Business Alignment

**Job to Be Done:** When the plugin registers 19 agents whose frontmatter sits after an
`# H1` heading, I want the runtime to parse and apply each agent's declared contract
(tools, model, role) exactly as authored, so I can trust that `cto-chief` is read-only
and scouts run cheap — and so the test suite that is supposed to catch a broken contract
actually goes red when the contract is broken, instead of certifying it green.

**Impact Map:**
- **Goal:** Every agent's declared contract loads and takes effect at runtime, and the
  test suite can detect a regression in that loading — this traces directly to the parent
  vision's Success Criterion 3 ("Every agent contract loads at runtime") and Success
  Criterion 5 ("The test suite goes red on every defect class above ... anchored
  frontmatter parsing").
- **Actor:** The CTOC maintainer (the human CTO) — first-named in the vision's target
  audience — who relies on `cto-chief` being read-only and scouts being cheap; the plugin
  runtime/loader is the mechanical actor that must parse correctly on the maintainer's
  behalf.
- **Impact:** An agent's YAML frontmatter becomes the single, trustworthy source of truth
  for its runtime behavior — no more silent divergence between what a file *says* and what
  actually *loads*. A future regression is caught by a red test, not discovered by manual
  live inspection (as this defect was).
- **Deliverable:** 19 corrected agent files (frontmatter at byte 0), one corrected
  invariants-test frontmatter parser (byte-0-anchored, no match-anywhere fallback), and
  the `agents/_shared/*` fragments excluded from the dispatchable-agent set — plus the
  tests proving all three, each red on the current tree and green after the fix.

**Alignment checks:**
1. Goal traces to the parent vision's problem statement? **YES** — the vision names this
   defect verbatim (19 heading-first files, `cto-chief` all-tools, scouts on session
   model, match-anywhere test parser) as one of its ten load-bearing confirmed defects.
2. Actor named in the vision's target audience? **YES** — "The CTOC maintainer (the human
   CTO)" is the vision's first-listed target audience.
3. Impact measurable/observable? **YES** — pass/fail on live tool-set exposure, live
   model exposure, and dispatchable-set membership; none of these require subjective
   judgment.
4. Deliverable scoped to a single functional area? **YES** — scoped strictly to
   frontmatter-load + one test parser + one discovery exclusion. It explicitly excludes
   the step-agent-resolution/registry work (workstream 4 / W04 in the vision), which is a
   distinct functional area with its own stub.

All 4 checks pass — no escalation needed on alignment.

**Alignment metrics (mechanism-agnostic, verifiable without reading source prose):**
- `0` of the non-`_shared` `agents/**/*.md` files begin with anything other than
  `---\n` (i.e. `19`/`19` corrected).
- Live registration for `cto-chief` exposes exactly its declared read-only tool set — not
  "All tools".
- Live registration for each of the 5 scouts exposes `model: haiku` — not the session
  model.
- `0` of the 4 `agents/_shared/*.md` fragments appear in the dispatchable-agent
  enumeration.

**Sibling overlap check:** Read `plans/functional/ctoc-audit-w01-enforcement-blocks.md`
(exit-code/stdin/MultiEdit enforcement mechanics) and
`plans/functional/ctoc-audit-w02-gate-integrity.md` (approval-ledger/multi-hop-move/revert
isolation). Neither touches agent frontmatter, agent discovery, or the
architecture-invariants test — no scope overlap detected. The parent vision's own
workstream list (11 workstreams) also keeps workstream 4 (agent *resolution* — missing
step agents, dangling registry paths) explicitly separate from workstream 3 (agent
*contract loading*, this stub) — confirmed by the original stub's own "Does NOT touch"
clause. No `markNeedsInput()` needed for overlap.

## 3. CAPTURE — Requirements

### User Stories (INVEST-validated)

**Story A — Frontmatter loads for every agent**
**As** the plugin runtime, **I want** every non-`_shared` agent file's `---` frontmatter
block to begin at byte 0, **so that** each agent's declared tools/model/role is parsed
and enforced exactly as authored, instead of silently discarded.
- Independent: no dependency on Story B or C to build or test. Negotiable: describes the
  outcome (contract loads), not the byte-level mechanics of *how* each file is edited.
  Valuable: closes the safety/cost gap directly for the maintainer. Estimable: a bounded,
  mechanical move across a known finding (C6). Small: one Iron Loop cycle. Testable: byte
  comparison + live registration inspection. **PASS.**

**Story B — The invariants test parses like the runtime**
**As** the CTOC maintainer, **I want** the architecture-invariants frontmatter parser
anchored to `^---` at byte 0 (no `m` flag, no match-anywhere fallback), **so that** the
test parses frontmatter identically to the runtime and goes red on a heading-first file
instead of certifying it green.
- Independent: testable via a synthetic fixture without Story A landing first (must in
  fact be verified RED against the *current* tree before Story A fixes it). Negotiable:
  no prescribed regex, only the anchoring behavior. Valuable: restores the test suite as
  a real safety net for this defect class. Estimable, Small, Testable (fixture-driven).
  **PASS.**

**Story C — Shared prose is not an agent**
**As** the plugin runtime, **I want** `agents/_shared/*.md` excluded from the
dispatchable-agent enumeration, **so that** shared context prose can never be dispatched
as if it were an executable agent role.
- Independent of A and B. Negotiable: does not prescribe relocation vs. manifest
  exclusion (see Decisions). Valuable: closes a category-error/confused-deputy surface.
  Estimable, Small, Testable via discovery enumeration. **PASS.**

### Acceptance Criteria

**Story A**

- [x] **Scenario: Every non-`_shared` agent file begins with frontmatter at byte 0**
  Given the 19 files corrected so their `---` block is the first 4 bytes of the file
  When a structural test reads the first 4 bytes of every non-`_shared` `agents/**/*.md`
  file
  Then all of them equal the literal bytes `---\n` (byte-for-byte, not a regex substring
  match anywhere in the file)

- [x] **Scenario: `cto-chief` loads with its declared read-only tool set (live)**
  Given the corrected `agents/coordinator/cto-chief.md`
  When the plugin registers agents at session start
  Then the live registration object for `cto-chief` exposes exactly its declared
  read-only tool set (e.g. Read/Grep/Glob-class tools) and does NOT include Write, Edit,
  MultiEdit, NotebookEdit, or Bash

- [x] **Scenario: Each of the 5 scouts loads with `model: haiku` (live)**
  Given the 5 corrected scout agent files
  When the plugin registers agents at session start
  Then each scout's live registration reports `model: haiku`, not the session model

- [x] **Scenario: A heading containing YAML-special characters does not corrupt the move**
  Given one of the 19 files whose `# H1` heading text contains a colon or a quote
  character (a realistic case, since titles like `"W03 — Agent Contracts Load At
  Runtime"` already use punctuation)
  When the frontmatter/heading swap is applied
  Then the resulting `---` block still parses as valid YAML and the heading text is
  preserved verbatim immediately after the closing `---`

**Story B**

- [x] **Scenario: The anchored parser goes red on the current (pre-fix) tree**
  Given the invariants-test frontmatter parser anchored to `^---` at byte 0 (the `m` flag
  and match-anywhere fallback removed)
  When it runs against the CURRENT, unfixed tree containing a heading-first agent file
  Then it reports that file's frontmatter as absent and the corresponding invariant
  assertion FAILS — proving the false-green is closed before Story A's file moves land

- [x] **Scenario: A synthetic heading-first fixture is rejected, not partially parsed**
  Given a fixture file with content `# Title\n\n---\nname: x\n---\n` (heading before
  frontmatter)
  When the anchored parser reads it
  Then it returns no parsed fields (empty/undefined) — not the fields from the misplaced
  block further down the file

- [x] **Scenario: The anchored parser goes green after Story A's fix**
  Given the 19 files corrected under Story A
  When the anchored parser runs against the full `agents/**/*.md` tree
  Then it reports frontmatter present and correctly parsed for all 19, and the
  architecture-invariants test suite passes with 0 failures on this invariant

**Story C**

- [x] **Scenario: No `_shared` fragment is dispatchable after the fix**
  Given the corrected agent-discovery configuration
  When the discovery pass enumerates the dispatchable-agent set
  Then none of the 4 `agents/_shared/*.md` fragments appear in that set

- [x] **Scenario: The pre-fix discovery walker currently DOES register `_shared` fragments (red baseline)**
  Given the CURRENT, unfixed discovery walker
  When it enumerates the agent tree including `agents/_shared/*.md`
  Then it currently lists those 4 fragments as dispatchable — captured as the RED
  baseline this fix must flip to "0 registered"

- [x] **Scenario: The exclusion generalizes to a new file, not just the 4 known fragments**
  Given a new file later added under `agents/_shared/` (not one of the 4 current
  fragments)
  When discovery runs
  Then it is still excluded — proving the exclusion is directory/pattern-scoped, not a
  hardcoded list of today's 4 filenames

### Scope

#### In Scope
- Move the `---` frontmatter block to byte 0 (line 1) in all 19 identified heading-first
  agent files; relocate the `# H1` heading to immediately follow the closing `---`
  (traces to the Story A scenarios).
- Anchor `tests/architecture-invariants.test.js`'s frontmatter-reading function to
  `^---` at byte 0 only, removing the `m` flag and the match-anywhere fallback (traces to
  the Story B scenarios).
- Exclude `agents/_shared/*.md` from the dispatchable-agent enumeration built by the
  discovery pass (traces to the Story C scenarios).
- The four tests listed under Acceptance Criteria: byte-0 structural check, live
  registration checks for `cto-chief` + the 5 scouts, the anchored-parser fixture
  red/green pair, and the discovery-enumeration check.

#### Out of Scope
- Creating, renaming, or repointing any Iron Loop step agent, and fixing dangling
  `path:` entries in `operations-registry.yaml` — that is workstream 4 ("Every dispatched
  agent resolves"), tracked in its own stub (W04, `ctoc-audit-w04-*`).
- Any change to gate/enforcement mechanics — exit codes, stdin payload parsing,
  MultiEdit/NotebookEdit delegation — that is workstream 1 (W01,
  `ctoc-audit-w01-enforcement-blocks.md`).
- Any change to approval-provenance, multi-hop-move blocking, or revert-loop isolation —
  that is workstream 2 (W02, `ctoc-audit-w02-gate-integrity.md`).
- Re-scoping WHAT any agent declares (its tool set, its model, its role) — this stub only
  makes the EXISTING declaration load. Changing a declared contract (e.g. deciding
  `cto-chief` should have a different tool set) is a separate decision for whoever owns
  that agent's definition, not this remediation.
- Physically relocating `agents/_shared/*.md` out of the `agents/` directory tree — see
  Decisions below for why exclusion, not relocation, was chosen.

### Files Likely Touched
- The 19 heading-first `agents/**/*.md` files identified by Finding C6 (known members
  include `agents/coordinator/cto-chief.md` and the 5 Tier-3 scout agent files; the
  complete, exact list is produced mechanically at Step 5 PLAN via a repo-wide scan for a
  `#` heading preceding the first `---` — not hand-enumerated here, to avoid this plan
  drifting out of sync with the actual file state).
- `tests/architecture-invariants.test.js` — the frontmatter-reading function referenced
  by Finding C7.
- The agent-discovery/registration module that walks `agents/**/*.md` to build the
  dispatchable set (exact module path identified at Step 5 PLAN) — gets a `_shared/`
  exclusion pattern added. `agents/_shared/*.md` themselves are NOT moved (see Decisions).

### Test Strategy

Three of the four acceptance-criteria groups are structural/fixture tests that must be
written to be RED against the current, unfixed tree and GREEN after the fix — standard
TDD-Red at Step 8 TEST, no implementation code changes yet:
1. Byte-0 structural check across all non-`_shared` `agents/**/*.md`.
2. Anchored-parser fixture test (Story B) — proves the match-anywhere false-green is
   closed, independent of whether Story A has landed yet.
3. Discovery-enumeration check (Story C) — proves 0 `_shared` fragments are dispatchable.

The fourth group (live registration exposing `cto-chief`'s and each scout's actual
tools/model) is a **behavioral, not merely structural, test**: it must inspect the
plugin's resolved/registered agent object produced by the loader at session start — not
re-parse the source YAML — so that a future regression in the loader itself (not just in
a file's frontmatter position) is also caught. The precise harness call (spawning a real
plugin registration pass vs. invoking the loader's public resolve function directly with
the corrected files as input) is an implementation-planning decision (Step 5/6), not
fixed here; the requirement that binds it is: **the assertion is made against the
loader's output, never against the source file text**, matching Finding C7's own lesson
(reading the file is not evidence of what the runtime does with it).

## Priority

**Priority: HIGH** (Score: 7/9)
- Dependency: MEDIUM (2) — independent of W01 and W02 in both directions
  (`depends_on: none`, and no sibling stub is blocked on this one landing first); runs in
  parallel with the other ten workstreams.
- Business Impact: HIGH (3) — closes two of the vision's ten load-bearing confirmed
  defects (C6, C7) plus L5, and is named explicitly in the vision's Problem Statement and
  as Success Criterion 3 ("Every agent contract loads at runtime").
- Technical Risk: MEDIUM (2) — the file edits themselves are mechanical, but the fix
  touches a shared, load-bearing code path (the agent discovery/registration walker used
  by every agent, not just the 19 in scope); a careless change there has a blast radius
  larger than the 19 files.

## Risks

### Technical Risks
- **Risk:** Hand-relocating frontmatter in 19 files risks a malformed result — e.g. a
  heading containing a colon or quote gets swallowed into the YAML block, or an
  in-body `---` (a Markdown horizontal rule inside the agent's prose) is mistaken for the
  frontmatter boundary during the edit.
  - Likelihood: MEDIUM
  - Impact: HIGH (a malformed block re-breaks the exact contract this stub exists to fix,
    or crashes the loader for that agent)
  - Mitigation: Validate every moved file with the corrected, byte-0-anchored parser as
    part of the same test run that performs the move (parse-before/parse-after), so a
    malformed result is caught by the test rather than discovered at runtime.
- **Risk:** Anchoring the invariants-test parser (dropping the `m` flag and the
  match-anywhere fallback) may affect other current consumers of that parser's lenient
  behavior beyond the 19 files in scope.
  - Likelihood: MEDIUM
  - Impact: MEDIUM
  - Mitigation: Run the full existing test suite after the parser change and triage any
    new failure as either (a) another file in the same heading-first defect class — fix
    it, it is in scope by definition — or (b) a genuinely different consumer relying on
    lenient matching — escalate via `markNeedsInput()` rather than silently loosening the
    anchor back.

### Business Risks
- **Risk:** Making `cto-chief` genuinely read-only may reveal that some currently
  "working" dispatch flow silently relied on its accidental write access — i.e. a latent
  defect that only appears to work today because the safety property is off.
  - Likelihood: LOW
  - Impact: MEDIUM
  - Mitigation: Run the full existing Iron Loop dispatch/invariant test suite after the
    fix; treat any new failure as a separate, real defect to file — not a reason to
    revert this fix, since the parent vision is explicit that `cto-chief` must be
    read-only.

### Dependency Risks
- **Risk:** Story B's red-baseline scenario requires the CURRENT source of
  `tests/architecture-invariants.test.js` to still contain the match-anywhere pattern
  (`m` flag + fallback) at the time this stub's Step 8 tests are written. The parent
  vision notes workstream 6 (truthful tests) "should land alongside each other
  workstream," raising a small chance of a concurrent edit to the same test file from a
  different workstream.
  - Likelihood: LOW
  - Impact: MEDIUM
  - Mitigation: At Step 9 PREPARE, confirm `tests/architecture-invariants.test.js` has no
    other in-flight edit before starting Step 10 IMPLEMENT; if one exists, sequence
    rather than editing concurrently (per the project's "no concurrent git agents on the
    same file" rule).

## Decisions Taken Under Ambiguity

- **No Business Model Canvas.** No canvas exists at
  `plans/canvas/ctoc-self-audit-remediation.md`. This is a technical remediation
  workstream; a BMC is not applicable. Proceeding vision-only per instruction — not
  kicked back.
- **Heading placement after frontmatter.** The `# H1` is relocated to immediately after
  the closing `---` rather than deleted, preserving human-readable titles while making
  byte 0 the frontmatter start. If the maintainer prefers dropping the heading entirely
  (the frontmatter `title:` already carries it), that is a trivial follow-up at review.
- **`_shared` exclusion mechanism: manifest/pattern exclusion, NOT physical relocation.**
  The original stub named both "relocate out of the auto-discovered agent tree" and
  "exclude it via manifest" as acceptable, leaving the choice to implementation planning.
  Resolving it here rather than deferring: this very refinement pass observed multiple
  existing cross-references from other agent definitions into `agents/_shared/*.md` by
  relative path (e.g. `agents/_shared/no-stub-rule.md`, `agents/_shared/
  async-choice-protocol.md`, `agents/_shared/ancestry-read.md`, linked as
  `../_shared/<name>.md` from a sibling agent file). Physically relocating `_shared/`
  would break every such reference across the agent fleet — an unbounded, needlessly
  large diff to solve a *discovery-registration* problem. A pattern-based exclusion in
  the discovery walker (e.g. skip any path matching `agents/_shared/**`) is a single,
  small, contained change with zero broken references, and it generalizes to future
  `_shared` files (see the Story C edge-case scenario) rather than needing to be updated
  per-file. **Recommendation: exclude by pattern; do not relocate.** If the implementation
  planner finds a concrete reason relocation is still preferable (e.g. the discovery
  walker cannot easily support a path-pattern exclusion), that is a documented reversal
  to make at Step 5 PLAN with the broken-reference cost stated explicitly — not a silent
  default back to relocation.

## Slices (dependency-ordered) — SIP1 decomposition

Steps 5–7 decomposed this functional-derived plan into **3 cohesive implementation
slices**. This parent is now their INDEX; each slice is a complete plan with its own
Steps 8–16 and is executed independently through the Iron Loop. Gates 2 & 3 batch across
all three via `approveSubplans('ctoc-audit-w03-agent-contracts-load', <stage>)` — one
human decision crosses every sibling. Build order follows `depends_on` (s2 after s1; s1
and s3 are independent). Max dependency-chain depth 2; no cycles.

| # | Slice file | Scope (one line) | Story / Finding | depends_on |
|---|------------|------------------|-----------------|------------|
| 1 | `ctoc-audit-w03-s1-frontmatter-byte0.md` | Move the `---` block to byte 0 in the 19 heading-first agent files; assert byte-0 + live contract-load (cto-chief tools, 5 scouts `model: haiku`) | A / C6 | none |
| 2 | `ctoc-audit-w03-s2-anchor-invariants-parser.md` | Anchor `architecture-invariants.test.js`'s `readFM` to `^---` at byte 0 (drop `m` flag + match-anywhere fallback) + fixture red/green | B / C7 | s1 |
| 3 | `ctoc-audit-w03-s3-shared-not-dispatchable.md` | Exclude `agents/_shared/**` from the dispatchable set via a `plugin.json` `agents` whitelist (no relocation) + enumeration test | C / L5 | none |

**Slice `files:` coverage** (each edit is scoped to its slice's declared `files:`):
- s1 → the 19 agent `.md` files + `tests/agent-contract-load.test.js`
- s2 → `tests/architecture-invariants.test.js`
- s3 → `.claude-plugin/plugin.json` + `tests/agent-shared-not-dispatchable.test.js`

## Findings surfaced during decomposition (for the maintainer to schedule — not scheduled here)

Reading the live tree (not the stub prose) surfaced three facts that the maintainer must
see. None is silently absorbed into W03 or silently deferred; each is stated so the
maintainer alone decides what/when.

1. **cto-chief's declared tool set INCLUDES `Bash` (and `Task`).** The live file declares
   `tools: Read, Grep, Glob, Task, Bash` — not the Bash-free read-only set the ALIGN
   acceptance criterion assumed. W03 makes this *existing* declaration LOAD (in scope); it
   does NOT re-scope it (re-scoping is explicitly out of W03 scope). But a `Bash` grant
   means cto-chief can mutate files through a shell, which **weakens the "cannot edit"
   safety property this plan claims to restore.** Whether to drop `Bash`/`Task` from
   cto-chief's contract is a separate decision for the agent's owner.
2. **Two more identical lenient frontmatter parsers exist** beyond the one Story B fixes:
   `tests/cto-chief-toplevel.test.js:25` and `src/lib/iron-loop-enforcer.js:98` (the latter
   is runtime self-check code, not just a test). Both are the same C7 false-green pattern
   (`/^---\n…\n---/m` + match-anywhere fallback). s2 does NOT break them (separate local
   functions) and after s1 they parse the real tree correctly; once s2 lands,
   `architecture-invariants.test.js` already gives strict anchored coverage of cto-chief and
   every scout, so no coverage GAP remains. Anchoring these two for defence-in-depth is a
   natural fit for vision workstream 6 (truthful tests).
3. **Story C's fix is a plugin-manifest change, not a code-walker change** — there is no
   CTOC-side agent-discovery walker (the Claude Code harness does the walk). This is the
   documented reversal the Decisions section above explicitly permits; detail in s3.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review
