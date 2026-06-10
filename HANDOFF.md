# Handoff — README truth pass · runtime environments · deployment wiring

<!-- Maintained by the `handoff` skill. Left by the previous Claude instance so
     the next one (claude or claudex) can continue. Treat as last-known state —
     verify against the repo before acting. -->

- Updated: 2026-06-10 by claude
- Branch: main
- Status: complete

## Goal
Bring the README and docs back to truth, then ship two features the user asked
for: a CTOC runtime environment mode (dev/staging/prod) and a real, wired
deployment pipeline. All done, released v6.9.37 → v6.9.43, and pushed to
origin/main.

## Current status
- Done (all committed + pushed):
  - v6.9.38 — README truth pass: CVE-2025-53773 CVSS 9.6 → 7.8 (verified vs
    Wiz/NVD/Microsoft); removed the invented "1.8× funding (Abacum 2025)" stat;
    fixed the stale `tests/update.test.js` that had been red since v6.9.37.
  - v6.9.39 — repo-wide count truth-sweep: Tier-2 specialists 72/86/91 → 99,
    categories → 20/22, across tier-definitions.yaml, architecture-invariants
    test (now validates all 99 specialists / 20 categories), AGENT_ARCHITECTURE,
    CONTRIBUTING, README, cto-chief.md, agent-critic.md.
  - v6.9.40 — CTOC runtime environment mode. `general.environment`
    (ask|dev|staging|prod) in settings.json selects a behavior profile
    (ENVIRONMENT_PROFILES in src/lib/settings.js). Resolution: explicit user
    setting > env profile > schema default. menu.js prompts on first run when
    unset (`claude:set-environment`). SAFETY: no profile may weaken a human gate
    — enforced by tests/environment-mode.test.js.
  - v6.9.41 — deployment pipeline wired for real execution. All six strategy
    executors (git-branch/git-tag/webhook/script/docker/ssh) + notifications now
    really execute, gated by `dry_run` (default true = simulate). Config home is
    .ctoc/settings.json `deployment` block. tests/deployment-execute.test.js
    proves the live path with local-only resources.
  - v6.9.42 — deploy-target model fix: dev/local is the SOURCE, not a target.
    Targets are staging + production only; the three promotions (→staging,
    staging→prod, →prod direct) fall out of enabled targets + the prod approval.
  - v6.9.43 — open-items cleanup (this commit): removed the vestigial flat
    deployment toggles from the Settings UI; documented the settings.json vs
    settings.yaml split (docs/CONFIG_SOURCES.md + header comments); refreshed
    README/CLAUDE test counts to 70 files / 1500 tests; rewrote this handoff.
- In progress: nothing.
- Next: nothing — all four open items from the /ask-me-questions round are
  resolved (Settings UI toggles removed, split documented, handoff rewritten,
  runtime-env/deploy-targets kept independent by decision).

## Key decisions
- Deployment config lives in `.ctoc/settings.json` (nested `deployment` block),
  NOT settings.yaml — the repo's hand-rolled YAML parser cannot read block
  sequences, so the documented YAML form could never have worked.
- Deployment is safe-by-default: `dry_run: true` simulates every strategy;
  real pushes/POSTs/ssh require `dry_run: false`.
- Runtime environment and deploy targets are independent axes (user decision).
- The settings.json/settings.yaml split is intentional (hooks need a fast,
  dependency-free YAML read); unification is deferred to a separate analyzed task.

## Open questions / blockers
None.

## Gotchas
- Two config files: enforcement/regime/operations in `.ctoc/settings.yaml`
  (hooks); everything menu-driven + deployment in `.ctoc/settings.json`. See
  docs/CONFIG_SOURCES.md.
- Existing deployment.test.js asserts strategies SUCCEED against fake hosts —
  that only holds on the dry-run (simulate) path. Real-exec tests live in
  tests/deployment-execute.test.js and use local-only resources.
- All tests must show `# fail 0`. Currently 70 files / 1500 tests, all passing.

## Key files
- src/lib/settings.js — runtime environment + ENVIRONMENT_PROFILES; config-split header.
- src/lib/deployment.js — real executors gated by dry_run; staging/production targets.
- src/commands/menu.js / menu.md — first-run environment prompt + set-environment action.
- docs/CONFIG_SOURCES.md — which config file owns what, and why there are two.
- tests/environment-mode.test.js, tests/deployment-execute.test.js — the new suites.

## Resume here
Nothing to resume — this work is complete and pushed. For a new task, start
fresh; delete this HANDOFF.md once it is no longer useful.
