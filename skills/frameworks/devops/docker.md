# Docker CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Docker Engine 27.x (APT method - recommended)
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update && sudo apt-get install docker-ce docker-ce-cli containerd.io
```

## Claude's Common Mistakes
1. **Uses ADD instead of COPY** - ADD has implicit tar extraction and URL fetching
2. **Runs as root by default** - Must specify non-root USER
3. **Combines unrelated RUN commands** - Busts cache unnecessarily
4. **Uses `latest` base image** - Pin specific versions
5. **Installs unnecessary packages** - Increases attack surface

## Correct Patterns (2026)
```dockerfile
# Multi-stage build with security best practices
FROM node:22-alpine AS builder
WORKDIR /app
# Copy package files first (layer caching)
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# Production stage with distroless
FROM gcr.io/distroless/nodejs22-debian12
WORKDIR /app
# Use non-root user
USER nonroot:nonroot
COPY --from=builder --chown=nonroot:nonroot /app/dist ./dist
COPY --from=builder --chown=nonroot:nonroot /app/node_modules ./node_modules

EXPOSE 8080
CMD ["dist/index.js"]
```

## Version Gotchas
- **Docker 27.x**: BuildKit default, classic builder deprecated
- **Docker 27.3+**: OCI image spec 1.1 support
- **Rocky Linux**: Use overlay2 storage driver (default)
- **With SELinux**: Use :Z suffix for volume mounts

## What NOT to Do
- Do NOT use ADD when COPY suffices - security risk
- Do NOT run as root without justification
- Do NOT put secrets in build args or layers
- Do NOT use `latest` tag in FROM
- Do NOT skip multi-stage builds - bloated images
