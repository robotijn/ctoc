# Assembly CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude forgets stack alignment — 16-byte align required by ABI
- Claude clobbers callee-saved registers — preserve rbx, rbp, r12-r15
- Claude uses undocumented magic numbers — define as constants
- Claude omits bounds checking — buffer overflows

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `nasm`/`yasm` | x86/x64 assembler | Gas for Intel syntax |
| `objdump` | Disassembly | Raw hex |
| `gdb` | Debugging | Print statements |
| `godbolt` | Compiler explorer | Blind optimization |
| `valgrind` | Memory checking | Trust memory access |

## Patterns Claude Should Use
```asm
; Document calling convention
; Input: rdi = pointer to data, rsi = length
; Output: rax = result
; Clobbers: rcx, rdx
; Preserves: rbx, rbp, r12-r15
process_data:
    push rbp                ; Stack frame
    mov rbp, rsp
    push rbx                ; Save callee-saved
    sub rsp, 8              ; Align to 16 bytes

    ; Bounds check before access
    cmp rsi, MAX_LENGTH
    ja .error

    ; ... processing ...

    add rsp, 8
    pop rbx
    pop rbp
    ret

; Define constants, not magic numbers
MAX_LENGTH equ 4096
BUFFER_SIZE equ 256
```

## Anti-Patterns Claude Generates
- Missing stack alignment — causes crashes on SSE/AVX
- Clobbering rbx, rbp, r12-r15 — must preserve across calls
- Magic numbers `mov rax, 42` — use named constants
- No bounds checking — buffer overflows
- Hardcoded addresses — use relocatable addressing

## Version Gotchas
- **x86-64 ABI**: 16-byte stack alignment before `call`
- **System V vs Windows**: Different calling conventions
- **SIMD**: AVX-512 requires 64-byte alignment
- **Security**: Use stack canaries, ASLR-compatible code
- **With C**: Match C calling convention exactly
