# ABAP CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses `SELECT *` — specify fields explicitly
- Claude does SELECT in loops — use FOR ALL ENTRIES
- Claude forgets authority checks — always check authorization
- Claude uses obsolete syntax (MOVE, COMPUTE) — use modern ABAP

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `abap development tools` | Eclipse-based IDE | SE80 alone |
| `abapgit` | Git integration | Manual transport |
| `abaplint` | Static analysis | No linting |
| `abap unit` | Testing framework | Ad-hoc tests |
| `atc` | ABAP Test Cockpit | Manual review |

## Patterns Claude Should Use
```abap
CLASS zcl_order_processor DEFINITION.
  PUBLIC SECTION.
    METHODS process_orders
      IMPORTING
        it_order_ids TYPE ztt_order_ids
      RETURNING
        VALUE(rt_results) TYPE ztt_results
      RAISING
        zcx_order_error.
ENDCLASS.

CLASS zcl_order_processor IMPLEMENTATION.
  METHOD process_orders.
    " Authority check first
    AUTHORITY-CHECK OBJECT 'Z_ORDER'
      ID 'ACTVT' FIELD '02'.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_order_error.
    ENDIF.

    " Efficient bulk select (not in loop!)
    SELECT order_id, status, amount
      FROM zorders
      FOR ALL ENTRIES IN @it_order_ids
      WHERE order_id = @it_order_ids-order_id
      INTO TABLE @DATA(lt_orders).

    " Process using modern ABAP
    rt_results = VALUE #(
      FOR ls_order IN lt_orders
      ( order_id = ls_order-order_id
        processed = abap_true )
    ).
  ENDMETHOD.
ENDCLASS.
```

## Anti-Patterns Claude Generates
- `SELECT *` — specify needed fields only
- SELECT in loops — use FOR ALL ENTRIES
- Missing AUTHORITY-CHECK — security violation
- Obsolete `MOVE a TO b` — use `b = a`
- Hardcoded client/system — use sy-mandt, sy-sysid

## Version Gotchas
- **ABAP 7.5+**: Inline declarations, constructor expressions
- **CDS views**: Preferred for data modeling
- **RAP**: Use for new Fiori apps
- **Clean ABAP**: Follow SAP guidelines
- **With S/4HANA**: Simplifications apply, check compatibility

## Platform Execution / Resource Footguns (LUW & work process)
ABAP has no general threading model exposed to application code; the depth surface is the
**database logical unit of work (LUW)** and the finite **work-process / dialog-step budget**.

- A **database LUW** is bracketed by `COMMIT WORK` / `ROLLBACK WORK`. Bundle changes into
  ONE LUW — do not `COMMIT WORK` inside a loop (each commit is a round trip and breaks
  atomicity). Use the **update task** (`CALL FUNCTION ... IN UPDATE TASK` then a single
  `COMMIT WORK`) to defer DB writes to one bundled unit.
- Dialog work processes enforce a **runtime limit** (the `rdisp/max_wprun_time` timeout):
  a long-running `SELECT` in a loop or an unbounded `LOOP AT` can hit `TIME_OUT` and dump.
  Push heavy work to background jobs (`SUBMIT ... VIA JOB`) or async RFC.
- Large internal tables live in **work-process memory** — an unbounded `SELECT ... INTO
  TABLE` can exhaust the extended memory quota (`TSV_TNEW_PAGE_ALLOC_FAILED`). Filter and
  package (`PACKAGE SIZE`) instead of loading everything.
```abap
" One LUW: bundle DB writes, single COMMIT WORK — not per-iteration commits.
LOOP AT lt_orders INTO DATA(ls_order).
  CALL FUNCTION 'ZUPDATE_ORDER' IN UPDATE TASK EXPORTING is_order = ls_order.
ENDLOOP.
COMMIT WORK AND WAIT.   " single commit closes the LUW; AND WAIT = synchronous update
```
- Source: SAP ABAP keyword documentation (LUW, `COMMIT WORK`, update task), help.sap.com.
  See References.

## Error Handling Idioms
Two error channels coexist: the **return code `sy-subrc`** (set by most statements) and
**class-based exceptions** (`TRY` / `CATCH` / `CLEANUP`, rooted at `CX_ROOT`).

```abap
" Check sy-subrc immediately after statements that set it:
READ TABLE lt_orders INTO DATA(ls_order) WITH KEY order_id = lv_id.
IF sy-subrc <> 0.
  RAISE EXCEPTION TYPE zcx_order_error.   " do not proceed on a failed READ
ENDIF.

" Class-based exceptions: CLEANUP runs on the way out (like finally):
TRY.
    lo_service->process( ).
  CATCH cx_sy_arithmetic_error INTO DATA(lx).   " catch the specific class, not CX_ROOT blindly
    MESSAGE lx->get_text( ) TYPE 'E'.
  CLEANUP.
    lo_service->rollback( ).                     " runs even on an uncaught propagate
ENDTRY.
```
- Anti-pattern: catching `CX_ROOT` and swallowing (`CATCH cx_root.` with an empty body)
  hides real failures — catch the narrowest class you handle. Ignoring `sy-subrc` after a
  `SELECT SINGLE` / `READ TABLE` proceeds on stale or empty data.
- Source: SAP ABAP keyword documentation (`sy-subrc`, `CX_ROOT`, `TRY`), help.sap.com.

