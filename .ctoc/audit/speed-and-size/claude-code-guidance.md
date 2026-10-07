Point by point, with official documentation:

---

## 1. **Size and structure of skills**

**Best-practice rule on conciseness:**
> "Keep SKILL.md focused; reference detailed materials" and "Keep SKILL.md concise — Move detailed references to supporting files"

**Recommended structure for large skills:**
> "Add Supporting Files: Keep `SKILL.md` focused; reference detailed materials: `my-skill/ ├── SKILL.md (overview, navigation) ├── reference.md (detailed docs) └── examples.md (usage examples)`. In `SKILL.md`: `For complete API details, see [reference.md](reference.md)`"

**What makes content advisory vs. binding:**
> "Keep SKILL.md focused" and "Move rules that must always apply into [hooks](/docs/en/hooks-guide)". Skills load as conversation messages, so mid-session content persists without re-reading; after compaction, recently-invoked skills are auto-loaded, others lost.

**Guidance on description writing:**
> "Keep descriptions specific — Include keywords users would naturally say" and "One task per skill — Avoid multi-purpose skills"

**On progressive disclosure:**
> "Content persists across later turns without re-reading the file" — so detail-heavy supporting files are loaded only when the skill is invoked, not on every session start.

**Maximum depth of references, nesting, and "only what Claude doesn't know":** 
**Not documented** — the docs show a three-level example (`SKILL.md` → `reference.md`, `examples.md`) but do not state a maximum nesting depth or formalize the "only add context Claude doesn't already have" rule.

**Source:** https://code.claude.com/docs/en/skills.md — section "Add Supporting Files" and "Best Practices"

---

## 2. **What a subagent is loaded with at start**

**Official list of what loads:**

> "Each subagent starts with a **fresh, isolated context window** (except for forks). The initial context includes:
> - **System Prompt**: The agent's own prompt from the markdown body or `prompt` field ... Built-in agents have predefined prompts
> - **Task Message**: A delegation prompt Claude writes when handing off the work
> - **CLAUDE.md Files**: Every level of the CLAUDE.md hierarchy ... Includes `~/.claude/CLAUDE.md`, project rules, `CLAUDE.local.md`, and managed policy files. Built-in Explore and Plan agents skip this. Subagents with `omitClaudeMd: true` skip user/project/local files (managed policies still load)
> - **Git Status**: A snapshot from your repository when the subagent starts ... Absent outside Git repositories or when disabled via `includeGitInstructions`. Explore and Plan skip this regardless
> - **Preloaded Skills**: Full content of any skill listed in the agent's `skills` field
> - **Sibling Roster**: System reminder listing `main` and other named agents (v2.1.206+). Only appears when subagent has `SendMessage` tool"

**What does NOT reach subagents:**
> "- **Conversation history** (except in forks)
> - **Output style** from the main conversation
> - **Auto memory** from the main conversation
> - **Context window size** from parent (uses own model's window)
> - **Skills already invoked** in main conversation"

Your observation about 56K tokens on a trivial subagent: that is the cumulative cost of CLAUDE.md (both user and project levels, all hierarchy), git status, the subagent's own prompt, and the delegation message — not the skill list, which loads only if declared.

**Source:** https://code.claude.com/docs/en/sub-agents.md — section "What Loads at Startup" and "What Does NOT Reach Subagents"

---

## 3. **The subagent `skills:` frontmatter field**

**Official definition:**

> "`skills` — Skills to preload into context at startup" (field in the frontmatter reference table)

And:

> "**Preload Skills into Subagents**: Use `context: fork` to isolate skill execution. ... [with example frontmatter showing `skills: [api-conventions, error-handling]`]"

**What it does:** Loads the **full content** of each skill listed, delivered as part of the subagent's initial context (not lazy-loaded). The docs do NOT distinguish between reading the file yourself with Read vs. declaring it in `skills:` in terms of token cost — both preload the full content.

**Comparison with self-reading:** The docs do not formally compare the cost of preloading via `skills:` with a subagent reading the file itself. However, logically both incur the same input token cost since both load the full file into context; the `skills:` mechanism just moves the loading to startup rather than mid-conversation.

**Source:** https://code.claude.com/docs/en/sub-agents.md — "Frontmatter Fields" table and "Run Skills in a Subagent" section

---

## 4. **Prompt caching for subagents**

**Official rule on subagent caching:**

> "A [subagent](/docs/en/sub-agents) starts its own conversation with its own system prompt and tool set, separate from the parent's. Its first request doesn't read the parent's cache, because the two prefixes differ, and it warms a cache of its own across its turns. Subagents fall outside the main-conversation [TTL bucket](#which-ttl-each-request-gets), so they get five minutes even on a subscription until you [choose a longer one](#choose-the-ttl-yourself)."

**Cost implication:** Each subagent's first request reprocesses its full system prompt (the agent body) as uncached input. On repeat dispatches of the same agent, the prefix is cached, so the agent body costs little. A 168 KB agent and a 3 KB one would cost the same on first dispatch (both uncached), but the 168 KB agent has a larger cacheable prefix, so repeats warm a larger cache and subsequent turns pay less. Your observation that they started in "about the same time" aligns with this: first turn is uncached for both; subsequent turns favor the larger agent because more of the prefix is cached.

**Source:** https://code.claude.com/docs/en/prompt-caching.md — section "Subagents and the cache"

---

## 5. **Official guidance on writing effective, concise subagent prompts**

**On system prompt length and adherence trade-off:**

> "Provide specific context in your prompts. The more precise your instructions, the fewer corrections you'll need." and examples showing specificity beats length.

However, the docs do NOT formally quantify the trade-off between a long system prompt and adherence. The best-practices guidance leans on:

> "Keep it concise. For each line, ask: 'Would removing this cause Claude to make mistakes?' If not, cut it. Bloated CLAUDE.md files cause Claude to ignore your actual instructions!" (applied to CLAUDE.md; principle extends to subagent prompts)

> "Provide specific context in your prompts" — point to sources, reference patterns, scope the task, describe symptoms — rather than writing longer prose.

**On subagent-specific instruction quality:**

> "The subagent doesn't see your conversation history — skill instructions must be complete" — so a subagent prompt must be self-contained; it cannot rely on earlier context to fill gaps.

**No explicit "concise subagent" guidance:** The docs do NOT provide a formal guideline on the ideal length of a subagent prompt body, nor do they state a rule like "keep to X words" or "avoid prompts longer than Y tokens."

**Source:** https://code.claude.com/docs/en/best-practices.md — sections "Provide specific context" and "Create custom subagents"; https://code.claude.com/docs/en/skills.md — section on forks

---

## Summary for your use case

**The official stance:** Skills should be modular (detail in reference files, not SKILL.md body). Subagents preload skill content in full at startup, costing the same tokens whether you declare `skills:` or have the subagent read the file. Subagents cache their system prompt after the first call. Caching applies to agent bodies (168 KB or 3 KB), but large agents have a larger cacheable prefix, which helps on repeats. Conciseness is advised (Bloated instructions are ignored), but no length limit is published.
