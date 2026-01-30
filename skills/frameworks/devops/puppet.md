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
