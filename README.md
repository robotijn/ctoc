# CTOC — CTO Chief

> "We are what we repeatedly do. Excellence, then, is not an act, but a habit."
> — Will Durant

## The Vision: An Army of AI Agents

**CTOC gives you command of 75+ highly specialized AI agents** — each an expert in their domain, coordinated by a central CTO Chief agent that reports to you.

### Who Is The CTO Chief?

**You are the human CTO Chief** — the commander with final authority. The **cto-chief agent** is your AI counterpart that coordinates the entire agent army on your behalf.

When you install CTOC, you gain command of this agent army. The cto-chief plans work, delegates to specialized agents, and reports results back to you.


```
                              Y O U
                       Human CTO Chief
                              │
                              ▼
                    ┌─────────────────┐
                    │   cto-chief     │
                    │ (AI Coordinator)│
                    └────────┬────────┘
                             │
      ┌──────────────────────┼──────────────────────┐
      │                      │                      │
      ▼                      ▼                      ▼
┌───────────┐         ┌───────────┐         ┌───────────┐
│ PLANNING  │         │IMPLEMENT  │         │SPECIALIST │
│  AGENTS   │         │  AGENTS   │         │  AGENTS   │
│  6 total  │         │  9 total  │         │  60 total │
└───────────┘         └───────────┘         └───────────┘
```

**80 agents. 50 languages. 200 frameworks. 14 quality dimensions.**

Each agent is adamant about quality — no shipping without tests, security, and docs. The implementation-reviewer (final gate) checks ALL 14 quality dimensions before allowing any commit.

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

### How It Works: An Iterative Journey

CTOC doesn't rush to code. Each phase is a **conversation loop** where you refine your thinking together with AI:

**Phase 1: Functional Planning (Steps 1-3)**
↻ Assess → Align → Capture → Review → Refine → Repeat until solid

**Phase 2: Technical Planning (Steps 4-6)**
↻ Plan → Design → Spec → Review → Refine → Repeat until ready

**Phase 3: Implementation (Steps 7-15)**
↻ Test → Code → Review → Optimize → Secure → Verify → Document → Final Review

Each loop continues until you're satisfied. There's no timer, no pressure.
Quality emerges from iteration, not speed.

The same methodology applies to all work:

1. **Functional Planning**: Define what you want (anyone can do this)
2. **Technical Planning**: Define how to build or write it
3. **Implementation**: CTOC executes autonomously (code, documents, or both)

For **code**, the Iron Loop ensures quality through structured phases:

- **Steps 1-6 (Planning)**: Understand the problem, capture requirements, design the architecture. Two review gates ensure the plan is solid before any code is written.
- **Steps 7-15 (Implementation)**: Write tests first (TDD), implement code, self-review, optimize, security scan, verify, document. Each step has a specialized agent.

The implementation-reviewer (Step 15) checks all **14 quality dimensions** before committing. No shortcuts, no exceptions.

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
════════════════════════════════════════════════════════════════════
✓ CTOC v2.0.0 installed successfully!
════════════════════════════════════════════════════════════════════

Summary:
  • Repository: cloned to .ctoc/repo/
  • Agents: 80 available (20 core + 60 specialists)
  • Skills: 261 available (50 languages, 200+ frameworks)
  • Files: CLAUDE.md, IRON_LOOP.md, .ctoc/

Next steps:
1. Open Claude Code with: claude --dangerously-skip-permissions
2. Type: ctoc
```

### Step 2: Start Claude Code

**Important:** Use the `--dangerously-skip-permissions` flag:

```bash
claude --dangerously-skip-permissions
```

#### Inside Claude Code: Enable Bypass Permissions

After starting Claude Code with the flag above, toggle the **Bypass Permissions** setting to ON:

**Quick way:** Press `Shift + Tab` to toggle Bypass Permissions directly.

**Or via settings:**
1. Press `Shift + ?` to open settings (or type `/config`)
2. Find "Bypass Permissions"
3. Toggle to **ON**

This ensures Claude Code can work autonomously through all 15 Iron Loop steps without interruption.

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

CTOC will show your project dashboard and options:

```
+-----------------------------------------------------------------------------+
|  CTOC Dashboard                                                    v2.1.0   |
+-----------------------------------------------------------------------------+
|                                                                             |
|  KANBAN                                                                     |
|  +------------+ +------------+ +------------+ +------------+ +------------+ |
|  | FUNCTIONAL | |IMPLEMENTAT.| | IRON LOOP  | |    IN      | |   FINAL    | |
|  |  PLANNING  | |  PLANNING  | |   READY    | | DEVELOPMENT| |  REVIEW    | |
|  +------------+ +------------+ +------------+ +------------+ +------------+ |
|  | o login    | | o api-auth | | o payments | | > user-mgmt| | * reports  | |
|  |   Aligning | |   Designing| |            | | Implementing| |            | |
|  | o dashboard| |            | |            | |            | |            | |
|  |   Assessing| |            | |            | |            | |            | |
|  +------------+ +------------+ +------------+ +------------+ +------------+ |
|       |              |                                             |        |
|    [HUMAN]        [HUMAN]                                       [HUMAN]     |
|                                                                             |
|  What would you like to do?                                                 |
|                                                                             |
|  [1] Start a new feature  - "I need..."                                     |
|  [2] Continue planning    - Resume in-progress plan          (2 in progress)|
|  [3] Implement ready plan - Build approved feature               (1 ready) |
|  [4] Review ready items   - Approve completed work                (1 ready)|
|  [5] View all plans       - Detailed plan status                            |
|                                                                             |
+-----------------------------------------------------------------------------+

