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
