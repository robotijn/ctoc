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

## Runtime & Marshalling Footguns
NativeScript exposes **native iOS/Android APIs directly to JavaScript** — no
WebView, no bridge protocol. The runtime **marshals** JS values to/from native
types automatically, and that marshalling is where the sharp edges live: you are
calling `UIView`/`android.view.View` from JS, on the same thread, with native
memory semantics. [docs.nativescript.org/guide/marshalling, retrieved 2026-07-10]

```typescript
// FOOTGUN: assuming JS types map cleanly to native. A JS number is a double;
// a native API wanting a 64-bit long, an NSInteger, or an enum needs the right
// marshalled type or you get truncation / a hard native crash, not a JS error.
const color = new android.graphics.Color();     // direct native API access

// RIGHT: use the documented marshalling — interop.Reference / typed helpers for
// pointers & out-params; construct native enums via their real constants.
import { Utils } from '@nativescript/core';
const nativeColor = android.graphics.Color.parseColor('#FF0000'); // int, correct
```

- **Direct native API access is synchronous on the main (UI) thread.** A heavy
  native call (image decode, crypto, big loop) blocks rendering and trips the
  ANR/watchdog. Offload to a **Worker** (`new Worker('./workers/...')`) — but
  note a Worker has NO access to UI/native-UI objects; marshal plain data across
  `postMessage`. [docs.nativescript.org/guide/multithreading, retrieved 2026-07-10]
- **Memory: JS holds references to real native objects.** A JS variable pinning a
  large `UIImage`/`Bitmap` keeps native memory alive past GC expectations; null
  the reference and avoid retaining native views in long-lived closures — this is
  the "ignore memory warnings" mistake, made concrete.
- **Plugin ecosystem staleness**: many community NativeScript plugins lag the
  current runtime. Check the plugin's last publish + NS-version compatibility
  before depending on it; an abandoned plugin wrapping a native SDK is an
  unpatched-CVE risk.
- **Flavor lifecycles differ**: Angular, Vue, and Core (plain) have different
  component/observable lifecycles — do not mix their patterns in one project.

## Error Handling
```typescript
// FOOTGUN: a Worker error you never listen for is swallowed — the task just
// never resolves. Always wire onerror.
const worker = new Worker('./workers/processor');
worker.postMessage(plainData);            // ONLY structured-cloneable data
worker.onmessage = (msg) => resolve(msg.data);
worker.onerror = (err) => { worker.terminate(); reject(err); };  // required
```
- Native calls throw native exceptions surfaced as JS errors — wrap risky native
  interop in try/catch; a native crash that isn't caught takes down the app with
  no JS stack.
- Terminate Workers you finish with; leaked Workers hold native memory.

## Security
```typescript
// FOOTGUN: ApplicationSettings is plaintext key-value (NSUserDefaults /
// SharedPreferences) — CWE-312 for tokens.
import { ApplicationSettings } from '@nativescript/core';
ApplicationSettings.setString('token', jwt);   // WRONG for secrets

// RIGHT: a Keychain/Keystore-backed secure-storage plugin for secrets.
```
- **`ApplicationSettings` is not encrypted** — CWE-312 (Cleartext Storage) if
  used for tokens/keys; use a Keychain/Keystore secure-storage plugin.
  [cwe.mitre.org/data/definitions/312.html, retrieved 2026-07-10]
- Enforce TLS at the native layer (App Transport Security on iOS,
  network-security-config on Android); do not disable certificate validation.
- Vet native-wrapping plugins for maintenance — an abandoned wrapper ships the
  native SDK's unpatched CVEs.

## Testing
- Unit-test ViewModels/services as plain TS (Jest/Mocha) off-device; mock native
  modules at the boundary, never the code under test.
- Marshalling and threading bugs only appear on a real device/emulator — run
  `ns test ios|android` for those; a Node-only unit test cannot reproduce a
  native-type mismatch or a main-thread block.

## Performance
- Keep the **UI thread** free: no heavy computation, big JSON parses, or blocking
  native calls in event handlers — offload to a Worker.
- Use `ListView`/`CollectionView` (native, recycling) for long lists; never build
  hundreds of views in a `StackLayout` (no recycling).
- Use native animation APIs (`View.animate`), not `setTimeout` loops, so
  animation runs off the JS event loop.

## Version-Specific Gotchas (dated, sourced)
- **NativeScript (`@nativescript/core`) 9.0.20** is the current stable release on
  npm, published **2026-05-27**. [npmjs.com/package/@nativescript/core, retrieved 2026-07-10]
- **Direct native access is synchronous** — marshalling errors are native
  crashes, not JS exceptions; keep heavy native work off the main thread.
  [docs.nativescript.org/guide/marshalling, retrieved 2026-07-10]
- **Workers** cannot touch UI/native-UI objects and only receive
  structured-cloneable data across `postMessage`.
- **Upgrade the CLI first** (`npm i -g nativescript`) before opening an older
  project; the CLI is backward-compatible but the runtime/plugins are version-pinned.

## References (retrieved 2026-07-10)
- NativeScript marshalling (JS↔native types): https://docs.nativescript.org/guide/marshalling
- NativeScript multithreading / Workers: https://docs.nativescript.org/guide/multithreading
- @nativescript/core on npm (9.0.20, 2026-05-27): https://www.npmjs.com/package/@nativescript/core
- CWE-312 (Cleartext Storage of Sensitive Information): https://cwe.mitre.org/data/definitions/312.html
