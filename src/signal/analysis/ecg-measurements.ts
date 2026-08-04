/**
 * ECG Measurement Calculation Module
 *
 * Calculates heart rate, intervals (PR, QRS, QT), and axes from ECG signals.
 * Uses standard ECG analysis algorithms adapted for pediatric ECGs.
 *
 * @module signal/analysis/ecg-measurements
 */

export interface ECGMeasurements {
  hr: number | null;           // Heart rate (bpm)
  rr: number | null;           // R-R interval (ms)
  pr: number | null;           // PR interval (ms)
  qrs: number | null;          // QRS duration (ms)
  qt: number | null;           // QT interval (ms)
  qtc: number | null;          // Corrected QT (Bazett's formula)
  pAxis: number | null;        // P wave axis (degrees)
  qrsAxis: number | null;      // QRS axis (degrees)
  tAxis: number | null;        // T wave axis (degrees)
  provenance: MeasurementProvenance;
}

/** `reported` means a caller supplied a value without detector provenance. */
export type MeasurementSource = 'detected' | 'derived' | 'reported' | 'unavailable';

export interface MeasurementEvidence {
  source: MeasurementSource;
  method: string;
  reason?: string;
  beatsUsed?: number;
}

export type MeasurementProvenance = Record<
  'hr' | 'rr' | 'pr' | 'qrs' | 'qt' | 'qtc' | 'pAxis' | 'qrsAxis' | 'tAxis',
  MeasurementEvidence
>;

export interface RWaveDetection {
  index: number;        // Sample index of R peak
  amplitude: number;    // Amplitude of R peak
  rr: number;           // R-R interval to previous beat (ms)
}

/**
 * Detect R waves using a simple peak detection algorithm
 * Based on Pan-Tompkins inspired approach (simplified)
 */
export function detectRWaves(
  samples: number[],
  sampleRate: number,
  _minHR: number = 40,
  maxHR: number = 250
): RWaveDetection[] {
  if (!samples || samples.length < sampleRate) {
    return [];
  }

  const rWaves: RWaveDetection[] = [];

  // Calculate derivative to find steep slopes (QRS complexes have steep slopes)
  const derivative: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    derivative.push(Math.abs(samples[i] - samples[i - 1]));
  }

  // Square the derivative to emphasize large slopes
  const squared = derivative.map(d => d * d);

  // Moving average window (150ms is typical for QRS)
  const windowSize = Math.round(0.15 * sampleRate);
  const movingAvg: number[] = [];

  for (let i = 0; i < squared.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - windowSize); j <= Math.min(squared.length - 1, i + windowSize); j++) {
      sum += squared[j];
      count++;
    }
    movingAvg.push(sum / count);
  }

  // Find threshold (adaptive based on signal)
  const maxVal = Math.max(...movingAvg);
  const threshold = maxVal * 0.3;

  // Minimum distance between R peaks based on max HR
  const minDistance = Math.round((60 / maxHR) * sampleRate);

  // Find peaks above threshold
  let lastPeakIdx = -minDistance;

  for (let i = windowSize; i < movingAvg.length - windowSize; i++) {
    if (movingAvg[i] > threshold &&
        movingAvg[i] > movingAvg[i - 1] &&
        movingAvg[i] >= movingAvg[i + 1] &&
        i - lastPeakIdx >= minDistance) {

      // Find the actual R peak (maximum in original signal near this point)
      const searchStart = Math.max(0, i - windowSize);
      const searchEnd = Math.min(samples.length - 1, i + windowSize);

      let peakIdx = i;
      let peakVal = samples[i];

      for (let j = searchStart; j <= searchEnd; j++) {
        if (samples[j] > peakVal) {
          peakVal = samples[j];
          peakIdx = j;
        }
      }

      // Calculate R-R interval
      const rr = rWaves.length > 0
        ? ((peakIdx - rWaves[rWaves.length - 1].index) / sampleRate) * 1000
        : 0;

      rWaves.push({
        index: peakIdx,
        amplitude: peakVal,
        rr: rr
      });

      lastPeakIdx = peakIdx;
    }
  }

  return rWaves;
}

/**
 * Calculate heart rate from R-R intervals
 */
