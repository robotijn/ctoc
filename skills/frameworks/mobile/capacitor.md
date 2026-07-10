# Capacitor CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm init @capacitor/app
npm install @capacitor/core @capacitor/cli
npx cap add ios && npx cap add android
npx cap sync
```

## Claude's Common Mistakes
1. **Uses Capacitor 5 androidScheme** - v6 defaults to `https`, breaks existing apps
2. **Ignores Swift Package Manager** - v8 default for iOS, CocoaPods still supported
3. **Missing permission flows** - Must check/request before camera, location, etc.
4. **Suggests `isPluginAvailable` for core plugins** - Core plugins always available
5. **Forgets `npx cap copy`** - Required after web build changes

## Correct Patterns (2026)
```typescript
// Safe plugin access with proper permission flow
import { Capacitor } from '@capacitor/core';
import { Geolocation, Position } from '@capacitor/geolocation';

export async function getCurrentLocation(): Promise<Position | null> {
  // Core plugins don't need isPluginAvailable check
  try {
    const permission = await Geolocation.checkPermissions();
    if (permission.location !== 'granted') {
      const request = await Geolocation.requestPermissions();
      if (request.location !== 'granted') {
        throw new Error('Location permission denied');
      }
    }
    return await Geolocation.getCurrentPosition();
  } catch (error) {
    console.error('Geolocation error:', error);
    return null;
  }
}

// capacitor.config.ts for migration from v5
const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'MyApp',
  webDir: 'dist',
  android: {
    // SET THIS for v5->v6 migration to preserve localStorage
    allowMixedContent: true,
  },
  // Only if migrating from v5 with existing data
  // androidScheme: 'http',
};
```

## Version Gotchas
- **v6**: `androidScheme: 'https'` default breaks localStorage from v5
- **v8**: Swift Package Manager default, `npx cap migrate` for CocoaPods
- **v6+**: NodeJS 18+ required
- **With Ionic**: Use `@capacitor/` official plugins, not community forks

## What NOT to Do
- Do NOT skip setting `androidScheme: 'http'` when migrating from v5
- Do NOT modify native projects manually - use config or plugins
- Do NOT commit `ios/Pods/` - gitignore it, runs `pod install` on sync
- Do NOT use plugins without checking iOS/Android permission requirements
- Do NOT forget `npx cap sync` after `npm install` new plugins

## Bridge & Config Footguns
Capacitor runs your web app in a native **WebView** and exposes native
capabilities over a **JS↔native bridge**. The most dangerous mistakes are in
`capacitor.config.ts`: they turn the WebView into a remote-code-load or
open-navigation surface. [capacitorjs.com/docs/config, retrieved 2026-07-10]

```typescript
// FOOTGUN: shipping live-reload config to production. server.url points the
// native WebView at a remote origin — anyone controlling that host (or a MITM
// on http) executes arbitrary code inside your app with bridge access.
const config: CapacitorConfig = {
  appId: 'com.example.app',
  webDir: 'dist',
  server: {
    url: 'http://192.168.1.20:8100',   // DEV ONLY — never in a release build
    cleartext: true,                    // allows http — CWE-319 in prod
  },
};

// RIGHT (production): no server.url; scope any external navigation tightly.
const prod: CapacitorConfig = {
  appId: 'com.example.app',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // allowNavigation: ONLY origins you trust; anything the WebView can navigate
    // to runs with your app's WebView context (CWE-79 exposure if attacker-controlled).
    allowNavigation: ['api.example.com'],
  },
};
```

- **`server.url` must be off in production.** It is a live-reload/dev feature;
  leaving it enabled ships a remote-code-load path. Verify it is absent in the
  release config, not merely commented.
- **`allowNavigation`** whitelists origins the WebView may navigate to. A broad
  entry (or `*`) lets an injected link load attacker content in your app's
  WebView context — a **CWE-79** amplifier. Keep it to the exact API origins.
  [capacitorjs.com/docs/guides/security, retrieved 2026-07-10]
- **`cleartext: true` / `allowMixedContent`** re-enable plain `http` in the
  WebView (CWE-319 Cleartext Transmission) — use only for a controlled dev host,
  never production.
- **Custom-scheme handlers** and **deep links** (App URL open / universal links)
  feed untrusted data into your app — validate and never `eval`/`innerHTML` a
  deep-link parameter (CWE-79).
- **Permissions live in native manifests.** A plugin's JS `requestPermissions()`
  fails if `AndroidManifest.xml` / `Info.plist` lacks the declaration; adding the
  plugin does not add the manifest entry — you must.

## Correctness — Plugin Platform Parity
```typescript
// FOOTGUN: assuming a plugin behaves identically on web, iOS, and Android.
// Filesystem paths, permission models, and background limits differ.
import { Capacitor } from '@capacitor/core';

