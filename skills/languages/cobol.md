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

## Version Gotchas
- **GnuCOBOL 3.2+**: Good COBOL 2014 support
- **Mainframe**: IBM Enterprise COBOL rules
- **Date handling**: Use 4-digit years (YYYY)
- **Packed decimal**: COMP-3 for efficient storage
- **With modern systems**: Consider Cobrix for data extraction
