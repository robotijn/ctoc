# Bottle CTO
> Single-file Python micro-framework - simple, lightweight, WSGI compliant.

## Commands
```bash
# Setup | Dev | Test
pip install bottle
python app.py
pytest tests/ -v
```

## Non-Negotiables
1. WSGI compliance for deployment
2. Plugin architecture for extensions
3. Route decorators for clean APIs
4. Template simplicity (built-in or Jinja2)
5. Proper error handling with error decorator

## Red Lines
- Complex applications in single file - modularize
- Missing plugins for features (auth, DB)
- No error handlers registered
- Ignoring request/response objects
- Blocking without async support

## Pattern: Modular Application
```python
from bottle import Bottle, request, response, abort, HTTPError
import json

app = Bottle()

# Error handling
@app.error(404)
def error404(error):
    response.content_type = 'application/json'
    return json.dumps({'error': 'Not found'})

@app.error(500)
def error500(error):
    response.content_type = 'application/json'
    return json.dumps({'error': 'Internal server error'})

# Plugins for services
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

@app.get('/health')
def health():
    return {'status': 'ok'}

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
```

## Integrates With
- **DB**: SQLAlchemy via plugin, or raw SQL
- **Templates**: Built-in SimpleTemplate or Jinja2
- **Auth**: `bottle-cork` or custom plugin
- **Server**: Gunicorn, Waitress for production

## Common Errors
| Error | Fix |
|-------|-----|
| `Route not found` | Check route decorator syntax |
| `Request.json is None` | Check Content-Type header |
| `Plugin not found` | Install with `app.install()` |
| `Template not found` | Check `views/` directory |

## Prod Ready
- [ ] WSGI server (Gunicorn, uWSGI)
- [ ] Error handlers for all codes
- [ ] Plugins for cross-cutting concerns
- [ ] Logging configured
- [ ] Health check endpoint
- [ ] Request validation
