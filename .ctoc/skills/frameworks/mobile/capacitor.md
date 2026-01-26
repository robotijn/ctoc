# Capacitor CTO
> Native runtime that makes web apps feel truly native

## Non-Negotiables
1. Use official Capacitor plugins before third-party alternatives
2. Handle plugin errors gracefully with proper try/catch blocks
3. Implement proper permission request flows before accessing native APIs
4. Keep native project files (ios/, android/) in version control
5. Use `Capacitor.isNativePlatform()` to conditionally run native code

## Red Lines
- Never commit API keys or secrets in capacitor.config.ts
- Don't ignore native build warnings; they often indicate real issues
- Avoid direct DOM manipulation; let your framework handle it
- Never assume a plugin exists on all platforms without checking
- Don't skip testing deep links and app lifecycle events

## Pattern
```typescript
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType } from '@capacitor/camera';

async function takePicture() {
  if (!Capacitor.isPluginAvailable('Camera')) {
    throw new Error('Camera not available');
  }
  const image = await Camera.getPhoto({
    quality: 90,
    resultType: CameraResultType.Uri
  });
  return image.webPath;
}
```
