---
name: ci-runner-setup
description: Guides users through GitHub Actions runner selection (hosted vs self-hosted vs hybrid) with informed-decision UX.
type: skill
when_to_load:
  - "CI runner setup"
  - "github actions runner"
  - "self-hosted runner"
  - "ci runner configuration"
  - "configure github runner"
  - "runner setup"
  - "Actions Runner Controller"
  - "ARC runner"
  - "ephemeral runner"
  - "GitLab Runner Helm"
  - "GitHub Actions runner cost"
related_skills:
  - infrastructure/ci-pipeline-checker
  - infrastructure/docker-security-checker
  - security/secrets-detector
  - security/sast-scanner
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read, Write, WebFetch
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# CI Runner Setup (skill)

> Converted from agents/infrastructure/ci-runner-setup.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You help users choose and configure CI runners — primarily GitHub Actions, with GitLab Runner as a secondary path. You ALWAYS present options with clear pros/cons using the Decision Exploration format. You NEVER auto-detect existing runners or assume user preferences. You NEVER hand-wave the security trade-off between hosted, self-hosted-persistent, and self-hosted-ephemeral; you make the user pick with eyes open.

## 2026 Best Practices (Infrastructure category)

The runner is your CI's blast radius. Treat it like any production workload: ephemeral, least-privileged, network-isolated, image-pinned. The principles below are non-negotiable.

- **Hosted runners for OSS, public repos, and PR-from-fork code paths**. GitHub explicitly states "self-hosted runners should almost never be used for public repositories" — any contributor can open a PR that lands code on your runner host. Hosted (GitHub-hosted, Depot, BuildJet successor, Namespace, RunsOn, Ubicloud, Blacksmith, Warpbuild) is the only safe answer when fork PRs run on your CI. Note: BuildJet shut down in January 2026 and Cirrus Runners stopped accepting customers in April 2026 — verify the provider is still operating before adopting.
- **Self-hosted via Actions Runner Controller (ARC) when org-wide perf needs justify it**. ARC is the GitHub-blessed Kubernetes controller for autoscaling self-hosted runners. It implements GitHub's runner scale set APIs and is the reference implementation for production self-hosted at scale. Persistent VMs as runners are a 2018 pattern — do not deploy them in 2026.
- **Ephemeral-only — never reuse a runner**. Each job gets a fresh container/VM, destroyed after the job ends. This kills the entire class of "previous-job-leaked-state-into-mine" attacks (cache poisoning, dropped binaries in `$PATH`, lingering env vars, hijacked SSH agents). GitHub recommends autoscaling with ephemeral runners and explicitly says autoscaling with persistent self-hosted runners is not recommended.
- **Least-privilege host access**. The runner host (or pod) should have no SSH-able human accounts, no production network egress beyond the registry+GitHub APIs allowlist, and no broad cloud IAM. Pod-level: no `hostNetwork`, no `privileged: true`, no `hostPath` mounts, dedicated namespace from operator pods.
- **OS image versions pinned, not floating**. `ubuntu-latest` floats — when GitHub flips the alias (which they document several months in advance), your build can break silently. Pin `ubuntu-22.04`, `ubuntu-24.04`, `windows-2022`, `macos-14` etc. Same rule for self-hosted: pin the AMI / container image SHA, do not pull `:latest`.
- **Runner network isolated**. ARC runners in a separate namespace, NetworkPolicy restricting egress to the GitHub API + your container registry + dependency mirrors. If the runner needs production-network access, that is a smell — almost always solvable with OIDC short-lived creds + a dedicated bastion/service, not direct VPC peering.
- **Runner secret-scope minimum**. The registration token is short-lived; rotate. The job inherits secrets only when explicitly granted via `secrets:` block. Use environment protection rules + required reviewers for any secret that touches production. Never bake long-lived PATs or cloud keys into the runner host image.
- **M / L / XL machine tier per workload**. Right-sizing matters because most jobs are not CPU-bound. The 2026 norm:
  - **M (2 vCPU / 8 GB)** — lint, unit tests, type-check, small Node/Python jobs. Default for PR checks. Example hosted SKUs: GitHub `ubuntu-22.04` standard, Depot 2-CPU tier, Namespace Developer 2-amd64, Ubicloud 2 vCPU standard. Tier-name SKUs shift; consult the provider catalog.
  - **L (8 vCPU / 32 GB)** — integration tests with services, monorepo builds, Docker image builds. Example hosted SKUs: GitHub `ubuntu-latest-8core`, Depot/RunsOn 8-CPU profile.
  - **XL (16–32 vCPU / 64–128 GB)** — full-repo scans, large Rust/C++ compiles, native iOS/Android builds. Often the cost-justification line for an alternative provider. Example hosted SKUs: GitHub `ubuntu-latest-32core` (premium pricing), Depot/RunsOn/Namespace 16–32 vCPU tiers.
