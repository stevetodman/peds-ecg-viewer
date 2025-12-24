/**
 * HL7 aECG (Annotated ECG) Parser
 *
 * Parses ECG data from HL7 aECG XML format.
 * FDA standard format since 2005 for digital ECG submissions.
 *
 * @module signal/loader/hl7-aecg
 */

import type { ECGSignal, LeadName } from '../../types';

/**
 * Patient demographics from HL7 aECG
 */
export interface HL7PatientData {
  patientId: string;
  lastName: string;
  firstName: string;
  birthDate: string;
  gender: string;
}

/**
 * Test/study information from HL7 aECG
 */
export interface HL7TestData {
  effectiveTime: string;
  deviceId: string;
  deviceManufacturer: string;
  deviceModel: string;
}

/**
 * Diagnosis statements from HL7 aECG
 */
export interface HL7Diagnosis {
  statements: string[];
}

/**
 * Complete parsed HL7 aECG data
 */
export interface HL7aECGData {
  patient: HL7PatientData;
  test: HL7TestData;
  diagnosis?: HL7Diagnosis;
  signal: ECGSignal;
}

/**
 * Find elements by local name (ignoring namespace prefix)
 */
function getElementsByLocalName(parent: Element | Document, localName: string): Element[] {
  const result: Element[] = [];
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === localName) {
      result.push(all[i]);
    }
  }
  return result;
}

/**
 * Map HL7 lead codes to standard lead names
 * Uses MDC (Medical Device Communications) codes
 */
function mapHL7LeadCode(code: string): LeadName | null {
  // MDC lead codes mapping
  const mapping: Record<string, LeadName> = {
    // Standard MDC codes
    'MDC_ECG_LEAD_I': 'I',
    'MDC_ECG_LEAD_II': 'II',
    'MDC_ECG_LEAD_III': 'III',
    'MDC_ECG_LEAD_AVR': 'aVR',
    'MDC_ECG_LEAD_AVL': 'aVL',
    'MDC_ECG_LEAD_AVF': 'aVF',
    'MDC_ECG_LEAD_V1': 'V1',
    'MDC_ECG_LEAD_V2': 'V2',
    'MDC_ECG_LEAD_V3': 'V3',
    'MDC_ECG_LEAD_V4': 'V4',
    'MDC_ECG_LEAD_V5': 'V5',
    'MDC_ECG_LEAD_V6': 'V6',
    'MDC_ECG_LEAD_V3R': 'V3R',
    'MDC_ECG_LEAD_V4R': 'V4R',
    'MDC_ECG_LEAD_V7': 'V7',
    // Simple lead names
    'I': 'I',
    'II': 'II',
    'III': 'III',
    'aVR': 'aVR',
    'AVR': 'aVR',
    'aVL': 'aVL',
    'AVL': 'aVL',
    'aVF': 'aVF',
    'AVF': 'aVF',
    'V1': 'V1',
    'V2': 'V2',
    'V3': 'V3',
    'V4': 'V4',
    'V5': 'V5',
    'V6': 'V6',
    'V3R': 'V3R',
    'V4R': 'V4R',
    'V7': 'V7',
  };
  return mapping[code] ?? null;
}

/**
 * Derive missing leads from I and II
 */
function deriveLeads(leads: Partial<Record<LeadName, number[]>>): void {
  const leadI = leads['I'];
  const leadII = leads['II'];

  if (!leadI || !leadII) return;

  const numSamples = Math.min(leadI.length, leadII.length);

  if (!leads['III']) {
    leads['III'] = new Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      leads['III'][i] = leadII[i] - leadI[i];
    }
  }

  if (!leads['aVR']) {
    leads['aVR'] = new Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      leads['aVR'][i] = -(leadI[i] + leadII[i]) / 2;
    }
  }

  if (!leads['aVL']) {
    leads['aVL'] = new Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      leads['aVL'][i] = leadI[i] - leadII[i] / 2;
    }
  }

  if (!leads['aVF']) {
    leads['aVF'] = new Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      leads['aVF'][i] = leadII[i] - leadI[i] / 2;
    }
  }
}

/**
 * Parse patient data from HL7 aECG XML
 */
