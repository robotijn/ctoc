---
description: Start a new vision — persona-aware ignition flow. Classifies user role, then routes through vision → canvas → impl with the right questions at the right time.
model: claude-haiku-4-5
---

# /ctoc:start — the v8.3+ ignition flow

This is the canonical entry point for "I want to build something new". It activates the full v8.3+ persona-aware planning chain:

```
1. persona-classifier (if no persona yet)
   ↓
2. vision-advisor (persona-filtered questions)
   ↓ Gate 0
3. product-owner OR skip-to-impl (per persona)
   - founder/pm/technical-founder → product-owner + kpi-planner
   - programmer/architect → skip canvas; tech-stack questions only
   - hobbyist → minimal flow, defaults everything
   ↓ Gate 1
4. implementation-planner + stack-chooser
   ↓ Gate 2
5. Iron Loop (Steps 7-15)
   ↓ Gate 3
6. Product Loop (DEFINE happened at canvas; INSTRUMENT at impl; REVIEW post-ship)
```

## Steps for Claude to execute

### Step 1: Check existing persona

```
1. Read('.ctoc/session/persona.yaml')
   - If exists AND classified within 30 days → use it; skip to Step 2
   - If exists but > 30 days old → re-confirm with user via /ctoc:persona
   - If missing → continue to Step 1a
```

### Step 1a: Classify persona (if not set)

Dispatch the persona-classifier agent. The user's intent message tells us most of what we need:

- "I want to build a SaaS for X" → founder
- "Refactor the auth module" → programmer
- "Design the system for X" → architect
- "Side project for fun" → hobbyist

If signals are weak, persona-classifier asks ONE clarifying question.

### Step 2: Run vision-advisor with persona context

Pass the persona file path + the user's initial message. The vision-advisor:
- Loads the question catalog
- Filters questions by persona (founder gets audience/pricing-relevant; programmer gets minimal)
- Asks at most 5 questions
- Writes the vision file
- Marks the vision frontmatter with `primary_persona`, `canvas_required`, `kpi_loop_required`

### Step 3: User approves vision (Gate 0)

CTO Chief presents the vision summary. User says approve.

### Step 4: Branch by persona

```
if persona is founder/pm/technical-founder:
  → product-owner runs canvas-phase questions (pricing, business model, target customer)
  → kpi-planner runs DEFINE step (picks launch KPIs from canonical library)
  → user approves at Gate 1

if persona is programmer/architect:
  → SKIP canvas. The canvas-required questions are deferred to .ctoc/inbox/ for the founder
  → go directly to implementation-planner with template defaults

if persona is hobbyist:
  → Minimal pipeline. Accept all template defaults. No KPI loop.
```

### Step 5: implementation-planner with stack-chooser

The implementation-planner:
- Dispatches stack-chooser to lock the tech stack (per persona — defaults silently for non-tech, presents options for tech)
- Loads the template's manifest (e.g., `.ctoc/templates/saas/b2c-subscription/manifest.yaml`)
- Wires Product Loop instrumentation from the kpi-plan.yaml
- Adds the production-readiness checklist as the Gate 3 reference

### Step 6: Gate 2 → Iron Loop

User approves the impl plan at Gate 2. Iron Loop Steps 7-15 run.

### Step 7: Gate 3 → Product Loop kicks in

After shipping:
- Production-readiness checklist gates the release
- `/ctoc:kpi-status` shows current state
- Weekly `/ctoc:product-review` runs (or is scheduled by the user)

## Slash-command behavior

When the user invokes `/ctoc:start`:

1. Acknowledge briefly ("Starting persona-aware planning flow…")
2. Run Step 1 (check persona)
3. Run Step 2 (dispatch vision-advisor)
4. Let the vision-advisor's question flow play out
5. After vision is written, return control to CTO Chief for Gate 0 approval

Never skip Step 1. Never ask a programmer about pricing. Never ask a founder about TypeScript.

## Output format

After the flow completes a phase, end with a menu:

```
Vision approved. Persona: <role>. Next:
[1] Continue to canvas (founder/pm) (Recommended if persona is founder/pm)
[2] Skip to implementation (programmer/architect) (Recommended for technical persona)
[3] Pause and revise the vision
[0] Back to dashboard
```

## Comparison with /ctoc:menu

| | /ctoc:menu | /ctoc:start |
|---|---|---|
| Entry point | Dashboard (existing flow, all features) | New vision (v8.3+ persona-aware) |
| Persona-aware | No | Yes |
| KPI Loop wired | No (manual) | Yes (auto-dispatches kpi-planner) |
| Template selection | Manual | Auto (via stack-chooser) |
| Best for | Returning users, dashboard browsing | New project ignition |

Both are valid entry points. `/ctoc:start` is the **persona-aware ignition flow** for greenfield projects.
