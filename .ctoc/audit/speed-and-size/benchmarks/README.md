# Rerunning the fix benchmark

1. Make a "before" checkout outside the repository: `git worktree add --detach <scratch>/before <commit without the fix>`, then link or install `node_modules` in it.
2. Run `node .ctoc/audit/speed-and-size/benchmarks/bench.js --before <scratch>/before --after . --label "<fix name>" --work <scratch>`; anything outside `--work` is cloned there first, so the repository is never written.
3. It appends one run to `results.json` and rewrites `RESULTS.md` (newest first); a failed self-check writes nothing.
4. Use `--plans N` for a different project size and `--skip-quality` to skip the two `npm test` runs.
5. Remove the worktree afterwards with `git worktree remove <scratch>/before`.
