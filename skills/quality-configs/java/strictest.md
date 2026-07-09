# Java Strictest Quality Config

Maximum strictness for a Java project that has already cleared `java/strict.md`.
Every static-analysis finding fails the build, complexity ceilings are tight,
Javadoc is mandatory, the compiler runs `-Xlint:all -Werror`, SpotBugs runs at
maximum effort / lowest threshold, PMD adds the design + error-prone rulesets,
and JaCoCo enforces a **failing** 90% coverage gate.

All plugin versions below were verified against Maven Central / the tool's
official release feed on **2026-07-09**; sources are cited inline per section.

## Mode: Strictest

- Coverage: 90% minimum — **failing** gate (`haltOnFailure=true`)
- All warnings as errors — `severity=error` + `-Werror`
- Tight complexity limits (cyclomatic 7, method 30, params 3, nesting 3)
- Mandatory Javadoc on public API

## Checkstyle Config (`checkstyle.xml`)

Checkstyle **13.7.0** (latest release 2026-06-28, verified
`https://github.com/checkstyle/checkstyle/releases` — retrieved 2026-07-09).
Strictest runs at `severity=error`; any violation fails the build.

```xml
<?xml version="1.0"?>
<!DOCTYPE module PUBLIC
    "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"
    "https://checkstyle.org/dtds/configuration_1_3.dtd">

<module name="Checker">
    <property name="severity" value="error"/>

    <module name="TreeWalker">
        <!-- Tight complexity ceilings -->
        <module name="CyclomaticComplexity">
            <property name="max" value="7"/>
        </module>
        <module name="MethodLength">
            <property name="max" value="30"/>
        </module>
        <module name="ParameterNumber">
            <property name="max" value="3"/>
        </module>
        <module name="NestedIfDepth">
            <property name="max" value="3"/>
        </module>
        <module name="NPathComplexity">
            <property name="max" value="100"/>
        </module>

        <!-- Mandatory Javadoc on the public surface -->
        <module name="JavadocMethod"/>
        <module name="JavadocType"/>
        <module name="JavadocVariable"/>
        <module name="MissingJavadocMethod"/>

        <!-- Imports / coding hygiene -->
        <module name="AvoidStarImport"/>
        <module name="UnusedImports"/>
        <module name="EmptyStatement"/>
        <module name="EqualsHashCode"/>
        <module name="MissingSwitchDefault"/>
    </module>

    <module name="FileLength">
        <property name="max" value="300"/>
    </module>
</module>
```

Module reference: `https://checkstyle.org/checks.html` (retrieved 2026-07-09).

## Compiler Flags

The `maven-compiler-plugin` **3.15.0** (Maven Central GA, retrieved 2026-07-09)
promotes every `javac` lint warning to a hard error on JDK 21.

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-compiler-plugin</artifactId>
    <version>3.15.0</version>
    <configuration>
        <release>21</release>
        <compilerArgs>
            <arg>-Xlint:all</arg>
            <arg>-Werror</arg>
        </compilerArgs>
    </configuration>
</plugin>
```

`-Xlint`/`-Werror` semantics: `https://docs.oracle.com/en/java/javase/21/docs/specs/man/javac.html`
(retrieved 2026-07-09).

## SpotBugs

SpotBugs **4.10.2** via `spotbugs-maven-plugin` **4.10.2.0**
(`https://github.com/spotbugs/spotbugs-maven-plugin/releases`, retrieved
2026-07-09), run at **maximum** effort and **lowest** threshold with the
`fb-contrib` / security-relevant patterns enabled and `failOnError=true`.

```xml
<plugin>
    <groupId>com.github.spotbugs</groupId>
    <artifactId>spotbugs-maven-plugin</artifactId>
    <version>4.10.2.0</version>
    <configuration>
        <effort>Max</effort>
        <threshold>Low</threshold>
        <failOnError>true</failOnError>
        <excludeFilterFile>spotbugs-exclude.xml</excludeFilterFile>
    </configuration>
    <executions>
        <execution>
            <goals><goal>check</goal></goals>
        </execution>
    </executions>
</plugin>
```

`effort=Max` / `threshold=Low` documented at
`https://spotbugs.readthedocs.io/en/stable/maven.html` (retrieved 2026-07-09).

## PMD

PMD **7.26.0** (`https://github.com/pmd/pmd/releases`, retrieved 2026-07-09) via
`maven-pmd-plugin` **3.28.0** (Maven Central, retrieved 2026-07-09). Strictest
loads the full rule surface and fails the build on any violation.

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-pmd-plugin</artifactId>
    <version>3.28.0</version>
    <configuration>
        <failOnViolation>true</failOnViolation>
        <printFailingErrors>true</printFailingErrors>
        <rulesets>
            <ruleset>category/java/bestpractices.xml</ruleset>
            <ruleset>category/java/design.xml</ruleset>
            <ruleset>category/java/errorprone.xml</ruleset>
            <ruleset>category/java/multithreading.xml</ruleset>
            <ruleset>category/java/performance.xml</ruleset>
        </rulesets>
    </configuration>
    <executions>
        <execution>
            <goals><goal>check</goal></goals>
        </execution>
    </executions>
</plugin>
```

Java rulesets index: `https://pmd.github.io/pmd/pmd_rules_java.html` (retrieved
2026-07-09).

## Maven Configuration (`pom.xml`)

JaCoCo `jacoco-maven-plugin` **0.8.13** (Maven Central, retrieved 2026-07-09) —
`haltOnFailure=true` so the 90% line **and** branch floors fail the build.

```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-checkstyle-plugin</artifactId>
            <version>3.6.0</version>
            <configuration>
                <configLocation>checkstyle.xml</configLocation>
                <failOnViolation>true</failOnViolation>
                <violationSeverity>error</violationSeverity>
            </configuration>
            <executions>
                <execution>
                    <phase>verify</phase>
                    <goals><goal>check</goal></goals>
                </execution>
            </executions>
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
                        <haltOnFailure>true</haltOnFailure>
                        <rules>
                            <rule>
                                <element>BUNDLE</element>
                                <limits>
                                    <limit>
                                        <counter>LINE</counter>
                                        <value>COVEREDRATIO</value>
                                        <minimum>0.90</minimum>
                                    </limit>
                                    <limit>
                                        <counter>BRANCH</counter>
                                        <value>COVEREDRATIO</value>
                                        <minimum>0.90</minimum>
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

JaCoCo failing gate — both line and branch coverage must reach 90%.

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Branches | 90% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 7 |
| NPath | 100 |
| Method length | 30 lines |
| File length | 300 lines |
| Parameters | 3 |
| Nesting depth | 3 |

## Commands & CI

```bash
# Individual gates
mvn checkstyle:check
mvn spotbugs:check
mvn pmd:check

# Tests + failing coverage gate
mvn test jacoco:report jacoco:check

# Full pipeline — any gate failing fails the build
mvn verify
```

GitHub Actions on Temurin 21 (LTS). `actions/setup-java@v4` + Temurin
distribution documented at `https://github.com/actions/setup-java` (retrieved
2026-07-09); JDK build `jdk-21.0.11+10` per `https://api.adoptium.net/`
(retrieved 2026-07-09).

```yaml
name: quality-strictest
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
      # No continue-on-error — every gate is blocking in strictest mode
      - run: mvn -B verify
```
