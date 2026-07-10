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

## Memory / Register / ABI Footguns
Assembly is **ISA- and ABI-specific**. Everything below names its ISA explicitly:
**x86-64 System V** (Linux/macOS/BSD) vs **Windows x64**, and **ARM64 AAPCS64**.
Getting the calling convention wrong silently corrupts state at the boundary.

- **Stack alignment (System V AMD64).** `rsp` must be **16-byte aligned at the point of
  a `call`** — the psABI requires it. A `call` pushes the 8-byte return address, so on
  entry to a callee `rsp % 16 == 8`; align back with an odd number of pushes or an
  explicit `sub rsp, 8`. Misalignment crashes any callee using aligned SSE/AVX
  (`movaps`) — a `#GP` fault.
  [gitlab.com/x86-psABIs/x86-64-ABI, retrieved 2026-07-10]
- **Caller- vs callee-saved registers (System V AMD64).** Callee-saved: `rbx`, `rbp`,
  `rsp`, `r12`–`r15` — you MUST preserve them across your function. Everything else
  (`rax`, `rcx`, `rdx`, `rsi`, `rdi`, `r8`–`r11`) is caller-saved and may be clobbered.
  Integer args pass in `rdi, rsi, rdx, rcx, r8, r9`; return in `rax`.
- **Red zone (System V AMD64 only).** The 128 bytes **below** `rsp` are usable by leaf
  functions without adjusting `rsp` — but a signal handler or Windows x64 (no red zone)
  will clobber it. Do not assume the red zone across ISAs.
- **ARM64 AAPCS64.** Args in `x0`–`x7`, return in `x0`; `x19`–`x28` callee-saved; the
  stack pointer `sp` must be **16-byte aligned**. Different register names, same class
  of corruption if you mismatch. [github.com/ARM-software/abi-aa, retrieved 2026-07-10]
- **Calling-convention mismatch = corruption.** Calling a function assuming the wrong
  ABI (System V vs Windows x64: args in `rcx, rdx, r8, r9` + 32-byte shadow space)
  passes arguments in the wrong registers and desyncs the stack.

## Error Handling Idioms
No exceptions — every error path is manual.

- **Syscall return in the result register.** Linux x86-64 syscalls return in `rax`; a
  value in `[-4095, -1]` is `-errno`. ARM64 returns the syscall result in `x0`. Check it
  after **every** syscall; there is no automatic propagation.
- **Condition flags.** Test `CF` (carry), `OF` (overflow), `ZF`, `SF` after arithmetic;
  a missed overflow check silently produces wrong results.
- **Structured cleanup is your job.** There is no RAII/finally — every early-exit path
  must restore callee-saved registers and unwind the stack itself, or the caller's state
  is corrupt.

## Security and Dependency Gotchas
- **Stack buffer overflow — CWE-121.** A hand-written buffer on the stack has **no
  canary unless you add one**; overrunning it overwrites the saved return address →
  control-flow hijack / ROP. Bounds-check every length before a store loop.
  [cwe.mitre.org/data/definitions/121.html, retrieved 2026-07-10]
- **Out-of-bounds write — CWE-787.** Any store with an unvalidated index/length writes
  outside the intended region. Validate against the allocation size before writing.
  [cwe.mitre.org/data/definitions/787.html, retrieved 2026-07-10]
- **W^X / NX and ROP awareness.** Mark stacks non-executable (`-z noexecstack` at link);
  never generate+jump into writable data. Keep code position-independent so ASLR is
  effective; hardcoded addresses defeat it.

```asm
; System V AMD64: 16-byte aligned at call; preserve rbx/rbp/r12-r15.
copy_bounded:
    push rbp
    mov  rbp, rsp
    push rbx                    ; callee-saved
    sub  rsp, 8                 ; re-align rsp to 16 at the next `call`
    cmp  rsi, MAX_LEN           ; bounds check BEFORE the store loop (CWE-121/787)
    ja   .fail
    ; ... bounded copy ...
    xor  eax, eax              ; return 0
    add  rsp, 8
    pop  rbx
    pop  rbp
    ret
.fail:
    mov  eax, -1
    add  rsp, 8
    pop  rbx
    pop  rbp
    ret
MAX_LEN equ 4096
```

## Toolchain / Testing Conventions
- **Assemble + link.** `nasm -f elf64` (Intel syntax) or `as`/`gas` (AT&T syntax), then
  `ld` or drive it through `gcc`/`clang` to pull in the C runtime and correct start files.
- **Disassemble to verify.** `objdump -d a.out` (or `-M intel`) confirms the emitted
  encoding and alignment matches intent; `gdb` (`layout asm`, `info registers`)
  single-steps register state. `objdump` is the primary ground-truth check.
- **Unit-test via a C harness.** Declare the routine `extern`, call it from C with known
  inputs, assert outputs — the C compiler enforces the ABI at the call site.

```asm
; Verify the encoding & 16-byte alignment you emitted:
;   objdump -d -M intel copy_bounded.o
```

## Performance Traps
- **Dependency chains / pipeline stalls.** A long chain of dependent instructions
  serializes; break false dependencies (`xor eax, eax` to zero, not `mov eax, 0`).
- **Cache-line alignment.** Hot data spanning a 64-byte line boundary costs an extra
  fetch; align hot buffers.
- **Memory round-trips vs registers.** Spilling to the stack in a tight loop is far
  slower than keeping a value in a register — prefer register pressure over reloads.
- **Branch misprediction.** Unpredictable branches flush the pipeline; prefer
  conditional moves (`cmov`) for data-dependent selection on hot paths.

## Version-Specific Gotchas
- **x86-64 System V ABI** (Linux/macOS/BSD): args `rdi,rsi,rdx,rcx,r8,r9`, 16-byte stack
  alignment, 128-byte red zone. The canonical spec is the System V x86-64 psABI.
  [gitlab.com/x86-psABIs/x86-64-ABI, retrieved 2026-07-10]
- **Windows x64 ABI**: args `rcx,rdx,r8,r9`, 32-byte shadow space, **no red zone** —
  incompatible with System V; never mix.
- **ARM64 AAPCS64**: args `x0`–`x7`, callee-saved `x19`–`x28`, 16-byte `sp` alignment.
  [github.com/ARM-software/abi-aa, retrieved 2026-07-10]
- **SIMD alignment**: AVX-512 aligned loads want 64-byte alignment; `movaps` needs 16.
- **Instruction reference**: verify opcodes/encodings against felixcloutier.com/x86.
  [felixcloutier.com/x86, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- System V x86-64 psABI (calling convention, 16-byte alignment, red zone): https://gitlab.com/x86-psABIs/x86-64-ABI
- ARM AAPCS64 (Arm 64-bit ABI): https://github.com/ARM-software/abi-aa
- x86-64 instruction reference: https://www.felixcloutier.com/x86/
- CWE-121 Stack-based Buffer Overflow: https://cwe.mitre.org/data/definitions/121.html
- CWE-787 Out-of-bounds Write: https://cwe.mitre.org/data/definitions/787.html
