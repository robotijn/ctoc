---
description: Vision pipeline - explore, decompose, and refine ideas into plans
---

Vision pipeline entry point for vision-specific operations including decomposition.

## Navigation Commands

| Command | Screen |
|---------|--------|
| (no args) | List visions |
| `decompose {slug}` | Run Vision Decomposer on a ready vision |
| `stubs {slug}` | Show current stubs for a vision being decomposed |
| `refine {slug}` | Trigger PO Agent refinement on approved stubs |

## Claude Actions

| Action | What to do |
|--------|-----------|
| `claude:decompose {slug}` | Read vision file, validate readiness via `validateVisionReadiness()` from `lib/vision-decomposer.js`, then run Vision Decomposer agent (`agents/planning/vision-decomposer.md`). Show human checkpoint when stubs are ready. |
| `claude:edit-stubs {slug}` | Present stub table via `visionStubsBrowse()` from `lib/menu-screens.js`, allow user to rename/merge/split/remove stubs |
| `claude:approve-stubs {slug}` | Hand off all stubs to PO Agent via `initProductOwnerAgent()` from `lib/actions.js`. Move vision to done/ via `completeVision()` from `lib/vision-decomposer.js`. |
| `claude:add-stub {slug}` | Create a new stub for an in-progress decomposition using `createStub()` from `lib/vision-decomposer.js` |

## Decomposition Protocol

When user selects "Decompose" on a vision:

1. **Validate readiness**: Call `validateVisionReadiness(visionPath)` from `lib/vision-decomposer.js`
   - If validation fails: show errors and suggest user completes the vision first (return to Vision Advisor)
   - If warnings only: show warnings and allow proceeding

2. **Run Vision Decomposer agent**: Follow `agents/planning/vision-decomposer.md`
   - Phase 1-4: Extract Goals, Map Activities, Generate Stories, Prioritize
   - Phase 5: Create stubs via `decomposeVision()` from `lib/vision-decomposer.js`
   - Phase 6: Human Checkpoint -- present stub table

3. **Human Checkpoint**: Show stub table and AskUserQuestion
   - "Looks good -- refine all": Hand off to PO Agent, move vision to done/
   - "Edit stubs": Allow user to modify stubs
   - "Add a stub": Create new stub via `createStub()`
   - "Start over": Remove all stubs via `removeStub()`, restart

4. **Handoff to Product Owner**: For each approved stub:
   - Call `initProductOwnerAgent(stubPath)` from `lib/actions.js`
   - Write status: `{ agent: 'product-owner', status: 'working' }`
   - Call `completeVision(visionPath)` to move vision to `plans/done/`

## Integration

The `commands/menu.md` already has `claude:vision` action. This command extends vision mode with decomposition-specific subcommands. When user is in vision mode and selects "Decompose", the conversation follows this command's protocol.

The `stubs` route in `lib/menu-screens.js` renders the human checkpoint table via `visionStubsBrowse()`.
