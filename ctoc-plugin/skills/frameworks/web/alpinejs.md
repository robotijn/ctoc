# Alpine.js CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```html
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js"></script>
<!-- Or via npm: npm install alpinejs -->
```

## Claude's Common Mistakes
1. **Missing `x-cloak`** — Causes flash of unstyled content on load
2. **Complex logic in attributes** — Extract to functions or `Alpine.data()`
3. **Forgetting `alpine:init`** — Stores must be registered in this event
4. **No `x-data` scope** — All Alpine directives need a parent `x-data`
5. **Treating Alpine like React** — It's for HTML sprinkles, not SPAs

## Correct Patterns (2026)
```html
<!-- Add x-cloak CSS (required) -->
<style>[x-cloak] { display: none !important; }</style>

<!-- Define store BEFORE Alpine loads -->
<script>
  document.addEventListener('alpine:init', () => {
    Alpine.store('users', {
      items: [],
      loading: false,
      async fetch() {
        this.loading = true;
        this.items = await fetch('/api/users').then(r => r.json());
        this.loading = false;
      }
    });
  });
</script>

<!-- Component using store -->
<div x-data="{ search: '' }" x-init="$store.users.fetch()">
  <input x-model="search" placeholder="Search users..." />

  <!-- Use x-cloak to hide until Alpine initializes -->
  <div x-show="$store.users.loading" x-cloak>Loading...</div>

  <ul x-show="!$store.users.loading" x-cloak>
    <template x-for="user in $store.users.items.filter(u => u.name.toLowerCase().includes(search.toLowerCase()))" :key="user.id">
      <li x-text="user.name"></li>
    </template>
  </ul>
</div>

<!-- Reusable component pattern -->
<script>
  document.addEventListener('alpine:init', () => {
    Alpine.data('userCard', (userId) => ({
      user: null,
      async init() {
        this.user = await fetch(`/api/users/${userId}`).then(r => r.json());
      }
    }));
  });
</script>
<div x-data="userCard(123)">...</div>
```

## Version Gotchas
- **Alpine 3.x**: Current stable; uses `alpine:init` event
- **No build required**: Works directly in HTML
- **`x-cloak`**: Must have CSS rule defined
- **Stores**: Must be initialized in `alpine:init`

## What NOT to Do
- ❌ Missing `x-cloak` CSS rule — Flash of unstyled content
- ❌ Complex expressions in HTML — Extract to `Alpine.data()`
- ❌ `x-for` without parent `x-data` — Won't work
- ❌ Store access before `alpine:init` — Store undefined
- ❌ Building SPAs with Alpine — Use for sprinkles only

## Alpine Magics
| Magic | Purpose |
|-------|---------|
| `$store` | Access global stores |
| `$refs` | DOM element references |
| `$el` | Current element |
| `$watch` | React to data changes |
| `$dispatch` | Custom events |
| `$nextTick` | After DOM update |

## Pairs Well With
| Tool | Purpose |
|------|---------|
| HTMX | Server interactions |
| Tailwind | Utility CSS |
| Turbo | SPA-like navigation |
| Any backend | Server-rendered HTML |
