# Preact CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm create preact@latest my-app
cd my-app && npm install && npm run dev
# Preact 10.x - 3KB alternative to React
```

## Claude's Common Mistakes
1. **Using React compat unnecessarily** — Only use `preact/compat` when React libs required
2. **Not using Signals** — `@preact/signals` provides better reactivity than hooks
3. **Missing `key` props** — Required on list items for efficient diffing
4. **Large dependencies** — Defeats Preact's size advantage; every KB counts
5. **Accessing signals without `.value`** — Signals require `.value` to read/write

## Correct Patterns (2026)
```tsx
import { signal, computed } from '@preact/signals';
import { render } from 'preact';

// Signals for reactive state (better than useState)
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
  users.value = await res.json();  // Use .value to set
}

function SearchInput() {
  return (
    <input
      value={search}  // Signal auto-extracts in JSX
      onInput={(e) => search.value = e.currentTarget.value}
      placeholder="Search..."
    />
  );
}

function UserList() {
  return (
    <ul>
      {filteredUsers.value.map(user => (
        <li key={user.id}>{user.name}</li>  // key required!
      ))}
    </ul>
  );
}
```

## Version Gotchas
- **Preact 10.x**: Signals built-in; use `@preact/signals`
- **preact/compat**: Only for React library compatibility
- **Hooks**: Import from `preact/hooks`, not `preact`
- **Bundle size**: Target < 10KB gzipped total

## What NOT to Do
- ❌ `import React from 'preact/compat'` for simple apps — Use native Preact
- ❌ `useState` when signals work — Signals are more efficient
- ❌ Large React deps like Material-UI — Defeats size purpose
- ❌ Missing `key` on mapped items — Causes re-render issues
- ❌ `users` instead of `users.value` — Signals need `.value`

## Signals vs Hooks
| Feature | Signals | Hooks |
|---------|---------|-------|
| Re-renders | Surgical | Component-level |
| Boilerplate | Less | More |
| Sharing state | Easy | Context needed |
| Learning curve | Simpler | Familiar |

## React Compatibility
```typescript
// vite.config.ts (only if needed for React libs)
export default {
  resolve: {
    alias: {
      'react': 'preact/compat',
      'react-dom': 'preact/compat',
    }
  }
}
```
