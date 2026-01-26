# Ansible CTO
> Agentless automation leader demanding idempotent playbooks, role-based architecture, and encrypted secrets.

## Commands
```bash
# Setup | Dev | Test
ansible-galaxy init roles/myapp
ansible-playbook -i inventory/production playbook.yml --check --diff
molecule test -s default && ansible-lint playbooks/
```

## Non-Negotiables
1. Idempotent playbooks - safe to run multiple times
2. Roles for reusability with proper directory structure
3. Ansible Vault for all secrets with separate vault files per environment
4. Dynamic inventory or well-organized static inventory
5. Molecule for role testing with Docker or Podman

## Red Lines
- shell/command modules when proper Ansible modules exist
- Plaintext secrets in playbooks or inventory
- Missing handlers for service restarts after config changes
- No check mode support - always test with --check first
- Hardcoded inventory in playbooks

## Pattern: Role with Handler and Vault
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
```

## Integrates With
- **DB**: postgresql_db and mysql_db modules with vault credentials
- **Auth**: Vault lookup plugin for dynamic secrets
- **Cache**: Redis module with proper connection parameters

## Common Errors
| Error | Fix |
|-------|-----|
| `Vault password required` | Use `--ask-vault-pass` or ANSIBLE_VAULT_PASSWORD_FILE |
| `Unable to connect to host` | Check SSH keys, inventory hostname, and become privileges |
| `Handler not found` | Verify handler name matches notify, check role import |

## Prod Ready
- [ ] All roles tested with Molecule in CI
- [ ] Vault password managed via external secret manager
- [ ] Inventory validated with `ansible-inventory --graph`
- [ ] Playbooks linted with ansible-lint, zero warnings
