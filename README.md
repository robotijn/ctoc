# CTOC — CTO Chief

> "We are what we repeatedly do. Excellence, then, is not an act, but a habit."
> — Will Durant

## The Vision: An Army of CTOs

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

**CTOC transforms how AI writes software.** Instead of jumping straight to code, Claude Code follows a disciplined 15-step process: two planning loops followed by autonomous implementation.

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

CTOC is a **methodology for structured thinking and execution**. Whether you're building software, creating documents, or planning business initiatives, CTOC provides the same rigorous approach.

### For Software Development

| Role | What You Do |
|------|-------------|
| **Product Owners / PMs** | Create functional plans: describe *what* to build in plain English |
| **Developers** | Create technical plans: decide *how* to build it |
| **Anyone** | Do both: go from idea to working code in one session |
| **Business Users** | Test and approve completed features |

### For Document Production & Business Planning

CTOC excels at **any work that benefits from structured planning**:

| Use Case | How CTOC Helps |
|----------|----------------|
| **Business Proposals** | Assess audience needs, plan structure, refine arguments, write with consistency |
| **Project Plans** | Define scope, design approach, create detailed timeline, review and approve |
| **Technical Documentation** | Understand requirements, plan sections, write comprehensively, verify accuracy |
| **Reports & Analysis** | Assess data, plan methodology, execute analysis, document findings |
| **Policy Documents** | Understand constraints, plan coverage, draft policies, review for completeness |

### How It Works

The same methodology applies to all work:

1. **Functional Planning**: Define what you want (anyone can do this)
2. **Technical Planning**: Define how to build or write it
3. **Implementation**: CTOC executes autonomously (code, documents, or both)

For **documents**, the Iron Loop adapts:

- **Steps 1-6**: Plan the document structure, audience, and key messages
- **Steps 7-15**: Write, review, refine, and finalize the document

Each planning phase is a loop: **Assess, Plan, Refine**. Repeat until you're satisfied. Then CTOC implements automatically.

### Example: Creating a Business Proposal

```
User: I need to write a proposal for expanding into the EU market

CTOC: Let me help you plan this proposal...

FUNCTIONAL PLANNING:
• Who is the audience? (Board, investors, internal?)
• What decision do you need them to make?
• What are the key arguments?

TECHNICAL PLANNING:
• Document structure and sections
• Required data and supporting evidence
• Tone and formatting standards

IMPLEMENTATION:
• CTOC writes the proposal following your plan
• Self-reviews for consistency and completeness
• Produces a polished, professional document
```

### Real-World Example: Development Session

Here's an excerpt from an actual CTOC development session, showing how the user commanded an "army of CTOs" to transform the system:

```
User: "now use ctoc to test the entire ctoc system, first make a plan
iterate 50 times how to test it and then test it and then make a plan
to improve it and use this example to show how to use ctoc in real life
add this also to readme, then rethink the readme 50 times and improve it
and then commit and push. do not ask me questions during these processes.
then rethink the entire architecture make a plan and criticize it 100 times
go through the entire system but do not change anything just plan in this
last loop and defer all questions to the end then ask me all the questions"

User: "in between when you find an error update ctoc and debug it"

User: "then set up a loop to test everything from ctoc, and fix issues,
then commit and push and then reinstall or update ctoc, test everything,
fix issues commit and push etc etc. do this 100 times every time make a
patch version upgrade so vx.y.z becomes vx.y.z+1"

User: "good luck"
```

**What happened:** CTOC autonomously:
1. Created a comprehensive test plan with 200+ test cases
2. Ran 100 test-fix-commit iterations (v1.5.0 → v1.5.100)
3. Fixed 9 real bugs found during testing:
   - Version header inconsistency
   - Missing script dependencies (research.sh, file-lock.sh)
   - jq query compatibility issues
   - Secrets detection false positives
   - Exit code handling for warnings
   - Error messages for missing plans
4. Validated all 16 core commands
5. Pushed 100+ commits to the repository

**Total commands from user:** 4 messages. **Total work completed:** 100 iterations of testing, debugging, and deployment.

*This is what "commanding an army of CTOs" looks like.*

---

## Quick Start

### Prerequisites

1. A project directory (code project, document folder, or empty)
2. Git initialized (run `git init` if new)
3. Claude Code installed (run `npm install -g @anthropic-ai/claude-code`)

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
CTOC v1.3.0 installed successfully!
═══════════════════════════════════════════════════════════════

