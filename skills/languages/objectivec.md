# Objective-C CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses manual retain/release — use ARC always
- Claude forgets nullability annotations — add to all public APIs
- Claude creates massive view controllers — use MVVM/coordination
- Claude blocks main thread — use GCD/async patterns

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `xcode 16+` | Latest IDE | Older Xcode |
| `clang-format` | Formatting | Manual style |
| `oclint` | Static analysis | Just compiler |
| `xctest` | Testing | Ad-hoc tests |
| `instruments` | Profiling | Guessing perf |

## Patterns Claude Should Use
```objc
// Always use nullability annotations
- (nullable User *)findUserWithId:(nonnull NSString *)userId;

// Modern Objective-C syntax
NSDictionary *dict = @{@"key": @"value"};
NSArray *array = @[@"one", @"two"];
NSNumber *num = @42;

// Weak references in blocks to avoid retain cycles
__weak typeof(self) weakSelf = self;
[self fetchDataWithCompletion:^(NSData *data) {
    __strong typeof(weakSelf) strongSelf = weakSelf;
    if (!strongSelf) return;
    [strongSelf processData:data];
}];

// Use GCD for async work
dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    NSData *data = [self expensiveOperation];
    dispatch_async(dispatch_get_main_queue(), ^{
        [self updateUIWithData:data];
    });
});
```

## Anti-Patterns Claude Generates
- Manual retain/release — use ARC
- Missing `nullable`/`nonnull` — annotate all public APIs
- Massive view controllers — split logic out
- Strong self in blocks — use weak/strong dance
- Blocking main thread — use GCD queues

## Memory / ARC Footguns
**ARC (Automatic Reference Counting)** inserts `retain`/`release` at compile time — it is
**not** a garbage collector, so **retain cycles leak**. clang's ARC is the reference for
the ownership rules. [clang.llvm.org/docs/AutomaticReferenceCounting.html, retrieved 2026-07-10]

- **Retain cycles → leaks.** A block that captures `self` strongly while `self` (directly
  or via a property) retains the block forms a cycle neither side releases. Break it with
  the weak/strong dance: capture `__weak typeof(self) weakSelf = self;` then re-`__strong`
  inside the block.
- **Ownership qualifiers.** `strong` (default, retains), `weak` (zeroing, auto-nil on
  dealloc — use for delegates/back-references), `unsafe_unretained` (non-zeroing — a
  dangling pointer after dealloc, avoid unless required for pre-ARC interop).
- **`dealloc` timing.** With ARC you don't write `release`, but you **do** clean up
  non-ARC resources and remove KVO/`NSNotificationCenter` observers in `dealloc`, or you
  crash on the next notification to a freed object.
- **Toll-free bridging (CF ↔ NS).** Core Foundation types are not ARC-managed. Use
  `__bridge` (no ownership transfer), `__bridge_transfer` (CF→NS, ARC takes ownership /
  balances a `Create`/`Copy`), `__bridge_retained` (NS→CF, you own the `CFRelease`).
  Getting these wrong double-frees or leaks.

```objc
// Break the retain cycle: weak capture, then strong inside the block.
__weak typeof(self) weakSelf = self;
[self.loader fetchWithCompletion:^(NSData *data) {
    __strong typeof(weakSelf) strongSelf = weakSelf;   // nil if self was freed
    if (!strongSelf) { return; }
    [strongSelf handleData:data];
}];
```

## Concurrency Footguns
- **GCD (`dispatch_async`).** Blocks dispatched onto a queue that capture `self` are the
  most common retain-cycle source; use `weakSelf` for long-lived/repeating work.
- **Main-thread-only UIKit/AppKit.** UI mutations off the main thread cause undefined
  behavior/crashes. Marshal UI work back with `dispatch_async(dispatch_get_main_queue(), …)`.
- **`@synchronized(obj)`** is convenient but comparatively expensive (recursive lock +
  exception unwinding); prefer a dedicated serial `dispatch_queue_t` or `os_unfair_lock`
  for hot paths.

## Error Handling Idioms
- **`NSError **` out-param convention.** The canonical Cocoa pattern returns a `BOOL`
  (or object) and fills an `NSError **`. **Check the return value first**, not the error
  pointer — the error is only guaranteed meaningful when the method signals failure.
