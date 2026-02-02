# JaCoCo Coverage Guide
> Claude Code Java coverage reference. Updated February 2026.

## Overview

JaCoCo (Java Code Coverage) is the standard coverage library for Java/JVM projects. It provides line, branch, and complexity coverage metrics through bytecode instrumentation.

## Installation

### Maven

```xml
<!-- pom.xml -->
<build>
    <plugins>
        <plugin>
            <groupId>org.jacoco</groupId>
            <artifactId>jacoco-maven-plugin</artifactId>
            <version>0.8.12</version>
            <executions>
                <execution>
                    <id>prepare-agent</id>
                    <goals>
                        <goal>prepare-agent</goal>
                    </goals>
                </execution>
                <execution>
                    <id>report</id>
                    <phase>test</phase>
                    <goals>
                        <goal>report</goal>
                    </goals>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

### Gradle (Kotlin DSL)

```kotlin
// build.gradle.kts
plugins {
    java
    jacoco
}

jacoco {
    toolVersion = "0.8.12"
}

tasks.test {
    finalizedBy(tasks.jacocoTestReport)
}

tasks.jacocoTestReport {
    dependsOn(tasks.test)
    reports {
        xml.required.set(true)
        html.required.set(true)
        csv.required.set(false)
    }
}
```

### Gradle (Groovy DSL)

```groovy
// build.gradle
plugins {
    id 'java'
    id 'jacoco'
}

jacoco {
    toolVersion = "0.8.12"
}

test {
    finalizedBy jacocoTestReport
}

jacocoTestReport {
    dependsOn test
    reports {
        xml.required = true
        html.required = true
        csv.required = false
    }
}
```

## Configuration

### Maven Full Configuration

```xml
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <version>0.8.12</version>
    <configuration>
        <excludes>
            <exclude>**/generated/**</exclude>
            <exclude>**/model/*_.class</exclude>
            <exclude>**/*Config.*</exclude>
            <exclude>**/*Application.*</exclude>
        </excludes>
    </configuration>
    <executions>
        <execution>
            <id>prepare-agent</id>
            <goals>
                <goal>prepare-agent</goal>
            </goals>
        </execution>
        <execution>
            <id>report</id>
            <phase>test</phase>
            <goals>
                <goal>report</goal>
            </goals>
        </execution>
        <execution>
            <id>check</id>
            <goals>
                <goal>check</goal>
            </goals>
            <configuration>
                <rules>
                    <rule>
                        <element>BUNDLE</element>
                        <limits>
                            <limit>
                                <counter>LINE</counter>
                                <value>COVEREDRATIO</value>
                                <minimum>0.80</minimum>
                            </limit>
                            <limit>
                                <counter>BRANCH</counter>
                                <value>COVEREDRATIO</value>
                                <minimum>0.75</minimum>
                            </limit>
                            <limit>
                                <counter>METHOD</counter>
                                <value>COVEREDRATIO</value>
                                <minimum>0.80</minimum>
                            </limit>
                        </limits>
                    </rule>
                    <rule>
                        <element>CLASS</element>
                        <limits>
                            <limit>
                                <counter>LINE</counter>
                                <value>COVEREDRATIO</value>
                                <minimum>0.70</minimum>
                            </limit>
                        </limits>
                    </rule>
                </rules>
            </configuration>
        </execution>
    </executions>
</plugin>
```

### Gradle Full Configuration

```kotlin
// build.gradle.kts
jacoco {
    toolVersion = "0.8.12"
    reportsDirectory.set(layout.buildDirectory.dir("reports/jacoco"))
}

tasks.jacocoTestReport {
    reports {
        xml.required.set(true)
        html.required.set(true)
        html.outputLocation.set(layout.buildDirectory.dir("reports/jacoco/html"))
    }

    classDirectories.setFrom(
        files(classDirectories.files.map {
            fileTree(it) {
                exclude(
                    "**/generated/**",
                    "**/config/**",
                    "**/*Application*"
                )
            }
        })
    )
}

