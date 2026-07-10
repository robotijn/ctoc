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

## Build Footguns (image size + cache correctness)
The single biggest source of slow, bloated, cache-busting images Claude generates
is **instruction order** and a missing `.dockerignore`.

```dockerfile
# FOOTGUN: `COPY . .` before the dependency install re-downloads every dependency
# on ANY source change, because the COPY layer's hash changes and busts the cache
# for every layer below it.
#   COPY . .
#   RUN npm ci            # ← re-runs on every source edit

# RIGHT: copy the lockfile first so the expensive install layer is cached and only
# re-runs when dependencies actually change:
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci                       # cached until package-lock.json changes
COPY . .                         # source churn no longer busts the install layer
RUN npm run build
```
- **`.dockerignore` is mandatory.** Without it, `COPY . .` ships `.git/`,
  `node_modules/`, local `.env` files (secret leak — see Security below), and build
  caches into the image and the build context sent to the daemon. Add at minimum:
  `.git`, `node_modules`, `.env*`, `**/*.log`, `dist`, `.dockerignore` itself is read
  before the context is packed.
- **Pin the base image by digest, not `latest`.** `latest` is a moving target — the
  same Dockerfile silently pulls a different base next week, breaking reproducibility
  and re-introducing patched-then-regressed CVEs. Pin: `FROM node:22.12-bookworm-slim@sha256:<digest>`.
  Update digests deliberately (Renovate/Dependabot), not implicitly.
- **Multi-stage to drop the toolchain.** The `builder` stage carries compilers,
  dev headers and the full `node_modules`; the final stage copies only the built
  artifact (`--from=builder`). Distroless/`-slim` finals shrink attack surface and
  size by an order of magnitude.
- **`--platform` / `buildx` for multi-arch.** `docker buildx build --platform
  linux/amd64,linux/arm64` produces a manifest list; a plain `docker build` on an
  Apple-silicon host silently emits an arm64-only image that fails on amd64 hosts.
- Source: docs.docker.com Dockerfile best practices + build cache. See References.

## Runtime Footguns (PID 1, signals, limits)
```dockerfile
# FOOTGUN: your process runs as PID 1 and, in shell form, is actually a child of
# /bin/sh -c — it never receives SIGTERM, so `docker stop` hangs 10s then SIGKILLs
# (data loss on unflushed writes).
#   CMD npm start                      # shell form: sh -c "npm start", no signal
# RIGHT: exec form makes your process PID 1; add an init to reap zombies + forward
# signals when your process does not handle SIGTERM itself.
CMD ["node", "server.js"]              # exec form: node is PID 1, gets SIGTERM
```
```bash
# `--init` injects tini as PID 1 (zombie-reaping + signal forwarding). Always set
# resource limits so one container cannot OOM the host; a memory-limited container
# that exceeds its limit is OOM-killed (exit 137), not throttled.
docker run --init --memory=512m --cpus=1.5 --pids-limit=200 myapp
```

## Security (non-root, secrets, capabilities)
- **Run as non-root — CWE-250 (Execution with Unnecessary Privileges).** By default
  the container process runs as UID 0; a container escape or app RCE then acts as
  root. Add a `USER` and drop Linux capabilities:

```dockerfile
FROM node:22-bookworm-slim
RUN groupadd -r app && useradd -r -g app -u 10001 app
WORKDIR /app
COPY --chown=app:app . .
USER 10001                             # CWE-250: never leave the default root UID
```
```bash
# Defense in depth at run time: drop all caps, add back only what is needed,
# read-only rootfs + a writable tmpfs, no new privileges, never --privileged.
docker run --user 10001 \
  --cap-drop=ALL --cap-add=NET_BIND_SERVICE \
  --read-only --tmpfs /tmp \
  --security-opt=no-new-privileges myapp
```
- **Never bake secrets into layers or ENV — CWE-538 / CWE-526.** A `COPY .env`,
  an `ARG TOKEN`, or an `ENV DB_PASSWORD=...` persists in the image history
  (`docker history --no-trunc`) forever — squashing the final layer does NOT remove
  it, and anyone who pulls the image reads it. Build-time `ARG` secrets are visible
  in the build cache and history too. This is CWE-538 "Insertion of Sensitive
  Information into an Externally-Accessible File or Directory" (secret in a shared
  image) and CWE-526 "Cleartext Storage of Sensitive Information in an Environment
  Variable" (cwe.mitre.org). Use BuildKit build secrets, which mount at build time
  and are NOT persisted:

