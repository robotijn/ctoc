# Puppet CTO
> Declarative infrastructure configuration.

## Non-Negotiables
1. Declarative resource model
2. Hiera for data separation
3. Module structure (Forge-compatible)
4. Puppet Development Kit (PDK)
5. r10k for environment management

## Red Lines
- Exec resources without onlyif/unless
- Hardcoded data in manifests
- Missing module dependencies
- No spec tests
- Resource ordering without relationships

## Pattern
```puppet
class myapp (
  String $version = '1.0.0',
) {
  package { 'myapp':
    ensure => $version,
  }
  ~> service { 'myapp':
    ensure => running,
    enable => true,
  }
}
```
