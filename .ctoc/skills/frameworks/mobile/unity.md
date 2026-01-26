# Unity CTO
> Mobile game and XR engineering leader demanding object pooling and memory-conscious development.

## Commands
```bash
# Setup | Dev | Test
/Applications/Unity/Hub/Editor/2022.3.*/Unity.app/Contents/MacOS/Unity -batchmode -projectPath . -buildTarget iOS
Unity -executeMethod BuildScript.PerformBuild -quit -batchmode
Unity -runTests -testPlatform PlayMode -testResults results.xml
```

## Non-Negotiables
1. Object pooling for frequently spawned objects (bullets, particles, enemies)
2. Asset bundles or Addressables for mobile memory management
3. IL2CPP for production builds - Mono for development only
4. Unity Profiler targeting actual mobile devices, not editor
5. Draw call batching - keep SetPass calls under control

## Red Lines
- Find() or GetComponent() in Update loops - cache references
- Garbage collection in hot paths - minimize allocations
- Resources folder for large assets - use Addressables
- Development build settings in production
- Update() when FixedUpdate() or coroutines are appropriate

## Pattern: Generic Object Pool
```csharp
using System.Collections.Generic;
using UnityEngine;

public class ObjectPool<T> where T : Component
{
    private readonly T _prefab;
    private readonly Queue<T> _pool = new Queue<T>();
    private readonly Transform _parent;

    public ObjectPool(T prefab, int initialSize, Transform parent = null)
    {
        _prefab = prefab;
        _parent = parent;
        for (int i = 0; i < initialSize; i++)
        {
            var obj = Object.Instantiate(_prefab, _parent);
            obj.gameObject.SetActive(false);
            _pool.Enqueue(obj);
        }
    }

    public T Get(Vector3 position)
    {
        T obj = _pool.Count > 0 ? _pool.Dequeue() : Object.Instantiate(_prefab, _parent);
        obj.transform.position = position;
        obj.gameObject.SetActive(true);
        return obj;
    }

    public void Return(T obj)
    {
        obj.gameObject.SetActive(false);
        _pool.Enqueue(obj);
    }
}
```

## Integrates With
- **DB**: SQLite4Unity, PlayerPrefs for simple KV
- **Auth**: Unity Gaming Services Authentication
- **Cache**: Addressables with caching, PlayerPrefs for settings

## Common Errors
| Error | Fix |
|-------|-----|
| `MissingReferenceException` | Check object was not destroyed, use null check |
| `DllNotFoundException` | Ensure native plugins included in build settings |
| `IL2CPP build failed` | Check for incompatible code, add link.xml preserves |

## Prod Ready
- [ ] IL2CPP with code stripping optimized via link.xml
- [ ] Profiled on low-end target devices for thermal limits
- [ ] Addressables content build automated in CI
- [ ] Mobile-specific quality settings configured
