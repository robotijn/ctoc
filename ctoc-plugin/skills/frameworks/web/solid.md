# SolidJS CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npx degit solidjs/templates/ts my-app
cd my-app && npm install && npm run dev
# For SolidStart (meta-framework):
npm create solid@latest
```

## Claude's Common Mistakes
1. **Destructuring props** — Breaks reactivity; always access as `props.name`
2. **Using `createEffect` for derived values** — Use `createMemo` instead
3. **Array mutations without reconciliation** — Use `reconcile` for store arrays
4. **Missing `<Suspense>` for resources** — Wrap components using `createResource`
5. **Accessing signals without calling** — Must call: `count()` not `count`

## Correct Patterns (2026)
```tsx
import { createSignal, createResource, createMemo, For, Show, Suspense } from 'solid-js';

// WRONG: Destructuring props
function Bad({ name }) {  // Breaks reactivity!
  return <div>{name}</div>;
}

// CORRECT: Access props directly
function Good(props) {
  return <div>{props.name}</div>;
}

// WRONG: createEffect for derived state
const [count, setCount] = createSignal(0);
createEffect(() => {
  doubled = count() * 2;  // Wrong!
});

// CORRECT: createMemo for derived state
const doubled = createMemo(() => count() * 2);

// Resource with Suspense
const [users] = createResource(fetchUsers);

function UserList() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <For each={users()} fallback={<div>No users</div>}>
        {(user) => <div>{user.name}</div>}
      </For>
    </Suspense>
  );
}
```

## Version Gotchas
- **SolidStart 2.0**: Alpha in heavy development; 1.x is stable
- **Vite 6**: Environment API removes need for vinxi abstraction
- **Monorepo**: Add `@solidjs/start` to `nohoist` in workspaces
- **Security**: Implement CSRF with Double-Submit Cookie pattern

## What NOT to Do
- ❌ `const { name } = props` — Access `props.name` directly
- ❌ `createEffect(() => derived = ...)` — Use `createMemo`
- ❌ `users.push(newUser)` on store — Use `reconcile` or spread
- ❌ `<For each={users()}>` without `<Suspense>` — Will fail on resource
- ❌ `count` instead of `count()` — Signals must be called

## Control Flow Components
| Component | Use For |
|-----------|---------|
| `<Show>` | Conditional rendering |
| `<For>` | Lists (with callback) |
| `<Switch>`/`<Match>` | Multiple conditions |
| `<Suspense>` | Async boundaries |
| `<ErrorBoundary>` | Error handling |

## SolidStart Structure
```
src/
├── routes/
│   ├── index.tsx      # /
│   ├── users.tsx      # /users
│   └── api/
│       └── users.ts   # /api/users
├── components/
└── lib/
```
