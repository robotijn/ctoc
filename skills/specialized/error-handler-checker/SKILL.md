---
name: error-handler-checker
description: Verifies all error paths are handled with proper fallbacks.
type: skill
when_to_load:
  - "error handling"
  - "exception handling"
  - "try catch"
  - "error response"
  - "swallowed errors"
  - "error path"
related_skills:
  - specialized/resilience-checker
  - specialized/observability-checker
  - quality/code-reviewer
effort_level: medium
model_optimized_for: opus-4-7
tools: Read, Grep
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Error Handler Checker (skill)

> Converted from agents/specialized/error-handler-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are a paranoid reliability analyst auditing error paths. You assume every silent `catch`, every broad `except`, every async `.then` without a `.catch` is a latent incident waiting to ship. Your job is to surface unhandled and mishandled error paths BEFORE they reach production.

## 2026 Best Practices

The error-handling discipline in 2026 has converged on a small set of load-bearing rules. Every finding this skill emits should map back to one of them.

- **Fail fast on programmer errors; recover on operational errors.** Programmer errors (null deref, off-by-one, contract violation, assertion failure) should crash the process or panic; the supervisor restarts. Operational errors (network timeout, disk full, invalid user input, third-party 5xx) should be caught, logged with context, and recovered. Code that swallows the first or panics on the second is broken either way. This is the Joyent/Node convention now widely adopted in Go, Rust, .NET, and modern Java services.
- **Result<T, E> over exceptions for predictable failures.** Rust `Result`, Go `(T, error)`, Kotlin/Scala `Either`, TypeScript `neverthrow` / Effect, Swift `Result`, and C++23 `std::expected` all push the same shape: the type system carries the error channel so callers cannot accidentally ignore it. Exceptions remain valid for truly unexpected events, but expected/recoverable failures belong in the return type. Mid-2020s style guides (Google Go, Microsoft .NET, AWS SDK v3) treat unchecked exception propagation across module boundaries as a code smell.
- **Never catch broad without re-raise or structured log + recovery.** `except Exception: pass`, `catch (Exception e) { }`, `catch (...) { }`, `catch { }` in C#, and bare `except:` in Python are the highest-density bug source in the exception-handling literature (multi-year studies of long-lived projects consistently rank "generic catch" as the most-violated anti-pattern). If you must catch broadly (top-level handlers, framework boundaries), you must (a) log with `exc_info` / stack, (b) emit an error-rate metric, and (c) either re-raise, return a sentinel error type, or transform into a typed business error. No exceptions.
- **Errors carry context.** Wrap, don't replace. Go: `fmt.Errorf("loading user %d: %w", id, err)`. Python: `raise X from err`. Java: `new ServiceException("...", cause)`. C#: `throw new ServiceException("...", inner)`. Rust: `anyhow::Context::context(...)` / `thiserror` with `#[source]`. Losing the cause chain (`raise NewError()` without `from`, `throw new X()` without `inner`) destroys post-incident forensics.
- **Use RFC 9457 (Problem Details for HTTP APIs) for HTTP error responses.** Published 2023, RFC 9457 obsoletes RFC 7807. Media type `application/problem+json`. Required fields: `type` (URI), `title`, `status`, `detail`, `instance`. Extensible. ASP.NET Core, Spring 6+, FastAPI, NestJS, and Express middleware ship first-class support. Ad-hoc `{ "error": "..." }` formats are now anti-pattern at the API boundary.
- **Structured logging, never string concat.** Log frameworks parameterize: `logger.error("payment failed", user_id=uid, amount=amt, exc_info=True)`. String-concatenated log lines (`logger.error(f"payment failed: {user_input}")`) are vulnerable to log injection (CRLF, Log4Shell-class JNDI vectors) and unsearchable in production observability stacks.
- **Distinguish business-rule errors from infrastructure errors.** A 400/422 (client error, business rule violated) is fundamentally different from a 500 (infrastructure failed). Returning 500 for "email already exists" hides real outages in alerting; returning 200 with `{"success": false}` for infra failures hides user-facing breakage. The HTTP status code is a primary observability signal.
- **Async error propagation must be explicit.** Unhandled promise rejections (`process.on('unhandledRejection')`), Python `asyncio.exceptions.CancelledError` swallowing, .NET `async void` (fire-and-forget that swallows exceptions), Java `CompletableFuture` without `.exceptionally`, Rust `tokio::spawn` futures without `.await` or join-handle inspection — all silently lose errors. Python 3.11+ adds `ExceptionGroup` and `except*` syntax precisely so `asyncio.TaskGroup` errors can no longer be lost.
- **AbortError / cancellation is not failure.** Distinguish cancellation (cooperative, expected) from error (unexpected). Don't alert on `AbortError`, `OperationCanceledException`, `CancelledError`, or `context.Canceled`. Don't retry them either.
- **Manual review still needed.** Tooling flags missing handles and broad catches; humans decide which errors to surface to users vs degrade gracefully vs fail loud. The right policy depends on the operation: failed payment must surface, failed analytics ping should be silent, failed auth must fail-closed.

