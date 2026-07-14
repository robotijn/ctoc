---
title: "Expansion wave 2 fix — add solidity language, fix dockerfile marker/command mismatch"
type: implementation
parent_plan: ctoc-registry-expansion
depends_on: 00038-exp-w2-project-types
priority: HIGH
program: ctoc-registry-expansion
iron_loop: true
files:
  - ".ctoc/capabilities/languages/solidity.yaml"
  - ".ctoc/capabilities/languages/dockerfile.yaml"
  - ".ctoc/capabilities/project-types/browser-extension.yaml"
  - ".ctoc/capabilities/project-types/llm-agent.yaml"
  - "tests/capability-config-languages.test.js"
  - "tests/capability-project-types-2026.test.js"
---

# Wave 2 fix — 2 confirmed defects + 2 honesty comments (adversarial review)

The critic found 2 real defects (both reproduced by execution) and 2 low-severity
residuals worth a clarifying comment.

## F1 (MEDIUM-HIGH) — blockchain ships without a solidity language, so its
`security: required` resolves to a TypeScript SAST that cannot read .sol files.
CONFIRMED: `pipelineFor('typescript','blockchain').security` = `semgrep --config=p/typescript`
(wrong tool for contracts); `pipelineFor('solidity','blockchain')` = null (no solidity).

FIX: add `.ctoc/capabilities/languages/solidity.yaml` (web-grounded 2026, verified 2026-07):
- language: solidity ; detectionMarkers: ["*.sol", foundry.toml] ; extensions: [.sol]
- lint: `solhint 'contracts/**/*.sol'` (solhint — the standard Solidity linter; if the
  glob is not argv-safe per the schema's test, use `solhint .` — confirm against the
  schema's argv-safety rule and pick the compliant form)
- format: `forge fmt --check` (Foundry)
- typecheck: `forge build` (compile is the static check)
- test: `forge test` (Foundry fuzz testing)
- coverage: `forge coverage`
- security: `slither .` (Trail of Bits — 92+ detectors, THE Solidity SAST) altCmd
  `myth analyze` (Mythril symbolic execution). verified: web-2026-07 — this is a REAL
  SAST, not a linter, so web-2026-07 is honest (unlike the linters-as-security peers).
- build: `forge build`
- depsAudit: OMIT (Foundry uses git-submodule deps via `forge install`; no standard audit)
- run: shapes { } ; honest: build-is-last-mile (contracts deploy to chain; local = compile+test)
- configScaffold: [foundry.toml, .solhint.json, remappings.txt]

After this, `pipelineFor('solidity','blockchain').security` must be `slither .` — the
blockchain type's decisive value is now real.

## F2 (MEDIUM) — dockerfile detection accepts Containerfile/*.dockerfile but the lint
command hardcodes `Dockerfile`. CONFIRMED: a Containerfile-only repo detects `dockerfile`
then `toolchainFor('dockerfile','lint').cmd` = `hadolint Dockerfile`, which fails (no
Dockerfile). The marker set and the command assume different filenames.

FIX: narrow `dockerfile.yaml` `detectionMarkers` to `[Dockerfile]` only (remove
`"*.dockerfile"` and `Containerfile`). The command `hadolint Dockerfile` then always
matches what was detected. Honest under-detection of the rare Podman-Containerfile /
multi-dockerfile repo beats detect-then-fail. Update the header comment to say so.
(Do NOT try to make the command filename-agnostic — the registry stores a static string
and cannot compute the detected filename.)

## F3 (LOW) — browser-extension residual: a bare root `manifest.json` (PWA with no build
tool) still mis-detects as browser-extension because the priority-15 guard only fires when
a higher-priority frontend marker co-exists. Accepted ambiguity (type is UNVERIFIED, and a
bare root manifest.json is more often an extension). FIX: add a one-line header comment in
`browser-extension.yaml` documenting the known residual (a build-tool-less PWA with a root
manifest.json will mis-detect; content-based manifest_version disambiguation is a future
enhancement). No behavior change.

## F4 (LOW) — llm-agent `run.honest: true` is defensible via the serve reading (`langgraph
dev` boots a local endpoint) but the "eval" half of `serve-or-eval` needs live credentials +
spend. FIX: add a one-line comment in `llm-agent.yaml` clarifying that honest:true reflects
the local-serve interpretation (a dev server boots and can be probed), not the eval half.
No behavior change.

## TDD-Red FIRST
Extend `tests/capability-config-languages.test.js`: solidity loads with zero warnings,
detects from `main.sol`, `security.verified === 'web-2026-07'` and `security.cmd`
references slither (a REAL SAST); a Containerfile-only fixture does NOT detect dockerfile
(narrowed markers). Extend `tests/capability-project-types-2026.test.js`:
`pipelineFor('solidity','blockchain').phases.security.cmd` references slither (not semgrep).
Run RED first.

## VERIFY (Step 14) — paste verbatim
`node --test tests/capability-config-languages.test.js tests/capability-project-types-2026.test.js
tests/capability-registry.test.js tests/capability-registry-top20.test.js` all green; a
hand-run confirming 24 languages load with zero warnings, `pipelineFor('solidity','blockchain')`
security is slither, and Containerfile-only no longer detects dockerfile; eslint clean; NO git.
Report the solidity toolchain and confirm the dockerfile + blockchain fixes.