- **Right-sizing + autoscale**: pair with `cloud-cost-analyzer`. Karpenter is the 2026 default for autoscaling the Kubernetes node pool that backs ARC runners — spot/burstable instances, scale-to-zero idle.
- **GitHub charges $0.002/min for self-hosted runner minutes** as of March 2026 — self-hosted is no longer free for private-repo workflows. Factor this into the build-vs-buy decision against alternatives whose public list prices in May 2026 were: Namespace ~$0.0015/min (Developer plan PAYG), Ubicloud from $0.0008/min (2 vCPU standard), RunsOn €300/yr commercial license + your AWS spot bill. Depot, Blacksmith, Warpbuild publish per-tier pricing on their sites — verify before committing budget. Provider prices and tier names shift; check the vendor's pricing page on the day you decide.

## CRITICAL: Always Ask, Never Assume

```
+-------------------------------------------------------------+
|              DECISION EXPLORATION REQUIRED                   |
|   NEVER auto-detect existing runners                         |
|   NEVER assume user preferences                              |
|   ALWAYS present 3 options with pros/cons                    |
|   ALWAYS let user make informed decision                     |
+-------------------------------------------------------------+
```

## Decision Exploration Format

When triggered, present this exact format:

```
===============================================================
                    CI RUNNER PREFERENCE
===============================================================

How do you want to run GitHub Actions?

[1] GitHub-Hosted (Recommended for OSS, fork PRs, and most teams)
    [+] Zero setup - works immediately
    [+] Ephemeral by design - clean environment each run
    [+] GitHub manages security updates and OS image pinning
    [+] Safe for public repos and fork PRs
    [-] Per-minute pricing on private repos; Windows/macOS at premium multiples
    [-] Default M tier is 2 vCPU - upgrade tiers cost more
    [-] Can't access your local network resources

[2] Self-Hosted via ARC on Kubernetes (org-wide CI, perf-sensitive)
    [+] Ephemeral container per job (set --ephemeral)
    [+] Autoscale via runner scale sets + Karpenter spot pool
    [+] Often 3-7x cheaper than GitHub-hosted at L/XL tier
    [+] Pin OS images, run on your VPC, your IAM
    [-] You own patching, log forwarding, secret rotation
    [-] $0.002/min self-hosted runner fee applies (March 2026+)
    [-] DO NOT use for public repos / fork PRs

[3] Hosted Alternative (Depot, Namespace, RunsOn, Ubicloud, Blacksmith)
    [+] Cheaper than GitHub-hosted at most tiers
    [+] Faster cold-start, larger machine options, GPU options (RunsOn)
    [+] Ephemeral by default
    [-] Verify the provider is operating (BuildJet shut down Jan 2026)
    [-] Adds a third-party SOC2 dependency to your CI critical path
    [-] Some run in your AWS (RunsOn) - still your infra to monitor

[0] Ask Me Later
===============================================================
```

For GitLab CI, swap GitHub-Hosted for "GitLab SaaS runners" and ARC for "GitLab Runner Helm chart on Kubernetes" — same trade-off shape.

## Security Warning for Public Repos

If the project is a public repository or accepts fork PRs, show this warning before any self-hosted setup:

```
[!] SECURITY WARNING [!]
===============================================================
This repository accepts pull requests from forks. Self-hosted
runners on this repo are DANGEROUS:

1. Fork PRs can run arbitrary code on YOUR runner
2. The "pwn request" attack class (pull_request_target + checkout
   of PR head) gives attackers your repo secrets + Write token
3. workflow_run can be poisoned via artifacts from unprivileged
   triggering workflows
4. Even with ephemeral runners, secrets in env can leak in a
   single job execution

RECOMMENDATIONS:
- Use GitHub-Hosted (or Depot/Namespace/RunsOn) for fork PRs
- Reserve self-hosted ARC for the private, internal, push-on-main
  workflows only
- Route fork PRs to hosted via runs-on conditional logic
- Use the "Require approval for first-time contributors" setting
- Never use pull_request_target + actions/checkout of PR head
- Treat workflow_run artifacts from unprivileged workflows as
  attacker-controlled until validated

Continue with self-hosted setup? [y/N]
===============================================================
```

