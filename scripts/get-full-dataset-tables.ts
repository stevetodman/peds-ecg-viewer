#!/usr/bin/env npx tsx
import { readFileSync } from 'fs';
const data = JSON.parse(readFileSync('./data/zzu-pecg/validation_results_full.json', 'utf8'));

const limbSwapTypes = ['LA_RA', 'LA_LL', 'RA_LL'];
const ageGroups = ['Neonate (0-30d)', 'Infant (1-12mo)', 'Toddler (1-3yr)', 'Child (3-12yr)', 'Adolescent (12+yr)'];

const originals = data.details.filter((d: any) => d.isSwapped === false);
const swapped = data.details.filter((d: any) => d.isSwapped === true);

function wilsonCI(successes: number, n: number): [number, number] {
  const p = successes / n;
  const z = 1.96;
  const denom = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denom;
  const spread = (z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / denom;
  return [Math.max(0, center - spread), Math.min(1, center + spread)];
}

console.log('TABLE 3: SPECIFICITY BY AGE GROUP (Limb-lead FPs only)');
console.log('| Age Group | N | Specificity | 95% CI |');
console.log('|-----------|---|-------------|--------|');

let totalN = 0;
let totalFP = 0;

for (const group of ageGroups) {
  const grp = originals.filter((d: any) => d.ageGroup === group);
  const n = grp.length;
  const fp = grp.filter((d: any) => d.adultDetected && limbSwapTypes.includes(d.adultSwapType)).length;
  const spec = ((n - fp) / n) * 100;
  const [ciLow, ciHigh] = wilsonCI(n - fp, n);
  const label = group.replace(' (0-30d)', '').replace(' (1-12mo)', '').replace(' (1-3yr)', '').replace(' (3-12yr)', '').replace(' (12+yr)', '');
  console.log('| ' + label + ' | ' + n.toLocaleString() + ' | ' + spec.toFixed(1) + '% (' + (n-fp).toLocaleString() + '/' + n.toLocaleString() + ') | ' + (ciLow*100).toFixed(1) + '–' + (ciHigh*100).toFixed(1) + '% |');
  totalN += n;
  totalFP += fp;
}
const totalSpec = ((totalN - totalFP) / totalN) * 100;
const [totalCILow, totalCIHigh] = wilsonCI(totalN - totalFP, totalN);
console.log('| **Overall** | **' + totalN.toLocaleString() + '** | **' + totalSpec.toFixed(1) + '% (' + (totalN-totalFP).toLocaleString() + '/' + totalN.toLocaleString() + ')** | **' + (totalCILow*100).toFixed(1) + '–' + (totalCIHigh*100).toFixed(1) + '%** |');

console.log();
console.log('TABLE 4: SENSITIVITY BY AGE GROUP');
console.log('| Age Group | N (swaps) | Sensitivity | 95% CI |');
console.log('|-----------|-----------|-------------|--------|');

let totalSwap = 0;
let totalDet = 0;

for (const group of ageGroups) {
  const grp = swapped.filter((d: any) => d.ageGroup === group);
  const n = grp.length;
  const det = grp.filter((d: any) => d.adultDetected).length;
  const sens = (det / n) * 100;
  const [ciLow, ciHigh] = wilsonCI(det, n);
  const label = group.replace(' (0-30d)', '').replace(' (1-12mo)', '').replace(' (1-3yr)', '').replace(' (3-12yr)', '').replace(' (12+yr)', '');
  console.log('| ' + label + ' | ' + n.toLocaleString() + ' | ' + sens.toFixed(1) + '% (' + det.toLocaleString() + '/' + n.toLocaleString() + ') | ' + (ciLow*100).toFixed(1) + '–' + (ciHigh*100).toFixed(1) + '% |');
  totalSwap += n;
  totalDet += det;
}
const totalSens = (totalDet / totalSwap) * 100;
const [sensCILow, sensCIHigh] = wilsonCI(totalDet, totalSwap);
console.log('| **Overall** | **' + totalSwap.toLocaleString() + '** | **' + totalSens.toFixed(1) + '% (' + totalDet.toLocaleString() + '/' + totalSwap.toLocaleString() + ')** | **' + (sensCILow*100).toFixed(1) + '–' + (sensCIHigh*100).toFixed(1) + '%** |');

console.log();
console.log('SENSITIVITY BY SWAP TYPE:');
console.log('| Swap Type | N | Sensitivity | 95% CI |');
console.log('|-----------|---|-------------|--------|');
for (const swapType of limbSwapTypes) {
  const grp = swapped.filter((d: any) => d.swapType === swapType);
  const n = grp.length;
  const det = grp.filter((d: any) => d.adultDetected).length;
  const sens = (det / n) * 100;
  const [ciLow, ciHigh] = wilsonCI(det, n);
  console.log('| ' + swapType + ' | ' + n.toLocaleString() + ' | ' + sens.toFixed(1) + '% (' + det.toLocaleString() + '/' + n.toLocaleString() + ') | ' + (ciLow*100).toFixed(1) + '–' + (ciHigh*100).toFixed(1) + '% |');
}

console.log();
console.log('CONFUSION MATRIX:');
const TP = totalDet;
const FN = totalSwap - totalDet;
const FP = totalFP;
const TN = totalN - totalFP;
console.log('TP: ' + TP + ', FN: ' + FN + ', FP: ' + FP + ', TN: ' + TN);
console.log();
console.log('Sensitivity: ' + (TP / (TP + FN) * 100).toFixed(1) + '%');
console.log('Specificity: ' + (TN / (TN + FP) * 100).toFixed(1) + '%');

// PPV calculations at different prevalence
console.log();
console.log('PPV AT DIFFERENT PREVALENCE:');
const sensitivity = TP / (TP + FN);
const specificity = TN / (TN + FP);
for (const prev of [0.005, 0.02, 0.04, 0.10]) {
  const ppv = (sensitivity * prev) / (sensitivity * prev + (1 - specificity) * (1 - prev));
  const npv = (specificity * (1 - prev)) / (specificity * (1 - prev) + (1 - sensitivity) * prev);
  console.log('Prevalence ' + (prev * 100).toFixed(1) + '%: PPV=' + (ppv * 100).toFixed(1) + '%, NPV=' + (npv * 100).toFixed(1) + '%');
}
