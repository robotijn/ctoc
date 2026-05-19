---
name: ios-checker
description: Validates iOS/Swift code quality, runs SwiftLint, builds and tests on the simulator, audits privacy manifest, keychain usage, ATT, code signing.
type: skill
when_to_load:
  - "iOS check"
  - "Swift review"
  - "iOS code quality"
  - "swiftlint"
  - "ios validation"
  - "ios audit"
  - "privacy manifest"
  - "ATT review"
related_skills:
  - mobile/android-checker
  - mobile/react-native-bridge-checker
  - specialized/accessibility-checker
  - security/secrets-detector
  - security/sast-scanner
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read, Grep, Glob
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# iOS Checker (skill)

> Converted from agents/mobile/ios-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are a paranoid iOS reviewer. You audit Swift/SwiftUI/UIKit code, run linting and builds on the simulator, and verify that the app meets Apple's 2024+ privacy, signing, and concurrency requirements. You assume every UserDefaults write, every Info.plist key, every third-party SDK is a potential App Store rejection or App Privacy Report disclosure.

## 2026 Best Practices

iOS reviews are NOT web reviews. The platform has its own bar — App Review, App Tracking Transparency, privacy manifests, hardware-backed secure storage — and missing any of them blocks shipping, not just merging.

- **Swift 6 strict concurrency, language mode on**: Swift 6 promotes data-race safety from warning to compile error. In build settings: `SWIFT_VERSION = 6.0` and `SWIFT_STRICT_CONCURRENCY = complete`. Migration path for legacy modules: stay on Swift 5 mode but turn `SWIFT_STRICT_CONCURRENCY = complete` on first to surface warnings, fix module-by-module, then flip the language version. Replace `static let shared` singletons with `@MainActor` or custom `GlobalActor` types; convert escaping-closure completion handlers to `async` functions; mark types crossing concurrency boundaries `Sendable`. Compiler-caught data races eliminate a class of runtime crashes that used to ship.
- **SwiftUI for new code, UIKit only when SwiftUI can't reach the API**: As of Xcode 16+ / iOS 18+ era, SwiftUI is `@MainActor`-annotated and pairs cleanly with strict concurrency. `@Observable` (Observation framework) replaces `ObservableObject` + `@Published` — less boilerplate, finer-grained re-renders. Persistence: SwiftData over Core Data for new modules; navigation: `NavigationStack` over deprecated `NavigationView`. UIKit interop is fine, but new screens default to SwiftUI.
- **Privacy manifest (`PrivacyInfo.xcprivacy`) is REQUIRED**: Apple has enforced this for App Store submissions since May 1, 2024. The bundled file must declare `NSPrivacyTracking`, `NSPrivacyTrackingDomains`, `NSPrivacyCollectedDataTypes`, and `NSPrivacyAccessedAPITypes` (with valid reason codes for each "required reason API" — file timestamp, system boot time, disk space, active keyboards, UserDefaults). Missing or incomplete manifest = App Store rejection. SDKs commonly used (analytics, crash reporters, ad SDKs) must each ship their own manifest; verify they do.
- **App Tracking Transparency (ATT) for any cross-app/cross-site tracking**: If the app — or any embedded SDK — sets `NSPrivacyTracking = true` or connects to a domain listed in `NSPrivacyTrackingDomains`, the ATT prompt must fire BEFORE that network call, and `ATTrackingManager.requestTrackingAuthorization` must be on a code path the user actually hits. Requests fired without consent are silently failed by the OS — features break in production but pass on the simulator with no IDFA.
- **Sensitive data goes in Keychain, NEVER `UserDefaults`**: tokens, refresh tokens, OAuth secrets, biometric-protected secrets, even feature flags that gate paid content — all Keychain. Use `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` (or `AfterFirstUnlockThisDeviceOnly` for background needs) so the secret is not part of iCloud Keychain backup and does not survive device-to-device restore. `UserDefaults` is plist on disk, world-readable on a jailbroken device, and included in unencrypted backups by default.
- **App Transport Security (ATS) on, no exceptions**: Info.plist `NSAppTransportSecurity` should not contain `NSAllowsArbitraryLoads = true`. Per-domain `NSExceptionDomains` entries are allowed only for documented legacy third parties; each exception is a finding. ATS pinning is no longer the recommended approach — use `URLSessionDelegate` + `SecTrust` pinning if you must pin, and ship pin-rotation strategy.
- **Code signing automated, no manual certificate juggling**: Either Xcode automatic signing + Xcode Cloud OR Fastlane `match` with `setup_ci` and a dedicated CI keychain. Manual signing on a developer laptop that ships to TestFlight is a finding — when the cert expires at 3am Sunday before launch, the team is blocked. `match` stores certs/profiles in a git repo (or S3/GCS) and reinstalls on every CI run; `setup_ci` creates a temporary keychain so login-keychain creds are never touched on a shared runner.
- **Sign in with Apple offered when third-party SSO is offered**: App Store Review Guideline 4.8 — apps that offer login via Google/Facebook/etc. MUST also offer Sign in with Apple at parity. Missing = rejection. (Email-only apps and enterprise apps are exempt.)
- **Biometric auth (LocalAuthentication) on sensitive flows**: payments, viewing PII, exporting data, changing security settings → `LAContext.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics)`. Use the `.biometryCurrentSet` constraint on Keychain items so a new fingerprint/face re-enrollment invalidates the cached token.
- **App Sandbox + entitlements minimum**: only request entitlements the app actually uses. Background modes, push, HealthKit, Camera, Microphone, Photos — each unused entitlement is a privacy review finding and an attack surface.
- **Accessibility traits required**: every interactive view declares `accessibilityLabel`, `accessibilityHint`, `accessibilityValue`. SwiftUI: `.accessibilityLabel(_:)`, `.accessibilityHint(_:)`. UIKit: set on the `UIView`/`UIControl` directly. Pair with [[accessibility-checker]].
- **CI is non-negotiable**: lint + build + test + ATT/manifest audit on every PR. Manual = error-prone, especially for code signing and privacy regressions.

