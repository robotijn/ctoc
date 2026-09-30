---
name: ai-code-quality-reviewer
description: The method behind the ai-code-quality-reviewer agent for reviewing code that a large-language-model coding assistant wrote, across ten defect classes — a misread request, incomplete or stub output, missing edge cases, over-engineering, fabricated patterns, hallucinated imports, stale framework idioms, vacuous tests, tests changed to pass, and changes to a coding assistant's own configuration.
type: skill
when_to_load:
  - "AI-generated code"
  - "review AI code"
  - "LLM output review"
  - "AI quality check"
  - "AI code audit"
  - "AI code review"
  - "Copilot review"
  - "Cursor review"
  - "Claude Code review"
related_skills:
  - ai-quality/hallucination-detector
  - quality/code-reviewer
  - quality/code-smell-detector
  - security/sast-scanner
  - security/dependency-auditor
  - security/concurrency-checker
  - security/dependency-checker
  - security/secrets-detector
  - quality/type-checker
  - quality/dead-code-detector
  - quality/duplicate-code-detector
  - specialized/error-handler-checker
  - documentation/documentation-updater
  - testing/runners/mutation-test-runner
  - ai-quality/llm-security-tester
  - compliance/sbom-cra-checker
effort_level: high
tools: Read, Grep
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# AI Code Quality Reviewer (skill)

> The method for the agent `agents/ai-quality/ai-code-quality-reviewer.md`, which reads this file in full before a review. Where the two disagree, the agent wins, and its type names are the ones to report.
> The `when_to_load` phrases are matched by the trigger test in `tests/skill-loading.test.js`; no code under `src/` reads them.

## Role

