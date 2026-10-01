# Slice s5 — session runs (raw reads, no summarising model), round 1 of the agent

## MITRE ATLAS v2026.09 data file, read raw with curl (2026-10-01, 00:10 CEST)
Source: https://raw.githubusercontent.com/mitre-atlas/atlas-data/v2026.09/dist/ATLAS.yaml, saved to the session scratchpad and read by line number with sed/grep (no YAML library; the repository has none installed). The file's `version:` field reads `5.6.0` at this date-named tag (unexplained, as the gaps report says).

Tactic identifiers and names, in file order (16): AML.TA0002 Reconnaissance · AML.TA0003 Resource Development · AML.TA0004 Initial Access · AML.TA0000 AI Model Access · AML.TA0005 Execution · AML.TA0006 Persistence · AML.TA0012 Privilege Escalation · AML.TA0007 Defense Evasion · AML.TA0013 Credential Access · AML.TA0008 Discovery · AML.TA0015 Lateral Movement · AML.TA0009 Collection · AML.TA0001 AI Attack Staging · AML.TA0014 Command and Control · AML.TA0010 Exfiltration · AML.TA0011 Impact.

Techniques (entry lines read directly):
- AML.T0051 LLM Prompt Injection — tactics: AML.TA0005 Execution. Sub-techniques: AML.T0051.000 Direct, AML.T0051.001 Indirect, AML.T0051.002 Triggered (sub-technique entries carry no tactics line of their own).
- AML.T0053 AI Agent Tool Invocation — tactics: AML.TA0005 Execution, AML.TA0012 Privilege Escalation.
- AML.T0056 Extract LLM System Prompt — tactics: AML.TA0010 Exfiltration (file line 2071).
- AML.T0034 Cost Harvesting — tactics: AML.TA0011 Impact.
- AML.T0080 AI Agent Context Poisoning — tactics: AML.TA0006 Persistence (line 2695); sub-techniques AML.T0080.000 Memory, AML.T0080.001 Thread.
- AML.T0081 Modify AI Agent Configuration — tactics: AML.TA0006 Persistence, AML.TA0007 Defense Evasion (line 2754; the entry's tactics list holds those two).
This closes the gaps report's open items on AML.T0080, AML.T0081 and AML.T0051.002 (which the fetch tool had truncated), and confirms AML.T0056 under Exfiltration.

## The critic's proposed lookup command (change 3, step 1), run once as written (2026-10-01, 00:27 CEST)
`f="$(mktemp)"; curl -sS --fail --max-time 60 -o "$f" 'https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/ATLAS.yaml' && echo "saved $f" || echo "COULD NOT DOWNLOAD"; date -u +%Y-%m-%dT%H:%M:%SZ`
Output: `saved /var/folders/…/T/tmp.sToWkOzasJ` then `2026-09-30T22:27:05Z`. The saved file held 432 `id: AML.T…` lines; `grep -n 'id: AML.T0051$' -A1` gave line 1791 `- id: AML.T0051` / `name: LLM Prompt Injection`. File removed afterwards with `rm -f`. (curl 8.7.1, bash 3.2.57.)

## After the round-1 re-validation (2026-10-01, 00:55 CEST)
- **Model Context Protocol Top 10 separators, byte-level** (raw `index.md` of github.com/OWASP/www-project-mcp-top-10, read with curl, non-ASCII shown as code points): line 44 `* MCP01:2025 - [Token Mismanagement & Secret Exposure](…)`, line 51 `* MCP08:2025 - [ Lack of Audit and Telemetry](2025/MCP08-2025<U+2013>Lack-of-Audit-and-Telemetry)`, line 52 `* MCP09:2025 - [Shadow MCP Servers](2025/MCP09-2025<U+2013>Shadow-MCP-Servers)`. The separator in the list text is an ASCII hyphen-minus surrounded by spaces (` - `); the en dash (U+2013) appears only inside the link targets. So the file's `MCP0N:2025 - …` forms are correct as written; the re-validation's unsettled point is settled.
- **The corrected step 1 of the lookup recipe, failure path**, run once with a non-existent address: printed `curl: (56) The requested URL returned error: 404` on standard error and `COULD NOT DOWNLOAD` on standard output; the temporary file no longer existed afterwards (`ls` → No such file or directory). The `{ rm -f "$f"; echo "COULD NOT DOWNLOAD"; }` form works in bash 3.2.57.
