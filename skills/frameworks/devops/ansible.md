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

## Idempotency Footguns
Idempotency — running a playbook twice yields no changes the second time — is the
whole point of Ansible, and `command`/`shell` break it. Those two modules run
**every time** and always report `changed`, so drift detection and `--check` become
meaningless. Prefer a real module; when you must shell out, gate it:

```yaml
# FOOTGUN: runs on every play, always "changed", not idempotent.
- name: init db
  ansible.builtin.command: /usr/bin/initdb /var/lib/pgsql/data

# RIGHT: creates: skips if the target already exists (idempotent guard).
- name: init db
  ansible.builtin.command: /usr/bin/initdb /var/lib/pgsql/data
  args:
    creates: /var/lib/pgsql/data/PG_VERSION

# RIGHT: changed_when/failed_when define change/failure from the command's output.
- name: check config
  ansible.builtin.command: nginx -t
  register: nginxt
  changed_when: false                      # a read-only check never "changes"
  failed_when: nginxt.rc != 0
```

- **Handler notify timing** — a handler runs **once, at the end of the play**, only
  if a task `notify`d it AND that task reported `changed`. If an earlier task
  aborts the play, queued handlers do NOT run (use `--force-handlers` or `meta:
  flush_handlers` to control this). Do not rely on a handler for something that
  must happen immediately.
- **`become` privilege** — privilege escalation is per-task/per-play via `become:
  true` (+ `become_user`, `become_method: sudo`). Escalate the *narrow* task, not
  the whole play; a play-wide `become` runs template/file tasks as root and can
  leave root-owned files a later unprivileged task cannot manage.
- **`loop` vs legacy `with_`** — use `loop:` (+ `loop_control`) for new code; the
  `with_*` lookups are legacy. Looping a `package:` install is fine, but looping
  `command:` re-triggers the non-idempotency above per item.
- **Fact caching** — gathered facts are per-run unless you enable a fact cache;
  do not assume `ansible_facts` persist across playbook invocations.

## Safety — Preview & Rollout Control
```yaml
# --check (dry run) + --diff shows what WOULD change without changing it.
#   ansible-playbook site.yml --check --diff
# serial: roll out in batches so a bad change hits N hosts, not the fleet.
- hosts: web
  serial: "25%"          # 25% at a time; combine with max_fail_percentage
  max_fail_percentage: 10
```
Note: `--check` is only meaningful when tasks support check mode — `command`/`shell`
report as skipped/changed unpredictably in `--check`, another reason to prefer
real modules.

## Security — Secrets, no_log, Template Injection
- **Ansible Vault for secrets (CWE-312)** — plaintext passwords in vars or repo are
  CWE-312 "Cleartext Storage of Sensitive Information" (cwe.mitre.org/312). Encrypt
  them with `ansible-vault`; the value is AES256-encrypted at rest
  (`$ANSIBLE_VAULT;1.1;AES256`):
  ```bash
  ansible-vault encrypt_string 's3cr3t' --name db_password >> group_vars/all/vault.yml
  ansible-playbook site.yml --ask-vault-pass          # or --vault-password-file
  ```
- **`no_log: true` on sensitive tasks (CWE-532)** — Ansible **echoes task args and
  results to the log/stdout by default**, so a task passing a password prints it in
  plaintext to the console and any CI log — CWE-532 "Insertion of Sensitive
  Information into Log File" (cwe.mitre.org/532). Set `no_log: true` on any task
  touching a secret:
  ```yaml
  - name: set db password
    community.mysql.mysql_user:
      name: app
      password: "{{ db_password }}"
    no_log: true                     # keeps the secret out of stdout / -v output
  ```
- **Template injection (CWE-94)** — Jinja2 templating of **untrusted** variables
  (facts scraped from a host, user-supplied inventory vars) can execute Python via
  Jinja expressions — CWE-94 "Improper Control of Generation of Code"
  (cwe.mitre.org/94). Never `template`/`{{ }}`-render a variable whose value came
  from an untrusted source; treat remote facts as data, not code.

## Testing Conventions
- **`ansible-lint`** catches non-idempotent `command`/`shell` use, missing
  `changed_when`, and unencrypted secrets — run it in CI.
- **Molecule** drives full role tests (converge → **idempotence** check → verify)
  on a Docker/Podman instance. The idempotence step is the key one: a second
  converge must report **zero changes**, proving the role is actually idempotent.
- `--syntax-check` and `--check --diff` are the fast pre-merge gates.

## Version-Specific Gotchas (dated, sourced)
- **ansible-core 2.21.1** is the current release, uploaded **2026-06-18**;
  ansible-core requires the **controller** to run Python 3.11+ (targets can run
  older Pythons). [pypi.org/project/ansible-core, retrieved 2026-07-10]
- **`ansible-core` vs `ansible`** — `ansible-core` ships only the built-in
  `ansible.builtin` modules; everything else (community.general, cloud collections)
  installs via `ansible-galaxy collection install`. Pin collection versions in
  `requirements.yml`. [docs.ansible.com, retrieved 2026-07-10]
- **Execution Environments** (container images built with `ansible-builder`) give a
  reproducible controller runtime — prefer them over a bare `pip install` for CI.
  [docs.ansible.com, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- ansible-core releases (PyPI): https://pypi.org/project/ansible-core/
- Idempotency & `changed_when`/`creates`: https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_error_handling.html
- Ansible Vault: https://docs.ansible.com/ansible/latest/vault_guide/index.html
- `no_log` / protecting sensitive data: https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_vars_facts.html
- `become` privilege escalation: https://docs.ansible.com/ansible/latest/playbook_guide/become.html
- Molecule (role testing): https://ansible.readthedocs.io/projects/molecule/
- CWE-312 (Cleartext Storage of Sensitive Information): https://cwe.mitre.org/data/definitions/312.html
- CWE-532 (Insertion of Sensitive Information into Log File): https://cwe.mitre.org/data/definitions/532.html
- CWE-94 (Code Injection): https://cwe.mitre.org/data/definitions/94.html
