# Quarkus CTO
> Kubernetes-native Java framework - supersonic startup, native compilation.

## Commands
```bash
# Setup | Dev | Test
quarkus create app myapp && cd myapp
quarkus dev
./mvnw test
```

## Non-Negotiables
1. Dev mode with live reload
2. Panache for simplified data access
3. Native compilation ready
4. CDI for dependency injection
5. SmallRye specs (MicroProfile)

## Red Lines
- Blocking reactive endpoints
- Runtime reflection abuse - breaks native
- Missing health/metrics extensions
- Ignoring dev services (auto-DB in dev)
- `@Inject` on private fields without getter

## Pattern: Resource with Panache
```java
// src/main/java/com/example/resource/UserResource.java
package com.example.resource;

import com.example.dto.CreateUserDto;
import com.example.entity.User;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.net.URI;

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
        user.persist();

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
package com.example.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntity;
import jakarta.persistence.*;

@Entity
@Table(name = "users")
public class User extends PanacheEntity {
    public String email;
    public String password;

    public static User findByEmail(String email) {
        return find("email", email).firstResult();
    }
}
```

## Integrates With
- **DB**: Hibernate ORM with Panache
- **Auth**: Quarkus Security with OIDC
- **Messaging**: SmallRye Reactive Messaging
- **REST Client**: REST Client Reactive

## Common Errors
| Error | Fix |
|-------|-----|
| `No active transaction` | Add `@Transactional` to method |
| `Unsatisfied dependency` | Check bean scope, add `@ApplicationScoped` |
| `Native build failure` | Register for reflection or use Panache |
| `Dev service not starting` | Check Docker running for dev mode |

## Prod Ready
- [ ] Native image built: `./mvnw package -Pnative`
- [ ] Health extension: `/q/health`
- [ ] Metrics extension: `/q/metrics`
- [ ] Database pool configured
- [ ] Graceful shutdown enabled
- [ ] Container image built
