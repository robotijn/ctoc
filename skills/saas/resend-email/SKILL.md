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
  - "bounce webhook"
  - "complaint webhook"
  - "suppression list"
related_skills:
  - saas/stripe-subscriptions
  - saas/clerk-auth
  - security/security-scanner
  - rate-limiting
effort_level: medium
model_optimized_for: opus-4-7
model: sonnet
tools: Read, Write, Edit, Bash
---

# Resend Email (saas skill)

> Implementation guide for transactional email via Resend in a SaaS.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are a deliverability-paranoid email engineer. You assume every send can bounce, every domain is one misconfig from spam, and every webhook can be spoofed. Your job is to make sure transactional emails actually arrive in inboxes — not spam — and that bounces, complaints, and retries are handled with the same rigor as payments. That means proper DNS setup (SPF + DKIM + DMARC with `p=quarantine` or stronger) BEFORE the first email goes out, signed webhooks for bounce/complaint feedback, an idempotency key on every send, and a suppression list nobody can bypass.

## 2026 Best Practices

- **SPF + DKIM + DMARC are non-negotiable.** Google and Yahoo's Feb 2024 bulk-sender requirements (enforcement consistency tightened through 2025–2026, with Gmail escalating from temporary delays to permanent rejection) require all three for any domain sending >5k/day to their users. Microsoft adopted the same baseline in May 2025. DMARC at `p=none` is the floor; ship at **`p=quarantine` minimum**, move to `p=reject` once you've watched aggregate reports for 2–4 weeks and confirmed nothing legitimate is failing alignment.
- **Send from a dedicated subdomain, not the apex.** Use `mail.yourapp.com` or `send.yourapp.com`. Apex sending pollutes corporate reputation (marketing, sales, support all share). Subdomain separation lets transactional, marketing, and notifications have independent reputations — if marketing burns deliverability, receipts still arrive.
- **Warm up new domains.** New domains have no sending history; ISPs throttle. Ramp volume over 2–6 weeks for marketing-volume sending. For purely transactional SaaS volume in early stages, organic ramp is usually fine, but never blast 50k cold from a fresh domain on day one.
- **Double opt-in for marketing lists.** Confirmed opt-in (send a verify link; only add after click) is the single biggest predictor of low complaint rate. Required-by-law in EU under GDPR for marketing; strongly recommended everywhere else. Transactional sends don't need opt-in (they're triggered by a user action) but still need a working suppression list.
- **One-click unsubscribe (RFC 8058) on marketing.** `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers required by Gmail/Yahoo for bulk senders. Honor the unsub within two days. Transactional messages don't need this header, but a footer link doesn't hurt.
- **Idempotency keys on every send.** Webhooks retry. Cron jobs retry. Stripe retries `invoice.paid`. Without an idempotency key, the user gets the same receipt 3 times. Resend accepts `Idempotency-Key` header — set it to a deterministic value (e.g., `receipt:<invoice_id>`) so retries are no-ops.
- **Store every send in the database.** One row per send: idempotency key, recipient, template, status, Resend message ID, timestamps. Updated by webhook events (`sent`, `delivered`, `bounced`, `complained`, `opened`, `clicked`). This is your audit log and your dedup source.
- **Bounce + complaint webhooks → suppression list.** A hard bounce or complaint MUST suppress the address. Subsequent sends to a suppressed address must be blocked at your application layer, not Resend's — keep the check `O(1)` against your own table. Gmail/Yahoo enforce a complaint rate below 0.3%; one careless send loop can blow the budget.
- **Verify webhook signatures.** Resend webhooks are signed via Svix (HMAC-SHA256 over `svix_id.svix_timestamp.body`). An unsigned bounce-webhook endpoint is an attacker's free suppression-list-poisoning tool. Verify every payload.
- **React Email for templates.** Consistent rendering across Gmail, Outlook, Apple Mail, mobile. React Email's `<Container>`, `<Button>`, `<Img>` components handle the table-layout/MSO-conditional hell so you don't.
- **Disable open/click tracking on sensitive flows.** Password reset, MFA codes, 2FA emails — tracking pixels and rewritten links leak metadata and can break the link in privacy-strict mail clients. Set `tracking: { open: false, click: false }` per send for these categories.
- **Reply-to a real inbox.** `from: hello@send.yourapp.com`, `reply-to: support@yourapp.com`. `noreply@` kills user trust and the support flywheel.
- **mail-tester.com >= 9/10 before production traffic.** Catches missing DKIM, broken DMARC alignment, content red-flags, blacklist hits. Re-run after any DNS change.

## Vulnerability / Misconfig Categories

> Severity tiers below are the **internal triage view** for human-readable reports. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule.

### 1. Missing or weak SPF/DKIM/DMARC

```dns
# BAD: no DMARC record at all (Gmail/Yahoo will deliver to spam or reject)
# BAD: DMARC p=none in production beyond a 4-week monitoring window

