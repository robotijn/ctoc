# Implementation Planning Guide

> SaaS-style per-page implementation planning documentation.
> Use this guide to translate requirements into technical tasks.

---

## Page 1: Technical Assessment

### Purpose
Evaluate complexity, identify risks, and estimate effort before implementation.

### User Story
> As a **Tech Lead**, I want to assess technical complexity so that I can accurately plan and resource the work.

### Assessment Sections

#### 1.1 Complexity Analysis
| Factor | Rating (1-5) | Notes |
|--------|--------------|-------|
| Code Changes | | Lines of code, files affected |
| Dependencies | | External libraries, services |
| Data Model | | Schema changes, migrations |
| Integration | | APIs, third-party services |
| Testing | | Test complexity, coverage needs |

**Complexity Score:** Sum / 5 = ___ (1-2: Low, 3: Medium, 4-5: High)

#### 1.2 Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance degradation | Low/Med/High | Low/Med/High | Load testing |
| Data migration issues | | | Staged rollout |
| API breaking changes | | | Versioning |
| Security vulnerabilities | | | Security review |

#### 1.3 Dependencies
| Dependency | Type | Status | Owner |
|------------|------|--------|-------|
| Auth service update | Internal | Pending | Team A |
| Database migration | Internal | Complete | DBA |
| Third-party API | External | Stable | Vendor |

#### 1.4 Affected Files
| File/Module | Change Type | Risk Level |
|-------------|-------------|------------|
| `src/auth/` | Modify | Medium |
| `src/api/routes.py` | Add | Low |
| `database/migrations/` | Add | High |

#### 1.5 Effort Estimate
| Component | Estimate | Confidence |
|-----------|----------|------------|
| Backend | X days | High/Med/Low |
| Frontend | X days | |
| Testing | X days | |
| Documentation | X days | |
| **Total** | **X days** | |

---

## Page 2: Architecture Design

### Purpose
Document the technical approach and key design decisions.

### User Story
> As a **Developer**, I want clear architecture documentation so that I can implement the feature correctly.

### Design Sections

#### 2.1 Overview
```
[High-level architecture diagram or description]

┌─────────┐     ┌─────────┐     ┌─────────┐
│ Client  │────▶│   API   │────▶│   DB    │
└─────────┘     └─────────┘     └─────────┘
```

#### 2.2 Design Patterns
| Pattern | Usage | Rationale |
|---------|-------|-----------|
| Repository | Data access | Decouple from ORM |
| Factory | Object creation | Flexible instantiation |
| Observer | Events | Loose coupling |

#### 2.3 Data Models
```
[Entity definitions]

User
├── id: UUID (PK)
├── email: String (unique)
├── created_at: Timestamp
└── updated_at: Timestamp
```

#### 2.4 API Contracts
| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/v1/users` | GET | `?page=1&limit=20` | `{users: [], total: n}` |
| `/api/v1/users` | POST | `{email, name}` | `{id, email, name}` |
| `/api/v1/users/:id` | GET | - | `{id, email, name}` |

#### 2.5 State Management
| State | Location | Persistence |
|-------|----------|-------------|
| User session | Memory/Redis | TTL: 24h |
| Feature flags | Config/DB | Permanent |
| Cache | Redis | TTL: 5min |

#### 2.6 Error Handling
| Error Type | Code | Response | Recovery |
|------------|------|----------|----------|
| Validation | 400 | `{errors: [...]}` | Fix input |
| Auth | 401 | `{error: "..."}` | Re-login |
| Not Found | 404 | `{error: "..."}` | Check ID |
| Server | 500 | `{error: "..."}` | Retry/Report |

---

## Page 3: Task Breakdown

### Purpose
Split the implementation into manageable, trackable tasks.

### User Story
> As a **Developer**, I want clear task breakdown so that I can work incrementally and track progress.

### Task Structure

#### 3.1 Task Template
```markdown
## Task: [ID] - [Title]

**Type:** Feature / Bug / Refactor / Test / Docs
**Priority:** P0 / P1 / P2 / P3
**Estimate:** X hours/days
**Depends On:** [Task IDs]
**Blocks:** [Task IDs]

### Description
[What needs to be done]

### Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

### Technical Notes
[Implementation hints, gotchas]
```

#### 3.2 Task Categories
| Category | Description | Example |
|----------|-------------|---------|
| **Setup** | Project/env setup | Create branch, install deps |
| **Data** | Database/model changes | Migration, schema update |
| **Backend** | Server-side logic | API endpoint, service |
| **Frontend** | Client-side changes | Component, page |
| **Integration** | Connect systems | API calls, webhooks |
| **Test** | Testing tasks | Unit, integration, e2e |
| **Docs** | Documentation | README, API docs |

#### 3.3 Task Dependencies Graph
```
[Setup]
    │
    ▼
