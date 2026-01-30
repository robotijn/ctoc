# ASP.NET Core CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
dotnet new webapi -n MyApp
cd MyApp && dotnet run
# .NET 9 - requires SDK 9.0+
```

## Claude's Common Mistakes
1. **Service locator pattern** — Use constructor injection, not `GetService()`
2. **Blocking async with `.Result`** — Always `await`; never `.Result` or `.Wait()`
3. **Missing validation** — Use FluentValidation or DataAnnotations
4. **DbContext lifetime issues** — Use `AddDbContext` with scoped lifetime
5. **Hardcoded config** — Use `appsettings.json` and `IConfiguration`

## Correct Patterns (2026)
```csharp
// Program.cs - Minimal API pattern
using FluentValidation;

var builder = WebApplication.CreateBuilder(args);

// Register services (DI container)
builder.Services.AddDbContext<AppDbContext>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();

// Minimal API endpoint with validation
app.MapPost("/users", async (
    CreateUserDto dto,
    IValidator<CreateUserDto> validator,
    IUserService userService) =>
{
    var validation = await validator.ValidateAsync(dto);
    if (!validation.IsValid)
        return Results.ValidationProblem(validation.ToDictionary());

    var user = await userService.CreateAsync(dto);  // Always await
    return Results.Created($"/users/{user.Id}", user);
})
.WithName("CreateUser")
.WithOpenApi();

app.Run();

// Validator
public class CreateUserDtoValidator : AbstractValidator<CreateUserDto>
{
    public CreateUserDtoValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8);
    }
}

// Service with constructor injection
public class UserService : IUserService
{
    private readonly AppDbContext _db;

    public UserService(AppDbContext db) => _db = db;

    public async Task<User> CreateAsync(CreateUserDto dto)
    {
        var user = new User { Email = dto.Email };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user;
    }
}
```

## Version Gotchas
- **.NET 9**: Current; Minimal APIs preferred for new projects
- **EF Core 9**: Improved performance, new features
- **Scoped DbContext**: Default lifetime; don't inject into singletons
- **Async/await**: Never use `.Result` or `.Wait()` (deadlock risk)

## What NOT to Do
- ❌ `services.GetService<T>()` in code — Use constructor injection
- ❌ `await task.Result` or `task.Wait()` — Causes deadlocks
- ❌ Missing `async` on EF Core calls — Always use `Async` methods
- ❌ DbContext in singleton service — Scoped lifetime required
- ❌ Secrets in `appsettings.json` — Use User Secrets or env vars

## Common Errors
| Error | Fix |
|-------|-----|
| `Unable to resolve service` | Register in DI container |
| `Async deadlock` | Use `await`, never `.Result` |
| `DbContext disposed` | Check scoped lifetime |
| `No route matches` | Check endpoint mapping |

## Production Config
```json
// appsettings.Production.json
{
  "Logging": { "LogLevel": { "Default": "Warning" } },
  "AllowedHosts": "yourdomain.com"
}
```
