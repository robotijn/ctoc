# Sinatra CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
gem install sinatra puma
# Sinatra 4.x - requires Ruby 3.0+
ruby app.rb
```

## Claude's Common Mistakes
1. **Classic style in production** — Use modular (`Sinatra::Base`)
2. **Business logic in routes** — Extract to service objects
3. **Missing error handlers** — Define handlers for all error codes
4. **No input validation** — Validate before processing
5. **Reading request body twice** — Body can only be read once

## Correct Patterns (2026)
```ruby
# app.rb - Modular style (NOT classic)
require 'sinatra/base'
require 'json'

class UsersApp < Sinatra::Base
  configure do
    set :show_exceptions, false
  end

  helpers do
    def json_body
      @json_body ||= JSON.parse(request.body.read)
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

  # Error handlers (required)
  error Sinatra::NotFound do
    json_response({ error: 'Not found' }, status: 404)
  end

  error do
    json_response({ error: 'Internal error' }, status: 500)
  end

  post '/users' do
    data = json_body
    halt 400, { error: 'Email required' }.to_json unless data['email']

    user = UserService.create(data)  # Service, not inline logic
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

## Version Gotchas
- **Sinatra 4.x**: Ruby 3.0+ required
- **Modular style**: `Sinatra::Base` for production
- **Puma**: Recommended production server
- **Request body**: Can only be read once; cache if needed

## What NOT to Do
- ❌ `require 'sinatra'` in production — Use `Sinatra::Base`
- ❌ Business logic in route blocks — Extract to services
- ❌ Missing `error` handlers — Errors return generic HTML
- ❌ `request.body.read` multiple times — Cache in helper
- ❌ `ruby app.rb` in production — Use `rackup` with Puma

## Classic vs Modular
| Classic (DEV only) | Modular (PRODUCTION) |
|--------------------|----------------------|
| `require 'sinatra'` | `class App < Sinatra::Base` |
| Top-level routes | Class methods |
| Auto-run | Explicit `run App` |

## Production Setup
```ruby
# config.ru
require './app'

# Middleware
use Rack::Logger
use Rack::CommonLogger

run UsersApp
```