export function calculateHeartRate(rWaves: RWaveDetection[]): number | null {
  if (rWaves.length < 2) {
    return null;
  }

  // Use median R-R interval to be robust against outliers
  const rrIntervals = rWaves.slice(1).map(r => r.rr).filter(rr => rr > 0);

  if (rrIntervals.length === 0) {
    return null;
  }

  rrIntervals.sort((a, b) => a - b);
  const medianRR = rrIntervals[Math.floor(rrIntervals.length / 2)];

  // HR = 60000 / RR (ms)
  return Math.round(60000 / medianRR);
}

/**
 * Calculate QRS duration by finding the width of QRS complexes
 */
export function calculateQRSDuration(
  samples: number[],
  sampleRate: number,
  rWaves: RWaveDetection[]
): number | null {
  if (
    !Number.isFinite(sampleRate) || sampleRate <= 0 ||
    !Array.isArray(samples) || samples.length === 0 ||
    samples.some(value => !Number.isFinite(value)) ||
    rWaves.length < 2
  ) {
    return null;
  }

  const qrsDurations: number[] = [];

  for (const rWave of rWaves) {
    const searchRadius = Math.round(0.1 * sampleRate); // 100ms around R peak

    // Find Q wave onset (first upward inflection before R)
    let qOnset = rWave.index;
    for (let i = rWave.index - 1; i >= Math.max(0, rWave.index - searchRadius); i--) {
      if (samples[i] < samples[i + 1] && samples[i] <= samples[Math.max(0, i - 1)]) {
        qOnset = i;
        break;
      }
    }

    // Find S wave end (return to baseline after S)
    let sEnd = rWave.index;
    const baseline = samples[qOnset];
    for (let i = rWave.index + 1; i <= Math.min(samples.length - 1, rWave.index + searchRadius); i++) {
      if (Math.abs(samples[i] - baseline) < Math.abs(samples[i - 1] - baseline)) {
        sEnd = i;
        break;
      }
    }

    const qrsDurationMs = ((sEnd - qOnset) / sampleRate) * 1000;

    // Reasonable QRS is between 40-200ms
    if (qrsDurationMs >= 40 && qrsDurationMs <= 200) {
      qrsDurations.push(qrsDurationMs);
    }
  }

  // A single eligible beat is not enough to support a representative QRS
  // duration. Fail closed instead of reporting a fragile value.
  if (qrsDurations.length < 2) {
    return null;
  }

  // Return median
  qrsDurations.sort((a, b) => a - b);
  return Math.round(qrsDurations[Math.floor(qrsDurations.length / 2)]);
}

/**
 * Calculate PR interval (P wave onset to QRS onset)
 * Simplified approach - estimates based on typical ratios
 */
export function calculatePRInterval(
  _samples: number[],
  _sampleRate: number,
  rWaves: RWaveDetection[]
): number | null {
  // PR requires a validated P-wave onset and QRS onset. Heart-rate-based
  // substitution fabricates conduction evidence and is therefore prohibited.
  void rWaves;
  return null;
}

/**
 * Calculate QT interval (QRS onset to T wave end)
 */
