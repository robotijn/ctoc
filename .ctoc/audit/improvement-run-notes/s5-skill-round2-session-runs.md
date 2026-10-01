# Slice s5 — session runs, round 2 of the skill (raw reads of the saved `dist/v6/ATLAS-2026.09.yaml`, 2026-10-01, 03:45 CEST)

## The skill's ATLAS mapping table: every technique name resolved against release 2026.09 (name → identifier → tactics it `achieves`)
Checked with a script over the saved data file (techniques block lines 410–5979; relationships from line 9874). Tactic names from the file's own `tactics:` block.
- Search Application Repositories → AML.T0004 → AML.TA0002 Reconnaissance ✓ (as the table places it)
- Acquire Public AI Artifacts → AML.T0002 → AML.TA0003 Resource Development ✓
- AI Supply Chain Compromise → AML.T0010 → AML.TA0004 Initial Access ✓ (identifier confirmed)
- **"Inference API Access" — NOT the file's name.** The entry is **AI Model Inference API Access** → AML.T0040 → AML.TA0000 AI Model Access. Rename.
- AI-Enabled Product or Service → AML.T0047 → AML.TA0000 AI Model Access ✓
- Command and Scripting Interpreter → AML.T0050 → AML.TA0005 Execution ✓
- **"Poison Training Data" — NOT the file's name.** The entry is **Training Data Poisoning** → AML.T0020 → AML.TA0006 Persistence. Rename.
- Manipulate AI Model → AML.T0018 → AML.TA0001 AI Attack Adaptation; AML.TA0006 Persistence ✓ (Persistence row holds)
- LLM Jailbreak → AML.T0054 → AML.TA0007 Defense Evasion; AML.TA0012 Privilege Escalation ✓ (Privilege Escalation row holds; also Defense Evasion)
- Escape to Host → AML.T0105 → AML.TA0012 Privilege Escalation ✓
- Evade AI Model → AML.T0015 → AML.TA0004 Initial Access; AML.TA0007 Defense Evasion; AML.TA0011 Impact ✓ (Defense Evasion row holds)
- LLM Prompt Obfuscation → AML.T0068 → AML.TA0007 Defense Evasion ✓
- Discover AI Model Family → AML.T0014 → AML.TA0008 Discovery ✓
- Discover AI Agent Configuration → AML.T0084 → AML.TA0008 Discovery ✓
- Data from Information Repositories → AML.T0036 → AML.TA0009 Collection ✓
- Create Proxy AI Model → AML.T0005 → AML.TA0001 AI Attack Adaptation ✓
- LLM Data Leakage → AML.T0057 → AML.TA0010 Exfiltration ✓
- Exfiltration via Cyber Means → AML.T0025 → AML.TA0010 Exfiltration ✓
- Erode AI Model Integrity → AML.T0031 → AML.TA0011 Impact ✓
- External Harms → AML.T0048 → AML.TA0011 Impact ✓
- **"Reverse Shell" — does NOT exist in ATLAS 2026.09** (0 occurrences). The techniques that achieve AML.TA0014 Command and Control are: AML.T0072 Cyber Communication Channel; AML.T0096 AI Service API; AML.T0108 AI Agent; AML.T0114 AI Service Web Interface; AML.T0120 AI Artifact Repository. The Command and Control row must name one of these (the skill's look-for — egress from a fetch tool with no allowlist — fits **AML.T0108 AI Agent** or **AML.T0072 Cyber Communication Channel**; which is this file's reading).
- Triggers in Multimodal Inputs → AML.T0129 → AML.TA0007 Defense Evasion (now read; the skill says "its tactics were not read").
So: 20 of 23 names are exact and correctly placed; two names are paraphrases to correct; one ("Reverse Shell") is not an ATLAS technique at all.

## After the round-2 critique (2026-10-01, 04:08 CEST): raw re-reads of the summarised OWASP 2026 quotations, and the Python block
- The critic's new LLM03:2025 block (f-s5-skill-r2-9) parses under Python 3.9.6 (`ast.parse`).
- Every OWASP 2026 quotation the critic uses was grepped as an exact string against the raw files (curl, `grep -cF`): 17 of 20 are present verbatim (LLM09: 4/4; LLM02: 6/6; LLM04: 3/3; LLM07: 3/3). **Three LLM05:2026 quotations are cut where the source continues with a comma** — the critic's text ends them with a full stop that is not there: line 55 reads "3. Protect RAG systems by enforcing trust boundaries, filtering retrieved content, applying source scoring, and isolating system instructions from external data."; line 69 reads "…Do not assume safety alignment removes backdoors. Dedicated trigger-probing is required after every alignment cycle (Hubinger et al., 2024)."; line 51 reads "1. Track dataset and model lineage using SBOM/ML-BOM (e.g., CycloneDX), enforce signing and verification, and continuously validate data integrity across lifecycle stages." So the quotations must end "…applying source scoring" / "…after every alignment cycle" / "…enforce signing and verification" with the closing full stop outside the quotation marks (or carry the full sentence). The LLM05 "In agentic deployments…" sentence is verbatim.

## After the round-2 validation (2026-10-01, 04:16 CEST)
- **Firecracker, byte-level (curl, tags stripped):** the page reads "Firecracker is an open source virtualization technology that is purpose-built for creating and managing secure, multi-tenant container and function-based services." — WITH "that is". The validator's two summarised reads dropped those words; the critic's quotation (and the research note's) is correct as written. Either form the validator proposed also holds, since the shorter quotation is a substring.
- **"Reverse Shell" in the deprecated file:** `name: Reverse Shell` occurs once in the saved `main/dist/ATLAS.yaml` (the deprecated file, whose first line is "# This version of the ATLAS data is deprecated and is no longer being updated with new content.") and once in `dist/legacy/ATLAS-5.6.0.yaml`. So the note under the table may say "AML.T0072's name in the deprecated `dist/ATLAS.yaml`" on the session's own read, not only the legacy file's.

## After the round-2 re-read (2026-10-01, 04:27 CEST): `weights_only` flows from `from_pretrained` to `torch.load` — raw source
`raw.githubusercontent.com/huggingface/transformers/main/src/transformers/modeling_utils.py` (5,169 lines, read 2026-10-01): `from_pretrained` declares `weights_only: bool = True` (line 3838) and documents it (4014); it is threaded through to the loading configuration (`weights_only=weights_only`, line 4333) and on to the state-dict loader (`weights_only=load_config.weights_only`, 4431); `load_state_dict` (declared 325) ends in `return torch.load(checkpoint_path, map_location=map_location, weights_only=weights_only, **extra_args)` (369), guarded by the comment "# Fallback to torch.load (if weights_only was explicitly False, do not check safety as this is known to be unsafe)" and `if weights_only: check_torch_load_is_safe()` (361–362). So the BAD example's comment "the unpickler may run code the file carries" is backed at source: with `weights_only=False` the safety check is skipped and `torch.load` runs with the unrestricted unpickler.
