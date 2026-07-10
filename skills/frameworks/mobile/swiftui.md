# SwiftUI CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Requires Xcode 16+ for iOS 18 SDK
xcodebuild -version  # Verify 16.x
# Create new project via Xcode or Swift Package Manager
swift package init --type executable --name MyApp
```

## Claude's Common Mistakes
1. **Uses ObservableObject when @Observable available** - iOS 17+ uses Observation framework
2. **Ignores Swift 6 strict concurrency** - MainActor isolation required for UI updates
3. **Suggests @StateObject for all view models** - @State with @Observable is simpler pattern
4. **Missing custom container view APIs** - iOS 18 subviewOf ForEach pattern ignored
5. **Uses deprecated NavigationView** - NavigationStack required since iOS 16

## Correct Patterns (2026)
```swift
// iOS 17+ @Observable pattern with Swift 6 concurrency
@Observable
@MainActor
final class ProfileViewModel {
    var user: User?
    var isLoading = false

    private let repository: UserRepository

    init(repository: UserRepository = .shared) {
        self.repository = repository
    }

    func loadUser(id: String) async {
        isLoading = true
        defer { isLoading = false }
        user = try? await repository.fetchUser(id: id)
    }
}

struct ProfileView: View {
    @State private var viewModel = ProfileViewModel()
    let userId: String

    var body: some View {
        Group {
            if viewModel.isLoading {
                ProgressView()
            } else if let user = viewModel.user {
                Text(user.name)
            }
        }
        .task { await viewModel.loadUser(id: userId) }
    }
}
```

## Version Gotchas
- **iOS 17+**: @Observable replaces ObservableObject, simpler but different semantics
- **iOS 18**: Custom container views with subviewOf API, enhanced accessibility
- **Swift 6**: Strict concurrency checking, @MainActor required for UI mutations
- **With SwiftData**: Replaces Core Data for new projects, different migration path

## What NOT to Do
- Do NOT use @ObservedObject when @State + @Observable works
- Do NOT mutate state in view body - use `.task` or `.onAppear`
- Do NOT skip `@MainActor` on ViewModels - causes background thread UI updates
- Do NOT use NavigationView - deprecated, use NavigationStack
- Do NOT force unwrap in view body - causes full view crash

## State Footguns (@State · @StateObject · @ObservedObject · @Observable · identity)
The single largest class of Claude-generated SwiftUI bugs is picking the wrong
property wrapper, which silently either **recreates** the model on every parent
re-render or **fails to observe** it. The rules are ownership-based, not taste.

```swift
struct ParentView: View {
    // FOOTGUN: @ObservedObject does NOT own the object. When ParentView's body
    // re-runs (any parent state change), `Model()` is constructed AGAIN and the
    // previous instance — with all its in-flight work and state — is thrown away.
    @ObservedObject var model = Model()          // WRONG: re-created each render

    // RIGHT: @StateObject owns the object; SwiftUI constructs it ONCE for the
    // lifetime of the view identity and keeps it across re-renders.
    @StateObject private var owned = Model()      // ObservableObject (pre-iOS 17)
    var body: some View { ChildView(model: owned) }
}

struct ChildView: View {
    // @ObservedObject is CORRECT here: the child does NOT own the model, it is
    // handed one the parent already owns. Never @StateObject a passed-in model.
    @ObservedObject var model: Model
    var body: some View { Text(model.title) }
}
```
- **`@State` vs `@StateObject`**: `@State` is for value types / the new
  `@Observable` reference types; `@StateObject` is for `ObservableObject`
  reference types (iOS 13–16 era). Do not mix them.
- **`@Observable` (iOS 17+, Observation framework)** replaces
  `ObservableObject`/`@Published`: annotate the class `@Observable` and store it
  in a plain `@State`. Only the properties a view actually *reads* trigger that
  view's update — far finer-grained than `ObservableObject`, which invalidates
  every observer on any `@Published` change.
  [developer.apple.com/documentation/observation, retrieved 2026-07-10]
- **View identity + `.id()`**: SwiftUI diffs views by structural identity. Giving
  a view a new `.id(value)` **tears down and rebuilds** it (losing `@State` and
  `@StateObject`); reusing the same id preserves state. A footgun is putting an
  unstable value (e.g. `UUID()` in the body) into `.id()` — it rebuilds every
  frame, resetting scroll position and animations.
- **`@EnvironmentObject` crashes** with "No ObservableObject of type … found" if
  an ancestor did not `.environmentObject(...)` it — it is a runtime trap, not a
  compile error. Prefer the iOS 17 `@Environment(Model.self)` + `.environment()`.
- **`.task` cancellation**: `.task { }` is auto-cancelled when the view
  disappears or its `id` changes; a raw `Task { }` you spawn in `.onAppear` is
  NOT — it leaks and can mutate a gone view. Use `.task(id:)` to restart on input.

## Performance (body recomputation · @MainActor · lazy stacks)
- SwiftUI re-runs `body` whenever an observed dependency changes; keep `body`
  cheap and pure. Expensive derivations belong in the model (computed once), not
  recomputed inside `body` each pass.
- **`LazyVStack`/`LazyHStack`** (inside a `ScrollView`) build rows on demand; a
  plain `VStack` builds **all** children eagerly — a 10k-row `VStack` allocates
  10k views up front. Use `List` or a lazy stack for long content.
- **`@MainActor`** all view models that mutate UI-bound state. Under Swift 6
  strict concurrency, mutating `@Observable` state off the main actor is a
  data-race the compiler now diagnoses; do async work with `await`, then hop back.
  [developer.apple.com/documentation/swift/adopting-strict-concurrency, retrieved 2026-07-10]

## Security (Keychain, not UserDefaults — CWE-312)
```swift
// FOOTGUN: tokens/passwords in UserDefaults are stored as an UNENCRYPTED plist
// inside the app container — readable from a file-system backup or a jailbroken
// device. This is CWE-312 "Cleartext Storage of Sensitive Information".
UserDefaults.standard.set(authToken, forKey: "token")   // WRONG

