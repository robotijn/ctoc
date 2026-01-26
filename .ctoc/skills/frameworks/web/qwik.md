# Qwik CTO
> Resumable applications - zero hydration, instant interactivity, O(1) startup.

## Commands
```bash
# Setup | Dev | Test
npm create qwik@latest
npm run dev
npm run test.unit
```

## Non-Negotiables
1. `$` suffix for lazy-loaded code boundaries
2. `useSignal` for reactive state - fine-grained updates
3. `routeLoader$` for server-side data loading
4. Serialization boundaries respected - no closures in `$`
5. `useTask$` for side effects

## Red Lines
- Heavy client-side JavaScript - defeats Qwik's purpose
- Breaking resumability with non-serializable state
- Closures capturing variables in `$` functions
- Eager loading when lazy works
- Ignoring serialization warnings

## Pattern: Resumable Data Loading
```typescript
// src/routes/users/index.tsx
import { component$, useSignal } from '@builder.io/qwik';
import { routeLoader$, Form, routeAction$, zod$, z } from '@builder.io/qwik-city';

export const useUsers = routeLoader$(async ({ platform }) => {
  const users = await platform.db.user.findMany();
  return users;
});

export const useCreateUser = routeAction$(
  async (data, { platform }) => {
    await platform.db.user.create({ data });
    return { success: true };
  },
  zod$({ email: z.string().email(), name: z.string().min(2) })
);

export default component$(() => {
  const users = useUsers();
  const createAction = useCreateUser();
  const search = useSignal('');

  const filteredUsers = users.value.filter(
    u => u.name.toLowerCase().includes(search.value.toLowerCase())
  );

  return (
    <div>
      <input bind:value={search} placeholder="Search..." />

      <Form action={createAction}>
        <input name="email" type="email" required />
        <input name="name" required />
        <button>Add User</button>
      </Form>

      {filteredUsers.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
});
```

## Integrates With
- **DB**: Any ORM via platform bindings
- **Auth**: Cookie-based sessions with `routeLoader$`
- **Validation**: Zod with `zod$` helper
- **Deploy**: Adapters for Cloudflare, Vercel, Node

## Common Errors
| Error | Fix |
|-------|-----|
| `Captured closure variable` | Move variable inside `$` function |
| `Not serializable` | Use `noSerialize()` or restructure |
| `useSignal outside component` | Call inside `component$` body |
| `routeLoader$ not awaited` | Access `.value` property |

## Prod Ready
- [ ] Adapter configured for deployment target
- [ ] Prefetch strategy configured
- [ ] Error boundaries in place
- [ ] Service worker for offline support
- [ ] Bundle size minimal (should be tiny)
- [ ] Lighthouse performance > 95
