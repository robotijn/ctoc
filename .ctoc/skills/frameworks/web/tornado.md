# Tornado CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install tornado
python server.py
# Tornado 6.x - async Python web server
```

## Claude's Common Mistakes
1. **Blocking calls in handlers** — Use `run_in_executor` for sync code
2. **Sync HTTP clients** — Always use `AsyncHTTPClient`
3. **`gen.coroutine` decorator** — Use native `async def` instead
4. **Callback pyramids** — Use async/await syntax
5. **Missing error handling** — Handlers fail silently without try/except

## Correct Patterns (2026)
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

            # Async service call (NOT blocking)
            user = await self.application.user_service.create(data)
            self.set_status(201)
            self.write(user.to_dict())
        except Exception as e:
            self.set_status(500)
            self.write({'error': 'Internal error'})

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
    ])

if __name__ == "__main__":
    app = make_app()
    app.listen(8888)
    tornado.ioloop.IOLoop.current().start()
```

## Version Gotchas
- **Tornado 6.x**: Native async/await; `gen.coroutine` deprecated
- **IOLoop**: One per thread; don't nest starts
- **WebSocket**: Native support; ideal for real-time
- **AsyncHTTPClient**: Required for non-blocking HTTP

## What NOT to Do
- ❌ `@gen.coroutine` — Use `async def` natively
- ❌ `requests.get()` in handlers — Use `AsyncHTTPClient`
- ❌ `time.sleep()` — Use `tornado.gen.sleep()` or `asyncio.sleep()`
- ❌ Missing try/except — Errors fail silently
- ❌ Nested IOLoop starts — One IOLoop per thread

## Blocking to Async
```python
from concurrent.futures import ThreadPoolExecutor
executor = ThreadPoolExecutor(max_workers=4)

async def handler(self):
    # Run blocking code in executor
    result = await tornado.ioloop.IOLoop.current().run_in_executor(
        executor,
        blocking_function,
        arg1, arg2
    )
```

## Common Errors
| Error | Fix |
|-------|-----|
| `IOLoop already running` | Don't nest IOLoop.start() |
| `Connection reset` | Handle disconnects gracefully |
| `Blocking call detected` | Use `run_in_executor` |
| `JSON decode error` | Check Content-Type, validate body |
