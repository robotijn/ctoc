# Preact CTO
> 3KB React alternative - fast, small, familiar API with signals.

## Commands
```bash
# Setup | Dev | Test
npm create preact@latest myapp && cd myapp
npm run dev
npm test
```

## Non-Negotiables
1. Signals for reactive state - `@preact/signals`
2. Minimal bundle focus - every KB counts
3. React compat layer only when absolutely needed
4. Hooks API for component logic
5. No unnecessary abstractions

## Red Lines
- Large dependencies defeating bundle size purpose
- React compat for simple applications
- Missing `key` props on list items
- Class components in new code
- Ignoring Preact-specific optimizations

## Pattern: Signals with Components
```tsx
import { signal, computed } from '@preact/signals';
import { render } from 'preact';

// Global reactive state
const users = signal<User[]>([]);
const search = signal('');
const filteredUsers = computed(() =>
  users.value.filter(u =>
    u.name.toLowerCase().includes(search.value.toLowerCase())
  )
);

// Async action
async function fetchUsers() {
  const res = await fetch('/api/users');
  users.value = await res.json();
}

// Components
function SearchInput() {
  return (
    <input
      value={search}
      onInput={(e) => search.value = e.currentTarget.value}
      placeholder="Search..."
    />
  );
}

function UserList() {
  return (
    <ul>
      {filteredUsers.value.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}

function App() {
  return (
    <div>
      <SearchInput />
      <button onClick={fetchUsers}>Load Users</button>
      <UserList />
    </div>
  );
}

render(<App />, document.getElementById('app')!);
```

## Integrates With
- **Routing**: `preact-router` or `wouter`
- **State**: Signals (recommended), or Redux-like
- **Styling**: CSS Modules, Tailwind, goober
- **SSR**: `preact-render-to-string`

## Common Errors
| Error | Fix |
|-------|-----|
| `Cannot find module 'react'` | Alias react to preact/compat |
| `Hooks not working` | Check import from `preact/hooks` |
| `Signal not updating` | Access `.value` property |
| `Large bundle` | Check imports, avoid react-dom |

## Prod Ready
- [ ] Bundle size < 10KB gzipped
- [ ] Signals for shared state
- [ ] Lazy loading for routes
- [ ] Minification and tree-shaking
- [ ] Hydration strategy (if SSR)
- [ ] Lighthouse performance > 95
