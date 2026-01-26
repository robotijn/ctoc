# Tornado CTO
> Python async networking library.

## Non-Negotiables
1. Async handlers
2. IOLoop awareness
3. Proper coroutines
4. WebSocket handling
5. Non-blocking clients

## Red Lines
- Blocking in handlers
- Sync HTTP clients
- Missing error handling
- Callback pyramids

## Pattern
```python
class UserHandler(RequestHandler):
    async def post(self):
        data = json.loads(self.request.body)
        user = await self.application.user_service.create(data)
        self.set_status(201)
        self.write(user.to_dict())
```
