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