function parsePatientData(doc: Document): HL7PatientData {
  const subject = getElementsByLocalName(doc, 'subjectOf')[0];
  const patient = subject ? getElementsByLocalName(subject, 'patient')[0] : null;

  let patientId = '';
  let lastName = '';
  let firstName = '';
  let birthDate = '';
  let gender = '';

  if (patient) {
    // Get patient ID
    const idEl = getElementsByLocalName(patient, 'id')[0];
    if (idEl) {
      patientId = idEl.getAttribute('extension') ?? '';
    }

    // Get name
    const nameEl = getElementsByLocalName(patient, 'name')[0];
    if (nameEl) {
      const familyEl = getElementsByLocalName(nameEl, 'family')[0];
      const givenEl = getElementsByLocalName(nameEl, 'given')[0];
      lastName = familyEl?.textContent?.trim() ?? '';
      firstName = givenEl?.textContent?.trim() ?? '';
    }

    // Get birth date
    const birthEl = getElementsByLocalName(patient, 'birthTime')[0];
    if (birthEl) {
      birthDate = birthEl.getAttribute('value') ?? '';
    }

    // Get gender
    const genderEl = getElementsByLocalName(patient, 'administrativeGenderCode')[0];
    if (genderEl) {
      gender = genderEl.getAttribute('code') ?? '';
    }
  }

  return {
    patientId,
    lastName,
    firstName,
    birthDate,
    gender,
  };
}

/**
 * Parse test data from HL7 aECG XML
 */
function parseTestData(doc: Document): HL7TestData {
  let effectiveTime = '';
  let deviceId = '';
  let deviceManufacturer = '';
  let deviceModel = '';

  // Get effective time
  const effectiveTimeEl = getElementsByLocalName(doc, 'effectiveTime')[0];
  if (effectiveTimeEl) {
    const lowEl = getElementsByLocalName(effectiveTimeEl, 'low')[0];
    effectiveTime = lowEl?.getAttribute('value') ?? effectiveTimeEl.getAttribute('value') ?? '';
  }

  // Get device info
  const deviceEl = getElementsByLocalName(doc, 'device')[0];
  if (deviceEl) {
    const idEl = getElementsByLocalName(deviceEl, 'id')[0];
    deviceId = idEl?.getAttribute('extension') ?? '';

    const mfrEl = getElementsByLocalName(deviceEl, 'manufacturerModelName')[0];
    if (mfrEl) {
      deviceManufacturer = mfrEl.textContent?.trim() ?? '';
    }

    const modelEl = getElementsByLocalName(deviceEl, 'softwareName')[0];
    if (modelEl) {
      deviceModel = modelEl.textContent?.trim() ?? '';
    }
  }

  return {
    effectiveTime,
    deviceId,
    deviceManufacturer,
    deviceModel,
  };
}

/**
 * Parse diagnosis statements from HL7 aECG XML
 */
function parseDiagnosis(doc: Document): HL7Diagnosis {
  const statements: string[] = [];

  // Look for annotation elements with diagnosis info
  const annotations = getElementsByLocalName(doc, 'annotation');
  for (const annot of annotations) {
    const valueEl = getElementsByLocalName(annot, 'value')[0];
    if (valueEl) {
      const text = valueEl.textContent?.trim();
      if (text) {
        statements.push(text);
      }
    }
  }

  return { statements };
}

/**
 * Parse SLIST waveform data
 * SLIST format: scale factor, offset, then space-separated integer values
 */
function parseSLIST(element: Element): { samples: number[]; scale: number; offset: number } {
  let scale = 1;
  let offset = 0;
  const samples: number[] = [];

  // Get origin (offset)
  const originEl = getElementsByLocalName(element, 'origin')[0];
  if (originEl) {
    offset = parseFloat(originEl.getAttribute('value') ?? '0');
  }

  // Get scale
  const scaleEl = getElementsByLocalName(element, 'scale')[0];
  if (scaleEl) {
    scale = parseFloat(scaleEl.getAttribute('value') ?? '1');
  }

  // Get digits (the actual sample data)
  const digitsEl = getElementsByLocalName(element, 'digits')[0];
  if (digitsEl && digitsEl.textContent) {
    const values = digitsEl.textContent.trim().split(/\s+/);
    for (const val of values) {
      const num = parseInt(val, 10);
      if (!isNaN(num)) {
        // Apply scale and offset: physicalValue = (rawValue * scale) + offset
        samples.push(num * scale + offset);
      }
    }
  }

  return { samples, scale, offset };
}

/**
 * Parse waveform data from HL7 aECG XML
 */
