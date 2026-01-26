# Mithril.js CTO
> Hyperscript UI framework - tiny footprint, fast rendering, built-in routing and XHR.

## Commands
```bash
# Setup | Dev | Test
npm init -y && npm install mithril
npx vite
npm run build
```

## Non-Negotiables
1. Component closures for state encapsulation
2. m.request for data fetching (auto-redraws)
3. Route-based architecture with m.route
4. Proper redraw control (m.redraw)
5. Minimal vnode allocation in render

## Red Lines
- Unnecessary redraws - control with m.redraw.sync()
- Missing keys in dynamic lists
- Sync XHR calls blocking UI
- Over-componentization (keep it simple)
- DOM manipulation outside Mithril

## Pattern: Application with Routing
```javascript
import m from 'mithril';

// User service with m.request
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
  get: (id) => {
    return m.request({
      method: 'GET',
      url: `/api/users/${id}`
    });
  }
};

// Component with closure state
const UserList = () => {
  let loading = true;

  return {
    oninit: () => {
      UserService.loadAll().then(() => {
        loading = false;
      });
    },
    view: () => {
      if (loading) return m('div.loading', 'Loading...');

      return m('ul.user-list',
        UserService.list.map(user =>
          m('li', { key: user.id },
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
      UserService.get(vnode.attrs.id).then(result => {
        user = result;
      });
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

## Integrates With
- **Build**: Vite, Webpack, Rollup
- **State**: Closure state, streams
- **Testing**: mithril-query, ospec
- **UI**: Any CSS framework

## Common Errors
| Error | Fix |
|-------|-----|
| `Redraw not happening` | Check m.request or call m.redraw() |
| `Key warning` | Add key attribute to list items |
| `Route not matching` | Check route pattern syntax |
| `Component not updating` | Use closure state, not module vars |

## Prod Ready
- [ ] Production build minified
- [ ] Routes configured with m.route
- [ ] Error handling in m.request
- [ ] Loading states implemented
- [ ] Bundle size minimal (~10KB)
- [ ] Keys on all dynamic lists
