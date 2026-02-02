# Clojure Strictest Quality Config

Maximum strictness for Clojure projects with all linters enabled.

## Mode: Strictest

- Coverage: 90% minimum
- All clj-kondo linters at error level
- Zero tolerance for warnings

## clj-kondo Config (`.clj-kondo/config.edn`)

```edn
{:linters
 {;; Unused code - all errors
  :unused-binding {:level :error}
  :unused-import {:level :error}
  :unused-namespace {:level :error}
  :unused-private-var {:level :error}
  :unused-referred-var {:level :error}
  :unused-value {:level :error}

  ;; Redundant code - all errors
  :redundant-do {:level :error}
  :redundant-let {:level :error}
  :redundant-fn-wrapper {:level :error}
  :redundant-expression {:level :error}
  :redundant-call {:level :error}
  :redundant-nested-call {:level :error}
  :redundant-str-call {:level :error}
  :redundant-ignore-tag {:level :error}

  ;; Documentation - required
  :missing-docstring {:level :error}
  :misplaced-docstring {:level :error}

  ;; Deprecated and unsupported
  :deprecated-var {:level :error}
  :deprecated-namespace {:level :error}
  :unsupported-binding-form {:level :error}

  ;; Style violations - all errors
  :inline-def {:level :error}
  :not-empty? {:level :error}
  :single-key-in {:level :error}
  :single-operand-comparison {:level :error}
  :if-not-both-branches {:level :error}
  :cond-else {:level :error}
  :minus-one {:level :error}
  :plus-one {:level :error}
  :divide-by-one {:level :error}
  :format {:level :error}

  ;; Type and resolution - all errors
  :type-mismatch {:level :error}
  :unresolved-symbol {:level :error}
  :unresolved-var {:level :error}
  :unresolved-namespace {:level :error}
  :invalid-arity {:level :error}
  :non-arg-vec-return-type-hint {:level :error}

  ;; Imports and requires - strict
  :duplicate-require {:level :error}
  :duplicate-map-key {:level :error}
  :duplicate-set-key {:level :error}
  :refer-all {:level :error}
  :use {:level :error}
  :namespace-name-mismatch {:level :error}

  ;; Testing discipline
  :missing-test-assertion {:level :error}
  :shadowed-var {:level :error}
  :def-fn {:level :error}

  ;; Performance
  :reduce-without-init {:level :error}
  :loop-without-recur {:level :error}
  :recur-arity-mismatch {:level :error}
  :map-get-in-nil {:level :error}

  ;; Security and best practices
  :clojure-lsp/unused-public-var {:level :warning}
  :consistent-alias {:level :error}

  ;; Arity checks
  :conflicting-alias {:level :error}
  :conflicting-fn-arity {:level :error}
  :suspicious-test {:level :error}}

 :lint-as
 {clojure.test/deftest clojure.core/defn
  clojure.test/testing clojure.core/let
  clojure.test/are clojure.core/let}

 :config-in-ns
 {user {:linters {:missing-docstring {:level :off}}}}

 :output
 {:progress true
  :canonical-paths true}

 :skip-comments true
 :analysis {:arglists true
            :locals true
            :keywords true
            :protocol-impls true
            :java-class-definitions true
            :java-member-definitions true
            :instance-invocations true}}
```

## cljfmt Config (`.cljfmt.edn`)

```edn
{:indentation? true
 :remove-surrounding-whitespace? true
 :remove-trailing-whitespace? true
 :remove-consecutive-blank-lines? true
 :insert-missing-whitespace? true
 :align-associative? false
 :remove-multiple-non-indenting-spaces? true
 :split-keypaths-over-multiple-lines? true
 :sort-ns-references? true
 :function-arguments-indentation :community
 :indents {deftest [[:inner 0]]
           testing [[:inner 0]]
           are [[:inner 0]]
           with-redefs [[:inner 0]]
           given [[:inner 0]]
           when [[:inner 0]]
           then [[:inner 0]]
           defrecord [[:inner 0]]
           defprotocol [[:inner 0]]
           extend-protocol [[:inner 0]]
           extend-type [[:inner 0]]}}
```

## deps.edn Setup

