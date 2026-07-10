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

## EOL Footguns — Xamarin is End-of-Support
**Xamarin support ended May 1, 2024** for all Xamarin SDKs — Xamarin.Forms,
Xamarin.iOS, Xamarin.Android, and Xamarin.Mac. Microsoft ships **no further
security patches or bug fixes**. Do NOT start new Xamarin projects; the only
correct advice for any Xamarin request is **migrate to .NET MAUI**.
[dotnet.microsoft.com/platform/support/policy/xamarin, retrieved 2026-07-10]

```csharp
// FOOTGUN: MessagingCenter — used everywhere in Xamarin.Forms — is DEPRECATED
// and removed from the modern stack. Do not carry it into migrated code.
// MessagingCenter.Subscribe<Sender>(this, "evt", s => { ... });   // deprecated

// RIGHT: WeakReferenceMessenger from CommunityToolkit.Mvvm (the MAUI-era
// replacement) — weak refs avoid the subscriber-leak MessagingCenter caused.
using CommunityToolkit.Mvvm.Messaging;
WeakReferenceMessenger.Default.Register<MyMessage>(this, (r, m) => Handle(m));
```

- **A new Xamarin project won't even build on the modern SDK.** `dotnet new
  xamarinforms` fails on .NET 8+; Xamarin required .NET 6-or-earlier tooling and
  the workload was removed from Visual Studio 2022 17.10+.
- **Linker (`ILLink`) behavior differs**: Xamarin's linker aggressively strips;
  reflection-only types (JSON models, DI-resolved types) need
  `[Preserve]`/linker-descriptor XML or they vanish at runtime. This trap carries
  over into MAUI's trimming — audit it during migration, not after a crash.
- **No new dependencies**: many NuGet packages dropped Xamarin target frameworks
  in 2024; a `dotnet restore` on an old project may resolve to unmaintained
  versions with unpatched CVEs (a live security exposure, not just staleness).

## Migration — Xamarin.Forms → .NET MAUI
```bash
# Use the official .NET Upgrade Assistant to convert projects/namespaces.
dotnet tool install -g upgrade-assistant
upgrade-assistant upgrade MyApp.sln
# It rewrites the project to SDK-style, maps Xamarin.Essentials ->
# Microsoft.Maui.Essentials, and flags custom renderers to port to handlers.
```
- Most **shared C#** (ViewModels, services, models) ports unchanged; the work is
  in the platform layer.
- **Custom renderers → handlers** (`Handler.Mapper`) — there is no renderer
  pipeline in MAUI (see the MAUI guide).
- **`Xamarin.Essentials` → `Microsoft.Maui.Essentials`**; the old namespace does
  not resolve.
- Migrate incrementally: get it compiling on MAUI, then re-test every platform —
  behavior (fonts, safe-area, back-navigation) shifts subtly.
  [learn.microsoft.com/dotnet/maui/migration/, retrieved 2026-07-10]

## Error Handling
- Treat an EOL Xamarin app as **frozen**: patch only what a compliance/security
  audit forces, do not add features — every hour spent extending Xamarin is a
  larger MAUI migration later.
- After migration, wrap `SecureStorage` / permission calls in try/catch for
  `PermissionException` — the modern APIs throw where Xamarin.Essentials
  sometimes returned defaults.

## Security
```csharp
// FOOTGUN: storing tokens in Application.Current.Properties (Xamarin.Forms) —
// serialized to an UNENCRYPTED file on disk. CWE-312 (Cleartext Storage).
// Application.Current.Properties["token"] = token;   // WRONG

// RIGHT: SecureStorage (Keychain / Keystore-backed), same API after migration.
await SecureStorage.SetAsync("auth_token", token);
```
- **No security patches since May 1, 2024** — an unpatched Xamarin app inherits
  every OS/library CVE disclosed after that date; this is the strongest reason to
  migrate. [dotnet.microsoft.com/platform/support/policy/xamarin, retrieved 2026-07-10]
- Secrets belong in `SecureStorage`, never `Application.Properties` /
  `Preferences` (plaintext ⇒ **CWE-312**).
- Enforce TLS 1.2+ and pin certificates in the `HttpClientHandler`; do not ship
  a validation-bypass callback.

## Testing
- ViewModels/services are plain C# — unit-test them off-device; that test suite
  carries straight over to MAUI and becomes the migration safety net.
- Run the existing Xamarin.UITest / Appium suite before AND after migration to
  catch behavior drift on each platform.

## Performance
- Do not invest in Xamarin performance tuning — the payoff dies with the
  platform. MAUI's handler architecture is faster; performance work belongs
  post-migration.

## Version-Specific Gotchas (dated, sourced)
- **Xamarin EOL: May 1, 2024** — all SDKs, no more patches; migrate to .NET
  MAUI. [dotnet.microsoft.com/platform/support/policy/xamarin, retrieved 2026-07-10]
- **Migration target**: **.NET MAUI 10.0.80** (.NET 10 wave) is the current
  stable `Microsoft.Maui.Controls` on NuGet, published **2026-06-24** — migrate
  onto this, not an interim band. [nuget.org/packages/Microsoft.Maui.Controls, retrieved 2026-07-10]
- **Tooling**: VS 2022 17.10+ removed the Xamarin workload; `.NET 8+` SDKs drop
  the Xamarin target. Use the **.NET Upgrade Assistant** for the port.
- **`MessagingCenter` deprecated** → `WeakReferenceMessenger`.

## References (retrieved 2026-07-10)
- Xamarin Support Policy (EOL May 1, 2024): https://dotnet.microsoft.com/platform/support/policy/xamarin
- Xamarin → .NET MAUI migration: https://learn.microsoft.com/dotnet/maui/migration/
- .NET Upgrade Assistant: https://learn.microsoft.com/dotnet/core/porting/upgrade-assistant-overview
- Microsoft.Maui.Controls on NuGet (10.0.80, 2026-06-24): https://www.nuget.org/packages/Microsoft.Maui.Controls
- CWE-312 (Cleartext Storage of Sensitive Information): https://cwe.mitre.org/data/definitions/312.html
