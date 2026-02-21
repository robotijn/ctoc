# CTOC Project Instructions

> CTOC dogfoods its own Iron Loop. The USER is the **CTO Chief** commanding virtual CTOs.
> When context is compacted, PRESERVE (in priority order): 1) human gate rules, 2) current task state + circuit breaker, 3) marketplace rule, 4) test commands, 5) cross-platform rules.

---

## Critical Rules

### 1. Human Gates (3 Mandatory Approval Points)

Three transitions REQUIRE human approval. NEVER cross these automatically.

| Gate | Transition | Revert To | Why |
|------|------------|-----------|-----|
| Gate 1 | functional -> implementation | functional | Prevents building the wrong thing |
| Gate 2 | implementation -> todo | implementation | Prevents wrong technical approach |
| Gate 3 | review -> done | review | Prevents shipping unreviewed code |

**Enforcement**: Pre-tool hook monitors ALL tool calls. Violations auto-revert the plan, log to `.ctoc/logs/gate-violations.json`, and alert the user. Plans at gate destinations need an `approved_by: human` marker or they get reverted.

**If asked to "complete" or "move to done"**: REFUSE. Explain the human gate requirement.

### 2. Marketplace Only

CTOC is ALWAYS installed from the online marketplace. NEVER point to local paths.

```
# Install:   /plugin marketplace add https://github.com/robotijn/ctoc && /plugin install ctoc
# Update:    /plugin update ctoc
# Fix stale: Delete the robotijn cache/marketplace dirs under your Claude plugins folder, restart, reinstall
#   Linux/macOS: ~/.claude/plugins/cache/robotijn/ and ~/.claude/plugins/marketplaces/robotijn/
#   Windows: %USERPROFILE%\.claude\plugins\cache\robotijn\ and %USERPROFILE%\.claude\plugins\marketplaces\robotijn\
```

NEVER modify `installed_plugins.json`, `installPath`, or plugin paths to use local directories.

---

## Test & Verify

```bash
node --test tests/*.test.js          # Run all 39 test files (cross-platform)
node scripts/release.js              # Sync VERSION to all JSON files
```

