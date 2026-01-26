# Sanic CTO
> Async Python web server.

## Non-Negotiables
1. Async/await everywhere
2. Blueprints for organization
3. Middleware properly ordered
4. Signal handlers
5. Worker configuration

## Red Lines
- Blocking in handlers
- Missing blueprints for large apps
- Sync database calls
- Ignoring worker count

## Pattern
```python
@app.post("/users")
async def create_user(request):
    data = request.json
    user = await UserService.create(data)
    return json(user.to_dict(), status=201)
```
