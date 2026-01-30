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
