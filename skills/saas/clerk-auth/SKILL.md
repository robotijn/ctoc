---
name: clerk-auth
description: Implement Clerk authentication for a B2C SaaS — signup, login, email verification, social, MFA, session management, route protection.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "clerk auth"
  - "clerk authentication"
  - "user signup"
  - "user login"
  - "session management"
  - "email verification"
  - "auth provider"
  - "B2C auth"
related_skills:
  - saas/stripe-subscriptions
  - saas/multi-tenancy-row-level
  - security/input-validation-checker
effort_level: medium
model_optimized_for: opus-4-7
model: opus
tools: Read, Write, Edit, Bash
---

# Clerk Auth (saas skill)

> Implementation guide for Clerk in a Next.js 15 SaaS. Used by the `saas/b2c-subscription` template.

## Role

You implement Clerk auth correctly: middleware-protected routes, server-side `auth()`, signup with email verification, social providers, MFA where appropriate, and session-aware UI.

## 2026 Best Practices (SaaS auth)

- **Clerk for B2C** — hosted UI, email verification + social out of the box.
- **WorkOS for B2B** — SSO with SAML/OIDC; use the `b2b-sales-led` template.
- **Supabase Auth or Lucia for self-hosted** — if Clerk's data residency or pricing don't fit.
- **MFA recommended** for accounts with billing.
- **No password reset in your code** — let Clerk handle it (their reset flow is correct).
- **Sync user.id to your DB via webhook** — Clerk fires `user.created`; you map to your users table.

## Implementation pattern

### 1. Install + configure

```bash
npm install @clerk/nextjs
```

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/onboarding
```

### 2. Middleware (route protection)

```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/account(.*)',
  '/settings(.*)',
  '/api/(?!stripe/webhook|clerk/webhook).*',  // protect all API except webhooks
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

### 3. Server-side auth in Route Handlers / Server Components

```typescript
// app/dashboard/page.tsx (Server Component)
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function Dashboard() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  // ... fetch user-scoped data
}
```

```typescript
// app/api/me/route.ts (Route Handler)
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const user = await currentUser();
  return NextResponse.json({ id: userId, email: user?.emailAddresses[0]?.emailAddress });
}
```

### 4. Webhook — sync to your DB

```typescript
// app/api/clerk/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { db } from '@/db';
import { users } from '@/db/schema';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const h = await headers();
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SIGNING_SECRET!);

  let evt: any;
  try {
    evt = wh.verify(body, {
      'svix-id': h.get('svix-id')!,
      'svix-timestamp': h.get('svix-timestamp')!,
      'svix-signature': h.get('svix-signature')!,
    });
  } catch (err) {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  }

  if (evt.type === 'user.created') {
    await db.insert(users).values({
      clerkId: evt.data.id,
      email: evt.data.email_addresses[0].email_address,
    }).onConflictDoNothing();
  } else if (evt.type === 'user.deleted') {
    // Soft-delete or anonymize per privacy policy
  }

  return NextResponse.json({ ok: true });
}
```

### 5. UI components

```tsx
// app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from '@clerk/nextjs';
export default function Page() { return <SignIn />; }

// app/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from '@clerk/nextjs';
export default function Page() { return <SignUp />; }

// app/layout.tsx
import { ClerkProvider } from '@clerk/nextjs';
export default function RootLayout({ children }) {
  return <ClerkProvider><html><body>{children}</body></html></ClerkProvider>;
}
```

### 6. User menu

```tsx
// components/UserMenu.tsx
import { UserButton, SignedIn, SignedOut, SignInButton } from '@clerk/nextjs';
export function UserMenu() {
  return (
    <>
      <SignedIn><UserButton /></SignedIn>
      <SignedOut><SignInButton /></SignedOut>
    </>
  );
}
```

## Critical pitfalls

1. **Middleware matcher misses API routes** — make sure `(api|trpc)(.*)` is in the matcher config.
2. **Webhook signing not verified** — uses svix library; verify svix-id, svix-timestamp, svix-signature headers.
3. **User created in Clerk but missing in your DB** — webhook race condition; provision-on-first-access as fallback.
4. **Forgot to protect API webhooks** — exclude `/api/stripe/webhook` AND `/api/clerk/webhook` from auth (signatures verify them).
5. **Email verification not enforced** — turn on "require verification" in Clerk Dashboard.
6. **Session expiry too short or too long** — default 7d is reasonable; configurable per project.

## Test plan

```typescript
describe('Clerk integration', () => {
  it('protected route returns 401 without session', async () => { ... });
  it('protected route returns data with valid session', async () => { ... });
  it('webhook creates user in DB on user.created', async () => { ... });
  it('webhook rejects bad signature', async () => { ... });
  it('UserButton renders SignIn when signed out', async () => { ... });
});
```

## Choosing Clerk vs alternatives

| Provider | Best for | Trade-off |
|---|---|---|
| **Clerk** | B2C SaaS, fast launch | Vendor lock-in, $ per MAU |
| **WorkOS** | B2B with SSO | More config; pricier |
| **Supabase Auth** | When already on Supabase DB | Less polish than Clerk |
| **Auth.js** | Custom flows, OSS | More code to maintain |
| **Lucia** | Self-hosted, modern | DIY UI |

For the `saas/b2c-subscription` template, **Clerk is the default** — fastest path to working signup + login + email verification.

## Sources

- [Clerk Next.js Quickstart](https://clerk.com/docs/quickstarts/nextjs)
- [Clerk webhooks](https://clerk.com/docs/integrations/webhooks/overview)
- [Anthropic best practices for SaaS auth](https://anthropic.com) (placeholder; real source is the category brief)
