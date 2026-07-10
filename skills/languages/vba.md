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

## Execution Model Footguns (single-threaded STA)
VBA runs on the host application's **single-threaded apartment (STA)** — there is no true
async and no user-created threads. The depth surface is keeping the UI responsive without
re-entrancy bugs.

- **`DoEvents` re-entrancy hazard**: `DoEvents` yields so the message pump can process
  pending events — but that lets the user click a button (or a timer fire) that **re-enters
  the same procedure** while it is still running. Guard long procedures with a module-level
  "busy" flag, or avoid `DoEvents` entirely.
- **Blocking the UI**: any long loop freezes the whole application (STA); there is no
  background thread to offload to. Show progress via the status bar and update sparingly, or
  move heavy work out of VBA (Power Query, an external process).
- **Application-object lifetime**: automating another Office app
  (`CreateObject("Excel.Application")`) leaves an orphaned process if you don't `.Quit` and
  release the reference — set objects to `Nothing` in your cleanup label.
```vba
Private mBusy As Boolean

Sub LongJob()
    If mBusy Then Exit Sub          ' re-entrancy guard around DoEvents
    mBusy = True
    On Error GoTo Done
    Dim i As Long
    For i = 1 To 1000000
        If i Mod 10000 = 0 Then
            Application.StatusBar = "Progress: " & i
            DoEvents                 ' yields — the guard prevents re-entry
        End If
    Next i
Done:
    mBusy = False
    Application.StatusBar = False
End Sub
```
- Source: learn.microsoft.com Office VBA language reference (`DoEvents`, application lifetime).

## Error Handling Idioms
VBA has no structured `try`/`catch`; errors are handled with **`On Error GoTo` labels**, the
intrinsic **`Err`** object, and **`Resume`**.

```vba
Sub SafeWork()
    On Error GoTo ErrHandler
    ' ... risky work ...
    OpenConnection

CleanExit:
    On Error Resume Next
    CloseConnection                 ' cleanup always runs
    Exit Sub

ErrHandler:
    MsgBox "Error " & Err.Number & ": " & Err.Description
    Resume CleanExit                ' route to the single cleanup label
End Sub
```
- **Anti-pattern: global `On Error Resume Next`.** It swallows *every* error silently for the
  rest of the procedure — subsequent code runs on invalid state. Use it only to bracket a
  single expected-to-fail statement, and re-enable handling (`On Error GoTo 0`) right after.
- Always check `Err.Number` before assuming a `Resume Next` block succeeded.
- Source: learn.microsoft.com Office VBA language reference (`On Error`, `Err`, `Resume`).

## Security and Dependency Gotchas
- **Auto-executing macros are a malware vector**: `Auto_Open` (Excel), `Document_Open` /
  `Workbook_Open`, and `AutoExec` (Word) run code automatically when a file opens — the
  classic macro-malware entry point. **Office blocks macros in files that carry the
  Mark of the Web (files downloaded from the internet or opened from email) by default**;
  do not instruct users to "enable content" to work around it, and never ship a workbook
  whose value depends on an auto-exec macro to untrusted recipients.
- **Command injection via `Shell` / `WScript.Shell` (CWE-78)**: passing user-controlled text
  to `Shell(...)` or `CreateObject("WScript.Shell").Run(...)` is OS command injection.
  Validate/allow-list the target; never concatenate user input into a command line.
- **SQL injection via ADO (CWE-89)**: building a SQL string with `&`-concatenated input and
  running it through ADODB is SQL injection — use an `ADODB.Command` with **parameters**.
```vba
' INJECTABLE — CWE-89 (ADO string concat)
rs.Open "SELECT * FROM Users WHERE Name = '" & txtName & "'", conn   ' WRONG

' SAFE — parameterized ADODB.Command
Dim cmd As Object: Set cmd = CreateObject("ADODB.Command")
cmd.ActiveConnection = conn
cmd.CommandText = "SELECT * FROM Users WHERE Name = ?"
cmd.Parameters.Append cmd.CreateParameter("p1", 200, 1, 50, txtName)  ' adVarChar, adParamInput
Set rs = cmd.Execute
```
- Source: cwe.mitre.org (CWE-78, CWE-89); learn.microsoft.com "Macros from the internet are
  blocked by default in Office". See References.

## Testing Conventions
- **Rubberduck** adds a real unit-test framework and code inspections to the VBE — annotate
  test modules and methods and run assertions (`Assert.AreEqual`, `Assert.IsTrue`), instead
  of hand-run macro subs. It also flags `Option Explicit` omissions and dead code.
```vba
'@TestModule
'@TestMethod("Arithmetic")
Public Sub Adds()
    Assert.AreEqual 4#, AddNumbers(2, 2)      ' Rubberduck assertion
End Sub
```
- Keep business logic in **functions that return values** (pure, no `MsgBox`/`Select`) so it
  is testable without a live UI.
- Source: Rubberduck VBA project documentation.

## Performance Traps
- **`.Select` / `.Activate` per operation**: selecting a cell before acting on it is slow and
  fragile — work through **direct object references** (`ws.Range("A1").Value = ...`).
- **Cell-by-cell loops**: reading/writing one cell at a time crosses the COM boundary each
  time. Read the whole range into a **VBA array** (`v = ws.Range("A1:D1000").Value`), process
  in memory, and write the array back in one assignment — often 100x faster.
- **Screen/calc churn**: set `Application.ScreenUpdating = False` and
  `Application.Calculation = xlCalculationManual` around bulk work; restore them in cleanup.
- Source: learn.microsoft.com Excel VBA performance guidance (`ScreenUpdating`, range arrays).

## Version-Specific Gotchas (dated, sourced)
- **VBA7** (Office 2010+) introduced the **`#If VBA7`** conditional and, for 64-bit Office,
  the **`PtrSafe`** keyword and **`LongPtr`** type on `Declare` statements. A `Declare`
  written for 32-bit Office **fails to compile** in 64-bit Office without `PtrSafe`/`LongPtr` —
  guard cross-bitness code with `#If VBA7 Then ... #If Win64 Then`.
  [learn.microsoft.com "64-bit Visual Basic for Applications overview", retrieved 2026-07-10]
```vba
#If VBA7 Then
    Private Declare PtrSafe Function GetTickCount Lib "kernel32" () As Long
#Else
    Private Declare Function GetTickCount Lib "kernel32" () As Long
#End If
```
- **Macros from the internet are blocked by default** in current Office (Access, Excel,
  PowerPoint, Visio, Word) based on the file's **Mark of the Web** — a policy shift that
  breaks distribution patterns relying on downloaded macro-enabled files. Sign macros or use
  a Trusted Location instead of prompting users to bypass the block.
  [learn.microsoft.com "Macros from the internet are blocked by default in Office",
  retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- CWE-78 (OS Command Injection): https://cwe.mitre.org/data/definitions/78.html
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
- 64-bit Visual Basic for Applications overview (`PtrSafe`, `LongPtr`, `VBA7`):
  https://learn.microsoft.com/en-us/office/vba/language/concepts/getting-started/64-bit-visual-basic-for-applications-overview
- Macros from the internet are blocked by default in Office:
  https://learn.microsoft.com/en-us/deployoffice/security/internet-macros-blocked
