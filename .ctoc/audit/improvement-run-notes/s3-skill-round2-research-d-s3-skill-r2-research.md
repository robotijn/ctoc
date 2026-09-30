# Round 2 web research for skills/ai-quality/ai-code-quality-reviewer/SKILL.md (dispatch d-s3-skill-r2-research, citation-validator, installed plugin 6.14.65, 2026-09-30; source classes: standards bodies and established publishers; angle: code-example correctness)

I checked 16 items for Part 1 and 21 code examples for Part 2. Fourteen of the Part 1 items are backed by a source, one is attributed to the wrong page, and one has no source. Every code example I checked is correct, but four of them should say more than they do. No page or file tried to give me instructions. I used 29 of the 30 tool calls.

## 1. Research log

```json
{
  "research_log": {
    "queries": [
      { "text": "\"R.23: Use make_unique() to make unique_ptrs\" C++ Core Guidelines", "source_class": "publisher", "repeated_because": null },
      { "text": "OWASP Code Review Guide 2.0 \"error handling\" \"logging\" reviewer checklist site:owasp.org", "source_class": "publisher", "repeated_because": null }
    ],
    "sources": [
      { "url": "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/HashMap.html", "read_on": "2026-09-30", "bore_on": "skill 314-316: HashMap mutated from a parallel stream", "outcome": "supported", "quote": "Note that this implementation is not synchronized. If multiple threads access a hash map concurrently, and at least one of the threads modifies the map structurally, it must be synchronized externally. (A structural modification is any operation that adds or deletes one or more mappings ...) ... the map should be \"wrapped\" using the Collections.synchronizedMap method.", "error": null },
      { "url": "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/package-summary.html", "read_on": "2026-09-30", "bore_on": "skill 317: the better fix; which threads a parallel stream uses", "outcome": "supported", "quote": "If executed in parallel, the non-thread-safety of ArrayList would cause incorrect results, and adding needed synchronization would cause contention, undermining the benefit of parallelism. ... the forEach() can simply be replaced with a reduction operation that is safer, more efficient, and more amenable to parallelization", "error": null },
      { "url": "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html", "read_on": "2026-09-30", "bore_on": "skill 317: ConcurrentHashMap as the fix", "outcome": "supported", "quote": "The entire method invocation is performed atomically.", "error": null },
      { "url": "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Collectors.html", "read_on": "2026-09-30", "bore_on": "skill 317: Collectors.toConcurrentMap as the fix", "outcome": "supported", "quote": "Returns a concurrent Collector that accumulates elements into a ConcurrentMap ... This is a concurrent and unordered Collector.", "error": null },
      { "url": "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/UnsupportedOperationException.html", "read_on": "2026-09-30", "bore_on": "skill 419-422: Java incomplete-output example and its by-design exception", "outcome": "supported", "quote": "Thrown to indicate that the requested operation is not supported. This class is a member of the Java Collections Framework.", "error": null },
      { "url": "https://en.cppreference.com/w/cpp/memory/unique_ptr/make_unique", "read_on": "2026-09-30", "bore_on": "skill 246: std::make_unique version", "outcome": "supported", "quote": "(since C++14)", "error": null },
      { "url": "https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines", "read_on": "2026-09-30", "bore_on": "skill 245-246: Core Guidelines rule preferring make_unique (canonical page)", "outcome": "unreachable", "quote": null, "error": "fetch returned truncated content: \"The document content ends mid-section in the \\\"F: Functions\\\" area, well before reaching the R (Resource management) section where R.23 would appear\"" },
      { "url": "https://cpp-core-guidelines-docs.vercel.app/resource", "read_on": "2026-09-30", "bore_on": "skill 245-246: rules R.23 and R.11 (a mirror of the guidelines, not the canonical page)", "outcome": "supported", "quote": "R.23: Use make_unique() to make unique_ptrs ... Reason: make_unique gives a more concise statement of the construction. It also ensures exception safety in complex expressions.", "error": null },
      { "url": "https://peps.python.org/pep-0249/", "read_on": "2026-09-30", "bore_on": "skill 330-331: the ? placeholder", "outcome": "supported", "quote": "String constant stating the type of parameter marker formatting expected by the interface. ... qmark | Question mark style | ...WHERE name=?", "error": null },
      { "url": "https://en.cppreference.com/w/c/io/fgets", "read_on": "2026-09-30", "bore_on": "skill 238-239: the fgets replacement", "outcome": "supported", "quote": "Parsing stops if a newline character is found (in which case str will contain that newline character) or if end-of-file occurs. ... str on success, null pointer on failure.", "error": null },
      { "url": "https://en.cppreference.com/w/c/language/sizeof", "read_on": "2026-09-30", "bore_on": "skill 239: sizeof buf works only on an array", "outcome": "supported", "quote": "Note that if a has pointer type (such as after array-to-pointer conversion of function parameter type adjustment), this expression would simply divide the number of bytes in a pointer type by the number of bytes in the pointed type.", "error": null },
      { "url": "https://google.github.io/googletest/reference/assertions.html", "read_on": "2026-09-30", "bore_on": "skill 286-297: the GoogleTest pair", "outcome": "supported", "quote": "Verifies that condition is true. ... When comparing a pointer to NULL, use EXPECT_NE(ptr, nullptr) instead of EXPECT_NE(ptr, NULL).", "error": null },
      { "url": "https://github.com/ThrowTheSwitch/Unity/blob/master/docs/UnityAssertionsReference.md", "read_on": "2026-09-30", "bore_on": "a C vacuous-test pair (Unity project documentation)", "outcome": "supported", "quote": "Verify if a pointer is or is not NULL. ... So Unity doesn't do direct floating point comparisons for equality.", "error": null },
      { "url": "https://libcheck.github.io/check/doc/check_html/check_4.html", "read_on": "2026-09-30", "bore_on": "a C vacuous-test pair (Check project documentation)", "outcome": "supported", "quote": "Check: a unit test framework for C ... ck_assert: Fails test if supplied condition evaluates to false. ... ck_assert_ptr_nonnull checks that pointer is not equal to NULL", "error": null },
      { "url": "https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-executesql-transact-sql", "read_on": "2026-09-30", "bore_on": "skill 339: the sp_executesql form, against example A", "outcome": "supported", "quote": "EXECUTE sp_executesql N'SELECT * FROM AdventureWorks2022.HumanResources.Employee WHERE BusinessEntityID = @level', N'@level TINYINT', @level = 109;", "error": null },
      { "url": "https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/exception-handling-statements", "read_on": "2026-09-30", "bore_on": "skill 416: an expression-bodied member that throws", "outcome": "supported", "quote": "You can also use throw as an expression. ... an expression-bodied lambda or method ... DateTime ToDateTime(IFormatProvider provider) => throw new InvalidCastException(\"Conversion to a DateTime is not supported.\");", "error": null },
      { "url": "https://react.dev/blog/2024/04/25/react-19-upgrade-guide", "read_on": "2026-09-30", "bore_on": "skill 211-212: what replaces ReactDOM.render", "outcome": "supported", "quote": "// After\nimport {createRoot} from 'react-dom/client';\nconst root = createRoot(document.getElementById('root'));\nroot.render(<App />);", "error": null },
      { "url": "https://react.dev/reference/react-dom/hooks/useFormStatus", "read_on": "2026-09-30", "bore_on": "skill 354: the useFormStatus import", "outcome": "supported", "quote": "import { useFormStatus } from \"react-dom\";", "error": null },
      { "url": "https://google.github.io/eng-practices/review/reviewer/looking-for.html", "read_on": "2026-09-30", "bore_on": "Part 3: over-engineering, tests, comments, reading every line", "outcome": "supported", "quote": "Will the tests actually fail when the code is broken? If the code changes beneath them, will they start producing false positives?", "error": null },
      { "url": "https://cwe.mitre.org/data/definitions/477.html", "read_on": "2026-09-30", "bore_on": "Part 3: category B (deprecated or removed interfaces)", "outcome": "supported", "quote": "The code uses deprecated or obsolete functions, which suggests that the code has not been actively reviewed or maintained.", "error": null },
      { "url": "https://cwe.mitre.org/data/definitions/242.html", "read_on": "2026-09-30", "bore_on": "Part 3: the gets() example", "outcome": "supported", "quote": "gets() is inherently unsafe, because it copies all input from STDIN to the buffer without checking size.", "error": null },
      { "url": "https://cwe.mitre.org/data/definitions/369.html", "read_on": "2026-09-30", "bore_on": "Part 3: section 6 (division by zero)", "outcome": "supported", "quote": "The product divides a value by zero.", "error": null },
      { "url": "https://cwe.mitre.org/data/definitions/215.html", "read_on": "2026-09-30", "bore_on": "Part 3: category G (a debug print that leaks a token)", "outcome": "supported", "quote": "The product inserts sensitive information into debugging code, which could expose this information if the debugging code is not disabled in production.", "error": null },
      { "url": "https://cwe.mitre.org/data/definitions/571.html", "read_on": "2026-09-30", "bore_on": "Part 3: category C (an assertion that is always true)", "outcome": "supported", "quote": "The product contains an expression that will always evaluate to true.", "error": null },
      { "url": "https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html", "read_on": "2026-09-30", "bore_on": "Part 3: OWASP review concerns", "outcome": "supported", "quote": "Business Logic Flaws: Complex workflows and state management issues that require domain understanding", "error": null }
    ]
  }
}
```

