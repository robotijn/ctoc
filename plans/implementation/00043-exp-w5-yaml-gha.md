---
title: "Expansion wave 5 — yaml + github-actions config-quality languages"
type: implementation
parent_plan: ctoc-registry-expansion
depends_on: 00042-exp-w3fix-sca-severity-dedup
priority: MEDIUM
program: ctoc-registry-expansion
iron_loop: true
files:
  - ".ctoc/capabilities/languages/yaml.yaml"
  - ".ctoc/capabilities/languages/github-actions.yaml"
  - "tests/capability-config-languages.test.js"
---

# Expansion wave 5 — yaml + github-actions (config-quality linting)

Two config-quality languages complete category A. Both are ubiquitous-but-CORRECT
detection (a repo with YAML genuinely has YAML to lint; this is NOT the CR5
mis-classification case — the detection is right wherever it fires, it just fires
widely). Author as `.ctoc/capabilities/languages/*.yaml`, schema-exact, OMIT (never
stub) the many N/A phases.

## yaml.yaml (web-2026-07)
- language: yaml ; detectionMarkers: ["*.yaml", "*.yml"] ; extensions: [.yaml, .yml]
- lint: `yamllint .` (yamllint — the standard 2026 YAML linter)
- format / typecheck / test / coverage / security / depsAudit / build: OMIT (YAML is
  data, not runnable/typed/testable; no standard formatter)
- run: shapes { } ; honest: false (YAML is not a runnable app — consistent with sql)
- configScaffold: [.yamllint]

## github-actions.yaml (web-2026-07)
- language: github-actions ; detectionMarkers: [.github/workflows] (a DIRECTORY marker —
  existsSync matches a dir, verified in the game/embedded ProjectSettings case)
- lint: `actionlint` (actionlint — the standard GitHub Actions workflow linter)
- format / typecheck / test / coverage / security / depsAudit / build: OMIT
- run: shapes { } ; honest: false (a workflow is not a locally-launchable app)
- configScaffold: [.github/workflows/ci.yml]
- NOTE in the header: a repo with `.github/workflows/ci.yml` correctly detects BOTH
  github-actions (the dir) and yaml (the *.yml) — additive and correct (actionlint the
  workflow, yamllint the YAML).

## TDD-Red FIRST
Extend `tests/capability-config-languages.test.js` (real temp-dir fixtures): yaml loads +
detects from `config.yml`, lint is `yamllint .`, run.honest === false; github-actions loads
+ detects from a `.github/workflows` directory, lint is `actionlint`; a repo with
`.github/workflows/ci.yml` detects BOTH; every `verified` is web-2026-07 or UNVERIFIED.
Run RED first.

## VERIFY (Step 14) — paste verbatim
`node --test tests/capability-config-languages.test.js tests/capability-registry.test.js
tests/capability-registry-top20.test.js` all green; a hand-run: registry loads **26
languages** with ZERO warnings; config.yml→yaml, .github/workflows dir→github-actions;
eslint clean; NO git. Step 16: report both entries and confirm the .github/workflows dir
marker fires (directory existsSync).
