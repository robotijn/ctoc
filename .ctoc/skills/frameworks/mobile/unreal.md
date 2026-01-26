# Unreal Engine CTO
> AAA quality on mobile, when performance demands are high

## Non-Negotiables
1. Use scalability settings to target different mobile tiers
2. Implement proper LOD (Level of Detail) for all visible meshes
3. Use texture streaming and compressed formats for mobile memory
4. Profile with Unreal Insights and platform-specific GPU profilers
5. Keep draw calls minimal; use instanced static meshes

## Red Lines
- Never ship with editor-only code or assets in mobile builds
- Don't ignore thermal throttling; test sustained performance
- Avoid dynamic shadows on mobile; use baked lighting
- Never use Tick() for logic that can be event-driven
- Don't skip cook/package testing; content errors surface late

## Pattern
```cpp
// Efficient tick management
void AMyActor::BeginPlay()
{
    Super::BeginPlay();
    // Disable tick when not needed
    SetActorTickEnabled(false);
}

void AMyActor::OnPlayerNearby()
{
    // Enable only when required
    SetActorTickEnabled(true);
}
```
