# Helm CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Official script method
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
# Or package managers
brew install helm        # macOS
choco install kubernetes-helm  # Windows
# Note: Helm 4.x under development, 3.21 next minor (May 2026)
```

## Claude's Common Mistakes
1. **Missing values.schema.json** - Required for input validation
2. **Hardcodes values in templates** - Use values.yaml with defaults
3. **Ignores NOTES.txt** - Users need post-install guidance
4. **Uses Helm 2 patterns** - Tiller removed, v3 patterns required
5. **Skips chart testing** - helm-unittest required before release

## Correct Patterns (2026)
```yaml
# templates/_helpers.tpl
{{- define "mychart.labels" -}}
helm.sh/chart: {{ include "mychart.chart" . }}
app.kubernetes.io/name: {{ include "mychart.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

# values.schema.json (REQUIRED)
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["image"],
  "properties": {
    "image": {
      "type": "object",
      "required": ["repository", "tag"],
      "properties": {
        "repository": { "type": "string" },
        "tag": { "type": "string", "minLength": 1 }
      }
    },
    "replicas": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    }
  }
}
```

## Version Gotchas
- **Helm 3.19+**: Security patches, upgrade recommended
- **Helm 4.x**: Under development on main branch, APIs changing
- **OCI registries**: Preferred over ChartMuseum for new setups
- **With ArgoCD**: Use `helm template` output, not Helm releases

## What NOT to Do
- Do NOT hardcode values in templates - use values.yaml
- Do NOT skip values.schema.json - catches config errors early
- Do NOT omit NOTES.txt - users need guidance
- Do NOT use Helm 2 - Tiller is security risk
- Do NOT release charts without helm-unittest

## Chart & Templating Footguns
Helm is Go `text/template` over YAML — and YAML is whitespace-significant, so the
bugs Claude generates most are **indentation** and **value-precedence** bugs that
render valid-looking-but-wrong manifests.

- **`indent` vs `nindent` whitespace.** `{{ toYaml .Values.x | indent 4 }}` does
  NOT add a leading newline, so it collides with the current line and produces
  broken YAML; `nindent 4` prepends a newline first. Rule: use `nindent` when the
  value starts a new block, `indent` only mid-line. A `-` inside `{{-` / `-}}`
  trims surrounding whitespace — mismatched trim markers silently merge or delete
  lines and the template still "renders".

```yaml
# WRONG: indent collides with the key on the same line → invalid YAML
metadata:
  labels: {{ toYaml .Values.labels | indent 4 }}
# RIGHT: nindent adds the newline so the block sits under the key
metadata:
  labels:
    {{- toYaml .Values.labels | nindent 4 }}
```

- **`values.yaml` override precedence (lowest → highest):** chart `values.yaml`
  → parent chart's values for a subchart → `-f myvalues.yaml` (last `-f` wins over
  earlier ones) → `--set key=val`. `--set` beats every file. A frequent bug:
  overriding a subchart value at the top level without nesting it under the
  subchart's alias — the override is silently ignored because it lands in the wrong
  scope (see subchart scoping below).
- **`helm upgrade` and immutable fields.** Some resource fields are immutable
  (`Service.spec.clusterIP`, a `Deployment`/`StatefulSet` `selector`, a Job's
  template). Changing them makes the upgrade fail (or leaves a wedged release).
  Changing a selector requires delete+recreate, not upgrade.
- **`lookup` returns empty on `helm template`.** `lookup` queries the live cluster,
  so it returns `nil` during `helm template`/`--dry-run` and on first install (the
  object does not exist yet). Never make required render logic depend on `lookup`.
- **Subchart value scoping.** A subchart only sees values nested under its name (or
  `alias`); `global:` is the one namespace shared with all subcharts. Top-level
  keys are invisible to subcharts.
- **Template injection — CWE-94-class.** Passing untrusted input through
  `{{ tpl .Values.userInput . }}` executes it as a template — an attacker-supplied
  value can reach `lookup`, env, or file functions. Never `tpl` untrusted values;
  quote user strings with `{{ .Values.x | quote }}`.
- Source: helm.sh docs (values, subcharts, template functions). See References.

## Safety: Atomic Upgrades & Rollback
- **`helm upgrade --install --atomic --wait --timeout 5m`** rolls the release back
  automatically if any resource fails to become ready within the timeout, instead
  of leaving a half-applied release. Without `--atomic`, a failed upgrade leaves
  the cluster in a mixed state that the next `helm upgrade` may refuse to touch.
- **`helm rollback <release> <revision>`** uses stored release history; keep
  `--history-max` sane (default 10) so you retain rollback targets without bloating
  Secrets storage.
- **`--dry-run=server` + `helm diff upgrade`** (helm-diff plugin) shows exactly what
  changes before you apply — the safe pre-flight for production.

```bash
helm upgrade --install myapp ./chart \
  --atomic --wait --timeout 5m \
  -f values-prod.yaml
