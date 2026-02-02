# Clojure Strict Quality Config

Strict mode configuration for Clojure projects using clj-kondo and cljfmt.

## Mode: Strict

- Coverage: 80% minimum
- clj-kondo standard rules enabled
- Warnings treated as errors in CI

## clj-kondo Config (`.clj-kondo/config.edn`)

```edn
{:linters
 {:unused-binding {:level :warning}
  :unused-import {:level :warning}
  :unused-namespace {:level :warning}
  :unused-private-var {:level :warning}
  :unused-referred-var {:level :warning}
  :redundant-do {:level :warning}
  :redundant-let {:level :warning}
  :redundant-fn-wrapper {:level :warning}
  :redundant-expression {:level :warning}
  :missing-docstring {:level :warning}
  :deprecated-var {:level :warning}
  :inline-def {:level :warning}
  :misplaced-docstring {:level :warning}
  :not-empty? {:level :warning}
  :reduce-without-init {:level :warning}
  :single-key-in {:level :warning}
  :single-operand-comparison {:level :warning}
  :type-mismatch {:level :error}
  :unresolved-symbol {:level :error}
  :unresolved-var {:level :error}
  :unresolved-namespace {:level :error}
  :duplicate-require {:level :warning}
  :refer-all {:level :warning}
  :use {:level :warning}}

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
 :remove-consecutive-blank-lines? true
 :insert-missing-whitespace? true
 :align-associative? false
 :split-keypaths-over-multiple-lines? false
 :sort-ns-references? true
 :indents {deftest [[:inner 0]]
           testing [[:inner 0]]
           are [[:inner 0]]
           with-redefs [[:inner 0]]
           given [[:inner 0]]
           when [[:inner 0]]
           then [[:inner 0]]}
 :function-arguments-indentation :community}
```

## deps.edn Setup

```edn
{:paths ["src" "resources"]
 :deps {org.clojure/clojure {:mvn/version "1.12.0"}}

 :aliases
 {:dev
  {:extra-paths ["dev" "test"]
   :extra-deps {org.clojure/test.check {:mvn/version "1.1.1"}}}

  :test
  {:extra-paths ["test"]
   :extra-deps {io.github.cognitect-labs/test-runner
                {:git/tag "v0.5.1" :git/sha "dfb30dd"}
                lambdaisland/kaocha {:mvn/version "1.91.1392"}}
   :main-opts ["-m" "kaocha.runner"]}

  :lint
  {:extra-deps {clj-kondo/clj-kondo {:mvn/version "2024.08.01"}}
   :main-opts ["-m" "clj-kondo.main" "--lint" "src" "test"]}

  :fmt
  {:extra-deps {cljfmt/cljfmt {:mvn/version "0.12.0"}}
   :main-opts ["-m" "cljfmt.main" "check" "src" "test"]}

  :fmt-fix
  {:extra-deps {cljfmt/cljfmt {:mvn/version "0.12.0"}}
   :main-opts ["-m" "cljfmt.main" "fix" "src" "test"]}

  :coverage
  {:extra-paths ["test"]
   :extra-deps {cloverage/cloverage {:mvn/version "1.2.4"}}
   :main-opts ["-m" "cloverage.coverage"
               "-p" "src"
               "-s" "test"
               "--fail-threshold" "80"]}}}
```

## project.clj Setup (Leiningen)

```clojure
(defproject my-project "0.1.0"
  :description "My Clojure project"
  :dependencies [[org.clojure/clojure "1.12.0"]]

  :plugins [[lein-cljfmt "0.9.2"]
            [lein-cloverage "1.2.4"]
            [clj-kondo/lein-clj-kondo "2024.08.01"]]

  :profiles
  {:dev {:dependencies [[org.clojure/test.check "1.1.1"]]}}

  :cljfmt {:indents {deftest [[:inner 0]]
                     testing [[:inner 0]]}}

  :cloverage {:fail-threshold 80
              :ns-exclude-regex [#"user"]})
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Branches | 75% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Function arity | 4 arguments |
| Function lines | 30 lines |
| Namespace size | 500 lines |
| Cyclomatic complexity | 10 |

## Commands

```bash
# Run clj-kondo lint
clj -M:lint

# Check formatting
clj -M:fmt

# Fix formatting
clj -M:fmt-fix

# Run tests
clj -M:test

# Run tests with coverage
clj -M:coverage

# All quality checks
clj -M:lint && clj -M:fmt && clj -M:coverage
```

## Leiningen Commands

```bash
# Run clj-kondo lint
lein clj-kondo --lint src test

# Check formatting
lein cljfmt check

# Fix formatting
lein cljfmt fix

# Run tests with coverage
lein cloverage --fail-threshold 80
```

## Install

```bash
# Install clj-kondo
brew install borkdude/brew/clj-kondo

# Or via npm
npm install -g clj-kondo

# Initialize clj-kondo config
clj-kondo --lint src --copy-configs --dependencies
```

## Test Configuration (`tests.edn` for Kaocha)

```edn
#kaocha/v1
{:tests [{:id :unit
          :test-paths ["test"]
          :source-paths ["src"]}]
 :reporter [kaocha.report/documentation]
 :fail-fast? false
 :randomize? true
 :plugins [:kaocha.plugin/cloverage
           :kaocha.plugin/profiling]
 :cloverage/opts {:fail-threshold 80
                  :html? true
                  :output "target/coverage"}}
```
