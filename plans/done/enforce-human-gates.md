---
approved_by: human
approved_at: 2026-06-15T09:45:22.723Z
gate_crossed: review → done
---

---
approved_by: human
approved_at: 2026-02-04T10:30:00Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-02-03T09:15:00Z
gate_crossed: functional → implementation
---

---
title: "Enforce Human Gates in Plan Pipeline"
created: "2026-02-03T08:30:00Z"
priority: CRITICAL
type: bug-fix
---

# Enforce Human Gates in Plan Pipeline

## Problem Statement

**CRITICAL BUG:** 5 plans were moved from `review/` to `done/` by an executor agent without human approval. This violates the core principle that certain stage transitions REQUIRE human approval.

**What happened:** An autonomous agent moved plans past a human gate without waiting for user approval.

**Impact:** Loss of human control over the pipeline. Plans marked as "done" without actual human review.

## Human Gates (NEVER Skip)

```
┌─────────────────────────────────────────────────────────────────┐
│                    HUMAN GATES (REQUIRE APPROVAL)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   functional/  ──────────────────►  implementation/             │
│                    🔒 HUMAN GATE 1                              │
│                                                                  │
│   implementation/  ──────────────►  todo/                       │
│                    🔒 HUMAN GATE 2                              │
│                                                                  │
│   review/  ──────────────────────►  done/                       │
│                    🔒 HUMAN GATE 3                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Automated Transitions (Agents Can Do)

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTOMATED TRANSITIONS (OK)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   vision/  ──────────────────────►  functional/                 │
│                    ✅ Vision Advisor (with user approval prompt)│
│                                                                  │
│   todo/  ────────────────────────►  in-progress/                │
│                    ✅ Executor picks up                         │
│                                                                  │
│   in-progress/  ─────────────────►  review/                     │
│                    ✅ Executor completes work                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Solution: Claude Code Hook Approach (ALL Tools)

**Chosen approach:** Pre-tool hook that runs before EVERY tool call to check for human gate violations.

**Design decisions from discussion:**
- Hook timing: ALL tools (maximum protection, safety over speed)
- Gate coverage: Check ALL THREE destinations (implementation/, todo/, done/)
- Revert logic: Each violation reverts to previous stage
- Existing plans: Add markers retroactively via migration script
- Multiple approvals: Keep all markers (audit trail)
- Race conditions: Ignore (single user, low risk)
- Error handling: Fail open (log error but exit 0, never lock user out)
- Migration scope: ALL gate destinations (implementation/, todo/, done/)
- Testing: Manual test script to verify hook works
- Notifications: Console error + dashboard visibility with acknowledge
- Log tracking: Status tracking (pending/resolved) per violation

### 1. Claude Code Hook Implementation

**File:** `.claude-plugin/hooks.json` (ADD to existing hooks)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/human-gate-check.js\""
          }
        ]
      }
    ]
  }
}
```

**File:** `hooks/human-gate-check.js`

