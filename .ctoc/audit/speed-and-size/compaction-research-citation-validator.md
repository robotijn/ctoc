# Citation check: seven beliefs about making agent instructions smaller

Two claims hold as stated: Anthropic's 500-line skill guidance (5) and measuring before and after a change (7). Four hold only in part (1, 2, 4, 6). The compression claim (3) is backed for retrieved context and examples, but not for rules and constraints. The authors of the tool deliberately compress instructions *less*.

---

## 1. Long instructions dilute adherence — **Supported for 2025 models; newer results are mixed**

- **Primary source:** Jaroslawicz, Whiting, Shah and Maamari, "How Many Instructions Can LLMs Follow at Once?", [arXiv:2507.11538](https://arxiv.org/abs/2507.11538). Your name for it is right, and the benchmark is called IFScale.
- **Date:** 15 July 2025.
- **Exact sentence from the abstract:** "We evaluate 20 state-of-the-art models across seven major providers and find that even the best frontier models only achieve 68% accuracy at the max density of 500 instructions."
- **Numbers from the paper's results table** (read through a page-reading tool, worth one check against the PDF):

  | Model | Accuracy at 500 instructions |
  |---|---|
  | gemini-2.5-pro | 68.9% |
  | o3 (high) | 62.8% |
  | grok-3-beta | 61.9% |
  | claude-3.7-sonnet | 52.7% |
  | claude-opus-4 | 44.6% |

  Several models score 100% at 10 instructions.
- **How accuracy falls:** the paper sees three patterns. Some models stay near-perfect until a critical density (o3, gemini-2.5-pro). Some decline steadily (gpt-4.1, claude-3.7-sonnet). Some drop quickly early and then level off (claude-3.5-haiku, llama-4-scout).
- **Other findings:** errors are mostly omissions, not distortions. The bias toward earlier instructions "peak[s] around 150-200 instructions."
- **Limit of the study:** it uses only one kind of instruction ("include this keyword").

**Newer evidence weakens the numbers but not the direction:**
- **Arize AI blog post**, Laurie Voss, May 2026 ([link](https://arize.com/blog/llm-instruction-following-benchmark-2026/)). This is a vendor's own measurement, not peer-reviewed.
  - "the new models were doing so well that they were hitting 100% accuracy at N=500."
  - They had to grow the vocabulary to 10,000 words before scores dropped.
  - GPT 5.5 held "99% accuracy through N=5,000." DeepSeek V4 Pro started dropping instructions around N=750.
- **Vasileva, "Large Language Models Can Follow Instructions, But Not Many at Once"**, [arXiv:2608.12426](https://arxiv.org/abs/2608.12426), 12 August 2026. Single author. It tests mixed kinds of constraints and finds a much lower ceiling:
  - "a model passing individual constraints at ~41% at k=8 succeeds on all eight just 5.7% of the time."
  - "Reliable instruction following breaks down beyond 5-6 simultaneous constraints."
  - This matters for agent files: each rule may pass on its own while the chance that *every* rule holds collapses, because failures multiply.

## 2. Lost in the middle — **Partly supported: the U-shape has weakened; the cost of length has not**

- **Original paper:** Liu et al., [arXiv:2307.03172](https://arxiv.org/abs/2307.03172), July 2023, published in the journal Transactions of the Association for Computational Linguistics. "We find that performance can degrade significantly when changing the position of relevant information, indicating that current language models do not robustly make use of information in long input contexts."

**Newer results that weaken it:**
- **Tian et al., LongPiBench**, [arXiv:2410.14641](https://arxiv.org/abs/2410.14641), last revised May 2025: "while most current models are robust against the 'lost in the middle' issue, there exist significant biases related to the spacing of relevant information pieces."
- **Veseli et al.**, [arXiv:2508.07479](https://arxiv.org/abs/2508.07479), 10 August 2025:
  - "the LiM effect is strongest when inputs occupy up to 50% of a model's context window."
  - Beyond that, "This effectively eliminates the LiM effect; instead, we observe a distance-based bias, where model performance is better when relevant information is closer to the end of the input."

**What still holds:**
- **NoLiMa**, [arXiv:2502.05167](https://arxiv.org/abs/2502.05167), International Conference on Machine Learning 2025: "At 32K, for instance, 11 models drop below 50% of their strong short-length baselines." GPT-4o falls from 99.3% to 69.7%.
- **Chroma, "Context Rot"** ([link](https://www.trychroma.com/research/context-rot)), 14 July 2025, a technical report rather than a peer-reviewed paper. It tested 18 models, including GPT-4.1, Claude 4 and Gemini 2.5: "model performance degrades as input length increases, often in surprising and non-uniform ways."
- **Anthropic's prompting documentation** ([link](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices), undated, read 6 October 2026): "Queries at the end can improve response quality by up to 30 percent in tests, especially with complex, multidocument inputs."

**For your purpose:** total length is the better-supported harm. Position still matters: IFScale shows a bias toward earlier instructions, and Veseli shows a bias toward the end.

## 3. Compression tools — **Supported for retrieved context and examples; not found for rules, and the authors' own design argues against it**

- **LLMLingua**, [arXiv:2310.05736](https://arxiv.org/abs/2310.05736) (version 2 dated 6 December 2023):
  - Headline result: "up to 20x compression with little performance loss."
  - But its budget controller gives "more budget (i.e., smaller compression ratios) for instructions and questions, and less budget for demonstrations," because "the instruction and the question in a prompt have a direct influence on the generated results."
- **LLMLingua-2**, [arXiv:2403.12968](https://arxiv.org/abs/2403.12968), March 2024:
  - Reports compression ratios of 2x to 5x.
  - Its compressor was trained only on meeting transcripts (the MeetingBank dataset), and it was evaluated on MeetingBank, LongBench, ZeroSCROLLS, GSM8K and Big-Bench Hard. That is context and chain-of-thought examples, not rules.
  - Its own limitations section: "Our text compression dataset was constructed using only training examples from MeetingBank... This raises concerns about the generalization ability of our compressor."
- **Survey**, [arXiv:2410.12388](https://arxiv.org/abs/2410.12388), October 2024: "filtered prompts may disrupt grammatical correctness and provide an unfamiliar input distribution to the LLM, potentially affecting its performance."

**The only direct evidence on instruction text is thin.** All three studies below are preprints, two by a single author:
- **Johnson and Lee**, [arXiv:2603.23525](https://arxiv.org/abs/2603.23525), March 2026. A pre-registered randomized trial that compressed 1,199 real orchestration instructions for Claude Sonnet 4.5. Keeping half the tokens cut total cost by 27.9%. Keeping a fifth of the tokens "increased mean cost by 1.8%" and "was dominated on both cost and similarity." It measured similarity of answers, not correctness.
- **Tang**, [arXiv:2604.07192](https://arxiv.org/abs/2604.07192), April 2026. Compact constraint headers written by hand (not automatic pruning) cut constraint tokens by about 71%, and "we detect no statistically significant differences in constraint satisfaction rate."
- **Baxi**, [arXiv:2512.17920](https://arxiv.org/abs/2512.17920), December 2025. This study varies prompt length, not LLMLingua-style pruning. It found constraint violations "peaking at medium compression."

## 4. Fewer, sharper examples — **Partly supported; the evidence is mixed**

- **Anthropic** (prompting best-practices page, undated, read 6 October 2026): "Include 3–5 examples for best results." Examples should be "Relevant", "Diverse" and "Structured." Replacing them with one or two goes *below* this recommendation.
- **For fewer examples:**
  - **Tang et al., "The Few-shot Dilemma"**, [arXiv:2509.13196](https://arxiv.org/abs/2509.13196), September 2025, accepted at the IEEE conference on foundation and large language models: "incorporating excessive domain-specific examples into prompts can paradoxically degrade performance in certain LLMs." The best number of examples differs per model.
  - **DeepSeek-R1**, [arXiv:2501.12948](https://arxiv.org/abs/2501.12948), January 2025: "Few-shot prompting consistently degrades its performance."
  - **OpenAI reasoning guide** ([link](https://developers.openai.com/api/docs/guides/reasoning-best-practices)): "Try zero shot first, then few shot if needed."
- **Against fewer examples:** **Agarwal et al., "Many-Shot In-Context Learning"**, [arXiv:2404.11018](https://arxiv.org/abs/2404.11018), April 2024, a spotlight paper at the Conference on Neural Information Processing Systems: "Going from few-shot to many-shot, we observe significant performance gains."
- **On what makes an example good:** **Min et al.**, [arXiv:2202.12837](https://arxiv.org/abs/2202.12837), 2022: "randomly replacing labels in the demonstrations barely hurts performance." Format, label space and input distribution matter more.
- **Not found:** any study that measures the number of examples against *instruction-following* quality specifically.

## 5. Anthropic's skill guidance — **Supported, exact wording found**

- **Page:** [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices). The page is undated; I read it on 6 October 2026.
- **The 500-line rule:**
  - "Keep SKILL.md body under 500 lines for optimal performance."
  - "Split content into separate files when approaching this limit."
  - In the "Token budgets" section: "If your content exceeds this, split it into separate files using the progressive disclosure patterns described earlier."
  - The checklist: "SKILL.md body is under 500 lines."
- **Progressive disclosure:**
  - "At startup, only the metadata (name and description) from all Skills is pre-loaded. Claude reads SKILL.md only when the Skill becomes relevant, and reads additional files only as needed."
  - "Keep references one level deep from SKILL.md."
  - "For reference files longer than 100 lines, include a table of contents at the top."
- **Caveats:** no measurement is cited for the number 500. The page addresses SKILL.md files, not agent definition files.

## 6. Prompt caching — **Partly supported: caching cuts latency *and* cost; it does not cut context room**

- **Page:** [Prompt caching documentation](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), undated, read 6 October 2026.
- **Prices relative to the normal input price:**

  | What | Price |
  |---|---|
  | Writing to the 5-minute cache | 1.25 times |
  | Writing to the 1-hour cache | 2 times |
  | Reading from the cache | 0.1 times, with per-model exceptions |
  | Exception: Claude Opus 5.5 | 0.05 times |
  | Exception: Claude Fable 5.1 and Claude Mythos 5.1 | 0.025 times |

- **Lifetime:** "By default, the cache has a 5-minute lifetime. The cache is refreshed for no additional cost each time the cached content is used."
- **Latency:** the documentation gives no figure, only "You will generally see improved time-to-first-token for long documents."
- **The only official latency numbers** are in the launch post ([claude.com/blog/prompt-caching](https://claude.com/blog/prompt-caching)): "reducing costs by up to 90% and latency by up to 85% for long prompts." A 100,000-token book went from 11.5 to 2.4 seconds (79% faster), and a 10,000-token many-example prompt from 1.6 to 1.1 seconds (31% faster).
  - The page's date is internally inconsistent. It shows "August 14, 2025", but carries an update dated 17 December 2024. These were measurements on older models.
- **The correction to your claim:** caching makes length matter less for both cost and latency. Nothing on the caching page mentions the context window, so the claim that it frees context room has no source. My own understanding, not sourced: cached tokens are still part of the prompt, so they still use context room and still bear on adherence (claims 1 and 2).

## 7. Measure, don't assume — **Supported**

- **Anthropic skill guide** (same page as claim 5):
  - "Create evaluations BEFORE writing extensive documentation."
  - "Establish baseline: Measure Claude's performance without the Skill."
  - "Iterate: Execute evaluations, compare against baseline, and refine."
  - "Evaluations are your source of truth for measuring Skill effectiveness."
  - "There is not currently a built-in way to run these evaluations."
- **Anthropic, [Define success criteria and build evaluations](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests):**
  - "This cycle is central to prompt engineering."
  - "More questions with slightly lower signal automated grading is better than fewer questions with high-quality human hand-graded evals."
- **OpenAI, [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices):**
  - "Adopt eval-driven development: Evaluate early and often."
  - "Set up continuous evaluation (CE) to run evals on every change."
- **OpenAI blog, [Testing Agent Skills Systematically with Evals](https://developers.openai.com/blog/eval-skills):** "it's hard to tell whether you're actually improving it or just changing its behavior."
- **Caveats:** no source addresses *shortening* specifically. Anthropic's minimum is three evaluations. My own reasoning, not sourced: three cases are far too few to detect the few-point adherence drops measured in claims 1 and 2.

---

I did not edit any file, and none of the fetched pages contained instructions aimed at me.

**What could change these verdicts:** the arXiv abstract sentences were requested word-for-word, but the table figures came through a page-reading tool. Those are the IFScale per-model accuracies, the NoLiMa figures for GPT-4o and the caching latency table, and they deserve one check against the PDFs. Several 2026 sources are single-author preprints or vendor blog posts, so the "mixed" verdicts in claims 1 and 3 rest on weak evidence on both sides.
