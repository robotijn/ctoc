# CTOC — CTO Chief

> "We are what we repeatedly do. Excellence, then, is not an act, but a habit."
> — Will Durant

## 🎯 The Vision: An Army of CTOs

**CTOC creates an army of virtual CTOs** — Chief Technology Officers that solve business problems using technology.

### Who Is The CTO Chief?

**You are.**

When you install CTOC, you become the **CTO Chief** — commanding an army of virtual CTOs, each specialized in a different technology domain.

```
                              Y O U
                          CTO  Chief
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
            ▼                  ▼                  ▼
      ┌──────────┐      ┌──────────┐      ┌──────────┐
      │  Python  │      │TypeScript│      │   Rust   │  ...50 more
      │   CTO    │      │   CTO    │      │   CTO    │
      └────┬─────┘      └────┬─────┘      └────┬─────┘
           │                 │                 │
     ┌─────┼─────┐     ┌─────┼─────┐     ┌─────┼─────┐
     │     │     │     │     │     │     │     │     │
  FastAPI  │  PyTorch  │   React   │  Actix   │  Rocket
        Django      Next.js     Vue       Axum
                                                    ...200 total
```

**50 languages. 200 frameworks. One methodology.**

Each CTO is adamant about quality — no shipping without tests, security, and docs.

---

**CTOC transforms how AI assistants write software.** Instead of jumping straight to code, Claude Code follows a disciplined 15-step process: two planning loops followed by autonomous implementation.

### Just Chat

You don't need to learn commands. Just talk naturally:

- *"I need a login system"*
- *"Let's plan the checkout flow"*
- *"Build the order tracking feature"*

CTOC understands what you want and guides you through the process. Commands like `ctoc` are just shortcuts for faster interaction — you never have to use them.

---

## The Problem

Ask an AI to "build a login system" and you typically get:
- Code that works (maybe)
- No tests
- No security review
- No documentation
- Inconsistent quality

## The Solution

With CTOC, the same request produces:
- Planned architecture
- Comprehensive tests (written first)
- Security-audited code
- Updated documentation
- Consistent, production-ready quality

---

## Who Is This For?

| Role | What You Do |
|------|-------------|
| **Product Owners / PMs** | Create functional plans — describe *what* to build in plain English |
| **Developers** | Create technical plans — decide *how* to build it |
| **Anyone** | Do both — go from idea to working code in one session |
| **Business Users** | Test and approve completed features |

### How It Works

1. **Functional Planning** — Define what you want (anyone can do this)
2. **Technical Planning** — Define how to build it (developers)
3. **Implementation** — CTOC builds it autonomously

Each planning phase is a loop: **Assess → Plan → Refine**. Repeat until you're happy. Then CTOC implements automatically.

---

## The Iron Loop

> *"Quality is not negotiable"*

The Iron Loop is a **15-step process**: two planning loops (6 steps) followed by autonomous implementation (9 steps).

### Overview

| Phase | Steps | Who | Description |
|-------|-------|-----|-------------|
| **Functional Planning** | 1-3 | Anyone | Define *what* to build |
| **Technical Planning** | 4-6 | Developer | Define *how* to build it |
| **Implementation** | 7-15 | CTOC (autonomous) | Build, test, secure, ship |

---

### Loop 1: Functional Planning (Steps 1-3)

**Define what you want. Repeat until the spec is solid.**

| Step | Action | Description |
|:----:|--------|-------------|
| **1** | **ASSESS** | Understand the business need. Who benefits? What problem does it solve? |
| **2** | **PLAN** | Create functional specification. What should users be able to do? |
| **3** | **REFINE** | Improve the plan. Add missing details. Loop back to Step 1 if needed. |

> POs/PMs can stop here and hand off the functional spec to developers.

---

### Loop 2: Technical Planning (Steps 4-6)

**Define how to build it. Repeat until the approach is solid.**

| Step | Action | Description |
|:----:|--------|-------------|
| **4** | **ASSESS** | Evaluate technical requirements. What's the complexity? What are the risks? |
| **5** | **PLAN** | Create technical design. Database, APIs, architecture, files to create. |
| **6** | **REFINE** | Improve the approach. Consider edge cases. Loop back to Step 4 if needed. |

> After Step 6, you can leave. CTOC implements autonomously.

---

### Implementation (Steps 7-15)

**CTOC works autonomously. You can leave.**

| Step | Action | Description |
|:----:|--------|-------------|
| **7** | **TEST** | Write tests first. They must fail. |
| **8** | **QUALITY** | Lint, format, type-check. |
| **9** | **IMPLEMENT** | Write code until tests pass. |
| **10** | **REVIEW** | Self-review. Refactor. |
| **11** | **OPTIMIZE** | Check performance. |
| **12** | **SECURE** | Security & accessibility audit. |
| **13** | **DOCUMENT** | Update all documentation. |
| **14** | **VERIFY** | Run full test suite. |
| **15** | **COMMIT** | Commit with proper message. Create feature flag. |