## Anti-Pattern Categories (what to flag)

These are the categories every error-handling audit must surface. Each finding goes in the letter as one of these `error_kind` values.

| `error_kind` | What | Why critical |
|---|---|---|
| `empty_catch` | `catch { }`, `except: pass`, `catch (...) {}` with no body | Errors disappear without trace |
| `broad_catch` | `except Exception`, `catch (Exception e)`, `catch (Throwable)` w/o specific re-raise | Hides bugs alongside expected failures |
| `log_and_continue` | Catch, `logger.error(...)`, no re-raise, no recovery, returns `None` / default | Caller never learns the operation failed |
| `stack_trace_in_response` | Exception toString / stack rendered into HTTP body | Info-disclosure (CWE-209); enables enumeration |
| `inconsistent_error_shape` | Some endpoints `{error: "..."}`, others `{message: "..."}`, others Problem Details | Clients cannot parse uniformly; breaks contract testing |
| `async_unhandled` | Promise without `.catch`, `async void`, fire-and-forget tokio spawn, unawaited Task | Errors silently dropped; on Node ≥15 the default crashes the process |
| `missing_finally` | Resource not released on error path (no `using`, `with`, `defer`, `try-with-resources`) | File / lock / connection leaks; eventual outage |
| `error_loss_in_chain` | `raise X` without `from`, `throw new X` without inner, `errors.New(...)` losing wrapped error | Forensic chain broken; root cause invisible at SRE time |
| `wrong_http_status` | 5xx returned for client error, 200 for server error, 4xx for cancellation | Breaks alerting and SLO math |
| `retry_on_non_retryable` | Retry loop catches non-transient errors (auth, validation) | Burns budget, amplifies attacks |
| `swallowed_in_iteration` | `for x in items: try ... except: continue` w/o counter | Partial-success ships as full-success |
| `panic_on_operational` | Panic / process exit on recoverable error (timeout, validation) | Crashes amplify outages instead of degrading |
| `recover_on_programmer_error` | Catch `NullPointerException` / null-deref / assertion to "keep going" | Hides actual bugs; production runs corrupted state |

## Anti-Patterns to Flag — 7-language coverage

For each language: a BAD pattern this skill must detect, and a SAFE replacement to suggest. Detection runs on `Read` + `Grep`; no execution.

### Python 3.12+ (exception groups, contextlib.suppress)

