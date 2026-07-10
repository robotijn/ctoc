# Kustomize CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Standalone install
curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" | bash
# Or via kubectl (built-in)
kubectl apply -k overlays/production/
# Note: kubectl kustomize may lag standalone version
```

## Claude's Common Mistakes
1. **Duplicates manifests across environments** - Use base/overlay pattern
2. **Inline patches when strategic merge works** - Adds complexity
3. **Missing namespace in overlays** - Cross-environment conflicts
4. **Forgets configMapGenerator hash suffixes** - Breaks rollout triggers
5. **Uses kubectl kustomize for latest features** - Standalone more current

## Correct Patterns (2026)
```yaml
# base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
commonLabels:
  app.kubernetes.io/name: myapp

# overlays/production/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: production
resources:
  - ../../base
configMapGenerator:
  - name: app-config
    behavior: merge
    files:
      - config.json
secretGenerator:
  - name: app-secrets
    envs:
      - secrets.env
    options:
      disableNameSuffixHash: false  # Keep hash for rollouts
patches:
  - path: replica-patch.yaml
images:
  - name: myapp
    newName: registry.example.com/myapp
    newTag: v1.2.3  # Or use digest for prod
```

## Version Gotchas
- **Kustomize 5.x**: Some transformer behaviors changed
- **kubectl built-in**: May be 1-2 versions behind standalone
- **With ArgoCD**: Kustomize version in ArgoCD may differ
- **With Flux**: Use kustomize-controller, respects kustomization.yaml

## What NOT to Do
- Do NOT duplicate manifests - use base/overlay structure
- Do NOT hardcode namespaces in base - set in overlay
- Do NOT disable configMap hash suffix - breaks rollout detection
- Do NOT use inline patches for simple changes - strategic merge cleaner
- Do NOT skip `kustomize build | kubectl apply --dry-run=server`

## Overlay & Patch Footguns
Kustomize is template-free — every "gotcha" is really about **which patch strategy
merges how**, and about **generators changing names underneath you**.

- **Strategic-merge vs JSON 6902 patch.** A **strategic-merge** patch is a partial
  manifest that merges by field, using each field's patch strategy — but **list
  merging is the trap**: a container list merges *by the `name` key*, so a patch
  targeting the wrong container name silently *adds* a second container instead of
  editing the first. A **JSON 6902** patch (`op/path/value`) is precise and
  positional (`/spec/template/spec/containers/0/image`) — use it when you must edit
  a specific list element or when strategic-merge's list semantics fight you.

```yaml
# overlays/prod/kustomization.yaml
patches:
  - path: resources-patch.yaml           # strategic-merge (merges by field/name)
    target: { kind: Deployment, name: myapp }
  - patch: |-                            # JSON 6902 — positional, unambiguous
      - op: replace
        path: /spec/template/spec/containers/0/image
        value: registry.example.com/myapp@sha256:...
    target: { kind: Deployment, name: myapp }
