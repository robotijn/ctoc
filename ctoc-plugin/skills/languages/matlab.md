# MATLAB CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude grows arrays in loops — preallocate with zeros()
- Claude uses eval() — avoid, use dynamic field names
- Claude writes loops — vectorize operations
- Claude uses global variables — pass as arguments

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `matlab r2024+` | Latest features | Old releases |
| `code analyzer` | Built-in linting | No analysis |
| `matlab unit test` | Testing | Ad-hoc scripts |
| `parallel computing toolbox` | HPC | Serial code |
| `matlab coder` | C/C++ generation | Manual translation |

## Patterns Claude Should Use
```matlab
function result = processData(data, options)
    % Input validation with arguments block
    arguments
        data (:,1) double
        options.threshold (1,1) double = 0.5
        options.method (1,:) char {mustBeMember(options.method, {'mean','median'})} = 'mean'
    end

    % Preallocate output
    n = length(data);
    result = zeros(n, 1);

    % Vectorized operations (not loops)
    mask = data > options.threshold;
    result(mask) = data(mask) .^ 2;

    % If loop needed, preallocate first
    % NOT: for i = 1:n, result(i) = ..., end
end

% Use functions, not scripts
% Use meaningful variable names, not single letters
```

## Anti-Patterns Claude Generates
- Array growth: `result(i) = x` in loop — preallocate
- `eval('varname')` — use dynamic field names
- Loops instead of vectorization — use matrix ops
- Global variables — pass as arguments
- Scripts for reusable code — use functions

## Version Gotchas
- **R2024+**: Arguments block validation
- **Vectorization**: 10-100x faster than loops
- **Column-major**: Access columns together, not rows
- **Parallel**: Use `parfor` for embarrassingly parallel
- **With Python**: Use py.* interface for Python calls
