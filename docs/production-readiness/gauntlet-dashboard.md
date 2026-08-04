# Production Readiness Gauntlet Dashboard

Baseline date: 2026-08-03
Baseline source: `main` at `05db49c430cebe223e299cf92862c1ca3d464637`
Integration branch: `agent/production-readiness-recovery`

## Current state

| Gate | Baseline | Required state | Evidence |
|---|---:|---:|---|
| Clean clone | Fail: missing Git LFS object | Pass | Pending recovery rerun |
| Typecheck | 12 errors | Pass | Pending recovery rerun |
| Production build | Fail | Pass | Pending recovery rerun |
| Source lint | 363 errors, 146 warnings | Pass | Pending recovery rerun |
| Tests | 4 failed, 814 passed, 29 skipped | Pass with justified skips | Pending recovery rerun |
| Production audit | 1 critical, 1 moderate | No critical/high | Pending recovery rerun |
| Real-browser UI | Absent | Every enabled action and state | Pending recovery rerun |
| CI | Absent | Required checks on each PR | Pending recovery rerun |
| Clinical measurement validation | Not established | Frozen independent evidence | External evidence required |
| Interpretation validation | Not established | Per-finding performance/errors | External evidence required |
| Digitizer validation | Failing round-trip tests | Frozen fidelity thresholds | Pending recovery rerun |
| ML external validation | Material domain shift documented | Independent evidence | External evidence required |
| Security/privacy | Not established | Threat model and controls | Pending |
| Accessibility | No systematic evidence | Browser WCAG evidence | Pending |
| Backup/restore/rollback | Not established | Demonstrated | Pending |

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
