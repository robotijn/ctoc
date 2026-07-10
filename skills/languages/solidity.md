# Solidity CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses `tx.origin` for auth — use `msg.sender`
- Claude forgets reentrancy guards — use OpenZeppelin ReentrancyGuard
- Claude makes unchecked external calls — check return values
- Claude uses unbounded loops — gas limit issues

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `foundry` | Modern dev framework | Truffle (legacy) |
| `slither` | Security analysis | No security checks |
| `mythril` | Symbolic execution | Just testing |
| `openzeppelin` | Audited libraries | Custom implementations |
| `certora`/`halmos` | Formal verification | Just fuzzing |

## Patterns Claude Should Use
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Vault is ReentrancyGuard, Ownable {
    mapping(address => uint256) private balances;

    // Checks-Effects-Interactions pattern
    function withdraw(uint256 amount) external nonReentrant {
        // Checks
        require(balances[msg.sender] >= amount, "Insufficient");

        // Effects (update state BEFORE external call)
        balances[msg.sender] -= amount;

        // Interactions (external call LAST)
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }

    // Never use tx.origin
    function isOwner() internal view returns (bool) {
        return msg.sender == owner();  // NOT tx.origin
    }
}
```

## Anti-Patterns Claude Generates
- `tx.origin` for authentication — use `msg.sender`
- External calls without reentrancy guard — use `nonReentrant`
- Unchecked `.call()` return — always check success
- Unbounded loops `for (i = 0; i < array.length; i++)` — gas griefing
- Missing access control — use OpenZeppelin Access

## Version Gotchas
- **Solidity 0.8+**: Built-in overflow checks
- **Audit requirement**: Always before mainnet
- **Checks-Effects-Interactions**: Update state before external calls
- **Gas optimization**: Storage is expensive, use memory
- **With upgrades**: Use OpenZeppelin Upgradeable contracts

## Execution / Ordering Footguns (the concurrency-equivalent)
A contract has no threads, but the EVM's **adversarial transaction ordering** is the
same hazard class: an attacker observes your pending call and reorders/re-enters around
it. The mental model that breaks Claude is "my function runs atomically top-to-bottom" —
an external call **hands control to attacker code mid-function**.

```solidity
// FOOTGUN: reentrancy (SWC-107 / CWE-841). The external call sits BEFORE the state
// update, so the callee re-enters withdraw() and drains before balances is zeroed.
function withdraw(uint256 amount) external {
    require(balances[msg.sender] >= amount, "Insufficient");
    (bool ok, ) = msg.sender.call{value: amount}("");   // WRONG: interaction first
    require(ok, "Transfer failed");
    balances[msg.sender] -= amount;                      // too late — re-entered above
}

// SAFE: checks-effects-interactions — mutate state BEFORE the external call, and add a
// nonReentrant guard as defense-in-depth. See the Vault example above.
function withdrawOk(uint256 amount) external nonReentrant {
    require(balances[msg.sender] >= amount, "Insufficient");
    balances[msg.sender] -= amount;                      // effects first
    (bool ok, ) = msg.sender.call{value: amount}("");    // interaction last
    require(ok, "Transfer failed");
}
```
- **Reentrancy (SWC-107 → CWE-841 Improper Enforcement of Behavioral Workflow)** — enforce
  **checks-effects-interactions** ordering; `ReentrancyGuard` is the belt to that suspenders.
  Cross-function and read-only reentrancy exist too — the guard must cover every path that
  shares mutated state, and view functions read mid-reentrancy can return stale values.
- **Front-running / MEV**: the mempool is public. A naked `approve`+`transferFrom` or a
  price-sensitive swap can be sandwiched. Use commit-reveal, slippage bounds, or private
  relays; never assume your tx lands before an observer's.
- Sources: swcregistry.io/docs/SWC-107, cwe.mitre.org/data/definitions/841.html. See References.

## Error Handling Idioms
`require` / `revert` / `assert` are three different contracts — Claude conflates them.
`assert` signals an **invariant that must never be false** (a failed `assert` is a `Panic`,
consuming all gas pre-0.8.0 and flagged as a bug); `require`/`revert` signal **expected,
recoverable** input/precondition failures.

```solidity
// Custom errors are cheaper than string reverts (no string in bytecode/return data)
// and carry structured data — prefer them since 0.8.4.
error InsufficientBalance(uint256 requested, uint256 available);