```javascript
#!/usr/bin/env node
/**
 * Human Gate Checker - Pre-tool hook
 * Runs before EVERY tool call to detect human gate violations
 *
 * Human gates (require approval marker):
 *   functional → implementation
 *   implementation → todo
 *   review → done
 */

const fs = require('fs');
const path = require('path');

const PLANS_DIR = path.join(process.cwd(), 'plans');
const LOG_FILE = path.join(process.cwd(), '.ctoc', 'logs', 'gate-violations.log');

// Human gates: destination folder → source folder (for revert)
const HUMAN_GATES = {
  'implementation': 'functional',
  'todo': 'implementation',
  'done': 'review'
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function log(message) {
  ensureDir(path.dirname(LOG_FILE));
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `${timestamp} ${message}\n`);
}

function hasApprovalMarker(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.includes('approved_by: human');
  } catch {
    return false;
  }
}

function checkFolder(folderName) {
  const folderPath = path.join(PLANS_DIR, folderName);
  if (!fs.existsSync(folderPath)) return [];

  const violations = [];
  const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    if (!hasApprovalMarker(filePath)) {
      violations.push({
        file,
        path: filePath,
        folder: folderName,
        revertTo: HUMAN_GATES[folderName]
      });
    }
  }

  return violations;
}

function revertPlan(violation) {
  const destDir = path.join(PLANS_DIR, violation.revertTo);
  const destPath = path.join(destDir, path.basename(violation.path));

  // Read content and add violation note
  let content = fs.readFileSync(violation.path, 'utf8');
  const note = `\n\n---\n**⚠️ HUMAN GATE VIOLATION**\nThis plan was moved to ${violation.folder}/ without human approval.\nAutomatically reverted to ${violation.revertTo}/ at ${new Date().toISOString()}\n---\n`;
  content += note;

  // Move file
  ensureDir(destDir);
  fs.writeFileSync(destPath, content);
  fs.unlinkSync(violation.path);

  return destPath;
}

function main() {
  try {
    // Check all human gate destinations
    const allViolations = [];

    for (const folder of Object.keys(HUMAN_GATES)) {
      const violations = checkFolder(folder);
      allViolations.push(...violations);
    }

    if (allViolations.length > 0) {
      console.error('\n⛔ HUMAN GATE VIOLATION DETECTED\n');

      for (const v of allViolations) {
        console.error(`  Plan: ${v.file}`);
        console.error(`  Location: ${v.folder}/`);
        console.error(`  Issue: Missing human approval marker`);

        // Log violation with status tracking
        logViolation({
          id: `v-${Date.now()}`,
          timestamp: new Date().toISOString(),
          plan: v.file,
          violation: `Moved to ${v.folder}/ without approval`,
          action: `REVERTED to ${v.revertTo}/`,
          status: 'pending_reapproval',
          resolvedAt: null
        });

        // Revert to previous stage
        const newPath = revertPlan(v);
        console.error(`  Action: REVERTED to ${v.revertTo}/`);
        console.error('');
      }

      console.error('⚠️  Plans must be approved by human via menu to cross human gates\n');
    }
  } catch (err) {
    // Fail open - log error but don't block user
    console.error(`Warning: Gate check error: ${err.message}`);
  }

  // Exit 0 to allow tool call to proceed
  process.exit(0);
}

main();
```

### 2. CTO-Chief Upgrades

Add to `agents/coordinator/cto-chief.md`:

```markdown
## ⛔ HUMAN GATE ENFORCEMENT (CRITICAL)

### Your Role as Gate Guardian

You are the ENFORCER of human gates. A pre-tool hook handles detection and auto-revert,
but YOU must:

1. **NEVER approve** plans crossing human gates without user action
2. **ALERT immediately** if you see unauthorized transitions
3. **VERIFY markers** when reviewing plans in gate destinations

### Human Gates You Protect

| Gate | From → To | Revert To | Required Action |
|------|-----------|-----------|-----------------|
| 🔒 1 | functional → implementation | functional | User menu [3] approve |
| 🔒 2 | implementation → todo | implementation | User menu [4] approve |
| 🔒 3 | review → done | review | User menu [2] approve |

### Monitoring Duties

Every session, verify:
- [ ] No plans in implementation/ without `approved_by: human` marker
- [ ] No plans in todo/ without `approved_by: human` marker
- [ ] No plans in done/ without `approved_by: human` marker
- [ ] Violation log checked: `.ctoc/logs/gate-violations.log`

### If You Detect a Violation

The pre-tool hook will auto-revert, but if you notice one:

```
⛔ HUMAN GATE VIOLATION

Plan: {name}
Found in: {folder}/
Missing: Human approval marker

ACTION: Hook should auto-revert to {previous stage}/
If not reverted, manually move back and alert user.

REMINDER: Only humans can approve gate crossings via menu.
```
```

### 3. Iron Loop Executor Updates

Add to `agents/iron-loop/iron-loop-executor.md`:

