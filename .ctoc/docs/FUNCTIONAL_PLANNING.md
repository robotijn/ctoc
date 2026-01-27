# Functional Planning Guide

> SaaS-style per-page functional planning documentation.
> Use this guide to structure business requirements before implementation.

---

## Page 1: Dashboard

### Purpose
Central overview showing all planned features, their status, and key metrics.

### User Story
> As a **Product Manager**, I want to see all planned features at a glance so that I can track progress and prioritize work.

### Acceptance Criteria
- [ ] Shows all features with status (Draft, Proposed, Approved, In Progress, Complete)
- [ ] Displays priority level (P0-P3) for each feature
- [ ] Shows owner/assignee for each feature
- [ ] Filters by status, priority, owner
- [ ] Search by feature name or description
- [ ] Shows progress metrics (% complete, items by status)

### Key Metrics
| Metric | Description |
|--------|-------------|
| Total Features | Count of all features in backlog |
| In Progress | Features currently being implemented |
| Blocked | Features waiting on dependencies |
| Velocity | Features completed per sprint |

---

## Page 2: Feature Request

### Purpose
Submit and capture new feature ideas with business context.

### User Story
> As a **Stakeholder**, I want to request new features with clear business justification so that the team understands the value.

### Required Fields
| Field | Type | Description |
|-------|------|-------------|
| Title | Text | Short, descriptive name (max 80 chars) |
| Description | Rich Text | Detailed explanation of the feature |
| Business Value | Select | Revenue, Cost Reduction, User Experience, Compliance |
| Priority | Select | P0 (Critical), P1 (High), P2 (Medium), P3 (Low) |
| Target Users | Multi-select | Who benefits from this feature |
| Success Metrics | Text | How will we measure success? |

### Optional Fields
| Field | Type | Description |
|-------|------|-------------|
| Attachments | File | Mockups, specs, reference docs |
| Related Features | Link | Dependencies or related work |
| Deadline | Date | Target completion date if any |
| Requester | User | Who requested this feature |

### Workflow
```
Draft → Proposed → Under Review → Approved/Rejected
```

---

## Page 3: Requirements Capture

### Purpose
Document detailed requirements, user stories, and acceptance criteria.

### User Story
> As a **Product Owner**, I want to capture complete requirements so that developers understand exactly what to build.

### Sections

#### 3.1 User Stories
Format: `As a [role], I want [feature] so that [benefit]`

| Priority | User Story | Acceptance Criteria |
|----------|------------|---------------------|
| P0 | As a user, I want to... | Given/When/Then... |

#### 3.2 Functional Requirements
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | The system shall... | Must | |
| FR-002 | The system shall... | Should | |

#### 3.3 Non-Functional Requirements
| Category | Requirement | Target |
|----------|-------------|--------|
| Performance | Response time | < 200ms |
| Scalability | Concurrent users | 10,000 |
| Availability | Uptime | 99.9% |
| Security | Data encryption | AES-256 |

#### 3.4 Edge Cases
| Scenario | Expected Behavior | Notes |
|----------|-------------------|-------|
| Empty input | Show validation error | |
| Network failure | Retry with backoff | Max 3 retries |
| Concurrent edit | Last write wins / Merge | Depends on data type |

#### 3.5 Constraints
| Constraint | Description | Impact |
|------------|-------------|--------|
| Technical | Must use existing auth system | Medium |
| Business | GDPR compliance required | High |
| Timeline | Launch before Q2 | High |

---

## Page 4: Review & Approval

### Purpose
Stakeholder review and sign-off process for planned features.

### User Story
> As a **Decision Maker**, I want to review and approve features so that we only build what's valuable and feasible.

### Workflow States

```
┌─────────┐    ┌─────────┐    ┌──────────┐    ┌──────────┐
│  Draft  │───▶│ Review  │───▶│ Approved │───▶│ In Prog  │
└─────────┘    └─────────┘    └──────────┘    └──────────┘
                    │
                    ▼
              ┌──────────┐
              │ Rejected │
              └──────────┘
```

### Review Checklist
| Category | Check | Owner |
|----------|-------|-------|
| Business | Value proposition clear? | PM |
| Business | Success metrics defined? | PM |
| Technical | Feasibility assessed? | Tech Lead |
| Technical | Dependencies identified? | Tech Lead |
| Design | UX requirements clear? | Designer |
| Legal | Compliance requirements? | Legal |

### Approval Matrix
| Feature Size | Required Approvers |
|--------------|-------------------|
| Small (< 1 week) | Tech Lead |
| Medium (1-4 weeks) | Tech Lead + PM |
| Large (> 4 weeks) | Tech Lead + PM + Director |

### Sign-Off Record
| Approver | Role | Date | Decision | Comments |
|----------|------|------|----------|----------|
| | | | Approved/Rejected | |

---

## Quick Reference

### Status Definitions
| Status | Meaning |
|--------|---------|
| **Draft** | Initial capture, incomplete |
| **Proposed** | Ready for review |
| **Under Review** | Being evaluated |
| **Approved** | Ready for implementation |
| **Rejected** | Not moving forward |
| **In Progress** | Being implemented |
| **Complete** | Delivered and verified |

### Priority Levels
| Priority | Response Time | Examples |
|----------|---------------|----------|
| **P0** | Immediate | Security, data loss |
| **P1** | This sprint | Core functionality |
| **P2** | This quarter | Nice-to-have features |
| **P3** | Backlog | Future consideration |

---

## Templates

### Feature Request Template
```markdown
## Feature: [Title]

### Business Value
[Why is this valuable?]

### User Story
As a [role], I want [feature] so that [benefit].

### Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

### Success Metrics
- Metric 1: Target value
- Metric 2: Target value

### Dependencies
- [ ] Dependency 1
- [ ] Dependency 2
```

### Requirements Document Template
```markdown
## Requirements: [Feature Name]

### Overview
[Brief description]

### User Stories
| ID | Story | Priority |
|----|-------|----------|

### Functional Requirements
| ID | Requirement | Priority |
|----|-------------|----------|

### Non-Functional Requirements
| Category | Requirement | Target |
|----------|-------------|--------|

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|

### Constraints
| Type | Description |
|------|-------------|
```

---

*"Start with the why before the what."*
