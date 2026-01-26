# COBOL CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
# Lint with enterprise tools
cobc -x -o bin/program src/program.cob # Compile (GnuCOBOL)
./bin/program < test/input.txt         # Test
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **GnuCOBOL** - Open source compiler
- **Micro Focus Visual COBOL** - Enterprise IDE
- **IBM Enterprise COBOL** - Mainframe standard
- **COBOL-IT** - Modern tooling
- **Cobrix** - Spark integration

## Project Structure
```
project/
├── src/               # COBOL source (.cob/.cbl)
├── copybooks/         # COPY members
├── jcl/               # Job control (mainframe)
├── test/              # Test data
└── doc/               # Documentation
```

## Non-Negotiables
1. Consistent paragraph naming conventions
2. Proper FILE STATUS checking
3. Structured programming (minimal GO TO)
4. Complete copybook documentation

## Red Lines (Reject PR)
- Unhandled file I/O errors
- ALTER statement usage
- Undocumented copybooks
- Missing decimal precision (PIC clause)
- PERFORM THRU without structure
- Secrets in source/copybooks

## Testing Strategy
- **Unit**: Paragraph-level testing
- **Integration**: Full job testing
- **Regression**: Compare output files

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Decimal truncation | Verify PIC clauses |
| File status ignored | Check after every I/O |
| REDEFINES confusion | Document memory layout |
| Y2K-style date bugs | Use 4-digit years |

## Performance Red Lines
- No O(n^2) in batch processing
- No unnecessary I/O operations
- No SORT for small datasets

## Security Checklist
- [ ] Input validated in PROCEDURE DIVISION
- [ ] FILE STATUS checked for all files
- [ ] Secrets from secure storage
- [ ] Audit trails for sensitive data