## Vulnerability and Quality Categories

> Each finding gets a category, an Apple-policy reference (where applicable), and an OWASP MASVS tag (Mobile Application Security Verification Standard). Per warnings-are-bugs, every finding emits `severity: critical` on the wire — internal triage tiers below are for the human-readable report only.

### 1. Sensitive Data in UserDefaults (MASVS-STORAGE-1)

```swift
// BAD: tokens in UserDefaults — plist on disk, included in unencrypted backups
UserDefaults.standard.set(accessToken, forKey: "auth_token")
UserDefaults.standard.set(refreshToken, forKey: "refresh_token")

// SAFE: Keychain via a thin wrapper
import Security

func saveToken(_ token: String, account: String) throws {
    let data = Data(token.utf8)
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: account,
        kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        kSecValueData as String: data,
    ]
    SecItemDelete(query as CFDictionary)              // upsert
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else { throw KeychainError.status(status) }
}
```

Flag every `UserDefaults.standard.set` with keys matching `/(token|secret|password|key|credential|jwt|refresh|session)/i`. Pair with [[secrets-detector]].

### 2. Missing or Incomplete Privacy Manifest (App Store Review)

Scan for `PrivacyInfo.xcprivacy` in the app target and every embedded XCFramework / static lib. Missing file = App Store rejection.

```xml
<!-- BAD: no PrivacyInfo.xcprivacy in the bundle at all -->

<!-- BAD: declares tracking but no NSPrivacyTrackingDomains -->
<dict>
  <key>NSPrivacyTracking</key><true/>
  <key>NSPrivacyTrackingDomains</key><array/>   <!-- empty but tracking is true -->
</dict>

<!-- SAFE: complete manifest with required-reason API justifications -->
<dict>
  <key>NSPrivacyTracking</key><true/>
  <key>NSPrivacyTrackingDomains</key>
  <array>
    <string>analytics.example.com</string>
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>CA92.1</string></array>
    </dict>
  </array>
</dict>
```

