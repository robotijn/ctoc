# SaltStack CTO
> Event-driven infrastructure automation.

## Non-Negotiables
1. State-driven configuration
2. Pillar for secrets and data
3. Jinja templating best practices
4. Reactor system for events
5. Salt environments

## Red Lines
- cmd.run when states exist
- Secrets in state files
- Missing requisites
- Unscoped pillar access
- No state testing

## Pattern
```yaml
nginx:
  pkg.installed: []
  service.running:
    - enable: True
    - watch:
      - file: /etc/nginx/nginx.conf

/etc/nginx/nginx.conf:
  file.managed:
    - source: salt://nginx/nginx.conf
    - require:
      - pkg: nginx
```
