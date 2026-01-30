# Quarkus CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
quarkus create app myapp && cd myapp
quarkus dev
# Quarkus 3.x - Kubernetes-native Java framework
```

## Claude's Common Mistakes
1. **Blocking reactive endpoints** — Use `Uni`/`Multi` properly
2. **Runtime reflection** — Breaks native compilation
3. **Missing `@Transactional`** — Database operations fail
4. **Private `@Inject` fields** — Use constructor injection
5. **Ignoring dev services** — Docker auto-provisions DBs in dev

## Correct Patterns (2026)
```java
// src/main/java/com/example/resource/UserResource.java
@Path("/users")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class UserResource {

    @POST
    @Transactional
    public Response create(@Valid CreateUserDto dto) {
        User user = new User();
        user.email = dto.email();
        user.password = dto.password();
        user.persist();  // Panache active record

        return Response.created(URI.create("/users/" + user.id))
            .entity(user)
            .build();
    }

    @GET
    @Path("/{id}")
    public Response get(@PathParam("id") Long id) {
        return User.findByIdOptional(id)
            .map(user -> Response.ok(user).build())
            .orElse(Response.status(Response.Status.NOT_FOUND).build());
    }
}

// src/main/java/com/example/entity/User.java
@Entity
@Table(name = "users")
public class User extends PanacheEntity {
    public String email;
    public String password;

    public static User findByEmail(String email) {
        return find("email", email).firstResult();
    }
}

// src/main/java/com/example/dto/CreateUserDto.java
public record CreateUserDto(
    @NotBlank @Email String email,
    @NotBlank @Size(min = 8) String password
) {}
```

## Version Gotchas
- **Quarkus 3.x**: Java 17+ required; Jakarta EE namespace
- **Panache**: Active record pattern; extends `PanacheEntity`
- **Dev Services**: Auto-provisions PostgreSQL, Kafka, etc. in dev
- **Native**: Avoid reflection; use `@RegisterForReflection` if needed

## What NOT to Do
- ❌ Blocking in reactive chains — Use `Uni.createFrom().item()`
- ❌ Runtime reflection — Breaks native build
- ❌ Missing `@Transactional` — Database changes not persisted
- ❌ Private `@Inject` without getter — CDI can't inject
- ❌ Ignoring dev services — Free auto-provisioning

## Common Errors
| Error | Fix |
|-------|-----|
| `No active transaction` | Add `@Transactional` |
| `Unsatisfied dependency` | Add `@ApplicationScoped` |
| `Native build failure` | Register for reflection or use Panache |
| `Dev service not starting` | Check Docker is running |
