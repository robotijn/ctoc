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
