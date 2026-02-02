# Java Strict Quality Config

Strict mode configuration for Java projects.

## Mode: Strict

- Coverage: 80% minimum
- Checkstyle + SpotBugs
- Standard complexity limits

## Checkstyle Config (`checkstyle.xml`)

```xml
<?xml version="1.0"?>
<!DOCTYPE module PUBLIC
    "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"
    "https://checkstyle.org/dtds/configuration_1_3.dtd">

<module name="Checker">
    <property name="severity" value="error"/>

    <module name="TreeWalker">
        <!-- Complexity -->
        <module name="CyclomaticComplexity">
            <property name="max" value="10"/>
        </module>
        <module name="NPathComplexity">
            <property name="max" value="200"/>
        </module>
        <module name="MethodLength">
            <property name="max" value="50"/>
        </module>
        <module name="ParameterNumber">
            <property name="max" value="4"/>
        </module>
        <module name="NestedIfDepth">
            <property name="max" value="4"/>
        </module>

        <!-- Naming -->
        <module name="ConstantName"/>
        <module name="LocalFinalVariableName"/>
        <module name="LocalVariableName"/>
        <module name="MemberName"/>
        <module name="MethodName"/>
        <module name="PackageName"/>
        <module name="ParameterName"/>
        <module name="StaticVariableName"/>
        <module name="TypeName"/>

        <!-- Imports -->
        <module name="AvoidStarImport"/>
        <module name="IllegalImport"/>
        <module name="RedundantImport"/>
        <module name="UnusedImports"/>

        <!-- Blocks -->
        <module name="EmptyBlock"/>
        <module name="LeftCurly"/>
        <module name="NeedBraces"/>
        <module name="RightCurly"/>

        <!-- Coding -->
        <module name="EmptyStatement"/>
        <module name="EqualsHashCode"/>
        <module name="IllegalInstantiation"/>
        <module name="InnerAssignment"/>
        <module name="MissingSwitchDefault"/>
        <module name="SimplifyBooleanExpression"/>
        <module name="SimplifyBooleanReturn"/>

        <!-- Design -->
        <module name="FinalClass"/>
        <module name="HideUtilityClassConstructor"/>
        <module name="InterfaceIsType"/>
        <module name="VisibilityModifier"/>
    </module>

    <module name="FileLength">
        <property name="max" value="400"/>
    </module>
</module>
```

## SpotBugs Configuration

```xml
<!-- spotbugs-exclude.xml -->
<FindBugsFilter>
    <!-- Exclude test classes from some checks -->
    <Match>
        <Class name="~.*Test"/>
        <Bug pattern="URF_UNREAD_FIELD"/>
    </Match>
</FindBugsFilter>
```

## Maven Configuration (`pom.xml`)

```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-checkstyle-plugin</artifactId>
            <version>3.3.1</version>
            <configuration>
                <configLocation>checkstyle.xml</configLocation>
                <failOnViolation>true</failOnViolation>
            </configuration>
        </plugin>
        <plugin>
            <groupId>com.github.spotbugs</groupId>
            <artifactId>spotbugs-maven-plugin</artifactId>
            <version>4.8.3.1</version>
        </plugin>
        <plugin>
            <groupId>org.jacoco</groupId>
            <artifactId>jacoco-maven-plugin</artifactId>
            <version>0.8.11</version>
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
                                <minimum>0.80</minimum>
                            </limit>
                        </limits>
                    </rule>
                </rules>
            </configuration>
        </plugin>
    </plugins>
</build>
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Branches | 80% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 10 |
| NPath | 200 |
| Method length | 50 lines |
| File length | 400 lines |
| Parameters | 4 |
| Nesting depth | 4 |

## Commands

```bash
# Run checkstyle
mvn checkstyle:check

# Run SpotBugs
mvn spotbugs:check

# Run tests with coverage
mvn test jacoco:report jacoco:check

# All quality checks
mvn verify
```
