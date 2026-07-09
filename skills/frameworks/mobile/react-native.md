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

## New Architecture (JSI / Fabric / TurboModules) Migration Footguns
The New Architecture replaces the old asynchronous **bridge** (JSON messages
serialized across a queue) with **JSI** — a synchronous C++ layer that lets JS
hold references to native objects directly. **Fabric** is the new renderer;
**TurboModules** are the new native-module system; **Codegen** generates the C++
glue from your TypeScript/Flow spec files. Since **React Native 0.76 the New
Architecture is the default**, and it is the only architecture going forward.
[reactnative.dev/architecture, retrieved 2026-07-09]

```typescript
// FOOTGUN: legacy NativeModules bridge calls. Under the New Architecture the
// old bridge is gone in bridgeless mode — code that reaches for NativeModules
// or the async `callFunctionReturnFlushedQueue` bridge internals will not work.
import { NativeModules } from 'react-native';
const { MyModule } = NativeModules;          // legacy — avoid in new code

// RIGHT: a TurboModule spec. The name passed to getEnforcing MUST match the
// registered native module name exactly, or you get a hard runtime throw
// ("TurboModuleRegistry.getEnforcing(...): '<name>' could not be found").
import { TurboModuleRegistry, type TurboModule } from 'react-native';
export interface Spec extends TurboModule {
  multiply(a: number, b: number): number;    // Codegen reads THIS interface
}
export default TurboModuleRegistry.getEnforcing<Spec>('NativeMyModule');
```
- **JSI is synchronous** — a heavy TurboModule method called on the JS thread now
  blocks JS directly (the old bridge hid this behind async). Move heavy work to a
  native thread inside the module; do not assume "it's native so it's free."
- **Codegen requires a spec file** matching `Native*.ts`/`*NativeComponent.ts`
  naming and only a restricted type set (no arbitrary unions) — an unsupported
  type is a build-time Codegen error, not a runtime one.
- **Third-party libs**: a library that has not shipped New-Architecture (Fabric /
  TurboModule) support will fall back through the **interop layer** — which works
  but silently reintroduces bridge cost. Check the library's New-Arch status
  before assuming it is bridgeless.

## Threading, Hermes, and `useNativeDriver`
React Native runs (at least) a **UI thread**, a **JS thread**, and native module
threads. Two of the most common Claude-generated jank bugs live here.

```typescript
import { Animated } from 'react-native';

// FOOTGUN: an animation WITHOUT useNativeDriver runs on the JS thread — every
// frame is computed in JS and shipped over to the UI thread, so any JS work
// (a re-render, a fetch callback) drops animation frames.
Animated.timing(opacity, { toValue: 1, duration: 300 }).start();  // janky

// RIGHT: useNativeDriver runs the animation on the UI thread, immune to JS
// congestion. BUT it only supports non-layout props (opacity, transform).
Animated.timing(opacity, {
  toValue: 1, duration: 300, useNativeDriver: true,
}).start();
// useNativeDriver CANNOT animate layout props — width/height/top/left/margin
// throw at runtime ("Style property 'width' is not supported by native
// animated module"). For layout use Reanimated or animate transform/scale.
```
- **Hermes** is the default JS engine. It is **ahead-of-time bytecode**, so a
  `.js` OTA bundle must be compiled to Hermes bytecode (`.hbc`) for the shipped
  engine version — a bundle built for a different Hermes/RN version can crash on
  load. Do not mix a JSC-built bundle with a Hermes binary.