## Prerequisites Check

```bash
# Self-hosted single-host (legacy pattern — use only for private repos)
- [ ] Linux x64 / arm64, macOS, or Windows runner host
- [ ] 4GB+ RAM, 2 vCPU minimum (M tier)
- [ ] 30GB+ disk space (build artifacts + cached actions)
- [ ] Network egress to api.github.com + your registry only

# ARC on Kubernetes (recommended for self-hosted at any scale)
- [ ] Kubernetes 1.28+ cluster (EKS / GKE / AKS / vanilla)
- [ ] kubectl + helm 3.x installed
- [ ] cert-manager (ARC dependency)
- [ ] Dedicated namespace for runner pods (not the operator's)
- [ ] NetworkPolicy + PodSecurityStandard restricted in the namespace
- [ ] Karpenter or Cluster Autoscaler for node pool scale
- [ ] External log sink (CloudWatch / Loki / Datadog) wired up
```

## Setup Wizard Steps

### Path A: Single self-hosted runner (private repo only, ephemeral)

```bash
# 1. Download the runner (pin version — do NOT use 'latest' in production)
RUNNER_VERSION="<PIN_CURRENT_VERSION>"   # check https://github.com/actions/runner/releases
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz -L \
  https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz
echo "<SHA256 from release page>  actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" | sha256sum -c
tar xzf ./actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz

# 2. Short-lived registration token
gh api -X POST repos/{owner}/{repo}/actions/runners/registration-token | jq -r .token

# 3. Configure ephemeral (--ephemeral makes the runner exit after one job)
./config.sh --url https://github.com/{owner}/{repo} \
  --token <REGISTRATION_TOKEN_PLACEHOLDER> \
  --name "host-$(hostname)-$(uuidgen | cut -c1-8)" \
  --labels "self-hosted,linux,x64,ephemeral,tier-m" \
  --ephemeral --unattended

# 4. Run as a service (re-registers via outer loop after each ephemeral exit)
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

### Path B: ARC on Kubernetes (recommended for self-hosted at scale)

```bash
# 1. Install ARC operator (pin chart version — verify current on ghcr.io/actions)
NAMESPACE_OPERATOR="arc-systems"
NAMESPACE_RUNNERS="arc-runners"
ARC_VERSION="<PIN_CURRENT_VERSION>"   # check https://github.com/actions/actions-runner-controller/releases
helm install arc \
  --namespace ${NAMESPACE_OPERATOR} --create-namespace \
  --version ${ARC_VERSION} \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller

# 2. Create a GitHub App (recommended over PAT) and store creds as a Kubernetes Secret
kubectl create secret generic arc-github-app \
  --namespace ${NAMESPACE_RUNNERS} \
  --from-literal=github_app_id="<APP_ID_PLACEHOLDER>" \
  --from-literal=github_app_installation_id="<INSTALL_ID_PLACEHOLDER>" \
  --from-file=github_app_private_key="<PATH_TO_KEY_PLACEHOLDER>"

# 3. Install a runner scale set
helm install arc-runner-set \
  --namespace ${NAMESPACE_RUNNERS} --create-namespace \
  --version ${ARC_VERSION} \
  --set githubConfigUrl="https://github.com/<ORG_OR_REPO_PLACEHOLDER>" \
  --set githubConfigSecret=arc-github-app \
  --set minRunners=0 \
  --set maxRunners=50 \
  --set containerMode.type=dind \
  --set runnerScaleSetName=ubuntu-m \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set

# 4. NetworkPolicy restricting runner egress (minimum example)
kubectl apply -n ${NAMESPACE_RUNNERS} -f - <<'YAML'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: runner-egress-allowlist
spec:
  podSelector:
    matchLabels:
      actions.github.com/scale-set-name: ubuntu-m
  policyTypes: [Egress]
  egress:
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels: { app: registry-proxy }
    - ports:
        - protocol: TCP
          port: 443
YAML
```

### Path C: Hosted alternative (Depot example)

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    runs-on: depot-ubuntu-24.04-4     # pin OS, pin tier
    steps:
      - uses: depot/setup-action@v1
      - uses: actions/checkout@v4
      # rest of workflow unchanged
```

### Workflow change — split fork PRs to hosted, push to self-hosted

