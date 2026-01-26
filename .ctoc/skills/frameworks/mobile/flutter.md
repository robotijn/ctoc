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
