# Capacitor CTO
> Native runtime engineering leader bridging web apps to native platforms with plugin-first architecture.

## Commands
```bash
# Setup | Dev | Test
npm init @capacitor/app
npx cap add ios && npx cap add android
npx cap sync && npx cap run ios --livereload --external
```

## Non-Negotiables
1. Official Capacitor plugins before third-party alternatives
2. Platform checks with Capacitor.isNativePlatform() before native API calls
3. Proper permission flows before accessing camera, location, etc.
4. Native projects (ios/, android/) committed to version control
5. Plugin error handling with try/catch and graceful fallbacks

## Red Lines
- API keys or secrets in capacitor.config.ts
- Ignoring native build warnings - they indicate real issues
- Direct DOM manipulation - let your framework handle rendering
- Assuming plugin availability without platform checks
- Skipping deep link and app lifecycle testing

## Pattern: Safe Plugin Access with Fallback
```typescript
import { Capacitor } from '@capacitor/core';
import { Geolocation, Position } from '@capacitor/geolocation';

export async function getCurrentLocation(): Promise<Position | null> {
  if (!Capacitor.isPluginAvailable('Geolocation')) {
    console.warn('Geolocation not available');
    return null;
  }

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
```

## Integrates With
- **DB**: @capacitor/preferences for KV, @capacitor-community/sqlite for relational
- **Auth**: @capacitor/browser for OAuth flows, secure storage for tokens
- **Cache**: Web Storage API with native fallback via Preferences

## Common Errors
| Error | Fix |
|-------|-----|
| `Plugin not implemented for web` | Check platform and provide web fallback |
| `Unable to load asset` | Run `npx cap copy` to sync web assets |
| `Podfile.lock out of sync` | Run `npx cap update ios` and `pod install` |

## Prod Ready
- [ ] Native projects updated with `npx cap update`
- [ ] App permissions declared in Info.plist and AndroidManifest.xml
- [ ] Live reload disabled for production builds
- [ ] Capacitor config environment-specific (dev/staging/prod)
