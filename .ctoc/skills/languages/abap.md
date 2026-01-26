# ABAP CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow (ADT/Eclipse)
git status && git diff --stat          # In terminal (abapGit)
# Run ATC checks                       # ABAP Test Cockpit
# Run ABAP Unit tests                  # SE80/ADT
# Transport to QA                      # SE10
git add -p && git commit -m "feat: x"  # abapGit
```

## Tools (2024-2025)
- **ABAP Development Tools** - Eclipse-based IDE
- **abapGit** - Git integration
- **abaplint** - Static analysis
- **ABAP Unit** - Testing framework
- **ATC** - ABAP Test Cockpit

## Project Structure
```
project/
├── src/               # ABAP objects
│   ├── zcl_*.clas.abap   # Classes
│   ├── zif_*.intf.abap   # Interfaces
│   └── z*_*.fugr.abap    # Function groups
├── tests/             # Unit test classes
└── .abapgit.xml       # abapGit config
```

## Non-Negotiables
1. ABAP Clean Code principles
2. Unit tests for all business logic
3. Proper exception handling (CX_*)
4. CDS views for data access

## Red Lines (Reject PR)
- SELECT * in production code
- Native SQL without justification
- Hardcoded client/system values
- Missing authority checks
- Obsolete statements (MOVE, COMPUTE)
- Secrets in code or tables

## Testing Strategy
- **Unit**: ABAP Unit with mocks
- **Integration**: Full process tests
- **ATC**: Zero critical findings

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Performance with SELECT | Use FOR ALL ENTRIES properly |
| Authority check gaps | Check early, check all fields |
| Internal table memory | Clear/Free when done |
| Transport order conflicts | Coordinate with team |

## Performance Red Lines
- No O(n^2) nested SELECTs
- No SELECT in loops (use FOR ALL ENTRIES)
- No missing indexes on custom tables

## Security Checklist
- [ ] Authority checks on all sensitive data
- [ ] SQL injection prevented (parameters)
- [ ] Secrets in Secure Store (SSF)
- [ ] Audit logging for critical changes
