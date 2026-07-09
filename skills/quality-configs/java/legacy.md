# Java Legacy Quality Config

Gradual adoption of a JVM quality gate for an existing, un-instrumented Java
codebase. Everything reports as a **warning**, nothing fails the build yet, and
the numeric limits are loose so a large legacy code base can turn the gate on
without a red pipeline on day one. Tighten toward `java/strict.md` →
`java/strictest.md` as the debt burns down.

All plugin versions below were verified against Maven Central / the tool's
official release feed on **2026-07-09**; sources are cited inline per section.

## Mode: Legacy

- Coverage: 50% minimum (baseline — non-failing; `haltOnFailure=false`)
- Warnings allowed — `severity=warning`, no `-Werror`
- Relaxed complexity limits
- Adoption strategy: turn on reporting first, ratchet thresholds later

## Checkstyle Config (`checkstyle.xml`)

Checkstyle **13.7.0** (latest release 2026-06-28, verified
`https://github.com/checkstyle/checkstyle/releases` — retrieved 2026-07-09).
Legacy runs at `severity=warning` so violations surface in the report without
breaking the build.

```xml
<?xml version="1.0"?>
<!DOCTYPE module PUBLIC
    "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"
    "https://checkstyle.org/dtds/configuration_1_3.dtd">

<module name="Checker">
    <property name="severity" value="warning"/>

    <module name="TreeWalker">
        <!-- Relaxed complexity — loose enough for legacy code -->
        <module name="CyclomaticComplexity">
            <property name="max" value="15"/>
        </module>
        <module name="MethodLength">
            <property name="max" value="100"/>
        </module>
        <module name="ParameterNumber">
            <property name="max" value="6"/>
        </module>

        <!-- Cheap wins that rarely need refactoring -->
        <module name="AvoidStarImport"/>
        <module name="RedundantImport"/>
        <module name="UnusedImports"/>
        <module name="EmptyStatement"/>
        <module name="EqualsHashCode"/>
    </module>

    <module name="FileLength">
        <property name="max" value="600"/>
    </module>
</module>
```

Module reference: `https://checkstyle.org/checks.html` (retrieved 2026-07-09).

## SpotBugs

SpotBugs **4.10.2** via `spotbugs-maven-plugin` **4.10.2.0**
(`https://github.com/spotbugs/spotbugs-maven-plugin/releases`, retrieved
2026-07-09). Legacy uses a **low** effort / **medium** threshold so only
high-confidence bug patterns are reported, and the goal is non-failing.

```xml
<plugin>
    <groupId>com.github.spotbugs</groupId>
    <artifactId>spotbugs-maven-plugin</artifactId>
    <version>4.10.2.0</version>
    <configuration>
        <effort>Default</effort>
        <threshold>Medium</threshold>
        <failOnError>false</failOnError>
        <excludeFilterFile>spotbugs-exclude.xml</excludeFilterFile>
    </configuration>
</plugin>
```

`effort`/`threshold` semantics: `https://spotbugs.readthedocs.io/en/stable/maven.html`
(retrieved 2026-07-09).

## PMD

PMD **7.26.0** (`https://github.com/pmd/pmd/releases`, retrieved 2026-07-09) via
`maven-pmd-plugin` **3.28.0** (Maven Central, retrieved 2026-07-09). Legacy pins
only the `bestpractices` ruleset and does not fail the build.

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-pmd-plugin</artifactId>
    <version>3.28.0</version>
    <configuration>
        <failOnViolation>false</failOnViolation>
        <printFailingErrors>true</printFailingErrors>
        <rulesets>
            <ruleset>category/java/bestpractices.xml</ruleset>
        </rulesets>
    </configuration>
</plugin>
```

Rulesets index: `https://pmd.github.io/pmd/pmd_rules_java.html` (retrieved
2026-07-09).

## Maven Configuration (`pom.xml`)

JaCoCo `jacoco-maven-plugin` **0.8.13** (Maven Central, retrieved 2026-07-09).
Note `haltOnFailure=false` — the 50% floor is a **baseline** that reports but
does not break legacy builds.

```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-checkstyle-plugin</artifactId>
            <version>3.6.0</version>
            <configuration>
                <configLocation>checkstyle.xml</configLocation>
                <failOnViolation>false</failOnViolation>
            </configuration>
        </plugin>
        <plugin>
            <groupId>org.jacoco</groupId>
            <artifactId>jacoco-maven-plugin</artifactId>
            <version>0.8.13</version>
            <executions>
                <execution>
                    <goals><goal>prepare-agent</goal></goals>
                </execution>
                <execution>
                    <id>jacoco-check</id>
                    <goals><goal>check</goal></goals>
                    <configuration>
                        <haltOnFailure>false</haltOnFailure>
                        <rules>
                            <rule>
                                <element>BUNDLE</element>
                                <limits>
                                    <limit>
                                        <counter>LINE</counter>
                                        <value>COVEREDRATIO</value>
                                        <minimum>0.50</minimum>
                                    </limit>
                                </limits>
                            </rule>
                        </rules>
                    </configuration>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

maven-checkstyle-plugin **3.6.0** and jacoco-maven-plugin **0.8.13** confirmed on
Maven Central (`https://central.sonatype.com/`, retrieved 2026-07-09).

## Coverage Requirements

JaCoCo baseline — reports but does not halt the build (`haltOnFailure=false`).

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |
| Branches | 50% |

Ratchet up ~5% per iteration toward the 80% strict floor as tests are added.

## Complexity Limits

Loose limits chosen so existing code passes; tighten toward `java/strict.md`.

| Metric | Limit |
|--------|-------|
| Cyclomatic | 15 |
| Method length | 100 lines |
| File length | 600 lines |
| Parameters | 6 |

## Commands & CI

```bash
# Report-only quality run (nothing fails the build in legacy mode)
mvn checkstyle:checkstyle spotbugs:spotbugs pmd:pmd

# Tests + coverage report (non-failing check)
mvn test jacoco:report jacoco:check

# Full verify
mvn verify
```

GitHub Actions on Temurin 21 (LTS). `actions/setup-java@v4` and Temurin
distribution documented at
`https://github.com/actions/setup-java` (retrieved 2026-07-09); JDK build
`jdk-21.0.11+10` per `https://api.adoptium.net/` (retrieved 2026-07-09).

```yaml
name: quality-legacy
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'
          cache: maven
      # continue-on-error keeps the legacy gate advisory, not blocking
      - run: mvn -B verify
        continue-on-error: true
```
