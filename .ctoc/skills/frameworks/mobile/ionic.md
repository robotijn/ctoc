# Ionic CTO
> Web-to-native mobile leader demanding Capacitor-first architecture with Angular/React/Vue flexibility.

## Commands
```bash
# Setup | Dev | Test
npm create ionic@latest myapp -- --type=angular --capacitor
ionic serve --external
ionic cap run ios --livereload --external && npm test
```

## Non-Negotiables
1. Capacitor 6+ for native runtime - Cordova only for legacy migration
2. Lazy loading for all page modules with route-based code splitting
3. Platform-specific styling via ion-* components and CSS variables
4. Hardware back button handling on Android with proper navigation
5. Standalone components pattern for Angular projects

## Red Lines
- Cordova plugins when Capacitor alternatives exist
- Inline styles - use CSS custom properties for theming
- Synchronous operations blocking the main thread
- localStorage for sensitive data - use Capacitor Preferences with encryption
- Browser-only testing - test on actual devices

## Pattern: Platform-Aware Service
```typescript
import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType } from '@capacitor/camera';

@Injectable({ providedIn: 'root' })
export class PhotoService {
  async takePhoto(): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) {
      return this.webFallback();
    }
    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
      allowEditing: false
    });
    return photo.webPath ?? null;
  }

  private webFallback(): Promise<string | null> {
    // File input fallback for web
  }
}
```

## Integrates With
- **DB**: @capacitor/preferences for KV, @ionic/storage for SQLite
- **Auth**: @capacitor/browser for OAuth, @capacitor/preferences for tokens
- **Cache**: Service Worker for PWA, @ionic/storage for offline data

## Common Errors
| Error | Fix |
|-------|-----|
| `Capacitor plugin not implemented` | Run `npx cap sync` after adding plugins |
| `CORS error on device` | Use Capacitor HTTP plugin or configure native proxy |
| `ion-back-button not working` | Set defaultHref and ensure proper IonicModule import |

## Prod Ready
- [ ] Capacitor native projects synced and version-locked
- [ ] App icons and splash screens generated via capacitor-assets
- [ ] Deep linking configured for iOS Universal Links and Android App Links
- [ ] PWA manifest and service worker configured for web deployment
