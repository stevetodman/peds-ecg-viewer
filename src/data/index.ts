/**
 * Data layer exports
 * @module data
 */

// Age groups
export type { AgeGroup } from './ageGroups';
export {
  AGE_GROUPS,
  AGE_GROUP_MAP,
  getAgeGroup,
  getAgeGroupById,
  isInStage,
  isNeonate,
  isInfant,
  isPediatric,
  getGroupsByStage,
  ageToDays,
} from './ageGroups';

// Pediatric normal values
export type { NormalRange, TWavePolarity, TWavePattern, AgeNormals } from './pediatricNormals';
export {
  PEDIATRIC_NORMALS,
  getNormalsForAge,
  getNormals,
  classifyValue,
  estimatePercentile,
  isTWaveV1Normal,
  getClinicalNotes,
} from './pediatricNormals';

// Sample ECG data
export { sampleECG, createSampleECG, samplePatient, sampleMeasurements } from './sample-ecg';