```edn
{:paths ["src" "resources"]
 :deps {org.clojure/clojure {:mvn/version "1.12.0"}}

 :aliases
 {:dev
  {:extra-paths ["dev" "test"]
   :extra-deps {org.clojure/test.check {:mvn/version "1.1.1"}
                org.clojure/spec.alpha {:mvn/version "0.5.238"}}}

  :test
  {:extra-paths ["test"]
   :extra-deps {io.github.cognitect-labs/test-runner
                {:git/tag "v0.5.1" :git/sha "dfb30dd"}
                lambdaisland/kaocha {:mvn/version "1.91.1392"}
                lambdaisland/kaocha-cloverage {:mvn/version "1.1.89"}}
   :main-opts ["-m" "kaocha.runner"]}

  :lint
  {:extra-deps {clj-kondo/clj-kondo {:mvn/version "2024.08.01"}}
   :main-opts ["-m" "clj-kondo.main"
               "--lint" "src" "test"
               "--config" "{:output {:pattern \"::{{level}} file={{filename}},line={{row}},col={{col}}::{{message}}\"}}"]}

  :lint-strict
  {:extra-deps {clj-kondo/clj-kondo {:mvn/version "2024.08.01"}}
   :main-opts ["-m" "clj-kondo.main"
               "--lint" "src" "test"
               "--fail-level" "warning"]}

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
               "--fail-threshold" "90"
               "--low-watermark" "85"
               "--high-watermark" "95"]}

  :eastwood
  {:extra-deps {jonase/eastwood {:mvn/version "1.4.2"}}
   :main-opts ["-m" "eastwood.lint"
               {:source-paths ["src"]
                :test-paths ["test"]
                :exclude-linters []
                :add-linters [:unused-fn-args :unused-locals :unused-namespaces]}]}

  :kibit
  {:extra-deps {tvaughan/kibit-runner {:mvn/version "1.0.1"}}
   :main-opts ["-m" "kibit-runner.cmdline"]}}}
```

## project.clj Setup (Leiningen)

```clojure
(defproject my-project "0.1.0"
  :description "My Clojure project"
  :dependencies [[org.clojure/clojure "1.12.0"]
                 [org.clojure/spec.alpha "0.5.238"]]

  :plugins [[lein-cljfmt "0.9.2"]
            [lein-cloverage "1.2.4"]
            [clj-kondo/lein-clj-kondo "2024.08.01"]
            [jonase/eastwood "1.4.2"]
            [lein-kibit "0.1.8"]]

  :profiles
  {:dev {:dependencies [[org.clojure/test.check "1.1.1"]]}}

  :cljfmt {:indents {deftest [[:inner 0]]
                     testing [[:inner 0]]}
           :remove-multiple-non-indenting-spaces? true}

  :cloverage {:fail-threshold 90
              :low-watermark 85
              :high-watermark 95
              :ns-exclude-regex [#"user"]
              :codecov? true}

  :eastwood {:exclude-linters []
             :add-linters [:unused-fn-args :unused-locals]})
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Branches | 85% |
| Functions | 95% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Function arity | 3 arguments |
| Function lines | 20 lines |
| Namespace size | 300 lines |
| Cyclomatic complexity | 7 |
| Nesting depth | 3 levels |

## Commands

```bash
# Run all linters
clj -M:lint-strict

# Run eastwood (additional lint)
clj -M:eastwood

# Run kibit (idiomatic code)
clj -M:kibit

# Check formatting
clj -M:fmt

# Run tests with full coverage
clj -M:coverage

# All quality checks (strictest)
clj -M:lint-strict && clj -M:eastwood && clj -M:kibit && clj -M:fmt && clj -M:coverage
```

## CI Pipeline Configuration

```yaml
# .github/workflows/quality.yml
name: Quality
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: DeLaGuardo/setup-clojure@12.5
        with:
          cli: latest
      - name: Lint with clj-kondo
        run: clj -M:lint-strict
      - name: Check formatting
        run: clj -M:fmt
      - name: Run Eastwood
        run: clj -M:eastwood
      - name: Run Kibit
        run: clj -M:kibit
      - name: Test with coverage
        run: clj -M:coverage
```

## Test Configuration (`tests.edn` for Kaocha)

```edn
#kaocha/v1
{:tests [{:id :unit
          :test-paths ["test"]
          :source-paths ["src"]
          :ns-patterns ["-test$"]}]
 :reporter [kaocha.report/documentation]
 :fail-fast? false
 :randomize? true
 :plugins [:kaocha.plugin/cloverage
           :kaocha.plugin/profiling
           :kaocha.plugin/capture-output]
 :cloverage/opts {:fail-threshold 90
                  :low-watermark 85
                  :high-watermark 95
                  :html? true
                  :codecov? true
                  :output "target/coverage"
                  :ns-exclude-regex ["user"]}}
```

## Install

```bash
# Install clj-kondo
brew install borkdude/brew/clj-kondo

# Initialize clj-kondo with all configs
clj-kondo --lint src --copy-configs --dependencies

# Install babashka for task runner (optional)
brew install borkdude/brew/babashka
```
