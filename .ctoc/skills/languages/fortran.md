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

## Version Gotchas
- **Fortran 2018**: Coarrays, improved parallelism
- **Array ordering**: Column-major (opposite of C)
- **KIND**: Use `real(kind=real64)` for precision
- **OpenMP**: Add `!$omp` directives for parallelism
- **With C**: Use `iso_c_binding` for interop
