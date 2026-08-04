# Production Readiness Gauntlet Dashboard

Baseline date: 2026-08-03
Baseline source: `main` at `05db49c430cebe223e299cf92862c1ca3d464637`
Integration branch: `agent/production-readiness-recovery`
Latest engineering evidence: 2026-08-04 on
`6acf0024f4b21c82d47c21f9dedb23cfc06f7b89`

## Current state

| Gate | Baseline | Required state | Evidence |
|---|---:|---:|---|
| Clean clone | Fail: missing Git LFS object | Pass | Still pending a clean-clone run; pointer metadata is now verified |
| Typecheck | 12 errors | Pass | Pass: `npm run typecheck` (zero errors) |
| Production build | Fail | Pass | Pass: `npm run build`; Vite built 90 modules |
| Source lint | 363 errors, 146 warnings | Pass | Pass: `npm run lint` (zero findings) |
| Tests | 4 failed, 814 passed, 29 skipped | Pass with justified skips | Pass: `npm test` — 27 files, 668 passed, 29 credential-gated external-AI skips |
| Production audit | 1 critical, 1 moderate | No critical/high | Pass: `npm run audit:prod` — 0 vulnerabilities |
| Package smoke | Not established | Packed import succeeds | Pass: `npm run package:check` — 739985-byte tarball imported |
| Git LFS metadata | Missing object risk | Every declared artifact verified | Pass: `npm run lfs:verify` — 10 pointer artifacts verified |
| Real-browser UI | Absent | Every enabled action and state | Pass: `npm run test:e2e` — 30 tests across Chromium, Firefox, and WebKit |
| CI | Absent | Required checks on each PR | Pending recovery rerun |
| Clinical measurement validation | Not established | Frozen independent evidence | External evidence required |
| Interpretation validation | Not established | Per-finding performance/errors | External evidence required |
| Digitizer validation | Failing round-trip tests | Frozen fidelity thresholds | Still blocked; research-only validation is not a release gate |
| ML external validation | Material domain shift documented | Independent evidence | External evidence required |
| Security/privacy | Not established | Threat model and controls | Pending |
| Accessibility | No systematic evidence | Browser WCAG evidence | Automated browser evidence passes: 30-browser test suite includes keyboard navigation and zero serious/critical axe findings in three UI states; manual review remains pending |
| Backup/restore/rollback | Not established | Demonstrated | Pending |

## 2026-08-04 raw engineering evidence

- `npm run test:e2e`: 30 passed in 17.1 seconds (10 workflows each in
  Chromium, Firefox, and WebKit).
- `npm test`: 27 files passed; 668 passed and 29 skipped tests. The skipped
  AI-provider/comparison/real-world cases require absent external API keys and
  do not establish clinical or ML validity.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run audit:prod`,
  `npm run package:check`, and `npm run lfs:verify` all exited successfully.
- The WebKit run proves physical `Tab` then `Enter` activation of the skip link
  and Arrow-key movement of the waveform scroll region; neither control is
  focused programmatically by that test.

## Evidence rules

- Builders do not accept their own work.
- Critics inspect the artifact and raw results, not summaries.
- Tests may be replaced only with more discriminating acceptance criteria.
- An unavailable external study remains a blocker, not a documentation task.
- Release evidence identifies the exact commit that produced it.

## Merge rule

The work is not complete on a local branch or open pull request. The exact merge
commit on `main` must pass post-merge build, test, security, and critical
browser verification.
