/**
 * MIT-BIH Format Exporter
 * Export ECG signals to MIT-BIH format (PhysioNet compatible)
 *
 * MIT-BIH format consists of:
 * - .hea file: Header with metadata
 * - .dat file: Binary waveform data
 *
 * This format is used by PhysioNet and many research applications.
 * Reference: https://physionet.org/physiotools/wag/header-5.htm
 *
 * @module signal/loader/png-digitizer/export/mit-bih
 */

import type { LeadName } from '../types';

/**
 * MIT-BIH export options
 */
export interface MITBIHExportOptions {
  /** Record name (default: 'ecg_record') */
  recordName?: string;

  /** Which leads to export (default: all) */
  leads?: LeadName[];

  /** ADC resolution in bits (default: 16) */
  adcResolution?: 12 | 16;

  /** ADC zero value (default: 0) */
  adcZero?: number;

  /** Baseline value (default: 0) */
  baseline?: number;

  /** Comments to include in header */
  comments?: string[];
}

/**
 * ECG signal data for export
 */
interface ECGSignalData {
  sampleRate: number;
  leads: Partial<Record<LeadName, number[]>>;
  duration?: number;
  metadata?: Record<string, any>;
}

/**
 * MIT-BIH export result
 */
interface MITBIHExportResult {
  /** Header file content (.hea) */
  header: string;

  /** Binary data file content (.dat) */
  data: ArrayBuffer;

  /** Record name */
  recordName: string;
}

/**
 * MIT-BIH Format Exporter class
 */
export class MITBIHExporter {
  private options: Required<MITBIHExportOptions>;

  constructor(options: MITBIHExportOptions = {}) {
    this.options = {
      recordName: options.recordName ?? 'ecg_record',
      leads: options.leads ?? [],
      adcResolution: options.adcResolution ?? 16,
      adcZero: options.adcZero ?? 0,
      baseline: options.baseline ?? 0,
      comments: options.comments ?? [],
    };
  }

  /**
   * Export ECG signal to MIT-BIH format
   */
  export(signal: ECGSignalData): MITBIHExportResult {
    // Determine which leads to export
    const leadsToExport = this.options.leads.length > 0
      ? this.options.leads.filter(l => signal.leads[l])
      : (Object.keys(signal.leads) as LeadName[]).filter(l => signal.leads[l]);

    const numSignals = leadsToExport.length;
    const maxLength = Math.max(...leadsToExport.map(l => signal.leads[l]?.length ?? 0));

    // Calculate gain (ADU per mV)
    // Standard ECG: 1mV = 1000µV, typical gain is 200 ADU/mV for 12-bit
    const adcMax = Math.pow(2, this.options.adcResolution - 1) - 1;
    const maxAmplitudeMv = 10; // ±10mV range
    const gain = adcMax / (maxAmplitudeMv * 1000); // ADU per µV

    // Generate header
    const header = this.generateHeader(
      signal.sampleRate,
      numSignals,
      maxLength,
      leadsToExport,
      gain
    );

    // Generate binary data
    const data = this.generateBinaryData(signal, leadsToExport, gain, maxLength);

    return {
      header,
      data,
      recordName: this.options.recordName,
    };
  }

  /**
   * Generate header file content
   */
  private generateHeader(
    sampleRate: number,
    numSignals: number,
    numSamples: number,
    leads: LeadName[],
    gain: number
  ): string {
    const lines: string[] = [];

    // First line: record name, number of signals, sampling frequency, number of samples
    lines.push(`${this.options.recordName} ${numSignals} ${sampleRate} ${numSamples}`);

    // Signal specification lines
    for (const lead of leads) {
      // Format: filename format gain(units) baseline ADC-resolution ADC-zero first-value checksum block-size description
      // Example: ecg.dat 16 200(uV)/mV 0 16 0 0 0 0 Lead I
      const gainStr = `${(gain * 1000).toFixed(2)}(uV)/mV`;

      lines.push(
        `${this.options.recordName}.dat ` +
        `${this.options.adcResolution === 16 ? '16' : '212'} ` +
        `${gainStr} ` +
        `${this.options.baseline} ` +
        `${this.options.adcResolution} ` +
        `${this.options.adcZero} ` +
        `0 0 0 ` +
        `${lead}`
      );
    }

    // Add comments
    for (const comment of this.options.comments) {
      lines.push(`# ${comment}`);
    }

    // Add export info
    lines.push(`# Exported by GEMUSE ECG Digitizer`);
    lines.push(`# Export date: ${new Date().toISOString()}`);

    return lines.join('\n');
  }

