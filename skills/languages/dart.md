# Dart CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses `dynamic` as escape hatch — use proper types
- Claude forgets Flutter 3.38 null safety is mandatory
- Claude uses `dart:html` for web — use `package:web` (Wasm compatible)
- Claude creates heavy widgets — split into smaller composable widgets

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `dart 3.10+` | Records, patterns, MCP | Older Dart |
| `flutter 3.38+` | Hot reload on web stable | Older Flutter |
| `dart analyze --fatal-infos` | Strict analysis | Loose analysis |
| `very_good_cli` | Project scaffolding | Manual setup |
| `dcm` | Code quality metrics | No metrics |

## Patterns Claude Should Use
```dart
// Dart 3.x records and patterns
final (name, age) = getUserData();

// Pattern matching in switch
String describe(Object obj) => switch (obj) {
  int n when n < 0 => 'negative',
  int n => 'positive: $n',
  String s => 'string: $s',
  _ => 'unknown',
};

// Wasm-compatible web code
import 'package:web/web.dart'; // NOT dart:html

// Reduce widget rebuilds
const MyWidget(); // Use const constructors

// Heavy work on isolates
final result = await compute(expensiveFunction, data);
```

## Anti-Patterns Claude Generates
- `dynamic` everywhere — use proper types
- `dart:html` for web — breaks Wasm, use `package:web`
- Heavy `build()` methods — extract smaller widgets
- Missing `const` constructors — causes unnecessary rebuilds
- `late` abuse — prefer nullable with null checks

## Version Gotchas
- **Dart 3.10/Flutter 3.38**: MCP server for AI assistants
- **Dart 3.9**: Build hooks stable for native code
- **Wasm**: 2-3x faster but needs `package:web` instead of `dart:html`
- **Hot reload**: Now stable on web (no experimental flag)
- **With Flutter**: Use `lower_case_with_underscores` for directories

## Concurrency / Isolates Footguns
Dart is **single-threaded per isolate**: one event loop, cooperative
`async`/`await`. `await` does **not** parallelize CPU work — it only yields the
loop so *other* microtasks run. A tight synchronous loop between `await`s still
blocks the whole isolate (and, on Flutter, freezes the UI). For real parallelism
you spawn another **isolate**, and isolates **do not share mutable memory** —
they communicate only by message passing.

```dart
// FOOTGUN: heavy CPU work on the current isolate blocks the event loop / UI.
final result = parseHugeJson(bytes);          // janks the frame

// SAFE: run it on a fresh isolate (Dart 2.19+); args/return are copied, not shared.
final result = await Isolate.run(() => parseHugeJson(bytes));
```

- **Unhandled async errors.** A `Future` that rejects with no `.catchError`/`try`
  becomes an unhandled error on its `Zone`; a `Stream` needs `onError` or the
  error propagates to the zone handler. Handle at the boundary, not by ignoring.

## Error Handling Idioms
```dart
try {
  await risky();
} on FormatException catch (e) {   // 'on' narrows to a specific type
  handle(e);
} catch (e, st) {                  // catch-all with stack trace
  report(e, st);
} finally {
  cleanup();
}

// FOOTGUN: an un-awaited future swallows its error silently.
doAsyncThing();               // WRONG: error is lost, lint: unawaited_futures
unawaited(doAsyncThing());    // explicit fire-and-forget (still zone-reported)
await doAsyncThing();         // or await it and handle failures
```

- Enable `unawaited_futures` in `analysis_options.yaml`; use `unawaited()` from
  `dart:async` when a fire-and-forget is truly intended, and `Zone` error
  handlers (`runZonedGuarded`) for a last-resort top-level catch.

## Security and Dependency Gotchas
- **Sound null safety** is the language default (Dart 2.12+). The bang operator
  `x!` asserts non-null and **throws at runtime** on `null` — the same crash class
  the type system was meant to remove. Prefer `?.`/`??`/`if (x != null)`.
- **`late` misuse.** A `late` field read before assignment throws
  `LateInitializationError` at runtime — you traded a compile-time nullable check
  for a runtime crash. Use `late` only when initialization is guaranteed before
  first read; otherwise make it nullable and check.
- **Untrusted JSON shape.** `jsonDecode` returns `dynamic`; blindly casting
  (`data['user']['id'] as int`) throws on any unexpected shape. Validate keys and
  types (or use a codegen model) before trusting decoded input.
- **Supply chain.** Commit `pubspec.lock` to pin transitive versions; review
  advisories via `dart pub outdated`/security tooling before bumping.

## Testing Conventions
```dart
import 'package:test/test.dart';   // package:test — test / group / expect

void main() {
  group('parser', () {
    test('parses positive', () => expect(parse('2'), 4));
    test('throws on empty', () => expect(() => parse(''), throwsFormatException));
  });
}
```

- `package:test` for pure Dart; `flutter_test` + `testWidgets`/`WidgetTester` for
  widget tests; `mockito` (codegen) or `mocktail` (no codegen) for fakes. Gather
  coverage with `dart test --coverage` / `flutter test --coverage`.

## Performance Traps
- **Rebuilding whole subtrees.** A `setState` high in the tree re-runs every
  descendant `build()`. Use **`const` constructors** wherever a widget is
  immutable (they skip rebuild + are canonicalized), and push `setState` down to
  the smallest widget that owns the state.
- **Synchronous work on the UI isolate** janks frames — offload with
  `Isolate.run`/`compute`.
- **`List` growth** reallocates as it grows; presize (`List.filled`/`..length`)
  on hot paths. **Unbounded streams** without back-pressure leak memory — cancel
  subscriptions in `dispose()`.

## Version-Specific Gotchas (dated, sourced)
- **Dart 3.12.2** is the current stable SDK (released 2026-06-09); Dart 3
  introduced **records**, **patterns**, **sealed classes**, and **class
  modifiers** (`final`/`base`/`interface`/`sealed`) — exhaustive `switch` over a
  sealed hierarchy is now compiler-checked.
  [storage.googleapis.com/dart-archive stable VERSION, retrieved 2026-07-10]
- **Flutter 3.44.6** (stable, released 2026-07-09) ships that Dart SDK; the Dart
  and Flutter versions are coupled, so pin the Flutter channel and let it drive
  the Dart version rather than bumping them independently.
  [Flutter stable releases JSON, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Dart concurrency / isolates: https://dart.dev/language/concurrency
- Isolate.run API: https://api.dart.dev/stable/dart-isolate/Isolate/run.html
- Sound null safety: https://dart.dev/null-safety
- Async error handling / futures: https://dart.dev/libraries/async/futures-error-handling
- Dart SDK stable version: https://storage.googleapis.com/dart-archive/channels/stable/release/latest/VERSION
- Testing: https://dart.dev/tools/testing
