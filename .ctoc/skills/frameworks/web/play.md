# Play Framework CTO
> Reactive Scala/Java web framework - async by default, type-safe routing.

## Commands
```bash
# Setup | Dev | Test
sbt new playframework/play-scala-seed.g8
sbt run
sbt test
```

## Non-Negotiables
1. Async by default with Futures
2. Compile-time dependency injection
3. Twirl templates for type-safe views
4. Proper action composition
5. Evolutions for database migrations

## Red Lines
- Blocking in actions - use async or blocking context
- Ignoring Future composition
- Missing CSRF protection
- Global mutable state
- Runtime DI when compile-time works

## Pattern: Async Controller
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
  implicit val createUserFormat: Format[CreateUserRequest] = Json.format[CreateUserRequest]

  def create: Action[JsValue] = Action.async(parse.json) { request =>
    request.body.validate[CreateUserRequest].fold(
      errors => Future.successful(BadRequest(Json.obj("error" -> "Invalid request"))),
      createRequest => {
        userService.create(createRequest).map { user =>
          Created(Json.toJson(user))
        }.recover {
          case e: EmailExistsException =>
            Conflict(Json.obj("error" -> "Email already exists"))
          case e =>
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

  def health: Action[AnyContent] = Action {
    Ok(Json.obj("status" -> "ok"))
  }
}

// conf/routes
GET     /health              controllers.UserController.health
POST    /api/users           controllers.UserController.create
GET     /api/users/:id       controllers.UserController.get(id: Long)
```

## Integrates With
- **DB**: Slick for async DB access
- **Auth**: Play Silhouette for auth
- **DI**: Compile-time with MacWire or Guice
- **Akka**: Akka Streams, Akka HTTP

## Common Errors
| Error | Fix |
|-------|-----|
| `Deadlock` | Use different execution context for blocking |
| `Route not found` | Check routes file syntax |
| `JSON parsing failed` | Check case class matches JSON |
| `CSRF check failed` | Add CSRF token to forms |

## Prod Ready
- [ ] Production configuration (`application.prod.conf`)
- [ ] Secret key configured
- [ ] Evolutions enabled for DB
- [ ] Logging configured
- [ ] Health endpoint exposed
- [ ] TLS configured