# SAFE: minimum production DMARC
_dmarc.yourapp.com.  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@yourapp.com; ruf=mailto:dmarc-forensic@yourapp.com; fo=1; adkim=s; aspf=s"
```

Edge cases: DMARC `p=quarantine` with `pct=100` (default; some senders mistakenly set `pct=10` and forget); SPF `+all` (allows anyone — must be `~all` or `-all`); DKIM selector mismatch with sending service; CNAME chain breaks when registrar flattens.

### 2. Missing bounce webhook handler

```typescript
// BAD: no webhook configured — bounces silently accumulate, suppression list never updated
// Send loop hits the same dead address forever, burning sender reputation.

// SAFE: webhook handler updates email_log and suppression_list
// See "TypeScript — webhook handler" section below.
```

### 3. Missing complaint handler (FBL — feedback loop)

Gmail and Yahoo's complaint rate ceiling is **0.3%**. A complaint without suppression means the user marked you spam, you sent again, they marked you spam again. ISP reputation tanks within hours of breaching the threshold. Complaint webhook MUST add the recipient to the suppression list synchronously.

### 4. No idempotency on send

```typescript
// BAD: Stripe retries invoice.paid webhook → user gets 3 receipts
export async function onInvoicePaid(invoice) {
  await resend.emails.send({
    to: invoice.customer_email,
    from: SENDER,
    subject: `Receipt for ${invoice.id}`,
    react: <ReceiptEmail invoice={invoice} />,
  });
}

// SAFE: idempotency key derived from invoice ID; second call is a no-op
export async function onInvoicePaid(invoice) {
  await resend.emails.send(
    {
      to: invoice.customer_email,
      from: SENDER,
      subject: `Receipt for ${invoice.id}`,
      react: <ReceiptEmail invoice={invoice} />,
    },
    { idempotencyKey: `receipt:${invoice.id}` },
  );
}
```

### 5. Hardcoded sender / recipient / API key

```typescript
// BAD
const resend = new Resend('re_<REDACTED>_real_key_committed');
await resend.emails.send({ from: 'hardcoded@yourapp.com', to: 'oncall@yourapp.com', ... });

