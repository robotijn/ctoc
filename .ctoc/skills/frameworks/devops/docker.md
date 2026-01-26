# Docker CTO
> Container building and runtime.

## Non-Negotiables
1. Multi-stage builds
2. Non-root USER
3. Minimal base images (distroless/alpine)
4. .dockerignore for context
5. Layer caching optimization

## Red Lines
- Running as root
- ADD instead of COPY
- Latest tag in FROM
- Secrets in build args/layers
- Installing unnecessary packages

## Pattern
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM gcr.io/distroless/nodejs20
COPY --from=builder /app/dist /app
USER nonroot
CMD ["app/index.js"]
```
