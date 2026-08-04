# Release-Candidate Checklist

A gate is `PASS` only when raw evidence identifies the exact commit. `BLOCKED`
is not equivalent to `PASS`.

Engineering evidence below was executed on
`6acf0024f4b21c82d47c21f9dedb23cfc06f7b89` on 2026-08-04.

| Gate | Required evidence | State |
|---|---|---|
| Clean clone | Normal clone succeeds; LFS objects/pointers verified | Pending — clean clone not rerun; `npm run lfs:verify` verified 10 declared pointer artifacts |
| Install | Locked install from empty cache | Pending |
| Type safety | Typecheck has zero errors | Pass — `npm run typecheck` |
| Lint | Configured source lint has zero errors/warnings or reviewed exceptions | Pass — `npm run lint` |
| Tests | Unit/integration pass; skips enumerated and justified | Pass — `npm test`: 27 files, 668 passed, 29 skipped because required external AI credentials were absent |
| Build/package | Production build, pack dry-run, public import smoke | Pass — `npm run build` and `npm run package:check` (739985-byte package imported) |
| Dependencies | Production critical/high zero; SBOM retained | Pass for audit threshold — `npm run audit:prod`: 0 vulnerabilities; SBOM still pending |
| Browser | Chromium, Firefox, WebKit workflows pass | Pass — `npm run test:e2e`: 30 passed (10 per engine) |
| UI inventory | Every enabled action tested; unsupported actions disabled | Pass — browser inventory test plus exact disabled-reason/title/description contract |
| Accessibility | Automated serious/critical zero plus manual keyboard review | Partial — all browser axe checks have zero serious/critical findings and keyboard skip/scroll behavior passes; manual review pending |
| Format import | Reference fixtures, corruption, and atomic failure | Pending |
| Digitizer | Frozen waveform fidelity and failure-state thresholds | Pending |
| Clinical safety | Independent critic accepts safe-failure behavior | Pending |
| Clinical validity | Independent adjudicated measurement/finding evidence | External blocker |
| ML validity | Locked retrained artifact plus independent multicenter results | External blocker |
| Privacy/security | Threat model, no-secrets/no-PHI tests, review | Partial — production audit passes and browser test blocks external analysis networking; independent review pending |
| Operations | Deploy, health, monitoring, backup/restore, rollback drill | Pending |
| Documentation | Intended use, limitations, runbooks, claims aligned | Pending |
| PR | Required checks pass and review findings resolved | Pending |
| Post-merge | Exact `main` merge SHA reverified | Pending |

The repository can become an engineering candidate while clinical-validity and
ML-validity remain blocked. It cannot be called a routine clinical release.

## Exact command record

- `npm run test:e2e` — 30 passed in 17.1 seconds across Chromium, Firefox, and
  WebKit.
- `npm test` — 668 passed, 29 skipped; skips are external-AI tests gated on
  unavailable API keys and are not evidence of ML validity.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run audit:prod`,
  `npm run package:check`, and `npm run lfs:verify` — all passed; the audit
  reported 0 vulnerabilities and LFS verification reported 10 artifacts.