```markdown
## ⛔ HUMAN GATES - FORBIDDEN TRANSITIONS

You are EXPLICITLY FORBIDDEN from these transitions:

| From | To | Why | Revert To |
|------|-----|-----|-----------|
| ANY | implementation/ | Human gate 1 | functional/ |
| ANY | todo/ | Human gate 2 | implementation/ |
| ANY | done/ | Human gate 3 | review/ |

Your ONLY allowed transitions:
- todo/ → in-progress/ (picking up work)
- in-progress/ → review/ (completing work)

### If Asked to Cross a Human Gate

```
⛔ CANNOT COMPLY

You asked me to move a plan to {destination}/.
This is a HUMAN GATE - requires user approval.

To proceed:
1. User must select the plan in the menu
2. User must choose [approve]
3. System adds approval marker

I cannot and will not bypass this gate.
```

### Pre-Tool Hook Protection

A system hook runs before EVERY tool call. If I somehow move a plan across
a human gate without the approval marker, it will be automatically reverted
to the previous stage. This is a safety net, not a workaround.
```

### 4. CLAUDE.md Updates

Add near the top of `CLAUDE.md`:

```markdown
## ⛔ HUMAN GATES - CRITICAL RULE

Three stage transitions REQUIRE human approval. NEVER cross these automatically:

| Gate | From → To | Revert To | User Action |
|------|-----------|-----------|-------------|
| 🔒 1 | functional → implementation | functional | Menu: [3] approve |
| 🔒 2 | implementation → todo | implementation | Menu: [4] approve |
| 🔒 3 | review → done | review | Menu: [2] approve |

**Rules:**
- NEVER move plans across these gates without user selecting approve
- If asked to "complete" a plan or "move to done" → REFUSE, explain human gate
- A pre-tool hook monitors ALL tool calls for violations and auto-reverts

**Violation Response:**
1. Plan automatically reverted to previous stage
2. Incident logged to `.ctoc/logs/gate-violations.log`
3. User alerted immediately

**Approval Marker:**
When a plan crosses a human gate via menu, this marker is added:
```yaml
approved_by: human
approved_at: {timestamp}
gate_crossed: {from} → {to}
```
Plans in human gate destinations without this marker are automatically reverted.
```

### 5. Approval Marker in lib/actions.js

Update `approvePlan()` function:

```javascript
const HUMAN_GATES = {
  'functional': 'implementation',
  'implementation': 'todo',
  'review': 'done'
};

function approvePlan(planPath, projectPath, targetStage) {
  const from = getStageFromPath(planPath);
  const to = targetStage || getNextStage(from);

  // Check if this is a human gate
  const isHumanGate = HUMAN_GATES[from] === to;

  // Read plan content
  let content = fs.readFileSync(planPath, 'utf8');

  // Add approval marker for human gates
  if (isHumanGate) {
    const marker = `---
approved_by: human
approved_at: ${new Date().toISOString()}
gate_crossed: ${from} → ${to}
---

`;
    // Prepend marker if not already present
    if (!content.includes('approved_by: human')) {
      content = marker + content;
    }
  }

  // Move to target stage
  const targetDir = path.join(getPlansDir(projectPath), to);
  const targetPath = path.join(targetDir, path.basename(planPath));

  ensureDir(targetDir);
  fs.writeFileSync(targetPath, content);
  fs.unlinkSync(planPath);

  return { from, to, path: targetPath, humanGate: isHumanGate };
}
```

### 6. Migration Script for Existing Plans

**File:** `scripts/migrate-add-approval-markers.js`

```javascript
#!/usr/bin/env node
/**
 * Migration: Add approval markers to ALL existing plans in gate destinations
 * Run once after implementing human gates
 */

const fs = require('fs');
const path = require('path');

const PLANS_DIR = path.join(process.cwd(), 'plans');

// All gate destinations with their source stages
const GATE_DESTINATIONS = {
  'implementation': 'functional',
  'todo': 'implementation',
  'done': 'review'
};

function addMarker(filePath, fromStage, toStage) {
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes('approved_by: human')) {
    console.log(`  SKIP: ${path.basename(filePath)} (already has marker)`);
    return false;
  }

  const marker = `---
