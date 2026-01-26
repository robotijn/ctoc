# Next.js CTO
> React meta-framework - Server Components by default, client only when needed.

## Commands
```bash
# Setup | Dev | Test
npx create-next-app@latest --typescript --tailwind --app
npm run dev
npm test && npm run build
```

## Non-Negotiables
1. Server Components by default - add `'use client'` only for interactivity
2. Data fetching happens on server via `async` components or Server Actions
3. Every route has `loading.tsx` and `error.tsx`
4. Metadata API for SEO on every page
5. Image optimization with `next/image` always

## Red Lines
- `'use client'` at the top of files that don't need it
- `useEffect` for fetching initial data - fetch on server
- Missing loading/error states for async routes
- Ignoring Web Vitals (LCP, FID, CLS)
- API routes for data that Server Components can fetch directly

## Pattern: Server Action with Validation
```typescript
// app/actions/user.ts
'use server'

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
});

export async function createUser(formData: FormData) {
  const validated = CreateUserSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
  });

  if (!validated.success) {
    return { error: validated.error.flatten().fieldErrors };
  }

  await db.user.create({ data: validated.data });
  revalidatePath('/users');
  redirect('/users');
}
```

## Rendering Strategy Decision
- **Static (SSG)**: Marketing pages, docs, blogs -> default
- **Dynamic (SSR)**: User-specific, real-time data -> `export const dynamic = 'force-dynamic'`
- **ISR**: Content that updates periodically -> `export const revalidate = 3600`
- **Client**: Heavy interactivity, browser APIs -> `'use client'`

## Integrates With
- **DB**: Prisma with connection pooling (PgBouncer) for serverless
- **Auth**: NextAuth.js v5 (Auth.js) with server-side sessions
- **Cache**: `unstable_cache` for expensive computations

## Common Errors
| Error | Fix |
|-------|-----|
| `Error: Hydration failed` | Ensure server/client render same content |
| `Dynamic server usage` | Add `'use server'` or change to client component |
| `NEXT_REDIRECT` in try/catch | Don't catch redirect(), let it throw |
| `Prisma: prepared statement already exists` | Use connection pooling, limit pool size |

## Prod Ready
- [ ] `next.config.js` has security headers configured
- [ ] Environment variables validated at build time
- [ ] Parallel routes for complex layouts
- [ ] Intercepting routes for modals
- [ ] Vercel Analytics or custom Web Vitals tracking
- [ ] Edge runtime for latency-sensitive routes
