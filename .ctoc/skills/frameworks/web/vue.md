# Vue CTO
> Progressive framework - Composition API for new code, pragmatic adoption.

## Commands
```bash
# Setup | Dev | Test
npm create vue@latest  # Select TypeScript, Pinia, Router
npm run dev
npm run test:unit -- --coverage
```

## Non-Negotiables
1. Composition API with `<script setup>` for all new components
2. TypeScript with strict mode enabled
3. Pinia for state management - one store per domain
4. Single-file components with scoped styles
5. Props validation with TypeScript interfaces or `defineProps`

## Red Lines
- Options API in new code - Composition API only
- Missing prop type definitions
- Direct state mutation outside Pinia actions
- `v-for` without `:key` on unique identifier
- `v-if` with `v-for` on same element

## Pattern: Composable with State
```typescript
// composables/useUsers.ts
import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { useMutation, useQuery } from '@tanstack/vue-query';
import { api } from '@/lib/api';
import type { User, CreateUserDTO } from '@/types';

export const useUsersStore = defineStore('users', () => {
  const currentUser = ref<User | null>(null);

  const isAuthenticated = computed(() => currentUser.value !== null);

  async function login(email: string, password: string) {
    const user = await api.auth.login({ email, password });
    currentUser.value = user;
  }

  function logout() {
    currentUser.value = null;
  }

  return { currentUser, isAuthenticated, login, logout };
});

// In component
export function useCreateUser() {
  return useMutation({
    mutationFn: (data: CreateUserDTO) => api.users.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
```

## Integrates With
- **Routing**: Vue Router 4 with typed routes
- **State**: Pinia with `@tanstack/vue-query` for server state
- **Styling**: Tailwind CSS or scoped CSS with CSS modules
- **Forms**: VeeValidate with Zod schemas

## Common Errors
| Error | Fix |
|-------|-----|
| `Cannot read property of undefined` | Use optional chaining `?.` or `v-if` guard |
| `Avoid mutating a prop directly` | Emit event to parent, use `v-model` with `defineModel` |
| `Maximum recursive updates exceeded` | Check for circular reactive dependencies |
| `Hydration mismatch` | Ensure SSR/client render same content, use `ClientOnly` |

## Prod Ready
- [ ] Lazy-loaded routes with `defineAsyncComponent`
- [ ] Error boundaries with `onErrorCaptured`
- [ ] Tree-shaking verified - no unused imports
- [ ] Bundle size analyzed with `rollup-plugin-visualizer`
- [ ] PWA support with `vite-plugin-pwa`
- [ ] E2E tests with Playwright or Cypress
