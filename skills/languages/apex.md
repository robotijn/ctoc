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

## Governor Limits / Bulkification Footguns
Apex runs in a **multi-tenant** runtime, so every transaction is metered by **governor
limits**. There is no thread you tune; the depth surface is *staying inside the per-transaction
budget while processing records in bulk*.

- **The number-one footgun: SOQL or DML inside a loop.** A trigger fires on batches of up to
  **200 records**; a query or DML per iteration multiplies against the limit and throws
  `System.LimitException`. Bulkify: query once *before* the loop, collect into `Map`/`Set`,
  and DML **once after** the loop.
- Per-**synchronous** transaction the documented limits include **100 SOQL queries** and
  **150 DML statements** (asynchronous contexts get higher totals) — cite the current
  figures from the Apex Developer Guide "Execution Governors and Limits", do not hardcode a
  number that may drift.
- **Heap size** and **CPU time** are also metered — accumulating large lists across an entire
  data volume in memory blows the heap limit; process in batches (Batch Apex, `Database.Batchable`).
```apex
// FOOTGUN: SOQL in a loop — hits the per-transaction query governor limit
for (Order__c o : Trigger.new) {
    Account a = [SELECT Name FROM Account WHERE Id = :o.Account__c];  // WRONG: N queries
}

// SAFE: one query, Map lookup, DML once (bulkified)
Set<Id> ids = new Set<Id>();
for (Order__c o : Trigger.new) ids.add(o.Account__c);
Map<Id, Account> accts = new Map<Id, Account>(
    [SELECT Id, Name FROM Account WHERE Id IN :ids WITH SECURITY_ENFORCED]);
for (Order__c o : Trigger.new) o.OwnerName__c = accts.get(o.Account__c)?.Name;
```
- Source: developer.salesforce.com Apex Developer Guide, "Execution Governors and Limits".

## Error Handling Idioms
- Use `try` / `catch` with a **custom exception** (`public class OrderException extends
  Exception {}`); catch the specific `DmlException` / `QueryException`, not a bare `Exception`.
- For partial-success DML, use `Database.insert(list, false)` and inspect
  **`Database.SaveResult`** (`isSuccess()`, `getErrors()`) — an all-or-none insert rolls back
  the whole batch on one bad row, which is often not what you want in bulk processing.
- In triggers, reject a record with **`sObject.addError()`** so the platform surfaces the
  validation to the user and rolls back that row.
```apex
Database.SaveResult[] rs = Database.insert(orders, false);  // allOrNone = false
for (Database.SaveResult r : rs) {
    if (!r.isSuccess()) {
        for (Database.Error e : r.getErrors()) System.debug(e.getMessage());
    }
}
```
- Source: developer.salesforce.com Apex Developer Guide (`Database.SaveResult`, `addError`).

## Security and Dependency Gotchas
- **SOQL / SOSL injection (CWE-89)**: building a dynamic query
  (`Database.query('... WHERE Name = \'' + input + '\'')`) by concatenating input is
  injection. Use **bind variables** (`:input`) in the query, or if the value must be inlined,
  wrap it in **`String.escapeSingleQuotes()`**. (CWE-89 "SQL Injection" — cwe.mitre.org;
  SOQL is the query dialect but the neutralization class is identical.)
```apex
// INJECTABLE — CWE-89
String q = 'SELECT Id FROM Contact WHERE LastName = \'' + userInput + '\'';
List<Contact> bad = Database.query(q);                       // WRONG

// SAFE — bind variable (preferred) or escapeSingleQuotes for a dynamic value
List<Contact> ok = Database.query('SELECT Id FROM Contact WHERE LastName = :userInput');
String safe = String.escapeSingleQuotes(userInput);
```
- **CRUD/FLS enforcement**: Apex runs in **system mode** by default and does NOT enforce the
  running user's object/field permissions. Add **`WITH SECURITY_ENFORCED`** to SOQL, or run
  **`Security.stripInaccessible()`** on results, or use `WITH USER_MODE` — otherwise you leak
  fields the user cannot see.
- **`without sharing` privilege escalation**: a class declared `without sharing` ignores
  record-level sharing rules. Default to **`with sharing`**; use `without sharing` only
  deliberately and audited.
- Source: cwe.mitre.org (CWE-89), developer.salesforce.com Apex Developer Guide
  (`WITH SECURITY_ENFORCED`, `stripInaccessible`, `with sharing`). See References.

## Testing Conventions
- Test classes/methods are annotated **`@isTest`**; Salesforce **requires a documented
  minimum code coverage to deploy to production** (75% at the time of writing — confirm the
  current figure in the Apex Developer Guide, do not assume).
- Wrap the code under test in **`Test.startTest()` / `Test.stopTest()`** — this resets
  governor limits for the measured block and forces queued async (`@future`, queueable, batch)
  to run synchronously so you can assert on results.
- Never test against real org data: **create your own test data** in the test (tests run with
  `SeeAllData=false` by default) and stub callouts with **`Test.setMock`**
  (`HttpCalloutMock` / `WebServiceMock`).
```apex
@isTest
private class OrderServiceTest {
    @isTest static void bulkified() {
        List<Order__c> data = TestFactory.orders(200);   // build test data, not org data
        Test.startTest();                                 // fresh limit context
        insert data;
        Test.stopTest();                                  // async flushes here
        System.assertEquals(200, [SELECT COUNT() FROM Order__c]);
    }
}
```
- Source: developer.salesforce.com Apex Developer Guide (`@isTest`, `Test.startTest`,
  code-coverage requirement).

## Performance Traps
- **Non-bulkified triggers** (SOQL/DML in loops) — the same defect as the governor footgun;
  it is the top cause of failed data loads.
- **Unselective SOQL filters**: filtering on a non-indexed field over a large object throws a
  `QueryException: Non-selective query` — filter on indexed fields (Id, external Id, lookups)
  or add a custom index.
- **Recursive triggers**: an update inside a trigger that re-fires the same trigger; guard
  with a static boolean flag.
- **`Schema.describe` calls in loops**: describe results are expensive — compute once and
  cache in a static.

## Version-Specific Gotchas (dated, sourced)
- Salesforce ships **three major releases per year** — **Spring, Summer, Winter** — each
  bumping the **API version** (e.g. classes and metadata carry an `apiVersion`). Pin your
  metadata `apiVersion` deliberately; behavior can change with the version the code declares.
  [developer.salesforce.com release/API-version documentation, retrieved 2026-07-10]
- **`WITH SECURITY_ENFORCED`** and **`WITH USER_MODE`** / **`Database.queryWithBinds`** are
  the current CRUD/FLS-safe query forms — prefer them over manual `Schema.sObjectType`
  permission checks. [developer.salesforce.com Apex Developer Guide, retrieved 2026-07-10]
- Governor-limit and code-coverage **numbers can change between releases** — always read the
  current "Execution Governors and Limits" page rather than trusting a memorized figure.
  [developer.salesforce.com, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
- Apex Developer Guide — Execution Governors and Limits:
  https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_gov_limits.htm
- Apex Developer Guide — Enforcing CRUD/FLS (`WITH SECURITY_ENFORCED`, `stripInaccessible`):
  https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_perms_enforcing.htm
- Apex Developer Guide — Testing (`@isTest`, `Test.startTest`):
  https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_testing_intro.htm