helm rollback myapp 0            # 0 = previous revision
```

## Security: Secrets in Values (CWE-312)
- **A secret in `values.yaml` is stored plaintext in the release — CWE-312
  (Cleartext Storage of Sensitive Information, cwe.mitre.org/data/definitions/312.html).**
  Helm 3 stores each release's rendered manifest (values included) in a Kubernetes
  Secret named `sh.helm.release.v1.<release>.vN`, which is only base64-encoded, and
  committing a `values-prod.yaml` with real secrets leaks them into git history.
  Never put plaintext secrets in chart values or committed value files.
- **Encrypt at rest:** use **helm-secrets + SOPS** (age/KMS), the **External Secrets
  Operator**, or **Sealed Secrets** so only encrypted material touches git; Helm
  templates then reference a `Secret` created out-of-band.
- **Hard-coded credentials in a chart — CWE-798 (Use of Hard-coded Credentials,
  cwe.mitre.org/data/definitions/798.html)** — a default password baked into
  `values.yaml` ships to every install; require it via schema instead.
- **Provenance & signing:** `helm package --sign` + `helm install --verify` checks
  a chart's PGP provenance (`.prov`) so you install only signed charts from an OCI
  registry.
- Source: cwe.mitre.org/312, cwe.mitre.org/798, helm.sh provenance docs. See References.

## Error Handling & Debugging Idioms
- **`--debug --dry-run=server`** renders templates against the live API (CRDs,
  namespaces resolved) and prints the manifest + any admission error — the fastest
  way to see why an install fails.
- **`helm template ./chart | kubectl apply --dry-run=server -f -`** validates the
  rendered output against the cluster's schema without creating a release.
- **`another operation (install/upgrade/rollback) is in progress`** — a prior
  command died mid-flight leaving the release `pending-*`; `helm rollback` to the
  last good revision, or delete the pending release Secret.
- **`helm lint ./chart`** catches template + schema errors before you ever touch a
  cluster; wire it into CI.

## Testing Conventions
```yaml
# tests/deployment_test.yaml — helm-unittest (renders templates, asserts output)
suite: deployment
templates: [deployment.yaml]
tests:
  - it: sets the image from values
    set: { image.repository: myrepo, image.tag: "1.2.3" }
    asserts:
      - equal:
          path: spec.template.spec.containers[0].image
          value: myrepo:1.2.3
```
- `helm test <release>` runs pods annotated `helm.sh/hook: test` against a live
  release (smoke tests). `helm-unittest` (above) tests *rendering* offline in CI —
  use both: unittest for template logic, `helm test` for post-deploy smoke.

## Performance & Reliability Traps
- **`--wait` waits for readiness, `--wait-for-jobs` waits for Jobs too.** A chart
  with a pre-install migration Job that runs long can report "deployed" before the
  Job finishes unless you add `--wait-for-jobs`. Gate dependent releases on it.
- **Hook ordering via weights.** `helm.sh/hook-weight` (a *string* sorted
  ascending, ties broken by name) orders hooks of the same phase; forgetting weights
  means a `post-install` migration may run before the DB Service is ready. Set
  `helm.sh/hook-delete-policy: hook-succeeded` so completed hook pods don't pile up.
- **CRD install is once, not templated.** CRDs under `crds/` install *before* other
  resources and are **never upgraded or deleted by Helm** — a chart bump does NOT
  update an existing CRD. Manage CRD upgrades out-of-band.
- **Release history bloat.** Every `helm upgrade` writes a new release Secret; a
  chart upgraded hundreds of times without `--history-max` slows `helm list` and
  bloats etcd. Cap it.
- **`--timeout` scales with `--atomic`.** With `--atomic`, a too-short `--timeout`
  triggers an unnecessary rollback of a deploy that was merely slow to become ready;
  size the timeout to the slowest pod's realistic startup.

## Version-Specific Gotchas (dated, sourced)
- **Helm 4.2.3 is the current stable release** (published **2026-07-09**); **Helm
  4.0.0 went GA 2025-11-12**. Helm 4 is a real major, not "under development" — the
  v3 line continues as **3.21.3** (2026-06-20) for teams not yet migrated.
  [github.com/helm/helm/releases, retrieved 2026-07-10]
- **Helm 4 migration notes:** post-render and plugin APIs changed and some Helm 3
  behaviours were tightened; test charts under `helm4 template` before upgrading
  CI. Do NOT assume a chart that renders on 3.x renders identically on 4.x.
  [helm.sh/docs (Helm 4), retrieved 2026-07-10]
- **OCI registries** are the default distribution path (`helm push`/`helm pull
  oci://...`); ChartMuseum is legacy for new setups. [helm.sh registries docs,
  retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Helm releases: https://github.com/helm/helm/releases
- Helm docs (values / templates): https://helm.sh/docs/chart_template_guide/values_files/
- Named templates & functions (indent/nindent): https://helm.sh/docs/chart_template_guide/named_templates/
- Subcharts & global values: https://helm.sh/docs/chart_template_guide/subcharts_and_globals/
- helm upgrade / --atomic: https://helm.sh/docs/helm/helm_upgrade/
- Provenance & signing: https://helm.sh/docs/topics/provenance/
- helm-secrets (SOPS): https://github.com/jkroepke/helm-secrets
- helm-unittest: https://github.com/helm-unittest/helm-unittest
- CWE-312 (Cleartext Storage of Sensitive Information): https://cwe.mitre.org/data/definitions/312.html
- CWE-798 (Use of Hard-coded Credentials): https://cwe.mitre.org/data/definitions/798.html
