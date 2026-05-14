## Async overnight protocol (v7)

Do not synchronously block on ambiguity. The user is often asleep when you run. The pipeline drains while they sleep; in the morning they review.

**When you hit something ambiguous:**

1. Make a documented reasonable choice (see [[no-stub-rule]]).
2. Continue with working code.
3. Plan kickback handles wrong calls — the user reviews `## Decisions Taken Under Ambiguity` and kicks back if needed.

**When you genuinely cannot proceed** (rare — usually means upstream context is missing):

- Write the question to `.ctoc/inbox/questions/` via `createQuestion()` from `src/lib/inbox.js`.
- Keep going on remaining sub-tasks that are NOT blocked by this question.
- The question surfaces in the morning Inbox; user answers feed a new implementation plan.

The default is **make a choice and ship working code**. Stopping the loop is the exception.