```python
# BAD — bare except swallows KeyboardInterrupt, SystemExit, MemoryError too
try: process(user)
except: pass

# BAD — broad Exception, log-and-continue, caller gets None
try: charge_card(user, amount)
except Exception as e:
    logger.error(f"charge failed: {e}")          # string concat → log injection risk
    return None                                  # caller never learns it failed

# BAD — losing the cause chain (Python 3 implicit chaining still preserves __context__,
# but explicit `from` is required for clean tracebacks; `from None` silences forensics)
try: parse(s)
except ValueError:
    raise ApiError("bad input") from None        # __cause__ destroyed

# BAD — TaskGroup error swallowed in pre-3.11 style; 3.11+ requires ExceptionGroup handling
async def run():
    async with asyncio.TaskGroup() as tg:
        tg.create_task(a()); tg.create_task(b())

# SAFE — specific, logged with exc_info + structured fields, transformed to typed error
try:
    charge_card(user, amount)
except CardDeclined as e:
    log.warning("card declined", extra={"user_id": user.id, "code": e.code})
    raise PaymentRejected(code=e.code, user_id=user.id) from e
except StripeAPIError as e:
    log.error("stripe infra failure", extra={"user_id": user.id}, exc_info=True)
    metrics.increment("payment.infra_error")
    raise                                         # re-raise; supervisor decides

# SAFE — contextlib.suppress is intentional and narrow
from contextlib import suppress
with suppress(FileNotFoundError):
    os.remove(temp_path)                          # explicit, single exception type

# SAFE — Python 3.11+ except* with ExceptionGroup for TaskGroup
try:
    async with asyncio.TaskGroup() as tg:
        tg.create_task(a()); tg.create_task(b())
except* HTTPError as eg:
    for e in eg.exceptions: log.warning("http subtask failed", exc_info=e)
except* asyncio.CancelledError:
    pass                                          # cancellation is not failure
```

### TypeScript / JavaScript (Result<T,E>, neverthrow, Effect, AbortError)

```typescript
// BAD — empty catch
try { await processPayment(p); } catch { /* nothing */ }

// BAD — broad catch, return-null pattern, error context lost
async function getUser(id: string): Promise<User | null> {
  try { return await db.users.find(id); }
  catch (e) { console.error("getUser failed", e); return null; }
}

// BAD — async void / floating promise (no .catch, no await)
function fireAndForget() {
  sendAnalytics(event);                           // unhandled rejection on Node ≥15 = crash
}

// BAD — catching AbortError as failure (it's cancellation)
try { await fetch(url, { signal: ctrl.signal }); }
catch (e) { logger.error("fetch failed", e); }    // AbortError noisy-logs every cancel

// SAFE — Result<T, E> via neverthrow keeps the error in the type
import { Result, ok, err } from "neverthrow";
async function getUser(id: string): Promise<Result<User, UserError>> {
  try { return ok(await db.users.find(id)); }
  catch (e) {
    if (e instanceof NotFoundError) return err({ kind: "not_found", id });
    log.error({ id, err: e }, "db read failed");
    return err({ kind: "infra", cause: e });      // typed; caller must handle
  }
}

// SAFE — explicit await + typed catch, distinguish cancellation
try { await fetch(url, { signal: ctrl.signal }); }
catch (e) {
  if (e instanceof DOMException && e.name === "AbortError") return;  // cancellation
  log.error({ url, err: e }, "fetch failed");
  throw new FetchFailed(url, { cause: e });       // ES2022 `cause` preserves chain
}

// SAFE — process-level safety net catches the unforeseen
process.on("unhandledRejection", (reason) => {
  log.fatal({ reason }, "unhandled rejection — crashing");
  process.exit(1);                                 // Node ≥15 default; make explicit
});
```

### C# / .NET 9 (Exception filters, Result patterns, ProblemDetails)

```csharp
// BAD — empty catch + swallow
try { ChargeCard(user, amount); } catch { }

// BAD — broad catch returning default
public User? GetUser(int id) {
    try { return _db.Users.Find(id); }
    catch (Exception e) { _log.LogError(e, "lookup failed"); return null; }
}

// BAD — async void hides exceptions from caller (and from the runtime)
public async void OnClick() { await SaveAsync(); }   // never do this outside event handlers

// BAD — stack trace dumped into HTTP response
catch (Exception e) { return Results.Problem(e.ToString()); }   // info disclosure (CWE-209)

// SAFE — exception filter narrows without losing the throw site
try { ChargeCard(user, amount); }
catch (StripeException e) when (e.Code == "card_declined") {
    _log.LogWarning(e, "card declined for {UserId}", user.Id);
    return Results.Problem(
        type: "https://errors.example.com/card-declined",
        title: "Card declined",
        statusCode: 402,
        detail: "The issuer rejected the charge.");           // RFC 9457
}

// SAFE — Result<T, Error> via OneOf / language-ext / hand-rolled discriminated union
public Result<User, UserError> GetUser(int id) =>
    _db.Users.Find(id) is { } u
        ? Result.Ok(u)
        : Result.Err(new UserError.NotFound(id));

// SAFE — global ProblemDetails middleware (.NET 8/9 first-class)
builder.Services.AddProblemDetails(opts => {
    opts.CustomizeProblemDetails = ctx => {
        ctx.ProblemDetails.Extensions["traceId"] = ctx.HttpContext.TraceIdentifier;
    };
});
app.UseExceptionHandler();   // returns application/problem+json

// SAFE — Roslyn enforces correct rethrow
catch (DbException e) {
    _log.LogError(e, "db error");
    throw;                    // not `throw e;` — that resets the stack (CA2200)
}
```