tasks.jacocoTestCoverageVerification {
    violationRules {
        rule {
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "0.80".toBigDecimal()
            }
        }
        rule {
            limit {
                counter = "BRANCH"
                value = "COVEREDRATIO"
                minimum = "0.75".toBigDecimal()
            }
        }
        rule {
            element = "CLASS"
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "0.70".toBigDecimal()
            }
        }
    }
}

tasks.check {
    dependsOn(tasks.jacocoTestCoverageVerification)
}
```

## Running Coverage

### Maven

```bash
# Run tests with coverage
mvn test

# Generate report
mvn jacoco:report

# Check thresholds
mvn jacoco:check

# Full build with coverage
mvn clean verify
```

### Gradle

```bash
# Run tests with coverage
./gradlew test

# Generate report
./gradlew jacocoTestReport

# Check thresholds
./gradlew jacocoTestCoverageVerification

# Full build with coverage
./gradlew check
```

## Coverage Metrics

### Counter Types

| Counter | Description |
|---------|-------------|
| `LINE` | Lines of source code |
| `BRANCH` | Branches in conditionals |
| `INSTRUCTION` | Bytecode instructions |
| `METHOD` | Methods |
| `CLASS` | Classes |
| `COMPLEXITY` | Cyclomatic complexity |

### Value Types

| Value | Description |
|-------|-------------|
| `TOTALCOUNT` | Total number |
| `COVEREDCOUNT` | Covered number |
| `MISSEDCOUNT` | Missed number |
| `COVEREDRATIO` | Ratio (0.0-1.0) |
| `MISSEDRATIO` | Missed ratio |

### Element Types

| Element | Scope |
|---------|-------|
| `BUNDLE` | Entire project |
| `PACKAGE` | Per package |
| `CLASS` | Per class |
| `SOURCEFILE` | Per source file |
| `METHOD` | Per method |

## Coverage Exclusion

### Maven Exclusions

```xml
<configuration>
    <excludes>
        <!-- Generated code -->
        <exclude>**/generated/**</exclude>
        <!-- Lombok generated -->
        <exclude>**/*_.class</exclude>
        <!-- Configuration classes -->
        <exclude>**/*Config.*</exclude>
        <exclude>**/*Configuration.*</exclude>
        <!-- Main application -->
        <exclude>**/*Application.*</exclude>
        <!-- DTOs without logic -->
        <exclude>**/dto/**</exclude>
        <exclude>**/model/**</exclude>
    </excludes>
</configuration>
```

### Gradle Exclusions

```kotlin
tasks.jacocoTestReport {
    classDirectories.setFrom(
        files(classDirectories.files.map {
            fileTree(it) {
                exclude(
                    "**/generated/**",
                    "**/dto/**",
                    "**/model/**",
                    "**/*Config*",
                    "**/*Application*"
                )
            }
        })
    )
}
```

### Annotation-Based Exclusion

```java
// Create custom annotation
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface Generated {
}

// Or use Lombok's @Generated
@lombok.Generated
public class GeneratedClass {
    // Excluded from coverage
}
```

JaCoCo automatically excludes:
- `@lombok.Generated`
- `@javax.annotation.Generated`
- `@jakarta.annotation.Generated`
- `@edu.umd.cs.findbugs.annotations.SuppressFBWarnings`

### Method-Level Exclusion

```java
import lombok.Generated;

public class MyClass {
    @Generated
    public String toString() {
        return "MyClass{}";
    }

    @Generated
    public boolean equals(Object o) {
        // Auto-generated
    }
}
```

## Multi-Module Projects

### Maven Aggregation

```xml
<!-- parent pom.xml -->
<modules>
    <module>module-a</module>
    <module>module-b</module>
    <module>coverage-report</module>
</modules>

<!-- coverage-report/pom.xml -->
<dependencies>
    <dependency>
        <groupId>${project.groupId}</groupId>
        <artifactId>module-a</artifactId>
    </dependency>
    <dependency>
        <groupId>${project.groupId}</groupId>
        <artifactId>module-b</artifactId>
    </dependency>
