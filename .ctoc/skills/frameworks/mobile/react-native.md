# React Native CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npx create-expo-app@latest myapp --template expo-template-blank-typescript
# Or for bare workflow with New Architecture (default since 0.76):
npx @react-native-community/cli init MyApp
```

## Claude's Common Mistakes
1. **Suggests Legacy Architecture patterns** - New Architecture is mandatory since 0.82, bridge code won't compile
2. **Uses deprecated Expo SDK 51 APIs** - SDK 52+ required, Expo Router v4 patterns differ significantly
3. **Ignores Hermes V1 requirements** - Static Hermes compilation needs type annotations for optimal performance
4. **Recommends React Navigation v6 setup** - v7 has breaking changes in typed navigation
5. **Uses old Metro bundler config** - `metro.config.js` format changed for New Architecture support

## Correct Patterns (2026)
```typescript
// Expo Router v4 with typed routes (SDK 52+)
// app/(tabs)/profile/[id].tsx
import { useLocalSearchParams, Stack } from 'expo-router';

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: `Profile ${id}` }} />
      <ProfileContent userId={id} />
    </>
  );
}

// Turbo Modules pattern (New Architecture)
import { TurboModuleRegistry } from 'react-native';
const MyModule = TurboModuleRegistry.getEnforcing<MyModuleSpec>('MyModule');
```

## Version Gotchas
- **0.76-0.81**: New Architecture optional, interop layers for old libs
- **0.82+**: Legacy Architecture removed, migration mandatory
- **Expo SDK 52**: React Native 0.76, New Architecture default for new projects
- **With React Navigation**: v7 requires `@react-navigation/native` separate install

## What NOT to Do
- Do NOT use `NativeModules` bridge calls - use Turbo Modules with JSI
- Do NOT use `createStackNavigator` without typed params - causes runtime crashes
- Do NOT run `npx expo start` without `--dev-client` for native modules
- Do NOT use Expo Go for production testing - always use development builds
- Do NOT ignore `VirtualizedLists should never be nested` - causes scroll jank
