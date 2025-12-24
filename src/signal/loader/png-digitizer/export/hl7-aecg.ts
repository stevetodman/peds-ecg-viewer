/**
 * HL7 aECG Exporter
 * Export ECG signals to HL7 Annotated ECG (aECG) XML format
 *
 * HL7 aECG is the standard format for ECG exchange in healthcare systems.
 * Reference: HL7 Version 3 Standard: Annotated ECG (aECG)
 *
 * @module signal/loader/png-digitizer/export/hl7-aecg
 */

import type { LeadName } from '../types';

/**
 * HL7 aECG export options
 */
export interface HL7aECGExportOptions {
  /** Patient demographics (optional for de-identified export) */
  patient?: {
    id?: string;
    name?: string;
    birthDate?: string; // YYYYMMDD
    gender?: 'M' | 'F' | 'UN';
  };

  /** Device/equipment info */
  device?: {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    softwareVersion?: string;
  };

  /** Acquisition info */
  acquisition?: {
    effectiveTime?: Date;
    location?: string;
    operator?: string;
  };

  /** Include waveform data (default: true) */
  includeWaveforms?: boolean;

  /** Which leads to export (default: all) */
  leads?: LeadName[];
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
 * Lead code mapping for HL7
 */
const LEAD_CODES: Record<LeadName, { code: string; displayName: string }> = {
  'I': { code: 'MDC_ECG_LEAD_I', displayName: 'Lead I' },
  'II': { code: 'MDC_ECG_LEAD_II', displayName: 'Lead II' },
  'III': { code: 'MDC_ECG_LEAD_III', displayName: 'Lead III' },
  'aVR': { code: 'MDC_ECG_LEAD_AVR', displayName: 'Lead aVR' },
  'aVL': { code: 'MDC_ECG_LEAD_AVL', displayName: 'Lead aVL' },
  'aVF': { code: 'MDC_ECG_LEAD_AVF', displayName: 'Lead aVF' },
  'V1': { code: 'MDC_ECG_LEAD_V1', displayName: 'Lead V1' },
  'V2': { code: 'MDC_ECG_LEAD_V2', displayName: 'Lead V2' },
  'V3': { code: 'MDC_ECG_LEAD_V3', displayName: 'Lead V3' },
  'V4': { code: 'MDC_ECG_LEAD_V4', displayName: 'Lead V4' },
  'V5': { code: 'MDC_ECG_LEAD_V5', displayName: 'Lead V5' },
  'V6': { code: 'MDC_ECG_LEAD_V6', displayName: 'Lead V6' },
  'V3R': { code: 'MDC_ECG_LEAD_V3R', displayName: 'Lead V3R' },
  'V4R': { code: 'MDC_ECG_LEAD_V4R', displayName: 'Lead V4R' },
  'V7': { code: 'MDC_ECG_LEAD_V7', displayName: 'Lead V7' },
};

/**
 * HL7 aECG Exporter class
 */
export class HL7aECGExporter {
  private options: HL7aECGExportOptions;

  constructor(options: HL7aECGExportOptions = {}) {
    this.options = options;
  }

