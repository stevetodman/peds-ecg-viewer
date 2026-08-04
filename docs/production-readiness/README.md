# Production Readiness Program

## Target state

This repository is being prepared for independent, IRB-governed clinical
validation. It is not cleared or validated for routine patient care.

The target is a reproducible pediatric ECG platform whose supported inputs,
waveform rendering, measurements, interpretations, digitization, and optional
machine-learning outputs are each backed by versioned evidence. Features that
cannot meet their acceptance bar remain outside the clinical path and are
unmistakably experimental.

## Intended-use boundary

This program covers engineering and evidence readiness for a controlled
clinical-validation study. It does not substitute for prospective multicenter
validation, institutional governance, regulatory determination, business
associate agreements, or postmarket surveillance.

## Safety invariants

- Never silently substitute a normal value when a measurement cannot be made.
- Never present derived, estimated, imported, or manually entered values as
  direct measurements.
- Never assert sinus origin, regularity, P-wave morphology, or AV association
  without supporting evidence.
- Fail closed for corrupt, incomplete, unsupported, low-quality, or
  out-of-distribution input.
- Preserve patient-to-waveform identity across import, persistence, comparison,
  export, and recovery.
- Keep experimental digitizer, interpretation, and ML output outside the
  clinical path until each function passes frozen acceptance criteria.
- Do not transmit an ECG image or metadata externally before approved PHI
  controls and deployment agreements are in force.
- Every material product and manuscript claim must point to reproducible,
  versioned evidence.

## Required evidence

Release evidence includes clean-clone reproducibility; deterministic build and
deployment; unit, integration, contract, property, mutation, visual, and
real-browser tests; reference-format round trips; waveform fidelity;
measurement agreement; clinical error analysis; accessibility; security and
privacy review; load and recovery testing; and an independent release report.

Every visible UI action must either work end to end or be removed. Component or
DOM-emulation tests do not replace browser tests of the running application.

## Release states

1. **Experimental** — development only; no clinical claims.
2. **Engineering candidate** — reproducible and technically tested, without
   sufficient independent clinical evidence.
3. **Clinical-validation candidate** — engineering, security, privacy, UI, and
   frozen clinical-validation gates pass.
4. **Routine clinical release** — requires separate external clinical,
   institutional, legal, and regulatory authorization.
