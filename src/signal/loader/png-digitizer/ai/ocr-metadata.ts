/**
 * OCR Metadata Extraction
 * Extract text metadata from ECG images using AI vision
 *
 * @module signal/loader/png-digitizer/ai/ocr-metadata
 */

import type { AIProvider } from './provider';
import type { OCRMetadataResult, OCRRawTextItem } from './api-types';

/**
 * Extracted ECG metadata
 */
export interface ECGMetadata {
  /** Patient information */
  patient: {
    name?: string;
    id?: string;
    age?: number;
    sex?: 'M' | 'F' | 'Unknown';
    dateOfBirth?: string;
  };

  /** Acquisition information */
  acquisition: {
    date?: string;
    time?: string;
    location?: string;
    technician?: string;
    device?: string;
    deviceSerial?: string;
  };

  /** Machine-calculated measurements */
  measurements: {
    heartRate?: number;
    prInterval?: number;
    qrsDuration?: number;
    qtInterval?: number;
    qtcInterval?: number;
    pAxis?: number;
    qrsAxis?: number;
    tAxis?: number;
    rrInterval?: number;
  };

  /** Machine interpretation */
  interpretation: {
    rhythm?: string;
    findings?: string[];
    diagnosis?: string[];
    severity?: 'normal' | 'abnormal' | 'borderline' | 'critical';
  };

  /** Calibration settings from text */
  settings: {
    paperSpeed?: number;
    gain?: number;
    filter?: string;
    limb?: string;
    chest?: string;
  };

  /** Raw text blocks detected */
  rawText: Array<{
    text: string;
    location: 'header' | 'footer' | 'sidebar' | 'overlay';
    confidence: number;
  }>;

  /** Overall extraction confidence */
  confidence: number;
}

/**
 * OCR prompt for metadata extraction
 */
function getOCRPrompt(): string {
  return `You are an expert at reading ECG printouts. Extract ALL visible text from this ECG image.

## Instructions

Carefully examine this ECG image and extract ALL text information visible. Look for:

1. **PATIENT INFORMATION** (usually top left or header)
   - Patient name
   - Patient ID / MRN
   - Age
   - Sex (M/F)
   - Date of birth

2. **ACQUISITION INFO** (header area)
   - Date and time of recording
   - Location / department
   - Technician name
   - Device name/model
   - Device serial number

3. **MEASUREMENTS** (often in a box or sidebar)
   - Heart Rate (HR) - look for "HR", "Vent rate", "bpm"
   - PR Interval - look for "PR", usually in ms
   - QRS Duration - look for "QRS", usually in ms
   - QT/QTc Interval - look for "QT", "QTc", usually in ms
   - Axis values - P/QRS/T axis in degrees
   - RR Interval

4. **INTERPRETATION** (footer or sidebar)
   - Rhythm description
   - Automated findings/diagnosis
   - Severity indicators
   - Any clinical notes

5. **CALIBRATION SETTINGS**
   - Paper speed (25 mm/s or 50 mm/s)
   - Gain/sensitivity (10 mm/mV, 5 mm/mV, 20 mm/mV)
   - Filter settings
   - Lead configuration

## Output Format

Return ONLY valid JSON (no markdown):

{
  "patient": {
    "name": "LASTNAME, FIRSTNAME" or null,
    "id": "12345678" or null,
    "age": 65 or null,
    "sex": "M" or "F" or null,
    "dateOfBirth": "1959-03-15" or null
  },
  "acquisition": {
    "date": "2024-01-15" or null,
    "time": "14:32:00" or null,
    "location": "Cardiology Dept" or null,
    "technician": "J. Smith" or null,
    "device": "GE MAC 5500" or null,
    "deviceSerial": "SN12345" or null
  },
  "measurements": {
    "heartRate": 72 or null,
    "prInterval": 160 or null,
    "qrsDuration": 88 or null,
    "qtInterval": 400 or null,
    "qtcInterval": 420 or null,
    "pAxis": 45 or null,
    "qrsAxis": 60 or null,
    "tAxis": 30 or null,
    "rrInterval": 833 or null
  },
  "interpretation": {
    "rhythm": "Normal sinus rhythm" or null,
    "findings": ["Left ventricular hypertrophy", "..."] or [],
    "diagnosis": ["LVH by voltage criteria"] or [],
    "severity": "normal" or "abnormal" or "borderline" or "critical" or null
  },
  "settings": {
    "paperSpeed": 25 or 50 or null,
    "gain": 10 or 5 or 20 or null,
    "filter": "0.05-150 Hz" or null,
    "limb": "Standard" or null,
    "chest": "Standard" or null
  },
  "rawText": [
    {"text": "Patient: John Doe", "location": "header", "confidence": 0.95},
    {"text": "HR: 72 bpm", "location": "sidebar", "confidence": 0.98}
  ],
  "confidence": 0.85
}

Extract everything you can see. If a field is not visible, use null. For arrays, use empty arrays if nothing found.`;
}

