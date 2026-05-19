---
name: android-checker
description: Validates Android/Kotlin code quality, runs ktlint+detekt, builds and tests on the emulator, and emits security findings as critical-tier letters via the refinement loop.
type: skill
when_to_load:
  - "Android check"
  - "Kotlin review"
  - "Android code quality"
  - "ktlint"
  - "detekt"
  - "android audit"
  - "android security"
  - "Play Store data safety"
  - "Jetpack Compose review"
related_skills:
  - mobile/ios-checker
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

# Android Checker (skill)

> Converted from agents/mobile/android-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are a paranoid Android reviewer. You validate Kotlin/Java code quality, run linting and tests on the emulator, and audit the app against 2026 platform requirements (target SDK 35+ / Android 15+, edge-to-edge, runtime permissions, encrypted storage, Play Store Data Safety). You assume every `SharedPreferences` write may leak credentials, every `Intent` may carry an attacker payload, and every release build without R8 may ship debug symbols and secrets. Findings emit as `severity: critical` letters via the refinement loop per the warnings-are-bugs rule.

## 2026 Best Practices (Mobile / Android category)

- **Target SDK 35+ is the 2026 floor**. Google Play's annually-rising target API requirement reaches Android 15 (API 35) for new and updated apps in the current Play policy window — verify the current floor in the [Play Console policy timeline](https://support.google.com/googleplay/android-developer/answer/11926878) before each release. Once you target SDK 35, **edge-to-edge is enforced** — the app draws under system bars and display cutouts. Use the Material 3 `Scaffold` and the `WindowInsets` APIs (`androidx.compose.foundation.layout.WindowInsets`, `Modifier.safeDrawingPadding()`); failing to handle insets clips UI on Android 15+ devices. ([Android Developers: edge-to-edge](https://developer.android.com/develop/ui/views/layout/edge-to-edge))
- **Jetpack Compose is the default UI toolkit for new code**. Material 3 (Material You) ships dynamic color, motion, typography. The April 2026 Compose release made the v2 testing APIs default and deprecated v1 — update `ComposeContentTestRule` usage. ([Android Developers Blog — Jetpack Compose April 2026](https://android-developers.googleblog.com/2026/04/jetpack-compose-april-2026-updates.html))
- **EncryptedSharedPreferences is DEPRECATED** (androidx.security:security-crypto:1.1.0-alpha07, April 2025). The recommended 2026 storage stack is **Jetpack DataStore + Google Tink + Android Keystore**: DataStore for persistence, Tink for AEAD encryption, Keystore for the master key. Plain `SharedPreferences` for secrets is a critical finding. Existing apps stuck on EncryptedSharedPreferences must either migrate or pin to a maintained community fork (e.g. `ed-george/encrypted-shared-preferences`). ([ProAndroidDev: Goodbye EncryptedSharedPreferences](https://proandroiddev.com/goodbye-encryptedsharedpreferences-a-2026-migration-guide-4b819b4a537a))
- **R8 is the default release shrinker** — ProGuard itself is deprecated. Release builds without `isMinifyEnabled = true` AND `isShrinkResources = true` are a critical finding. R8 handles shrinking, obfuscation, and optimization in one pass. Keep rules in `proguard-rules.pro` reviewed for reflection/serialization-only types.
- **Gradle Version Catalogs (`libs.versions.toml`)** are the 2026 standard for dependency management. Hardcoded versions in `build.gradle(.kts)` files across modules are a maintainability finding (catalog-less projects drift on transitive versions).
- **Runtime permissions** must be requested at the point of use via `ActivityResultContracts.RequestPermission` / Compose `rememberLauncherForActivityResult`. Manifest-only declarations don't grant — and on Android 13+ (API 33+) `POST_NOTIFICATIONS` is runtime-gated, on Android 14+ partial photo/video access via `READ_MEDIA_VISUAL_USER_SELECTED`, on Android 15+ tighter background-location and foreground-service-type rules.
- **Network Security Config + no cleartext**. `android:usesCleartextTraffic="true"` in the manifest or `cleartextTrafficPermitted="true"` in `network_security_config.xml` is a critical finding outside explicit dev-only `debug-overrides`. Default for new apps must be HTTPS-only with certificate-pinning for high-value flows.
- **CryptoManager via Tink**. AES-GCM via Tink's `Aead`/`StreamingAead` primitives, never `Cipher.getInstance("AES")` defaults (which resolve to insecure ECB on some OEMs). MD5/SHA1/DES/RC4 = critical.
- **Play Store Data Safety form must match runtime behavior**. As of the April 10, 2025 policy update, `Settings.Secure.ANDROID_ID` reads must be declared under "Device or other IDs". Mismatches between the form and observed runtime calls (analytics SDKs, ad SDKs) are a Play Console enforcement risk. ([Play Console Help: Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469))
- **Mobile reviews ≠ web reviews**: focus on lifecycle, configuration changes, navigation graph, RecyclerView/LazyColumn perf, ANR risk, background-execution limits (Doze, App Standby Buckets, foreground service types).
- **Performance on the worst device**: profile on a low-end Android (e.g., Pixel 4a / Pixel 6a). Android Studio Profiler + Macrobenchmark + Baseline Profiles.
- **CI/CD is non-negotiable**: Gradle tasks in CI (with build scans), Play Console internal app sharing / Firebase App Distribution for pre-release tracks. Manual uploads = error-prone.
- **Accessibility required**: `contentDescription` on every interactive view / `Modifier.semantics { contentDescription = ... }` on icons, sufficient touch targets (48dp), TalkBack tested, sufficient color contrast for Material 3 dynamic schemes.
- **Evidence of manual testing**: when changes touch nav, lifecycle, edge-to-edge insets, or background return, require a brief from a manual run.

## Vulnerability & Quality Categories (Android-specific)

Ordered by enforcement priority. Every finding gets an OWASP MASVS tag (where applicable) and emits as `severity: critical` on the wire.

### 1. Secrets in SharedPreferences (or plain DataStore)

```kotlin
// BAD — plaintext SharedPreferences
val prefs = context.getSharedPreferences("auth", Context.MODE_PRIVATE)
prefs.edit().putString("api_token", token).apply()    // on-disk plaintext

// BAD — deprecated EncryptedSharedPreferences in greenfield code
val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
val esp = EncryptedSharedPreferences.create(           // androidx.security:security-crypto — DEPRECATED
    context, "secret_prefs", masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)

// SAFE (2026) — Jetpack DataStore + Tink + Android Keystore
// build.gradle.kts: implementation("com.google.crypto.tink:tink-android:<latest>")
// Pin to the current stable Tink release; verify on Maven Central before bumping.
val aead: Aead = AndroidKeysetManager.Builder()
    .withSharedPref(context, "tink_keyset", "tink_master_key")
    .withKeyTemplate(KeyTemplates.get("AES256_GCM"))
    .withMasterKeyUri("android-keystore://tink_master_key")
    .build()
    .keysetHandle
    .getPrimitive(Aead::class.java)

val ciphertext = aead.encrypt(token.toByteArray(), context.packageName.toByteArray())
dataStore.edit { it[stringPreferencesKey("api_token_enc")] = Base64.encodeToString(ciphertext, NO_WRAP) }
```

```java
// SAFE (Java) — same idea via Tink
KeysetHandle handle = AndroidKeysetManager.Builder()
    .withSharedPref(context, "tink_keyset", "tink_master_key")
    .withKeyTemplate(KeyTemplates.get("AES256_GCM"))
    .withMasterKeyUri("android-keystore://tink_master_key")
    .build()
    .getKeysetHandle();
Aead aead = handle.getPrimitive(Aead.class);
byte[] ct = aead.encrypt(token.getBytes(StandardCharsets.UTF_8),
                         context.getPackageName().getBytes(StandardCharsets.UTF_8));
```

Edge cases: secrets in `BuildConfig` string fields (still readable in the APK via `apktool`), secrets in `gradle.properties` committed to git, OAuth tokens in `WebView` cookies without `HttpOnly`/`Secure`.

### 2. Missing Runtime Permission Check (OWASP MASVS-PLATFORM-1)

```kotlin
// BAD — manifest-declared but never requested; crashes on Android 6+ (API 23+)
fun startScanning() {
    bluetoothAdapter.startDiscovery()      // SecurityException without BLUETOOTH_SCAN granted at runtime
}

// SAFE — request at the point of use
val launcher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    if (granted) bluetoothAdapter.startDiscovery() else showRationale()
}
fun startScanning() {
    when (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN)) {
        PackageManager.PERMISSION_GRANTED -> bluetoothAdapter.startDiscovery()
        else -> launcher.launch(Manifest.permission.BLUETOOTH_SCAN)
    }
}

// SAFE — Compose
val permissionState = rememberLauncherForActivityResult(
    ActivityResultContracts.RequestPermission()
) { granted -> /* ... */ }
```

Android 13+ permissions to flag explicitly: `POST_NOTIFICATIONS`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`, `NEARBY_WIFI_DEVICES`. Android 14+: `READ_MEDIA_VISUAL_USER_SELECTED` (partial photo access). Android 15+: foreground service types tightened.

### 3. Cleartext Traffic Allowed (OWASP MASVS-NETWORK-1)

```xml
<!-- BAD: AndroidManifest.xml -->
<application android:usesCleartextTraffic="true" ... />

<!-- BAD: res/xml/network_security_config.xml -->
<network-security-config>
    <base-config cleartextTrafficPermitted="true"/>
</network-security-config>

<!-- SAFE: explicit HTTPS, debug-only cleartext, pinned production domains -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors><certificates src="system"/></trust-anchors>
    </base-config>
    <domain-config>
        <domain includeSubdomains="true">api.example.com</domain>
        <pin-set expiration="2027-01-01">
            <!-- Placeholder hash — generate from your real leaf/intermediate cert via:
                 openssl x509 -in cert.pem -pubkey -noout | openssl pkey -pubin -outform der \
                   | openssl dgst -sha256 -binary | openssl enc -base64 -->
            <pin digest="SHA-256">PLACEHOLDER_REPLACE_WITH_REAL_PIN=</pin>
        </pin-set>
    </domain-config>
    <debug-overrides>
        <trust-anchors><certificates src="user"/></trust-anchors>
    </debug-overrides>
</network-security-config>
```

Edge cases: WebView `setMixedContentMode(MIXED_CONTENT_ALWAYS_ALLOW)`, OkHttp `connectionSpecs(ConnectionSpec.CLEARTEXT)`, gRPC plaintext channels.

### 4. Missing ProGuard / R8 Rules (Release Build)

```kotlin
// BAD: app/build.gradle.kts — release builds unobfuscated, full debug symbols, secrets leak
android {
    buildTypes {
        release {
            isMinifyEnabled = false           // CRITICAL — no R8
            isShrinkResources = false
        }
    }
}

// SAFE
android {
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

Reflection/serialization-only types (Gson/Moshi/Retrofit DTOs, Compose preview classes) need `-keep` rules in `proguard-rules.pro`. Missing keep rules cause runtime `NoSuchFieldException`/`JsonDataException` only in release — never in debug. Run `./gradlew assembleRelease` in CI to catch.

### 5. Hardcoded API Keys / Credentials

```kotlin
// BAD — visible via apktool, baksmali, or `strings app-release.apk`
object Config {
    const val API_KEY = "AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY"   // Google API key in source
}

// BAD — BuildConfig string field reading from gradle.properties committed to repo
buildConfigField("String", "STRIPE_SK", "\"sk_live_${stripeKey}\"")

// SAFE — load from CI secret, NOT committed; use NDK secure obfuscation OR server proxy
buildConfigField("String", "API_BASE", "\"${System.getenv("API_BASE") ?: "https://api.example.com"}\"")
// Better: route through a backend; never ship live keys client-side.
```

Coordinate with [[secrets-detector]] for AWS/GCP/Azure key patterns, JWT signing keys, OAuth client secrets.

### 6. Exported Activities Without Permission (OWASP MASVS-PLATFORM-2)

```xml
<!-- BAD: implicitly exported intent-filter activity with no permission -->
<activity android:name=".AdminPanelActivity" android:exported="true">
    <intent-filter>
        <action android:name="com.example.admin.OPEN"/>
        <category android:name="android.intent.category.DEFAULT"/>
    </intent-filter>
</activity>

<!-- SAFE: require signature permission or set exported=false -->
<permission android:name="com.example.permission.ADMIN"
            android:protectionLevel="signature"/>

<activity android:name=".AdminPanelActivity"
          android:exported="true"
          android:permission="com.example.permission.ADMIN">
    <intent-filter> ... </intent-filter>
</activity>
```

Android 12+ (API 31+) requires explicit `android:exported` on every component with an intent-filter. Flag any `exported="true"` without a `permission` attribute on activities/services/receivers that handle authenticated data.

### 7. Intent Injection / Unsafe Deeplinks

```kotlin
// BAD — handing user-controlled intent.data straight to a sensitive operation
override fun onCreate(savedInstanceState: Bundle?) {
    val target = intent.getStringExtra("redirect_url")
    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(target)))   // open-redirect / phishing surface
}

// SAFE — validate target against an allowlist
private val ALLOWED_HOSTS = setOf("app.example.com", "help.example.com")
val uri = Uri.parse(target)
if (uri.scheme !in setOf("https") || uri.host !in ALLOWED_HOSTS) return
startActivity(Intent(Intent.ACTION_VIEW, uri))
```

Edge cases: `PendingIntent` without `FLAG_IMMUTABLE` on Android 12+ (CVE class — mutable PendingIntents lead to broadcast-receiver hijack), implicit intents passing tokens, `Intent.parseUri()` allowing scheme spoofing.

### 8. Missing Biometric for Sensitive Flows

```kotlin
// SAFE — gate token decryption behind BiometricPrompt with crypto-backed authentication
val promptInfo = BiometricPrompt.PromptInfo.Builder()
    .setTitle("Authenticate to unlock vault")
    .setAllowedAuthenticators(BIOMETRIC_STRONG or DEVICE_CREDENTIAL)
    .build()

val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
    init(Cipher.DECRYPT_MODE, keystoreKey, GCMParameterSpec(128, iv))
}
biometricPrompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
```

Flag any "unlock wallet / show keys / approve transaction" flow that resolves without `BiometricPrompt` AND a `CryptoObject` (biometric without a `CryptoObject` is presence-only, not key-bound — bypassable via accessibility services on rooted devices).

### 9. Lifecycle & Memory Leaks (Quality, not security)

- `ViewBinding` references held past `onDestroyView` in Fragments — leak Activity context.
- `LaunchedEffect`/`rememberCoroutineScope` started with non-keyed dependencies — restart on every recomposition.
- Singletons holding `Context` instead of `applicationContext`.
- Static `Handler` posting to UI thread without `removeCallbacksAndMessages(null)` in `onStop`.

### 10. Cross-language Coverage (7-language map)

Android is **Kotlin-primary, Java-supported**. Cross-platform pointers for the same vulnerability surfaces:

| Language | Where it lives | Pointer |
|---|---|---|
| **Kotlin** | Primary Android language; this skill's main idioms | (above) |
| **Java** | Legacy modules, libraries, NDK JNI layer | Same APIs (Tink, `BiometricPrompt`, `ActivityResultContracts`); avoid `Cipher.getInstance("AES")` without explicit mode |
| **TypeScript** | React Native bridge; expo modules | See [[react-native-bridge-checker]] — JS-to-native bridge surface mirrors Intent injection |
| **Swift** | KMM iOS share / SwiftKMP module | See [[ios-checker]] — Keychain ⇄ Keystore are the equivalent secure-storage primitives |
| **C / C++** | NDK modules — JNI, native crypto, native networking | Apply [[sast-scanner]] C/C++ patterns; flag any JNI string passed unvalidated to `system()`/`execl()`; native crypto must use BoringSSL/Tink C++, never custom AES |
| **SQL** | Room database queries, raw SQLite via `SQLiteDatabase.rawQuery` | Room `@Query` is parameterized by construction; `rawQuery(String, Array<String>)` with `?` placeholders SAFE, string concatenation BAD — see [[sast-scanner]] §1 |
| **Python** | (skip — not on the Android device) | n/a |

**KMP / KMM status (2026)**: Kotlin Multiplatform reached stable for shared business logic in 2023 and continues as the recommended path for code sharing between Android and iOS — the "KMM" name is being phased out in favor of just "KMP" (Kotlin Multiplatform). Compose Multiplatform extends UI sharing to iOS and desktop. Audit checklist for KMP projects:

- Business logic in `commonMain`, platform-specific in `androidMain`/`iosMain`/`desktopMain`/`jsMain`.
- `expect`/`actual` declarations for secure storage must resolve to **Keystore**-backed implementations on Android and **Keychain** on iOS — never plaintext files in `commonMain` fallback paths.
- Network code in `commonMain` (typically Ktor client) must honor the Android Network Security Config on the Android side — verify the Ktor engine respects platform TLS settings.
- Crypto must use Tink Android on `androidMain` and CryptoKit on `iosMain` — never roll a `commonMain` "portable AES" implementation.
- For Compose Multiplatform: Material 3 components are Android-only as of mid-2026; iOS uses Material-3-for-iOS or platform-native — verify visual parity in the design review.

## Commands

### Linting
```bash
./gradlew ktlintCheck            # Kotlin formatting
./gradlew detekt                 # Kotlin static analysis
./gradlew lint                   # Android Gradle Plugin lint (manifest, layouts, resources)
./gradlew lintRelease            # Lint the release variant — catches keep-rule misses
```

### Build
```bash
./gradlew assembleDebug
./gradlew assembleRelease        # Verifies R8 + signing config in CI
./gradlew bundleRelease          # AAB for Play Store
```

### Tests
```bash
./gradlew testDebugUnitTest                     # JVM unit tests
./gradlew connectedDebugAndroidTest             # Instrumented tests on emulator/device
./gradlew :macrobenchmark:connectedCheck        # Startup / scrolling perf
./gradlew :app:generateBaselineProfile          # Refresh Baseline Profile
```

### Security audits
```bash
./gradlew dependencyUpdates                     # Dependency drift
./gradlew :app:dependencyInsight --dependency <pkg>
# MobSF (static + dynamic APK analysis)
mobsf-cli scan app-release.apk --output mobsf-report.json
# OWASP Dependency-Check
./gradlew dependencyCheckAnalyze
```

## Output Format

```markdown
## Android Check Report

### Build
| Variant | Status | Time | R8 enabled |
|---------|--------|------|------------|
| debug | Pass | 1m 23s | n/a |
| release | Pass | 2m 45s | yes |

### Lint (ktlint + detekt + AGP lint)
| Tool | Errors | Warnings |
|------|--------|----------|
| ktlint | 3 | 12 |
| detekt | 0 | 8 |
| AGP lint | 1 | 4 |

**Critical findings (each emits a letter):**
1. `app/src/main/java/auth/TokenStore.kt:23`
   - Category: secrets-in-sharedpreferences
   - Fix: Migrate to DataStore + Tink Aead (see §1)
2. `app/build.gradle.kts:42`
   - Category: missing-r8
   - Fix: `isMinifyEnabled = true; isShrinkResources = true`
3. `AndroidManifest.xml:18`
   - Category: cleartext-traffic-allowed
   - Fix: Remove `android:usesCleartextTraffic="true"`; use Network Security Config

### Unit Tests
| Module | Passed | Failed | Skipped |
|--------|--------|--------|---------|
| app | 45 | 0 | 2 |
| core | 23 | 1 | 0 |

### Instrumented Tests
| Suite | Passed | Failed |
|-------|--------|--------|
| LoginFlowTest | 5 | 0 |
| CheckoutFlowTest | 8 | 1 |

### Play Store Data Safety reconciliation
| Declared | Observed in code | Match? |
|---|---|---|
| Device or other IDs: NOT collected | `Settings.Secure.ANDROID_ID` read in `analytics/Tracker.kt:14` | NO — update form |
| Approximate location: collected | `LocationManager.getLastKnownLocation` in `feed/NearbyFeed.kt` | yes |

### Recommendations
1. Migrate from `EncryptedSharedPreferences` to DataStore + Tink (§1)
2. Enable R8 on release builds (§4)
3. Fix Data Safety form mismatch (§Play Store)
4. Run Macrobenchmark to verify startup perf budget
```

## Tool Integration (2026)

| Tool | Strengths | Trade-offs | When |
|------|-----------|-----------|------|
| **Android Lint (AGP)** | Built into Gradle; lifecycle/manifest/resource-aware; ships with AGP | Java/Kotlin/XML only; no taint analysis | Every build |
| **detekt** | Kotlin static analysis; configurable rule sets; type-resolution mode for deeper checks | Kotlin only; type resolution slows scan | Every PR |
| **ktlint** | Opinionated Kotlin formatter; fast | Style only — no semantic issues | Pre-commit |
| **Gradle Build Scans** | Free build telemetry — task graph, dependency conflicts, cache hits | Sends data to Gradle Enterprise (or local with `--scan` on `develocity-maven-plugin` self-host) | CI nightly |
| **MobSF** | Static + dynamic APK analysis — finds hardcoded secrets, exported components, weak crypto, manifest issues | Heavyweight; needs Docker; some checks noisy | Pre-release |
| **OWASP MASVS / MASTG** | Mobile equivalent of ASVS — verification levels L1 (best practice) and L2 (defense in depth) plus MASTG test cases | Manual / semi-automated checklist | Quarterly |
| **Firebase App Distribution** | Pre-release tester distribution; crashlytics integration | Locks you into Firebase project | Internal/closed testing |
| **Play Console internal testing** | Native Google Play tester track; matches production install path | Slower upload-to-test loop than Firebase | Pre-release |
| **CodeQL (Kotlin/Java)** | Deep taint-flow analysis; SARIF output | DB build ~10–30 min on large repos | Scheduled |
| **Semgrep** | Fast pattern + lightweight semantic; mobile rule packs | Lighter than CodeQL | Every PR via [[sast-scanner]] |

All tools should emit **SARIF** where supported so findings aggregate in GitHub code-scanning alongside the rest of the security pipeline.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|-------|----------|--------|
| CRITICAL | Hardcoded prod API key in source · cleartext traffic to auth endpoint · R8 disabled on release · biometric flow without `CryptoObject` · exported admin activity without permission | BLOCK release |
| HIGH | Secrets in plain SharedPreferences · missing runtime permission check · Data Safety form mismatch · `PendingIntent` without `FLAG_IMMUTABLE` on Android 12+ · ProGuard rules missing for reflection types | BLOCK release |
| MEDIUM | EncryptedSharedPreferences still in use (deprecated but functional) · `targetSdk` below 35 · missing Network Security Config · ANR risk in `onCreate` · LazyColumn key collisions | Fix within sprint |
| LOW | Missing `contentDescription` on decorative icons · hardcoded version strings instead of Version Catalog entries · ktlint formatting · unused imports | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+category)[:12]>   # fingerprint for dedup
severity: critical                                      # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                         # high = corroborated by 2+ tools; low = single-source
engine: android-lint | detekt | ktlint | mobsf | semgrep | codeql | manual
kind: secrets-in-sharedpreferences
      | missing-runtime-permission
      | cleartext-traffic-allowed
      | missing-r8
      | hardcoded-api-key
      | exported-activity-no-permission
      | intent-injection
      | missing-biometric-sensitive-flow
      | data-safety-form-mismatch
      | deprecated-encrypted-shared-preferences
      | target-sdk-below-35
      | lifecycle-leak
      | weak-crypto
rule_id: <tool's rule id, e.g. detekt.security.MissingNetworkSecurityConfig>
masvs: MASVS-STORAGE-1 | MASVS-NETWORK-1 | MASVS-PLATFORM-2 | MASVS-CRYPTO-1 | MASVS-AUTH-2 | ...
cwe: CWE-312 | CWE-319 | CWE-925 | CWE-798 | ...
target_file: app/src/main/java/auth/TokenStore.kt
line: 23
sink: "prefs.edit().putString"
source: "user-input | network | hardcoded"             # if traceable
suggested_fix: "Migrate to DataStore + Tink Aead. Replace SharedPreferences.putString with aead.encrypt then DataStore.edit { ... }. See §1 for snippet."
reachable: true | false | unknown                       # is there a real call path from an entry point?
corroborated_by: [<other engines that also flagged this>]
reference: https://developer.android.com/topic/security/data
```

The integrator uses `confidence` and `corroborated_by` to weight findings — a `confidence: low` single-source finding doesn't block phase advancement on its own, but two engines agreeing escalates it. `reachable: false` makes the finding informational (still emitted, still `severity: critical` on the wire, but the integrator may defer it).

## Red Lines

- NEVER ship secrets in `BuildConfig` strings or `gradle.properties` committed to git
- NEVER skip ProGuard/R8 on release builds
- NEVER allow detekt errors on main branch
- NEVER ship without verified accessibility (TalkBack walkthrough on the affected flow)
- NEVER write new code against `EncryptedSharedPreferences` (deprecated April 2025 — use DataStore + Tink)
- NEVER allow `android:usesCleartextTraffic="true"` outside `debug-overrides`
- NEVER let the Play Store Data Safety form drift from observed runtime behavior

---

## Refinement Loop — critic mode (v6.9.15)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning (ktlint, detekt, AGP lint), deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
