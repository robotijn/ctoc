# Tornado CTO
> Python async networking library - non-blocking I/O, WebSocket native.

## Commands
```bash
# Setup | Dev | Test
pip install tornado
python server.py
pytest tests/ -v
```

## Non-Negotiables
1. Async handlers with `async def`
2. IOLoop awareness and proper event handling
3. Native coroutines (not gen.coroutine)
4. WebSocket handlers for real-time
5. Non-blocking HTTP clients (`AsyncHTTPClient`)

## Red Lines
- Blocking calls in handlers - use `run_in_executor`
- Sync HTTP clients - always use `AsyncHTTPClient`
- Missing error handling in handlers
- Callback pyramids - use async/await
- Ignoring connection lifecycle

## Pattern: Async Application
```python
import tornado.web
import tornado.ioloop
import json
from tornado.httpclient import AsyncHTTPClient

class UserHandler(tornado.web.RequestHandler):
    async def post(self):
        try:
            data = json.loads(self.request.body)
            if not data.get('email'):
                self.set_status(400)
                self.write({'error': 'email required'})
                return

            user = await self.application.user_service.create(data)
            self.set_status(201)
            self.write(user.to_dict())
        except Exception as e:
            self.set_status(500)
            self.write({'error': str(e)})

    async def get(self, user_id):
        user = await self.application.user_service.get(int(user_id))
        if not user:
            self.set_status(404)
            self.write({'error': 'not found'})
            return
        self.write(user.to_dict())

class WebSocketHandler(tornado.websocket.WebSocketHandler):
    clients = set()

    def open(self):
        self.clients.add(self)

    def on_close(self):
        self.clients.discard(self)

    async def on_message(self, message):
        for client in self.clients:
            if client != self:
                await client.write_message(message)

def make_app():
    return tornado.web.Application([
        (r"/users", UserHandler),
        (r"/users/(\d+)", UserHandler),
        (r"/ws", WebSocketHandler),
    ], autoreload=True)

if __name__ == "__main__":
    app = make_app()
    app.user_service = UserService()
    app.listen(8888)
    tornado.ioloop.IOLoop.current().start()
```

## Integrates With
- **DB**: `aiopg` or `motor` for async access
- **HTTP**: `AsyncHTTPClient` for external APIs
- **WebSocket**: Native support in Tornado
- **Templates**: Built-in template engine

## Common Errors
| Error | Fix |
|-------|-----|
| `RuntimeError: IOLoop already running` | Don't nest IOLoop starts |
| `Connection reset` | Handle client disconnections gracefully |
| `Blocking call` | Use `run_in_executor` for sync code |
| `JSON decode error` | Check Content-Type, validate body |

## Prod Ready
- [ ] Multi-process with `fork_processes`
- [ ] Graceful shutdown handling
- [ ] Error logging configured
- [ ] Health check endpoint
- [ ] WebSocket ping/pong for keepalive
- [ ] HTTPS with SSL context
