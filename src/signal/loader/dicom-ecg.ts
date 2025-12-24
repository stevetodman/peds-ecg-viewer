/**
 * DICOM ECG Parser
 *
 * Parses ECG waveform data from DICOM files.
 * Supports 12-Lead ECG IOD with channel-multiplexed waveforms.
 *
 * @module signal/loader/dicom-ecg
 */

import type { ECGSignal, LeadName } from '../../types';

/**
 * Patient demographics from DICOM
 */
export interface DICOMPatientData {
  patientId: string;
  patientName: string;
  birthDate: string;
  sex: string;
}

/**
 * Study information from DICOM
 */
export interface DICOMStudyData {
  studyDate: string;
  studyTime: string;
  studyDescription: string;
  institutionName: string;
  referringPhysician: string;
}

/**
 * Complete parsed DICOM ECG data
 */
export interface DICOMECGData {
  patient: DICOMPatientData;
  study: DICOMStudyData;
  signal: ECGSignal;
}

/**
 * DICOM tag constants
 */
const DICOM_TAGS = {
  // Patient Module
  PatientName: 0x00100010,
  PatientID: 0x00100020,
  PatientBirthDate: 0x00100030,
  PatientSex: 0x00100040,

  // Study Module
  StudyDate: 0x00080020,
  StudyTime: 0x00080030,
  StudyDescription: 0x00081030,
  InstitutionName: 0x00080080,
  ReferringPhysician: 0x00080090,

  // Waveform Module
  WaveformSequence: 0x54000100,
  NumberOfWaveformChannels: 0x003A0005,
  NumberOfWaveformSamples: 0x003A0010,
  SamplingFrequency: 0x003A001A,
  ChannelDefinitionSequence: 0x003A0200,
  ChannelSourceSequence: 0x003A0208,
  ChannelSensitivity: 0x003A0210,
  ChannelSensitivityUnitsSequence: 0x003A0211,
  ChannelBaseline: 0x003A0212,
  WaveformBitsAllocated: 0x54001004,
  WaveformSampleInterpretation: 0x54001006,
  WaveformData: 0x54001010,

  // Code Sequence
  CodeValue: 0x00080100,
  CodingSchemeDesignator: 0x00080102,
  CodeMeaning: 0x00080104,

  // Sequence delimiters
  Item: 0xFFFEE000,
  ItemDelimitationItem: 0xFFFEE00D,
  SequenceDelimitationItem: 0xFFFEE0DD,
} as const;

/**
 * Value Representations (VR)
 */
const EXPLICIT_VR_TYPES = new Set([
  'OB', 'OD', 'OF', 'OL', 'OW', 'SQ', 'UC', 'UN', 'UR', 'UT',
]);

/**
 * Map DICOM lead codes to standard lead names
 */
