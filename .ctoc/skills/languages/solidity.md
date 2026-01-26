# Solidity CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
forge fmt --check                      # Check format
slither .                              # Security analysis
forge test -vvv                        # Test
forge build                            # Build
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Foundry** - Modern development framework
- **Slither** - Static analysis (security)
- **Mythril** - Symbolic execution
- **OpenZeppelin** - Audited contract libraries
- **Hardhat** - Alternative JS ecosystem

## Project Structure
```
project/
├── src/               # Contracts (.sol)
├── test/              # Foundry tests
├── script/            # Deployment scripts
├── lib/               # Dependencies
└── foundry.toml       # Config
```

## Non-Negotiables
1. Checks-Effects-Interactions pattern
2. Reentrancy guards on external calls
3. Use OpenZeppelin for standard patterns
4. Professional audit before mainnet

## Red Lines (Reject PR)
- tx.origin for authentication
- Unchecked external calls
- Missing reentrancy protection
- Delegatecall to untrusted contracts
- Hardcoded addresses (use immutable)
- Missing access control on critical functions

## Testing Strategy
- **Unit**: Foundry/Hardhat tests, 100% coverage
- **Fuzz**: Foundry invariant testing
- **Formal**: Certora or Halmos verification

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Reentrancy | Use ReentrancyGuard |
| Integer overflow | Solidity 0.8+ has checks |
| Front-running | Use commit-reveal |
| Gas griefing | Limit external calls |

## Performance Red Lines
- No O(n^2) in gas-sensitive paths
- No unbounded loops
- No excessive storage writes

## Security Checklist
- [ ] All external calls checked
- [ ] Access control on every public function
- [ ] Secrets never on-chain
- [ ] Audit completed before mainnet deploy
