# Production Readiness Risk Register

| ID | Risk | Severity | Release disposition |
|---|---|---:|---|
| CLIN-001 | Silent default intervals/axes become findings | Critical | Eliminate; unavailable plus provenance |
| CLIN-002 | Normal strictness narrows in wrong direction | Critical | Correct; boundary/property tests |
| CLIN-003 | Rhythm unconditionally sinus/regular/1:1 | Critical | Require evidence or unknown |
| CLIN-004 | High-risk morphology language exceeds evidence | Critical | Constrain criteria and language |
| CLIN-005 | Weak integration tests accept false critical findings | Critical | Discriminating assertions |
| DATA-001 | Format loaders lack reference round-trip evidence | High | Fixtures, conformance, corruption tests |
| DIGI-001 | Digitizer claims contradict failing tests | Critical | Quarantined from release lint, release test command, and user workflow; `npm run test:digitizer:research` retains frozen thresholds before re-enablement |
| ML-001 | Missing LFS objects prevent reproducibility | High | Remove/record unrecoverable pointers; gate ML |
| ML-002 | Hybrid model uses zero rule features | High | Eliminate substitution; retrain |
| ML-003 | External performance approaches chance | Critical | No clinical claim without new evidence |
| ML-004 | Duration warping/z-scoring alter signal meaning | Critical | Versioned time-aware preprocessing; retrain |
| PRIV-001 | ECG images can reach external AI before PHI controls | Critical | Local first; explicit enforced gate |
| SEC-001 | Injection or unauthenticated actions | Critical | Safe rendering and real access control |
| SEC-002 | Known dependency vulnerabilities | High | Upgrade/replace and audit |
| UI-001 | Visible controls are stubs | High | Implement, remove, or disable truthfully |
| UI-002 | Demographics can pair with wrong waveform | Critical | Atomic snapshot or no persistence claim |
| UI-003 | Accessibility/browser behavior unverified | High | Automated and manual browser evidence |
| OPS-001 | No CI, monitoring, recovery, rollback evidence | High | Demonstrated controls |
| RES-001 | Manuscript language exceeds evidence | High | Reanalyze and align conclusions |

Severity does not mean resolution. Each disposition needs raw evidence and an
independent critic decision.
