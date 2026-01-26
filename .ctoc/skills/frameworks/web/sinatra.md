# Sinatra CTO
> Minimal Ruby DSL for web apps.

## Non-Negotiables
1. Modular application style
2. Proper helpers
3. Before/after filters
4. Error handling blocks
5. Rack middleware

## Red Lines
- Classic style in production
- Logic in route blocks
- Missing error handlers
- No input validation

## Pattern
```ruby
class App < Sinatra::Base
  before do
    content_type :json
  end

  post '/users' do
    user = User.create(JSON.parse(request.body.read))
    status 201
    user.to_json
  end
end
```
