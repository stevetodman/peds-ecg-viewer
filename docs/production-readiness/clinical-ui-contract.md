# Clinical Interpretation UI Migration Contract

The interpretation API is intentionally fail-closed. UI work must consume this
contract before rendering an automated result.

## Measurements and provenance

- `hr`, `rr`, `pr`, `qrs`, `qt`, `qtc`, `pAxis`, `qrsAxis`, and `tAxis` are
  `number | null`. `null` means unavailable, never zero, an age-based estimate,
  or a display placeholder.
- `measurementProvenance` contains one entry for every field. Its `source` is
  `detected`, `derived`, `reported`, or `unavailable`; show its method/reason in a details
  view. A value with `source: unavailable` must be rendered as unavailable.
- P- and T-axis are unavailable until those waves are independently delineated.
  Do not copy the QRS axis into either display field.

## Interpretation status

- A result containing `ANALYSIS_INCOMPLETE` is not reassuring. It must retain
  the supplied conclusion/urgency and visibly show an inconclusive/limited
  analysis state; it must never be styled, labelled, or exported as “normal”.
- `RATE_HIGH` and `RATE_LOW` report ventricular rate relative to age only. They
  must not be relabelled as sinus tachycardia/bradycardia.
- `VENTRICULAR_PREEXCITATION`, `POSSIBLE_PREEXCITATION`, and
  `BRUGADA_PATTERN` are automated pattern flags, not diagnoses. Preserve the
  supplied cautionary text and clinical-review affordance.

## Rhythm evidence

Absent independently assessed rhythm input yields `origin: unknown`,
`regular: null`, `pWaveMorphology: unknown`, and `avRelationship: unknown`.
The UI must render those states as unknown and must not infer sinus origin,
regularity, P-wave status, or 1:1 AV conduction from rate or intervals.

## Compatibility

Consumers that previously assumed numeric measurements or a default sinus
rhythm must migrate before using this API. Treat the nullable fields and
per-field provenance as required data, preserve finding codes verbatim, and
route unsupported/adult ages to an explicit unsupported-age state rather than
calling pediatric interpretation.
