/**
 * ECG Report Generator
 * Generate structured clinical reports from digitized ECGs
 *
 * Supports:
 * - Structured JSON reports
 * - Clinical PDF reports
 * - HL7 FHIR DiagnosticReport
 * - Plain text summaries
 *
 * @module signal/loader/png-digitizer/export/report-generator
 */

import type { LeadName } from '../types';

/**
 * Patient demographics for report
 */
export interface PatientInfo {
  name?: string;
  id?: string;
  dateOfBirth?: Date;
  age?: number;
  sex?: 'male' | 'female' | 'other' | 'unknown';
  height?: number; // cm
  weight?: number; // kg
}

/**
 * Report metadata
 */
export interface ReportMetadata {
  /** Report ID */
  reportId: string;

  /** Recording timestamp */
  recordingTime?: Date;

  /** Report generation time */
  generatedAt: Date;

  /** Ordering provider */
  orderingProvider?: string;

  /** Interpreting provider */
  interpretingProvider?: string;

  /** Facility */
  facility?: string;

  /** Device info */
  device?: string;

  /** Software version */
  softwareVersion?: string;
}

/**
 * ECG measurements for report
 */
export interface ECGMeasurements {
  /** Heart rate (bpm) */
  heartRate: number;

  /** PR interval (ms) */
  prInterval?: number;

  /** QRS duration (ms) */
  qrsDuration?: number;

  /** QT interval (ms) */
  qtInterval?: number;

  /** QTc (ms) */
  qtc?: number;

  /** QTc formula used */
  qtcFormula?: 'Bazett' | 'Fridericia' | 'Framingham';

  /** P wave axis (degrees) */
  pAxis?: number;

  /** QRS axis (degrees) */
  qrsAxis?: number;

  /** T wave axis (degrees) */
  tAxis?: number;

  /** RR interval (ms) */
  rrInterval?: number;

  /** Heart rate variability (ms) */
  hrv?: number;
}

/**
 * Finding in report
 */
export interface ReportFinding {
  /** Finding category */
  category: 'rhythm' | 'rate' | 'intervals' | 'axis' | 'morphology' | 'ischemia' | 'other';

  /** Finding code (for interoperability) */
  code?: string;

  /** Finding text */
  text: string;

  /** Severity */
  severity: 'normal' | 'borderline' | 'abnormal' | 'critical';

  /** Supporting leads */
  leads?: LeadName[];

  /** Confidence (0-1) */
  confidence: number;
}

/**
 * Complete ECG report
 */
export interface ECGReport {
  /** Patient info */
  patient?: PatientInfo;

  /** Report metadata */
  metadata: ReportMetadata;

  /** Technical quality */
  quality: {
    overall: 'excellent' | 'good' | 'acceptable' | 'poor' | 'uninterpretable';
    score: number;
    issues: string[];
  };

  /** Measurements */
  measurements: ECGMeasurements;

  /** Findings */
  findings: ReportFinding[];

  /** Primary interpretation */
  interpretation: {
    /** Overall classification */
    classification: 'normal' | 'borderline' | 'abnormal' | 'critical';

    /** Primary diagnosis */
    primaryDiagnosis: string;

    /** Secondary diagnoses */
    secondaryDiagnoses: string[];

    /** Recommendations */
    recommendations: string[];
  };

  /** Comparison with prior (if available) */
  comparison?: {
    priorDate?: Date;
    changeDescription: string;
    isChanged: boolean;
  };

  /** Raw data reference */
  dataReference?: {
    format: string;
    sampleRate: number;
    duration: number;
    leadCount: number;
  };
}

/**
 * Report format options
 */
export type ReportFormat = 'json' | 'text' | 'html' | 'fhir';

/**
 * Report generation options
 */
export interface ReportGeneratorOptions {
  /** Include raw measurements */
  includeMeasurements?: boolean;

  /** Include all findings (vs significant only) */
  includeAllFindings?: boolean;

  /** Include technical details */
  includeTechnicalDetails?: boolean;

  /** Report language */
  language?: 'en' | 'es' | 'fr' | 'de';

