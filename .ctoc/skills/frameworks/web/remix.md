# Remix CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npx create-remix@latest
# Remix 3 - built on React Router 7
# Select deployment target when prompted
cd my-remix-app && npm run dev
```

## Claude's Common Mistakes
1. **Using useEffect for initial data** — Use loaders; data should come from server
2. **Redux for server data** — Use `useLoaderData`; server is source of truth
3. **Expecting SPA patterns** — Remix is server-first; page refreshes lose client state
4. **Forgetting .server suffix** — Server-only code must use `.server.ts` extension
5. **Real-time without workarounds** — Use polling, SSE via remix-utils, or external service

## Correct Patterns (2026)
```typescript
// Loader for data fetching (NOT useEffect)
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

export async function loader({ request }: LoaderFunctionArgs) {
  const users = await db.user.findMany();
  return json({ users }, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  });
}

// Action for mutations (forms, not fetch)
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get('email');
  await db.user.create({ data: { email } });
  return redirect('/users');
}

// Component uses loader data
export default function Users() {
  const { users } = useLoaderData<typeof loader>();
  return (
    <Form method="post">
      <input name="email" type="email" required />
      <button type="submit">Add User</button>
    </Form>
  );
}
```

## Version Gotchas
- **Remix 2→3**: Features merged into React Router 7
- **React Router 7**: Is now the recommended path for Remix features
- **Server state**: Redux won't persist across page refreshes in SSR
- **Real-time**: No built-in support; use SSE or polling patterns

## What NOT to Do
- ❌ `useEffect(() => { fetch('/api/users') })` — Use loader
- ❌ Redux store for user data — Use `useLoaderData` from loader
- ❌ `fetch()` in component for mutations — Use `<Form method="post">`
- ❌ `.server` imports in client code — Will break build
- ❌ Client-side routing expectations — Embrace server-first

## Remix vs React Router 7
| Feature | Recommendation |
|---------|----------------|
| New projects | Consider React Router 7 |
| Existing Remix | Remix 3 with migration path |
| Full-stack React | Either works; RR7 is newer |

## State Management
```typescript
// Server state: Use loaders
const { users } = useLoaderData<typeof loader>();

// Form state: Use useNavigation
const navigation = useNavigation();
const isSubmitting = navigation.state === 'submitting';

// Persistent client state: Use cookies
// (Redux state lost on page refresh in SSR)
```
