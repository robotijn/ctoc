# Dropwizard CTO
> Production-ready Java microservices.

## Non-Negotiables
1. YAML configuration
2. Jersey for REST
3. Metrics everywhere
4. Health checks
5. Hibernate/JDBI for data

## Red Lines
- Missing health checks
- Unconfigured metrics
- Skipping validation
- No managed resources

## Pattern
```java
@Path("/users")
public class UserResource {
    @POST
    @Timed
    public Response create(@Valid CreateUserDto dto) {
        User user = userDao.create(dto);
        return Response.created(URI.create("/users/" + user.getId()))
                       .entity(user)
                       .build();
    }
}
```
