---
name: resend-email
description: Transactional email via Resend — domain verification (SPF/DKIM/DMARC), React Email templates, welcome/receipt/dunning flows.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "resend"
  - "transactional email"
  - "send email"
  - "email integration"
  - "welcome email"
  - "email deliverability"
  - "SPF DKIM DMARC"
related_skills:
  - saas/stripe-subscriptions
  - saas/clerk-auth
effort_level: medium
model_optimized_for: opus-4-7
model: sonnet
tools: Read, Write, Edit, Bash
---

# Resend Email (saas skill)

> Implementation guide for transactional email via Resend in a SaaS.

## Role

You make sure transactional emails actually arrive in inboxes — not spam. That means proper DNS setup (SPF + DKIM + DMARC) BEFORE the first email goes out, plus React Email components for clean templates.

## 2026 Best Practices

- **Resend for transactional** (receipts, password reset, welcome). Clean API + React Email.
- **Loops or Customer.io for marketing** (sequences, drip campaigns). Different category.
- **Verify domain before sending** — SPF, DKIM, DMARC. Test with mail-tester.com (target ≥ 9/10).
- **From: name@<verified-domain>** — never from gmail.com.
- **Reply-to: support@<domain>** — so users can reply to your support team.
- **Track opens + clicks** (Resend handles this) but disable for sensitive emails (password reset).

## Implementation pattern

### 1. Domain setup (Resend Dashboard, BEFORE code)

```
1. Sign up at resend.com
2. Add domain (e.g., yourapp.com)
3. Resend gives you 3 DNS records: SPF (TXT), DKIM (CNAME or TXT), DMARC (TXT)
4. Add records to your DNS provider (Cloudflare, Route53, etc.)
5. Resend verifies — usually < 10 min
6. Test: send to mail-tester.com; aim for ≥ 9/10
```

### 2. Environment

```env
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=hello@yourapp.com
RESEND_REPLY_TO=support@yourapp.com
```

### 3. Library setup

```bash
npm install resend react-email @react-email/components
```

```typescript
// lib/email/client.ts
import { Resend } from 'resend';
export const resend = new Resend(process.env.RESEND_API_KEY!);
```

### 4. React Email templates

```tsx
// emails/WelcomeEmail.tsx
import { Html, Head, Body, Container, Heading, Text, Button } from '@react-email/components';

export function WelcomeEmail({ firstName, dashboardUrl }: { firstName: string; dashboardUrl: string }) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'system-ui, sans-serif' }}>
        <Container>
          <Heading>Welcome, {firstName}!</Heading>
          <Text>Thanks for signing up. Here's how to get started:</Text>
          <Button href={dashboardUrl}>Open dashboard</Button>
          <Text>Reply to this email if you need help.</Text>
        </Container>
      </Body>
    </Html>
  );
}
```

### 5. Send

```typescript
// lib/email/send.ts
import { resend } from './client';
import { WelcomeEmail } from '../../emails/WelcomeEmail';
import { ReceiptEmail } from '../../emails/ReceiptEmail';
import { DunningEmail } from '../../emails/DunningEmail';

export async function sendWelcomeEmail({ to, firstName }: { to: string; firstName: string }) {
  return resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    replyTo: process.env.RESEND_REPLY_TO!,
    to,
    subject: 'Welcome to YourApp',
    react: <WelcomeEmail firstName={firstName} dashboardUrl={`${process.env.NEXT_PUBLIC_APP_URL}/dashboard`} />,
    tags: [{ name: 'category', value: 'welcome' }],
  });
}

export async function sendReceiptEmail({ to, amount, invoiceUrl }: { to: string; amount: number; invoiceUrl: string }) {
  return resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to,
    subject: `Receipt: $${(amount / 100).toFixed(2)}`,
    react: <ReceiptEmail amount={amount} invoiceUrl={invoiceUrl} />,
    tags: [{ name: 'category', value: 'receipt' }],
  });
}

export async function sendDunningEmail({ to, firstName, retryDate, billingPortalUrl }: { to: string; firstName: string; retryDate: Date; billingPortalUrl: string }) {
  return resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    replyTo: process.env.RESEND_REPLY_TO!,
    to,
    subject: 'Your payment failed — please update your card',
    react: <DunningEmail firstName={firstName} retryDate={retryDate} billingPortalUrl={billingPortalUrl} />,
    tags: [{ name: 'category', value: 'dunning' }],
  });
}
```

### 6. Trigger points

| Email | Trigger | Source |
|---|---|---|
| Welcome | Clerk `user.created` webhook | `app/api/clerk/webhook/route.ts` |
| Email verification | Clerk handles automatically | (not your code) |
| Password reset | Clerk handles automatically | (not your code) |
| Receipt | Stripe `invoice.paid` webhook | `app/api/stripe/webhook/route.ts` |
| Dunning | Stripe `invoice.payment_failed` webhook | `app/api/stripe/webhook/route.ts` |
| Plan changed | Stripe `customer.subscription.updated` | `app/api/stripe/webhook/route.ts` |
| Trial ending | Cron (3 days before `trial_end`) | scheduled job (Inngest) |

## Critical pitfalls

1. **No domain verification** — emails go to spam. Verify FIRST.
2. **From: noreply@** — kills reply-to flow. Use a real address with `replyTo: support@`.
3. **Open tracking on password reset** — privacy concern. Disable for sensitive categories.
4. **Sending from localhost in dev** — Resend "test" mode + sandbox addresses only.
5. **No retry on send failure** — Resend can fail (transient); wrap in retry-with-backoff or Inngest job.
6. **Unsubscribe footer missing** — required for marketing emails (CAN-SPAM). Transactional emails are exempt but courteous to include.

## Test plan

```typescript
describe('Resend email integration', () => {
  it('sends welcome email on user.created', async () => { ... });
  it('sends receipt on invoice.paid', async () => { ... });
  it('sends dunning on invoice.payment_failed', async () => { ... });
  it('handles Resend API failure with retry', async () => { ... });
});
```

## Domain verification check (CI)

```bash
# Verify SPF, DKIM, DMARC are configured before deploy
dig +short TXT yourapp.com | grep -q "v=spf1" || exit 1
dig +short TXT resend._domainkey.yourapp.com | grep -q "v=DKIM1" || exit 1
dig +short TXT _dmarc.yourapp.com | grep -q "v=DMARC1" || exit 1
```

## Sources

- [Resend Quickstart](https://resend.com/docs/send-with-nextjs)
- [React Email](https://react.email/)
- [Mail-tester.com (deliverability check)](https://www.mail-tester.com/)
- [SPF / DKIM / DMARC explainer](https://easydmarc.com/blog/spf-dkim-dmarc/)
