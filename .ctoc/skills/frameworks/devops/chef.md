# Chef CTO
> Infrastructure automation with Ruby DSL.

## Non-Negotiables
1. Cookbook versioning
2. Test Kitchen for testing
3. Data bags for secrets (encrypted)
4. Policyfiles over environments
5. InSpec for compliance

## Red Lines
- Unversioned cookbook dependencies
- Plaintext secrets in attributes
- execute without not_if/only_if
- Missing ChefSpec tests
- Monolithic cookbooks

## Pattern
```ruby
package 'nginx'

template '/etc/nginx/nginx.conf' do
  source 'nginx.conf.erb'
  notifies :reload, 'service[nginx]'
end

service 'nginx' do
  action [:enable, :start]
end
```
