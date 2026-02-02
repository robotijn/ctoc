# Clojure Legacy Quality Config

Gradual adoption configuration for existing Clojure projects.

## Mode: Legacy

- Coverage: 50% minimum
- clj-kondo warnings only (no errors)
- Relaxed limits for incremental improvement

## clj-kondo Config (`.clj-kondo/config.edn`)

```edn
{:linters
 {;; Critical issues only - errors
  :type-mismatch {:level :error}
  :unresolved-symbol {:level :error}
  :unresolved-var {:level :error}
  :unresolved-namespace {:level :error}
  :invalid-arity {:level :error}

  ;; Unused code - warnings only
  :unused-binding {:level :warning}
  :unused-import {:level :warning}
  :unused-namespace {:level :warning}
  :unused-private-var {:level :off}
  :unused-referred-var {:level :warning}

  ;; Redundant code - warnings
  :redundant-do {:level :warning}
  :redundant-let {:level :warning}
  :redundant-fn-wrapper {:level :off}
  :redundant-expression {:level :off}

  ;; Documentation - disabled
  :missing-docstring {:level :off}
  :misplaced-docstring {:level :warning}

  ;; Deprecated - warnings
  :deprecated-var {:level :warning}

  ;; Style - mostly off
  :inline-def {:level :off}
  :not-empty? {:level :off}
  :reduce-without-init {:level :off}
  :single-key-in {:level :off}
  :single-operand-comparison {:level :off}

  ;; Imports - relaxed
  :duplicate-require {:level :warning}
  :refer-all {:level :off}
  :use {:level :off}

  ;; Disable noisy linters for legacy code
  :shadowed-var {:level :off}
  :loop-without-recur {:level :off}}

 :lint-as
 {clojure.test/deftest clojure.core/defn
  clojure.test/testing clojure.core/let}

 :output
 {:progress true
  :canonical-paths true}}
```

## cljfmt Config (`.cljfmt.edn`)

```edn
{:indentation? true
 :remove-surrounding-whitespace? true
 :remove-trailing-whitespace? true
 :remove-consecutive-blank-lines? false
 :insert-missing-whitespace? true
 :align-associative? false
 :sort-ns-references? false
 :function-arguments-indentation :community
 :indents {deftest [[:inner 0]]
           testing [[:inner 0]]}}
```

## deps.edn Setup

```edn
{:paths ["src" "resources"]
 :deps {org.clojure/clojure {:mvn/version "1.11.1"}}

 :aliases
 {:dev
  {:extra-paths ["dev" "test"]
   :extra-deps {org.clojure/test.check {:mvn/version "1.1.1"}}}

  :test
  {:extra-paths ["test"]
   :extra-deps {io.github.cognitect-labs/test-runner
                {:git/tag "v0.5.1" :git/sha "dfb30dd"}}
   :main-opts ["-m" "cognitect.test-runner"]}

  :lint
  {:extra-deps {clj-kondo/clj-kondo {:mvn/version "2024.08.01"}}
   :main-opts ["-m" "clj-kondo.main" "--lint" "src"]}

  :lint-test
  {:extra-deps {clj-kondo/clj-kondo {:mvn/version "2024.08.01"}}
   :main-opts ["-m" "clj-kondo.main" "--lint" "src" "test"]}

  :fmt
  {:extra-deps {cljfmt/cljfmt {:mvn/version "0.12.0"}}
   :main-opts ["-m" "cljfmt.main" "check" "src"]}

  :fmt-fix
  {:extra-deps {cljfmt/cljfmt {:mvn/version "0.12.0"}}
   :main-opts ["-m" "cljfmt.main" "fix" "src"]}

  :coverage
  {:extra-paths ["test"]
   :extra-deps {cloverage/cloverage {:mvn/version "1.2.4"}}
   :main-opts ["-m" "cloverage.coverage"
               "-p" "src"
               "-s" "test"
               "--fail-threshold" "50"]}}}
```

## project.clj Setup (Leiningen)

```clojure
(defproject my-project "0.1.0"
  :description "My Clojure project"
  :dependencies [[org.clojure/clojure "1.11.1"]]

  :plugins [[lein-cljfmt "0.9.2"]
            [lein-cloverage "1.2.4"]
            [clj-kondo/lein-clj-kondo "2024.08.01"]]

  :profiles
  {:dev {:dependencies [[org.clojure/test.check "1.1.1"]]}}

  :cljfmt {:indents {deftest [[:inner 0]]
                     testing [[:inner 0]]}
           :remove-consecutive-blank-lines? false}

  :cloverage {:fail-threshold 50
              :ns-exclude-regex [#"user" #"dev"]})
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |
| Branches | 40% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Function arity | 8 arguments |
| Function lines | 100 lines |
| Namespace size | 1000 lines |
| Cyclomatic complexity | 25 |

## Commands

```bash
# Run clj-kondo lint (src only)
clj -M:lint

# Run clj-kondo lint (src and test)
clj -M:lint-test

# Check formatting (src only)
clj -M:fmt

# Fix formatting
clj -M:fmt-fix

# Run tests
clj -M:test

# Run tests with coverage
clj -M:coverage

# Basic quality checks (legacy-friendly)
clj -M:lint && clj -M:coverage
```

## Gradual Adoption Strategy

### Phase 1: Critical Errors Only (Weeks 1-2)
```edn
;; Start with only critical linters
{:linters
 {:type-mismatch {:level :error}
  :unresolved-symbol {:level :error}
  :invalid-arity {:level :error}}}
```

### Phase 2: Add Unused Code Warnings (Weeks 3-4)
```edn
;; Add unused code detection
{:linters
 {:unused-binding {:level :warning}
  :unused-namespace {:level :warning}}}
```

### Phase 3: Add Redundant Code (Weeks 5-6)
```edn
;; Add redundant code detection
{:linters
 {:redundant-do {:level :warning}
  :redundant-let {:level :warning}}}
```

### Phase 4: Increase Coverage Target
```bash
# Increase from 50% to 60%, then 70%
clj -M:coverage --fail-threshold 60
```

### Phase 5: Promote Warnings to Errors
```edn
;; Once warnings are addressed, promote to errors
{:linters
 {:unused-binding {:level :error}}}
```

## Baseline Exclusions

For legacy code, create `.clj-kondo/.ignore`:

```
# Ignore generated code
src/generated/

# Ignore legacy modules under refactoring
src/legacy/old_module.clj

# Ignore specific patterns
**/scratch.clj
```

## Test Configuration (`tests.edn` for Kaocha)

```edn
#kaocha/v1
{:tests [{:id :unit
          :test-paths ["test"]
          :source-paths ["src"]}]
 :reporter [kaocha.report/dots]
 :fail-fast? false
 :plugins [:kaocha.plugin/cloverage]
 :cloverage/opts {:fail-threshold 50
                  :html? true
                  :output "target/coverage"
                  :ns-exclude-regex ["user" "dev" "scratch"]}}
```

## Install

```bash
# Install clj-kondo
brew install borkdude/brew/clj-kondo

# Or via npm
npm install -g clj-kondo

# Initialize with minimal config
clj-kondo --lint src --copy-configs --dependencies
```
