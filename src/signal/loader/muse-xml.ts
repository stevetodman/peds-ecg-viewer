/**
 * GE Muse XML ECG Parser
 *
 * Parses ECG data from GE Muse XML format (RestingECG).
 * The format stores waveform data as Base64-encoded 16-bit integers.
 *
 * @module signal/loader/muse-xml
 */

import type { ECGSignal, LeadName } from '../../types';

/**
 * Patient demographics from Muse XML
 */
export interface MusePatientData {
  patientId: string;
  lastName: string;
  firstName: string;
  age: number;
  ageUnits: string;
  gender: string;
  race: string;
}

/**
 * Test/study demographics from Muse XML
 */
export interface MuseTestData {
  acquisitionDate: string;
  acquisitionTime: string;
  site: string;
  location: string;
  status: string;
  priority: string;
  device: string;
  softwareVersion: string;
}

/**
 * Order information from Muse XML
 */
export interface MuseOrderData {
  testType: string;
  accountNumber: string;
  diagnosis: string;
  orderingMDLastName: string;
  orderingMDFirstName: string;
  facility: string;
}

/**
 * Diagnosis statements from Muse XML
 */
export interface MuseDiagnosis {
  modality: string;
  statements: string[];
}

/**
 * Complete parsed Muse ECG data
 */
export interface MuseECGData {
  patient: MusePatientData;
  test: MuseTestData;
  order: MuseOrderData;
  diagnosis: MuseDiagnosis;
  signal: ECGSignal;
}

/**
 * Get text content of an XML element
 */
function getElementText(parent: Element, tagName: string): string {
  const el = parent.getElementsByTagName(tagName)[0];
  return el?.textContent?.trim() ?? '';
}

/**
 * Parse patient demographics from XML
 */
function parsePatientData(doc: Document): MusePatientData {
  const demo = doc.getElementsByTagName('PatientDemographics')[0];

  return {
    patientId: getElementText(demo, 'PatientID'),
    lastName: getElementText(demo, 'PatientLastName'),
    firstName: getElementText(demo, 'PatientFirstName'),
    age: parseInt(getElementText(demo, 'AnalysisAge')) || 0,
    ageUnits: getElementText(demo, 'AnalysisAgeUnits'),
    gender: getElementText(demo, 'Gender'),
    race: getElementText(demo, 'Race'),
  };
}

/**
 * Parse test demographics from XML
 */
function parseTestData(doc: Document): MuseTestData {
  const demo = doc.getElementsByTagName('TestDemographics')[0];

  return {
    acquisitionDate: getElementText(demo, 'AcquisitionDate'),
    acquisitionTime: getElementText(demo, 'AcquisitionTime'),
    site: getElementText(demo, 'Site'),
    location: getElementText(demo, 'Location'),
    status: getElementText(demo, 'Status'),
    priority: getElementText(demo, 'Priority'),
    device: getElementText(demo, 'AcquisitionDevice'),
    softwareVersion: getElementText(demo, 'AcquisitionSoftwareVersion'),
  };
}

/**
 * Parse order information from XML
 */
function parseOrderData(doc: Document): MuseOrderData {
  const order = doc.getElementsByTagName('OrderInformation')[0];

  return {
    testType: getElementText(order, 'HISTestType'),
    accountNumber: getElementText(order, 'HISAccountNumber'),
    diagnosis: getElementText(order, 'AdmitDiagnosis'),
    orderingMDLastName: getElementText(order, 'HISOrderingMDLastName'),
    orderingMDFirstName: getElementText(order, 'HISOrderingMDFirstName'),
    facility: getElementText(order, 'ServicingFacility'),
  };
}

/**
 * Parse diagnosis statements from XML
 */
function parseDiagnosis(doc: Document): MuseDiagnosis {
  const diag = doc.getElementsByTagName('Diagnosis')[0];
  const statements: string[] = [];

  if (diag) {
    const stmtElements = diag.getElementsByTagName('DiagnosisStatement');
    for (let i = 0; i < stmtElements.length; i++) {
      const text = getElementText(stmtElements[i], 'StmtText');
      if (text) statements.push(text);
    }
  }

  return {
    modality: diag ? getElementText(diag, 'Modality') : 'RESTING',
    statements,
  };
}

/**
 * Decode Base64 waveform data to Int16 samples
 */
function decodeWaveformData(base64: string): number[] {
  // Decode Base64 to binary
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Convert to Int16 (little-endian)
  const samples: number[] = [];
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < bytes.length; i += 2) {
    samples.push(view.getInt16(i, true)); // little-endian
  }

  return samples;
}

