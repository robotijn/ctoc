# ASP.NET Core CTO
> Microsoft's cross-platform web framework.

## Non-Negotiables
1. Dependency injection
2. Minimal APIs or Controllers
3. Entity Framework Core
4. Middleware pipeline
5. Configuration system

## Red Lines
- Service locator pattern
- Sync over async
- Missing model validation
- Hardcoded connection strings

## Pattern
```csharp
app.MapPost("/users", async (CreateUserDto dto, UserService service) =>
{
    var user = await service.CreateAsync(dto);
    return Results.Created($"/users/{user.Id}", user);
})
.WithValidation<CreateUserDto>();
```
