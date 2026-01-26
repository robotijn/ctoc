# ASP.NET Core CTO
> Microsoft's cross-platform web framework - minimal APIs or MVC, your choice.

## Commands
```bash
# Setup | Dev | Test
dotnet new webapi -n MyApp && cd MyApp
dotnet run
dotnet test
```

## Non-Negotiables
1. Dependency injection via built-in container
2. Minimal APIs or Controllers - be consistent
3. Entity Framework Core for data access
4. Middleware pipeline configuration
5. Configuration via `appsettings.json` and environment

## Red Lines
- Service locator pattern - use constructor injection
- Sync over async - always await async calls
- Missing model validation
- Hardcoded connection strings - use configuration
- Blocking async code with `.Result` or `.Wait()`

## Pattern: Minimal API with Validation
```csharp
// Program.cs
using FluentValidation;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();

app.MapPost("/users", async (
    CreateUserDto dto,
    IValidator<CreateUserDto> validator,
    IUserService userService) =>
{
    var validation = await validator.ValidateAsync(dto);
    if (!validation.IsValid)
        return Results.ValidationProblem(validation.ToDictionary());

    var user = await userService.CreateAsync(dto);
    return Results.Created($"/users/{user.Id}", user);
})
.WithName("CreateUser")
.WithOpenApi();

app.MapGet("/health", () => Results.Ok("healthy"));

app.Run();

// Validators/CreateUserDtoValidator.cs
public class CreateUserDtoValidator : AbstractValidator<CreateUserDto>
{
    public CreateUserDtoValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8);
    }
}
```

## Integrates With
- **DB**: Entity Framework Core with migrations
- **Auth**: ASP.NET Identity or JWT Bearer
- **Cache**: `IMemoryCache` or Redis via `IDistributedCache`
- **Messaging**: MassTransit or Azure Service Bus

## Common Errors
| Error | Fix |
|-------|-----|
| `Unable to resolve service` | Register service in DI container |
| `Async deadlock` | Use `await` not `.Result` |
| `DbContext disposed` | Check scope lifetime, use factory |
| `No route matches` | Check endpoint mapping |

## Prod Ready
- [ ] `appsettings.Production.json` configured
- [ ] HTTPS enforced
- [ ] Logging with Serilog or similar
- [ ] Health checks at `/health`
- [ ] Swagger disabled in production
- [ ] Kestrel limits configured
