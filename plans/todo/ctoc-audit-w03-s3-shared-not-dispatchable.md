---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.063Z
gate_crossed: implementation → todo
---

---
title: "W03-s3 — Exclude agents/_shared from the dispatchable-agent set via the plugin manifest"
type: feature
parent_plan: "ctoc-audit-w03-agent-contracts-load"
depends_on: none
priority: HIGH
files:
  - .claude-plugin/plugin.json
  - tests/agent-shared-not-dispatchable.test.js
---

# W03-s3 — Exclude agents/_shared from the dispatchable-agent set

**SIP1 slice of** `ctoc-audit-w03-agent-contracts-load` (Story C / Finding L5).
**Scope:** stop the 4 `agents/_shared/*.md` prose fragments (`ancestry-read`,
`async-choice-protocol`, `no-stub-rule`, `warnings-are-critical`) from being registered as
dispatchable agents, WITHOUT physically relocating them (so every `../_shared/<name>.md`
cross-reference from sibling agent files keeps resolving). Two files.

**Independent** of s1 and s2: the `_shared` fragments carry no frontmatter and are not
among the 19 heading-first files; nothing here touches frontmatter position or the
invariants parser.

## Decisions Taken Under Ambiguity

- **Documented reversal — the exclusion lives in the PLUGIN MANIFEST, not a code walker.**
  The parent plan chose "add a `_shared/**` skip to the agent-discovery walker." Verified
  at PLAN time: **there is no CTOC-side discovery walker to patch.** `"dispatchable"`
  appears nowhere in `src/`; `agent-resolver.js` is explicitly "NOT invoked by Claude's
  normal agent loading path"; every CTOC-side walker
  (`iron-loop-enforcer.js:listAgents`, `agent-resolver.js`,
  `architecture-invariants.test.js:walkAgentFiles`) **already** skips `_`-prefixed dirs —
  yet the `_shared` fragments are STILL registered (this session's agent registry lists
  `ctoc:_shared:ancestry-read` … as dispatchable). That proves the dispatchable set is
  built by the **Claude Code plugin harness auto-walking `agents/`**, which CTOC's only
  lever over is `.claude-plugin/plugin.json`. This is the parent plan's explicitly-
  permitted "documented reversal at Step 5 PLAN with the broken-reference cost stated":
  relocation would rewrite every `../_shared/` link across the fleet (large, needless
  diff); a manifest whitelist is one contained change with zero broken links. The original
  W03 stub named "exclude it via manifest" as an accepted option — this is that option.
- **Mechanism = an explicit `"agents"` whitelist of the 25 real category dirs.** Set
  `plugin.json.agents` to every immediate child directory of `agents/` **except**
  `./agents/_shared` (current set: ai-quality, architecture, compliance, coordinator, cost,
  data-ml, devex, documentation, frontend, infrastructure, iron-loop, legal, mobile,
  pipeline, planning, product, quality, realtime, saas, safety, scouts, security,
  specialized, testing, versioning). Omitting `_shared` excludes it by construction and
  generalizes to any future `_shared/*.md`. `_shared/*.md` stay physically in place.
- **PREPARE must verify the harness honours this (override vs merge).** The load-bearing
  external unknown: does providing `plugin.json.agents` **replace** the default `agents/`
  auto-discovery (needed — then `_shared` is excluded), or **merge** with it (then auto-
  discovery still grabs `_shared` and the whitelist is insufficient)? Step 9 resolves this
  against the Claude Code plugin-manifest schema before Step 10 writes it. If it merges,
  the whitelist cannot work and the only remaining mechanism is relocation (rejected for
  its broken-reference cost) — in that case **escalate via `markNeedsInput`** rather than
  silently relocating. Primary path is the whitelist; the fallback and its cost are stated,
  not stubbed.

## Implementation Details

### File specification — `tests/agent-shared-not-dispatchable.test.js` (CREATE)
Reads the REAL manifest the harness consumes (`.claude-plugin/plugin.json`) — not a
parallel mirror. Helper `dispatchableSet(root)`: read `plugin.json`; if `agents` is
absent → model the harness default (recursively walk `agents/**/*.md`, INCLUDING `_shared`
— the RED baseline); if `agents` is an array of dir paths → expand each against the
filesystem to `.md` files. Returns the set of relative agent paths.