  /**
   * Export ECG signal to HL7 aECG XML string
   */
  export(signal: ECGSignalData): string {
    const documentId = this.generateUUID();
    const effectiveTime = this.options.acquisition?.effectiveTime ?? new Date();

    // Determine which leads to export
    const leadsToExport = this.options.leads?.length
      ? this.options.leads.filter(l => signal.leads[l])
      : (Object.keys(signal.leads) as LeadName[]).filter(l => signal.leads[l]);

    const maxLength = Math.max(...leadsToExport.map(l => signal.leads[l]?.length ?? 0));

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<AnnotatedECG xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <id root="${documentId}"/>
  <code code="93000" codeSystem="2.16.840.1.113883.6.12" displayName="Electrocardiogram, routine ECG"/>
  <effectiveTime value="${this.formatHL7DateTime(effectiveTime)}"/>

  <!-- Document Author/Device -->
  ${this.generateAuthorSection()}

  <!-- Patient Information -->
  ${this.generatePatientSection()}

  <!-- ECG Component -->
  <component>
    <series>
      <code code="RHYTHM" codeSystem="2.16.840.1.113883.5.4"/>
      <effectiveTime>
        <low value="${this.formatHL7DateTime(effectiveTime)}"/>
        <high value="${this.formatHL7DateTime(new Date(effectiveTime.getTime() + (signal.duration ?? maxLength / signal.sampleRate) * 1000))}"/>
      </effectiveTime>

      <!-- Sequence Set containing all leads -->
      <component>
        <sequenceSet>
          <component>
            <sequence>
              <code code="TIME_ABSOLUTE" codeSystem="2.16.840.1.113883.5.4"/>
              <value xsi:type="GLIST_PQ">
                <head value="0" unit="s"/>
                <increment value="${(1 / signal.sampleRate).toFixed(6)}" unit="s"/>
              </value>
            </sequence>
          </component>

          ${leadsToExport.map(lead => this.generateLeadSequence(lead, signal.leads[lead]!)).join('\n          ')}
        </sequenceSet>
      </component>
    </series>
  </component>
</AnnotatedECG>`;

    return xml;
  }

  /**
   * Generate author/device section
   */
  private generateAuthorSection(): string {
    const device = this.options.device;

    return `<author>
    <assignedAuthor>
      <assignedAuthoringDevice>
        <manufacturerModelName>${this.escapeXml(device?.manufacturer ?? 'GEMUSE')} ${this.escapeXml(device?.model ?? 'ECG Digitizer')}</manufacturerModelName>
        <softwareName>${this.escapeXml(device?.softwareVersion ?? '1.0')}</softwareName>
      </assignedAuthoringDevice>
    </assignedAuthor>
  </author>`;
  }

  /**
   * Generate patient section
   */
  private generatePatientSection(): string {
    const patient = this.options.patient;

    if (!patient) {
      return `<recordTarget>
    <patientRole>
      <id nullFlavor="NI"/>
    </patientRole>
  </recordTarget>`;
    }

    return `<recordTarget>
    <patientRole>
      ${patient.id ? `<id extension="${this.escapeXml(patient.id)}"/>` : '<id nullFlavor="NI"/>'}
      <patient>
        ${patient.name ? `<name><given>${this.escapeXml(patient.name)}</given></name>` : ''}
        ${patient.gender ? `<administrativeGenderCode code="${patient.gender}" codeSystem="2.16.840.1.113883.5.1"/>` : ''}
        ${patient.birthDate ? `<birthTime value="${patient.birthDate}"/>` : ''}
      </patient>
    </patientRole>
  </recordTarget>`;
  }

  /**
   * Generate a lead sequence
   */
  private generateLeadSequence(lead: LeadName, data: number[]): string {
    const leadInfo = LEAD_CODES[lead] || { code: 'MDC_ECG_LEAD_UNKNOWN', displayName: lead };

    // Convert µV to mV and encode as space-separated values
    const values = data.map(v => (v / 1000).toFixed(4)).join(' ');

    return `<component>
            <sequence>
              <code code="${leadInfo.code}" codeSystem="2.16.840.1.113883.6.24" displayName="${leadInfo.displayName}"/>
              <value xsi:type="SLIST_PQ">
                <origin value="0" unit="mV"/>
                <scale value="0.001" unit="mV"/>
                <digits>${values}</digits>
              </value>
            </sequence>
          </component>`;
  }

  /**
   * Format date as HL7 DateTime (YYYYMMDDHHMMSS)
   */
  private formatHL7DateTime(date: Date): string {
    return date.toISOString()
      .replace(/[-:T]/g, '')
      .replace(/\.\d{3}Z$/, '');
  }

  /**
   * Generate a UUID
   */
  private generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for older environments
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Export to Blob for download
   */
  exportToBlob(signal: ECGSignalData): Blob {
    const xmlContent = this.export(signal);
    return new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
  }

  /**
   * Export and trigger download (browser only)
   */
  exportAndDownload(signal: ECGSignalData, filename: string = 'ecg_export.xml'): void {
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
 * Convenience function for HL7 aECG export
 */
export function exportToHL7aECG(
  signal: ECGSignalData,
  options?: HL7aECGExportOptions
): string {
  const exporter = new HL7aECGExporter(options);
  return exporter.export(signal);
}
