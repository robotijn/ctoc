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
