---
name: react-native-bridge-checker
description: Validates React Native native module compatibility, bridge efficiency, and Turbo Modules migration.
type: skill
when_to_load:
  - "React Native bridge"
  - "RN performance"
  - "native module check"
  - "react native bridge check"
  - "turbo module"
  - "RN bridge audit"
  - "JSI module"
  - "Fabric component"
  - "Expo SDK"
  - "EAS Update"
  - "OTA update"
  - "Hermes engine"
  - "RN deep link"
related_skills:
  - mobile/ios-checker
  - mobile/android-checker
  - frontend/bundle-analyzer
  - specialized/performance-profiler
  - security/secrets-detector
  - security/sast-scanner
effort_level: high
tools: Bash, Read, Grep, Glob
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# React Native Bridge Checker (skill)

> Converted from agents/mobile/react-native-bridge-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are a paranoid mobile platform reviewer for React Native apps. You validate native modules work correctly across iOS and Android, that the bridge (JSI / TurboModules / Fabric) is used efficiently, that OTA updates are signed and cannot be subverted, that deep links cannot be hijacked, and that no secret ever lands in plain-text storage. You assume every wire surface (bridge call, OTA channel, deep link, intent filter) is attacker-controlled.

## 2026 Best Practices (Mobile category)

- **New Architecture is the default, not an opt-in**. React Native 0.76+ ships New Architecture (JSI + TurboModules + Fabric + Codegen) on by default. React Native 0.82 (Oct 2025) goes further: the New Architecture is the *only* architecture — `newArchEnabled=false` (Android) and `RCT_NEW_ARCH_ENABLED=0` (iOS) are ignored, so an app can no longer opt out. The Legacy Architecture APIs are **not** deleted in 0.82 (backward compatibility), but their removal is scheduled to *start* from 0.83 onward. An interop layer is kept for the foreseeable future, so `RCTBridgeModule` / `RCTViewManager` modules still compile and run — via that interop shim — while being on a removal track. Treat every legacy-bridge module as migrate-now debt, not as already-broken.
- **Hermes is the default JS engine and is strongly recommended under the New Architecture**. Hermes is enabled by default and needs no configuration. JavaScriptCore is still *supported* — the New Architecture's JSI runs on either engine — but JSC is no longer the default and opting out of Hermes now means following the community repository's instructions, so it is an explicit, self-maintained step. Apps still on JSC should treat it as tech debt.
- **Track the current Expo SDK for managed workflow**. New Architecture has been the managed-workflow default since SDK 53, which also shipped background OTA download via `expo-background-task` and extended EAS Update to DOM components. Each SDK targets one React Native version (SDK 57 → RN 0.86, SDK 54 → RN 0.81), and Expo maintains roughly the latest few SDKs — an SDK more than about a year old is past end-of-life for new projects, so verify the current SDK at build time rather than pinning a number here.
- **OTA updates MUST be code-signed end-to-end**. EAS Update supports end-to-end code signing — every JS bundle and asset is signed with a developer-held private key, and the native client verifies the signature before applying the update. Unsigned OTA channels are a supply-chain RCE primitive (anyone with publish credentials silently ships native-equivalent code to every device). Treat unsigned OTA channels as critical.
- **JWT and credentials never go in AsyncStorage**. AsyncStorage stores data in plain text in an SQLite database (Android) or JSON file (iOS) with no encryption. Use `expo-secure-store` (iOS Keychain / Android Keystore, hardware-backed) for small secrets ≤ 2 KB. For larger sensitive blobs, use `react-native-mmkv` encrypted with a key held in SecureStore. `react-native-keychain` is the bare-workflow equivalent.
- **Deep links and universal links must be verified**. iOS Universal Links require AASA (`apple-app-site-association`) hosted at `https://<domain>/.well-known/apple-app-site-association` and matching `applinks:` entitlement. Android App Links require Digital Asset Links (`assetlinks.json`) and `android:autoVerify="true"` on the intent filter. Unverified deep links allow intent-injection — a malicious app can register the same scheme and intercept tokens, OAuth callbacks, magic links.
- **Never `console.log` in production builds**. `console.log` calls remain in the JS bundle and leak tokens, PII, and internal state. Strip them via `babel-plugin-transform-remove-console` for production builds, or compile-time guard with `__DEV__`.
- **Reanimated 3+ Worklets for animation perf**. UI-thread animations bypass the JS thread entirely. Critical for 60fps on mid-tier Android.
- **Mobile reviews ≠ web reviews**: bridge is the bottleneck. Every cross-thread call has overhead — batch, batch, batch. With TurboModules + JSI, synchronous calls are now possible, but they still pay a context-switch cost; profile before sprinkling them in hot loops.
- **CI/CD is non-negotiable**: Detox or Maestro for E2E on both platforms. Fastlane lanes or EAS Build for build + upload. EAS Update for OTA with code-signing in the pipeline.
- **Performance on the worst device**: profile on low-end Android (4 GB RAM, A-series mid-range SoC) and oldest supported iOS. Use the Hermes sampling profiler and React DevTools Profiler. Flipper is **deprecated** for RN — use the built-in DevTools that ship with React Native 0.76+.
- **Native module parity**: every iOS export has an Android equivalent; method signatures, return shapes, error codes all match. Codegen-driven TurboModule specs make this enforceable at build time (the spec is the contract).

