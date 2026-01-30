# Blazor CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
dotnet new blazorwasm -n MyApp  # WebAssembly
# Or: dotnet new blazorserver -n MyApp
cd MyApp && dotnet run
# .NET 9 - Blazor United (Server + WASM)
```

## Claude's Common Mistakes
1. **Missing `@key` on lists** — Causes inefficient re-renders
2. **Blocking UI thread** — Use async for all I/O operations
3. **Excessive JS interop** — Use C# where possible
4. **Calling `StateHasChanged()` everywhere** — Understand render lifecycle
5. **Massive components** — Split into smaller, focused components

## Correct Patterns (2026)
```csharp
// Pages/Users.razor
@page "/users"
@inject IUserService UserService
@inject NavigationManager Navigation

<PageTitle>Users</PageTitle>

@if (_loading)
{
    <p>Loading...</p>
}
else
{
    <button @onclick="ShowCreateForm">Create User</button>

    @foreach (var user in _users)
    {
        <!-- @key is required for efficient updates -->
        <UserCard @key="user.Id" User="user" OnDelete="HandleDelete" />
    }
}

@code {
    private List<User> _users = new();
    private bool _loading = true;

    protected override async Task OnInitializedAsync()
    {
        _users = await UserService.GetAllAsync();  // Always async
        _loading = false;
    }

    private async Task HandleDelete(int userId)
    {
        await UserService.DeleteAsync(userId);
        _users.RemoveAll(u => u.Id == userId);
        // StateHasChanged() auto-called after event handlers
    }

    private void ShowCreateForm() => Navigation.NavigateTo("/users/create");
}

// Services/UserService.cs
public class UserService : IUserService
{
    private readonly HttpClient _http;
    public UserService(HttpClient http) => _http = http;

    public async Task<List<User>> GetAllAsync()
        => await _http.GetFromJsonAsync<List<User>>("api/users") ?? new();
}
```

## Version Gotchas
- **.NET 9**: Blazor United combines Server + WASM
- **Render modes**: Auto, Server, WebAssembly, Static
- **@key**: Required on loops for efficient diffing
- **StateHasChanged**: Auto-called after events; rarely needed manually

## What NOT to Do
- ❌ `foreach` without `@key` — Inefficient re-renders
- ❌ Sync I/O blocking UI — Always use `async`/`await`
- ❌ Heavy JS interop — Use C# when possible
- ❌ `StateHasChanged()` spam — Understand when it's auto-called
- ❌ 1000-line components — Split into smaller components

## Render Modes (.NET 9)
| Mode | Runs On | Use For |
|------|---------|---------|
| Static | Server (no interactivity) | Content pages |
| Server | Server (SignalR) | Fast initial load |
| WebAssembly | Browser | Offline capable |
| Auto | Server then WASM | Best of both |

## Common Errors
| Error | Fix |
|-------|-----|
| `JSDisconnectedException` | Handle Server mode disconnects |
| `Cannot access disposed object` | Cancel async in `Dispose` |
| `Component not rendering` | Check `StateHasChanged()` or `@key` |
| `NavigationException` | Use `NavigationManager`, not JS |
