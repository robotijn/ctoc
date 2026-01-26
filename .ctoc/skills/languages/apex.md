# Apex CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
sf scanner run -p force-app/           # Lint (PMD/Graph Engine)
sf apex run test -l RunLocalTests      # Test
sf project deploy start                # Deploy
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Salesforce CLI (sf)** - Development workflow
- **VS Code + Salesforce Extensions** - Modern IDE
- **PMD for Apex** - Static analysis
- **Salesforce Code Analyzer** - Security scanning
- **Salesforce DevOps Center** - CI/CD

## Project Structure
```
project/
├── force-app/main/default/
│   ├── classes/       # Apex classes
│   ├── triggers/      # Triggers
│   └── lwc/           # Lightning components
├── scripts/           # Automation
└── sfdx-project.json  # Project config
```

## Non-Negotiables
1. Bulkify all code (handle 200+ records)
2. Governor limit awareness (SOQL, DML limits)
3. Test coverage 75%+ (aim for 90%+)
4. Trigger handler patterns (one trigger per object)

## Red Lines (Reject PR)
- SOQL/DML in loops
- Hardcoded record IDs
- Missing test assertions
- Trigger logic without handler
- No null checking on query results
- Secrets in code (use Custom Settings/Metadata)

## Testing Strategy
- **Unit**: @isTest classes, mock data
- **Integration**: Full process tests
- **Security**: CRUD/FLS checks verified

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| SOQL in loops | Collect IDs, query once |
| Governor limits | Bulkify, use async |
| Mixed DML | Use @future or Queueable |
| Test data dependency | Create test data in tests |

## Performance Red Lines
- No O(n^2) SOQL/DML patterns
- No synchronous callouts in bulk operations
- No queries without selective filters

## Security Checklist
- [ ] CRUD/FLS checks enforced
- [ ] WITH SECURITY_ENFORCED in SOQL
- [ ] Secrets in Protected Custom Settings
- [ ] Sharing rules respected (with/without sharing)
