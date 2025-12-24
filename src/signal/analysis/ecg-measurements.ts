/**
 * ECG Measurement Calculation Module
 *
 * Calculates heart rate, intervals (PR, QRS, QT), and axes from ECG signals.
 * Uses standard ECG analysis algorithms adapted for pediatric ECGs.
 *
 * @module signal/analysis/ecg-measurements
 */

export interface ECGMeasurements {
  hr: number;           // Heart rate (bpm)
  rr: number;           // R-R interval (ms)
  pr: number;           // PR interval (ms)
  qrs: number;          // QRS duration (ms)
  qt: number;           // QT interval (ms)
  qtc: number;          // Corrected QT (Bazett's formula)
  pAxis: number;        // P wave axis (degrees)
  qrsAxis: number;      // QRS axis (degrees)
  tAxis: number;        // T wave axis (degrees)
}

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
export function calculateHeartRate(rWaves: RWaveDetection[]): number {
  if (rWaves.length < 2) {
    return 0;
  }

  // Use median R-R interval to be robust against outliers
  const rrIntervals = rWaves.slice(1).map(r => r.rr).filter(rr => rr > 0);

  if (rrIntervals.length === 0) {
    return 0;
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
): number {
  if (rWaves.length < 2) {
    return 80; // Default value
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

  if (qrsDurations.length === 0) {
    return 80; // Default
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
): number {
  if (rWaves.length < 2) {
    return 160; // Default value
  }

  // For pediatric ECGs, PR interval is typically shorter
  // Normal range: 80-200ms depending on age and heart rate
  const hr = calculateHeartRate(rWaves);

  // PR interval tends to shorten with higher heart rates
  // Using a simplified estimation based on heart rate
  if (hr > 150) {
    return 100; // Fast HR = shorter PR
  } else if (hr > 100) {
    return 120;
  } else {
    return 160;
  }
}

/**
 * Calculate QT interval (QRS onset to T wave end)
 */
export function calculateQTInterval(
  samples: number[],
  sampleRate: number,
  rWaves: RWaveDetection[],
  qrsDuration: number
): number {
  if (rWaves.length < 2) {
    return 400; // Default
  }

  const qtIntervals: number[] = [];

  for (let i = 0; i < rWaves.length - 1; i++) {
    const rWave = rWaves[i];
    const nextRWave = rWaves[i + 1];

    // QRS onset (estimate based on QRS duration)
    const qrsOnset = rWave.index - Math.round((qrsDuration / 1000) * sampleRate * 0.4);

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

  if (qtIntervals.length === 0) {
    return 400; // Default
  }

  // Return median
  qtIntervals.sort((a, b) => a - b);
  return Math.round(qtIntervals[Math.floor(qtIntervals.length / 2)]);
}

/**
 * Calculate QTc using Bazett's formula
 * QTc = QT / sqrt(RR in seconds)
 */
export function calculateQTc(qt: number, rr: number): number {
  if (rr <= 0) {
    return qt;
  }
  const rrSeconds = rr / 1000;
  return Math.round(qt / Math.sqrt(rrSeconds));
}

/**
 * Calculate electrical axis from leads I and aVF
 * Uses the hexaxial reference system
 */
export function calculateAxis(leadI: number[], leadAVF: number[]): number {
  if (!leadI || !leadAVF || leadI.length === 0 || leadAVF.length === 0) {
    return 60; // Normal default
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

/**
 * Calculate net amplitude of a waveform segment
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
  // Detect R waves from lead II (best for rhythm analysis)
  const rWaves = detectRWaves(leadII, sampleRate);

  // Calculate heart rate
  const hr = calculateHeartRate(rWaves);

  // Calculate R-R interval
  const rrIntervals = rWaves.slice(1).map(r => r.rr).filter(rr => rr > 0);
  const rr = rrIntervals.length > 0
    ? Math.round(rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length)
    : Math.round(60000 / (hr || 75));

  // Calculate intervals
  const qrs = calculateQRSDuration(leadII, sampleRate, rWaves);
  const pr = calculatePRInterval(leadII, sampleRate, rWaves);
  const qt = calculateQTInterval(leadII, sampleRate, rWaves, qrs);
  const qtc = calculateQTc(qt, rr);

  // Calculate axes
  const qrsAxis = calculateAxis(leadI, leadAVF);

  // P and T axes are harder to calculate accurately
  // Using simplified estimates based on QRS axis
  const pAxis = qrsAxis; // P axis usually follows QRS axis
  const tAxis = qrsAxis > 0 ? qrsAxis - 20 : qrsAxis + 20; // T axis usually close to QRS

  return {
    hr,
    rr,
    pr,
    qrs,
    qt,
    qtc,
    pAxis,
    qrsAxis,
    tAxis: Math.round(tAxis)
  };
}