function parseWaveformData(doc: Document): ECGSignal {
  const leads: Partial<Record<LeadName, number[]>> = {};
  let sampleRate = 500; // Default
  let duration = 0;

  // Find series elements (rhythm waveforms)
  const seriesElements = getElementsByLocalName(doc, 'series');

  for (const series of seriesElements) {
    // Check if this is a RHYTHM series
    const codeEl = getElementsByLocalName(series, 'code')[0];
    const seriesCode = codeEl?.getAttribute('code') ?? '';

    // Only process RHYTHM series (skip derived/representative beats)
    if (seriesCode && seriesCode !== 'RHYTHM' && !seriesCode.includes('RHYTHM')) {
      continue;
    }

    // Get sample rate from series
    const effectiveTimeEl = getElementsByLocalName(series, 'effectiveTime')[0];
    if (effectiveTimeEl) {
      const incrementEl = getElementsByLocalName(effectiveTimeEl, 'increment')[0];
      if (incrementEl) {
        const incrementValue = parseFloat(incrementEl.getAttribute('value') ?? '0');
        const incrementUnit = incrementEl.getAttribute('unit') ?? 's';

        if (incrementValue > 0) {
          // Convert increment to sample rate
          if (incrementUnit === 's') {
            sampleRate = Math.round(1 / incrementValue);
          } else if (incrementUnit === 'ms') {
            sampleRate = Math.round(1000 / incrementValue);
          }
        }
      }
    }

    // Find sequence sets (contains individual lead data)
    const sequenceSets = getElementsByLocalName(series, 'sequenceSet');

    for (const seqSet of sequenceSets) {
      // Find component elements (each contains one lead)
      const components = getElementsByLocalName(seqSet, 'component');

      for (const component of components) {
        const sequence = getElementsByLocalName(component, 'sequence')[0];
        if (!sequence) continue;

        // Get lead code
        const seqCodeEl = getElementsByLocalName(sequence, 'code')[0];
        let leadCode = seqCodeEl?.getAttribute('code') ?? '';

        // Also check displayName
        if (!leadCode) {
          leadCode = seqCodeEl?.getAttribute('displayName') ?? '';
        }

        const leadName = mapHL7LeadCode(leadCode);
        if (!leadName) continue;

        // Parse the value element (SLIST)
        const valueEl = getElementsByLocalName(sequence, 'value')[0];
        if (!valueEl) continue;

        const { samples } = parseSLIST(valueEl);

        // Convert to microvolts if needed (assume values are in mV, convert to uV)
        // Check the scale unit to determine if conversion is needed
        const scaleEl = getElementsByLocalName(valueEl, 'scale')[0];
        const scaleUnit = scaleEl?.getAttribute('unit') ?? 'uV';

        let conversionFactor = 1;
        if (scaleUnit === 'mV' || scaleUnit === 'millivolt') {
          conversionFactor = 1000; // mV to uV
        } else if (scaleUnit === 'V' || scaleUnit === 'volt') {
          conversionFactor = 1000000; // V to uV
        }

        leads[leadName] = samples.map(s => s * conversionFactor);

        // Calculate duration from first lead
        if (duration === 0 && samples.length > 0) {
          duration = samples.length / sampleRate;
        }
      }
    }
  }

  // Derive any missing leads
  deriveLeads(leads);

  return {
    sampleRate,
    duration,
    leads: leads as Record<LeadName, number[]>,
  };
}

/**
 * Parse an HL7 aECG XML string into ECG data
 */
export function parseHL7aECG(xmlString: string): HL7aECGData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  // Check for parse errors
  const parseError = doc.getElementsByTagName('parsererror')[0];
  if (parseError) {
    throw new Error(`XML parse error: ${parseError.textContent}`);
  }

  // Verify this is an HL7 aECG document
  const root = doc.documentElement;
  if (!root.localName.includes('AnnotatedECG') && !root.tagName.includes('AnnotatedECG')) {
    throw new Error('Not a valid HL7 aECG document');
  }

  return {
    patient: parsePatientData(doc),
    test: parseTestData(doc),
    diagnosis: parseDiagnosis(doc),
    signal: parseWaveformData(doc),
  };
}

/**
 * Load an HL7 aECG file
 */
export async function loadHL7aECGFile(file: File): Promise<HL7aECGData> {
  const text = await file.text();
  return parseHL7aECG(text);
}
