# Jetpack Compose CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```kotlin
// build.gradle.kts (app level)
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.0"  // Required for Kotlin 2.0
}

android {
    buildFeatures { compose = true }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.00"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.0")
}
```

## Claude's Common Mistakes
1. **Ignores Strong Skipping mode** - Enabled by default, changes recomposition behavior
2. **Uses deprecated Compose Compiler settings** - Kotlin 2.0 uses plugin, not extension
3. **Missing collectAsStateWithLifecycle** - Regular collectAsState leaks on background
4. **Suggests WindowSizeClass without setup** - Material3 adaptive layouts need explicit config
5. **Hardcodes dp values** - Should use Material spacing tokens or WindowSizeClass

## Correct Patterns (2026)
```kotlin
// Proper state hoisting with lifecycle-aware collection
@Composable
fun ProfileScreen(
    viewModel: ProfileViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    ProfileContent(
        state = uiState,
        onSave = viewModel::save
    )
}

@Composable
private fun ProfileContent(
    state: ProfileUiState,
    onSave: () -> Unit,
    modifier: Modifier = Modifier  // ALWAYS accept Modifier
) {
    // Defer state reads for performance
    val isEnabled by remember { derivedStateOf { state.name.isNotBlank() } }

    Column(modifier = modifier.padding(MaterialTheme.spacing.medium)) {
        Button(onClick = onSave, enabled = isEnabled) {
            Text("Save")
        }
    }
}
```

## Version Gotchas
- **Kotlin 2.0+**: Compose Compiler is now a Kotlin plugin, remove old config
- **BOM 2024.12+**: Material3 is default, Material2 needs explicit dependency
- **Strong Skipping**: Default on, unstable classes skip differently now
- **With Hilt**: `hiltViewModel()` requires `@HiltViewModel` annotation

## What NOT to Do
- Do NOT use `collectAsState()` - use `collectAsStateWithLifecycle()` always
- Do NOT perform side effects in composition - use LaunchedEffect
- Do NOT omit Modifier parameter - breaks parent layout control
- Do NOT use mutableStateOf without remember - causes recomposition loops
- Do NOT hardcode dimensions - use Material spacing or adaptive layouts
