# COBOL CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude ignores FILE STATUS — check after every I/O operation
- Claude uses ALTER — never use, ancient flow control
- Claude forgets decimal precision — verify PIC clauses carefully
- Claude uses GOTO freely — use structured PERFORM instead

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `gnucobol 3.2+` | Open source compiler | Outdated compilers |
| `micro focus visual cobol` | Enterprise IDE | Basic editors |
| `cobrix` | Spark integration | Manual data extraction |
| `cobol-check` | Unit testing | Ad-hoc tests |
| Enterprise tools | Mainframe analysis | Manual review |

## Patterns Claude Should Use
```cobol
       IDENTIFICATION DIVISION.
       PROGRAM-ID. SAMPLE-PROGRAM.

       DATA DIVISION.
       FILE SECTION.
       FD INPUT-FILE.
       01 INPUT-RECORD PIC X(80).

       WORKING-STORAGE SECTION.
       01 WS-FILE-STATUS PIC XX.
          88 FILE-OK VALUE '00'.
          88 END-OF-FILE VALUE '10'.
       01 WS-AMOUNT PIC S9(7)V99 COMP-3.

       PROCEDURE DIVISION.
       MAIN-PROCESS.
           PERFORM OPEN-FILES
           PERFORM READ-PROCESS UNTIL END-OF-FILE
           PERFORM CLOSE-FILES
           STOP RUN.

       READ-PROCESS.
           READ INPUT-FILE
               AT END SET END-OF-FILE TO TRUE
               NOT AT END PERFORM PROCESS-RECORD
           END-READ
           IF NOT FILE-OK AND NOT END-OF-FILE
               DISPLAY 'File error: ' WS-FILE-STATUS
               STOP RUN
           END-IF.
```

## Anti-Patterns Claude Generates
- Ignoring FILE STATUS — always check after I/O
- Using ALTER — never, use structured PERFORM
- GOTO spaghetti — use PERFORM THRU structured
- Missing PIC precision — verify decimal places
- REDEFINES without documentation — document memory layout

## Data / Memory Footguns
COBOL's memory model is the **record layout** — fixed-width fields with implicit
truncation and overlapping storage. The corruption is silent data loss, not a crash.

- **`PIC` overflow + truncation.** Moving a value into a smaller `PIC` **silently
  truncates** without error: `MOVE 123456 TO WS-X` where `WS-X PIC 9(3)` yields `456`.
  Numeric arithmetic that overflows the receiving field truncates the high-order digits
  unless you guard it with `ON SIZE ERROR`.
- **`REDEFINES` aliasing.** `REDEFINES` overlays two field definitions on the **same
  storage** — writing through one reinterprets the bytes under the other. Powerful for
  variant records, but a mismatched picture reads garbage. Document every `REDEFINES`
  layout.
- **`COMP-3` packed-decimal mismatches.** `COMP-3` stores two digits per byte plus a
  sign nibble. A `PIC S9(7)V99 COMP-3` occupies 5 bytes; redefining it as `DISPLAY` or
  mismatching the digit count reads a corrupt number. Interop with other systems must
  agree on the exact packed length and sign convention.
- **Fixed-length `MOVE` truncation.** Alphanumeric `MOVE` left-justifies and truncates
  or space-pads to the receiver's length — a long name is silently cut.

```cobol
       01 WS-BIG    PIC 9(6) VALUE 123456.
       01 WS-SMALL  PIC 9(3).
      * Silent truncation → WS-SMALL becomes 456 (data loss, no error):
           MOVE WS-BIG TO WS-SMALL.
      * Guarded arithmetic — traps overflow instead of truncating:
           COMPUTE WS-SMALL = WS-BIG * 2
               ON SIZE ERROR DISPLAY 'overflow'
           END-COMPUTE.
```