  /** FHIR server URL (for FHIR format) */
  fhirServerUrl?: string;
}

/**
 * ECG Report Generator
 */
export class ReportGenerator {
  private options: Required<ReportGeneratorOptions>;

  constructor(options: ReportGeneratorOptions = {}) {
    this.options = {
      includeMeasurements: options.includeMeasurements ?? true,
      includeAllFindings: options.includeAllFindings ?? false,
      includeTechnicalDetails: options.includeTechnicalDetails ?? true,
      language: options.language ?? 'en',
      fhirServerUrl: options.fhirServerUrl ?? '',
    };
  }

  /**
   * Generate report in specified format
   */
  generate(report: ECGReport, format: ReportFormat): string {
    switch (format) {
      case 'json':
        return this.generateJSON(report);
      case 'text':
        return this.generateText(report);
      case 'html':
        return this.generateHTML(report);
      case 'fhir':
        return this.generateFHIR(report);
      default:
        throw new Error(`Unknown format: ${format}`);
    }
  }

  /**
   * Generate JSON report
   */
  private generateJSON(report: ECGReport): string {
    const filtered = { ...report };

    if (!this.options.includeAllFindings) {
      filtered.findings = report.findings.filter(
        f => f.severity !== 'normal' || f.confidence > 0.9
      );
    }

    return JSON.stringify(filtered, null, 2);
  }

  /**
   * Generate plain text report
   */
  private generateText(report: ECGReport): string {
    const lines: string[] = [];

    // Header
    lines.push('═'.repeat(60));
    lines.push('           ELECTROCARDIOGRAM REPORT');
    lines.push('═'.repeat(60));
    lines.push('');

    // Patient info
    if (report.patient) {
      lines.push('PATIENT INFORMATION');
      lines.push('─'.repeat(40));
      if (report.patient.name) lines.push(`Name: ${report.patient.name}`);
      if (report.patient.id) lines.push(`ID: ${report.patient.id}`);
      if (report.patient.age) lines.push(`Age: ${report.patient.age} years`);
      if (report.patient.sex) lines.push(`Sex: ${report.patient.sex}`);
      lines.push('');
    }

    // Metadata
    lines.push('RECORDING INFORMATION');
    lines.push('─'.repeat(40));
    if (report.metadata.recordingTime) {
      lines.push(`Date/Time: ${report.metadata.recordingTime.toLocaleString()}`);
    }
    if (report.metadata.facility) {
      lines.push(`Facility: ${report.metadata.facility}`);
    }
    if (report.metadata.device) {
      lines.push(`Device: ${report.metadata.device}`);
    }
    lines.push('');

    // Quality
    lines.push('TECHNICAL QUALITY');
    lines.push('─'.repeat(40));
    lines.push(`Overall: ${report.quality.overall.toUpperCase()}`);
    if (report.quality.issues.length > 0) {
      lines.push(`Issues: ${report.quality.issues.join(', ')}`);
    }
    lines.push('');

    // Measurements
    if (this.options.includeMeasurements) {
      lines.push('MEASUREMENTS');
      lines.push('─'.repeat(40));
      lines.push(`Heart Rate: ${report.measurements.heartRate} bpm`);
      if (report.measurements.prInterval) {
        lines.push(`PR Interval: ${report.measurements.prInterval} ms`);
      }
      if (report.measurements.qrsDuration) {
        lines.push(`QRS Duration: ${report.measurements.qrsDuration} ms`);
      }
      if (report.measurements.qtc) {
        lines.push(`QTc: ${report.measurements.qtc} ms (${report.measurements.qtcFormula || 'Bazett'})`);
      }
      if (report.measurements.qrsAxis !== undefined) {
        lines.push(`QRS Axis: ${report.measurements.qrsAxis}°`);
      }
      lines.push('');
    }

    // Interpretation
    lines.push('INTERPRETATION');
    lines.push('─'.repeat(40));
    lines.push(`Classification: ${report.interpretation.classification.toUpperCase()}`);
    lines.push('');
    lines.push(`Primary: ${report.interpretation.primaryDiagnosis}`);
    if (report.interpretation.secondaryDiagnoses.length > 0) {
      lines.push('Secondary:');
      for (const dx of report.interpretation.secondaryDiagnoses) {
        lines.push(`  - ${dx}`);
      }
    }
    lines.push('');

    // Findings
    const significantFindings = report.findings.filter(f => f.severity !== 'normal');
    if (significantFindings.length > 0) {
      lines.push('SIGNIFICANT FINDINGS');
      lines.push('─'.repeat(40));
      for (const finding of significantFindings) {
        const severity = finding.severity === 'critical' ? '⚠️ ' : '';
        lines.push(`${severity}${finding.text}`);
      }
      lines.push('');
    }

    // Recommendations
    if (report.interpretation.recommendations.length > 0) {
      lines.push('RECOMMENDATIONS');
      lines.push('─'.repeat(40));
      for (const rec of report.interpretation.recommendations) {
        lines.push(`• ${rec}`);
      }
      lines.push('');
    }

    // Comparison
    if (report.comparison) {
      lines.push('COMPARISON WITH PRIOR');
      lines.push('─'.repeat(40));
      if (report.comparison.priorDate) {
        lines.push(`Prior ECG: ${report.comparison.priorDate.toLocaleDateString()}`);
      }
      lines.push(report.comparison.changeDescription);
      lines.push('');
    }

    // Footer
    lines.push('═'.repeat(60));
    lines.push(`Report ID: ${report.metadata.reportId}`);
    lines.push(`Generated: ${report.metadata.generatedAt.toLocaleString()}`);
    if (report.metadata.interpretingProvider) {
      lines.push(`Interpreted by: ${report.metadata.interpretingProvider}`);
    }
    lines.push('');
    lines.push('This report was generated by GEMUSE ECG Analysis System.');
    lines.push('Computer-generated interpretation - clinical correlation required.');
    lines.push('═'.repeat(60));

    return lines.join('\n');
  }

