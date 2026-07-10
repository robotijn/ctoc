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

## State Footguns
Salt states are meant to be idempotent — each state function (`pkg.installed`,
`file.managed`, `service.running`) is a declarative no-op once converged. The recurring
Claude bug is `cmd.run` for something a real state module already does, which runs on
every `state.apply`.

```yaml
# FOOTGUN: cmd.run is NOT idempotent — this executes on every state.apply and always
# reports "changed", so watch/onchanges requisites fire endlessly.
install_app:
  cmd.run:
    - name: /opt/install.sh

# RIGHT: guard cmd.run with unless/onlyif (the guard's exit status is the gate), or
# better, use a real state module.
install_app:
  cmd.run:
    - name: /opt/install.sh
    - unless: test -f /opt/app/VERSION      # skip if already installed
    - creates: /opt/app/VERSION             # cmd.run also honors creates:
```

- **Requisites order execution and wire events.** `require` orders (run after the
  target); `watch` orders AND triggers the state's `mod_watch` (e.g. restart a service)
  when the watched state reports changes. `onchanges` runs only if the target changed;
  `prereq` runs a state only if another state *predicts* a change. Missing requisites
  means Salt applies states in unordered/definition order and the config-then-restart
  sequence breaks.
- **Pillar is for data and secrets; states are world-readable on the master.** Never
  inline a secret in an `.sls` state — put it in pillar, which is compiled per-minion
  and only rendered to targeted minions:

```yaml
# pillar/top.sls — scope secrets to the minions that need them (no wildcards for secrets)
base:
  'web-*':
    - webapp_secrets

# state references pillar; the secret never lives in the state tree
nginx_tls:
  file.managed:
    - name: /etc/nginx/tls.key
    - contents_pillar: nginx:tls_key       # value comes from targeted pillar
    - mode: '0600'
```

- **Master–minion key acceptance is trust.** `salt-key -A` blindly accepts all pending
  keys — a spoofed minion can get accepted. Verify the fingerprint (`salt-key -f <id>`
  vs the minion's `salt-call key.finger`) before accepting.
- **`test=True` previews, it does not guarantee.** `salt '*' state.apply test=True`
  shows the diff, but a `cmd.run` without a guard still *reports* it would run every
  time; templating errors surface only at real apply.

## Security — exposed master (CVE-2020-11651 / CVE-2020-11652, CWE-306)
The salt-master historically shipped a **`ClearFuncs` authentication bypass** — the most
severe Salt security event and the reason you NEVER expose the master (ports 4505/4506)
to the public internet.

- **CVE-2020-11651** — the `salt-master` `ClearFuncs` class did not properly validate
  method calls, letting a **remote unauthenticated user call privileged methods and run
  commands as root** on the master and any minion. This is a **CWE-306 "Missing
  Authentication for Critical Function"** class flaw. Affects Salt before 2019.2.4 and
  3000 before 3000.2. [nvd.nist.gov/vuln/detail/CVE-2020-11651, retrieved 2026-07-10]
- **CVE-2020-11652** — a companion **directory-traversal** (CWE-22) in the same
  `ClearFuncs` path, allowing arbitrary file read/write via unsanitized paths. Chained
  with 11651 it was mass-exploited in 2020. [nvd.nist.gov/vuln/detail/CVE-2020-11652,
  retrieved 2026-07-10]

```bash
# RIGHT: keep the master private and patched.
#  - never bind 4505/4506 to a public interface; firewall to your minion CIDRs only
#  - run a currently-supported Salt (3006 LTS / 3007 / 3008) — see Version section
#  - prefer masterless (salt-call --local) or salt-ssh where a standing master isn't needed
salt-call --local state.apply     # masterless: no listening master to expose
```
- Plaintext secrets in the state tree are **CWE-312** — use pillar (above) or the Vault
  pillar/SDB module for dynamic secrets.

## Safety & Testing (test=True)
```bash
# Preview EVERY change without applying it. Providers report Result: None for
# would-change states. Run this before any state.apply in production.
salt '*' state.apply myapp test=True
salt-call --local state.apply test=True    # masterless dry-run
```
- `test=True` shows the diff, but an unguarded `cmd.run` still reports it *would* run on
  every apply, and Jinja/template errors surface only at real render — so a clean dry-run
  is necessary, not sufficient. Validate state files with `salt-call --local
  state.show_sls myapp` to catch render errors early.
- **Performance/scale:** target with grains/pillar matchers (`salt -G 'os:Ubuntu' ...`)
  and use the batch flag (`-b 10%`) so a fleet-wide apply rolls out incrementally instead
  of hammering every minion (and every downstream service restart) at once.
- Test formulas in a throwaway minion (kitchen-salt) and assert idempotency: a second
  `state.apply` must report **0 states changed**.

## Performance & Scale
- **Batch large fleets** with `-b` (`salt -b 10% '*' state.apply`) so rollouts — and the
  service restarts they trigger — are staggered, not simultaneous across every minion.
- **Prefer targeted pillar/grain matchers** over `'*'`; compiling pillar for every minion
  on every job is the main master-side cost. Enable pillar caching for large estates.
- **Masterless (`salt-call --local`)** removes the master as a bottleneck/attack surface
  for stateless nodes (e.g. immutable images baked in CI).
- Non-idempotent `cmd.run` states re-execute every apply — guarding them (unless/onlyif)
  keeps converged runs fast and event-noise low.

## Version-Specific Gotchas (dated, sourced)
- **Salt 3008.x** is the current release line (PyPI `salt` 3008.2); Salt uses
  CalVer-style major numbers (300x), and 3006 is the current LTS. Salt requires
  Python 3.8+ and ships a bundled "onedir" Python in the classic packages.
  [pypi.org/pypi/salt/json + saltproject.io, retrieved 2026-07-10]
- "SaltStack" was renamed **Salt Project** (acquired by Broadcom/VMware); it is the same
  software — do not treat old "SaltStack" docs as a different product.
  [saltproject.io, retrieved 2026-07-10]
- Patched releases for CVE-2020-11651/11652 were 2019.2.4 and 3000.2 — anything older is
  exploitable; upgrade well past those.
  [nvd.nist.gov/vuln/detail/CVE-2020-11651, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Salt releases (PyPI): https://pypi.org/project/salt/
- Salt Project docs: https://docs.saltproject.io/
- Requisites & state ordering: https://docs.saltproject.io/en/latest/ref/states/requisites.html
- Pillar (secure per-minion data): https://docs.saltproject.io/en/latest/topics/pillar/
- salt-key acceptance: https://docs.saltproject.io/en/latest/ref/cli/salt-key.html
- CVE-2020-11651 (ClearFuncs auth bypass): https://nvd.nist.gov/vuln/detail/CVE-2020-11651
- CVE-2020-11652 (directory traversal): https://nvd.nist.gov/vuln/detail/CVE-2020-11652
- CWE-306 (Missing Authentication for Critical Function): https://cwe.mitre.org/data/definitions/306.html
- CWE-312 (Cleartext Storage of Sensitive Information): https://cwe.mitre.org/data/definitions/312.html
