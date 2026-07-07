---
title: "OM2 — Port the opus-pack bash guard hooks to cross-platform CTOC Node hooks"
type: functional
status: functional
created: 2026-07-07
program: ctoc-onboarding
priority: HIGH
files:
  - src/hooks/guard-files.js
  - src/hooks/stop-test-gate.js
  - src/hooks/PreToolUse.Bash.js
  - .claude-plugin/hooks.json
  - tests/opuspack-hooks.test.js
---

# OM2 — Port the opus-pack bash guard hooks to cross-platform CTOC Node hooks

> Direct user work order (Tijn, 2026-07-07): "turn the bash into js." The
> opus48-operating-pack ships 3 bash hooks (`guard-bash.sh`, `guard-files.sh`,
> `stop-test-gate.sh`). Bash entry points VIOLATE CTOC's "Node.js only,
> cross-platform" rule (no Windows). Port their enforcement to cross-platform CTOC
> Node hooks, wired via `.claude-plugin/hooks.json`, **deduped against CTOC's
> existing Node enforcement** (no double-gating).

## 1. ASSESS — Problem Understanding

The pack's enforcement thesis: "CLAUDE.md is context; hooks are the fence." Its 3
bash hooks (exit-code-2 deny, fire before permission checks + inside subagents):

1. **`guard-bash.sh`** — (a) blocks an irreversible-command blocklist (force-push,
   `reset --hard`, `clean -f`, `checkout .`, branch delete, `rm -rf`,
   DROP/TRUNCATE/DELETE, `terraform destroy`, `kubectl delete ns/deploy/pvc`,
   `mkfs`, `dd if=`, `> /dev/sd`, `chmod -R 777`); (b) gates git commit/push behind
   a single-use `.claude/allow-commit` sentinel.
2. **`guard-files.sh`** — blocks Read/Edit/Write/Bash access to secret files
   (`.env`, `secrets.*`, `credentials`, `id_rsa/ed25519/ecdsa`, `.pem`, `.key`,
   `.kube/config`, `.aws/`, `.ssh/`, `token`).
3. **`stop-test-gate.sh`** — Stop hook: no "done" without a green suite; 3-attempt
   loop guard; `CLAUDE_SKIP_TEST_GATE=1` escape.

**Dedup against existing CTOC enforcement (the planner MUST read these fresh and
confirm before porting):**
- CTOC already gates commits/edits via `src/hooks/PreToolUse.Bash.js` and the human
  gates (`human-gate-check.js`). → **Do NOT port the commit sentinel** (overlap);
  port only the **irreversible-command blocklist**, which CTOC does not have.
- CTOC has no secret-file guard → `guard-files.js` is genuinely new.
- CTOC has no Stop test-gate → `stop-test-gate.js` is genuinely new.

## 2. ALIGN — Business Alignment

Goal: the pack's enforcement runs on every platform CTOC supports (Win/mac/Linux),
as Node hooks, without duplicating gates CTOC already owns.

- **Cross-platform Node, no bash:** each hook reads the hook JSON from stdin, parses
  `tool_input`, and exits 2 to block / 0 to allow — pure Node, `process.platform`
  agnostic, `child_process` with no shell where avoidable.
- **Irreversible-command blocklist → fold into `PreToolUse.Bash.js`** (the existing
  Bash PreToolUse hook) as an additional deny layer, OR a sibling module it calls —
  planner decides after reading it; the blocklist patterns are ported verbatim
  (they are shell-command string matches, inherently cross-platform to check).
- **`guard-files.js` → new PreToolUse hook** (matcher `Read|Edit|Write|Bash`):
  blocks secret-bearing paths in `file_path` AND in a Bash `command` (cat/grep of
  `.env`). Patterns ported verbatim.
- **`stop-test-gate.js` → new Stop hook:** runs the project's test command (resolve
  from `.ctoc/settings` quality-gate / `package.json` `scripts.test` / `node --test
  tests/*.test.js` for CTOC itself), blocks the stop on red, 3-attempt loop guard
  (counter in `.ctoc/state/`), `CTOC_SKIP_TEST_GATE=1` escape, and on the 3rd
  failure stands down + forces an honest failure report (the pack's loop-guard
  design). No-suite-found → pass (exit 0).

