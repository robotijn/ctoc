# Blazor CTO
> C# in the browser with WebAssembly.

## Non-Negotiables
1. Component architecture
2. Proper state management
3. JS interop sparingly
4. Render optimization
5. Authentication/Authorization

## Red Lines
- Massive components
- Missing @key on lists
- Blocking UI thread
- Excessive JS interop

## Pattern
```csharp
@page "/users"
@inject HttpClient Http

<button @onclick="CreateUser">Create</button>

@code {
    private async Task CreateUser()
    {
        await Http.PostAsJsonAsync("api/users", newUser);
        await LoadUsers();
    }
}
```
