# llvm-cov Coverage Guide
> Claude Code Rust/C/C++ coverage reference. Updated February 2026.

## Overview

llvm-cov is the LLVM-based coverage tool that supports Rust, C, and C++. For Rust, the recommended approach is through `cargo-llvm-cov`. For C/C++, use Clang's built-in coverage instrumentation.

## Rust with cargo-llvm-cov

### Installation

```bash
# Install cargo-llvm-cov
cargo install cargo-llvm-cov

# Or via rustup
rustup component add llvm-tools-preview
cargo install cargo-llvm-cov
```

### Basic Usage

```bash
# Run tests with coverage
cargo llvm-cov

# Generate HTML report
cargo llvm-cov --html

# Generate LCOV format
cargo llvm-cov --lcov --output-path lcov.info

# Open HTML report in browser
cargo llvm-cov --open

# With specific threshold
cargo llvm-cov --fail-under-lines 80
```

### Configuration

```toml
# .cargo/config.toml
[alias]
cov = "llvm-cov"
cov-html = "llvm-cov --html --open"
cov-ci = "llvm-cov --lcov --output-path lcov.info --fail-under-lines 80"
cov-json = "llvm-cov --json --output-path coverage.json"
```

### Cargo.toml Profile

```toml
# Cargo.toml
[profile.dev]
# Coverage requires debug info
debug = true

[profile.coverage]
inherits = "dev"
debug = true
# Disable optimizations for accurate coverage
opt-level = 0
```

### Full Options

```bash
# All report formats
cargo llvm-cov --html --lcov --json \
  --output-dir coverage \
  --fail-under-lines 80 \
  --fail-under-branches 75 \
  --fail-under-functions 80

# Include/exclude files
cargo llvm-cov --html \
  --ignore-filename-regex 'tests/|benches/|examples/'

# Specific workspace member
cargo llvm-cov --package mypackage

# All workspace members
cargo llvm-cov --workspace

# Include doctests
cargo llvm-cov --doctests

# Run specific test
cargo llvm-cov -- test_name
```

## C/C++ with Clang

### Compilation Flags

```bash
# Compile with coverage instrumentation
clang -fprofile-instr-generate -fcoverage-mapping \
  -o myprogram main.c

# For C++
clang++ -fprofile-instr-generate -fcoverage-mapping \
  -o myprogram main.cpp
```

### Running and Generating Reports

```bash
# Run instrumented program
./myprogram

# Merge raw profiles
llvm-profdata merge -sparse default.profraw -o default.profdata

# Generate text report
llvm-cov report ./myprogram -instr-profile=default.profdata

# Generate HTML report
llvm-cov show ./myprogram -instr-profile=default.profdata \
  -format=html -output-dir=coverage

# Generate LCOV format
llvm-cov export ./myprogram -instr-profile=default.profdata \
  -format=lcov > coverage.lcov
```

### CMake Integration

```cmake
# CMakeLists.txt
option(COVERAGE "Enable code coverage" OFF)

if(COVERAGE)
    if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fprofile-instr-generate -fcoverage-mapping")
        set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fprofile-instr-generate -fcoverage-mapping")
        set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -fprofile-instr-generate")
    endif()
endif()
```

```bash
# Build with coverage
cmake -B build -DCOVERAGE=ON
cmake --build build
```

### Makefile Integration

```makefile
CC = clang
CXX = clang++
COVERAGE_FLAGS = -fprofile-instr-generate -fcoverage-mapping

.PHONY: coverage clean-coverage

coverage: CFLAGS += $(COVERAGE_FLAGS)
coverage: CXXFLAGS += $(COVERAGE_FLAGS)
coverage: LDFLAGS += $(COVERAGE_FLAGS)
coverage: clean all test
	llvm-profdata merge -sparse default.profraw -o default.profdata
	llvm-cov report ./myprogram -instr-profile=default.profdata
	llvm-cov show ./myprogram -instr-profile=default.profdata \
		-format=html -output-dir=coverage

clean-coverage:
	rm -rf default.profraw default.profdata coverage/
```

## Coverage Metrics

### Line Coverage

```bash
# Rust
cargo llvm-cov --fail-under-lines 80

# C/C++
llvm-cov report ./myprogram -instr-profile=default.profdata
```

### Branch Coverage

```bash
# Rust
cargo llvm-cov --fail-under-branches 75 --branch

# C/C++
llvm-cov report ./myprogram -instr-profile=default.profdata \
  -show-branch-summary
```

### Function Coverage

```bash
# Rust
cargo llvm-cov --fail-under-functions 80

# C/C++
llvm-cov report ./myprogram -instr-profile=default.profdata \
  -show-functions
```

### Region Coverage

```bash
# C/C++ specific - shows code regions
llvm-cov report ./myprogram -instr-profile=default.profdata \
  -show-region-summary
```

## Report Formats

### Text Report

```bash
# Rust
cargo llvm-cov --text

# C/C++
llvm-cov report ./myprogram -instr-profile=default.profdata
```

Output:
```
Filename                      Regions    Missed Regions     Cover   Functions  Missed Functions  Executed       Lines      Missed Lines     Cover    Branches   Missed Branches     Cover
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
src/lib.rs                         45                 5    88.89%          12                 1    91.67%         120                15    87.50%          20                 3    85.00%
src/utils.rs                       30                10    66.67%           8                 2    75.00%          80                25    68.75%          12                 4    66.67%
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
TOTAL                              75                15    80.00%          20                 3    85.00%         200                40    80.00%          32                 7    78.13%
```

### HTML Report

```bash
# Rust
cargo llvm-cov --html --output-dir coverage

# C/C++
llvm-cov show ./myprogram -instr-profile=default.profdata \
  -format=html -output-dir=coverage
```

