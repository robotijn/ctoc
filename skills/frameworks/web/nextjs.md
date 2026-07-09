# Next.js CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npx create-next-app@latest --typescript --tailwind --app
# Or upgrade existing:
npx @next/codemod@canary upgrade latest
# Turbopack now stable for dev:
npm run dev --turbopack
```

## Claude's Common Mistakes
1. **Caching fetch by default** — Next.js 15 changed to `no-store` by default; explicitly set cache strategy
2. **Synchronous request APIs** — `cookies()`, `headers()`, `params`, `searchParams` are now async
3. **Catching `redirect()`** — Don't wrap redirect() in try/catch; it throws intentionally
4. **Using API routes for server data** — Use Server Components or Server Actions instead
5. **Overusing `'use client'`** — Keep components server-side unless they need interactivity

## Correct Patterns (2026)
```typescript
// Next.js 15: Async request APIs
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ query: string }>;
}) {
  const { id } = await params;
  const { query } = await searchParams;
  const cookieStore = await cookies();
}

// Server Action with validation
'use server'
import { revalidatePath } from 'next/cache';

export async function createItem(formData: FormData) {
  const validated = schema.safeParse(Object.fromEntries(formData));
  if (!validated.success) return { error: validated.error.flatten() };
  await db.item.create({ data: validated.data });
  revalidatePath('/items');
}

// Explicit caching (no longer default)
fetch(url, { cache: 'force-cache' })  // Opt into caching
export const revalidate = 3600;        // ISR
```

## Version Gotchas
- **v14→v15**: `cookies()`, `headers()`, `params`, `searchParams` are async (breaking)
- **v14→v15**: fetch/GET handlers uncached by default
- **v14→v15**: `sharp` auto-installed for image optimization
- **Security (RSC, transitive)**: CVE-2025-55184 / CVE-2025-55183 are React Server
  Components advisories inherited via `react-server-dom-webpack`; upgrade to a Next.js
  release pinning patched RSC packages (19.0.2 / 19.1.3 / 19.2.2) — verified below.

## What NOT to Do
- ❌ `const cookieStore = cookies()` — Use `await cookies()`
- ❌ `try { redirect('/') } catch {}` — Let redirect throw
- ❌ `'use client'` on data-fetching components — Fetch on server
- ❌ API routes for simple data — Use Server Actions
- ❌ Relying on cached behavior from v14 — Explicitly set cache

## Rendering Strategy
| Use Case | Strategy |
|----------|----------|
| Marketing/docs | Static (default) |
| User-specific | `dynamic = 'force-dynamic'` |
| Periodic updates | `revalidate = 3600` |
| Heavy interactivity | `'use client'` |

## Server / Client Boundary Footguns (Next.js 15 App Router)
The App Router renders **Server Components by default**; `"use client"` marks the
boundary where a subtree ships to the browser. Crossing it wrong is the #1
App-Router bug.

```typescript
// FOOTGUN 1 — hooks in a Server Component. useState/useEffect/onClick only exist
// on the client. A Server Component using them throws at build/render:
//   "You're importing a component that needs useState. It only works in a Client
//    Component, but none of its parents are marked with 'use client'."
export default function Page() {
  const [open, setOpen] = useState(false);  // ERROR — no 'use client' here
}

// RIGHT: isolate the interactive leaf as its own Client Component and keep the
// data-fetching parent on the server.
'use client';
export function Toggle() {
  const [open, setOpen] = useState(false);
  return <button onClick={() => setOpen((o) => !o)}>{open ? '–' : '+'}</button>;
}

// FOOTGUN 2 — passing NON-SERIALIZABLE props across the boundary. Props flowing
// Server → Client are serialized; functions, class instances, Dates-as-methods,
// Symbols cannot cross:
<Toggle onToggle={() => save()} />          // ERROR: functions aren't serializable
// Pass a Server Action (a serializable reference) or lift the handler client-side.
```
- A Client Component can render Server Components **only as `children`/props**, never
  by importing them — importing a server module into a client module pulls server-only
  code (and secrets) into the browser bundle.
- `"use client"` is a **boundary**, not per-file annotation: everything imported by a
  client module becomes client code transitively.
- Source: nextjs.org "Server and Client Components" docs. See References.

## Server Actions Footguns (input validation + auth)
A Server Action is a **public HTTP POST endpoint**. Next.js generates a callable ID
for it; anyone can invoke it with any payload. **Treat every argument as untrusted.**

```typescript
'use server';
import { z } from 'zod';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';

