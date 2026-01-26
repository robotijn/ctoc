# NativeScript CTO
> JavaScript to truly native, no WebView compromise

## Non-Negotiables
1. Use direct native API access for performance-critical features
2. Implement proper navigation with Frame and Page lifecycle
3. Use webpack bundling with tree-shaking for smaller builds
4. Handle Android back button with proper navigation callbacks
5. Profile with Chrome DevTools and platform-specific profilers

## Red Lines
- Never run heavy computation on the UI thread
- Don't use setTimeout for animation; use native animation APIs
- Avoid excessive data binding on large lists; use virtualization
- Never ignore memory warnings; native views need proper cleanup
- Don't mix Angular/Vue/Svelte approaches in the same project

## Pattern
```typescript
// Proper list virtualization
import { ObservableArray } from '@nativescript/core';

export class ViewModel {
  items = new ObservableArray([]);

  loadMore() {
    // Batch updates for performance
    const newItems = this.fetchNextPage();
    this.items.push(...newItems);
  }
}
```
