# CTOC — CTO Chief

> "We are what we repeatedly do. Excellence, then, is not an act, but a habit."
> — Will Durant

## 🎯 The Vision: An Army of CTOs

**CTOC creates an army of virtual CTOs** — Chief Technology Officers that solve business problems using technology.

### Who Is The CTO Chief?

**You are.**

When you install CTOC, you become the **CTO Chief** — commanding an army of virtual CTOs, each specialized in a different technology domain.

```
                    ┌─────────────────┐
                    │   YOU (User)    │
                    │   CTO Chief     │
                    │                 │
                    │ Aligns Business │
                    │   with Tech     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Python   │  │TypeScript│  │   Rust   │  ...
        │   CTO    │  │   CTO    │  │   CTO    │
        └──────────┘  └──────────┘  └──────────┘
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ FastAPI  │  │ Next.js  │  │  Actix   │
        │ Django   │  │  React   │  │   Axum   │
        │ PyTorch  │  │   Vue    │  │          │
        └──────────┘  └──────────┘  └──────────┘
```

### How It Works

1. **You define the business problem** (what needs to be built)
2. **CTOC's Super CTO** aligns business goals with technical approach
3. **Specialized CTOs** implement using their domain expertise
4. **You review and approve** — the CTO Chief has final say

Each technology CTO:
- Is **adamant** about engineering excellence
- **Refuses to compromise** on quality, security, or maintainability
- Makes technology decisions that **serve your business goals**

**CTOC = CTO Chief** — that's you, commanding your army.

---

**CTOC transforms how AI assistants write software.** Instead of jumping straight to code, Claude Code follows a disciplined 12-step process that professional engineers use.

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

| Role | How CTOC Helps |
|------|----------------|
| **Product Owners** | Define business goals and features in plain English. Plan entire product roadmaps, then hand them to developers for implementation. |
| **Project Managers** | Create comprehensive feature specifications. Iterate on plans with critique until they're ready. Hand off approved plans to development teams. |
| **Developers** | Receive well-defined plans from POs/PMs, or plan features yourself. Implement with best practices enforced automatically through the Iron Loop. |
| **Business Users** | Test completed features and provide feedback through a simple web interface |

### The Planning Handoff

CTOC bridges the gap between business and development:

```
Product Owner / PM                    Developer
       │                                  │
       │  1. ASSESS (business goals)      │
       │  2. PLAN (what, not how)         │
       │  3. CRITIQUE (refine)            │
       │         │                        │
       │    ◄────┼────► (iterate until    │
       │         │       plan is solid)   │
       │         │                        │
       └─────────┼────────────────────────┤
                 │                        │
            Handoff                       │
                 │                        │
                 └────────────────────────┤
                                          │
                         1. ASSESS (technical feasibility)
                         2. PLAN (how to build it)
                         3. CRITIQUE (technical review)
                                │
                           ◄────┼────► (iterate until
                                │       approach is solid)
                                │
                         4-12. IMPLEMENT autonomously
```

**Key insight:** Steps 1-3 always include critique and can be repeated as many times as needed. A Product Owner might do 10 rounds of Assess-Plan-Critique before the specification is ready. A Developer might do another 5 rounds for the technical implementation plan.

---

## The Iron Loop

> *"Quality is not negotiable"*

The Iron Loop is a 12-step process that transforms ideas into production-ready features.

### Overview

| Phase | Steps | Who | What Happens |
|-------|-------|-----|--------------|
| **Planning** | 1-3 | You + Claude | Define what to build, iterate until solid |
| **Implementation** | 4-7 | Claude (autonomous) | Build with TDD, self-review |
| **Completion** | 8-12 | Claude (autonomous) | Optimize, secure, document, ship |

---

### Phase 1: Planning (Steps 1-3)

**Iterative. Repeat until the plan is solid.**

| Step | Action | Description |
|:----:|--------|-------------|
| **1** | **ASSESS** | Understand scope, goals, complexity. Identify risks early. |
| **2** | **PLAN** | Create specification — business-level or technical. |
| **3** | **CRITIQUE** | Challenge the plan. Find gaps. Loop back to Step 1 if needed. |

> **Handoff point:** Product Owners & PMs can stop here and hand off to developers.
> Developers run their own 1-2-3 cycle for the technical implementation.

---

### Phase 2: Implementation (Steps 4-7)

**Claude works autonomously. You can leave.**

| Step | Action | Description |
|:----:|--------|-------------|
| **4** | **TEST** | Write tests first. They must fail. |
| **5** | **QUALITY** | Lint, format, type-check. |
| **6** | **IMPLEMENT** | Write code until tests pass. |
| **7** | **REVIEW** | Self-review. Refactor. |

---

### Phase 3: Completion (Steps 8-12)

**Production-ready quality assurance.**

| Step | Action | Description |
|:----:|--------|-------------|
| **8** | **OPTIMIZE** | Check performance. |
| **9** | **SECURE** | Security & accessibility audit. |
| **10** | **DOCUMENT** | Update all documentation. |
| **11** | **VERIFY** | Run full test suite. |
| **12** | **COMMIT** | Commit with proper message. Create feature flag. |

