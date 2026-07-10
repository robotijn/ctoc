# Chef CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Chef Workstation (includes knife, chef, cookstyle)
curl -L https://omnitruck.chef.io/install.sh | sudo bash -s -- -P chef-workstation
# Verify
chef --version
# Create cookbook
chef generate cookbook mycookbook
```

## Claude's Common Mistakes
1. **Uses legacy environments** - Policyfiles are standard now
2. **Missing guards on execute** - not_if/only_if required
3. **Plaintext secrets in attributes** - Use encrypted data bags or Vault
4. **Skips Test Kitchen** - Integration testing required
5. **Monolithic cookbooks** - Should decompose into focused units

## Correct Patterns (2026)
```ruby
# Policyfile.rb (replaces environments + Berksfile)
name 'myapp'
default_source :supermarket
run_list 'myapp::default'
cookbook 'myapp', path: '.'

# recipes/default.rb
package 'myapp' do
  version node['myapp']['version']
end

# Custom resource with proper guards
app_config '/etc/myapp/config.json' do
  content node['myapp']['config']
  owner 'myapp'
  mode '0644'
  notifies :restart, 'service[myapp]', :delayed
  action :create
end

service 'myapp' do
  action [:enable, :start]
end

# resources/app_config.rb
provides :app_config
unified_mode true  # Chef 18+ default

property :path, String, name_property: true
property :content, Hash, required: true
property :owner, String, default: 'root'
property :mode, String, default: '0644'

action :create do
  file new_resource.path do
    content JSON.pretty_generate(new_resource.content)
    owner new_resource.owner
    mode new_resource.mode
  end
end
```

## Version Gotchas
- **Chef 18+**: unified_mode default for custom resources
- **Policyfiles**: Replace Berkshelf + environments
- **chef-vault**: Being replaced by external secrets
- **With InSpec**: Use for compliance testing alongside Chef

## What NOT to Do
- Do NOT use legacy environments - migrate to Policyfiles
- Do NOT skip guards on execute resources
- Do NOT store secrets in attributes - use encrypted data bags
- Do NOT release without Test Kitchen validation
- Do NOT create monolithic cookbooks - decompose

## Convergence Footguns
Chef's model is *idempotent convergence*: every resource declares desired state and
its provider is supposed to be a no-op when already converged. The recurring bug
Claude generates is a resource that runs on EVERY chef-client run because it is not
actually idempotent — most often a bare `execute` / `bash` block with no guard.

```ruby
# FOOTGUN: this shells out on EVERY converge (not idempotent) and always reports
# "updated", so notifications fire every run and drift detection is meaningless.
execute 'seed-db' do
  command 'rake db:seed'
end

# RIGHT: a guard makes it idempotent. not_if / only_if run BEFORE the action and
# short-circuit the resource. The guard command's OWN exit status is the gate.
execute 'seed-db' do
  command 'rake db:seed'
  not_if 'psql -tAc "SELECT 1 FROM users LIMIT 1" | grep -q 1'   # skip if seeded
  user 'postgres'
end
```

- **Guards are evaluated at converge time, on the node** — `not_if`/`only_if` with a
  string run a shell; with a Ruby block they run in the recipe context. A guard that
  references a file created *later* in the same run evaluates against the *pre-run*
  state (Chef compiles the resource collection, then converges) — a classic
  "works second run only" bug.
- **Notifications vs subscriptions + timing.** `notifies :restart, 'service[app]', :delayed`
  batches the restart to the end of the run and de-dupes it; `:immediately` runs it
  the instant the notifying resource updates (use it when a later resource depends on
  the side effect). `subscribes` is the inverse edge, declared on the receiver. A
  notification only fires when the notifying resource actually *changed state* — a
  guarded, already-converged resource notifies nothing.
- **Run-list / resource order is the compile order.** Chef is NOT declarative like
  Puppet: resources converge top-to-bottom in the order the recipe code adds them to
  the collection. Reordering recipe lines reorders execution.
- **Attribute precedence** is a 15-level ladder (`default` < `force_default` < `normal`
  < `override` < `force_override` < `automatic`). Setting the same key at two
  precedences and expecting the "closer" file to win is a frequent surprise — a role
  `override` beats a cookbook `default` regardless of load order.

## Safety — why-run mode
```bash
# Preview convergence WITHOUT changing the node. Providers that support why-run
# report what they WOULD do; unsupported custom resources print a whyrun warning.
chef-client --why-run          # aka --whyrun / -W
```
- why-run is best-effort: a custom resource that shells out in a `ruby_block` may not
  honor it, so a clean why-run is NOT a guarantee. Pair it with Test Kitchen + InSpec
  for real assurance. Never treat why-run as a substitute for a converge in a
  throwaway environment.

## Security — secrets (CWE-312)
Storing credentials in attributes or committing them in cookbook files is **CWE-312
"Cleartext Storage of Sensitive Information"** (cwe.mitre.org/data/definitions/312.html) —
node attributes are visible on the Chef Infra Server and in `node.save` data, and
cookbook files land in every repo clone.

```ruby
# FOOTGUN: CWE-312 — cleartext secret in an attribute, shipped to the server.
default['myapp']['db_password'] = 'hunter2'