## Security and Dependency Gotchas
- **Dynamic Open SQL / Native SQL injection (CWE-89)**: building a `WHERE`/`FROM` clause by
  concatenating input into a **dynamic** token (`SELECT ... WHERE (lv_dynamic_where)`, or
  `EXEC SQL`/ADBC Native SQL) is SQL injection. Bind values with **host variables** (`@`)
  and validate any dynamic identifier with **`CL_ABAP_DYN_PRG`** (`check_column_name`,
  `check_whitelist`, `quote`) — never string-concatenate a raw identifier or value.
  (CWE-89 "SQL Injection" — cwe.mitre.org.)
```abap
" INJECTABLE: user text spliced into a dynamic WHERE — CWE-89
DATA(lv_where) = |carrid = '{ iv_carrier }'|.        " WRONG
SELECT * FROM sflight WHERE (lv_where) INTO TABLE @DATA(lt_bad).

" SAFE: host-variable bind for values; CL_ABAP_DYN_PRG to validate dynamic identifiers
SELECT * FROM sflight WHERE carrid = @iv_carrier INTO TABLE @DATA(lt_ok).
DATA(lv_col) = cl_abap_dyn_prg=>check_column_name( iv_col ).   " whitelists identifier
```
- **Missing authorization checks**: every access to protected data needs an
  **`AUTHORITY-CHECK OBJECT`** against the relevant authorization object, with `sy-subrc`
  verified — an omitted check is a broken-access-control hole (the ABAP analog of missing
  CRUD/FLS). In RAP / ABAP Cloud, authorization is declared and enforced by the
  Access Control (`DCL`) layer.
- **Path traversal in `OPEN DATASET`**: a filename built from input can escape the intended
  directory (CWE-22) — validate against an allow-list and use `AUTHORITY-CHECK` on
  `S_DATASET`.
- Source: cwe.mitre.org (CWE-89), SAP ABAP keyword documentation (`CL_ABAP_DYN_PRG`,
  `AUTHORITY-CHECK`), help.sap.com. See References.

## Testing Conventions
- **ABAP Unit**: assertions via **`CL_ABAP_UNIT_ASSERT`** (`assert_equals`, `assert_initial`,
  `assert_bound`). Test methods carry `FOR TESTING`; isolate DB/RFC dependencies with
  **test doubles** (`CL_ABAP_TESTDOUBLE_FACTORY`) so tests do not hit the live database.
- **ATC (ABAP Test Cockpit)** runs the static-check variant (including the security and
  performance checks) — treat ATC priority-1 findings as build-breakers, not advisories.
- **Code Inspector (SCI)** underlies ATC for older stacks.
```abap
CLASS ltc_order DEFINITION FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    METHODS discount_applied FOR TESTING.
ENDCLASS.
CLASS ltc_order IMPLEMENTATION.
  METHOD discount_applied.
    cl_abap_unit_assert=>assert_equals( act = calc( 100 ) exp = 90 ).
  ENDMETHOD.
ENDCLASS.
```
- Source: SAP ABAP keyword documentation (ABAP Unit, `CL_ABAP_UNIT_ASSERT`, ATC),
  help.sap.com.

## Performance Traps
- **`SELECT *` vs field list**: read only the columns you use — `SELECT *` pulls every field
  and defeats HANA column-store pruning.
- **`SELECT` inside `LOOP`** (the "N+1" trap): replace with a set-based read — a single join
  or **`FOR ALL ENTRIES IN`** (guard against an **empty** driver table, which turns it into a
  full-table scan) — or a CDS view. On HANA, push the aggregation down into the database.
- **Missing secondary keys**: repeated `READ TABLE ... WITH KEY` on a `STANDARD TABLE` is a
  linear scan each time — declare a **sorted/hashed secondary key** or use a `SORTED`/`HASHED`
  table for O(log n)/O(1) lookups.
- Prefer `INTO TABLE @DATA(...)` (bulk) over row-by-row `SELECT ... ENDSELECT`.
- Source: SAP ABAP keyword documentation (`FOR ALL ENTRIES`, secondary keys), help.sap.com.

## Version-Specific Gotchas (dated, sourced)
- **ABAP Cloud** is the current development model for SAP BTP and S/4HANA Cloud: only
  **released APIs** (objects with a stable release contract) may be used — a classic
  function module or table that is *not* released is off-limits, and the ATC "Use of
  released objects" check enforces it. Code that compiled on-prem can fail this check in
  ABAP Cloud. [help.sap.com ABAP Cloud / released-API documentation, retrieved 2026-07-10]
- **RAP (RESTful Application Programming model)** is the mandated model for new Fiori/OData
  services on 7.5x+ ; business logic lives in behavior definitions/implementations, and
  authorization is declared in **CDS Access Control (DCL)** rather than ad-hoc
  `AUTHORITY-CHECK`. [help.sap.com RAP documentation, retrieved 2026-07-10]
- **Open SQL → ABAP SQL**: the strict syntax (mandatory `@` host-variable escaping, comma
  separated field lists) is required in ABAP Cloud and is the safe default everywhere.
  [help.sap.com ABAP keyword documentation, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
- ABAP keyword documentation (LUW, ABAP SQL, `CL_ABAP_DYN_PRG`, ABAP Unit):
  https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/index.htm
- ABAP Cloud (released APIs, ABAP Cloud development model): https://help.sap.com/docs/abap-cloud
- Clean ABAP style guide: https://github.com/SAP/styleguides
