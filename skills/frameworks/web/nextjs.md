# Next.js CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npx create-next-app@latest --typescript --tailwind --app
# Or upgrade existing:
npx @next/codemod@canary upgrade latest
# Turbopack now stable for dev:
npm run dev --turbopack
```

## Claude's Common Mistakes
1. **Caching fetch by default** — Next.js 15 changed to `no-store` by default; explicitly set cache strategy
2. **Synchronous request APIs** — `cookies()`, `headers()`, `params`, `searchParams` are now async
3. **Catching `redirect()`** — Don't wrap redirect() in try/catch; it throws intentionally
4. **Using API routes for server data** — Use Server Components or Server Actions instead
5. **Overusing `'use client'`** — Keep components server-side unless they need interactivity

## Correct Patterns (2026)
```typescript
// Next.js 15: Async request APIs
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ query: string }>;
}) {
  const { id } = await params;
  const { query } = await searchParams;
  const cookieStore = await cookies();
}

// Server Action with validation
'use server'
import { revalidatePath } from 'next/cache';

export async function createItem(formData: FormData) {
  const validated = schema.safeParse(Object.fromEntries(formData));
  if (!validated.success) return { error: validated.error.flatten() };
  await db.item.create({ data: validated.data });
  revalidatePath('/items');
}

// Explicit caching (no longer default)
fetch(url, { cache: 'force-cache' })  // Opt into caching
export const revalidate = 3600;        // ISR
```

## Version Gotchas
- **v14→v15**: `cookies()`, `headers()`, `params`, `searchParams` are async (breaking)
- **v14→v15**: fetch/GET handlers uncached by default
- **v14→v15**: `sharp` auto-installed for image optimization
- **Security**: Update to 15.1.4+ (CVE-2025-55184, CVE-2025-55183)

## What NOT to Do
- ❌ `const cookieStore = cookies()` — Use `await cookies()`
- ❌ `try { redirect('/') } catch {}` — Let redirect throw
- ❌ `'use client'` on data-fetching components — Fetch on server
- ❌ API routes for simple data — Use Server Actions
- ❌ Relying on cached behavior from v14 — Explicitly set cache

## Rendering Strategy
| Use Case | Strategy |
|----------|----------|
| Marketing/docs | Static (default) |
| User-specific | `dynamic = 'force-dynamic'` |
| Periodic updates | `revalidate = 3600` |
| Heavy interactivity | `'use client'` |
