# Inferno CTO
> Fastest React-like library - extreme performance, small footprint, React compatibility.

## Commands
```bash
# Setup | Dev | Test
npm create vite@latest myapp -- --template inferno-ts
npm run dev
npm run build && npm run preview
```

## Non-Negotiables
1. Functional components with hooks
2. inferno-hooks for state management
3. Linked state for form handling
4. Proper key usage in lists
5. Avoid unnecessary re-renders

## Red Lines
- Class components when functional works
- Missing keys in dynamic lists
- Large component trees without splitting
- React compat layer overhead when not needed
- Inline functions causing re-renders

## Pattern: Component with Hooks
```jsx
import { useState, useEffect } from 'inferno-hooks';
import { linkEvent } from 'inferno';

// Event handler pattern - avoids closure allocation
function handleClick(instance, event) {
  instance.setCount(c => c + 1);
}

function Counter({ initialCount = 0 }) {
  const [count, setCount] = useState(initialCount);

  return (
    <div class="counter">
      <span>Count: {count}</span>
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
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}

export { Counter, UserList };
```

## Integrates With
- **State**: inferno-hooks, inferno-mobx
- **Router**: inferno-router
- **Build**: Vite, Webpack, Rollup
- **Compat**: inferno-compat for React libs

## Common Errors
| Error | Fix |
|-------|-----|
| `Hook rules violation` | Only call hooks at top level |
| `Missing key warning` | Add unique key to list items |
| `Infinite loop` | Check useEffect dependencies |
| `React lib not working` | Install inferno-compat |

## Prod Ready
- [ ] Production build optimized
- [ ] linkEvent for performance-critical handlers
- [ ] Code splitting configured
- [ ] Bundle size analyzed
- [ ] Server-side rendering (inferno-server)
- [ ] Error boundaries in place