Options are dynamic - they only appear when items are available in the corresponding column.
For example, "Review ready items" only shows when there are items in Final Review.
```

The 5 columns map to the Iron Loop with 3 human gates:

| Column | Steps | What happens | Human Gate |
|--------|-------|--------------|------------|
| **Functional Planning** | 1-3 | Product Owner drafts BDD specs | Yes - After approval |
| **Implementation Planning** | 4-6 | Technical approach and architecture | Yes - After approval |
| **Iron Loop Ready** | - | Plan complete, awaiting execution | - |
| **In Development** | 7-14 | Autonomous implementation | - |
| **Final Review** | 15 | Approve completed work for commit | Yes - Commit/Back |

- **[HUMAN]** markers show where user approval is required
- In Development shows action names (Testing, Implementing, Optimizing, etc.)

Or just talk naturally:
- *"I need a login system"*
- *"Help me write a project proposal"*
- *"Let's plan the documentation"*

---

## Natural Language → Iron Loop

When you say something like "I need a login system", CTOC interprets your intent and automatically begins the Iron Loop:

1. **Interprets**: "Login system" → Feature request
2. **Starts ASSESS**: "Let's understand what you need..."
3. **Guides through**: Each step until planning is complete
4. **Asks all questions upfront**: Before implementation, CTOC gathers all requirements
5. **Implements autonomously**: Only after approval, as a background agent

You don't need to say "start planning" — CTOC recognizes feature requests and guides you through the structured process naturally.

### Intent Detection

CTOC understands what you want:

| What you say | What CTOC does |
|--------------|----------------|
| "I need...", "Build...", "Create...", "Add..." | Start ASSESS (Step 1) |
| "Fix...", "Bug...", "Broken..." | Start ASSESS with bug context |
| "Plan...", "Design...", "How should..." | Start appropriate planning step |
| "Status", "Progress", "Where are we" | Show kanban board |
| "Implement", "Build it", "Start coding" | Begin implementation (if plan approved) |

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

CTOC works autonomously through its agent army. You can leave.

| Step | Action | Agent | Description |
|:----:|--------|-------|-------------|
| **7** | **TEST** | test-maker | Write tests first. They must fail. |
| **8** | **QUALITY** | quality-checker | Lint, format, type-check. |
| **9** | **IMPLEMENT** | implementer | Write code until tests pass. |
| **10** | **REVIEW** | self-reviewer | Self-review. Can loop back to step 7. |
| **11** | **OPTIMIZE** | optimizer | Check performance. |
| **12** | **SECURE** | security-scanner | Security & accessibility audit. |
| **13** | **VERIFY** | verifier | Run full test suite. |
| **14** | **DOCUMENT** | documenter | Update all documentation. |
| **15** | **FINAL-REVIEW** | implementation-reviewer | Review against 14 quality dimensions. Commit when satisfied. |

> **Result:** Feature complete. implementation-reviewer commits only when ALL 14 quality dimensions pass.

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

```

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

### Admin Dashboard

| Command | What it does |
|---------|--------------|
| `ctoc admin` | Interactive admin dashboard (TUI) |
| `ctoc admin agents` | List all agents, status |
| `ctoc admin learnings` | Show pending/approved learnings |
| `ctoc admin stats` | Usage statistics |
| `ctoc admin health` | System health check |

The admin dashboard provides an interactive terminal UI with:
- Navigation via numbers (1-5), arrows + Enter, or letter shortcuts
- Expand all toggle with `[e]`
- Full details view (no truncation when expanded)

### Update Commands

| Command | What it does |
|---------|--------------|
| `ctoc update` | Update CTOC to latest version |
| `ctoc update check` | Manually check for updates |

CTOC checks for updates once per day and prompts you if a new version is available. Disable with `CTOC_SKIP_UPDATE_CHECK=1`.