Files created/updated:
  • CLAUDE.md          - CTO instructions (smart-merged)
  • plans/             - Plan management (git-tracked)
  • .ctoc/             - Skills library (261 skills available)

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

Yes. Here's why:

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

### Step 3: Start Using CTOC

Once Claude Code is open, type:

```
ctoc
```

CTOC will show your project status and options:

```
CTOC

Functional Plans: 0
Technical Plans:  0
Ready to Build:   0
In Progress:      None

What would you like to do?

[1] Functional plan - Define what to build
[2] Technical plan  - Define how to build it
[3] Full plan       - Both functional and technical
[4] Implement       - Build a ready feature
[5] Status          - View all plans
```

Or just talk naturally:
- *"I need a login system"*
- *"Help me write a project proposal"*
- *"Let's plan the documentation"*

---

## The Iron Loop

> "Quality is not negotiable"

The Iron Loop is a **15-step methodology**: two planning loops (6 steps) followed by autonomous implementation (9 steps).

### Overview

| Phase | Steps | Who | Description |
|-------|-------|-----|-------------|
| **Functional Planning** | 1-3 | Anyone | Define what to build |
| **Technical Planning** | 4-6 | Developer | Define how to build it |
| **Implementation** | 7-15 | CTOC | Build, test, secure, ship |

---

### Loop 1: Functional Planning (Steps 1-3)

Define what you want. Repeat until the spec is solid.

| Step | Action | Description |
|:----:|--------|-------------|
| **1** | **ASSESS** | Understand the business need. Who benefits? What problem does it solve? |
| **2** | **PLAN** | Create functional specification. What should users be able to do? |
| **3** | **REFINE** | Improve the plan. Add missing details. Loop back to Step 1 if needed. |

> POs/PMs can stop here and hand off the functional spec to developers.

---

### Loop 2: Technical Planning (Steps 4-6)

Define how to build it. Repeat until the approach is solid.

| Step | Action | Description |
|:----:|--------|-------------|
| **4** | **ASSESS** | Evaluate technical requirements. What's the complexity? What are the risks? |
| **5** | **PLAN** | Create technical design. Database, APIs, architecture, files to create. |
| **6** | **REFINE** | Improve the approach. Consider edge cases. Loop back to Step 4 if needed. |

> After Step 6, you can leave. CTOC implements autonomously.

---

### Implementation (Steps 7-15)

CTOC works autonomously. You can leave.

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

| Step | If Skipped |
|------|------------|
| Assess (functional) | Build something nobody wants |
| Plan (functional) | Unclear requirements |
| Refine (functional) | Missing edge cases |
| Assess (technical) | Underestimate complexity |
| Plan (technical) | Chaotic implementation |
| Refine (technical) | Poor architecture |
| Test | Unknown if it works |
| Quality | Technical debt |
| Implement | Nothing to ship |
| Review | Maintainability issues |
| Optimize | Slow application |
| Secure | Vulnerabilities |
| Document | Others cannot maintain it |
| Verify | Regressions |
| Commit | Lost progress |

---

## Planning Features

Type `ctoc` to see your options:

### Option 1: Functional Plan

Define what to build. No technical knowledge needed.

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

Define how to build it. Pick an existing functional plan or start fresh.

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

Go from idea to implementation plan in one session. CTOC handles functional planning, then immediately moves to technical planning.

```
User: ctoc
> [3] Full plan

User: I need user authentication

CTOC: [Functional planning loop...]
      [Technical planning loop...]

Both plans complete. Ready to implement.
```

### Option 4: Implement

Build a feature that has both functional and technical plans ready.

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

Close the loop between development and business.

### For Business Users

No technical knowledge needed. Go to your app's review page:

```
https://yourapp.com/review
```

You'll see a simple interface:

| Feature | Status | Action |
|---------|--------|--------|
| User Authentication | Ready for Review | **[Start Testing]** |
| Order Tracking | In Development | — |

#### Testing a Feature

Click **Start Testing** and the feature is enabled for your account only.

Test checklist example:

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

Example: You approved with changes:

> "Works great! Just show the password rules upfront instead of after failure."

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

You do not need commands. Just chat naturally and CTOC understands.

But if you prefer shortcuts:

### Basic Commands

| Command | What it does |
|---------|--------------|
| `ctoc` | Show status and menu |
| `ctoc f` | Start functional planning |
| `ctoc t` | Start technical planning |
| `ctoc i` | Implement a ready feature |

### Plan Commands

Plans live in `plans/` at the project root (git-tracked) with naming like `2026-01-27-001-auth-login.md`.