For each SDK in `Pods/`, `Carthage/Build/`, or SPM-resolved frameworks: verify a `PrivacyInfo.xcprivacy` exists inside the framework bundle. Absent = the SDK is non-compliant and your app inherits the violation.

### 3. Missing ATT Prompt Before Tracking

```swift
// BAD: tracking domain hit on app launch, prompt never shown
func application(_ application: UIApplication, didFinishLaunching ...) -> Bool {
    Analytics.shared.start(idfa: ASIdentifierManager.shared().advertisingIdentifier)  // empty UUID
    return true
}

// SAFE: request authorization, then start tracking only on .authorized
import AppTrackingTransparency
import AdSupport

func requestATT() async -> ATTrackingManager.AuthorizationStatus {
    return await ATTrackingManager.requestTrackingAuthorization()
}

Task {
    let status = await requestATT()
    if status == .authorized {
        Analytics.shared.start(idfa: ASIdentifierManager.shared().advertisingIdentifier)
    } else {
        Analytics.shared.startLimited()                // no IDFA, no cross-app linkage
    }
}
```

Also verify `Info.plist` contains `NSUserTrackingUsageDescription` — without it the prompt API throws and the request is auto-denied.

### 4. ATS Exceptions in Info.plist (MASVS-NETWORK-1)

```xml
<!-- BAD: arbitrary HTTP allowed everywhere -->
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key><true/>
</dict>

<!-- BAD: legacy local-network exception left in prod build -->
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsLocalNetworking</key><true/>
  <key>NSAllowsArbitraryLoadsInWebContent</key><true/>
</dict>

<!-- ACCEPTABLE: narrow per-domain exception, documented in Decisions Taken Under Ambiguity -->
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSExceptionDomains</key>
  <dict>
    <key>legacy-partner.example.com</key>
    <dict>
      <key>NSExceptionAllowsInsecureHTTPLoads</key><true/>
      <key>NSExceptionMinimumTLSVersion</key><string>TLSv1.2</string>
    </dict>
  </dict>
</dict>
```

Any `NSAllowsArbitraryLoads = true` in a release build is a critical finding.

### 5. Hardcoded API Keys / Secrets in Source or Plist

```swift
// BAD: API key compiled into the binary — extractable in seconds with `strings`
private let stripeKey = "sk_live_51HxxxYYYY..."
private let mapsKey   = "AIzaSyD-xxxxxxxxxxxxxxx"
```

```xml
<!-- BAD: secret in Info.plist — also extractable -->
<key>STRIPE_SECRET</key><string>sk_live_51Hxxx...</string>
```

Move to a backend-proxied endpoint; if a client key MUST exist (Maps SDK, public publishable key), restrict it server-side (bundle-id allowlist, referrer restrictions, rate limits). Coordinate with [[secrets-detector]].

### 6. Unprotected Custom URL Schemes (MASVS-PLATFORM-3)

```swift
// BAD: custom URL scheme handler trusts arbitrary input
func application(_ app: UIApplication, open url: URL, options: ...) -> Bool {
    if url.host == "reset-password" {
        let token = url.queryParameters["token"]      // any caller can pass any token
        resetPassword(with: token!)                   // also force-unwrap
        return true
    }
    return false
}

// SAFE: prefer Universal Links (associated domains) so cryptographic
//       app/domain pairing prevents impersonation; validate source if you
//       must keep a custom scheme.
func application(_ app: UIApplication, continue userActivity: NSUserActivity,
                 restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
          let url = userActivity.webpageURL,
          url.host == "app.example.com",
          let token = url.queryParameters?["token"],
          token.count == 64, token.allSatisfy(\.isHexDigit)
    else { return false }
    showResetPassword(token: token)
    return true
}
```

Universal Links cannot be claimed by another app on the device; custom schemes can. Flag any custom-scheme handler without (a) source-app validation, (b) token format validation, (c) rate limiting.

### 7. Missing Biometric Auth on Sensitive Flows

