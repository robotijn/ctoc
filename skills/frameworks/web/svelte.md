# Svelte CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npx sv create myapp
# Select: TypeScript, Prettier, ESLint, Playwright
cd myapp && npm install
npm run dev
```

## Claude's Common Mistakes
1. **Using legacy `$:` reactive syntax** — Svelte 5 uses runes (`$state`, `$derived`, `$effect`)
2. **Manual array reassignment** — Svelte 5 has deep reactivity; mutation works
3. **Using `$effect` for derived state** — Use `$derived` for computed values
4. **Global `$state` in modules** — Not SSR-safe; causes state leakage
5. **Missing browser guard** — Check `browser` from `$app/environment` for client-only APIs

## Correct Patterns (2026)
```svelte
<script lang="ts">
  import { browser } from '$app/environment';

  // Svelte 5 Runes
  let count = $state(0);
  let items = $state<Item[]>([]);
  let search = $state('');

  // Use $derived for computed (NOT $effect)
  let filtered = $derived(
    items.filter(i => i.name.includes(search))
  );

  // $derived.by for complex derivations
  let stats = $derived.by(() => {
    const total = items.length;
    const active = items.filter(i => i.active).length;
    return { total, active };
  });

  // Deep reactivity works (no reassignment needed)
  function addItem(item: Item) {
    items.push(item);  // This triggers updates in Svelte 5
  }

  // Client-only code guard
  $effect(() => {
    if (browser) {
      localStorage.setItem('count', String(count));
    }
  });
</script>

<!-- Props with $props() -->
<script lang="ts">
  let { user, onSave }: { user: User; onSave: () => void } = $props();
</script>
```

## Version Gotchas
- **Svelte 4→5**: `$:` reactive statements → `$derived`/`$effect`
- **Svelte 4→5**: `export let` for props → `$props()`
- **Svelte 4→5**: Deep reactivity added (arrays/objects auto-track)
- **Svelte 5.46+**: CSP support in render options
- **Security**: Update for CVEs in @sveltejs/kit and adapter-node

## What NOT to Do
- ❌ `$: doubled = count * 2` — Use `let doubled = $derived(count * 2)`
- ❌ `$effect(() => { derivedValue = compute() })` — Use `$derived`
- ❌ `items = [...items, newItem]` for mutations — Just `items.push(newItem)`
- ❌ `let { prop } = $props()` in module context — SSR state leak
- ❌ `window.localStorage` without browser check — SSR will fail

## Svelte 5 Migration
```javascript
// Old Svelte 4
export let name;
$: greeting = `Hello ${name}`;

// New Svelte 5
let { name } = $props();
let greeting = $derived(`Hello ${name}`);
```

## Runes Quick Reference
| Rune | Purpose |
|------|---------|
| `$state()` | Reactive state |
| `$derived()` | Computed value |
| `$derived.by()` | Complex computed |
| `$effect()` | Side effects |
| `$effect.pre()` | Before DOM update |
| `$props()` | Component props |
| `$bindable()` | Two-way bindable prop |
