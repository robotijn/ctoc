# Fortran CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses COMMON blocks — use modules instead
- Claude uses GOTO — use structured control flow
- Claude forgets IMPLICIT NONE — always include
- Claude uses fixed-form — use free-form (.f90+)

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `gfortran` | GNU Fortran | Ancient compilers |
| `ifort`/`ifx` | Intel (performance) | Unoptimized |
| `fprettify` | Formatting | Manual style |
| `pfunit` | Unit testing | Ad-hoc tests |
| `openmp`/`mpi` | Parallelization | Serial code |

## Patterns Claude Should Use
```fortran
module data_processing
  implicit none
  private
  public :: process_array

contains

  subroutine process_array(data, n, result)
    real, intent(in) :: data(:)
    integer, intent(in) :: n
    real, intent(out) :: result

    integer :: i

    ! Bounds checking
    if (n > size(data)) then
      error stop "Array bounds exceeded"
    end if

    result = 0.0
    do i = 1, n
      result = result + data(i)
    end do
  end subroutine process_array

end module data_processing
```

## Anti-Patterns Claude Generates
- COMMON blocks — use modules
- GOTO statements — use do/if/select case
- Missing IMPLICIT NONE — always declare
- Fixed-form source — use free-form
- Missing INTENT — declare in, out, inout

