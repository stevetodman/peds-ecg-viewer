/**
 * EDF/EDF+ Export Module
 *
 * Exports ECG signals to European Data Format (EDF/EDF+)
 * EDF: European Data Format - standardized format for physiological signals
 * EDF+: Extended format with annotations support
 *
 * Specification: https://www.edfplus.info/specs/
 *
 * @module signal/edf-export
 */

import type { LeadName } from '../../../../types';

// =============================================================================
// Types
// =============================================================================

/**
 * EDF header record (fixed 256 bytes + 256 bytes per signal)
 */
export interface EDFHeader {
  /** Version of data format (always "0       ") */
  version: string;

  /** Patient identification */
  patientId: string;

  /** Recording identification */
  recordingId: string;

  /** Start date of recording (dd.mm.yy) */
  startDate: string;

  /** Start time of recording (hh.mm.ss) */
  startTime: string;

  /** Number of bytes in header record */
  headerBytes: number;

  /** Reserved field ("EDF+C" for continuous, "EDF+D" for discontinuous) */
  reserved: string;

  /** Number of data records */
  numDataRecords: number;

  /** Duration of a data record in seconds */
  dataRecordDuration: number;

  /** Number of signals (ns) */
  numSignals: number;

  /** Signal headers (one per signal) */
  signals: EDFSignalHeader[];
}

/**
 * EDF signal header (256 bytes total for all signals)
 */
export interface EDFSignalHeader {
  /** Signal label (e.g., "EEG Fp1", "ECG") */
  label: string;

  /** Transducer type */
  transducerType: string;

  /** Physical dimension (e.g., "uV", "mV") */
  physicalDimension: string;

  /** Physical minimum */
  physicalMin: number;

  /** Physical maximum */
  physicalMax: number;

  /** Digital minimum */
  digitalMin: number;

  /** Digital maximum */
  digitalMax: number;

  /** Prefiltering */
  prefiltering: string;

  /** Number of samples in each data record */
  numSamples: number;

  /** Reserved */
  reserved: string;
}

/**
 * EDF+ annotation
 */
export interface EDFAnnotation {
  /** Onset time in seconds from recording start */
  onset: number;

  /** Duration in seconds (0 for instantaneous) */
  duration: number;

  /** Annotation text(s) */
  annotations: string[];
}

/**
 * Export options for EDF
 */
export interface EDFExportOptions {
  /** Use EDF+ format with annotations support */
  usePlus?: boolean;

  /** Patient information */
  patient?: {
    id?: string;
    name?: string;
    birthDate?: Date;
    sex?: 'M' | 'F' | 'X';
  };

  /** Recording information */
  recording?: {
    startDate?: Date;
    technician?: string;
    equipment?: string;
    additionalInfo?: string;
  };

  /** Annotations to include (EDF+ only) */
  annotations?: EDFAnnotation[];

  /** Data record duration in seconds (default: 1) */
  dataRecordDuration?: number;

  /** Physical unit for ECG signals */
  physicalUnit?: 'uV' | 'mV';
}

/**
 * Result of EDF export
 */
export interface EDFExportResult {
  /** Success status */
  success: boolean;

  /** Binary EDF data */
  data?: ArrayBuffer;

  /** Error message if failed */
  error?: string;

  /** File statistics */
  stats?: {
    headerBytes: number;
    dataBytes: number;
    totalBytes: number;
    numDataRecords: number;
    durationSeconds: number;
  };
}

// =============================================================================
// Constants
// =============================================================================

/** Standard ECG lead labels for EDF */
const ECG_LEAD_LABELS: Record<LeadName, string> = {
  I: 'ECG I',
  II: 'ECG II',
  III: 'ECG III',
  aVR: 'ECG aVR',
  aVL: 'ECG aVL',
  aVF: 'ECG aVF',
  V1: 'ECG V1',
  V2: 'ECG V2',
  V3: 'ECG V3',
  V4: 'ECG V4',
  V5: 'ECG V5',
  V6: 'ECG V6',
  V3R: 'ECG V3R',
  V4R: 'ECG V4R',
  V7: 'ECG V7',
};

