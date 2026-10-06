Slice 10 is complete: the menu completion for task `t137` moved the plan to review, its own verification passed, and the evidence is saved. It now waits for your OK to call it done; I did not touch git.

**What the fix pass changed** (recorded as a CTO Chief decision in the plan)
- **Review blocker:** the start-and-attach sentence now says a later call cannot find a program an earlier call started, even while it keeps running, and that the agent stops it in the same call. Changed in `memory-safety-checker` and `performance-profiler`.
- **Project code only in the owner's tree:** the scan's sentence is now pinned in `memory-safety-checker`, `performance-profiler` and `api-contract-validator`. It covers the program run under a profiler, a sanitizer or Valgrind, and a linter ruleset that is itself code.
- **Heap dumps in a temporary folder:**
  - The scan's sentence is pinned in both profiling agents (folder made with `mktemp -d`, deleted before reporting).
  - ", each in that folder" is added to both agents' list of what a tool writes. The brief said "that agent's list"; I applied it to both because both carry the sentence.
  - The `dotnet-gcdump` and `jcmd GC.heap_dump` lines in the memory method file now write into that folder.
- **The other items, each with the notes' exact wording:**
  - `android-checker`: the benchmark build is excluded where it signs with a non-debug identity, and the `dependencyInsight` line carries the review's comment.
  - `ios-checker`: the scheme is typed in single quotes and comes from the brief or `xcodebuild -list`.
  - `hallucination-detector`: its own redirect-following is named as the one exception.
  - `accessibility-checker`: the address sentence is replaced with the scan's.
  - `ml-model-validator`: never names a command that loads a pickled model of unknown origin.
  - `translation-checker` method file: the hidden right-to-left override character is now written as the escape `\u202E`.

**Not changed:** the shared typed-text constant, as you said. The slice 7 commit (v6.14.90) is noted.

**Counts**
- Test first: the changed pins failed on exactly the seven agents concerned before the files were edited.
- Mutations: 39 of 39 caught (26 on the eight agents' pinned paragraphs, 13 inside each new or changed sentence).
- Load was 4.9, so no wait was needed.
- Tool-grant, model-floor, unexecutable-order and watcher-shape tests: 74 of 74 passed. Lint is clean and the type check passed.
- `npm test`: 12,098 of 12,098 passed, 0 skipped, coverage 99.89%, gate PASS.
- Limits are unchanged from the build pass.

**For your final OK**
- Three points the notes give from memory remain unchecked here:
  - that a `.spectral.js` ruleset is code;
  - that the Android benchmark build inherits release signing;
  - that `dotnet-gcdump collect` takes `-o`.
- Both backlogs are carried as one-line items in the plan.
- `llm-security-tester`'s body has a dated record that its search found the right-to-left override character at the translation method file's line 362. That line now holds the escape, so the record describes the file as it was.
- Commit this slice by its own file list, never with `git add -A`.

Files:
- `<home>/Code/ctoc/plans/review/agent-tool-grants-s10-specialized-safety-realtime-data-mobile-ai.md`
- `<home>/Code/ctoc/tests/agent-tool-grants.test.js`
