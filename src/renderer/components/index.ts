/**
 * Renderer components exports
 * @module renderer/components
 */

export { GridRenderer, renderGrid, type GridRendererConfig, type GridMetrics } from './grid';
export { WaveformRenderer, renderLead, type WaveformRendererConfig } from './waveform';
export { LabelRenderer, LEAD_LAYOUT_3X4, LEAD_LAYOUT_6X2, type LabelRendererConfig } from './labels';
export {
  HeaderRenderer,
  renderHeader,
  type HeaderRendererConfig,
  type PatientDisplayData,
} from './header';
export {
  MeasurementsBoxRenderer,
  renderMeasurementsBox,
  toMeasurementsDisplay,
  type MeasurementsBoxConfig,
  type MeasurementsDisplayData,
} from './measurements-box';
export {
  FooterRenderer,
  renderFooter,
  type FooterRendererConfig,
  type FooterDisplayData,
} from './footer';
export {
  CalibrationMarkerRenderer,
  renderCalibrationMarker,
  type CalibrationMarkerConfig,
} from './calibration-marker';