# RIGHT: Chef Vault — an encrypted data bag whose item is decryptable only by the
# nodes/admins on its ACL, using each node's client key. No shared static key.
require 'chef-vault'
db_pw = chef_vault_item('secrets', 'db')['password']   # decrypted at converge

file '/etc/myapp/db.conf' do
  content "password=#{db_pw}"
  sensitive true      # keeps the secret out of chef-client logs / diffs
  mode '0600'
end
```
- Prefer an external secrets manager (HashiCorp Vault, AWS Secrets Manager) for
  dynamic/rotating secrets; encrypted data bags / Chef Vault are for static ones.
- Always set `sensitive true` on resources whose content is a secret, or the plaintext
  is echoed into the run log and the resource diff.

## Performance & Testing (Test Kitchen / InSpec)
- **Converge cost scales with resource count and non-idempotent resources.** Every
  unguarded `execute`/`bash` re-runs on each `chef-client` interval — a handful across
  a large fleet is real, recurring CPU/IO. Guard them (above) so converged runs are
  no-ops that finish in milliseconds.
- **Test the cookbook, not the node.** Test Kitchen spins a throwaway VM/container,
  converges twice, and asserts state with InSpec — the second converge MUST report
  **zero changes** (idempotency proof). A cookbook that "changes" on the second converge
  has a non-idempotent resource.

```ruby
# test/integration/default/default_test.rb (InSpec) — assert behavior, not structure
describe service('myapp') do
  it { should be_enabled }
  it { should be_running }
end
describe file('/etc/myapp/config.json') do
  its('mode') { should cmp '0644' }
end
```
```bash
kitchen test               # create → converge → verify → destroy
kitchen converge && kitchen converge   # 2nd run must show "0 resources updated"
cookstyle -a               # lint/autocorrect (RuboCop for Chef) before commit
```

## Version-Specific Gotchas (dated, sourced)
- **Chef Infra Client 19.x** is the current major line (gem `chef` 19.3.15;
  chef/chef release `v19.3.53`), Ruby 3.x. `unified_mode true` is the default for
  custom resources since Chef 18 — the old "compile then converge" two-phase behavior
  inside a custom resource is gone; sub-resources now converge inline.
  [rubygems.org/api/v1/gems/chef.json + github.com/chef/chef/releases, retrieved 2026-07-10]
- **Policyfiles** are the standard dependency/versioning mechanism — they replace
  Berkshelf + Chef Environments and lock the exact cookbook set in `Policyfile.lock.json`.
  [docs.chef.io/policyfile, retrieved 2026-07-10]
- Install/verify with Chef Workstation (bundles `chef`, `knife`, `cookstyle`, `Test Kitchen`).
  [docs.chef.io/workstation, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Chef Infra releases (gem): https://rubygems.org/gems/chef
- Chef Infra Client releases: https://github.com/chef/chef/releases
- Resource guards (not_if/only_if): https://docs.chef.io/resource_common/
- Notifications & subscriptions: https://docs.chef.io/resources/#notifications
- Chef Vault / encrypted data bags: https://docs.chef.io/data_bags/
- why-run mode: https://docs.chef.io/config_rb_client/
- CWE-312 (Cleartext Storage of Sensitive Information): https://cwe.mitre.org/data/definitions/312.html
