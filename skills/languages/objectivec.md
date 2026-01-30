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

## Version Gotchas
- **Consider Swift**: New iOS code should prefer Swift 6
- **Bridging**: Use `NS_SWIFT_NAME` for better Swift interop
- **Nullability**: Required for Swift bridging
- **KVO**: Remove observers in `dealloc` to avoid crashes
- **With Swift**: Obj-C headers need nullability for proper optionals
