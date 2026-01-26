# Alpine.js CTO
> Minimal JavaScript for HTML sprinkles.

## Non-Negotiables
1. Declarative in HTML
2. x-data for component state
3. Proper magics usage
4. Store for shared state
5. Plugins for extensions

## Red Lines
- Complex logic in x-data
- Missing x-cloak for flicker
- Inline JavaScript abuse
- No component extraction

## Pattern
```html
<div x-data="{ open: false }">
  <button @click="open = !open">Toggle</button>
  <div x-show="open" x-transition>Content</div>
</div>
```