> **Result:** Feature complete. Ready for business review.

---

### Why These Steps?

| Step | If Skipped... |
|------|---------------|
| Assess (functional) | Build something nobody wants |
| Plan (functional) | Unclear requirements |
| Refine (functional) | Missing edge cases |
| Assess (technical) | Underestimate complexity |
| Plan (technical) | Chaotic implementation |
| Refine (technical) | Poor architecture |
| Test | Don't know if it works |
| Quality | Technical debt |
| Implement | Nothing to ship |
| Review | Maintainability issues |
| Optimize | Slow application |
| Secure | Vulnerabilities |
| Document | Others can't maintain it |
| Verify | Regressions |
| Commit | Lost progress |

---

## Quick Start

### Prerequisites

- A code project (new or existing)
- Git initialized (`git init` if new)
- Claude Code installed (`npm install -g @anthropic-ai/claude-code`)

### Step 1: Install CTOC

Open terminal in your project directory:

**macOS / Linux:**
```bash
curl -sL https://raw.githubusercontent.com/robotijn/ctoc/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/robotijn/ctoc/main/install.ps1 | iex
```

You should see:

```
═══════════════════════════════════════════════════════════════
CTOC Installer
═══════════════════════════════════════════════════════════════

✓ Created .ctoc/
✓ Downloaded templates
✓ Detected: Python, TypeScript

═══════════════════════════════════════════════════════════════
CTOC Prepared!
═══════════════════════════════════════════════════════════════

Next steps:
1. Open Claude Code with: claude --dangerously-skip-permissions
2. Type: ctoc
```

### Step 2: Start Claude Code

**Important:** Use the `--dangerously-skip-permissions` flag:

```bash
claude --dangerously-skip-permissions
```

#### Why This Flag?

Without it, Claude Code asks permission for every file operation:
- "Can I create src/auth/login.py?"
- "Can I modify tests/test_auth.py?"
- "Can I read .ctoc/settings.yaml?"

You'd need to approve hundreds of prompts per feature. The flag allows Claude Code to work autonomously through all 15 Iron Loop steps.

#### Is It Safe?

- Claude Code only operates within your project directory
- It cannot access system files or other directories
- You review all changes via `git diff` before pushing
- CTOC instructions prevent destructive actions

#### Make It Permanent (Optional)

```bash
# Add alias to your shell
echo 'alias claude="claude --dangerously-skip-permissions"' >> ~/.bashrc
source ~/.bashrc

# Now just use:
claude
```

### Step 3: Initialize CTOC

Once Claude Code is open, type:

```
ctoc
```

Since CTOC isn't initialized yet, Claude Code will guide you through setup:

```
═══════════════════════════════════════════════════════════════
CTOC
═══════════════════════════════════════════════════════════════

I don't see CTOC initialized in this project.

Detected:
• Python (FastAPI)
• TypeScript (Next.js)
• Git repository ✓

Would you like me to initialize CTOC?

[Y] Yes, initialize
[N] No
[?] What is CTOC?
```

Type `Y` and answer the configuration questions.

### Step 4: You're Ready!

After initialization, just type `ctoc` to see your project status and options:

```
CTOC

Functional Plans: 0
Technical Plans:  0
Ready to Build:   0
In Progress:      None

What would you like to do?

[1] Functional plan  — Define what to build
[2] Technical plan   — Define how to build it
[3] Full plan        — Both functional and technical
[4] Implement        — Build a ready feature
[5] Status           — View all plans
```

---

## Planning Features

Type `ctoc` and choose what you want to do:

### Option 1: Functional Plan

**Define what to build.** Anyone can do this — no technical knowledge needed.

```
User: ctoc
> [1] Functional plan

User: Customers should be able to track their orders

CTOC: Let me understand what you need...

    Who are the users?
    > People who bought from our store

    What should they see?
    > Order status, package location, delivery date

    How do they access it?
    > Email link or login to their account

FUNCTIONAL PLAN: order-tracking

Users can:
• View order status
• See package location
• See estimated delivery
• Get email updates

Access: Email link (no login) or account dashboard

✓ Saved. Ready for technical planning.
```

### Option 2: Technical Plan

**Define how to build it.** Pick an existing functional plan or start fresh.

```
User: ctoc
> [2] Technical plan
> order-tracking

CTOC: I see the functional spec. Let me plan the implementation...

TECHNICAL PLAN: order-tracking

Database: order_tracking_events table
API: GET/POST /api/orders/:id/tracking
Integration: Shipping webhooks, email service
Files: models.py, routes.py, service.py, email.py

✓ Saved. Ready to implement.
```

