# Remix CTO
> Web standards embraced - loaders, actions, progressive enhancement, zero client state.

## Commands
```bash
# Setup | Dev | Test
npx create-remix@latest --template remix-run/remix/templates/vite
npm run dev
npm test
```

## Non-Negotiables
1. Loaders fetch data on server - never `useEffect` for initial data
2. Actions handle mutations with forms - POST/PUT/DELETE via forms
3. Progressive enhancement - forms work without JavaScript
4. Error boundaries at every route level
5. Nested routing leveraged for layouts

## Red Lines
- `useEffect` for fetching when a loader works
- Client state for server data - use `useLoaderData`
- Form handling outside actions
- Missing `<ErrorBoundary>` components
- Ignoring HTTP caching headers

## Pattern: Resource Route with Action
```typescript
// app/routes/users._index.tsx
import { json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from '@remix-run/node';
import { useLoaderData, Form, useNavigation } from '@remix-run/react';
import { db } from '~/lib/db.server';
import { requireAuth } from '~/lib/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuth(request);
  const users = await db.user.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return json({ users }, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const email = formData.get('email') as string;

  await db.user.create({ data: { email } });
  return redirect('/users');
}

export default function Users() {
  const { users } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  return (
    <div>
      <Form method="post">
        <input name="email" type="email" required />
        <button disabled={isSubmitting}>
          {isSubmitting ? 'Adding...' : 'Add User'}
        </button>
      </Form>
      <ul>
        {users.map(user => <li key={user.id}>{user.email}</li>)}
      </ul>
    </div>
  );
}
```

## Integrates With
- **DB**: Prisma with `.server.ts` suffix for server-only code
- **Auth**: Session cookies with `createCookieSessionStorage`
- **Validation**: Zod with `conform` for form validation
- **Cache**: HTTP caching headers, `stale-while-revalidate`

## Common Errors
| Error | Fix |
|-------|-----|
| `There was an error running the action` | Check server console, add error boundary |
| `useLoaderData must be used within route` | Component must be rendered by route |
| `Module not found: .server` | Ensure `.server.ts` files aren't imported client-side |
| `Hydration mismatch` | Ensure loader returns same data SSR and client |

## Prod Ready
- [ ] Error boundaries on all routes
- [ ] HTTP caching headers configured
- [ ] Session secrets rotated
- [ ] CSP headers with nonce
- [ ] Optimistic UI for slow actions
- [ ] Deployed with streaming support
