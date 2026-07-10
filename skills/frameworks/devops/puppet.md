# Puppet CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Puppet Development Kit (for module development)
# Download from puppet.com/download-puppet-development-kit
pdk new module mymodule
# Puppet Agent
wget https://apt.puppet.com/puppet8-release-jammy.deb
sudo dpkg -i puppet8-release-jammy.deb
sudo apt-get update && sudo apt-get install puppet-agent
```

## Claude's Common Mistakes
1. **Uses exec without guards** - Missing onlyif/unless breaks idempotence
2. **Hardcodes data in manifests** - Use Hiera lookups
3. **Missing module dependencies** - Breaks catalog compilation
4. **Ignores resource ordering** - Causes race conditions
5. **Skips PDK for development** - Non-standard module structure

## Correct Patterns (2026)
```puppet
# manifests/init.pp
class myapp (
  String $version = lookup('myapp::version'),
  String $config_source = lookup('myapp::config_source'),
  Boolean $manage_service = lookup('myapp::manage_service', default_value => true),
) {
  package { 'myapp':
    ensure => $version,
  }

  file { '/etc/myapp/config.yml':
    ensure  => file,
    source  => $config_source,
    mode    => '0644',
    require => Package['myapp'],
    notify  => Service['myapp'],
  }

  if $manage_service {
    service { 'myapp':
      ensure    => running,
      enable    => true,
      subscribe => File['/etc/myapp/config.yml'],
    }
  }
}

# data/common.yaml
myapp::version: '2.1.0'
myapp::config_source: 'puppet:///modules/myapp/config.yml'
myapp::manage_service: true
```

## Version Gotchas
- **Puppet 8**: Default for new installs, Ruby 3.x required
- **Puppet 7**: Still supported, but migrate to 8 recommended
- **PDK 3.x**: Required for Puppet 8 modules
- **With r10k**: Lock module versions in Puppetfile

## What NOT to Do
- Do NOT use exec without onlyif/unless guards
- Do NOT hardcode data in manifests - use Hiera
- Do NOT skip PDK for module development
- Do NOT ignore resource relationships - explicit ordering required
- Do NOT forget to encrypt Hiera data with hiera-eyaml

## Catalog Footguns
Puppet is **declarative**: the manifest describes desired state, the compiler builds a
catalog, and resource *application order is NOT source order* — it is the topological
sort of the dependency graph. The single most common Claude bug is assuming resources
apply top-to-bottom.

```puppet
# FOOTGUN: no relationship declared. Puppet may apply Service before Package, so the
# service start fails on the first run ("could not find init script").
package { 'nginx': ensure => installed }
service { 'nginx': ensure => running }

# RIGHT: declare the edge. require/before order application; notify/subscribe order
# application AND refresh the target when the source changes.
package { 'nginx':
  ensure => installed,
}
file { '/etc/nginx/nginx.conf':
  ensure  => file,
  content => template('nginx/nginx.conf.erb'),
  require => Package['nginx'],     # apply after the package
  notify  => Service['nginx'],     # + restart the service if this file changes
}
service { 'nginx':
  ensure    => running,
  enable    => true,
  subscribe => File['/etc/nginx/nginx.conf'],   # inverse of notify (optional here)
}
```

- **Ordering metaparameters:** `require`/`before` are pure ordering; `notify`/`subscribe`
  are ordering **plus** a refresh event (restart/reload). Chaining arrows `->` (order)
  and `~>` (order+notify) are the terser equivalent.
- **`exec` must be made idempotent** with `creates`, `unless`, or `onlyif` — otherwise
  it runs every catalog application (Puppet cannot know an arbitrary command's state):

```puppet
# FOOTGUN: runs every 30-minute agent run, always reports "changed".
exec { 'extract-app': command => '/bin/tar xzf /tmp/app.tgz -C /opt' }

