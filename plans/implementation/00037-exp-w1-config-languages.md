---
title: "Expansion wave 1 — config/infra language capabilities (shell, dockerfile, terraform)"
type: implementation
parent_plan: ctoc-registry-expansion
depends_on: none
priority: HIGH
program: ctoc-registry-expansion
iron_loop: true
files:
  - ".ctoc/capabilities/languages/shell.yaml"
  - ".ctoc/capabilities/languages/dockerfile.yaml"
  - ".ctoc/capabilities/languages/terraform.yaml"
  - "tests/capability-config-languages.test.js"
---

# Expansion wave 1 — shell, dockerfile, terraform (config/infra languages)

These three config/infra languages appear in nearly every real repo and each has a
standard 2026 toolchain, yet the registry (top-20 programming languages) misses them.
Adding them means a Next.js repo's Dockerfile gets hadolint, its deploy scripts get
shellcheck, and an infra repo's HCL gets tflint + trivy — through the ONE registry the
CR5 surfaces already consume (no engine change; the schema already supports these).

Author each as a `.ctoc/capabilities/languages/*.yaml` byte-for-byte to the schema and
the existing `rust.yaml` template. OMIT (do not stub) any phase the language genuinely
lacks — the schema treats an absent phase as honest N/A. Web-grounded matrix (verified
2026-07; the ONE correction to note: tfsec is DEPRECATED, folded into Trivy in 2023 —
use `trivy config` for Terraform/Dockerfile security, never tfsec):

## shell.yaml
- language: shell ; detectionMarkers: ["*.sh", "*.bash"] ; extensions: [.sh, .bash]
- lint: `shellcheck` (web-2026-07) ; format: `shfmt -d .` (shfmt, web-2026-07)
- security: `shellcheck` verified: UNVERIFIED (a linter that catches some injection, not a
  dedicated SAST — honest flag, matching the peer languages that reuse their linter)
- typecheck / test / coverage / depsAudit / build: OMIT (untyped; no std test/pkg-mgr/build)
- run: shapes { cli: "bash" } ; honest: true
- configScaffold: [.shellcheckrc, .editorconfig]

## dockerfile.yaml
- language: dockerfile ; detectionMarkers: [Dockerfile, "*.dockerfile", Containerfile]
  ; extensions: [.dockerfile]
- lint: `hadolint Dockerfile` (web-2026-07)
- security: `trivy config .` (web-2026-07; Trivy scans Dockerfiles/IaC for misconfig)
  altCmd `hadolint Dockerfile`
- build: `docker build .` (web-2026-07)
- format / typecheck / test / coverage / depsAudit: OMIT (no std Dockerfile formatter;
  image dependency scanning is `trivy image`, a different runtime target)
- run: shapes { } ; honest: build-is-last-mile (an image is built, not launched)
- configScaffold: [.dockerignore, .hadolint.yaml]

## terraform.yaml (HCL)
- language: terraform ; detectionMarkers: ["*.tf", main.tf] ; extensions: [.tf, .tfvars]
- lint: `tflint` (web-2026-07; a LINTER, not a security scanner)
- format: `terraform fmt -check -recursive` (web-2026-07)
- typecheck: `terraform validate` (web-2026-07; validate is the closest static check)
- test: `terraform test` (web-2026-07; native since Terraform 1.6)
- security: `trivy config .` (web-2026-07; SUCCESSOR to the deprecated tfsec) altCmd
  `checkov -d .`
- build: `terraform plan` (web-2026-07; the dry-run "build")
- coverage / depsAudit: OMIT
- run: shapes { } ; honest: false (terraform plan is a dry run, not a launched app —
  consistent with the infra project-type's honest:false)
- configScaffold: [.tflint.hcl, versions.tf, .terraform.lock.hcl]
- verified: web-2026-07

## TDD-Red FIRST
`tests/capability-config-languages.test.js` (real temp-dir fixtures, zero mocks): each of
the 3 loads with zero warnings; `detectLanguages` finds shell from `deploy.sh`, dockerfile
from `Dockerfile`, terraform from `main.tf`; each entry's `verified` is `web-2026-07` or
`UNVERIFIED` (never "guessed"); terraform.run.honest === false; dockerfile.run.honest ===
"build-is-last-mile". Run RED before authoring.

## VERIFY (Step 14) — paste verbatim
`node --test tests/capability-config-languages.test.js tests/capability-registry.test.js
tests/capability-registry-top20.test.js tests/tool-detector-registry.test.js` all green;
a hand-run confirming the registry now loads **23 languages** with ZERO warnings and the
3 new ones detect from their markers; eslint clean; NO git; do not move the plan.
Report each new entry's toolchain and confirm no existing detection regressed (a JS repo
with a Dockerfile still has javascript as its stack-detector primary — dockerfile is an
additional detected language, not the primary).