| Command | What it does |
|---------|--------------|
| `ctoc plan new <title> [module]` | Create functional plan in `functional/draft/` |
| `ctoc plan propose <id>` | Submit for approval |
| `ctoc plan approve <id>` | Approve functional plan |
| `ctoc plan implement <id>` | Create implementation plan |
| `ctoc plan start <id>` | Inject Iron Loop, move to `todo/` |
| `ctoc plan claim <id>` | Claim from `todo/` (git-atomic lock) |
| `ctoc plan complete <id>` | Move to `review/` |
| `ctoc plan accept <id>` | Accept and move to `done/` |
| `ctoc plan reject <id> [msg]` | Return with feedback |
| `ctoc plan abandon <id>` | Release claimed plan |
| `ctoc plan list [stage]` | List plans by stage |
| `ctoc plan status` | Show plan dashboard |
| `ctoc plan show <id>` | Show plan details |

**Plan Lifecycle:**
```
functional/draft/ → functional/approved/ → implementation/draft/ →
implementation/approved/ → todo/ → in_progress/ → review/ → done/
```

### Progress Commands

| Command | What it does |
|---------|--------------|
| `ctoc progress` | Quick Iron Loop progress view |
| `ctoc dashboard` | Full progress dashboard |
| `ctoc progress step <n>` | Move to Iron Loop step n |
| `ctoc progress complete <n>` | Complete step and advance |

### Git Workflow Commands

| Command | What it does |
|---------|--------------|
| `ctoc sync` | Pull-rebase-push workflow |
| `ctoc commit "message"` | Validated commit with Co-Author |
| `ctoc qc "message"` | Quick commit and push |
| `ctoc status` | Enhanced git status |

### File Lock Commands

| Command | What it does |
|---------|--------------|
| `ctoc lock check [files]` | Check file freshness |
| `ctoc lock resolve [file]` | Smart conflict resolution |
| `ctoc lock setup-rerere` | Enable git rerere globally |
| `ctoc lock worktree new <branch>` | Create parallel workspace |
| `ctoc lock worktree list` | List all worktrees |
| `ctoc lock worktree remove <branch>` | Remove a worktree |

### Skills Commands

| Command | What it does |
|---------|--------------|
| `ctoc skills list` | List all available skills |
| `ctoc skills active` | Show skills for this project |
| `ctoc skills add <name>` | Download and add a skill |
| `ctoc skills search <query>` | Search skills by keyword |
| `ctoc skills sync` | Auto-detect and download skills |
| `ctoc skills info <name>` | Show skill details |
| `ctoc skills feedback <name>` | Suggest skill improvement |

### Research Commands

| Command | What it does |
|---------|--------------|
| `ctoc research status` | Show WebSearch configuration |
| `ctoc research on` | Enable WebSearch (default) |
| `ctoc research off` | Disable WebSearch |
| `ctoc research steps 1,2,5,12` | Customize auto-research steps |

### Update Commands

| Command | What it does |
|---------|--------------|
| `ctoc update` | Update CTOC to latest version |
| `ctoc update check` | Manually check for updates |

CTOC checks for updates once per day and prompts you if a new version is available. Disable with `CTOC_SKIP_UPDATE_CHECK=1`.

### Detection Commands

| Command | What it does |
|---------|--------------|
| `ctoc detect` | Detect technologies in project |
| `ctoc detect languages` | Detect only languages |
| `ctoc detect frameworks` | Detect only frameworks |

---

## Dashboards

| Dashboard | Who | Purpose |
|-----------|-----|---------|
| `ctoc` | Everyone | Plan and build features |
| `/review` | Business users | Test and approve completed features |
| `/admin` | Operations | Analytics, logs, feature flags |

---

## Multi-Language Support

CTOC works with 50 languages and 200 frameworks across 5 categories. It automatically detects your stack and applies industry best practices.

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

CTOC is not a separate program. It is a methodology embedded in your project through `CLAUDE.md`.

### The Mechanism

1. **You install CTOC**: This creates a `.ctoc/` folder and templates
2. **You initialize**: Claude Code generates `CLAUDE.md` with CTOC instructions
3. **You type "ctoc"**: Claude Code reads `CLAUDE.md` and follows the instructions
4. **Claude Code responds**: It checks status, plans features, implements code

The "enforcement" comes from `CLAUDE.md` which tells Claude Code:
- "When user types 'ctoc', check these things..."
- "For all feature implementations, follow the Iron Loop..."
- "Always write tests before implementation..."

