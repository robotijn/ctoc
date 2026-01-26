# SvelteKit CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npx sv create my-app
# Select: SvelteKit, TypeScript, ESLint, Prettier
cd my-app && npm install && npm run dev
```

## Claude's Common Mistakes
1. **Server imports in client code** — Server-only files (`+page.server.ts`) cannot be imported in `+page.svelte`
2. **Using SPA mode unnecessarily** — Causes waterfalls; SSR is default for good reason
3. **Blocking load functions** — Don't await unnecessary data; stream where possible
4. **Missing Svelte 5 runes** — Use `$state`, `$derived`, `$effect` in Svelte 5 components
5. **Ignoring adapter configuration** — Choose correct adapter for deployment target

## Correct Patterns (2026)
```typescript
// Load function with proper typing
// +page.server.ts
import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  const users = await db.user.findMany();
  return { users };
};

export const actions = {
  create: async ({ request, locals }) => {
    if (!locals.user) return fail(401);
    const data = await request.formData();
    const email = data.get('email');
    if (!email?.toString().includes('@')) {
      return fail(400, { email, error: 'Invalid email' });
    }
    await db.user.create({ data: { email } });
    return { success: true };
  },
} satisfies Actions;

// Component with Svelte 5 runes
// +page.svelte
<script lang="ts">
  import { browser } from '$app/environment';

  let { data } = $props();  // Svelte 5 props
  let search = $state('');
  let filtered = $derived(
    data.users.filter(u => u.name.includes(search))
  );
</script>
```

## Version Gotchas
- **Svelte 5**: Uses runes (`$state`, `$derived`) instead of `$:` reactive statements
- **SvelteKit 2+**: Built on Svelte 5; ensure compatible versions
- **Security CVE**: Update adapter-node for origin validation fix (2026)
- **Vite 8 (2026)**: Uses Rolldown for better build performance

## What NOT to Do
- ❌ Import from `+page.server.ts` in `+page.svelte` — Server-only code
- ❌ SPA mode without good reason — Causes request waterfalls
- ❌ `$:` reactive statements in Svelte 5 — Use `$derived` rune
- ❌ Heavy third-party scripts — Use server-side analytics
- ❌ Sync operations in load functions — Use streaming

## Load Function Types
| File | Runs On | Use For |
|------|---------|---------|
| `+page.ts` | Server + Client | Universal data |
| `+page.server.ts` | Server only | DB, secrets |
| `+layout.ts` | Server + Client | Shared data |
| `+layout.server.ts` | Server only | Auth checks |

## Performance Tips
```typescript
// Preload fonts
<link rel="preload" href="/fonts/custom.woff2" as="font" type="font/woff2" crossorigin>

// Lazy load components
const Heavy = await import('./Heavy.svelte');
```