/**
 * Parse OCR response
 */
function parseOCRResponse(response: string): ECGMetadata {
  // Remove markdown code blocks if present
  let jsonStr = response;
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  let parsed: OCRMetadataResult;
  try {
    parsed = JSON.parse(jsonStr.trim()) as OCRMetadataResult;
  } catch {
    // Return empty metadata on parse failure
    return createEmptyMetadata();
  }

  const patientSex = parsed.patient?.sex;
  const interpSeverity = parsed.interpretation?.severity;
  const settingsSpeed = parsed.settings?.paperSpeed;
  const settingsGain = parsed.settings?.gain;

  return {
    patient: {
      name: parsed.patient?.name ?? undefined,
      id: parsed.patient?.id ?? undefined,
      age: typeof parsed.patient?.age === 'number' ? parsed.patient.age : undefined,
      sex: patientSex && ['M', 'F'].includes(patientSex) ? (patientSex as 'M' | 'F') : undefined,
      dateOfBirth: parsed.patient?.dateOfBirth ?? undefined,
    },
    acquisition: {
      date: parsed.acquisition?.date ?? undefined,
      time: parsed.acquisition?.time ?? undefined,
      location: parsed.acquisition?.location ?? undefined,
      technician: parsed.acquisition?.technician ?? undefined,
      device: parsed.acquisition?.device ?? undefined,
      deviceSerial: parsed.acquisition?.deviceSerial ?? undefined,
    },
    measurements: {
      heartRate: typeof parsed.measurements?.heartRate === 'number' ? parsed.measurements.heartRate : undefined,
      prInterval: typeof parsed.measurements?.prInterval === 'number' ? parsed.measurements.prInterval : undefined,
      qrsDuration: typeof parsed.measurements?.qrsDuration === 'number' ? parsed.measurements.qrsDuration : undefined,
      qtInterval: typeof parsed.measurements?.qtInterval === 'number' ? parsed.measurements.qtInterval : undefined,
      qtcInterval: typeof parsed.measurements?.qtcInterval === 'number' ? parsed.measurements.qtcInterval : undefined,
      pAxis: typeof parsed.measurements?.pAxis === 'number' ? parsed.measurements.pAxis : undefined,
      qrsAxis: typeof parsed.measurements?.qrsAxis === 'number' ? parsed.measurements.qrsAxis : undefined,
      tAxis: typeof parsed.measurements?.tAxis === 'number' ? parsed.measurements.tAxis : undefined,
      rrInterval: typeof parsed.measurements?.rrInterval === 'number' ? parsed.measurements.rrInterval : undefined,
    },
    interpretation: {
      rhythm: parsed.interpretation?.rhythm ?? undefined,
      findings: Array.isArray(parsed.interpretation?.findings) ? parsed.interpretation.findings : [],
      diagnosis: Array.isArray(parsed.interpretation?.diagnosis) ? parsed.interpretation.diagnosis : [],
      severity: interpSeverity && ['normal', 'abnormal', 'borderline', 'critical'].includes(interpSeverity)
        ? (interpSeverity as 'normal' | 'abnormal' | 'borderline' | 'critical')
        : undefined,
    },
    settings: {
      paperSpeed: typeof settingsSpeed === 'number' && [25, 50].includes(settingsSpeed) ? settingsSpeed : undefined,
      gain: typeof settingsGain === 'number' && [5, 10, 20].includes(settingsGain) ? settingsGain : undefined,
      filter: parsed.settings?.filter ?? undefined,
      limb: parsed.settings?.limb ?? undefined,
      chest: parsed.settings?.chest ?? undefined,
    },
    rawText: Array.isArray(parsed.rawText)
      ? parsed.rawText.map((t: OCRRawTextItem) => ({
          text: String(t.text ?? ''),
          location: (['header', 'footer', 'sidebar', 'overlay'] as const).includes(t.location as 'header' | 'footer' | 'sidebar' | 'overlay')
            ? (t.location as 'header' | 'footer' | 'sidebar' | 'overlay')
            : 'overlay',
          confidence: typeof t.confidence === 'number' ? t.confidence : 0.5,
        }))
      : [],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
  };
}