Claude Code reads `CLAUDE.md` at the start of every session and follows these instructions.

---

## Git Workflow

CTOC uses a monobranch workflow (trunk-based development) optimized for AI-assisted development.

### The Pattern

```bash
# Before any work
ctoc sync              # Pull-rebase from main

# Work happens...

# Before commit
ctoc lock check        # Verify files are fresh

# Commit
ctoc commit "feat: add login"  # Validated commit + push
```

### Why Monobranch?

1. **Simpler mental model**: No branch juggling
2. **Faster feedback**: Changes hit main immediately
3. **Fewer conflicts**: Small, frequent merges
4. **AI-friendly**: Claude Code works better with linear history

### Handling Conflicts

CTOC uses three layers of protection:

| Layer | Purpose |
|-------|---------|
| **Optimistic Locking** | Check file freshness before editing |
| **Git Rerere** | Remember how you resolved conflicts |
| **Smart Recovery** | AI-assisted conflict resolution |

If conflicts occur:
```bash
ctoc lock resolve      # Interactive resolution
```

---

## WebSearch (Enabled by Default)

CTOC uses WebSearch by default to ensure you get current information and best practices. AI knowledge has cutoffs; web search bridges the gap.

### Auto-Research Steps

WebSearch runs automatically at high-value Iron Loop steps:

| Step | Research Focus | Example Queries |
|------|----------------|-----------------|
| **1. ASSESS** | Problem domain, existing solutions | "{topic} best practices 2026" |
| **2. ALIGN** | Business patterns, UX research | "{topic} UX patterns" |
| **5. DESIGN** | Architecture patterns, scalability | "{topic} architecture patterns" |
| **12. SECURE** | CVE lookup, security advisories | "CVE {dependency} 2026" |

### Configuration

```bash
ctoc research status          # Show current config (default: ON)
ctoc research off             # Disable for offline/confidential work
ctoc research on              # Re-enable WebSearch
ctoc research steps 1,2,5,12  # Customize which steps auto-research
```

Disable for: offline environments, confidential projects, or speed optimization.

---

## Codebase Explorer

During installation, CTOC generates a `PROJECT_MAP.md` file, a quick reference guide for your codebase.

### What's Included

- **Directory structure**: Tree view of your project
- **Key files**: Important files with their purposes
- **Patterns detected**: Auth method, ORM, frameworks, testing
- **Quick search reference**: Where to find common code

This helps both you and Claude Code navigate the codebase faster.

---

## Automatic Updates

CTOC checks for updates once per day and prompts you when a new version is available.

### How It Works

```
╔════════════════════════════════════════════════════════════════╗
║               CTOC Update Available!                           ║
╚════════════════════════════════════════════════════════════════╝

  Current version: 1.1.0
  New version:     1.2.0

  Would you like to update now? [y/N]
```

### Configuration

| Setting | Description |
|---------|-------------|
| **Default** | Checks once per day, prompts if update available |
| **Manual check** | `ctoc update check` |
| **Force update** | `ctoc update` |
| **Disable** | Set `CTOC_SKIP_UPDATE_CHECK=1` environment variable |

Updates are fetched from the official repository and install automatically.

---

## Plan Management

CTOC uses a folder-based lifecycle for managing plans. Plans live at the project root in `plans/` (git-tracked), making them visible to your entire team.

### Folder Structure

```
plans/                           # GIT TRACKED - ROOT LEVEL
├── functional/
│   ├── draft/                   # New feature ideas
│   └── approved/                # Business-approved features
├── implementation/
│   ├── draft/                   # Technical design in progress
│   └── approved/                # Technical design approved
├── todo/                        # Ready to work (Iron Loop injected)
├── in_progress/                 # Currently being worked on
├── review/                      # Awaiting business review
└── done/                        # Completed
```

### Two-Phase Planning

**Phase 1: Functional (What to build)**
- Anyone can create functional plans — no technical knowledge needed
- Describe the user need, not the implementation
- Business stakeholders approve functional plans

**Phase 2: Implementation (How to build)**
- Developers create technical designs from approved functional plans
- Includes architecture, files, APIs, database changes
- When approved, Iron Loop steps 7-15 are automatically injected

### Naming Convention

Plans use date + counter + module + feature format:

```
2026-01-27-001-auth-user_login.md
2026-01-27-002-home_page-footer.md
2026-01-28-001-api-rate_limiting.md
```

### Plan Lifecycle

