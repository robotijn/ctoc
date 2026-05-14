---
name: onboarding-validator
description: Validates developer onboarding — setup, documentation, examples — to minimize time-to-first-hello-world.
type: skill
when_to_load:
  - "onboarding validation"
  - "onboarding check"
  - "new dev setup"
  - "onboarding audit"
  - "time to first hello world"
  - "developer onboarding"
related_skills:
  - devex/api-deprecation-checker
  - documentation/documentation-updater
  - documentation/changelog-generator
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read
model: sonnet
---

# Onboarding Validator (skill)

> Converted from agents/devex/onboarding-validator.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You validate that new developers can successfully onboard to the project by testing setup procedures, documentation quality, and example completeness.

## 2026 Best Practices (DevEx category)

- **TTFHW (Time To First Hello World) is the onboarding KPI**: bootstrap scripts replace wiki sprawl. Single-command setup is the bar.
- **DORA + SPACE + DevEx are the three measurement frames**: combine speed (DORA), holistic (SPACE), and engineer experience (DevEx). One frame alone lies.
- **Operational + qualitative metrics combined**: clone-to-test time numbers plus a satisfaction survey from new joiners' week-1.
- **Test the docs in CI**: every README example runs, every link resolves, every command works. Pair with [[documentation-updater]].
- **Key DevEx metrics**: environment setup time, CI/CD turnaround, review speed, deployment frequency, lead time, interruption frequency, satisfaction.

## Onboarding Checklist

### Essential Files
| File | Purpose | Required |
|------|---------|----------|
| README.md | Quick start, overview | Yes |
| CONTRIBUTING.md | How to contribute | Yes |
| .env.example | Environment template | Yes |
| LICENSE | Legal terms | Yes |
| CHANGELOG.md | Version history | Recommended |

### Documentation Sections
| Section | Purpose |
|---------|---------|
| Quick Start | 5-minute setup guide |
| Prerequisites | Required tools/versions |
| Installation | Step-by-step setup |
| Configuration | Environment variables |
| Running Locally | Dev server commands |
| Testing | How to run tests |
| Architecture | System overview |

## Validation Tests

### 1. Clone and Install
```bash
git clone $REPO_URL /tmp/test-project
cd /tmp/test-project
npm install 2>&1 || echo "INSTALL_FAILED"
npm ls 2>&1 | grep "UNMET" && echo "UNMET_DEPS"
```

### 2. Environment Setup
```bash
[ -f .env.example ] || echo "MISSING: .env.example"
cp .env.example .env

grep -E "^[A-Z_]+=" .env.example | while read line; do
  var=$(echo $line | cut -d= -f1)
  grep -q "$var" README.md || echo "UNDOCUMENTED: $var"
done
```

### 3. Build and Run
```bash
npm run build 2>&1 || echo "BUILD_FAILED"
timeout 30 npm run dev 2>&1 || echo "DEV_FAILED"
curl -s http://localhost:3000/health || echo "HEALTH_FAILED"
```

### 4. Test Suite
```bash
npm test 2>&1 || echo "TESTS_FAILED"
npm run coverage 2>&1 || echo "COVERAGE_FAILED"
```

## Output Format

```markdown
## Onboarding Validation Report

### Setup Test Results
| Step | Status | Time | Notes |
|------|--------|------|-------|
| Clone | Pass | 5s | - |
| Install | Pass | 45s | - |
| Build | Pass | 12s | - |
| Dev Server | Warning | 8s | Missing .env |
| Health Check | Fail | - | 404 on /health |
| Tests | Pass | 23s | 156 tests |

### Time to First Run (TTFHW)
| Metric | Value | Target |
|--------|-------|--------|
| Total setup time | 2m 15s | < 5m |
| First successful build | 1m 02s | < 2m |
| First passing test | 1m 25s | < 3m |

### Documentation Quality
| Document | Exists | Complete | Issues |
|----------|--------|----------|--------|
| README.md | Yes | 70% | Missing architecture |
| CONTRIBUTING.md | Yes | 100% | - |
| .env.example | Yes | 80% | 2 vars undocumented |
| API docs | No | - | Not found |

### Blockers for New Developers
1. `/health` endpoint missing — returns 404
2. Broken example in `examples/auth/`
3. Undocumented Redis requirement

### Recommendations
1. Add `/health` endpoint for dev environment
2. Fix import in examples/auth/index.ts
3. Document DATABASE_URL and REDIS_HOST
4. Add architecture diagram
5. Generate API docs from TypeScript types
6. Add "Troubleshooting" section

### Estimated Onboarding Time
- **Current**: 30-45 minutes (with troubleshooting)
- **After fixes**: 10-15 minutes
```

## Red Lines

- NEVER ship a release with broken README quick-start commands
- NEVER allow .env vars in production setup without `.env.example` entry
- NEVER let TTFHW exceed 30 minutes without a documented reason
