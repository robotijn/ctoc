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

## Managed vs Bare Workflow (the capability boundary)
Expo apps run in a **managed** workflow (Expo owns the native `ios/`/`android/`
projects; you configure native behavior declaratively) or a **bare** workflow
(the native projects exist on disk and you edit them directly). The modern bridge
between them is **prebuild + config plugins** — you stay declarative but generate
native projects on demand.

```typescript
// A config plugin lets a managed project apply native changes WITHOUT ejecting.
// app.config.ts — declare native config; `npx expo prebuild` materializes it.
export default {
  expo: {
    plugins: [
      'expo-secure-store',
      ['expo-build-properties', { ios: { deploymentTarget: '15.1' } }],
    ],
  },
};
```
- **What is unavailable in managed-without-prebuild**: arbitrary native modules
  that ship raw Objective-C/Kotlin with no config plugin. In **CNG (Continuous
  Native Generation)** the `ios/`/`android/` dirs are *generated* — if you hand-edit
  them and then run `prebuild`, your edits are overwritten. Either commit to
  config plugins (managed) or check the native dirs into git (bare); do not
  straddle both.
- **Expo Go is not your app** — it is a sandbox with a fixed set of native modules.
  Any custom native module (or a New-Architecture-only library) requires a
  **development build** (`npx expo run:ios` / EAS dev build), not Expo Go.
  [docs.expo.dev/workflow/overview, retrieved 2026-07-09]

## EAS Build & EAS Update (environment + secrets)
**EAS Build** builds your native binary in Expo's cloud; **EAS Update** delivers
OTA JS bundles. The cloud build environment differs from your laptop in ways that
cause "works locally, fails on EAS" bugs.

```jsonc
// eas.json — build profiles isolate env + credentials per lane.
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview":     { "distribution": "internal", "channel": "preview" },
    "production":  { "channel": "production", "autoIncrement": true }
  }
}
```
- **Secrets**: never hardcode API keys in `app.config.*` or the JS bundle — the
  bundle is readable on-device. Use **EAS secrets** (`eas secret:create`) /
  environment variables injected at build time; `expo-secure-store`'s
  `SecureStore` for on-device secrets (Keychain / Keystore), never `AsyncStorage`
  for tokens.
- **Native deps**: EAS installs from `package.json` + resolves native modules via
  prebuild — a native dep that only works because of a local `ios/` tweak will not
  build on EAS unless the tweak is a committed config plugin.

## `expo-updates` OTA Safety (runtimeVersion, channels, integrity)
An OTA JS bundle runs against the **native runtime already installed** on the
device. If the JS calls a native API that the installed binary does not have
(added in a later native build), it crashes — so the update system gates delivery
on **`runtimeVersion`**: a device only receives an update whose `runtimeVersion`
matches its native build.

```typescript
// app.config.ts — the runtimeVersion policy prevents a JS OTA from landing on
// incompatible native code.
export default {
  expo: {
    runtimeVersion: { policy: 'appVersion' }, // or 'fingerprint' — see below
    updates: { url: 'https://u.expo.dev/<project-id>' },
  },
};
```
- **Policy choice matters**: `appVersion` ties the runtime to the app version;
  the **`fingerprint`** policy hashes the actual native dependency set, so it bumps
  automatically when native code changes — the safest default against
  "JS OTA hit an old native binary" crashes. [docs.expo.dev/eas-update/runtime-versions,
  retrieved 2026-07-09]
- **Channels/branches**: EAS Update routes builds → channels → branches. A build
  set to `channel: production` must only receive `production`-branch updates;
  mis-pointing a channel ships a preview bundle to production users.
- **Integrity (CWE-494 "Download of Code Without Integrity Check")**: an OTA
  bundle is executable code delivered outside store review, so serve it over
  HTTPS and enable **`expo-updates` code signing** (a signing key +
  `codeSigningCertificate`) so the client rejects any bundle not signed by your
  key. [docs.expo.dev/eas-update/code-signing, retrieved 2026-07-09;
  cwe.mitre.org/data/definitions/494.html]

## Testing Conventions
```typescript
import { renderRouter, screen } from 'expo-router/testing-library';

test('home route renders', async () => {
  renderRouter('app');                       // drives the real expo-router tree
  expect(await screen.findByText('Home')).toBeOnTheScreen();
});
```
- Use `jest-expo` as the Jest preset — it wires the Expo module mocks so
  `expo-*` native modules resolve under test. Mock the module boundary, not your
  component; `expo-secure-store` / `expo-updates` have official mock surfaces.
- Test navigation with `expo-router/testing-library` (real router), not by
  asserting a URL string.

## Performance Traps
- **Bundle size**: managed apps ship every imported `expo-*` module; import only
  what you use and enable Metro tree-shaking. Large OTA bundles slow cold updates.
- **Development builds vs Expo Go**: profile on a **development/production build**
  — Expo Go's bundled modules and dev-mode assertions do not reflect real app
  performance.
- **New Architecture** is the default on recent SDKs — verify each `expo-*` and
  third-party module supports it, or it falls back through the interop layer.

## Version-Specific Gotchas (dated, sourced)
- **Expo SDK 57** is the current release (`expo` package `57.0.4` on npm),
  published **2026-07-07**. Each SDK tracks a specific React Native version and
  bumps yearly-plus; upgrade one SDK at a time and run `npx expo install --fix`.
  [registry.npmjs.org/expo (dist-tags.latest), retrieved 2026-07-09]
- **Upgrade cadence**: after `npx expo install expo@^57` run `npx expo install
  --fix` to align every `expo-*` dep to the SDK, then re-`prebuild`. Skipping
  `--fix` leaves mismatched native module versions that crash at runtime.
- **`runtimeVersion` is mandatory for `expo-updates`** — a missing policy causes
  silent update failures (updates never delivered, no error surfaced).

## References (retrieved 2026-07-09)
- Expo workflows (managed / bare / prebuild): https://docs.expo.dev/workflow/overview/
- Expo SDK releases (npm): https://registry.npmjs.org/expo
- EAS Build: https://docs.expo.dev/build/introduction/
- EAS Update & runtimeVersion: https://docs.expo.dev/eas-update/runtime-versions/
- EAS Update code signing: https://docs.expo.dev/eas-update/code-signing/
- expo-secure-store: https://docs.expo.dev/versions/latest/sdk/securestore/
- CWE-494 (Download of Code Without Integrity Check): https://cwe.mitre.org/data/definitions/494.html
