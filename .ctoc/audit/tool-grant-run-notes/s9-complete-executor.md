Completed: agent-tool-grants-s9-quality-architecture-versioning-frontend-devex — task `t136` is done, the plan is in review with passing evidence, and the built work is waiting for the owner's OK to call it done.

**One item is not finished and needs the owner.** Your item on the shared typed-text sentence covered six slice 8 agents (`dependency-checker`, `dependency-auditor`, `sast-scanner`, `secrets-detector`, `concurrency-checker`, `license-scanner`) that this plan's `files:` does not declare. My fix script wrote them by mistake; I put them back, and `git status` shows them unchanged against the last commit. They keep the older clause and stay green. The change for those six is filed as scope-growth request `1791250135059-zkxsbu`. The fourteen slice 9 agents and `onboarding-validator` carry the tightened clause.

**Fix pass, test first** (red: check 3 named 21 agents; then green 27 of 27):
- **`quality-gate`:** never pushes; it reports `action: push` and never writes `approved_by`. Older lines in the agent and method file agree.
- **`onboarding-validator`:** the scan's wording throughout: `mktemp -d` clone, `cd` at the start of every line, container whose only mount is the clone, fallback to the clone said in the report. The method's container example and secret check are fixed.
- **`api-deprecation-checker`:** the review's probe text; example addresses quoted.
- **Other items:** applied as you listed them for `backwards-compatibility-checker`, `duplicate-code-detector`, `pattern-detector`, `dead-code-detector`, the two `--verify-no-changes` flags and the bundle upload line.
- **Nested fences:** the six agent files now use `~~~` for inner blocks; a strict reader sees the search section as prose in all twenty.

**Proof and verification on the final bytes** (load 8.2, waited, started at 6.7):
- Mutation proof rerun in full: 301 of 301 caught, covering all 37 new or changed pinned sentences.
- Tool-grant tests, limits test, model floor, unexecutable-order fence, `watcher-shape`, `ship-gate-real`: 101 of 101, 0 skipped.
- Lint and type check: exit 0. `npm test`: 12098 of 12098, 0 skipped, coverage 99.9%.
- Completion: VERIFY passed on lint, type check and tests. The app-launch check reported not applicable, because no entry point is declared.

Everything is recorded as your decisions 17 to 26, with the shell hook's push gap first in the carried list, in `<home>/Code/ctoc/plans/review/agent-tool-grants-s9-quality-architecture-versioning-frontend-devex.md`. No limit moved in this pass; git is untouched.