/**
 * Create empty metadata structure
 */
function createEmptyMetadata(): ECGMetadata {
  return {
    patient: {},
    acquisition: {},
    measurements: {},
    interpretation: {
      findings: [],
      diagnosis: [],
    },
    settings: {},
    rawText: [],
    confidence: 0,
  };
}

/**
 * OCR Metadata Extractor class
 */
export class OCRMetadataExtractor {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  /**
   * Extract metadata from ECG image
   */
  async extract(image: ImageData | Blob | string): Promise<ECGMetadata> {
    try {
      // Use the provider to analyze the image with OCR prompt
      const prompt = getOCRPrompt();

      // We need to call the provider's internal API with custom prompt
      // For now, we'll use a workaround by calling analyze and parsing differently
      const result = await this.callWithCustomPrompt(image, prompt);

      return parseOCRResponse(result);
    } catch (error) {
      console.error('OCR extraction failed:', error);
      return createEmptyMetadata();
    }
  }

  /**
   * Call AI provider with custom prompt
   */
  private async callWithCustomPrompt(image: ImageData | Blob | string, prompt: string): Promise<string> {
    // Access the provider's callAPI method if available
    const provider = this.provider as any;

    if (typeof provider.callAPI === 'function' && typeof provider.imageToBase64 === 'function') {
      const base64 = await provider.imageToBase64(image);
      return await provider.callAPI(base64, prompt);
    }

    // Fallback: use the standard analyze method and extract raw response
    const result = await this.provider.analyze(image);
    return result.rawResponse;
  }
}

/**
 * Extract metadata using local pattern matching (no AI required)
 * Useful as fallback when AI is not available
 */
