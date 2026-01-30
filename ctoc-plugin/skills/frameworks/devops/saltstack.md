# SaltStack CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Bootstrap script (recommended)
curl -L https://bootstrap.saltproject.io | sudo sh -s -- -M
# Or package manager
sudo apt-get install salt-master salt-minion
# Masterless mode
salt-call --local state.apply
```

## Claude's Common Mistakes
1. **Uses cmd.run when state modules exist** - Not idempotent
2. **Secrets in state files** - Must use pillar with GPG
3. **Missing requisites** - Causes ordering issues
4. **Unscoped pillar access** - Cross-minion data leakage
5. **Skips test=True validation** - Changes without preview

## Correct Patterns (2026)
```yaml
# states/nginx/init.sls
{% set nginx = salt['pillar.get']('nginx', {}) %}

nginx_package:
  pkg.installed:
    - name: nginx

nginx_config:
  file.managed:
    - name: /etc/nginx/nginx.conf
    - source: salt://nginx/files/nginx.conf.j2
    - template: jinja
    - context:
        worker_processes: {{ nginx.get('workers', 'auto') }}
    - require:
      - pkg: nginx_package
    - watch_in:
      - service: nginx_service

nginx_service:
  service.running:
    - name: nginx
    - enable: True
    - require:
      - file: nginx_config

# pillar/nginx/init.sls (encrypted with GPG)
nginx:
  workers: 4
  ssl_cert: |
    -----BEGIN CERTIFICATE-----
    {{ salt['vault.read_secret']('secret/nginx/cert') }}
    -----END CERTIFICATE-----

# top.sls for pillar targeting
base:
  'web*':
    - nginx
  'db*':
    - postgres
```

## Version Gotchas
- **Salt 3007+**: Python 3.10+ required
- **Salt Project**: Renamed from SaltStack, same software
- **Vault integration**: Preferred over GPG for dynamic secrets
- **With Reactor**: Event-driven automation for auto-remediation

## What NOT to Do
- Do NOT use cmd.run when state modules exist
- Do NOT put secrets in state files - use encrypted pillar
- Do NOT skip requisites - causes race conditions
- Do NOT allow unscoped pillar access - data leakage risk
- Do NOT apply states without `test=True` first