> **Result:** Feature complete. Ready for business review.

---

### Why These Steps?

| Step | If Skipped... |
|------|---------------|
| Assess | Build the wrong thing |
| Plan | Chaotic implementation |
| Critique | Expensive fixes later |
| Test | Don't know if it works |
| Quality | Technical debt accumulates |
| Implement | Nothing to ship |
| Review | Maintainability issues |
| Optimize | Slow application |
| Secure | Vulnerabilities |
| Document | Others can't maintain it |
| Verify | Regressions slip through |
| Commit | Lost progress |

---

## Quick Start

### Prerequisites

- A code project (new or existing)
- Git initialized (`git init` if new)
- Claude Code installed (`npm install -g @anthropic-ai/claude-code`)

### Step 1: Install CTOC

Open terminal in your project directory:

```bash
curl -sL https://raw.githubusercontent.com/robotijn/ctoc/main/install.sh | bash
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

You'd need to approve hundreds of prompts per feature. The flag allows Claude Code to work autonomously through all 12 Iron Loop steps.

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

After initialization, typing `ctoc` shows your project status:

```
═══════════════════════════════════════════════════════════════
CTOC
═══════════════════════════════════════════════════════════════

✅ ALL CLEAR

No work in progress.
No planned features.
No pending reviews.

Your project is ready!

What would you like to do?

[1] Plan a new feature
[2] View the Kanban board
[3] Check settings
```

---

## Planning Features

### From Business Goals to Implementation

CTOC supports the full journey from business idea to working code. Plans can be:

- **Small:** A single feature ("add a logout button")
- **Large:** An entire product roadmap ("build an e-commerce platform")
- **Business-focused:** What and why (for POs/PMs)
- **Technical:** How to build it (for developers)

Every plan goes through Assess → Plan → Critique, which **repeats until quality standards are met**. There's always critique — it's built into the process, not optional.

### Functional Planning (For Product Owners & PMs)

Anyone can plan features — you don't need to be technical. Describe what you want in plain English. Create comprehensive specifications, then hand them to developers.

```
User: ctoc plan

Claude Code: What would you like to plan?

User: Customers should be able to track their orders

Claude Code: Let me understand what you need.

    Who are these customers?
    > People who bought something from our store
    
    What should they see when tracking?
    > Order status, where the package is, when it arrives
    
    How do they access the tracking?
    > Click a link in their confirmation email, or log in
    
    Should they get updates automatically?
    > Yes, email them when status changes
    
    ───────────────────────────────────────────────────────────
    
    FUNCTIONAL SPECIFICATION: order-tracking
    
    Customers can:
    • View their order status
    • See package location
    • See estimated delivery date
    • Receive email updates on status changes
    
    Access methods:
    • Link in confirmation email (no login required)
    • Account dashboard (login required)
    
    ✓ Plan saved
    
    This is ready for implementation planning.
```

### Implementation Planning (For Developers)

Developers receive functional specs from POs/PMs and add the technical details. They run their own Assess → Plan → Critique cycle for the implementation approach:

```
User: ctoc plan order-tracking --technical

Claude Code: I see the functional spec. Let me plan the implementation.

    DATABASE
    • New table: order_tracking_events
    • Fields: order_id, status, location, timestamp
    
    API ENDPOINTS
    • GET /api/orders/:id/tracking - Get tracking info
    • POST /api/orders/:id/tracking - Add event (internal)
    
    INTEGRATIONS
    • Shipping provider webhook receiver
    • Email service for notifications
    
    FILES TO CREATE
    • src/tracking/models.py
    • src/tracking/routes.py
    • src/tracking/service.py
    • src/tracking/email.py
    • tests/test_tracking.py
    
    Does this approach look right?
```

### Plan As Many Features As You Want

There's no limit. Plan your entire application:

```
User: Let's plan the whole e-commerce platform

Claude Code: Great! We'll plan features one by one.
    
    [Plans user-authentication]
    [Plans product-catalog]
    [Plans shopping-cart]
    [Plans checkout-flow]
    [Plans order-tracking]
    ... (as many as you need)
    
    ═══════════════════════════════════════════════════════════
    
    You've planned 12 features. All saved to .ctoc/plans/features/
    
    Ready to start implementing?
```

---

## Implementing Features

Once features are planned, implement them:

```
User: ctoc implement

Claude Code: Starting implementation: user-authentication

    Step 1: ASSESS ✅
    Step 2: PLAN ✅
    Step 3: CRITIQUE ✅
    
    ════════════════════════════════════════════════════════
    You can leave now. I'll work through the remaining steps.
    Come back anytime to check progress.
    ════════════════════════════════════════════════════════
    
    Step 4: TEST 🔨 Writing tests...
```

Claude Code works through all 12 steps autonomously. When complete:

```
═══════════════════════════════════════════════════════════════
IMPLEMENTATION COMPLETE: user-authentication
═══════════════════════════════════════════════════════════════

✅ All 12 Iron Loop steps completed

Results:
• Files created: 8
• Tests: 24 passing
• Coverage: 94%
• Security: All checks passed

