# Vision Advisor Learnings

This file captures patterns and insights that improve the Vision Advisor's questioning strategy.
Based on research from Jobs to Be Done, The Mom Test, Continuous Discovery, and Design Sprints.

## Core Frameworks Applied

### Jobs to Be Done (JTBD)
- Users "hire" products to get a "job" done
- Focus on the progress the user is trying to make
- Jobs are stable over time; solutions change
- Key question: "When [situation], I want to [motivation], so I can [outcome]"

### The Mom Test (Rob Fitzpatrick)
- Don't ask opinions; ask about past behavior
- "Tell me about a time when..." > "Would you use..."
- Facts about the past > predictions about the future
- Watch what they do, not what they say

### Opportunity Solution Tree (Teresa Torres)
- Start with desired outcome (business need)
- Identify opportunities (user needs/pain points)
- Generate solutions for each opportunity
- Test assumptions before building

### Design Sprint Problem Framing (GV)
- Set long-term goal first
- List sprint questions to answer
- Focus on what could go wrong
- Prototype to test, not to ship

## Good Questions That Worked

### Story-Based Opening
- "Tell me about the last time you faced this problem. What was happening?"
  → Reveals real context, triggers, and emotional state
- "Walk me through exactly what you did when [problem] occurred"
  → Uncovers actual workarounds and friction points
- "What were you trying to accomplish when this got in your way?"
  → Connects problem to underlying goal (the "job")

### Workaround Discovery
- "How do you handle this today?"
  → Existing behavior reveals true priority
- "What have you tried before to solve this?"
  → Past effort indicates problem severity
- "What tools or processes do you currently use for this?"
  → Reveals competitive landscape and expectations

### Severity Assessment
- "How often does this happen?"
  → Frequency determines urgency
- "What does it cost you when this happens?"
  → Quantifies pain in their terms
- "What did you have to give up or delay because of this?"
  → Reveals opportunity cost

### Success Definition
- "If this problem disappeared tomorrow, what would be different?"
  → Defines desired outcome in user terms
- "How would you know this was solved?"
  → Establishes measurable success criteria
- "What would you be able to do that you can't do now?"
  → Identifies capability gaps

### Scope Control
- "What's the smallest version that would help you?"
  → Forces MVP thinking
- "What can we explicitly leave out for now?"
  → Defines boundaries early
- "If you could only have one thing, what would it be?"
  → Identifies core value

### Risk Surfacing
- "What could make this fail?"
  → Surfaces hidden concerns
- "What are we assuming that might not be true?"
  → Exposes risky assumptions
- "What do we need to learn before building?"
  → Identifies knowledge gaps

## Patterns to Avoid

### Questioning Anti-Patterns
- ❌ Asking "why" too many times in a row → Feels interrogative
- ❌ Open-ended questions without options → User gets stuck
- ❌ Yes/no questions → Don't reveal thinking
- ❌ Leading questions → Biases the answer
- ❌ "Would you use...?" → Everyone says yes to hypotheticals
- ❌ "Do you think...?" → Opinions are worthless

### Flow Anti-Patterns
- ❌ Jumping to implementation details too early → Misses business context
- ❌ Not narrowing scope quickly enough → Vision stays vague
- ❌ Skipping risk assessment → Creates blind spots
- ❌ Accepting compliments as validation → False positive

### Data Anti-Patterns (Three Types of Bad Data)
1. **Compliments** - "That sounds great!" → Means nothing
2. **Hypothetical fluff** - "I would definitely use that" → Probably won't
3. **Feature requests** - "Can you add X?" → Not necessarily valuable

**Seek instead:** Facts about past behavior and real commitments

## Domain-Specific Insights

### For CLI Tools
- Ask about installation method early (npm, brew, binary, etc.)
  → Impacts distribution and dependency management
- Ask about cross-platform requirements (Windows, macOS, Linux)
  → Major architectural decision
- Ask about configuration approach (flags vs config file vs env vars)
  → Affects user experience and scripting
- Ask about output format (human readable vs machine parseable)
  → Determines if piping to other tools is needed
- Ask about shell integration (completion, aliases)
  → Quality of life feature or core requirement?

### For Web Features
- Ask about auth requirements early
  → Affects architecture, data access, security model
- Ask about mobile/responsive needs
  → Impacts component library and testing approach
- Ask about offline support
  → Major architectural decision (service workers, local storage)
- Ask about browser support matrix
  → Constrains which APIs and features can be used
- Ask about SEO requirements
  → Impacts SSR/SSG decisions

### For API Changes
- Ask about backwards compatibility requirements
  → Determines versioning strategy
- Ask about versioning strategy (path, header, query param)
  → Impacts clients and documentation
- Ask about rate limiting/quotas
  → Infrastructure and billing implications
- Ask about authentication method (API key, OAuth, JWT)
  → Security and developer experience trade-offs
- Ask about documentation needs
  → OpenAPI, examples, SDKs?

### For Data Features
- Ask about data volume expectations
  → Impacts storage, indexing, pagination
- Ask about data retention requirements
  → Legal, storage cost, performance implications
- Ask about privacy/compliance (GDPR, HIPAA, etc.)
  → May require pseudonymization, consent tracking
- Ask about backup/recovery needs
  → RPO/RTO requirements
- Ask about data freshness requirements
  → Real-time vs batch, cache invalidation

### For AI/ML Features
- Ask about training data availability
  → Blocks or enables entire approach
- Ask about accuracy vs latency trade-offs
  → Model selection criteria
- Ask about edge cases and failure modes
  → Graceful degradation strategy
- Ask about human review/override needs
  → Affects workflow design
- Ask about explainability requirements
  → Model choice and output format

## Conversion Triggers

### Signs the Vision is Ready for Conversion
1. ✅ Problem statement is crisp and specific (not vague)
2. ✅ Success criteria are measurable (not "make it better")
3. ✅ Scope has clear boundaries (explicit in/out)
4. ✅ Key risks are identified with mitigations
5. ✅ User can explain it in one sentence
6. ✅ Sprint question is defined
7. ✅ Assumptions are documented with test methods

### Signs the Vision Needs More Exploration
1. ⚠️ "It depends" answers to basic questions
2. ⚠️ Vague success criteria ("make it better", "improve UX")
3. ⚠️ Scope keeps expanding during discussion
4. ⚠️ Can't identify specific target user
5. ⚠️ Multiple competing priorities without ranking
6. ⚠️ No workaround exists (may not be a real problem)
7. ⚠️ User hasn't tried to solve this before (priority unclear)

## Session Management

### Starting a Session
1. Read this learnings file for patterns to apply
2. Check for existing vision documents user might want to continue
3. Set context: "Let's explore your idea through a structured conversation"
4. Start with story-based question: "Tell me about a recent time when..."

### During a Session
1. Auto-save after EVERY answer (never lose work)
2. Use AskUserQuestion for EVERY question (interactive UI)
3. Follow up on vague answers with more specific options
4. Track which phases are complete
5. Offer early conversion if vision becomes clear

### Ending a Session
1. Generate summary in JTBD format
2. Offer conversion, refinement, pause, or restart
3. If insights emerged, offer to update this learnings file
4. If converted, link vision to functional plan

## Continuous Improvement

After each vision session, consider:
- Did any question consistently get vague answers? → Rephrase it
- Did users skip certain questions? → Maybe not valuable
- Did a question unlock great insights? → Document it here
- Did a domain-specific pattern emerge? → Add to insights

This file should grow with each successful vision session.
