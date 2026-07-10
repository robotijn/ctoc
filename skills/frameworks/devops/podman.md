# Podman CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Fedora/RHEL
sudo dnf install podman
# Ubuntu/Debian
sudo apt-get install podman
# Rootless setup (run as user)
podman system migrate
```

## Claude's Common Mistakes
1. **Assumes Docker socket exists** - Podman is daemonless
2. **Ignores SELinux volume contexts** - Missing :Z causes permission denied
3. **Uses docker-compose directly** - Use podman-compose or Quadlet
4. **Runs as root unnecessarily** - Rootless is default and preferred
5. **Forgets subuid/subgid setup** - Required for rootless containers

## Correct Patterns (2026)
```ini
# Quadlet service definition (replaces systemd generation)
# ~/.config/containers/systemd/myapp.container
[Unit]
Description=My Application Container
After=network-online.target

[Container]
Image=ghcr.io/myorg/myapp:v1.2.3
PublishPort=8080:8080
Volume=%h/myapp/data:/data:Z
Environment=NODE_ENV=production
HealthCmd=/bin/healthcheck
HealthInterval=30s
User=1000
Group=1000

[Service]
Restart=always
TimeoutStartSec=300

[Install]
WantedBy=default.target
```

```bash
# Enable and start the service
systemctl --user daemon-reload
systemctl --user enable --now myapp.service
```

## Version Gotchas
- **Podman 5.x**: Quadlet replaces `podman generate systemd`
- **Podman 4.x+**: Improved Docker Compose compatibility
- **SELinux**: Always use :Z for bind mounts on Fedora/RHEL
- **With Kubernetes**: `podman generate kube` for migration

## What NOT to Do
- Do NOT assume Docker socket - Podman is daemonless
- Do NOT skip :Z volume suffix on SELinux systems
- Do NOT run as root - rootless is default
- Do NOT use `podman generate systemd` - use Quadlet
- Do NOT forget `podman system migrate` after user changes

## Rootless Footguns (the ones that "work as root, fail as user")
Podman is **rootless by default**, which is the security win — and the source of
almost every "it ran under sudo but not as me" bug Claude generates.

```bash
# FOOTGUN: binding a privileged port (<1024) rootless fails — an unprivileged user
# cannot bind port 80/443:
#   podman run -p 80:80 nginx   # Error: rootlessport cannot bind to <1024
# RIGHT (pick one):
#  (a) publish to a high host port and reverse-proxy, or
#  (b) lower the unprivileged threshold system-wide:
sudo sysctl -w net.ipv4.ip_unprivileged_port_start=80   # then -p 80:80 works
podman run -p 8080:80 nginx                              # or just use a high port
```
- **subuid/subgid mapping is mandatory for rootless.** Each rootless user needs a
  range in `/etc/subuid` and `/etc/subgid` (e.g. `youruser:100000:65536`), or
  multi-UID images fail with "there might not be enough IDs available". After
  editing either file (or on first rootless use) run `podman system migrate`.
  Inside the container root (UID 0) maps to your host UID; a file the container
  writes as "root" is owned by *you* on the host — not by host root.
- **Rootless networking uses pasta (default, Podman 5+) or slirp4netns**, a
  user-mode network stack — NOT the kernel bridge that rootful Podman/Docker use.
  Consequences Claude misses: the container sees the host as `10.0.2.2` (slirp) and
  the *source IP of inbound connections is the gateway, not the real client* unless
  you enable pasta or `slirp4netns:port_handler=slirp4netns`. Choose pasta for
  correct source IPs:

```bash
podman run --network=pasta -p 8080:8080 myapp     # pasta: preserves client IP
```
- **SELinux `:Z` on bind mounts.** A bind mount without a relabel suffix gives
  `permission denied` inside the container on Fedora/RHEL. `:Z` relabels the volume
  private to this container; `:z` (lowercase) shares the label across containers —
  do NOT use `:Z` on a host path shared with the OS (it relabels the host dir):

```bash
podman run -v "$PWD/data:/data:Z" myapp           # private relabel, per-container
```

## Pods, Quadlet & systemd (the orchestration surface)
```ini
# RIGHT (Podman 5+/6): Quadlet .container unit — declarative, systemd-managed.
# ~/.config/containers/systemd/myapp.container   (rootless, per-user)
[Container]
Image=ghcr.io/org/myapp@sha256:<digest>   # pin by digest, not a tag
PublishPort=8080:8080
Volume=%h/myapp/data:/data:Z
User=10001
DropCapability=ALL
ReadOnly=true
NoNewPrivileges=true

[Service]
Restart=always

