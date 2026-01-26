# Alpine.js CTO
> Minimal JavaScript for HTML sprinkles - reactive without the build step.

## Commands
```bash
# Setup | Dev | Test
# Add to HTML: <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js"></script>
# Or: npm install alpinejs
# No build required for basic usage
```

## Non-Negotiables
1. Declarative behavior in HTML attributes
2. `x-data` for component state scope
3. Proper magics usage (`$store`, `$refs`, `$el`)
4. Alpine stores for shared state
5. Plugins for extended functionality

## Red Lines
- Complex logic in `x-data` - extract to functions
- Missing `x-cloak` causing flash of unstyled content
- Inline JavaScript abuse in attributes
- No component extraction for reusable patterns
- Ignoring `x-transition` for smooth UX

## Pattern: Component with Store
```html
<!-- Define global store -->
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

  <template x-if="$store.users.loading">
    <p>Loading...</p>
  </template>

  <ul x-show="!$store.users.loading" x-cloak>
    <template x-for="user in $store.users.items.filter(u => u.name.includes(search))" :key="user.id">
      <li x-text="user.name"></li>
    </template>
  </ul>
</div>

<!-- Add x-cloak CSS -->
<style>[x-cloak] { display: none !important; }</style>
```

## Integrates With
- **Backend**: Any server-rendered HTML (Rails, Laravel, Django)
- **Turbo**: Hotwire stack for full HTML-over-wire
- **HTMX**: Complementary for server interactions
- **Tailwind**: Natural pairing for utility CSS

## Common Errors
| Error | Fix |
|-------|-----|
| `Alpine is not defined` | Ensure script loads before usage |
| `x-data not reactive` | Use `Alpine.reactive()` for objects |
| `Flash of content` | Add `x-cloak` to hidden elements |
| `Store not found` | Initialize in `alpine:init` event |

## Prod Ready
- [ ] Bundle via npm if needed
- [ ] `x-cloak` CSS rule defined
- [ ] Stores extracted to separate file
- [ ] No inline complex logic
- [ ] Accessible: focus management, ARIA
- [ ] Works without JS (progressive enhancement)
