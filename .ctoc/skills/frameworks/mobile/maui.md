# .NET MAUI CTO
> Cross-platform .NET mobile leader demanding clean MVVM architecture with modern .NET 8+ patterns.

## Commands
```bash
# Setup | Dev | Test
dotnet new maui -n MyApp
dotnet build -f net8.0-ios && dotnet build -f net8.0-android
dotnet test MyApp.Tests && dotnet build -t:Run -f net8.0-ios
```

## Non-Negotiables
1. CommunityToolkit.Mvvm with source generators for ViewModels
2. Shell navigation with typed routes and query parameters
3. MAUI Essentials for device APIs (geolocation, sensors, preferences)
4. Handlers over custom renderers for platform customization
5. Testing on all target platforms early and often

## Red Lines
- UI logic mixed with business logic - ViewModels must be testable
- Synchronous I/O calls - always use async/await
- Nested layouts beyond 3 levels - performance killer on mobile
- Memory leaks from event subscriptions without cleanup
- Hardcoded strings - use Resources for localization

## Pattern: Observable ViewModel with Toolkit
```csharp
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
    private async Task LoadAsync(string userId)
    {
        IsLoading = true;
        var user = await _userService.GetUserAsync(userId);
        Name = user.Name;
        IsLoading = false;
    }

    [RelayCommand(CanExecute = nameof(CanSave))]
    private async Task SaveAsync()
    {
        await _userService.UpdateNameAsync(Name);
    }

    private bool CanSave() => !string.IsNullOrWhiteSpace(Name);
}
```

## Integrates With
- **DB**: SQLite with Microsoft.Data.Sqlite, EF Core for complex models
- **Auth**: MSAL for Azure AD, WebAuthenticator for OAuth
- **Cache**: Preferences for KV, FileSystem for larger data

## Common Errors
| Error | Fix |
|-------|-----|
| `XFC0000: Cannot resolve type` | Clean solution and rebuild, check XAML namespaces |
| `Java.Lang.RuntimeException: Canvas` | Reduce layout complexity or enable hardware acceleration |
| `Unable to find application` | Verify bundle ID matches provisioning profile |

## Prod Ready
- [ ] AOT compilation enabled for iOS
- [ ] Trimming configured with proper preserve attributes
- [ ] App Center or Sentry configured for crash reporting
- [ ] CI/CD pipeline with platform-specific build agents