// RIGHT: the Keychain encrypts at rest and is protected by the Secure Enclave /
// device passcode. Gate accessibility so it is unreadable when locked.
import Security
let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrAccount as String: "authToken",
    kSecValueData as String: Data(authToken.utf8),
    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
]
SecItemAdd(query as CFDictionary, nil)
```
- **Secrets belong in the Keychain**, never `UserDefaults`, a plist, or a source
  constant. (cwe.mitre.org/data/definitions/312.html — Cleartext Storage of
  Sensitive Information, retrieved 2026-07-10.)
- **App Transport Security (ATS)** is on by default and blocks plain `http://`.
  Do NOT add a blanket `NSAllowsArbitraryLoads` exception to silence a mixed
  request — scope any exception to a single domain, or fix the endpoint to TLS.

## Testing (Swift Testing + @MainActor isolation)
```swift
import Testing
@testable import MyApp

// Swift Testing (Xcode 16+): @Test macro, #expect, and async support. Isolate
// UI-facing model tests on the main actor so state mutation matches production.
@MainActor
@Test func loadsUser() async {
    let vm = ProfileViewModel(repository: .stub)
    await vm.loadUser(id: "42")
    #expect(vm.user?.id == "42")
    #expect(vm.isLoading == false)
}
```
- Test the **model**, not the view hierarchy: SwiftUI views are structs with no
  addressable output to assert on in a unit test. Drive the `@Observable`/
  `ObservableObject` model directly and assert its published state.
- Inject dependencies (repositories, clients) so a test never hits the network;
  the stub is the seam, never a mock of the view under test.

## Version-Specific Gotchas (dated, sourced)
- **Swift 6.3.3** is the current release; Swift 6 language mode enables **strict
  concurrency** — cross-actor mutation of UI state is a compile-time diagnostic.
  [github.com/swiftlang/swift-org-website `_data/builds/swift_releases.yml`
  (tag swift-6.3.3-RELEASE), retrieved 2026-07-10]
- **iOS 17+**: `@Observable` (Observation framework) supersedes
  `ObservableObject`/`@Published`; store it in `@State`, not `@StateObject`.
- **iOS 16+**: `NavigationStack`/`NavigationSplitView` replace the deprecated
  `NavigationView`.
- **SwiftData** (iOS 17+) replaces Core Data for new projects; `@Model` classes
  are observed like `@Observable` and have a distinct migration path.

## References (retrieved 2026-07-10)
- Observation framework (@Observable): https://developer.apple.com/documentation/observation
- Managing model data / state and data flow: https://developer.apple.com/documentation/swiftui/managing-model-data-in-your-app
- Adopting strict concurrency (Swift 6): https://developer.apple.com/documentation/swift/adopting-strict-concurrency
- Keychain Services: https://developer.apple.com/documentation/security/keychain_services
- App Transport Security: https://developer.apple.com/documentation/bundleresources/information_property_list/nsapptransportsecurity
- Swift releases data: https://github.com/swiftlang/swift-org-website/blob/main/_data/builds/swift_releases.yml
- CWE-312 (Cleartext Storage of Sensitive Information): https://cwe.mitre.org/data/definitions/312.html
