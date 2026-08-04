# Release-Candidate Checklist

A gate is `PASS` only when raw evidence identifies the exact commit. `BLOCKED`
is not equivalent to `PASS`.

| Gate | Required evidence | State |
|---|---|---|
| Clean clone | Normal clone succeeds; LFS objects/pointers verified | Pending |
| Install | Locked install from empty cache | Pending |
| Type safety | Typecheck has zero errors | Pending |
| Lint | Configured source lint has zero errors/warnings or reviewed exceptions | Pending |
| Tests | Unit/integration pass; skips enumerated and justified | Pending |
| Build/package | Production build, pack dry-run, public import smoke | Pending |
| Dependencies | Production critical/high zero; SBOM retained | Pending |
| Browser | Chromium, Firefox, WebKit workflows pass | Pending |
| UI inventory | Every enabled action tested; unsupported actions disabled | Pending |
| Accessibility | Automated serious/critical zero plus manual keyboard review | Pending |
| Format import | Reference fixtures, corruption, and atomic failure | Pending |
| Digitizer | Frozen waveform fidelity and failure-state thresholds | Pending |
| Clinical safety | Independent critic accepts safe-failure behavior | Pending |
| Clinical validity | Independent adjudicated measurement/finding evidence | External blocker |
| ML validity | Locked retrained artifact plus independent multicenter results | External blocker |
| Privacy/security | Threat model, no-secrets/no-PHI tests, review | Pending |
| Operations | Deploy, health, monitoring, backup/restore, rollback drill | Pending |
| Documentation | Intended use, limitations, runbooks, claims aligned | Pending |
| PR | Required checks pass and review findings resolved | Pending |
| Post-merge | Exact `main` merge SHA reverified | Pending |

The repository can become an engineering candidate while clinical-validity and
ML-validity remain blocked. It cannot be called a routine clinical release.
