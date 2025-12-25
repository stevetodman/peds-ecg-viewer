# Peds ECG Viewer

**Pediatric ECG Viewer with Age-Adjusted Interpretation**

A TypeScript library for rendering and interpreting pediatric ECG/EKG outputs with comprehensive age-specific normal values from published peer-reviewed literature.

## Features

- **Standard ECG Rendering**: Clean, professional 12-lead ECG display
- **Pediatric Focus**: 12 age groups from neonate to adolescent with published reference data
- **Complete Measurements**: Heart rate, PR, QRS, QT/QTc, axes, and voltage criteria
- **Age-Adjusted Interpretation**: Automatic flagging based on pediatric normal ranges
- **Multiple Export Formats**: PNG (various DPIs) and PDF
- **ZZU pECG Dataset**: Includes 24 sample pediatric ECGs with expert diagnoses
- **ML Screening**: Deep learning model for CHD, Kawasaki, and Cardiomyopathy detection

## Installation

```bash
npm install peds-ecg-viewer
```

## Quick Start

```typescript
import {
  getNormalsForAge,
  getAgeGroup,
  classifyValue,
  ageToDays,
} from 'peds-ecg-viewer';

// Get age group for a 6-month-old
const ageDays = ageToDays(6, 'months');
const ageGroup = getAgeGroup(ageDays);
console.log(ageGroup.label); // "6-12 months"

// Get normal values for this age
const normals = getNormalsForAge(ageDays);
console.log(normals.heartRate.p50); // 135 (median HR for this age)

// Check if a measurement is normal
const hrClassification = classifyValue(150, normals.heartRate);
console.log(hrClassification); // "normal"
```

## Demo

Run the interactive demo:

```bash
npm run dev
# Open http://localhost:5173/demo.html
```

## Age Groups

| Group | Age Range | Key ECG Features |
|-------|-----------|------------------|
| Neonate | 0-30 days | RV dominance, high HR, rightward axis |
| Infant | 1-12 months | Transition to LV dominance |
| Toddler | 1-3 years | Adult-like axis, high voltages |
| Child | 3-12 years | Juvenile T-wave pattern |
| Adolescent | 12-18 years | Near-adult patterns |

## Project Structure

```
peds-ecg-viewer/
├── src/
│   ├── types/          # TypeScript type definitions
│   ├── config/         # Muse specification constants
│   ├── data/           # Pediatric normal values
│   ├── signal/         # ECG signal processing & loaders
│   ├── renderer/       # Canvas rendering components
│   └── calipers.ts     # Measurement tool
├── json_ecgs/          # Sample ZZU pECG dataset
├── tests/              # Test suites
└── demo.html           # Interactive demo application
```

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Build
npm run build
```

## ML Screening

The viewer integrates a deep learning model for pediatric cardiac screening:

| Condition | AUROC | 95% CI |
|-----------|-------|--------|
| CHD | 0.848 | 0.827-0.867 |
| Kawasaki | 0.856 | 0.813-0.893 |
| Cardiomyopathy | 0.902 | 0.849-0.949 |

### Start ML Server

```bash
python -m ml.serve
# API runs on http://localhost:5050
```

See [ml/README.md](ml/README.md) for API documentation.

## Dataset Attribution

This project includes sample ECGs from the **ZZU pECG Dataset**:

> Wang Y, Li J, Zhao Y, et al. "A pediatric ECG database with disease diagnosis covering 11,643 children." *Scientific Data* 12, 867 (2025).
> https://doi.org/10.1038/s41597-025-05225-z

The ZZU pECG dataset contains 14,190 pediatric ECG records from 11,643 children (ages 0-14) collected at the First Affiliated Hospital of Zhengzhou University. It includes 19 categories of pediatric cardiovascular diseases with ICD-10 and AHA diagnostic codes.

## Pediatric Normal Values References

Normal values are derived from published peer-reviewed literature:

1. **Davignon A**, Rautaharju P, Boisselle E, et al. "Normal ECG standards for infants and children." *Pediatric Cardiology* 1979/80; 1:123-131.

2. **Rijnbeek PR**, Witsenburg M, Schrama E, et al. "New normal limits for the paediatric electrocardiogram." *European Heart Journal* 2001; 22:702-711. https://doi.org/10.1053/euhj.2000.2399

3. **Schwartz PJ**, Garson A Jr, Paul T, et al. "Guidelines for the interpretation of the neonatal electrocardiogram." *European Heart Journal* 2002; 23:1329-1344. https://doi.org/10.1053/euhj.2002.3274

4. **Macfarlane PW**, Lawrie TDV, eds. *Comprehensive Electrocardiology*. 2nd ed. Springer; 2010.

## License

Copyright 2024 Steven Todman

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

## Disclaimer

This software is for **educational and research purposes only**. It is **not** FDA cleared, CE marked, or intended for clinical diagnosis. Do not use for medical decision-making. Always consult qualified healthcare professionals.

The ZZU pECG dataset is used under its published terms for scientific research. All patient data has been de-identified and ethics-approved for public use.
