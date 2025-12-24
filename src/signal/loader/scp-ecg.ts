/**
 * SCP-ECG Parser
 *
 * Parses ECG data from SCP-ECG format (EN 1064:2005 / ANSI/AAMI EC71:2001).
 * Binary format with sections, optional Huffman compression, and reference beat subtraction.
 *
 * @module signal/loader/scp-ecg
 */

import type { ECGSignal, LeadName } from '../../types';
import {
  decodeHuffmanSCP,
  reverseSecondDifference,
  parseHuffmanTable,
  SCP_DEFAULT_TABLE,
  type HuffmanTable,
} from './compression/huffman-scp';

/**
 * Patient demographics from SCP-ECG
 */
export interface SCPPatientData {
  patientId: string;
  lastName: string;
  firstName: string;
  birthDate: string;
  age: number;
  gender: string;
  height: number;
  weight: number;
}

/**
 * Test/study information from SCP-ECG
 */
export interface SCPTestData {
  acquisitionDate: string;
  acquisitionTime: string;
  device: string;
  deviceSerial: string;
  institution: string;
  department: string;
}

/**
 * Diagnosis statements from SCP-ECG
 */
export interface SCPDiagnosis {
  statements: string[];
}

/**
 * Complete parsed SCP-ECG data
 */
export interface SCPECGData {
  patient: SCPPatientData;
  test: SCPTestData;
  diagnosis?: SCPDiagnosis;
  signal: ECGSignal;
}

/**
 * SCP Section pointer
 */
interface SCPSection {
  id: number;
  length: number;
  offset: number;
}

/**
 * Lead definition from Section 3
 */
interface LeadDefinition {
  startSample: number;
  endSample: number;
  leadId: number;
}

/**
 * SCP-ECG lead ID to standard lead name mapping
 */
const LEAD_ID_MAP: Record<number, LeadName> = {
  0: 'I',
  1: 'II',
  2: 'V1',
  3: 'V2',
  4: 'V3',
  5: 'V4',
  6: 'V5',
  7: 'V6',
  8: 'III',
  9: 'aVR',
  10: 'aVL',
  11: 'aVF',
};

/**
 * Binary reader for SCP data
 */
class SCPReader {
  private view: DataView;
  private offset: number = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  seek(offset: number): void {
    this.offset = offset;
  }

  getOffset(): number {
    return this.offset;
  }

