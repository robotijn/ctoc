---
approved_by: human
approved_at: 2026-02-04T12:00:00Z
gate_crossed: functional → implementation
---

---
title: "Enforce Iron Loop Step Labels"
created: "2026-02-03T10:15:00Z"
priority: HIGH
type: bug-fix
---

## Dependencies

**None.** This plan is independent and can be implemented immediately.

Step 13 (VERIFY) uses fallback logic: tries `ctoc quality` first, falls back to direct lint/type/test commands if quality gates aren't available yet. When `smart-quality-gate-system` ships later, Step 13 will automatically use it — no changes needed here.

# Enforce Iron Loop Step Labels

## Problem Statement

**BUG:** The Iron Loop Integrator generates custom step labels instead of enforcing the standard 9-step template. This causes:

1. **TDD skipped** — Step 7 becomes "identify coverage" instead of "write tests first"
2. **Steps merged** — Multiple IMPLEMENT steps replace REVIEW, OPTIMIZE, SECURE
3. **Tests too late** — VERIFY moved to Step 15 instead of Step 13
4. **Quality gates skipped** — REVIEW, OPTIMIZE, SECURE steps are missing entirely

**Example violation (v6.1.5):**
```
Step 7:  TEST      Identify existing coverage    ← NOT TDD!
Step 8:  QUALITY   Lint and type checks
Step 9:  IMPLEMENT Update auth.setup.ts
Step 10: IMPLEMENT Update playwright.config.ts   ← Should be REVIEW
Step 11: IMPLEMENT Update gp-selector.spec.ts    ← Should be OPTIMIZE
Step 12: IMPLEMENT Verify auth files gitignored  ← Should be SECURE
Step 13: IMPLEMENT Delete old auth file          ← Should be VERIFY
Step 14: VERIFY    Manual verification           ← Should be DOCUMENT
Step 15: VERIFY    Full test run                 ← Should be FINAL-REVIEW
```

## Correct Iron Loop Template

```
┌─────────────────────────────────────────────────────────────────┐
│                    MANDATORY STEP LABELS                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 7:  TEST         Write tests FIRST (TDD Red)              │
│                        • Create test files                      │
│                        • Test expected behavior                 │
│                        • Test error conditions                  │
│                        • Tests should FAIL initially            │
│                                                                  │
│  Step 8:  SETUP        Prepare environment (NOT quality!)       │
│                        • Install dependencies if needed         │
│                        • Check prerequisites                    │
│                        • Verify dev environment ready           │
│                        • Create directories/config if needed    │
│                                                                  │
│  Step 9:  IMPLEMENT    ALL code changes (single step!)          │
│                        • Create/modify source files             │
│                        • Add error handling                     │
│                        • Wire up integrations                   │
│                        → Multiple files = sub-items, NOT steps  │
│                                                                  │
│  Step 10: REVIEW       Self-review checkpoint (logic only)      │
│                        • Review all changes                     │
│                        • Check integration points               │
│                        • Verify error handling                  │
│                        → TDD Loop: Back to Step 7 if needed     │
│                                                                  │
│  Step 11: OPTIMIZE     Performance & simplification             │
│                        • Remove redundant operations            │
│                        • Optimize critical paths                │
│                        • Simplify complex code                  │
│                        → May change code                        │
│                                                                  │
│  Step 12: SECURE       Security vulnerability check             │
│                        • Validate inputs                        │
│                        • Check for path traversal               │
│                        • No secrets in code                     │
│                        • Safe file operations                   │
│                        → May change code                        │
│                                                                  │
│  Step 13: VERIFY       ALL quality checks (single gate!)        │
│                        • Run lint + type check                  │
│                        • Run ALL tests (TDD Green)              │
│                        • Check coverage >= 80%                  │
│                        • 0 skipped, 0 flaky tests               │
│                        → If FAIL: kickback to relevant step     │
│                                                                  │
│  Step 14: DOCUMENT     Update documentation                     │
│                        • Update relevant docs                   │
│                        • Add code comments                      │
│                        • Update CHANGELOG                       │
│                                                                  │
│  Step 15: FINAL-REVIEW Ready for human review                   │
│                        • Verify steps 7-14 complete             │
│                        • All quality checks passed              │
│                        • Manual verification if needed          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Rules

### Rule 1: Step Labels Are MANDATORY

The 9 step labels (TEST, QUALITY, IMPLEMENT, REVIEW, OPTIMIZE, SECURE, VERIFY, DOCUMENT, FINAL-REVIEW) are **not suggestions**. They define the quality process.

```
❌ WRONG:
Step 10: IMPLEMENT Update config file
Step 11: IMPLEMENT Add error handling