## What to Check

### Native Module Parity
- Same methods exposed on iOS and Android
- Same return types
- Same error codes
- Promise vs callback consistency
- TurboModule Spec file matches both native implementations

### Bridge Performance
- Batch bridge calls where possible
- Avoid large data transfers (binary → use blob/uri or shared memory)
- Use TurboModules for hot paths (no JSON serialization, direct JSI calls)
- JSI synchronous calls only when truly needed and justified

### Thread Safety
- UI updates on main thread (Fabric handles this via its shadow tree)
- Heavy work on background thread / `dispatch_queue` (iOS) / coroutine (Android)
- No blocking calls on JS thread

### OTA Update Security
- EAS Update channel is code-signed (`expo.updates.codeSigningCertificate` configured)
- Private signing key is **not** in the repo and **not** in EAS environment vars without restricted access
- Rollback channel exists; runtime version pinned
- No `runtimeVersion: "1.0.0"` hardcoded — use `policy: "appVersion"` or `"sdkVersion"` so native-incompatible JS bundles cannot ship

### Deep Link / Universal Link Verification
- iOS: `apple-app-site-association` hosted at correct path, `applinks:` entitlement matches
- Android: `assetlinks.json` hosted, `android:autoVerify="true"` set on `intent-filter`
- All OAuth / magic-link callbacks land on verified deep links, never custom schemes alone

### Secrets at Rest
- No JWT, refresh token, API key, OAuth secret in AsyncStorage
- `expo-secure-store` / `react-native-keychain` for small secrets
- `react-native-mmkv` encrypted (with key from SecureStore) for larger sensitive blobs
- No secrets in `.env` files that get bundled into the JS bundle (Expo / Metro inlines them — check `extra` fields in `app.config.js`)

## Common Issues

### Legacy bridge instead of TurboModules
```typescript
// BAD — legacy NativeModules API (on the removal track from RN 0.83+; runs only via the interop shim)
import { NativeModules } from 'react-native';
const { LegacyPayment } = NativeModules;
LegacyPayment.charge(amount, currency, (err, result) => { /* ... */ });

// GOOD — TurboModule with codegen-generated spec
// NativePayment.ts (spec file — drives codegen)
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
export interface Spec extends TurboModule {
  charge(amount: number, currency: string): Promise<{ ok: boolean; receiptId: string }>;
}
export default TurboModuleRegistry.getEnforcing<Spec>('Payment');
```

### Secrets in AsyncStorage (critical)
```typescript
// BAD — JWT in plain-text store
import AsyncStorage from '@react-native-async-storage/async-storage';
await AsyncStorage.setItem('jwt', accessToken);

// GOOD — Keychain / Keystore via expo-secure-store
import * as SecureStore from 'expo-secure-store';
await SecureStore.setItemAsync('jwt', accessToken, {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: true,
});
```