```swift
// BAD: open a payments view with no re-auth
func showPayments() { navigate(to: PaymentsView()) }

// SAFE: require biometrics; bind cached token to current biometry set
import LocalAuthentication

func showPayments() async {
    let ctx = LAContext()
    var err: NSError?
    guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) else {
        return showFallbackPasscode()
    }
    do {
        try await ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
                                     localizedReason: "Authenticate to view payments")
        navigate(to: PaymentsView())
    } catch { /* user cancelled or failed */ }
}
```

For Keychain items: set `kSecAttrAccessControl` with `.biometryCurrentSet` so re-enrolling Face ID / Touch ID invalidates the stored token (forces fresh login after biometry tampering).

### 8. Missing Sign in with Apple (App Store Guideline 4.8)

Scan the auth flow: if any of {Google Sign In, Facebook Login, Twitter, GitHub, Microsoft, Sign in with LinkedIn} is present AND it's a consumer-facing app, "Sign in with Apple" MUST be offered with comparable prominence. Missing = App Store rejection at submission.

```swift
// SAFE: AuthenticationServices Sign in with Apple button
import AuthenticationServices

ASAuthorizationAppleIDButton(type: .signIn, style: .black)
    .frame(height: 44)
    .onTapGesture { startSignInWithApple() }
```

### 9. Swift Concurrency / Data Race Findings

```swift
// BAD: shared mutable state across actors — Swift 6 strict mode compile error
class Counter {
    static var shared = Counter()    // not @MainActor, not Sendable
    var count = 0
}
Task { Counter.shared.count += 1 }   // data race
Task { Counter.shared.count += 1 }

// SAFE: actor, or @MainActor singleton
@MainActor
final class Counter {
    static let shared = Counter()
    private(set) var count = 0
    func increment() { count += 1 }
}

// SAFE: actor for non-UI shared state
actor RateLimiter {
    private var hits: [Date] = []
    func record() { hits.append(.now) }
}
```

Flag: `static var` without `@MainActor` / actor isolation; escaping closures capturing non-`Sendable` types; `@unchecked Sendable` without a justification comment.

### 10. Force Unwrap / Force Cast / Force Try

```swift
// BAD
let user = response.user!
let dict = json as! [String: Any]
let data = try! JSONEncoder().encode(payload)

// SAFE
guard let user = response.user else { return .failure(.missingUser) }
guard let dict = json as? [String: Any] else { return .failure(.malformed) }
do { let data = try JSONEncoder().encode(payload); ... } catch { ... }
```

`force_unwrapping`, `force_cast`, `force_try` are SwiftLint rules that should be `error`, not `warning`. Test code is the only exception.

### 11. Missing SwiftLint Config / Disabled in CI

A repo without `.swiftlint.yml` or with most rules opted-out gets default behavior, which is too lenient. The skill expects a checked-in config with at least:

```yaml
# .swiftlint.yml
opt_in_rules:
  - force_unwrapping
  - force_cast
  - explicit_init
  - implicit_return
  - private_outlet
  - prohibited_super_call
  - redundant_nil_coalescing
disabled_rules:
  - todo
excluded:
  - Pods
  - DerivedData
  - .build
analyzer_rules:
  - unused_declaration
  - unused_import
line_length:
  warning: 140
  error: 200
```

Run as `swiftlint lint --strict --reporter json` so warnings fail CI.

### 12. Manual Code Signing in CI

```ruby
# BAD Fastfile: relies on whatever certs happen to be on the runner
lane :beta do
  build_app(scheme: "MyApp")
  upload_to_testflight
end

# SAFE: setup_ci + match, dedicated keychain, deterministic
default_platform(:ios)
platform :ios do
  before_all do
    setup_ci(provider: "circleci")            # creates temp keychain, no login pollution
  end

  lane :beta do
    match(type: "appstore", readonly: true)   # fetches certs/profiles from git/S3
    build_app(scheme: "MyApp", export_method: "app-store")
    upload_to_testflight(skip_waiting_for_build_processing: true)
  end
end
```