✅ CORRECT:
Step 9: IMPLEMENT
- [ ] Update config file
- [ ] Add error handling
Step 10: REVIEW
- [ ] Self-review config changes
- [ ] Verify error handling complete
```

### Rule 2: Step 7 is TDD (Coverage-Based)

Step 7 behavior depends on current coverage level:

```
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 7: TEST DECISION TREE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Check coverage from quality-state cache                       │
│                    │                                            │
│         ┌─────────┴─────────┐                                   │
│         ▼                   ▼                                   │
│   coverage >= 80%     coverage < 80%                            │
│         │                   │                                   │
│         ▼                   ▼                                   │
│   Skip with reason      TESTS REQUIRED                          │
│   allowed               │                                       │
│                         ├── Full test? Great                    │
│                         ├── Tiny smoke test? Also great         │
│                         ├── 1-line assertion? Still counts      │
│                         │                                       │
│                         └── Skip? STRONG justification          │
│                               + human must acknowledge          │
│                                                                  │
│   PHILOSOPHY: "A 5ms smoke test is infinitely better than       │
│   no test. Tiny tests compound into system confidence."         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Examples of tiny tests that count (all < 10ms):**

```javascript
// Verifies function exists and doesn't throw
test('processConfig returns object', () => {
  expect(typeof processConfig({})).toBe('object');
});

// Smoke test for CLI
test('menu.js runs without error', () => {
  expect(() => require('./menu')).not.toThrow();
});

// Sanity check
test('version file exists', () => {
  expect(fs.existsSync('VERSION')).toBe(true);
});
```

```
❌ WRONG:
Step 7: TEST
- [ ] Identify existing test coverage
- [ ] Review test patterns

✅ CORRECT (coverage >= 80%):
Step 7: TEST
- [ ] Existing tests cover this change
- [ ] Reason: Config-only change, no new logic
- [ ] Verified: tests/config.test.js covers config parsing

✅ CORRECT (coverage < 80%):
Step 7: TEST (TDD Red)
- [ ] Create tests/feature.test.js
- [ ] Test function returns expected output
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)
```

### Rule 3: Step 8 is SETUP (Not QUALITY)

Quality checks before code exists are pointless. Step 8 is now SETUP.

