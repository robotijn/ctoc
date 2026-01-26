# Unity CTO
> The engine that powers mobile games and XR experiences

## Non-Negotiables
1. Use object pooling for frequently spawned objects
2. Implement proper asset bundle management for mobile memory limits
3. Use IL2CPP for production builds; Mono is for development only
4. Profile with Unity Profiler targeting actual mobile devices
5. Batch draw calls; keep SetPass calls under control

## Red Lines
- Never use Find() or GetComponent() in Update loops
- Don't ignore garbage collection; minimize allocations in hot paths
- Avoid Resources folder for large assets; use Addressables
- Never ship with development build settings enabled
- Don't use Update() when FixedUpdate() or coroutines are appropriate

## Pattern
```csharp
// Object pooling pattern
public class BulletPool : MonoBehaviour
{
    private Queue<GameObject> pool = new Queue<GameObject>();

    public GameObject Get()
    {
        if (pool.Count > 0)
        {
            var obj = pool.Dequeue();
            obj.SetActive(true);
            return obj;
        }
        return Instantiate(bulletPrefab);
    }

    public void Return(GameObject obj)
    {
        obj.SetActive(false);
        pool.Enqueue(obj);
    }
}
```