// SAFE: env-driven, with per-tenant override at the config layer
const resend = new Resend(process.env.RESEND_API_KEY!);
await resend.emails.send({ from: config.email.fromAddress, to: user.email, ... });
```

### 6. Missing `List-Unsubscribe` header on marketing

```typescript
// SAFE (marketing only — Gmail/Yahoo enforce since Feb 2024)
await resend.emails.send({
  from: 'newsletter@send.yourapp.com',
  to: user.email,
  subject: 'May product update',
  react: <NewsletterEmail user={user} />,
  headers: {
    'List-Unsubscribe': `<https://yourapp.com/unsub?token=${user.unsubToken}>, <mailto:unsubscribe@yourapp.com?subject=unsub-${user.id}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  },
});
```

### 7. Missing webhook signature verification

A bounce-webhook endpoint without signature verification is a poisoning vector — an attacker POSTs fake "bounce" events for every paying customer's address, your suppression list silently kills your business. See [[security-scanner]] for the broader webhook-security pattern.

### 8. PII in subject line / message ID / logs

Subject lines are logged in plaintext by every mail server on the delivery path, archived by corporate retention systems, and surface in notification previews on locked phones. Don't put SSNs, full credit-card numbers, medical info, or anything regulated in the subject.

```typescript
// BAD
subject: `Your prescription for ${drug} is ready — DOB ${dob}`,

// SAFE
subject: `Your prescription is ready`,
// PII goes in the rendered body behind auth wall, not the subject.
```

### 9. Missing rate limiting per recipient

A bug in a notification loop can send 5,000 emails to one address before anyone notices. Rate-limit per recipient as a backstop. Cross-link [[rate-limiting]] for the implementation pattern; the suppression-list table below includes a `last_sent_at` column for this purpose.

### 10. Sending to addresses on the suppression list

```typescript
// BAD: send without checking suppression
await resend.emails.send({ to: email, ... });

// SAFE: check first, fail closed
async function safeSend(opts) {
  if (await isSuppressed(opts.to)) {
    logger.info({ email: opts.to, template: opts.template }, 'suppressed.skip');
    return { skipped: 'suppressed' };
  }
  return resend.emails.send(opts, { idempotencyKey: opts.idempotencyKey });
}
```

## Implementation pattern

### A. Domain setup (Resend Dashboard, BEFORE code)

```
1. Sign up at resend.com
2. Add a SUBDOMAIN (e.g., send.yourapp.com) — not the apex
3. Resend gives you SPF (TXT), DKIM (CNAME or TXT), and a DMARC starter record
4. Add records to your DNS (Cloudflare, Route53, etc.)
5. Set DMARC to p=quarantine after 1–2 weeks at p=none (monitor rua reports)
6. Verify with mail-tester.com (target >= 9/10) and MXToolbox (no blacklist hits)
7. Configure webhooks: bounce, complaint, delivered, opened, clicked → /api/resend/webhook
```

### B. Environment

```env
RESEND_API_KEY=re_<REDACTED>
RESEND_FROM_EMAIL=hello@send.yourapp.com
RESEND_REPLY_TO=support@yourapp.com
RESEND_WEBHOOK_SECRET=whsec_<REDACTED>
```

### C. TypeScript — Next.js + React Email + Resend (send path)

```typescript
// lib/email/client.ts
import { Resend } from 'resend';
export const resend = new Resend(process.env.RESEND_API_KEY!);

// lib/email/suppress.ts
import { db } from '@/lib/db';
export async function isSuppressed(email: string): Promise<boolean> {
  const row = await db.query.suppressionList.findFirst({
    where: (s, { eq }) => eq(s.email, email.toLowerCase()),
  });
  return !!row;
}

// lib/email/send.ts
import { resend } from './client';
import { isSuppressed } from './suppress';
import { db } from '@/lib/db';
import { ReceiptEmail } from '@/emails/ReceiptEmail';

export async function sendReceiptEmail({
  to,
  invoiceId,
  amount,
  invoiceUrl,
}: {
  to: string;
  invoiceId: string;
  amount: number;
  invoiceUrl: string;
}) {
  const idempotencyKey = `receipt:${invoiceId}`;

  // Suppression check (fail closed)
  if (await isSuppressed(to)) {
    await db.insert(db.schema.emailLog).values({
      idempotency_key: idempotencyKey,
      recipient: to.toLowerCase(),
      template: 'receipt',
      status: 'suppressed',
    }).onConflictDoNothing();
    return { skipped: 'suppressed' };
  }

  const result = await resend.emails.send(
    {
      from: process.env.RESEND_FROM_EMAIL!,
      replyTo: process.env.RESEND_REPLY_TO!,
      to,
      subject: 'Your receipt',           // no PII in subject
      react: <ReceiptEmail amount={amount} invoiceUrl={invoiceUrl} />,
      tags: [{ name: 'category', value: 'receipt' }],
    },
    { idempotencyKey },
  );

  await db.insert(db.schema.emailLog).values({
    idempotency_key: idempotencyKey,
    recipient: to.toLowerCase(),
    template: 'receipt',
    status: 'sent',
    provider_message_id: result.data?.id,
  }).onConflictDoUpdate({
    target: db.schema.emailLog.idempotency_key,
    set: { status: 'sent', provider_message_id: result.data?.id },
  });

  return result;
}
```

### D. TypeScript — Next.js webhook handler (bounce / complaint / delivered)

```typescript
// app/api/resend/webhook/route.ts
import { Webhook } from 'svix';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headers = {
    'svix-id': req.headers.get('svix-id')!,
    'svix-timestamp': req.headers.get('svix-timestamp')!,
    'svix-signature': req.headers.get('svix-signature')!,
  };

  // SIGNATURE VERIFICATION — fail closed
  let evt: ResendWebhookEvent;
  try {
    const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET!);
    evt = wh.verify(body, headers) as ResendWebhookEvent;
  } catch {
    return new Response('invalid signature', { status: 400 });
  }

  const { type, data } = evt;
  const recipient = data.to?.[0]?.toLowerCase();
  if (!recipient) return new Response('ok', { status: 200 });

  switch (type) {
    case 'email.bounced':
      // Only hard bounces go to suppression — soft bounces (mailbox full, greylisting) retry
      if (data.bounce?.type === 'hard') {
        await db.insert(db.schema.suppressionList).values({
          email: recipient,
          reason: 'hard_bounce',
          provider_message_id: data.email_id,
        }).onConflictDoNothing();
      }
      await db.insert(db.schema.bounceLog).values({
        provider_message_id: data.email_id,
        recipient,
        bounce_type: data.bounce?.type ?? 'unknown',
        diagnostic: data.bounce?.message ?? null,
      });
      break;

    case 'email.complained':
      // Complaint → IMMEDIATE suppression. Gmail/Yahoo ceiling is 0.3%.
      await db.insert(db.schema.suppressionList).values({
        email: recipient,
        reason: 'complaint',
        provider_message_id: data.email_id,
      }).onConflictDoNothing();
      break;

    case 'email.delivered':
    case 'email.opened':
    case 'email.clicked':
      await db.update(db.schema.emailLog)
        .set({ status: type.replace('email.', '') })
        .where(eq(db.schema.emailLog.provider_message_id, data.email_id));
      break;
  }

  return new Response('ok', { status: 200 });
}

type ResendWebhookEvent = {
  type: 'email.sent' | 'email.delivered' | 'email.bounced' | 'email.complained' | 'email.opened' | 'email.clicked';
  data: {
    email_id: string;
    to: string[];
    bounce?: { type: 'hard' | 'soft'; message: string };
  };
};
```

### E. Python (3.12+) — FastAPI + resend-python

```python
# app/email/send.py
import os
import resend
from sqlalchemy.dialects.postgresql import insert
from app.db import db, EmailLog, SuppressionList

resend.api_key = os.environ["RESEND_API_KEY"]

async def is_suppressed(email: str) -> bool:
    row = await db.fetch_one(
        "SELECT 1 FROM suppression_list WHERE email = :e",
        {"e": email.lower()},
    )
    return row is not None

async def send_receipt_email(*, to: str, invoice_id: str, amount_cents: int, invoice_url: str):
    idem = f"receipt:{invoice_id}"
    if await is_suppressed(to):
        return {"skipped": "suppressed"}

    # BAD: resend.Emails.send(...) without idempotency on a webhook-driven path
    # SAFE: pass idempotency_key so Stripe retries don't duplicate receipts.
    # Resend's HTTP API documents an `Idempotency-Key` request header — if the
    # SDK version in use doesn't expose it as a kwarg, fall back to a direct
    # httpx POST with the header set (shown below).
    import httpx
    resp = httpx.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {os.environ['RESEND_API_KEY']}",
            "Idempotency-Key": idem,
        },
        json={
            "from": os.environ["RESEND_FROM_EMAIL"],
            "reply_to": os.environ["RESEND_REPLY_TO"],
            "to": to,
            "subject": "Your receipt",                        # no PII in subject
            "html": render_receipt_html(amount_cents, invoice_url),
            "tags": [{"name": "category", "value": "receipt"}],
        },
        timeout=10.0,
    )
    resp.raise_for_status()
    result = resp.json()

    stmt = insert(EmailLog).values(
        idempotency_key=idem,
        recipient=to.lower(),
        template="receipt",
        status="sent",
        provider_message_id=result["id"],
    ).on_conflict_do_update(
        index_elements=["idempotency_key"],
        set_={"status": "sent", "provider_message_id": result["id"]},
    )
    await db.execute(stmt)
    return result
```

```python
# app/email/webhook.py — FastAPI, signature verification via svix
from fastapi import APIRouter, Request, HTTPException
from svix.webhooks import Webhook, WebhookVerificationError
import os, json

router = APIRouter()
wh = Webhook(os.environ["RESEND_WEBHOOK_SECRET"])

@router.post("/api/resend/webhook")
async def resend_webhook(req: Request):
    body = await req.body()
    headers = {
        "svix-id": req.headers["svix-id"],
        "svix-timestamp": req.headers["svix-timestamp"],
        "svix-signature": req.headers["svix-signature"],
    }
    try:
        evt = wh.verify(body, headers)
    except WebhookVerificationError:
        raise HTTPException(status_code=400, detail="invalid signature")

    recipient = (evt["data"]["to"][0] or "").lower()
    if evt["type"] == "email.bounced" and evt["data"].get("bounce", {}).get("type") == "hard":
        await suppress(recipient, reason="hard_bounce", message_id=evt["data"]["email_id"])
    elif evt["type"] == "email.complained":
        await suppress(recipient, reason="complaint", message_id=evt["data"]["email_id"])
    return {"ok": True}
```

### F. Java (21+) — Spring Boot + OkHttp + Resend REST

```java
// EmailService.java
@Service
public class EmailService {
    private final OkHttpClient http;
    private final EmailLogRepo logs;
    private final SuppressionRepo suppressions;
    @Value("${resend.api.key}") String apiKey;
    @Value("${resend.from}") String from;

    // BAD: no idempotency, no suppression check — Stripe retries cause dupes
    public void sendReceiptBad(String to, String invoiceId, long amountCents) throws IOException {
        var body = RequestBody.create(
            "{\"from\":\"" + from + "\",\"to\":\"" + to + "\",\"subject\":\"Receipt\",\"html\":\"...\"}",
            MediaType.parse("application/json"));
        http.newCall(new Request.Builder()
            .url("https://api.resend.com/emails")
            .header("Authorization", "Bearer " + apiKey)
            .post(body).build()).execute();
    }

    // SAFE: idempotency key, suppression gate, DB log
    // Note: production code should build the JSON via Jackson/Gson — never .formatted()
    // with user-controlled strings (JSON injection if `to` or HTML contains `"`).
    public void sendReceipt(String to, String invoiceId, long amountCents) throws IOException {
        String idem = "receipt:" + invoiceId;
        if (suppressions.existsByEmail(to.toLowerCase())) {
            logs.upsert(idem, to.toLowerCase(), "receipt", "suppressed", null);
            return;
        }
        var payload = Map.of(
            "from", from,
            "to", to,
            "subject", "Your receipt",
            "html", renderReceipt(amountCents),
            "tags", List.of(Map.of("name", "category", "value", "receipt"))
        );
        String json = objectMapper.writeValueAsString(payload);   // proper escaping
        var req = new Request.Builder()
            .url("https://api.resend.com/emails")
            .header("Authorization", "Bearer " + apiKey)
            .header("Idempotency-Key", idem)
            .post(RequestBody.create(json, MediaType.parse("application/json")))
            .build();
        try (var resp = http.newCall(req).execute()) {
            if (!resp.isSuccessful()) throw new IOException("resend " + resp.code());
            String msgId = parseId(resp.body().string());
            logs.upsert(idem, to.toLowerCase(), "receipt", "sent", msgId);
        }
    }
}
```

```java
// ResendWebhookController.java — Spring Boot, Svix signature verification
@RestController
public class ResendWebhookController {
    private final Webhook webhook;   // new Webhook(System.getenv("RESEND_WEBHOOK_SECRET"))

    @PostMapping("/api/resend/webhook")
    public ResponseEntity<String> handle(@RequestBody String body, @RequestHeader HttpHeaders headers) {
        var svixHeaders = new HttpHeaders();
        svixHeaders.add("svix-id", headers.getFirst("svix-id"));
        svixHeaders.add("svix-timestamp", headers.getFirst("svix-timestamp"));
        svixHeaders.add("svix-signature", headers.getFirst("svix-signature"));
        try {
            webhook.verify(body, svixHeaders);
        } catch (WebhookVerificationException e) {
            return ResponseEntity.badRequest().body("invalid signature");
        }
        // ... parse event, route to suppression list ...
        return ResponseEntity.ok("");
    }
}
```

### G. C# (.NET 9) — ASP.NET Core + HttpClient

```csharp
// EmailService.cs
public class EmailService(HttpClient http, AppDb db, IConfiguration cfg)
{
    // BAD: no idempotency, no suppression check
    public async Task SendReceiptBadAsync(string to, string invoiceId, long amountCents)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails")
        {
            Content = JsonContent.Create(new { from = cfg["Resend:From"], to, subject = "Receipt", html = "..." }),
        };
        req.Headers.Authorization = new("Bearer", cfg["Resend:ApiKey"]);
        await http.SendAsync(req);
    }

    // SAFE: idempotency, suppression gate, DB log
    public async Task SendReceiptAsync(string to, string invoiceId, long amountCents)
    {
        var idem = $"receipt:{invoiceId}";
        if (await db.SuppressionList.AnyAsync(s => s.Email == to.ToLowerInvariant()))
        {
            await UpsertLog(idem, to, "receipt", "suppressed", null);
            return;
        }

        using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails")
        {
            Content = JsonContent.Create(new
            {
                from = cfg["Resend:From"],
                to,
                subject = "Your receipt",                 // no PII
                html = RenderReceipt(amountCents),
                tags = new[] { new { name = "category", value = "receipt" } },
            }),
        };
        req.Headers.Authorization = new("Bearer", cfg["Resend:ApiKey"]);
        req.Headers.Add("Idempotency-Key", idem);

        using var resp = await http.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        var doc = await resp.Content.ReadFromJsonAsync<ResendSendResp>();
        await UpsertLog(idem, to, "receipt", "sent", doc!.Id);
    }
}
```

```csharp
// ResendWebhookEndpoint.cs — ASP.NET Core minimal API, Svix signature verification
app.MapPost("/api/resend/webhook", async (HttpRequest req, AppDb db, IConfiguration cfg) =>
{
    using var reader = new StreamReader(req.Body);
    var body = await reader.ReadToEndAsync();

    // SIGNATURE VERIFICATION — Svix headers, HMAC-SHA256 over svix_id.svix_timestamp.body
    // Header format: "v1,<base64sig> v1,<base64sig2> ..."  (multiple sigs allowed for rotation)
    var svixId = req.Headers["svix-id"].ToString();
    var svixTs = req.Headers["svix-timestamp"].ToString();
    var svixSig = req.Headers["svix-signature"].ToString();
    var secretB64 = cfg["Resend:WebhookSecret"]!;
    if (secretB64.StartsWith("whsec_")) secretB64 = secretB64["whsec_".Length..];

    var signed = $"{svixId}.{svixTs}.{body}";
    using var hmac = new HMACSHA256(Convert.FromBase64String(secretB64));
    var expectedBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(signed));

    var ok = svixSig.Split(' ').Any(token =>
    {
        var parts = token.Split(',', 2);
        if (parts.Length != 2 || parts[0] != "v1") return false;
        byte[] sigBytes;
        try { sigBytes = Convert.FromBase64String(parts[1]); } catch { return false; }
        return CryptographicOperations.FixedTimeEquals(sigBytes, expectedBytes);
    });
    if (!ok) return Results.BadRequest("invalid signature");

    var evt = JsonSerializer.Deserialize<ResendEvent>(body)!;
    var recipient = evt.Data.To[0].ToLowerInvariant();
    if (evt.Type == "email.bounced" && evt.Data.Bounce?.Type == "hard")
        await db.SuppressionList.Upsert(new() { Email = recipient, Reason = "hard_bounce" });
    else if (evt.Type == "email.complained")
        await db.SuppressionList.Upsert(new() { Email = recipient, Reason = "complaint" });

    return Results.Ok();
});
```

### H. SQL — schema for email_log + bounce_log + suppression_list

```sql
-- Every send is logged here, keyed by idempotency_key (deterministic).
-- Webhook updates flip status as the email progresses.
CREATE TABLE email_log (
  id                   BIGSERIAL PRIMARY KEY,
  idempotency_key      TEXT NOT NULL UNIQUE,           -- e.g. 'receipt:in_1ABC' or 'welcome:user_123'
  recipient            TEXT NOT NULL,                  -- lowercased
  template             TEXT NOT NULL,                  -- 'receipt' | 'welcome' | 'dunning' | ...
  status               TEXT NOT NULL,                  -- 'queued'|'sent'|'delivered'|'bounced'|'complained'|'opened'|'clicked'|'suppressed'|'failed'
  provider_message_id  TEXT,                           -- Resend's email id
  subject              TEXT,                           -- for debugging only; no PII
  error                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Hot paths: lookup by idempotency key (already UNIQUE) and by recipient+template for analytics.
CREATE INDEX idx_email_log_recipient_template ON email_log (recipient, template);
CREATE INDEX idx_email_log_status_created    ON email_log (status, created_at DESC);
CREATE INDEX idx_email_log_provider_msg      ON email_log (provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Bounce events get a forensic log separate from email_log so we keep history per address.
CREATE TABLE bounce_log (
  id                   BIGSERIAL PRIMARY KEY,
  provider_message_id  TEXT,
  recipient            TEXT NOT NULL,                  -- lowercased
  bounce_type          TEXT NOT NULL,                  -- 'hard' | 'soft' | 'unknown'
  diagnostic           TEXT,                           -- SMTP diagnostic code/message from provider
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bounce_log_recipient_created ON bounce_log (recipient, created_at DESC);

-- Suppression list: the gate every send checks against. UNIQUE on email = O(1) blocklist.
CREATE TABLE suppression_list (
  email                TEXT PRIMARY KEY,               -- lowercased
  reason               TEXT NOT NULL,                  -- 'hard_bounce' | 'complaint' | 'unsubscribe' | 'manual'
  provider_message_id  TEXT,                           -- the send that triggered suppression
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- (PRIMARY KEY on email already gives the suppression-check index.)

-- Trigger to keep updated_at fresh on email_log
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER email_log_touch BEFORE UPDATE ON email_log
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
```

### I. Trigger points (Next.js SaaS reference)

| Email | Trigger | Source | Idempotency key |
|---|---|---|---|
| Welcome | Clerk `user.created` webhook | `app/api/clerk/webhook/route.ts` | `welcome:<user_id>` |
| Email verification | Clerk handles automatically | (not your code) | (n/a) |
| Password reset | Clerk handles automatically | (not your code) | (n/a) |
| Receipt | Stripe `invoice.paid` webhook | `app/api/stripe/webhook/route.ts` | `receipt:<invoice_id>` |
| Dunning | Stripe `invoice.payment_failed` webhook | `app/api/stripe/webhook/route.ts` | `dunning:<invoice_id>:<attempt>` |
| Plan changed | Stripe `customer.subscription.updated` | `app/api/stripe/webhook/route.ts` | `plan-change:<sub_id>:<version>` |
| Trial ending | Cron (3 days before `trial_end`) | scheduled job (Inngest) | `trial-end:<sub_id>` |

## Domain verification check (CI)

```bash
# Verify SPF, DKIM, DMARC are configured before deploy. Fail closed.
DOMAIN="${1:-send.yourapp.com}"
dig +short TXT "$DOMAIN" | grep -q 'v=spf1' || { echo "missing SPF"; exit 1; }
dig +short CNAME "resend._domainkey.$DOMAIN" || \
  dig +short TXT "resend._domainkey.$DOMAIN" | grep -q 'v=DKIM1' || { echo "missing DKIM"; exit 1; }
dig +short TXT "_dmarc.$DOMAIN" | grep -E 'v=DMARC1.*p=(quarantine|reject)' || { echo "DMARC must be quarantine or reject"; exit 1; }
echo "DNS OK for $DOMAIN"
```

## Tool Integration (2026)

| Tool | Purpose | When |
|------|---------|------|
| **Resend Dashboard → Webhooks** | Configure bounce / complaint / delivered / opened / clicked subscriptions, view delivery analytics, retry failed deliveries | Every project at setup; revisit when adding a new event type |
| **mail-tester.com** | End-to-end deliverability score (SPF/DKIM/DMARC alignment, content red-flags, blacklist hits). Target >= 9/10 | Before production traffic; after any DNS change |
| **MXToolbox** | DNS lookup, blacklist check (Spamhaus, Barracuda, SORBS, etc.), header analyzer | Before production traffic; weekly during warm-up |
| **DMARC aggregate report parser** (Postmark DMARC Digests, Valimail, dmarcian, EasyDMARC) | Parse `rua=` aggregate XML reports to see who's sending from your domain — legit and forged | Continuously once DMARC is live |
| **BIMI** (Brand Indicators for Message Identification) | Display logo next to inbox subject line, requires DMARC `p=quarantine` or `p=reject` + VMC certificate | After 4+ weeks at `p=quarantine` with clean reports |
| **React Email preview** (`npm run email`) | Live local preview of templates across desktop/mobile clients | During template development |
| **Postman / cURL** | One-off transactional test sends from a script (separate from the React Email preview) | Smoke-test webhooks before production |
| **Svix CLI** | Replay webhook events locally; verify signature handling | During webhook handler development |

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|---|---|---|
| CRITICAL | Missing DKIM or DMARC, unsigned bounce webhook, hardcoded API key in repo, no suppression check (sends to known-bounced addresses), no signature verification on webhook | BLOCK |
| HIGH | DMARC at `p=none` >4 weeks past first send, no bounce webhook configured, no idempotency on retry-driven paths (Stripe receipts, cron), PII in subject line, missing `List-Unsubscribe` on marketing | BLOCK |
| MEDIUM | Sending from apex domain, open/click tracking enabled on password reset, no rate-limit per recipient, marketing without double opt-in | Fix soon |
| LOW | mail-tester score 7–8 (room for improvement), `noreply@` sender, no BIMI configured | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+type)[:12]>     # fingerprint for dedup
severity: critical                                    # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                       # high = corroborated by DNS lookup or repo evidence
engine: resend-email | manual
kind: spf-missing | dkim-missing | dmarc-weak | bounce-webhook-missing | complaint-handler-missing |
      no-idempotency | hardcoded-sender | hardcoded-api-key | missing-list-unsubscribe |
      missing-signature-verification | pii-in-subject | no-rate-limit | suppression-bypass
target_file: app/api/resend/webhook/route.ts | dns:_dmarc.send.yourapp.com | ...
line: 42                                              # null if DNS or config-level
suggested_fix: "Add Svix signature verification with constant-time compare; reject on failure."
owasp: A07 | A05 | (n/a)                              # Identification & Authentication Failures / Misconfig
reference: https://resend.com/docs/webhooks/introduction
```

The integrator uses `confidence` to weight findings — a high-confidence finding (e.g., `dig` confirms DMARC is missing) blocks phase advancement. Single-source unverified hits (`confidence: low`) get flagged but don't block alone.

## Sources

- [Resend — Implementing DMARC](https://resend.com/docs/dashboard/domains/dmarc)
- [Resend — Webhooks introduction](https://resend.com/docs/webhooks/introduction)
- [Svix — Verifying webhooks manually (HMAC-SHA256)](https://docs.svix.com/receiving/verifying-payloads/how-manual)
- [Mailtrap — 12 transactional email best practices (2026)](https://mailtrap.io/blog/transactional-emails-best-practices/)
- [Mailgun — Google/Yahoo bulk-sender requirements (2024+)](https://www.mailgun.com/state-of-email-deliverability/chapter/yahoogle-bulk-senders/)
- [dmarcian — Yahoo and Gmail DMARC required](https://dmarcian.com/yahoo-and-google-dmarc-required/)
- [Unboxd — Google, Yahoo & Microsoft bulk-sender requirements (2026 update)](https://unboxd.ai/blog/bulk-sender-requirements.html)
- [React Email](https://react.email/)
- [mail-tester.com (deliverability scoring)](https://www.mail-tester.com/)

---

## Refinement Loop — critic mode (v6.9.15)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every missing-DKIM, missing-DMARC, unsigned-webhook, no-idempotency, suppression-bypass, or PII-leak finding emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a missing DMARC record today is a Gmail-rejected-all-receipts incident tomorrow. Code that ships green-with-warnings ships with known latent failures.
