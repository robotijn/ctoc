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
