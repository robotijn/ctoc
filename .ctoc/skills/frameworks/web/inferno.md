# Inferno CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm create vite@latest myapp -- --template inferno-ts
cd myapp && npm install && npm run dev
# Inferno 8.x - fastest React-like library
```

## Claude's Common Mistakes
1. **Using React patterns directly** — Use `linkEvent` for performance
2. **Inline functions in JSX** — Creates closures on every render
3. **Missing keys in lists** — Required for virtual DOM diffing
4. **Forgetting inferno-compat** — Needed for React library compatibility
5. **Class components by default** — Prefer functional with hooks

## Correct Patterns (2026)
```jsx
import { useState, useEffect } from 'inferno-hooks';
import { linkEvent } from 'inferno';

// linkEvent pattern - avoids closure allocation
function handleClick(instance, event) {
  instance.setCount(c => c + 1);
}

function Counter({ initialCount = 0 }) {
  const [count, setCount] = useState(initialCount);

  return (
    <div class="counter">
      <span>Count: {count}</span>
      {/* Use linkEvent (NOT inline arrow functions) */}
      <button onClick={linkEvent({ setCount }, handleClick)}>
        Increment
      </button>
    </div>
  );
}

// Data fetching component
function UserList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => {
        setUsers(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <ul>
      {/* ALWAYS include key */}
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

## Version Gotchas
- **Inferno 8.x**: Hooks via inferno-hooks; functional preferred
- **linkEvent**: Performance optimization; avoids closure allocation
- **inferno-compat**: Required for React library compatibility
- **class vs className**: Use `class` (not `className`)

## What NOT to Do
- ❌ `onClick={() => setCount(count + 1)}` — Use `linkEvent`
- ❌ Missing `key` in lists — Breaks virtual DOM diffing
- ❌ `className` attribute — Use `class` in Inferno
- ❌ React libraries without compat — Install `inferno-compat`
- ❌ Class components — Use functional with hooks

## Common Errors
| Error | Fix |
|-------|-----|
| `Hook rules violation` | Only call hooks at top level |
| `Missing key warning` | Add unique key to list items |
| `Infinite loop` | Check useEffect dependencies |
| `React lib not working` | Install inferno-compat |