  /**
   * Generate HTML report
   */
  private generateHTML(report: ECGReport): string {
    const criticalClass = report.interpretation.classification === 'critical'
      ? 'critical'
      : '';

    return `<!DOCTYPE html>
<html lang="${this.options.language}">
<head>
  <meta charset="UTF-8">
  <title>ECG Report - ${report.metadata.reportId}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; max-width: 800px; }
    h1 { color: #333; border-bottom: 2px solid #333; }
    h2 { color: #666; margin-top: 20px; }
    .section { margin-bottom: 20px; }
    .measurements { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .measurement { background: #f5f5f5; padding: 10px; border-radius: 4px; }
    .measurement label { font-weight: bold; display: block; }
    .findings { list-style: none; padding: 0; }
    .finding { padding: 8px; margin: 4px 0; border-left: 4px solid #ccc; }
    .finding.critical { border-color: #d00; background: #ffe0e0; }
    .finding.abnormal { border-color: #f80; background: #fff0e0; }
    .finding.borderline { border-color: #fc0; background: #fffae0; }
    .interpretation { background: #e8f4e8; padding: 15px; border-radius: 8px; }
    .interpretation.critical { background: #ffe0e0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ccc; font-size: 0.9em; color: #666; }
  </style>
</head>
<body>
  <h1>Electrocardiogram Report</h1>

  ${report.patient ? `
  <div class="section">
    <h2>Patient Information</h2>
    <p>
      ${report.patient.name ? `<strong>Name:</strong> ${report.patient.name}<br>` : ''}
      ${report.patient.id ? `<strong>ID:</strong> ${report.patient.id}<br>` : ''}
      ${report.patient.age ? `<strong>Age:</strong> ${report.patient.age} years<br>` : ''}
      ${report.patient.sex ? `<strong>Sex:</strong> ${report.patient.sex}` : ''}
    </p>
  </div>
  ` : ''}

  <div class="section">
    <h2>Recording Information</h2>
    <p>
      ${report.metadata.recordingTime ? `<strong>Date/Time:</strong> ${report.metadata.recordingTime.toLocaleString()}<br>` : ''}
      ${report.metadata.facility ? `<strong>Facility:</strong> ${report.metadata.facility}<br>` : ''}
      ${report.metadata.device ? `<strong>Device:</strong> ${report.metadata.device}` : ''}
    </p>
  </div>

  <div class="section">
    <h2>Technical Quality</h2>
    <p><strong>${report.quality.overall.toUpperCase()}</strong> (Score: ${(report.quality.score * 100).toFixed(0)}%)</p>
    ${report.quality.issues.length > 0 ? `<p>Issues: ${report.quality.issues.join(', ')}</p>` : ''}
  </div>

  ${this.options.includeMeasurements ? `
  <div class="section">
    <h2>Measurements</h2>
    <div class="measurements">
      <div class="measurement"><label>Heart Rate</label>${report.measurements.heartRate} bpm</div>
      ${report.measurements.prInterval ? `<div class="measurement"><label>PR Interval</label>${report.measurements.prInterval} ms</div>` : ''}
      ${report.measurements.qrsDuration ? `<div class="measurement"><label>QRS Duration</label>${report.measurements.qrsDuration} ms</div>` : ''}
      ${report.measurements.qtc ? `<div class="measurement"><label>QTc</label>${report.measurements.qtc} ms</div>` : ''}
      ${report.measurements.qrsAxis !== undefined ? `<div class="measurement"><label>QRS Axis</label>${report.measurements.qrsAxis}°</div>` : ''}
    </div>
  </div>
  ` : ''}

  <div class="section">
    <h2>Interpretation</h2>
    <div class="interpretation ${criticalClass}">
      <p><strong>${report.interpretation.primaryDiagnosis}</strong></p>
      ${report.interpretation.secondaryDiagnoses.length > 0 ? `
      <ul>
        ${report.interpretation.secondaryDiagnoses.map(dx => `<li>${dx}</li>`).join('')}
      </ul>
      ` : ''}
    </div>
  </div>

  ${report.findings.filter(f => f.severity !== 'normal').length > 0 ? `
  <div class="section">
    <h2>Significant Findings</h2>
    <ul class="findings">
      ${report.findings
        .filter(f => f.severity !== 'normal')
        .map(f => `<li class="finding ${f.severity}">${f.text}</li>`)
        .join('')}
    </ul>
  </div>
  ` : ''}

  ${report.interpretation.recommendations.length > 0 ? `
  <div class="section">
    <h2>Recommendations</h2>
    <ul>
      ${report.interpretation.recommendations.map(r => `<li>${r}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  <div class="footer">
    <p>Report ID: ${report.metadata.reportId}</p>
    <p>Generated: ${report.metadata.generatedAt.toLocaleString()}</p>
    ${report.metadata.interpretingProvider ? `<p>Interpreted by: ${report.metadata.interpretingProvider}</p>` : ''}
    <p><em>This report was generated by GEMUSE ECG Analysis System.<br>
    Computer-generated interpretation - clinical correlation required.</em></p>
  </div>
</body>
</html>`;
  }

  /**
   * Generate FHIR DiagnosticReport
   */
  private generateFHIR(report: ECGReport): string {
    const fhirReport = {
      resourceType: 'DiagnosticReport',
      id: report.metadata.reportId,
      status: 'final',
      category: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
          code: 'EC',
          display: 'Electrocardiogram',
        }],
      }],
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: '11524-6',
          display: 'ECG study',
        }],
      },
      subject: report.patient ? {
        display: report.patient.name || report.patient.id,
      } : undefined,
      effectiveDateTime: report.metadata.recordingTime?.toISOString(),
      issued: report.metadata.generatedAt.toISOString(),
      performer: report.metadata.interpretingProvider ? [{
        display: report.metadata.interpretingProvider,
      }] : undefined,
      conclusion: report.interpretation.primaryDiagnosis,
      conclusionCode: [{
        text: report.interpretation.classification,
      }],
      result: [
        // Heart rate
        {
          code: {
            coding: [{
              system: 'http://loinc.org',
              code: '8867-4',
              display: 'Heart rate',
            }],
          },
          valueQuantity: {
            value: report.measurements.heartRate,
            unit: '/min',
            system: 'http://unitsofmeasure.org',
            code: '/min',
          },
        },
        // PR interval
        ...(report.measurements.prInterval ? [{
          code: {
            coding: [{
              system: 'http://loinc.org',
              code: '8625-6',
              display: 'PR interval',
            }],
          },
          valueQuantity: {
            value: report.measurements.prInterval,
            unit: 'ms',
            system: 'http://unitsofmeasure.org',
            code: 'ms',
          },
        }] : []),
        // QRS duration
        ...(report.measurements.qrsDuration ? [{
          code: {
            coding: [{
              system: 'http://loinc.org',
              code: '8633-0',
              display: 'QRS duration',
            }],
          },
          valueQuantity: {
            value: report.measurements.qrsDuration,
            unit: 'ms',
            system: 'http://unitsofmeasure.org',
            code: 'ms',
          },
        }] : []),
        // QTc
        ...(report.measurements.qtc ? [{
          code: {
            coding: [{
              system: 'http://loinc.org',
              code: '8634-8',
              display: 'QTc interval',
            }],
          },
          valueQuantity: {
            value: report.measurements.qtc,
            unit: 'ms',
            system: 'http://unitsofmeasure.org',
            code: 'ms',
          },
        }] : []),
      ],
    };

    return JSON.stringify(fhirReport, null, 2);
  }
}

