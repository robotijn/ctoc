# Flutter CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Install via official installer (not package managers for latest)
flutter doctor
flutter create --org com.example --platforms=ios,android myapp
# Upgrade existing project
flutter upgrade && dart fix --apply
```

## Claude's Common Mistakes
1. **Uses deprecated Provider patterns** - Riverpod 3.x is standard, Provider maintenance-only
2. **Ignores Impeller renderer** - Enabled by default, Skia fallback removed on iOS
3. **Suggests old Gradle configuration** - Flutter 3.27+ requires Plugin DSL migration
4. **Uses `setState` for server state** - AsyncNotifier pattern required for proper loading states
5. **Misses `context.mounted` checks** - Async gaps cause disposed widget errors

## Correct Patterns (2026)
```dart
// Riverpod 3.x AsyncNotifier with code generation
@riverpod
class UserController extends _$UserController {
  @override
  FutureOr<User?> build() async {
    return await ref.watch(authRepositoryProvider).getCurrentUser();
  }

  Future<void> updateProfile(String name) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      return await ref.read(userRepositoryProvider).update(name);
    });
  }
}

// Proper async gap handling
Future<void> _loadData() async {
  final data = await repository.fetch();
  if (!mounted) return;  // CRITICAL check
  setState(() => _data = data);
}
```

## Version Gotchas
- **3.27+**: Deep links auto-handled, manual handling may conflict
- **3.27+**: SafeArea issues with Native Views on Android - needs explicit handling
- **Gradle 8.3+**: Required migration from old `build.gradle` syntax
- **With PowerVR GPUs**: Impeller issues persist on some Oppo devices

## What NOT to Do
- Do NOT use `setState()` after async without `mounted` check
- Do NOT nest Widgets beyond 3 levels - extract to separate widgets
- Do NOT ignore `dart fix` suggestions after Flutter upgrades
- Do NOT use `BuildContext` after `await` without guard
- Do NOT skip `flutter clean` when switching major versions

## Widget Rebuild Anti-Patterns (const, setState scope)
Flutter rebuilds a widget subtree whenever its `build()` runs. The two biggest
Claude-generated performance bugs are **missing `const`** and **too-wide
`setState`** — both force rebuilds of widgets that never changed.

```dart
// FOOTGUN: no const → this child is reconstructed and re-inserted on EVERY
// parent rebuild, even though it is fully static.
Padding(padding: EdgeInsets.all(8), child: Text('Static label'))

// RIGHT: const short-circuits rebuild — Flutter reuses the identical element.
const Padding(padding: EdgeInsets.all(8), child: Text('Static label'))

// FOOTGUN: setState at the top of a big screen rebuilds the WHOLE subtree for a
// change that affects one counter.
class _ScreenState extends State<Screen> {
  int _count = 0;
  void _inc() => setState(() => _count++);  // rebuilds the entire Screen
  // ...huge build() with a list, images, etc...
}

// RIGHT: push state DOWN into the smallest widget that depends on it (or use a
// ValueListenableBuilder / a scoped provider), so only the counter rebuilds.
ValueListenableBuilder<int>(
  valueListenable: _countNotifier,
  builder: (_, count, __) => Text('$count'),   // only THIS rebuilds
);
```
- **Giant `build()` methods** are the anti-pattern behind both problems: extract
  static/independent subtrees into their own `const`-constructible widgets so the
  framework can skip them. Prefer widget classes over helper methods returning
  `Widget` — a method's result cannot be `const` and always rebuilds.
- Turn on the analyzer lint `prefer_const_constructors` to catch missing `const`.

## Dart Null-Safety Traps (`late`, the `!` bang operator)
Dart is sound-null-safe, but two escape hatches let nulls back in at runtime.

```dart
// FOOTGUN: `late` defers initialization — reading it before assignment throws
// LateInitializationError at runtime (the type system cannot catch it).
late final Database _db;               // if a code path reads _db before init → crash
Future<void> open() async { _db = await Database.open(); }

// FOOTGUN: the bang operator `!` asserts non-null and THROWS if it is null —
// it silences the analyzer without proving the value is present.
final user = cache[id]!;               // NoSuchMethodError / null-check-operator
                                       // used on a null value if id absent

// RIGHT: handle the null explicitly instead of asserting it away.
final user = cache[id];
if (user == null) return;              // or ?? a default, or if-null throw with context
```
- Use `late` only when initialization is guaranteed before first read (e.g. in
  `initState`); otherwise prefer a nullable field + explicit checks.
- The `!` operator is a promise to the compiler, not a runtime guard — every `!`
  in Claude-generated code is a latent `Null check operator used on a null value`
  crash. Replace with `?.`, `??`, or an explicit branch.

## Isolates, Async Gaps, and Platform Channels
Dart is single-threaded per **isolate**; the UI runs on the **root (UI) isolate**.
CPU-heavy work on the UI isolate freezes the frame pipeline (jank / ANR).

```dart
// FOOTGUN: heavy parse on the UI isolate blocks rendering.
final data = jsonDecode(hugeString);              // stalls the frame

