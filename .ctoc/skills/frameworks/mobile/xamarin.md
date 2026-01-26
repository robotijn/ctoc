# Xamarin CTO
> Legacy .NET mobile leader - migrate to MAUI for new projects, maintain Xamarin with upgrade path.

## Commands
```bash
# Setup | Dev | Test
dotnet new xamarinforms -n MyApp
msbuild /t:Build /p:Configuration=Debug MyApp.sln
dotnet test MyApp.Tests/MyApp.Tests.csproj
```

## Non-Negotiables
1. Migration plan to .NET MAUI - Xamarin support ended May 2024
2. MVVM pattern with Xamarin.CommunityToolkit or Prism
3. Xamarin.Essentials for cross-platform device APIs
4. Shared business logic in .NET Standard 2.0 library
5. async/await for all I/O operations

## Red Lines
- Network or database operations on UI thread
- Platform-specific code without DependencyService abstraction
- Xamarin.Forms layouts inside ScrollView without explicit sizing
- Ignoring linker warnings in Release builds
- Hardcoded device dimensions - use relative layouts

## Pattern: Async Command with MVVM
```csharp
public class MainViewModel : BaseViewModel
{
    private readonly IDataService _dataService;

    public IAsyncCommand LoadCommand { get; }

    public MainViewModel(IDataService dataService)
    {
        _dataService = dataService;
        LoadCommand = new AsyncCommand(ExecuteLoadAsync);
    }

    private async Task ExecuteLoadAsync()
    {
        if (IsBusy) return;
        IsBusy = true;
        try
        {
            var items = await _dataService.GetItemsAsync();
            Items.ReplaceRange(items);
        }
        finally
        {
            IsBusy = false;
        }
    }
}
```

## Integrates With
- **DB**: SQLite-net-pcl with async, Realm for sync
- **Auth**: Xamarin.Essentials WebAuthenticator, SecureStorage for tokens
- **Cache**: Akavache or MonkeyCache for offline-first

## Common Errors
| Error | Fix |
|-------|-----|
| `Java.Lang.OutOfMemoryError` | Enable ProGuard/R8 and image compression |
| `NSInternalInconsistencyException` | Main thread violation - wrap in Device.BeginInvokeOnMainThread |
| `Linker removed required type` | Add [Preserve] attribute or linker.xml configuration |

## Prod Ready
- [ ] MAUI migration timeline documented
- [ ] Linking configured (Link SDK or Link All with skips)
- [ ] App Center or Crashlytics configured for crash reporting
- [ ] Automated UI tests with Xamarin.UITest