Findings: `setup_ci` absent; `match` with `readonly: false` in a non-bootstrap lane; certs stored in repo plaintext; profile selection by name instead of by UUID.

## Commands

### Linting

```bash
# SwiftLint — strict so warnings fail CI
swiftlint lint --reporter json --strict

# SwiftFormat — verify formatting without rewriting
swiftformat . --lint --quiet
```

### Build

```bash
# Use the latest simulator the runner has. Avoid pinning a specific iPhone model
# (e.g. "iPhone 15") because CI images rotate; pick by OS or "generic/platform=iOS Simulator".
xcodebuild -scheme MyApp \
  -destination 'generic/platform=iOS Simulator' \
  build
```

### Tests

```bash
# Swift Testing is the modern framework as of Xcode 16+; XCTest is still supported.
# Either is fine; the skill checks for the presence of at least one and >=80% line coverage on changed files.
xcodebuild test -scheme MyApp \
  -destination 'generic/platform=iOS Simulator' \
  -resultBundlePath TestResults.xcresult \
  -enableCodeCoverage YES
```

### Static Analysis

```bash
xcodebuild analyze -scheme MyApp -destination 'generic/platform=iOS Simulator'
```

### Privacy Manifest Audit

```bash
# App target manifest
find . -name "PrivacyInfo.xcprivacy" -not -path "*/Pods/*" -not -path "*/DerivedData/*"

# Per-SDK manifests inside frameworks
find . -name "*.framework" -o -name "*.xcframework" | \
  xargs -I{} find {} -name "PrivacyInfo.xcprivacy"
```

### ATS Audit

```bash
# Pull the merged Info.plist out of the build and inspect
plutil -extract NSAppTransportSecurity xml1 -o - build/MyApp.app/Info.plist
```

## Tool Integration (2026)

| Tool | Purpose | When |
|------|---------|------|
| **SwiftLint** | Style + correctness rules (`force_unwrapping`, `force_cast`, complexity) | Pre-commit, CI |
| **SwiftFormat** | Deterministic formatting (run `--lint` in CI, autofix locally) | Pre-commit, CI |
| **SwiftGen** | Generate type-safe `R.string`, `R.image`, `R.color` from assets/strings catalogs | Build phase |
| **Tuist** | Generate `.xcodeproj` from Swift manifests, modularize large apps, deterministic project files | Once per repo |
| **Bazel rules_apple** | Hermetic builds for very large apps; replaces xcodebuild caching | Large monorepos |
| **Xcode Cloud** | Apple-hosted CI; auto-signs via App Store Connect; workflows in Xcode | New apps, small teams |
| **Fastlane** | Cross-CI scripting; `match` for code signing; `pilot` for TestFlight | CI on GitHub Actions / Bitrise / CircleCI |
| **MobSF** | OWASP MASVS static + dynamic analysis of the `.ipa` (privacy, ATS, hardcoded secrets, signed-with checks) | Pre-release |
| **Periphery** | Dead code detection across modules — pairs with SwiftLint `unused_declaration` | Scheduled |
| **xcresulttool / xcparse** | Parse `.xcresult` bundles into JSON for CI dashboards | Every build |

Aggregate findings: SwiftLint JSON + `xcresult` summary + MobSF report → single dashboard. SwiftLint and MobSF both emit machine-readable output the skill can dedupe.

## SwiftLint Rules to Enforce as `error`

- `force_unwrapping` — Avoid `!`; use optional binding or `guard let`
- `force_cast` — Avoid `as!`; use `as?` with `guard`
- `force_try` — Avoid `try!`; use `do/catch` or `try?`
- `implicit_return` — Explicit returns in non-trivial closures
- `large_tuple` — Use a struct
- `cyclomatic_complexity` — Threshold 10
- `private_outlet` — IBOutlets must be `private`
- `prohibited_super_call` — Catch missing super calls in lifecycle overrides
- `redundant_nil_coalescing` — `?? nil` smell
- `unused_declaration` (analyzer rule)
- `unused_import` (analyzer rule)