- **Metro** resolves modules with its own resolver (not Node's). **Symlinks**
  (pnpm, yarn workspaces) historically break Metro; monorepos need
  `resolver.nodeModulesPaths` / `watchFolders`, and package aliases go through
  `resolver.extraNodeModules`, not `tsconfig` paths.
- **`bridgeless` mode** (default on the New Architecture) removes the legacy
  bridge entirely; any code depending on bridge timing or `__fbBatchedBridge`
  internals must be removed before enabling it.

## OTA Update Security (integrity / code-signing)
OTA update mechanisms (Expo Updates, Microsoft **CodePush**-style flows) let you
ship a new **JS bundle without an app-store review** — which means the update
channel becomes a code-delivery path that MUST be integrity-checked, or an
attacker who can MITM or compromise the update host ships arbitrary JS into every
installed app. This is the vulnerability class **CWE-494 "Download of Code
Without Integrity Check"** (cwe.mitre.org/data/definitions/494.html).
- **Serve updates over HTTPS only** and pin/verify the update endpoint; a plain
  `http://` update URL is a code-injection vector.
- **Code-sign the bundle**: Expo Updates supports **`expo-updates` code signing**
  (a signing key + `codeSigningCertificate`) so the client rejects any bundle not
  signed by your key. Enable it for production OTA. [docs.expo.dev/eas-update/code-signing,
  retrieved 2026-07-09]
- **Never** ship secrets in the JS bundle expecting OTA to hide them — the bundle
  is readable on-device; OTA changes the code, not its confidentiality.
- Source: cwe.mitre.org/data/definitions/494.html (retrieved 2026-07-09).

## Testing Conventions
```typescript
// FOOTGUN: rendering a screen that fires an animation or timer without fake
// timers leaves the test env with pending work ("A worker process has failed to
// exit gracefully"). Drive time explicitly.
import { render, screen, fireEvent } from '@testing-library/react-native';

test('increments on press', () => {
  render(<Counter />);
  fireEvent.press(screen.getByRole('button', { name: /add/i }));
  expect(screen.getByText('1')).toBeOnTheScreen();   // query by accessibility, not testID-only
});
```
- Prefer `@testing-library/react-native` queries by **role/label** (mirrors the
  accessibility tree a real user hits) over brittle `testID` lookups.
- Native modules are not present under Jest — mock the **module boundary**
  (`jest.mock('react-native', ...)` / a manual `__mocks__`), never the component
  under test. TurboModule specs can be exercised with a JS mock of the `Spec`.
- Run detox/Maestro for true end-to-end flows; unit tests cannot catch a
  native-thread jank or a Hermes-bytecode mismatch.

## Performance Traps
- **Bridge/JSI chatter**: passing large objects across the boundary every frame
  serializes cost; batch and memoize. Under the old bridge this was async
  back-pressure; under JSI a hot synchronous call blocks JS directly.
- **`FlatList`**: set `keyExtractor`, `getItemLayout` (avoids async measurement),
  and `removeClippedSubviews` for long lists; nesting `VirtualizedList`s breaks
  virtualization and loads every row.
- **`useNativeDriver: true`** for all transform/opacity animation; keep JS-thread
  work (heavy `useEffect`, JSON parsing) off the frame path.
- **InteractionManager / `requestAnimationFrame`**: defer non-urgent work until
  after interactions so it does not compete with an in-flight gesture.

## Version-Specific Gotchas (dated, sourced)
- **React Native 0.86.0** is the current release on npm, published **2026-06-09**.
  [registry.npmjs.org/react-native (dist-tags.latest), retrieved 2026-07-09]
- **0.76+**: the **New Architecture is the default** (Fabric + TurboModules +
  bridgeless); the legacy bridge is opt-out and being removed.
  [reactnative.dev/architecture, retrieved 2026-07-09]
- **Hermes** is the default engine; an OTA JS bundle must be Hermes-compiled for
  the shipped engine version or it fails to load.
- **New-Arch third-party support**: verify each native dependency advertises
  Fabric/TurboModule support; otherwise it runs through the interop layer.

## References (retrieved 2026-07-09)
- React Native Architecture (New Arch / JSI / Fabric / TurboModules): https://reactnative.dev/architecture/landing-page
- React Native releases (npm): https://registry.npmjs.org/react-native
- Animated / useNativeDriver: https://reactnative.dev/docs/animated
- Metro resolver / monorepo config: https://metrobundler.dev/docs/configuration
- Expo Updates code signing: https://docs.expo.dev/eas-update/code-signing/
- CWE-494 (Download of Code Without Integrity Check): https://cwe.mitre.org/data/definitions/494.html
