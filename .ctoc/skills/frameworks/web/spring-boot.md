# Spring Boot CTO
> Enterprise Java simplified - convention over configuration, production-ready.

## Commands
```bash
# Setup | Dev | Test
./mvnw spring-boot:run  # or ./gradlew bootRun
./mvnw test -Dtest=*Test
./mvnw package -DskipTests && java -jar target/*.jar
```

## Non-Negotiables
1. Constructor injection only - never `@Autowired` on fields
2. Layered architecture: Controller -> Service -> Repository
3. Spring Security configured from day one
4. Actuator endpoints for health, metrics, info
5. Configuration externalized via `application.yml` and profiles

## Red Lines
- Field injection with `@Autowired` - untestable, hidden dependencies
- Business logic in `@Controller` classes
- Missing `@Transactional` on service methods that write
- Ignoring security - no endpoint unprotected by accident
- Catching `Exception` generically without proper handling

## Pattern: Clean Service Layer
```java
@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public UserResponse createUser(CreateUserRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new ConflictException("Email already registered");
        }

        User user = User.builder()
            .email(request.email())
            .password(passwordEncoder.encode(request.password()))
            .build();

        user = userRepository.save(user);
        eventPublisher.publishEvent(new UserCreatedEvent(user.getId()));

        return UserResponse.from(user);
    }
}
```

## Integrates With
- **DB**: Spring Data JPA with HikariCP connection pool
- **Auth**: Spring Security with JWT (jjwt) or OAuth2
- **Cache**: Spring Cache with Redis (`@Cacheable`, `@CacheEvict`)
- **Messaging**: Spring Kafka or RabbitMQ with `@KafkaListener`

## Common Errors
| Error | Fix |
|-------|-----|
| `BeanCurrentlyInCreationException` | Circular dependency - refactor or use `@Lazy` |
| `LazyInitializationException` | Fetch in transaction or use `@EntityGraph` |
| `No qualifying bean of type` | Check `@Component` scan, add `@Service`/`@Repository` |
| `TransactionRequiredException` | Add `@Transactional` to service method |

## Prod Ready
- [ ] Actuator secured, health endpoint public
- [ ] Flyway or Liquibase for database migrations
- [ ] Logback with JSON format for log aggregation
- [ ] Micrometer metrics exported to Prometheus
- [ ] Graceful shutdown with `server.shutdown=graceful`
- [ ] Native image with GraalVM for fast startup (optional)
