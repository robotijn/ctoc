# Apex CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude puts SOQL/DML in loops — bulkify for 200+ records
- Claude hardcodes Record IDs — use Custom Metadata or describe
- Claude forgets governor limits — always design for bulk
- Claude creates trigger logic without handler — one trigger per object

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `salesforce cli (sf)` | Development workflow | Manual deployment |
| `vs code + sf extensions` | Modern IDE | Developer Console |
| `pmd for apex` | Static analysis | No linting |
| `salesforce code analyzer` | Security scanning | Manual review |
| `devops center` | CI/CD | Manual releases |

## Patterns Claude Should Use
```apex
// Bulkified trigger handler pattern
public class OrderTriggerHandler {
    public static void handleBeforeInsert(List<Order__c> newOrders) {
        // Collect all account IDs first
        Set<Id> accountIds = new Set<Id>();
        for (Order__c ord : newOrders) {
            if (ord.Account__c != null) {
                accountIds.add(ord.Account__c);
            }
        }

        // Single query outside loop
        Map<Id, Account> accounts = new Map<Id, Account>(
            [SELECT Id, Name, Discount__c
             FROM Account
             WHERE Id IN :accountIds
             WITH SECURITY_ENFORCED]
        );

        // Process in bulk
        for (Order__c ord : newOrders) {
            Account acc = accounts.get(ord.Account__c);
            if (acc != null) {
                ord.Discount__c = acc.Discount__c;
            }
        }
    }
}

// Trigger delegates to handler
trigger OrderTrigger on Order__c (before insert) {
    if (Trigger.isBefore && Trigger.isInsert) {
        OrderTriggerHandler.handleBeforeInsert(Trigger.new);
    }
}
```

## Anti-Patterns Claude Generates
- SOQL/DML in loops — collect IDs, query once
- Hardcoded IDs `001xx...` — use Custom Metadata
- Missing `WITH SECURITY_ENFORCED` — CRUD/FLS violation
- Trigger logic directly in trigger — use handler class
- Single-record design — always bulkify

## Version Gotchas
- **Governor limits**: 100 SOQL, 150 DML per transaction
- **Bulkification**: Design for 200+ records always
- **Test coverage**: 75% minimum, aim for 90%+
- **Security**: WITH SECURITY_ENFORCED in all SOQL
- **With LWC**: Modern UI, use Apex for backend only