```
BUSINESS PHASE (What to build)
  functional/draft/ → functional/approved/
                            ↓
TECHNICAL PHASE (How to build)
  implementation/draft/ → implementation/approved/
                                 ↓ (Iron Loop injected)
EXECUTION PHASE (Build it)
  todo/ → in_progress/ → review/ → done/
              ↓
        (reject returns to functional/draft/)
```

### Plan Commands

```bash
# Create plans
ctoc plan new "Add login button" auth    # Creates in functional/draft/

# Lifecycle transitions
ctoc plan propose <id>                   # Submit for approval
ctoc plan approve <id>                   # Approve functional plan
ctoc plan implement <id>                 # Create implementation plan
ctoc plan start <id>                     # Inject Iron Loop, move to todo
ctoc plan claim <id>                     # Claim from todo (git-atomic)
ctoc plan complete <id>                  # Move to review
ctoc plan accept <id>                    # Accept and move to done
ctoc plan reject <id> "feedback"         # Return with feedback

# Status
ctoc plan status                         # Show dashboard
ctoc plan list [stage]                   # List plans by stage
ctoc plan show <id>                      # Show plan details
```

### Concurrent Work (Multiple Claude Instances)

CTOC supports multiple developers working simultaneously using git as the coordination mechanism:

- `claim` uses git push as an atomic lock
- If someone else claims a plan first, your push fails
- Pick a different plan and try again
- No stale locks: everything is visible in git

### Dashboard

```bash
ctoc plan status
```

```
╔══════════════════════════════════════════════════════════════════╗
║                      CTOC Plan Dashboard                         ║
╚══════════════════════════════════════════════════════════════════╝

Plan Statistics:

  functional/draft:       2
  functional/approved:    1
  implementation/draft:   1
  implementation/approved: 2
  todo:                   3
  in_progress:            1
  review:                 1
  done:                  12
  ──────────────────────────
  Total:                  23

Active Work:
[in_progress]
  2026-01-27-001  auth-user_login (claimed by you)

Ready to Claim:
[todo]
  2026-01-26-003  api-rate_limiting
  2026-01-26-004  home_page-footer
  2026-01-27-002  docs-api_reference
```

---

## Parallel Execution

CTOC supports parallel subagent execution for research and analysis tasks.

### Parallelism Formula

```
max(2, CPU_CORES - 4)
```

- 8-core machine → 4 parallel agents
- 16-core machine → 12 parallel agents
- 4-core machine → 2 parallel agents

### Safe vs Unsafe Operations

| Operation | Parallel Safe? | Notes |
|-----------|---------------|-------|
| WebSearch | Yes | No state modification |
| Read/Glob/Grep | Yes | Read-only |
| WebFetch | Yes | External fetch |
| Analysis | Yes | Results can merge |
| Edit/Write | **NO** | Serialize by file |
| Git operations | **NO** | Serialize |

### Research Pattern

When starting a new feature, CTOC launches parallel research:

```
Launch in parallel:
├── Agent 1: WebSearch "official docs {topic}"
├── Agent 2: WebSearch "GitHub implementations {topic}"
├── Agent 3: WebSearch "security considerations {topic}"
├── Agent 4: Grep codebase for existing patterns
└── Agent 5: Read related files

Wait for all → Synthesize → Proceed sequentially
```

---

## File Locking

CTOC uses a hybrid file locking system that combines optimistic locking with git-native conflict resolution.

### Check Before Editing

```bash
ctoc lock check src/auth.py    # Check single file
ctoc lock check                # Check all modified files
```

Output:
```
src/auth.py: Fresh (no changes)
src/login.py: Local changes (safe to commit)
WARNING: src/user.py has been modified on remote!
```

### Git Rerere

CTOC auto-enables git rerere (Reuse Recorded Resolution):

```bash
ctoc lock setup-rerere
```

Once enabled, git remembers how you resolve conflicts and replays those resolutions automatically.

### Parallel Workspaces

For truly parallel work, use git worktrees:

```bash
ctoc lock worktree new feature-auth   # Create workspace
cd .ctoc/worktrees/feature-auth       # Work in isolation
ctoc lock worktree remove feature-auth # Clean up
```

---

## Agent-Powered Automation

CTOC uses 60 specialized agents to automate quality enforcement throughout the Iron Loop. Each agent is an expert in its domain, running at specific steps to ensure nothing is missed.

