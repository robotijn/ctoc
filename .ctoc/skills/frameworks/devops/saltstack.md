# SaltStack CTO
> Event-driven automation leader demanding state-driven configuration with pillar-based secrets.

## Commands
```bash
# Setup | Dev | Test
salt-call --local state.apply mystate test=True
salt '*' state.highstate --state-output=changes
salt-call --local pillar.items && pytest tests/
```

## Non-Negotiables
1. State-driven configuration with SLS files
2. Pillar for secrets and environment-specific data
3. Jinja templating with proper escaping and defaults
4. Reactor system for event-driven automation
5. Salt environments for promotion workflow

## Red Lines
- cmd.run when declarative state modules exist
- Secrets in state files - always use pillar with GPG encryption
- Missing requisites causing ordering issues
- Unscoped pillar access allowing cross-minion data leakage
- State files without test=True validation

## Pattern: State with Pillar and Requisites
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

# pillar/nginx.sls
nginx:
  workers: 4
  ssl_cert: |
    -----BEGIN CERTIFICATE-----
    {{ salt['vault.read_secret']('secret/nginx/cert') }}
    -----END CERTIFICATE-----
```

## Integrates With
- **DB**: mysql_database and postgres_database states with pillar creds
- **Auth**: Vault integration via salt.modules.vault
- **Cache**: redis state module with minion-specific configuration

## Common Errors
| Error | Fix |
|-------|-----|
| `Pillar data not available` | Refresh pillar with `salt '*' saltutil.refresh_pillar` |
| `Requisite not found` | Verify state ID exists, check for typos in require/watch |
| `Jinja undefined variable` | Use `\| default()` filter or check pillar structure |

## Prod Ready
- [ ] States tested with kitchen-salt or pytest-salt
- [ ] Pillar encrypted with GPG or Vault integration
- [ ] Highstate runs validated in CI before deployment
- [ ] Event reactor configured for auto-remediation
