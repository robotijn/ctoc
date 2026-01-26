# Marko CTO
> Streaming UI framework - eBay-scale performance, progressive rendering.

## Commands
```bash
# Setup | Dev | Test
npx @marko/create myapp && cd myapp
npm run dev
npm run build && npm start
```

## Non-Negotiables
1. Streaming SSR for time-to-first-byte
2. Component-based architecture
3. Concise syntax (no closing tags for void elements)
4. Proper state management with $
5. Islands architecture for hydration

## Red Lines
- Blocking render with sync operations
- Client-only components when SSR works
- Missing streaming benefits on server
- Ignoring compiler optimizations
- Heavy client-side JavaScript

## Pattern: Component with State
```marko
// components/counter.marko
class {
  onCreate() {
    this.state = { count: 0 };
  }

  increment() {
    this.state.count++;
  }

  decrement() {
    this.state.count--;
  }
}

<div class="counter">
  <button on-click('decrement')>-</button>
  <span>${state.count}</span>
  <button on-click('increment')>+</button>
</div>

// pages/users.marko - Streaming data
import UserService from '../services/user-service';

$ const usersPromise = UserService.getAll();

<await(usersPromise)>
  <@then|users|>
    <ul>
      <for|user| of=users>
        <li key=user.id>${user.name}</li>
      </for>
    </ul>
  </@then>
  <@catch|err|>
    <div class="error">Failed to load users</div>
  </@catch>
  <@placeholder>
    <div class="loading">Loading users...</div>
  </@placeholder>
</await>
```

```marko
// layouts/main.marko
<!doctype html>
<html>
<head>
  <title>${input.title}</title>
</head>
<body>
  <${input.renderBody}/>
</body>
</html>
```

## Integrates With
- **Server**: Express, Fastify, Hapi
- **Build**: @marko/vite, Webpack
- **State**: Component state, stores
- **Testing**: @marko/testing-library

## Common Errors
| Error | Fix |
|-------|-----|
| `Component not found` | Check components/ directory structure |
| `State not reactive` | Use this.state.prop = value pattern |
| `Hydration mismatch` | Ensure server/client render same content |
| `Streaming not working` | Use await tag with promises |

## Prod Ready
- [ ] Streaming SSR enabled
- [ ] Selective hydration configured
- [ ] Bundle size optimized
- [ ] Error handling with @catch
- [ ] Loading states with @placeholder
- [ ] CDN caching for static assets
