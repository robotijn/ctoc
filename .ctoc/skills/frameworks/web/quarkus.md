# Quarkus CTO
> Kubernetes-native Java framework.

## Non-Negotiables
1. Dev mode hot reload
2. Panache for data access
3. Native compilation
4. CDI for DI
5. SmallRye specifications

## Red Lines
- Blocking reactive endpoints
- Runtime reflection abuse
- Missing health/metrics
- Ignoring dev services

## Pattern
```java
@Path("/users")
public class UserResource {
    @POST
    @Transactional
    public Response create(@Valid CreateUserDto dto) {
        User user = userMapper.toEntity(dto);
        user.persist();
        return Response.created(URI.create("/users/" + user.id)).build();
    }
}
```