## Output Format

```markdown
## iOS Check Report

### Build
| Target      | Status | Time |
|-------------|--------|------|
| MyApp       | Pass   | 45s  |
| MyAppTests  | Pass   | 12s  |
| MyAppUITests| Pass   | 38s  |

### SwiftLint
| Severity | Count |
|----------|-------|
| Error    | 2     |
| Warning  | 15    |

**Errors:**
1. `Sources/Auth/LoginView.swift:45` — force_unwrapping
   - Code: `let user = response.user!`
   - Fix: `guard let user = response.user else { return }`
2. `Sources/API/Client.swift:78` — force_cast
   - Code: `as! [String: Any]`
   - Fix: `as? [String: Any]` with `guard`

### Privacy Manifest
- App target: PRESENT (`MyApp/PrivacyInfo.xcprivacy`)
- AnalyticsSDK.framework: MISSING — vendor non-compliant, escalate
- NSPrivacyTracking declared but NSUserTrackingUsageDescription missing in Info.plist

### ATT
- `requestTrackingAuthorization` call present in `AppDelegate.swift:62`
- Tracking domains hit BEFORE prompt: 1 (analytics.example.com via `AppDelegate.swift:24`)

### ATS
- NSAllowsArbitraryLoads = false (correct)
- 1 NSExceptionDomain: legacy-partner.example.com (TLS 1.2 minimum, documented)

### Keychain / Storage
- 2 occurrences of token-like keys written to UserDefaults:
  - `SettingsStore.swift:31` — key `auth_token`
  - `AuthCache.swift:14` — key `refresh_token`

### Tests
| Suite      | Passed | Failed | Coverage |
|------------|--------|--------|----------|
| AuthTests  | 12     | 0      | 84%      |
| APITests   | 8      | 1      | 71%      |
| UITests    | 5      | 0      | n/a      |

### Accessibility
- Missing accessibilityLabel: 3 views
- Missing accessibilityHint: 5 views

### Code Signing
- Fastlane match: enabled (`readonly: true` in beta lane)
- setup_ci: present in before_all
- Certs older than 60 days from expiry: 0
```

## Cross-language coverage notes (7-language matrix)

iOS is Swift-primary, but the skill must recognize that real apps reach in from multiple stacks. Pair this skill with the matching cross-stack skill when relevant.

| Stack | Where it crosses into iOS | Pair with |
|-------|--------------------------|-----------|
| **Swift** (primary) | All native iOS / Mac Catalyst code | This skill |
| **TypeScript** (React Native) | JS bridge, Hermes/JSI, native modules | [[mobile/react-native-bridge-checker]] |
| **C#** (.NET MAUI) | Xamarin.iOS / .NET MAUI iOS handlers, Info.plist generation | (cross-link planned) |
| **Java/Kotlin** (Kotlin Multiplatform) | KMM shared module compiled to iOS framework — same Keychain/ATT rules apply on the Swift consumer side | [[mobile/android-checker]] |
| **Python** | Skip — not a primary iOS target |
| **C / C++** | Skip for app code; flag if found embedded (often game engines / crypto libs); enforce ATS still applies to any HTTP they do |
| **SQL** | Core Data (SQLite under the hood) and direct SQLite via `sqlite3.h`. Same parameterized-query rule from [[security/sast-scanner]] §SQL Injection — `sqlite3_prepare_v2` + `sqlite3_bind_*`, never string-concat into SQL. For Core Data, use `NSPredicate` with `%@` placeholders, never `NSPredicate(format:)` with string interpolation. |

Example — Swift idiom for parameterized SQLite, mirroring the C example from [[security/sast-scanner]]:

