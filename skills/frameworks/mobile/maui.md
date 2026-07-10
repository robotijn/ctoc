# .NET MAUI CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Install workload
dotnet workload install maui
# Create project
dotnet new maui -n MyApp
# Verify installation
dotnet workload list
# Upgrade to .NET 9
dotnet new global.json --sdk-version 9.0.306 --roll-forward latestPatch
```

## Claude's Common Mistakes
1. **Uses .NET 8 patterns for .NET 9** - Workload sets changed, version pinning required
2. **Ignores CommunityToolkit.Mvvm** - Source generators are the standard pattern
3. **Uses Xamarin.Essentials namespace** - Replaced by Microsoft.Maui.Essentials
4. **Skips Xcode 16 requirement** - iOS builds fail without macOS 14.5+
5. **Missing workload repair** - Broken installs cause cryptic errors

## Correct Patterns (2026)
```csharp
// CommunityToolkit.Mvvm with source generators (.NET 9)
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

public partial class ProfileViewModel : ObservableObject
{
    private readonly IUserService _userService;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SaveCommand))]
    private string _name = string.Empty;

    [ObservableProperty]
    private bool _isLoading;

    public ProfileViewModel(IUserService userService)
    {
        _userService = userService;
    }

    [RelayCommand]
    private async Task LoadAsync(string userId, CancellationToken token)
    {
        IsLoading = true;
        try {
            var user = await _userService.GetUserAsync(userId, token);
            Name = user.Name;
        } finally {
            IsLoading = false;
        }
    }

    [RelayCommand(CanExecute = nameof(CanSave))]
    private async Task SaveAsync() => await _userService.UpdateNameAsync(Name);

    private bool CanSave() => !string.IsNullOrWhiteSpace(Name);
}
```

## Version Gotchas
- **.NET 9**: Workload sets require `global.json` for version pinning
- **.NET 9**: Xcode 16 required for iOS, macOS 14.5 minimum
- **.NET 9**: iOS 12.2 and Mac Catalyst 15.0 minimum deployment
- **Windows 11 Oct 2025 Update**: Breaks .NET 8 MAUI projects

## What NOT to Do
- Do NOT mix .NET versions without `global.json` pinning
- Do NOT nest layouts beyond 3 levels - severe performance impact
- Do NOT use event handlers without unsubscribing - memory leaks
- Do NOT skip `dotnet workload repair` when builds fail mysteriously
- Do NOT use Xamarin.Forms NuGet packages - incompatible

## Lifecycle & Handler Footguns
.NET MAUI replaced Xamarin.Forms **renderers** with **handlers** + property
**mappers**: a handler bridges the cross-platform virtual view to the native
control, and a `Mapper` is how you customize a native property. Reaching for the
old renderer model is the single most common Claude mistake here.
[learn.microsoft.com/dotnet/maui/user-interface/handlers/, retrieved 2026-07-10]

```csharp
// FOOTGUN: a custom renderer (Xamarin.Forms model) — there is no
// ExportRenderer / IVisualElementRenderer pipeline in MAUI. It silently
// does nothing; the control renders with the default handler.
// [assembly: ExportRenderer(typeof(Entry), typeof(MyEntryRenderer))]  // WRONG

// RIGHT: customize the native control via the handler's property mapper.
// Register ONCE at startup (MauiProgram) — appending in a hot path re-applies
// the mapper on every handler creation and leaks the customization.
Microsoft.Maui.Handlers.EntryHandler.Mapper.AppendToMapping(
    "NoUnderline", (handler, view) =>
{
#if ANDROID
    handler.PlatformView.BackgroundTintList =
        Android.Content.Res.ColorStateList.ValueOf(Colors.Transparent.ToPlatform());
#endif
});
```

- **UI updates must run on the UI thread.** Mutating a bound property from a
  background task throws or corrupts the view. Marshal with
  `MainThread.BeginInvokeOnMainThread(() => Label.Text = value)` (or
  `MainThread.InvokeOnMainThreadAsync`). Do not assume a `Task.Run` continuation
  is on the UI thread. [learn.microsoft.com/dotnet/maui/platform-integration/appmodel/main-thread, retrieved 2026-07-10]
- **DI lifetime mismatch.** MAUI uses `Microsoft.Extensions.DependencyInjection`.
  Registering a page/ViewModel as `AddSingleton` when it holds per-navigation
  state leaks that state across navigations; use `AddTransient` for pages and
  ViewModels, `AddSingleton` only for stateless services. A `Scoped` service has
  no navigation scope in MAUI and behaves like a singleton — a real footgun.
- **`Shell` navigation is route-based**, not a page stack you push arbitrary
  objects onto. Pass data with query properties (`[QueryProperty]`) /
  `GoToAsync("route?id=1")`, not by mutating a shared object — deep links break
  otherwise.
- **Platform-specific code** goes behind `#if ANDROID / IOS / MACCATALYST /
  WINDOWS` or in `Platforms/<os>/` partials — not runtime `RuntimeInformation`
  branches that ship dead native calls to every platform.

## Error Handling
```csharp
// FOOTGUN: unsubscribed events on a long-lived publisher keep the page alive —
// the classic MAUI memory leak (page navigated away but never collected).
// messagingService.Updated += OnUpdated;   // never removed → leak

