# Round 2 critique of skills/ai-quality/ai-code-quality-reviewer/SKILL.md (dispatch d-s3-skill-r2-critic, agent-critic from installed plugin 6.14.65, 2026-09-30)

Round 2 makes 17 edits to the skill and no frontmatter change:
- **The four code examples the research said were incomplete.**
  - The `fgets` example now warns that `buf` must be an array and that `fgets` keeps the newline.
  - The React "BETTER" line becomes the upgrade guide's own `createRoot` snippet.
  - `make_unique` now names C++14, `<memory>` and the C++ Core Guidelines rules R.23 and R.11.
  - The GoogleTest pair now tests one function, plus a note that swapping `EXPECT_TRUE` for `EXPECT_NE(order, nullptr)` leaves the test just as vacuous.
- **Two round-1 hedges become sourced facts.** The Python placeholder `?` is now stated as PEP 249's `qmark` style, and the `make_unique` version is named.
- **C now has a vacuous-test pair**, written with the Check framework. It shows only the two sourced assertion lines and says the test-case wrapper is Check's own and not shown, which honours the report's caveat that the wrapper was not read.
- **New citations.**
  - CWE-477 for deprecated interfaces, CWE-242 for `gets` (now also handed to sast-scanner), and CWE-369 by its description only, never its code examples.
  - CWE-215 for the debug print that leaks a token, and CWE-571 for the tautology test, with the report's "deterministic function" caveat.
  - Three OWASP Secure Code Review Cheat Sheet quotes: business logic flaws on the missing-business-rule category, and logging security on the debug-print category; the dependency-management quote is recorded but not added (finding 16).
- **The Java race example** gains the stream documentation's reduction as a third fix.
- **"Read every line"** is clarified against Google's "Every Line" rule: assistant-written code gets the full reading the guide requires for human-written code, not the scan it allows for generated code.
- **Consistency and plain words.** Category K no longer calls `.vscode/settings.json` an addition, because the agent's configuration row now lists it. "CRUD" is spelled out.
- **Not proposed.** Google's "a change that adds no tests" is a scope decision; no class of the agent carries it, so it is reported (finding 15) and not added.