How the quotes reached me:
- **Page text returned as written:** the two Microsoft Learn pages.
- **Through the fetch tool's summarising model:** every other quote.
- **Negative results come from that summarising model too.** They include "no passage names the threads" on the stream package page and "no passage on assistant-written code" on the OWASP cheat sheet. Hold them at medium confidence, because a summariser working on a truncated page can miss a passage.

## 2. Part 1: verdicts

| # | Item | Verdict | Evidence (verbatim) | Recommended action |
|---|---|---|---|---|
| 1 | A `HashMap` mutated from a parallel stream without synchronisation is unsafe | VALIDATED | "not synchronized ... must be synchronized externally", and "A structural modification is any operation that adds or deletes one or more mappings". `merge` on a new key adds a mapping, so it is a structural modification. | keep; can cite the HashMap page |
| 2 | `ConcurrentHashMap` is a correct fix | VALIDATED | `merge`: "The entire method invocation is performed atomically." | keep |
| 3 | `Collectors.toConcurrentMap` is a correct fix | VALIDATED | "This is a concurrent and unordered Collector". The note on `toMap` adds that for parallel pipelines `toConcurrentMap` "may offer better parallel performance". | keep |
| 4 | The brief's premise that the HashMap page itself names `ConcurrentHashMap` or `toConcurrentMap` as the alternative | MISATTRIBUTED | The HashMap page names "Collections.synchronizedMap". The skill does not make this claim. | if a source is added to line 317, cite the `ConcurrentHashMap.merge` and `Collectors` pages, not the HashMap page |
| 5 | Which threads a parallel stream runs on | UNSOURCEABLE from the package page (medium confidence) | The summariser reports that no such passage exists. The ForkJoinPool page was not read. | add no claim about threads. Line 314 no longer makes one, so there is nothing to strip. |
| 6 | The stream documentation prefers a reduction to a side-effecting `forEach` (new) | VALIDATED | "the forEach() can simply be replaced with a reduction operation that is safer, more efficient, and more amenable to parallelization" | add as a third fix; see Part 3, finding 8 |
| 7 | `std::make_unique` arrived in C++14 | VALIDATED | cppreference, header `<memory>`: "(since C++14)" | keep; say C++14 and name `<memory>` |
| 8 | A C++ Core Guidelines rule prefers `make_unique` | VALIDATED (medium: read on a mirror; the canonical page was cut off before that section) | "R.23: Use make_unique() to make unique_ptrs ... It also ensures exception safety in complex expressions." R.11's enforcement line: "Suggest using make_unique instead." | cite R.23; before citing, re-read it on isocpp.github.io |
| 9 | The DB-API placeholder styles (PEP 249 `paramstyle`) | VALIDATED | "qmark ... Question mark style ... `...WHERE name=?`"; the other styles are numeric, named, format and pyformat | line 330 can state it as fact (Part 2, row 10). Which style `sqlite3` itself declares was not read this pass. |
| 10 | `fgets` keeps the newline | VALIDATED | "in which case str will contain that newline character" | add to line 238 |
| 11 | `sizeof buf` is right only for an array | VALIDATED (medium: the sizeof page, not the fgets page; the fgets example uses `char buf[8]; ... sizeof buf`) | "if a has pointer type (such as after array-to-pointer conversion of function parameter type adjustment), this expression would simply divide the number of bytes in a pointer type ..." | add to line 238 |
| 12 | `fgets` returns a null pointer on failure | VALIDATED | "str on success, null pointer on failure." | keep |
| 13 | The GoogleTest wording for `EXPECT_TRUE` | VALIDATED | "Verifies that condition is true." | keep; can cite |
| 14 | GoogleTest's documented form for comparing a pointer (new) | VALIDATED | "use EXPECT_NE(ptr, nullptr) instead of EXPECT_NE(ptr, NULL)" | see Part 2, row 6 |
| 15 | An authoritative reference for a C unit-test framework: Check | VALIDATED (the project's own documentation; I know of no standards body for C unit testing) | "Check: a unit test framework for C"; `ck_assert`: "Fails test if supplied condition evaluates to false."; `ck_assert_ptr_nonnull` "checks that pointer is not equal to NULL"; `ck_assert_int_eq`; `ck_assert_double_eq_tol` "with specified user tolerance" | a C pair can be written from these (see below) |
| 16 | The same for Unity | VALIDATED (the project's own documentation) | `TEST_ASSERT_NOT_NULL`: "Verify if a pointer is or is not NULL."; "Unity doesn't do direct floating point comparisons for equality." | use either framework |

Totals: 14 validated, 1 misattributed, 1 unsourceable, 0 fabricated; 16 examined.

A C vacuous-test pair written with Check. The two assertion calls are sourced. The functions they test and the wrapper that declares a test case (`START_TEST` / `END_TEST`) were **not read this pass**, so confirm the wrapper against Check's tutorial chapter before using it:
```c
/* C (Check) — AI ANTI-PATTERN: passes for any order it finds */
ck_assert_ptr_nonnull(find_order(1));
/* BETTER — the value the specification fixes, in whole cents */
ck_assert_int_eq(compute_total_cents(items, 2), 1000);   /* items: {1000, active}, {500, inactive} */
```

## 3. Part 2: code examples

| Example (skill lines) | Reference | Verdict |
|---|---|---|
| TypeScript `divide` (136-142) | none needed | correct |
| C `checked_divide` (145-156) | cppreference arithmetic operators (round 1); CWE-369 | correct: it refuses both the zero divisor and `INT_MIN / -1` |
| C `fgets` (236-240) | cppreference fgets and sizeof | correct, but incomplete. Change line 238 to: `/* BETTER: fgets(), with its failure handled; buf must be an array here (sizeof of a pointer is the pointer's size), and fgets keeps the newline */` |
| C++ `std::auto_ptr<T> p(new T);` (244) | cppreference auto_ptr (round 1) | correct as the anti-pattern: it does not compile from C++17 on, which is the point |
| C++ `auto p = std::make_unique<T>();` (246) | cppreference make_unique; Core Guidelines R.23 | correct in C++14 and later, with `<memory>`; can add "(C++14; C++ Core Guidelines R.23)" |
| GoogleTest anti-pattern `EXPECT_TRUE(order != nullptr)` (288-291) | GoogleTest assertions reference | correct, but the pair does not line up: the better test (`SumsActiveItemsOnly`) tests a different function from the bad one (`FindsOrder`). GoogleTest's documented form, `EXPECT_NE(order, nullptr)`, is just as vacuous when it is the only assertion. Say so, so that nobody "fixes" the test by switching the macro. |
| GoogleTest better test `EXPECT_EQ(ComputeTotalCents({{1000, true}, {500, false}}), 1000)` (294-296) | GoogleTest; C preprocessor | correct, assuming the function takes a container of simple two-field structs. The commas inside the braces sit inside the call's parentheses, so the macro still receives two arguments. That is a preprocessor rule from memory (high confidence); I did not read it this pass. |
| Transact-SQL anti-pattern `EXEC('...''' + @name + '''')` (336) | the EXECUTE page was not read | not checked |
| Transact-SQL `EXECUTE sp_executesql N'... @name', N'@name NVARCHAR(100)', @name = @name;` (339) | sp_executesql example A (read in full) | correct. It has the same shape as example A: a Unicode constant statement, a Unicode parameter definition, then the value assignments, in the order the page requires ("must be entered in the specific order"). The statement is a constant, not a concatenation, which the page forbids: "concatenating two strings with the + operator, aren't allowed". Using the same name for the parameter and the outer variable is legal because the scopes are separate ("The sp_executesql batch can't reference variables declared in the batch that calls sp_executesql"). The page's own examples use different names. |
| Python `db.execute("... id = ?", (user_id,))` (331) | PEP 249 | correct. The hedge on line 330 ("illustrative") can become fact: "`?` is PEP 249's `qmark` style; each driver declares its style in its module's `paramstyle`." |
| C# `public Order ApplyDiscount(Order order) => throw new NotImplementedException();` (416) | Microsoft Learn, throw expressions | correct: the page's own example is an expression-bodied method that throws |
| Java `public Order applyDiscount(Order order) { throw new UnsupportedOperationException(); }` (421) | the UnsupportedOperationException page | correct. The class is "a member of the Java Collections Framework", which supports the skill's exception for types that deliberately do not support an operation. |
| C `return 0; /* TODO */` (426); C++ `return order;` (431) | none needed | correct |
| TypeScript test special-casing (456-460) | none needed | correct. It matches the section C test input exactly, and the general branch ignores `active`: exactly the defect a special case hides. It also agrees with the diff's change from 10 to 15. |
| React `ReactDOM.render(...)` and the "BETTER" comment (211-212) | React 19 upgrade guide | the anti-pattern is correct; the "BETTER" line is incomplete. The guide's own replacement is `import {createRoot} from 'react-dom/client'; const root = createRoot(document.getElementById('root')); root.render(<App />);`. Use that snippet rather than the phrase "ReactDOM.createRoot". |
| React `import { useFormState } from "react-dom"` (352) | React v19 post (round 1, not re-read this pass) | correct |
| React `import { useFormStatus } from "react-dom"` (354) | useFormStatus reference | correct; the import line matches the reference exactly |
| Java `HashMap` with `parallelStream().forEach(merge)` (315-317) | the HashMap, ConcurrentHashMap and Collectors pages | correct, and so is the "BETTER" line. The stream documentation's preferred fix is missing (Part 3, finding 8). |
| .NET `BinaryFormatter` and `WebRequest` (224-226) | — | not checked this pass |
| Python `distutils` and `asyncio` (216-219) | — | not checked this pass (round 1 validated their sources) |

No example I checked would fail to compile. None misstates the reference it cites.

## 4. Part 3: what established references add

1. **Google's review guide names a gap the skill does not check: a change that adds no tests.** "In general, tests should be added in the same CL as the production code unless the CL is handling an emergency." The skill checks tests that exist (categories C and J), but not their absence. Adding a check for it is a scope decision for you.
2. **Google supports category C directly.** "Will the tests actually fail when the code is broken? If the code changes beneath them, will they start producing false positives?" This is the source the checklist item "Every test assertion would fail if the code were wrong" currently lacks.
3. **Google supports section 1 without claiming the problem is typical of assistants.** "A particular type of complexity is over-engineering, where developers have made the code more generic than it needs to be, or added functionality that isn't presently needed by the system. Reviewers should be especially vigilant about over-engineering."
4. **Google supports section 3.** "Usually comments are useful when they explain why some code exists, and should not be explaining what some code is doing."
5. **Google's "Every Line" rule is in tension with the skill's line 49.** "Some things like data files, generated code, or large data structures you can scan over sometimes, but don't scan over a human-written class, function, or block of code and assume that what's inside of it is okay." Google means machine-generated code, which is my reading and not something the page states. Worded as it is, the rule would let a reviewer skim assistant-written code. The skill's "Read every line as a claim to check" should say that assistant-written code is not "generated code" in this sense.
6. **CWE-477 fits category B and is not cited.** "The code uses deprecated or obsolete functions, which suggests that the code has not been actively reviewed or maintained." Its mitigation: "Consider seriously the security implications of using an obsolete function. Consider using alternate functions."
7. **`gets` is a security defect as well as a stale idiom (CWE-242).** "gets() is inherently unsafe, because it copies all input from STDIN to the buffer without checking size. This allows the user to provide a string that is larger than the buffer size, resulting in an overflow condition." Under the skill's own hand-on rule, a `gets` call should also be recorded under `self_assessment.unknowns` for sast-scanner, not only reported as `stale_framework_idiom`.
8. **The stream documentation names a stronger fix for the Java example.** "using side-effects here is completely unnecessary; the forEach() can simply be replaced with a reduction operation that is safer, more efficient, and more amenable to parallelization". `ConcurrentHashMap` with `forEach` is thread-safe, but it is still the side-effecting pattern that page advises against. A third fix to add: `items.parallelStream().collect(Collectors.toConcurrentMap(i -> i.key(), i -> 1, Integer::sum))`.
9. **Do not copy CWE-369's own code examples.** Its C "good code" contains `throw DivideByZero;`, and C has no `throw`. Its C# "good code" catches `System.DivideByZeroException` and does `return 0;`, which is the swallowed exception the skill's checklist forbids. Cite CWE-369 by its description only: "The product divides a value by zero."
10. **CWE-215 fits category G's token print.** "The product inserts sensitive information into debugging code, which could expose this information if the debugging code is not disabled in production." Its mitigation: "Do not leave debug statements that could be executed in the source code."
11. **CWE-571 fits the tautology test.** "The product contains an expression that will always evaluate to true." Caveat: `expect(u).toEqual(getUser(1))` is always true only if `getUser` is deterministic.
12. **C++ Core Guidelines R.11 also covers the `auto_ptr` line**, which calls `new` directly: "Warn on any explicit use of new and delete. Suggest using make_unique instead." (read on the mirror).
13. **The OWASP Secure Code Review Cheat Sheet has no guidance on assistant-written code** (the summariser reported it "not present"). It supports three of the skill's hand-ons:
    - category H: "Business Logic Flaws: Complex workflows and state management issues that require domain understanding"
    - category G: "Logging security: Sensitive data not logged"
    - category A: "Dependency management: Up-to-date libraries without known vulnerabilities"

    None of the references I read contradicts a statement in the skill.

**Not examined this pass:**
- the OWASP Code Review Guide v2 itself, a PDF I located but did not read
- the MITRE entries for race conditions and SQL injection (the skill hands both classes on)
- the Transact-SQL EXECUTE page
- the ForkJoinPool page
- which placeholder style `sqlite3` declares
- the .NET and Python examples in category B

## 5. What would change these verdicts

A few reads would move these verdicts:
- R.23 read on the canonical isocpp.github.io page.
- A passage on the stream or ForkJoinPool pages that names the parallel-stream threads.
- The Transact-SQL EXECUTE page: it would settle the anti-pattern's concatenation form.
- A full read of the OWASP Code Review Guide v2, which could add concerns.

Files read: `/Users/account/Code/ctoc/skills/ai-quality/ai-code-quality-reviewer/SKILL.md`, `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s3-skill-round1-research-d-s3-skill-r1-research.md`. I edited nothing.

Sources:
- [Oracle, HashMap (Java 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/HashMap.html)
- [Oracle, java.util.stream package](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/package-summary.html)
- [Oracle, ConcurrentHashMap](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html)
- [Oracle, Collectors](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Collectors.html)
- [Oracle, UnsupportedOperationException](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/UnsupportedOperationException.html)
- [cppreference, make_unique](https://en.cppreference.com/w/cpp/memory/unique_ptr/make_unique)
- [C++ Core Guidelines (canonical page, cut off before the needed section)](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines)
- [C++ Core Guidelines mirror, Resource section](https://cpp-core-guidelines-docs.vercel.app/resource)
- [PEP 249](https://peps.python.org/pep-0249/)
- [cppreference, fgets](https://en.cppreference.com/w/c/io/fgets)
- [cppreference, sizeof](https://en.cppreference.com/w/c/language/sizeof)
- [GoogleTest assertions reference](https://google.github.io/googletest/reference/assertions.html)
- [Unity assertions reference](https://github.com/ThrowTheSwitch/Unity/blob/master/docs/UnityAssertionsReference.md)
- [Check documentation, chapter 4](https://libcheck.github.io/check/doc/check_html/check_4.html)
- [Microsoft Learn, sp_executesql](https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-executesql-transact-sql)
- [Microsoft Learn, exception-handling statements](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/exception-handling-statements)
- [React 19 upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [React, useFormStatus](https://react.dev/reference/react-dom/hooks/useFormStatus)
- [Google engineering practices, what to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
- [CWE-477](https://cwe.mitre.org/data/definitions/477.html)
- [CWE-242](https://cwe.mitre.org/data/definitions/242.html)
- [CWE-369](https://cwe.mitre.org/data/definitions/369.html)
- [CWE-215](https://cwe.mitre.org/data/definitions/215.html)
- [CWE-571](https://cwe.mitre.org/data/definitions/571.html)
- [OWASP Secure Code Review Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html)
- [OWASP Code Review Guide v2 (located, not read)](https://owasp.org/www-project-code-review-guide/assets/OWASP_Code_Review_Guide_v2.pdf)