### Java 21+ (sealed exceptions, checked vs unchecked, virtual threads)

```java
// BAD — broad catch on Exception, swallow into null
public User getUser(long id) {
    try { return repo.findById(id); }
    catch (Exception e) { log.error("lookup failed", e); return null; }
}

// BAD — catching Throwable hides OutOfMemoryError, InterruptedException
try { work(); }
catch (Throwable t) { /* hide everything */ }

// BAD — losing cause when re-wrapping
catch (SQLException e) { throw new ServiceException("db failed"); }   // cause lost

// BAD — InterruptedException swallowed (must restore interrupt status)
try { Thread.sleep(1000); }
catch (InterruptedException e) { /* nothing — interrupt lost forever */ }

// SAFE — narrow catch, structured log (SLF4J parameterized), cause preserved
try { repo.findById(id); }
catch (DataAccessException e) {
    log.error("user lookup failed for id={}", id, e);
    throw new UserLookupException("could not load user " + id, e);    // cause chain intact
}

// SAFE — InterruptedException handling restores interrupt status
catch (InterruptedException e) {
    Thread.currentThread().interrupt();           // mandatory
    throw new ServiceException("interrupted while sleeping", e);
}

// SAFE — Java 21 sealed exception hierarchy lets pattern-matching enforce exhaustiveness
sealed interface PaymentError permits CardDeclined, InsufficientFunds, GatewayDown {}
public Result<Receipt, PaymentError> charge(...) { ... }

// SAFE — try-with-resources releases on every exit path
try (var conn = ds.getConnection();
     var ps = conn.prepareStatement(SQL)) { ... }
```

### C (C17 / C23 — errno, return-code conventions)

```c
/* BAD — ignored return value; errno never checked */
fopen("/etc/passwd", "r");                /* leak if open succeeded, undetectable if not */

/* BAD — errno checked AFTER another call that overwrites it */
FILE *f = fopen(path, "r");
log_msg("opened");                        /* log_msg may set errno */
if (errno) { /* WRONG — errno already clobbered */ }

/* BAD — no cleanup on error path */
char *buf = malloc(SIZE);
if (process(buf) < 0) return -1;          /* leak: buf never freed */

/* SAFE — check return, capture errno immediately, single-exit cleanup */
FILE *f = fopen(path, "r");
if (!f) {
    int e = errno;                        /* capture before anything else */
    log_error("open %s: %s", path, strerror(e));
    return -e;                            /* signal error to caller */
}

/* SAFE — single-exit pattern with goto-cleanup (idiomatic in kernel / libcurl / OpenSSL) */
int do_work(const char *path) {
    int rc = -1;
    FILE *f = NULL;
    char *buf = NULL;

    f = fopen(path, "r"); if (!f) { rc = -errno; goto out; }
    buf = malloc(SIZE);   if (!buf) { rc = -ENOMEM; goto out; }
    if (process(buf, f) < 0) { rc = -EIO; goto out; }
    rc = 0;
out:
    if (buf) free(buf);
    if (f) fclose(f);
    return rc;
}

/* SAFE — C23 ckd_add / ckd_sub for overflow-checked arithmetic returns explicit failure */
size_t total;
if (ckd_add(&total, count, extra)) {
    return -EOVERFLOW;                    /* failure surfaced, not silent wraparound */
}
```

### C++ (20/23 — std::expected, RAII, no-leak on throw)

