# Falcon CTO
> High-performance Python API framework.

## Non-Negotiables
1. Resource classes
2. Middleware hooks
3. ASGI/WSGI support
4. Responder methods
5. Minimal overhead

## Red Lines
- Logic outside resources
- Missing media handlers
- Sync in ASGI mode
- Ignoring hooks

## Pattern
```python
class UserResource:
    async def on_post(self, req, resp):
        data = await req.get_media()
        user = await self.service.create(data)
        resp.status = falcon.HTTP_201
        resp.media = user.to_dict()

app = falcon.asgi.App()
app.add_route('/users', UserResource())
```