// RIGHT: offload to a background isolate with compute() (or Isolate.run on Dart
// 2.19+). Only sendable (primitive/serializable) data crosses isolate boundaries.
final data = await compute(jsonDecode, hugeString);

// FOOTGUN: using BuildContext after an await (an "async gap") — the widget may
// be disposed by the time the future resolves.
Future<void> load() async {
  final r = await repo.fetch();
  if (!context.mounted) return;                   // REQUIRED guard after await
  setState(() => _r = r);
}
```
- **Platform channels** (`MethodChannel`) marshal calls to native (Kotlin/Swift).
  The Dart side of a platform channel must be invoked on the **root isolate** —
  channels created on a background isolate will not reach the platform side
  (use `BackgroundIsolateBinaryMessenger` if you truly need channel access off
  the root isolate). [docs.flutter.dev platform-channels, retrieved 2026-07-09]
- Native platform-channel handlers dispatch on the platform's main thread; do not
  block them with heavy synchronous native work either.

## Testing Conventions
```dart
import 'package:flutter_test/flutter_test.dart';

testWidgets('counter increments', (tester) async {
  await tester.pumpWidget(const MyApp());
  await tester.tap(find.byIcon(Icons.add));
  await tester.pump();                    // rebuild after the tap
  expect(find.text('1'), findsOneWidget); // NOT findsWidgets — be exact
});
```
- Use `pump()` to advance one frame and `pumpAndSettle()` to run animations to
  completion — an un-pumped test asserts on the pre-tap tree and false-passes.
- Test the widget, not the framework: `find.byType`/`find.text`/`find.bySemantics`
  drive the real render tree. Mock repositories/platform channels at the boundary
  (`TestDefaultBinaryMessengerBinding`), never the widget under test.

## Performance Traps
- Missing `const` and over-wide `setState` (above) are the top two; profile with
  the **DevTools "Rebuild counts"** and the **Performance overlay** to find the
  subtree that rebuilds too often.
- `ListView(children: [...])` builds every child eagerly — use
  `ListView.builder` (lazy) for long/infinite lists.
- `Opacity`/`ClipRRect`/`saveLayer` force offscreen compositing; prefer
  `AnimatedOpacity` on a leaf or a shader where possible.
- **Impeller** is the default renderer (Skia removed on the newer engine); a
  custom shader that worked under Skia may need adjustment under Impeller.

## Version-Specific Gotchas (dated, sourced)
- **Flutter 3.44.5** is the current **stable** channel release, bundling
  **Dart 3.12.2**, released **2026-07-06**.
  [storage.googleapis.com/flutter_infra_release/releases/releases_macos.json
  (current stable), retrieved 2026-07-09]
- **Channel discipline**: `stable` gets the vetted build; `beta`/`master` ship
  faster but carry unreviewed breaking changes. Pin the SDK constraint in
  `pubspec.yaml` (`environment: sdk: '>=3.x <4.0.0'`) so CI and dev match.
- After a major upgrade run `flutter clean` + `dart fix --apply` and re-resolve
  plugins; stale build artifacts cause spurious Impeller/Gradle failures.

## Security and Dependency Gotchas
- **Pub supply chain**: `pub.dev` packages run arbitrary Dart, and a package's
  Android/iOS native code and Gradle/CocoaPods steps run at build time. Pin
  versions in `pubspec.yaml`, commit `pubspec.lock`, and audit transitive deps
  (`flutter pub deps`); an unpinned `^` range silently pulls new native code on
  the next resolve. [dart.dev/tools/pub/dependencies, retrieved 2026-07-09]
- **Secrets never in the bundle**: strings compiled into the app (or passed via
  `--dart-define`) ship inside the binary and are extractable — do not embed API
  secrets client-side. Use `flutter_secure_storage` (Keychain / Keystore) for
  on-device secret storage, never `SharedPreferences`.
- **Platform-channel input**: data crossing a `MethodChannel` from native is
  untrusted at the Dart boundary — validate it as you would any external input;
  do not `!`-assert its shape.
- **`late`/`!` are runtime-crash surfaces** (see the null-safety section) — treat
  every one as a potential availability bug, not just a style nit.
- Source: dart.dev/tools/pub, dart.dev/null-safety (retrieved 2026-07-09).

## References (retrieved 2026-07-09)
- Flutter stable releases (official): https://docs.flutter.dev/release/archive
- Flutter release channel metadata (macOS): https://storage.googleapis.com/flutter_infra_release/releases/releases_macos.json
- Sound null safety: https://dart.dev/null-safety
- Concurrency / isolates: https://dart.dev/language/concurrency
- Platform channels: https://docs.flutter.dev/platform-integration/platform-channels
- Performance best practices: https://docs.flutter.dev/perf/best-practices