[Data Model] ──────┐
    │              │
    ▼              ▼
[Backend API] [Frontend UI]
    │              │
    └──────┬───────┘
           ▼
    [Integration]
           │
           ▼
       [Testing]
           │
           ▼
        [Docs]
```

#### 3.4 Task List Template
| ID | Task | Type | Est. | Depends | Status |
|----|------|------|------|---------|--------|
| T-001 | Create feature branch | Setup | 0.5h | - | Done |
| T-002 | Add database migration | Data | 2h | T-001 | In Progress |
| T-003 | Implement user model | Backend | 4h | T-002 | Blocked |
| T-004 | Create API endpoint | Backend | 4h | T-003 | Pending |
| T-005 | Write unit tests | Test | 3h | T-004 | Pending |
| T-006 | Integration tests | Test | 2h | T-005 | Pending |
| T-007 | Update API docs | Docs | 1h | T-004 | Pending |

---

## Page 4: Code Review Checklist

### Purpose
Ensure code quality before merging.

### User Story
> As a **Reviewer**, I want a comprehensive checklist so that I don't miss important quality criteria.

### Review Sections

#### 4.1 Code Quality
| Check | Status | Notes |
|-------|--------|-------|
| [ ] Code follows style guide | | |
| [ ] No code smells (long methods, deep nesting) | | |
| [ ] DRY - no unnecessary duplication | | |
| [ ] SOLID principles followed | | |
| [ ] Clear naming (variables, functions, classes) | | |
| [ ] Appropriate comments (why, not what) | | |

#### 4.2 Testing
| Check | Status | Notes |
|-------|--------|-------|
| [ ] Unit tests for new code | | |
| [ ] Integration tests for APIs | | |
| [ ] Edge cases covered | | |
| [ ] Tests are deterministic | | |
| [ ] Coverage meets threshold (80%+) | | |
| [ ] No flaky tests | | |

#### 4.3 Security
| Check | Status | Notes |
|-------|--------|-------|
| [ ] No hardcoded secrets | | |
| [ ] Input validation present | | |
| [ ] SQL injection prevented | | |
| [ ] XSS prevented | | |
| [ ] Authentication/authorization correct | | |
| [ ] Sensitive data encrypted | | |

#### 4.4 Performance
| Check | Status | Notes |
|-------|--------|-------|
| [ ] No N+1 queries | | |
| [ ] Appropriate caching | | |
| [ ] No memory leaks | | |
| [ ] Async where beneficial | | |
| [ ] Database indexes used | | |

#### 4.5 Documentation
| Check | Status | Notes |
|-------|--------|-------|
| [ ] API documentation updated | | |
| [ ] README updated if needed | | |
| [ ] CHANGELOG entry added | | |
| [ ] Inline docs for complex logic | | |

#### 4.6 Deployment
| Check | Status | Notes |
|-------|--------|-------|
| [ ] Migrations are reversible | | |
| [ ] Feature flags if needed | | |
| [ ] Environment variables documented | | |
| [ ] No breaking changes (or versioned) | | |
| [ ] Monitoring/alerts configured | | |

---

## Quick Reference

### Estimate Guidelines
| Size | Time | Examples |
|------|------|----------|
| **XS** | < 2 hours | Bug fix, typo, config change |
| **S** | 2-8 hours | Simple feature, small refactor |
| **M** | 1-3 days | Standard feature, API endpoint |
| **L** | 3-5 days | Complex feature, integration |
| **XL** | 1-2 weeks | Major feature, architecture change |

### Definition of Done
- [ ] Code complete and reviewed
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Security review passed
- [ ] Performance acceptable
- [ ] Deployed to staging
- [ ] Stakeholder sign-off

---

## Templates

### Technical Design Document
```markdown
# TDD: [Feature Name]

## Overview
[Brief description of the feature]

## Goals
- Goal 1
- Goal 2

## Non-Goals
- What this doesn't include

## Design

### Architecture
[Diagram or description]

### Data Model
[Schema changes]

### API
[Endpoint definitions]

## Alternatives Considered
| Option | Pros | Cons | Decision |
|--------|------|------|----------|

## Security Considerations
[Security implications]

## Testing Strategy
[How to test]

## Rollout Plan
[Deployment strategy]
```

### Task Ticket Template
```markdown
## [TASK-XXX] [Title]

**Type:** Feature | Bug | Tech Debt
**Priority:** P0 | P1 | P2 | P3
**Estimate:** X hours

### Description
[What needs to be done]

### Acceptance Criteria
- [ ] AC 1
- [ ] AC 2

### Technical Notes
[Implementation details]

### Dependencies
- Blocked by: [tickets]
- Blocks: [tickets]
```

---

*"Plan the work, then work the plan."*