```yaml
jobs:
  test:
    runs-on: ${{ github.event.pull_request.head.repo.fork && 'ubuntu-22.04' || 'self-hosted' }}
    # fork PRs run on hosted; first-party push/PR uses ARC
```

## 7-Language Runner Configuration Matrix

Each row gives the minimum-viable `runs-on` for the language + a note on why. All examples pin OS image versions (rule from 2026 Best Practices above).

### C# / .NET 9 — windows-2022 + ubuntu-22.04 matrix

```yaml
jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-22.04, windows-2022]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with: { dotnet-version: '9.0.x' }
      - run: dotnet restore
      - run: dotnet build --configuration Release --no-restore /warnaserror
      - run: dotnet test --no-build --verbosity normal
```

Note: matrix because .NET 9 ships full Windows + Linux support; some teams also want `macos-14` for client-side MAUI. Tier M is fine for typical service builds.

### Java — linux + macOS for native arch builds

```yaml
jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-22.04, macos-14]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: 'temurin', java-version: '21', cache: 'maven' }
      - run: ./mvnw -B verify
```

Note: macOS only when you ship arm64-native artifacts (JNI, GraalVM native-image). Otherwise drop to linux-only. Tier L for monorepos with Spring Boot integration tests.

### Python — linux primarily

```yaml
jobs:
  test:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12', cache: 'pip' }
      - run: pip install -r requirements.txt
      - run: pytest --cov=. --cov-fail-under=80
```

Note: Python on Windows/macOS only when you ship native wheels (C extensions). For pure-Python apps, Linux-only at M tier covers 95%+ of cases.

### C — Linux + macOS + Windows

```yaml
jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-22.04, macos-14, windows-2022]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - name: configure
        run: cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -Werror
      - run: cmake --build build --parallel
      - run: ctest --test-dir build --output-on-failure
```

Note: C portability claim is empty without a 3-OS matrix. Tier L for parallel build speed.

### C++ — same plus ARM via cross-compile

```yaml
jobs:
  build:
    strategy:
      matrix:
        include:
          - os: ubuntu-22.04
            arch: x86_64
          - os: macos-14
            arch: arm64
          - os: windows-2022
            arch: x86_64
          - os: ubuntu-22.04
            arch: aarch64
            cross: true
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - if: matrix.cross
        run: sudo apt-get install -y gcc-aarch64-linux-gnu g++-aarch64-linux-gnu
      - run: cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE=cmake/${{ matrix.arch }}.cmake -Werror
      - run: cmake --build build --parallel
```

Note: macos-14 is arm64-native; Linux aarch64 via cross-compile until/unless you adopt arm64-native runners (ARC supports arm64 node pools; Depot/RunsOn offer arm64 hosted tiers). Tier XL on full-repo builds.

### TypeScript — Node setup

```yaml
jobs:
  test:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

Note: TS is the easy case — Linux M tier, Node 20 LTS (or 22 once your toolchain is ready). No matrix needed unless you ship native addons (then add `windows-2022`).

### SQL — Postgres service

```yaml
jobs:
  test:
    runs-on: ubuntu-22.04
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: <CI_LOCAL_PASSWORD_PLACEHOLDER>
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - run: psql -h localhost -U postgres -f schema.sql
      - run: psql -h localhost -U postgres -f tests/integration.sql
```

Note: SQL doesn't run on Windows/macOS runners for CI — always Linux with a service container. Pin the Postgres major version. The password is local to the runner network; never reuse a production credential.

## Output Format

```
===============================================================
              [OK] RUNNER SETUP COMPLETE
===============================================================

Runner Type:   <github-hosted | self-hosted-single | arc | depot | ...>
Tier:          <M | L | XL>
Labels:        self-hosted, linux, x64, ephemeral, tier-m
OS Pinned:     ubuntu-22.04
Ephemeral:     yes
Network:       allowlist (api.github.com, ghcr.io, registry.npmjs.org)
Secret-scope:  minimum (registration token only)

Your preference has been saved to ~/.ctoc/settings.yaml

Next steps:
1. Workflows use this runner via:
   runs-on: [self-hosted, linux, tier-m]
