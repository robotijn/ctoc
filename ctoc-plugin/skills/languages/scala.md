# Scala CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses `null` — use `Option[T]` always
- Claude uses `var` loops — use `foldLeft`, `map`, higher-order functions
- Claude catches `Throwable` — catches fatal JVM errors
- Claude uses old implicits — use `given`/`using` (Scala 3)

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `scala 3.x` | given/using, enums, open classes | Scala 2.x |
| `sbt` or `scala-cli` | Build tools | Manual javac |
| `scalafmt` | Formatting | Manual style |
| `scalafix` | Linting + refactoring | Just compiler |
| `munit` or `scalatest` | Testing | Ad-hoc tests |

## Patterns Claude Should Use
```scala
// Scala 3 patterns
// Use given/using instead of implicits
given Ordering[User] = Ordering.by(_.name)

def sorted[T](list: List[T])(using ord: Ordering[T]): List[T] =
  list.sorted

// Enums instead of sealed trait + case objects
enum Status:
  case Active, Inactive, Pending

// Open classes require explicit marking
open class Base:
  def method(): Unit = ()

// Option instead of null
def findUser(id: Int): Option[User] =
  users.find(_.id == id)

// Higher-order instead of var loops
val sum = numbers.foldLeft(0)(_ + _)
```

## Anti-Patterns Claude Generates
- Using `null` — use `Option[T]`
- `var` with loops — use `foldLeft`, `map`, `filter`
- `catch { case _: Throwable => }` — catches OOM errors
- Old `implicit` keyword — use `given`/`using`
- Blocking `Await.result` — use for-comprehensions

## Version Gotchas
- **Scala 3**: `given`/`using` replace `implicit`
- **Scala 3**: Traits can take parameters
- **Scala 3**: `open` keyword required for extensible classes
- **With Cats/ZIO**: Never block in effect systems
- **With macros**: Follow Scala 3 macro best practices docs
