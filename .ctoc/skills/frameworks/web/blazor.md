# Blazor CTO
> C# in the browser - WebAssembly for full .NET, or Server for real-time connections.

## Commands
```bash
# Setup | Dev | Test
dotnet new blazorwasm -n MyApp && cd MyApp  # or blazorserver
dotnet run
dotnet test
```

## Non-Negotiables
1. Component architecture with clear boundaries
2. Proper state management (cascading, services)
3. JS interop only when necessary
4. Render optimization with `@key` and `ShouldRender`
5. Authentication/Authorization configured properly

## Red Lines
- Massive components - split into smaller ones
- Missing `@key` on lists causing re-render issues
- Blocking UI thread with sync operations
- Excessive JS interop - use C# where possible
- StateHasChanged spam - understand render lifecycle

## Pattern: Component with Service
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
        <UserCard @key="user.Id" User="user" OnDelete="HandleDelete" />
    }
}

@code {
    private List<User> _users = new();
    private bool _loading = true;

    protected override async Task OnInitializedAsync()
    {
        _users = await UserService.GetAllAsync();
        _loading = false;
    }

    private async Task HandleDelete(int userId)
    {
        await UserService.DeleteAsync(userId);
        _users.RemoveAll(u => u.Id == userId);
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

## Integrates With
- **API**: HttpClient with typed clients
- **Auth**: ASP.NET Identity or Azure AD
- **State**: Fluxor for Redux pattern, or custom services
- **UI**: MudBlazor or Radzen component libraries

## Common Errors
| Error | Fix |
|-------|-----|
| `JSDisconnectedException` | Check Server connection, handle gracefully |
| `Cannot access disposed object` | Cancel async operations in `Dispose` |
| `Component not rendering` | Call `StateHasChanged()` after async updates |
| `NavigationException` | Use `NavigationManager.NavigateTo` not JS |

## Prod Ready
- [ ] WASM: Compression enabled, AOT compilation
- [ ] Server: SignalR scaling configured
- [ ] Error boundaries for graceful failures
- [ ] Lazy loading for large apps
- [ ] PWA support configured
- [ ] Logging with structured output