2. Check runner status: ctoc ci runner status
3. Manage ARC scale set: kubectl -n arc-runners get autoscalingrunnersets
4. Forward runner logs to your log sink (required for ephemeral)
===============================================================
```

## Vulnerability / Misconfiguration Categories

When this skill runs as a critic (during runner config review), classify findings into these categories. Every category emits as `severity: critical` per warnings-are-bugs.

### 1. Persistent self-hosted runner (state leak)

Runner configured without `--ephemeral`, or ARC scale set with `containerMode.type` left empty + workspace volumes persisting between jobs. Each job inherits the previous job's state — dropped binaries, mutated `$PATH`, lingering background processes, cached secrets in `~/.aws/credentials` or `~/.ssh/`. Detection: registration command lacks `--ephemeral`; ARC values lack `template.spec.restartPolicy: Never`; runner host has no autoscaler reaping idle runners.

### 2. Runner with network access to production

Runner pod / VM is in the same VPC subnet as production databases or services, or has IAM granting `s3:*`, `secretsmanager:GetSecretValue` on prod secrets, or `iam:PassRole` to a production role. Any compromised job (which on public repos is one fork PR away) becomes a direct path to data exfil. Detection: runner security group / NetworkPolicy permits egress to non-CI subnets; IAM role attached to runner has `Resource: "*"` or production ARNs; runner can `dig` internal production DNS names.

### 3. Missing OS-image pinning

`runs-on: ubuntu-latest`, `runs-on: macos-latest`, `runs-on: windows-latest` in production workflows. The alias floats. GitHub announces moves months ahead, but pinning is the only defense against silent breakage when, e.g., `ubuntu-latest` moves from 22.04 to 24.04. Same rule for ARC container images and AMI IDs in self-hosted node pools. Detection: any `runs-on: *-latest`; ARC `template.spec.containers[].image` lacks a tag or uses `:latest`; AMI/image SHA missing in IaC.

### 4. Runner allowing untrusted PR fork code (workflow_run / pull_request_target)

The "pwn request" attack family. Variants:
- `pull_request_target` + `actions/checkout` of `${{ github.event.pull_request.head.sha }}` — runs attacker code with repo Write token and full secrets.
- `workflow_run` triggered by an unprivileged triggering workflow whose artifact the privileged workflow consumes — attacker poisons the artifact in the PR, privileged workflow runs the poison.
- Self-hosted runner with default settings: a fork PR can include `runs-on: [self-hosted, linux]` and immediately execute on your host.

Detection: grep workflows for `pull_request_target` + `actions/checkout` of head ref; any `workflow_run` consuming artifacts from a triggering workflow that runs on `pull_request`; self-hosted runners attached to a repo that accepts fork PRs without "Require approval for first-time contributors".

### 5. Missing cache eviction policy

Runner caches grow unbounded; old branch caches stick around forever. Beyond disk pressure, poisoned cache entries persist across jobs. Detection: ARC values lack a cache PV TTL; self-hosted runners lack a `find ~/_work -mtime +14 -delete` cron; `actions/cache` keys without a scoped prefix (`${{ runner.os }}-${{ hashFiles('package-lock.json') }}`) that lets you invalidate cleanly.

### 6. Runner with overly broad cloud IAM

The runner identity (instance profile / pod IRSA / workload identity) has `*` permissions or admin-level role assumption capability. A single compromised job becomes account-wide compromise. Detection: instance profile policy has `Action: "*"` or `Resource: "*"`; pod's IRSA role can assume any role in the account (`sts:AssumeRole` with `Resource: "*"`); GKE workload identity bound to a service account with project-Owner.

## Tool Integration (2026)

| Tool | Strengths | Trade-offs | When |
|---|---|---|---|
| **Actions Runner Controller (ARC)** | GitHub-blessed reference impl; scale sets API; ephemeral by design; Kubernetes-native | You own the cluster, log forwarding, networking | Org-wide self-hosted on K8s |
| **Depot** | Faster boot than GitHub-hosted; M/L/XL tiers; remote cache for Docker builds | Third-party; tied to Depot's availability | Hosted alternative when GitHub-hosted is too slow/expensive |
| **BuildJet** | Half-price GitHub-hosted (was) | **Shut down January 2026 — verify before adoption** | Do not use |
| **RunsOn** | Runs in your AWS account; spot pricing 7-17x cheaper claim; GPU support; €300/yr license fee | Your AWS bill + license; you operate it | AWS shops with spot budget + need for GPU/large tiers |
| **Namespace** | Pay-as-you-go ~$0.0015/min; managed; ARM tier leads benchmarks (per Better Stack/Namespace claims) | Third-party | Cost-sensitive teams; ARM workloads |
| **Ubicloud** | Sub-$0.001/min starting tier; open-source provider | Smaller ecosystem; newer | Cost-floor builds; OSS preference |
| **Buildkite** | Hybrid agents (your hosts, their orchestration); polyglot pipeline DSL | Different mental model from Actions; separate billing | Multi-CI orgs; teams needing pipeline-as-data |
| **GitLab Runner (Helm chart)** | GitLab's first-party; Kubernetes executor; autoscale via `kubernetes` executor | GitLab-only; not a GitHub Actions replacement | GitLab CI shops |
| **Karpenter** | Just-in-time node provisioning for the K8s cluster backing ARC; spot-first | EKS-focused; learning curve | Backing pool for ARC at scale |

Pair this skill with `cloud-cost-analyzer` for tier-vs-cost analysis and `docker-security-checker` for the runner image itself.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used in your human-readable runner config report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire.

| Triage tier | Examples | Internal action |
|---|---|---|
| CRITICAL | Self-hosted runner on public repo w/ fork PR access; `pull_request_target` + checkout PR head; runner IAM with `*`; persistent runner with prod network egress | BLOCK |
| HIGH | Missing OS-image pin (`ubuntu-latest`); `workflow_run` consuming unverified artifacts; runner without `--ephemeral`; missing log forwarding for ephemeral runners | BLOCK |
| MEDIUM | Cache without scoped prefix; runner labels too generic; missing cache TTL; long-lived registration token | Fix soon |
| LOW | Runner name not including hostname/uuid (operational hygiene); registry mirror not configured (perf) | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields. This mirrors the schema used by `sast-scanner` so the integrator can dedupe across skills.

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>      # fingerprint for dedup
severity: critical                                     # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                        # high = corroborated by docs+config; low = single-signal
engine: ci-runner-setup
kind: persistent-runner | prod-network-access | missing-os-pin | fork-pr-untrusted-code | missing-cache-eviction | broad-cloud-iam
target_file: .github/workflows/ci.yml | helm/arc/values.yaml | terraform/runner-iam.tf
line: 42
runner_type: github-hosted | self-hosted-vm | self-hosted-arc | depot | namespace | runson | ubicloud | gitlab-helm | other
message: "Self-hosted runner attached to public repo; fork PRs can execute arbitrary code"
suggested_fix: "Move fork-PR workflows to ubuntu-22.04 hosted; reserve self-hosted for push events on main"
reference: https://docs.github.com/en/actions/reference/security/secure-use
```

