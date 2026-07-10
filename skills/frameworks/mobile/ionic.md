# Ionic CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm create ionic@latest myapp -- --type=angular --capacitor
# Or for React/Vue
npm create ionic@latest myapp -- --type=react --capacitor
npx cap add ios && npx cap add android
```

## Claude's Common Mistakes
1. **Suggests Cordova plugins** - Capacitor 6+ is standard, Cordova deprecated
2. **Uses Capacitor 5 patterns** - Capacitor 6 has `androidScheme: 'https'` default change
3. **Ignores Angular standalone components** - Required pattern for Ionic 8+ Angular
4. **Missing platform checks** - `Capacitor.isNativePlatform()` required before native APIs
5. **Uses CocoaPods for iOS** - Capacitor 8 defaults to Swift Package Manager

## Correct Patterns (2026)
```typescript
// Platform-aware service with Capacitor 6+
import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType } from '@capacitor/camera';

@Injectable({ providedIn: 'root' })
export class PhotoService {
  async takePhoto(): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) {
      return this.webFallback();
    }

    // Check permissions first (required pattern)
    const perms = await Camera.checkPermissions();
    if (perms.camera !== 'granted') {
      await Camera.requestPermissions();
    }

    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
    });
    return photo.webPath ?? null;
  }
}
```

## Version Gotchas
- **Capacitor 6**: `androidScheme` defaults to `https`, set to `http` for migration
- **Capacitor 8**: Swift Package Manager default for new iOS projects
- **Ionic 8**: Angular 17+ required, standalone components preferred
- **With Angular**: `provideIonicAngular()` replaces `IonicModule.forRoot()`

## What NOT to Do
- Do NOT use Cordova plugins when Capacitor equivalents exist
- Do NOT skip `npx cap sync` after adding plugins
- Do NOT assume native API availability - always check platform
- Do NOT use localStorage for sensitive data - use `@capacitor/preferences`
- Do NOT test only in browser - native builds behave differently

## WebView & XSS Footguns
An Ionic app is a web app running inside a **native WebView** (WKWebView on iOS,
Android System WebView), bridged to native by Capacitor. That means the app's
DOM has the full XSS attack surface of the web — plus a **native bridge** an
injected script can reach. Rendering untrusted HTML is **CWE-79 (Improper
Neutralization of Input During Web Page Generation — Cross-site Scripting)**.
[cwe.mitre.org/data/definitions/79.html, retrieved 2026-07-10]

```typescript
// FOOTGUN: injecting server/user content as raw HTML. In an Ionic WebView this
// is CWE-79 AND the injected script can call the Capacitor bridge (Camera,
// Filesystem, Geolocation) — XSS becomes device access.
element.innerHTML = serverMessage;                 // WRONG
// Angular equivalent footgun:
// <div [innerHTML]="serverMessage"></div>  bypassed with bypassSecurityTrustHtml

// RIGHT (Angular): let DomSanitizer strip scripts; bind as text where possible.
import { DomSanitizer } from '@angular/platform-browser';
constructor(private sanitizer: DomSanitizer) {}
safe = this.sanitizer.sanitize(SecurityContext.HTML, serverMessage); // sanitized
// RIGHT (framework-agnostic): use textContent, never innerHTML, for user data.
element.textContent = serverMessage;
```

- **Framework choice** (Angular / React / Vue) sets your XSS defaults: Angular
  auto-escapes interpolation (`{{ }}`) and only opens a hole via
  `bypassSecurityTrust*`; React escapes JSX and only opens via
  `dangerouslySetInnerHTML`; Vue escapes `{{ }}` and opens via `v-html`. Never
  use the escape hatch on untrusted data. [ionicframework.com/docs, retrieved 2026-07-10]
- **Capacitor, not Cordova.** Ionic 8 targets Capacitor plugins; Cordova is
  legacy/deprecated. Do not mix the two plugin models.
- **Live-reload is a dev-only bridge.** `ionic cap run --livereload` points the
  WebView at your dev server over the network; never ship that config — it is a
  remote-code-load path (see the Capacitor guide's `server.url`).

## Error Handling
```typescript
// FOOTGUN: assuming a native plugin exists on the web build — throws at runtime.
// RIGHT: gate native calls on the platform and handle rejection.
import { Capacitor } from '@capacitor/core';
async function scan() {
  if (!Capacitor.isNativePlatform()) return webFallback();
  try {
    return await BarcodeScanner.scan();
  } catch (e) {
    // permission denied / no camera / user cancel all land here
    console.error('scan failed', e);
    return null;
  }
}
```
- Route errors to a single handler (Angular `ErrorHandler`, React error
  boundary); an unhandled rejection in a WebView shows a blank screen with no
  store crash report.

## Security
```typescript
// Set a Content-Security-Policy meta so an injected string cannot load remote
// scripts even if it reaches the DOM. Ionic WebViews honor CSP.
// index.html:
// <meta http-equiv="Content-Security-Policy"
//   content="default-src 'self' gap: https://ssl.gstatic.com; script-src 'self'">
```
- **CSP** in `index.html` is your second line of defense behind sanitization
  (CWE-79). Disallow inline script and remote origins you do not control.
- **Sanitize before every `innerHTML`/`[innerHTML]`/`v-html`** — treat all
  server and deep-link data as hostile (CWE-79).
  [cwe.mitre.org/data/definitions/79.html, retrieved 2026-07-10]
- **Secrets**: `localStorage`/IndexedDB are plaintext in the WebView — use a
  secure-storage plugin (Keychain/Keystore-backed), not `localStorage`, for
  tokens.

## Testing
- Unit-test pages/components with the framework's tooling (Jasmine/Karma or
  Jest/Vitest) in a jsdom-like env; mock the Capacitor bridge, never the
  component under test.
- Run real device/E2E (Appium / the native build) — a browser `ionic serve`
  cannot reproduce WebView CSP, plugin permissions, or bridge behavior.

## Performance
- Use `<ion-virtual-scroll>` / a virtualized list for long collections; a plain
  `*ngFor`/`.map` over hundreds of `<ion-item>`s renders every node.
- **Lazy-load routes** (Angular lazy modules / route-level code splitting) so the
  initial WebView bundle stays small — first paint in a WebView is slower than a
  native view.
- Prefer hardware-accelerated CSS transforms for animation; avoid animating
  layout properties inside the WebView.

## Version-Specific Gotchas (dated, sourced)
- **Ionic (`@ionic/core`) 8.8.13** is the current stable release on npm,
  published **2026-07-01**. [npmjs.com/package/@ionic/core, retrieved 2026-07-10]
- **Capacitor 8** is the current native runtime paired with Ionic 8 (see the
  Capacitor guide); Cordova is legacy.
- **Ionic 8 + Angular** requires **Angular 17+** and prefers standalone
  components + `provideIonicAngular()` over `IonicModule.forRoot()`.
- **WebView = web attack surface**: every XSS rule (CWE-79) applies, plus the
  native bridge raises the impact from page-defacement to device access.

## References (retrieved 2026-07-10)
- Ionic Framework docs: https://ionicframework.com/docs
- @ionic/core on npm (8.8.13, 2026-07-01): https://www.npmjs.com/package/@ionic/core
- Angular DomSanitizer / security: https://angular.dev/best-practices/security
- CWE-79 (Cross-site Scripting): https://cwe.mitre.org/data/definitions/79.html
