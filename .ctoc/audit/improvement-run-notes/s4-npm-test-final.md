# End-of-slice `npm test` on the final bytes (session run, 2026-09-30 23:36 CEST)

- Bytes under test: agent `sha256:432f165a381e9ac2c46a5f8b43be76568317d5646905a6dcc26f1793b94dffae`, skill `sha256:e259dc1af2a4f9fb6e0e084646467f619abfbcaea7dd8071bc9ada339f9ca794` (hashed by the session with `shasum -a 256` immediately before the run).
- Command: `npm test` (the gated entry point, `src/scripts/test-gate.js`), run in the background; full output kept at `/private/tmp/claude-uid/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/scratchpad/s4-npm-test-4.out` (1,370,173 bytes; session-local, not committed).
- Counters, copied from the output: tests 12035, pass 12035, fail 0, skipped 0, todo 0.
- Gate lines, verbatim:
  - `[CTOC test-gate] coverage 99.9% (threshold 99%), skipped 0, failed 0`
  - `[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)`
  - `[CTOC test-gate] PASS`
- Exit status: 0.
- The three "Step 14 VERIFY FAILED for w10-s2-demo" warning lines in the output are a test fixture's expected output (the test asserts that a verification that verified nothing is not a pass), not a failure of this run.
