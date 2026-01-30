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
