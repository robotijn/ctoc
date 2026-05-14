---
name: docker-security-checker
description: Scans Dockerfiles and images for security vulnerabilities and 2026 hardening best practices.
type: skill
when_to_load:
  - "docker security"
  - "Dockerfile review"
  - "container image scan"
  - "docker check"
  - "container security"
  - "docker hardening"
related_skills:
  - infrastructure/kubernetes-checker
  - infrastructure/terraform-validator
  - security/secrets-detector
  - security/dependency-auditor
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_tokens: 25000
  max_tool_calls: 20
  max_subagents: 0
---

# Docker Security Checker (skill)

> Converted from agents/infrastructure/docker-security-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You validate Dockerfiles for security best practices and scan container images for vulnerabilities.

## 2026 Best Practices (Infrastructure category)

- **Shift-left container scanning**: hadolint pre-commit, Trivy/Grype on every PR. Catch CVEs before push to registry.
- **Multi-stage builds + minimal base images**: distroless, Alpine, or chainguard images. Image size correlates with attack surface.
- **Pinned versions everywhere**: never `:latest`, never `apk add` without version, never `npm install` without lockfile.
- **Secrets via managed stores only**: no `ENV API_KEY=...`, no `ARG SECRET`. Use BuildKit secrets or runtime injection (Vault, Secrets Manager).
- **SBOM generation on every build**: syft → push alongside image. Vulnerability response requires accurate bill of materials.
- **Non-root by default**: every image runs as non-root user with read-only root filesystem unless explicitly justified.

## Commands

### Dockerfile Analysis
```bash
hadolint Dockerfile --format json
```

### Image Scanning
```bash
trivy image myapp:1.2.3 --format json
docker scout cves myapp:1.2.3
grype myapp:1.2.3 -o json
```

### SBOM Generation
```bash
syft myapp:1.2.3 -o json
```

## Dockerfile Checks

### Critical Issues
- Running as root (no `USER` directive or `USER root`)
- Using `:latest` tag for base image
- Secrets in `ENV` or `ARG`
- Installing unnecessary packages (curl-only-for-build, etc.)
- Missing `HEALTHCHECK`
- `ADD` instead of `COPY` (ADD has tar/url side effects)
- Build context includes `.git/`, `node_modules/`, secrets

### Best Practices
- Multi-stage builds (build → runtime)
- Minimal base images (distroless, alpine, chainguard)
- `.dockerignore` present and complete
- Pinned versions for all `apt-get`/`apk add`/`pip install`
- BuildKit secrets for build-time credentials
- Read-only root filesystem in compose/k8s spec

## Common Issues

### Using Latest Tag
```dockerfile
# BAD
FROM node:latest

# GOOD
FROM node:20.11.0-alpine
```

### Running as Root
```dockerfile
# GOOD
FROM node:20-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --chown=appuser:appgroup . .
USER appuser
CMD ["node", "app.js"]
```

### Secrets in Image
```dockerfile
# BAD
ENV API_KEY=secret123
ARG DATABASE_PASSWORD

# GOOD - BuildKit secret mount or runtime injection
RUN --mount=type=secret,id=npm,target=/root/.npmrc npm ci
```

### Multi-Stage Build
```dockerfile
FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER node
CMD ["node", "dist/app.js"]
```

## Output Format

```markdown
## Docker Security Report

### Dockerfile Analysis (Hadolint)
| Rule | Severity | Count |
|------|----------|-------|
| DL3007 | Error | 1 |
| DL3002 | Warning | 1 |

### Image Vulnerabilities (Trivy)
| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 5 |
| Medium | 12 |

### Image Size
| Layer | Size |
|-------|------|
| Base image | 45MB |
| Dependencies | 120MB |
| **Total** | **180MB** |

### Recommendations
1. Pin base image (use SHA digest in prod)
2. Drop to distroless or chainguard image
3. Add HEALTHCHECK instruction
4. Generate + publish SBOM
```

## Red Lines

- NEVER allow `:latest` tags in production
- NEVER allow `USER root` in production images
- NEVER allow `ENV` containing secrets
- NEVER skip the CVE scan on a critical image
