# VBA CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```vba
' Daily workflow (VBA Editor)
' Use Rubberduck for lint/format
' Debug > Compile VBAProject       ' Compile check
' Run test module                  ' Test
' Export modules for version control
```

## Tools (2024-2025)
- **Rubberduck** - Modern VBA IDE add-in
- **MZ-Tools** - Productivity features
- **VBA-Web** - REST API integration
- **ADODB** - Database connectivity
- **Git for Office** - Version control

## Project Structure
```
project/
├── src/               # Exported .bas/.cls files
├── tests/             # Test modules
├── forms/             # UserForms (.frm)
├── ThisWorkbook.cls   # Workbook code
└── README.md          # Documentation
```

## Non-Negotiables
1. Option Explicit in every module
2. Error handling in every procedure
3. Avoid Select/Activate patterns
4. Use With blocks for objects

## Red Lines (Reject PR)
- Missing Option Explicit
- On Error Resume Next globally
- ActiveCell/Selection overuse
- String concatenation for SQL (injection)
- Hardcoded file paths
- GoTo outside error handling

## Testing Strategy
- **Unit**: Rubberduck unit tests
- **Integration**: Full macro tests
- **Manual**: User acceptance testing

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Object not set | Check for Nothing |
| Screen flicker | Application.ScreenUpdating = False |
| Memory leaks | Set objects = Nothing |
| Implicit type coercion | Use explicit conversions |

## Performance Red Lines
- No O(n^2) cell-by-cell operations
- No Select/Activate in loops
- No recalculation in loops (manual calc)

## Security Checklist
- [ ] Input validated before use
- [ ] SQL uses parameterized queries (ADODB)
- [ ] Secrets not stored in code/cells
- [ ] Macro security settings documented
