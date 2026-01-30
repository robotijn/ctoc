# Expo CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npx create-expo-app@latest myapp --template tabs
# Upgrade existing project to SDK 52+
npx expo install expo@^52.0.0 && npx expo install --fix
# Delete ios/android dirs if generated for older SDK
rm -rf ios android && npx expo prebuild
```

## Claude's Common Mistakes
1. **Suggests SDK 51 patterns** - SDK 52 defaults to New Architecture, APIs changed
2. **Uses Expo Go for native module testing** - Development builds required since SDK 50
3. **Ignores EAS Build profiles** - Local builds deprecated for production
4. **Recommends Yarn v1** - Crashes during SDK 52 upgrades, use npm or Yarn 4
5. **Missing runtime version for OTA updates** - expo-updates fails without it

## Correct Patterns (2026)
```typescript
// app.config.ts for SDK 52+ with New Architecture
export default {
  expo: {
    name: 'MyApp',
    newArchEnabled: true,  // Default in SDK 52+ for new projects
    updates: {
      url: 'https://u.expo.dev/project-id',
    },
    runtimeVersion: {
      policy: 'appVersion',  // REQUIRED for expo-updates
    },
    plugins: [
      ['expo-camera', { cameraPermission: 'Camera access needed' }],
    ],
  },
};

// Expo Router v4 typed navigation
import { router } from 'expo-router';
router.push({ pathname: '/profile/[id]', params: { id: '123' } });
```

## Version Gotchas
- **SDK 52**: React Native 0.76, New Architecture default, Xcode 16 required
- **SDK 52**: `@react-native/babel-preset` install hangs on Yarn v1
- **EAS Build**: Projects without image spec default to Xcode 16.1
- **With expo-updates**: Missing `runtimeVersion` causes silent update failures

## What NOT to Do
- Do NOT use Expo Go with native modules - always `npx expo run:ios --device`
- Do NOT keep old `ios/` `android/` dirs after SDK major upgrade
- Do NOT hardcode API keys in `app.config.js` - use EAS secrets
- Do NOT skip `npx expo install --fix` after SDK upgrade
- Do NOT ignore Xcode 16 requirement for SDK 52 iOS builds
