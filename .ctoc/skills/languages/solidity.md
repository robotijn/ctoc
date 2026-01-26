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