## 3. CAPTURE — Acceptance Criteria (BDD)

- [ ] **Scenario: irreversible command blocked cross-platform**
  Given the Bash PreToolUse hook
  When a command matching the blocklist (`git push --force`, `rm -rf`,
  `DROP TABLE`, `terraform destroy`, …) is proposed
  Then the hook exits 2 (block) with a message naming the pattern and the
  ask-for-confirmation path
  And a benign command exits 0

- [ ] **Scenario: commit gate is NOT double-implemented**
  Given CTOC already gates commits via the human gates + existing Bash hook
  Then OM2 adds NO second commit-sentinel mechanism (the `.claude/allow-commit`
  sentinel is deliberately not ported) — verified by reading PreToolUse.Bash.js

- [ ] **Scenario: secret file access blocked (file tools AND shell reads)**
  Given `guard-files.js`
  When a Read/Edit/Write targets `.env` / `id_rsa` / `*.pem`, OR a Bash command
  `cat .env` is proposed
  Then the hook exits 2 with the secret-pattern message
  And a non-secret path exits 0

- [ ] **Scenario: stop-test-gate blocks "done" on a red suite, loop-guarded**
  Given a project with a test command and a RED suite
  When the Stop hook runs
  Then it exits 2 (blocks the stop) with the red output, attempts 1..2
  And on attempt 3 it stands down (exit 0) forcing an honest failure report
  And a GREEN suite exits 0
  And `CTOC_SKIP_TEST_GATE=1` or no-suite-found exits 0

- [ ] **Scenario: hooks wired + cross-platform + no regression**
  Then `.claude-plugin/hooks.json` registers the new hooks with correct matchers
  And no `.sh` file is introduced (Node only)
  And the full CTOC suite stays green (the irreversible blocklist must not break
  CTOC's own scripts/tests — verify no CTOC Bash step legitimately needs a blocked
  pattern; if one does, document the allowance)

## Scope

**In:**
- `src/hooks/guard-files.js` (NEW) — secret-file PreToolUse guard, Node, stdin-JSON.
- `src/hooks/stop-test-gate.js` (NEW) — Stop hook, Node, runner-detect + loop guard.
- `src/hooks/PreToolUse.Bash.js` — fold in the irreversible-command blocklist
  (deny layer) without disturbing the existing edit/commit enforcement.
- `.claude-plugin/hooks.json` — register guard-files (Read|Edit|Write|Bash) and
  stop-test-gate (Stop); confirm the Bash matcher already routes to
  PreToolUse.Bash.js.
- `tests/opuspack-hooks.test.js` — per-hook behavioral tests: blocklist hit/miss,
  secret hit/miss (file_path + Bash command), stop-gate red/green/loop-guard/escape/
  no-suite, exit-code-2-on-block, cross-platform path handling; assert NO commit
  sentinel added; assert NO `.sh` file added.

**Out:**
- The commit sentinel (`.claude/allow-commit`) — CTOC already gates commits.
- OM1's operating-manual merge (separate plan).
- Per-project install of hooks into `.claude/hooks/` — these are CTOC plugin hooks
  (active wherever CTOC is), the native CTOC mechanism; per-project copies are not
  needed.

## Decisions Taken

- **D-OM2-1:** port only the NEW capabilities (irreversible blocklist, secret guard,
  stop-test-gate); skip the commit sentinel (CTOC already owns commit gating).
- **D-OM2-2:** hooks are CTOC PLUGIN hooks (src/hooks/ + hooks.json), not per-project
  installs — active wherever CTOC runs, matching "every new ctoc".
- **D-OM2-3:** blocklist folds into the existing `PreToolUse.Bash.js` deny path
  (subject to the planner confirming that file's shape); guard-files + stop-test-gate
  are new files.
- **D-OM2-4:** cross-platform Node only; loop-guard counter in `.ctoc/state/`;
  `CTOC_SKIP_TEST_GATE=1` escape preserved; no `.sh` files.