export function extractMetadataFromText(textBlocks: string[]): Partial<ECGMetadata> {
  const metadata: Partial<ECGMetadata> = {
    measurements: {},
    settings: {},
    interpretation: { findings: [], diagnosis: [] },
  };

  for (const text of textBlocks) {
    const lower = text.toLowerCase();

    // Heart rate patterns
    const hrMatch = text.match(/(?:HR|Heart\s*Rate|Vent\.?\s*rate)[:\s]*(\d{2,3})\s*(?:bpm|\/min)?/i);
    if (hrMatch) {
      metadata.measurements!.heartRate = parseInt(hrMatch[1]);
    }

    // PR interval
    const prMatch = text.match(/PR[:\s]*(\d{2,3})\s*(?:ms)?/i);
    if (prMatch) {
      metadata.measurements!.prInterval = parseInt(prMatch[1]);
    }

    // QRS duration
    const qrsMatch = text.match(/QRS[:\s]*(\d{2,3})\s*(?:ms)?/i);
    if (qrsMatch) {
      metadata.measurements!.qrsDuration = parseInt(qrsMatch[1]);
    }

    // QT/QTc interval
    const qtMatch = text.match(/QT[:\s]*(\d{2,3})\s*(?:ms)?/i);
    if (qtMatch) {
      metadata.measurements!.qtInterval = parseInt(qtMatch[1]);
    }
    const qtcMatch = text.match(/QTc[:\s]*(\d{2,3})\s*(?:ms)?/i);
    if (qtcMatch) {
      metadata.measurements!.qtcInterval = parseInt(qtcMatch[1]);
    }

    // Axis
    const axisMatch = text.match(/(?:QRS\s*)?Axis[:\s]*(-?\d{1,3})\s*(?:deg|°)?/i);
    if (axisMatch) {
      metadata.measurements!.qrsAxis = parseInt(axisMatch[1]);
    }

    // Paper speed
    if (lower.includes('25 mm/s') || lower.includes('25mm/s')) {
      metadata.settings!.paperSpeed = 25;
    } else if (lower.includes('50 mm/s') || lower.includes('50mm/s')) {
      metadata.settings!.paperSpeed = 50;
    }

    // Gain
    if (lower.includes('10 mm/mv') || lower.includes('10mm/mv')) {
      metadata.settings!.gain = 10;
    } else if (lower.includes('5 mm/mv') || lower.includes('5mm/mv')) {
      metadata.settings!.gain = 5;
    } else if (lower.includes('20 mm/mv') || lower.includes('20mm/mv')) {
      metadata.settings!.gain = 20;
    }

    // Common findings
    const findings: string[] = [];
    if (lower.includes('sinus rhythm')) findings.push('Sinus rhythm');
    if (lower.includes('sinus bradycardia')) findings.push('Sinus bradycardia');
    if (lower.includes('sinus tachycardia')) findings.push('Sinus tachycardia');
    if (lower.includes('atrial fibrillation') || lower.includes('afib')) findings.push('Atrial fibrillation');
    if (lower.includes('left ventricular hypertrophy') || lower.includes('lvh')) findings.push('LVH');
    if (lower.includes('right ventricular hypertrophy') || lower.includes('rvh')) findings.push('RVH');
    if (lower.includes('left bundle branch block') || lower.includes('lbbb')) findings.push('LBBB');
    if (lower.includes('right bundle branch block') || lower.includes('rbbb')) findings.push('RBBB');
    if (lower.includes('st elevation')) findings.push('ST elevation');
    if (lower.includes('st depression')) findings.push('ST depression');
    if (lower.includes('t wave inversion')) findings.push('T wave inversion');
    if (lower.includes('prolonged qt')) findings.push('Prolonged QT');
    if (lower.includes('first degree')) findings.push('First degree AV block');
    if (lower.includes('second degree')) findings.push('Second degree AV block');
    if (lower.includes('third degree') || lower.includes('complete heart block')) findings.push('Complete heart block');

    if (findings.length > 0) {
      metadata.interpretation!.findings = [
        ...(metadata.interpretation!.findings || []),
        ...findings,
      ];
    }
  }

  // Deduplicate findings
  if (metadata.interpretation?.findings) {
    metadata.interpretation.findings = [...new Set(metadata.interpretation.findings)];
  }

  return metadata;
}

/**
 * Merge AI-extracted metadata with calculated parameters
 */
export function mergeMetadata(
  aiMetadata: ECGMetadata,
  calculatedMeasurements: Partial<ECGMetadata['measurements']>
): ECGMetadata {
  return {
    ...aiMetadata,
    measurements: {
      // Prefer AI-extracted values, fall back to calculated
      heartRate: aiMetadata.measurements.heartRate ?? calculatedMeasurements.heartRate,
      prInterval: aiMetadata.measurements.prInterval ?? calculatedMeasurements.prInterval,
      qrsDuration: aiMetadata.measurements.qrsDuration ?? calculatedMeasurements.qrsDuration,
      qtInterval: aiMetadata.measurements.qtInterval ?? calculatedMeasurements.qtInterval,
      qtcInterval: aiMetadata.measurements.qtcInterval ?? calculatedMeasurements.qtcInterval,
      pAxis: aiMetadata.measurements.pAxis ?? calculatedMeasurements.pAxis,
      qrsAxis: aiMetadata.measurements.qrsAxis ?? calculatedMeasurements.qrsAxis,
      tAxis: aiMetadata.measurements.tAxis ?? calculatedMeasurements.tAxis,
      rrInterval: aiMetadata.measurements.rrInterval ?? calculatedMeasurements.rrInterval,
    },
  };
}
