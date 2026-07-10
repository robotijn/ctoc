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

## Concurrency / Async Footguns
`scala.concurrent.Future` is **eager**: constructing one submits work to an
`ExecutionContext` immediately (unlike a lazy `IO`). Two footguns follow — hidden
side effects at construction, and thread-pool starvation from blocking.

```scala
import scala.concurrent.{Future, Await, blocking}
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration.*

// FOOTGUN: a blocking call INSIDE a Future starves the fixed-size pool.
val f = Future { Thread.sleep(5000); load() }   // hogs a pool thread

// SAFE: tell the pool you're blocking so it can grow / compensate.
val f2 = Future { blocking { Thread.sleep(5000) }; load() }

// FOOTGUN: Await.result blocks the calling thread and can DEADLOCK if that
// thread is itself a pool thread the Future needs.
val r = Await.result(f, 10.seconds)             // avoid except at the top edge

// Prefer an effect system (cats-effect IO / ZIO): values are LAZY and
// referentially transparent — nothing runs until the runtime interprets them.
```
- The global `ExecutionContext` is a fixed-size fork-join pool; blocking calls
  without `blocking { }` silently exhaust it and hang unrelated work.
- In **cats-effect `IO`** / **ZIO**, never call a blocking or side-effecting API
  directly — wrap it (`IO.blocking`, `ZIO.attemptBlocking`) so the runtime can
  shift it to a dedicated pool and preserve referential transparency.
- Source: scala-lang.org Futures docs; Typelevel cats-effect docs. See References.

## Error Handling Idioms
Model failure with **`Try`**, `Either`, and `Option` — not thrown exceptions —
and never catch `Throwable`.

```scala
import scala.util.{Try, Success, Failure}

// Try captures NonFatal exceptions as a value (fatal errors still propagate):
def parseAge(s: String): Try[Int] = Try(s.toInt)

parseAge(input) match
  case Success(n) => useAge(n)
  case Failure(e) => log(e.getMessage)

// Exhaustive match on a sealed hierarchy; -Wnonexhaustive flags a missing case.
enum Status:
  case Active, Inactive, Pending

def label(s: Status): String = s match
  case Status.Active   => "on"
  case Status.Inactive => "off"
  case Status.Pending  => "wait"     // drop a case -> compiler warns
```
- `Try` catches only `NonFatal` throwables — it will NOT swallow `OutOfMemoryError`
  / `StackOverflowError` the way a raw `catch { case _: Throwable => }` does.
  Never catch `Throwable`.
- Compile with **`-Wnonexhaustive`** (and `-Werror` in CI) so a non-exhaustive
  match on a sealed trait/`enum` fails the build.
- Source: scala-lang.org `Try` / pattern matching docs. See References.

## Security and Dependency Gotchas
- **Deserialization — CWE-502 applies to Scala (it runs on the JVM).** Java native
  serialization (`ObjectInputStream.readObject`) on untrusted bytes enables remote
  code execution via gadget chains — the Scala standard library and any JVM
  dependency inherit this. Avoid Java serialization for external data; use a
  schema-based, type-safe format (circe/`json`, protobuf, Avro). (CWE-502
  "Deserialization of Untrusted Data" — cwe.mitre.org/data/definitions/502.html.)
- **Maven Central supply chain**: pin exact versions and audit. Use
  **`sbt-dependency-check`** (OWASP Dependency-Check against the NVD) or
  `sbt dependencyUpdates` (sbt-updates) to surface vulnerable/stale deps; enable
  sbt's dependency locking / a committed lock for reproducible resolution.
- Source: cwe.mitre.org CWE-502; OWASP Dependency-Check. See References.

## Testing Conventions
```scala
// MUnit + ScalaCheck property test:
import org.scalacheck.Prop.forAll

class ListSuite extends munit.ScalaCheckSuite:
  property("reverse is involutive"):
    forAll { (xs: List[Int]) => xs.reverse.reverse == xs }   // property, not one case
```
- Use **MUnit** or **ScalaTest** as the framework and **ScalaCheck** for
  property-based tests (generators + shrinking). Run with `sbt test`; measure
  coverage with **scoverage** (`sbt coverage test coverageReport`).

## Performance Traps
- **Boxing of primitives in generic collections**: `List[Int]` boxes every `Int`
  (`java.lang.Integer`). For numeric-heavy code use `Array[Int]` (unboxed) or a
  specialized collection; `@specialized` avoids boxing in generic code.
- **`for`-comprehension desugaring**: each `for/yield` becomes `map`/`flatMap`/
  `withFilter` calls, allocating intermediates; a hot inner loop is cheaper as an
  explicit `while` or a single fold.
- **Implicit / `given` resolution is a COMPILE-time cost**: deep implicit search
  (type-class derivation) can blow up build times — keep instances shallow and
  cache derivations.
- **`List` prepend vs `Vector`**: `List` is O(1) prepend / O(n) index; `Vector`
  is effectively-constant indexed access + updates. Choose by access pattern.

## Version-Specific Gotchas (dated, sourced)
- **Scala 3.8.4** (2026-06-05) is the current release on the Next line; **Scala
  3.3.x is the LTS line** (latest **3.3.8**, 2026-06-11) — target the LTS for
  libraries. [endoflife.date/scala, retrieved 2026-07-10]
- **Scala 3 vs 2.13**: `given`/`using` replace `implicit`; `enum` replaces the
  `sealed trait` + `case object` boilerplate; `open` is required to make a class
  extensible. Cross-build via the Scala 2.13 ↔ 3 TASTy interop when migrating.
  [scala-lang.org Scala 3 reference, retrieved 2026-07-10]
- **Scala 2.13** remains widely deployed; check library availability for 3.x
  before assuming a dependency has been ported. [endoflife.date/scala, 2026-07-10]

## References (retrieved 2026-07-10)
- Scala release status: https://endoflife.date/scala
- Scala 3 language reference: https://docs.scala-lang.org/scala3/reference/
- Scala Futures: https://docs.scala-lang.org/overviews/core/futures.html
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
- OWASP Dependency-Check: https://owasp.org/www-project-dependency-check/
- ScalaCheck: https://scalacheck.org/