```
┌─────────────────────────────────────────────────────────────────┐
│                    UPDATED STEP 8                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  OLD (wrong):                                                   │
│  Step 8: QUALITY - Run lint, type check                         │
│          ↑ No code exists yet! Pointless.                       │
│                                                                  │
│  NEW (correct):                                                 │
│  Step 8: PREPARE - Prepare environment                            │
│          - Install dependencies if needed                       │
│          - Check prerequisites                                  │
│          - Verify dev environment ready                         │
│          - Create directories/config if needed                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Rule 4: All Quality Checks in Step 13 (VERIFY)

OPTIMIZE (Step 11) and SECURE (Step 12) may change code. Quality checks must come AFTER all code changes.

```
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 13: VERIFY (Quality Gate)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 13: VERIFY                                                │
│    - [ ] Run lint (eslint, ruff, golangci-lint)                 │
│    - [ ] Run type check (tsc, mypy, go vet)                     │
│    - [ ] Run ALL tests                                          │
│    - [ ] Check coverage >= 80%                                  │
│    - [ ] 0 skipped tests                                        │
│    - [ ] 0 flaky tests                                          │
│                                                                  │
│  If ANY check fails → KICKBACK                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────┬──────────────────────────────┐
│ If Step 13 fails...                  │ Kickback to...               │
├──────────────────────────────────────┼──────────────────────────────┤
│ Lint errors                          │ Step 9 (IMPLEMENT)           │
│ Type errors                          │ Step 9 (IMPLEMENT)           │
│ Tests fail                           │ Step 9 (IMPLEMENT)           │
│ Security issue found                 │ Step 12 (SECURE)             │
│ Performance regression               │ Step 11 (OPTIMIZE)           │
└──────────────────────────────────────┴──────────────────────────────┘
```

### Rule 5: Step 15 and the Human Gate

Step 15 (FINAL-REVIEW) is the agent's self-check. The HUMAN GATE comes after.

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENVIRONMENT FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CTOC Stage        Environment       Who                        │
│  ──────────────    ───────────       ───────────────────────    │
│  in-progress/      DEV SERVER        Agent (Steps 7-15)         │
│                                                                  │
│  review/           STAGING SERVER    QA / Technical review      │
│                                                                  │
│  done/             PRODUCTION        Live system                │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  FLOW:                                                          │
│                                                                  │
│  Steps 7-12 complete                                            │
│       ↓                                                         │
│  Step 13: VERIFY           ⛔ QUALITY GATE (hard block)         │
│                            ALL must pass:                       │
│                            • Lint ✓                             │
│                            • Type check ✓                       │
│                            • ALL tests pass ✓                   │
│                            • Coverage >= 80% ✓                  │
│                            • 0 skipped tests ✓                  │
│                            • 0 flaky tests ✓                    │
│                            If ANY fails → kickback, NO staging  │
│       ↓                                                         │
│  Steps 14-15 complete                                           │
│       ↓                                                         │
│  in-progress/ → review/    (auto ONLY if Step 13 passed)        │
│       ↓                                                         │
│  STAGING: Technical QA     No broken code here - guaranteed     │
│       ↓                                                         │
│  review/ → done/           🔒 HUMAN GATE                        │
│                            Product Owner / Business approves    │
│                            "Does this meet requirements?"       │
│       ↓                                                         │
│  Deploy to PRODUCTION                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**The human gate is for business approval, not technical review.**

### Rule 6: IMPLEMENT is ONE Step with Sub-items

All code changes go in Step 9. Multiple files = multiple sub-items, not multiple steps.

```
❌ WRONG:
Step 9:  IMPLEMENT Update file A
Step 10: IMPLEMENT Update file B
Step 11: IMPLEMENT Update file C

✅ CORRECT:
Step 9: IMPLEMENT
- [ ] Update file A with new function
- [ ] Update file B with integration
- [ ] Update file C with error handling
```

### Rule 4: VERIFY Runs Tests (Step 13)

Step 13 VERIFY must run automated tests. Manual verification is part of Step 15.

```
❌ WRONG:
Step 13: IMPLEMENT Delete old file
Step 14: VERIFY Manual verification
Step 15: VERIFY Full test run

✅ CORRECT:
Step 13: VERIFY
- [ ] Run all tests: npm test
- [ ] All tests pass (TDD Green)
Step 14: DOCUMENT
- [ ] Update docs
Step 15: FINAL-REVIEW
- [ ] Manual verification if needed
- [ ] Ready for human review
```

### Rule 5: Order Matters

```
TEST → QUALITY → IMPLEMENT → REVIEW → OPTIMIZE → SECURE → VERIFY → DOCUMENT → FINAL-REVIEW
  7       8          9         10        11        12       13        14          15

The order ensures:
• Tests written BEFORE code (TDD)
• Quality checks BEFORE and AFTER implementation
• Security check BEFORE verification
• Automated tests BEFORE manual review
• Documentation AFTER verification (document what works)
```

## Solution

### 1. Update iron-loop-integrator.md

Add strict enforcement section:

```markdown
## MANDATORY Step Labels (DO NOT MODIFY)

You MUST use these exact step labels in this exact order:

