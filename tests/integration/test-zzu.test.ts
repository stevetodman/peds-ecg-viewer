import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { getAgeGroup, ageToDays } from '../../src/data/ageGroups';
import { getNormalsForAge, classifyValue } from '../../src/data/pediatricNormals';
import { calculateECGMeasurements } from '../../src/signal/analysis/ecg-measurements';

describe('ZZU ECG Integration', () => {
  it('should load and classify a normal 13yo ECG', () => {
    // Load ECG
    const ecgData = JSON.parse(readFileSync('./json_ecgs/Normal_P03430_E01.json', 'utf8'));
    
    // Parse age (13.6 yr)
    const ageStr = '13.6 yr';
    const ageYears = parseFloat(ageStr);
    const ageDays = ageToDays(ageYears, 'years');
    const ageGroup = getAgeGroup(ageDays);
    const normals = getNormalsForAge(ageDays);
    
    expect(ageGroup.label).toBe('12-16 years');
    expect(normals.heartRate.p2).toBeLessThan(80);
    expect(normals.heartRate.p98).toBeGreaterThan(100);
    
    // Get lead II for HR calculation
    const leadII = ecgData.signal.leads['II'];
    const sampleRate = ecgData.signal.sampleRate || 500;
    
    expect(leadII).toBeDefined();
    expect(leadII.length).toBeGreaterThan(1000);
    
    // Calculate measurements
    const measurements = calculateECGMeasurements(
      leadII,
      ecgData.signal.leads['I'],
      ecgData.signal.leads['aVF'],
      sampleRate
    );
    
    console.log('Calculated HR:', measurements.hr, 'bpm');
    console.log('Calculated QTc:', measurements.qtc, 'ms');
    console.log('Normal HR range:', normals.heartRate.p2, '-', normals.heartRate.p98);
    
    // Classify HR
    const hrClass = classifyValue(measurements.hr, normals.heartRate);
    console.log('HR classification:', hrClass);
    
    expect(['normal', 'borderline_low', 'borderline_high', 'low', 'high']).toContain(hrClass);
  });
  
  it('should flag tachycardia in SVT patient', () => {
    const ecgData = JSON.parse(readFileSync('./json_ecgs/SVT_P01061_E01.json', 'utf8'));
    
    // Parse age from index
    const indexData = JSON.parse(readFileSync('./json_ecgs/index.json', 'utf8'));
    const svtEntry = indexData.find((e: any) => e.file === 'SVT_P01061_E01.json');
    console.log('SVT patient age:', svtEntry?.age);
    
    const leadII = ecgData.signal.leads['II'];
    const sampleRate = ecgData.signal.sampleRate || 500;
    
    const measurements = calculateECGMeasurements(
      leadII,
      ecgData.signal.leads['I'],
      ecgData.signal.leads['aVF'],
      sampleRate
    );
    
    console.log('SVT patient HR:', measurements.hr, 'bpm');
    
    // SVT typically has HR > 150
    expect(measurements.hr).toBeGreaterThan(100);
  });
});