```

- **`namePrefix`/`nameSuffix` + `commonLabels` propagate — and rewrite references.**
  A `namePrefix` renames every resource *and* the references to them (a Deployment's
  ConfigMap ref, a Service's selector via `commonLabels`). But **`commonLabels`
  writes into `spec.selector`**, which is **immutable** on an existing Deployment —
  adding a common label to a live Deployment makes the apply fail. Prefer
  `labels:` with `includeSelectors: false` (Kustomize 5) for labels you do NOT want
  in the selector.
- **`configMapGenerator`/`secretGenerator` hash suffix triggers rollout — on
  purpose.** Generators append a content hash (`app-config-abc123`) and rewrite all
  references to the hashed name, so any config change produces a new name → the
  Deployment's pod template changes → rollout. Setting
  `disableNameSuffixHash: true` (or `behavior: merge` on an unhashed name) means a
  config change does NOT roll pods — the classic "I changed the ConfigMap and
  nothing happened" bug. Keep the hash on for anything that should redeploy.
- **`generatorOptions.disableNameSuffixHash`** applies to all generators in that
  kustomization — scope it carefully.
- **`vars` is deprecated → use `replacements`.** The old `vars:` string-substitution
  was fragile (only certain fields, no type awareness). Kustomize 5 replaces it with
  `replacements:` (source → target field copy). Do not generate new `vars:` blocks.
- Source: kustomize.io / kubectl-kustomize reference. See References.

## Correctness: Patch Targets & Build Order
- **Patch target selectors** — a `patch` with a `target: {kind, name, labelSelector,
  annotationSelector}` applies to *every* matching resource. Too-broad a selector
  patches resources you did not intend; `kustomize build overlays/prod | less` and
  diff before applying.
- **`bases:` is deprecated → put base paths in `resources:`.** The old top-level
  `bases:` field is removed from current `kustomization.yaml`; list base directories
  directly under `resources:` (e.g. `resources: [../../base]`). A `kustomization`
  that still uses `bases:` warns/erors on current Kustomize.
- **Build order & multiple patches** — patches apply in listed order; a later patch
  sees the result of the earlier one. Transformers (`namePrefix`, `commonLabels`)
  run after resource loading, so a patch that sets a name the prefix then rewrites
  can surprise you.

## Security: Generated Secrets Are Plaintext (CWE-312)
- **`secretGenerator` writes the secret value plaintext into the rendered manifest
  and, if you commit the `secrets.env`/literal, into git — CWE-312 (Cleartext
  Storage of Sensitive Information, cwe.mitre.org/data/definitions/312.html).**
  `kustomize build` emits a `kind: Secret` whose `data:` is only base64 — anyone
  with the rendered output or the repo history reads the secret.
- **Never commit rendered secrets or the source `secrets.env`.** Keep secret
  material out of the repo entirely: reference an externally-managed `Secret` (SOPS +
  ksops exec plugin, External Secrets Operator, or Sealed Secrets) instead of
  `secretGenerator` on plaintext, and `.gitignore` any `*.env` used locally.
- **`kustomize build` runs exec/plugins with `--enable-exec`/`--enable-alpha-plugins`
  — treat those as code execution.** Only enable plugin flags for kustomizations you
  trust; a malicious kustomization with an exec generator runs arbitrary commands at
  build time.
- Source: cwe.mitre.org/312, kustomize.io secretGenerator docs. See References.

## Error Handling & Debugging Idioms
- **`kustomize build overlays/prod`** is the single source of truth — if the render
  is wrong, everything downstream is wrong. Diff two overlays with
  `diff <(kustomize build overlays/staging) <(kustomize build overlays/prod)`.
- **`no matches for Id ...` / "couldn't find target"** — a patch `target` selector
  matched nothing (wrong kind/name/namespace); the base did not include the resource
  you are patching.
- **`may not add resource with an already registered id`** — the same resource is
  pulled in twice (a base listed under two overlays, or duplicate `resources`).
- **Server-side validation:** `kustomize build overlays/prod | kubectl apply
  --dry-run=server -f -` catches schema/admission errors the offline build cannot.

## Testing & Reliability Conventions
```bash
# CI gate: render must succeed, be deterministic, and pass server validation
kustomize build overlays/prod > /tmp/rendered.yaml
kubectl apply --dry-run=server -f /tmp/rendered.yaml
# golden-file test: fail CI if the rendered output drifts unexpectedly
diff -u testdata/prod.golden.yaml /tmp/rendered.yaml
```
- Golden-file (snapshot) tests of `kustomize build` output catch accidental drift
  from a base or transformer change; regenerate the golden deliberately, never
  blindly.

## Version-Specific Gotchas (dated, sourced)
- **Standalone Kustomize is at kustomize/v5.8.1** (released **2026-02-09**); the
  `kubectl` built-in kustomize typically lags the standalone binary by one or more
  releases, so `kubectl kustomize` may miss newer fields — install the standalone
  binary for current features. [github.com/kubernetes-sigs/kustomize/releases,
  retrieved 2026-07-10]
- **Kustomize 5 removed/changed legacy behaviour:** top-level `bases:` is gone (use
  `resources:`), `vars:` is deprecated in favour of `replacements:`, and
  `commonLabels`/`patchesStrategicMerge`/`patchesJson6902` are superseded by the
  unified `labels:` and `patches:` fields. Do not generate Kustomize-3-era syntax.
  [kustomize.io / kubernetes-sigs release notes, retrieved 2026-07-10]
- **With GitOps controllers:** Argo CD and Flux each bundle their own Kustomize
  version, which may differ from your local binary — pin/verify the controller's
  version so a field that renders locally is not rejected in-cluster.
  [kustomize.io + fluxcd.io kustomize-controller docs, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Kustomize releases: https://github.com/kubernetes-sigs/kustomize/releases
- Kustomize reference (kustomization.yaml fields): https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/
- Patches (strategic-merge & JSON 6902): https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/patches/
- secretGenerator / configMapGenerator: https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/secretgenerator/
- replacements (replaces vars): https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/replacements/
- Declarative Management of Kubernetes Objects Using Kustomize: https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/
- CWE-312 (Cleartext Storage of Sensitive Information): https://cwe.mitre.org/data/definitions/312.html