### MCP Integration (Native Tools)

CTOC can integrate with Claude Code as an MCP server, providing native tools for faster and more reliable operation.

**Benefits:**
- Reduced token usage (~500 tokens saved per dashboard command)
- Faster execution (direct function calls vs. parsing)
- Consistent output (deterministic tool responses)

**Setup:**

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "ctoc": {
      "command": "node",
      "args": ["<path-to-project>/.ctoc/repo/mcp/index.js"]
    }
  }
}
```

Replace `<path-to-project>` with your project's absolute path.

**First-time setup:**

```bash
cd .ctoc/repo/mcp && npm install
```

**Available Tools:**

| Tool | Description |
|------|-------------|
| `ctoc_status` | Quick project status |
| `ctoc_admin` | Full admin dashboard |
| `ctoc_kanban` | Kanban board |
| `ctoc_progress` | Iron Loop progress |
| `ctoc_plan_status` | Plan dashboard |
| `ctoc_doctor` | Health check |
| `ctoc_start` | Start tracking a feature |
| `ctoc_step` | Move to Iron Loop step |

### Detection Commands

| Command | What it does |
|---------|--------------|
| `ctoc detect` | Detect technologies in project |
| `ctoc detect languages` | Detect only languages |
| `ctoc detect frameworks` | Detect only frameworks |

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

### Update Methods

CTOC automatically detects your installation type and uses the appropriate update method:

| Installation Type | Update Method | How to Check |
|-------------------|---------------|--------------|
| **Git clone** | `git pull` | `.ctoc/repo/.git` exists |
| **Tarball/installer** | Download latest tarball | No `.git` directory |

Both methods preserve your user settings (`settings.yaml`) and state files.

Updates are fetched from the official repository (https://github.com/robotijn/ctoc) over HTTPS.

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

### Background Implementation

When you have approved implementation plans queued, CTOC shows a menu at session start:

```
+======================================================================+
|  Background Implementation Settings                                  |
+======================================================================+
|  You have 3 plans queued for implementation.                         |
|                                                                      |
|  How should background implementation proceed?                       |
|                                                                      |
|  [1] Per plan      - Ask permission before each plan                 |
|  [2] Check-in      - Ask permission at intervals (5-180 min)         |
|  [3] Auto-continue - Implement all queued plans without asking       |
|  [S] Skip          - Don't start background implementation now       |
|                                                                      |
|  Check usage: https://claude.ai/settings/usage                       |
+======================================================================+
```

### Settings

Configure background implementation in `.ctoc/settings.json`:

```json
{
  "display": {
    "usage_link_frequency": "daily",
    "step_bar_color": "orange",
    "feature_bar_style": "rainbow"
  },
  "implementation": {
    "mode": "background",
    "permission": "check-in",
    "check_in_interval": 15
  }
}
```

| Setting | Values | Default | Description |
|---------|--------|---------|-------------|
| `display.usage_link_frequency` | `always`, `daily`, `never` | `daily` | How often to show usage link |
| `implementation.mode` | `background`, `foreground` | `background` | Default implementation mode |
| `implementation.permission` | `per-plan`, `check-in`, `auto-continue` | `check-in` | How to request permission |
| `implementation.check_in_interval` | 5-180 (minutes) | 15 | Check-in interval when using check-in mode |

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

**Claude Code IS the runtime.** CTOC v2.0 transforms Claude Code into a coordinated agent system. The CTO Chief commands an army of 80 highly specialized agents, each an expert in their domain.

### The CTO Chief & Agent Army

You are the **CTO Chief** — the human commander. When you invoke CTOC, the **cto-chief agent** (your AI counterpart) coordinates an army of specialized agents to execute your vision with precision.

```
                         Y O U
                     CTO Chief (Human)
                           │
                           ▼
         ┌─────────────────────────────────────┐
         │         cto-chief (opus)            │
         │  • Central coordinator              │
         │  • Learning aggregator              │
         │  • Decision maker                   │
         │  • Reports back to you              │
         └─────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   ┌─────────┐       ┌──────────┐       ┌──────────┐
   │PLANNING │       │IMPLEMENT │       │SPECIALIST│
   │ AGENTS  │       │  AGENTS  │       │  AGENTS  │
   │ 6 total │       │ 14 total │       │ 60 total │
   └─────────┘       └──────────┘       └──────────┘
                          │
                    ┌─────┴─────┐
                    │  WRITING  │
                    │  AGENTS   │
                    │  5 total  │
                    └───────────┘