| Step | Label | Purpose | NEVER Replace With |
|------|-------|---------|-------------------|
| 7 | TEST | Write tests first (TDD Red) | "Identify coverage" |
| 8 | QUALITY | Lint, format, type-check | - |
| 9 | IMPLEMENT | ALL code changes | Multiple IMPLEMENT steps |
| 10 | REVIEW | Self-review | IMPLEMENT |
| 11 | OPTIMIZE | Performance | IMPLEMENT |
| 12 | SECURE | Security check | IMPLEMENT |
| 13 | VERIFY | Run ALL tests | Manual verification |
| 14 | DOCUMENT | Update docs | VERIFY |
| 15 | FINAL-REVIEW | Ready for human | VERIFY |

### Anti-Patterns to Avoid

❌ Multiple IMPLEMENT steps (merge into one with sub-items)
❌ "Identify coverage" in TEST step (must WRITE tests)
❌ VERIFY after DOCUMENT (VERIFY is Step 13)
❌ Manual verification in VERIFY (belongs in FINAL-REVIEW)
❌ Skipping REVIEW, OPTIMIZE, or SECURE (all are mandatory)
```

### 2. Update iron-loop-critic.md

Add validation check for step labels:

```markdown
## Step Label Validation (BLOCKING)

Before scoring other dimensions, verify:

1. All 9 steps present (7-15)
2. Correct labels in correct order
3. Step 7 includes writing NEW tests
4. Only ONE IMPLEMENT step (Step 9)
5. Step 13 is automated VERIFY (not manual)

If ANY validation fails → Score 0/5 on Completeness

### Label Validation Rule

Labels must START WITH the canonical label. Optional suffix allowed for context.

| Step | Must start with | Examples |
|------|-----------------|----------|
| 7 | TEST | `TEST`, `TEST (TDD Red)` |
| 8 | PREPARE | `SETUP`, `SETUP (dependencies)` |
| 9 | IMPLEMENT | `IMPLEMENT`, `IMPLEMENT (all files)` |
| 10 | REVIEW | `REVIEW`, `REVIEW (logic only)` |
| 11 | OPTIMIZE | `OPTIMIZE`, `OPTIMIZE (if needed)` |
| 12 | SECURE | `SECURE`, `SECURE (input validation)` |
| 13 | VERIFY | `VERIFY`, `VERIFY (all checks)` |
| 14 | DOCUMENT | `DOCUMENT`, `DOCUMENT (API docs)` |
| 15 | FINAL-REVIEW | `FINAL-REVIEW`, `FINAL-REVIEW (ready)` |

❌ Invalid: `TDD TEST`, `TESTING`, `CHECK`, `CODE`
```

### 3. Update IRON_LOOP.md

Add prominent warning about step labels.

### 4. Auto-fix Existing Plans + Validation

Existing plans in todo/ may have wrong labels. Auto-fix them before execution.

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTO-FIX ALGORITHM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Find all steps labeled "IMPLEMENT" after Step 9             │
│     → Merge their content as sub-items under Step 9             │
│                                                                  │
│  2. Relabel steps 10-15 to correct labels:                      │
│     10 → REVIEW                                                 │
│     11 → OPTIMIZE                                               │
│     12 → SECURE                                                 │
│     13 → VERIFY                                                 │
│     14 → DOCUMENT                                               │
│     15 → FINAL-REVIEW                                           │
│                                                                  │
│  3. If "QUALITY" at Step 8 → rename to "SETUP"                  │
│                                                                  │
│  4. Run Critic to validate:                                     │
│     - All 9 labels present?                                     │
│     - Correct order?                                            │
│     - Content makes sense in new location?                      │
│                                                                  │
│  5. If Critic passes → execute                                  │
│     If Critic fails → flag for manual review or regenerate      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5. Add Pre-execution Validator

Create a hook or script that validates step labels before execution begins.

### 6. Fallback Integration with Smart Quality Gates

When Step 13 (VERIFY) runs, integrate with the Smart Quality Gate System for comprehensive checks:

```
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 13 INTEGRATION                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 13: VERIFY                                                │
│     │                                                           │
│     ├── Primary: `ctoc quality` command (from gates plan)       │
│     │   • Tier 1: Lint, type check, tests (BLOCKING)           │
│     │   • Coverage >= 80%                                       │
│     │   • 0 skipped, 0 flaky tests                             │
│     │                                                           │
│     └── Fallback: If `ctoc quality` not available              │
│         • Run lint directly (eslint/ruff/golangci-lint)        │
│         • Run type check directly (tsc/mypy/go vet)            │
│         • Run tests directly (npm test/pytest/go test)         │
│         • Parse output for pass/fail                           │
│                                                                  │
│  WHY FALLBACK?                                                  │
│  • Gates plan may not be implemented yet                        │
│  • External projects may not have CTOC                         │
│  • Graceful degradation without losing enforcement             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation:**

