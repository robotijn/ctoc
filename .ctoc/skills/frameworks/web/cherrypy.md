# CherryPy CTO
> Object-oriented Python web framework.

## Non-Negotiables
1. Object dispatching
2. Tool architecture
3. Configuration system
4. Engine plugins
5. Proper mounting

## Red Lines
- Ignoring configuration
- Missing tools for cross-cutting
- No session handling
- Blocking without threads

## Pattern
```python
class UserAPI:
    @cherrypy.expose
    @cherrypy.tools.json_in()
    @cherrypy.tools.json_out()
    def create(self):
        data = cherrypy.request.json
        user = self.service.create(data)
        cherrypy.response.status = 201
        return user.to_dict()
```