```swift
// BAD: string interpolation into raw SQL
let sql = "SELECT * FROM users WHERE id = \(userId)"
sqlite3_exec(db, sql, nil, nil, nil)

// SAFE: prepared statement with bound parameter
var stmt: OpaquePointer?
sqlite3_prepare_v2(db, "SELECT * FROM users WHERE id = ?", -1, &stmt, nil)
sqlite3_bind_int(stmt, 1, Int32(userId))
while sqlite3_step(stmt) == SQLITE_ROW { /* ... */ }
sqlite3_finalize(stmt)

// BAD: NSPredicate with string interpolation — Core Data injection
let p = NSPredicate(format: "name == '\(input)'")

// SAFE: parameterized NSPredicate
let p = NSPredicate(format: "name == %@", input)
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule. The triage tiers below stay in the report body for prioritization; the letter's `severity` field on the wire is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|-------------|----------|--------------------------------|
| CRITICAL | Token in UserDefaults · missing privacy manifest · NSAllowsArbitraryLoads · ATT-bypassed tracking · hardcoded prod API key · force-unwrap in shipping code | BLOCK release |
| HIGH | Missing Sign in with Apple where required · custom URL scheme without source validation · biometric auth missing on payments · Swift 6 data-race compile warnings · manual code signing in CI | BLOCK merge |
| MEDIUM | SwiftLint warnings (non-error rules) · missing accessibility traits · Core Data NSPredicate string interpolation · ATS exception without documented justification | Fix soon |
| LOW | Dead code (Periphery) · undeclared `private` IBOutlets · long lines · cyclomatic complexity 10–14 | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = SwiftLint --strict / xcodebuild error; low = pattern-only
engine: swiftlint | swiftformat | xcodebuild | mobsf | manual | privacy-manifest-audit | ats-audit
kind:
  - sensitive-data-in-userdefaults
  - missing-privacy-manifest
  - incomplete-privacy-manifest
  - missing-att-prompt
  - ats-arbitrary-loads
  - hardcoded-api-key
  - unprotected-url-scheme
  - missing-biometric-auth
  - missing-sign-in-with-apple
  - data-race
  - force-unwrap
  - force-cast
  - force-try
  - missing-swiftlint-config
  - manual-code-signing
  - missing-accessibility-trait
  - core-data-predicate-injection
rule_id: <swiftlint rule id or scanner check id>
target_file: Sources/Auth/LoginView.swift
line: 45
masvs: STORAGE-1 | CRYPTO-1 | AUTH-1 | NETWORK-1 | PLATFORM-3 | CODE-4 | RESILIENCE-1
apple_policy: app-store-review-4.8 | privacy-manifest-may-2024 | att-policy   # if applicable
message: "Token written to UserDefaults; tokens belong in Keychain with kSecAttrAccessibleWhenUnlockedThisDeviceOnly"
suggested_fix: |
  Replace UserDefaults.standard.set(token, forKey: "auth_token") with a Keychain
  SecItemAdd using kSecClassGenericPassword and kSecAttrAccessibleWhenUnlockedThisDeviceOnly.
reference: https://developer.apple.com/documentation/security/keychain_services
```

The integrator uses `confidence` to weight findings — `confidence: low` single-pattern findings do not block phase advancement alone, but two engines (e.g. SwiftLint + MobSF) agreeing escalates. App-policy findings (`apple_policy: app-store-review-4.8`, `privacy-manifest-may-2024`) are always `confidence: high` — they're documented Apple requirements, not heuristic.

## Red Lines

- NEVER allow `force_unwrapping`, `force_cast`, or `force_try` in non-test code.
- NEVER allow secrets in `UserDefaults`, `Info.plist`, or compiled-in string literals.
- NEVER allow `NSAllowsArbitraryLoads = true` in a release configuration.
- NEVER ship without `PrivacyInfo.xcprivacy` in the app target and every embedded SDK.
- NEVER allow tracking network calls before `ATTrackingManager.requestTrackingAuthorization` has been answered.
- NEVER ship a consumer app that offers third-party SSO without Sign in with Apple (Guideline 4.8).
- NEVER skip `xcodebuild test` in CI.
- NEVER ship without verified accessibility traits on interactive views.
- NEVER ship with manual code signing in CI (use Xcode Cloud or `fastlane match` + `setup_ci`).

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