/**
 * Map Muse lead IDs to standard lead names
 */
function mapLeadId(museId: string): LeadName | null {
  const mapping: Record<string, LeadName> = {
    I: 'I',
    II: 'II',
    III: 'III',
    AVR: 'aVR',
    AVL: 'aVL',
    AVF: 'aVF',
    V1: 'V1',
    V2: 'V2',
    V3: 'V3',
    V4: 'V4',
    V5: 'V5',
    V6: 'V6',
  };
  return mapping[museId.toUpperCase()] ?? null;
}

/**
 * Derive missing leads from I and II
 * Standard ECG derivations:
 * - III = II - I
 * - aVR = -(I + II) / 2
 * - aVL = I - II/2
 * - aVF = II - I/2
 */
function deriveLeads(leads: Partial<Record<LeadName, number[]>>): void {
  const leadI = leads['I'];
  const leadII = leads['II'];

  if (!leadI || !leadII) return;

  const numSamples = Math.min(leadI.length, leadII.length);

  // Derive III if missing
  if (!leads['III']) {
    leads['III'] = new Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      leads['III'][i] = leadII[i] - leadI[i];
    }
  }

  // Derive aVR if missing
  if (!leads['aVR']) {
    leads['aVR'] = new Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      leads['aVR'][i] = -(leadI[i] + leadII[i]) / 2;
    }
  }

  // Derive aVL if missing
  if (!leads['aVL']) {
    leads['aVL'] = new Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      leads['aVL'][i] = leadI[i] - leadII[i] / 2;
    }
  }

  // Derive aVF if missing
  if (!leads['aVF']) {
    leads['aVF'] = new Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      leads['aVF'][i] = leadII[i] - leadI[i] / 2;
    }
  }
}

/**
 * Parse waveform data from XML
 */
function parseWaveformData(doc: Document): ECGSignal {
  const waveform = doc.getElementsByTagName('Waveform')[0];
  if (!waveform) {
    throw new Error('No Waveform element found in XML');
  }

  // Get sample rate
  const sampleBase = parseInt(getElementText(waveform, 'SampleBase')) || 500;
  const sampleExponent = parseInt(getElementText(waveform, 'SampleExponent')) || 0;
  const sampleRate = sampleBase * Math.pow(10, sampleExponent);

  // Parse each lead
  const leadDataElements = waveform.getElementsByTagName('LeadData');
  const leads: Partial<Record<LeadName, number[]>> = {};
  let duration = 0;

  for (let i = 0; i < leadDataElements.length; i++) {
    const leadEl = leadDataElements[i];

    const leadId = getElementText(leadEl, 'LeadID');
    const leadName = mapLeadId(leadId);
    if (!leadName) continue;

    // Get amplitude conversion factor (units per bit -> microvolts)
    const unitsPerBit = parseFloat(getElementText(leadEl, 'LeadAmplitudeUnitsPerBit')) || 4.88;

    // Decode waveform data
    const waveformDataEl = leadEl.getElementsByTagName('WaveFormData')[0];
    if (!waveformDataEl?.textContent) continue;

    const rawSamples = decodeWaveformData(waveformDataEl.textContent.trim());

    // Convert to microvolts
    leads[leadName] = rawSamples.map((s) => s * unitsPerBit);

    // Calculate duration from first lead
    if (duration === 0) {
      duration = rawSamples.length / sampleRate;
    }
  }

  // Derive any missing leads (III, aVR, aVL, aVF) from I and II
  deriveLeads(leads);

  return {
    sampleRate,
    duration,
    leads: leads as Record<LeadName, number[]>,
  };
}

/**
 * Parse a GE Muse XML string into ECG data
 */
export function parseMuseXML(xmlString: string): MuseECGData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  // Check for parse errors
  const parseError = doc.getElementsByTagName('parsererror')[0];
  if (parseError) {
    throw new Error(`XML parse error: ${parseError.textContent}`);
  }

  return {
    patient: parsePatientData(doc),
    test: parseTestData(doc),
    order: parseOrderData(doc),
    diagnosis: parseDiagnosis(doc),
    signal: parseWaveformData(doc),
  };
}

/**
 * Parse a GE Muse XML file
 */
export async function loadMuseXMLFile(file: File): Promise<MuseECGData> {
  const text = await file.text();
  return parseMuseXML(text);
}