All tests must show `# fail 0`. If any test fails, fix before committing. The VERSION file is the single source of truth for version numbers. Do NOT use `run-all.js` (it doesn't exist).

---

## Release

| Step | Command |
|------|---------|
| 1. Update VERSION | Edit `VERSION` file (e.g., `6.1.22`) |
| 2. Sync versions | `node scripts/release.js` |
| 3. Stage & commit | `feat/fix: description (vX.Y.Z)` |
| 4. Push (if requested) | `git push origin main` |

Commit messages ALWAYS include the version: `feat: feature name (v6.1.22)`

Semantic versioning: patch (default every commit), minor (user says "minor"), major (user says "major").

### Release Menu

When user selects `[8] release` from dashboard, show:
```
[1] patch        vX.Y.Z+1      [4] patch+push
[2] minor        vX.Y+1.0      [5] minor+push
[3] major        vX+1.0.0      [6] major+push
[0] back
```

---

## Architecture

```
ctoc/
  CLAUDE.md              This file — start here
  IRON_LOOP.md           Methodology (15 steps, 3 phases, 3 human gates)
  VERSION                Source of truth for version
  agents/                85 agent definitions across 19 categories
  skills/                360 language & framework skill files
  commands/              8 slash commands (menu.js, push.md, quality.md, vision.md)
  hooks/                 10 Claude Code hooks (session start, pre-tool-use, post-tool-use)
  lib/                   71 JS modules (state, quality, security, planning, UI, analysis)
  scripts/               Build utilities (release.js, move-plan.js, coverage map)
  tabs/                  8 dashboard tabs (overview, vision, functional, implementation, review, todo, progress, tools)
  tests/                 39 test files
  .ctoc/                 Config, templates, operations, learnings
  .claude-plugin/        Plugin metadata (plugin.json, marketplace.json, hooks.json)
  plans/                 Plan files by stage (vision/, functional/, implementation/, todo/, review/, done/)
                         Note: in_progress is a plan state tracked in YAML frontmatter, not a separate directory
```

**Key entry points:**

| File | Purpose |
|------|---------|
| `commands/menu.js` | Dashboard router and UI |
| `lib/actions.js` | Plan operations (create, move, approve) |
| `lib/state.js` | Plan state management |
| `lib/quality-gate.js` | Quality enforcement |
| `lib/iron-loop.js` | Step validation and Integrator+Critic |
| `lib/init-project.js` | Project initialization |
| `hooks/PreToolUse.Bash.js` | Human gates + enforcement |
| `.ctoc/operations-registry.yaml` | Agent registry, kanban config |

---

## Iron Loop Summary

15 steps across 3 phases. Full details in [IRON_LOOP.md](./IRON_LOOP.md).

| Step | Label | Agent | Phase |
|------|-------|-------|-------|
| 1 | ASSESS | product-owner (sonnet) | Phase 1: Functional |
| 2 | ALIGN | product-owner (sonnet) | |
| 3 | CAPTURE | functional-reviewer (opus) | Gate 1: User approves plan |
| 4 | PLAN | implementation-planner (opus) | Phase 2: Technical |
| 5 | DESIGN | implementation-planner (opus) | |
| 6 | SPEC | implementation-plan-reviewer (opus) then integrator+critic (10 rounds) | Gate 2: User approves approach |
| 7 | TEST | test-maker (opus) | Phase 3: Implementation |
| 8 | PREPARE | quality-checker (sonnet) | |
| 9 | IMPLEMENT | implementer (sonnet) | |
| 10 | REVIEW | self-reviewer (opus) | |
| 11 | OPTIMIZE | optimizer (sonnet) | |
| 12 | SECURE | security-scanner (opus) | |
| 13 | VERIFY | verifier (sonnet) | |
| 14 | DOCUMENT | documenter (sonnet) | |
| 15 | FINAL-REVIEW | implementation-reviewer (opus) | Gate 3: User approves result |

**Step labels are MANDATORY** — validated by `lib/plan-validator.js` (library) and enforced at runtime by `hooks/validate-plan-steps.js` (hook). Plans with wrong labels are REJECTED.

**Step 9 is ONE step** with sub-items for multiple files. Never create multiple IMPLEMENT steps.

**Step 13 VERIFY is the quality gate**: lint, typecheck, ALL tests, coverage >= 80%, 0 skipped, 0 flaky. Review agents use 14 quality dimensions (ISO 25010 aligned) defined in IRON_LOOP.md.

**Circuit breaker**: Max 3 kickbacks to the same step, max 5 total kickbacks per plan. If exceeded, escalate to user with a summary of what keeps failing and why.

**Escape phrases** bypass Iron Loop enforcement when the overhead would exceed the change itself: "skip planning", "quick fix", "trivial fix", "hotfix", "urgent".

### Common Failures (and What to Do)

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Step 13 keeps failing on same test | Flaky test or wrong assertion | Fix the test at Step 7, not Step 9 |
| Circuit breaker trips | Misunderstood requirement | Escalate to user; likely needs re-planning |
| Step 9 creates files not in the plan | Scope creep | Add to plan or split into second plan |
| Step 12 finds critical vulnerability | Missing security in design | Kickback to Step 4 if architectural |
| Coverage < 80% after Step 7 | Tests too shallow | Review test cases; add edge case + error path tests |

---

## Menu System Rules

1. **Numbered menus after every CTOC response** — `[1][2][3]...[0]`, where `[0]` is always back/cancel
2. **Discussion mode when creating plans** — critique, find gaps, question assumptions before showing menu
3. **Recommended option first** with `(Recommended)` label
4. **Auto-generate implementation details** when plans move to implementation stage
5. **Every gap gets a question with pros/cons** — never just list gaps. Use `+`/`-` for pros/cons (not emojis)

```
Gap: Settings location unclear
  [1] Global (~/.ctoc/) (Recommended)
      + One config for all projects   - Can't vary per project
  [2] Per-project (.ctoc/)
      + Settings travel with repo     - Must configure every project
```

---

## Subagent Guidelines

**Plans: ALWAYS sequential.** Process todo plans one at a time, FIFO order. Never parallelize plan implementation — plans may modify overlapping files and later plans may depend on earlier changes.

**Everything else: Parallelize when independent.**

| Safe to parallelize | Must serialize |
|---------------------|----------------|
| WebSearch, Read, Glob, Grep, WebFetch | Edit, Write (same file) |
| File creation (different files) | Git operations |
| Analysis, research | Plan implementation |

Example — creating 5 skill files: launch 5 agents in parallel (each writes a different file). Researching a topic: launch parallel WebSearch + Grep + Read agents, then synthesize results.

---

## Quality Non-Negotiables

### No Silent Test Failures

Tests must NEVER silently pass. These patterns are BLOCKED:
- Empty catch blocks that swallow errors
- Early return without assertion (test "passes" without testing)
- Tests without assertions (always green)
- Skipped tests without documented reason
- Mocked-away core logic (testing the mock, not the code)

**If a test cannot run, it must FAIL LOUDLY.**

### Test Quality Checklist

Before marking Step 13 (VERIFY) as passed:
- [ ] Every test has at least one meaningful assertion
- [ ] Error paths are tested, not just happy paths
- [ ] Mocks are minimal — only external dependencies, never core logic
- [ ] No test depends on execution order
- [ ] Coverage >= 80% on new code

---

## Cross-Platform Requirement

All code MUST run on Windows, macOS, and Linux. Use:
- `path.join()` not string concatenation for paths
- `fs.promises` for async file operations
- `process.platform` checks when OS-specific behavior is needed
- `os.homedir()` not hardcoded `~`
- No bash scripts as entry points (Node.js only)

---

## Project Init Procedure

When initializing a new project with CTOC (`ctoc init`):

1. **Detect**: Scan for languages, frameworks, tools (via `lib/stack-detector.js`)
2. **Generate**: Create tailored `CLAUDE.md` from `.ctoc/templates/CLAUDE.md.template`
3. **Configure**: Set up `.ctoc/settings.yaml` with detected stack
4. **Quality**: Configure quality gates based on detected tools
5. **Plans**: Create `plans/` directory structure
6. **Iron Loop**: Initialize state in `.ctoc/state/`

The generated CLAUDE.md includes: CTO persona, Iron Loop steps, detected tools, quality commands, plan management, and skill system integration.

Template: `.ctoc/templates/CLAUDE.md.template`
Generator: `lib/init-project.js`

---

## Self-Improvement

CTOC improves itself. When implementing features:
- WebSearch authoritative sources for current best practices before updating profiles
- All profile changes need validation (`ctoc validate`)
- Document changes in commit messages with version
- Never break existing installations (backward compatible)

**STOP — Do NOT self-improve when:**
- **Implementing a user feature** — stay focused on the task, do not opportunistically "improve" unrelated profiles
- **The improvement is speculative** — must be based on confirmed patterns across 2+ projects
- **It would modify hook behavior or gate logic** — requires explicit user approval (these are safety-critical paths)

### Processing Community Skill Issues (`ctoc process-issues`)

1. Read issues from `/tmp/ctoc-issues-to-process.json` (or `$env:TEMP` on Windows)
2. For each issue: extract skill name, type, suggested improvement, and sources
3. Locate skill file (`skills/languages/{name}.md` or `skills/frameworks/{category}/{name}.md`)
4. Apply improvements, validating against authoritative sources via WebSearch
5. Commit: `skill: update {skill-name} (fixes #{issue-number})`
6. Create PR linking all processed issues
