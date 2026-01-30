# CherryPy CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install cherrypy
python app.py
# CherryPy 18.x - object-oriented Python web framework
```

## Claude's Common Mistakes
1. **Missing `@cherrypy.expose`** — Methods not exposed as endpoints
2. **Forgetting JSON tools** — Use `@cherrypy.tools.json_in/out()`
3. **Ignoring configuration hierarchy** — Global vs app vs path config
4. **Blocking without threading** — Configure thread pool
5. **No error handling** — Use `cherrypy.HTTPError`

## Correct Patterns (2026)
```python
import cherrypy

class UserAPI:
    def __init__(self, user_service):
        self.service = user_service

    @cherrypy.expose
    @cherrypy.tools.json_in()
    @cherrypy.tools.json_out()
    def create(self):
        data = cherrypy.request.json
        if not data or not data.get('email'):
            raise cherrypy.HTTPError(400, 'Email required')
        user = self.service.create(data)
        cherrypy.response.status = 201
        return user.to_dict()

    @cherrypy.expose
    @cherrypy.tools.json_out()
    def get(self, user_id):
        user = self.service.get(int(user_id))
        if not user:
            raise cherrypy.HTTPError(404, 'User not found')
        return user.to_dict()

    @cherrypy.expose
    @cherrypy.tools.json_out()
    def health(self):
        return {'status': 'ok'}

# Configuration (global + path)
config = {
    'global': {
        'server.socket_host': '0.0.0.0',
        'server.socket_port': 8080,
        'server.thread_pool': 10,
    },
    '/': {
        'tools.sessions.on': True,
        'tools.response_headers.on': True,
        'tools.response_headers.headers': [
            ('Content-Type', 'application/json')
        ],
    }
}

if __name__ == '__main__':
    cherrypy.quickstart(UserAPI(UserService()), '/', config)
```

## Version Gotchas
- **CherryPy 18.x**: Stable; Python 3.6+ required
- **Tools**: Decorators for JSON, sessions, auth
- **Config**: Three levels (global, app, path)
- **Threading**: Configure `thread_pool` for concurrency

## What NOT to Do
- ❌ Methods without `@cherrypy.expose` — Not accessible
- ❌ Manual JSON parsing — Use `@cherrypy.tools.json_in()`
- ❌ `raise Exception` — Use `cherrypy.HTTPError`
- ❌ Default thread pool in production — Configure appropriately
- ❌ Missing config hierarchy — Global < app < path

## Common Errors
| Error | Fix |
|-------|-----|
| `Method not allowed` | Add `@cherrypy.expose` |
| `JSON parse error` | Add `@cherrypy.tools.json_in()` |
| `Session error` | Enable in config: `tools.sessions.on` |
| `Thread pool exhausted` | Increase `thread_pool` setting |