```dockerfile
# syntax=docker/dockerfile:1
# RIGHT: the secret is mounted only for this RUN, never written to a layer.
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
```
```bash
DOCKER_BUILDKIT=1 docker build --secret id=npmrc,src=$HOME/.npmrc .
```
  Pass runtime secrets via `--env-file` (kept out of history) or an orchestrator
  secret store — never a literal `ENV`. Verify with `docker history --no-trunc`.

## Testing / CI Conventions
```bash
# Reproducible builds in CI: BuildKit + a registry cache so cold CI builds reuse
# layers from the last successful build.
docker buildx build \
  --cache-from type=registry,ref=ghcr.io/org/app:buildcache \
  --cache-to   type=registry,ref=ghcr.io/org/app:buildcache,mode=max \
  --tag ghcr.io/org/app:$GIT_SHA --push .

# Scan the built image before publishing — fail the pipeline on fixable CVEs:
docker scout cves ghcr.io/org/app:$GIT_SHA
```
- Add a `HEALTHCHECK` so orchestrators know when the container is actually ready,
  not merely started (a started-but-not-listening container passes a naive check):

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8080/health || exit 1
```

## Performance Traps
- **Layer order = cache hit rate.** Put the least-frequently-changing instructions
  (base image, OS packages, dependency install) highest; source `COPY` lowest.
- **One `RUN` per logical unit, `&& \` chained**, then clean the package cache in
  the SAME layer (`rm -rf /var/lib/apt/lists/*`) — a separate cleanup `RUN` leaves
  the files in the earlier layer, so the image never shrinks.
- **`--mount=type=cache`** for package managers (`/root/.npm`, `~/.cache/pip`)
  keeps the download cache across builds without shipping it in the image.
- Prefer `-slim`/distroless finals; alpine's musl libc can subtly change DNS and
  glibc-dependent binaries — pick it deliberately, not reflexively.

## Version-Specific Gotchas (dated, sourced)
- **Docker Engine 28.5.2** is the current stable, released **2025-11-10**; the 28.x
  line makes BuildKit the default builder and removes the deprecated classic
  builder. [docs.docker.com/engine/release-notes/28, retrieved 2026-07-10]
- **BuildKit build secrets** (`--mount=type=secret`, `RUN --secret`) require the
  `# syntax=docker/dockerfile:1` frontend directive at the top of the Dockerfile.
  [docs.docker.com build/building/secrets, retrieved 2026-07-10]
- **`docker scout`** replaced the legacy `docker scan` for CVE reporting.
  [docs.docker.com/scout, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Docker Engine 28 release notes: https://docs.docker.com/engine/release-notes/28/
- Dockerfile best practices: https://docs.docker.com/build/building/best-practices/
- Build cache: https://docs.docker.com/build/cache/
- Build secrets (BuildKit): https://docs.docker.com/build/building/secrets/
- Multi-stage builds: https://docs.docker.com/build/building/multi-stage/
- Run as non-root / security: https://docs.docker.com/engine/security/
- HEALTHCHECK: https://docs.docker.com/reference/dockerfile/#healthcheck
- Docker Scout (CVEs): https://docs.docker.com/scout/
- CWE-250 (Execution with Unnecessary Privileges): https://cwe.mitre.org/data/definitions/250.html
- CWE-538 (Info in Externally-Accessible File/Dir): https://cwe.mitre.org/data/definitions/538.html
- CWE-526 (Cleartext Storage in Environment Variable): https://cwe.mitre.org/data/definitions/526.html