```cpp
// BAD — leaks on throw because raw new / delete are not RAII
void load() {
    Buffer* b = new Buffer(SIZE);
    parse(b);                             // throws → b leaks
    delete b;
}

// BAD — catch-all that swallows
try { work(); } catch (...) { /* nothing */ }

// BAD — exception in destructor (terminates if another exception is propagating)
~Resource() { release(); /* throws */ }

// SAFE — RAII: destructor runs even on throw; no leak possible
void load() {
    auto b = std::make_unique<Buffer>(SIZE);
    parse(*b);                            // throws → unique_ptr releases
}

// SAFE — C++23 std::expected for predictable failures (no throw on hot path)
std::expected<User, UserError> get_user(int id) {
    auto row = db.find(id);
    if (!row) return std::unexpected(UserError::NotFound);
    return User::from_row(*row);
}

// caller handles via .has_value() / .and_then() / .or_else()
auto u = get_user(id);
if (!u) { log_warn("user {} not found", id); return Status::NotFound; }

// SAFE — destructors must be noexcept; absorb-and-log there
~Resource() noexcept {
    try { release(); }
    catch (const std::exception& e) { log_error("release failed: {}", e.what()); }
}

// SAFE — catch by reference, narrow, re-throw with std::throw_with_nested for chain
try { do_io(); }
catch (const std::ios_base::failure& e) {
    std::throw_with_nested(ServiceError("io subsystem failed"));
}
```

### SQL (T-SQL TRY/CATCH, PL/pgSQL SAVEPOINT / ROLLBACK TO)

```sql
-- BAD (T-SQL) — TRY/CATCH that swallows; transaction left in doomed state
BEGIN TRY
  BEGIN TRAN
    UPDATE Orders SET Status = 'paid' WHERE Id = @id;
    EXEC ChargeCard @id;
  COMMIT;
END TRY
BEGIN CATCH
  /* nothing — transaction may be uncommittable; next statement fails mysteriously */
END CATCH;

-- BAD (PL/pgSQL) — exception block silently absorbs and continues
BEGIN
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
EXCEPTION WHEN OTHERS THEN
  -- swallowed: partial transfer can ship as success
  NULL;
END;

-- SAFE (T-SQL) — check XACT_STATE, log via THROW, preserve original error
BEGIN TRY
  BEGIN TRAN;
    UPDATE Orders SET Status = 'paid' WHERE Id = @id;
    EXEC ChargeCard @id;
  COMMIT;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  INSERT INTO ErrorLog (ErrNum, ErrMsg, ErrProc, ErrLine, OccurredAt)
    VALUES (ERROR_NUMBER(), ERROR_MESSAGE(), ERROR_PROCEDURE(), ERROR_LINE(), SYSUTCDATETIME());
  THROW;   -- re-raise preserving original line / state (SQL Server 2012+)
END CATCH;

-- SAFE (PL/pgSQL) — SAVEPOINT around the risky step; rollback to savepoint, not whole txn
BEGIN
  SAVEPOINT before_transfer;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
EXCEPTION WHEN check_violation THEN
  ROLLBACK TO SAVEPOINT before_transfer;
  RAISE WARNING 'transfer rejected by check constraint: %', SQLERRM;
  RAISE;   -- propagate so caller knows
END;
```

## Scan Methodology