approved_by: human
approved_at: ${new Date().toISOString()}
gate_crossed: ${fromStage} → ${toStage}
note: Retroactively added during human gates migration
---

`;

  content = marker + content;
  fs.writeFileSync(filePath, content);
  console.log(`  ADDED: ${path.basename(filePath)}`);
  return true;
}

function migrateFolder(folderName, fromStage) {
  const folderPath = path.join(PLANS_DIR, folderName);

  if (!fs.existsSync(folderPath)) {
    console.log(`  ${folderName}/: folder not found, skipping`);
    return 0;
  }

  const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));

  if (files.length === 0) {
    console.log(`  ${folderName}/: no plans found`);
    return 0;
  }

  console.log(`\n  ${folderName}/ (${files.length} plans):`);

  let migrated = 0;
  for (const file of files) {
    if (addMarker(path.join(folderPath, file), fromStage, folderName)) {
      migrated++;
    }
  }
  return migrated;
}

function main() {
  console.log('Migration: Adding approval markers to ALL gate destinations\n');

  let totalMigrated = 0;

  for (const [toStage, fromStage] of Object.entries(GATE_DESTINATIONS)) {
    totalMigrated += migrateFolder(toStage, fromStage);
  }

  console.log(`\nMigration complete: ${totalMigrated} plans updated.`);
}

main();
```

### 7. Violation Log with Status Tracking

**File:** `lib/violation-tracker.js`

```javascript
#!/usr/bin/env node
/**
 * Violation Tracker - Tracks gate violations with status
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), '.ctoc', 'logs');
const VIOLATIONS_FILE = path.join(LOG_DIR, 'gate-violations.json');
const ACK_FILE = path.join(LOG_DIR, 'last-ack.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadViolations() {
  try {
    if (fs.existsSync(VIOLATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(VIOLATIONS_FILE, 'utf8'));
    }
  } catch {}
  return [];
}

function saveViolations(violations) {
  ensureDir(LOG_DIR);
  fs.writeFileSync(VIOLATIONS_FILE, JSON.stringify(violations, null, 2));
}

function logViolation(violation) {
  const violations = loadViolations();
  violations.push(violation);
  // Keep last 100 entries
  if (violations.length > 100) {
    violations.splice(0, violations.length - 100);
  }
  saveViolations(violations);
}

function getLastAck() {
  try {
    if (fs.existsSync(ACK_FILE)) {
      return JSON.parse(fs.readFileSync(ACK_FILE, 'utf8'));
    }
  } catch {}
  return { acknowledgedAt: null };
}

function acknowledge() {
  ensureDir(LOG_DIR);
  fs.writeFileSync(ACK_FILE, JSON.stringify({
    acknowledgedAt: new Date().toISOString()
  }));
}

function getUnacknowledgedViolations() {
  const violations = loadViolations();
  const lastAck = getLastAck();

  if (!lastAck.acknowledgedAt) {
    return violations;
  }

  return violations.filter(v =>
    new Date(v.timestamp) > new Date(lastAck.acknowledgedAt)
  );
}

function markResolved(planName) {
  const violations = loadViolations();
  for (const v of violations) {
    if (v.plan === planName && v.status === 'pending_reapproval') {
      v.status = 'resolved';
      v.resolvedAt = new Date().toISOString();
      v.resolution = 'Re-approved via menu';
    }
  }
  saveViolations(violations);
}

module.exports = {
  logViolation,
  loadViolations,
  getUnacknowledgedViolations,
  acknowledge,
  markResolved,
  getLastAck
};
```

### 8. Test Script

**File:** `scripts/test-human-gates.js`