</dependencies>

<build>
    <plugins>
        <plugin>
            <groupId>org.jacoco</groupId>
            <artifactId>jacoco-maven-plugin</artifactId>
            <executions>
                <execution>
                    <id>report-aggregate</id>
                    <phase>verify</phase>
                    <goals>
                        <goal>report-aggregate</goal>
                    </goals>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

### Gradle Multi-Project

```kotlin
// build.gradle.kts (root)
plugins {
    jacoco
}

tasks.register<JacocoReport>("jacocoRootReport") {
    dependsOn(subprojects.map { it.tasks.named("test") })

    additionalSourceDirs.setFrom(subprojects.map { it.sourceSets.main.get().allSource.srcDirs })
    sourceDirectories.setFrom(subprojects.map { it.sourceSets.main.get().allSource.srcDirs })
    classDirectories.setFrom(subprojects.map { it.sourceSets.main.get().output })
    executionData.setFrom(
        subprojects.flatMap {
            it.tasks.withType<JacocoReport>().map { report ->
                report.executionData
            }
        }
    )

    reports {
        html.required.set(true)
        xml.required.set(true)
    }
}
```

## Integration Testing

### Maven with Failsafe

```xml
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <executions>
        <!-- Unit tests -->
        <execution>
            <id>prepare-agent</id>
            <goals>
                <goal>prepare-agent</goal>
            </goals>
        </execution>
        <!-- Integration tests -->
        <execution>
            <id>prepare-agent-integration</id>
            <phase>pre-integration-test</phase>
            <goals>
                <goal>prepare-agent-integration</goal>
            </goals>
        </execution>
        <!-- Merge reports -->
        <execution>
            <id>merge</id>
            <phase>post-integration-test</phase>
            <goals>
                <goal>merge</goal>
            </goals>
            <configuration>
                <fileSets>
                    <fileSet>
                        <directory>${project.build.directory}</directory>
                        <includes>
                            <include>jacoco.exec</include>
                            <include>jacoco-it.exec</include>
                        </includes>
                    </fileSet>
                </fileSets>
                <destFile>${project.build.directory}/jacoco-merged.exec</destFile>
            </configuration>
        </execution>
        <!-- Report on merged -->
        <execution>
            <id>report-merged</id>
            <phase>verify</phase>
            <goals>
                <goal>report</goal>
            </goals>
            <configuration>
                <dataFile>${project.build.directory}/jacoco-merged.exec</dataFile>
            </configuration>
        </execution>
    </executions>
</plugin>
```

### Gradle Integration Tests

```kotlin
val integrationTest by tasks.registering(Test::class) {
    description = "Runs integration tests."
    group = "verification"
    testClassesDirs = sourceSets["integrationTest"].output.classesDirs
    classpath = sourceSets["integrationTest"].runtimeClasspath
    shouldRunAfter(tasks.test)
}

tasks.register<JacocoReport>("jacocoIntegrationTestReport") {
    executionData(integrationTest.get())
    sourceSets(sourceSets.main.get())

    reports {
        xml.required.set(true)
        html.required.set(true)
    }
}

tasks.register<JacocoCoverageVerification>("jacocoIntegrationTestCoverageVerification") {
    executionData(integrationTest.get())
    sourceSets(sourceSets.main.get())

    violationRules {
        rule {
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "0.60".toBigDecimal()
            }
        }
    }
}
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Coverage

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: 'maven'

      - name: Build and test
        run: mvn verify

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: target/site/jacoco/jacoco.xml
          fail_ci_if_error: true
```

### GitLab CI

```yaml
test:
  stage: test
  script:
    - mvn verify
  coverage: '/Total.*?([0-9]{1,3})%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: target/site/jacoco/jacoco.xml
    paths:
      - target/site/jacoco/
```

### Jenkins