### LCOV Report

```bash
# Rust
cargo llvm-cov --lcov --output-path lcov.info

# C/C++
llvm-cov export ./myprogram -instr-profile=default.profdata \
  -format=lcov > lcov.info
```

### JSON Report

```bash
# Rust
cargo llvm-cov --json --output-path coverage.json

# C/C++
llvm-cov export ./myprogram -instr-profile=default.profdata \
  -format=text > coverage.json
```

### Cobertura XML (Rust)

```bash
cargo llvm-cov --cobertura --output-path cobertura.xml
```

## Coverage Exclusion

### Rust Attribute

```rust
// Exclude function from coverage
#[cfg(not(coverage))]
fn debug_only() {
    // Not covered
}

// Exclude entire module
#[cfg(not(coverage))]
mod tests_helpers {
    // Test utilities
}
```

### Rust Pattern-Based Exclusion

```bash
# Exclude test files
cargo llvm-cov --ignore-filename-regex 'tests/'

# Exclude benchmarks and examples
cargo llvm-cov --ignore-filename-regex 'benches/|examples/'

# Exclude generated code
cargo llvm-cov --ignore-filename-regex 'generated/|target/'

# Multiple patterns
cargo llvm-cov --ignore-filename-regex '(tests/|benches/|examples/|\.generated\.rs)'
```

### C/C++ Exclusion

```cpp
// Use preprocessor
#ifdef COVERAGE
// This code is included during coverage runs
#endif

// Or exclude from report
// No inline exclusion - use file patterns in llvm-cov command
```

```bash
# Exclude files from report
llvm-cov show ./myprogram -instr-profile=default.profdata \
  -ignore-filename-regex='tests/|mock/'
```

## CI/CD Integration

### GitHub Actions (Rust)

```yaml
name: Coverage

on: [push, pull_request]

jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: dtolnay/rust-toolchain@stable
        with:
          components: llvm-tools-preview

      - name: Install cargo-llvm-cov
        uses: taiki-e/install-action@cargo-llvm-cov

      - name: Generate coverage
        run: cargo llvm-cov --lcov --output-path lcov.info --fail-under-lines 80

      - name: Upload to Codecov
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: lcov.info
          fail_ci_if_error: true
```

### GitHub Actions (C/C++)

```yaml
name: Coverage

on: [push, pull_request]

jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install LLVM
        run: |
          sudo apt-get update
          sudo apt-get install -y llvm clang

      - name: Build with coverage
        run: |
          clang++ -fprofile-instr-generate -fcoverage-mapping \
            -o myprogram src/*.cpp

      - name: Run tests
        run: ./myprogram
        env:
          LLVM_PROFILE_FILE: default.profraw

      - name: Generate coverage report
        run: |
          llvm-profdata merge -sparse default.profraw -o default.profdata
          llvm-cov export ./myprogram -instr-profile=default.profdata \
            -format=lcov > coverage.lcov

      - name: Upload to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: coverage.lcov
```

### GitLab CI (Rust)

```yaml
coverage:
  image: rust:latest
  before_script:
    - rustup component add llvm-tools-preview
    - cargo install cargo-llvm-cov
  script:
    - cargo llvm-cov --lcov --output-path lcov.info --fail-under-lines 80
  coverage: '/^TOTAL.*\s+(\d+\.\d+)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: cobertura.xml
```

## Workspace Coverage

### Multi-Crate Workspace

```bash
# Cover all workspace members
cargo llvm-cov --workspace

# Exclude specific members
cargo llvm-cov --workspace --exclude integration-tests

# Only specific members
cargo llvm-cov --package core --package utils
```

### Aggregate Report

```bash
# Generate combined report for workspace
cargo llvm-cov --workspace \
  --lcov --output-path lcov.info \
  --html --output-dir coverage
```

## Troubleshooting

### Missing llvm-tools

```bash
# Install llvm-tools component
rustup component add llvm-tools-preview

# Verify installation
rustup component list | grep llvm
```

### No Coverage Data

```bash
# Ensure debug symbols
cargo llvm-cov --verbose

# Check if tests are running
cargo llvm-cov -- --nocapture
```

### Wrong LLVM Version

```bash
# Check Rust's LLVM version
rustc --version --verbose | grep LLVM

# Ensure matching llvm-cov version
llvm-cov --version
```

### Profile Merge Errors (C/C++)

```bash
# Clean and regenerate
rm -f *.profraw *.profdata
./myprogram
llvm-profdata merge -sparse *.profraw -o merged.profdata
```

### Incomplete Coverage

```bash
# Include all tests
cargo llvm-cov --tests --doctests --examples
```

## Best Practices

### Use Threshold Enforcement

```bash
# Always check in CI
cargo llvm-cov --fail-under-lines 80 --fail-under-branches 75
```

### Exclude Generated Code

```bash
# Pattern for common generated files
cargo llvm-cov --ignore-filename-regex 'generated/|\.pb\.rs|build\.rs'
```

### Include Doctests

```bash
# Doctests often have valuable coverage
cargo llvm-cov --doctests
```

### Combine with Linting

```bash
# Run clippy first
cargo clippy -- -D warnings
# Then coverage
cargo llvm-cov --fail-under-lines 80
```

### Clean Between Runs

```bash
# Clean coverage data between runs
cargo llvm-cov clean --workspace
```

## What NOT to Do

- Do NOT skip llvm-tools-preview component installation
- Do NOT use release profile for coverage (needs debug info)
- Do NOT ignore branch coverage for complex logic
- Do NOT set thresholds below 60% for new projects
- Do NOT exclude files just because they are hard to test
- Do NOT run coverage in development (slow, use in CI)
- Do NOT forget workspace members in multi-crate projects
- Do NOT mix coverage profiles between runs (clean first)
