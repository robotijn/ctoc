# CTOC Learning System

This directory contains project-specific learnings captured during CTOC operations.

## Directory Structure

```
learnings/
├── pending/     # Awaiting user review
├── approved/    # Reviewed and approved by user
├── applied/     # Integrated into agent behavior
└── rejected/    # Rejected with reason
```

## Learning Lifecycle

```
Captured → pending/ → approved/ → applied/
                  ↘ rejected/ (with reason)
```

1. **Captured**: Agents identify patterns during work
2. **Pending**: Awaits user review (interaction_level dependent)
3. **Approved**: User confirms the learning
4. **Applied**: Learning influences future agent behavior
5. **Rejected**: Not applicable (documented why)

## Learning File Format

```yaml
id: "2026-01-28-001"
type: pattern          # pattern | anti-pattern | preference | constraint
created: "2026-01-28T14:30:00Z"

learning:
  title: "FastAPI async pattern"
  content: |
    Use async def for I/O-bound routes.
    Prefer sync def for CPU-bound operations.
  context: "API development"
  tags: ["python", "fastapi", "async"]

confidence:
  initial: 0.87        # When first captured
  current: 0.92        # Updates over time
  applications: 5      # Times applied
  successes: 4         # Successful applications
  failures: 1          # Failed applications

re_evaluation:
  next_scheduled: "2026-04-28"  # 3 months out
  last_evaluated: null
  trigger: "scheduled"  # scheduled | conflict | user

metadata:
  source_step: 10      # Iron Loop step
  source_agent: "self-reviewer"
  related_files: []
```

## Interaction Levels

Configured in `settings.yaml`:

| Level | Behavior |
|-------|----------|
| `high` | Discuss ALL learnings with user |
| `medium` | Only discuss uncertain (confidence < 0.9) |
| `low` | Auto-approve high confidence |

## Confidence Dynamics

```yaml
confidence_updates:
  on_success: +0.02    # Learning worked well
  on_failure: -0.05    # Learning didn't help
  decay: none          # Confidence doesn't decay
```

## Re-evaluation Triggers

1. **Scheduled**: Every 3 months (configurable)
2. **Conflict**: When learning contradicts new information
3. **User-triggered**: Manual re-evaluation request

## Commands

```bash
# List learnings
ctoc learning list

# Review pending learnings
ctoc learning review

# Export to global (~/.ctoc/)
ctoc learning export
```

## Git Tracking

Learnings are git-tracked by default. This allows:
- Team knowledge sharing
- Version control of learnings
- Audit trail of decisions

## Privacy

Learnings are anonymous by design:
- No user identifiers
- No timestamps that identify sessions
- Focus on patterns, not people
