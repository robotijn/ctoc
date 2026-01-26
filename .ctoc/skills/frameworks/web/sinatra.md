# Sinatra CTO
> Minimal Ruby DSL for web apps - simple, lightweight, no magic.

## Commands
```bash
# Setup | Dev | Test
gem install sinatra puma
ruby app.rb
bundle exec rspec
```

## Non-Negotiables
1. Modular application style for production
2. Helpers for reusable view logic
3. Before/after filters for cross-cutting
4. Error handling blocks for all codes
5. Rack middleware for concerns

## Red Lines
- Classic style in production - use modular
- Business logic in route blocks
- Missing error handlers
- No input validation
- Global state without protection

## Pattern: Modular Application
```ruby
# app.rb
require 'sinatra/base'
require 'json'

class UsersApp < Sinatra::Base
  configure do
    set :show_exceptions, false
  end

  helpers do
    def json_body
      JSON.parse(request.body.read)
    rescue JSON::ParserError
      halt 400, { error: 'Invalid JSON' }.to_json
    end

    def json_response(data, status: 200)
      content_type :json
      status status
      data.to_json
    end
  end

  before do
    content_type :json
  end

  error Sinatra::NotFound do
    json_response({ error: 'Not found' }, status: 404)
  end

  error do
    json_response({ error: 'Internal error' }, status: 500)
  end

  post '/users' do
    data = json_body
    halt 400, { error: 'Email required' }.to_json unless data['email']

    user = UserService.create(data)
    json_response(user, status: 201)
  end

  get '/users/:id' do
    user = UserService.find(params[:id])
    halt 404, { error: 'Not found' }.to_json unless user
    json_response(user)
  end
end

# config.ru
require './app'
run UsersApp
```

## Integrates With
- **DB**: Sequel or ActiveRecord
- **Auth**: `sinatra-authentication` or Warden
- **Validation**: dry-validation
- **Templates**: ERB, Haml, or Slim

## Common Errors
| Error | Fix |
|-------|-----|
| `NoMethodError in route` | Check helper is defined |
| `Empty request body` | Body already read; use `request.body.rewind` |
| `Route not matching` | Check HTTP method and path |
| `Template not found` | Check `views/` directory |

## Prod Ready
- [ ] Modular style (`Sinatra::Base`)
- [ ] Puma or Unicorn as server
- [ ] Error handling for all codes
- [ ] Request logging middleware
- [ ] Environment-based config
- [ ] Health check endpoint
