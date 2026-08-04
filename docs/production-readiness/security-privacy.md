# Security and Privacy Gate

## Data classification

ECG waveforms, images, DICOM/XML metadata, patient demographics, identifiers,
free text, filenames, audit events, exports, and screenshots are treated as
sensitive health data unless an approved de-identification process proves
otherwise. “Research” is not a de-identification state.

## Mandatory controls

- No patient data is persisted by the browser in `localStorage`, IndexedDB,
  cookies, caches, or service workers. Session snapshots are memory-only and
  atomically bind demographics, waveform, measurements, provenance, and source.
- No ECG image, waveform, or metadata leaves the browser or process without an
  explicit per-request authorization that identifies the provider/destination
  and attests that the approved PHI review has occurred.
- Browser code never contains or forwards third-party provider API keys.
- External AI is disabled by default. Absence, expiry, mismatch, or malformed
  authorization fails before image encoding or network activity.
- Imported strings are rendered with DOM text APIs or context-appropriate
  escaping. Error messages do not echo secrets, raw provider responses, or PHI.
- Model endpoints require authentication, bounded requests, strict schemas,
  explicit units/age/sample rate, origin allowlists, and integrity-checked
  versioned artifacts.
- Logs use stable event codes and non-sensitive operational metadata. A browser
  `localStorage` log is not an immutable clinical audit record.

## Deployment blockers

Before any clinical-validation deployment, the owner must document and test:

1. Data-flow diagram and threat model for the exact deployment.
2. Identity, authorization, session expiry, and least-privilege roles.
3. Encryption in transit/at rest and secret rotation.
4. Retention, deletion, legal hold, backup, restore, and incident response.
5. Vendor agreements and approved uses for every external processor.
6. Dependency, SAST, DAST, secret, and container/infrastructure scanning.
7. Penetration testing and remediation of critical/high findings.
8. Audit-log integrity, clock synchronization, access review, and alerting.

Passing repository tests demonstrates code behavior only; it does not certify
HIPAA compliance, regulatory clearance, or institutional approval.
