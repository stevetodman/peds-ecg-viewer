/**
 * Philips Sierra ECG XML Parser
 *
 * Parses ECG data from Philips Sierra ECG XML format.
 * Uses XLI compression (LZW + delta encoding) for waveform data.
 *
 * @module signal/loader/philips-xml
 */

import type { ECGSignal, LeadName } from '../../types';
import { decompressXLI } from './compression/lzw';

/**
 * Patient demographics from Philips XML
 */
export interface PhilipsPatientData {
  patientId: string;
  lastName: string;
  firstName: string;
  birthDate: string;
  gender: string;
  age: number;
}

/**
 * Test/study information from Philips XML
 */
export interface PhilipsTestData {
  acquisitionDate: string;
  acquisitionTime: string;
  site: string;
  location: string;
  device: string;
  softwareVersion: string;
}

/**
 * Complete parsed Philips ECG data
 */
export interface PhilipsECGData {
  patient: PhilipsPatientData;
  test: PhilipsTestData;
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
 * Get attribute value from an XML element
 */
function getElementAttr(parent: Element, tagName: string, attrName: string): string {
  const el = parent.getElementsByTagName(tagName)[0];
  return el?.getAttribute(attrName) ?? '';
}

/**
 * Map Philips lead IDs to standard lead names
 */
function mapPhilipsLeadId(leadId: string): LeadName | null {
  const mapping: Record<string, LeadName> = {
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
  return mapping[leadId] ?? null;
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
 * Parse patient data from Philips XML
 */
function parsePatientData(doc: Document): PhilipsPatientData {
  // Try multiple possible element locations
  const patientInfo = doc.getElementsByTagName('patientinfo')[0] ||
                      doc.getElementsByTagName('PatientInfo')[0] ||
                      doc.getElementsByTagName('patient')[0] ||
                      doc.documentElement;

  const demographics = doc.getElementsByTagName('demographics')[0] ||
                       doc.getElementsByTagName('Demographics')[0] ||
                       patientInfo;

  return {
    patientId: getElementText(demographics, 'patientid') ||
               getElementText(demographics, 'PatientID') ||
               getElementText(demographics, 'id') || '',
    lastName: getElementText(demographics, 'lastname') ||
              getElementText(demographics, 'LastName') ||
              getElementText(demographics, 'familyname') || '',
    firstName: getElementText(demographics, 'firstname') ||
               getElementText(demographics, 'FirstName') ||
               getElementText(demographics, 'givenname') || '',
    birthDate: getElementText(demographics, 'dateofbirth') ||
               getElementText(demographics, 'DateOfBirth') ||
               getElementText(demographics, 'birthdate') || '',
    gender: getElementText(demographics, 'sex') ||
            getElementText(demographics, 'Sex') ||
            getElementText(demographics, 'gender') || '',
    age: parseInt(getElementText(demographics, 'age') ||
                  getElementText(demographics, 'Age')) || 0,
  };
}

/**
 * Parse test data from Philips XML
 */
function parseTestData(doc: Document): PhilipsTestData {
  const testInfo = doc.getElementsByTagName('documentinfo')[0] ||
                   doc.getElementsByTagName('DocumentInfo')[0] ||
                   doc.getElementsByTagName('testinfo')[0] ||
                   doc.documentElement;

  const deviceInfo = doc.getElementsByTagName('device')[0] ||
                     doc.getElementsByTagName('Device')[0] ||
                     testInfo;

  // Parse date and time
  let acquisitionDate = '';
  let acquisitionTime = '';

  const dateEl = doc.getElementsByTagName('acquisitiondatetime')[0] ||
                 doc.getElementsByTagName('AcquisitionDateTime')[0] ||
                 doc.getElementsByTagName('datetime')[0];

  if (dateEl) {
    const dateStr = dateEl.textContent?.trim() ?? '';
    // Try to parse ISO format or other common formats
    if (dateStr.includes('T')) {
      const parts = dateStr.split('T');
      acquisitionDate = parts[0];
      acquisitionTime = parts[1]?.split(/[Z+-]/)[0] ?? '';
    } else {
      acquisitionDate = dateStr;
    }
  } else {
    acquisitionDate = getElementText(testInfo, 'acquisitiondate') ||
                      getElementText(testInfo, 'AcquisitionDate') ||
                      getElementText(testInfo, 'date');
    acquisitionTime = getElementText(testInfo, 'acquisitiontime') ||
                      getElementText(testInfo, 'AcquisitionTime') ||
                      getElementText(testInfo, 'time');
  }

  return {
    acquisitionDate,
    acquisitionTime,
    site: getElementText(testInfo, 'site') ||
          getElementText(testInfo, 'Site') ||
          getElementText(testInfo, 'institution') || '',
    location: getElementText(testInfo, 'location') ||
              getElementText(testInfo, 'Location') ||
              getElementText(testInfo, 'room') || '',
    device: getElementText(deviceInfo, 'modelname') ||
            getElementText(deviceInfo, 'ModelName') ||
            getElementText(deviceInfo, 'model') || '',
    softwareVersion: getElementText(deviceInfo, 'softwareversion') ||
                     getElementText(deviceInfo, 'SoftwareVersion') ||
                     getElementText(deviceInfo, 'version') || '',
  };
}

/**
 * Parse waveform data from Philips XML
 */
function parseWaveformData(doc: Document): ECGSignal {
  const leads: Partial<Record<LeadName, number[]>> = {};
  let sampleRate = 500;
  let duration = 0;

  // Find parsed waveforms element (may be compressed)
  const parsedWaveforms = doc.getElementsByTagName('parsedwaveforms')[0] ||
                          doc.getElementsByTagName('ParsedWaveforms')[0];

  // Get waveform info
  const waveformInfo = doc.getElementsByTagName('waveforminfo')[0] ||
                       doc.getElementsByTagName('WaveformInfo')[0] ||
                       doc.getElementsByTagName('dataacquisition')[0] ||
                       doc.documentElement;

  // Extract sample rate
  const sampleRateStr = getElementText(waveformInfo, 'samplerate') ||
                        getElementText(waveformInfo, 'SampleRate') ||
                        getElementText(waveformInfo, 'samplingrate') ||
                        getElementAttr(waveformInfo, 'waveforminfo', 'samplerate');

  if (sampleRateStr) {
    sampleRate = parseInt(sampleRateStr) || 500;
  }

  // Get number of leads
  const numLeadsStr = getElementText(waveformInfo, 'numberofleads') ||
                      getElementText(waveformInfo, 'NumberOfLeads') ||
                      getElementText(waveformInfo, 'leadcount');
  const numLeads = parseInt(numLeadsStr) || 12;

  // Get amplitude resolution (units per bit)
  const resolutionStr = getElementText(waveformInfo, 'resolution') ||
                        getElementText(waveformInfo, 'Resolution') ||
                        getElementText(waveformInfo, 'amplituderesolution');
  const resolution = parseFloat(resolutionStr) || 1;

  // Standard 12-lead order
  const leadOrder: LeadName[] = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

  if (parsedWaveforms && parsedWaveforms.textContent) {
    // Compressed waveform data
    const base64Data = parsedWaveforms.textContent.trim();

    try {
      // Decode Base64
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // Decompress using XLI
      const channels = decompressXLI(bytes, numLeads);

      // Assign to leads
      for (let i = 0; i < Math.min(channels.length, leadOrder.length); i++) {
        const leadName = leadOrder[i];
        // Convert to microvolts
        leads[leadName] = Array.from(channels[i]).map(s => s * resolution);
      }

      // Calculate duration
      if (channels.length > 0 && channels[0].length > 0) {
        duration = channels[0].length / sampleRate;
      }
    } catch {
      // Fall through to try uncompressed parsing
    }
  }

  // Try uncompressed lead data if compressed parsing failed or wasn't available
  if (Object.keys(leads).length === 0) {
    const leadElements = doc.getElementsByTagName('lead') ||
                         doc.getElementsByTagName('Lead') ||
                         doc.getElementsByTagName('leaddata');

    for (let i = 0; i < leadElements.length; i++) {
      const leadEl = leadElements[i];

      // Get lead ID
      const leadId = leadEl.getAttribute('id') ||
                     leadEl.getAttribute('leadid') ||
                     getElementText(leadEl, 'leadid') ||
                     getElementText(leadEl, 'LeadID');

      const leadName = mapPhilipsLeadId(leadId);
      if (!leadName) continue;

      // Get waveform data
      const dataEl = leadEl.getElementsByTagName('data')[0] ||
                     leadEl.getElementsByTagName('waveformdata')[0] ||
                     leadEl.getElementsByTagName('samples')[0];

      if (dataEl && dataEl.textContent) {
        const samples = dataEl.textContent.trim().split(/[\s,]+/).map(s => parseFloat(s));
        leads[leadName] = samples.filter(s => !isNaN(s)).map(s => s * resolution);

        if (duration === 0 && leads[leadName] && leads[leadName].length > 0) {
          duration = leads[leadName].length / sampleRate;
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
 * Check if XML is Philips format
 */
export function isPhilipsXML(xmlString: string): boolean {
  return xmlString.includes('medical.philips.com') ||
         xmlString.includes('parsedwaveforms') ||
         xmlString.includes('ParsedWaveforms') ||
         xmlString.includes('restingecgdata') ||
         xmlString.includes('RestingEcgData');
}

/**
 * Parse a Philips Sierra ECG XML string into ECG data
 */
export function parsePhilipsXML(xmlString: string): PhilipsECGData {
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
    signal: parseWaveformData(doc),
  };
}

/**
 * Load a Philips Sierra ECG XML file
 */
export async function loadPhilipsXMLFile(file: File): Promise<PhilipsECGData> {
  const text = await file.text();
  return parsePhilipsXML(text);
}
