# Hanami CTO
> Modern Ruby framework with clean architecture.

## Non-Negotiables
1. Repository pattern
2. Actions as objects
3. Dry-rb integration
4. Slice architecture
5. ROM for persistence

## Red Lines
- ActiveRecord patterns
- Fat actions
- Missing validations
- Ignoring dependency injection

## Pattern
```ruby
module Main
  module Actions
    module Users
      class Create < Main::Action
        include Deps["repos.user_repo"]

        def handle(request, response)
          user = user_repo.create(request.params[:user])
          response.status = 201
          response.body = user.to_json
        end
      end
    end
  end
end
```
