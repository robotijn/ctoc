# Grails CTO
> Groovy-based rapid development - convention over configuration, Spring underneath.

## Commands
```bash
# Setup | Dev | Test
grails create-app myapp && cd myapp
grails run-app
grails test-app
```

## Non-Negotiables
1. Convention over configuration - follow Grails way
2. GORM for persistence and relationships
3. Service layer for business logic
4. Plugin ecosystem for extensions
5. Proper domain modeling with constraints

## Red Lines
- Business logic in controllers - use services
- Missing `@Transactional` on services
- N+1 query issues - use `fetch` or `join`
- Skipping GORM best practices
- Ignoring validation constraints

## Pattern: Domain, Service, Controller
```groovy
// grails-app/domain/com/example/User.groovy
class User {
    String email
    String password
    Date dateCreated

    static constraints = {
        email email: true, unique: true, blank: false
        password minSize: 8
    }

    static mapping = {
        password column: 'password_hash'
    }
}

// grails-app/services/com/example/UserService.groovy
import grails.gorm.transactions.Transactional

@Transactional
class UserService {

    User createUser(Map params) {
        def user = new User(params)
        if (!user.validate()) {
            throw new ValidationException("Invalid user", user.errors)
        }
        user.password = hashPassword(params.password)
        user.save(failOnError: true)
        return user
    }

    User getUser(Long id) {
        User.get(id)
    }

    List<User> searchUsers(String query) {
        User.findAllByEmailIlike("%${query}%", [max: 20])
    }
}

// grails-app/controllers/com/example/UserController.groovy
import grails.converters.JSON

class UserController {

    UserService userService

    def create() {
        try {
            def user = userService.createUser(request.JSON)
            response.status = 201
            render user as JSON
        } catch (ValidationException e) {
            response.status = 400
            render([errors: e.errors.allErrors*.defaultMessage] as JSON)
        }
    }

    def show(Long id) {
        def user = userService.getUser(id)
        if (!user) {
            response.status = 404
            render([error: 'Not found'] as JSON)
            return
        }
        render user as JSON
    }
}
```

## Integrates With
- **DB**: GORM with Hibernate (Postgres, MySQL)
- **Auth**: Spring Security Core plugin
- **Cache**: Grails Cache plugin
- **API**: Grails REST plugin for JSON views

## Common Errors
| Error | Fix |
|-------|-----|
| `Validation failed` | Check domain constraints |
| `LazyInitializationException` | Fetch in service or use `join` |
| `StaleObjectStateException` | Handle optimistic locking |
| `No such property` | Check domain field names |

## Prod Ready
- [ ] Production datasource configured
- [ ] Asset pipeline for static files
- [ ] Health actuator endpoint
- [ ] Logging configured
- [ ] Security plugin configured
- [ ] Database migrations with Liquibase