## Error Handling Idioms
- **`FILE STATUS` after every I/O.** Declare a two-byte `FILE STATUS` item in the
  `SELECT` and test it after **every** `OPEN`/`READ`/`WRITE`/`REWRITE`/`DELETE`. A
  `'00'` is success; anything else (e.g. `'23'` record-not-found, `'35'` file-not-found)
  must be handled — I/O failures do not raise.
- **`ON SIZE ERROR`.** Attach to `ADD`/`SUBTRACT`/`MULTIPLY`/`DIVIDE`/`COMPUTE` to catch
  arithmetic overflow and divide-by-zero instead of silently truncating.
- **`INVALID KEY`.** On indexed/relative file access, handle `INVALID KEY` for
  duplicate/not-found keys.
- **`SQLCODE` in embedded SQL.** After every EXEC SQL statement, check `SQLCODE`
  (`0` ok, `+100` no rows, negative = error) — the DB does not throw into COBOL.

## Security and Dependency Gotchas
- **Embedded-SQL injection — CWE-89.** Building a **dynamic** SQL string by concatenating
  input and `EXEC SQL EXECUTE IMMEDIATE` is injectable. Use **host variables** with
  static SQL, or `PREPARE`d statements with parameter markers — never string-built SQL
  from external data. [cwe.mitre.org/data/definitions/89.html, retrieved 2026-07-10]
- **Buffer truncation as a data-integrity risk.** Silent `PIC`/`MOVE` truncation
  (above) can drop authorization digits, amounts, or account IDs — validate field widths
  against the source before the `MOVE`.
- **Mainframe access controls.** On z/OS, dataset and transaction access is governed by
  RACF (or ACF2/Top Secret); COBOL code must not assume it runs privileged — least
  privilege applies to the batch/CICS region too.

## Testing Conventions
- **GnuCOBOL** — the open-source COBOL compiler (`cobc`); the current release line is
  **GnuCOBOL 3.2**. [gnucobol.sourceforge.io, retrieved 2026-07-10]
- **cobol-check** — open-source unit-testing framework that injects test cases into a
  program's procedure division for isolated assertions.
- **Coverage/analysis** — drive `cobc` with test harnesses in CI; keep tests
  data-driven off fixed-format fixtures.

## Performance Traps
- **`PERFORM` overhead.** Deeply nested `PERFORM ... THRU` and `PERFORM VARYING` add
  call/branch cost; flatten hot paragraphs.
- **Linear `OCCURS` search vs `SEARCH ALL`.** A serial `SEARCH` on a large `OCCURS`
  table is O(n); if the table is sorted on the key, `SEARCH ALL` is a binary search
  (O(log n)). Keeping the table sorted pays off at scale.
- **Unnecessary `MOVE`s.** Redundant field-to-field `MOVE`s in tight loops dominate
  batch runtimes; reuse working storage in place.

## Version-Specific Gotchas
- **ISO/IEC 1989:2023** is the current COBOL standard (successor to COBOL 2014,
  ISO/IEC 1989:2014). [iso.org/standard/74527.html, retrieved 2026-07-10]
- **GnuCOBOL 3.2** targets strong COBOL 2014 conformance with dialect flags for IBM,
  MF, and standard modes. [gnucobol.sourceforge.io, retrieved 2026-07-10]
- **Mainframe**: IBM Enterprise COBOL has its own extensions and reserved words — set
  the matching `-std`/dialect in GnuCOBOL when porting.
- **Date handling**: use 4-digit years (`YYYY`); windowed 2-digit years are a lingering
  Y2K-class hazard.
- **Packed decimal**: `COMP-3` for efficient numeric storage — agree the exact length
  across systems.

## References (retrieved 2026-07-10)
- GnuCOBOL (open-source COBOL compiler, 3.2 release line): https://gnucobol.sourceforge.io/
- GnuCOBOL project / releases: https://sourceforge.net/projects/gnucobol/
- ISO/IEC 1989:2023 (COBOL standard): https://www.iso.org/standard/74527.html
- CWE-89 SQL Injection: https://cwe.mitre.org/data/definitions/89.html
