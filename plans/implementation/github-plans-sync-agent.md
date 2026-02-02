# GitHub Plans Sync Agent

## Problem Statement

Currently, plan changes made locally or on GitHub are not automatically synchronized. Users must manually pull/push changes, leading to potential conflicts and stale plans. There's no continuous awareness of remote changes.

## Proposed Solution

**Event-triggered sync with rate limiting** - no daemon, no polling, just smart checks when plans change.

### Trigger Points

Sync check runs on any CTOC plan operation:
- `create` - New plan created
- `edit` - Plan modified
- `approve` - Plan moved between stages
- `delete` - Plan removed

### Sync Logic

```
On plan operation:
  1. Check timestamp file (.ctoc/last-sync)
  2. If >60 seconds since last check:
     a. Run `git fetch origin`
     b. Compare local vs remote plans/
     c. If remote has changes:
        - Notify: "Remote has X new/changed plans"
        - Offer: [Pull] [Ignore] [View diff]
     d. Update timestamp
  3. After local change:
     a. Auto-commit: "plan: {action} {plan-name}"
     b. Push to origin
     c. Notify: "Synced to remote"
```

### Architecture

```
┌─────────────────────────────────────────────────────┐
│              Plans Sync (Event-Triggered)           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Plan Operation ──▶ Rate Limiter ──▶ Git Sync      │
│       │                  │              │          │
│       │            (60s cooldown)       │          │
│       │                                 ▼          │
│       └──────────────────────▶ Auto-Commit + Push  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Auto-Commit Messages

| Action | Commit Message |
|--------|----------------|
| Create | `plan: create {name}` |
| Edit | `plan: update {name}` |
| Approve | `plan: {from} → {to} {name}` |
| Delete | `plan: delete {name}` |

### Configuration

```yaml
# .ctoc/settings.yaml
sync:
  enabled: true
  check_interval: 60     # Minimum seconds between remote checks
  auto_commit: true      # Auto-commit plan changes
  auto_push: true        # Push after commit
  auto_pull: prompt      # prompt | always | never
  branch: main           # Branch to sync
```

## Business Value

- No more stale plans
- Team collaboration on plans
- Automatic backup to GitHub
- Conflict awareness before it's too late

### Conflict Handling (Interactive Merge)

When both local and remote changed the same plan:

```
⚠ Conflict detected: feature-x.md

Local changes:
  + Added success criteria
  ~ Modified architecture section

Remote changes:
  + Added open questions
  ~ Modified problem statement

  [1] View diff      Show side-by-side comparison
  [2] Keep local     Discard remote changes
  [3] Keep remote    Discard local changes
  [4] Manual edit    Open in editor to merge
  [0] Skip           Don't sync this file now
```

### Offline Mode

- If git fetch fails (no network), silently skip remote check
- Local auto-commit still works (staged for push later)
- On next successful fetch, push accumulated commits

## Resolved Questions

| Question | Decision |
|----------|----------|
| Run mode | Event-triggered on plan operations |
| Polling interval | 60 second minimum between checks |
| Auto-commit | Yes, with descriptive messages |
| Conflict handling | Interactive merge with diff view |

## Success Criteria

- [ ] Sync triggers on plan create/edit/approve/delete
- [ ] Rate-limited to max 1 remote check per 60 seconds
- [ ] Auto-commits plan changes with descriptive messages
- [ ] Auto-pushes to remote after commit
- [ ] Notifies user of remote changes before pulling
- [ ] Interactive merge UI for conflicts
- [ ] Works offline (queues commits for later push)
- [ ] Configuration via `.ctoc/settings.yaml`