```

### Core Agent Hierarchy (20 Agents)

The Iron Loop is executed by 20 core agents, coordinated by the cto-chief:

**Planning Phase (Steps 1-6)**
| Agent | Model | Steps | Role |
|-------|-------|-------|------|
| product-owner | opus | 1-3 | Creates BDD specs (user stories + scenarios) |
| functional-reviewer | opus | 3 | Reviews functional plans, approves or returns |
| implementation-planner | opus | 4-6 | Creates technical designs |
| implementation-plan-reviewer | opus | 6 | Reviews technical plans |
| iron-loop-integrator | sonnet | 6 | Injects implementation steps 7-15 |

**Implementation Phase (Steps 7-15)**
| Agent | Model | Steps | Role |
|-------|-------|-------|------|
| test-maker | opus | 7 | Writes tests first (TDD Red) |
| quality-checker | sonnet | 8, 10 | Lint, format, type-check |
| implementer | sonnet | 9 | Writes the code |
| self-reviewer | opus | 10 | Reviews own work, can loop back |
| optimizer | sonnet | 11 | Performance improvements |
| security-scanner | opus | 12 | Security vulnerability check |
| verifier | sonnet | 13 | Runs ALL tests |
| documenter | sonnet | 14 | Updates documentation |
| implementation-reviewer | opus | 15 | Final review against 14 quality dimensions |

**Writing Agents (Document Creation & Reading)**
| Agent | Model | Purpose |
|-------|-------|---------|
| document-planner | haiku | Fast document structure planning |
| pdf-writer | sonnet | Create professional PDF documents |
| docx-writer | sonnet | Create Microsoft Word documents |
| pptx-writer | sonnet | Create PowerPoint presentations |
| document-reader | sonnet | Read/extract content from PDF, DOCX, PPTX |

> **Document Creation Workflow**: Plan (seconds) -> Create (automatic) -> Review -> Iterate
> Dependencies (Python packages) are auto-installed when needed - no setup required.

### Specialist Agent Army (60 Agents)

Beyond the core 20, the cto-chief can invoke 60 specialist agents for deep expertise:

| Category | Agents | Expertise |
|----------|--------|-----------|
| **Testing Writers** | 4 | Unit, integration, E2E, property tests |
| **Testing Runners** | 5 | Execute tests, coverage, mutation testing |
| **Quality** | 8 | Type checking, code review, complexity |
| **Security** | 5 | OWASP, secrets, dependencies, concurrency |
| **Specialized** | 11 | Performance, accessibility, database, APIs |
| **Frontend** | 3 | Visual regression, components, bundles |
| **Mobile** | 3 | iOS, Android, React Native |
| **Infrastructure** | 4 | Terraform, Kubernetes, Docker, CI/CD |
| **Documentation** | 2 | Docs generation, changelogs |
| **Compliance** | 3 | GDPR, audit, licenses |
| **Data/ML** | 3 | Data quality, ML validation |
| **AI Quality** | 2 | Hallucination detection, AI code review |
| **Dev Experience** | 2 | Onboarding, deprecation |
| **Versioning** | 3 | Breaking changes, feature flags, tech debt |

### 14 Quality Dimensions (ISO 25010)

The implementation-reviewer checks ALL 14 dimensions before approving:

| # | Dimension | Key Checks |
|---|-----------|------------|
| 1 | Correctness | Tests meaningful, edge cases, business logic |
| 2 | Completeness | All criteria met, implicit requirements |
| 3 | Maintainability | Patterns, no smells, readable by junior |
| 4 | Security | OWASP, validation, auth/authz |
| 5 | Performance | No N+1, caching, response time |
| 6 | Reliability | Error handling, retries, fault tolerance |
| 7 | Compatibility | API backwards compat, integrations |
| 8 | Usability | Error messages, clear output, docs |
| 9 | Portability | No hardcoded paths, configurable |
| 10 | Testing | 90% coverage, isolation, happy+error paths |
| 11 | Accessibility | WCAG 2.2, screen reader, keyboard |
| 12 | Observability | Logging, metrics, tracing, alerts |
| 13 | Safety | No harm, graceful degradation |
| 14 | Ethics/AI | Bias, fairness, explainability |

### Learning System

CTOC learns from every interaction:

```
.ctoc/learnings/
├── pending/     # Awaiting your review
├── approved/    # You confirmed the learning
├── applied/     # Integrated into agent behavior
└── rejected/    # Not applicable (documented why)
```

- **Dynamic confidence**: Learnings gain confidence when they work, lose it when they don't
- **Re-evaluation**: Every 3 months, on conflicts, or when you request
- **Per-project**: Learnings are git-tracked with your code
- **Exportable**: Transfer learnings to other projects

### Profile Injection

Agents receive language and framework-specific guidance:

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

This means agents enforce best practices specific to YOUR stack automatically.

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