```groovy
pipeline {
    agent any
    tools {
        maven 'Maven 3.9'
        jdk 'JDK 21'
    }
    stages {
        stage('Test') {
            steps {
                sh 'mvn clean verify'
            }
            post {
                always {
                    junit 'target/surefire-reports/*.xml'
                    jacoco(
                        execPattern: 'target/jacoco.exec',
                        classPattern: 'target/classes',
                        sourcePattern: 'src/main/java',
                        exclusionPattern: '**/generated/**',
                        minimumLineCoverage: '80',
                        minimumBranchCoverage: '75'
                    )
                }
            }
        }
    }
}
```

### Azure DevOps

```yaml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: Maven@4
    inputs:
      mavenPomFile: 'pom.xml'
      goals: 'verify'
      publishJUnitResults: true
      testResultsFiles: '**/surefire-reports/TEST-*.xml'
      javaHomeOption: 'JDKVersion'
      jdkVersionOption: '21'

  - task: PublishCodeCoverageResults@2
    inputs:
      summaryFileLocation: '$(System.DefaultWorkingDirectory)/target/site/jacoco/jacoco.xml'
      pathToSources: '$(System.DefaultWorkingDirectory)/src/main/java'
```

## Offline Instrumentation

For cases where runtime instrumentation is not possible:

```xml
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <executions>
        <execution>
            <id>instrument</id>
            <goals>
                <goal>instrument</goal>
            </goals>
        </execution>
        <execution>
            <id>restore-instrumented-classes</id>
            <goals>
                <goal>restore-instrumented-classes</goal>
            </goals>
        </execution>
    </executions>
</plugin>
```

## Troubleshooting

### No Coverage Data

```bash
# Check if jacoco.exec exists
ls -la target/jacoco.exec

# Verify agent is attached
mvn -X test | grep jacoco
```

### Classes Not Covered

```xml
<!-- Ensure source and class directories match -->
<configuration>
    <sourceDirectories>
        <sourceDirectory>src/main/java</sourceDirectory>
    </sourceDirectories>
    <classesDirectories>
        <directory>target/classes</directory>
    </classesDirectories>
</configuration>
```

### Kotlin Support

```kotlin
tasks.jacocoTestReport {
    classDirectories.setFrom(
        files(classDirectories.files.map {
            fileTree(it) {
                // Exclude Kotlin synthetics
                exclude("**/lambda$*", "**/*$*$*")
            }
        })
    )
}
```

### Spring Boot Fat Jar

```xml
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <configuration>
        <includes>
            <include>com/mycompany/**</include>
        </includes>
    </configuration>
</plugin>
```

## Best Practices

### Meaningful Thresholds

```xml
<rules>
    <rule>
        <element>BUNDLE</element>
        <limits>
            <limit>
                <counter>LINE</counter>
                <value>COVEREDRATIO</value>
                <minimum>0.80</minimum>
            </limit>
            <limit>
                <counter>BRANCH</counter>
                <value>COVEREDRATIO</value>
                <minimum>0.75</minimum>
            </limit>
        </limits>
    </rule>
</rules>
```

### Exclude Generated Code

```xml
<excludes>
    <exclude>**/generated/**</exclude>
    <exclude>**/dto/**</exclude>
    <exclude>**/*MapperImpl.class</exclude>
</excludes>
```

### Fail Build on Drop

```xml
<execution>
    <id>check</id>
    <goals>
        <goal>check</goal>
    </goals>
    <configuration>
        <haltOnFailure>true</haltOnFailure>
    </configuration>
</execution>
```

## What NOT to Do

- Do NOT exclude code just because it is hard to test
- Do NOT set thresholds below 70% for production code
- Do NOT ignore branch coverage (often where bugs hide)
- Do NOT generate HTML reports in CI (use XML/CSV)
- Do NOT exclude entire packages without justification
- Do NOT rely on instruction coverage alone (use line + branch)
- Do NOT forget integration test coverage
- Do NOT mix JaCoCo versions across modules
