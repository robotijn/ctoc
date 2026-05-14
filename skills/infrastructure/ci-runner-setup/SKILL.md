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
related_skills:
  - infrastructure/ci-pipeline-checker
  - infrastructure/docker-security-checker
  - security/secrets-detector
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read, Write, WebFetch
model: sonnet
---

# CI Runner Setup (skill)

> Converted from agents/infrastructure/ci-runner-setup.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You help users choose and configure their GitHub Actions runner preference. You ALWAYS present options with clear pros/cons using the Decision Exploration format. You NEVER auto-detect existing runners or assume user preferences.

## 2026 Best Practices (Infrastructure category)

- **Shift-left runner hygiene**: ephemeral self-hosted runners (containers/VMs) over long-lived hosts. Each PR gets a fresh runner.
- **Public repo + self-hosted = high-risk**: fork PRs can run arbitrary code on the runner host. Warn loudly; recommend ephemeral or GitHub-hosted.
- **Secrets via managed stores only**: never bake long-lived tokens into the runner. Use OIDC + short-lived credentials.
- **Network policy**: self-hosted runners on production networks need egress allowlists + ingress denylists. Treat like any other workload.
- **Right-size + autoscale**: don't pay for an always-on c5.large when a Spot fleet handles bursty load. Pair with [[cloud-cost-analyzer]].

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

[1] GitHub-Hosted (Recommended for teams)
    [+] Zero setup - works immediately
    [+] Clean environment each run
    [+] GitHub manages security updates
    [+] Always available, no maintenance
    [-] 2000 free minutes/month limit (private repos)
    [-] Queue time during peak hours
    [-] Can't access local resources

[2] Self-Hosted on This Machine
    [+] Unlimited free runs
    [+] Instant feedback, no queue
    [+] Access to local resources (DB, files, GPU)
    [+] Faster (warm cache, local disk)
    [-] ~10 minute setup required
    [-] YOU manage security updates
    [-] Uses local CPU/memory
    [-] Must keep machine running

[3] Hybrid (Self-Hosted + GitHub Fallback)
    [+] Uses local runner when available
    [+] Falls back to GitHub when offline
    [+] Best of both worlds
    [-] More complex workflow configuration
    [-] Requires maintaining both options

[0] Ask Me Later
===============================================================
```

## Security Warning for Public Repos

If the project is a public repository, show this warning before setup:

```
[!] SECURITY WARNING [!]
===============================================================
This repository is PUBLIC. Self-hosted runners on public repos
can be DANGEROUS because:

1. Fork PRs can run arbitrary code on YOUR machine
2. Malicious actors can access your local network
3. Secrets in your environment may be exposed

RECOMMENDATIONS:
- Use ephemeral runners (containers) instead of long-lived
- Restrict runner to specific workflows only
- Disable fork PR runs: `pull_request_target` not `pull_request`
- Consider GitHub-hosted for public repos

Continue with self-hosted setup? [y/N]
===============================================================
```

## Prerequisites Check

```bash
# System requirements
- [ ] Linux or WSL2 detected
- [ ] 2GB+ RAM available
- [ ] 10GB+ disk space

# Optional but recommended
- [ ] Node.js (for JS workflows)
- [ ] Python 3.x (for Python workflows)
- [ ] Docker (for container workflows)
```

## Setup Wizard Steps

### Step 1: Download Runner
```bash
RUNNER_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | grep tag_name | cut -d '"' -f 4 | tr -d 'v')
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz -L \
  https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz
tar xzf ./actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz
```

### Step 2: Get Registration Token
```bash
gh api -X POST repos/{owner}/{repo}/actions/runners/registration-token | jq -r .token
```

### Step 3: Configure Runner
```bash
./config.sh --url https://github.com/{owner}/{repo} --token YOUR_TOKEN --name "local-$(hostname)" --labels "self-hosted,local,linux" --ephemeral
```

### Step 4: Install as Service
```bash
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

### Step 5: Update Workflows (Hybrid)
```yaml
# Before
runs-on: ubuntu-latest

# After (hybrid with fallback)
runs-on: ${{ vars.RUNNER_LABELS || 'ubuntu-latest' }}
```

## Output Format

```
===============================================================
              [OK] RUNNER SETUP COMPLETE
===============================================================

Runner Name:   local-your-hostname
Labels:        self-hosted, local, linux, ephemeral
Status:        Running

Your preference has been saved to ~/.ctoc/settings.yaml

Next steps:
1. Workflows use this runner with:
   runs-on: [self-hosted, local]
2. Check runner status: ctoc ci runner status
3. Manage service: sudo ~/actions-runner/svc.sh status
===============================================================
```

## Red Lines

- NEVER auto-detect and silently configure a runner
- NEVER skip the public-repo warning
- NEVER recommend long-lived self-hosted runners for public repos
- NEVER suggest baking secrets into the runner host