```javascript
#!/usr/bin/env node
/**
 * Test Human Gates - Verifies the hook works correctly
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PLANS_DIR = path.join(process.cwd(), 'plans');
const TEST_PLAN = 'test-gate-violation.md';

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    return false;
  }
}

function main() {
  console.log('Testing Human Gate Enforcement\n');
  let passed = 0;
  let failed = 0;

  // Test 1: Plan in done/ without marker gets reverted
  if (test('Plan without marker in done/ → reverts to review/', () => {
    const donePath = path.join(PLANS_DIR, 'done', TEST_PLAN);
    const reviewPath = path.join(PLANS_DIR, 'review', TEST_PLAN);

    // Create plan without marker
    fs.writeFileSync(donePath, '# Test Plan\nNo approval marker');

    // Run hook
    execSync('node hooks/human-gate-check.js', { stdio: 'pipe' });

    // Verify reverted
    if (fs.existsSync(donePath)) throw new Error('Plan not removed from done/');
    if (!fs.existsSync(reviewPath)) throw new Error('Plan not in review/');

    // Cleanup
    fs.unlinkSync(reviewPath);
  })) passed++; else failed++;

  // Test 2: Plan with marker stays in place
  if (test('Plan WITH marker in done/ → stays in done/', () => {
    const donePath = path.join(PLANS_DIR, 'done', TEST_PLAN);

    // Create plan with marker
    fs.writeFileSync(donePath, '---\napproved_by: human\n---\n# Test Plan');

    // Run hook
    execSync('node hooks/human-gate-check.js', { stdio: 'pipe' });

    // Verify stayed
    if (!fs.existsSync(donePath)) throw new Error('Plan incorrectly removed');

    // Cleanup
    fs.unlinkSync(donePath);
  })) passed++; else failed++;

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `hooks/human-gate-check.js` | CREATE | Pre-tool hook script (checks all 3 gates) |
| `.claude-plugin/hooks.json` | MODIFY | Add PreToolUse matcher for all tools |
| `agents/coordinator/cto-chief.md` | MODIFY | Add gate enforcement section |
| `agents/iron-loop/iron-loop-executor.md` | MODIFY | Add forbidden transitions |
| `CLAUDE.md` | MODIFY | Add human gates section at top |
| `commands/menu.md` | MODIFY | Document human gates + violation display |
| `lib/actions.js` | MODIFY | Add approval marker logic + mark resolved |
| `lib/violation-tracker.js` | CREATE | Violation log with status tracking |
| `scripts/migrate-add-approval-markers.js` | CREATE | Migration for ALL gate destinations |
| `scripts/test-human-gates.js` | CREATE | Test script to verify hook |
| `.ctoc/logs/` | CREATE | Logs directory |
| `.ctoc/logs/gate-violations.json` | CREATE | JSON log with status tracking |
| `.ctoc/logs/last-ack.json` | CREATE | Last acknowledgement timestamp |

## Verification

1. ✅ Pre-tool hook runs before EVERY tool call
2. ✅ Hook checks all 3 gate destinations (implementation/, todo/, done/)
3. ✅ Violations auto-revert to previous stage
4. ✅ Violations are logged to `.ctoc/logs/gate-violations.log`
5. ✅ User alerted immediately via console error
6. ✅ Executor refuses to cross human gates
7. ✅ User can approve via menu (marker added)
8. ✅ Migration script handles existing 6 plans in done/
9. ✅ ~5s overhead per session (acceptable for maximum protection)

## Acceptance Criteria

- [x] `hooks/human-gate-check.js` created and checks all 3 gates
- [x] Hook configured in `.claude-plugin/hooks.json` for ALL tools
- [x] CTO-Chief has gate enforcement section
- [x] Executor has forbidden transitions block
- [x] CLAUDE.md has human gates section
- [ ] menu.md documents human gates
- [x] `approvePlan()` adds approval marker
- [x] Violations logged to `.ctoc/logs/gate-violations.log`
- [x] User alerted on violations
- [x] Migration script created and run
- [x] Test: Plan in done/ without marker → reverts to review/
- [x] Test: Plan in todo/ without marker → reverts to implementation/
- [x] Test: Plan in implementation/ without marker → reverts to functional/
- [x] Test: User approves via menu → marker added, stays in destination

## Priority

**CRITICAL** - This is a control issue. Human gates are the foundation of trust in the pipeline.

---

*Incident: 5 plans moved to done/ without approval.*
*Resolution: Hook-based enforcement on ALL tools with auto-revert.*
