# Dropwizard CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
mvn archetype:generate -DgroupId=com.example -DartifactId=myapp \
  -DarchetypeGroupId=io.dropwizard.archetypes -DarchetypeArtifactId=java-simple
cd myapp && mvn package && java -jar target/myapp.jar server config.yml
# Dropwizard 4.x - requires Java 17+
```

## Claude's Common Mistakes
1. **Missing health checks** — Always register health checks
2. **Unconfigured metrics** — Use `@Timed`, `@Metered` annotations
3. **Skipping validation** — Use `@Valid` on all DTOs
4. **No managed resources** — Register lifecycle with `environment.lifecycle()`
5. **Ignoring YAML config** — Externalize all configuration

## Correct Patterns (2026)
```java
// src/main/java/com/example/resources/UserResource.java
@Path("/users")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class UserResource {
    private final UserDAO userDAO;

    public UserResource(UserDAO userDAO) {
        this.userDAO = userDAO;
    }

    @POST
    @Timed
    @UnitOfWork
    public Response create(@Valid CreateUserDTO dto) {
        User user = userDAO.create(dto.getEmail(), dto.getPassword());
        return Response.created(URI.create("/users/" + user.getId()))
                       .entity(user)
                       .build();
    }

    @GET
    @Path("/{id}")
    @Timed
    @UnitOfWork(readOnly = true)
    public User get(@PathParam("id") Long id) {
        return userDAO.findById(id)
            .orElseThrow(() -> new NotFoundException("User not found"));
    }
}

// Health check (REQUIRED)
public class DatabaseHealthCheck extends HealthCheck {
    private final SessionFactory sessionFactory;

    public DatabaseHealthCheck(SessionFactory sessionFactory) {
        this.sessionFactory = sessionFactory;
    }

    @Override
    protected Result check() {
        try (Session session = sessionFactory.openSession()) {
            session.createNativeQuery("SELECT 1").getSingleResult();
            return Result.healthy();
        } catch (Exception e) {
            return Result.unhealthy(e.getMessage());
        }
    }
}

// Application setup
public class MyApplication extends Application<MyConfiguration> {
    @Override
    public void run(MyConfiguration config, Environment env) {
        // Hibernate
        SessionFactory sf = hibernateBundle.getSessionFactory();
        UserDAO userDAO = new UserDAO(sf);

        // Health checks (REQUIRED)
        env.healthChecks().register("database", new DatabaseHealthCheck(sf));

        // Resources
        env.jersey().register(new UserResource(userDAO));
    }
}
```

## Version Gotchas
- **Dropwizard 4.x**: Java 17+ required; Jakarta EE namespace
- **Health checks**: Required for production readiness
- **Metrics**: `@Timed`, `@Metered` for observability
- **UnitOfWork**: Required for Hibernate session management

## What NOT to Do
- ❌ Missing health checks — Not production-ready
- ❌ No `@Valid` on DTOs — Input not validated
- ❌ Missing `@UnitOfWork` — No Hibernate session
- ❌ Hardcoded config — Use YAML configuration
- ❌ Missing `@Timed` — No metrics collected

## Common Errors
| Error | Fix |
|-------|-----|
| `No session` | Add `@UnitOfWork` annotation |
| `Validation failed` | Check DTO constraints |
| `Health check failed` | Fix underlying service |
| `404 on resource` | Check `@Path` annotation |