  /**
   * Generate binary data file
   */
  private generateBinaryData(
    signal: ECGSignalData,
    leads: LeadName[],
    gain: number,
    numSamples: number
  ): ArrayBuffer {
    const numSignals = leads.length;

    // Calculate buffer size
    // Format 16: 2 bytes per sample per signal
    // Format 212: 3 bytes per 2 samples per signal (packed 12-bit)
    let bufferSize: number;

    if (this.options.adcResolution === 16) {
      bufferSize = numSamples * numSignals * 2;
    } else {
      // Format 212: packed 12-bit samples
      bufferSize = Math.ceil(numSamples * numSignals * 1.5);
    }

    const buffer = new ArrayBuffer(bufferSize);

    if (this.options.adcResolution === 16) {
      this.writeFormat16(buffer, signal, leads, gain, numSamples);
    } else {
      this.writeFormat212(buffer, signal, leads, gain, numSamples);
    }

    return buffer;
  }

  /**
   * Write data in Format 16 (16-bit samples)
   */
  private writeFormat16(
    buffer: ArrayBuffer,
    signal: ECGSignalData,
    leads: LeadName[],
    gain: number,
    numSamples: number
  ): void {
    const view = new DataView(buffer);
    const adcMax = Math.pow(2, 15) - 1;
    const adcMin = -Math.pow(2, 15);

    let offset = 0;

    // Interleaved samples: sample0_lead0, sample0_lead1, ..., sample1_lead0, ...
    for (let i = 0; i < numSamples; i++) {
      for (const lead of leads) {
        const data = signal.leads[lead];
        const value = data && i < data.length ? data[i] : 0;

        // Convert µV to ADC units
        let adc = Math.round(value * gain);

        // Clamp to valid range
        adc = Math.max(adcMin, Math.min(adcMax, adc));

        // Write as little-endian 16-bit signed integer
        view.setInt16(offset, adc, true);
        offset += 2;
      }
    }
  }

  /**
   * Write data in Format 212 (packed 12-bit samples)
   */
  private writeFormat212(
    buffer: ArrayBuffer,
    signal: ECGSignalData,
    leads: LeadName[],
    gain: number,
    numSamples: number
  ): void {
    const view = new Uint8Array(buffer);
    const numSignals = leads.length;
    const adcMax = Math.pow(2, 11) - 1; // 2047
    const adcMin = -Math.pow(2, 11);    // -2048

    let byteOffset = 0;

    // For Format 212, we pack two 12-bit samples into 3 bytes
    // Byte layout: [s1_low8, s1_high4 | s2_low4, s2_high8]
    for (let i = 0; i < numSamples; i++) {
      for (let j = 0; j < numSignals; j += 2) {
        // Get first sample
        const data1 = signal.leads[leads[j]];
        const value1 = data1 && i < data1.length ? data1[i] : 0;
        let adc1 = Math.round(value1 * gain);
        adc1 = Math.max(adcMin, Math.min(adcMax, adc1));
        if (adc1 < 0) adc1 += 4096; // Convert to unsigned 12-bit

        // Get second sample (or 0 if odd number of signals)
        let adc2 = 0;
        if (j + 1 < numSignals) {
          const data2 = signal.leads[leads[j + 1]];
          const value2 = data2 && i < data2.length ? data2[i] : 0;
          adc2 = Math.round(value2 * gain);
          adc2 = Math.max(adcMin, Math.min(adcMax, adc2));
          if (adc2 < 0) adc2 += 4096;
        }

        // Pack into 3 bytes
        view[byteOffset++] = adc1 & 0xFF;
        view[byteOffset++] = ((adc1 >> 8) & 0x0F) | ((adc2 & 0x0F) << 4);
        view[byteOffset++] = (adc2 >> 4) & 0xFF;
      }
    }
  }

  /**
   * Export to files (returns both header and data as Blobs)
   */
  exportToBlobs(signal: ECGSignalData): { header: Blob; data: Blob; recordName: string } {
    const result = this.export(signal);

    return {
      header: new Blob([result.header], { type: 'text/plain;charset=utf-8' }),
      data: new Blob([result.data], { type: 'application/octet-stream' }),
      recordName: result.recordName,
    };
  }

  /**
   * Export and trigger download of both files (browser only)
   */
  exportAndDownload(signal: ECGSignalData): void {
    if (typeof document === 'undefined') {
      throw new Error('exportAndDownload is only available in browser environment');
    }

    const blobs = this.exportToBlobs(signal);

    // Download header file
    const headerUrl = URL.createObjectURL(blobs.header);
    const headerLink = document.createElement('a');
    headerLink.href = headerUrl;
    headerLink.download = `${blobs.recordName}.hea`;
    document.body.appendChild(headerLink);
    headerLink.click();
    document.body.removeChild(headerLink);
    URL.revokeObjectURL(headerUrl);

    // Download data file
    const dataUrl = URL.createObjectURL(blobs.data);
    const dataLink = document.createElement('a');
    dataLink.href = dataUrl;
    dataLink.download = `${blobs.recordName}.dat`;
    document.body.appendChild(dataLink);
    dataLink.click();
    document.body.removeChild(dataLink);
    URL.revokeObjectURL(dataUrl);
  }
}

/**
 * Convenience function for MIT-BIH export
 */
export function exportToMITBIH(
  signal: ECGSignalData,
  options?: MITBIHExportOptions
): MITBIHExportResult {
  const exporter = new MITBIHExporter(options);
  return exporter.export(signal);
}