## Memory / Array Footguns
Fortran arrays are **1-based and column-major** (the opposite of C's row-major), and
the standard mandates **no runtime bounds checking** by default — an out-of-range index
silently reads or writes adjacent memory.

- **Column-major iteration.** The *leftmost* subscript varies fastest in memory. A
  C-style row-major loop nest thrashes cache; iterate the first index in the innermost
  loop (`do j ...; do i ...; a(i,j)`).
- **No default bounds checking → out-of-bounds read/write.** `a(i)` with `i > size(a)`
  is undefined; it reads garbage (**CWE-125, out-of-bounds read**) or corrupts memory
  (**CWE-787, out-of-bounds write**). Compile with `-fcheck=bounds` (or `-fcheck=all`)
  during development to trap it — this is a documented gfortran code-generation option.
  [gcc.gnu.org/onlinedocs/gfortran/Code-Gen-Options.html, retrieved 2026-07-10]
- **`allocatable` over `pointer`.** `allocatable` arrays are automatically deallocated
  at scope exit and cannot alias; raw `pointer`s can dangle and alias, defeating the
  optimizer's `contiguous`/no-alias assumptions.
- **Implicit `SAVE` trap.** A local variable initialized in its declaration
  (`integer :: n = 0`) implicitly gets the `SAVE` attribute and **retains state across
  calls** — a classic source of non-reentrancy bugs. Initialize in an executable
  statement if you want a fresh value each call.

```fortran
real, allocatable :: buf(:)
allocate(buf(n), stat=ierr)          ! check the allocation
if (ierr /= 0) error stop "alloc failed"
! Build with:  gfortran -fcheck=bounds -Wall   → traps a(i) past bounds (CWE-125/787)
```

## Concurrency / Parallelism
- **Coarray Fortran (F2008+/F2018).** `sync all`, images, and `co_sum`/`co_broadcast`
  collectives give SPMD parallelism in the standard language; a missing `sync` leaves a
  data race between images.
- **`do concurrent`.** Asserts loop iterations are independent, but the compiler does
  **not** verify it — a hidden dependency is a silent data race. Use `locality`
  specifiers (`local`, `shared`) to declare intent explicitly (F2018).
- **OpenMP / MPI.** `!$omp parallel do` needs correct `private`/`shared`/`reduction`
  clauses; a shared accumulator without `reduction` is a race. MPI is the portable
  multi-node path.

## Error Handling Idioms
Fortran has **no exceptions** — errors are surfaced through status arguments.

- **I/O:** always pass `iostat=ios` (and `iomsg=msg`) to `open`/`read`/`write`; a
  nonzero `ios` is your only signal a read failed. An unchecked `read` on EOF aborts.
- **Allocation:** `allocate(x(n), stat=ierr)` — a failed allocation without `stat=`
  terminates the program.
- **Fatal stop:** `error stop "message"` terminates with a nonzero exit code (F2008);
  plain `stop` can return zero and hide failure from a calling shell/CI.

## Security and Dependency Gotchas
- **`implicit none` is mandatory discipline.** Legacy implicit typing silently creates
  an undeclared variable from a typo (`lenght`), yielding wrong results with no error.
  Put `implicit none` in every program unit.
- **Unchecked array writes = memory corruption (CWE-787).** Writing past an array bound
  overwrites adjacent data or the stack; there is no guard unless you enable
  `-fcheck=bounds`. Validate all externally-derived indices/lengths before use.
- **Fixed-format column truncation.** Fixed-form source ignores everything past column
  72 — a long line is silently truncated, changing program meaning. Use free-form
  (`.f90`+) and `-ffree-line-length-none` where needed.
- **C interop boundary.** `iso_c_binding` marshals to C, which has none of Fortran's
  (optional) checks — validate lengths on both sides of a `bind(C)` call.

## Testing Conventions
- **pFUnit** — xUnit-style framework for Fortran (assertions, fixtures, MPI-aware).
- **test-drive** — lightweight unit-testing library from the fortran-lang community.
- **fpm (Fortran Package Manager)** — `fpm test` builds and runs the `test/` tree;
  `fpm build`/`fpm run` for the rest. fortran-lang.org is the community hub for fpm,
  stdlib, and these tools. [fortran-lang.org, retrieved 2026-07-10]

## Performance Traps
- **Row-major loop order.** Iterating the *last* subscript in the inner loop walks memory
  with a large stride and thrashes cache — Fortran is column-major, so the **first**
  index belongs innermost.
- **Array temporaries.** Passing a non-contiguous slice (`a(:, 1:n:2)`) to a routine
  expecting a contiguous array forces a hidden copy-in/copy-out; declare dummy arguments
  `contiguous` when you require it, and pass whole arrays where possible.
- **Aliasing pointers defeat vectorization.** `pointer` arguments may alias, so the
  optimizer cannot assume independence; prefer `allocatable` / `intent` on plain arrays.
- **Leave optimization to `-O2`/`-O3` + `-march=native`** rather than hand-unrolling;
  keep the source clean so the compiler can vectorize.

## Version-Specific Gotchas
- **Fortran 2018** (ISO/IEC 1539-1:2018): expanded coarray features, `do concurrent`
  locality, improved C interoperability. **Fortran 2023** (ISO/IEC 1539-1:2023) is the
  current standard, adding conditional expressions and more. gfortran tracks these
  incrementally — feature support is per-release, not all-or-nothing; check the
  standards-status page before relying on a newer feature.
  [gcc.gnu.org/wiki/GFortranStandards, retrieved 2026-07-10]
- **Array ordering**: column-major (opposite of C) — see Memory footguns above.
- **KIND**: use `real(kind=real64)` (from `iso_fortran_env`) for portable precision,
  never magic `real*8`.
- **With C**: use `iso_c_binding` for interop.

## References (retrieved 2026-07-10)
- Fortran community hub (fpm, stdlib, tooling): https://fortran-lang.org/
- gfortran (GNU Fortran) home: https://gcc.gnu.org/fortran/
- gfortran code-gen options (`-fcheck=bounds`/`-fcheck=all`): https://gcc.gnu.org/onlinedocs/gfortran/Code-Gen-Options.html
- gfortran standards status (Fortran 2018/2023): https://gcc.gnu.org/wiki/GFortranStandards
- CWE-125 Out-of-bounds Read: https://cwe.mitre.org/data/definitions/125.html
- CWE-787 Out-of-bounds Write: https://cwe.mitre.org/data/definitions/787.html