### The Agent Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      CTO-Chief (Coordinator)                   │
│         Orchestrates agents • Resolves conflicts • Guides      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│   │   Testing   │  │   Quality   │  │  Security   │  ...       │
│   │  9 agents   │  │  8 agents   │  │  5 agents   │            │
│   └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                 │
│   Step 7: TEST     Step 8: QUALITY   Step 12: SECURE           │
│   Step 14: VERIFY  Step 10: REVIEW                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 60 Agents in 16 Categories

| Category | Agents | Purpose |
|----------|--------|---------|
| **Coordinator** | 1 | Orchestrates all agents, resolves conflicts |
| **Testing Writers** | 4 | Write unit, integration, E2E, and property tests |
| **Testing Runners** | 5 | Execute tests, report coverage, mutation testing |
| **Quality** | 8 | Type checking, code review, complexity analysis |
| **Security** | 5 | OWASP scanning, secrets detection, input validation |
| **Specialized** | 11 | Performance, accessibility, database, API contracts |
| **Frontend** | 3 | Visual regression, component testing, bundle analysis |
| **Mobile** | 3 | iOS, Android, React Native validation |
| **Infrastructure** | 4 | Terraform, Kubernetes, Docker, CI/CD |
| **Documentation** | 2 | Auto-update docs, generate changelogs |
| **Compliance** | 3 | GDPR, audit logging, license scanning |
| **Data/ML** | 3 | Data quality, ML model validation |
| **Cost** | 1 | Cloud cost optimization |
| **AI Quality** | 2 | Detect AI hallucinations, review AI-generated code |
| **Dev Experience** | 2 | Onboarding, deprecation warnings |
| **Versioning** | 3 | Breaking changes, feature flags, tech debt |

### Lean Activation

Agents only load when needed. Each Iron Loop step activates specific agents:

| Step | Active Agents |
|------|---------------|
| **7: TEST** | unit-test-writer, integration-test-writer, e2e-test-writer |
| **8: QUALITY** | type-checker, smoke-test-runner, ci-pipeline-checker |
| **10: REVIEW** | code-reviewer, architecture-checker, consistency-checker |
| **11: OPTIMIZE** | performance-profiler, memory-safety-checker, bundle-analyzer |
| **12: SECURE** | security-scanner, secrets-detector, dependency-checker |
| **13: DOCUMENT** | documentation-updater, changelog-generator |
| **14: VERIFY** | unit-test-runner, integration-test-runner, e2e-test-runner |

### Hook System

CTOC uses hooks to enforce quality automatically:

| Hook | When | What It Does |
|------|------|--------------|
| **SessionStart** | Claude Code opens | Detects stack, loads profiles, restores state |
| **PreToolUse** | Before file edits | Validates against CTO profile red lines |
| **PostToolUse** | After file edits | Runs quick quality checks |
| **PreCompact** | Before context compaction | Saves Iron Loop progress |
| **SessionEnd** | Claude Code closes | Persists state to `~/.ctoc/` |

### Profile Injection

When agents run, they receive the relevant CTO profiles for your stack:

```
Project: Python + FastAPI
         ↓
Stack Detection: pyproject.toml, requirements.txt
         ↓
Profile Loading: python.md + fastapi.md
         ↓
Agent: security-scanner
       Receives: Python security checklist + FastAPI auth patterns
```

This means agents enforce language-specific and framework-specific best practices automatically.

### State Persistence

Your progress is saved across sessions:

```
~/.ctoc/
├── sessions/           # Daily session state
├── iron-loop/          # Iron Loop progress per project
└── skills/learned/     # Patterns learned from your usage
```

Close Claude Code, come back tomorrow, and CTOC remembers where you left off.

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

CTOC is designed and tested with Claude Code. Other AI tools might work but are not officially tested.

If you want to try CTOC with another tool:

1. Install CTOC normally
2. Open your AI tool
3. Tell it to read `CLAUDE.md`:
   ```
   Read the CLAUDE.md file in this project. It contains the CTOC
   methodology. When I type "ctoc", follow those instructions.
   ```

Tools that might work: Cursor, OpenCode.ai, Gemini CLI, Aider

Tools with limited support: GitHub Copilot, ChatGPT (no autonomous mode)

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

- Issues: [github.com/robotijn/ctoc/issues](https://github.com/robotijn/ctoc/issues)
- Discussions: [github.com/robotijn/ctoc/discussions](https://github.com/robotijn/ctoc/discussions)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<p align="center">
  <i>"We are what we repeatedly do. Excellence, then, is not an act, but a habit."</i>
  <br>
  — Will Durant
</p>