[Install]
WantedBy=default.target
```
```bash
systemctl --user daemon-reload
systemctl --user enable --now myapp.service       # rootless service, no root daemon
# Persist rootless services across logout (else they stop when your session ends):
loginctl enable-linger "$USER"
```
- **`podman generate systemd` is deprecated — use Quadlet.** The old command
  generated brittle unit files you had to regenerate on every change; Quadlet units
  are the source of truth and are expanded by a systemd generator at boot.
- **A pod is a shared-namespace group of containers** (like a Kubernetes pod): they
  share the network namespace, so containers in a pod reach each other on
  `localhost` and publish ports via the pod's infra container — publish on the pod,
  not the member container.

## Compatibility (Docker-CLI compatible, daemonless)
- Podman is **daemonless**: there is no long-running root socket; each `podman`
  invocation is a short-lived process. Code that assumes `/var/run/docker.sock`
  exists is wrong. For tools that *require* a Docker socket, expose the compat API
  explicitly: `podman system service --time=0 unix:///run/user/$(id -u)/podman/podman.sock`
  and point `DOCKER_HOST` at it.
- `alias docker=podman` covers most CLIs, and `podman generate kube` /
  `podman play kube` move workloads to/from Kubernetes manifests.

## Security (rootless-by-default hardening)
- **Rootless is the primary mitigation for CWE-250** (Execution with Unnecessary
  Privileges): a container-escape as an unprivileged user cannot become host root,
  unlike a rootful daemon escape. Still drop capabilities and forbid privilege
  escalation:

```bash
podman run --user 10001 \
  --cap-drop=ALL --cap-add=NET_BIND_SERVICE \
  --read-only --security-opt=no-new-privileges \
  myapp
```
- **Never bake secrets into image layers or ENV — CWE-538.** As with any OCI image,
  a secret copied into a layer or set via `ENV` persists in `podman history` and
  ships to everyone who pulls the image — CWE-538 "Insertion of Sensitive
  Information into an Externally-Accessible File or Directory" (cwe.mitre.org). Use
  `podman secret` (mounted at run time, not stored in a layer) instead:

```bash
printf '%s' "$DB_PASSWORD" | podman secret create db_pw -
podman run --secret db_pw,type=mount myapp        # mounted at /run/secrets/db_pw
```

## Testing / CI Conventions
```bash
# Rootless in CI (GitHub Actions/GitLab): ensure subuid/subgid + cgroups v2, then
# build and smoke-test the image without a privileged daemon:
podman build -t localhost/app:test .
cid=$(podman run -d --health-cmd='curl -fsS localhost:8080/health' \
        --health-interval=5s -p 8080:8080 localhost/app:test)
podman healthcheck run "$cid"                     # assert healthy, then tear down
```

## Performance Traps
- **pasta vs slirp4netns:** pasta (Podman 5+ default) is markedly faster and
  preserves client source IPs; slirp4netns has higher latency — do not fall back to
  it without reason.
- **`--userns=keep-id`** keeps your host UID inside the container so bind-mounted
  files stay writable — without it a "root"-written file is owned by a high mapped
  UID you cannot easily delete.
- Rootless overlay uses `fuse-overlayfs` unless the kernel supports native rootless
  overlay (recent kernels) — native is faster; check `podman info | grep -i overlay`.

## Version-Specific Gotchas (dated, sourced)
- **Podman 6.0.1** is the current release; the 6.x line continues Quadlet as the
  supported way to run containers under systemd and keeps pasta as the default
  rootless network backend. [github.com/containers/podman/releases/tag/v6.0.1,
  retrieved 2026-07-10]
- **`podman generate systemd` is deprecated in favor of Quadlet** (`.container`,
  `.pod`, `.kube`, `.volume` units under `containers/systemd/`).
  [docs.podman.io Quadlet, retrieved 2026-07-10]
- **pasta became the default rootless network** replacing slirp4netns from Podman 5
  onward. [docs.podman.io networking, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Podman 6.0.1 release: https://github.com/containers/podman/releases/tag/v6.0.1
- Podman documentation: https://docs.podman.io/
- Rootless mode / subuid-subgid: https://github.com/containers/podman/blob/main/docs/tutorials/rootless_tutorial.md
- Quadlet (podman-systemd.unit): https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html
- Rootless networking (pasta/slirp4netns): https://docs.podman.io/en/latest/markdown/podman-run.1.html#network-mode-net
- podman secret: https://docs.podman.io/en/latest/markdown/podman-secret-create.1.html
- Pods: https://docs.podman.io/en/latest/markdown/podman-pod.1.html
- CWE-250 (Execution with Unnecessary Privileges): https://cwe.mitre.org/data/definitions/250.html
- CWE-538 (Info in Externally-Accessible File/Dir): https://cwe.mitre.org/data/definitions/538.html
