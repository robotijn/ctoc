---
description: Start a new vision — ignition flow that routes through vision → canvas → implementation in order, dispatching the planning chain step by step.
---

# /ctoc:start — Ignition flow for a new vision or feature

This is the canonical entry point for "I want to build something new". It dispatches the planning chain in order:

```
1. vision-advisor (vision questions — at most 5)
   ↓ Gate 0
2. product-owner (Steps 2 ASSESS through 4 CAPTURE — functional plan)
   ↓ Gate 1
3. implementation-planner + stack-chooser (Steps 5 PLAN through 7 SPEC — technical plan)
   ↓ Gate 2
4. Iron Loop Steps 8 TEST through 16 FINAL-REVIEW
   ↓ Gate 3
5. Product Loop (dispatched outside the CTO Chief technical chain by the founder or product manager)
```

## Steps for Claude to execute

### Step 1: Dispatch vision-advisor

Pass the user's initial message. The vision-advisor:

- Asks at most five questions to fill in problem, audience, success, and scope.
- Writes the vision file under `plans/vision/`.
- Returns control to the CTO Chief for Gate 0.

### Step 2: User approves vision (Gate 0)

The CTO Chief presents the vision summary. User approves to continue.

### Step 3: Functional planning (Steps 2 ASSESS through 4 CAPTURE)

Dispatch product-owner to refine the vision into a functional plan with behaviour-driven-development acceptance criteria. Output lands in `plans/functional/`.

### Step 4: User approves functional plan (Gate 1)

### Step 5: Technical planning (Steps 5 PLAN through 7 SPEC)

Dispatch implementation-planner. It in turn dispatches stack-chooser to lock the tech stack from the matching template. Output lands in `plans/implementation/`.

If the founder or product manager has previously dispatched the Product Loop's kpi-planner outside this chain and a `plans/canvas/<slug>-kpis.yaml` exists, the implementation-planner reads it and plans instrumentation work for Step 10. The CTO Chief implements the wiring; the key-performance-indicator selection itself is outside scope.

### Step 6: User approves technical plan (Gate 2)

### Step 7: Iron Loop execution (Steps 8 through 16)

The Iron Loop runs end to end. The CTO Chief dispatches each step's specialists per the named-skill map in `agents/coordinator/cto-chief.md`.

### Step 8: User approves the final result (Gate 3)

After Gate 3, the Product Loop (dispatched outside this technical chain) takes over for validation. `/ctoc:kpi-status` and `/ctoc:product-review` are the relevant commands.

## Slash-command behaviour

When the user invokes `/ctoc:start`:

1. Acknowledge briefly ("Starting ignition flow…").
2. Dispatch vision-advisor with the user's initial message.
3. Let the vision-advisor's question flow play out.
4. After the vision file is written, return control to the CTO Chief for Gate 0.

## Output format

After each phase completes, end with a menu:

```
Vision approved. Next:
[1] Continue to functional plan (Recommended)
[2] Pause and revise the vision
[0] Back to dashboard
```

## Comparison with /ctoc:menu

| | /ctoc:menu | /ctoc:start |
|---|---|---|
| Entry point | Dashboard (existing flow, all features) | New vision or feature |
| Template selection | Manual | Auto (via stack-chooser) |
| Best for | Returning users, dashboard browsing | New project ignition |

Both are valid entry points. `/ctoc:start` is the linear ignition flow for greenfield projects.
