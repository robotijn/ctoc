# Xamarin CTO
> C# everywhere, but consider MAUI for new projects

## Non-Negotiables
1. Migrate to .NET MAUI for all new projects; Xamarin support ends 2024
2. Use Xamarin.Essentials for cross-platform device features
3. Implement MVVM pattern with data binding for maintainable code
4. Share business logic in a .NET Standard library
5. Use async/await consistently to keep UI responsive

## Red Lines
- Never perform network or database operations on the UI thread
- Don't use platform-specific code without proper abstraction (DependencyService)
- Avoid Xamarin.Forms layouts inside ScrollView without proper sizing
- Never ignore linker warnings in Release builds
- Don't hardcode device dimensions; use relative layouts

## Pattern
```csharp
// Proper async command pattern
public ICommand LoadDataCommand => new Command(async () => {
    IsBusy = true;
    try {
        Data = await _service.GetDataAsync();
    } finally {
        IsBusy = false;
    }
});
```
