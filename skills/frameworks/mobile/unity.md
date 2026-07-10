# Unity CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Install via Unity Hub (required for license management)
# Unity 6.3 LTS is current stable (6000.3.x)
# Download: unity.com/download

# CLI build (after Unity installed)
/Applications/Unity/Hub/Editor/6000.3.*/Unity.app/Contents/MacOS/Unity \
  -batchmode -projectPath . -buildTarget iOS -quit
```

## Claude's Common Mistakes
1. **Uses Unity 2022 LTS patterns** - Unity 6 has different versioning (6000.x)
2. **Calls Find()/GetComponent() in Update** - Cache references in Start/Awake
3. **Uses Resources folder for large assets** - Use Addressables for mobile
4. **Ignores object pooling** - Frequent Instantiate causes GC spikes
5. **Development build settings in production** - IL2CPP required for release

## Correct Patterns (2026)
```csharp
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Pool;

public class BulletSpawner : MonoBehaviour
{
    [SerializeField] private Bullet bulletPrefab;

    // Unity 6 built-in object pool
    private ObjectPool<Bullet> _pool;

    private void Awake()
    {
        _pool = new ObjectPool<Bullet>(
            createFunc: () => Instantiate(bulletPrefab),
            actionOnGet: b => b.gameObject.SetActive(true),
            actionOnRelease: b => b.gameObject.SetActive(false),
            actionOnDestroy: b => Destroy(b.gameObject),
            defaultCapacity: 50,
            maxSize: 200
        );
    }

    public Bullet SpawnBullet(Vector3 position)
    {
        var bullet = _pool.Get();
        bullet.transform.position = position;
        bullet.Initialize(_pool);  // Pass pool for self-return
        return bullet;
    }
}

public class Bullet : MonoBehaviour
{
    private ObjectPool<Bullet> _pool;

    public void Initialize(ObjectPool<Bullet> pool) => _pool = pool;

    public void ReturnToPool() => _pool.Release(this);
}
```

## Version Gotchas
- **Unity 6**: Version numbers are 6000.x.x (not 6.x)
- **Unity 6.3 LTS**: Platform Toolkit API for cross-platform
- **Unity 6+**: URP recommended, built-in pipeline deprecated for mobile
- **iOS builds**: Xcode 16+ required for Unity 6

## What NOT to Do
- Do NOT call Find()/GetComponent() in Update - cache in Awake/Start
- Do NOT use Resources folder for mobile - use Addressables
- Do NOT skip object pooling for frequently spawned objects
- Do NOT use Mono scripting backend for release - use IL2CPP
- Do NOT ignore Profiler on target device - editor performance differs

## GC & Hot-Path Footguns
The managed-heap garbage collector is Unity's most common mobile stutter source: every managed
allocation inside the per-frame loop feeds the incremental GC, and a collection spike drops frames.

- **Per-frame allocations in `Update`/`LateUpdate`** — `new`, boxing (`object`/`params`), LINQ
  (`.Where`/`.Select` allocate iterators + closures), string concatenation, and `foreach` over some
  collection types all allocate. Hoist buffers to fields; reuse `List<T>` with `.Clear()`; avoid LINQ
  in the loop. Watch **GC Alloc** in the Profiler on-device — it should read 0 B/frame in steady state.
- **`GetComponent` / `Find` in hot loops** — both are O(n) reflection-ish lookups. Cache the reference
  in `Awake`/`Start` (or serialize it). `GameObject.Find`/`FindObjectOfType` are especially costly and
  scale with scene size.
- **Coroutines vs `async`/`Awaitable`** — `StartCoroutine` allocates an enumerator + `WaitForSeconds`
  object each start; a `WaitForSeconds` created inline every frame is pure garbage. Cache yield
  instructions, or prefer Unity 6's zero-alloc `Awaitable` (`await Awaitable.WaitForSecondsAsync(t)`),
  which integrates with the player loop and cancels with `destroyCancellationToken`.
- **Physics belongs in `FixedUpdate`, not `Update`** — `Rigidbody` forces/velocity applied in `Update`
  are frame-rate-dependent and jitter on mobile's variable frame time. Read input in `Update`, apply
  physics in `FixedUpdate`, interpolate rendering with `Rigidbody.interpolation`.
- **Object pooling** — reuse via `UnityEngine.Pool.ObjectPool<T>` (see Correct Patterns) instead of
  `Instantiate`/`Destroy` churn, which both allocates and triggers GC on destroy.

```csharp
// BAD: allocates every frame — GC spike on mobile
void Update() {
    var enemies = FindObjectsByType<Enemy>(FindObjectsSortMode.None); // O(n) + array alloc
    var closest = enemies.Where(e => e.IsAlive).OrderBy(e => e.Distance).First(); // LINQ garbage
    label.text = "Enemies: " + enemies.Length; // string alloc
}

