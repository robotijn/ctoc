# Qwik CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm create qwik@latest
# Select template and options
cd my-app && npm install && npm run dev
```

## Claude's Common Mistakes
1. **Closures in `$` functions** — Variables captured in `$` must be serializable
2. **Missing `$` suffix** — Lazy-loaded boundaries need `$` (e.g., `onClick$`)
3. **Heavy client-side JS** — Defeats Qwik's resumability purpose
4. **Non-serializable state** — Use `noSerialize()` or restructure
5. **Accessing `.value` incorrectly** — `routeLoader$` returns signal, access `.value`

## Correct Patterns (2026)
```typescript
// Resumable data loading
import { component$, useSignal } from '@builder.io/qwik';
import { routeLoader$, routeAction$, Form, zod$, z } from '@builder.io/qwik-city';

// Server-side data loader
export const useUsers = routeLoader$(async ({ platform }) => {
  return await platform.db.user.findMany();
});

// Server action with validation
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

  // CORRECT: Access .value for loader data
  const filtered = users.value.filter(
    u => u.name.toLowerCase().includes(search.value.toLowerCase())
  );

  return (
    <div>
      <input bind:value={search} placeholder="Search..." />
      <Form action={createAction}>
        <input name="email" type="email" required />
        <button type="submit">Add User</button>
      </Form>
      {filtered.map(user => <div key={user.id}>{user.name}</div>)}
    </div>
  );
});
```

## Version Gotchas
- **Serialization**: All state in `$` functions must be serializable
- **Resumability**: Zero hydration is the goal; avoid client-side bloat
- **Closure capture**: Variables from outer scope cause serialization errors
- **Prefetch**: Configure strategy for optimal lazy loading

## What NOT to Do
- ❌ Capturing closures in `$` functions — Move variable inside function
- ❌ `onClick={() => ...}` — Use `onClick$={() => ...}` for lazy loading
- ❌ Heavy client JS bundles — Defeats Qwik's O(1) startup
- ❌ `users.value.value` — Only one `.value` needed
- ❌ Non-serializable objects in state — Use `noSerialize()`

## Serialization Rules
```typescript
// WRONG: Closure captures external variable
const external = someValue;
const handler$ = $(() => {
  console.log(external);  // Error: captured closure
});

// CORRECT: Pass as parameter or compute inside
const handler$ = $((event) => {
  const value = computeValue();  // Inside the function
  console.log(value);
});
```

## When to Use Qwik
| Good Fit | Bad Fit |
|----------|---------|
| Content sites | Real-time apps |
| E-commerce | Heavy animations |
| Marketing pages | Complex client state |
| SEO-critical apps | Offline-first apps |
