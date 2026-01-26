# NativeScript CTO
> JavaScript-to-native mobile leader demanding direct native API access with no WebView compromise.

## Commands
```bash
# Setup | Dev | Test
ns create myapp --template @nativescript/template-blank-ts
ns run ios --bundle
ns test android && ns build android --release
```

## Non-Negotiables
1. Direct native API access for performance-critical features
2. Proper Page and Frame lifecycle with navigation callbacks
3. Webpack bundling with tree-shaking for smaller builds
4. Android back button handling in navigation callbacks
5. Platform-specific profiling with Chrome DevTools and native tools

## Red Lines
- Heavy computation on UI thread - use Workers
- setTimeout for animation - use native animation APIs
- Excessive data binding on large lists - use virtualization
- Ignoring memory warnings - native views need proper cleanup
- Mixing Angular/Vue/Svelte patterns in the same project

## Pattern: Observable List with Virtualization
```typescript
import { Observable, ObservableArray } from '@nativescript/core';

export class ItemsViewModel extends Observable {
  private _items: ObservableArray<Item>;

  constructor() {
    super();
    this._items = new ObservableArray<Item>();
  }

  get items(): ObservableArray<Item> {
    return this._items;
  }

  async loadMore(): Promise<void> {
    const page = Math.floor(this._items.length / 20);
    const newItems = await this.fetchPage(page);
    // Batch update for performance
    this._items.push(...newItems);
  }

  private async fetchPage(page: number): Promise<Item[]> {
    const response = await fetch(`/api/items?page=${page}`);
    return response.json();
  }
}
```

## Integrates With
- **DB**: @nativescript/sqlite for local, native Realm bindings
- **Auth**: @nativescript/appauth for OAuth, SecureStorage for tokens
- **Cache**: @nativescript/core File for assets, ApplicationSettings for KV

## Common Errors
| Error | Fix |
|-------|-----|
| `Cannot read property of undefined (native)` | Check native API availability on platform |
| `JavaScript heap out of memory` | Increase Node memory or fix memory leaks |
| `Gradle build failed` | Clean with `ns clean` and check Android SDK setup |

## Prod Ready
- [ ] Webpack bundle analyzed for size optimization
- [ ] ProGuard/R8 configured for Android
- [ ] App Transport Security configured for iOS
- [ ] Firebase Crashlytics or Sentry for crash reporting
