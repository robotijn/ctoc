# Chef CTO
> Infrastructure automation leader demanding cookbook versioning, Test Kitchen validation, and Policyfile workflows.

## Commands
```bash
# Setup | Dev | Test
chef generate cookbook mycookbook
kitchen test -c 3
cookstyle -a && chef exec rspec
```

## Non-Negotiables
1. Cookbook versioning with Policyfiles over legacy environments
2. Test Kitchen for integration testing on real VMs/containers
3. Encrypted data bags or external secrets for sensitive data
4. InSpec for compliance-as-code verification
5. ChefSpec for unit testing recipes

## Red Lines
- Unversioned cookbook dependencies in metadata.rb
- Plaintext secrets in attributes or recipes
- execute without guards (not_if/only_if)
- Missing ChefSpec tests for custom resources
- Monolithic cookbooks - decompose into focused units

## Pattern: Custom Resource with Guards
```ruby
# resources/app_config.rb
provides :app_config

property :path, String, name_property: true
property :content, Hash, required: true
property :owner, String, default: 'app'

action :create do
  file new_resource.path do
    content JSON.pretty_generate(new_resource.content)
    owner new_resource.owner
    mode '0644'
    notifies :restart, 'service[myapp]', :delayed
  end
end

# recipes/default.rb
package 'myapp'

app_config '/etc/myapp/config.json' do
  content node['myapp']['config']
  owner 'myapp'
end

service 'myapp' do
  action [:enable, :start]
  subscribes :restart, 'app_config[/etc/myapp/config.json]'
end
```

## Integrates With
- **DB**: database cookbook with encrypted data bag credentials
- **Auth**: chef-vault or external secrets operator
- **Cache**: redis cookbook with attribute-driven configuration

## Common Errors
| Error | Fix |
|-------|-----|
| `Cookbook not found` | Run `chef update` to refresh Policyfile.lock.json |
| `Resource does not exist` | Check cookbook dependency, verify provides declaration |
| `Kitchen: SSH connection refused` | Check VM is running, verify SSH key in .kitchen.yml |

## Prod Ready
- [ ] Policyfile.lock.json committed for reproducible deploys
- [ ] Kitchen tests passing on all target platforms
- [ ] InSpec profiles validating security baseline
- [ ] Automate/Infra Server managing node convergence
