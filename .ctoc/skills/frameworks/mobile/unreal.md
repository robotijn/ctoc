# Unreal Engine CTO
> AAA mobile game leader demanding LOD optimization and thermal-aware performance budgets.

## Commands
```bash
# Setup | Dev | Test
/UnrealEngine/Engine/Build/BatchFiles/RunUAT.sh BuildCookRun -project=MyGame.uproject -platform=iOS -clientconfig=Development
UnrealEditor MyGame.uproject -run=AutomationTool -testfilter=Project
./RunUAT.sh -project=MyGame.uproject -platform=Android -cook -stage -pak
```

## Non-Negotiables
1. Scalability settings to target different mobile device tiers
2. LOD (Level of Detail) for all visible meshes
3. Texture streaming and compressed formats (ASTC, ETC2) for mobile memory
4. Unreal Insights and platform GPU profilers for performance
5. Minimal draw calls with instanced static meshes and merged actors

## Red Lines
- Editor-only code or assets in mobile builds
- Ignoring thermal throttling - test sustained 30-minute sessions
- Dynamic shadows on mobile - use baked lighting
- Tick() for logic that can be event-driven
- Skipping cook/package testing - content errors surface late

## Pattern: Event-Driven Tick Management
```cpp
// MyActor.h
UCLASS()
class MYGAME_API AMyActor : public AActor
{
    GENERATED_BODY()

public:
    virtual void BeginPlay() override;
    void EnableTicking();
    void DisableTicking();

private:
    UFUNCTION()
    void OnPlayerNearby(AActor* Player);
};

// MyActor.cpp
void AMyActor::BeginPlay()
{
    Super::BeginPlay();
    SetActorTickEnabled(false);  // Disabled by default

    if (USphereComponent* Trigger = FindComponentByClass<USphereComponent>())
    {
        Trigger->OnComponentBeginOverlap.AddDynamic(this, &AMyActor::OnPlayerNearby);
    }
}

void AMyActor::OnPlayerNearby(AActor* Player)
{
    if (Player->IsA<APlayerCharacter>())
    {
        SetActorTickEnabled(true);
    }
}
```

## Integrates With
- **DB**: SQLite via plugin, JSON files for simple data
- **Auth**: Online Subsystem with platform providers
- **Cache**: Pak file streaming, DDC for editor builds

## Common Errors
| Error | Fix |
|-------|-----|
| `Shader compilation timeout` | Reduce shader complexity, use mobile shaders |
| `Out of memory during cook` | Split into chunks, increase swap, use pak chunking |
| `Texture not streaming` | Check texture group settings and streaming pool size |

## Prod Ready
- [ ] Target hardware profiled for frame budget (16.6ms/30fps)
- [ ] Thermal testing passed with 30-minute sustained load
- [ ] Shader permutations minimized for mobile
- [ ] Platform-specific packaging scripts in CI/CD