export function calculateQTInterval(
  samples: number[],
  sampleRate: number,
  rWaves: RWaveDetection[],
  qrsDuration: number | null
): number | null {
  if (
    qrsDuration === null || !Number.isFinite(qrsDuration) || qrsDuration <= 0 ||
    !Number.isFinite(sampleRate) || sampleRate <= 0 ||
    !Array.isArray(samples) || samples.length === 0 || samples.some(value => !Number.isFinite(value))
  ) {
    return null;
  }
  if (rWaves.length < 2) {
    return null;
  }

  const qtIntervals: number[] = [];

  for (let i = 0; i < rWaves.length - 1; i++) {
    const rWave = rWaves[i];
    const nextRWave = rWaves[i + 1];

    // QRS onset (estimate based on QRS duration)
    const qrsOnset = rWave.index - Math.round((qrsDuration / 1000) * sampleRate * 0.4);
    if (qrsOnset <= 0 || qrsOnset >= samples.length) continue;

    // Search for T wave end between this R wave and next R wave
    const searchStart = rWave.index + Math.round(0.15 * sampleRate); // After S wave
    const searchEnd = Math.min(
      nextRWave.index - Math.round(0.05 * sampleRate),
      rWave.index + Math.round(0.6 * sampleRate) // Max 600ms after R
    );

    if (searchEnd <= searchStart) continue;

    // Find the end of T wave (where signal returns to baseline)
    const baselineRegion = samples.slice(
      Math.max(0, qrsOnset - Math.round(0.05 * sampleRate)),
      qrsOnset
    );
    if (baselineRegion.length === 0) continue;
    const baseline = baselineRegion.reduce((a, b) => a + b, 0) / baselineRegion.length;

    // Find T wave peak first
    let tPeakIdx = searchStart;
    let tPeakVal = Math.abs(samples[searchStart] - baseline);

    for (let j = searchStart; j < searchEnd; j++) {
      const deviation = Math.abs(samples[j] - baseline);
      if (deviation > tPeakVal) {
        tPeakVal = deviation;
        tPeakIdx = j;
      }
    }

    // Find T wave end (return to near baseline after T peak)
    let tEnd = tPeakIdx;
    for (let j = tPeakIdx; j < searchEnd; j++) {
      if (Math.abs(samples[j] - baseline) < tPeakVal * 0.1) {
        tEnd = j;
        break;
      }
    }

    const qtMs = ((tEnd - qrsOnset) / sampleRate) * 1000;

    // Reasonable QT is between 200-600ms
    if (qtMs >= 200 && qtMs <= 600) {
      qtIntervals.push(qtMs);
    }
  }

  if (qtIntervals.length < 2) {
    return null;
  }

  // Return median
  qtIntervals.sort((a, b) => a - b);
  return Math.round(qtIntervals[Math.floor(qtIntervals.length / 2)]);
}

/**
 * Calculate QTc using Bazett's formula
 * QTc = QT / sqrt(RR in seconds)
 */
export function calculateQTc(qt: number | null, rr: number | null): number | null {
  if (qt === null || rr === null || !Number.isFinite(qt) || !Number.isFinite(rr) || rr <= 0) {
    return null;
  }
  const rrSeconds = rr / 1000;
  return Math.round(qt / Math.sqrt(rrSeconds));
}

/**
 * Calculate electrical axis from leads I and aVF
 * Uses the hexaxial reference system
 */
export function calculateAxis(leadI: number[], leadAVF: number[]): number | null {
  if (!leadI || !leadAVF || leadI.length === 0 || leadAVF.length === 0) {
    return null;
  }

  if (leadI.length !== leadAVF.length || leadI.some(v => !Number.isFinite(v)) || leadAVF.some(v => !Number.isFinite(v))) {
    return null;
  }

  // Calculate net QRS amplitude (sum of positive and negative deflections)
  const netI = calculateNetAmplitude(leadI);
  const netAVF = calculateNetAmplitude(leadAVF);

  // Calculate axis using arctan
  const axisRadians = Math.atan2(netAVF, netI);
  let axisDegrees = axisRadians * (180 / Math.PI);

  // Normalize to -180 to +180
  while (axisDegrees > 180) axisDegrees -= 360;
  while (axisDegrees < -180) axisDegrees += 360;

  return Math.round(axisDegrees);
}

/** Calculate a frontal QRS axis from beat-aligned QRS windows. */
function calculateBeatAlignedAxis(
  leadI: number[],
  leadAVF: number[],
  rWaves: RWaveDetection[],
  sampleRate: number
): { value: number | null; beatsUsed: number } {
  if (
    leadI.length !== leadAVF.length ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    rWaves.length < 2
  ) {
    return { value: null, beatsUsed: 0 };
  }

  const before = Math.round(sampleRate * 0.06);
  const after = Math.round(sampleRate * 0.1);
  const netI: number[] = [];
  const netAVF: number[] = [];

  for (const beat of rWaves) {
    const start = beat.index - before;
    const end = beat.index + after;
    if (start < 0 || end > leadI.length || end > leadAVF.length) continue;
    const iSegment = leadI.slice(start, end);
    const avfSegment = leadAVF.slice(start, end);
    if (iSegment.some(v => !Number.isFinite(v)) || avfSegment.some(v => !Number.isFinite(v))) continue;
    netI.push(calculateNetAmplitude(iSegment));
    netAVF.push(calculateNetAmplitude(avfSegment));
  }

  if (netI.length < 2) return { value: null, beatsUsed: netI.length };
  const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const i = median(netI);
  const avf = median(netAVF);
  if (Math.abs(i) + Math.abs(avf) < Number.EPSILON) {
    return { value: null, beatsUsed: netI.length };
  }
  return { value: Math.round(Math.atan2(avf, i) * 180 / Math.PI), beatsUsed: netI.length };
}