function mapDICOMLeadCode(codeValue: string, codeMeaning: string): LeadName | null {
  // Try code meaning first (more readable)
  const meaningMap: Record<string, LeadName> = {
    'Lead I': 'I',
    'Lead II': 'II',
    'Lead III': 'III',
    'Lead aVR': 'aVR',
    'Lead aVL': 'aVL',
    'Lead aVF': 'aVF',
    'Lead V1': 'V1',
    'Lead V2': 'V2',
    'Lead V3': 'V3',
    'Lead V4': 'V4',
    'Lead V5': 'V5',
    'Lead V6': 'V6',
    'I': 'I',
    'II': 'II',
    'III': 'III',
    'aVR': 'aVR',
    'aVL': 'aVL',
    'aVF': 'aVF',
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

  if (meaningMap[codeMeaning]) {
    return meaningMap[codeMeaning];
  }

  // ISO/IEEE 11073-10101 MDC codes
  const codeMap: Record<string, LeadName> = {
    '2:1': 'I',
    '2:2': 'II',
    '2:61': 'III',
    '2:62': 'aVR',
    '2:63': 'aVL',
    '2:64': 'aVF',
    '2:3': 'V1',
    '2:4': 'V2',
    '2:5': 'V3',
    '2:6': 'V4',
    '2:7': 'V5',
    '2:8': 'V6',
  };

  return codeMap[codeValue] ?? null;
}

/**
 * DICOM data element
 */
interface DataElement {
  tag: number;
  vr: string;
  length: number;
  value: ArrayBuffer | DataElement[] | string | number;
  offset: number;
}

/**
 * DICOM Parser class
 */
class DICOMParser {
  private view: DataView;
  private littleEndian: boolean = true;
  private explicitVR: boolean = true;
  private offset: number = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  /**
   * Parse the DICOM file
   */
  parse(): Map<number, DataElement> {
    const elements = new Map<number, DataElement>();

    // Check for DICOM preamble and magic number
    if (this.view.byteLength > 132) {
      const magic = String.fromCharCode(
        this.view.getUint8(128),
        this.view.getUint8(129),
        this.view.getUint8(130),
        this.view.getUint8(131)
      );
      if (magic === 'DICM') {
        this.offset = 132;
      }
    }

    // Parse elements
    while (this.offset < this.view.byteLength - 8) {
      try {
        const element = this.readElement();
        if (element) {
          elements.set(element.tag, element);
        }
      } catch {
        break;
      }
    }

    return elements;
  }

  /**
   * Read a single data element
   */
  private readElement(): DataElement | null {
    if (this.offset + 4 > this.view.byteLength) return null;

    const startOffset = this.offset;

    // Read tag
    const group = this.view.getUint16(this.offset, this.littleEndian);
    const element = this.view.getUint16(this.offset + 2, this.littleEndian);
    const tag = (group << 16) | element;
    this.offset += 4;

    // Handle sequence delimiters
    if (tag === DICOM_TAGS.ItemDelimitationItem || tag === DICOM_TAGS.SequenceDelimitationItem) {
      this.offset += 4; // Skip length (always 0)
      return null;
    }

    // Read VR and length
    let vr = '';
    let length = 0;

    if (this.explicitVR && group !== 0xFFFE) {
      vr = String.fromCharCode(this.view.getUint8(this.offset), this.view.getUint8(this.offset + 1));
      this.offset += 2;

      if (EXPLICIT_VR_TYPES.has(vr)) {
        this.offset += 2; // Skip reserved bytes
        length = this.view.getUint32(this.offset, this.littleEndian);
        this.offset += 4;
      } else {
        length = this.view.getUint16(this.offset, this.littleEndian);
        this.offset += 2;
      }
    } else {
      // Implicit VR or sequence item
      length = this.view.getUint32(this.offset, this.littleEndian);
      this.offset += 4;
      vr = 'UN';
    }

    // Handle undefined length
    if (length === 0xFFFFFFFF) {
      // Sequence with undefined length
      const items = this.readSequenceItems();
      return { tag, vr, length: -1, value: items, offset: startOffset };
    }

    // Read value
    let value: ArrayBuffer | string | number | DataElement[] = new ArrayBuffer(0);

    if (length > 0 && this.offset + length <= this.view.byteLength) {
      if (vr === 'SQ') {
        // Sequence
        const endOffset = this.offset + length;
        const items: DataElement[] = [];
        while (this.offset < endOffset) {
          const item = this.readElement();
          if (item) items.push(item);
        }
        value = items;
      } else if (['LO', 'SH', 'PN', 'CS', 'DA', 'TM', 'UI', 'DS', 'IS', 'LT', 'ST', 'UT'].includes(vr)) {
        // String types
        const bytes = new Uint8Array(this.view.buffer, this.offset, length);
        value = new TextDecoder('utf-8').decode(bytes).replace(/\0/g, '').trim();
        this.offset += length;
      } else if (vr === 'US') {
        value = this.view.getUint16(this.offset, this.littleEndian);
        this.offset += length;
      } else if (vr === 'UL') {
        value = this.view.getUint32(this.offset, this.littleEndian);
        this.offset += length;
      } else if (vr === 'FL') {
        value = this.view.getFloat32(this.offset, this.littleEndian);
        this.offset += length;
      } else if (vr === 'FD') {
        value = this.view.getFloat64(this.offset, this.littleEndian);
        this.offset += length;
      } else {
        // Binary data
        const sliced = this.view.buffer.slice(this.offset, this.offset + length);
        value = sliced instanceof ArrayBuffer ? sliced : new ArrayBuffer(0);
        this.offset += length;
      }
    } else if (length > 0) {
      // Skip if we can't read
      this.offset += Math.min(length, this.view.byteLength - this.offset);
    }

    return { tag, vr, length, value, offset: startOffset };
  }

  /**
   * Read sequence items with undefined length
   */
  private readSequenceItems(): DataElement[] {
    const items: DataElement[] = [];

    while (this.offset < this.view.byteLength - 8) {
      const group = this.view.getUint16(this.offset, this.littleEndian);
      const element = this.view.getUint16(this.offset + 2, this.littleEndian);
      const tag = (group << 16) | element;

      if (tag === DICOM_TAGS.SequenceDelimitationItem) {
        this.offset += 8;
        break;
      }

      const item = this.readElement();
      if (item) items.push(item);
    }

    return items;
  }
}

/**
 * Extract string value from element
 */
function getStringValue(elements: Map<number, DataElement>, tag: number): string {
  const el = elements.get(tag);
  if (el && typeof el.value === 'string') {
    return el.value;
  }
  return '';
}

/**
 * Find element in nested sequence
 */
function findInSequence(elements: DataElement[], tag: number): DataElement | undefined {
  for (const el of elements) {
    if (el.tag === tag) return el;
    if (Array.isArray(el.value)) {
      const found = findInSequence(el.value, tag);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Parse patient data from DICOM elements
 */
function parsePatientData(elements: Map<number, DataElement>): DICOMPatientData {
  return {
    patientId: getStringValue(elements, DICOM_TAGS.PatientID),
    patientName: getStringValue(elements, DICOM_TAGS.PatientName),
    birthDate: getStringValue(elements, DICOM_TAGS.PatientBirthDate),
    sex: getStringValue(elements, DICOM_TAGS.PatientSex),
  };
}

/**
 * Parse study data from DICOM elements
 */
function parseStudyData(elements: Map<number, DataElement>): DICOMStudyData {
  return {
    studyDate: getStringValue(elements, DICOM_TAGS.StudyDate),
    studyTime: getStringValue(elements, DICOM_TAGS.StudyTime),
    studyDescription: getStringValue(elements, DICOM_TAGS.StudyDescription),
    institutionName: getStringValue(elements, DICOM_TAGS.InstitutionName),
    referringPhysician: getStringValue(elements, DICOM_TAGS.ReferringPhysician),
  };
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
 * Parse waveform data from DICOM elements
 */
function parseWaveformData(elements: Map<number, DataElement>): ECGSignal {
  const leads: Partial<Record<LeadName, number[]>> = {};
  let sampleRate = 500;
  let duration = 0;

  // Get waveform sequence
  const waveformSeq = elements.get(DICOM_TAGS.WaveformSequence);
  if (!waveformSeq || !Array.isArray(waveformSeq.value)) {
    throw new Error('No waveform sequence found in DICOM file');
  }

  const waveformItems = waveformSeq.value;

  // Process each multiplex group
  for (const item of waveformItems) {
    if (item.tag !== DICOM_TAGS.Item || !Array.isArray(item.value)) continue;

    const itemElements = item.value;

    // Get number of channels and samples
    const numChannelsEl = findInSequence(itemElements, DICOM_TAGS.NumberOfWaveformChannels);
    const numSamplesEl = findInSequence(itemElements, DICOM_TAGS.NumberOfWaveformSamples);
    const samplingFreqEl = findInSequence(itemElements, DICOM_TAGS.SamplingFrequency);

    const numChannels = typeof numChannelsEl?.value === 'number' ? numChannelsEl.value : 0;
    const numSamples = typeof numSamplesEl?.value === 'number' ? numSamplesEl.value : 0;

    if (samplingFreqEl) {
      if (typeof samplingFreqEl.value === 'number') {
        sampleRate = samplingFreqEl.value;
      } else if (typeof samplingFreqEl.value === 'string') {
        sampleRate = parseFloat(samplingFreqEl.value) || 500;
      }
    }

    if (numChannels === 0 || numSamples === 0) continue;

    // Get channel definitions
    const channelDefSeq = findInSequence(itemElements, DICOM_TAGS.ChannelDefinitionSequence);
    if (!channelDefSeq || !Array.isArray(channelDefSeq.value)) continue;

    const channelDefs = channelDefSeq.value;
    const channelInfo: { leadName: LeadName | null; sensitivity: number; baseline: number }[] = [];

    for (const channelDef of channelDefs) {
      if (channelDef.tag !== DICOM_TAGS.Item || !Array.isArray(channelDef.value)) continue;

      const channelElements = channelDef.value;

      // Get lead identification
      const channelSourceSeq = findInSequence(channelElements, DICOM_TAGS.ChannelSourceSequence);
      let leadName: LeadName | null = null;

      if (channelSourceSeq && Array.isArray(channelSourceSeq.value)) {
        const sourceItem = (channelSourceSeq.value).find(e => e.tag === DICOM_TAGS.Item);
        if (sourceItem && Array.isArray(sourceItem.value)) {
          const codeValueEl = findInSequence(sourceItem.value, DICOM_TAGS.CodeValue);
          const codeMeaningEl = findInSequence(sourceItem.value, DICOM_TAGS.CodeMeaning);
          const codeValue = typeof codeValueEl?.value === 'string' ? codeValueEl.value : '';
          const codeMeaning = typeof codeMeaningEl?.value === 'string' ? codeMeaningEl.value : '';
          leadName = mapDICOMLeadCode(codeValue, codeMeaning);
        }
      }

      // Get sensitivity (conversion factor to physical units)
      const sensitivityEl = findInSequence(channelElements, DICOM_TAGS.ChannelSensitivity);
      let sensitivity = 1;
      if (sensitivityEl) {
        if (typeof sensitivityEl.value === 'number') {
          sensitivity = sensitivityEl.value;
        } else if (typeof sensitivityEl.value === 'string') {
          sensitivity = parseFloat(sensitivityEl.value) || 1;
        }
      }

      // Get baseline
      const baselineEl = findInSequence(channelElements, DICOM_TAGS.ChannelBaseline);
      let baseline = 0;
      if (baselineEl) {
        if (typeof baselineEl.value === 'number') {
          baseline = baselineEl.value;
        } else if (typeof baselineEl.value === 'string') {
          baseline = parseFloat(baselineEl.value) || 0;
        }
      }

      channelInfo.push({ leadName, sensitivity, baseline });
    }

    // Get waveform data
    const waveformDataEl = findInSequence(itemElements, DICOM_TAGS.WaveformData);
    if (!waveformDataEl || !(waveformDataEl.value instanceof ArrayBuffer)) continue;

    const waveformBuffer = waveformDataEl.value;
    const waveformView = new DataView(waveformBuffer);

    // Get bits allocated and sample interpretation
    const bitsAllocatedEl = findInSequence(itemElements, DICOM_TAGS.WaveformBitsAllocated);
    const bitsAllocated = typeof bitsAllocatedEl?.value === 'number' ? bitsAllocatedEl.value : 16;

    const sampleInterpEl = findInSequence(itemElements, DICOM_TAGS.WaveformSampleInterpretation);
    const sampleInterp = typeof sampleInterpEl?.value === 'string' ? sampleInterpEl.value : 'SS';

    // De-multiplex the waveform data
    // Data is interleaved: (Ch1,S1), (Ch2,S1), ..., (ChN,S1), (Ch1,S2), ...
    const bytesPerSample = bitsAllocated / 8;
    const samplesPerChannel: number[][] = channelInfo.map(() => []);

    for (let sampleIdx = 0; sampleIdx < numSamples; sampleIdx++) {
      for (let channelIdx = 0; channelIdx < numChannels; channelIdx++) {
        const offset = (sampleIdx * numChannels + channelIdx) * bytesPerSample;
        if (offset + bytesPerSample > waveformBuffer.byteLength) break;

        let rawValue: number;
        if (bitsAllocated === 16) {
          if (sampleInterp === 'SS') {
            rawValue = waveformView.getInt16(offset, true);
          } else {
            rawValue = waveformView.getUint16(offset, true);
          }
        } else if (bitsAllocated === 8) {
          if (sampleInterp === 'SB') {
            rawValue = waveformView.getInt8(offset);
          } else {
            rawValue = waveformView.getUint8(offset);
          }
        } else {
          rawValue = waveformView.getInt16(offset, true);
        }

        if (channelIdx < samplesPerChannel.length) {
          samplesPerChannel[channelIdx].push(rawValue);
        }
      }
    }

    // Apply sensitivity and assign to leads
    for (let i = 0; i < channelInfo.length; i++) {
      const { leadName, sensitivity, baseline } = channelInfo[i];
      if (!leadName || !samplesPerChannel[i]) continue;

      // Convert to microvolts
      // sensitivity is typically in mV, so multiply by 1000 for uV
      const conversionFactor = sensitivity * 1000;
      leads[leadName] = samplesPerChannel[i].map(s => (s - baseline) * conversionFactor);
    }

    // Calculate duration
    if (duration === 0 && numSamples > 0) {
      duration = numSamples / sampleRate;
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
 * Parse a DICOM ECG file from an ArrayBuffer
 */
export function parseDICOMECG(buffer: ArrayBuffer): DICOMECGData {
  const parser = new DICOMParser(buffer);
  const elements = parser.parse();

  return {
    patient: parsePatientData(elements),
    study: parseStudyData(elements),
    signal: parseWaveformData(elements),
  };
}

/**
 * Load a DICOM ECG file
 */
export async function loadDICOMECGFile(file: File): Promise<DICOMECGData> {
  const buffer = await file.arrayBuffer();
  return parseDICOMECG(buffer);
}