// RIGHT: unsubscribe in OnDisappearing / Dispose, and guard cross-thread UI.
protected override void OnDisappearing()
{
    base.OnDisappearing();
    _messagingService.Updated -= OnUpdated;
}

private void OnUpdated(object? sender, DataEventArgs e)
{
    // Handler may fire on a background thread — marshal before touching the UI.
    MainThread.BeginInvokeOnMainThread(() => StatusLabel.Text = e.Message);
}
```
- Wrap platform-integration calls (`Geolocation`, `MediaPicker`, `SecureStorage`)
  in try/catch for `FeatureNotSupportedException` / `PermissionException`; do not
  assume a capability exists on every device/OS version.
- Async `RelayCommand`s should carry a `CancellationToken` and swallow no
  exceptions silently — an unobserved faulted `Task` in a command is invisible.

## Security
```csharp
// FOOTGUN: tokens/secrets in Preferences (plain key-value, NOT encrypted) —
// readable from the app sandbox / a rooted device. This is CWE-312
// (Cleartext Storage of Sensitive Information).
Preferences.Set("auth_token", token);        // WRONG for secrets

// RIGHT: SecureStorage → Android Keystore-backed / iOS Keychain.
await SecureStorage.Default.SetAsync("auth_token", token);
var token2 = await SecureStorage.Default.GetAsync("auth_token");
```
- **`SecureStorage`** is backed by the iOS Keychain and Android Keystore/EncryptedSharedPreferences —
  use it for tokens/keys; `Preferences` is plaintext and is **CWE-312** if used
  for secrets. [learn.microsoft.com/dotnet/maui/platform-integration/storage/secure-storage, retrieved 2026-07-10]
- Enforce TLS: certificate/public-key pinning via `HttpClientHandler` +
  `ServerCertificateCustomValidationCallback`, and never disable validation
  (`return true`) even in "debug only" code that can ship.
- Do not log `SecureStorage` values or tokens; scrub them from crash reports.

## Testing
```csharp
// ViewModels are plain C# — unit-test them WITHOUT the MAUI runtime. Do NOT
// try to instantiate handlers/pages in a unit test; that needs a device/emulator.
[Fact]
public async Task LoadAsync_sets_name_from_service()
{
    var svc = new FakeUserService(new User { Name = "Ada" });
    var vm = new ProfileViewModel(svc);
    await vm.LoadCommand.ExecuteAsync("42");
    Assert.Equal("Ada", vm.Name);
}
```
- Test ViewModels + services with xUnit/NUnit off-device; use
  `Microsoft.Maui.TestUtils` / Appium for real UI + handler behavior on an
  emulator. A green ViewModel test does not prove the native binding renders.

## Performance
- **Startup**: enable AOT / full trimming for release (`<PublishTrimmed>`,
  `<RunAOTCompilation>` on iOS) and keep the `MauiProgram` DI graph shallow;
  eager singletons run at launch.
- **Collections**: bind `CollectionView` to `ObservableCollection` and rely on
  its virtualization; never build a `VerticalStackLayout` of hundreds of items
  (no recycling). Do not nest scrolling containers — it disables virtualization.
- **Layout depth**: keep the visual tree shallow (the old "don't nest beyond ~3
  levels" rule still holds); `Grid` beats deeply nested `StackLayout`s.

## Version-Specific Gotchas (dated, sourced)
- **.NET MAUI 10.0.80** (the .NET 10 wave) is the current stable
  `Microsoft.Maui.Controls` release on NuGet, published **2026-06-24**.
  MAUI's major version tracks the .NET major (`10.x` ⇒ .NET 10).
  [nuget.org/packages/Microsoft.Maui.Controls, retrieved 2026-07-10]
- **Handlers, not renderers** — the renderer pipeline was removed; customize via
  `Handler.Mapper`. [learn.microsoft.com/dotnet/maui/user-interface/handlers/, retrieved 2026-07-10]
- **`global.json` pinning**: workload sets changed across .NET 8→9→10; pin the
  SDK to avoid a machine building against a different band than CI.
- **`Microsoft.Maui.Essentials`** replaced `Xamarin.Essentials`; the old
  namespace does not resolve.

## References (retrieved 2026-07-10)
- MAUI handlers & mappers: https://learn.microsoft.com/dotnet/maui/user-interface/handlers/
- MainThread (UI-thread marshalling): https://learn.microsoft.com/dotnet/maui/platform-integration/appmodel/main-thread
- SecureStorage: https://learn.microsoft.com/dotnet/maui/platform-integration/storage/secure-storage
- Microsoft.Maui.Controls on NuGet (10.0.80, 2026-06-24): https://www.nuget.org/packages/Microsoft.Maui.Controls
- CWE-312 (Cleartext Storage of Sensitive Information): https://cwe.mitre.org/data/definitions/312.html
