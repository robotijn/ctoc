# NativeScript CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Install CLI globally
npm install -g nativescript
# Verify environment
ns doctor
# Create new project
ns create myapp --template @nativescript/template-blank-ts
# Run on device
ns run ios --bundle
```

## Claude's Common Mistakes
1. **Uses outdated template names** - Templates changed in NS 8.x
2. **Heavy computation on UI thread** - Must use Workers for intensive tasks
3. **Uses setTimeout for animations** - Use native animation APIs
4. **Ignores memory warnings** - Native views need explicit cleanup
5. **Mixes framework patterns** - Angular/Vue/Svelte have different lifecycles

## Correct Patterns (2026)
```typescript
// Observable list with proper virtualization
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

  // Use Worker for heavy computation
  processDataInWorker(data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const worker = new Worker('./workers/processor');
      worker.postMessage(data);
      worker.onmessage = (msg) => resolve(msg.data);
      worker.onerror = (err) => reject(err);
    });
  }
}
```

## Version Gotchas
- **NS 8.8+**: Node-API Engine preview, Tailwind v4 support
- **NS 8.x**: CLI works with older projects, upgrade CLI first
- **macOS 12.3+**: Python 2.x removed, alias python3 manually
- **With Angular**: Version must match NativeScript Angular plugin

## What NOT to Do
- Do NOT do heavy computation on UI thread - use Workers
- Do NOT use setTimeout for animations - use native APIs
- Do NOT ignore memory warnings - clean up native views
- Do NOT mix framework patterns in same project
- Do NOT skip `ns clean` when builds fail mysteriously
