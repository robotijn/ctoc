# Java Strictest Quality Config

Maximum strictness for Java projects.

## Mode: Strictest

- Coverage: 90% minimum
- All warnings as errors
- Tight complexity limits

## Checkstyle Additions

```xml
<!-- Add to checkstyle.xml TreeWalker -->
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
<module name="JavadocMethod"/>
<module name="JavadocType"/>
<module name="JavadocVariable"/>
<module name="MissingJavadocMethod"/>
```

## Compiler Flags

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-compiler-plugin</artifactId>
    <configuration>
        <compilerArgs>
            <arg>-Xlint:all</arg>
            <arg>-Werror</arg>
        </compilerArgs>
    </configuration>
</plugin>
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Branches | 90% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 7 |
| Method length | 30 lines |
| File length | 300 lines |
| Parameters | 3 |
| Nesting depth | 3 |
