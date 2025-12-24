/**
 * Signal processing exports
 * @module signal
 */

// Synthetic signal generation
export {
  generateSyntheticECG,
  generateFlatLine,
  generateSineWave,
  type SyntheticECGOptions,
} from './synthetic';

// Signal loaders - GE Muse XML
export {
  parseMuseXML,
  loadMuseXMLFile,
  type MuseECGData,
  type MusePatientData,
  type MuseTestData,
  type MuseOrderData,
  type MuseDiagnosis,
} from './loader';

// Signal loaders - HL7 aECG
export {
  parseHL7aECG,
  loadHL7aECGFile,
  type HL7aECGData,
  type HL7PatientData,
  type HL7TestData,
  type HL7Diagnosis,
} from './loader';

// Signal loaders - DICOM ECG
export {
  parseDICOMECG,
  loadDICOMECGFile,
  type DICOMECGData,
  type DICOMPatientData,
  type DICOMStudyData,
} from './loader';

// Signal loaders - Philips XML
export {
  parsePhilipsXML,
  loadPhilipsXMLFile,
  isPhilipsXML,
  type PhilipsECGData,
  type PhilipsPatientData,
  type PhilipsTestData,
} from './loader';

// Signal loaders - SCP-ECG
export {
  parseSCPECG,
  loadSCPECGFile,
  type SCPECGData,
  type SCPPatientData,
  type SCPTestData,
  type SCPDiagnosis,
} from './loader';

// Format detection utilities
export {
  detectXMLFormat,
  detectBinaryFormat,
  type ECGFormat,
} from './loader';