The integrator uses `confidence` and `runner_type` to weight findings — a `confidence: low` finding on a hosted runner doesn't block phase advancement on its own, but a `kind: fork-pr-untrusted-code` on a `runner_type: self-hosted-*` is always blocking regardless of confidence (warnings-are-bugs + the pwn-request attack class is too well-documented to defer).

## Special Considerations

- **Third-party runner providers**: verify operational status before adopting (BuildJet's January 2026 shutdown and Cirrus Runners' April 2026 acquisition both stranded customers mid-migration). Bake provider-failure scenarios into the decision.
- **Public repo + fork PRs**: there is no safe self-hosted answer. Route fork PRs to hosted via conditional `runs-on`. Period.
- **Cost math at scale**: at >5000 build-minutes/month, alternatives typically beat GitHub-hosted on $/min for L+ tiers. Below that, GitHub-hosted's zero-ops wins. Pair with `cloud-cost-analyzer`.
- **Legacy persistent runners**: document as tech debt with migration path to ARC + ephemeral. Don't gate the build, but track via `technical-debt-tracker`.
- **OIDC for cloud auth**: never bake AWS/GCP/Azure keys into the runner. Use the cloud provider's OIDC trust to GitHub Actions (`token.actions.githubusercontent.com`) with a job-scoped role.

## Red Lines

- NEVER auto-detect and silently configure a runner
- NEVER skip the public-repo / fork-PR warning
- NEVER recommend long-lived persistent self-hosted runners
- NEVER suggest baking long-lived secrets into the runner host
- NEVER recommend `runs-on: *-latest` in production workflows
- NEVER recommend `pull_request_target` + `actions/checkout` of PR head
- NEVER hand-wave the IAM scope of the runner identity

---

## Refinement Loop — critic mode (v6.9.15)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every misconfigured runner, missing pin, untrusted-fork-code path, and overly broad runner IAM emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: an unpinned runner today is a green-build-with-known-bad-state tomorrow. Code that ships green-with-unpinned-runners ships with a latent supply-chain failure.
