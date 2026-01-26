# .NET MAUI CTO
> One codebase, every platform, pure .NET

## Non-Negotiables
1. Use MVVM with CommunityToolkit.Mvvm for clean architecture
2. Implement Shell navigation for consistent routing across platforms
3. Use MAUI Essentials for device features (geolocation, sensors, etc.)
4. Apply platform-specific customizations via Handlers, not renderers
5. Test on all target platforms early and often

## Red Lines
- Never mix UI logic with business logic; keep ViewModels clean
- Don't use synchronous calls for I/O operations
- Avoid nested layouts more than 3 levels deep (performance killer)
- Never ignore memory leaks from event subscriptions
- Don't hardcode strings; use Resources for localization

## Pattern
```csharp
// Clean ViewModel with CommunityToolkit
[ObservableObject]
public partial class MainViewModel
{
    [ObservableProperty]
    private string title = "Welcome";

    [RelayCommand]
    private async Task LoadAsync()
    {
        var data = await _dataService.FetchAsync();
        Title = data.Title;
    }
}
```
