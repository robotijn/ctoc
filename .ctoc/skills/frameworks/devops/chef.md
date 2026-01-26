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
