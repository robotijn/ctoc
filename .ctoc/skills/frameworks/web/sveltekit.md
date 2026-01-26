# SvelteKit CTO
> Full-stack Svelte framework - load data on server, actions for mutations, deploy anywhere.

## Commands
```bash
# Setup | Dev | Test
npx sv create myapp  # Select SvelteKit, TypeScript
npm run dev
npm run test
```

## Non-Negotiables
1. Load functions fetch data server-side in `+page.server.ts`
2. Form actions handle mutations with progressive enhancement
3. Error pages (`+error.svelte`) at every route level
4. Layout data flows to nested routes via `+layout.ts`
5. Hooks for auth guards and request handling

## Red Lines
- Client-side fetching when `load` function works
- Missing error handling and `+error.svelte` pages
- Form handling outside actions
- Ignoring TypeScript errors
- Hardcoded URLs - use `$app/paths`

## Pattern: Load and Action
```typescript
// src/routes/users/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  const users = await db.user.findMany();
  return { users };
};

export const actions = {
  create: async ({ request, locals }) => {
    if (!locals.user) return fail(401);

    const data = await request.formData();
    const email = data.get('email') as string;

    if (!email?.includes('@')) {
      return fail(400, { email, error: 'Invalid email' });
    }

    await db.user.create({ data: { email } });
    return { success: true };
  },
} satisfies Actions;
```

## Integrates With
- **DB**: Prisma or Drizzle in `$lib/server/`
- **Auth**: SvelteKit auth hooks with `locals`
- **Validation**: Zod with `superforms`
- **Deploy**: Adapters for Vercel, Node, Cloudflare, etc.

## Common Errors
| Error | Fix |
|-------|-----|
| `Cannot access 'data' before initialization` | Check load function dependencies |
| `+page.server.ts code in client bundle` | Move to `$lib/server/` or check imports |
| `Redirect loop` | Check redirect conditions in load |
| `Form action not found` | Check action name matches form `action` attribute |

## Prod Ready
- [ ] Adapter configured for deployment target
- [ ] Environment variables in `.env` and `$env/static`
- [ ] Error tracking integrated
- [ ] CSP headers configured in `hooks.server.ts`
- [ ] Prerendering for static pages
- [ ] Bundle size analyzed