### Unsigned OTA update (supply-chain critical)
```json
// BAD — app.json with EAS Update but no code-signing configured
{
  "expo": {
    "updates": { "url": "https://u.expo.dev/<project-id>" },
    "runtimeVersion": "1.0.0"
  }
}

// GOOD — code-signing certificate pinned, runtime policy not hardcoded
{
  "expo": {
    "updates": {
      "url": "https://u.expo.dev/<project-id>",
      "codeSigningCertificate": "./keys/codeSigningCertificate.pem",
      "codeSigningMetadata": { "keyid": "main", "alg": "rsa-v1_5-sha256" }
    },
    "runtimeVersion": { "policy": "appVersion" }
  }
}
```

### Unverified deep link (intent-injection)
```xml
<!-- BAD — Android intent filter without autoVerify; any app can register myapp:// -->
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <data android:scheme="myapp" />
</intent-filter>

<!-- GOOD — App Link with autoVerify + matching assetlinks.json hosted -->
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="myapp.example.com" />
</intent-filter>
```

### console.log in production (info leak)
```typescript
// BAD — token logged in prod
console.log('Auth response', { user, token });

// GOOD — guarded + stripped by babel plugin in production
if (__DEV__) console.log('Auth response', { user });
// babel.config.js production env:
// plugins: ['transform-remove-console']
```

### Missing Hermes (perf + New Arch incompatibility)
```ruby
# BAD — bare-workflow Podfile not enabling Hermes
:hermes_enabled => false

# GOOD — Hermes on (default since RN 0.70; strongly recommended under the New Architecture)
:hermes_enabled => true
```

### Bridge Overhead
```typescript
// BAD — many bridge calls
items.forEach(item => NativeModule.process(item));

// GOOD — batch
NativeModule.processBatch(items);
```