- **`@try`/`@catch` is for programmer errors only.** Objective-C exceptions signal
  unrecoverable bugs (out-of-bounds, unrecognized selector), not routine failure; don't
  use them for control flow. Recoverable errors flow through `NSError`.
- **`nil`-messaging is a silent no-op.** Sending a message to `nil` returns
  zero/`nil`/`NO` with no crash — convenient, but it can mask a missing object and
  produce silently wrong results. Assert non-nil where correctness depends on it.

```objc
NSError *error = nil;
BOOL ok = [store save:record error:&error];   // check the BOOL, not error, first
if (!ok) {
    NSLog(@"save failed: %@", error.localizedDescription);
    return NO;
}
```

## Security and Dependency Gotchas
- **Format-string vulnerability — CWE-134.** `[NSString stringWithFormat:userInput]` or
  `NSLog(userInput)` with attacker data lets `%@`/`%n`-style specifiers read the stack /
  crash. The format string must be a **literal**: `[NSString stringWithFormat:@"%@", userInput]`.
  [cwe.mitre.org/data/definitions/134.html, retrieved 2026-07-10]
- **Unsafe deserialization — CWE-502.** `NSKeyedUnarchiver` on untrusted data can
  instantiate arbitrary classes. Use secure coding:
  `unarchivedObjectOfClass:fromData:error:` with `requiringSecureCoding = YES`, and
  conform your model to `NSSecureCoding`.
  [developer.apple.com/documentation/foundation/nssecurecoding, retrieved 2026-07-10]
- **Dependency pinning.** Pin exact versions in CocoaPods (`Podfile.lock`) and Swift
  Package Manager (`Package.resolved`); an unpinned transitive dependency is a
  supply-chain risk.

## Testing Conventions
- **XCTest** — the first-party framework (`XCTAssert*`, `measureBlock:` for perf,
  async expectations). [developer.apple.com/documentation/xctest, retrieved 2026-07-10]
- **OCMock** — mocking/stubbing for isolating collaborators.
- **Xcode code coverage** — enable per-scheme; gate CI on coverage of new code.

## Performance Traps
- **Autorelease-pool growth in loops.** A tight loop creating many temporary objects
  balloons memory until the pool drains; wrap the loop body in `@autoreleasepool { … }`
  to bound peak usage.
- **Message-send overhead.** `objc_msgSend` dynamic dispatch is slower than a C call in
  hot inner loops; drop to C/pointer math where profiling shows it matters.
- **`copy` of large collections.** A `copy` property on a big `NSArray`/`NSDictionary`
  deep-copies on assignment; use `strong` when a defensive copy isn't needed.
- **KVO overhead.** Key-value observing adds isa-swizzling and notification cost; avoid
  it on high-frequency properties.

## Version-Specific Gotchas
- **Nullability annotations** (`nullable`/`nonnull`, `NS_ASSUME_NONNULL_BEGIN/END`) are
  required for clean Swift bridging — an unannotated pointer imports as an implicitly
  unwrapped optional. [developer.apple.com/documentation/objectivec, retrieved 2026-07-10]
- **Lightweight generics** (`NSArray<NSString *> *`) give compile-time element typing and
  better Swift interop.
- **`NS_SWIFT_NAME`** renames symbols for idiomatic Swift; **Swift 6** is the preferred
  language for new iOS code.
- **KVO**: remove observers in `dealloc` to avoid crashes (see Memory footguns).

## References (retrieved 2026-07-10)
- Objective-C runtime & language docs: https://developer.apple.com/documentation/objectivec
- clang Automatic Reference Counting (ARC ownership rules): https://clang.llvm.org/docs/AutomaticReferenceCounting.html
- NSSecureCoding (safe unarchiving): https://developer.apple.com/documentation/foundation/nssecurecoding
- XCTest framework: https://developer.apple.com/documentation/xctest
- CWE-134 Externally-Controlled Format String: https://cwe.mitre.org/data/definitions/134.html
- CWE-502 Deserialization of Untrusted Data: https://cwe.mitre.org/data/definitions/502.html
