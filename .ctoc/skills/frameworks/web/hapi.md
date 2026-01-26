# Hapi CTO
> Configuration-driven Node.js framework.

## Non-Negotiables
1. Plugin architecture
2. Joi validation
3. Server methods for caching
4. Authentication strategies
5. Proper lifecycle hooks

## Red Lines
- Direct request handling without validation
- Ignoring server.ext hooks
- Missing authentication
- Monolithic plugins

## Pattern
```javascript
server.route({
  method: 'POST',
  path: '/users',
  options: {
    validate: {
      payload: Joi.object({
        name: Joi.string().required()
      })
    }
  },
  handler: (request, h) => createUser(request.payload)
})
```
