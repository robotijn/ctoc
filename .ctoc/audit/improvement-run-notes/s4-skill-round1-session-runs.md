# Skill file, round 1: the validator's unreached statements PROBED by the session with curl (raw fetches), 2026-09-30, 21:25 CEST
Tool versions: curl 8.7.1, node v24.14.1, macOS 26.6.1.

- https://pypi.org/pypi/huggingface-cli/json → status 404 (the name answers 404 on PyPI today).
- https://cveawg.mitre.org/api/cve/CVE-2025-99999 → status 404 (the CVE Program's record service has no record for that identifier).
- https://index.crates.io/se/rd/serde_json_ext → status 200; the raw index carries `"vers":"0.1.0"` (the crate is registered; the first-version date is not in the sparse index — the research note's 2026-01-28 date was read from crates.io's web interface, not re-checked here).
- https://registry.npmjs.org/react-query/latest → status 200, `"version":"3.39.3"`.
- https://proxy.golang.org/github.com/aws/aws-sdk-go-v2/secrets/@v/list → status 404.
- https://raw.githubusercontent.com/pgvector/pgvector/master/README.md → status 200; contains the exact text `CREATE EXTENSION vector;`.
- https://docs.djangoproject.com/en/5.2/topics/auth/passwords/ → status 200; contains exactly `validate_password(password, user=None, password_validators=None)`.
- https://www.postgresql.org/docs/current/view-pg-available-extensions.html → status 200; sentence: "The pg_available_extensions view lists the extensions that are available for installation."
- https://www.postgresql.org/docs/current/catalog-pg-am.html → status 200; the `amtype` column is described as: "amtype char t = table (including materialized views), i = index."
- https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-package-list → status 200; contains: the "noun first" form was introduced in … (the .NET 10 rename note the research-gaps note quoted; exact sentence not copied here).
- https://arxiv.org/abs/2605.17062 (Churilov) → status 200; the abstract says: "We replicate their methodology on five frontier code-capable LLMs released between October 2025 and March 2026: Claude Sonnet 4.6, Claude Haiku 4.5, GPT-5.4-mini, Gemini 2.5 Pro, and DeepSeek V3.2. Across 199,845 paired Python and JavaScript prompts validated against PyPI and npm master lists, we measure overall hallucination rates between 4.62% (Claude Haiku 4.5) and 6.10% (GPT-5.4-mini)". So "five current models" is supported ("five frontier code-capable LLMs").
- psql `\dx+`: the psql page (https://www.postgresql.org/docs/current/app-psql.html) was fetched (status 200); the exact `\dx[+]` sentence is recorded below if the extraction found it, otherwise marked not extracted.
- psql `\dx`: the page's sentence (status 200): "Lists installed extensions. If pattern is specified, only those extensions whose names match the pattern are listed. If x is appended to the command name, the results are displayed in expanded mode. If + is appended to the command name, all the objects belonging to each matching extension are listed" — so `\dx+` lists the objects of INSTALLED extensions only.
