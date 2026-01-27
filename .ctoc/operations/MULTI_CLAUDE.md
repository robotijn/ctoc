# Multi-Claude Coordination

## Overview

Multiple Claude Code instances can work in parallel on the same repository using git-based coordination. This enables faster development by allowing concurrent work on different features, modules, or plans while avoiding conflicts through established coordination mechanisms.

---

## Coordination Mechanisms

### Plans

Use `ctoc plan claim` for atomic work claiming. The git push acts as a distributed lock:

- When a Claude instance claims a plan, it pushes immediately
- Other instances see the claim on `git pull`
- First successful push wins the claim
- Failed push = someone else claimed it first

### Learnings

The `learnings/` directory serves as shared knowledge:

- Git-tracked, visible to all instances
- Document discoveries, patterns, gotchas
- Other instances benefit on next pull

### Cache

The `.ctoc/cache/` directory is **LOCAL** (gitignored):

- Each instance maintains its own cache
- No conflicts possible
- Regenerated as needed per instance

---

## Safe Parallel Patterns

### Different Plans

Each Claude claims a different plan:

- Claude A works on `2026-01-27-001-auth-system`
- Claude B works on `2026-01-27-002-api-endpoints`
- No overlap, no conflicts

### Different Modules

Work on separate parts of the codebase:

- Claude A: `src/auth/` directory
- Claude B: `src/api/` directory
- Minimal merge conflicts

### Research vs Implementation

Divide work by type:

- Claude A: Researches architecture, writes learnings
- Claude B: Implements based on existing plans
- Complementary workflows

---

## Conflict Avoidance

### Before Starting Work

```bash
git pull --rebase
```

Always sync before beginning any work.

### Claim Before Working

```
ctoc plan claim <plan-id>
```

Never work on unclaimed plans.

### Push Frequently

- Small, focused commits
- Push after completing logical units
- Reduces merge conflict window

### Git Worktrees for True Parallelism

For completely independent work:

```bash
git worktree add ../project-feature feature-branch
```

Each worktree has its own working directory, eliminating file-level conflicts entirely.

---

## Communication Between Instances

### Via Learnings Directory

```
learnings/
  2026-01-27-api-rate-limiting.md    # Claude B discovers rate limit pattern
  2026-01-27-auth-token-format.md    # Claude A documents token structure
```

Git-tracked, available after pull.

### Via Plan Status Changes

Plan files show who claimed what:

```yaml
claimed_by: Claude-A
claimed_at: 2026-01-27T10:30:00Z
status: in_progress
```

### Via Commit Messages

Include context in commits:

```
feat(auth): add JWT validation

Related to plan 2026-01-27-001
Depends on API module for token refresh
```

---

## Setup for Multi-Claude

### Basic Setup

Each terminal runs a separate Claude Code instance:

```
Terminal 1: claude    # Instance A
Terminal 2: claude    # Instance B
Terminal 3: claude    # Instance C (if needed)
```

### Git Worktrees (Recommended for Large Features)

```bash
# Create worktree for feature work
git worktree add ../project-feature feature-branch

# List worktrees
git worktree list

# Remove when done
git worktree remove ../project-feature
```

### Recommended Configuration

| Scenario | Instances |
|----------|-----------|
| Small project | 1-2 instances |
| Medium project | 2-3 instances |
| Large refactor | 1 instance per major module |

**Rule of thumb**: 1 instance per major feature or plan.

---

## Example Workflow

```
Terminal 1 (Claude A):
- git pull --rebase
- ctoc plan claim 2026-01-27-001
- Works on auth module (src/auth/)
- Commits: "feat(auth): add login endpoint"
- git push

Terminal 2 (Claude B):
- git pull --rebase
- ctoc plan claim 2026-01-27-002
- Works on API module (src/api/)
- Commits: "feat(api): add rate limiting"
- git push

Both push independently, git handles merge
```

### Handling Conflicts

If push fails due to upstream changes:

```bash
git pull --rebase
# Resolve any conflicts
git push
```

### Handoff Between Instances

When Claude A discovers something Claude B needs:

1. Claude A writes to `learnings/`
2. Claude A commits and pushes
3. Claude B runs `git pull --rebase`
4. Claude B reads the learning and continues

---

## Best Practices

1. **Communicate via git** - All coordination happens through commits and pushes
2. **Stay in your lane** - Respect plan claims and module boundaries
3. **Document discoveries** - Learnings help all instances
4. **Pull often** - Stay synchronized with other instances
5. **Push small** - Smaller commits = easier merges
