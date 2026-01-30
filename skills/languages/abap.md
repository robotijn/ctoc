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
