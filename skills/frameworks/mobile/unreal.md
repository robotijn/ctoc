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

## Memory & GC Footguns (UObject reachability)
Unreal's UObjects are garbage-collected. The single most common Claude bug is holding a raw `UObject*`
that the GC does not know about — it gets collected, and you dereference a dangling pointer.

- **`UPROPERTY()` is what keeps a UObject alive.** A `UObject*` stored in a member that is NOT marked
  `UPROPERTY()` is invisible to the reachability analysis: the GC may collect it while you still hold the
  pointer, producing a dangling access and a crash. Any UObject you want to keep alive across frames MUST
  live in a `UPROPERTY()` member (or a container the GC tracks, e.g. `TArray<UObject*>` marked
  `UPROPERTY()`). This is a use-after-free class bug, **CWE-416: Use After Free**.
- **`TWeakObjectPtr<T>` for non-owning references.** When you want to observe but not own (and correctly
  detect destruction), use `TWeakObjectPtr` and check `IsValid()` before use — it never keeps the object
  alive and cleanly reports when the GC reclaimed the target. Use `TObjectPtr<T>` (UE5) for owning
  `UPROPERTY` references; it adds access tracking over a raw pointer.
- **GC clustering** — actors/components form GC clusters; churning spawn/destroy of `UObject`s creates
  reachability-analysis cost. Pool actors (`ObjectPool`-style with `SetActorHiddenInGame` +
  `SetActorEnableCollision`) instead of `SpawnActor`/`Destroy` churn.

```cpp
// BAD: raw pointer, no UPROPERTY — GC can collect Target, then this dangles (use-after-free)
class AMyController : public AActor {
    AEnemy* Target;                 // invisible to GC reachability
    void Chase() { Target->MoveTo(GetActorLocation()); } // may crash: Target collected
};

// GOOD: UPROPERTY keeps it reachable; TWeakObjectPtr for non-owning observers
UCLASS()
class AMyController : public AActor {
    GENERATED_BODY()
    UPROPERTY() TObjectPtr<AEnemy> Target;          // owned, GC-tracked, kept alive
    TWeakObjectPtr<APlayerCharacter> ObservedPlayer; // non-owning; check IsValid()
    void Chase() {
        if (Target) { Target->MoveTo(GetActorLocation()); }
        if (ObservedPlayer.IsValid()) { /* safe */ }
    }
};
```

## Correctness — Tick, Blueprint vs C++, Replication
- **Tick cost** — `AActor::Tick` runs every frame for every ticking actor. Disable it by default
  (`PrimaryActorTick.bCanEverTick = false` in the constructor, or `SetActorTickEnabled(false)`), and
  enable only when needed (see Correct Patterns). Prefer timers (`GetWorldTimerManager().SetTimer`) and
  events over polling in `Tick`.
- **Blueprint vs C++** — Blueprint is interpreted VM bytecode: hot per-frame logic (tight loops, math,
  `Tick` bodies) is markedly slower than C++. Keep gameplay-critical/hot paths in C++ and expose tunables
  with `UPROPERTY(EditAnywhere, BlueprintReadWrite)`; use `UFUNCTION(BlueprintCallable)` for the seams.
  Nativization was removed in UE5 — do not suggest it.
- **Replication / RPCs** — mark replicated state `UPROPERTY(Replicated)` + implement
  `GetLifetimeReplicatedProps`, or use `ReplicatedUsing=OnRep_Fn`. RPCs are specified with
  `UFUNCTION(Server, Reliable, WithValidation)` / `Client` / `NetMulticast`; a `Server` RPC MUST have a
  `_Validate` implementation. Never trust a `Server` RPC's inputs — validate them (an unvalidated Server
  RPC is a client-authoritative-input trust bug, **CWE-20: Improper Input Validation**).

## Security — Untrusted Content
- **Untrusted `.pak`/asset content is a deserialization surface** — mounting a downloaded `.pak`
  (`FCoreDelegates::MountPak`) or loading external assets reconstructs serialized UObject graphs
  (**CWE-502: Deserialization of Untrusted Data**). Ship encrypted/signed pak files, verify signatures
  before mounting, and never mount user-supplied paks in a shipping client.
- **No runtime code injection** — do not drive gameplay from user/network-supplied expressions or
  reflected function names without an allow-list (**CWE-94: Code Injection**). Server-authoritative
  design + RPC validation is the correct trust boundary for multiplayer.

## Performance — Mobile Rendering
- Use the **Mobile Forward Renderer** (Forward+ where supported); bake lighting; keep dynamic shadows
  and translucency minimal; set up **LODs** for every visible mesh. Vulkan is the Android default
  (OpenGL ES fallback); Metal is required on iOS.

## Testing
- Use the **Automation System** — `IMPLEMENT_SIMPLE_AUTOMATION_TEST` / `IMPLEMENT_COMPLEX_AUTOMATION_TEST`
  for C++ unit/functional tests, and **Functional Testing** actors + **Gauntlet** for on-device
  automated runs. Run via `RunUAT RunUnreal` / the Session Frontend. Profile with `stat unit`, Unreal
  Insights, and the on-device GPU profiler — editor timings do not reflect mobile.

## Version-specific (verified 2026-07-10)
- **Unreal Engine 5.8** is the current stable release; **5.6** and **5.7** documentation streams are
  live on the Epic dev portal. Pin the exact engine version in `.uproject` — do not mix.
- **UE 5.6+**: Android **16 KB memory page size** support is required for Android 15+ submissions.
- **UE 5.5+**: Mobile Forward Renderer improvements; Vulkan default on Android 14+, OpenGL ES fallback.
- **iOS**: Metal required, minimum iOS 15 for UE 5.5.
- `TObjectPtr`/`TWeakObjectPtr` are the UE5 UObject reference idioms; Blueprint nativization was removed
  in UE5 — do not recommend it.

## References (retrieved 2026-07-10)
- Unreal Engine 5.6 documentation — https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5.6-documentation
- Unreal Engine 5.7 documentation — https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5.7-documentation
- Unreal Engine (current stable 5.8), overview — https://en.wikipedia.org/wiki/Unreal_Engine
- Unreal Object Handling / Garbage Collection (`UPROPERTY`, `TWeakObjectPtr`) — https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-object-handling-in-unreal-engine
- CWE-416: Use After Free — https://cwe.mitre.org/data/definitions/416.html
- CWE-502: Deserialization of Untrusted Data — https://cwe.mitre.org/data/definitions/502.html
- CWE-20: Improper Input Validation — https://cwe.mitre.org/data/definitions/20.html
- CWE-94: Improper Control of Generation of Code ('Code Injection') — https://cwe.mitre.org/data/definitions/94.html
