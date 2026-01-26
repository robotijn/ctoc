# Nuxt CTO
> Vue meta-framework - universal rendering, auto-imports, file-based routing.

## Commands
```bash
# Setup | Dev | Test
npx nuxi init myapp -t v3
npm run dev
npm run test
```

## Non-Negotiables
1. Auto-imports used wisely - be explicit for complex utilities
2. Server routes (`/server/api/`) for backend logic
3. Composables in `composables/` for shared reactive logic
4. `useFetch` or `useAsyncData` for data fetching - never raw fetch in setup
5. SEO with `useHead` and `useSeoMeta` on every page

## Red Lines
- Client-only data fetching when server rendering works
- Missing error handling on async operations
- Blocking renders with synchronous data
- Huge auto-imported namespaces without explicit imports
- Ignoring TypeScript errors

## Pattern: Data Fetching with Composable
```typescript
// composables/useUsers.ts
export function useUsers() {
  const users = useState<User[]>('users', () => []);

  const { pending, error, refresh } = useFetch('/api/users', {
    onResponse({ response }) {
      users.value = response._data;
    },
  });

  async function createUser(data: CreateUserDTO) {
    await $fetch('/api/users', {
      method: 'POST',
      body: data,
    });
    await refresh();
  }

  return { users, pending, error, createUser, refresh };
}

// server/api/users.post.ts
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, CreateUserSchema.parse);
  const user = await prisma.user.create({ data: body });
  return user;
});
```

## Integrates With
- **DB**: Prisma or Drizzle in server routes
- **Auth**: `@sidebase/nuxt-auth` or custom session handling
- **State**: Pinia with `@pinia/nuxt` module
- **UI**: Nuxt UI or custom component library

## Common Errors
| Error | Fix |
|-------|-----|
| `Hydration mismatch` | Use `<ClientOnly>` for browser-only content |
| `useFetch only works during setup` | Call in `<script setup>` or composable, not event handlers |
| `500 Internal Server Error` | Check server route, add error handling |
| `useState must be called in setup` | Move to `<script setup>` block |

## Prod Ready
- [ ] `nuxt build` with `nitro.preset` for target platform
- [ ] ISR or SWR caching configured
- [ ] Error pages (`error.vue`) customized
- [ ] Runtime config separated from build-time
- [ ] Image optimization with `@nuxt/image`
- [ ] Bundle analyzed with `nuxt analyze`
