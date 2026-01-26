# CherryPy CTO
> Object-oriented Python web framework - mature, production-ready, self-contained.

## Commands
```bash
# Setup | Dev | Test
pip install cherrypy
python app.py
pytest tests/ -v
```

## Non-Negotiables
1. Object dispatching with @cherrypy.expose
2. Tool architecture for cross-cutting concerns
3. Configuration system (app.conf, server.conf)
4. Engine plugins for background tasks
5. Proper mounting for multiple apps

## Red Lines
- Ignoring configuration hierarchy
- Missing tools for auth, JSON, sessions
- No session handling for stateful apps
- Blocking main thread without threading
- Direct database access in handlers

## Pattern: Application with Tools
```python
import cherrypy
from services import UserService

class UserAPI:
    def __init__(self):
        self.service = UserService()

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

# Configuration
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
    cherrypy.quickstart(UserAPI(), '/', config)
```

## Integrates With
- **DB**: SQLAlchemy, raw DB-API
- **Auth**: cherrypy.tools.auth, custom tools
- **Sessions**: Built-in sessions, Redis backend
- **Deploy**: WSGI servers, reverse proxy

## Common Errors
| Error | Fix |
|-------|-----|
| `Method not allowed` | Add @cherrypy.expose decorator |
| `JSON parse error` | Add @cherrypy.tools.json_in() |
| `Session error` | Enable sessions in config |
| `Thread pool exhausted` | Increase thread_pool setting |

## Prod Ready
- [ ] Production config (disable autoreload)
- [ ] Thread pool sized appropriately
- [ ] Sessions configured with backend
- [ ] Logging configured
- [ ] Behind reverse proxy (nginx)
- [ ] Health endpoint exposed
