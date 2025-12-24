/**
 * Signal Loader Module
 *
 * Provides parsers for various ECG file formats.
 *
 * Supported formats:
 * - GE Muse XML (RestingECG)
 * - HL7 aECG (Annotated ECG) - FDA standard
 * - DICOM ECG (12-Lead ECG IOD)
 * - Philips Sierra XML
 * - SCP-ECG (EN 1064:2005)
 * - PNG/Image Digitization (Vision AI + CV)
 *
 * @module signal/loader
 */

export * from './muse-xml';
export * from './hl7-aecg';
export * from './dicom-ecg';
export * from './philips-xml';
export * from './scp-ecg';
export * from './png-digitizer';

// Re-export compression utilities
export * from './compression';

/**
 * Detect ECG file format from content
 */
export type ECGFormat = 'muse' | 'hl7' | 'philips' | 'dicom' | 'scp' | 'unknown';

/**
 * Detect XML ECG format from content string
 */
export function detectXMLFormat(xmlString: string): ECGFormat {
  // Check for GE Muse XML
  if (xmlString.includes('RestingECG') || xmlString.includes('MuseInfo')) {
    return 'muse';
  }

  // Check for HL7 aECG
  if (xmlString.includes('AnnotatedECG')) {
    return 'hl7';
  }

  // Check for Philips XML
  if (
    xmlString.includes('medical.philips.com') ||
    xmlString.includes('parsedwaveforms') ||
    xmlString.includes('ParsedWaveforms')
  ) {
    return 'philips';
  }

  return 'unknown';
}

/**
 * Detect binary ECG format from buffer
 */
export function detectBinaryFormat(buffer: ArrayBuffer): ECGFormat {
  const view = new DataView(buffer);

  // Check for DICOM magic number at offset 128
  if (buffer.byteLength > 132) {
    const magic = String.fromCharCode(
      view.getUint8(128),
      view.getUint8(129),
      view.getUint8(130),
      view.getUint8(131)
    );
    if (magic === 'DICM') {
      return 'dicom';
    }
  }

  // Check for SCP-ECG format
  // SCP files start with CRC (2 bytes) and record length (4 bytes)
  // followed by Section 0 which has ID = 0
  if (buffer.byteLength > 12) {
    // Read section 0 ID after file header (6 bytes) + CRC (2 bytes)
    const section0Id = view.getUint16(8, true);
    if (section0Id === 0) {
      return 'scp';
    }
  }

  return 'unknown';
}