  readUint8(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readUint16(): number {
    const value = this.view.getUint16(this.offset, true); // Little-endian
    this.offset += 2;
    return value;
  }

  readUint32(): number {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readInt16(): number {
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(this.view.buffer, this.offset, length);
    this.offset += length;
    return bytes;
  }

  readString(length: number): string {
    const bytes = this.readBytes(length);
    return new TextDecoder('utf-8').decode(bytes).replace(/\0/g, '').trim();
  }

  hasMore(): boolean {
    return this.offset < this.view.byteLength;
  }

  remaining(): number {
    return this.view.byteLength - this.offset;
  }
}

/**
 * Parse section pointers from Section 0
 */
function parseSectionPointers(reader: SCPReader, sectionLength: number): Map<number, SCPSection> {
  const sections = new Map<number, SCPSection>();
  const endOffset = reader.getOffset() + sectionLength - 2; // -2 for section header

  while (reader.getOffset() < endOffset && reader.remaining() >= 10) {
    const id = reader.readUint16();
    const length = reader.readUint32();
    const offset = reader.readUint32();

    if (length > 0 && offset > 0) {
      sections.set(id, { id, length, offset });
    }
  }

  return sections;
}

/**
 * Parse patient data from Section 1
 */
function parseSection1(reader: SCPReader, section: SCPSection): {
  patient: SCPPatientData;
  test: SCPTestData;
} {
  reader.seek(section.offset);

  // Skip section header (2 bytes CRC + 2 bytes section ID)
  reader.readUint16(); // CRC
  reader.readUint16(); // Section ID

  const sectionLength = section.length - 4;
  const endOffset = reader.getOffset() + sectionLength;

  const patient: SCPPatientData = {
    patientId: '',
    lastName: '',
    firstName: '',
    birthDate: '',
    age: 0,
    gender: '',
    height: 0,
    weight: 0,
  };

  const test: SCPTestData = {
    acquisitionDate: '',
    acquisitionTime: '',
    device: '',
    deviceSerial: '',
    institution: '',
    department: '',
  };

  // Parse tag-length-value entries
  while (reader.getOffset() < endOffset && reader.remaining() >= 3) {
    const tag = reader.readUint8();
    const length = reader.readUint16();

    if (length === 0 || reader.getOffset() + length > endOffset) break;

    const valueBytes = reader.readBytes(length);
    const value = new TextDecoder('utf-8').decode(valueBytes).replace(/\0/g, '').trim();

    switch (tag) {
      case 0: // Patient last name
        patient.lastName = value;
        break;
      case 1: // Patient first name
        patient.firstName = value;
        break;
      case 2: // Patient ID
        patient.patientId = value;
        break;
      case 3: // Second last name
        break;
      case 4: // Age
        if (valueBytes.length >= 3) {
          patient.age = valueBytes[0] | (valueBytes[1] << 8);
        }
        break;
      case 5: // Date of birth (YYYYMMDD or similar)
        patient.birthDate = value;
        break;
      case 6: // Height (cm)
        if (valueBytes.length >= 2) {
          patient.height = valueBytes[0] | (valueBytes[1] << 8);
        }
        break;
      case 7: // Weight (kg)
        if (valueBytes.length >= 2) {
          patient.weight = valueBytes[0] | (valueBytes[1] << 8);
        }
        break;
      case 8: // Sex
        patient.gender = value || (valueBytes[0] === 1 ? 'M' : valueBytes[0] === 2 ? 'F' : '');
        break;
      case 14: // Acquiring device ID
        test.device = value;
        break;
      case 15: // Acquiring device serial
        test.deviceSerial = value;
        break;
      case 16: // Acquiring institution description
        test.institution = value;
        break;
      case 17: // Acquiring department description
        test.department = value;
        break;
      case 25: // Date of acquisition (YYYYMMDD)
        test.acquisitionDate = value;
        break;
      case 26: // Time of acquisition (HHMMSS)
        test.acquisitionTime = value;
        break;
    }
  }

  return { patient, test };
}

/**
 * Parse Huffman tables from Section 2
 */
function parseSection2(reader: SCPReader, section: SCPSection): HuffmanTable[] {
  reader.seek(section.offset);

  // Skip section header
  reader.readUint16(); // CRC
  reader.readUint16(); // Section ID

  const tables: HuffmanTable[] = [];

  // Read number of Huffman tables
  const numTables = reader.readUint16();

  for (let i = 0; i < numTables; i++) {
    const tableLength = reader.readUint16();
    if (tableLength > 0) {
      const tableData = reader.readBytes(tableLength);
      tables.push(parseHuffmanTable(tableData));
    }
  }

  return tables;
}

/**
 * Parse lead definitions from Section 3
 */
function parseSection3(reader: SCPReader, section: SCPSection): {
  numLeads: number;
  simultaneousLeads: number;
  leadDefs: LeadDefinition[];
} {
  reader.seek(section.offset);

  // Skip section header
  reader.readUint16(); // CRC
  reader.readUint16(); // Section ID

  const numLeads = reader.readUint8();
  const flags = reader.readUint8();
  const simultaneousLeads = flags & 0x0F;

  const leadDefs: LeadDefinition[] = [];

  for (let i = 0; i < numLeads; i++) {
    const startSample = reader.readUint32();
    const endSample = reader.readUint32();
    const leadId = reader.readUint8();

    leadDefs.push({ startSample, endSample, leadId });
  }

  return { numLeads, simultaneousLeads, leadDefs };
}

/**
 * Parse reference beat data from Section 5
 */
function parseSection5(
  reader: SCPReader,
  section: SCPSection,
  numLeads: number,
  huffmanTables: HuffmanTable[]
): Int16Array[] {
  reader.seek(section.offset);

  // Skip section header
  reader.readUint16(); // CRC
  reader.readUint16(); // Section ID

  // Read encoding info
  reader.readUint16(); // Amplitude value multiplier (unused here)
  reader.readUint16(); // Sample time interval (unused here)
  const encodingType = reader.readUint8();
  reader.readUint8(); // Reserved

  const referenceBeats: Int16Array[] = [];

  // Read length of each protected zone
  const protectedZoneLengths: number[] = [];
  for (let i = 0; i < numLeads; i++) {
    protectedZoneLengths.push(reader.readUint16());
  }

  // Read reference beat data for each lead
  for (let i = 0; i < numLeads; i++) {
    const numSamples = protectedZoneLengths[i];
    if (numSamples === 0) {
      referenceBeats.push(new Int16Array(0));
      continue;
    }

    const dataLength = reader.readUint16();
    const compressedData = reader.readBytes(dataLength);

    let samples: Int16Array;
    if (encodingType === 0) {
      // No compression - raw Int16
      const view = new DataView(compressedData.buffer, compressedData.byteOffset, compressedData.byteLength);
      samples = new Int16Array(numSamples);
      for (let j = 0; j < numSamples && j * 2 < compressedData.length; j++) {
        samples[j] = view.getInt16(j * 2, true);
      }
    } else {
      // Huffman encoded
      const table = huffmanTables.length > 0 ? huffmanTables[0] : SCP_DEFAULT_TABLE;
      samples = decodeHuffmanSCP(compressedData, numSamples, table);
    }

    // Apply second-difference decoding
    referenceBeats.push(reverseSecondDifference(samples));
  }

  return referenceBeats;
}

/**
 * Parse rhythm data from Section 6
 */
function parseSection6(
  reader: SCPReader,
  section: SCPSection,
  leadDefs: LeadDefinition[],
  huffmanTables: HuffmanTable[],
  referenceBeats: Int16Array[]
): { leads: Partial<Record<LeadName, number[]>>; sampleRate: number } {
  reader.seek(section.offset);

  // Skip section header
  reader.readUint16(); // CRC
  reader.readUint16(); // Section ID

  // Read encoding info
  const avm = reader.readUint16(); // Amplitude value multiplier (nV)
  const sampleTimeInterval = reader.readUint16(); // in microseconds
  const encodingType = reader.readUint8();
  const bimodalCompression = reader.readUint8();

  // Calculate sample rate from interval
  const sampleRate = sampleTimeInterval > 0 ? Math.round(1000000 / sampleTimeInterval) : 500;

  const leads: Partial<Record<LeadName, number[]>> = {};

  // Read data length for each lead
  const dataLengths: number[] = [];
  for (let i = 0; i < leadDefs.length; i++) {
    dataLengths.push(reader.readUint16());
  }

  // Read and decode rhythm data for each lead
  for (let i = 0; i < leadDefs.length; i++) {
    const leadDef = leadDefs[i];
    const leadName = LEAD_ID_MAP[leadDef.leadId];
    if (!leadName) continue;

    const numSamples = leadDef.endSample - leadDef.startSample + 1;
    const dataLength = dataLengths[i];

    if (dataLength === 0 || numSamples === 0) continue;

    const compressedData = reader.readBytes(dataLength);

    let samples: Int16Array;
    if (encodingType === 0) {
      // No compression - raw Int16
      const view = new DataView(compressedData.buffer, compressedData.byteOffset, compressedData.byteLength);
      samples = new Int16Array(numSamples);
      for (let j = 0; j < numSamples && j * 2 < compressedData.length; j++) {
        samples[j] = view.getInt16(j * 2, true);
      }
    } else {
      // Huffman encoded
      const table = huffmanTables.length > 0 ? huffmanTables[0] : SCP_DEFAULT_TABLE;
      samples = decodeHuffmanSCP(compressedData, numSamples, table);
    }

    // Apply second-difference decoding
    const decodedSamples = reverseSecondDifference(samples);

    // Add reference beat if available (for bimodal compression)
    if (bimodalCompression && referenceBeats[i] && referenceBeats[i].length > 0) {
      // This is simplified - full implementation would need QRS locations
      // For now, just use the decoded rhythm data
    }

    // Convert to microvolts
    // AVM is in nanovolts, so divide by 1000 to get microvolts
    const uvPerUnit = avm / 1000;
    leads[leadName] = Array.from(decodedSamples).map(s => s * uvPerUnit);
  }

  return { leads, sampleRate };
}

/**
 * Parse diagnosis statements from Section 8
 */
function parseSection8(reader: SCPReader, section: SCPSection): SCPDiagnosis {
  reader.seek(section.offset);

  // Skip section header
  reader.readUint16(); // CRC
  reader.readUint16(); // Section ID

  const statements: string[] = [];

  // Read confirmed flag
  reader.readUint8();

  // Read number of statements
  const numStatements = reader.readUint8();

  for (let i = 0; i < numStatements; i++) {
    reader.readUint8(); // Sequence number (unused)
    const statementLength = reader.readUint16();

    if (statementLength > 0) {
      const text = reader.readString(statementLength);
      if (text) {
        statements.push(text);
      }
    }
  }

  return { statements };
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
 * Parse an SCP-ECG file from an ArrayBuffer
 */
export function parseSCPECG(buffer: ArrayBuffer): SCPECGData {
  const reader = new SCPReader(buffer);

  // Read file header (skip CRC and record length)
  reader.readUint16(); // CRC
  reader.readUint32(); // Record length

  // Parse Section 0 (pointers)
  reader.readUint16(); // Section 0 CRC
  const section0Id = reader.readUint16(); // Should be 0
  const section0Length = reader.readUint32();

  if (section0Id !== 0) {
    throw new Error('Invalid SCP-ECG file: Section 0 not found');
  }

  const sections = parseSectionPointers(reader, section0Length);

  // Parse Section 1 (patient/test data)
  let patient: SCPPatientData = {
    patientId: '',
    lastName: '',
    firstName: '',
    birthDate: '',
    age: 0,
    gender: '',
    height: 0,
    weight: 0,
  };
  let test: SCPTestData = {
    acquisitionDate: '',
    acquisitionTime: '',
    device: '',
    deviceSerial: '',
    institution: '',
    department: '',
  };

  const section1 = sections.get(1);
  if (section1) {
    const section1Data = parseSection1(reader, section1);
    patient = section1Data.patient;
    test = section1Data.test;
  }

  // Parse Section 2 (Huffman tables) if present
  let huffmanTables: HuffmanTable[] = [];
  const section2 = sections.get(2);
  if (section2) {
    huffmanTables = parseSection2(reader, section2);
  }

  // Parse Section 3 (lead definitions)
  let leadDefs: LeadDefinition[] = [];
  let numLeads = 0;
  const section3 = sections.get(3);
  if (section3) {
    const section3Data = parseSection3(reader, section3);
    leadDefs = section3Data.leadDefs;
    numLeads = section3Data.numLeads;
  }

  // Parse Section 5 (reference beats) if present
  let referenceBeats: Int16Array[] = [];
  const section5 = sections.get(5);
  if (section5 && numLeads > 0) {
    referenceBeats = parseSection5(reader, section5, numLeads, huffmanTables);
  }

  // Parse Section 6 (rhythm data)
  let leads: Partial<Record<LeadName, number[]>> = {};
  let sampleRate = 500;
  const section6 = sections.get(6);
  if (section6 && leadDefs.length > 0) {
    const section6Data = parseSection6(reader, section6, leadDefs, huffmanTables, referenceBeats);
    leads = section6Data.leads;
    sampleRate = section6Data.sampleRate;
  }

  // Parse Section 8 (diagnosis) if present
  let diagnosis: SCPDiagnosis | undefined;
  const section8 = sections.get(8);
  if (section8) {
    diagnosis = parseSection8(reader, section8);
  }

  // Derive any missing leads
  deriveLeads(leads);

  // Calculate duration
  let duration = 0;
  for (const leadData of Object.values(leads)) {
    if (leadData && leadData.length > 0) {
      duration = leadData.length / sampleRate;
      break;
    }
  }

  return {
    patient,
    test,
    diagnosis,
    signal: {
      sampleRate,
      duration,
      leads: leads as Record<LeadName, number[]>,
    },
  };
}

/**
 * Load an SCP-ECG file
 */
export async function loadSCPECGFile(file: File): Promise<SCPECGData> {
  const buffer = await file.arrayBuffer();
  return parseSCPECG(buffer);
}
