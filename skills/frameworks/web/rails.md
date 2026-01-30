# Rails CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Rails 8.1 - requires Ruby 3.2+
gem install rails
rails new myapp --database=postgresql
# Rails 8 includes Kamal 2, Solid Queue, built-in auth generator
cd myapp && bin/rails server
```

## Claude's Common Mistakes
1. **Using `params.require().permit()` pattern** — Rails 8 uses `params.expect()` for safer handling
2. **Silencing deprecation warnings** — Fix them; they become errors in next major version
3. **Skipping intermediate versions** — Upgrade one major version at a time
4. **Monkey patching gems** — Document thoroughly or submit upstream PR
5. **N+1 queries** — Use `includes`, `preload`, or `eager_load`

## Correct Patterns (2026)
```ruby
# Rails 8: params.expect() instead of require().permit()
def user_params
  params.expect(user: [:name, :email, :password])
end

# Service object pattern
# app/services/users/create_service.rb
module Users
  class CreateService
    def initialize(params:)
      @params = params
    end

    def call
      ActiveRecord::Base.transaction do
        user = User.create!(@params)
        UserMailer.welcome(user).deliver_later
        user
      end
    rescue ActiveRecord::RecordInvalid => e
      Result.failure(e.record.errors)
    end
  end
end

# Proper eager loading
# Bad: N+1
Post.all.each { |p| puts p.author.name }

# Good: Single query
Post.includes(:author).each { |p| puts p.author.name }
```

## Version Gotchas
- **Rails 7→8**: `params.expect()` replaces `require().permit()`
- **Rails 8**: Kamal 2 for deployment, Solid Queue for jobs
- **Rails 8**: Built-in authentication generator
- **Rails 8.0 EOL**: Bug fixes until May 2026
- **Rails 8.2**: `update_all` with `distinct`/CTE raises error

## What NOT to Do
- ❌ `params.require(:user).permit(:name)` — Use `params.expect(user: [:name])`
- ❌ `Rails.logger.silence { }` for deprecations — Fix the warnings
- ❌ Upgrading Rails 6→8 in one PR — Go through 7.x first
- ❌ `save(validate: false)` — Almost always a code smell
- ❌ Forking gems without documentation — Maintain or upstream changes

## Rails 8 Features
| Feature | Description |
|---------|-------------|
| Kamal 2 | Built-in deployment with Kamal Proxy |
| Solid Queue | Database-backed job queue (replaces Redis) |
| Solid Cache | Database-backed caching |
| Auth Generator | `bin/rails generate authentication` |
| Propshaft | Default asset pipeline |

## Upgrade Checklist
```bash
# Before upgrading
bundle outdated          # Check gem compatibility
rails_best_practices .   # Find anti-patterns
brakeman                 # Security scan
```