```javascript
// lib/step-13-verify.js
async function runVerify() {
  // Try Smart Quality Gate first
  try {
    const result = await exec('ctoc quality --tier=1');
    return parseGateResult(result);
  } catch (e) {
    // Fallback to direct commands
    console.log('CTOC quality not available, using fallback checks...');
    return runFallbackChecks();
  }
}

async function runFallbackChecks() {
  const results = {
    lint: await tryCommand(['npm run lint', 'ruff check .', 'golangci-lint run']),
    types: await tryCommand(['npm run typecheck', 'mypy .', 'go vet ./...']),
    tests: await tryCommand(['npm test', 'pytest', 'go test ./...']),
  };
  return allPassed(results);
}
```

### 7. Menu Ordering Fix

Make `/ctoc:menu` the first entry in the CTOC commands list:

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMMAND ORDERING                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BEFORE (wrong order):                                          │
│  /ctoc:agent        ...                                         │
│  /ctoc:dashboard    ...                                         │
│  /ctoc:menu         ...    ← buried in the middle               │
│  /ctoc:progress     ...                                         │
│                                                                  │
│  AFTER (correct order):                                         │
│  /ctoc:menu         Main CTOC dashboard (recommended entry)     │
│  /ctoc:agent        ...                                         │
│  /ctoc:dashboard    ...                                         │
│  /ctoc:progress     ...                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**File to modify:** `.claude-plugin/plugin.json`

Update the `commands` array to put `menu` first:

```json
{
  "commands": [
    {
      "name": "menu",
      "description": "Main CTOC dashboard - start here"
    },
    {
      "name": "agent",
      "description": "..."
    }
    // ... rest of commands
  ]
}
```

## Files to Modify

### Core Methodology

| File | Change |
|------|--------|
| `IRON_LOOP.md` | Add step label enforcement section with examples |

### Iron Loop Agents

| File | Change |
|------|--------|
| `agents/iron-loop/iron-loop-integrator.md` | Add mandatory labels section, anti-patterns |
| `agents/iron-loop/iron-loop-critic.md` | Add step label validation (blocking check) |
| `agents/iron-loop/iron-loop-executor.md` | Add step label verification before execution |

### Implementation Agents (Steps 7-15)

| File | Change |
|------|--------|
| `agents/implementation/test-maker.md` | Clarify: WRITE tests, not just identify |
| `agents/implementation/quality-checker.md` | No change needed |
| `agents/implementation/implementer.md` | Clarify: ALL code in Step 9 |
| `agents/implementation/self-reviewer.md` | Clarify: Step 10 is review, not implement |
| `agents/implementation/optimizer.md` | Clarify: Step 11 is optimize, not implement |
| `agents/implementation/security-scanner.md` | Clarify: Step 12 is secure, not implement |
| `agents/implementation/verifier.md` | Clarify: Step 13 runs automated tests |
| `agents/implementation/documenter.md` | No change needed |
| `agents/implementation/implementation-reviewer.md` | Add: Manual verification in Step 15 |

### Coordinator

| File | Change |
|------|--------|
| `agents/coordinator/cto-chief.md` | Add step label enforcement to monitoring |

### Validation

| File | Change |
|------|--------|
| `lib/plan-validator.js` | CREATE: Validate step labels programmatically |
| `hooks/validate-plan-steps.js` | CREATE: Pre-execution hook to validate |