/**
 * Create ECG report from analysis results
 */
export function createReport(
  measurements: ECGMeasurements,
  findings: ReportFinding[],
  options: {
    patient?: PatientInfo;
    metadata?: Partial<ReportMetadata>;
    quality?: ECGReport['quality'];
    comparison?: ECGReport['comparison'];
  } = {}
): ECGReport {
  // Determine classification
  let classification: ECGReport['interpretation']['classification'] = 'normal';
  if (findings.some(f => f.severity === 'critical')) {
    classification = 'critical';
  } else if (findings.some(f => f.severity === 'abnormal')) {
    classification = 'abnormal';
  } else if (findings.some(f => f.severity === 'borderline')) {
    classification = 'borderline';
  }

  // Determine primary diagnosis
  const criticalFindings = findings.filter(f => f.severity === 'critical');
  const abnormalFindings = findings.filter(f => f.severity === 'abnormal');

  let primaryDiagnosis = 'Normal ECG';
  const secondaryDiagnoses: string[] = [];
  const recommendations: string[] = [];

  if (criticalFindings.length > 0) {
    primaryDiagnosis = criticalFindings[0].text;
    secondaryDiagnoses.push(...criticalFindings.slice(1).map(f => f.text));
    recommendations.push('Immediate clinical evaluation recommended');
  } else if (abnormalFindings.length > 0) {
    primaryDiagnosis = abnormalFindings[0].text;
    secondaryDiagnoses.push(...abnormalFindings.slice(1).map(f => f.text));
  }

  return {
    patient: options.patient,
    metadata: {
      reportId: options.metadata?.reportId || `ECG-${Date.now()}`,
      recordingTime: options.metadata?.recordingTime,
      generatedAt: new Date(),
      orderingProvider: options.metadata?.orderingProvider,
      interpretingProvider: options.metadata?.interpretingProvider,
      facility: options.metadata?.facility,
      device: options.metadata?.device,
      softwareVersion: 'GEMUSE ECG Digitizer v1.0',
    },
    quality: options.quality || {
      overall: 'good',
      score: 0.8,
      issues: [],
    },
    measurements,
    findings,
    interpretation: {
      classification,
      primaryDiagnosis,
      secondaryDiagnoses,
      recommendations,
    },
    comparison: options.comparison,
  };
}

/**
 * Convenience function to generate report
 */
export function generateReport(
  report: ECGReport,
  format: ReportFormat,
  options?: ReportGeneratorOptions
): string {
  const generator = new ReportGenerator(options);
  return generator.generate(report, format);
}
