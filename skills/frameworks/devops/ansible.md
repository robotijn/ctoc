# Ansible CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Install ansible-core only (recommended - lean install)
pip install ansible-core
# Then install needed collections
ansible-galaxy collection install community.general
# Full Ansible with all collections
pip install ansible
```

## Claude's Common Mistakes
1. **Uses shell/command when modules exist** - Not idempotent
2. **Puts secrets in plaintext** - Must use Ansible Vault
3. **Missing handlers for service restarts** - Config changes need reload
4. **Skips --check mode testing** - Changes should be previewed
5. **Uses OS package manager Ansible** - Versions often outdated

## Correct Patterns (2026)
```yaml
# roles/nginx/tasks/main.yml
---
- name: Install nginx
  ansible.builtin.package:
    name: nginx
    state: present

- name: Deploy nginx configuration
  ansible.builtin.template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
    mode: '0644'
    validate: nginx -t -c %s
  notify: Reload nginx

- name: Ensure nginx is running
  ansible.builtin.service:
    name: nginx
    state: started
    enabled: true

# roles/nginx/handlers/main.yml
---
- name: Reload nginx
  ansible.builtin.service:
    name: nginx
    state: reloaded

# Vault-encrypted variable file
# ansible-vault create group_vars/all/vault.yml
db_password: !vault |
  $ANSIBLE_VAULT;1.1;AES256
  ...encrypted...
```

## Version Gotchas
- **ansible-core**: Only 71 built-in modules, collections required
- **Python 3.10+**: Required for latest ansible-core
- **Execution Environments**: Containerized runtime, more reproducible
- **With Molecule**: Use for role testing, Docker or Podman driver

## What NOT to Do
- Do NOT use shell/command when proper modules exist
- Do NOT store secrets in plaintext - use Ansible Vault
- Do NOT skip `--check` mode before applying changes
- Do NOT forget handlers for service restarts
- Do NOT use distro package manager - versions lag behind
