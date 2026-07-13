## No-stub rule (v7)

When you hit ambiguity, make a documented reasonable choice and continue with working code. Never write stubs, TODOs, "to be filled in" markers, or empty function bodies that just throw "not implemented."

Document each choice in the plan's `## Decisions Taken Under Ambiguity` section using this shape:

```
1. **<what was ambiguous>**: chose <X> because <rationale>. <impact / what this means downstream>.
```

Wrong choices are caught at review and kicked back; stubs are silent failures that rot. A documented choice is a kickback opportunity. A stub is technical debt with no signal.

This rule applies to every step (Steps 1–15), not just Step 10 (Implement). Vision-advisor, product-owner, planners, reviewers — all of you. Defer-and-continue, never block-and-wait.
