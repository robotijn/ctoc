# Xamarin CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# XAMARIN SUPPORT ENDED MAY 2024 - MIGRATE TO .NET MAUI
# For legacy maintenance only:
dotnet new xamarinforms -n MyApp  # Will fail on .NET 8+
# Use Visual Studio 2022 17.9 or earlier
```

## Claude's Common Mistakes
1. **Suggests Xamarin for new projects** - Support ended May 2024, use .NET MAUI
2. **Uses .NET 8 SDK with Xamarin** - Incompatible, requires .NET 6 or earlier
3. **Recommends Xamarin.Essentials updates** - Package deprecated, use MAUI Essentials
4. **Ignores migration timeline** - No security patches after May 2024
5. **Suggests NuGet package updates** - Many packages stopped Xamarin support

## Correct Patterns (2026)
```csharp
// MIGRATION PATTERN: Xamarin.Forms -> .NET MAUI
// Old Xamarin.Forms
// public class MainPage : ContentPage { }

// New .NET MAUI equivalent
public partial class MainPage : ContentPage
{
    public MainPage()
    {
        InitializeComponent();
    }
}

// Migration checklist:
// 1. Create new MAUI project
// 2. Copy shared code (most is compatible)
// 3. Replace Xamarin.Essentials with MAUI Essentials
// 4. Update custom renderers to Handlers
// 5. Test on all platforms
```

## Version Gotchas
- **May 2024**: Official support ended, no more patches
- **.NET 8+**: Xamarin SDK not included, only MAUI
- **Visual Studio 2022 17.10+**: Xamarin workload removed
- **With NuGet packages**: Many stopped Xamarin support in 2024

## What NOT to Do
- Do NOT start new Xamarin projects - use .NET MAUI
- Do NOT expect security patches - none since May 2024
- Do NOT use .NET 8 SDK - Xamarin requires .NET 6 max
- Do NOT delay migration - longer delay = harder migration
- Do NOT use community forks - no guaranteed maintenance
