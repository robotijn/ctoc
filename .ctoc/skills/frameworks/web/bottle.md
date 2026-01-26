# Bottle CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install bottle
python app.py
# Bottle 0.13.x - single-file Python micro-framework
```

## Claude's Common Mistakes
1. **Complex apps in single file** — Modularize with multiple Bottle instances
2. **Missing error handlers** — Register handlers for 404, 500
3. **No plugin architecture** — Use plugins for cross-cutting concerns
4. **Ignoring WSGI compliance** — Required for production deployment
5. **Blocking operations** — Bottle is sync; use threads or async server

## Correct Patterns (2026)
```python
from bottle import Bottle, request, response, abort
import json

app = Bottle()

# Error handlers (REQUIRED)
@app.error(404)
def error404(error):
    response.content_type = 'application/json'
    return json.dumps({'error': 'Not found'})

@app.error(500)
def error500(error):
    response.content_type = 'application/json'
    return json.dumps({'error': 'Internal error'})

# Plugin for dependency injection
class ServicePlugin:
    name = 'services'
    api = 2

    def __init__(self, user_service):
        self.user_service = user_service

    def apply(self, callback, route):
        def wrapper(*args, **kwargs):
            kwargs['user_service'] = self.user_service
            return callback(*args, **kwargs)
        return wrapper

app.install(ServicePlugin(UserService()))

# Routes
@app.post('/api/users')
def create_user(user_service):
    data = request.json
    if not data or not data.get('email'):
        abort(400, 'Email required')
    user = user_service.create(data)
    response.status = 201
    response.content_type = 'application/json'
    return json.dumps(user.to_dict())

@app.get('/api/users/<user_id:int>')
def get_user(user_id, user_service):
    user = user_service.get(user_id)
    if not user:
        abort(404, 'User not found')
    response.content_type = 'application/json'
    return json.dumps(user.to_dict())
```

## Version Gotchas
- **Bottle 0.13.x**: Stable; minimal updates
- **WSGI**: Use Gunicorn/uWSGI for production
- **Plugins**: API version 2 for current plugin interface
- **JSON**: Set `Content-Type` manually

## What NOT to Do
- ❌ Large apps in single file — Split into modules
- ❌ `app.run()` in production — Use WSGI server
- ❌ Missing error handlers — Silent failures
- ❌ Forgetting `response.content_type` for JSON
- ❌ Blocking I/O without thread pool

## Common Errors
| Error | Fix |
|-------|-----|
| `request.json is None` | Check Content-Type header |
| `Route not found` | Check decorator syntax |
| `Plugin not found` | Install with `app.install()` |
| `Thread pool exhausted` | Use async WSGI server |
