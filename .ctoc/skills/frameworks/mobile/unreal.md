# Unreal Engine CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Install via Epic Games Launcher
# UE 5.5+ for latest mobile features

# CLI cook/package
./Engine/Build/BatchFiles/RunUAT.sh BuildCookRun \
  -project=MyGame.uproject \
  -platform=Android \
  -clientconfig=Shipping \
  -cook -stage -pak -archive
```

## Claude's Common Mistakes
1. **Uses dynamic shadows on mobile** - Baked lighting required for performance
2. **Ignores LOD setup** - Every visible mesh needs LOD for mobile
3. **Uses Tick() for event-driven logic** - Disable tick, use events
4. **Suggests OpenGL ES for Android** - Vulkan preferred since Android 14
5. **Ignores 16KB page size** - Android 15+ requirement for UE 5.6+

## Correct Patterns (2026)
```cpp
// Event-driven tick management
UCLASS()
class MYGAME_API AMyActor : public AActor
{
    GENERATED_BODY()

public:
    virtual void BeginPlay() override
    {
        Super::BeginPlay();
        // Disable tick by default for mobile
        SetActorTickEnabled(false);

        if (USphereComponent* Trigger = FindComponentByClass<USphereComponent>())
        {
            Trigger->OnComponentBeginOverlap.AddDynamic(
                this, &AMyActor::OnPlayerEnter);
            Trigger->OnComponentEndOverlap.AddDynamic(
                this, &AMyActor::OnPlayerExit);
        }
    }

private:
    UFUNCTION()
    void OnPlayerEnter(UPrimitiveComponent* Comp, AActor* Other,
                       UPrimitiveComponent* OtherComp, int32 Idx,
                       bool bSweep, const FHitResult& Hit)
    {
        if (Other->IsA<APlayerCharacter>())
        {
            SetActorTickEnabled(true);  // Enable only when needed
        }
    }

    UFUNCTION()
    void OnPlayerExit(UPrimitiveComponent* Comp, AActor* Other,
                      UPrimitiveComponent* OtherComp, int32 Idx)
    {
        SetActorTickEnabled(false);
    }
};
```

## Version Gotchas
- **UE 5.5+**: Mobile Forward Renderer improvements, D-buffer decals
- **UE 5.6+**: Android 16KB page size support required
- **Android 14+**: Vulkan default, OpenGL ES fallback
- **iOS**: Metal required, minimum iOS 15 for UE 5.5

## What NOT to Do
- Do NOT use dynamic shadows on mobile - bake lighting
- Do NOT skip LODs for visible meshes - causes frame drops
- Do NOT use Tick() when events suffice - wastes battery
- Do NOT test only in editor - profile on target device
- Do NOT ignore thermal throttling - test 30-minute sessions
