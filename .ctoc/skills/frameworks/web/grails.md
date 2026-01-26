# Grails CTO
> Groovy-based rapid development framework.

## Non-Negotiables
1. Convention over configuration
2. GORM for persistence
3. Service layer pattern
4. Plugin ecosystem
5. Proper domain modeling

## Red Lines
- Logic in controllers
- Missing service transactions
- N+1 query issues
- Skipping GORM best practices

## Pattern
```groovy
class UserService {
    @Transactional
    User createUser(Map params) {
        def user = new User(params)
        user.save(failOnError: true)
        return user
    }
}
```