Feature flag created: user_authentication
Status: OFF (pending business review)

The feature is ready for testing at /review
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

Here's a full example of building user authentication with CTOC:

```
User: ctoc plan

Claude Code: What would you like to plan?

User: I need user authentication with login, signup, and password reset

Claude Code: ═══════════════════════════════════════════════════════════════
    PLANNING: user-authentication
    ═══════════════════════════════════════════════════════════════
    
    Step 1: ASSESS
    ───────────────────────────────────────────────────────────────
    
    This is a medium-complexity feature involving:
    • User data storage
    • Password security (hashing, validation)
    • Session management
    • Email sending (for password reset)
    
    Risks to mitigate:
    • SQL injection
    • Password exposure
    • Session hijacking
    • Brute force attacks
    
    Step 2: PLAN
    ───────────────────────────────────────────────────────────────
    
    I'll create:
    • User model with hashed passwords (bcrypt)
    • Signup with email validation
    • Login with rate limiting
    • Session management with secure cookies
    • Password reset via email link
    
    Files:
    • src/auth/models.py
    • src/auth/routes.py
    • src/auth/service.py
    • src/auth/security.py
    • tests/test_auth.py
    
    Step 3: CRITIQUE
    ───────────────────────────────────────────────────────────────
    
    Reviewing my plan...
    
    Issue 1: Missing CSRF protection → Added
    Issue 2: No account lockout after failures → Added (5 attempts)
    Issue 3: Password requirements not specified → Added policy
    
    Plan approved after 3 critique rounds.
    
    Ready to implement? [Y/n]

User: Y

Claude Code: Starting autonomous implementation...

    Step 4: TEST
    ───────────────────────────────────────────────────────────────
    Writing tests first (they should fail)...
    
    ✓ test_signup_success
    ✓ test_signup_duplicate_email  
    ✓ test_signup_weak_password
    ✓ test_login_success
    ✓ test_login_wrong_password
    ✓ test_login_rate_limit
    ✓ test_password_reset_request
    ✓ test_password_reset_complete
    
    8 tests written, all failing (as expected)
    
    Step 5: QUALITY
    ───────────────────────────────────────────────────────────────
    Running quality checks...
    
    ✓ Lint: 0 errors
    ✓ Format: OK
    ✓ Types: OK
    
    Step 6: IMPLEMENT
    ───────────────────────────────────────────────────────────────
    Writing code...
    
    Creating src/auth/models.py...
    Creating src/auth/security.py...
    Creating src/auth/service.py...
    Creating src/auth/routes.py...
    
    Running tests...
    ✓ 8/8 tests passing
    
    Step 7: REVIEW
    ───────────────────────────────────────────────────────────────
    Self-reviewing code...
    
    ✓ No code smells detected
    ✓ Functions are appropriately sized
    ✓ Naming is clear
    
    Step 8: OPTIMIZE
    ───────────────────────────────────────────────────────────────
    Checking performance...
    
    ✓ Database queries optimized
    ✓ Index recommended for user.email (added)
    
    Step 9: SECURE
    ───────────────────────────────────────────────────────────────
    Running security audit...
    
    ✓ No vulnerabilities found
    ✓ Passwords properly hashed (bcrypt)
    ✓ SQL injection protected (parameterized queries)
    ✓ CSRF tokens implemented
    ✓ Rate limiting active
    
    Step 10: DOCUMENT
    ───────────────────────────────────────────────────────────────
    Updating documentation...
    
    ✓ API documentation updated
    ✓ README updated
    ✓ Code comments added
    
    Step 11: VERIFY
    ───────────────────────────────────────────────────────────────
    Running full test suite...
    
    ✓ 8 auth tests passing
    ✓ 42 existing tests still passing
    ✓ Coverage: 94%
    
    Step 12: COMMIT
    ───────────────────────────────────────────────────────────────
    
    ✓ Committed: "feat(auth): Add user authentication system"
    ✓ Feature flag created: user_authentication
    
    ═══════════════════════════════════════════════════════════════
    IMPLEMENTATION COMPLETE
    ═══════════════════════════════════════════════════════════════
    
    User authentication is ready for business review.
    
    Go to /review to test and approve.
```

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `ctoc` | Smart status check with recommended action |
| `ctoc plan` | Plan a new feature |
| `ctoc plan list` | See all planned features |
| `ctoc plan [name]` | View a specific plan |
| `ctoc implement` | Implement the next planned feature |
| `ctoc implement [name]` | Implement a specific feature |
| `ctoc dashboard` | View Kanban board and Iron Loop progress |
| `ctoc status` | Detailed project status |
| `ctoc help` | Show all commands |

---

## Dashboards

| Dashboard | Access | Users | Purpose |
|-----------|--------|-------|---------|
| `ctoc` | Type in Claude Code | Developers, PMs | Status, planning, implementing |
| `ctoc dashboard` | Type in Claude Code | Developers | Kanban board, Iron Loop progress |
| `/review` | Web browser | Business users | Test & approve features |
| `/admin` | Web browser | Operations | Analytics, errors, logs, flags |

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
