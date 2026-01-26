# Marko CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npx @marko/create myapp && cd myapp
npm run dev
# Marko 5.x - streaming UI framework from eBay
```

## Claude's Common Mistakes
1. **React/Vue patterns** — Marko has unique syntax and concepts
2. **Blocking renders** — Use streaming with `<await>` tag
3. **Client-heavy architecture** — Leverage SSR streaming
4. **Missing state prefix** — Use `state.` for reactive properties
5. **Closing void elements** — Marko uses concise syntax

## Correct Patterns (2026)
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

## Version Gotchas
- **Marko 5.x**: Current stable; compiler-based optimization
- **Streaming**: Use `<await>` for async data with placeholders
- **State**: Access via `state.prop`, update via `this.state.prop`
- **Concise syntax**: No closing tags for void elements

## What NOT to Do
- ❌ React JSX syntax — Use Marko's native syntax
- ❌ Blocking fetches — Use `<await>` for streaming
- ❌ `this.state.count` in template — Use `state.count`
- ❌ Missing `key` in `<for>` — Required for lists
- ❌ Client-side data fetching only — Leverage SSR streaming

## Common Errors
| Error | Fix |
|-------|-----|
| `Component not found` | Check components/ directory |
| `State not reactive` | Use `this.state.prop = value` |
| `Hydration mismatch` | Ensure server/client render same content |
| `Streaming not working` | Use `<await>` tag with promises |