function withdraw(uint256 amount) external {
    uint256 bal = balances[msg.sender];
    if (amount > bal) revert InsufficientBalance(amount, bal);   // not require("...")
    // ... effects, then interactions ...
}
```
- **`require(cond, CustomError())`** (0.8.26+) and `revert CustomError(...)` beat string
  messages on gas and give callers typed failure data.
- **Always check the low-level `call` bool** — a failed `.call()` returns `false`, it does
  NOT revert. Ignoring it is **SWC-104 Unchecked Call Return Value (→ CWE-252)**.
- Reserve `assert` for invariants (a tripped `assert` = a bug to fix, not a user error).

## Security and Dependency Gotchas
- **Integer over/underflow — SWC-101 (→ CWE-682 Incorrect Calculation).** Solidity **0.8.0+
  reverts on overflow by default**; pre-0.8 silently wraps (use OpenZeppelin `SafeMath`
  there). An `unchecked { }` block **opts back out** of the checks — only use it where you
  have proven the bound, and comment why. Source: soliditylang.org 0.8.0 release notes.
- **`tx.origin` for authorization — SWC-115 (→ CWE-477 Use of Obsolete Function).** A
  phishing contract calling yours makes `tx.origin` the victim EOA; use `msg.sender`.
- **Access control**: missing/mis-scoped `onlyOwner`/role checks let anyone call privileged
  functions. Use OpenZeppelin `Ownable`/`AccessControl`; pin the OZ version in the lockfile.
- **Audit tooling**: run **Slither** (static analysis) and **Mythril** (symbolic execution)
  in CI; formal-verify critical invariants with Certora/Halmos. Never ship to mainnet
  un-audited. Sources: swcregistry.io/docs/SWC-101, SWC-115, SWC-104.

## Testing Conventions
```solidity
// Foundry test — Solidity-native, fast, with built-in fuzzing.
import "forge-std/Test.sol";

contract VaultTest is Test {
    Vault vault;
    function setUp() public { vault = new Vault(); }

    // Fuzz: forge feeds random amounts; the invariant must hold for all of them.
    function testFuzz_withdrawNeverExceedsBalance(uint96 amount) public {
        vm.assume(amount > 0);
        vm.expectRevert();                 // assert the error path, not just happy
        vault.withdraw(amount);            // no deposit -> must revert
    }
}
```
- **Foundry** (`forge test`, `forge coverage`) with property/invariant tests and fuzzing is
  the modern default; Hardhat is the JS/TS alternative. Test the revert paths explicitly
  (`vm.expectRevert`) — a happy-path-only suite hides exactly the SWC classes above.

## Performance / Gas Traps
- **Storage is ~100× a memory op**: an `SLOAD`/`SSTORE` dwarfs stack/memory work. Cache a
  storage var in a local before a loop; write it back once.
- **Unbounded loops hit the block gas limit** and can brick a function (griefing) — never
  iterate over a user-growable array in a state-changing call; use pull-over-push accounting.
- **`calldata` over `memory`** for external-function reference args (no copy), and **pack
  `uint`s** into a single 32-byte slot where lifetimes allow. Measure with `forge test --gas-report`.

## Version-Specific Gotchas (verified 2026-07-10)
- **Current stable: Solidity 0.8.36**, released 2026-07-09
  [github.com/ethereum/solidity/releases, retrieved 2026-07-10].
- **0.8.0** made overflow/underflow checks the default (SWC-101 mitigated unless you wrap
  code in `unchecked { }`) [soliditylang.org 0.8.0 breaking-changes, retrieved 2026-07-10].
- **0.8.4** introduced **custom errors**; **0.8.26** added `require(cond, CustomError())`.
- Solidity is **pre-1.0** — pin an exact `pragma solidity 0.8.x` (not a floating `^`) for
  audited production bytecode so the compiler version is deterministic.

## References (retrieved 2026-07-10)
- Solidity releases (current 0.8.36): https://github.com/ethereum/solidity/releases
- Solidity docs (security considerations): https://docs.soliditylang.org/en/latest/security-considerations.html
- SWC-107 Reentrancy: https://swcregistry.io/docs/SWC-107
- SWC-101 Integer Overflow and Underflow: https://swcregistry.io/docs/SWC-101
- SWC-115 Authorization through tx.origin: https://swcregistry.io/docs/SWC-115
- SWC-104 Unchecked Call Return Value: https://swcregistry.io/docs/SWC-104
- CWE-841 Improper Enforcement of Behavioral Workflow: https://cwe.mitre.org/data/definitions/841.html
- OpenZeppelin ReentrancyGuard: https://docs.openzeppelin.com/contracts/5.x/api/utils#ReentrancyGuard
- Foundry Book (forge test / fuzzing): https://book.getfoundry.sh/
- Slither static analyzer: https://github.com/crytic/slither
