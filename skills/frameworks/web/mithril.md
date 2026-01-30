# Mithril.js CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm init -y && npm install mithril
npx vite
# Mithril 2.x - hyperscript UI framework (~10KB)
```

## Claude's Common Mistakes
1. **React/Vue patterns** — Mithril uses hyperscript, not JSX
2. **Missing m.request for data** — Auto-redraws after async completion
3. **Unnecessary m.redraw() calls** — m.request handles this automatically
4. **Module-level state** — Use closure state in components
5. **Missing keys in lists** — Required for efficient diffing

## Correct Patterns (2026)
```javascript
import m from 'mithril';

// Service with m.request (auto-redraws!)
const UserService = {
  list: [],
  loadAll: () => {
    return m.request({
      method: 'GET',
      url: '/api/users'
    }).then(result => {
      UserService.list = result;
    });
  },
  get: (id) => m.request({ method: 'GET', url: `/api/users/${id}` })
};

// Component with closure state (NOT module state)
const UserList = () => {
  let loading = true;

  return {
    oninit: () => {
      UserService.loadAll().then(() => { loading = false; });
    },
    view: () => {
      if (loading) return m('div.loading', 'Loading...');

      return m('ul.user-list',
        UserService.list.map(user =>
          m('li', { key: user.id },  // ALWAYS include key
            m(m.route.Link, { href: `/users/${user.id}` }, user.name)
          )
        )
      );
    }
  };
};

// User detail component
const UserDetail = () => {
  let user = null;

  return {
    oninit: (vnode) => {
      UserService.get(vnode.attrs.id).then(result => { user = result; });
    },
    view: () => {
      if (!user) return m('div', 'Loading...');
      return m('div.user-detail', [
        m('h1', user.name),
        m('p', user.email)
      ]);
    }
  };
};

// Routes
m.route(document.body, '/users', {
  '/users': UserList,
  '/users/:id': UserDetail
});
```

## Version Gotchas
- **Mithril 2.x**: Current stable; tiny footprint (~10KB)
- **m.request**: Auto-redraws after completion; no manual redraw needed
- **Closure state**: Encapsulate state in component closures
- **Hyperscript**: `m('div.class', { attr: 'value' }, children)`

## What NOT to Do
- ❌ JSX syntax — Use `m()` hyperscript
- ❌ Manual `m.redraw()` after `m.request` — Automatic
- ❌ Module-level state — Use closure state
- ❌ Missing `key` in lists — Breaks diffing
- ❌ Direct DOM manipulation — Let Mithril handle DOM

## Common Errors
| Error | Fix |
|-------|-----|
| `Redraw not happening` | Use m.request or call m.redraw() |
| `Key warning` | Add key attribute to list items |
| `Route not matching` | Check route pattern syntax |
| `State not updating` | Use closure state, not module vars |
