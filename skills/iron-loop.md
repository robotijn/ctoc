# Iron Loop Methodology

The Iron Loop is CTOC's 15-step methodology for quality software delivery.

## Overview

```
PHASE 1: FUNCTIONAL PLANNING (Steps 1-3)
─────────────────────────────────────────
1. ASSESS    - Understand the problem
2. ALIGN     - Business alignment
3. CAPTURE   - Requirements as specs
   └─► GATE 1: User approves functional plan

PHASE 2: TECHNICAL PLANNING (Steps 4-6)
─────────────────────────────────────────
4. PLAN      - Technical approach
5. DESIGN    - Architecture decisions
6. SPEC      - Detailed specifications
   └─► GATE 2: User approves technical plan

PHASE 3: IMPLEMENTATION (Steps 7-10)
─────────────────────────────────────────
7. TEST      - Write tests first (TDD Red)
8. QUALITY   - Lint, format, type-check
9. IMPLEMENT - Write code (TDD Green)
10. REVIEW   - Self-review

PHASE 4: DELIVERY (Steps 11-15)
─────────────────────────────────────────
11. OPTIMIZE  - Performance tuning
12. SECURE    - Security audit
13. DOCUMENT  - Update documentation
14. VERIFY    - Run full test suite
15. COMMIT    - Ship with confidence
    └─► GATE 3: User approves commit
```

## Step Details

### Phase 1: Functional Planning

#### Step 1: ASSESS
- What business problem are we solving?
- Who is affected?
- What does success look like?
- What are the constraints?

#### Step 2: ALIGN
- How does this serve the user?
- What's the ROI?
- What are the priorities?
- What can we defer?

#### Step 3: CAPTURE
- User stories (As a... I want... So that...)
- Acceptance criteria
- Edge cases
- Definition of done

### Phase 2: Technical Planning

#### Step 4: PLAN
- Which components are affected?
- What's the implementation order?
- What are the dependencies?
- What's the rollback strategy?

#### Step 5: DESIGN
- Architecture decisions
- Data models
- API contracts
- Integration points

#### Step 6: SPEC
- Detailed specifications
- Test scenarios
- Performance requirements
- Security requirements

### Phase 3: Implementation

#### Step 7: TEST
- Write failing tests first (TDD Red)
- Cover happy path
- Cover edge cases
- Cover error cases

#### Step 8: QUALITY
- Run linter
- Run formatter
- Run type checker
- Fix all issues

#### Step 9: IMPLEMENT
- Write minimal code to pass tests (TDD Green)
- Follow existing patterns
- Keep it simple
- Refactor as needed

#### Step 10: REVIEW
- Self-review against CTO standards
- Check for security issues
- Check for performance issues
- Check for maintainability

### Phase 4: Delivery

#### Step 11: OPTIMIZE
- Profile performance
- Optimize hot paths
- Remove unnecessary complexity
- Simplify code

#### Step 12: SECURE
- OWASP Top 10 check
- Input validation
- Authentication/Authorization
- No secrets in code

#### Step 13: DOCUMENT
- Update README if needed
- Update API docs
- Add code comments where necessary
- Update changelog

#### Step 14: VERIFY
- Run full test suite
- Check coverage
- Integration tests pass
- No regressions

#### Step 15: COMMIT
- Write clear commit message
- Include ticket/issue reference
- Sign-off on quality
- Push with confidence

## Gates

### Gate 1 (After Step 3)
User must explicitly approve the functional plan before technical planning begins.

**Trigger phrase**: "Approve functional plan" or similar confirmation

### Gate 2 (After Step 6)
User must explicitly approve the technical plan before implementation begins.

**Trigger phrase**: "Approve technical plan" or similar confirmation

### Gate 3 (After Step 15)
User must explicitly approve the commit/push.

**Trigger phrase**: "Commit" or "Push" or similar confirmation

## Enforcement

The Iron Loop is cryptographically enforced:

- **Edit/Write blocked** before Step 7
- **Git commit blocked** before Step 14
- **State is signed** with HMAC-SHA256
- **No escape phrases** in v4.0

This ensures quality by making the right path the easy path.
