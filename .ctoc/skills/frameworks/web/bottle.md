# Bottle CTO
> Single-file Python micro-framework.

## Non-Negotiables
1. WSGI compliance
2. Plugin architecture
3. Route decorators
4. Template simplicity
5. Proper error handling

## Red Lines
- Complex apps in single file
- Missing plugins for features
- No error handlers
- Ignoring request/response objects

## Pattern
```python
from bottle import Bottle, request, response

app = Bottle()

@app.post('/users')
def create_user():
    data = request.json
    user = user_service.create(data)
    response.status = 201
    return user
```