### Option 3: Full Plan

**Go from idea to implementation plan in one session.** CTOC does functional planning, then immediately moves to technical planning.

```
User: ctoc
> [3] Full plan

User: I need user authentication

CTOC: [Functional planning loop...]
      [Technical planning loop...]

Both plans complete. Ready to implement.
```

### Option 4: Implement

**Build a feature that has both functional and technical plans.**

```
User: ctoc
> [4] Implement
> order-tracking

CTOC: Starting implementation...
      [Steps 7-15 run autonomously]

✓ Complete. Ready for business review.
```

---

## Implementing Features

Once a feature has both functional and technical plans, implement it:

```
User: ctoc
> [4] Implement
> user-authentication

CTOC: Starting implementation...

You can leave now. I'll work through Steps 7-15.

Step 7:  TEST      ✓ 8 tests written
Step 8:  QUALITY   ✓ Lint, format, types OK
Step 9:  IMPLEMENT ✓ Code complete
Step 10: REVIEW    ✓ Self-reviewed
Step 11: OPTIMIZE  ✓ Performance OK
Step 12: SECURE    ✓ No vulnerabilities
Step 13: DOCUMENT  ✓ Docs updated
Step 14: VERIFY    ✓ All tests pass
Step 15: COMMIT    ✓ Committed

COMPLETE: user-authentication

Files: 8 created
Tests: 24 passing (94% coverage)
Security: All checks passed

Ready for business review at /review
```

---

## Business Review

> Close the loop between development and business.

### For Business Users

**No technical knowledge needed.** Go to your app's review page:

```
https://yourapp.com/review
```

You'll see a simple interface:

| Feature | Status | Action |
|---------|--------|--------|
| User Authentication | Ready for Review | **[Start Testing]** |
| Order Tracking | In Development | — |

#### Testing a Feature

Click **Start Testing** and the feature is enabled *for your account only*.

**Test checklist example:**
- [ ] Create a new account
- [ ] Log out
- [ ] Log back in
- [ ] Reset your password

#### Your Decision

| Decision | When to Use |
|----------|-------------|
| **Approve** | Feature works as expected. Ship it. |
| **Approve with Changes** | Works, but needs minor fixes first. |
| **Reject** | Needs significant rework. |

---

### Feedback Loop

Your feedback flows directly back to developers.

**Example:** You approved with changes:

> *"Works great! Just show the password rules upfront instead of after failure."*

The developer sees this immediately:

```
CTOC: Business feedback received

Feature: user-authentication
Decision: Approved with Changes
From: Sarah Chen (PM)

Issue: Password requirements not shown until failure
Fix: Display requirements before user types

[1] Fix now  [2] Details  [3] Later
```

Claude Code can fix minor issues automatically. The feature goes back for re-testing if needed.

---

## Complete Example

Building user authentication from idea to production:

```
User: ctoc
> [3] Full plan

User: I need user authentication with login, signup, and password reset

CTOC: Starting functional planning...

LOOP 1: FUNCTIONAL PLANNING

Step 1: ASSESS
What problem does this solve?
→ Users need secure access to their accounts

Step 2: PLAN
Users can:
• Create an account with email/password
• Log in and log out
• Reset forgotten password via email

Step 3: REFINE
✓ Added: Email verification on signup
✓ Added: "Remember me" option
Functional plan complete.

LOOP 2: TECHNICAL PLANNING

Step 4: ASSESS
Complexity: Medium
Risks: SQL injection, password exposure, brute force

Step 5: PLAN
• Database: users table with hashed passwords
• Auth: bcrypt + JWT tokens
• Security: Rate limiting, CSRF protection
• Files: models.py, routes.py, service.py, security.py

Step 6: REFINE
✓ Added: Account lockout after 5 failed attempts
✓ Added: Password strength requirements
Technical plan complete.

Ready to implement? [Y/n]

User: Y

IMPLEMENTATION (Steps 7-15)

Step 7:  TEST      ✓ 8 tests written (all failing)
Step 8:  QUALITY   ✓ Lint, format, types OK
Step 9:  IMPLEMENT ✓ Code complete, tests passing
Step 10: REVIEW    ✓ Self-reviewed, refactored
Step 11: OPTIMIZE  ✓ Added index on user.email
Step 12: SECURE    ✓ No vulnerabilities found
Step 13: DOCUMENT  ✓ API docs updated
Step 14: VERIFY    ✓ 50 tests passing, 94% coverage
Step 15: COMMIT    ✓ feat(auth): Add user authentication

COMPLETE: user-authentication
Ready for business review at /review
```