### Phase 1: Pattern Sweep
```bash
# Python
rg --type py "except\s*:|except\s+Exception(\s+as\s+\w+)?:\s*(pass|return None|continue)" .
rg --type py "raise\s+\w+\(.*\)\s+from\s+None"                # explicit cause-loss
rg --type py "asyncio\.create_task\(" -A 2 | rg -v "await|gather|TaskGroup"

# TypeScript / JavaScript
rg --type ts --type js "catch\s*\{\s*\}|catch\s*\([^)]+\)\s*\{\s*\}"
rg --type ts --type js "\.catch\(\s*\(\s*\)\s*=>\s*\{?\s*\}?\)"
rg --type ts "async\s+\w+.*:\s*Promise<\w+\s*\|\s*null>"      # null-on-failure smell

# C#
rg --type cs "catch\s*\([^)]+\)\s*\{\s*\}|catch\s*\{\s*\}"
rg --type cs "throw\s+\w+;"                                    # CA2200: rethrow loses stack
rg --type cs "async\s+void\s+(?!On\w+)"                        # async void outside handlers
rg --type cs "Results\.Problem\(.*\.ToString\(\)|return.*\.StackTrace" # leak

# Java
rg --type java "catch\s*\(\s*Throwable\b"
rg --type java "catch\s*\(\s*Exception\s+\w+\s*\)\s*\{[^}]*log[^}]*\}" -U
rg --type java "InterruptedException.*\{[^}]*\}" -U | rg -v "interrupt\(\)"

# C
rg --type c "errno" -B 2 | rg -B 2 "errno" -A 0    # errno checked before next syscall?
rg --type c "fopen|malloc|open\(" -A 3 | rg -v "if\s*\(!|== NULL|< 0"

# C++
rg --type cpp "catch\s*\(\s*\.\.\.\s*\)\s*\{\s*\}"
rg --type cpp "~\w+\s*\([^)]*\)\s*\{[^}]*throw"      # throwing destructor

# SQL
rg --type sql "EXCEPTION\s+WHEN\s+OTHERS\s+THEN\s+NULL"
rg "BEGIN CATCH[^E]*END CATCH" -U
```

### Phase 2: Data-Flow Audit
For each finding: trace whether the caught error has any consumer (re-raise, return-Result, structured log + metric). If none of the three, it is a swallowed error.

### Phase 3: Response Shape Audit
For HTTP handlers, verify every error path returns an RFC 9457 `application/problem+json` body (or framework equivalent), not a stack trace and not a custom ad-hoc shape.

### Phase 4: Async / Resource Audit
- Every `async` function called: awaited or `.catch`-ed?
- Every resource opened: paired `with` / `using` / `defer` / try-with-resources / RAII?
- Every retry loop: bounded, exponential, distinguishes retryable from non-retryable?

## Tool Integration (2026)

| Tool | Language | What it catches |
|---|---|---|
| **ESLint** + plugins | TS/JS | `no-empty`, `no-misleading-character-class`, `@typescript-eslint/no-floating-promises`, `no-throw-literal`, custom rules for `console.error` swallow |
| **Ruff** | Python | `BLE001` blind except, `TRY002` create-your-own-exception, `TRY003` avoid long messages, `TRY200/201` use `raise from`, `TRY300/301` consider `else`, `S110/S112` try-except-pass/continue (bandit-equivalent) |
| **mypy --strict** | Python | Catches `None` returns where caller expects non-Optional; forces error type discipline |
| **Roslyn / .NET analyzers** | C# | `CA2200` rethrow correctly, `CA1031` do not catch general exception types, `CA2007` ConfigureAwait, `VSTHRD110` observe Task results, `VSTHRD200` use Task naming |
| **SonarQube / SonarCloud** | multi | S2221 broad catch, S108 empty block, S1166 log+rethrow, S1696 NullPointerException catch, S2139 log-and-throw same exception |
| **SpotBugs / ErrorProne** | Java | `DE_MIGHT_IGNORE` empty catch, `REC_CATCH_EXCEPTION` broad catch, `RV_RETURN_VALUE_IGNORED` ignored return, `OS_OPEN_STREAM` resource leak |
| **clang-tidy** | C/C++ | `bugprone-empty-catch`, `cert-err58-cpp` (init throw), `cppcoreguidelines-no-malloc`, `bugprone-throw-keyword-missing` |
| **Sentry / Bugsnag / Rollbar** | runtime | Surfaces unhandled rejections / exceptions in prod that static analysis cannot see |
| **OpenTelemetry** | runtime | Span status `Error` + `exception.type` / `exception.stacktrace` attributes; trace-linked error visibility |

CI gate: every finding this skill emits is `severity: critical` on the wire (warnings-are-bugs). Locally, the analyzer SARIF feeds into the GitHub code-scanning dashboard alongside SAST.

## Severity reconciliation (internal triage vs. refinement-loop output)

Internal triage view used in human-readable reports below. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization; the letter's `severity` is always `critical`.

