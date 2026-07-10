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

## Vectorization / Parallelism Footguns
MATLAB's performance model rewards **vectorized, preallocated** array ops and punishes
scalar loops. Explicit parallelism lives in the **Parallel Computing Toolbox** (`parfor`,
`parpool`, `gpuArray`), which has its own closure rules.

- **Growing an array in a loop** (`x(end+1) = ...` or `result(i) = ...` without preallocation)
  reallocates and copies the whole array each iteration — **O(n²)**. Preallocate with
  `zeros(n,1)` / `cell(n,1)` first.
- **`parfor` closure rules**: the loop body must be **order-independent**; loop iterations
  cannot depend on each other, the loop index must slice outputs cleanly (`out(i) = ...`),
  and large read-only data becomes a **broadcast variable** copied to every worker. A
  reduction that isn't a recognized pattern, or a sliced variable indexed the wrong way,
  raises a transparency/classification error at parse time.
- **`gpuArray`** moves data to the GPU; mixing gpuArray and host arrays forces expensive
  transfers — keep the whole pipeline on-device.
```matlab
% FOOTGUN: array grows each iteration -> O(n^2)
r = [];
for i = 1:n, r(end+1) = f(i); end            % WRONG

% SAFE: preallocate; parfor for order-independent work
r = zeros(n, 1);                              % preallocate
parfor i = 1:n                                % Parallel Computing Toolbox
    r(i) = f(i);                              % sliced output, no cross-iteration dependency
end
```
- Source: mathworks.com MATLAB documentation (preallocation, `parfor`, `gpuArray`).

## Error Handling Idioms
Use **`try` / `catch`** capturing an **`MException`**, and raise errors with an **identifier**
(`error("component:mnemonic", msg)`) so callers can match on `ME.identifier`.

```matlab
try
    data = readmatrix(file);
    assert(~isempty(data), "io:emptyFile", "%s has no data", file);
catch ME
    switch ME.identifier
        case "io:emptyFile"
            data = [];
        otherwise
            rethrow(ME)                        % preserve stack; don't swallow unknown errors
    end
end
```
- Prefer `error(id, ...)` / `assert(cond, id, ...)` with identifiers over bare
  `error("message")`; the identifier is what a `catch` should branch on.
- `lasterror` is **discouraged/legacy** — use the `MException` object captured by `catch`.
- Source: mathworks.com MATLAB documentation (`MException`, `error`, `assert`).

## Security and Dependency Gotchas
- **Code injection via `eval` / `evalin` / `feval` (CWE-94)**: passing an untrusted string to
  `eval` executes arbitrary MATLAB code in your workspace. Never `eval` user/file input —
  use **dynamic field names** (`s.(name)`), function handles, or `str2double` for the narrow
  cases you actually need. (CWE-94 "Code Injection" — cwe.mitre.org.)
- **Command injection via `system` / `!` (CWE-78)**: `system(['convert ' userFile])` splices
  input into a shell command. Validate/allow-list arguments; do not concatenate untrusted
  text into the command string. (CWE-78 "OS Command Injection" — cwe.mitre.org.)
- **Untrusted `.mat` / function-path loading**: loading data or adding a directory to the path
  from an untrusted source can shadow built-ins or trigger unexpected code paths — load only
  trusted files and be explicit about variable names (`load(file, "onlyThisVar")`).
- **Toolbox version pinning**: functions and defaults change across releases; record the
  required release and toolbox versions so results reproduce.
```matlab
% FOOTGUN: eval on a built string — CWE-94
eval(["result = " userExpr ";"]);            % WRONG: arbitrary code execution

% SAFER: dynamic field access, no code execution
val = dataStruct.(fieldName);
```
- Source: cwe.mitre.org (CWE-94, CWE-78); mathworks.com MATLAB documentation
  (`eval` alternatives, `system`). See References.

## Testing Conventions
- Use the **`matlab.unittest`** framework: subclass `matlab.unittest.TestCase`, write
  `Test`-tagged methods, and assert via `verifyEqual`, `verifyError`, `verifyThat`. Run the
  whole suite with **`runtests`** and gate on it.
- Generate a **coverage report** (`runtests("IncludeSubfolders", true, ...)` with a
  `CodeCoveragePlugin`) to check what the tests actually exercise.
```matlab
classdef ProcessTest < matlab.unittest.TestCase
    methods (Test)
        function preallocatesOutput(tc)
            tc.verifyEqual(numel(processData((1:5)')), 5)
        end
        function rejectsBadMethod(tc)
            tc.verifyError(@() processData(1, method="bogus"), ?MException)
        end
    end
end
```
- Source: mathworks.com MATLAB documentation (`matlab.unittest`, `runtests`).

## Performance Traps
- **Array growth in loops** — preallocate (`zeros`, `ones`, `cell`); the single biggest MATLAB
  slowdown.
- **Unnecessary copies**: MATLAB is **copy-on-write**, so `b = a` is cheap until you *modify*
  `b` — but passing large arrays into functions that mutate them forces a copy; prefer
  in-place-friendly patterns and avoid growing inside function calls.
- **Loops where a vectorized op exists**: replace element-wise `for` loops with array
  operators (`.*`, `.^`, logical indexing) — often 10–100x faster.
- **Column-major access**: MATLAB stores arrays column-major; iterate down columns, not
  across rows, to stay cache-friendly.
- Source: mathworks.com MATLAB documentation (preallocation, vectorization).

## Version-Specific Gotchas (dated, sourced)
- MATLAB uses a **twice-a-year release** naming scheme `Rxxxxa` / `Rxxxxb` (e.g. **R2026a**
  is the current release, following **R2025b**). Pin the release you target — new functions,
  default-behavior changes, and toolbox APIs appear per release, so code written on a newer
  release may not run on an older one. [mathworks.com MATLAB release notes, retrieved 2026-07-10]
- Prefer the **`string`** type over `char` arrays for text (introduced R2016b, now the idiom):
  `string` is a proper scalar/array type with `+` concatenation and `==` comparison, whereas
  `char` is a character *array* with surprising broadcasting. Mixing them causes subtle bugs.
  [mathworks.com MATLAB documentation (`string`), retrieved 2026-07-10]
- The **`arguments` validation block** (R2019b+) is the current idiom for input validation and
  name-value defaults — prefer it over `inputParser` / manual `nargin` checks.
  [mathworks.com MATLAB documentation (`arguments`), retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- CWE-94 (Code Injection): https://cwe.mitre.org/data/definitions/94.html
- CWE-78 (OS Command Injection): https://cwe.mitre.org/data/definitions/78.html
- MATLAB release notes: https://www.mathworks.com/help/matlab/release-notes.html
- MATLAB `parfor` (Parallel Computing Toolbox):
  https://www.mathworks.com/help/parallel-computing/parfor.html
- MATLAB unit testing framework (`matlab.unittest`, `runtests`):
  https://www.mathworks.com/help/matlab/matlab-unit-test-framework.html