### File specification — `.claude-plugin/plugin.json` (MODIFY)
Add an `"agents"` array of the 25 real category directories (see Decisions). Preserve the
existing `name`/`version`/`description`/`commands` keys. `_shared/*.md` untouched on disk.

## Execution Plan

### Step 8: TEST
TDD-first — write `tests/agent-shared-not-dispatchable.test.js`, RED against the current
manifest (no `agents` field → harness auto-discovers all → `_shared` dispatchable):
- [ ] **No `_shared` fragment is dispatchable**: assert `dispatchableSet(root)` contains
  none of the 4 `agents/_shared/*.md`. RED now.
- [ ] **No real agent is dropped**: assert the set INCLUDES `agents/coordinator/cto-chief.md`
  and all 5 scouts (`agents/scouts/{dep,lint,secret,syntax,test}-scout.md`) plus a sample
  of others — guards against over-exclusion.
- [ ] **Exclusion generalizes**: assert a hypothetical `agents/_shared/zzz-new.md` path is
  not covered by any whitelisted entry (directory-scoped, not a hardcoded 4-name list).
- [ ] **Drift guard**: assert every immediate child dir of `agents/` EXCEPT `_shared`
  appears in `plugin.json.agents` (a new category cannot silently miss the manifest, and
  `_shared` must never be listed).
- [ ] Confirm RED: `node --test tests/agent-shared-not-dispatchable.test.js`.

### Step 9: PREPARE
- [ ] Verify against the Claude Code plugin-manifest schema whether `plugin.json.agents`
  **overrides** the default `agents/` auto-discovery (required) or merges with it. Use the
  plugin docs (context7 / official schema). Record the finding.
- [ ] If it merges (whitelist cannot exclude `_shared`): stop and `markNeedsInput` with the
  relocation fallback and its broken-`../_shared/`-reference cost — do not relocate silently.
- [ ] Enumerate the current immediate child dirs of `agents/` to build the exact whitelist.

### Step 10: IMPLEMENT
- [ ] `.claude-plugin/plugin.json`: add `"agents"` = the 25 real category dirs (all
  `agents/*` except `_shared`), preserving all existing keys.
- [ ] `tests/agent-shared-not-dispatchable.test.js`: finalize `dispatchableSet` to expand
  the manifest whitelist (already written in Step 8; ensure it reads the now-present field).

### Step 11: REVIEW
- [ ] Self-review: `_shared` absent from `agents`; all 25 real categories present; JSON is
  well-formed; no existing manifest key altered.

### Step 12: OPTIMIZE
- [ ] Confirm the whitelist is derived by rule (all `agents/*` minus `_shared`), the test's
  drift-guard keeps it complete, and no `_shared` path leaked in.

### Step 13: SECURE
- [ ] `plugin.json` paths are repo-relative directory names only — no traversal, no user
  input. Confirm no other plugin component (commands/hooks) is disturbed.

### Step 14: VERIFY
- [ ] Run the new test green: `node --test tests/agent-shared-not-dispatchable.test.js`.
- [ ] Run the full suite: `node --test tests/*.test.js` — expect `# fail 0`.

### Step 15: DOCUMENT
- [ ] Record the reversal (manifest whitelist, not code walker; harness does the walk) and
  the override-vs-merge verification result, so the mechanism is legible to the next reader.

### Step 16: FINAL-REVIEW
- [ ] Confirm the four Story-C acceptance scenarios (no `_shared` dispatchable; real agents
  retained; generalizes to a new `_shared` file; red baseline flipped to 0), and the full
  suite is `# fail 0`.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Harness MERGES the whitelist with auto-discovery (whitelist can't exclude `_shared`) | Verify override-vs-merge before implementing; escalate to relocation-with-cost if merge | Step 9 |
| Whitelist drops a real agent (over-exclusion, high blast radius) | Test asserts cto-chief + scouts + drift-guard over all real categories | Step 8, Step 14 |
| Future `agents/` category silently missing from manifest | Drift-guard test fails until it is added | Step 8, Step 14 |
| Relocation would break `../_shared/` cross-references | Chosen mechanism keeps `_shared/*.md` in place | Decisions, Step 10 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review
