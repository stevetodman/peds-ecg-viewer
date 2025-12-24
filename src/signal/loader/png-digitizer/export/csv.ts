/**
 * CSV Exporter
 * Export ECG signals to CSV format for spreadsheets and analysis tools
 *
 * @module signal/loader/png-digitizer/export/csv
 */

import type { LeadName } from '../types';

/**
 * CSV export options
 */
export interface CSVExportOptions {
  /** Include time column (default: true) */
  includeTime?: boolean;

  /** Time unit: 'seconds' | 'milliseconds' | 'samples' (default: 'seconds') */
  timeUnit?: 'seconds' | 'milliseconds' | 'samples';

  /** Delimiter (default: ',') */
  delimiter?: string;

  /** Line ending (default: '\n') */
  lineEnding?: string;

  /** Include header row (default: true) */
  includeHeader?: boolean;

  /** Decimal places for values (default: 2) */
  decimalPlaces?: number;

  /** Which leads to export (default: all) */
  leads?: LeadName[];

  /** Include metadata comments (default: false) */
  includeMetadata?: boolean;

  /** Amplitude unit in header (default: 'µV') */
  amplitudeUnit?: string;
}

/**
 * ECG signal data for export
 */
interface ECGSignalData {
  sampleRate: number;
  leads: Partial<Record<LeadName, number[]>>;
  duration?: number;
  metadata?: Record<string, string>;
}

/**
 * CSV Exporter class
 */
export class CSVExporter {
  private options: Required<CSVExportOptions>;

  constructor(options: CSVExportOptions = {}) {
    this.options = {
      includeTime: options.includeTime ?? true,
      timeUnit: options.timeUnit ?? 'seconds',
      delimiter: options.delimiter ?? ',',
      lineEnding: options.lineEnding ?? '\n',
      includeHeader: options.includeHeader ?? true,
      decimalPlaces: options.decimalPlaces ?? 2,
      leads: options.leads ?? [],
      includeMetadata: options.includeMetadata ?? false,
      amplitudeUnit: options.amplitudeUnit ?? 'µV',
    };
  }

  /**
   * Export ECG signal to CSV string
   */
  export(signal: ECGSignalData): string {
    const { delimiter, lineEnding, includeHeader, decimalPlaces } = this.options;

    const lines: string[] = [];

    // Metadata comments
    if (this.options.includeMetadata) {
      lines.push(`# Sample Rate: ${signal.sampleRate} Hz`);
      lines.push(`# Duration: ${signal.duration ?? 'unknown'} seconds`);
      lines.push(`# Amplitude Unit: ${this.options.amplitudeUnit}`);
      if (signal.metadata) {
        for (const [key, value] of Object.entries(signal.metadata)) {
          lines.push(`# ${key}: ${value}`);
        }
      }
      lines.push('#');
    }

    // Determine which leads to export
    const leadsToExport = this.options.leads.length > 0
      ? this.options.leads.filter(l => signal.leads[l])
      : (Object.keys(signal.leads) as LeadName[]).filter(l => signal.leads[l]);

    // Find the maximum length
    const maxLength = Math.max(...leadsToExport.map(l => signal.leads[l]?.length ?? 0));

    // Header row
    if (includeHeader) {
      const headers: string[] = [];
      if (this.options.includeTime) {
        const timeHeader = this.options.timeUnit === 'samples' ? 'Sample' :
          this.options.timeUnit === 'milliseconds' ? 'Time_ms' : 'Time_s';
        headers.push(timeHeader);
      }
      headers.push(...leadsToExport.map(l => `${l}_${this.options.amplitudeUnit}`));
      lines.push(headers.join(delimiter));
    }

    // Data rows
    for (let i = 0; i < maxLength; i++) {
      const row: string[] = [];

      // Time column
      if (this.options.includeTime) {
        let time: number;
        switch (this.options.timeUnit) {
          case 'samples':
            time = i;
            break;
          case 'milliseconds':
            time = (i / signal.sampleRate) * 1000;
            break;
          default:
            time = i / signal.sampleRate;
        }
        row.push(time.toFixed(this.options.timeUnit === 'samples' ? 0 : decimalPlaces));
      }

      // Lead values
      for (const lead of leadsToExport) {
        const data = signal.leads[lead];
        const value = data && i < data.length ? data[i] : 0;
        row.push(value.toFixed(decimalPlaces));
      }

      lines.push(row.join(delimiter));
    }

    return lines.join(lineEnding);
  }

  /**
   * Export to Blob for download
   */
  exportToBlob(signal: ECGSignalData): Blob {
    const csvContent = this.export(signal);
    return new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  }

  /**
   * Export and trigger download (browser only)
   */
  exportAndDownload(signal: ECGSignalData, filename: string = 'ecg_export.csv'): void {
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
 * Convenience function for CSV export
 */
export function exportToCSV(
  signal: ECGSignalData,
  options?: CSVExportOptions
): string {
  const exporter = new CSVExporter(options);
  return exporter.export(signal);
}