### Quality Gate Integration

| File | Change |
|------|--------|
| `lib/step-13-verify.js` | CREATE: Step 13 executor with fallback logic |

### Menu Ordering

| File | Change |
|------|--------|
| `.claude-plugin/plugin.json` | MODIFY: Reorder commands array, `menu` first |

### Total: 17 files (14 modify, 3 create)

## Rule 6: Zero Tolerance for Skipped and Flaky Tests

```
┌─────────────────────────────────────────────────────────────────┐
│                    TEST QUALITY ENFORCEMENT                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SKIPPED TESTS: 0 allowed                                       │
│  ─────────────────────────                                      │
│  Why? Skipped tests = uncertainty. You don't know if they pass. │
│                                                                  │
│  If a test can't run:                                           │
│    → Fix it (make it runnable)                                  │
│    → Delete it (if obsolete)                                    │
│    → NEVER skip it                                              │
│                                                                  │
│  Exception: Platform-specific skips with explicit reason        │
│    test.skip(os !== 'linux', 'Linux-only feature')              │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  FLAKY TESTS: 0 allowed                                         │
│  ─────────────────────────                                      │
│  Why? Flaky tests erode trust. If it fails randomly, fix it.    │
│                                                                  │
│  If a test is flaky:                                            │
│    → Fix the root cause (timing, async, shared state)           │
│    → Delete it (if unfixable and low value)                     │
│    → NEVER mark as "pre-existing" and ignore                    │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  CTO-CHIEF ENFORCEMENT:                                         │
│                                                                  │
│  ⛔ STEP 13 BLOCKED                                              │
│                                                                  │
│  Test results show:                                             │
│    • 45 skipped tests (allowed: 0)                              │
│    • 7 flaky tests (allowed: 0)                                 │
│                                                                  │
│  Before proceeding:                                              │
│    1. Fix or delete ALL skipped tests                           │
│    2. Fix or delete ALL flaky tests                             │
│                                                                  │
│  No exceptions. No "pre-existing" excuses.                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Files to Modify (Additional)

| File | Change |
|------|--------|
| `agents/coordinator/cto-chief.md` | Add zero-tolerance enforcement for skipped/flaky |
| `agents/testing/runners/unit-test-runner.md` | Add blocking rule for skipped tests |
| `agents/testing/runners/e2e-test-runner.md` | Add blocking rule for flaky tests |

## Acceptance Criteria

### Step Label Enforcement
- [ ] Integrator always generates exact 9 step labels
- [ ] Step 7 always says "Write tests" not "identify coverage"
- [ ] Only ONE IMPLEMENT step (Step 9) with sub-items
- [ ] Step 13 is automated VERIFY (test run)
- [ ] Step 15 is FINAL-REVIEW (includes manual verification)
- [ ] Critic rejects plans with wrong step labels
- [ ] Existing plans in todo/ validated before execution

### Quality Gate Integration
- [ ] Step 13 uses `ctoc quality` when available
- [ ] Fallback to direct lint/type/test commands when gates not available
- [ ] 0 skipped tests enforced
- [ ] 0 flaky tests enforced

### Menu Ordering
- [ ] `/ctoc:menu` is first command in plugin.json
- [ ] Commands list displays menu at top

## Test Cases

### Test 1: Multiple IMPLEMENT steps → REJECTED

```
Input plan with:
  Step 9: IMPLEMENT file A
  Step 10: IMPLEMENT file B

Expected: Critic scores 0/5, requires merge into single Step 9
```

### Test 2: Missing TDD in Step 7 → REJECTED

```
Input plan with:
  Step 7: TEST - Identify existing coverage

Expected: Critic scores 0/5, requires "Write tests first"
```

### Test 3: VERIFY after DOCUMENT → REJECTED

```
Input plan with:
  Step 14: VERIFY Run tests
  Step 15: DOCUMENT Update docs

Expected: Critic scores 0/5, requires correct order
```

---

*"The Iron Loop is not a suggestion. It's a quality guarantee."*
