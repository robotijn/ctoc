# Hanami CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
gem install hanami
hanami new myapp && cd myapp
bundle exec hanami server
# Hanami 2.x - clean architecture Ruby framework
```

## Claude's Common Mistakes
1. **Using ActiveRecord patterns** — Hanami uses ROM, not ActiveRecord
2. **Fat actions** — Keep actions thin, extract to operations
3. **Missing dependency injection** — Use `Deps[]` container
4. **Ignoring slice architecture** — Organize code into slices
5. **Skipping validations** — Use dry-validation contracts

## Correct Patterns (2026)
```ruby
# app/actions/users/create.rb
module MyApp
  module Actions
    module Users
      class Create < MyApp::Action
        include Deps["repos.user_repo", "operations.create_user"]

        params do
          required(:user).hash do
            required(:email).filled(:string)
            required(:password).filled(:string, min_size?: 8)
          end
        end

        def handle(request, response)
          if request.params.valid?
            user = create_user.call(request.params[:user])
            response.status = 201
            response.format = :json
            response.body = user.to_json
          else
            response.status = 422
            response.format = :json
            response.body = { errors: request.params.errors }.to_json
          end
        end
      end
    end
  end
end

# app/repos/user_repo.rb
module MyApp
  module Repos
    class UserRepo < MyApp::Repo
      commands :create, use: :timestamps, plugins_options: {
        timestamps: { timestamps: [:created_at, :updated_at] }
      }

      def find(id)
        users.by_pk(id).one
      end

      def find_by_email(email)
        users.where(email: email).one
      end
    end
  end
end

# app/operations/create_user.rb
module MyApp
  module Operations
    class CreateUser
      include Deps["repos.user_repo"]

      def call(params)
        user_repo.create(
          email: params[:email],
          password: BCrypt::Password.create(params[:password])
        )
      end
    end
  end
end
```

## Version Gotchas
- **Hanami 2.x**: Complete rewrite; slice-based architecture
- **ROM**: Replaces ActiveRecord; repository pattern required
- **Deps**: Dependency injection via `include Deps["..."]`
- **Slices**: Organize by bounded context, not by type

## What NOT to Do
- ❌ `User.find(id)` (ActiveRecord) — Use repository pattern
- ❌ Business logic in actions — Extract to operations
- ❌ Direct instantiation — Use `Deps[]` for injection
- ❌ Single monolithic app — Use slices for organization
- ❌ Skipping params validation — Use dry-validation

## Common Errors
| Error | Fix |
|-------|-----|
| `Deps not found` | Register in container |
| `ROM relation missing` | Define in relations/ |
| `Validation bypassed` | Add `params` block to action |
| `Slice not loaded` | Check slice registration |
