# Ansible CTO
> Agentless configuration management.

## Non-Negotiables
1. Idempotent playbooks
2. Roles for reusability
3. Ansible Vault for secrets
4. Inventory organization
5. Molecule for testing

## Red Lines
- Shell/command when modules exist
- Plaintext secrets in repos
- Missing handlers for restarts
- No check mode support
- Hardcoded inventory in playbooks

## Pattern
```yaml
- name: Ensure nginx is configured
  ansible.builtin.template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
  notify: Restart nginx
```
