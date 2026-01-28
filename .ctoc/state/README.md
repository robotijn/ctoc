# CTOC State Management

This directory contains session state files for CTOC continuation after context compaction.

## Files

| File | Purpose |
|------|---------|
| `continuation.yaml` | Active session state (auto-saved) |
| `continuation.yaml.template` | Template for new sessions |

## How It Works

1. **Agents save state** at key moments:
   - After completing Iron Loop steps
   - After completing files in multi-file edits
   - After making key decisions
   - Before handing off to next agent

2. **Pre-compact hook saves state** before Claude Code context compaction

3. **Session-start hook restores state** when a new session begins

## What's Saved

The state file captures context-rich information ranked by usefulness:

| Priority | Information | Why It Matters |
|----------|-------------|----------------|
| CRITICAL | Key decisions | Prevents second-guessing previous choices |
| CRITICAL | Goal summary | The north star for the session |
| HIGH | Iron Loop step | Where we are in the workflow |
| HIGH | Blockers resolved | Don't rediscover solved problems |
| MEDIUM | File progress | What's done vs pending |
| LOW | Line-level progress | If incomplete, redo the file |

## State Persistence Trigger Points

Agents should save state at these moments:

```
on_step_complete: true      # After each Iron Loop step
on_file_complete: true      # After each file in multi-file edits
on_decision_made: true      # After making key technical decisions
on_blocker_resolved: true   # After solving a blocking issue
on_handoff: true            # Before passing to another agent
```

## Manual State Management

To manually inspect or modify state:

```bash
# View current state
cat .ctoc/state/continuation.yaml

# Reset state (start fresh)
rm .ctoc/state/continuation.yaml
```

## Git Tracking

This directory is git-tracked by default. State files are included in commits so that:

1. Session can be resumed on another machine
2. Team members can see work in progress
3. State history is preserved

Add to `.gitignore` if you prefer local-only state:

```
.ctoc/state/continuation.yaml
```
