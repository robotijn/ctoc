# Nuxt CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npx nuxi init my-app
# For Nuxt 4-ready project:
npx nuxi init my-app -t v4-compat
# Requires Node.js 18+
cd my-app && npm install && npm run dev
```

## Claude's Common Mistakes
1. **Confusing create-nuxt versions** — Package version != Nuxt version; v3.27 creates Nuxt 4
2. **Corrupted lockfiles** — Use `npm ci` not `npm install` for clean installs
3. **NODE_ENV=production locally** — Excludes devDependencies; breaks builds
4. **Tailwind/Vite plugin errors** — Ensure proper @tailwindcss/vite configuration
5. **Calling useFetch in event handlers** — Must be in `<script setup>` or composables

## Correct Patterns (2026)
```typescript
// Composable pattern (useFetch in setup only)
// composables/useUsers.ts
export function useUsers() {
  const users = useState<User[]>('users', () => []);

  const { pending, error, refresh } = useFetch('/api/users', {
    onResponse({ response }) {
      users.value = response._data;
    },
  });

  // For mutations, use $fetch (not useFetch)
  async function createUser(data: CreateUserDTO) {
    await $fetch('/api/users', {
      method: 'POST',
      body: data,
    });
    await refresh();
  }

  return { users, pending, error, createUser };
}

// Server API route with validation
// server/api/users.post.ts
import { z } from 'zod';

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event,
    z.object({ email: z.string().email() }).parse
  );
  return await db.user.create({ data: body });
});
```

## Version Gotchas
- **Nuxt 3→4**: Run codemod, review changes carefully
- **Auto-imports**: Can mask issues; be explicit for complex utilities
- **useFetch**: Only works during setup, not in event handlers
- **useState**: Must be called in setup, not callbacks

## What NOT to Do
- ❌ `npm install` with corrupted lockfile — Use `npm ci`
- ❌ `useFetch` in click handlers — Use `$fetch` for imperative calls
- ❌ `useState` outside setup — Only in `<script setup>` or composables
- ❌ Skip codemod review — It may alter custom code incorrectly
- ❌ Raw `fetch()` in setup — Use `useFetch` or `useAsyncData`

## useFetch vs $fetch
| Context | Use |
|---------|-----|
| `<script setup>` | `useFetch()` |
| Event handlers | `$fetch()` |
| Composables (setup) | `useFetch()` |
| Server routes | `$fetch()` |

## Common Errors
| Error | Fix |
|-------|-----|
| `useFetch only works during setup` | Move to setup or use `$fetch` |
| `Hydration mismatch` | Use `<ClientOnly>` wrapper |
| `Pre-transform error: tailwindcss` | Check Tailwind Vite plugin config |
| `useState must be called in setup` | Move to `<script setup>` |