---

## Commands (Optional)

**You don't need commands.** Just chat naturally — CTOC understands.

But if you want shortcuts:

| Type | What it does |
|------|--------------|
| `ctoc` | Show status and menu |
| `ctoc f` | Start functional planning |
| `ctoc t` | Start technical planning |
| `ctoc i` | Implement a ready feature |

---

## Dashboards

| Dashboard | Who | Purpose |
|-----------|-----|---------|
| `ctoc` | Everyone | Plan and build features |
| `/review` | Business users | Test and approve completed features |
| `/admin` | Operations | Analytics, logs, feature flags |

---

## Multi-Language Support

CTOC works with **50 languages** and **200 frameworks across 5 categories**. It automatically detects your stack and applies industry best practices.

### Languages

Python, TypeScript, JavaScript, Go, Rust, Java, C#, PHP, Ruby, Swift, Kotlin, Scala, Elixir, C, C++, Dart, R, Julia, Haskell, Clojure, Assembly, COBOL, Fortran, Groovy, MATLAB, Prolog, Solidity, Terraform, GraphQL, and more.

### Frameworks (200 total)

| Category | Count | Examples |
|----------|-------|----------|
| **Web** | 80 | FastAPI, Django, Flask, Express, NestJS, Spring Boot, Rails, Laravel, Gin, Actix, Phoenix, Next.js, React, Vue, Angular, Svelte, SvelteKit, Nuxt, Remix, Astro |
| **Data** | 50 | Pandas, Spark, dbt, Airflow, Kafka, Flink, Snowflake, BigQuery, Redshift, Databricks |
| **AI/ML** | 40 | PyTorch, TensorFlow, scikit-learn, Hugging Face, LangChain, MLflow, Kubeflow, Ray |
| **Mobile** | 15 | React Native, Flutter, Expo, SwiftUI, Kotlin Multiplatform |
| **DevOps** | 15 | Kubernetes, Docker, Terraform, Ansible, Pulumi, ArgoCD, Jenkins, GitHub Actions |

For each combination, CTOC includes the best practices used by top engineering teams.

---

## How CTOC Works

CTOC isn't a separate program — it's a methodology embedded in your project through `CLAUDE.md`.

### The Mechanism

1. **You install CTOC** — This creates a `.ctoc/` folder and templates
2. **You initialize** — Claude Code generates `CLAUDE.md` with CTOC instructions
3. **You type "ctoc"** — Claude Code reads `CLAUDE.md` and follows the instructions
4. **Claude Code responds** — It checks status, plans features, implements code

The "enforcement" comes from `CLAUDE.md` which tells Claude Code:
- "When user types 'ctoc', check these things..."
- "For all feature implementations, follow the Iron Loop..."
- "Always write tests before implementation..."

Claude Code reads `CLAUDE.md` at the start of every session and follows these instructions.

---

## Troubleshooting

### "Command not found: claude"

Install Claude Code:

```bash
npm install -g @anthropic-ai/claude-code
```

### "Permission denied" errors

Use the required flag:

```bash
claude --dangerously-skip-permissions
```

### "CTOC not initialized"

Run the install script:

```bash
curl -sL https://raw.githubusercontent.com/robotijn/ctoc/main/install.sh | bash
```

Then open Claude Code and type `ctoc`.

### Getting Help

Type in Claude Code:

```
ctoc help
```

Or just ask:

```
I'm stuck with CTOC. Help me understand what's happening.
```

---

## Other AI Tools (Experimental)

CTOC is designed and tested with **Claude Code**. Other AI tools might work but are **not officially tested**.

If you want to try CTOC with another tool:

1. Install CTOC normally
2. Open your AI tool
3. Tell it to read `CLAUDE.md`:
   ```
   Read the CLAUDE.md file in this project. It contains the CTOC
   methodology. When I type "ctoc", follow those instructions.
   ```

**Tools that might work:** Cursor, OpenCode.ai, Gemini CLI, Aider

**Tools with limited support:** GitHub Copilot, ChatGPT (no autonomous mode)

Please share your experience in [GitHub Discussions](https://github.com/robotijn/ctoc/discussions) if you try other tools.

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Ways to Help

- Report bugs
- Suggest features
- Add support for new languages/frameworks
- Improve documentation
- Share your experience

---

## Community

- **Issues:** [github.com/robotijn/ctoc/issues](https://github.com/robotijn/ctoc/issues)
- **Discussions:** [github.com/robotijn/ctoc/discussions](https://github.com/robotijn/ctoc/discussions)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <i>"We are what we repeatedly do. Excellence, then, is not an act, but a habit."</i>
  <br>
  — Will Durant
</p>