// Core plugins are always present; community plugins may be web-only or native-only.
if (Capacitor.isPluginAvailable('Filesystem')) {
  // check the specific platform too — behavior, not just presence, varies
}
```
- Run `npx cap sync` after installing any plugin (copies web assets + updates
  native project); skipping it leaves the native side without the plugin.
- Do not hand-edit native projects for things config/plugins can express — a
  `cap sync` can overwrite manual changes.

## Error Handling
- Wrap every plugin call in try/catch: permission denial, missing hardware, and
  user cancel all reject. An unhandled rejection in the WebView is a silent blank
  screen with no native crash report.
- Gate native-only calls on `Capacitor.isNativePlatform()` so the web build
  degrades instead of throwing.

## Security
```typescript
// FOOTGUN: Preferences is NOT secure storage — it's UserDefaults (iOS) /
// SharedPreferences (Android), plaintext on a rooted/jailbroken device. CWE-312.
import { Preferences } from '@capacitor/preferences';
await Preferences.set({ key: 'token', value: jwt });   // WRONG for secrets

// RIGHT: a Keychain/Keystore-backed secure-storage plugin for tokens/keys.
// (e.g. capacitor-secure-storage-plugin / a Keychain plugin) — encrypted at rest.
```
- **`@capacitor/preferences` is not encrypted** — CWE-312 if you put tokens in
  it; use a Keychain/Keystore-backed plugin for secrets.
  [cwe.mitre.org/data/definitions/312.html, retrieved 2026-07-10]
- **WebView CSP + `allowNavigation`** are your XSS containment (CWE-79): set a
  strict `Content-Security-Policy` and keep the navigation allowlist minimal.
  [cwe.mitre.org/data/definitions/79.html, retrieved 2026-07-10]
- Never enable `cleartext`/`allowMixedContent` or leave `server.url` set in a
  release build.

## Testing
- Unit-test app logic with the web bridge mocked; do not mock the code under
  test. Use `npx cap run` on a device/emulator for real permission + WebView
  behavior an `ionic serve`/browser build cannot reproduce.

## Performance
- Keep the web bundle small — WebView first paint is slower than native; lazy-load
  routes and defer heavy plugins until needed.
- Batch bridge calls: each JS↔native round-trip is serialized; a loop of
  per-item plugin calls is far slower than one batched call.

## Version-Specific Gotchas (dated, sourced)
- **Capacitor (`@capacitor/core`) 8.4.1** is the current stable release on npm,
  published **2026-06-19**. [npmjs.com/package/@capacitor/core, retrieved 2026-07-10]
- **v6+**: `androidScheme` defaults to `https`; a v5→v6 upgrade changes the
  WebView origin and can orphan `localStorage`/IndexedDB written under the old
  scheme.
- **v8**: Swift Package Manager is the default for new iOS projects (CocoaPods
  still supported; `npx cap migrate`); **Node 18+** required.
- **Security config is per-build**: `server.url`, `cleartext`, and
  `allowNavigation` must differ between dev and release — verify the release
  config drops all three.

## References (retrieved 2026-07-10)
- Capacitor config (server.url / allowNavigation / androidScheme): https://capacitorjs.com/docs/config
- Capacitor security guide: https://capacitorjs.com/docs/guides/security
- @capacitor/core on npm (8.4.1, 2026-06-19): https://www.npmjs.com/package/@capacitor/core
- CWE-79 (Cross-site Scripting): https://cwe.mitre.org/data/definitions/79.html
- CWE-312 (Cleartext Storage of Sensitive Information): https://cwe.mitre.org/data/definitions/312.html
