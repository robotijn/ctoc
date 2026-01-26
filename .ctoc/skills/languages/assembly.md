# Assembly CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
# (No standard linter/formatter)
nasm -f elf64 -o obj/main.o src/main.asm  # Assemble
ld -o bin/main obj/main.o              # Link
gdb ./bin/main                         # Debug
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **NASM/YASM** - x86/x64 assembler
- **GAS** - GNU Assembler (AT&T syntax)
- **objdump** - Disassembly and analysis
- **GDB** - Debugging at instruction level
- **Godbolt** - Compiler Explorer for optimization

## Project Structure
```
project/
├── src/               # Assembly source (.asm/.s)
├── include/           # Macro includes
├── obj/               # Object files
├── bin/               # Binaries
└── Makefile           # Build config
```

## Non-Negotiables
1. Document every function's calling convention
2. Preserve callee-saved registers (rbx, rbp, r12-15)
3. Align stack to ABI requirements (16-byte)
4. Clear security-sensitive data before return

## Red Lines (Reject PR)
- Undocumented magic numbers
- Missing stack frame setup
- Buffer operations without bounds checking
- Hardcoded addresses in portable code
- Self-modifying code without justification
- Secrets in data sections

## Testing Strategy
- **Unit**: Test with C harness
- **Integration**: Full binary tests
- **Validation**: Compare with reference impl

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Stack misalignment | Verify 16-byte alignment |
| Register clobbering | Save/restore properly |
| Endianness assumptions | Document byte order |
| Jump distance limits | Use near/far jumps |

## Performance Red Lines
- No O(n^2) in hot paths
- No cache misses in inner loops
- No branch mispredictions in critical paths

## Security Checklist
- [ ] All input bounds checked
- [ ] Stack canaries enabled
- [ ] No executable stack
- [ ] Secrets cleared from registers/stack