/** 16-bit signed integer range */
const DIGITAL_MIN = -32768;
const DIGITAL_MAX = 32767;

// =============================================================================
// EDF Exporter Class
// =============================================================================

/**
 * EDF/EDF+ file exporter for ECG signals
 */
export class EDFExporter {
  private leads: Map<LeadName, number[]>;
  private sampleRate: number;
  private options: Required<EDFExportOptions>;

  constructor(
    leads: Partial<Record<LeadName, number[]>>,
    sampleRate: number,
    options: EDFExportOptions = {}
  ) {
    this.leads = new Map(Object.entries(leads) as [LeadName, number[]][]);
    this.sampleRate = sampleRate;
    this.options = {
      usePlus: options.usePlus ?? false,
      patient: options.patient ?? {},
      recording: options.recording ?? {},
      annotations: options.annotations ?? [],
      dataRecordDuration: options.dataRecordDuration ?? 1,
      physicalUnit: options.physicalUnit ?? 'uV',
    };
  }

  /**
   * Export ECG data to EDF/EDF+ format
   */
  export(): EDFExportResult {
    try {
      // Validate input
      if (this.leads.size === 0) {
        return { success: false, error: 'No leads to export' };
      }

      // Calculate dimensions
      const samplesPerRecord = Math.round(
        this.sampleRate * this.options.dataRecordDuration
      );
      const leadArray = Array.from(this.leads.entries());
      const numSignals = this.options.usePlus
        ? leadArray.length + 1 // +1 for annotation signal
        : leadArray.length;

      // Get signal duration (use first lead as reference)
      const firstLead = leadArray[0][1];
      const totalSamples = firstLead.length;
      const numDataRecords = Math.ceil(totalSamples / samplesPerRecord);
      const durationSeconds = totalSamples / this.sampleRate;

      // Build header
      const header = this.buildHeader(
        numSignals,
        numDataRecords,
        samplesPerRecord,
        leadArray.map(([name]) => name)
      );

      // Calculate physical min/max from data
      const { physicalMin, physicalMax } = this.calculatePhysicalRange(leadArray);

      // Update signal headers with calculated range
      for (let i = 0; i < leadArray.length; i++) {
        header.signals[i].physicalMin = physicalMin;
        header.signals[i].physicalMax = physicalMax;
      }

      // Serialize header
      const headerBytes = this.serializeHeader(header);

      // Serialize data records
      const dataBytes = this.serializeData(
        leadArray,
        numDataRecords,
        samplesPerRecord,
        physicalMin,
        physicalMax
      );

      // Combine header and data
      const totalBytes = headerBytes.byteLength + dataBytes.byteLength;
      const result = new ArrayBuffer(totalBytes);
      const resultView = new Uint8Array(result);
      resultView.set(new Uint8Array(headerBytes), 0);
      resultView.set(new Uint8Array(dataBytes), headerBytes.byteLength);

      return {
        success: true,
        data: result,
        stats: {
          headerBytes: headerBytes.byteLength,
          dataBytes: dataBytes.byteLength,
          totalBytes,
          numDataRecords,
          durationSeconds,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Build EDF header structure
   */
  private buildHeader(
    numSignals: number,
    numDataRecords: number,
    samplesPerRecord: number,
    leadNames: LeadName[]
  ): EDFHeader {
    const startDate = this.options.recording.startDate ?? new Date();
    const headerBytes = 256 + numSignals * 256;

    // Build patient ID string
    const patientId = this.formatPatientId();

    // Build recording ID string
    const recordingId = this.formatRecordingId(startDate);

    // Build signal headers
    const signals: EDFSignalHeader[] = [];

    // ECG signal headers
    for (const leadName of leadNames) {
      signals.push({
        label: ECG_LEAD_LABELS[leadName] || `ECG ${leadName}`,
        transducerType: 'AgAgCl electrode',
        physicalDimension: this.options.physicalUnit,
        physicalMin: -5000, // Will be updated
        physicalMax: 5000, // Will be updated
        digitalMin: DIGITAL_MIN,
        digitalMax: DIGITAL_MAX,
        prefiltering: 'HP:0.05Hz LP:150Hz',
        numSamples: samplesPerRecord,
        reserved: '',
      });
    }

    // Add EDF+ annotation signal if needed
    if (this.options.usePlus) {
      signals.push({
        label: 'EDF Annotations',
        transducerType: '',
        physicalDimension: '',
        physicalMin: -1,
        physicalMax: 1,
        digitalMin: -32768,
        digitalMax: 32767,
        prefiltering: '',
        numSamples: this.calculateAnnotationSamples(),
        reserved: '',
      });
    }

    return {
      version: '0',
      patientId,
      recordingId,
      startDate: this.formatDate(startDate),
      startTime: this.formatTime(startDate),
      headerBytes,
      reserved: this.options.usePlus ? 'EDF+C' : '',
      numDataRecords,
      dataRecordDuration: this.options.dataRecordDuration,
      numSignals,
      signals,
    };
  }

  /**
   * Format patient ID according to EDF+ specification
   */
  private formatPatientId(): string {
    const p = this.options.patient;
    if (this.options.usePlus) {
      // EDF+ format: code sex birthdate name
      const code = p.id || 'X';
      const sex = p.sex || 'X';
      const birthdate = p.birthDate
        ? this.formatEDFPlusDate(p.birthDate)
        : 'X';
      const name = p.name?.replace(/\s+/g, '_') || 'X';
      return `${code} ${sex} ${birthdate} ${name}`;
    }
    return p.id || 'Unknown';
  }

  /**
   * Format recording ID according to EDF+ specification
   */
  private formatRecordingId(startDate: Date): string {
    if (this.options.usePlus) {
      // EDF+ format: Startdate dd-MMM-yyyy admincode technician equipment
      const dateStr = this.formatEDFPlusDate(startDate);
      const admin = 'X';
      const tech = this.options.recording.technician?.replace(/\s+/g, '_') || 'X';
      const equip = this.options.recording.equipment?.replace(/\s+/g, '_') || 'GEMUSE';
      return `Startdate ${dateStr} ${admin} ${tech} ${equip}`;
    }
    return this.options.recording.additionalInfo || 'GEMUSE ECG Export';
  }

  /**
   * Format date as dd.mm.yy
   */
  private formatDate(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear() % 100).padStart(2, '0');
    return `${dd}.${mm}.${yy}`;
  }

  /**
   * Format time as hh.mm.ss
   */
  private formatTime(date: Date): string {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${hh}.${mm}.${ss}`;
  }

  /**
   * Format date as dd-MMM-yyyy for EDF+
   */
  private formatEDFPlusDate(date: Date): string {
    const months = [
      'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
      'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
    ];
    const dd = String(date.getDate()).padStart(2, '0');
    const mmm = months[date.getMonth()];
    const yyyy = date.getFullYear();
    return `${dd}-${mmm}-${yyyy}`;
  }

  /**
   * Calculate physical min/max from signal data
   */
  private calculatePhysicalRange(
    leads: [LeadName, number[]][]
  ): { physicalMin: number; physicalMax: number } {
    let min = Infinity;
    let max = -Infinity;

    for (const [, samples] of leads) {
      for (const sample of samples) {
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
    }

    // Add 10% margin
    const range = max - min;
    const margin = range * 0.1;

    return {
      physicalMin: Math.floor(min - margin),
      physicalMax: Math.ceil(max + margin),
    };
  }

  /**
   * Calculate annotation signal sample count
   */
  private calculateAnnotationSamples(): number {
    // Estimate bytes needed for annotations per record
    // Minimum 15 bytes for TAL (Time-stamped Annotation List)
    const annotationsPerRecord = Math.ceil(
      this.options.annotations.length /
        (this.options.dataRecordDuration > 0 ? this.options.dataRecordDuration : 1)
    );
    const bytesPerAnnotation = 30; // Average estimate
    return Math.max(60, annotationsPerRecord * bytesPerAnnotation);
  }

  /**
   * Serialize EDF header to bytes
   */
  private serializeHeader(header: EDFHeader): ArrayBuffer {
    const bytes = new Uint8Array(header.headerBytes);
    let offset = 0;

    // Helper to write padded ASCII string
    const writeString = (str: string, length: number) => {
      const ascii = new TextEncoder().encode(str.padEnd(length).slice(0, length));
      bytes.set(ascii, offset);
      offset += length;
    };

    // Fixed header (256 bytes)
    writeString(header.version, 8);
    writeString(header.patientId, 80);
    writeString(header.recordingId, 80);
    writeString(header.startDate, 8);
    writeString(header.startTime, 8);
    writeString(String(header.headerBytes), 8);
    writeString(header.reserved, 44);
    writeString(String(header.numDataRecords), 8);
    writeString(String(header.dataRecordDuration), 8);
    writeString(String(header.numSignals), 4);

    // Signal headers (ns * 256 bytes total)
    // Labels (16 bytes each)
    for (const sig of header.signals) {
      writeString(sig.label, 16);
    }

    // Transducer types (80 bytes each)
    for (const sig of header.signals) {
      writeString(sig.transducerType, 80);
    }

    // Physical dimensions (8 bytes each)
    for (const sig of header.signals) {
      writeString(sig.physicalDimension, 8);
    }

    // Physical minimums (8 bytes each)
    for (const sig of header.signals) {
      writeString(String(sig.physicalMin), 8);
    }

    // Physical maximums (8 bytes each)
    for (const sig of header.signals) {
      writeString(String(sig.physicalMax), 8);
    }

    // Digital minimums (8 bytes each)
    for (const sig of header.signals) {
      writeString(String(sig.digitalMin), 8);
    }

    // Digital maximums (8 bytes each)
    for (const sig of header.signals) {
      writeString(String(sig.digitalMax), 8);
    }

    // Prefiltering (80 bytes each)
    for (const sig of header.signals) {
      writeString(sig.prefiltering, 80);
    }

    // Number of samples (8 bytes each)
    for (const sig of header.signals) {
      writeString(String(sig.numSamples), 8);
    }

    // Reserved (32 bytes each)
    for (const sig of header.signals) {
      writeString(sig.reserved, 32);
    }

    return bytes.buffer;
  }

  /**
   * Serialize signal data to bytes
   */
  private serializeData(
    leads: [LeadName, number[]][],
    numDataRecords: number,
    samplesPerRecord: number,
    physicalMin: number,
    physicalMax: number
  ): ArrayBuffer {
    // Calculate scaling factors
    const physicalRange = physicalMax - physicalMin;
    const digitalRange = DIGITAL_MAX - DIGITAL_MIN;
    const scale = digitalRange / physicalRange;

    // Calculate total bytes needed
    let bytesPerRecord = 0;
    for (const [, samples] of leads) {
      bytesPerRecord += samplesPerRecord * 2; // 16-bit samples
      void samples; // Use samples reference
    }

    if (this.options.usePlus) {
      bytesPerRecord += this.calculateAnnotationSamples() * 2;
    }

    const totalBytes = numDataRecords * bytesPerRecord;
    const data = new ArrayBuffer(totalBytes);
    const view = new DataView(data);
    let byteOffset = 0;

    // Write data records
    for (let record = 0; record < numDataRecords; record++) {
      const startSample = record * samplesPerRecord;

      // Write each lead's samples for this record
      for (const [, samples] of leads) {
        for (let i = 0; i < samplesPerRecord; i++) {
          const sampleIdx = startSample + i;
          const value = sampleIdx < samples.length ? samples[sampleIdx] : 0;

          // Convert physical to digital value
          const digital = Math.round((value - physicalMin) * scale + DIGITAL_MIN);
          const clipped = Math.max(DIGITAL_MIN, Math.min(DIGITAL_MAX, digital));

          view.setInt16(byteOffset, clipped, true); // Little-endian
          byteOffset += 2;
        }
      }

      // Write annotation signal for EDF+
      if (this.options.usePlus) {
        const annotationBytes = this.serializeAnnotations(
          record,
          this.options.dataRecordDuration
        );
        const annotationSamples = this.calculateAnnotationSamples();

        // Write annotation bytes as 16-bit values
        for (let i = 0; i < annotationSamples; i++) {
          const byte1 = i * 2 < annotationBytes.length ? annotationBytes[i * 2] : 0;
          const byte2 =
            i * 2 + 1 < annotationBytes.length ? annotationBytes[i * 2 + 1] : 0;
          view.setUint8(byteOffset, byte1);
          view.setUint8(byteOffset + 1, byte2);
          byteOffset += 2;
        }
      }
    }

    return data;
  }

  /**
   * Serialize annotations for a data record (EDF+ TAL format)
   */
  private serializeAnnotations(
    recordIndex: number,
    recordDuration: number
  ): Uint8Array {
    const recordStartTime = recordIndex * recordDuration;
    const recordEndTime = recordStartTime + recordDuration;

    // Build TAL (Time-stamped Annotation List)
    let tal = '';

    // Time-keeping annotation (required for each data record)
    tal += `+${recordStartTime.toFixed(6)}\x14\x14\x00`;

    // Add any annotations that fall within this record
    for (const ann of this.options.annotations) {
      if (ann.onset >= recordStartTime && ann.onset < recordEndTime) {
        // Format: +onset[DURATION]ANNOTATION[ANNOTATION]...
        const onset = `+${ann.onset.toFixed(6)}`;
        const duration = ann.duration > 0 ? `\x15${ann.duration.toFixed(6)}` : '';
        const texts = ann.annotations.join('\x14');
        tal += `${onset}${duration}\x14${texts}\x14\x00`;
      }
    }

    return new TextEncoder().encode(tal);
  }

  /**
   * Export to downloadable Blob
   */
  exportToBlob(): Blob | null {
    const result = this.export();
    if (!result.success || !result.data) {
      return null;
    }
    return new Blob([result.data], { type: 'application/octet-stream' });
  }

  /**
   * Export and trigger download in browser
   */
  downloadAs(filename: string): boolean {
    const blob = this.exportToBlob();
    if (!blob) {
      return false;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.edf') ? filename : `${filename}.edf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return true;
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Export ECG signal to EDF format
 */
export function exportToEDF(
  leads: Partial<Record<LeadName, number[]>>,
  sampleRate: number,
  options?: EDFExportOptions
): EDFExportResult {
  const exporter = new EDFExporter(leads, sampleRate, options);
  return exporter.export();
}

/**
 * Export ECG signal to EDF+ format with annotations
 */
export function exportToEDFPlus(
  leads: Partial<Record<LeadName, number[]>>,
  sampleRate: number,
  annotations: EDFAnnotation[],
  options?: Omit<EDFExportOptions, 'usePlus' | 'annotations'>
): EDFExportResult {
  const exporter = new EDFExporter(leads, sampleRate, {
    ...options,
    usePlus: true,
    annotations,
  });
  return exporter.export();
}

/**
 * Create EDF+ annotations from beat classifications
 */
export function createBeatAnnotations(
  beats: Array<{ index: number; classification: string }>,
  sampleRate: number
): EDFAnnotation[] {
  return beats.map((beat) => ({
    onset: beat.index / sampleRate,
    duration: 0,
    annotations: [beat.classification],
  }));
}

/**
 * Create EDF+ annotations from interval measurements
 */
export function createIntervalAnnotations(
  measurements: Array<{
    type: string;
    startIndex: number;
    endIndex: number;
    value: number;
  }>,
  sampleRate: number
): EDFAnnotation[] {
  return measurements.map((m) => ({
    onset: m.startIndex / sampleRate,
    duration: (m.endIndex - m.startIndex) / sampleRate,
    annotations: [`${m.type}: ${m.value.toFixed(0)}ms`],
  }));
}

// =============================================================================
// EDF Reader (for validation/testing)
// =============================================================================

/**
 * Parse EDF header from ArrayBuffer
 */
export function parseEDFHeader(buffer: ArrayBuffer): EDFHeader | null {
  try {
    const view = new DataView(buffer);
    const decoder = new TextDecoder('ascii');

    const readString = (offset: number, length: number): string => {
      const bytes = new Uint8Array(buffer, offset, length);
      return decoder.decode(bytes).trim();
    };

    let offset = 0;

    // Fixed header
    const version = readString(offset, 8); offset += 8;
    const patientId = readString(offset, 80); offset += 80;
    const recordingId = readString(offset, 80); offset += 80;
    const startDate = readString(offset, 8); offset += 8;
    const startTime = readString(offset, 8); offset += 8;
    const headerBytes = parseInt(readString(offset, 8)); offset += 8;
    const reserved = readString(offset, 44); offset += 44;
    const numDataRecords = parseInt(readString(offset, 8)); offset += 8;
    const dataRecordDuration = parseFloat(readString(offset, 8)); offset += 8;
    const numSignals = parseInt(readString(offset, 4)); offset += 4;

    // Signal headers
    const signals: EDFSignalHeader[] = [];
    const labels: string[] = [];
    const transducerTypes: string[] = [];
    const physicalDimensions: string[] = [];
    const physicalMins: number[] = [];
    const physicalMaxs: number[] = [];
    const digitalMins: number[] = [];
    const digitalMaxs: number[] = [];
    const prefilterings: string[] = [];
    const numSamplesArr: number[] = [];
    const reserveds: string[] = [];

    // Read each field for all signals
    for (let i = 0; i < numSignals; i++) {
      labels.push(readString(offset, 16)); offset += 16;
    }
    for (let i = 0; i < numSignals; i++) {
      transducerTypes.push(readString(offset, 80)); offset += 80;
    }
    for (let i = 0; i < numSignals; i++) {
      physicalDimensions.push(readString(offset, 8)); offset += 8;
    }
    for (let i = 0; i < numSignals; i++) {
      physicalMins.push(parseFloat(readString(offset, 8))); offset += 8;
    }
    for (let i = 0; i < numSignals; i++) {
      physicalMaxs.push(parseFloat(readString(offset, 8))); offset += 8;
    }
    for (let i = 0; i < numSignals; i++) {
      digitalMins.push(parseInt(readString(offset, 8))); offset += 8;
    }
    for (let i = 0; i < numSignals; i++) {
      digitalMaxs.push(parseInt(readString(offset, 8))); offset += 8;
    }
    for (let i = 0; i < numSignals; i++) {
      prefilterings.push(readString(offset, 80)); offset += 80;
    }
    for (let i = 0; i < numSignals; i++) {
      numSamplesArr.push(parseInt(readString(offset, 8))); offset += 8;
    }
    for (let i = 0; i < numSignals; i++) {
      reserveds.push(readString(offset, 32)); offset += 32;
    }

    // Build signal header objects
    for (let i = 0; i < numSignals; i++) {
      signals.push({
        label: labels[i],
        transducerType: transducerTypes[i],
        physicalDimension: physicalDimensions[i],
        physicalMin: physicalMins[i],
        physicalMax: physicalMaxs[i],
        digitalMin: digitalMins[i],
        digitalMax: digitalMaxs[i],
        prefiltering: prefilterings[i],
        numSamples: numSamplesArr[i],
        reserved: reserveds[i],
      });
    }

    void view; // Suppress unused warning

    return {
      version,
      patientId,
      recordingId,
      startDate,
      startTime,
      headerBytes,
      reserved,
      numDataRecords,
      dataRecordDuration,
      numSignals,
      signals,
    };
  } catch {
    return null;
  }
}