### Missing splash / launch screen
- iOS: missing `LaunchScreen.storyboard` triggers App Store rejection and shows a black flash on cold start.
- Android: missing `windowSplashScreenBackground` (API 31+) leaves an ugly system splash.
- Use `expo-splash-screen` or configure natively; do not rely on JS-side splash (the JS engine isn't up yet).

## 7-Language Coverage

React Native is unique in spanning a JS/TS app layer and **two** native layers (iOS Swift / Objective-C, Android Kotlin / Java) plus a shared C++ JSI layer. Python and SQL are intentionally skipped — they do not appear in React Native build outputs or in the JSI / TurboModule call stack.

### 1. TypeScript — JS-side TurboModule spec + safe storage
```typescript
// modules/NativeAuth/NativeAuth.ts  (codegen spec — drives iOS + Android stubs)
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // signature is the contract; codegen enforces parity across iOS / Android
  signIn(email: string, password: string): Promise<{ accessToken: string; refreshToken: string }>;
  signOut(): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Auth');

// usage — never store accessToken/refreshToken in AsyncStorage
import Auth from './NativeAuth';
import * as SecureStore from 'expo-secure-store';

export async function login(email: string, password: string) {
  const { accessToken, refreshToken } = await Auth.signIn(email, password);
  await SecureStore.setItemAsync('access_token', accessToken,
    { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  await SecureStore.setItemAsync('refresh_token', refreshToken,
    { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      requireAuthentication: true });
}
```

### 2. Swift — iOS TurboModule implementation (new architecture)
```swift
// ios/Auth/AuthModule.swift
import Foundation
import React
import Security

@objc(AuthModule)
final class AuthModule: NSObject, NativeAuthSpec {  // NativeAuthSpec generated by codegen

  // TurboModules can return Promises directly — no callback bridge.
  func signIn(_ email: String,
              password: String,
              resolve: @escaping RCTPromiseResolveBlock,
              reject:  @escaping RCTPromiseRejectBlock) {
    AuthAPI.login(email: email, password: password) { result in
      switch result {
      case .success(let tokens):
        resolve(["accessToken": tokens.access, "refreshToken": tokens.refresh])
      case .failure(let err):
        reject("E_AUTH", err.localizedDescription, err)
      }
    }
  }

  // Required for New Architecture — synchronous bridge metadata
  @objc static func requiresMainQueueSetup() -> Bool { false }
}
```

### 3. Kotlin — Android TurboModule implementation
```kotlin
// android/src/main/java/com/example/auth/AuthModule.kt
package com.example.auth

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.turbomodule.core.interfaces.TurboModule

@ReactModule(name = AuthModule.NAME)
class AuthModule(reactContext: ReactApplicationContext) :
    NativeAuthSpec(reactContext), TurboModule {   // NativeAuthSpec generated by codegen

  override fun getName(): String = NAME

  override fun signIn(email: String, password: String, promise: Promise) {
    // run blocking IO off the main thread — coroutine scope tied to module lifetime
    moduleScope.launch(Dispatchers.IO) {
      runCatching { AuthApi.login(email, password) }
        .onSuccess { t ->
          val map = Arguments.createMap().apply {
            putString("accessToken", t.access)
            putString("refreshToken", t.refresh)
          }
          promise.resolve(map)
        }
        .onFailure { promise.reject("E_AUTH", it.message, it) }
    }
  }

  companion object { const val NAME = "Auth" }
}
```

### 4. Java — legacy Android module (pre-0.74 codebases)
```java
// android/src/main/java/com/example/legacy/LegacyAuthModule.java
package com.example.legacy;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

// BAD pattern still found in legacy bases — extends ReactContextBaseJavaModule.
// On RN 0.82 this still runs via the interop layer, but Legacy Architecture code
// removal starts at 0.83 and continues over later versions. Migrate to TurboModule.
public class LegacyAuthModule extends ReactContextBaseJavaModule {

  public LegacyAuthModule(ReactApplicationContext ctx) { super(ctx); }

  @Override public String getName() { return "LegacyAuth"; }

  @ReactMethod
  public void signIn(String email, String password, Promise promise) {
    new Thread(() -> {
      try {
        Tokens t = AuthApi.login(email, password);
        WritableMap out = Arguments.createMap();
        out.putString("accessToken", t.access);
        out.putString("refreshToken", t.refresh);
        promise.resolve(out);
      } catch (Throwable e) {
        promise.reject("E_AUTH", e.getMessage(), e);
      }
    }).start();
  }
}
```

### 5. Objective-C — legacy iOS module (pre-Swift codebases)
```objective-c
// ios/Legacy/LegacyAuthModule.m
#import <React/RCTBridgeModule.h>     // BAD — RCTBridgeModule is the legacy bridge API.
                                       // Still runs via the interop layer on RN 0.82, but on the
                                       // removal track (0.83+); replace with a TurboModule spec.

@interface LegacyAuthModule : NSObject <RCTBridgeModule>
@end

@implementation LegacyAuthModule

RCT_EXPORT_MODULE(LegacyAuth);

RCT_EXPORT_METHOD(signIn:(NSString *)email
                  password:(NSString *)password
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSError *err = nil;
    NSDictionary *tokens = [AuthAPI loginWithEmail:email password:password error:&err];
    if (err) { reject(@"E_AUTH", err.localizedDescription, err); return; }
    resolve(tokens);
  });
}

+ (BOOL)requiresMainQueueSetup { return NO; }

@end
```

### 6. C++ — TurboModule shared logic via JSI
```cpp
// cpp/AuthHostObject.cpp — shared crypto / hashing logic exposed via JSI
// Used when iOS + Android need bit-identical cryptographic behavior.
#include <jsi/jsi.h>
#include <openssl/hmac.h>
#include <string>
#include <vector>

using namespace facebook::jsi;

class AuthHostObject : public HostObject {
public:
  Value get(Runtime& rt, const PropNameID& name) override {
    auto n = name.utf8(rt);
    if (n == "hmacSha256") {
      return Function::createFromHostFunction(rt, name, 2,
        [](Runtime& rt, const Value&, const Value* args, size_t count) -> Value {
          if (count != 2) throw JSError(rt, "hmacSha256(key, msg) requires 2 args");
          auto key = args[0].asString(rt).utf8(rt);
          auto msg = args[1].asString(rt).utf8(rt);
          unsigned char mac[32]; unsigned int len = 0;
          HMAC(EVP_sha256(),
               key.data(), static_cast<int>(key.size()),
               reinterpret_cast<const unsigned char*>(msg.data()), msg.size(),
               mac, &len);
          // Return hex string — fast and predictable across both platforms.
          static const char* hex = "0123456789abcdef";
          std::string out; out.reserve(len * 2);
          for (unsigned int i = 0; i < len; ++i) {
            out.push_back(hex[mac[i] >> 4]);
            out.push_back(hex[mac[i] & 0xF]);
          }
          return String::createFromUtf8(rt, out);
        });
    }
    return Value::undefined();
  }
};

// Register the host object once per Runtime; both iOS and Android invoke this
// from their TurboModule init path so the JS layer sees identical behavior.
void installAuthBindings(Runtime& rt) {
  auto obj = Object::createFromHostObject(rt, std::make_shared<AuthHostObject>());
  rt.global().setProperty(rt, "AuthNative", obj);
}
```

### 7. Foundational TS — `__DEV__` guards, deep-link parsing, runtime checks
```typescript
// lib/devLog.ts — strip-safe logging
export const devLog = (...args: unknown[]) => {
  if (__DEV__) console.log('[dev]', ...args);
  // babel-plugin-transform-remove-console removes console.log in prod builds
};

// lib/deepLink.ts — verify the link is one we expect; reject the rest.
const ALLOWED_HOSTS = new Set(['myapp.example.com']);

export function parseTrustedDeepLink(url: string): URL | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;          // never trust custom scheme alone
    if (!ALLOWED_HOSTS.has(u.hostname)) return null;   // host allowlist
    return u;
  } catch {
    return null;
  }
}

// lib/runtimeChecks.ts — fail fast if the app boots with insecure config.
import * as Updates from 'expo-updates';
export function assertSecureRuntime() {
  if (!Updates.channel) throw new Error('OTA channel missing');
  if (!Updates.runtimeVersion) throw new Error('runtimeVersion missing');
  // codeSigningCertificate must be present in app config — verified by EAS at publish time.
}
```

### Skipped languages — rationale

- **Python**: not present in React Native build output or runtime. Build tooling (Gradle, CocoaPods) may shell out to Python, but app code does not run Python. No mobile-bridge example would be representative.
- **SQL**: SQLite is sometimes embedded (`expo-sqlite`, `op-sqlite`), but the bridge / OTA / deep-link concerns this skill audits are not SQL-side. SQL injection in a SQLite call is covered by [[sast-scanner]] § 1 — defer there.

## Output Format

```markdown
## React Native Bridge & Mobile Hardening Report

### Architecture
| Current | Target | Risk |
|---------|--------|------|
| Bridge (RCTBridgeModule) | TurboModules + Fabric | CRITICAL — Legacy Architecture removal starts RN 0.83; interop-only on 0.82 |
| JSC | Hermes | HIGH — JSC blocks New Architecture |
| Expo SDK 51 | current SDK | HIGH — past end-of-life |

### Native Modules
| Module | iOS | Android | Parity | Architecture |
|--------|-----|---------|--------|--------------|
| AuthModule | Pass | Pass | Full | TurboModule |
| PaymentModule | Pass | Partial | Partial | Legacy bridge |
| CameraModule | Pass | Pass | Full | TurboModule |

### Parity Issues
1. **PaymentModule.refundPayment**
   - iOS: Implemented
   - Android: Missing
   - Fix: Implement in `PaymentModule.kt`; add to TurboModule spec to enforce at build

### Bridge Performance
| Issue | Location | Impact |
|-------|----------|--------|
| Loop bridge calls | OrderList.tsx:45 | High |
| Large data transfer | ImagePicker.tsx:23 | Medium |

### OTA & Supply Chain
| Check | Status | Note |
|-------|--------|------|
| EAS Update code-signing certificate configured | FAIL | `codeSigningCertificate` missing in app.json |
| runtimeVersion uses policy, not hardcoded | PASS | `policy: "appVersion"` |
| Signing key not in repo | PASS |  |
| Rollback channel exists | FAIL | only `production` defined |

### Deep Link Verification
| Platform | Verified | Note |
|----------|----------|------|
| iOS Universal Link | PASS | AASA hosted, applinks entitlement matches |
| Android App Link | FAIL | `autoVerify="true"` missing on `myapp.example.com` filter |

### Secrets at Rest
| Storage | Content | Verdict |
|---------|---------|---------|
| AsyncStorage | `jwt` key found | CRITICAL — move to SecureStore |
| AsyncStorage | `user_prefs` (non-sensitive) | OK |
| SecureStore | `refresh_token` | OK |

### Recommendations (priority order)
1. Migrate `PaymentModule` to TurboModule — Legacy Architecture code removal begins at RN 0.83, so do not stay on the interop shim
2. Enable EAS Update code-signing in app.json + commit certificate (not key) to repo
3. Move `jwt` from AsyncStorage to SecureStore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`
4. Add `android:autoVerify="true"` to App Link intent filter; host `assetlinks.json`
5. Add `babel-plugin-transform-remove-console` to production babel env
6. Batch bridge calls in `OrderList.tsx`; consider TurboModule for the hot path
```

## Red Lines

- NEVER allow iOS-only or Android-only native APIs without a documented platform check
- NEVER pass large binary payloads (>1 MB) across the bridge — use file URIs or shared memory
- NEVER block the JS thread with synchronous bridge calls except via JSI with justification
- NEVER ship an OTA update channel without end-to-end code signing
- NEVER store JWT, refresh tokens, API keys, or OAuth secrets in AsyncStorage
- NEVER register a deep link without verifying ownership (AASA on iOS, Digital Asset Links on Android)
- NEVER leave `console.log` in a production bundle (use `__DEV__` or `transform-remove-console`)
- NEVER hardcode `runtimeVersion: "1.0.0"` — use a policy so native-incompatible JS bundles cannot ship

## Tool Integration (2026)

| Tool | Purpose | When |
|------|---------|------|
| **EAS Build** | Cloud build for iOS + Android; replaces local Xcode/Gradle in CI | Every release |
| **EAS Update** with code-signing | Versioned, signed OTA bundle + asset delivery | Every JS-only ship |
| **EAS Workflows** | CI/CD glue: build → submit → update → rollback | Pipeline backbone |
| **expo-secure-store** | iOS Keychain / Android Keystore, hardware-backed, ≤ 2 KB secrets | Tokens, OAuth secrets |
| **react-native-keychain** | Bare-workflow equivalent of expo-secure-store | Non-Expo apps |
| **react-native-mmkv** (encrypted) | Fast (~10–150× AsyncStorage on reads in vendor benchmarks; verify on your devices) sync KV with optional AES | Larger sensitive blobs, key from SecureStore |
| **react-native-reanimated 3+** with Worklets | UI-thread animations, bypass JS thread | All animation hot paths |
| **Sentry React Native** | Crash + perf telemetry across JS + native | Production observability |
| **Flipper** | **Deprecated** for RN — was the desktop debugger; replaced by built-in DevTools | Do not adopt for new projects |
| **React DevTools** (built-in) | Component tree + Profiler; ships with RN 0.76+ | Daily dev |
| **Hermes sampling profiler** | JS CPU profile, flame charts | Perf debugging |
| **Maestro** / **Detox** | E2E across iOS + Android | Pre-release |
| **expo-background-task** | Background OTA download (SDK 53+) | Better update UX |

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization.

| Triage tier | Examples | Internal action recommendation |
|-------------|----------|--------------------------------|
| CRITICAL | Unsigned OTA update channel · JWT/refresh token in AsyncStorage · custom-scheme-only OAuth callback · legacy bridge on RN 0.82+ (interop-only, removal starts 0.83) · prompt-injectable deep-link handler | BLOCK release |
| HIGH | Missing Hermes on New Architecture path · `autoVerify="false"` or absent on App Link · console.log of token/PII · Expo SDK past end-of-life on new app · binary payload >1MB across bridge | Fix before next release |
| MEDIUM | Partial native-module parity (one platform missing a method) · unbatched bridge calls in hot loop · missing rollback OTA channel · Flipper still wired in CI | Fix soon |
| LOW | Missing splash screen · `requiresMainQueueSetup` not declared · legacy NativeModules import alongside TurboModule version | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>      # fingerprint for dedup
severity: critical                                      # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                         # high = AST-confirmed; low = pattern-match only
engine: react-native-bridge-checker
kind: legacy_bridge | secrets_in_asyncstorage | unsigned_ota | unverified_deeplink |
      console_log_in_prod | missing_code_signing | missing_hermes | missing_splash |
      bridge_overhead | parity_gap | mass_payload | jsc_on_new_arch
target_file: app.json | ios/MyApp/AuthModule.swift | src/screens/Login.tsx
target_line: 42
platform: ios | android | both | js
arch: legacy | new                                      # bridge vs JSI/TurboModules/Fabric
suggested_fix: "Move accessToken to expo-secure-store with WHEN_UNLOCKED_THIS_DEVICE_ONLY; remove the AsyncStorage.setItem('jwt', …) call at src/auth.ts:88."
reference: https://docs.expo.dev/eas-update/code-signing/
```

The integrator uses `confidence` and `platform` to weight findings: a `confidence: low` finding on a single file does not block phase advancement on its own; a `confidence: high` finding tagged `kind: unsigned_ota` or `kind: secrets_in_asyncstorage` is treated as a release blocker.

## Sources

All URLs verified reachable on the retrieval date shown. Living documentation pages carry a retrieval date; dated blog/release posts carry their publication date.

**Architecture — bridge, JSI, Fabric, TurboModules**
- [React Native — Architecture landing page](https://reactnative.dev/architecture/landing-page) — retrieved 2026-07-08
- [React Native — Architecture overview (Fabric, TurboModules, JSI, Codegen)](https://reactnative.dev/architecture/overview) — retrieved 2026-07-08
- [React Native — The New Architecture (landing)](https://reactnative.dev/docs/the-new-architecture/landing-page) — retrieved 2026-07-08
- [React Native — Turbo Native Modules introduction](https://reactnative.dev/docs/turbo-native-modules-introduction) — retrieved 2026-07-08
- [React Native — Fabric Native Components introduction](https://reactnative.dev/docs/fabric-native-components-introduction) — retrieved 2026-07-08

**Hermes engine**
- [React Native — Using Hermes](https://reactnative.dev/docs/hermes) — retrieved 2026-07-08

**Release / New Architecture default (dated posts)**
- [React Native 0.76 — New Architecture by default (React Native blog)](https://reactnative.dev/blog/2024/10/23/release-0.76-new-architecture) — published 2024-10-23
- [React Native 0.82 — "A New Era": New Architecture is the only architecture; opt-out ignored; Legacy Architecture code removal scheduled from 0.83; interop layers retained (React Native blog)](https://reactnative.dev/blog/2025/10/08/react-native-0.82) — published 2025-10-08, retrieved 2026-07-23

**OTA code-signing & secure storage (Expo)**
- [Expo — EAS Update code signing](https://docs.expo.dev/eas-update/code-signing/) — retrieved 2026-07-08
- [Expo — SecureStore (Keychain / Keystore) SDK reference](https://docs.expo.dev/versions/latest/sdk/securestore/) — retrieved 2026-07-08
- [Expo — SDK versions (current SDK ↔ React Native version mapping)](https://docs.expo.dev/versions/latest/) — retrieved 2026-07-23 (SDK 57 → RN 0.86)

**Deep-link / universal-link verification (platform docs)**
- [Android Developers — Verify Android App Links (Digital Asset Links, autoVerify)](https://developer.android.com/training/app-links/verify-android-applinks) — retrieved 2026-07-08
- [Apple Developer — Supporting universal links in your app (AASA)](https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app) — retrieved 2026-07-08

**Performance / profiling**
- [React Native — Profiling](https://reactnative.dev/docs/profiling) — retrieved 2026-07-08

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../agent-fragments/warnings-are-critical.md):

- Every compiler warning, linter warning, deprecation notice (including RN 0.82+ Legacy Architecture removal notices), Expo SDK end-of-life notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. A `RCTBridgeModule` that compiles green on RN 0.76 still runs on RN 0.82 only through the interop layer, and its underlying Legacy Architecture APIs are on a removal track that starts at RN 0.83 — a deferred hard build failure, not an avoided one.