You review code that a large-language-model coding assistant wrote, for the ten classes the agent names: a misread request, incomplete output, missing edge cases, over-engineering, fabricated patterns, hallucinated imports, stale framework idioms, vacuous tests, tests changed to pass, and changes to a coding assistant's configuration. Read every line as a claim to check. Google's review guide allows a reviewer to scan "data files, generated code, or large data structures" but not "a human-written class, function, or block of code" (https://google.github.io/eng-practices/review/reviewer/looking-for.html, read 2026-09-30); this skill gives assistant-written code the full reading the guide requires for human-written code, not the scan it allows for generated code. NIST Special Publication 800-218, the Secure Software Development Framework, sets the scope of code review by the form of the code, not by who wrote it: "Human-readable code includes source code, scripts, and any other form of code that an organization deems human-readable." (practice PW.7, https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf, read 2026-09-30, page 14). Report what the lines show, and never call a defect typical of, or specific to, assistant-written code unless this file cites a measurement for that class; one large comparison found assistant-written code less complex than human-written code, not more (see "General review examples").

## 2026 Best Practices (AI Quality category)

- **Every assistant-written change gets a human review** — this project allows no exception and no fast-track. The French Cybersecurity Agency and the German Federal Office for Information Security recommend it: "Generated source code should generally be checked and reproduced by the developers. A critical review should be carried out particularly with regard to hallucinations and security risks." (joint report "AI Coding Assistants", https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf, read 2026-09-30, page 12). It is often missing: a 2026 study of agent-authored pull requests in repositories with at least 100 stars found "84.0% (28246/33596) of agent-authored PRs either receive no recorded review or are reviewed exclusively by agents" (https://arxiv.org/html/2605.02273, read 2026-09-30), while warning that "The absence of review comments does not imply that the code was not reviewed".
- **Assume errors until the lines show otherwise.** In the 2025 Stack Overflow Developer Survey, "The biggest single frustration, cited by 66% of developers, is dealing with 'AI solutions that are almost right, but not quite,'" and 45.2% chose "Debugging AI-generated code is more time-consuming" (https://survey.stackoverflow.co/2025/ai, read 2026-09-30). Review skeptically, line by line: the joint French and German report warns that "even flawed solutions are well-worded" and that "Studies show a cognitive bias when using AI coding assistants, as many developers perceive them as secure, although security vulnerabilities are regularly identified." (page 8).
- **Confirm every new import against the manifests and lockfiles you can read, and hand the rest to hallucination-detector.** Spracklen and colleagues (USENIX Security 2025) report that "we generate 576,000 code samples" and that "the average percentage of hallucinated packages is at least 5.2% for commercial models and 21.7%" (https://arxiv.org/abs/2406.10279, read 2026-09-30); of the packages those samples import, "2.23 million packages ... of which 440,445 (19.7%) were determined to be hallucinations" (https://arxiv.org/html/2406.10279, read 2026-09-30). Whether a package exists on its registry is hallucination-detector's check, not this skill's (category A).
- **Provenance and signatures are not checks this skill can run.** npm documents that "When an npm package is published with provenance, it is signed by Sigstore public good servers and logged in a public transparency ledger." (https://docs.npmjs.com/generating-provenance-statements, read 2026-09-30), and PEP 740 is "Index support for digital attestations (Status: Final)" (https://peps.python.org/pep-0740/, read 2026-09-30). Read and Grep can verify neither; record both under `self_assessment.unknowns` as not checked.
- **Read every assistant-written test against the specification.** Konstantinou, Degiovanni and Papadakis, studying 24 Java repositories, found "LLM-based test generation approaches are also prone on generating oracles that capture the actual program behaviour rather than the expected one." (https://arxiv.org/abs/2410.21136, read 2026-09-30); the same abstract finds these oracles have "higher fault detection potential than the Evosuite ones". A coverage number from such a suite says nothing until each assertion is read (category C).
- **Check for outdated interfaces and framework-version mismatch.** Wang and colleagues tested "seven advanced LLMs, 145 API mappings from eight popular Python libraries, and 28,125 completion prompts" (https://arxiv.org/abs/2406.09834, read 2026-09-30) and found that "The DUR of the LLMs for the overall dataset ranges from 25% to 38%" (https://arxiv.org/html/2406.09834, read 2026-09-30), the DUR being the deprecated usage rate; the study covers Python only. The joint French and German report names a cause: "One cause of these security flaws is the use of outdated programs in the training data of the AI models, leading to the suggestion of outdated and insecure best practices." (page 9). Read the project's framework version *before* approving any "modernization" (categories B and F).
- **Hand the security pass to sast-scanner.** Veracode's 2025 report found that "45% of code samples failed security tests and introduced OWASP Top 10 security vulnerabilities into the code." (https://www.veracode.com/blog/genai-code-security-report/, read 2026-09-30); its Spring 2026 Update, that "security pass rates remain stubbornly stuck at approximately 55% – virtually identical to where they stood two years ago" (https://www.veracode.com/blog/spring-2026-genai-code-security/, read 2026-09-30); and its 2026 report, that "the average security pass rate across models is 56% – barely changed from 55%" (https://www.veracode.com/blog/2026-genai-code-security-report-ai-risk/, read 2026-09-30). This skill records the security defects it sees for sast-scanner; it does not report them itself.
- **Compare the diff with the plan's `## Decisions Taken Under Ambiguity` section.** A silent reversal of an entry is a finding of type `prompt_drift`, severity critical.
- **Check every edit against the stated scope.** Tambon and colleagues measured statements unrelated to the task at "8.15%", "statements that are unrelated to the task specification." (https://arxiv.org/pdf/2403.08937, read 2026-09-30), in generated functions rather than edits to other files. A change to a file the plan's `files:` list does not name is a `misread_request`.

## General review examples

These examples show defects to recognise. Google's review guide names two of them as review questions: "Reviewers should be especially vigilant about over-engineering." and "Usually comments are useful when they explain why some code exists, and should not be explaining what some code is doing." (https://google.github.io/eng-practices/review/reviewer/looking-for.html, read 2026-09-30). None is claimed to occur more often in assistant-written code except missing edge cases, which Tambon and colleagues measured: "Missing Corner Cases 15.27% ... The generated code operates correctly, except for overlooking certain corner cases." (https://arxiv.org/pdf/2403.08937, read 2026-09-30). For complexity one large comparison points the other way: "AI-generated code is generally simpler and more repetitive, yet more prone to unused constructs and hardcoded debugging, while human-written code exhibits greater structural complexity and a higher concentration of maintainability issues." (https://arxiv.org/html/2508.21634, read 2026-09-30). Sections 2 to 5 are handed on to code-reviewer and section 7 to concurrency-checker, as the agent's hand-on list says: record them under `self_assessment.unknowns`, do not report them.

### 1. Over-Engineering
```typescript
// AI ANTI-PATTERN
class StringManipulator {
  private str: string;
  constructor(str: string) { this.str = str; }
  capitalize(): string {
    return this.str.charAt(0).toUpperCase() + this.str.slice(1);
  }
}

// BETTER
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
```

### 2. Verbose Naming
```typescript
// AI ANTI-PATTERN
const userEmailAddressValidationResultBoolean = validateEmail(email);

// BETTER
const isValidEmail = validateEmail(email);
```

### 3. Excessive Comments
```typescript
// AI ANTI-PATTERN
// This function adds two numbers together
function add(a: number, b: number): number {
  // Add a and b
  return a + b; // Return the result
}

// BETTER
function add(a: number, b: number): number {
  return a + b;
}
```

### 4. Inconsistent Style
```typescript
// AI ANTI-PATTERN — one function awaits, the next chains .then() in the same file
async function fetchUser(id: string) { return await api.get(`/users/${id}`); }
function fetchOrders(id: string) {
  return api.get(`/orders/${id}`).then((res) => res.data);
}

// BETTER — one style in the file
async function fetchOrders(id: string) {
  const res = await api.get(`/orders/${id}`);
  return res.data;
}
```

### 5. Unnecessary Complexity
```typescript
// AI ANTI-PATTERN
const result = items.reduce((acc, item) => {
  if (item.active) return [...acc, item.value];
  return acc;
}, []);

// BETTER
const result = items.filter(item => item.active).map(item => item.value);
```

### 6. Missing Edge Cases
```typescript
// AI ANTI-PATTERN
function divide(a: number, b: number): number { return a / b; }

// BETTER
function divide(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero');
  return a / b;
}
```

```c
/* C (C17/23) — AI ANTI-PATTERN: division by zero, and INT_MIN / -1, are undefined behaviour */
int divide(int a, int b) { return a / b; }

/* BETTER — refuse both inputs */
#include <limits.h>
int checked_divide(int a, int b, int *out) {
  if (b == 0 || (a == INT_MIN && b == -1)) return 0;
  *out = a / b;
  return 1;
}
```

cppreference: "If the second operand is zero, the behavior is undefined", and "If the quotient a/b is not representable in the result type, the behavior of both a/b and a%b is undefined (that means INT_MIN%-1 is undefined on 2's complement systems)" (https://en.cppreference.com/w/c/language/operator_arithmetic, read 2026-09-30). MITRE's CWE-369 describes the weakness: "The product divides a value by zero." (https://cwe.mitre.org/data/definitions/369.html, read 2026-09-30); its own code examples are not used here.

### 7. Incorrect Async Handling
```typescript
// AI ANTI-PATTERN — fire and forget
items.forEach(async (item) => { await processItem(item); });

// BETTER
await Promise.all(items.map(item => processItem(item)));
```

## Review categories

These are the classes the agent reports, plus three it hands on (D, E and G), kept so the reviewer can recognise them. Each names the agent that owns the deeper check.

### A. Hallucinated import / fictional package

The model emits an `import` / `require` / `using` / `from ... import` naming a package that no manifest or lockfile you read contains. Spracklen and colleagues found that "43% of hallucinated packages were repeated in all 10 queries, while 39% did not repeat at all across the 10 queries" (https://arxiv.org/html/2406.10279, read 2026-09-30), so a name a model invents again and again can be registered by someone else first. A real case is `react-codeshift`, a conflation of `jscodeshift` and `react-codemod`. Its npm record's description is "Placeholder to prevent dependency confusion." (created 2026-01-14, one version; https://registry.npmjs.org/react-codeshift, read 2026-09-30), and a researcher at Aikido registered it first: "In January 2026, Charlie claimed this npm package called `react-codeshift`. ... The package wasn't real, had no author, and definitely hadn't been registered before." (https://www.aikido.dev/blog/slopsquatting-ai-package-hallucination-attacks, read 2026-09-30). A name that resolves on the registry is therefore not proof that it is the package the code meant.

Hand on: hallucination-detector checks whether a package exists on its registry and whether a name that resolves is a look-alike. This skill flags the import as unconfirmed. Where the project keeps a software bill of materials, whether a new dependency appears in it correctly is sbom-cra-checker's check: record the dependency under `self_assessment.unknowns` with that agent's name. The joint French and German report explains why the bill matters: "The creation of a Software Bill of Materials (SBOM) allows you to retrospectively understand whether vulnerable libraries were used and enables a targeted response if a vulnerability of certain components becomes known." (https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf, read 2026-09-30, page 10).

Where the dispatch or the plan names a list of permitted packages, an import of a real package that is not on it is a finding too, type `package_not_allowlisted`, severity medium; it is not a hallucination, so it is not handed on. The same report: "If there are guidelines in the company as to which packages can be used as part of a development and which cannot, a whitelisting of permitted packages could be carried out." (page 10).

```typescript
// TypeScript — AI ANTI-PATTERN
import { transform } from "react-codeshift";        // resolves on npm only to a defensive placeholder
import { debounce } from "lodash-utilities";        // named in no manifest read — unconfirmed
```

```python
# Python — AI ANTI-PATTERN
import pandas_helpers          # named in no manifest read — unconfirmed
from requests_async import get  # named in no manifest read — unconfirmed
```

```csharp
// C# (.NET 9) — AI ANTI-PATTERN
using Microsoft.EntityFrameworkCore.Sqlite.Helpers;  // no package reference in the project files read provides it — unconfirmed
using Newtonsoft.Json.Async;                         // no package reference in the project files read provides it — unconfirmed
```

```java
// Java 21+ — AI ANTI-PATTERN
import com.fasterxml.jackson.databind.helpers.*;   // no dependency in the build file read provides it — unconfirmed
import org.springframework.boot.async.starter.*;   // no dependency in the build file read provides it — unconfirmed
```

Action: report type `hallucinated_import`, severity critical, confidence LOW until hallucination-detector confirms the name is absent from its registry.

### B. Deprecated API pattern in AI suggestion

The model emits code that compiles but uses an interface the project's framework version has deprecated or removed; Wang and colleagues measured this for Python libraries (see the principles above). Sources for the examples below, all read 2026-09-30: React, "In React 19, we're removing `ReactDOM.render` and you'll need to migrate to using `ReactDOM.createRoot`" (https://react.dev/blog/2024/04/25/react-19-upgrade-guide); Python, "PEP 632: Remove the `distutils` package.", on a page that adds "Setuptools ... continues to provide `distutils`" (https://docs.python.org/3/whatsnew/3.12.html), and for `asyncio.get_event_loop()`, "Deprecated since version 3.12: Deprecation warning is emitted if there is no current event loop." (https://docs.python.org/3.12/library/asyncio-eventloop.html) and "using the get_running_loop() function is preferred to get_event_loop() in coroutines and callbacks. ... Changed in version 3.14: Raises a RuntimeError if there is no current event loop.", with `asyncio.run()` recommended "instead of using these lower level functions to manually create and close an event loop" (https://docs.python.org/3/library/asyncio-eventloop.html); .NET, "Starting in .NET 8, the affected methods throw a NotSupportedException at runtime across all project types except Windows Forms and WPF." (https://learn.microsoft.com/en-us/dotnet/core/compatibility/serialization/8.0/binaryformatter-disabled), "Starting in .NET 9, the in-box BinaryFormatter implementation throws exceptions on use, even with the settings that previously enabled its use." (https://learn.microsoft.com/en-us/dotnet/standard/serialization/binaryformatter-security-guide) and, for `WebRequest`, "The following APIs are marked as obsolete, starting in .NET 6." (https://learn.microsoft.com/en-us/dotnet/fundamentals/syslib-diagnostics/syslib0014); Java, JEP 444, "Release: 21" (https://openjdk.org/jeps/444); C, `gets` was "deprecated in the third corrigendum to the C99 standard and removed altogether in the C11 standard.", and "fgets() and gets_s() are the recommended replacements." (https://en.cppreference.com/w/c/io/gets); for `fgets`, "Parsing stops if a newline character is found (in which case str will contain that newline character) or if end-of-file occurs. ... str on success, null pointer on failure." (https://en.cppreference.com/w/c/io/fgets), and cppreference's `sizeof` page warns that when `a` "has pointer type (such as after array-to-pointer conversion of function parameter type adjustment)", a size computed from it "would simply divide the number of bytes in a pointer type by the number of bytes in the pointed type" (https://en.cppreference.com/w/c/language/sizeof); C++, `std::auto_ptr` is "(deprecated in C++11) (removed in C++17) ... std::unique_ptr is preferred for this and other uses." (https://en.cppreference.com/w/cpp/memory/auto_ptr), `std::make_unique` is "(since C++14)" (https://en.cppreference.com/w/cpp/memory/unique_ptr/make_unique), and the C++ Core Guidelines state "R.23: Use make_unique() to make unique_ptrs" and, under R.11, "Warn on any explicit use of new and delete. Suggest using make_unique instead." (read on a mirror, https://cpp-core-guidelines-docs.vercel.app/resource, because both the canonical page https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines and its raw source https://raw.githubusercontent.com/isocpp/CppCoreGuidelines/master/CppCoreGuidelines.md were cut off before that section). MITRE's CWE-477 names the weakness this category catches: "The code uses deprecated or obsolete functions, which suggests that the code has not been actively reviewed or maintained." (https://cwe.mitre.org/data/definitions/477.html).

```javascript
// React 18 idiom in a React 19 project — AI ANTI-PATTERN
ReactDOM.render(<App/>, document.getElementById("root"));   // removed in React 19
// BETTER, the React 19 upgrade guide's own replacement:
import {createRoot} from 'react-dom/client';
const root = createRoot(document.getElementById('root'));
root.render(<App />);
```

```python
# Python 3.12 — AI ANTI-PATTERN: distutils import (removed in 3.12; an installed setuptools can still provide it, so the import may not fail)
from distutils.version import LooseVersion
# asyncio.get_event_loop() with no current event loop warns from 3.12 and raises RuntimeError from 3.14
# BETTER: asyncio.get_running_loop() inside coroutines and callbacks, and asyncio.run(main()) at the entry point
```

```csharp
// .NET 9 — AI ANTI-PATTERN
using System.Runtime.Serialization.Formatters.Binary;
var bf = new BinaryFormatter();           // obsolete since .NET 5; throws in most project types since .NET 8; always throws in .NET 9
WebRequest.Create(url);                   // obsolete since .NET 6 (SYSLIB0014)
```

```java
// Java 21+ — AI ANTI-PATTERN
Thread t = new Thread(() -> doWork());    // where the project has moved to virtual threads: Thread.ofVirtual() (JEP 444, Java 21)
new java.util.Date();                     // where the project uses java.time
```

```c
/* C (C17/23) — AI ANTI-PATTERN: gets() was removed in C11 */
gets(buf);
/* BETTER: fgets(), with its failure handled; buf must be an array here (sizeof of a pointer gives the pointer's size), and fgets keeps the newline */
if (fgets(buf, sizeof buf, stdin) == NULL) { /* handle end-of-file or error */ }
```

```cpp
// C++ (20/23) — AI ANTI-PATTERN: std::auto_ptr was removed in C++17
std::auto_ptr<T> p(new T);
// BETTER: std::make_unique, from <memory> (C++14; C++ Core Guidelines R.23 and R.11)
auto p = std::make_unique<T>();
```

Action: report type `stale_framework_idiom`, severity critical: this project treats every deprecation as critical (operating lesson 9 in `CLAUDE.md`: "Deprecations, compiler/linter warnings, and vulnerabilities of any severity are critical"). A `gets` call is also a security defect: MITRE's CWE-242, "The product calls a function that can never be guaranteed to work safely.", says in a demonstrative example that "gets() is inherently unsafe, because it copies all input from STDIN to the buffer without checking size." (https://cwe.mitre.org/data/definitions/242.html, read 2026-09-30). Record it under `self_assessment.unknowns` for sast-scanner as well.

### C. AI-generated test with no real assertions / pass-through assertion

The AI writes a test that asserts only that something exists, that the function ran, or that the output equals the implementation's current return value — not the specification. Coverage rises, defect detection does not. Konstantinou and colleagues found generated tests "prone on generating oracles that capture the actual program behaviour rather than the expected one" (https://arxiv.org/abs/2410.21136, read 2026-09-30). Google's review guide asks the question every test below fails: "Will the tests actually fail when the code is broken? If the code changes beneath them, will they start producing false positives?" (https://google.github.io/eng-practices/review/reviewer/looking-for.html, read 2026-09-30). A test that compares a value with itself is MITRE's CWE-571, "The product contains an expression that will always evaluate to true." (https://cwe.mitre.org/data/definitions/571.html, read 2026-09-30), provided the function is deterministic.

```typescript
// AI ANTI-PATTERN — pass-through assertion
it("computes total", () => {
  const result = computeTotal(items);
  expect(result).toBeDefined();      // passes for any non-undefined value
  expect(typeof result).toBe("number");  // passes for NaN, 0, Infinity, -1
});

// AI ANTI-PATTERN — tautology mirroring the implementation
it("returns user", () => {
  const u = getUser(1);
  expect(u).toEqual(getUser(1));     // always true for a deterministic getUser; tests nothing
});

// BETTER — assert the value the specification fixes. Where the specification sums active items only:
it("sums active items only", () => {
  expect(computeTotal([{ price: 10, active: true }, { price: 5, active: false }])).toBe(10);
});
```

```python
# Python — AI ANTI-PATTERN
def test_parse():
    assert parse("x=1") is not None     # passes for any object
    assert isinstance(parse("x=1"), dict)  # passes for {}

# BETTER — where the specification maps "x=1" to {"x": "1"}
def test_parse():
    assert parse("x=1") == {"x": "1"}
```

```cpp
// C++ (GoogleTest) — AI ANTI-PATTERN: compares the function with itself
TEST(Billing, ComputesTotal) {
  EXPECT_EQ(ComputeTotalCents({{1000, true}, {500, false}}),
            ComputeTotalCents({{1000, true}, {500, false}}));
}

// BETTER — the same function, against the value the specification fixes, in whole cents
TEST(Billing, SumsActiveItemsOnly) {
  EXPECT_EQ(ComputeTotalCents({{1000, true}, {500, false}}), 1000);
}
```

```c
/* C (Check) — AI ANTI-PATTERN: compares the function with itself.
   The test-case wrapper around these lines is Check's own and is not shown. */
ck_assert_int_eq(compute_total_cents(items, 2), compute_total_cents(items, 2));
/* BETTER — the value the specification fixes, in whole cents; items: {1000, active}, {500, inactive} */
ck_assert_int_eq(compute_total_cents(items, 2), 1000);
```

Check's HTML manual is headed "Check: a unit test framework for C" (https://libcheck.github.io/check/doc/check_html/check_4.html, read 2026-09-30), while the manual's source reads "Check is a unit testing framework for C." and documents `ck_assert` as "Fails test if supplied condition evaluates to false." (https://raw.githubusercontent.com/libcheck/check/master/doc/check.texi, read 2026-09-30); `ck_assert_int_eq` and `ck_assert_ptr_nonnull` are listed in the HTML manual. A test whose only assertion is that a pointer is not null is just as vacuous in any of its forms — `EXPECT_TRUE(order != nullptr)`, GoogleTest's documented `EXPECT_NE(order, nullptr)`, or Check's `ck_assert_ptr_nonnull` — so switching the macro does not fix it. GoogleTest's reference says of `EXPECT_TRUE` "Verifies that condition is true.", and "When comparing a pointer to NULL, use EXPECT_NE(ptr, nullptr) instead of EXPECT_NE(ptr, NULL)." (https://google.github.io/googletest/reference/assertions.html, read 2026-09-30).

Never assert exact equality on a floating-point result. GoogleTest's reference: "Due to rounding errors, it is very unlikely that two floating-point values will match exactly, so EXPECT_EQ is not suitable." (https://google.github.io/googletest/reference/assertions.html, read 2026-09-30); use `EXPECT_DOUBLE_EQ` or `EXPECT_NEAR`, in Check `ck_assert_double_eq_tol` ("with specified user tolerance"), and in other frameworks their tolerance assertion. Unity's reference agrees: "Unity doesn't do direct floating point comparisons for equality." (https://github.com/ThrowTheSwitch/Unity/blob/master/docs/UnityAssertionsReference.md, read 2026-09-30).

In these macros, keep brace-initialised values inside a function call's parentheses, as the examples above do. The GCC manual: "Parentheses within each argument must balance; a comma within such parentheses does not end the argument. However, there is no requirement for square brackets or braces to balance, and they do not prevent a comma from separating arguments." (https://gcc.gnu.org/onlinedocs/cpp/Macro-Arguments.html, read 2026-09-30).

Action: report type `vacuous_test`, severity critical. The principle: a green test that asserts nothing is worse than a red test, because it lies about coverage.

### D. AI-suggested race condition / unsafe concurrency

The model emits concurrent code that compiles but races: `forEach(async ...)` without await on the array, shared mutable state across threads, missing locks, or a file checked and then used after it may have changed (a time-of-check-to-time-of-use race). `forEach` "does not wait for promises" (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach, read 2026-09-30).

```typescript
// AI ANTI-PATTERN — fire-and-forget; concurrent writes to shared state
items.forEach(async (item) => { total += await price(item); });
console.log(total);   // logs 0 — none of the awaits have resolved
```

```java
// Java 21+ — AI ANTI-PATTERN: a HashMap mutated from a parallel stream without synchronisation
Map<String, Integer> counts = new HashMap<>();
items.parallelStream().forEach(i -> counts.merge(i.key(), 1, Integer::sum));   // not thread-safe
// BETTER: ConcurrentHashMap, whose merge is atomic, or Collectors.toConcurrentMap
// BETTER still, as the stream documentation advises: a reduction instead of a side-effecting forEach
Map<String, Integer> counted = items.parallelStream().collect(Collectors.toConcurrentMap(i -> i.key(), i -> 1, Integer::sum));
```

Sources, all read 2026-09-30: `HashMap` "is not synchronized. If multiple threads access a hash map concurrently, and at least one of the threads modifies the map structurally, it must be synchronized externally." (https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/HashMap.html); for `ConcurrentHashMap.merge`, "The entire method invocation is performed atomically." (https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html); `Collectors.toConcurrentMap` "is a concurrent and unordered Collector", and the three-argument form used above is `toConcurrentMap(Function<? super T,? extends K> keyMapper, Function<? super T,? extends U> valueMapper, BinaryOperator<U> mergeFunction)` (https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Collectors.html); and the stream package: "the forEach() can simply be replaced with a reduction operation that is safer, more efficient, and more amenable to parallelization" (https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/package-summary.html).

Hand on: concurrency-checker owns this class. Record what you see under `self_assessment.unknowns` with the file, the line and concurrency-checker's name; it is not this skill's finding.

### E. AI-suggested SQL injection / unsafe data sink

The model emits string-concatenated or template-literal SQL, exec, eval, or innerHTML on untrusted input.

```python
# AI ANTI-PATTERN
db.execute(f"SELECT * FROM users WHERE id = {user_id}")

# BETTER: pass the value as a parameter, never through string formatting. `?` is PEP 249's qmark style, which sqlite3 declares (it also accepts the named style); for another driver, check the paramstyle its module declares
db.execute("SELECT * FROM users WHERE id = ?", (user_id,))
```

```sql
-- AI ANTI-PATTERN: the value is concatenated into the statement
EXEC('SELECT * FROM users WHERE name = ''' + @name + '''');

-- BETTER: pass it as a parameter to sp_executesql
EXECUTE sp_executesql N'SELECT * FROM users WHERE name = @name', N'@name NVARCHAR(100)', @name = @name;
```

Sources, all read 2026-09-30: PEP 249, on `paramstyle`: "String constant stating the type of parameter marker formatting expected by the interface. ... qmark | Question mark style | ...WHERE name=?" (https://peps.python.org/pep-0249/); Python's `sqlite3` documentation, "beware of using Python's string operations to assemble queries, as they are vulnerable to SQL injection attacks.", and on its `paramstyle`, "Hard-coded to `"qmark"`." and "The named DB-API parameter style is also supported." (https://docs.python.org/3/library/sqlite3.html); Microsoft, "Never build Transact-SQL statements directly from user input." (https://learn.microsoft.com/en-us/sql/relational-databases/security/sql-injection) and "You should parameterize your queries when using `sp_executesql`." (https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-executesql-transact-sql). Microsoft's guidance also directs `QUOTENAME(@variable)` for the names of database objects, and warns: "Even parameterized data can be manipulated by a skilled and determined attacker."

Hand on: sast-scanner owns injection and unsafe data sinks. Record what you see under `self_assessment.unknowns` with the file, the line and sast-scanner's name; it is not this skill's finding.

### F. Framework-version mismatch

Distinct from category B: here the suggestion assumes a different version than the project pins. Symptoms, with sources read 2026-09-30: an error reading `ReactCurrentDispatcher` when React 19 and react-dom 18 are mixed, since React renamed that internal ("we have renamed the `SECRET_INTERNALS` suffix to: `_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE`", https://react.dev/blog/2024/04/25/react-19-upgrade-guide); `Thread.ofVirtual()` missing on Java 17, since JEP 444 lists "Release: 21" after previews in JDK 19 and 20 (https://openjdk.org/jeps/444); record patterns rejected before Java 21 ("Release: 21 ... Record patterns were initially proposed as a preview feature by JEP 405 and delivered in JDK 19. They received a second preview through JEP 432, which was delivered in JDK 20.", https://openjdk.org/jeps/440); `using` declarations rejected before C# 8 ("C# version 8.0 / Released September 2019 ... Using declarations", https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-version-history); `useFormState`, a name from React's Canary releases ("`React.useActionState` was previously called `ReactDOM.useFormState` in the Canary releases, but we've renamed it and deprecated `useFormState`.") and `useFormStatus`, new in React 19 ("we've added a new hook `useFormStatus`", both https://react.dev/blog/2024/12/05/react-19); and `TimeProvider`, built in from .NET 8 and available earlier only through the `Microsoft.Bcl.TimeProvider` package (https://learn.microsoft.com/en-us/dotnet/api/system.timeprovider).

```typescript
// React 19 project — AI emits useFormState, a Canary-era name React 19 deprecated in favour of React.useActionState
import { useFormState } from "react-dom";       // React 19 renamed/replaced this; verify project version
// React 18 project — AI emits React 19-only hook
import { useFormStatus } from "react-dom";      // React 19+ only — fails on React 18
```

```csharp
// AI ANTI-PATTERN: model assumes .NET 9 features in a .NET 7 csproj
TimeProvider.System.GetUtcNow();                  // built in from .NET 8; on .NET 7 only through the Microsoft.Bcl.TimeProvider package
```

Action: report type `stale_framework_idiom` (the agent's name for this class), severity critical.

### G. AI-suggested `console.log` / debug print left in code

```typescript
function handlePayment(amount: number) {
  console.log("DEBUG payment", amount);   // AI added during a debug suggestion; never removed
  return charge(amount);
}
```

```python
print(f"DEBUG: token={token}")           # AI debug print — leaks secret
```

Hand on: debug output left in belongs to code-reviewer, and a secret it prints to secrets-detector; MITRE's CWE-215 describes the second: "The product inserts sensitive information into debugging code, which could expose this information if the debugging code is not disabled in production." (https://cwe.mitre.org/data/definitions/215.html, read 2026-09-30), and OWASP's Secure Code Review Cheat Sheet lists "Logging security: Sensitive data not logged" (https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html, read 2026-09-30). Record what you see under `self_assessment.unknowns` with the file, the line and that agent's name; it is not this skill's finding. One large comparison found assistant-written code "more prone to unused constructs and hardcoded debugging" (https://arxiv.org/html/2508.21634, read 2026-09-30).

### H. AI-generated boilerplate without business-rule validation

The model emits an endpoint that creates, reads, updates or deletes records, a form, a serializer — but skips the project's business rules: tenant scoping, role check, tax calculation, audit log, idempotency key. The diff *looks* complete; the requirements are not met. OWASP's Secure Code Review Cheat Sheet names the class: "Business Logic Flaws: Complex workflows and state management issues that require domain understanding" (https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html, read 2026-09-30).

```csharp
// AI ANTI-PATTERN — generated controller missing tenant scoping
[HttpGet("/orders/{id}")] public IActionResult Get(int id)
    => Ok(db.Orders.Find(id));    // no check that order.TenantId == current.TenantId
```

```python
# AI ANTI-PATTERN — generated serializer doesn't enforce the "amount > 0" business rule
class OrderSerializer(serializers.ModelSerializer):
    class Meta: model = Order; fields = "__all__"
```

Action: report type `misread_request` (the agent's name for this class), severity high. Compare the diff with the request: the dispatch's text, or the acceptance criteria of the plan the dispatch names. A rule stated there and missing from the code is the finding. The same class covers statements unrelated to the task and code that is correct only for the request's own examples. Tambon and colleagues measured misinterpretation at "20.77%": "The generated code deviates from the intention of the prompt.", and define prompt-biased code as "This issue occurs when the LLM excessively relies on provided examples or particular terms in the prompt while implementing a function and it sometimes hinders the generalization or correctness of the generated code." (https://arxiv.org/pdf/2403.08937, read 2026-09-30).

### I. Incomplete output: a stub where behaviour was asked for

The model returns an empty body, a placeholder value, or a marker of unfinished work. Tambon and colleagues measured incomplete generation at "9.57%": "The model generates no code or produces an empty function such as a 'pass' statement." (https://arxiv.org/pdf/2403.08937, read 2026-09-30). The markers to search for, their sources, and the three hits that can be by design (an abstract method raising `NotImplementedError`, an unmodifiable collection throwing `UnsupportedOperationException`, an `unimplemented!` meant to stay) are in the agent's incomplete-output row and evidence section. This file cites no standard "not implemented" marker for C or C++, so search them for the comment markers MITRE's CWE-546 lists: "BUG, HACK, FIXME, LATER, LATER2, TODO" (https://cwe.mitre.org/data/definitions/546.html, read 2026-09-30).

```python
# Python — AI ANTI-PATTERN
def apply_discount(order):
    pass
```

```typescript
// TypeScript — AI ANTI-PATTERN
function applyDiscount(order: Order): Order {
  throw new Error("not implemented");
}
```

```csharp
// C# (.NET 9) — AI ANTI-PATTERN
public Order ApplyDiscount(Order order) => throw new NotImplementedException();
```

```java
// Java 21+ — AI ANTI-PATTERN, unless the type deliberately does not support the operation
public Order applyDiscount(Order order) { throw new UnsupportedOperationException(); }
```

```c
/* C (C17/23) — AI ANTI-PATTERN: a placeholder return beside a comment marker */
int apply_discount(struct order *o) { return 0; /* TODO */ }
```

```cpp
// C++ (20/23) — AI ANTI-PATTERN
Order ApplyDiscount(const Order& order) { return order; }  // TODO: apply the discount
```

Action: report type `incomplete_output`, severity critical (operating lesson 7 in `CLAUDE.md`: "Never leave stubs or TODOs.").

### J. Tests changed to pass

The change makes the tests pass by changing or defeating them, not by making the code right. Baker and colleagues watched a model in agentic coding environments during training (https://arxiv.org/html/2503.11926, read 2026-09-30) and give no frequency for ordinary assistant-written code; the behaviours they report are: "edit the unit tests so they would pass"; "calling `sys.exit(0)` would cause tests to exit gracefully"; "raised an exception from functions outside the testing framework in order to skip unit test evaluation"; "writing stubs instead of real implementations when unit test coverage is poor"; and "parsing test files at test-time in order to extract expected values". ImpossibleBench measured the propensity when tests conflict with the specification: "GPT-5, cheats 54.0% of the time on Conflicting-SWEbench" (https://arxiv.org/html/2510.20270, read 2026-09-30). GitHub's guidance on reviewing agent pull requests: "Any change that weakens CI is a blocker. Full stop." (https://github.blog/ai-and-ml/generative-ai/agent-pull-requests-are-everywhere-heres-how-to-review-them/, read 2026-09-30).

An expected value edited to match new output, in a diff:

```diff
-  expect(computeTotal(items)).toBe(10);
+  expect(computeTotal(items)).toBe(15);
```

```python
# Python — AI ANTI-PATTERN: the run ends before any failure reports
import sys

def process(batch):
    sys.exit(0)
```

```typescript
// TypeScript — AI ANTI-PATTERN: production code special-cases the test's own input
function computeTotal(items: Item[]): number {
  if (items.length === 2 && items[0].price === 10) return 10;
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

Grep the production files for the literal values in the test expectations, for `sys.exit(0)` and other calls that end the process early, and for code that opens the test files. Action: report type `test_changed_to_pass`, severity critical (operating lesson 14 in `CLAUDE.md`: "Weakening an assertion, widening a range, deleting a case, or whitelisting without a justified reason is green-washing, not fixing.").

### K. Coding-assistant configuration in the change

A changed file that configures a coding assistant changes what the assistant may do next. The files to look for are in the agent's coding-assistant configuration row, which includes `.vscode/settings.json` because in CVE-2025-53773, GitHub Copilot in agent mode "can create and write to files in the workspace without user approval", and the setting it wrote "disables all user confirmations" (https://embracethered.com/blog/posts/2025/github-copilot-remote-code-execution-via-prompt-injection/, read 2026-09-30). Report the path and what the change adds or removes. For a change that adds an extension or a tool-server entry, the joint French and German report advises "Limit the use of extensions." and "Audit and anticipate impacts of the interactions of these extensions with development, production and CI/CD environments." (https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf, read 2026-09-30, page 11). A Markdown image link that points outside the repository, added to a file the assistant reads — a rules file, a README, documentation — is a path for leaking data: "Displaying Markdown images is also a common way to exfiltrate sensitive information in a successful attack" (page 10). Grep the changed files for `![` and record each outside link for llm-security-tester. Action: report type `assistant_configuration_change`, severity high; what the change lets the assistant do goes to llm-security-tester.

## Quality Checklist

### Correctness
- [ ] Logic is actually correct (not just plausible-looking)
- [ ] Edge cases handled (null, undefined, empty, boundary)
- [ ] Error handling complete (no swallowed exceptions, no bare `except:`)
- [ ] Async operations: fire-and-forget recorded for concurrency-checker
- [ ] Every rule the request or the plan's acceptance criteria state is present

### Maintainability
- [ ] No class, layer or option with one use or none (over-engineering)
- [ ] No helper or convention that duplicates one the repository already has (fabricated pattern)
- [ ] No silent reversal of `## Decisions Taken Under Ambiguity`
- [ ] Naming, comments and style recorded for code-reviewer

### Handed on
- [ ] A query issued once per row, and other hot paths: performance-profiler
- [ ] Memory leaks and leaked listeners: memory-safety-checker
- [ ] Copy-pasted logic: duplicate-code-detector; unused code: dead-code-detector
- [ ] Debug output: code-reviewer; a printed or written secret: secrets-detector
- [ ] A new dependency, where the project keeps a software bill of materials: sbom-cra-checker

### Assistant-written code
- [ ] Every new import is in a manifest or lockfile you read; any other goes to hallucination-detector, confidence LOW
- [ ] Where a list of permitted packages is named, every new import is on it
- [ ] Provenance and signatures recorded as not checked
- [ ] Framework version read from the manifest, and every interface matches it
- [ ] No deprecated or removed interface
- [ ] Every test assertion would fail if the code were wrong
- [ ] No test edited, deleted or skipped to pass, and no production code special-casing a test input
- [ ] No empty body, placeholder return or unfinished-work marker where behaviour was asked for
- [ ] Every changed coding-assistant configuration file reported
- [ ] Diff touches only files in the plan's `files:` declaration

## Output Format

Report in the response format of `agents/ai-quality/ai-code-quality-reviewer.md` — the protocol-v1 response of `docs/DISPATCH_PROTOCOL.md` — with the agent's type names: `misread_request`, `incomplete_output`, `missing_edge_case`, `over_engineering`, `fabricated_pattern`, `hallucinated_import`, `stale_framework_idiom`, `vacuous_test`, `test_changed_to_pass`, `assistant_configuration_change` and `reviewer_directed_instruction`. A category here that the agent does not name, such as `prompt_drift`, keeps its own type. What the agent hands on goes under `self_assessment.unknowns` with the owning agent's name, never as a finding.

## Tool Integration (2026)

What the assistants' own review features do, as their vendors document them. This table is background, not part of the method: the agent never cites it in a finding.

| Tool | What its documentation says | What that means for this review |
|------|------|------|
| **GitHub Copilot code review** | "By default, Copilot's reviews do not count toward required approvals for the pull request.", and it excludes "Dependency management files, such as package.json" (https://docs.github.com/en/copilot/concepts/agents/code-review, read 2026-09-30). It is steered by instruction files: "These are specified in a copilot-instructions.md file in the .github directory of the repository." (https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions, read 2026-09-30). A repository can switch on "Allow Copilot approvals to count toward merge requirements" ("Copilot approvals are in public preview and subject to change.", https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-code-review, read 2026-09-30) | A Copilot review never read the manifest, so an invented package can pass it; an approval may have no human behind it |
| **Cursor rules** | "Project rules live in `.cursor/rules` as `.mdc` files and are version-controlled." (https://cursor.com/docs/context/rules, read 2026-09-30); "The `.cursorrules` file in your project root is legacy and will be deprecated." (https://cursor.com/help/customization/rules, read 2026-09-30) | These files steer the assistant; a change to them is category K |
| **Claude Code Code Review** | "Findings are tagged by severity and don't approve or block your PR" (https://code.claude.com/docs/en/code-review.md, read 2026-09-30) | Its findings do not stand in for a human review |
| **Aikido Code Quality** | "While security is important, Aikido primarily focuses on code quality to improve overall software health." (https://www.aikido.dev/code/code-quality, read 2026-09-30) | A third-party pull-request reviewer; its verdict is not evidence this skill can read |
| **Commit trailers** | Claude Code's settings reference documents setting `attribution.commit` to `false` to hide the commit trailer (https://code.claude.com/docs/en/settings-reference.md, read 2026-09-30) | A missing trailer proves nothing about who wrote the code; take provenance from the dispatch. A marking on a code block is the same: the joint French and German report suggests one ("It might be beneficial to flag AI generated code blocks and to document the used AI tools.", page 9), so where a block carries one, note it under `self_assessment.unknowns` as a provenance hint, not proof |

## Severity

These tiers order the report; the agent's rules decide where they differ. A deprecated or removed interface, incomplete output and a test changed to pass are critical; a misread request, a coding-assistant configuration change and a reviewer-directed instruction are high; a class given no severity is medium.

| Triage tier | Types |
|---|---|
| CRITICAL | `hallucinated_import`; `stale_framework_idiom` (an interface deprecated, removed, or from a version other than the one pinned); `vacuous_test`; `incomplete_output`; `test_changed_to_pass`; `prompt_drift` (a documented decision silently reversed) |
| HIGH | `misread_request` (including a missing business rule and an unrelated edit); `assistant_configuration_change`; `reviewer_directed_instruction` |
| MEDIUM | `over_engineering`; `fabricated_pattern`; `missing_edge_case`; `package_not_allowlisted` |

Severity reconciliation rule: if one finding fits two types, report the higher tier and name both types in `rationale`.

## Red Lines

- NEVER report an import as confirmed that no manifest or lockfile you read names; hand it to hallucination-detector with confidence LOW.
- NEVER pass assistant-written tests without reading every assertion against the specification.
- NEVER leave debug output unrecorded: hand it to code-reviewer, and a printed secret to secrets-detector.
- NEVER allow a silent reversal of a `## Decisions Taken Under Ambiguity` entry without a documented update.
- NEVER leave fire-and-forget async unrecorded: hand it to concurrency-checker.
- NEVER treat a test edited, deleted or skipped in the same change as routine.
- NEVER skip the human review of assistant-written production code, and never fast-track it because the model is thought to be good: "many developers perceive them as secure, although security vulnerabilities are regularly identified" (joint French and German report, page 8).

---

## Refinement Loop — critic mode (v6.9.8)

**Design record — this mechanism does not run.** `docs/REFINEMENT_LOOP.md` records that "the loop is **NOT RUNNING** today": no integrator invokes this skill as a critic and nothing reads a letter. Until it runs, report findings only in the agent's response format (see "Output Format"). The design, kept for when it runs: when invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../agent-fragments/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
