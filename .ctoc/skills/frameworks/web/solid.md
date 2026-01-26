# SolidJS CTO
> Fine-grained reactivity - no virtual DOM, signals for surgical updates.

## Commands
```bash
# Setup | Dev | Test
npx degit solidjs/templates/ts myapp && cd myapp
npm run dev
npm run test
```

## Non-Negotiables
1. Signals for primitive state - `createSignal`
2. Stores for nested state - `createStore`
3. Control flow components: `<Show>`, `<For>`, `<Switch>`
4. Resources for async data - `createResource`
5. Never destructure props - breaks reactivity

## Red Lines
- Destructuring props in component parameters
- `<For>` without using callback's first argument
- Missing `<Suspense>` wrapping `<Resource>` consumers
- Using `createEffect` for derived state - use `createMemo`
- Array mutations instead of reconciliation

## Pattern: Reactive Data with Resource
```tsx
import { createSignal, createResource, For, Show, Suspense } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';

interface User { id: number; name: string; email: string }

const fetchUsers = async (query: string): Promise<User[]> => {
  const res = await fetch(`/api/users?q=${query}`);
  return res.json();
};

export default function UserList() {
  const [search, setSearch] = createSignal('');
  const [users, { refetch }] = createResource(search, fetchUsers);

  const handleSearch = (e: InputEvent) => {
    setSearch((e.target as HTMLInputElement).value);
  };

  return (
    <div>
      <input value={search()} onInput={handleSearch} placeholder="Search..." />

      <Suspense fallback={<div>Loading...</div>}>
        <Show when={!users.error} fallback={<div>Error loading users</div>}>
          <For each={users()} fallback={<div>No users found</div>}>
            {(user) => (
              <div>
                <span>{user.name}</span>
                <span>{user.email}</span>
              </div>
            )}
          </For>
        </Show>
      </Suspense>
    </div>
  );
}
```

## Integrates With
- **Routing**: `@solidjs/router` with data functions
- **Meta-framework**: SolidStart for SSR/SSG
- **State**: Stores for complex state, context for DI
- **Styling**: CSS Modules or `solid-styled-components`

## Common Errors
| Error | Fix |
|-------|-----|
| `Property undefined` after destructure | Don't destructure props, access as `props.x` |
| `Resource undefined` | Wrap consumer in `<Suspense>` |
| `For callback not reactive` | Use signal accessor inside, not outside |
| `Effect running too often` | Check dependencies, use `createMemo` |

## Prod Ready
- [ ] Error boundaries for fault isolation
- [ ] Lazy components with `lazy()`
- [ ] Proper Suspense boundaries
- [ ] Bundle size analyzed
- [ ] SSR with SolidStart if needed
- [ ] HMR configured for development