/**
 * Calculate the signed net deflection of a waveform segment about its mean.
 */
function calculateNetAmplitude(samples: number[]): number {
  if (!samples || samples.length === 0) return 0;

  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;

  // Find max and min relative to mean
  let maxVal = -Infinity;
  let minVal = Infinity;

  for (const sample of samples) {
    const adjusted = sample - mean;
    if (adjusted > maxVal) maxVal = adjusted;
    if (adjusted < minVal) minVal = adjusted;
  }

  // Net amplitude is sum of absolute max and min
  return maxVal + minVal;
}

/**
 * Calculate all ECG measurements from signal data
 */
export function calculateECGMeasurements(
  leadII: number[],
  leadI: number[],
  leadAVF: number[],
  sampleRate: number
): ECGMeasurements {
  const unavailable = (method: string, reason: string): MeasurementEvidence => ({
    source: 'unavailable',
    method,
    reason,
  });

  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('sampleRate must be a finite positive number');
  }
  if (![leadII, leadI, leadAVF].every(lead => Array.isArray(lead) && lead.every(Number.isFinite))) {
    throw new TypeError('ECG leads must be finite numeric arrays');
  }
  // Detect R waves from lead II (best for rhythm analysis)
  const rWaves = detectRWaves(leadII, sampleRate);

  // Calculate heart rate
  const hr = calculateHeartRate(rWaves);

  // Calculate R-R interval
  const rrIntervals = rWaves.slice(1).map(r => r.rr).filter(rr => rr > 0);
  rrIntervals.sort((a, b) => a - b);
  const rr = rrIntervals.length > 0
    ? Math.round(rrIntervals[Math.floor(rrIntervals.length / 2)])
    : null;

  // Calculate intervals
  const qrs = calculateQRSDuration(leadII, sampleRate, rWaves);
  const pr = calculatePRInterval(leadII, sampleRate, rWaves);
  const qt = calculateQTInterval(leadII, sampleRate, rWaves, qrs);
  const qtc = calculateQTc(qt, rr);

  // Calculate axes
  const qrsAxisResult = calculateBeatAlignedAxis(leadI, leadAVF, rWaves, sampleRate);
  const qrsAxis = qrsAxisResult.value;

  // P and T axes require separately delineated P/T windows. Never derive them
  // from the QRS axis.
  const pAxis = null;
  const tAxis = null;

  return {
    hr,
    rr,
    pr,
    qrs,
    qt,
    qtc,
    pAxis,
    qrsAxis,
    tAxis,
    provenance: {
      hr: hr === null
        ? unavailable('median_rr', 'Fewer than two valid R peaks')
        : { source: 'derived', method: '60000 / median RR', beatsUsed: rWaves.length },
      rr: rr === null
        ? unavailable('median_rr', 'No valid RR intervals')
        : { source: 'detected', method: 'median detected RR', beatsUsed: rrIntervals.length },
      pr: unavailable('p_qrs_delineation', 'Validated P-wave and QRS onset delineation is not implemented'),
      qrs: qrs === null
        ? unavailable('qrs_delineation', 'Insufficient valid QRS complexes')
        : { source: 'detected', method: 'median QRS onset-to-offset', beatsUsed: rWaves.length },
      qt: qt === null
        ? unavailable('qt_delineation', 'Validated QRS onset/T-wave end pair unavailable')
        : { source: 'detected', method: 'median QRS-onset to T-end', beatsUsed: Math.max(0, rWaves.length - 1) },
      qtc: qtc === null
        ? unavailable('bazett', 'QT or RR unavailable')
        : { source: 'derived', method: 'Bazett QTc from detected QT and median RR' },
      pAxis: unavailable('p_axis', 'P-wave windows were not delineated'),
      qrsAxis: qrsAxis === null
        ? unavailable('beat_aligned_frontal_axis', 'Insufficient aligned lead I/aVF QRS windows')
        : { source: 'derived', method: 'median beat-aligned lead I/aVF QRS vectors', beatsUsed: qrsAxisResult.beatsUsed },
      tAxis: unavailable('t_axis', 'T-wave windows were not delineated'),
    },
  };
}