# RIGHT: creates guards on a path; the exec is skipped once it exists.
exec { 'extract-app':
  command => '/bin/tar xzf /tmp/app.tgz -C /opt',
  creates => '/opt/app/VERSION',        # or: unless => 'test -f /opt/app/VERSION'
  path    => ['/bin', '/usr/bin'],
}
```

- **Class vs defined type:** a `class` is a singleton — declared at most once per node
  (a second `include` is a no-op, but a second *resource-like* `class { }` declaration
  is a compile error: "Duplicate declaration"). A **defined type** (`define`) is a
  reusable resource you can declare many times with different titles. Reaching for a
  class where you need N instances is a frequent design bug.
- **Hiera lookup precedence** resolves a key by walking the hierarchy top-to-bottom and
  returning the **first** match (for `lookup`'s default `first` merge). Put node/env
  overrides ABOVE `common.yaml`; expecting `common` to "win" inverts the model. Use an
  explicit `merge => deep` only when you intend to combine hashes across layers.

## Safety — --noop
```bash
# Compile the catalog and report every change that WOULD be made, changing nothing.
puppet agent -t --noop        # or `puppet apply --noop manifest.pp`
```
- `--noop` is honored by built-in resource types; a custom type/provider that ignores
  `noop?` can still act, so a clean `--noop` is not an absolute guarantee. `notify`
  events from a noop'd resource are also noop'd (the refresh does not happen), so a
  noop run does not exercise restart side effects. Pair with rspec-puppet + Litmus.

## Security — Hiera secrets (CWE-312)
Committing plaintext credentials in manifests or in `data/*.yaml` is **CWE-312
"Cleartext Storage of Sensitive Information"** (cwe.mitre.org/data/definitions/312.html) —
Hiera data lives in the control repo and the compiled catalog is stored on the Puppet
Server and cached on the agent.

```yaml
# FOOTGUN: CWE-312 — plaintext secret committed in data/common.yaml.
myapp::db_password: 'hunter2'

# RIGHT: hiera-eyaml — value is PKCS#7-encrypted; only the Server's private key decrypts.
myapp::db_password: >
  ENC[PKCS7,MIIBeQYJKoZIhvcNAQcDoIIBajCCAWYCAQAxgg...==]
```
```puppet
# Mark the parameter Sensitive so its value is redacted from logs and reports.
class myapp (Sensitive[String] $db_password = lookup('myapp::db_password')) {
  file { '/etc/myapp/db.conf':
    ensure  => file,
    content => Sensitive("password=${db_password.unwrap}"),
    mode    => '0600',
    show_diff => false,
  }
}
```
- Encrypt with `eyaml encrypt`; the private key stays on the Puppet Server only, never
  in the control repo. Wrap secret parameters in the `Sensitive` data type so they are
  redacted from `--noop` diffs, logs, and PuppetDB reports.

## Performance & Testing (rspec-puppet / Litmus)
- **Catalog-compile cost scales with resource count and template complexity.** A manifest
  that generates thousands of resources (e.g. a per-file resource in a loop over a large
  directory) makes every agent run recompile slowly on the Puppet Server. Prefer
  `file { ...: recurse => true }` or a single `concat` over N discrete resources.
- **`exec` without a guard is both a correctness AND a performance bug** — it shells out
  every 30-minute agent run. Guarded execs are skipped, keeping converged runs cheap.
- **Test the catalog and the behavior.** `rspec-puppet` compiles the catalog and asserts
  resources/relationships (fast, no VM); **Litmus** provisions a container/VM and asserts
  real convergence + idempotency (a second `puppet apply` must report **no changes**).

```ruby
# spec/classes/myapp_spec.rb (rspec-puppet) — assert the compiled catalog
describe 'myapp' do
  it { is_expected.to compile.with_all_deps }
  it { is_expected.to contain_service('myapp').that_subscribes_to('File[/etc/myapp/config.yml]') }
end
```
```bash
pdk validate && pdk test unit      # lint + rspec-puppet
# Litmus: provision → apply → apply again (idempotency) → destroy
```

## Version-Specific Gotchas (dated, sourced)
- **Puppet 8** is the current major line (agent/gem `puppet` 8.10.0), requiring
  **Ruby 3.2**; Puppet 7 (Ruby 2.7/3.1) is in extended support — migrate to 8. PDK 3.x
  is required to build Puppet 8 modules.
  [rubygems.org/api/v1/gems/puppet.json + puppet.com/docs/puppet/8, retrieved 2026-07-10]
- Lock module versions in the `Puppetfile` and deploy environments with r10k / Code
  Manager so a catalog compile is reproducible.
  [puppet.com/docs/puppet/8/puppetfile, retrieved 2026-07-10]
- Deprecated `exec` without a guard, and unqualified variable references, now raise
  stricter warnings under Puppet 8's parser.
  [puppet.com/docs/puppet/8/lang_resources, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Puppet 8 docs: https://www.puppet.com/docs/puppet/8/puppet_index.html
- Puppet releases (gem): https://rubygems.org/gems/puppet
- Resource ordering / relationships: https://www.puppet.com/docs/puppet/8/lang_relationships.html
- exec resource (creates/unless/onlyif): https://www.puppet.com/docs/puppet/8/types/exec.html
- Hiera lookup & merge behavior: https://www.puppet.com/docs/puppet/8/hiera_merging.html
- hiera-eyaml: https://github.com/voxpupuli/hiera-eyaml
- The Sensitive data type: https://www.puppet.com/docs/puppet/8/lang_data_sensitive.html
- CWE-312 (Cleartext Storage of Sensitive Information): https://cwe.mitre.org/data/definitions/312.html
