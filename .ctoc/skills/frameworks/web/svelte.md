# Svelte CTO
> Compile-time reactivity - less boilerplate, more performance, surgical updates.

## Commands
```bash
# Setup | Dev | Test
npx sv create myapp  # Select TypeScript, Prettier, ESLint
npm run dev
npm run test -- --coverage
```

## Non-Negotiables
1. Runes (`$state`, `$derived`, `$effect`) in Svelte 5 - no legacy reactivity
2. TypeScript with strict mode for all components
3. Stores only for cross-component state sharing
4. Component composition over inheritance
5. Accessibility attributes on interactive elements

## Red Lines
- `$:` reactive statements in Svelte 5 - use runes instead
- Over-using stores for local component state
- Complex logic in template expressions
- Missing `{#key}` block for animated list items
- Ignoring accessibility (a11y) warnings

## Pattern: Svelte 5 Runes
```svelte
<!-- UserList.svelte -->
<script lang="ts">
  import { getUsers, type User } from '$lib/api';

  let { initialUsers = [] }: { initialUsers?: User[] } = $props();

  let users = $state<User[]>(initialUsers);
  let search = $state('');
  let loading = $state(false);

  let filteredUsers = $derived(
    users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()))
  );

  async function refresh() {
    loading = true;
    try {
      users = await getUsers();
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    console.log(`Showing ${filteredUsers.length} users`);
  });
</script>

<input bind:value={search} placeholder="Search users..." />
<button onclick={refresh} disabled={loading}>
  {loading ? 'Loading...' : 'Refresh'}
</button>

{#each filteredUsers as user (user.id)}
  <UserCard {user} />
{:else}
  <p>No users found</p>
{/each}
```

## Integrates With
- **Routing**: SvelteKit with file-based routing and `+page.ts` load functions
- **State**: Svelte stores (`writable`, `readable`) for global state
- **Styling**: Scoped CSS by default, Tailwind CSS optional
- **Forms**: SvelteKit form actions with progressive enhancement

## Common Errors
| Error | Fix |
|-------|-----|
| `$state is not defined` | Upgrade to Svelte 5, check `svelte.config.js` |
| `Cannot bind to non-local value` | Use `$bindable()` prop or two-way binding |
| `A11y: element should have aria-label` | Add accessibility attributes |
| `Hydration mismatch` | Ensure SSR/client render identical content |

## Prod Ready
- [ ] SvelteKit adapter configured (Vercel, Node, static)
- [ ] Prerendering for static pages
- [ ] Error boundaries with `+error.svelte`
- [ ] Bundle size analyzed with `vite-bundle-visualizer`
- [ ] PWA support with `@vite-pwa/sveltekit`
- [ ] E2E tests with Playwright