```json
{
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
  ],
  "findings": [
    {
      "id": "f-s3-skill-r2-1",
      "kind": "new",
      "text": "'Read every line as a claim to check' is in tension with Google's 'Every Line' rule, which lets a reviewer scan 'generated code'. Read as written, that rule would let a reviewer skim assistant-written code. The skill now says it applies the full reading the guide requires for human-written code. It makes no claim about what Google meant by 'generated code', because the report marks that reading as its own.",
      "evidence": "round-2 report Part 3 item 5: \"Some things like data files, generated code, or large data structures you can scan over sometimes, but don't scan over a human-written class, function, or block of code and assume that what's inside of it is okay.\" (https://google.github.io/eng-practices/review/reviewer/looking-for.html, read 2026-09-30); skills/ai-quality/ai-code-quality-reviewer/SKILL.md:49",
      "proposed_change": {
        "old": "Read every line as a claim to check.",
        "new": "Read every line as a claim to check. Google's review guide allows a reviewer to scan \"data files, generated code, or large data structures\" but not \"a human-written class, function, or block of code\" (https://google.github.io/eng-practices/review/reviewer/looking-for.html, read 2026-09-30); this skill gives assistant-written code the full reading the guide requires for human-written code, not the scan it allows for generated code."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-2",
      "kind": "new",
      "text": "The general-examples note gains Google's support for sections 1 and 3, over-engineering and comments. It adds no claim that these defects are typical of assistant-written code.",
      "evidence": "round-2 report Part 3 items 3 and 4 (https://google.github.io/eng-practices/review/reviewer/looking-for.html, read 2026-09-30): \"Reviewers should be especially vigilant about over-engineering.\"; \"Usually comments are useful when they explain why some code exists, and should not be explaining what some code is doing.\"",
      "proposed_change": {
        "old": "These examples show defects to recognise. None is claimed to occur more often in assistant-written code except missing edge cases",
        "new": "These examples show defects to recognise. Google's review guide names two of them as review questions: \"Reviewers should be especially vigilant about over-engineering.\" and \"Usually comments are useful when they explain why some code exists, and should not be explaining what some code is doing.\" (https://google.github.io/eng-practices/review/reviewer/looking-for.html, read 2026-09-30). None is claimed to occur more often in assistant-written code except missing edge cases"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-3",
      "kind": "new",
      "text": "Section 6 (division) now cites CWE-369 by its description only. The skill says it does not use that entry's code examples, because the report found them wrong for these languages: the C 'good code' uses `throw`, and the C# 'good code' swallows the exception.",
      "evidence": "https://cwe.mitre.org/data/definitions/369.html, read 2026-09-30: \"The product divides a value by zero.\"; round-2 report Part 3 item 9",
      "proposed_change": {
        "old": "(that means INT_MIN%-1 is undefined on 2's complement systems)\" (https://en.cppreference.com/w/c/language/operator_arithmetic, read 2026-09-30).",
        "new": "(that means INT_MIN%-1 is undefined on 2's complement systems)\" (https://en.cppreference.com/w/c/language/operator_arithmetic, read 2026-09-30). MITRE's CWE-369 describes the weakness: \"The product divides a value by zero.\" (https://cwe.mitre.org/data/definitions/369.html, read 2026-09-30); its own code examples are not used here."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-4",
      "kind": "correction-of-earlier-round",
      "text": "Corrects f-s3-skill-r1-11, which left the C and C++ examples in section B under-sourced. The section's sources sentence gains:\n- the `fgets` behaviour: keeps the newline, returns a null pointer on failure;\n- the `sizeof`-of-a-pointer caveat;\n- `make_unique` since C++14;\n- C++ Core Guidelines R.23 and R.11, read on a mirror because the canonical page was cut off; the report advises re-reading R.23 on isocpp.github.io before relying on it;\n- CWE-477 for the category as a whole.",
      "evidence": "round-2 report Part 1 rows 7, 8, 10-12 and Part 3 items 6 and 12; sources in this log for fgets, sizeof, make_unique, the Core Guidelines mirror and CWE-477",
      "proposed_change": {
        "old": "C, `gets` was \"deprecated in the third corrigendum to the C99 standard and removed altogether in the C11 standard.\", and \"fgets() and gets_s() are the recommended replacements.\" (https://en.cppreference.com/w/c/io/gets); C++, `std::auto_ptr` is \"(deprecated in C++11) (removed in C++17) ... std::unique_ptr is preferred for this and other uses.\" (https://en.cppreference.com/w/cpp/memory/auto_ptr).",
        "new": "C, `gets` was \"deprecated in the third corrigendum to the C99 standard and removed altogether in the C11 standard.\", and \"fgets() and gets_s() are the recommended replacements.\" (https://en.cppreference.com/w/c/io/gets); for `fgets`, \"Parsing stops if a newline character is found (in which case str will contain that newline character) or if end-of-file occurs. ... str on success, null pointer on failure.\" (https://en.cppreference.com/w/c/io/fgets), and cppreference's `sizeof` page warns that when `a` \"has pointer type (such as after array-to-pointer conversion of function parameter type adjustment)\", a size computed from it \"would simply divide the number of bytes in a pointer type by the number of bytes in the pointed type\" (https://en.cppreference.com/w/c/language/sizeof); C++, `std::auto_ptr` is \"(deprecated in C++11) (removed in C++17) ... std::unique_ptr is preferred for this and other uses.\" (https://en.cppreference.com/w/cpp/memory/auto_ptr), `std::make_unique` is \"(since C++14)\" (https://en.cppreference.com/w/cpp/memory/unique_ptr/make_unique), and the C++ Core Guidelines state \"R.23: Use make_unique() to make unique_ptrs\" and, under R.11, \"Warn on any explicit use of new and delete. Suggest using make_unique instead.\" (read on a mirror, https://cpp-core-guidelines-docs.vercel.app/resource, because the canonical page https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines was cut off before that section). MITRE's CWE-477 names the weakness this category catches: \"The code uses deprecated or obsolete functions, which suggests that the code has not been actively reviewed or maintained.\" (https://cwe.mitre.org/data/definitions/477.html)."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-5",
      "kind": "correction-of-earlier-round",
      "text": "Corrects f-s3-skill-r1-11: the React 'BETTER' line was a phrase, not code. It becomes the upgrade guide's own replacement snippet.",
      "evidence": "https://react.dev/blog/2024/04/25/react-19-upgrade-guide, read 2026-09-30: \"// After\\nimport {createRoot} from 'react-dom/client';\\nconst root = createRoot(document.getElementById('root'));\\nroot.render(<App />);\"",
      "proposed_change": {
        "old": "// BETTER: migrate to ReactDOM.createRoot, as the React 19 upgrade guide directs",
        "new": "// BETTER, the React 19 upgrade guide's own replacement:\nimport {createRoot} from 'react-dom/client';\nconst root = createRoot(document.getElementById('root'));\nroot.render(<App />);"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-6",
      "kind": "correction-of-earlier-round",
      "text": "Corrects f-s3-skill-r1-11: the `fgets` replacement was correct but incomplete. The comment now carries the report's two caveats: `sizeof buf` gives a buffer's size only when `buf` is an array, and `fgets` keeps the newline.",
      "evidence": "round-2 report Part 2, fgets row, and Part 1 rows 10-11 (https://en.cppreference.com/w/c/io/fgets, https://en.cppreference.com/w/c/language/sizeof, read 2026-09-30)",
      "proposed_change": {
        "old": "/* BETTER: fgets(), with its failure handled */",
        "new": "/* BETTER: fgets(), with its failure handled; buf must be an array here (sizeof of a pointer gives the pointer's size), and fgets keeps the newline */"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-7",
      "kind": "correction-of-earlier-round",
      "text": "Corrects f-s3-skill-r1-11, which deliberately left out the `make_unique` version because it was the report's memory at the time. It is now sourced: C++14, header `<memory>`, with Core Guidelines R.23 and R.11 (medium confidence, read on a mirror).",
      "evidence": "https://en.cppreference.com/w/cpp/memory/unique_ptr/make_unique, read 2026-09-30: \"(since C++14)\"; round-2 report Part 1 rows 7-8, Part 3 item 12",
      "proposed_change": {
        "old": "// BETTER: std::unique_ptr\nauto p = std::make_unique<T>();",
        "new": "// BETTER: std::make_unique, from <memory> (C++14; C++ Core Guidelines R.23 and R.11)\nauto p = std::make_unique<T>();"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-8",
      "kind": "new",
      "text": "`gets` is a security defect as well as a stale idiom (CWE-242). Under the skill's own hand-on rule it is also recorded for sast-scanner, not only reported as stale_framework_idiom.",
      "evidence": "https://cwe.mitre.org/data/definitions/242.html, read 2026-09-30: \"gets() is inherently unsafe, because it copies all input from STDIN to the buffer without checking size.\"; round-2 report Part 3 item 7; agents/ai-quality/ai-code-quality-reviewer.md:45 (unsafe data sinks to sast-scanner)",
      "proposed_change": {
        "old": "Action: report type `stale_framework_idiom`, severity critical: this project treats every deprecation as critical (operating lesson 9 in `CLAUDE.md`: \"Deprecations, compiler/linter warnings, and vulnerabilities of any severity are critical\").",
        "new": "Action: report type `stale_framework_idiom`, severity critical: this project treats every deprecation as critical (operating lesson 9 in `CLAUDE.md`: \"Deprecations, compiler/linter warnings, and vulnerabilities of any severity are critical\"). A `gets` call is also a security defect: MITRE's CWE-242 says \"gets() is inherently unsafe, because it copies all input from STDIN to the buffer without checking size.\" (https://cwe.mitre.org/data/definitions/242.html, read 2026-09-30). Record it under `self_assessment.unknowns` for sast-scanner as well."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-9",
      "kind": "new",
      "text": "Category C's intro gains two sources. Google's question ('Will the tests actually fail when the code is broken?') is the principle every example here fails. CWE-571 covers the always-true comparison, with the report's caveat that this holds only for a deterministic function.",
      "evidence": "https://google.github.io/eng-practices/review/reviewer/looking-for.html, read 2026-09-30: \"Will the tests actually fail when the code is broken? If the code changes beneath them, will they start producing false positives?\"; https://cwe.mitre.org/data/definitions/571.html, read 2026-09-30: \"The product contains an expression that will always evaluate to true.\"; round-2 report Part 3 items 2 and 11",
      "proposed_change": {
        "old": "The AI writes a test that asserts only that something exists, that the function ran, or that the output equals the implementation's current return value — not the specification. Coverage rises, defect detection does not. Konstantinou and colleagues found generated tests \"prone on generating oracles that capture the actual program behaviour rather than the expected one\" (https://arxiv.org/abs/2410.21136, read 2026-09-30).",
        "new": "The AI writes a test that asserts only that something exists, that the function ran, or that the output equals the implementation's current return value — not the specification. Coverage rises, defect detection does not. Konstantinou and colleagues found generated tests \"prone on generating oracles that capture the actual program behaviour rather than the expected one\" (https://arxiv.org/abs/2410.21136, read 2026-09-30). Google's review guide asks the question every test below fails: \"Will the tests actually fail when the code is broken? If the code changes beneath them, will they start producing false positives?\" (https://google.github.io/eng-practices/review/reviewer/looking-for.html, read 2026-09-30). A test that compares a value with itself is MITRE's CWE-571, \"The product contains an expression that will always evaluate to true.\" (https://cwe.mitre.org/data/definitions/571.html, read 2026-09-30), provided the function is deterministic."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-10",
      "kind": "new",
      "text": "The tautology comment 'always true' holds only if `getUser` is deterministic, per the report's CWE-571 caveat. The comment now says so.",
      "evidence": "round-2 report Part 3 item 11: \"`expect(u).toEqual(getUser(1))` is always true only if `getUser` is deterministic.\"",
      "proposed_change": {
        "old": "  expect(u).toEqual(getUser(1));     // always true; tests nothing",
        "new": "  expect(u).toEqual(getUser(1));     // always true for a deterministic getUser; tests nothing"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-11",
      "kind": "correction-of-earlier-round",
      "text": "Corrects f-s3-skill-r1-12. The GoogleTest pair tested two different functions (FindsOrder, then SumsActiveItemsOnly), so it did not show one test made right. It is replaced by a tautology and a specification check on the same function. A note says a pointer-only assertion is just as vacuous in GoogleTest's documented EXPECT_NE(ptr, nullptr) form, so switching the macro fixes nothing.\n\nC gains a vacuous-test pair, which round 1 left out for lack of a source. It uses Check's documented assertions. The report says the test-case wrapper (START_TEST / END_TEST) was not read, so the pair shows only the two assertion lines and says the wrapper is Check's own and not shown. It is aligned on one function, like the C++ pair.\n\nThe floating-point rule gains Check's tolerance assertion and Unity's statement.",
      "evidence": "round-2 report Part 1 rows 13-16, Part 2 GoogleTest rows, the C pair and its caveat (\"the wrapper that declares a test case (`START_TEST` / `END_TEST`) were **not read this pass**\"); https://libcheck.github.io/check/doc/check_html/check_4.html, https://google.github.io/googletest/reference/assertions.html, https://github.com/ThrowTheSwitch/Unity/blob/master/docs/UnityAssertionsReference.md, all read 2026-09-30",
      "proposed_change": {
        "old": "```cpp\n// C++ (GoogleTest) — AI ANTI-PATTERN: passes for any order it finds\nTEST(Billing, FindsOrder) {\n  const Order* order = FindOrder(1);\n  EXPECT_TRUE(order != nullptr);\n}\n\n// BETTER — the value the specification fixes, in whole cents\nTEST(Billing, SumsActiveItemsOnly) {\n  EXPECT_EQ(ComputeTotalCents({{1000, true}, {500, false}}), 1000);\n}\n```\n\nNever assert exact equality on a floating-point result. GoogleTest's reference: \"Due to rounding errors, it is very unlikely that two floating-point values will match exactly, so EXPECT_EQ is not suitable.\" (https://google.github.io/googletest/reference/assertions.html, read 2026-09-30); use `EXPECT_DOUBLE_EQ` or `EXPECT_NEAR`, and in other frameworks their tolerance assertion.",
        "new": "```cpp\n// C++ (GoogleTest) — AI ANTI-PATTERN: compares the function with itself\nTEST(Billing, ComputesTotal) {\n  EXPECT_EQ(ComputeTotalCents({{1000, true}, {500, false}}),\n            ComputeTotalCents({{1000, true}, {500, false}}));\n}\n\n// BETTER — the same function, against the value the specification fixes, in whole cents\nTEST(Billing, SumsActiveItemsOnly) {\n  EXPECT_EQ(ComputeTotalCents({{1000, true}, {500, false}}), 1000);\n}\n```\n\n```c\n/* C (Check) — AI ANTI-PATTERN: compares the function with itself.\n   The test-case wrapper around these lines is Check's own and is not shown. */\nck_assert_int_eq(compute_total_cents(items, 2), compute_total_cents(items, 2));\n/* BETTER — the value the specification fixes, in whole cents; items: {1000, active}, {500, inactive} */\nck_assert_int_eq(compute_total_cents(items, 2), 1000);\n```\n\nCheck calls itself \"a unit test framework for C\" and documents `ck_assert` as \"Fails test if supplied condition evaluates to false.\" (https://libcheck.github.io/check/doc/check_html/check_4.html, read 2026-09-30); `ck_assert_int_eq` and `ck_assert_ptr_nonnull` are listed on the same page. A test whose only assertion is that a pointer is not null is just as vacuous in any of its forms — `EXPECT_TRUE(order != nullptr)`, GoogleTest's documented `EXPECT_NE(order, nullptr)`, or Check's `ck_assert_ptr_nonnull` — so switching the macro does not fix it. GoogleTest's reference says of `EXPECT_TRUE` \"Verifies that condition is true.\", and \"When comparing a pointer to NULL, use EXPECT_NE(ptr, nullptr) instead of EXPECT_NE(ptr, NULL).\" (https://google.github.io/googletest/reference/assertions.html, read 2026-09-30).\n\nNever assert exact equality on a floating-point result. GoogleTest's reference: \"Due to rounding errors, it is very unlikely that two floating-point values will match exactly, so EXPECT_EQ is not suitable.\" (https://google.github.io/googletest/reference/assertions.html, read 2026-09-30); use `EXPECT_DOUBLE_EQ` or `EXPECT_NEAR`, in Check `ck_assert_double_eq_tol` (\"with specified user tolerance\"), and in other frameworks their tolerance assertion. Unity's reference agrees: \"Unity doesn't do direct floating point comparisons for equality.\" (https://github.com/ThrowTheSwitch/Unity/blob/master/docs/UnityAssertionsReference.md, read 2026-09-30)."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-12",
      "kind": "new",
      "text": "The Java race example (section D) keeps its two fixes and gains the stream documentation's preferred third: a reduction instead of a side-effecting forEach. The new variable is named `counted` so the snippet does not redeclare `counts`. The sources follow the report's row 4. The HashMap page is cited for the defect only. The ConcurrentHashMap and Collectors pages are cited for the fixes, because the HashMap page names only Collections.synchronizedMap. Nothing is claimed about which threads a parallel stream uses (row 5).",
      "evidence": "round-2 report Part 1 rows 1-6 and Part 3 item 8, with its code \"items.parallelStream().collect(Collectors.toConcurrentMap(i -> i.key(), i -> 1, Integer::sum))\"; the four Oracle sources in this log",
      "proposed_change": {
        "old": "// BETTER: ConcurrentHashMap or Collectors.toConcurrentMap\n```\n\nHand on: concurrency-checker owns this class.",
        "new": "// BETTER: ConcurrentHashMap, whose merge is atomic, or Collectors.toConcurrentMap\n// BETTER still, as the stream documentation advises: a reduction instead of a side-effecting forEach\nMap<String, Integer> counted = items.parallelStream().collect(Collectors.toConcurrentMap(i -> i.key(), i -> 1, Integer::sum));\n```\n\nSources, all read 2026-09-30: `HashMap` \"is not synchronized. If multiple threads access a hash map concurrently, and at least one of the threads modifies the map structurally, it must be synchronized externally.\" (https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/HashMap.html); for `ConcurrentHashMap.merge`, \"The entire method invocation is performed atomically.\" (https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html); `Collectors.toConcurrentMap` \"is a concurrent and unordered Collector\" (https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Collectors.html); and the stream package: \"the forEach() can simply be replaced with a reduction operation that is safer, more efficient, and more amenable to parallelization\" (https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/package-summary.html).\n\nHand on: concurrency-checker owns this class."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-13",
      "kind": "correction-of-earlier-round",
      "text": "Corrects f-s3-skill-r1-14, which labelled the Python placeholder 'illustrative' because it was the report's memory at the time. PEP 249 now sources it: `?` is the qmark style, and each driver declares its style in its module's `paramstyle`. The comment and the sources sentence change together. Which style sqlite3 itself declares was not read, so the text tells the reviewer to check the driver's paramstyle rather than asserting it.",
      "evidence": "https://peps.python.org/pep-0249/, read 2026-09-30: \"String constant stating the type of parameter marker formatting expected by the interface. ... qmark | Question mark style | ...WHERE name=?\"; round-2 report Part 1 row 9, Part 2 Python row",
      "proposed_change": {
        "old": "# BETTER: pass the value as a parameter, never through string formatting (the placeholder mark shown is illustrative; use the one your database driver documents)",
        "new": "# BETTER: pass the value as a parameter, never through string formatting. `?` is PEP 249's qmark style; check the paramstyle your driver's module declares"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-14",
      "kind": "new",
      "text": "Three edits in one span of the category text:\n1. Category E's sources sentence gains PEP 249, which f-s3-skill-r2-13 relies on.\n2. Category G gains CWE-215 and OWASP's logging line, for the token-leaking print it hands to secrets-detector.\n3. Category H spells out 'CRUD', an abbreviation round 1 missed, and gains OWASP's business-logic line.\nThe span is one contiguous stretch of text, from category E's sources sentence to category H's description.",
      "evidence": "https://cwe.mitre.org/data/definitions/215.html; https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html (round-2 report Part 3 item 13: \"Business Logic Flaws: Complex workflows and state management issues that require domain understanding\", \"Logging security: Sensitive data not logged\"); https://peps.python.org/pep-0249/; all read 2026-09-30; skills/ai-quality/ai-code-quality-reviewer/SKILL.md:342, :377, :381",
      "proposed_change": {
        "old": "Sources, all read 2026-09-30: Python's `sqlite3` documentation,",
        "new": "Sources, all read 2026-09-30: PEP 249, on `paramstyle`: \"String constant stating the type of parameter marker formatting expected by the interface. ... qmark | Question mark style | ...WHERE name=?\" (https://peps.python.org/pep-0249/); Python's `sqlite3` documentation,"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-15",
      "kind": "new",
      "text": "Google's review guide names a gap no class covers: a change that adds no tests. This is a scope decision. Neither the agent's ten classes nor its hand-on list carries it, so no category is proposed. For CTO Chief and the human: coverage-enforcer's description names 'diff coverage' and 'patch coverage', which would make it the natural owner if the human schedules this.",
      "evidence": "round-2 report Part 3 item 1: \"In general, tests should be added in the same CL as the production code unless the CL is handling an emergency.\"; agents/testing/coverage-enforcer.md:3; agents/ai-quality/ai-code-quality-reviewer.md:32-45",
      "proposed_change": null,
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-16",
      "kind": "new",
      "text": "Checked and left unchanged, because the report validated each as correct:\n- the TypeScript divide and the C checked_divide;\n- the std::auto_ptr anti-pattern;\n- the Transact-SQL sp_executesql form, which has the shape of example A;\n- the C# throwing expression-bodied member;\n- the Java UnsupportedOperationException stub and its exception for types that deliberately reject an operation;\n- the C and C++ placeholder returns;\n- the TypeScript special-cased test input, which matches category C's input and the diff's change from 10 to 15;\n- the useFormState and useFormStatus imports.\nThe OWASP dependency-management line was not added to category A: it concerns vulnerable or outdated libraries, which the agent hands to dependency-checker, not invented names.",
      "evidence": "round-2 report Part 2 table; Part 3 item 13; sources in this log for sp_executesql, exception-handling statements, UnsupportedOperationException and useFormStatus",
      "proposed_change": null,
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-17",
      "kind": "new",
      "text": "Consistency with the agent's late corrections. The agent's configuration row now lists `.vscode/settings.json` (agent line 43), so the skill's 'One more belongs with them' is stale; category K now says the agent's row includes it, and why. The agent's limit 2 now names only the critic-mode design record, which the skill keeps; nothing to change. The agent's evidence section now carries the Wang and Konstantinou findings, which the skill already cites; nothing to change.",
      "evidence": "agents/ai-quality/ai-code-quality-reviewer.md:25, :43, :56, :57; skills/ai-quality/ai-code-quality-reviewer/SKILL.md:467",
      "proposed_change": {
        "old": "The files to look for are in the agent's coding-assistant configuration row. One more belongs with them: `.vscode/settings.json`. In CVE-2025-53773,",
        "new": "The files to look for are in the agent's coding-assistant configuration row, which includes `.vscode/settings.json` because in CVE-2025-53773,"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-18",
      "kind": "new",
      "text": "The second part of f-s3-skill-r2-14, category G: the hand-on to secrets-detector gains CWE-215 and OWASP's logging line.",
      "evidence": "https://cwe.mitre.org/data/definitions/215.html, read 2026-09-30: \"The product inserts sensitive information into debugging code, which could expose this information if the debugging code is not disabled in production.\"; OWASP cheat sheet: \"Logging security: Sensitive data not logged\"",
      "proposed_change": {
        "old": "Hand on: debug output left in belongs to code-reviewer, and a secret it prints to secrets-detector.",
        "new": "Hand on: debug output left in belongs to code-reviewer, and a secret it prints to secrets-detector; MITRE's CWE-215 describes the second: \"The product inserts sensitive information into debugging code, which could expose this information if the debugging code is not disabled in production.\" (https://cwe.mitre.org/data/definitions/215.html, read 2026-09-30), and OWASP's Secure Code Review Cheat Sheet lists \"Logging security: Sensitive data not logged\" (https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html, read 2026-09-30)."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r2-19",
      "kind": "new",
      "text": "The third part of f-s3-skill-r2-14, category H: 'CRUD' is spelled out, and OWASP's business-logic line is added.",
      "evidence": "OWASP cheat sheet, read 2026-09-30: \"Business Logic Flaws: Complex workflows and state management issues that require domain understanding\"; skills/ai-quality/ai-code-quality-reviewer/SKILL.md:381",
      "proposed_change": {
        "old": "The model emits a CRUD endpoint, a form, a serializer — but skips the project's business rules: tenant scoping, role check, tax calculation, audit log, idempotency key. The diff *looks* complete; the requirements are not met.",
        "new": "The model emits an endpoint that creates, reads, updates or deletes records, a form, a serializer — but skips the project's business rules: tenant scoping, role check, tax calculation, audit log, idempotency key. The diff *looks* complete; the requirements are not met. OWASP's Secure Code Review Cheat Sheet names the class: \"Business Logic Flaws: Complex workflows and state management issues that require domain understanding\" (https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html, read 2026-09-30)."
      },
      "needs_human": false
    }
  ],
  "seven_languages": {
    "applies": true,
    "reason": "The rule applies wherever a class is meaningful. This round adds a C vacuous-test pair, sourced to Check's documented assertions with the wrapper left out as the report requires. It aligns the C++ pair on one function, and adds sources to the C, C++, Java and Python examples the report checked.",
    "examples_checked": [
      { "language": "C# (.NET 9)", "how": "A (unconfirmed shapes); B (BinaryFormatter and WebRequest, Microsoft Learn, round 1); F (TimeProvider); H (tenant scoping); I (expression-bodied throw, validated against Microsoft Learn's throw-expression page this round). Still no safe SQL form: no C# parameter code is quoted in any report." },
      { "language": "Java 21+", "how": "A; B (Thread.ofVirtual, JEP 444); D (HashMap defect from Oracle's HashMap page; fixes from the ConcurrentHashMap and Collectors pages; the reduction from the stream package page, new this round); F (record patterns, JEP 440); I (UnsupportedOperationException, validated this round)." },
      { "language": "Python 3.12+", "how": "A; B (distutils, asyncio); C (specification value); E (placeholder now stated as PEP 249's qmark style, with the driver's paramstyle to check); G; H; I; J (sys.exit(0), Baker and colleagues)." },
      { "language": "C (C17/23)", "how": "Section 6 (cppreference arithmetic operators; CWE-369 by description); B (gets from cppreference and CWE-242, with a hand-on to sast-scanner; fgets caveats from the fgets and sizeof pages); C (new: Check's ck_assert_int_eq pair, test-case wrapper not shown); I (CWE-546 comment markers)." },
      { "language": "C++ (20/23)", "how": "B (auto_ptr from cppreference; make_unique since C++14 from cppreference; R.23 and R.11 read on a mirror); C (GoogleTest tautology and specification pair on one function; the pointer-only note)." },
      { "language": "JavaScript/TypeScript", "how": "Sections 1-7; A (react-codeshift); B (the React guide's createRoot snippet, new this round); C (the agent's example; tautology caveat added); D (Mozilla); F (useFormState; useFormStatus import checked against its reference page); G; I; J (special-cased input, validated this round)." },
      { "language": "SQL", "how": "E (Transact-SQL: the sp_executesql form checked against Microsoft's example A this round). Still not meaningful for imports, framework versions, tests or assistant configuration." }
    ]
  },
  "sibling_boundary": {
    "hallucination-detector": "Unchanged: it owns registry existence and look-alikes; nothing this round moves work to or from it.",
    "sast-scanner": "Gains the gets() call as a recorded hand-on (CWE-242), under the skill's existing rule that unsafe data sinks are sast-scanner's.",
    "secrets-detector": "Its hand-on for a printed secret now carries CWE-215 and OWASP's logging line.",
    "concurrency-checker": "The Java race example it owns gains sourced fixes; the class stays handed on, not reported.",
    "code-reviewer": "Unchanged; the Google comment quote supports section 3, which stays handed to it.",
    "coverage-enforcer": "Named in f-s3-skill-r2-15 as the likely owner if the human schedules the 'change adds no tests' check; not added to the skill.",
    "dependency-checker": "The OWASP dependency-management line belongs to its territory and is not added to the skill."
  },
  "nothing_found": false
}
```

Where this could go wrong:
- **R.23 and R.11 were read on a mirror.** The canonical page was cut off, and the report advises re-reading R.23 on isocpp.github.io.
- **The C test pair omits Check's test-case wrapper.** That was deliberate, so a reader must add it.
- **Most round-2 quotes came through a summarising fetch.** Only the two Microsoft Learn pages were returned as written.
- **One Check detail comes from the report's evidence column, not a verbatim source quote.** That is `ck_assert_double_eq_tol`'s "with specified user tolerance". Its sibling `ck_assert_int_eq` is also only named, not quoted, in the report.
- **One finding spans three separate edits.** Finding 14 carries the first edit (PEP 249 in category E). Findings 18 and 19 carry the other two (categories G and H). Apply all three.