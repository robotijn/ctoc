# Legal Hold Register

This directory holds active and historical litigation-hold entries. When any entry has `status: active`, the project is under freeze: destructive operations on plans, audit logs, and preservation copies are blocked by `src/lib/legal-hold.js`.

## When to institute a hold

Per Federal Rules of Civil Procedure Rule 37(e), once litigation is **reasonably anticipated**, the duty to preserve Electronically Stored Information attaches. Common triggers:

- A demand letter, subpoena, or complaint is received.
- Internal counsel issues a hold notice.
- Regulatory investigation is announced.
- A whistleblower or grievance touching the project surfaces.

If unsure: institute the hold. Releasing later is cheap. Spoliation sanctions (adverse-inference jury instruction, default judgment) are catastrophic.

## How to institute

```javascript
const { institute } = require('../../src/lib/legal-hold');

institute(projectRoot, {
  id: 'matter-2026-007-bigco-v-acme',
  matter: 'BigCo v. Acme — discovery covers auth flow December 2025 onward',
  custodians: ['ceo@acme.com', 'cto@acme.com'],
  scope: 'plans/, .ctoc/audit/, .ctoc/preservation/',
  instituted_by: 'general-counsel@acme.com',
});
```

This writes `<id>.yaml` with `status: active`. From that moment onward, `assertNotHeld()` will refuse destructive operations until the hold is released.

## How to release

```javascript
const { release } = require('../../src/lib/legal-hold');
release(projectRoot, 'matter-2026-007-bigco-v-acme', 'Settlement signed 2027-02-15; preservation obligation terminated by stipulation.');
```

Releasing flips `status: active` to `status: released` and appends the release reason. The hold file is **never deleted** — it stays as evidence that the hold existed and was lifted by an authorized action.

## File schema

```yaml
id: <unique identifier>
status: active | released
instituted_at: <ISO 8601 timestamp>
instituted_by: <identity>
matter: <description of the litigation or anticipated litigation>
scope: <which paths the hold covers>
custodians:
  - <identity>
  - <identity>
released_at: <ISO 8601 timestamp, present only after release>
release_reason: <reason, present only after release>
```

## References

- [Cornell Legal Information Institute — FRCP Rule 37](https://www.law.cornell.edu/rules/frcp/rule_37)
- [Duke Judicature on Rule 37(e) Electronic Spoliation](https://judicature.duke.edu/articles/rule-37e-the-new-law-of-electronic-spoliation/)
- [Electronic Discovery Reference Model](https://blog.pagefreezer.com/what-is-ediscovery-reference-model-edrm)
