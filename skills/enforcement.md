# Iron Loop Enforcement Rules

This document defines the gate rules enforced by CTOC hooks.

## Enforcement Layers

### Layer 1: Hook Blocking
PreToolUse hooks intercept Edit/Write/Bash operations and block them based on Iron Loop state.

### Layer 2: Cryptographic Signing
State files are signed with HMAC-SHA256. Tampering is detected and blocked.

### Layer 3: Gate Approvals
Gates require explicit user confirmation, recorded with timestamps and plan hashes.

## Edit/Write Gate Rules

**Minimum Step**: 7 (TEST)

### Blocked When:
1. No feature context (no `/ctoc start`)
2. Current step < 7
3. State signature invalid (tampering)
4. Gate 1 AND Gate 2 not passed

### Allowed When:
1. File is whitelisted
2. Current step >= 7
3. Both gates passed (even if step < 7)

### Whitelist
These files are always editable:
- `.gitignore`
- `.gitattributes`
- `.ctoc/**` (CTOC internal files)
- `.local/**` (local session state)
- `plans/**/*.md` (plan documents)

## Bash Gate Rules

### Write Commands Blocked When:
Same rules as Edit/Write gate

### Commit Commands Blocked When:
1. Current step < 14 (VERIFY)
2. No feature context
3. Gates not passed

### Write Command Patterns
These patterns are blocked before step 7:
- Output redirection: `> file`, `>> file`
- `tee` command
- `sed -i` (in-place edit)
- `awk -i inplace`
- `perl -i`
- `install`, `patch` commands
- `touch`, `dd`, `truncate`

### Always Allowed Commands
- `node`, `npm`, `npx` (build tools)
- `python`, `pip` (build tools)
- `ls`, `cat`, `find`, `grep` (read-only)
- `git status`, `git log`, `git diff` (read-only)

## Gate Approval Requirements

### Gate 1 (Functional Planning)
- User explicitly confirms functional plan
- Recorded with:
  - Timestamp
  - Plan file path
  - Plan file hash (SHA256)
- Required before step 4+

### Gate 2 (Technical Planning)
- User explicitly confirms technical plan
- Recorded with:
  - Timestamp
  - Plan file path
  - Plan file hash (SHA256)
- Required before step 7+

### Gate 3 (Commit)
- User explicitly approves commit
- Implicit in step 15 completion
- No bypass allowed

## Gate Expiration

Gate approvals expire after **24 hours** to ensure:
- Plans are reviewed fresh
- Long-running sessions re-confirm
- Stale approvals don't linger

## Tampering Detection

If state signature verification fails:
1. Operation is blocked
2. User is notified
3. State must be reset with `/ctoc start`

This prevents:
- Manual state file edits
- Step number manipulation
- Gate bypass attempts

## No Escape Phrases

Unlike v2.x and v3.x, there are **no escape phrases** in v4.0.

Previous escape phrases like "skip planning", "quick fix", "hotfix" are **no longer recognized**.

The only way forward is through the Iron Loop.

## Override Mechanism

For emergencies, administrators can:
1. Delete state file: `rm ~/.ctoc/state/*.json`
2. Start fresh: `/ctoc start <feature>`

This is logged and leaves an audit trail.
