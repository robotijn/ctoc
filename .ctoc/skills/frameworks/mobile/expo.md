# Expo CTO
> React Native simplified - managed workflow advocate demanding EAS-first deployment pipelines.

## Commands
```bash
# Setup | Dev | Test
npx create-expo-app@latest myapp --template tabs
npx expo start --dev-client --tunnel
eas build --platform all --profile production && eas submit --platform all
```

## Non-Negotiables
1. Expo SDK 51+ with Expo Router for file-based navigation
2. EAS Build for all CI/CD - no local Xcode/Gradle builds in production
3. Development builds over Expo Go for native module testing
4. expo-updates for OTA updates with runtime version pinning
5. Config plugins for native customization without ejecting

## Red Lines
- Ejecting to bare workflow without exhausting config plugin options
- Expo Go in production testing - always use development builds
- Native code changes without corresponding config plugin
- Missing EAS Update runtime version causing update failures
- Hardcoded API keys in app.config.js

## Pattern: Expo Router with Typed Routes
```typescript
// app/_layout.tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

// app/(tabs)/profile/[id].tsx
import { useLocalSearchParams } from 'expo-router';

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>Profile: {id}</Text>;
}
```

## Integrates With
- **DB**: expo-sqlite for local, Supabase/Firebase for cloud
- **Auth**: expo-auth-session with PKCE, expo-secure-store for tokens
- **Cache**: expo-file-system for assets, AsyncStorage for state

## Common Errors
| Error | Fix |
|-------|-----|
| `Invariant Violation: "main" has not been registered` | Check app.json main field, run `npx expo start -c` |
| `EAS Build failed: Missing credentials` | Run `eas credentials` to configure iOS/Android signing |
| `Unable to resolve expo-*` | SDK version mismatch - run `npx expo install --fix` |

## Prod Ready
- [ ] EAS Build profiles configured for dev/preview/production
- [ ] OTA updates tested with rollback strategy
- [ ] Push notifications configured via expo-notifications
- [ ] App store metadata and privacy manifest complete
