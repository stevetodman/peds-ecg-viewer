/**
 * JSON Exporter
 * Export ECG signals to JSON format for modern applications
 *
 * @module signal/loader/png-digitizer/export/json
 */

import type { LeadName } from '../types';

/**
 * JSON export options
 */
export interface JSONExportOptions {
  /** Pretty print with indentation (default: true) */
  prettyPrint?: boolean;

  /** Indentation spaces (default: 2) */
  indent?: number;

  /** Include metadata (default: true) */
  includeMetadata?: boolean;

  /** Include timing information (default: true) */
  includeTimestamps?: boolean;

  /** Which leads to export (default: all) */
  leads?: LeadName[];

  /** Compress waveform data using delta encoding (default: false) */
  compressData?: boolean;

  /** Round values to reduce file size (default: true) */
  roundValues?: boolean;

  /** Decimal places when rounding (default: 2) */
  decimalPlaces?: number;
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
 * JSON export structure
 */
interface ECGJSONExport {
  /** Format version */
  version: string;

  /** Export timestamp */
  exportedAt: string;

  /** Signal metadata */
  metadata: {
    sampleRate: number;
    duration: number;
    leadCount: number;
    sampleCount: number;
    amplitudeUnit: string;
    encoding?: 'raw' | 'delta';
    [key: string]: any;
  };

  /** Lead names in order */
  leadOrder: LeadName[];

  /** Waveform data */
  waveforms: Record<LeadName, number[] | { baseline: number; deltas: number[] }>;

  /** Optional timing array */
  timestamps?: number[];
}

/**
 * JSON Exporter class
 */
export class JSONExporter {
  private options: Required<JSONExportOptions>;

  constructor(options: JSONExportOptions = {}) {
    this.options = {
      prettyPrint: options.prettyPrint ?? true,
      indent: options.indent ?? 2,
      includeMetadata: options.includeMetadata ?? true,
      includeTimestamps: options.includeTimestamps ?? true,
      leads: options.leads ?? [],
      compressData: options.compressData ?? false,
      roundValues: options.roundValues ?? true,
      decimalPlaces: options.decimalPlaces ?? 2,
    };
  }

  /**
   * Export ECG signal to JSON string
   */
  export(signal: ECGSignalData): string {
    const exportData = this.buildExportObject(signal);

    if (this.options.prettyPrint) {
      return JSON.stringify(exportData, null, this.options.indent);
    }
    return JSON.stringify(exportData);
  }

  /**
   * Build the export object
   */
  private buildExportObject(signal: ECGSignalData): ECGJSONExport {
    // Determine which leads to export
    const leadsToExport = this.options.leads.length > 0
      ? this.options.leads.filter(l => signal.leads[l])
      : (Object.keys(signal.leads) as LeadName[]).filter(l => signal.leads[l]);

    // Find the maximum length
    const maxLength = Math.max(...leadsToExport.map(l => signal.leads[l]?.length ?? 0));

    // Build waveforms object
    const waveforms: Record<string, number[] | { baseline: number; deltas: number[] }> = {};

    for (const lead of leadsToExport) {
      const data = signal.leads[lead];
      if (!data) continue;

      let processedData: number[] = [...data];

      // Round values if enabled
      if (this.options.roundValues) {
        const factor = Math.pow(10, this.options.decimalPlaces);
        processedData = processedData.map(v => Math.round(v * factor) / factor);
      }

      if (this.options.compressData) {
        // Delta encoding: store first value and differences
        const baseline = processedData[0] || 0;
        const deltas: number[] = [];

        for (let i = 1; i < processedData.length; i++) {
          deltas.push(Math.round((processedData[i] - processedData[i - 1]) * 100) / 100);
        }

        waveforms[lead] = { baseline, deltas };
      } else {
        waveforms[lead] = processedData;
      }
    }

    // Build metadata
    const metadata: ECGJSONExport['metadata'] = {
      sampleRate: signal.sampleRate,
      duration: signal.duration ?? maxLength / signal.sampleRate,
      leadCount: leadsToExport.length,
      sampleCount: maxLength,
      amplitudeUnit: 'µV',
    };

    if (this.options.compressData) {
      metadata.encoding = 'delta';
    }

    if (this.options.includeMetadata && signal.metadata) {
      Object.assign(metadata, signal.metadata);
    }

    // Build export object
    const exportData: ECGJSONExport = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      metadata,
      leadOrder: leadsToExport,
      waveforms: waveforms as Record<LeadName, number[] | { baseline: number; deltas: number[] }>,
    };

    // Add timestamps if requested
    if (this.options.includeTimestamps) {
      const timestamps: number[] = [];
      for (let i = 0; i < maxLength; i++) {
        timestamps.push(Math.round((i / signal.sampleRate) * 1000) / 1000); // Round to ms
      }
      exportData.timestamps = timestamps;
    }

    return exportData;
  }

  /**
   * Parse a JSON export back to signal data
   */
  static parse(json: string): ECGSignalData {
    const data: ECGJSONExport = JSON.parse(json);

    const leads: Partial<Record<LeadName, number[]>> = {};

    for (const lead of data.leadOrder) {
      const waveform = data.waveforms[lead];

      if (Array.isArray(waveform)) {
        leads[lead] = waveform;
      } else if (waveform && 'deltas' in waveform) {
        // Decode delta encoding
        const decoded: number[] = [waveform.baseline];
        let current = waveform.baseline;

        for (const delta of waveform.deltas) {
          current += delta;
          decoded.push(current);
        }

        leads[lead] = decoded;
      }
    }

    return {
      sampleRate: data.metadata.sampleRate,
      leads,
      duration: data.metadata.duration,
      metadata: data.metadata,
    };
  }

  /**
   * Export to Blob for download
   */
  exportToBlob(signal: ECGSignalData): Blob {
    const jsonContent = this.export(signal);
    return new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
  }

  /**
   * Export and trigger download (browser only)
   */
  exportAndDownload(signal: ECGSignalData, filename: string = 'ecg_export.json'): void {
    if (typeof document === 'undefined') {
      throw new Error('exportAndDownload is only available in browser environment');
    }

    const blob = this.exportToBlob(signal);
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  }
}

/**
 * Convenience function for JSON export
 */
export function exportToJSON(
  signal: ECGSignalData,
  options?: JSONExportOptions
): string {
  const exporter = new JSONExporter(options);
  return exporter.export(signal);
}