// GOOD: cache, reuse buffers, no per-frame allocation
readonly List<Enemy> _buffer = new(64);
void Update() {
    _buffer.Clear();
    _enemyManager.CollectAlive(_buffer);       // fills the reused list, 0 alloc
    _closest = _enemyManager.Closest(_buffer); // plain loop, no LINQ
}
```

## Correctness — Execution Order & Serialization
- **Script execution order is undefined** across MonoBehaviours unless you set it (Project Settings →
  Script Execution Order) or use explicit dependency wiring. Do NOT rely on one `Start` running before
  another's. `Awake` runs before any `Start`; use `Awake` for self-setup, `Start` for cross-references.
- **`[SerializeField] private`** exposes a private field to the Inspector without making it public —
  prefer it over `public` fields for encapsulation. `[field: SerializeField]` serializes an
  auto-property's backing field.
- **Domain reload / Enter Play Mode Options** — with "Reload Domain" disabled (fast play mode), static
  fields are NOT reset between play sessions. Reset statics in a `[RuntimeInitializeOnLoadMethod]` or
  they leak state across runs.

## Security — Untrusted Assets & AssetBundles
- **AssetBundle / addressable content from an untrusted source is a deserialization risk** —
  `AssetBundle.LoadFromFile`/`LoadFromMemory` reconstructs serialized objects and can pull in
  `MonoBehaviour`/`ScriptableObject` graphs. Treat downloaded bundles as untrusted input
  (**CWE-502: Deserialization of Untrusted Data**); serve only over HTTPS, verify a signature/hash
  before loading, and never load bundles built by another party. Same caution for `JsonUtility`/
  `BinaryFormatter`-style save data restored from disk or network.
- **No `eval`-equivalent** — do not build gameplay on runtime C# compilation or reflection-invoked
  code paths fed by user/network data (**CWE-94: Code Injection**). Keep IL2CPP (which AOT-compiles and
  has no runtime code-gen) as the release backend; it also strips the JIT attack surface.
- **IL2CPP for release** — Mono's JIT is disallowed on iOS and weaker on Android; IL2CPP is required
  for iOS and recommended for Android release builds.

## Performance — Mobile Rendering
- Use the **Universal Render Pipeline (URP)** on mobile; the Built-in pipeline is deprecated for new
  mobile projects. Enable the SRP Batcher and GPU Resident Drawer (Unity 6) to cut draw-call overhead.
- Bake lighting; keep real-time lights and shadows minimal. Profile with the **on-device** Profiler and
  Frame Debugger — editor timings do not reflect mobile GPUs or thermal throttling.

## Testing
- Use the **Unity Test Framework** (UTF, `com.unity.test-framework`) — `[Test]` for edit-mode logic and
  `[UnityTest]` (returns `IEnumerator`) for play-mode/frame-stepping tests. Assert with `NUnit`.
- Gate GC in tests: `Assert.That(() => code(), Is.Not.AllocatingGCMemory())` via the Performance Testing
  Extension catches per-frame allocation regressions in CI.

## Version-specific (verified 2026-07-10)
- **Unity 6** versions as `6000.x.x` (not `6.x`). Current streams: **6000.4.0f1** mainline, with
  **6000.3.x** and **6000.0.x** (6000.0.71f1) on the LTS track — verify the exact patch on the archive.
- **Unity 6 LTS** = the 6000.0 stream; the 6000.3 stream is also LTS-designated. Pick an LTS for
  shipping mobile titles.
- `Awaitable` (zero-alloc async), built-in `ObjectPool<T>`, and the GPU Resident Drawer are Unity 6
  features — do not suggest them for 2022 LTS projects.
- iOS builds require **Xcode 16+** for Unity 6.

## References (retrieved 2026-07-10)
- Unity release archive (6000.4/6000.3/6000.0 versions, LTS labels) — https://unity.com/releases/editor/archive
- Unity 6 download — https://unity.com/download
- `Awaitable` / async in Unity — https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Awaitable.html
- `UnityEngine.Pool.ObjectPool<T>` — https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Pool.ObjectPool_1.html
- CWE-502: Deserialization of Untrusted Data — https://cwe.mitre.org/data/definitions/502.html
- CWE-94: Improper Control of Generation of Code ('Code Injection') — https://cwe.mitre.org/data/definitions/94.html
