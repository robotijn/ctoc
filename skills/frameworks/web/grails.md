# Grails CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
sdk install grails
grails create-app myapp && cd myapp
grails run-app
# Grails 6.x - Groovy framework on Spring Boot
```

## Claude's Common Mistakes
1. **Business logic in controllers** — Use service layer
2. **Missing `@Transactional`** — Services need transaction annotation
3. **N+1 queries** — Use `fetch` or `join` in GORM queries
4. **Skipping domain constraints** — Always define validation rules
5. **LazyInitializationException** — Fetch associations in service layer

## Correct Patterns (2026)
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
    }

    @Transactional(readOnly = true)
    User getUser(Long id) {
        // Eager fetch to avoid LazyInitializationException
        User.findById(id, [fetch: [posts: 'eager']])
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

## Version Gotchas
- **Grails 6.x**: Spring Boot 3.x underneath; Java 17+
- **GORM**: Always use `@Transactional` on services
- **Fetch**: Use `fetch: [relation: 'eager']` to avoid N+1
- **Constraints**: Define in domain class, not controller

## What NOT to Do
- ❌ Logic in controllers — Move to services
- ❌ Missing `@Transactional` — No transaction management
- ❌ Lazy fetching in controllers — LazyInitializationException
- ❌ Skipping constraints — Data integrity issues
- ❌ `save()` without `failOnError` — Silent failures

## Common Errors
| Error | Fix |
|-------|-----|
| `LazyInitializationException` | Use `fetch: 'eager'` or fetch in service |
| `Validation failed` | Check domain constraints |
| `StaleObjectStateException` | Handle optimistic locking |
| `No session` | Add `@Transactional` to service |
