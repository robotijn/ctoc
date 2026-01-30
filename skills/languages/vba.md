# VBA CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude forgets `Option Explicit` — mandatory in every module
- Claude uses `Select`/`Activate` patterns — use direct references
- Claude uses `On Error Resume Next` globally — handle errors properly
- Claude concatenates SQL strings — use parameterized queries

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `rubberduck` | Modern VBA IDE add-in | Basic VBE |
| `mz-tools` | Productivity features | Manual coding |
| `vba-web` | REST API integration | Manual HTTP |
| `adodb` | Database connectivity | Manual file I/O |
| `git for office` | Version control | No VCS |

## Patterns Claude Should Use
```vba
Option Explicit

Sub ProcessData()
    Dim ws As Worksheet
    Dim lastRow As Long
    Dim i As Long

    On Error GoTo ErrorHandler

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual

    ' Direct reference, not Select/Activate
    Set ws = ThisWorkbook.Sheets("Data")
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row

    ' Work with ranges directly
    With ws.Range("A1:D" & lastRow)
        .Sort Key1:=.Columns(1), Order1:=xlAscending
    End With

CleanExit:
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    Exit Sub

ErrorHandler:
    MsgBox "Error " & Err.Number & ": " & Err.Description
    Resume CleanExit
End Sub
```

## Anti-Patterns Claude Generates
- Missing `Option Explicit` — undeclared variable bugs
- `ActiveCell.Select` — use direct range references
- Global `On Error Resume Next` — swallows all errors
- String SQL building — SQL injection
- Growing arrays without pre-sizing — slow

## Version Gotchas
- **Office 365**: Latest VBA features
- **64-bit Office**: Use `LongPtr` for pointers
- **Performance**: Disable ScreenUpdating in loops
- **Memory**: Set objects to Nothing when done
- **Consider alternatives**: Power Query, Python for data work