const Input = z.object({ id: z.string().uuid(), title: z.string().min(1).max(200) });

export async function updateItem(formData: FormData) {
  // 1) AUTHENTICATE + AUTHORIZE INSIDE the action — the endpoint is reachable even
  //    if no UI renders the form. A missing check here is broken access control.
  const session = await auth();
  if (!session) throw new Error('unauthenticated');

  // 2) VALIDATE every field — unvalidated action input is CWE-20 "Improper Input
  //    Validation" (cwe.mitre.org/20); trusting it feeds injection / IDOR.
  const parsed = Input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten() };

  // 3) AUTHORIZE the specific row (prevent IDOR — CWE-639): scope by owner.
  await db.item.update({
    where: { id: parsed.data.id, ownerId: session.user.id },
    data: { title: parsed.data.title },
  });

  revalidatePath('/items');    // FOOTGUN: forget this and the list shows stale data
  return { ok: true };
}
```
- **Double submission** — actions aren't idempotent by default; a retried POST runs
  twice. Guard mutating actions with an idempotency key or DB uniqueness, and disable
  the submit button while `useActionState`'s pending flag is set.
- `revalidatePath`/`revalidateTag` must name the path/tag whose cache the mutation
  invalidated, or clients keep serving the stale render; over-broad revalidation
  needlessly busts unrelated caches.

## Caching & Data Footguns (Next.js 15)
- **fetch is UNCACHED by default in Next.js 15** (v14 defaulted to `force-cache`).
  Opt into caching explicitly: `fetch(url, { cache: 'force-cache' })` or
  `next: { revalidate: 3600 }`. GET Route Handlers are also uncached by default now.
- **Async request APIs (breaking v14→v15)**: `cookies()`, `headers()`, `params`,
  `searchParams` are `Promise`s — `await` them. Reading a request API opts the route
  into **dynamic** rendering (no static prerender), which silently changes caching.
- **`use cache` / segment config** — `export const dynamic`, `revalidate`, and
  `fetchCache` at the segment level override per-request defaults; conflicting values
  across a layout/page pair produce surprising staleness. Pick one source of truth.
- **`next/image`** — always set `width`/`height` (or `fill`) to avoid layout shift,
  and list remote hosts in `images.remotePatterns`; an unlisted host 400s at request
  time, not build time.

## Security — Edge Runtime & Secret Exposure (Next.js 15)
- **Edge runtime is NOT Node.js.** Middleware and `export const runtime = 'edge'`
  routes run on a Web-APIs-only runtime: **no `fs`, no `net`, no native addons, no
  most Node built-ins**. A DB driver or `crypto`-native lib that works in a Node route
  throws only when the edge route executes. Keep heavy/Node-only work in the default
  Node.js runtime.

```typescript
// FOOTGUN: SECRET LEAK. Any env var prefixed NEXT_PUBLIC_ is INLINED into the
// client bundle at build time — it ships to every browser. Never prefix a secret.
const key = process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY;   // LEAKED to the browser
// RIGHT: server-only secret has no prefix and is read on the server only.
const key = process.env.STRIPE_SECRET_KEY;               // stays server-side
// Belt-and-braces: import 'server-only' at the top of a secret-reading module so a
// bundler ERROR fires if a Client Component ever imports it.
import 'server-only';
```
- **Middleware execution order** — middleware runs on the edge before every matched
  request; a broad `matcher` accidentally intercepts static assets and API routes.
  Scope the `matcher` and return early; don't do slow I/O in middleware (it's on the
  hot path of every request).

## Error Handling Idioms
- **`error.tsx` is a Client Component boundary** (`'use client'` required) catching
  render errors for a route segment; **`global-error.tsx`** replaces the root layout
  when the layout itself throws. `not-found.tsx` handles `notFound()`.
- **Do NOT wrap `redirect()`/`notFound()` in try/catch** — they work by throwing a
  special control-flow signal; a catch-all swallows the redirect and it silently
  fails. Let them throw; call them outside try/catch (or rethrow the signal).

```typescript
// FOOTGUN: swallows the redirect signal.
try { redirect('/login'); } catch {}          // redirect never happens
// RIGHT: let it throw.
if (!session) redirect('/login');
```

## Testing Conventions
```typescript
// Unit-test Server Actions / data functions directly (they're plain async fns).
import { updateItem } from './actions';
test('rejects unauthenticated', async () => {
  await expect(updateItem(new FormData())).rejects.toThrow('unauthenticated');
});
```
- End-to-end (Playwright) is the reliable way to test App-Router server/client
  interplay — RTL can't render a real Server Component tree. Drive the real user flow
  (navigate → submit → assert the DB/UI changed), not a `<div>` snapshot.

## Performance Traps
- **Ship less client JS** — keep components on the server; every `"use client"`
  subtree and its transitive imports are bundled and hydrated in the browser. A
  `"use client"` at a layout root drags the whole page client-side.
- **Streaming with `<Suspense>` / `loading.tsx`** — wrap slow data so the shell paints
  immediately and the slow segment streams in, instead of blocking Time-To-First-Byte
  on the slowest fetch. A single un-suspended `await` at the top of a page serializes
  the whole route.
- **Parallelize independent fetches** — sequential `await a(); await b();` is a request
  waterfall; use `await Promise.all([a(), b()])` when they don't depend on each other.
- **`next/dynamic`** lazy-loads a heavy client-only widget (charts, editors) so it
  isn't in the initial bundle; pair with `ssr: false` only for genuinely
  browser-only libraries.

## Version-Specific Gotchas (dated, sourced)
- **Next.js 16.2.10** is the current `latest` on npm; the **Next.js 15** App-Router
  line's latest stable is **15.5.20** (still backport-maintained). App-Router
  Server/Client + Server Actions patterns here apply to 15 and forward to 16.
  [npmjs.com/package/next `dist-tags`, retrieved 2026-07-09]
- **v14→v15 (breaking)**: `cookies()/headers()/params/searchParams` are async; fetch
  and GET handlers uncached by default; `sharp` auto-installed for image optimization.
  [nextjs.org Next.js 15 release + upgrade guide, retrieved 2026-07-09]
- **Security (RSC transitively)**: Next.js bundles `react-server-dom-webpack`, so it
  inherits CVE-2025-55184 (CWE-502 DoS, CVSS 7.5) + CVE-2025-55183 (source leak,
  CVSS 5.3), published 2025-12-11, fixed in the RSC 19.0.2 / 19.1.3 / 19.2.2 line.
  Upgrade Next.js to a release pinning the patched React RSC packages.
  [nvd.nist.gov + github.com/advisories GHSA-2m3v-v2m8-q956 / GHSA-925w-6v3x-g4j4,
  retrieved 2026-07-09]

## References (retrieved 2026-07-09)
- Next.js versions (npm): https://www.npmjs.com/package/next
- Next.js 15 release notes: https://nextjs.org/blog/next-15
- Server and Client Components: https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns
- Server Actions & Mutations: https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations
- Caching in Next.js: https://nextjs.org/docs/app/building-your-application/caching
- Edge Runtime: https://nextjs.org/docs/app/api-reference/edge
- CWE-20 (Improper Input Validation): https://cwe.mitre.org/data/definitions/20.html
- CWE-639 (Authorization Bypass / IDOR): https://cwe.mitre.org/data/definitions/639.html
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
- CVE-2025-55184 (RSC DoS): https://github.com/advisories/GHSA-2m3v-v2m8-q956
- CVE-2025-55183 (RSC source leak): https://github.com/advisories/GHSA-925w-6v3x-g4j4
