# Podman CTO
> Daemonless container engine.

## Non-Negotiables
1. Rootless containers by default
2. Pod-based deployments
3. Systemd integration
4. OCI compliance
5. Quadlet for services

## Red Lines
- Running containers as root unnecessarily
- Ignoring SELinux contexts
- Docker socket mounting
- Missing health checks in pods

## Quadlet Pattern
```ini
# ~/.config/containers/systemd/myapp.container
[Container]
Image=myapp:latest
PublishPort=8080:8080
Volume=%h/data:/data:Z

[Service]
Restart=always

[Install]
WantedBy=default.target
```
