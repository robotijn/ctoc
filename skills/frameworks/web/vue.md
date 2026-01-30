# Vue CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm create vue@latest
# Select: TypeScript, Pinia, Router, Vitest, ESLint, Prettier
# Vue CLI deprecated - use create-vue (Vite-based)
npm run dev
```

## Claude's Common Mistakes
1. **Using Vue CLI** — Deprecated; use `npm create vue@latest` (Vite-based)
2. **Heavy template expressions** — Move logic to computed properties
3. **Watching entire objects** — Watch specific properties, not whole objects
4. **Using array index as key** — Use unique stable IDs in `v-for`
5. **v-if with v-for** — Use computed property or template wrapper

## Correct Patterns (2026)
```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue';

// Correct: computed for derived state
const items = ref<Item[]>([]);
const search = ref('');

const filteredItems = computed(() =>
  items.value.filter(i =>
    i.name.toLowerCase().includes(search.value.toLowerCase())
  )
);

// Correct: watch specific property, not object
watch(() => user.value?.id, (newId) => {
  if (newId) fetchUserDetails(newId);
});

// Correct: v-model with defineModel (Vue 3.4+)
const modelValue = defineModel<string>();
</script>

<template>
  <!-- Wrong: v-if with v-for on same element -->
  <!-- <li v-for="item in items" v-if="item.active"> -->

  <!-- Correct: filter in computed -->
  <li v-for="item in filteredItems" :key="item.id">
    {{ item.name }}
  </li>

  <!-- Correct: unique key, not index -->
  <UserCard v-for="user in users" :key="user.id" :user="user" />
</template>
```

## Version Gotchas
- **Vue 3.4+**: `defineModel()` for two-way binding (replaces emit pattern)
- **Vue 3.5+**: Improved SSR hydration, `useId()` for SSR-safe IDs
- **Vue 3.6 (upcoming)**: "Alien signals" reactivity optimization
- **Volar**: Replace Vetur; required for Vue 3 TypeScript support
- **Nuxt 4**: Coming 2026 with significant changes

## What NOT to Do
- ❌ `v-for="(item, index) in items" :key="index"` — Use stable unique ID
- ❌ `{{ items.filter(i => i.active).map(...) }}` — Use computed
- ❌ `watch(reactiveObject, ...)` — Watch specific properties
- ❌ Mutating props directly — Emit events or use `defineModel`
- ❌ Using Options API in new code — Use Composition API

## State Management (2026)
| Need | Solution |
|------|----------|
| Local component | `ref()`, `reactive()` |
| Cross-component | Pinia store |
| Server state | TanStack Vue Query |
| Forms | VeeValidate + Zod |

## Pinia Pattern
```typescript
// stores/user.ts
export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null);
  const isAuthenticated = computed(() => !!user.value);

  async function login(credentials: Credentials) {
    user.value = await api.auth.login(credentials);
  }

  return { user, isAuthenticated, login };
});
```