| Triage tier | Examples | Internal action |
|---|---|---|
| CRITICAL | Empty catch on payment / auth path; stack trace in API response; `recover_on_programmer_error`; async void on background-saved data | BLOCK |
| HIGH | Broad catch + log-and-continue on infra calls; missing `from` in re-raise; missing try-with-resources / using / defer; wrong HTTP 5xx for client error | BLOCK |
| MEDIUM | Inconsistent error shape across endpoints; retry on non-retryable; AbortError treated as failure (noise) | Fix soon |
| LOW | String-concat log lines (no injectable input); missing `else` after try | Backlog |

## Output Format (human-readable)

```markdown
## Error Handling Report

### Coverage
| Aspect | Coverage |
|--------|----------|
| Try/catch blocks reviewed | 100% |
| Specific (non-broad) exception types | 73% |
| Errors logged with structured context | 64% |
| Error responses conform to RFC 9457 | 41% |
| Async paths with .catch / try await | 88% |
| Resource handlers (using/with/defer/RAII) | 92% |
| Retry logic differentiates transient vs permanent | 58% |

### Anti-Patterns
| error_kind | Count | Triage |
|---|---|---|
| empty_catch | 3 | CRITICAL |
| broad_catch | 7 | HIGH |
| log_and_continue | 5 | HIGH |
| stack_trace_in_response | 2 | CRITICAL |
| async_unhandled | 4 | CRITICAL |
| error_loss_in_chain | 6 | HIGH |
| inconsistent_error_shape | 1 | MEDIUM |
| wrong_http_status | 3 | HIGH |

### Critical findings
1. **empty_catch** (`services/payment.py:45`) — payment exception silently swallowed; partial-success ships as success
2. **stack_trace_in_response** (`api/orders.py:23`) — `Results.Problem(e.ToString())` leaks file paths + dependency versions (CWE-209)
3. **async_unhandled** (`workers/email.ts:88`) — `sendWelcomeEmail()` floats; Node ≥15 will crash on rejection
4. **recover_on_programmer_error** (`core/cache.java:112`) — catching `NullPointerException` masks a contract violation

### Missing error paths
| Function | Missing |
|---|---|
| fetch_user | Network timeout, DNS resolution failure |
| save_order | Constraint violation, deadlock retry |
| send_email | Transient 5xx retry; bounce handling |
| upload_avatar | Disk full, quota exceeded |

### Recommendations
1. Replace bare `except` with the specific exception type; chain via `raise X from e`.
2. Adopt RFC 9457 `application/problem+json` for every HTTP error response.
3. Add `await` (or `.catch`) on every async call site flagged in `async_unhandled`.
4. Wire `process.on('unhandledRejection')` / .NET `AppDomain.UnhandledException` / JVM `Thread.UncaughtExceptionHandler` as last-resort net.
5. Move predictable failures to `Result<T, E>` / `std::expected` / `neverthrow` so callers must handle them.
```

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>     # fingerprint for dedup
severity: critical                                    # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                       # high = clear sink + no recovery; low = pattern-only
engine: ruff | eslint | roslyn | sonar | spotbugs | clang-tidy | manual
rule_id: <tool's rule id, e.g. ruff.BLE001>
error_kind: empty_catch | broad_catch | log_and_continue | stack_trace_in_response | inconsistent_error_shape | async_unhandled | missing_finally | error_loss_in_chain | wrong_http_status | retry_on_non_retryable | swallowed_in_iteration | panic_on_operational | recover_on_programmer_error
target_file: src/services/payment.py
line: 45
exception_class: "Exception"                          # what was caught (or "<bare>" for empty)
language: python | typescript | csharp | java | c | cpp | sql | other
suggested_fix: "Replace bare except with except StripeAPIError; log with exc_info=True; raise PaymentInfraError(...) from e"
message: "Bare except in payment flow swallows all errors including KeyboardInterrupt; caller receives None and treats failed charge as success"
reference: https://www.rfc-editor.org/rfc/rfc9457.html
```

The integrator uses `confidence` to weight findings: `confidence: high` (e.g. empty body, demonstrably no consumer) blocks phase advancement alone; `confidence: low` (pattern-only, possibly intentional) requires corroboration or a documented decision in `## Decisions Taken Under Ambiguity` before advancing.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
