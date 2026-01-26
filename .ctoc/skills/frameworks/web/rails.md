# Rails CTO
> Convention over configuration - follow the Rails Way or have a damn good reason.

## Commands
```bash
# Setup | Dev | Test
rails new myapp --database=postgresql -T && cd myapp
rails server
bundle exec rspec --format documentation
```

## Non-Negotiables
1. Follow Rails conventions - deviate only with documented justification
2. Strong parameters on every controller action
3. Background jobs with Sidekiq for anything over 100ms
4. N+1 query prevention with `includes`, `preload`, `eager_load`
5. Database migrations are append-only in production

## Red Lines
- N+1 queries - use Bullet gem to detect
- Fat controllers - extract to services or concerns
- Skipping validations with `save(validate: false)`
- Mass assignment vulnerabilities - always use strong params
- Callbacks that hide business logic - prefer explicit service objects

## Pattern: Service Object
```ruby
# app/services/users/create_service.rb
module Users
  class CreateService
    def initialize(params:, current_user: nil)
      @params = params
      @current_user = current_user
    end

    def call
      user = User.new(permitted_params)

      ActiveRecord::Base.transaction do
        user.save!
        UserMailer.welcome(user).deliver_later
        Analytics.track_signup(user)
      end

      ServiceResult.success(user)
    rescue ActiveRecord::RecordInvalid => e
      ServiceResult.failure(e.record.errors)
    end

    private

    def permitted_params
      @params.slice(:email, :name, :password, :password_confirmation)
    end
  end
end
```

## Integrates With
- **DB**: PostgreSQL with `pg`, use database constraints alongside validations
- **Auth**: Devise with OmniAuth, or Rodauth for modern approach
- **Cache**: Redis with `redis-rails`, Russian doll caching with `cache`
- **Jobs**: Sidekiq with `sidekiq-cron` for scheduled tasks

## Common Errors
| Error | Fix |
|-------|-----|
| `PG::UndefinedTable` | Run `rails db:migrate` |
| `NameError: uninitialized constant` | Check class name matches file path |
| `ActionController::InvalidAuthenticityToken` | Include CSRF token in forms/AJAX |
| `ActiveRecord::RecordNotUnique` | Add uniqueness validation + DB constraint |

## Prod Ready
- [ ] `config/credentials.yml.enc` for secrets
- [ ] Puma configured with appropriate workers/threads
- [ ] Asset pipeline or import maps for JS
- [ ] Database indexes on foreign keys and lookup columns
- [ ] Health check endpoint at `/up` (Rails 7.1+)
- [ ] Exception tracking with Sentry or Honeybadger
