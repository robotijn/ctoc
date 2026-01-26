# Play Framework CTO
> Reactive Scala/Java web framework.

## Non-Negotiables
1. Async by default
2. Compile-time DI
3. Twirl templates
4. Proper action composition
5. Evolutions for migrations

## Red Lines
- Blocking in actions
- Ignoring Future composition
- Missing CSRF protection
- Global state

## Pattern
```scala
class UserController @Inject()(
  cc: ControllerComponents,
  userService: UserService
) extends AbstractController(cc) {

  def create = Action.async(parse.json) { request =>
    userService.create(request.body.as[CreateUser])
      .map(user => Created(Json.toJson(user)))
  }
}
```
