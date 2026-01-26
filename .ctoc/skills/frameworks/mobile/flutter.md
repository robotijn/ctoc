# Flutter CTO
> Cross-platform UI engineering leader demanding widget composition excellence and Dart-first architecture.

## Commands
```bash
# Setup | Dev | Test
flutter create --org com.example --platforms=ios,android myapp
flutter run --flavor dev --dart-define=ENV=dev
flutter test --coverage && flutter drive --driver=test_driver/integration_test.dart
```

## Non-Negotiables
1. Riverpod 2.x for state management with code generation
2. go_router for declarative, type-safe navigation
3. Widget composition over inheritance - max 100 lines per widget
4. Null safety enforced, no dynamic types in business logic
5. Platform-specific code isolated via MethodChannel abstractions
6. Golden tests for critical UI components

## Red Lines
- setState() outside local ephemeral state
- Deep widget nesting beyond 3 levels - extract composables
- Blocking UI thread with synchronous I/O
- BuildContext used after async gaps without mounted check
- Direct platform channel calls scattered through codebase

## Pattern: Riverpod AsyncNotifier
```dart
@riverpod
class UserController extends _$UserController {
  @override
  FutureOr<User?> build() async {
    return await ref.watch(authRepositoryProvider).getCurrentUser();
  }

  Future<void> updateProfile(String name) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final user = await ref.read(userRepositoryProvider).update(name);
      return user;
    });
  }
}

// Usage in widget
class ProfilePage extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(userControllerProvider);
    return userAsync.when(
      data: (user) => Text(user?.name ?? 'Guest'),
      loading: () => const CircularProgressIndicator(),
      error: (e, st) => Text('Error: $e'),
    );
  }
}
```

## Integrates With
- **DB**: Drift (SQLite) for structured data, Hive for fast KV storage
- **Auth**: Firebase Auth or Supabase with flutter_secure_storage
- **Cache**: Riverpod's built-in caching with keepAlive and refresh

## Common Errors
| Error | Fix |
|-------|-----|
| `setState() called after dispose()` | Check `mounted` before setState or use Riverpod |
| `RenderFlex overflowed` | Wrap with SingleChildScrollView or use Expanded/Flexible |
| `MissingPluginException` | Run `flutter clean && flutter pub get` then rebuild |

## Prod Ready
- [ ] Obfuscation enabled: `--obfuscate --split-debug-info`
- [ ] Crashlytics/Sentry configured with dSYM upload
- [ ] App icons and splash screens for all densities
- [ ] Flavor configs for dev/staging/prod with separate bundle IDs
