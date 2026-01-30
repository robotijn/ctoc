# Play Framework CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
sbt new playframework/play-scala-seed.g8
cd myapp && sbt run
# Play 3.x - Scala/Java reactive web framework
```

## Claude's Common Mistakes
1. **Blocking in async actions** — Use separate execution context
2. **Ignoring Future composition** — Chain with `map`/`flatMap`
3. **Missing CSRF protection** — Required for forms
4. **Runtime DI by default** — Prefer compile-time with MacWire
5. **Not using evolutions** — Database schema drift

## Correct Patterns (2026)
```scala
// app/controllers/UserController.scala
package controllers

import javax.inject._
import play.api.mvc._
import play.api.libs.json._
import scala.concurrent.{ExecutionContext, Future}
import services.UserService
import models.{User, CreateUserRequest}

@Singleton
class UserController @Inject()(
  cc: ControllerComponents,
  userService: UserService
)(implicit ec: ExecutionContext) extends AbstractController(cc) {

  implicit val userFormat: Format[User] = Json.format[User]
  implicit val createFormat: Format[CreateUserRequest] = Json.format[CreateUserRequest]

  def create: Action[JsValue] = Action.async(parse.json) { request =>
    request.body.validate[CreateUserRequest].fold(
      errors => Future.successful(BadRequest(Json.obj("error" -> "Invalid"))),
      req => {
        userService.create(req).map { user =>
          Created(Json.toJson(user))
        }.recover {
          case _: EmailExistsException =>
            Conflict(Json.obj("error" -> "Email exists"))
          case _ =>
            InternalServerError(Json.obj("error" -> "Server error"))
        }
      }
    )
  }

  def get(id: Long): Action[AnyContent] = Action.async {
    userService.get(id).map {
      case Some(user) => Ok(Json.toJson(user))
      case None => NotFound(Json.obj("error" -> "Not found"))
    }
  }
}

// conf/routes
GET     /health              controllers.UserController.health
POST    /api/users           controllers.UserController.create
GET     /api/users/:id       controllers.UserController.get(id: Long)
```

## Version Gotchas
- **Play 3.x**: Pekko replaces Akka; Scala 3 support
- **Async**: All actions should return `Future[Result]`
- **ExecutionContext**: Use separate context for blocking I/O
- **Evolutions**: Enable for database migrations

## What NOT to Do
- ❌ Blocking in default EC — Use `blockingContext` for I/O
- ❌ `Await.result` in handlers — Defeats async purpose
- ❌ Missing CSRF token — Security vulnerability
- ❌ Runtime DI everywhere — Compile-time is faster to fail
- ❌ Manual schema changes — Use evolutions

## Common Errors
| Error | Fix |
|-------|-----|
| `Deadlock` | Use separate execution context for blocking |
| `Route not found` | Check routes file syntax |
| `JSON parsing failed` | Check case class matches JSON |
| `CSRF check failed` | Add CSRF token to forms |
